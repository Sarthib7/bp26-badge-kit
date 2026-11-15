'use strict';

// Every number below is pinned to solana-os @ 64a474b (release 2.1.0,
// 2026-11-13). See docs/LUA_API_INVENTORY.md and docs/OS_ARCHITECTURE.md.
// If you update these, cite the new file:line.

const SOLANA_OS_PIN = 'solana-os@64a474b (2.1.0, 2026-11-13)';

const PERMISSIONS = [
  'led', 'wifi', 'mesh', 'lamps', 'items', 'profile', 'quest', 'http', 'rpc', 'ble',
];

const ICONS = [
  'play', 'star', 'heart', 'bell', 'gift', 'home', 'image', 'list',
  'wifi', 'shuffle', 'eye', 'edit', 'charge', 'gps', 'settings', 'audio', 'bulb',
];

const CATEGORIES = ['games', 'tools', 'social', 'quests', 'demos'];

// Package caps (main/lua/lua_pkg.h, docs/LUA_API.md "The package").
const PKG = {
  idRe: /^[a-z0-9-]{3,24}$/,
  nameMax: 20,
  versionMax: 17,
  authorMax: 25,
  authorMaxDoc: 24,
  summaryMax: 80,
  mainMax: 64 * 1024,
  jsonMax: 2048,
  filesMax: 64,
  fileMax: 256 * 1024,
  filesTotal: 1024 * 1024,
  pathMax: 64,
  pathDepth: 4,
  pathRe: /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/,
  hostsMax: 8,
};

// Sandbox limits (main/lua/lua_host.h, lua_priv.h, docs/LUA_API.md "Limits").
const LIMITS = {
  heapPsram: 6 * 1024 * 1024,
  heapNoPsram: 96 * 1024,
  vmInsns: 200000,
  uiObjects: 128,
  labelBytes: 200,
  labelTotal: 12 * 1024,
  timers: 8,
  timerMinMs: 20,
  storageBytes: 16 * 1024,
  fsReadMax: 256 * 1024,
  meshBytes: 200,
  meshPerSec: 4,
  meetDataMax: 100,
  meetsPerDay: 300,
  meetsOutbox: 40,
  httpPerMin: 60,
  httpReqMax: 2 * 1024,
  httpRespMax: 3584,
  httpTimeoutS: 6,
  rpcPerMin: 30,
  rpcSendsPerMin: 6,
  wsPerMin: 20,
  wsMsgMax: 4 * 1024,
  wsQueuedMax: 8,
  bleLinkMax: 244,
  bleAdvMax: 24,
};

// Minimum OS version per API (documented in docs/LUA_API.md; the 2.1.0 tree
// always registers the full surface, older firmware nils it).
const MIN_OS = {
  'ui.qr': '0.5.3',
  'ui.load': '0.5.9', 'ui.image': '0.5.9', 'ui.canvas': '0.5.9', 'ui.anim': '0.5.9',
  'sys.keys': '0.5.11',
  'sys.memory': '2.0.0',
  'mesh.meet': '0.5.15', mesh_meet: '0.5.15', on_meet: '0.5.15',
  'mesh.pause': '0.5.15', 'mesh.resume': '0.5.15', 'mesh.meets': '0.5.15',
  'mesh.info': '1.0.0', ble: '1.0.0',
  'mesh.channel': '1.1.0', 'mesh.scan': '1.1.0',
  http: '0.4.6', ws: '0.5.1', rpc: '0.5.2',
  crypto: '2.1.0', solana: '2.1.0',
};

// Which permission an API surface needs. `ws` uses the `http` permission
// (verified: docs/LUA_API.md + main/lua/lua_ws.c:330).
const API_PERM = {
  'led.': 'led',
  'wifi.': 'wifi',
  'mesh.': 'mesh', on_mesh: 'mesh', on_meet: 'mesh',
  'lamps.': 'lamps',
  'items.': 'items',
  'profile.': 'profile',
  'quest.': 'quest',
  'http.': 'http',
  'ws.': 'http',
  'rpc.': 'rpc',
  'ble.': 'ble',
};

const STORE_URLS = {
  apps: 'https://solana.com/breakpoint/badge/apps',
  docs: 'https://solana.com/breakpoint/badge/apps/docs',
  submit: 'https://solana.com/breakpoint/badge/apps/submit',
  emulator: 'https://solana.com/breakpoint/badge/emulator',
  api: 'https://badge-api.solana.com',
};

module.exports = {
  SOLANA_OS_PIN, PERMISSIONS, ICONS, CATEGORIES, PKG, LIMITS, MIN_OS, API_PERM, STORE_URLS,
};
