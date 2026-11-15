# Lua API inventory — Solana OS 2.1.0

> Source of truth: `docs/LUA_API.md` (repo `64a474b`) implemented in `main/lua/lua_*.c`.
> Permission bits: `led wifi mesh lamps items profile quest http rpc ble` — Verified `main/lua/lua_pkg.c:20-22`, `lua_pkg.h:27-38`.
> Enforcement: sync entry `lh_need_perm()` (Lua error) + async `start_ex`/`ws.open` (`cb(false,"denied")`) — Verified `lua_host.c:95-99`, `lua_net.c:193-198`, `lua_ws.c:330`.
> Min-OS below is the **documented** first appearance; this tree always registers the full surface at boot (`lh_open_*` in `lua_host.c:459-466`) — older firmware is the only thing that `nil`s it (Inferred store/server gate, not `#if` in bindings).

## Lifecycle and globals

| Module | Function | Signature | Permission | Min OS | Doc? | Impl? |
|---|---|---|---|---|---|---|
| — | `on_key` | `on_key(key, rep) -> handled?` | — | 0.5.0 | yes | Verified `lua_host.c:504` |
| — | `on_tick` | `on_tick(ms)` every 30 ms (50 ms pre-2.1) | — | 0.5.0 / 30 ms in 2.1.0 | yes | Verified `lua_host.c:519`, `lua_priv.h:49` |
| — | `on_mesh` | `on_mesh(from, msg)` | `mesh` to receive | 0.5.0 | yes | Verified `lua_net.c:827` |
| — | `on_meet` | `on_meet(from, data) -> table\|refuse` | `mesh` | 0.5.15 | yes | Verified `lua_meet.c:335-347` |
| — | `on_exit` | `on_exit()` | — | 0.5.0 | yes | Verified `lua_host.c:233-237` |
| global | `print` | `print(...)` -> serial, `[<app>]`-tagged | — | 0.5.0 | yes | Verified `lua_host.c:368-399,451` |
| global | `collectgarbage` | `collectgarbage("count") -> KB` only | — | 0.5.0 | yes (only `count`) | Verified `lua_host.c:401-407,450` |
| global | `require` | `require("lib.mod")` (own files) | — | 0.5.0 | yes | Verified `lua_fs.c:393-454` |
| stdlib | `assert error ipairs next pairs pcall select tonumber tostring type xpcall print getmetatable setmetatable rawequal rawlen rawset _G _VERSION`, `string.*` (no `dump`), `table.*` (+`create`), `math.*`, `utf8.*`, `coroutine.*` | — | — | 0.5.0 (5.5) | yes `LUA_API.md:166-186` | Verified `lua_host.c:429-448` minus `dofile/loadfile/load/warn/io/os/debug/package` |

## `ui` (no permission)

Constants `ui.W=320, ui.H=218`. All Verified in `lua_ui.c` / `lua_img.c` (`lh_open_ui`, fns `939-943`, methods `924-936`).

| Function | Signature | Min OS | Notes |
|---|---|---|---|
| `ui.bg` | `ui.bg(color)` | 0.5.0 | Verified `lua_ui.c:701` |
| `ui.label` | `ui.label(x,y,text,opts?) -> h` + `:text :color :pos :show :remove` | 0.5.0 | Verified `506`, methods `275,298,308,326,345` |
| `ui.rect` | `ui.rect(...)` + `:size :color :pos :show :remove` | 0.5.0 | Verified `553` |
| `ui.bar` | `ui.bar(x,y,w,h,value)` + `:set :size` | 0.5.0 | Verified `587` |
| `ui.gradient` | `ui.gradient(x,y,w,h)` + `:size` | 0.5.0 | Verified `615` |
| `ui.list` | `ui.list(...) -> h` + `:items :selected :select` | 0.5.0 | Verified `630`, methods `422,435,447` |
| `ui.qr` | `ui.qr(x,y,size,text)` + `:text` | 0.5.3 (`nil` older) | Verified `662`, `m_qr_text 476` |
| `ui.load` | `ui.load(path) -> img` | 0.5.9 images | Verified `lua_img.c` |
| `ui.image` | `ui.image(...)` + `:set :scale` | 0.5.9 | Verified |
| `ui.canvas` | `ui.canvas(...)` + `:clear :pixel :rect :line :image :get` | 0.5.9 | Verified |
| `ui.anim` | `ui.anim(...)` + `:play :stop :playing :scale` | 0.5.9 | Verified |
| `ui.hint` | `ui.hint(text)` | 0.5.0 | Verified `711` |
| `ui.toast` | `ui.toast(text)` | 0.5.0 | Verified `735` |
| `ui.confirm` | `ui.confirm(msg, cb)` | 0.5.0 | Verified `755` |
| `ui.input` | `ui.input(prompt, max, cb)` | 0.5.0 | Verified `781` |
| `ui.clear` | `ui.clear()` | 0.5.0 | Verified `798` |
| img `:size` | `w,h = load_result:size()` | 0.5.9 | Verified `lua_img.c:504-506,996` |

## `led` (perm `led`)

| Function | Min OS | Impl |
|---|---|---|
| `led.count` (=8) | 0.5.0 | Verified `lua_sys.c:459-460` |
| `led.set(i,r,g,b)` | 0.5.0 | Verified `37-44` |
| `led.hex(i, 0xRRGGBB)` | 0.5.0 | Verified `46-53` |
| `led.fill(r,g,b)` | 0.5.0 | Verified `63-68` |
| `led.off()` | 0.5.0 | Verified `70-74` |

## `timer` / `sys` / `badge` / `json` (no permission)

| Function | Signature | Min OS | Impl |
|---|---|---|---|
| `timer.after` | `(ms, fn) -> id` | 0.5.0 | Verified `lua_sys.c:127-129` |
| `timer.every` | `(ms, fn) -> id` | 0.5.0 | Verified `132-135` |
| `timer.cancel` | `(id)` | 0.5.0 | Verified `137-148` |
| `sys.millis` | ms since start | 0.5.0 | Verified `209-212` |
| `sys.time` | unix s or nil | 0.5.0 | Verified `215-223` |
| `sys.battery` | % or nil | 0.5.0 | Verified `226-234` |
| `sys.keys` | `{up=,...}` | 0.5.11 | Verified `254-269` |
| `sys.memory` | `{used,max}` | 2.0.0 | Verified `240-248` |
| `sys.exit` | closes app | 0.5.0 | Verified `272-275` |
| `badge.id` | id or nil | 0.5.0 | Verified `278+` |
| `badge.owner` | handle or nil (claimed only) | 0.5.0 | Verified `290` area |
| `badge.online` | bool (false while app WS open) | 0.5.0 | Verified `302-305` |
| `json.encode` / `json.decode` | `str` / `v\|nil,err` | 0.5.0 | Verified `lua_json.c:510,524-534,539-545` |

## `storage` / `fs` (always allowed)

| Function | Min OS | Impl |
|---|---|---|
| `storage.get/set/remove` | 0.5.0 (16 KiB) | Verified `lua_sys.c:318,328,356` |
| `fs.exists/size/list` | 0.5.0 | Verified `lua_fs.c:157,169,194` |
| `fs.read` | 0.5.0; 256 KiB in 2.0.0 | Verified `228` |
| `fs.lines` | 0.5.0 | Verified `287` |
| `fs.json` | 0.5.0 | Verified `300` |
| `fs.load` | 0.5.0 | Verified `376` |

## `wifi` (perm `wifi`)

| Function | Min OS | Impl |
|---|---|---|
| `wifi.status` (`off/connecting/on/failed`) | 0.5.0 | Verified `lua_sys.c:399` |
| `wifi.ssid` | 0.5.0 | Verified `413` |
| `wifi.on/off` | 0.5.0 | Verified `425,432` |

## `mesh` (perm `mesh`)

| Function | Signature | Min OS | Impl |
|---|---|---|---|
| `mesh.nearby` | `-> {peers}` | 0.5.0 | Verified `lua_net.c:844` |
| `mesh.send` | `send(to, msg_table)` (200 B, 4/s) | 0.5.0 | Verified `871` |
| `mesh.bridge` | show bridge UI | 0.5.0 | Verified `1263-1267` |
| `mesh.meet` | `meet(id, data, cb)` | 0.5.15 | Verified `lua_meet.c:265` |
| `mesh.meets` | `meets([after], cb)` (async perm) | 0.5.15 | Verified `lua_net.c:1201`, OP `45` |
| `mesh.pause/resume` | radio <-> Wi-Fi | 0.5.15 | Verified `969,974` |
| `mesh.info` | `{channel,band,online,paused,event,scanning}` | 1.0.0 | Verified `982-1001` |
| `mesh.channel` | `channel([n])` | 1.1.0 | Verified `1006-1016` |
| `mesh.scan` | `scan([opts], cb)` | 1.1.0 | Verified `1045+` |

Subtlety (Verified): `mesh.meets` has no entry `lh_need_perm`, but OP_MEETS checks `LUA_PERM_MESH` in `start_ex` (`193-198`) — deny arrives via callback, not Lua error.

## `ble` (perm `ble`, 1.0.0)

All Verified in `lua_ble.c` (`lh_open_ble 1007-1022`): `ble.on 536`, `off 569`, `state 602`, `address 609`, `advertise 648`, `scan 690`, `connect 745`, `serve 783`, `set 865`, `notify 878`, `drop 893`; link `:read 969 :write 975 :subscribe 983 :close 989 :state 999`.

## `lamps` / `items` / `profile` / `quest` (async, perm-gated in `start_ex`)

| Function | Perm | Min OS | Impl |
|---|---|---|---|
| `lamps.balance/spend/transfer/deposit/award` | `lamps` | 0.5.0 (deposit 0.3.1 doc) | Verified `lua_net.c:381-467` |
| `items.list/all/grant/update/remove` | `items` | 0.5.0 | Verified `477-525` |
| `profile.me/get` | `profile` | 0.5.0 | Verified `528-541` |
| `quest.report/active` | `quest` | 0.5.0 | Verified `544-569` |
| tables | — | — | Verified `lh_open_net 1270-1302` |

Module tables always load; permission enforced only in async path (matches documented callback errors) — Verified.

## `http` (perm `http`, 0.4.6) / `ws` (perm `http`, 0.5.1) / `rpc` (perm `rpc`, 0.5.2)

| Function | Perm | Min OS | Impl |
|---|---|---|---|
| `http.get/post/request` | `http` | 0.4.6 | Verified `lua_net.c:690-707+` |
| `ws.open` + `send/close/state` | `http` | 0.5.1 | Verified `lua_ws.c:305,330,370,403,412`, `lh_open_ws 419-430` |
| `rpc.call` | `rpc` | 0.5.2 | Verified `lua_net.c:1221-1258` |

`ws` perm-name match (doc `http`, C `LUA_PERM_HTTP`) — Verified.

## `crypto` / `solana` (no perm, 2.1.0, `nil` below)

| Function | Impl |
|---|---|
| `crypto.sha256/on_curve/verify` | Verified `lua_crypto.c:36,50,63` |
| `solana.encode/decode/pda` | Verified `83,119,178`, reg `225-236` |

## Documented-vs-implemented gaps

- **C bindings not in `LUA_API.md`:** none material for app modules — Verified (every `luaL_Reg`/global maps to a doc section). Console `lua *` subcommands live in `lua_cmd.c` and are documented under "Console (development)" (`LUA_API.md:2028+`), not as Lua modules.
- **Documented but absent in the firmware sources:** only version-skew cases (Inferred): `ui.qr/image/...`, `crypto/solana`, `mesh.meet/info/channel/scan` marked `nil` on older firmware but always registered here (`lh_open_ui`, `lh_open_crypto`); store install gates (0.5.0 apps, 0.5.2 `rpc`, 1.0.0 `ble`) documented in `LUA_API.md:56-64` but no string checks in `lua_*.c`/`store_app.c` — Inferred server/store enforcement; `hosts` HTTP-time refusal is server-side (Inferred).
- **Permission/version mismatches:** none blocking — Verified (`ws`=`http` both sides; `mesh.meets` subtle callback-deny; `registry.c` is native apps only, not manifest perms; `os_api.*` is transport only).
- **Quests:** quest engine is server-side (`docs/QUESTS.md`; the badge server's side is not public); firmware surface is only `quest.report/active` (perm `quest`, often + `items`) and `grantApp`/`app`-step completion via `quest.report(event)` — Verified doc + `l_report`.
