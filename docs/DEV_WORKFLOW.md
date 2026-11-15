# Dev workflow today — Solana OS 2.1.0

> Firmware `64a474b` (2026-11-13). Labels: **Verified** (path:line / measured here), **Inferred**, **Unknown**.

## The official loop (no local toolchain required)

Verified — `docs/LUA_API.md:1987-1999`, `docs/CONNECTIVITY.md:306`:

1. Edit on `https://solana.com/breakpoint/badge/apps/submit` (folder/.zip drop; `app.json` fills the form).
2. **Try in emulator** (in-page WASM, every file on emulated card; `print()` + errors below).
3. **Run on badge** (Web Serial, desktop Chrome/Edge, USB; sends changed files only; live console).
4. Publish (see `PUBLISHING.md`).

## Firmware / site builds

| Command | What | Status |
|---|---|---|
| `source ~/.espressif/v6.0.1/esp-idf/export.sh; idf.py build; idf.py -p <port> -b 460800 flash` | Badge firmware (ESP-IDF v6.0.1) | Verified — `README.md:41-44` |
| `tools/build_web.sh` (firmware + site build) | `idf.py build` -> `export_web.ts` -> `emulator/build.sh` -> `luac/build.sh` | Verified — `tools/build_web.sh:1-21` |
| `brew install emscripten; ./emulator/build.sh` (`BUILD_DIR=` to move) -> `../web/static/emulator/solana-os.js+.wasm` | Browser emulator (Emscripten; needs configured `sdkconfig` + `managed_components/` from any `idf.py` build) | Verified — `emulator/build.sh:7-16`, `emulator/README.md:8-18`, `emulator/CMakeLists.txt:12-14` |
| `./tools/luac/build.sh <out.js>` (emscripten; parent uses `server/src/luac/solana-luac.js`) | Store Lua compiler WASM | Verified — `tools/luac/build.sh:1-25`, `tools/luac/luac.c:8-11` |
| `sh tools/gen_assets.sh` (needs parent `web/static/brand`) | Regen brand assets | Verified — `tools/gen_assets.sh:1-5` |

Checked-in WASM under `web/static/` means site work needs no Emscripten — Verified `emulator/README.md:19-20`. The badge site/server repos are separate from the firmware repo.

## Emulator architecture

Same sources both builds: `main/sources.cmake` -> `SOLANA_OS_SRCS` compiled unchanged — Verified `emulator/README.md:25-26`, `emulator/CMakeLists.txt:29-32`. Each `SOLANA_OS_DEVICE_SRCS`/BSP `.c` maps to `emulator/platform/<stem>_emu.c`; `shim/` = ESP-IDF/FreeRTOS/driver headers (29), `platform/` = implementations + device counterparts — Verified `emulator/CMakeLists.txt:34-47`, `emulator/platform/` listing. Runtime: Asyncify fibers, `emscripten_sleep`, LVGL timer; page API `emu_console`, `emu_buttons_set`, `emu_framebuffer`, ... — Verified `emulator/README.md:131-148`. Radio: `BroadcastChannel` between same-origin tabs (mesh) / tabs (BLE); console has no UART stream (`console_stream_read` = -1), page uses MEMFS — Verified `os_radio_emu.c`, `os_ble_emu.c`, `platform/console_emu.c:54-57`, `emulator/README.md:48`. NVS = localStorage (`solana-os-emu:nvs`, `?badge=n` separate MAC/NVS) — Verified `emulator/platform/esp_emu.c`, site `/emulator` page.

Two-tab testing: `/emulator` + `/emulator?badge=2`, Wi-Fi on once per tab for server IDs, keep both tabs visible (background throttle ~1 Hz), `mesh status/peers/log`, bridge panel, beacon QR — Verified `emulator/README.md:64-78` + site fetch.

## `tools/badge.py` console driver + screenshots

Verified — `tools/badge.py:4-6,16-17,23-25,85-89`, `main/core/os.c:591+`, `main/core/console.c:395`:

```sh
pip install pyserial pillow
python3 tools/badge.py --port /dev/ttyUSB0 "open wifi" "key down" "shot"
python3 tools/badge.py --reset --out shots/ "shot"
```

Transport 115200 8-N-1, `DTR/RTS=false` unless `--reset`; each arg = one console line (`\r\n`), optional `sleep N`; after non-`shot`, read 30 s until 8 idle 0.1 s polls. Boot sync: `ESP-ROM`/`rst:` -> wait `console ready` 20 s + 1.5 s. Screenshot protocol: `SHOT-BEGIN <w> <h>` / `SHOT <x> <y> <n> <base64_rgb565>` / `SHOT-END`, decoded to PNG via Pillow. Built-ins: `info sd ls cat rgb apps open key wifi server cloud shot heap reboot` + all `os_cmd` (`lua mesh ble bridge ota beacon quest trade xdex`) — Verified `console.c:368-392`.

## `lua put` / `recv` serial protocol

Implemented `main/lua/lua_cmd.c:1-7` (shared badge UART + emulator `emu_console`; recv disabled on emulator — Verified `platform/console_emu.c:54-57`):

```
lua list | run <id> | rm <id> [file] | mem | sums <id> | install <id>
lua put <id> <file> begin|<base64>|end
lua recv <id> <file> <bytes> <sha256_hex64>
```

`<file>` = `main.lua`, `app.json`, or bundled path (`lib/quiz.lua`) — Verified `lua_cmd.c:476-497`, `LUA_API.md:2038-2050`.

- **`lua put`** (line-oriented): `begin` creates `<path>.put`; each `lua put <id> <file> <base64>` appends a decode (≤128 b64 chars/line per docs; 96 B decode buffer in C); `end` validates (`app.json` parse) and renames `.put` -> final, deleting store `code.bin` — Verified `lua_cmd.c:190-248`, `LUA_API.md:2041-2042`.
- **`lua recv`** (fast, host tools): host sends `lua recv <id> <file> <bytes> <sha256>`; badge `recv: ready 2048`; host streams next 2048 b64 chars (whitespace stripped), badge decodes+hashes+writes; `recv: more 2048` until done; `recv: ok <bytes>` or `recv: error <why>` (5 s/block timeout `RECV_WAIT_MS`, `RECV_BLOCK=2048`) — Verified `lua_cmd.c:34-35,270-293,325-341,370-386`, `console.c:348-354`. UART stream via `console_stream_read()`, not REPL stdin.
- **`lua sums`**: `<sha256> <bytes> <file>` per file + `sums: N files` (0 if absent) for delta upload; Run-on-badge uses sums+recv — Verified `lua_cmd.c:389-459`, `LUA_API.md:2048-2050`.
- Refusals (no SD, app running, store installing, bad id/path): shared `refusal()` — Verified `lua_cmd.c:37-48`.

## `luac` and Run-on-badge

Store compiles with badge-matching Lua 5.5 (`luac_label()` = `5.5.1-sol.1`, dump strip 2, WASM API `luac_compile/luac_out/luac_error`) — Verified `tools/luac/luac.c:1-6,50-79`. Authors normally never run it (store compiles on publish) — Verified `LUA_API.md` compiled-by-store section. Web Serial Run-on-badge: `/apps/submit` signed in, `lua sums` -> `lua recv` changed files -> `lua run`; live console + `print()`; needs microSD + ≥0.5.0 (≥1.0.0 for `ble`); 12 h test run for `http/ws/rpc` — Verified `LUA_API.md:1994-2007`, `CHANGELOG` refs, `export_lib.ts:2-3` (stock flasher = Web Serial).

## Testing story

| Layer | What exists | Status |
|---|---|---|
| Firmware integration | `main/lua/tests/t-*` apps (ble, mesh, heap, crypto...), manual on badge/emulator; CHANGELOG cites pass counts | Verified — `emulator/README.md:124-127`, `CHANGELOG` |
| Host crypto/PNG | `main/lua/tests/crypto/ed25519_test.py`, `png/png_test.py` | Verified paths |
| Example mock | `docs/examples/squads-pager/test.lua` (`lua test.lua` with mocked RPC) | Verified — `README.md:11-13` |
| HW automation | `tools/badge.py` console + screenshots | Verified above |
| Community | `cesp99/badge-app-skill` `badgeapp.py`/`verify.py` (push/verify) | Verified via search (see GAPS) |
| In-repo unit runner (`pytest`/`ctest` for `t-*`) | none found | Unknown — no driver in the firmware sources |

Memory probes: `lua mem` (last run peak heap + insns + store-vs-source) and `heap` (SRAM then PSRAM) on console; `sys.memory()` in-app — Verified `LUA_API.md` console + limits.

## CI / headless verdict

| Question | Verdict |
|---|---|
| `.github/workflows` in `solana-os` clone | Verified absent (glob 0 files) |
| Emulator runnable headless here | No harness in repo (needs browser/JS host; no Playwright script here) — Inferred |
| `badge.py` in CI | Possible with USB hardware; not defined in the firmware repo — Inferred |
| Emscripten build in CI | Technically batch-friendly (`emcmake` + `cmake --build`); no workflow Verified in firmware repo |
| Site/server CI | Not in the firmware repo (separate repos, not inspected) |

## Build feasibility (measured Nov 15 2026, Linux host with gcc)

- **Emulator: NOT attempted** — prerequisites missing: no `emcc`, no configured `sdkconfig`/`managed_components/` (needs ESP-IDF v6.0.1 `idf.py build`), no `idf.py`. The emulator needs the full ESP-IDF + Emscripten toolchain.
- **`luac`-equivalent: BUILT AND RAN (Verified, measured).** Native host harness `host_luac.c` compiled with the system C compiler against the vendored Lua 5.5 sources plus `luaconf.h` hooks. Good file (68 src bytes) -> `COMPILE OK: 68 src bytes -> 178 chunk bytes (strip=2)`; bad file rejected with file:line. This proves the store's compile gate (same parser, same `t` mode, same strip) is reproducible on the host; the shipped WASM (`tools/luac/build.sh`, needs `emcc`) was not rebuilt here.
