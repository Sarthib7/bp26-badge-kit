#!/usr/bin/env bash
# scripts/e2e.sh — end-to-end smoke test, as a new user would run it.
# Starts from a FRESH CLONE in a clean temp dir (pass a repo URL or local
# path; default: the public GitHub repo), then exercises the whole kit lane:
# new/check (both templates), dev, publish --dry-run, push/logs/shot with no
# device (must exit 2), example build, meet-board server with a badge-style
# signed report, board fetch, and the full npm test suite.
#
# Usage: scripts/e2e.sh [repo-url-or-path]
# Needs: node >= 18 and git; a C compiler for the badge Lua 5.5 step
# (E2E_SKIP_LUA55=1 skips it; SOLANA_OS_DIR reuses an existing checkout).
set -euo pipefail

REPO="${1:-https://github.com/Sarthib7/bp26-badge-kit}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/kit-e2e-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "== e2e: cloning $REPO"
git clone --depth 1 "$REPO" "$WORK/kit" 2>&1 | tail -n 1
cd "$WORK/kit"
test -f package.json || { echo "FAIL: not a kit checkout"; exit 1; }

echo "== e2e: install (zero dependencies)"
npm install --no-audit --no-fund 2>&1 | tail -n 1

echo "== e2e: badge new (both templates)"
node bin/badge new hello-game --dir "$WORK/apps"
node bin/badge new room-game --template mesh-multiplayer --dir "$WORK/apps"
test -f "$WORK/apps/room-game/lib/lobby.lua" || { echo "FAIL: libs not bundled"; exit 1; }

echo "== e2e: badge check (both must pass)"
node bin/badge check "$WORK/apps/hello-game" | tail -n 1
node bin/badge check "$WORK/apps/room-game" | tail -n 1

echo "== e2e: badge dev"
node bin/badge dev | head -n 4

echo "== e2e: badge publish --dry-run (must pass)"
node bin/badge publish --dry-run "$WORK/apps/room-game" | head -n 4
test "$(node bin/badge publish --dry-run "$WORK/apps/room-game" >/dev/null 2>&1; echo $?)" = "0" || { echo "FAIL: dry-run"; exit 1; }
echo "== e2e: bare publish must refuse (exit 2, never fakes)"
test "$(node bin/badge publish "$WORK/apps/room-game" >/dev/null 2>&1; echo $?)" = "2" || { echo "FAIL: publish should refuse"; exit 1; }

echo "== e2e: push/logs/shot with no device must fail gracefully (exit 2)"
for cmd in "push $WORK/apps/room-game" "logs" "shot"; do
  # shellcheck disable=SC2086
  code=0; node bin/badge $cmd >/dev/null 2>&1 || code=$?
  test "$code" = "2" || { echo "FAIL: 'badge $cmd' exited $code, want 2"; exit 1; }
  echo "   ok: badge $cmd -> exit 2"
done

echo "== e2e: example app passes check"
node bin/badge check examples/mesh-demo | tail -n 1

echo "== e2e: meet-board server + badge-style signed report"
node -e "
const srv = require('./server/meet-board/server.js');
const crypto = require('crypto');
// Stand-in for the badge server's signing key: generated in memory, trusted
// explicitly, never written anywhere. Real deployments fetch the public key
// from https://badge-api.solana.com/api/http/key.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const kid = 'e2e0000000000000';
const origin = 'https://e2e.example';
const server = srv.createServer('room-game', { publicOrigin: origin, keyUrl: null, trustedKeys: [{ id: kid, key: publicKey }] });
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const body = JSON.stringify({ score: 777 });
  const now = Date.now(), reqId = 'e2e0001';
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const signed = ['badge-http-v1', 'POST', origin + '/report', hash, 'room-game', 'E2E111', 'e2e-user', String(now), reqId].join('\\n');
  const sig = crypto.sign(null, Buffer.from(signed), privateKey);
  const headers = { 'x-badge-app': 'room-game', 'x-badge-id': 'E2E111', 'x-badge-user': 'e2e-user',
    'x-badge-time': String(now), 'x-badge-request': reqId, 'x-badge-key': kid,
    'x-badge-signature': sig.toString('base64'), 'content-type': 'application/json' };
  const r = await fetch('http://127.0.0.1:' + port + '/report', { method: 'POST', headers, body });
  const j = await r.json();
  if (r.status !== 200 || j.best !== 777) { console.error('FAIL report', r.status, j); process.exit(1); }
  const again = await fetch('http://127.0.0.1:' + port + '/report', { method: 'POST', headers, body });
  if (again.status !== 403) { console.error('FAIL replay accepted', again.status); process.exit(1); }
  const board = await (await fetch('http://127.0.0.1:' + port + '/board')).json();
  if (!board.length || board[0].user !== 'e2e-user') { console.error('FAIL board', board); process.exit(1); }
  console.log('   ok: report 200, replay 403, board top = e2e-user @ ' + board[0].best);
  server.close();
});"

echo "== e2e: badge Lua 5.5 host tools"
if [ "${E2E_SKIP_LUA55:-0}" != "1" ] && command -v cc >/dev/null 2>&1 \
   && scripts/setup-lua55.sh "${SOLANA_OS_DIR:-$WORK/solana-os}" >"$WORK/lua55.log" 2>&1; then
  echo "   ok: built tools/host_luac + tools/host_lua55 (genuine badge Lua 5.5)"
  node bin/badge check "$WORK/apps/room-game" | grep -i "engine" | head -n 1 || true
else
  echo "   FALLBACK: could not build badge Lua 5.5 (see below); Lua suite uses a system Lua if present"
  tail -n 3 "$WORK/lua55.log" 2>/dev/null || true
fi

echo "== e2e: full npm test"
out="$(npm test 2>&1)" || { echo "$out" | tail -n 40; echo "FAIL: npm test"; exit 1; }
echo "$out" | grep -E "^(ℹ|#) (tests|pass|fail|skipped)"
if [ -x tools/host_lua55/host_lua55 ]; then
  ./tools/host_lua55/host_lua55 tests/run.lua | grep -E "^(host lua|--- lua)"
fi

echo "== e2e: PASS"
