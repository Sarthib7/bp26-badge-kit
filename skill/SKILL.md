# Badge Kit skill — Breakpoint 2026 badge apps (Solana OS 2.1.0)

Teach a coding agent to build correct badge apps. Ground truth: `solana-os`
`64a474b` (research in this repo's `docs/`, Lua inventory in
`docs/LUA_API_INVENTORY.md`). When unsure, cite the doc, not memory.

## The one-paragraph platform

Badge apps are Lua 5.5 programs (`main.lua` + `app.json` + bundled files) in a
sandbox: `ui led timer sys badge storage fs wifi json mesh ble lamps items
profile quest http ws rpc crypto solana`. Ten manifest permissions, hosts
allowlist (≤8, `*.` covers subdomains only), package caps (64 files, 256 KiB
each, 1 MiB total, `main.lua` ≤64 KiB). Store compiles every `.lua` and
auto-checks; submission is the web form only. **No NFC.** Nearby pairing is
ESP-NOW + button press; one radio shared with Wi-Fi; mesh is lossy (200 B,
4 Hz — send state, repeat until acked); meets are the only server-believable
proof; there is no server leaderboard (build your own). Never put secrets,
keypairs, or passwords on a badge: `main.lua` is public and the card reads
anywhere.

## Security rules (never break these)

- **Never put secrets or anything of value on a badge.** No API keys, server
  keys, tokens, passwords, seed phrases, private keys or wallet keypairs: not
  in `main.lua`, not in bundled files, not in `storage`/`fs`, not in mesh
  messages. App code is public, the microSD card reads on any computer, and
  badges change hands. Keep keys on your server; the badge proves who it is
  through the platform's signed `http` headers instead.
- Never ask the user for a password, seed phrase or key in an app UI (the
  store's auto-check rejects this, and it is phishing).
- Treat every mesh message as hostile input: the mesh is unauthenticated,
  anyone running your app can send anything. Validate types and sizes, keep
  ordering per sender (the kit's `sync.lua` does), and never let a peer's
  claim decide money, scores or hosting. Re-verify on your server.
- Server side, trust only the badge server's key
  (`https://badge-api.solana.com/api/http/key`), check app id, the 60 s time
  window and replay, and never log keys. See `server/meet-board/` and
  `SECURITY.md`.

## Workflow (use the kit CLI)

1. `badge new <name> [--template blank|mesh-multiplayer]` — scaffold.
2. Write against `types/badge.d.lua` stubs (LuaLS autocomplete + min-OS hints).
3. `badge check` — must be clean (manifest, perms, Lua compile, policy).
4. `badge dev` — emulator two-tab flow (`?badge=2`); bridge for real badges.
5. Hardware: `badge push/logs/shot --port …` (needs badge + `serialport`).
6. `badge publish --dry-run` — then submit manually at
   `https://solana.com/breakpoint/badge/apps/submit` (X-linked account).

## Rules that prevent rejections

- `id` is `^[a-z0-9-]{3,24}$`, store-unique; each publish is a NEW version.
- Request least privilege; `hosts` needs `http` (`ws` uses the `http` perm).
- Guard newer APIs (`if ble then`, `if mesh.meet then`, `if crypto then`…).
- Lua 5.5: `for` loop vars are read-only; `global x` declares a global; no
  `io/os/debug/package/load/loadfile/dofile/string.dump`.
- `mesh.send` ≤200 B at ≤4/s; resend state, dedupe, keep `ws` away from other
  server calls (socket-open rule); pause the mesh to sync, resume to play.
- `lamps.award` needs a DevRel cap first; capped apps need organiser review
  for every change.

## References (read as needed)

- `references/platform.md` — package, sandbox, permissions, lifecycle, 5.5 pitfalls.
- `references/mesh.md` — mesh/meet/bridge/BLE/server-call patterns + trust model.
- `references/publishing.md` — test runs, auto-check, versioning, limits, award caps.
- This repo's `docs/` — full evidence (file:line, URLs, measured output).

## Related work (credit, don't duplicate)

- [cesp99/badge-app-skill](https://github.com/cesp99/badge-app-skill) — community
  Claude skill with `badgeapp.py`/`verify.py` (scaffold, push, `--watch`, zip,
  on-badge verify). No license file was visible when checked (Nov 15 2026), so
  **no code or text was copied**; prefer collaborating with / wrapping it over
  re-implementing its serial dev loop.
- Canonical sources: [solana-os](https://github.com/solana-foundation/solana-os)
  (MIT), [Lua API docs](https://solana.com/breakpoint/badge/apps/docs).
