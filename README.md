# BP26 Badge Kit

Developer kit for Breakpoint 2026 Solana OS badge apps — scaffold, check,
test, and publish to the badge App Store. Pinned to `solana-os@64a474b`
(release 2.1.0); every API name, limit, and permission matches the audited
Lua API (`docs/LUA_API_INVENTORY.md`).

## Quickstart (5 commands)

```sh
git clone https://github.com/Sarthib7/bp26-badge-kit && cd bp26-badge-kit && npm install
node bin/badge new my-game --template mesh-multiplayer
node bin/badge check my-game
npm test
node bin/badge publish --dry-run my-game
```

Then submit the folder manually at
`https://solana.com/breakpoint/badge/apps/submit` (Publish needs an X-linked
account; there is no store upload API — `badge publish` without `--dry-run`
refuses rather than faking it).

Want `check` and the Lua test suite to use the badge's own Lua 5.5? Build it
once (needs git and a C compiler; fetches solana-os at the pinned commit into
`../solana-os`):

```sh
npm run setup:lua55
```

Without it, `check` falls back to a system Lua (`LUA_BIN=$(which lua)`) and
then to a heuristic scan, and always says which engine it used. The store's
own compile stays authoritative.

End-to-end from a fresh clone (new apps from both templates, check, dev,
publish dry-run, no-device hardware commands, example server, full test
suite on Lua 5.5): `npm run e2e`.

## What is in here

| Path | What |
|---|---|
| `bin/badge` (+ `lib/`) | `new / check / dev / push / logs / shot / publish --dry-run` (zero-dep Node) |
| `templates/` | `blank`, `mesh-multiplayer` starters |
| `types/badge.d.lua` + `.luarc.json` | LuaLS stubs for the full sandbox API |
| `libs/` | `lobby.lua` (host/join rooms), `sync.lua` (acked state sync) — badge-includable |
| `tests/` | Lossy mesh sim (`net_sim.lua`) + Lua suite (`run.lua`, 24 tests) |
| `test/` | `npm test`: CLI, serial, Lua-suite and example-server tests (38 total) |
| `examples/mesh-demo/` | Kit-built mesh demo; passes `badge check` |
| `recipes/leaderboard-meets.md` | Signed-meets leaderboard recipe |
| `server/meet-board/` | Tiny example leaderboard server (example-grade, not production) |
| `skill/` | Agent skill (`SKILL.md` + references) for coding agents |
| `tools/host_luac/`, `tools/host_lua55/` | Badge's own Lua 5.5 as a host syntax checker and interpreter (`npm run setup:lua55`) |
| `scripts/` | `e2e.sh` (`npm run e2e`), `setup-lua55.sh` |
| `SECURITY.md` | Threat model, every review finding with its fix and test, how to report |
| `docs/` | Research: hardware, OS, Lua inventory, networking, workflow, gaps, publishing |

## Verified vs needs a badge

- Verified on the host: scaffolding, manifest/schema checks, Lua compile
  (badge 5.5 parser, then system Lua, then fallback; the engine is always
  reported), 24 Lua tests on the badge's own Lua 5.5 (discovery, convergence
  with 20% loss, resend, dedupe, size/rate caps, 5 s clock skew, hostile
  peers, floods, epoch rollover), serial protocol unit tests (sums, delta,
  PNG, hostile streams), example-server tests (signatures, replay, skew,
  limits, key rotation), and the no-device behaviour of `push/logs/shot`.
- Needs a physical badge (marked UNVERIFIED ON HARDWARE): `push`/`logs`/`shot`
  transport, two-badge radio + bridge play, BLE gadget/phone, battery/OTA,
  final pre-publish hardware pass. Emulator two-tab tests need a browser.

## Status: hardware paths unverified

Everything in `npm test` and `npm run e2e` is verified on the host (genuine
Lua 5.5 suite included). The following need a physical badge and are marked
UNVERIFIED ON HARDWARE in code and docs: `push`/`logs`/`shot` USB transport,
two-badge radio + bridge play, BLE gadget/phone flows, battery/OTA behavior,
and the final pre-publish hardware pass. If you can run hardware, please
report results — see CONTRIBUTING.md.

## Security

Never put secrets or anything of value on a badge: `main.lua` is public, the
microSD card reads on any computer, and badges change hands. See
[SECURITY.md](SECURITY.md) for the threat model, every finding from the
security review with its fix and regression test, and how to report a
vulnerability.

## Rules

MIT licensed. No store automation beyond pre-checks: submission stays the
web form until an official API exists. Contributions welcome, see
[CONTRIBUTING.md](CONTRIBUTING.md).
