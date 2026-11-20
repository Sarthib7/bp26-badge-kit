'use strict';

// badge push [dir] [--port DEV] — delta sideload over USB serial.
// UNVERIFIED ON HARDWARE: no physical badge was available when this kit was
// written. Implemented from the documented protocol (main/lua/lua_cmd.c,
// main/core/console.c; docs/DEV_WORKFLOW.md):
//   lua sums <id>              -> "<sha> <bytes> <file>" lines + "sums: N files"
//   lua recv <id> <file> <bytes> <sha256> -> "recv: ready <n>" then base64
//     chunks, "recv: more <n>" between blocks, "recv: ok <bytes>" at the end
//     (RECV_BLOCK=2048 base64 chars, 5 s per block).
// Files already matching by SHA are skipped. app.json always re-sends
// (cheap manifest validation on the badge).

const fs = require('fs');
const path = require('path');
const {
  loadSerialport, parseSums, planPush, hashLocalFiles, RECV_BLOCK,
} = require('./serial');
const { validatePackage } = require('./validate');

function opt(args, name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
}

// First positional argument, skipping the values of --options.
function positional(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; }
    return args[i];
  }
  return null;
}

function needSerial(port) {
  const sp = loadSerialport();
  if (!sp) {
    console.error('needs the "serialport" package: npm i --no-save serialport@13.0.0');
    console.error('(badge on USB, microSD in, Solana OS 0.5.0+; ble apps need 1.0.0+)');
    return null;
  }
  if (!port) {
    console.error('no --port given (e.g. badge push --port /dev/ttyUSB0)');
    return null;
  }
  return sp;
}

async function push(args) {
  const dir = path.resolve(positional(args) || '.');
  const port = opt(args, 'port', null);
  const v = validatePackage(dir);
  if (v.errors.length) {
    console.error('fix `badge check` errors first:');
    for (const e of v.errors) console.error(`error: ${e}`);
    return 1;
  }
  const sp = needSerial(port);
  if (!sp) return 2;
  console.error('UNVERIFIED ON HARDWARE: push follows the documented lua recv');
  console.error('protocol only. First run against a badge before trusting it.');
  const { SerialPort } = sp;
  const id = v.manifest.id;

  const open = () => new Promise((resolve, reject) => {
    const p = new SerialPort({ path: port, baudRate: 115200, autoOpen: true }, (err) => {
      if (err) reject(new Error(`cannot open ${port}: ${err.message}`));
      else resolve(p);
    });
  });

  let p;
  try {
    p = await open();
  } catch (e) {
    console.error(`${e.message} — is the badge on USB and the port free?`);
    return 2;
  }

  let buf = '';
  p.on('data', (d) => { buf += d.toString('utf8'); });
  const write = (s) => new Promise((res, rej) => p.write(s, (e) => (e ? rej(e) : res())));
  const waitFor = (re, timeoutMs) => new Promise((resolve) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      const m = buf.match(re);
      if (m || Date.now() - t0 > timeoutMs) { clearInterval(t); resolve(m); }
    }, 50);
  });
  // Run one console line, collect output until 8 idle 100 ms polls (max 30 s).
  const runLine = async (line) => {
    buf = '';
    await write(line + '\r\n');
    await new Promise((res) => {
      let idle = 0;
      const t = setInterval(() => {
        if (buf.length === 0) { if (++idle >= 3) { clearInterval(t); res(); } }
        else idle = 0;
      }, 100);
      setTimeout(() => { clearInterval(t); res(); }, 3000);
      // keep draining: reset idle whenever data arrives
      const onData = () => { idle = 0; };
      p.on('data', onData);
      setTimeout(() => p.off('data', onData), 3100);
    });
    return buf;
  };

  try {
    const sumsOut = await runLine(`lua sums ${id}`);
    const remote = parseSums(sumsOut);
    const locals = [{ rel: 'main.lua', abs: path.join(dir, 'main.lua') },
      { rel: 'app.json', abs: path.join(dir, 'app.json') },
      ...v.files.map((f) => ({ rel: f.rel, abs: f.abs }))];
    const hashed = hashLocalFiles(locals);
    const byRel = new Map(hashed.map((h) => [h.rel, h]));
    const appJson = byRel.get('app.json');
    const rest = hashed.filter((h) => h.rel !== 'app.json');
    const todo = planPush(rest, remote);
    console.log(`push ${id}: ${todo.length} changed file(s), app.json always re-sent`);
    const sendFile = async (h) => {
      const b64 = fs.readFileSync(byRel.get(h.rel).abs).toString('base64');
      buf = '';
      await write(`lua recv ${id} ${h.rel} ${h.bytes} ${h.sha}\r\n`);
      for (let i = 0; i < b64.length;) {
        const m = await waitFor(/recv: (ready|more) (\d+)/, 5000);
        if (!m) throw new Error(`no recv prompt for ${h.rel} (timeout)`);
        const n = Math.min(Number(m[2]) || RECV_BLOCK, b64.length - i);
        await write(b64.slice(i, i + n));
        i += n;
      }
      const done = await waitFor(/recv: (ok|error) ([^\r\n]*)/, 8000);
      if (!done || done[1] !== 'ok') throw new Error(`recv failed for ${h.rel}: ${done ? done[0] : 'timeout'}`);
      console.log(`sent ${h.rel} (${h.bytes} B)`);
    };
    await sendFile(appJson);
    for (const h of todo) await sendFile(h);
    const runOut = await runLine(`lua run ${id}`);
    if (!/ok|run/i.test(runOut)) console.log(runOut.trim());
    console.log('push complete — watch the badge and `badge logs` for print() output');
    return 0;
  } catch (e) {
    console.error(`push failed: ${e.message}`);
    return 2;
  } finally {
    p.close();
  }
}

module.exports = { push, positional };
