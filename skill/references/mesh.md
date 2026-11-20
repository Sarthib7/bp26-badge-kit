# Mesh / multiplayer reference (for agents)

Evidence: `docs/NETWORKING.md`, `docs/HARDWARE.md`.

## Facts

- No NFC. Presence = ESP-NOW HELLO (~1.5 s, 30 s TTL, strongest-RSSI first);
  consent = SELECT; trust = HMAC(mesh_key) + server recomputation on upload.
- Mesh: 250 B frames, Lua ≤200 B JSON at ≤4/s, lossy, unordered; bridge adds
  ~1–3 s, in-order per peer. One radio: a `mesh` app steals Wi-Fi off-channel
  (pause/resume; `mesh.info().online` tells). Channels 1–13 + 5 GHz set.
- Types: HELLO/XDEX/TRADE/RELAY/RELAY_RESP/APP; `mesh.send(to|"*", table)`,
  `on_mesh(from, msg)` only on badges running the same app.
- Meets (`mesh.meet`, 0.5.15): 3-message signed handshake, ≤100 B data/side,
  1+1/s, 300/day, 40 outbox; server stores once; app server polls
  `/api/app/meets` with the `/apps/mine` key. Proves both badges took part in
  your app — not physical proximity (relays/`bridged` verify too).
- BLE: 1 link, ≤244 B, advertise ≤24 B, no pairing/encryption — for gadgets,
  phones, two-badges-on-Wi-Fi. Emulator tabs share a virtual radio.
- Server calls need Wi-Fi; `ws` takes over the server link (`socket open` for
  the rest); signed `X-Badge-*` headers / `badge_ticket` prove badge+account
  through your app id — never your exact code.

## Patterns (use `libs/lobby.lua` + `libs/sync.lua`)

- Discover: heartbeat `{t="hb", room, host, name}` ~1 Hz; list `mesh.nearby()`;
  deterministic host = lowest id (no election traffic).
- Sync: `{t="st", k, v, seq}` + `{t="ack", k, seq}`, resend ~800 ms, dedupe by
  (sender,key), last-writer-wins, cap messages <200 B.
- Bridge: same code path; just add `mesh.bridge()` UX. Lobby/sync are
  bridge-tolerant by construction.
- Lobby: host broadcasts room; joiners SELECT → `send(host,{join})`; move to
  `mesh.channel(n)` only for opt-in side games (costs beacons + server).
- Leaderboard: no server feature — authoritative table keyed by `X-Badge-User`
  on your host; writes from meets poll / signed `http` events; reads via
  `http.get` or `ws`. See `recipes/leaderboard-meets.md`.

## Anti-patterns

Event streams (use state + ack), >200 B messages, trusting badge-claimed
scores, secrets on the badge, expecting pairing without a button press.
