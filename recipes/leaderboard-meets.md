# Leaderboard via signed meets + your own server

No server-side score or leaderboard feature exists on the badge platform
(verified absent in firmware `64a474b`; see `docs/NETWORKING.md`). This recipe
builds one from verified primitives: game events reach your server either as
signed `http` calls or as `mesh.meet` records, your server keeps the table,
badges read it back. `server/meet-board/` is a tiny working example of the
`http` path. Both paths are example-grade — harden before trusting real value.

## Path A — game events over signed `http` (implemented in the example)

1. Badge posts the event: `http.post("https://scores.example.com/report", {score=100}, cb)`
   with `hosts = {"scores.example.com"}` and the `http` permission.
2. The badge server proxies it and adds `X-Badge-*` headers + an Ed25519
   signature (`badge-http-v1`, key at `GET https://badge-api.solana.com/api/http/key`).
3. Your server verifies (signature, app id, time within 60 s, request unseen),
   then applies its own rules and stores **per `X-Badge-User`** (owner), not per badge.
4. Badges poll `GET /board` or hold a `ws` to your host for live updates.

Trust notes (verified, `docs/LUA_API.md` + `docs/NETWORKING.md`): the signature
proves which badge+account called **through your app id** — not that your exact
code sent it (`main.lua` is public). Decide scores server-side; clamp absurd
values; keep the best, not the sum, unless sums are your game.

## Path B — provable meetings via `mesh.meet` + app-key poll

1. In the app: `mesh.meet(peerId, {tag=1}, cb)` / `on_meet` returns your side's
   data (≤100 B ASCII, 1 ask/s, 300/day). Both badges sign one OS-built statement.
2. Outbox uploads on Wi-Fi; your server polls
   `GET https://badge-api.solana.com/api/app/meets?after=<id>` with the app key
   from `/apps/mine` (*Server key*, shown once).
3. Aggregate server-side: `req.user` = asker, `acc.user` = accepter, `bridged`
   flags relayed meets, `at` = server receipt. Count pairs of people once;
   value cooperation between two people only as much as your game should.

What a meet proves (verified): both badges' keys signed that statement **in
your app with that data**. Not that two people stood together (cooperating
owners can relay; `bridged` says so) and badge clocks are self-reported.
Re-check `on_meet` data server-side: the other badge's script may be modified.

## The example server (`server/meet-board/`)

Zero-dependency Node. Implements Path A: `POST /report` verification +
per-user best + `GET /board`. Run:

```sh
MEET_BOARD_PUBLIC_ORIGIN=https://scores.example.com node server/meet-board/server.js mesh-demo 8080
```

It trusts only the badge server's public key, fetched from
`https://badge-api.solana.com/api/http/key` and cached by key id (refetched at
most once a minute when an unknown id appears). It holds no private key and
writes nothing to disk. Set `MEET_BOARD_PUBLIC_ORIGIN` to the public https
origin your badges call; without it the signed URL is rebuilt from
`X-Forwarded-Proto/Host`, which is only safe behind a proxy that sets them.
Tests in `test/server.test.js` sign requests with a throwaway in-memory key.

Hardening in the example: 60 s time window, replay cache kept for each
request's whole validity, 4 KiB body cap (413), 120 requests/min per IP (429),
strict score validation, no CORS headers, `nosniff` and `no-store` headers,
and a fixed URL base so a hostile `Host` header cannot crash it.

Still NOT production: single process with an in-memory board (lost on
restart), per-IP limits only, no TLS of its own (run it behind a TLS proxy).
Never put secrets in the app that talks to it.
