'use strict';

// badge logs / badge shot — hardware console helpers.
// UNVERIFIED ON HARDWARE (documented protocol only).

const fs = require('fs');
const path = require('path');
const { loadSerialport, parseShot, shotsToPng } = require('./serial');

function opt(args, name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
}

function needSerial(port) {
  const sp = loadSerialport();
  if (!sp) {
    console.error('needs the "serialport" package: npm i --no-save serialport@13.0.0');
    return null;
  }
  if (!port) {
    console.error('no --port given (e.g. badge logs --port /dev/ttyUSB0)');
    return null;
  }
  return sp;
}

async function logs(args) {
  const port = opt(args, 'port', null);
  const sp = needSerial(port);
  if (!sp) return 2;
  console.error('UNVERIFIED ON HARDWARE. Ctrl-C to stop.');
  const { SerialPort } = sp;
  const p = new SerialPort({ path: port, baudRate: 115200 });
  p.on('data', (d) => process.stdout.write(d.toString('utf8')));
  p.on('error', (e) => { console.error(`serial error: ${e.message}`); process.exit(2); });
  await new Promise(() => {});
  return 0;
}

async function shot(args) {
  const port = opt(args, 'port', null);
  const outDir = opt(args, 'out', 'shots');
  const sp = needSerial(port);
  if (!sp) return 2;
  console.error('UNVERIFIED ON HARDWARE: shot decode follows tools/badge.py + os.c.');
  const { SerialPort } = sp;
  const p = await new Promise((resolve, reject) => {
    const s = new SerialPort({ path: port, baudRate: 115200, autoOpen: true }, (err) => {
      if (err) reject(new Error(`cannot open ${port}: ${err.message}`));
      else resolve(s);
    });
  }).catch((e) => { console.error(e.message); return null; });
  if (!p) return 2;
  let buf = '';
  // Cap what an untrusted device can make us buffer (a 320x240 shot is ~200 KB).
  const BUF_MAX = 8 * 1024 * 1024;
  p.on('data', (d) => { if (buf.length < BUF_MAX) buf += d.toString('utf8'); });
  await new Promise((res, rej) => p.write('shot\r\n', (e) => (e ? rej(e) : res())));
  const end = Date.now() + 60000;
  while (!buf.includes('SHOT-END') && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 200));
  }
  p.close();
  const parsed = parseShot(buf);
  if (!parsed) {
    console.error('no screenshot in console output (need SHOT-BEGIN/SHOT-END)');
    return 2;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `shot_${Date.now()}.png`);
  fs.writeFileSync(file, shotsToPng(parsed.w, parsed.h, parsed.rows));
  console.log(`saved ${file} (${parsed.w}x${parsed.h}, ${parsed.rows.size} rows)`);
  return 0;
}

module.exports = { logs, shot };
