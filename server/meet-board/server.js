'use strict';

// meet-board — EXAMPLE leaderboard server. Not production code.
// Verifies badge-signed http calls (solana-os docs/LUA_API.md "What your
// server receives": badge-http-v1 Ed25519 headers, signed by the BADGE SERVER)
// and keeps a per-player best score keyed by owner user id. Trust model:
//   - the trust anchor is the badge server's public key, fetched from
//     https://badge-api.solana.com/api/http/key and cached by key id. This
//     server holds no private key of its own and never logs keys;
//   - a valid signature proves which badge+account called through YOUR app id,
//     not that your exact code sent it (main.lua is public);
//   - count people (X-Badge-User), never badges; re-check game rules here;
//   - never accept secrets or keypairs from a badge (it has no secure storage).
//
// Endpoints:
//   POST /report  {score}       badge call with X-Badge-* headers -> {best}
//   GET  /board?n=10            sorted [{user, best, badge, at}]
//
// Config (env or createServer opts):
//   MEET_BOARD_PUBLIC_ORIGIN  e.g. https://scores.example.com. When set, the
//       signed URL is rebuilt from it and X-Forwarded-* headers are ignored.
//       Set it in any real deployment.
//   MEET_BOARD_KEY_URL        badge key endpoint (default below).

const http = require('http');
const crypto = require('crypto');

const DEFAULT_KEY_URL = 'https://badge-api.solana.com/api/http/key';
const WINDOW_MS = 60000;          // X-Badge-Time tolerance and replay window
const BODY_MAX = 4096;            // badges send <= 2 KiB; anything bigger is abuse
const RATE_MAX = 120;             // per IP per minute (badge itself caps 60/min)
const SEEN_MAX = 100000;          // replay cache bound (fails closed when full)
const HITS_MAX = 10000;           // rate-limit table bound
const KEY_REFETCH_MS = 60000;     // at most one key fetch per minute

function rawEd25519(b64) {
  const raw = Buffer.from(String(b64 || ''), 'base64');
  if (raw.length !== 32) throw new Error('badge key must be 32 raw bytes');
  return crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der', type: 'spki',
  });
}

// Key store: id -> KeyObject. Unknown ids trigger one shared fetch per minute.
function keyStore({ trustedKeys, keyUrl }) {
  const keys = new Map();
  for (const k of trustedKeys || []) keys.set(k.id, k.key);
  let fetching = null;
  let fetchedAt = 0;
  async function refresh() {
    const r = await fetch(keyUrl, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`key fetch ${r.status}`);
    const text = await r.text();
    if (text.length > 4096) throw new Error('key response too large');
    const k = JSON.parse(text);
    if (typeof k.id !== 'string' || !/^[0-9a-f]{8,64}$/.test(k.id) || k.alg !== 'Ed25519') {
      throw new Error('unexpected key format');
    }
    keys.set(k.id, rawEd25519(k.key));
  }
  return async function get(id) {
    if (keys.has(id)) return keys.get(id);
    if (!keyUrl) return null;
    if (!fetching && Date.now() - fetchedAt > KEY_REFETCH_MS) {
      fetchedAt = Date.now();
      fetching = refresh().catch(() => { fetchedAt = 0; }).finally(() => { fetching = null; });
    }
    if (fetching) await fetching;
    return keys.get(id) || null;
  };
}

function json(res, code, obj, extra) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    'content-type': 'application/json',
    'content-length': b.length,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
    ...(extra || {}),
  });
  res.end(b);
}

function createServer(appId, opts = {}) {
  const publicOrigin = (opts.publicOrigin || process.env.MEET_BOARD_PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  const keyUrl = opts.keyUrl !== undefined ? opts.keyUrl : (process.env.MEET_BOARD_KEY_URL || DEFAULT_KEY_URL);
  const getKey = keyStore({ trustedKeys: opts.trustedKeys, keyUrl });
  const clock = typeof opts.now === 'function' ? opts.now : Date.now; // injectable for tests
  const seen = new Map();  // X-Badge-Request -> ms (replay guard)
  const hits = new Map();  // ip -> {n, reset}
  const board = new Map(); // user -> {best, badge, at}

  function overRate(ip) {
    const now = Date.now();
    if (hits.size > HITS_MAX) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
    let h = hits.get(ip);
    if (!h || now >= h.reset) {
      if (hits.size > HITS_MAX) return true; // table full of live entries: fail closed
      h = { n: 0, reset: now + WINDOW_MS };
      hits.set(ip, h);
    }
    h.n += 1;
    return h.n > RATE_MAX;
  }

  function signedUrl(req) {
    if (publicOrigin) return publicOrigin + req.url;
    // Badges always sign the public https:// URL. Without a configured origin,
    // rebuild it from proxy headers (only safe behind a proxy that sets them).
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    return `${proto}://${host}${req.url}`;
  }

  // Signature + app + clock + replay. Synchronous after the key lookup: the
  // check and the replay claim happen in one step, with no await in between.
  function verify(req, body, key) {
    const h = (n) => {
      const v = req.headers[n];
      return typeof v === 'string' ? v : '';
    };
    const time = Number(h('x-badge-time'));
    const id = h('x-badge-request');
    if (!key || h('x-badge-app') !== appId || !id || id.length > 64) return null;
    if (!Number.isFinite(time) || !(Math.abs(clock() - time) < WINDOW_MS)) return null;
    if (!h('x-badge-user')) return null;
    const sig = Buffer.from(h('x-badge-signature'), 'base64');
    if (sig.length !== 64) return null;
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const signed = ['badge-http-v1', req.method, signedUrl(req), hash,
      h('x-badge-app'), h('x-badge-id'), h('x-badge-user'), h('x-badge-time'), id].join('\n');
    let ok = false;
    try { ok = crypto.verify(null, Buffer.from(signed), key, sig); } catch { ok = false; }
    if (!ok) return null;
    // Remember the id until its own timestamp leaves the window (a request
    // stamped up to 60 s ahead stays replay-protected for its whole life).
    const now = clock();
    for (const [k, t] of seen) if (now - t > WINDOW_MS) seen.delete(k);
    if (seen.has(id) || seen.size >= SEEN_MAX) return null;
    seen.set(id, Math.max(time, now));
    return { badge: h('x-badge-id'), user: h('x-badge-user') };
  }

  function report(req, res) {
    const declared = Number(req.headers['content-length']);
    if (declared > BODY_MAX) {
      res.on('finish', () => req.destroy());
      return json(res, 413, { error: 'body too large' }, { connection: 'close' });
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (d) => {
      if (done) return;
      size += d.length;
      if (size > BODY_MAX) {
        done = true;
        res.on('finish', () => req.destroy());
        json(res, 413, { error: 'body too large' }, { connection: 'close' });
        return;
      }
      chunks.push(d);
    });
    req.on('end', async () => {
      if (done) return;
      done = true;
      const body = Buffer.concat(chunks); // hash the exact bytes sent
      try {
        const key = await getKey(typeof req.headers['x-badge-key'] === 'string' ? req.headers['x-badge-key'] : '');
        const who = verify(req, body, key);
        if (!who) return json(res, 403, { error: 'rejected' });
        let score;
        try {
          const parsed = JSON.parse(body.toString('utf8'));
          score = parsed && typeof parsed === 'object' ? parsed.score : undefined;
        } catch { return json(res, 400, { error: 'body must be {"score": n}' }); }
        if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
          return json(res, 400, { error: 'score must be a number >= 0' });
        }
        // Server decides: clamp absurd values, keep the player's best.
        score = Math.min(Math.floor(score), 1000000);
        const cur = board.get(who.user);
        if (!cur || score > cur.best) board.set(who.user, { best: score, badge: who.badge, at: Date.now() });
        return json(res, 200, { best: board.get(who.user).best });
      } catch {
        if (!res.headersSent) json(res, 500, { error: 'internal' });
      }
    });
  }

  return http.createServer((req, res) => {
    try {
      const ip = req.socket.remoteAddress || '?';
      if (overRate(ip)) return json(res, 429, { error: 'too fast (example rate limit)' });
      // Fixed base: never build URLs from the Host header (a hostile Host
      // value must not be able to throw here and take the process down).
      const u = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && u.pathname === '/board') {
        const n = Math.max(1, Math.min(Math.floor(Number(u.searchParams.get('n'))) || 10, 50));
        const rows = [...board.entries()]
          .map(([user, v]) => ({ user, ...v }))
          .sort((a, b) => b.best - a.best)
          .slice(0, n);
        return json(res, 200, rows);
      }
      if (req.method === 'POST' && u.pathname === '/report') return report(req, res);
      return json(res, 404, { error: 'no such endpoint (example server)' });
    } catch {
      if (!res.headersSent) json(res, 400, { error: 'bad request' });
    }
  });
}

if (require.main === module) {
  const appId = process.argv[2] || 'mesh-demo';
  const port = Number(process.argv[3]) || 8080;
  createServer(appId).listen(port, () => console.log(`meet-board (example) for app ${appId} on :${port}`));
}

module.exports = { createServer, rawEd25519, DEFAULT_KEY_URL };
