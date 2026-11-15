# Hardware inventory — Breakpoint 2026 badge (Solana OS)

> Scope: read-only audit of `solana-foundation/solana-os` at commit `64a474b` (2026-11-13, release 2.1.0).
> Read-only audit of `solana-foundation/solana-os@64a474b` (release 2.1.0).
> Every claim is labeled **Verified** (file:line or measured), **Inferred**, or **Unknown**.

## Verdict up front

- **No NFC hardware.** No NFC chip, antenna, driver, pin, or NDEF/RFID reference anywhere in firmware outside Lua vendor headers (false-positive `undefined` matches). Verified by repo-wide grep (exit 1, no matches).
- The "press a button when near" flow is **ESP-NOW radio proximity + intentional button press** in X Dex / Trade / Lua `mesh.meet`, with a server **bridge** fallback when out of radio range.
- Platform is a **single-radio ESP32-C5HR8** (8 MB PSRAM, 16 MB flash): SPI ILI9341 display, SPI microSD, I2C button expander + BOOT, 8x WS2812B strip, ADC battery sense, UART console. No IMU, touch, camera, IR, buzzer, or fuel gauge in firmware.

## MCU, memory, partitions

| Item | Value | Status / evidence |
|---|---|---|
| MCU target | ESP32-C5 (`esp32c5`) | Verified — `sdkconfig.defaults:1`, `components/bsp/include/board.h:3-5` |
| Production chip | ESP32-C5HR8 (package PSRAM) | Verified — `main/core/os_mem.h:5-6`, `README.md:3-4` |
| PSRAM | 8 MB quad on MSPI | Verified — `sdkconfig.defaults:31-44`, `os_mem.h:5-8` |
| Flash | 16 MB QIO, custom partitions | Verified — `sdkconfig.defaults:2-5`, `partitions.csv:1-10` |
| Internal storage partition | `0x7E0000` FAT-typed raw partition for XIP Lua bytecode | Verified — `partitions.csv:8-10` |

## Screen

| Item | Value | Status / evidence |
|---|---|---|
| Controller | ILI9341 | Verified — `board.h:17`, `bsp_display.c:9,175` |
| Resolution | 320x240 landscape (after rotation), app area 320x218 (`ui.W/H`) | Verified — `board.h:22-23`, `bsp_display.c:197-198` |
| Bus | SPI2 shared with microSD, 40 MHz panel clock | Verified — `board.h:12-15,27`, `bsp_display.c:161` |
| Pins | CS=6, DC=7, RST=0, BL=3 (LEDC PWM ~5 kHz 10-bit); SPI SCK/MOSI/MISO=9/10/8 | Verified — `board.h:12-21`, `bsp_display.c:91-133,125-131,157-165` |
| Arbitration | Shared SPI2 bus lock via `bsp_lcd_hold` | Verified — `bsp_bus.h:3-11`, `bsp_sd.c:129-137` |

## Buttons (including BOOT on the back)

| Physical | Hardware | Active | Bit/mask | Status / evidence |
|---|---|---|---|---|
| PB1-PB6 | TCA9534 I2C expander P0-P5 @0x20 | low | `BSP_BTN_PB(1..6)` | Verified — `board.h:32-38`, `bsp.h:58-59`, `bsp_buttons.c:36-37` |
| BOOT | GPIO28 (strap, pull-up), on the back | low | `BSP_BTN_BOOT` (1<<6) | Verified — `board.h:40-41`, `bsp.h:59`, `bsp_buttons.c:37-38` |
| I2C bus | SCL=23, SDA=24, INT=25 | — | — | Verified — `board.h:33-37`, `bsp_buttons.c:62-69,81-90` |

Default logical map (silkscreen; PB1-PB6 remappable in NVS, HOME stays on BOOT):

| Logical key | Default bit | UI role | Status / evidence |
|---|---|---|---|
| UP | PB1 | D-pad | Verified — `main/core/os_keys.h:4-5,25` |
| LEFT | PB2 | D-pad | Verified — `os_keys.h:26` |
| RIGHT | PB3 | D-pad | Verified — `os_keys.h:27` |
| DOWN | PB4 | D-pad | Verified — `os_keys.h:28` |
| SELECT | PB5 | Confirm / invite / sign | Verified — `os_keys.h:29` (+ `xdex_app.c:429,525-535`, `trade_app.c:144-147,468,824-826`) |
| BACK (CANCEL) | PB6 | Back / decline | Verified — `os_keys.h:5-6,30` |
| HOME | BOOT | Launcher home | Verified — `os_keys.h:6,16,31`; hint `"SELECT open   BOOT home"` in `launcher.c:142` |

Usage: launcher D-pad + SELECT opens, BOOT homes (`launcher.c:142,149-158`, `os.c:438-448`); HW Debug visualizes raw lines, SELECT recalibrates (`debug_app.c:70-72,97`); `info` dumps pin map + button bitmask (`console.c:35-44`); calibration blob in NVS `input/map` (`os.c` init path, `calibrate.c:1-2,9`).

## LEDs

| Type | Count / interface | GPIO | Status / evidence |
|---|---|---|---|
| Status RGB | 8x WS2812B addressable (GRB), RMT 10 MHz | 27 | Verified — `board.h:43-45`, `bsp_rgb.c:17-24` (`led.count == 8`: `1-6` top, `7-8` right edge per Lua docs) |
| LCD backlight | LEDC PWM ~5 kHz 10-bit | 3 | Verified — `board.h:21`, `bsp_display.c:91-133` |

No discrete non-addressable LED GPIOs (verified — only `bsp_rgb.c` + BL PWM).

## Battery and storage

| Item | Value | Status / evidence |
|---|---|---|
| Battery sense | ADC1 GPIO1, 1:1 divider, 8-sample avg; 3.30-4.15 V linear Li-ion percent | Verified — `board.h:47-49`, `bsp_battery.c:16-57` |
| Fuel gauge (MAX170xx etc.) | None — voltage only | Verified — grep `MAX170|fuel gauge` = no matches; no I2C fuel IC in `board.h` |
| Charger/PMIC | Not modeled in BSP | Unknown — no driver; OTA only gates on voltage % (`os_ota.c:130,211`) |
| microSD | SDSPI (`esp_vfs_fat_sdspi_mount`), CS GPIO4, shared SPI2 | Verified — `board.h:10-15,29-30`, `bsp_sd.c:6-9,224-237` |
| SDMMC host | Absent (all "SDMMC" hits are SD-SPI opcode internals) | Verified — `rg SDMMC` only inside `bsp_sd.c` stack |
| Data root | `/sdcard/hh/` (`OS_DATA_DIR`) | Verified — `os_data.h:14` |

## Radio: the one radio everything shares

| Item | Value | Status / evidence |
|---|---|---|
| Wi-Fi | Wi-Fi 6 STA 2.4/5 GHz | Verified — `about_app.c:43-44`, `os_radio.c:1-4,49-51`, `README.md:4-5` |
| Mesh transport | ESP-NOW on STA (`esp_now`, unencrypted), ≤250 B frames | Verified — `os_radio.h:14`, `os_radio.c` |
| Bluetooth | NimBLE, one link, no pairing/bonds, Lua-gated | Verified — `sdkconfig.defaults:95-130`, `os_ble.h:5-6` |
| Single-radio sharing | Wi-Fi (either band) + ESP-NOW share the channel; BLE takes turns | Verified — `docs/CONNECTIVITY.md:148-211`, `os_mesh.h:148-153` |

UART console: UART0 TX=11 RX=12 (CH340C comment) at 115200 8-N-1 — Verified `board.h:51-53`, `console.c:35-41`, `tools/badge.py:22-25`.

## Absent hardware (all verified absent by scoped grep)

| Peripheral | Result | Evidence |
|---|---|---|
| NFC / RFID / 13.56 MHz front-end (PN532, PN7150, ST25, RC522, MFRC, ISO14443/15693, NDEF) | **None in firmware** | `rg -i '\bNFC\b|\bPN532\b|\bPN7150\b|\bST25\b|\bRC522\b|\bMFRC\b|ISO14443|ISO15693|\bNDEF\b|\bRFID\b'` exit 1, no matches (excl. `main/lua/vendor/**`; Lua upstream `undefined` hits are false positives) |
| Accelerometer / gyro / IMU (MPU, LIS3) | None | `rg accelerometer|MPU|LIS3|gyro` no matches |
| Capacitive touch | None (buttons only) | No touch driver in `components/bsp/` |
| Camera (OV2640 etc.) | None | `rg ov2640` no matches; "camera" only in emulator/bridge docs |
| IR transceiver | None | `rg infrared|\bIR trans` no matches (`IRAM_ATTR` in `bsp_buttons.c:23` is ISR attribute) |
| Buzzer / vibration motor | None on-board | Only `docs/examples/ble-button-box/README.md:4` (external idea) |

## NFC verdict and what "press a button when near" really is

**NFC: Verified absent.** There is no NFC chip, antenna, driver, or pin assignment in this firmware tree. Do not design the kit around tap-to-pair NFC.

What the "press a button when in range" flow is **radio proximity (ESP-NOW HELLO + RSSI-ordered peer table) plus an intentional button press** in X Dex / Trade / Lua `mesh.meet` — with a **server bridge** fallback when badges cannot hear each other. End to end:

1. **Discovery.** Mesh task broadcasts HELLO ~every 1.5 s (+ jitter) on the mesh Wi-Fi channel — Verified `os_mesh.c:50,1105-1128`. HELLO JSON: `{"k":"b","n":<owner label>,"lv":<level>}` — Verified `os_mesh.c:1119-1126`.
2. **Presence.** Peers expire 30 s after last HELLO (`OS_MESH_PEER_TTL_MS`) — Verified `os_mesh.h:29`, `os_mesh.c:365-367`. `os_mesh_peers()` returns live peers strongest-RSSI first — Verified `os_mesh.c:417-434`.
3. **Signal display (not a gate).** UI bars: >=-55 dBm 4 bars, >=-67 3, >=-78 2, else 1 — Verified `game.c:269-271`. ESP-NOW scanner colors -60/-80 — Verified `espnow_app.c:345-346,373-374`. **No fixed RSSI cutoff** in `xdex_request` / `trade_invite_peer` — they only require `os_mesh_peer(id)` to succeed — Verified `xdex.c:468-469`, `trade.c:886-887`.
4. **Wire format.** Max 250 B frames (`OS_RADIO_FRAME_MAX` — Verified `os_radio.h:14`); 16 B header (magic `HG`, ver 1, type, 6-char src id, msg/frag ids, total len), payloads up to 232 B/frag x up to 8 frags, JSON ≤ 1600 B — Verified `os_mesh.c:39-41,1041-1053,1425-1460`, `os_mesh.h:28`. Types: HELLO=1, XDEX=2, TRADE=3, RELAY=4, RELAY_RESP=5, APP=6 — Verified `os_mesh.h:32-39`.
5. **X Dex swap** (B=requester, A=accepter) — Verified `xdex.c:1-11,408-528`: B SELECTs peer in Nearby -> `xdex_request()` (nonce + card); A SELECT accepts -> `xdex_accept()` with `tag = HMAC(mesh_key, "xdex|A|B|nB")` + card; B `ok` signs `xdex|B|A|nA`, sends `fin`; both store cards and POST `/api/device/xdex` with peer's tag. Resend 4000 ms, pending 60 s — Verified `xdex.c:27-28`, `xdex.h:16`.
6. **Trade** — Verified `trade.c:1-13,880-903,484-509`: inviter SELECTs Nearby -> `invite` + trade id; joiner SELECT joins; both exchange `offer`/`lock` (RESEND 3000 ms); inviter SELECT signs canonical `terms` + `tag_a = HMAC(...,"trade|inviter|terms")`; joiner verifies, `sign`, record + POST `/api/device/trades` — Verified `trade.c:386-418`, `trade.h:7-8`. Invite wait 30 s, TTL 60 s — Verified `trade.h:21`.
7. **Lua `mesh.meet`** — same req/ok/fin shape: `meet|<me>|<app>|<req>|<acc>|<nr>|<na>|<tr>|<ta>|<v>|<len dr>|<dr>|<len da>|<da>` — Verified `lua_meet.c:7-9,107-118,175-179`. Upload `POST /api/device/apps/<app>/meet` with counterparty tag — Verified `lua_meet.c:175-179,431-432`. Resend 1500 ms, wait 12 s — Verified `lua_meet.c:27-28`.
8. **Bridge (out of RF range).** Rotating QR/short `bridge|id|window` HMAC code — Verified `os_bridge.h:3-10,36-42`, `os_bridge.c:160-164`. Bridged peers show `rssi=0, bridged=true` — Verified `os_mesh.h:57-59`. Link is typed/scanned, still confirmed with buttons.
9. **Beacons/quests** use mesh RELAY + beacon scan keys, not badge-to-badge swap — Verified `quests.c`, `beacon.c` refs. Badge-as-beacon pairs over HTTPS — Verified `beacon.c:688-815`.

## Crypto and server verification

| Item | Value | Status |
|---|---|---|
| Mesh tag crypto | HMAC-SHA256 over 16-byte mesh key -> 16 hex chars (8 bytes) | Verified — `os_mesh.c:181,309-330`, `os_mesh.h:30,143-145` |
| Mesh key source | Server-provisioned, NVS `cloud/key` | Verified — `os_cloud.c:851-859,10`, `os_cloud.h:63` |
| ed25519 on badge | **Verify-only** for Lua/Solana (`lua_crypto.c`); not used for mesh tags | Verified — `ed25519.h:3-6,17-24` |
| Server verification | Recomputes HMAC on canonical strings (`xdex\|...`, `trade\|...`, `meet\|...`, `bridge\|...`); checks counterparty tag on upload | Verified (device side) — `xdex.c:7-8,254-264`, `trade.c:486-488`, `lua_meet.c:431-432`, `docs/LUA_API.md:579-591`; full server rules are not public) |
| X Dex upload body | `{entries:[{peer, nonce, tag, card}]}` | Verified — `xdex.c:254-265` |
| Wi-Fi weak-AP join gate | `PIN_MIN_RSSI -80 dBm` (Wi-Fi app, not mesh pairing) | Verified — `os_wifi.c:29,171-172` |
| Mesh ready | On mesh channel or bridge open, has 6-char id + mesh key | Verified — `os_mesh.c:529-531`, `os_mesh.h:64-65` |
| Signing eligibility | Claimed id + `os_mesh_ready()` | Verified — `game.c:210-213` |

## What the kit must assume

- One radio, one channel at a time; a `mesh` app steals the radio from Wi-Fi joined on another channel (pausable). Design multiplayer and server sync around `mesh.pause()`/`resume()` and `mesh.info().online`.
- 250 B ESP-NOW frames, 200 B JSON Lua messages at 4/s, lossy and unordered (bridged: ~1-3 s, still lossy). Send state, repeat until acked.
- No NFC, no IMU/touch/camera/IR/buzzer to build on. Presence = HELLO + RSSI sort; consent = SELECT; trust = HMAC + server check.
