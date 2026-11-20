# Publishing reference (for agents)

Evidence: `docs/PUBLISHING.md`.

- Build → `badge check` clean → Try in emulator → Run on badge (starts a
  12 h **test run**: draft perms/hosts enforced for you only) → Publish.
- Publish needs an **X-linked account** (also for `http`/`ws`/`rpc` test runs).
- Store compiles every `.lua` with badge Lua; failures name file:line.
  Auto-check reads the code (harm patterns) — usually ~1 min; flagged apps
  wait for an organiser.
- `lamps.award` needs a DevRel **allowance/cap first**; every later code/files/
  perms/hosts change of a capped app waits for an organiser (previous version
  stays live).
- Limits: 25 apps per account+X, 5 submits/min, 20 versions/day. Each update =
  new version (bumps `app.json`); badges pull changed files only.
- `badge publish` without `--dry-run` refuses (no store API exists — Verified
  absent). `--dry-run` runs every local pre-check and prints the manual steps
  at `/apps/submit`. Never fake a publish, never script X sessions.
- Only the id owner can test/publish a taken id. Published perms/hosts pin
  what every badge enforces.
