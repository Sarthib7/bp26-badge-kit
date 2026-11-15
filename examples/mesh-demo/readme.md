# Mesh Demo — example app built with the kit

Host or join a room; one shared counter over the mesh. Open the same app on
two badges (or two emulator tabs: `/emulator` + `/emulator?badge=2`), press
SELECT to +1, watch both counters move.

- Scaffolded with `badge new mesh-demo --template mesh-multiplayer`
  (bundles `lib/lobby.lua` + `lib/sync.lua` from the kit).
- Passes `badge check` (manifest valid, 3 Lua files, `mesh` permission).
- Out of radio range: RIGHT opens `mesh.bridge()`; bridged peers show in the list.
- Try in emulator or Run on badge from `/apps/submit` before publishing
  (needs the `mesh` test run only for server features — this demo uses none).

No secrets, no server, no permissions beyond `mesh`.
