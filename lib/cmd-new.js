'use strict';

// badge new <name> [--template blank|mesh-multiplayer] [--dir .]

const fs = require('fs');
const path = require('path');

const KIT_ROOT = path.join(__dirname, '..');
const TEMPLATES = ['blank', 'mesh-multiplayer'];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function run(args) {
  let name = null;
  let template = 'blank';
  let dir = '.';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template') template = args[++i];
    else if (args[i] === '--dir') dir = args[++i];
    else if (!args[i].startsWith('--') && !name) name = args[i];
    else throw new Error(`unexpected argument: ${args[i]}`);
  }
  if (!name) throw new Error('usage: badge new <name> [--template blank|mesh-multiplayer] [--dir .]');
  if (!/^[a-z0-9-]{3,24}$/.test(name)) {
    throw new Error(`bad app name ${JSON.stringify(name)}: use ^[a-z0-9-]{3,24}$ (this becomes the store id)`);
  }
  if (!TEMPLATES.includes(template)) throw new Error(`unknown template ${template} (blank, mesh-multiplayer)`);
  const dest = path.resolve(dir, name);
  if (fs.existsSync(dest)) throw new Error(`destination exists: ${dest}`);
  copyDir(path.join(KIT_ROOT, 'templates', template), dest);
  if (template === 'mesh-multiplayer') {
    // Bundle the kit mesh libs into the app (apps ship their own files).
    const libDir = path.join(dest, 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    for (const f of ['lobby.lua', 'sync.lua']) {
      fs.copyFileSync(path.join(KIT_ROOT, 'libs', f), path.join(libDir, f));
    }
  }
  // Stamp the id + a readable name.
  const jsonPath = path.join(dest, 'app.json');
  const m = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (template === 'blank' || m.id === 'my-app' || m.id === 'mesh-demo') {
    m.id = name;
    m.name = name.slice(0, 20);
    fs.writeFileSync(jsonPath, JSON.stringify(m, null, 2) + '\n');
  }
  console.log(`created ${dest} (template ${template})`);
  console.log('next: badge check ' + path.join(name));
  return 0;
}

module.exports = { run, TEMPLATES };
