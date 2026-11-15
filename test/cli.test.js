'use strict';

// npm test — CLI tests (node:test) + Lua suite (host lua) + serial unit tests.
// Lua suite runs when a lua binary is available (LUA_BIN env or PATH);
// otherwise it is skipped with a clear message (badge/store remain
// authoritative). LUA_BIN may point at a system lua for the fallback engine.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KIT = path.join(__dirname, '..');
const BADGE = [process.execPath, path.join(KIT, 'bin', 'badge')];

function runBadge(...args) {
  return spawnSync(BADGE[0], [BADGE[1], ...args], { encoding: 'utf8' });
}

function findLua55() {
  // Genuine badge Lua 5.5 first: built tools/host_lua55/host_lua55, or LUA55_BIN.
  if (process.env.LUA55_BIN && fs.existsSync(process.env.LUA55_BIN)) return process.env.LUA55_BIN;
  const built = path.join(KIT, 'tools', 'host_lua55', 'host_lua55');
  if (fs.existsSync(built)) return built;
  return null;
}

function findLua54() {
  // Labeled fallback: any system Lua 5.x (syntax close, NOT the badge parser).
  if (process.env.LUA_BIN && fs.existsSync(process.env.LUA_BIN)) return process.env.LUA_BIN;
  for (const b of ['lua5.4', 'lua5.3', 'lua5.5', 'lua', 'luac']) {
    try {
      execSync(`${b} -v`, { stdio: 'pipe' });
      return b;
    } catch { /* next */ }
  }
  return null;
}

describe('badge new/check', () => {
  it('scaffolds blank and check passes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
    const r1 = runBadge('new', 'hello-game', '--dir', dir);
    assert.equal(r1.status, 0, r1.stderr);
    const r2 = runBadge('check', path.join(dir, 'hello-game'));
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    assert.match(r2.stdout, /no errors/);
  });

  it('scaffolds mesh-multiplayer and check passes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
    const r1 = runBadge('new', 'room-game', '--template', 'mesh-multiplayer', '--dir', dir);
    assert.equal(r1.status, 0, r1.stderr);
    assert.ok(fs.existsSync(path.join(dir, 'room-game', 'lib', 'lobby.lua')));
    assert.ok(fs.existsSync(path.join(dir, 'room-game', 'lib', 'sync.lua')));
    const r2 = runBadge('check', path.join(dir, 'room-game'));
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  });

  it('rejects bad app names', () => {
    const r = runBadge('new', 'BAD NAME!');
    assert.notEqual(r.status, 0);
  });

  it('flags manifest + forbidden-API errors with exit 1', () => {
    const r = runBadge('check', path.join(KIT, 'test', 'fixtures', 'bad-app'));
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /app\.json: "id"/);
    assert.match(r.stdout, /app\.json: "icon"/);
    assert.match(r.stdout, /forbidden API/);
    assert.match(r.stdout, /permissions.*must be an array/);
  });

  it('reports lua syntax errors with file:line', () => {
    const r = runBadge('check', path.join(KIT, 'test', 'fixtures', 'syntax-app'));
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /main\.lua:\d+:.*[Ee]nd|unexpected|never closed/);
  });

  it('example mesh-demo passes check', () => {
    const r = runBadge('check', path.join(KIT, 'examples', 'mesh-demo'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it('refuses symlinks (no exfiltration outside the bundle)', () => {
    const r = runBadge('check', path.join(KIT, 'test', 'fixtures', 'sym-app'));
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /symlinks are not allowed/);
    assert.doesNotMatch(r.stdout, /TOP-SECRET-MARKER/);
  });

  it('refuses an oversized manifest (badge parses at most 2048 B)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
    const m = { id: 'big-app', name: 'Big', version: '0.1.0', author: '@t', summary: 'x'.repeat(3000), icon: 'play', accent: '14F195', category: 'demos', permissions: [] };
    fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(m));
    fs.writeFileSync(path.join(dir, 'main.lua'), 'print("hi")\n');
    const r = runBadge('check', dir);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /2048/);
  });

  it('treats hostile LUA_BIN as a path, never a shell', () => {
    const marker = path.join(os.tmpdir(), `kit-pwned-${Date.now()}`);
    const r = spawnSync(BADGE[0], [BADGE[1], 'check', path.join(KIT, 'examples', 'mesh-demo')],
      { encoding: 'utf8', env: { ...process.env, LUA_BIN: `x;touch ${marker}` } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(fs.existsSync(marker), false);
  });

  it('CLI makes no network calls (only documented URLs are printed)', () => {
    const src = ['bin/badge', ...fs.readdirSync(path.join(KIT, 'lib')).map((f) => `lib/${f}`)]
      .map((f) => fs.readFileSync(path.join(KIT, f), 'utf8')).join('\n');
    assert.doesNotMatch(src, /require\(['"](node:)?(https?|net|tls|dgram|dns|http2)['"]\)|\bfetch\s*\(|WebSocket|undici/);
    assert.doesNotMatch(src, /execSync|[^.\w]exec\(|spawn\([^)]*shell|shell:\s*true|\beval\(|new Function/);
    // Every URL the CLI mentions is one of the documented platform URLs.
    const urls = src.match(/https?:\/\/[^\s'"`)]+/g) || [];
    for (const u of urls) {
      assert.match(u, /^https:\/\/(solana\.com\/breakpoint\/badge\/|badge-api\.solana\.com$)/, u);
    }
  });

  it('system-Lua compile never splices app source into Lua code', (t) => {
    const lua = process.env.LUA_BIN || null;
    const { compileWithSystemLua } = require('../lib/luacheck');
    if (!lua || !fs.existsSync(lua)) { t.skip('set LUA_BIN to a system lua to run'); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
    const marker = path.join(dir, 'pwned');
    // Source that would break out of a generated string literal and run code.
    const evil = path.join(dir, 'evil.lua');
    fs.writeFileSync(evil, `local s = "\\"]] os.execute("touch ${marker}") --[["\nreturn s\n`);
    compileWithSystemLua(lua, evil);
    assert.equal(fs.existsSync(marker), false);
    const good = path.join(dir, 'ok.lua');
    fs.writeFileSync(good, 'local t = { "\\u{48}", [[\n]] }\nreturn t\n');
    assert.equal(compileWithSystemLua(lua, good).ok, true);
    const bad = path.join(dir, 'bad.lua');
    fs.writeFileSync(bad, 'local x =\n');
    assert.equal(compileWithSystemLua(lua, bad).ok, false);
  });

  it('push takes the app dir, not the --port value, as its target', () => {
    const { positional } = require('../lib/cmd-push');
    assert.equal(positional(['--port', '/dev/ttyUSB0', 'my-app']), 'my-app');
    assert.equal(positional(['--port', '/dev/ttyUSB0']), null);
    assert.equal(positional(['app', '--port', 'x']), 'app');
  });
});

describe('badge dev/publish/push', () => {
  it('dev prints the emulator flow', () => {
    const r = runBadge('dev');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\?badge=2/);
    assert.match(r.stdout, /Bridge a badge/);
  });

  it('publish without --dry-run refuses (never fakes)', () => {
    const r = runBadge('publish', path.join(KIT, 'examples', 'mesh-demo'));
    assert.equal(r.status, 2);
    assert.match(r.stderr + r.stdout, /never fakes a publish|no automated submit exists/);
  });

  it('publish --dry-run passes on the example and prints manual steps', () => {
    const r = runBadge('publish', '--dry-run', path.join(KIT, 'examples', 'mesh-demo'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /manifest valid/);
    assert.match(r.stdout, /apps\/submit/);
  });

  it('push with no device fails gracefully (exit 2)', () => {
    const r = runBadge('push', path.join(KIT, 'examples', 'mesh-demo'));
    assert.equal(r.status, 2);
  });
});

describe('serial protocol helpers', () => {
  const serial = require('../lib/serial');

  it('announces real byte counts for every pushed file (incl. main.lua/app.json)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
    fs.writeFileSync(path.join(dir, 'main.lua'), 'print("é")\n');
    const h = serial.hashLocalFiles([{ rel: 'main.lua', abs: path.join(dir, 'main.lua') }]);
    assert.equal(h[0].bytes, Buffer.byteLength('print("é")\n'));
    assert.match(h[0].sha, /^[0-9a-f]{64}$/);
  });

  it('refuses hostile screenshot streams (no huge allocations, no out-of-range rows)', () => {
    assert.equal(serial.parseShot('SHOT-BEGIN 100000 100000\nSHOT-END\n'), null);
    assert.equal(serial.parseShot('SHOT-BEGIN -5 2\nSHOT-END\n'), null);
    assert.equal(serial.parseShot('SHOT-BEGIN 1.5 2\nSHOT-END\n'), null);
    const p = serial.parseShot('SHOT-BEGIN 2 1\nSHOT -1 0 2 AAAA\nSHOT 0 99999 2 AAAA\nSHOT 0 0 2 AAAAAA==\nSHOT-END\n');
    assert.ok(p && p.rows.size === 1);
    const png = serial.shotsToPng(p.w, p.h, p.rows);
    assert.equal(png.readUInt32BE(16), 2);
  });

  it('parses lua sums and plans a delta push', () => {
    const out = 'abc123'.padEnd(64, '0') + '  12 main.lua\n' +
      'def456'.padEnd(64, '0') + '  30 lib/x.lua\nsums: 2 files\n';
    const sums = serial.parseSums(out);
    assert.equal(sums.length, 2);
    const todo = serial.planPush(
      [{ rel: 'main.lua', bytes: 12, sha: 'abc123'.padEnd(64, '0') }, { rel: 'lib/y.lua', bytes: 5, sha: 'fff' }],
      sums
    );
    assert.deepEqual(todo.map((t) => t.rel), ['lib/y.lua']);
  });

  it('decodes a shot stream to a valid PNG', () => {
    // 2x1 red pixels, RGB565 LE: 0xF800 -> bytes 00 F8.
    const row = Buffer.from([0x00, 0xf8, 0x00, 0xf8]).toString('base64');
    const parsed = serial.parseShot(`SHOT-BEGIN 2 1\nSHOT 0 0 2 ${row}\nSHOT-END\n`);
    assert.ok(parsed && parsed.w === 2 && parsed.h === 1);
    const png = serial.shotsToPng(parsed.w, parsed.h, parsed.rows);
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), 2); // IHDR width
    assert.equal(png.readUInt32BE(20), 1); // IHDR height
  });
});

describe('lua suite (host lua: 5.5 preferred, 5.4 fallback)', () => {
  it('tests/run.lua passes on host lua', (t) => {
    const lua55 = findLua55();
    const lua = lua55 || findLua54();
    if (!lua) {
      t.skip('no lua found (build tools/host_lua55 or install lua 5.4+); store compile stays authoritative');
      return;
    }
    if (!lua55) t.diagnostic('fallback: system Lua, not the badge 5.5 parser');
    const r = spawnSync(lua, [path.join(KIT, 'tests', 'run.lua')], { encoding: 'utf8', cwd: KIT });
    assert.match(r.stdout, lua55 ? /host lua Lua 5\.5/ : /lua: \d+ passed, 0 failed/);
    assert.match(r.stdout, /lua: \d+ passed, 0 failed/);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});
