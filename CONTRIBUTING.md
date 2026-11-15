# Contributing

Small, focused PRs. One logical change per commit, tests included.

## Setup

```sh
git clone https://github.com/Sarthib7/bp26-badge-kit && cd bp26-badge-kit
npm install   # zero runtime dependencies
```

Optional, for the genuine-5.5 engine and Lua suite:

```sh
npm run setup:lua55   # fetches solana-os@64a474b into ../solana-os, builds both tools
```

Fallback (labeled as such in test output): any system Lua 5.4,
`LUA_BIN=$(which lua5.4) npm test`.

## Checks before you push

- `npm test` — 38 tests (CLI, serial helpers, the Lua suite, example server).
- `npm run e2e` — fresh-clone end-to-end (needs network for the clone).
  `npm run e2e -- .` runs it against your local checkout's committed state.
- `node bin/badge check examples/mesh-demo` — the example stays green.

## Conventions

- Every API name, limit, and permission must match the audited platform
  (`docs/LUA_API_INVENTORY.md`, pinned to `solana-os@64a474b`). Cite the
  firmware file:line when you change a constant in `lib/pinned.js`.
- Mark anything needing a physical badge UNVERIFIED ON HARDWARE and add it to
  the README status section instead of claiming it works.
- Never add secrets, keys, tokens, or network calls to the CLI path
  (`bin/` + `lib/` must stay zero-dependency and offline; `serialport` stays
  optional). See SECURITY.md for the threat model and how to report issues.
- Hardware reports welcome: badge model/OS version, exact command, observed
  vs expected output.
