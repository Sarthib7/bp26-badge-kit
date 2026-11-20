'use strict';

// badge dev [dir] — print the emulator flow (no local emulator in this kit;
// the emulator is the site WASM build — deferred per proposal).

const { STORE_URLS } = require('./pinned');

function run() {
  console.log(`badge dev — try it in the emulator (no install needed)

1. Open ${STORE_URLS.emulator}
2. Turn on demo Wi-Fi ("Emulator Guest") and open My Badge to get a claim code.
3. Load your app: use Try in emulator on ${STORE_URLS.submit}
   (same sources you run on hardware; print() shows in the page console).

Two badges, one browser (mesh + BLE between tabs):
  Tab A: ${STORE_URLS.emulator}
  Tab B: ${STORE_URLS.emulator}?badge=2
  Wi-Fi ON once per tab (server ids), keep both tabs visible side by side
  (background tabs throttle to ~1 Hz), run the app in both.

Bridge a real badge or someone else's emulator: on the badge open X Dex or
Trade > Bridge a badge, then scan/paste the code in the emulator page's
"Bridge a badge" panel. Both sides need Wi-Fi; expect ~1-3 s per message.

Console on the emulator page mirrors the badge console (lua list/run/rm/mem,
mesh status/peers). Memory figures (lua mem) match the badge.
`);
  return 0;
}

module.exports = { run };
