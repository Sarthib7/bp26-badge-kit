'use strict';

// badge check [dir] — validate the package and every .lua file.
// Exit 0 clean, 1 with errors. Warnings never fail.

const fs = require('fs');
const path = require('path');
const { validatePackage } = require('./validate');
const { checkLuaFile } = require('./luacheck');
const { SOLANA_OS_PIN } = require('./pinned');

function run(args) {
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
  if (!fs.existsSync(dir)) throw new Error(`no such directory: ${dir}`);
  const { errors, warns, manifest, files } = validatePackage(dir);
  const engines = new Set();
  const luaFiles = ['main.lua', ...files.filter((f) => f.rel.endsWith('.lua')).map((f) => f.rel)];
  const seen = new Set();
  for (const rel of luaFiles) {
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) continue;
    const r = checkLuaFile(abs, rel, manifest && manifest.permissions);
    errors.push(...r.errors);
    warns.push(...r.warns);
    engines.add(r.engine);
  }
  const id = manifest && manifest.id ? manifest.id : path.basename(dir);
  console.log(`badge check: ${id}  (against ${SOLANA_OS_PIN})`);
  console.log(`engines: ${[...engines].join(' | ')}`);
  for (const w of warns) console.log(`warning: ${w}`);
  if (errors.length === 0) {
    console.log(`ok: ${luaFiles.length} lua file(s), ${files.length} bundled file(s) — no errors`);
    if (warns.length) console.log('note: warnings do not fail check; the store compile + auto-check are authoritative');
    return 0;
  }
  for (const e of errors) console.log(`error: ${e}`);
  console.log(`${errors.length} error(s), ${warns.length} warning(s)`);
  return 1;
}

module.exports = { run };
