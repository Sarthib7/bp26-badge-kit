# Platform reference (for agents)

Pinned to `solana-os@64a474b` (2.1.0). Full evidence: `docs/OS_ARCHITECTURE.md`, `docs/LUA_API_INVENTORY.md`.

## Package

Folder: `main.lua` (UTF-8 ≤64 KiB, runs first), `app.json` (manifest), bundled
files (≤64 besides the two, each ≤256 KiB, ≤1 MiB total; lowercase
`[a-z0-9_-.]` segments, `/` separators, ≤64 chars, ≤4 levels). Store installs
to `/sdcard/hh/apps/<id>/` with compiled `code.bin` (label `5.5.1-sol.1`,
XIP from flash); drafts compile on-badge from source.

`app.json`: `id ^[a-z0-9-]{3,24}$`, `name` ≤20, `version` ≤16 (new version per
publish), `author` ≤24, `summary` ≤80, `icon` (16 names), `accent` 6 hex (no
`#`), `category` (games|tools|social|quests|demos), `permissions` (subset of
the 10), `hosts` (≤8, names only, `*.` = subdomains not apex, needs `http`).

## Sandbox limits

Heap 6 MiB (2.x; 96 KiB pre-2.0 shared with radio/TLS), 200k VM insns per
callback, 128 UI objects, label 200 B (12 KiB total), 8 timers ≥20 ms,
storage 16 KiB, `fs.read` ≤256 KiB, mesh 4×200 B/s + meets (1+1/s, 100 B/side,
300/day, 40 outbox), BLE 1 link ≤244 B, HTTP 60/min ≤2 KiB/≈3.5 KiB/6 s,
RPC 30/min (6 sends), WS 1 socket 4 KiB/msg 8 queued 20 opens/min. Crypto
costs: verify 40k, on_curve 5k, PDA 10k insns.

## Lifecycle

`on_key(key, rep)` (SELECT no repeat; CANCEL exits on false/nil; HOME always
exits), `on_tick(ms)` every 30 ms (50 ms pre-2.1), `on_mesh(from, msg)`,
`on_meet(from, data)->table|refuse`, `on_exit()`. Async server calls take
`cb(ok, result)` with `"offline"|"not linked"|"denied"|"busy"|"socket open"`.

## Permissions → APIs

`led wifi mesh lamps items profile quest http rpc ble`; `ws` uses `http`.
Enforced twice: module entry (Lua error) and async path (`cb(false,"denied")`).
Std lib is `base/coroutine/string/table/math/utf8` + `require` only; removed:
`io os debug package load/loadfile/dofile warn string.dump`
(`collectgarbage("count")` only). 5.5 changes: read-only `for` vars, `global`
declares a global.

## Version guards

`http` 0.4.6, `ws` 0.5.1, `rpc` 0.5.2 + `ui.qr` 0.5.3, `sys.keys` 0.5.11,
`ble`/`mesh.info` 1.0.0, `mesh.channel`/`mesh.scan` 1.1.0,
`crypto`/`solana`/`sys.memory` 2.0.0, `mesh.meet`/`pause`/`meets` 0.5.15.
Guard: `if ble then`, `if mesh.meet then`, `if crypto then`.
