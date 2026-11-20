'use strict';

// badge publish [--dry-run] [dir]
// There is NO public store submit API (verified absent, docs/PUBLISHING.md),
// so `badge publish` without --dry-run refuses rather than faking anything.
// --dry-run runs every local store pre-check and prints the manual steps.

const fs = require('fs');
const path = require('path');
const { validatePackage } = require('./validate');
const { checkLuaFile } = require('./luacheck');
const { STORE_URLS, SOLANA_OS_PIN } = require('./pinned');

function run(args) {
  const dry = args.includes('--dry-run');
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
  if (!dry) {
    console.error(`badge publish: no automated submit exists — submissions are the web form only.
Run: badge publish --dry-run ${dir}
Then finish manually at ${STORE_URLS.submit} (Publish needs a linked X account).
This command never fakes a publish.`);
    return 2;
  }
  if (!fs.existsSync(dir)) throw new Error(`no such directory: ${dir}`);
  const { errors, warns, manifest, files } = validatePackage(dir);
  const engines = new Set();
  const luaFiles = ['main.lua', ...files.filter((f) => f.rel.endsWith('.lua')).map((f) => f.rel)];
  for (const rel of new Set(luaFiles)) {
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) continue;
    const r = checkLuaFile(abs, rel, manifest && manifest.permissions);
    errors.push(...r.errors);
    warns.push(...r.warns);
    engines.add(r.engine);
  }
  const id = manifest && manifest.id ? manifest.id : path.basename(dir);
  console.log(`badge publish --dry-run: ${id}  (against ${SOLANA_OS_PIN})`);
  console.log(`engines: ${[...engines].join(' | ')}`);
  for (const w of warns) console.log(`warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.log(`error: ${e}`);
    console.log('dry-run FAILED — fix the errors above, then re-run.');
    return 1;
  }
  const totalLua = files.filter((f) => f.rel.endsWith('.lua')).length + 1;
  console.log(`ok: manifest valid, ${totalLua} lua file(s) compile, ${files.length} bundled file(s) within caps`);
  console.log(`permissions: ${(manifest.permissions || []).join(' ') || '(none)'}`);
  if (manifest.hosts && manifest.hosts.length) console.log(`hosts: ${manifest.hosts.join(', ')}`);
  // award-cap reminder: scan sources for lamps.award.
  let usesAward = false;
  for (const rel of new Set(luaFiles)) {
    const abs = path.join(dir, rel);
    if (fs.existsSync(abs) && /lamps\s*\.\s*award/.test(fs.readFileSync(abs, 'utf8'))) usesAward = true;
  }
  if (usesAward) {
    console.log('note: lamps.award needs a DevRel allowance BEFORE publish (ask with app id + daily/player target);');
    console.log('      every later change to code/files/permissions/hosts of a capped app waits for an organiser.');
  }
  console.log(`
Manual submit steps (web form only — no store API exists):
  1. Sign in at ${STORE_URLS.apps} with an X-linked account (/profile).
  2. Open ${STORE_URLS.submit}; drop this folder (or a .zip of it).
  3. Fill the form (app.json fills most of it), Try in emulator, Run on badge.
  4. Publish: store compiles every .lua + runs the automatic check (~1 min).
     Flagged apps wait for an organiser; capped award apps always do.
  5. Each later change is a NEW version (bumps app.json "version").`);
  return 0;
}

module.exports = { run };
