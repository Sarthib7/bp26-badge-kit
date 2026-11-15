'use strict';

// USB serial sideload using the documented console protocol
// (main/lua/lua_cmd.c, main/core/console.c; docs/DEV_WORKFLOW.md):
//   115200 8-N-1, `lua sums <id>`, `lua recv <id> <file> <bytes> <sha256>`
//   (RECV_BLOCK=2048 base64 chars, 5 s/block), `lua put`, `lua mem`,
//   `shot` -> SHOT-BEGIN / SHOT x y n base64 / SHOT-END (RGB565 rows).
//
// ALL hardware paths need a physical badge + microSD and are marked
// UNVERIFIED ON HARDWARE in this kit (no badge was available at authorship).
// Without the optional `serialport` package (npm i --no-save serialport@13.0.0) or without a
// device, every command fails gracefully with a clear message and exit 2.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

function loadSerialport() {
  try {
    return require('serialport');
  } catch {
    return null;
  }
}

function serialHint() {
  return 'serial access needs the optional "serialport" package (npm i --no-save serialport@13.0.0) and a badge on USB (microSD in, Solana OS 0.5.0+).';
}

// --- shot decode + minimal PNG writer (zero-dep) -------------------------------

function crc32Table() {
  if (crc32Table.t) return crc32Table.t;
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  crc32Table.t = t;
  return t;
}

function crc32(buf) {
  const t = crc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// rows: Map<"x,y", {n, data:Buffer}>, w/h ints. RGB565 LE -> 8-bit RGB.
function shotsToPng(w, h, rows) {
  const px = Buffer.alloc(w * h * 3, 0);
  for (const [key, { n, data }] of rows) {
    const [x0, y] = key.split(',').map(Number);
    for (let i = 0; i < Math.min(n, data.length / 2); i++) {
      const v = data.readUInt16LE(i * 2);
      const r = (v >> 11) & 0x1f, g = (v >> 5) & 0x3f, b = v & 0x1f;
      const x = x0 + i;
      if (x >= w || y >= h) continue;
      const o = (y * w + x) * 3;
      px[o] = (r << 3) | (r >> 2);
      px[o + 1] = (g << 2) | (g >> 4);
      px[o + 2] = (b << 3) | (b >> 2);
    }
  }
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// The device is untrusted input: a hostile or buggy badge must not be able to
// make the host allocate gigabytes or write outside the pixel buffer.
const SHOT_MAX_DIM = 1024; // the badge screen is 320x240
function intIn(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

function parseShot(text) {
  let w = 0, h = 0;
  const rows = new Map();
  for (const line of text.split('\n')) {
    if (line.startsWith('SHOT-BEGIN')) {
      const p = line.trim().split(/\s+/);
      w = Number(p[1]); h = Number(p[2]);
    } else if (line.startsWith('SHOT ')) {
      const p = line.trim().split(' ');
      if (p.length !== 5) continue;
      const x = Number(p[1]), y = Number(p[2]), n = Number(p[3]);
      if (!intIn(x, 0, SHOT_MAX_DIM - 1) || !intIn(y, 0, SHOT_MAX_DIM - 1) || !intIn(n, 0, SHOT_MAX_DIM)) continue;
      if (rows.size >= SHOT_MAX_DIM * 4) continue;
      rows.set(`${x},${y}`, { n, data: Buffer.from(p[4], 'base64') });
    }
  }
  if (!intIn(w, 1, SHOT_MAX_DIM) || !intIn(h, 1, SHOT_MAX_DIM)) return null;
  return { w, h, rows };
}

// --- protocol helpers (pure, unit-tested) ---------------------------------------

const RECV_BLOCK = 2048;

function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Parse `lua sums` output into [{sha, bytes, file}].
function parseSums(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^([0-9a-f]{64})\s+(\d+)\s+(\S+)\s*$/);
    if (m) out.push({ sha: m[1], bytes: Number(m[2]), file: m[3] });
  }
  return out;
}

// Plan a delta push: which files need `recv` (new/changed vs sums).
// localFiles: [{rel, bytes, sha}]. Returns [{rel, bytes, sha}].
function planPush(localFiles, remoteSums) {
  const byName = new Map(remoteSums.map((s) => [s.file, s]));
  return localFiles.filter((f) => {
    const r = byName.get(f.rel);
    return !r || r.sha !== f.sha;
  });
}

// bytes come from the data actually read (main.lua/app.json entries carry no
// size), so the `lua recv` line always announces the real length.
function hashLocalFiles(files) {
  return files.map((f) => {
    const data = fs.readFileSync(f.abs);
    return { rel: f.rel, bytes: data.length, sha: sha256hex(data) };
  });
}

module.exports = {
  RECV_BLOCK,
  SHOT_MAX_DIM,
  loadSerialport,
  serialHint,
  shotsToPng,
  parseShot,
  parseSums,
  planPush,
  hashLocalFiles,
  sha256hex,
};
