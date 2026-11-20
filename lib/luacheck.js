'use strict';

// Lua checking for badge apps.
//
// Engine chain (first available wins; the engine used is always reported):
//   1. tools/host_luac/host_luac — the badge's own Lua 5.5 parser
//      (tools/host_luac/host_luac.c built against solana-os@64a474b
//      main/lua/vendor; see tools/host_luac/build.sh). Byte-exact with the
//      store's gate for syntax.
//   2. A system lua/luac (lua5.5 > lua5.4 > lua > luac) if installed — close
//      but NOT the badge parser; reported as approximation.
//   3. Embedded fallback: bracket/end balance + badge-specific pattern
//      checks. Heuristic only; the store compile is authoritative.
//
// Static cross-checks (permission/API usage, version guards, forbidden APIs,
// 5.5 pitfalls, secret hygiene, mesh size heuristic) always run.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { API_PERM, MIN_OS, LIMITS } = require('./pinned');

const KIT_ROOT = path.join(__dirname, '..');
const HOST_LUAC = path.join(KIT_ROOT, 'tools', 'host_luac', 'host_luac');

function checkBin(bin) {
  // Never through a shell: bin paths may come from env (LUA_BIN/LUA55_BIN).
  try {
    execFileSync(bin, ['-v'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function findSystemLua() {
  const env = process.env.LUA_BIN;
  if (env && checkBin(env)) return env;
  for (const bin of ['lua5.5', 'lua5.4', 'lua5.3', 'lua', 'luac']) {
    try {
      execFileSync(bin, ['-v'], { stdio: 'pipe' });
      return bin;
    } catch { /* try next */ }
  }
  return null;
}

function compileWithHostLuac(abs) {
  const out = execFileSync(HOST_LUAC, [abs], { encoding: 'utf8', stdio: 'pipe' });
  if (/^COMPILE OK/.test(out)) return { ok: true, engine: `host_luac (badge 5.5 parser)` };
  const m = out.match(/COMPILE FAIL: ([^\n]+)/);
  return { ok: false, engine: 'host_luac (badge 5.5 parser)', error: m ? m[1] : out.trim() };
}

function compileWithSystemLua(bin, abs) {
  // `luac -p` parses only; `lua` has no parse-only mode, so use load() via -e.
  try {
    if (bin === 'luac') {
      execFileSync(bin, ['-p', abs], { encoding: 'utf8', stdio: 'pipe' });
    } else {
      // The path travels in an env var and loadfile() only compiles it: app
      // source is never spliced into Lua code or a shell command line.
      const probe = 'local f, e = loadfile(os.getenv("BADGE_KIT_LUA_FILE")); if not f then io.stderr:write(e .. "\\n"); os.exit(3) end';
      execFileSync(bin, ['-e', probe], {
        encoding: 'utf8', stdio: 'pipe', env: { ...process.env, BADGE_KIT_LUA_FILE: abs },
      });
    }
    return { ok: true, engine: `${bin} (system Lua, approximation — store compile is authoritative)` };
  } catch (e) {
    const err = (e.stderr || e.stdout || e.message || '').toString().trim().split('\n').pop();
    return { ok: false, engine: `${bin} (system Lua, approximation)`, error: err };
  }
}

// --- Embedded fallback syntax scan ------------------------------------------

function stripStringsComments(src) {
  // Best-effort: blank out long-bracket strings/comments, short strings and
  // -- comments so keyword counting ignores them.
  let s = src.replace(/\[=*\[[\s\S]*?\]=*\]/g, (m) => ' '.repeat(m.length));
  s = s.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
  s = s.replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => '""');
  s = s.replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => "''");
  return s;
}

function fallbackScan(abs, src) {
  // Returns [{file, line, msg}] — heuristic only.
  const issues = [];
  const code = stripStringsComments(src);
  const lines = src.split('\n');
  const lineOf = (idx) => {
    let n = 0;
    for (let i = 0; i < lines.length; i++) { n += lines[i].length + 1; if (idx < n) return i + 1; }
    return lines.length;
  };
  // Block balance over the whole file (strings/comments blanked above).
  // `for...do` and `while...do` take a single `end`: the `do` belongs to them.
  const stack = []; // {w, line, doTaken}
  const words = [];
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  let m;
  while ((m = re.exec(code)) !== null) words.push({ w: m[0], idx: m.index });
  for (let i = 0; i < words.length; i++) {
    const { w, idx } = words[i];
    if (w === 'function' || w === 'if' || w === 'for' || w === 'while' || w === 'repeat') {
      stack.push({ w, line: lineOf(idx), doTaken: false });
    } else if (w === 'do') {
      const top = stack[stack.length - 1];
      if (top && (top.w === 'for' || top.w === 'while') && !top.doTaken) top.doTaken = true;
      else stack.push({ w, line: lineOf(idx), doTaken: false });
    } else if (w === 'end') {
      const top = stack.pop();
      if (!top) issues.push({ file: abs, line: lineOf(idx), msg: "stray 'end' with no open block" });
      else if (top.w === 'repeat') issues.push({ file: abs, line: lineOf(idx), msg: "'repeat' closed with 'end' (use 'until')" });
    } else if (w === 'until') {
      let found = false;
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].w === 'repeat') { stack.splice(j, 1); found = true; break; }
      }
      if (!found) issues.push({ file: abs, line: lineOf(idx), msg: "stray 'until' with no open 'repeat'" });
    } else if (w === 'else' || w === 'elseif') {
      if (!stack.some((s) => s.w === 'if')) issues.push({ file: abs, line: lineOf(idx), msg: `'${w}' outside 'if'` });
    }
  }
  for (const s of stack) issues.push({ file: abs, line: s.line, msg: `'${s.w}' block never closed` });
  // Whole-file delimiter balance (multi-line calls are normal; per-line
  // checks would false-positive on them).
  const count = (c) => (code.split(c).length - 1);
  if (count('(') !== count(')')) issues.push({ file: abs, line: lines.length, msg: 'unbalanced parentheses in file' });
  if (count('{') !== count('}')) issues.push({ file: abs, line: lines.length, msg: 'unbalanced braces in file' });
  // Empty right-hand side: `=` at end of line followed by a keyword that can
  // never start an expression (`= if`, `= end`, ...).
  lines.forEach((ln, i) => {
    if (/=\s*$/.test(stripStringsComments(ln)) && /^\s*(if|then|end|else|elseif|until|do|in)\b/.test(lines[i + 1] || '')) {
      issues.push({ file: abs, line: i + 1, msg: `assignment with no value (line ends with '=')` });
    }
  });
  return issues;
}

// --- Static cross-checks ------------------------------------------------------

const FORBIDDEN = [
  [/\bio\s*\./, 'io.* is not in the sandbox (no file/device I/O from Lua)'],
  [/(^|[^\w.])os\s*\.\s*(?!time\b)[a-z]/, 'os.* (except os.time/os.date where allowed) is not in the sandbox'],
  [/\bdebug\s*\./, 'debug.* is not in the sandbox'],
  [/\bpackage\s*\./, 'package.* is not in the sandbox'],
  [/\bloadfile\s*\(/, 'loadfile is removed (use fs.load / require for own files)'],
  [/\bdofile\s*\(/, 'dofile is removed (use fs.load / require for own files)'],
  [/(^|[^\w.])load\s*\(/, 'load is removed (use fs.load for own files)'],
  [/\bloadstring\s*\(/, 'loadstring does not exist (use fs.load for own files)'],
  [/\bwarn\s*\(/, 'warn is removed'],
  [/\bstring\s*\.\s*dump\s*\(/, 'string.dump is removed'],
  [/\bcollectgarbage\s*\(\s*["'][^c]/, 'only collectgarbage("count") exists'],
];

const SECRET_HINT = /(api[_-]?key|apikey|secret|private[_-]?key|seed[_-]?phrase|password\s*=\s*["'][^"']+["'])/i;

function staticChecks(rel, src, permissions) {
  const errors = [];
  const warns = [];
  const code = stripStringsComments(src);
  for (const [re, msg] of FORBIDDEN) {
    if (re.test(code)) errors.push(`${rel}: forbidden API — ${msg}`);
  }
  // Permission usage.
  const perms = new Set(permissions || []);
  const used = new Set();
  for (const [prefix, perm] of Object.entries(API_PERM)) {
    if (prefix.endsWith('.')) {
      if (new RegExp(`\\b${prefix.replace('.', '\\.')}`).test(code)) used.add(perm);
    } else if (new RegExp(`\\b${prefix}\\b`).test(code)) {
      used.add(perm);
    }
  }
  if (/\bws\s*\./.test(code)) used.add('http');
  for (const p of used) {
    if (!perms.has(p)) errors.push(`${rel}: uses "${p}" APIs but app.json lacks the "${p}" permission${p === 'http' && /\bws\s*\./.test(code) ? ' (ws uses the http permission)' : ''}`);
  }
  // Version guards: using newer APIs without a nil-guard. Accepts both
  // `if api then` and inline `api and api...` guards.
  const guards = {
    'ble.': /if\s+ble\s+then|ble\s+and/,
    'mesh.info': /if\s+mesh\.info\s+then|mesh\.info\s+and/,
    'mesh.meet': /if\s+mesh\.meet\s+then|mesh\.meet\s+and/,
    'mesh.channel': /if\s+mesh\.channel\s+then|mesh\.channel\s+and/,
    'mesh.scan': /if\s+mesh\.scan\s+then|mesh\.scan\s+and/,
    'ui.qr': /if\s+ui\.qr\s+then|ui\.qr\s+and/,
    'ui.image': /if\s+ui\.image\s+then|ui\.image\s+and/,
    'sys.keys': /if\s+sys\.keys\s+then|sys\.keys\s+and/,
    'sys.memory': /if\s+sys\.memory\s+then|sys\.memory\s+and/,
    crypto: /if\s+crypto\s+then|crypto\s+and/,
    solana: /if\s+solana\s+then|solana\s+and/,
  };
  for (const [api, re] of Object.entries(guards)) {
    const hit = api.includes('.')
      ? new RegExp(`\\b${api.replace('.', '\\.')}`).test(code)
      : new RegExp(`\\b${api}\\s*\\.`).test(code);
    if (hit && !re.test(code)) {
      const v = MIN_OS[api];
      warns.push(`${rel}: uses ${api} (needs Solana OS ${v}) with no "if ${api} then" guard — older badges nil it`);
    }
  }
  // Lua 5.5 pitfalls.
  const forLoop = code.match(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g) || [];
  for (const fl of forLoop) {
    const name = fl.match(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)/)[1];
    if (new RegExp(`\\b${name}\\s*=[^=]`).test(code.split(fl)[1] || '')) {
      warns.push(`${rel}: possible write to for-loop variable "${name}" (read-only in Lua 5.5; copy into a local)`);
      break;
    }
  }
  // Secret hygiene (heuristic).
  if (SECRET_HINT.test(src)) {
    warns.push(`${rel}: looks like a secret/key/password literal — never ship secrets: main.lua is public, the card is readable, badges change hands`);
  }
  // Mesh size heuristic: long literal passed to mesh.send.
  const sendLit = code.match(/mesh\s*\.\s*send\s*\([^)]{220,}/);
  if (sendLit) warns.push(`${rel}: mesh.send call spans a long expression — keep messages ≤ ${LIMITS.meshBytes} B JSON (send state, not events)`);
  // ws + other server calls warning (socket-open rule).
  if (/\bws\s*\.\s*open/.test(code) && (/\bhttp\s*\./.test(code) || /\brpc\s*\./.test(code) || /\blamps\s*\./.test(code))) {
    warns.push(`${rel}: ws.open takes over the server connection ("socket open" for http/rpc/lamps/... until close) — call the server first, then open the socket`);
  }
  return { errors, warns };
}

function checkLuaFile(abs, rel, permissions) {
  const errors = [];
  const warns = [];
  let engine = 'fallback (no Lua available)';
  let src;
  try {
    src = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    return { errors: [`${rel}: cannot read (${e.message})`], warns, engine };
  }
  // Compile step.
  if (fs.existsSync(HOST_LUAC)) {
    try {
      const r = compileWithHostLuac(abs);
      engine = r.engine;
      if (!r.ok) errors.push(`${rel}: ${r.error} [${engine}]`);
    } catch (e) {
      engine = `host_luac failed (${e.message}); trying system Lua`;
    }
  }
  if (engine.startsWith('fallback') || engine.includes('failed')) {
    const sys = findSystemLua();
    if (sys) {
      const r = compileWithSystemLua(sys, abs);
      engine = r.engine;
      if (!r.ok) errors.push(`${rel}: ${r.error} [${engine}]`);
    } else {
      const issues = fallbackScan(abs, src);
      for (const i of issues) errors.push(`${i.file === abs ? rel : i.file}:${i.line}: ${i.msg} [fallback syntax scan — store compile is authoritative]`);
      if (issues.length === 0) warns.push(`${rel}: no Lua compiler found (tried host_luac + system lua); fallback scan is heuristic — Try in emulator / store compile is authoritative`);
    }
  }
  const s = staticChecks(rel, src, permissions);
  errors.push(...s.errors);
  warns.push(...s.warns);
  return { errors, warns, engine };
}

module.exports = { checkLuaFile, staticChecks, findSystemLua, compileWithSystemLua, HOST_LUAC };
