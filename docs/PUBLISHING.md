# Publishing to the badge App Store

> How an app built with the kit gets into
> `https://solana.com/breakpoint/badge/apps`. Firmware `64a474b` (2.1.0).
> Labels: **Verified** (repo path:line or fetched page), **Inferred**, **Unknown**.

## The path in one paragraph

Build the folder (`main.lua` + `app.json` + files) -> self-check it against the
package rules below -> exercise it in **Try in emulator** and **Run on badge**
(which starts a 12 h **test run** of your draft's permissions/hosts) -> press
**Publish** (needs **linked X**) -> store compiles every `.lua`, runs the
**automatic check** (usually ~1 min) -> live, unless flagged for **organiser
review** (always required for award-cap changes) -> each later change is a **new
version** badges pull as an update. There is **no public store submit API or CLI
today** — submission is the **web form only** (Verified absent; see Automation).

## Prerequisites

| Requirement | Detail | Status |
|---|---|---|
| Account + linked X | Building/trying needs no X; **Publish and `http`/`ws`/`rpc` test runs need X linked** at `/profile` (`Link X at /profile to test http, ws and rpc before publishing`) | Verified — `docs/LUA_API.md:1987-1999,2018-2023,1076-1083` + `/apps/submit` fetch |
| Badge + card for hardware testing | microSD in badge; Solana OS ≥0.5.0 (≥0.5.2 for `rpc`, ≥1.0.0 for `ble`); Run-on-badge checks `info` first, `ble` needs 1.0.0 | Verified — `LUA_API.md:1994-2007` + manifest gates `56-64` |
| Ownership | Only the author's account can test/publish an app id that's taken | Verified — `LUA_API.md:2023-2030` |

## `app.json` rules (what the store and badge enforce)

Manifest as the badge stores it — Verified `docs/LUA_API.md:66-77`:

```json
{
  "id": "snake",
  "name": "Snake",
  "version": "1.0.0",
  "author": "@toly",
  "summary": "Eat, grow, don't bite yourself.",
  "icon": "play",
  "accent": "14F195",
  "category": "games",
  "permissions": ["lamps", "items", "http"],
  "hosts": ["api.example.com"],
  "files": 2,
  "filesSize": 5120,
  "temp": false,
  "expires": null,
  "code": {"luac": "5.5.1-sol.1", "sha256": "…", "size": 5692}
}
```

| Field | Rule | Status |
|---|---|---|
| `id` | `^[a-z0-9-]{3,24}$`, unique in store; doubles as `apps/<id>` path | Verified — `LUA_API.md:70`, `lua_pkg.h:64-68`, `lua_pkg.c:255-266` |
| `name` | ≤20 chars (launcher list) | Verified — `LUA_API.md:71`, `lua_pkg.h:46` |
| `version` | string ≤16 (`"1.0.0"`); **each publish = new version**; badges diff-update changed files only, keep `data.json` | Verified — `LUA_API.md:71`, `lua_pkg.h:47`, `lua_install.c` worker + `LUA_API.md:2018-2023` |
| `author` | ≤24 (`@handle`) | Verified — `LUA_API.md:73`, `lua_pkg.h:48` |
| `summary` | ≤80 | Verified — `LUA_API.md:74`, `lua_pkg.h:49` |
| `icon` | one of `play star heart bell gift home image list wifi shuffle eye edit charge gps settings audio bulb` (badge maps to LVGL glyphs) | Verified — `LUA_API.md:80`, `lua_pkg.c:224-240` |
| `accent` | hex colour, no `#` | Verified — `LUA_API.md:76` |
| `category` | `games \| tools \| social \| quests \| demos` | Verified — `LUA_API.md:77`, store `s_cats` in `store_app.c` |
| `permissions` | subset of `led wifi mesh ble lamps items profile quest http rpc` (10 bits; `ws` uses `http`) | Verified — `LUA_API.md:78`, `lua_pkg.c:20-35`, `lua_pkg.h:27-38` |
| `hosts` | only with `http` perm; ≤8 names, `*.example.com` = subdomains only (not apex), no IP/port/path; shown next to permission; server refuses others | Verified — `LUA_API.md:1040-1045`, `lua_pkg.h:112-118` |
| `files` / `filesSize` | store-filled; caps enforced twice: ≤64 files besides `main.lua`/`app.json`, each ≤256 KiB, ≤1 MiB total; paths lowercase `[a-z0-9_-.]` + `/`, ≤64 chars, ≤4 levels | Verified — `LUA_API.md:27`, `lua_pkg.h:19-23,64-74` |
| `main.lua` | UTF-8 ≤64 KiB, runs first | Verified — `LUA_API.md:12`, `LUA_PKG_SRC_MAX (64 KiB)` |
| `temp` / `expires` | quest-granted apps only (beacon grants are `main.lua`-only) | Verified — `LUA_API.md:27-30,77` + `QUESTS.md` quest-app flow |
| `code` | store's compiled `code.bin` (`luac 5.5.1-sol.1` + SHA + size); badge runs it XIP when label matches, else compiles source | Verified — `LUA_API.md:38-55`, `lua_code.c:1-20,57-77` |

OS-version install gates (Verified `LUA_API.md:56-64`): base ≥0.5.0; `rpc` ≥0.5.2; `ble` ≥1.0.0 — store details + buy/download refusals name the needed update.

## The store compile step

When you publish, the store compiles `main.lua` **and every bundled `.lua`** with the badge's own Lua (same vendored 5.5 sources, server-side via `tools/luac` WASM, label `LUA_SOLANA_LUAC`) and **refuses any version that doesn't compile**, naming file + line (`main.lua:12: 'end' expected near <eof>`) — Verified `LUA_API.md:38-42`, `tools/luac/luac.c:1-6,50-79`, `tools/luac/build.sh`. Badges download source + `code.bin` and run XIP from flash (heap peaks 15-25% lower; errors keep file+line but lose locals) — Verified `LUA_API.md:30-55`, `lua_code.c:57-77`. Drafts run from badge-compiled source (full messages) — Verified `LUA_API.md:44-47`.

Host reproduction measured here: vendored 5.5 parser via system `gcc` compiles a good file (`68 B -> 178 B chunk, strip=2`) and rejects a bad one with file:line — Verified, see `DEV_WORKFLOW.md`.

Lua 5.5 notes that fail publishes: `for` loop var is read-only; `global x` declares a global; no `string.dump`/`load`/`io/os/debug/package` — Verified `LUA_API.md:166-186`.

## Automatic check + organiser review

> The submit page's own words (Verified fetch of `/apps/submit`): *"An automatic check reads the code first, and it goes live in the store once that passes (usually within a minute; an organiser looks at anything it flags, and approves every change to the code, files, permissions or hosts of an app with an award cap)."*

Full text — Verified `LUA_API.md:2012-2023`:

- **Auto-check** reads the code for harmful patterns (taking !LAMPs by deception, asking for passwords, sending data away, hiding what they do). Pass -> live, usually within a minute.
- **Flagged** -> waits for an organiser; until then only the author sees the app (or the store keeps the previous version).
- **`lamps.award` apps** need a DevRel **allowance/cap** first (ask in the linked Telegram with app id, what awards !LAMPs, daily/player target; pages remind while `award` is called with none). **Every** later change to code/files/permissions/hosts of a capped app waits for an organiser; previous version + cap stay live meanwhile.
- Exact rule list / scanner source: not public (server-side).

## Versioning and limits

| Rule | Status |
|---|---|
| Each update = new version; badge offers it as update, downloads changed files only | Verified — `LUA_API.md:2018-2023`, `lua_install.c` worker |
| ≤25 apps per account (and per X account; organiser can raise) | Verified — `LUA_API.md:2018-2023` + `/apps/submit` fetch |
| 5 submits/min, 20 versions/day per account | Verified — `LUA_API.md:2018-2023` |
| Test runs: 12 h on that badge, draft perms/hosts, real !LAMPs/items, `award` capped by published allowance (none for unsubmitted); renewal re-arms with current draft; only the author of a taken id can test it | Verified — `LUA_API.md:2023-2030,1076-1083` |
| Once published, everyone's `http`/`ws`/`rpc` checks run against the **published** version's perms/hosts | Verified — `LUA_API.md:2018-2023` |

## Permissions and hosts review

- Request least privilege; `hosts` (with `http`) is shown to players next to the permission — Verified `LUA_API.md:1040-1045`.
- `lamps.spend/transfer/deposit` always pop an OS confirm dialog; `award` needs the cap above — Verified `LUA_API.md:929+`.
- Changing permissions/hosts in a new version re-enters review (and for capped apps, organiser approval) — Verified `LUA_API.md:2012-2023`.
- Published-version pinning means a permissive draft never widens what other badges enforce until published — Verified `LUA_API.md:1076-1084,2018-2023`.

## Quests / escrows / server keys (adjacent, same account)

- Quest apps: submit at `/apps/submit` like any app; organiser flips status for quest use; beacon grants are `main.lua`-only.
- Escrows at `/apps/escrows` (`ESC-…`, key shown once, rotation retires old); meets app key at `/apps/mine` (*Server key*, shown once) for the meets poll and signed-header verification.
- Never put secrets, keypairs, passwords, or API keys on the badge:
  `main.lua` is public, the card reads on any computer, badges change hands.
  Server keys (meets, escrow) stay on the server and are shown once — never in
  the app. `badge check` warns on secret-like literals.

## Can submission be automated?

**No public store submit API or CLI exists — web form only.** Evidence: `LUA_API.md` develop-and-publish describes only editor/drop + Try/Run + Publish button (Verified `1987-2023`); the `/apps/submit` page documents no API; the firmware's device API covers library/install/download (`lua_install.c`, `store_app.c`), not authoring; the store's auto-check rules are not public. `tools/export_*.ts` publish *firmware images* for flashing, not apps. Community `badgeapp.py` stops at on-badge verify + zip, not store upload (see `docs/GAPS.md`).

Kit implication: ship `badge check` (local compile + package + policy pre-check) and `badge publish --dry-run` now; keep a `badge publish` stub that opens the submit page with the validated folder pre-staged, and graduate it to a real uploader only if an official endpoint appears. Do not script password/X sessions.
