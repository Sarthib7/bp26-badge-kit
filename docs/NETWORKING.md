# Networking and multiplayer — Solana OS badges

> Firmware `64a474b` (2.1.0). Labels: **Verified** (path:line), **Inferred**, **Unknown**.
> Start with `docs/CONNECTIVITY.md` (the choosing guide) + `docs/LUA_API.md` mesh/meet/ble/http/ws/rpc sections.

## The three ways (verified)

From `docs/CONNECTIVITY.md:10-20` — Verified:

| Path | Reaches | Needs | Good for |
|---|---|---|---|
| Mesh (`mesh`) | badges + quest beacons nearby running your app | nothing (no Wi-Fi/pairing) | presence, small game messages, provable meets |
| Bluetooth (`ble`, 1.0.0) | gadgets, phones, laptops, another badge | `ble.on()` (~30 KiB badge SRAM) | gadgets, phones, two badges that both stay on Wi-Fi |
| Wi-Fi (`http/ws/rpc` + `lamps/items/profile/quest/meets`) | badge server, own hosts, public APIs, Solana | Wi-Fi joined | anything far, anything counted/trusted |

## Mesh limits (verified)

| Item | Value | Evidence |
|---|---|---|
| Transport | ESP-NOW, unencrypted, STA interface | `os_radio.c`, `os_radio.h:14` |
| Frame max | 250 B (`OS_RADIO_FRAME_MAX`) | `os_radio.h:14` |
| Assembled JSON | ≤1600 B (`OS_MESH_MSG_MAX`), 16 B header + ≤232 B/frag x ≤8 frags | `os_mesh.h:28`, `os_mesh.c:39-41,1041-1053,1425-1460` |
| Lua message | ≤200 B JSON, 4/s (`mesh.send`) | `LUA_API.md` limits, `lua_priv.h:52-53` |
| HELLO period | ~1.5 s + jitter (header says ~2 s; code 1500 ms) | `os_mesh.c:50,1105-1128` |
| Peer TTL | 30 s since last HELLO | `os_mesh.h:29` |
| Peer ordering | strongest RSSI first | `os_mesh.c:417-434` |
| Radio peers | 12 unicast + broadcast, LRU (driver limit 20) | `os_radio.c:PEERS=12` |
| Firmware peer table | 20 peers (see also `os_mesh.c:46`) | `os_mesh.h:29` |
| Fragment dedup | 32 entries, 10 s window (MAC+msg id) | `os_mesh.c:44-45,1180-1191` |
| Meets | 1 asked + 1 accepted/s, ≤100 B data/side, 300/badge/day, 40 outbox | `LUA_API.md` limits |
| Channels | 2.4 GHz 1-13; 5 GHz 36/40/44/48/149/153/157/161/165 (no radar rules); DFS 52-144 refused | `os_mesh.h` channel fns, `CONNECTIVITY.md:170-180`, `LUA_API.md` mesh channel |
| Scan | ≤22 channels, 500-5000 ms dwell (default 2600), ≤24 hits; sends nothing, `send` fails `scanning`, pauses Wi-Fi unless bridge open | `os_mesh.h:SCAN_*`, `LUA_API.md` scan section |
| Bridge latency | ~1-3 s, in-order per badge, lossy (drop >60 s wait or >64 backlog) | `LUA_API.md` bridges, `CONNECTIVITY.md:98-100` |

Handler budget: mesh handlers run on mesh task (~2 KiB spare) — copy state, `os_post()`, never SD/HTTP/LVGL lock — Verified `os_mesh.h:1-30` header comment.

## Channels and the one radio

`mesh.info()` (`1.0.0`) reports `{channel, band, online, paused, event, scanning}` — Verified `lua_net.c:982-1001`. `online=true` means Wi-Fi joined **on** the mesh channel: mesh + server at once (measured on 5 GHz ch.149: 20/20 ESP-NOW acks at 6 Mbps) — Verified `CONNECTIVITY.md:152-170`. Otherwise opening a `mesh` app suspends Wi-Fi (`offline`, meets queue in outbox) until close/`mesh.pause()` — Verified `os_mesh.h:148-153`, `LUA_API.md` meets. `mesh.pause()` hands radio to Wi-Fi (rejoin seconds, wait `badge.online()`), `resume()` takes it back; while paused no mesh traffic and `nearby()` decays after 30 s — Verified `lua_net.c:969,974`, `LUA_API.md`. Full pattern + `mesh-and-wifi` batching example — Verified `CONNECTIVITY.md:148-196`, `docs/examples/mesh-and-wifi/`.

Own channel (1.1.0): `mesh.channel(n)` moves only this badge while app runs; `event` keeps the event channel; moving costs beacons/X Dex/Trade + server if Wi-Fi was on the event channel; `mesh.scan` costs the same while running (~34 s for 2.4 GHz at default dwell) — Verified `LUA_API.md` choosing-channel section, `os_mesh.h` app-channel fns.

## Bridges

Badges with no shared radio (or emulators, which have no radio) meet over a **bridge through the server**: one shows its code (`mesh.bridge()`), the other types/scans it; then `mesh.send`/`on_mesh` work identically, bridged peers listed with `bridged=true, rssi=0` — Verified `os_bridge.h:3-14,36-42`, `os_bridge.c:160-164`, `os_mesh.h:57-59`, `os_mesh.c` bridge-rx path. Both need Wi-Fi. Code is a rotating `bridge|id|window` HMAC — Verified `os_bridge.h/c`. In emulator the page's **Bridge a badge** panel scans/pastes — Verified `emulator/README.md`, site `/emulator` page. Limits: max 6 open bridges (`os_bridge.h:20`); sync every 1 s with traffic else 3 s, retry 5 s on fail (`os_bridge.c:40-45`); outbound queue 16 msgs / 6144 B JSON / 20 s TTL, lossy (`os_bridge.c:47-49,17`); endpoints `POST /api/device/bridge` (join) + `POST /api/device/bridge/sync` (`os_bridge.c:578,650`, `os_bridge.h:9-10`); code UX is QR (`<site>/emulator?bridge=<code>`) or short `<id> <6 digits>` (`os_bridge.h:36-42`). Bridge is badge<->server<->badge, not phone/PC tethering — Verified `CONNECTIVITY.md:40-43,305-306`. Flow: A shows `mesh.bridge()` -> B scans/pastes -> join -> periodic sync exchanges APP/XDEX/TRADE frames -> `os_mesh_bridge_rx()` feeds the mesh task -> Lua `on_mesh` unchanged.

## BLE

NimBLE, one link, no pairing/encryption; `ble.on()` (~30 KiB SRAM; needs 64 KiB free), `advertise` (≤24 B, 20 with 16-bit service, 6 with 128-bit), `scan` (default 30% duty, `seconds`, stop with `ble.scan(false)`), `connect`/`serve` (≤4 chars/service, ≤244 B values, 4 waiting, 8-event queue), `read/write/subscribe`, `set/notify/drop` — Verified `LUA_API.md` BLE section, `lua_ble.c`, `CONNECTIVITY.md:46-62`. Use for gadgets/phones/two-badges-on-Wi-Fi; emulator BLE is browser tabs only (`BroadcastChannel solana-os-ble`) — Verified `emulator/README.md` platform table, `CONNECTIVITY.md:300-310`. Trust: open air, anyone can spoof; use custom UUIDs, validate everything — Verified `CONNECTIVITY.md:274-298`.

## Wi-Fi: `http` / `ws` / `rpc` / server calls

All need Wi-Fi, work the same in emulator (demo Wi-Fi), go through server rules — Verified `CONNECTIVITY.md:64-77`, `LUA_API.md` http/ws/rpc:

| Call | Caps | Notes (verified) |
|---|---|---|
| `http` (perm `http`, 0.4.6) | 60/min, ≤2 KiB req, ~3.5 KiB resp, 6 s; `https://` port 443 only, ≤512 chars; ≤8 headers, ≤8 hosts | Hosts from `app.json` (`*.example.com` = subdomains only); store shows them; server refuses others `host not allowed`; signed `X-Badge-*` headers (Ed25519 `badge-http-v1`) + key at `GET badge-api.../api/http/key`; test runs check draft perms/hosts for 12 h (needs linked X) |
| `ws` (perm `http`, 0.5.1) | 1 at a time, 20 opens/min, ≤4 KiB/msg, 8 queued | `wss://` + `badge_ticket` (`badge-ws-v1`); takes over the server connection (`socket open` for other server calls; bridged mesh pauses, radio mesh keeps working); close before server calls; emulator = browser socket |
| `rpc` (perm `rpc`, 0.5.2) | 30/min (6 sends), ≤2 KiB params, ~3.5 KiB resp, 6 s; method allowlist (reads + `sendTransaction` 1232 B base64) | Via Triton; big ints >2^31 stringified; never keypair on badge |
| `lamps/items/profile/quest/meets` | 16 queued/app (`busy`); lamps 500/day spend+transfer+deposit; award within cap; items 20 grants/user/app/h; lists newest 50 | `LUA_API.md` callbacks section; server address `https://badge-api.solana.com/api/...` (store origin 429s scripts) |
| Device transport | 3 calls in flight (`LH_CALLS_SENT`), responses ≤4096 B default | `lua_priv.h:56`, `os_api.h:17` |
| Device paths (firmware) | `/api/device/apps/{appId}/{tail}`; meets `POST .../meets`, `GET .../meets?after=`; WS ticket `POST .../ws`; RPC `POST .../rpc`; xdex `/api/device/xdex`, trades `/api/device/trades`; beacon `/api/device/beacon/hello` + `.../relay`; app HTTP proxied to `hosts` | `lua_net.c:345,1207-1208,1257-1258,573-577`, `lua_meet.c:179`, `lua_ws.c:3-4,339`, `xdex.c:254`, `trade.h:7-8`, `beacon.c:344,553` |
| Native reference games | X Dex (`OS_MESH_XDEX` + xdex API), Trade (`OS_MESH_TRADE`, bundles capped 6 items/side — `trade.h:16-17`), Quests (beacon peers ≤12 — `quests_app.c:19,95`), ESP-NOW scanner (promiscuous sniff / channel pick) | Verified per file |

## Meets (the provable primitive)

`mesh.send` is unsigned. A **meet** has both badges sign one OS-built statement with mesh keys (app id, both ids, both nonces, clocks, both data blobs ≤100 B ASCII) over 3 mesh messages, no Wi-Fi needed; each keeps the other's signature; outbox uploads on Wi-Fi; server checks signature once, stores once; app server polls `GET /api/app/meets?after=` with app key from `/apps/mine` — Verified `LUA_API.md` meets section (`591,672-677`), `lua_meet.c:7-9,107-118,175-179,265,431-432`. `on_meet(from,data)->table|refuse`, `mesh.meets([after],cb)` (`{items:[{id,at,by,req,acc,bridged}],next}`), test runs make real meets but unsubmitted-app meets never reach server, ≤300/app/day, pre-0.5.15 badges never answer (`if mesh.meet`) — Verified.

What a meet proves: both badges' keys signed that statement **in that app with that data** — not that two people stood together (cooperating owners can relay; `bridged` says so), clocks are self-reported — Verified `CONNECTIVITY.md:284-298`, `LUA_API.md` meets. Count people (`user`), not badges; keep value on your server — Verified.

## Is there a server-side score or leaderboard?

**No dedicated score/leaderboard feature in firmware or documented server API — Verified absent.** Checked: `lamps` (balances, spend/transfer/deposit/award + escrows), `items` (per-app JSON inventory, 200/app/user), `profile` (me/get), `quest` (report/active), meets poll — all Verified `lua_net.c:381-569`, `LUA_API.md`. No `leaderboard`, `score`, `rank` endpoint in `LUA_API.md`/`CONNECTIVITY.md`/the device API surface (the badge server's side of those contracts is not public). Leaderboards today are **build-your-own**: meets or game events -> your host (`http` signed headers / `ws` tickets / escrow ledger / meets poll) -> your DB -> badges read back via `http`/`ws`.

## Recommended patterns

- **Real-time same-room (fast):** mesh `send` state (not events) + repeat-until-ack; host broadcasts at 1-2 Hz so scanners can find it; all on the event channel; `mesh.scan`+`mesh.channel` only for opt-in side games. Verified basis: lossy/small mesh rows above.
- **Turn-based / cross-venue / emulator-included:** same `mesh` code over a **bridge** (1-3 s, ordered per peer) — no code change except `mesh.bridge()` UX. For richer rooms or phone-in-the-loop, a **`ws` room on your host** (`wifi-room` example) with signed tickets. Verified — `CONNECTIVITY.md:98-100,122-140`, `docs/examples/wifi-room/`.
- **Lobbies (host + join):** mesh: host `advertise`s room in periodic `send("*",{room})`; joiners `nearby()` + SELECT -> `send(host,{join})`; host confirms; move to `mesh.channel(n)` from scan if crowded. Server variant: `http` create/join + `ws` room URL. (Inferred composition from verified primitives; no built-in lobby — Verified absent.)
- **Leaderboards:** authoritative server table keyed by `X-Badge-User`; writes from meets poll / `http` game events / escrow ledger; reads via `http.get` (poll 5-10 s) or `ws` push; pause mesh (`mesh.pause()`) to sync when offline, `resume()` to play — Verified pattern from `mesh-and-wifi` + signed-header verification sample in `LUA_API.md`.
- **Cheat posture:** never trust badge-claimed scores; re-check `on_meet` data server-side; keep payouts/keys on server; `main.lua` is public — Verified `CONNECTIVITY.md:274-298`, `LUA_API.md` trust + never-keypair warnings.
