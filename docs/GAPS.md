# Gaps and pain points — building badge apps today

> Firmware `64a474b` (2.1.0). Labels: **Verified** (path:line / URL), **Inferred**, **Unknown**.
> Community search run Nov 15 2026 via GitHub + web (see table).

## Pain ladder (highest cost first)

1. **No local CLI.** Everything before publish is browser-or-serial only: in-page editor/serial sideload (`LUA_API.md:1987-2007` — Verified), `tools/badge.py` raw console driver (Verified `tools/badge.py`), `lua put/recv/sums` hand protocol (Verified `lua_cmd.c`). No `badge new/run/test/publish` command, no project scaffolding, no delta-push wrapper, no log tailing. Writing `badgeapp`-style scripts is left to each dev.
2. **No types or autocomplete.** Zero LuaLS annotations / `@meta` stubs in repo (Verified absent by search); `LUA_API.md` is prose + snippets only. Misspelled `mesh.meets` vs `mesh.meet`, `ws` perm = `http`, 1.1.0-gated `mesh.channel/scan` are runtime/`nil` surprises (Verified inventory).
3. **No test harness.** `t-*` integration apps are manual on badge/emulator (Verified `emulator/README.md:124-127`); only host checks are `ed25519_test.py`/`png_test.py` (Verified paths); no `pytest`/`ctest` driver (Unknown/absent); no headless emulator harness in repo (Verified absent). Mesh/BLE/timing bugs reproduce only with two tabs or two badges.
4. **No templates.** Examples are drop-on-submit folders (`docs/examples/*` — Verified `CONNECTIVITY.md:328`), but no `new --template lobby|leaderboard|ble-gadget|ws-room` starter, no `app.json` generator/validator matching `lua_pkg` rules (`^[a-z0-9-]{3,24}$`, hosts ≤8, files 64x256 KiB/1 MiB — Verified `lua_pkg.h/c`).
5. **Docs drift risk.** `LUA_API.md` is the contract but version-skew notes (`nil` below X, install gates) have no C `#if` counterpart in the firmware (inferred server/store enforcement); the badge server's full meet/upload/escrow contracts are not public, so those flows are documented from device-side code only.
6. **Single-radio gotchas are easy to miss.** `mesh` steals Wi-Fi off-channel; `ws` blocks all other server calls (`socket open`); paused scans end silently; 200 B/4 Hz lossy mesh needs state-sync discipline — all Verified but scattered across `CONNECTIVITY.md` + `LUA_API.md`. No lint warns when an app mixes `ws` + `http` or forgets `pause/resume`.
7. **Publishing is web-form only.** No store API/CLI found (see `PUBLISHING.md`); limits (25 apps/account+X, 5 submits/min, 20 versions/day), award-cap organiser gate, and host/permission review are manual steps. No `publish --dry-run` (compile + auto-check simulation) exists.
8. **Debugging is thin.** `print()` + console + `lua mem`/`heap` + screenshots only (Verified); no breakpoints, no coverage, no replay of mesh traces, no screenshot diff in CI.

## Missing pieces checklist

- [ ] Local CLI (`new/dev/push/logs/shot/check/publish`)
- [ ] LuaLS type stubs + `app.json` schema validation
- [ ] Headless emulator/CI harness + mesh multi-badge simulator
- [ ] `lua` API mock for host-side unit tests
- [ ] Project templates (lobby, leaderboard, ble-gadget, ws-room, quest-app)
- [ ] Pre-publish checker (compile + hosts/perms + size + auto-check rules)
- [ ] MCP/server for AI agents to drive badge or emulator
- [ ] Version-matrix linter (`if ble/mesh.info/mesh.meet/crypto then` guards)

## Existing community tooling (do not duplicate blindly)

| Name | URL | What | Freshness | Overlap with a future kit |
|---|---|---|---|---|
| solana-foundation/solana-os | https://github.com/solana-foundation/solana-os | Official firmware, emulator, `badge.py`, `luac`, docs | Updated ~Nov 15 2026; 6 stars (Verified via API) | Canonical SDK — kit wraps, never replaces |
| cesp99/badge-app-skill | https://github.com/cesp99/badge-app-skill | Claude skill + `badgeapp.py`/`verify.py` (new, check, push, dev `--watch`, zip, on-badge verify) | Nov 13 2026; 1 star | **High** — CLI dev loop the kit would mirror; reuse or collaborate |
| solanabr/superteam-os | https://github.com/solanabr/superteam-os | Branded fork (fonts/boot), same APIs | Nov 13 2026; 1 star | Low — branding fork |
| BerKai97/homemade-solana-badge | https://github.com/BerKai97/homemade-solana-badge | Patched OS + `badge_put.py`, `badge_remote.py`, wallet/RPC extensions | Nov 13 2026; 0 stars | Medium — overlaps push/remote tooling |
| andrzejsantocki/met-badge | https://github.com/andrzejsantocki/met-badge | Sample Lua app + emulator demo | Nov 10 2026; 0 stars | Low — app example |
| solanadefcon.com/os | https://solanadefcon.com/os/ | Third-party "badge global" doc (Lua 5.4, `badge.gfx` model) | Stale (Inferred) | **Confusion risk** — contradicts real `ui/sys` API; kit docs must displace it |
| Solana Developer MCP | https://mcp.solana.com/ | Solana docs + program autofixer | Live 2026 | None — not badge-specific |
| solana-foundation/solana-mcp-official | https://github.com/solana-foundation/solana-mcp-official | MCP server source | Active | None for badge Lua |
| LuaLS / `@meta` stubs in `solana-os` | — | **None found** (Verified absent) | — | Gap the kit should fill |
| Badge-specific MCP | — | **None found** (Verified via search) | — | Open niche for kit |

Public site facts used: `/apps/docs` = rendered `LUA_API.md` (Verified fetch); `/apps/submit` = folder/zip upload + auto-check, X to publish, 25 apps / 20 versions/day (Verified fetch + `LUA_API.md:2018-2023`); `/emulator` = same-WASM firmware, demo Wi-Fi, cross-tab mesh/BLE, bridge + beacon QR (Verified fetch + `emulator/README.md:64-78`).
