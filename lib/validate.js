'use strict';

// app.json + package validation. Rules from docs/PUBLISHING.md, pinned to
// solana-os@64a474b (main/lua/lua_pkg.{h,c}, docs/LUA_API.md).

const fs = require('fs');
const path = require('path');
const { PERMISSIONS, ICONS, CATEGORIES, PKG } = require('./pinned');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validHost(h) {
  if (typeof h !== 'string' || h.length === 0 || h.length > 253) return false;
  if (/[\s/:]/.test(h)) return false; // no spaces, ports, paths
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false; // no IP addresses
  if (h.includes('..')) return false;
  const body = h.startsWith('*.') ? h.slice(2) : h;
  if (!/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(body)) return false;
  return true;
}

function validateManifest(m) {
  const errors = [];
  const warns = [];
  if (!isPlainObject(m)) return { errors: ['app.json: not a JSON object'], warns };
  if (typeof m.id !== 'string' || !PKG.idRe.test(m.id)) {
    errors.push('app.json: "id" must match ^[a-z0-9-]{3,24}$ (store-unique, doubles as apps/<id> path)');
  }
  if (typeof m.name !== 'string' || m.name.length === 0 || m.name.length > PKG.nameMax) {
    errors.push(`app.json: "name" must be 1-${PKG.nameMax} chars (launcher list)`);
  }
  if (typeof m.version !== 'string' || m.version.length === 0 || m.version.length > PKG.versionMax) {
    errors.push(`app.json: "version" must be 1-${PKG.versionMax} chars (each publish is a new version)`);
  }
  if (typeof m.author !== 'string' || m.author.length > PKG.authorMax) {
    errors.push(`app.json: "author" must be a string up to ${PKG.authorMax} chars`);
  }
  if (typeof m.summary !== 'string' || m.summary.length > PKG.summaryMax) {
    errors.push(`app.json: "summary" must be up to ${PKG.summaryMax} chars`);
  }
  if (!ICONS.includes(m.icon)) {
    errors.push(`app.json: "icon" must be one of: ${ICONS.join(' | ')}`);
  }
  if (typeof m.accent !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(m.accent)) {
    errors.push('app.json: "accent" must be 6 hex chars, no leading #');
  }
  if (!CATEGORIES.includes(m.category)) {
    errors.push(`app.json: "category" must be one of: ${CATEGORIES.join(' | ')}`);
  }
  if (!Array.isArray(m.permissions) || m.permissions.some((p) => !PERMISSIONS.includes(p))) {
    errors.push(`app.json: "permissions" must be an array drawn from: ${PERMISSIONS.join(' ')}`);
  }
  const perms = Array.isArray(m.permissions) ? m.permissions : [];
  if (Array.isArray(m.hosts) && m.hosts.length > 0) {
    if (m.hosts.length > PKG.hostsMax) {
      errors.push(`app.json: "hosts" holds at most ${PKG.hostsMax} entries (got ${m.hosts.length})`);
    }
    for (const h of m.hosts) {
      if (!validHost(h)) errors.push(`app.json: bad host ${JSON.stringify(h)} (names only, no IP/port/path; "*." covers subdomains, not the apex)`);
    }
    if (!perms.includes('http')) {
      errors.push('app.json: "hosts" requires the "http" permission (ws uses the http permission)');
    }
  } else if (m.hosts !== undefined && !Array.isArray(m.hosts)) {
    errors.push('app.json: "hosts" must be an array of host names');
  }
  if (perms.includes('http') && (!Array.isArray(m.hosts) || m.hosts.length === 0)) {
    warns.push('app.json: "http" permission but no "hosts" — http/ws calls will answer "host not allowed"');
  }
  if (perms.includes('rpc')) warns.push('app.json: "rpc" needs Solana OS 0.5.2+ on the badge (store refuses older)');
  if (perms.includes('ble')) warns.push('app.json: "ble" needs Solana OS 1.0.0+ on the badge (store refuses older)');
  if (m.temp === true) warns.push('app.json: "temp" is for quest-granted apps (beacon grants are main.lua-only)');
  return { errors, warns };
}

function validRelPath(p) {
  if (typeof p !== 'string') return false;
  if (p.length === 0 || p.length > PKG.pathMax) return false;
  if (p.startsWith('/') || p.includes('..') || p.includes('\\')) return false;
  const segs = p.split('/');
  if (segs.length > PKG.pathDepth) return false;
  return segs.every((s) => s.length > 0 && PKG.pathRe.test(s) && !s.startsWith('.') && !s.endsWith('.'));
}

function collectAppFiles(dir) {
  // Returns [{rel, abs, size}] for bundled files (everything except
  // main.lua and app.json at the top level). Symlinks are refused outright:
  // one could point outside the app dir, and `push` would upload the
  // target's bytes to a badge console where anyone can read them.
  const out = [];
  function walk(abs, rel) {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const a = path.join(abs, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      const st = fs.lstatSync(a);
      if (st.isSymbolicLink()) throw new Error(`${r}: symlinks are not allowed in apps (may point outside the bundle)`);
      if (st.isDirectory()) walk(a, r);
      else if (st.isFile()) out.push({ rel: r, abs: a, size: st.size });
    }
  }
  walk(dir, '');
  return out.filter((f) => f.rel !== 'main.lua' && f.rel !== 'app.json');
}

function validatePackage(dir) {
  const errors = [];
  const warns = [];
  const mainPath = path.join(dir, 'main.lua');
  const jsonPath = path.join(dir, 'app.json');
  if (!fs.existsSync(mainPath)) errors.push('main.lua: missing (UTF-8, <= 64 KiB, runs first)');
  else if (fs.lstatSync(mainPath).isSymbolicLink()) errors.push('main.lua: symlinks are not allowed in apps');
  if (!fs.existsSync(jsonPath)) errors.push('app.json: missing (the manifest)');
  else if (fs.lstatSync(jsonPath).isSymbolicLink()) errors.push('app.json: symlinks are not allowed in apps');
  let manifest = null;
  if (fs.existsSync(jsonPath) && !fs.lstatSync(jsonPath).isSymbolicLink()) {
    // Size from stat (bytes, before reading): a huge or hostile manifest is
    // refused without being loaded or parsed.
    const bytes = fs.statSync(jsonPath).size;
    if (bytes > PKG.jsonMax) {
      errors.push(`app.json: ${bytes} bytes exceeds ${PKG.jsonMax} (the badge parses at most ${PKG.jsonMax})`);
    } else {
      try {
        manifest = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      } catch (e) {
        errors.push(`app.json: invalid JSON (${e.message})`);
      }
    }
    if (manifest) {
      const r = validateManifest(manifest);
      errors.push(...r.errors);
      warns.push(...r.warns);
    }
  }
  if (fs.existsSync(mainPath)) {
    const st = fs.statSync(mainPath);
    if (st.size > PKG.mainMax) errors.push(`main.lua: ${st.size} bytes exceeds ${PKG.mainMax} (64 KiB)`);
    if (st.size === 0) warns.push('main.lua: empty file');
  }
  let files = [];
  if (fs.existsSync(dir)) {
    try {
      files = collectAppFiles(dir);
    } catch (e) {
      errors.push(e.message);
      files = [];
    }
    if (files.length > PKG.filesMax) {
      errors.push(`bundled files: ${files.length} exceeds ${PKG.filesMax} (besides main.lua/app.json)`);
    }
    let total = 0;
    for (const f of files) {
      total += f.size;
      if (!validRelPath(f.rel)) {
        errors.push(`${f.rel}: bad path (lowercase [a-z0-9_-] + dots, / separators, <= 64 chars, <= 4 levels, no leading/trailing dots)`);
      }
      if (f.size > PKG.fileMax) errors.push(`${f.rel}: ${f.size} bytes exceeds per-file ${PKG.fileMax} (256 KiB)`);
    }
    if (total > PKG.filesTotal) errors.push(`bundled files: ${total} bytes exceeds ${PKG.filesTotal} (1 MiB) total`);
  }
  return { errors, warns, manifest, files };
}

module.exports = { validateManifest, validatePackage, validHost, validRelPath, collectAppFiles };
