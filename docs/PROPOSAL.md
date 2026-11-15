# Badge Kit proposal — what to build after this research

> Goal: developers go **build -> test -> publish to the App Store** with as little friction as the platform allows.
> Firmware ground truth: `solana-os` `64a474b` (2.1.0). This proposal builds on `HARDWARE.md`, `OS_ARCHITECTURE.md`, `LUA_API_INVENTORY.md`, `NETWORKING.md`, `DEV_WORKFLOW.md`, `GAPS.md`, `PUBLISHING.md`.

## Recommended kit MVP (physical badge required for the starred items)

Ship one thing that earns trust: a **skill + CLI + stubs + two libraries**, with publishing first-class from day one.

1. **Agent skill (`SKILL.md`)** — teaches coding agents the platform: no-NFC ESP-NOW reality, one-radio rules, permission/hosts model, package caps, 5.5 pitfalls, test-run + publish flow, meet/server-trust rules. Points at the inventory docs as reference.
2. **CLI (`badge`)** — `new / check / dev / push / logs / shot / publish`:
   - `new --template lobby|leaderboard|ble-gadget|ws-room|quest-app` (validated `app.json` + versioned starter)
   - `check` = local `luac`-equivalent compile (vendored 5.5, same `t` mode + strip) + package validator (`id` regex, hosts ≤8, files 64x256 KiB/1 MiB, perms) + policy pre-check (auto-check heuristics, `ws`+`http` warning, version-guard linter)
   - `dev` = host-side Lua run with a **Lua API mock** (ui/timer/storage/fs/json + scripted mesh/http) for logic tests
   - `push` = `lua sums` -> `lua recv` delta sideload over serial (*) + `logs` tail + `shot` PNG
   - `publish` = `publish --dry-run` (check + bundle report) now; real upload later if/when an official endpoint exists (today: opens `/apps/submit` with the validated folder staged)
3. **LuaLS type stubs** (`badge.d.lua` generated from `LUA_API_INVENTORY.md`) — autocomplete + min-OS diagnostics (`if ble/mesh.meet/crypto then`).
4. **Libraries:**
   - `lobby` — host/join over mesh (`nearby` + `send("*")` heartbeats, join/ack, optional `mesh.channel` move, bridge-tolerant)
   - `sync` — reliable state sync over lossy mesh (seq + ack + resend, state-not-events, pause-aware server flush)
   - leaderboard-via-`meet`+`http` recipe (meets poll -> server table -> `http.get`/`ws` push) since **no server leaderboard exists** (Verified absent).
5. **Publishing lane** — an app's definition of done is *live in the store*: X-link gating, test-run discipline (12 h, draft perms/hosts), versioning (new version per change), award-cap path if `lamps.award` is used. Documented in `PUBLISHING.md`; enforced by `check`.

Deferred after MVP: MCP server (drive badge/emulator), headless/CI emulator harness, multi-badge mesh simulator, screenshot-diff CI.

## Phased plan

- **Phase 0 — groundwork (this repo, done):** 8 research docs + publishing doc; inventory tables are the spec for stubs/lints.
- **Phase 1 — MVP (no badge needed except `push/logs/shot` *):** SKILL.md + `badge new/check/dev` + LuaLS stubs + `lobby`/`sync` libs + `publish --dry-run`; a first multiplayer game built against mocks + emulator tabs.
- **Phase 2 — hardware-in-loop (*):** `push/logs/shot` over serial (`put/recv/sums`), `lua mem`/`heap` budget checks, two-badge mesh + bridge validation, `ble` gadget/phone pass.
- **Phase 3 — publish:** submit that first game via the web form with `check` clean; version/update drill; award-cap request if needed; record the run as the kit's golden path.
- **Phase 4 — scale (needs official support or owner access):** real `publish` uploader, MCP server, headless emulator CI, mesh simulator; upstream `badgeapp.py` collaboration rather than duplication.

## What needs a physical badge

- Serial sideload/logs/screenshots, `ble` gadget/phone, two-badge radio mesh, 5 GHz channel behavior, battery/OTA, final pre-publish hardware pass. Everything else (compile, lint, mocks, emulator tabs, bridge between tabs, docs) works without one.

## Alternatives considered

- (a) Skill only — cheapest but leaves the serial/mock/lint pain untouched; rejected as sole deliverable.
- (d)/(e) Libraries-only or MCP-first — high value but premature without `check` + stubs; sequenced after MVP.
- (f) Full simulator — biggest build, least certain payoff before the first game ships; deferred.
- Community reuse: collaborate with / wrap `cesp99/badge-app-skill` (`badgeapp.py`/`verify.py`) rather than forking the dev loop; displace stale `solanadefcon.com/os` with kit docs.

## Success criteria for a first kit-built game

`badge check` clean -> emulator two-tab play -> hardware two-badge play (radio + bridge) -> `publish --dry-run` clean -> store live -> update (new version, changed-files-only) verified on badge.
