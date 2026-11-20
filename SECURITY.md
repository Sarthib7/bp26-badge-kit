# Security

## Reporting a vulnerability

Please report security problems privately through GitHub's **Report a
vulnerability** button on this repository's Security tab (private
vulnerability reporting). If that is not available, open an issue titled
`[security]` that says only that you have a report and how to reach you, with
no details or exploit. Never include secrets, keys or tokens in a report.
Fixes land with a regression test, and reporters are credited unless they
ask not to be.

## Threat model

The kit runs on a developer's machine and produces apps for a device whose
storage is public: the microSD card reads on any computer, `main.lua` is
readable by everyone who installs the app, and badges change hands.
**Never put secrets or anything of value on a badge**: no API or server keys,
tokens, passwords, seed phrases, private keys or wallet keypairs. This rule
is in the agent skill (`skill/SKILL.md`, "Security rules"), and `badge check`
warns on secret-like literals.

Untrusted inputs the kit handles:

- app folders and `app.json` given to `badge new/check/push/publish`;
- environment variables such as `LUA_BIN`;
- bytes from a USB serial device (`push`, `logs`, `shot`);
- mesh messages from any nearby badge running the same app (the mesh has no
  authentication: anyone can send anything);
- HTTP requests to the example leaderboard server.

## Findings and fixes

Review of Nov 15 2026, against `solana-os@64a474b`. Every fix has a
regression test; test names are from `npm test` (Node) and `tests/run.lua`
(Lua, run on the badge's own Lua 5.5).

| # | Area | Finding | Severity | Fix | Regression test |
|---|---|---|---|---|---|
| 1 | CLI | `LUA_BIN` was interpolated into an `execSync` shell command, so a hostile environment value (for example in shared CI) could run commands. | High | All child processes use `execFileSync(bin, argv)` with no shell. | `treats hostile LUA_BIN as a path, never a shell` |
| 2 | CLI | Symlinks inside an app folder were followed, so `push` could upload a file from outside the app (for example `~/.ssh/id_ed25519`) to a badge, where anyone can read it. | High | `lstat` walk; any symlink, including `main.lua` and `app.json`, is an error. | `refuses symlinks (no exfiltration outside the bundle)` |
| 3 | CLI | `app.json` had no size cap and was read fully before checking. | Low | Size comes from `stat` before reading; over 2048 bytes (the badge's own limit) is refused unparsed. Parsed values are only read field by field. | `refuses an oversized manifest (badge parses at most 2048 B)` |
| 4 | CLI | Path traversal through `new`, `check` and `push` (`../`, absolute paths, names that reach the badge console line `lua recv <id> <file>`). No exploit found. | Low | App names and ids must match `^[a-z0-9-]{3,24}$`; every bundled path must pass `validRelPath` (lowercase, no `..`, not absolute, no spaces, at most 4 levels) before `push` sends it. | `rejects bad app names`, `flags manifest + forbidden-API errors with exit 1` |
| 5 | CLI | With only a system Lua installed, `check` spliced the app's source into a generated Lua `load("...")` string run by a full Lua with `os`. JSON escaping held up in testing, so no working exploit; fixed as defence in depth. | Low | The file path goes in an environment variable and `loadfile()` only compiles it. | `system-Lua compile never splices app source into Lua code` (runs when `LUA_BIN` is set) |
| 6 | CLI | A hostile or buggy USB device could send `SHOT-BEGIN 100000 100000` and make `shot` allocate gigabytes, or send rows outside the image. | Medium | Width and height capped at 1024, rows must be in range, row count capped, serial buffer capped at 8 MB. | `refuses hostile screenshot streams (no huge allocations, no out-of-range rows)` |
| 7 | CLI | `badge push --port /dev/ttyUSB0 app` used the port as the app folder. | Low | Option values are skipped when finding the folder argument. | `push takes the app dir, not the --port value, as its target` |
| 8 | CLI | `push` announced `undefined` as the byte count for `main.lua` and `app.json` (a correctness bug in the unverified hardware path; the badge would refuse the upload). | Medium (bug) | Byte counts come from the bytes actually read. | `announces real byte counts for every pushed file (incl. main.lua/app.json)` |
| 9 | CLI | Network and code-execution surface. | Info | `bin/` and `lib/` have no `http`, `https`, `net`, `tls`, `dns`, `fetch` or WebSocket use, no shell, `eval` or `new Function`, and every URL they mention is a documented `solana.com/breakpoint/badge/...` or `badge-api.solana.com` address. Serial writes only carry files from the validated bundle. | `CLI makes no network calls (only documented URLs are printed)` |
| 10 | Lua `sync` | A hostile peer could freeze any key for everyone by sending one state message with a huge `seq` or `ep` (for example `2^40`): every later honest update looked older and was dropped. The earlier hostile-input test was vacuous, because its case table started with `nil`, so `ipairs` ran zero cases. | High | Ordering and dedupe are per (sender, key), so a peer can only advance its own counter. `seq` must be a whole number in 1..2^31-2^20, `ep` in 0..2^20-1, keys 1-64 bytes; anything else is dropped. Non-string senders are ignored. | `sync/hostile-input-safe` (17 counted cases), `sync/no-wedge-by-high-seq` |
| 11 | Lua `sync` | Unbounded memory: a flood of new keys or sender ids grew the tables without limit. | Medium | At most 64 senders tracked (stalest evicted) and 128 keys held. | `sync/flood-bounded` |
| 12 | Lua `sync` | Sequence wraparound. Badge integers are 32-bit and floats single-precision (`4294967295.0` stores as `4294967296.0`), so modulo arithmetic near the edge misordered updates and could let a stale replay apply. | Medium | (epoch, seq) ordering in small-integer range; the sender starts a new epoch long before `INT32_MAX`. | `sync/epoch-rolls-before-int32max`, `sync/epoch-accepted`, `sync/epoch-replay-rejected` |
| 13 | Lua `sync` | Any peer could write any key (the mesh has no authentication). | Medium | `sync.new(send, { acceptFrom = fn })` roster filter. The default stays open for presence games, and the docs say to re-verify anything that matters on a server. | `sync/acceptFrom-filters` |
| 14 | Lua `lobby` | Heartbeat floods from many spoofed ids grew the peer table without limit. | Medium | At most 64 peers tracked, stalest evicted first. | `lobby/flood-bounded` |
| 15 | Lua `lobby` | Host spoofing and malformed nearby entries: a non-string id from `mesh.nearby()` crashed `peers()` while sorting. | Low | The host is the lowest firmware-reported sender id (`from`), never a claim inside a message (`msg.host` is ignored). Non-string ids and names are skipped. | `lobby/host-spoof-ignored` |
| 16 | Example server | The server generated and trusted its **own** Ed25519 key (stored in `data/`) instead of the badge server's key. It could never verify real badge traffic, and anyone with that key file could forge "badge" requests. It also published its own `/api/http/key`. | High | It now trusts only keys from `https://badge-api.solana.com/api/http/key`, cached by id and refetched at most once a minute for an unknown id. It holds no private key, writes nothing to disk and no longer serves a key endpoint. | `rejects signature bypass attempts` (includes an attacker-generated key), `fetches an unknown key id from the key URL (rotation), at most once a minute`, `never writes keys to disk or logs them` |
| 17 | Example server | One request with a hostile `Host` header (for example `Host: a b`) threw inside the request handler and crashed the whole process. | High | URLs are parsed against a fixed base, and the handler is wrapped so a bad request gets a 400. | `survives a hostile Host header (no crash)` |
| 18 | Example server | Replay gap: a request stamped up to 60 s in the future was forgotten 60 s after it arrived but stayed time-valid, so it could be replayed. | Medium | Request ids are remembered until their own timestamp leaves the window. The replay cache is bounded and fails closed when full. | `keeps a future-stamped request replay-protected for its whole life`, `rejects a replayed request id` |
| 19 | Example server | No rate limiting; the rate table and replay cache could grow without bound. | Medium | 120 requests a minute per IP (429); both tables are bounded. | `rate-limits abusive clients (example 120/min)` |
| 20 | Example server | Oversized bodies only dropped the connection, size was counted in characters, and chunks were decoded one at a time, so multibyte UTF-8 split across chunks broke the body hash. | Low | Raw bytes are buffered and hashed; `Content-Length` is checked first; over 4 KiB gets 413. | `rejects oversized bodies with 413`, `hashes raw bytes (multibyte bodies verify)` |
| 21 | Example server | `X-Forwarded-Host` and `X-Forwarded-Proto` were always trusted when rebuilding the signed URL. | Low | With `MEET_BOARD_PUBLIC_ORIGIN` set (recommended for any deployment), the signed URL comes from it and the forwarded headers are ignored. | `ignores X-Forwarded-Host when a public origin is configured` |
| 22 | Example server | Input validation: JSON bombs, non-object bodies, non-finite or negative scores, timestamp skew, `n` out of range, path traversal. | Low | Strict checks with 400 or 403. Scores are clamped and floored, the 60 s window is enforced, `n` is clamped to 1..50, and unknown paths return 404. | `rejects nested JSON bombs and unknown routes`, `rejects bad scores`, `rejects timestamps outside the 60 s window`, `orders the board best-first and clamps n` |
| 23 | Example server | CORS and response headers. | Info | No CORS headers by design (badges are not browsers), plus `nosniff` and `no-store`. No keys in any response or log. | `sends no CORS headers and no key material` |
| 24 | Skill | Agents need an explicit rule against putting secrets or valuables on badges. | Info | `skill/SKILL.md` has a "Security rules" section: no secrets or valuables on badges, never ask users for passwords or keys, treat mesh input as hostile, verify on the server. | Reviewed by hand |
| 25 | Dependencies | Supply chain. | Info | Zero runtime dependencies. `serialport` is an optional peer pinned to `13.0.0`, loaded only by hardware commands, and never installed by `npm install`. `package-lock.json` is committed. `npm audit`: 0 vulnerabilities. | `npm audit` in review; `npm install` in `npm run e2e` |

## Secrets in git history

The full history was scanned before publishing (gitleaks and a manual grep
for key, token and PEM patterns), and nothing was found. Only test fixtures
contain marker strings such as `TOP-SECRET-MARKER`, which are not secrets.
`server/meet-board/data/` stays in `.gitignore` for older checkouts.

## Out of scope

The badge firmware, the badge server, the App Store's auto-check rules (they
are not public), and `serialport`'s native code (review its advisories before
installing it for hardware use). The example server is example-grade: one
process, an in-memory board, per-IP limits only, and no TLS of its own.
