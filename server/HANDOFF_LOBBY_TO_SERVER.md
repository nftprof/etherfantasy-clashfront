# Handoff → game-server session: the Lobby is built, here's how to push it live

**From:** the lobby/front-of-house build (Cowork/Opus session).
**To:** you — the session that owns `server/` (authoritative sim) and has SSH/deploy
access to the EF boxes.
**TL;DR:** I added a complete **lobby + matchmaking + PG-login** layer as a *separate*
service (new files only, nothing of yours touched). It's tested. You have the keys, so
you do the deploy. Then finish 3 small integration items and the game is fully
server-hosted (no host, no LAN, all over the web).

---

## 1. Read these (in order)
```
server/lobby/                      ← the whole new lobby service (read it)
  auth.js          PG token → canonical username (+ friends)
  rooms.js         rooms, quick-match, ready-up, teams, launch handoff
  index.js         WS + static service on port 8090
  public/index.html  landing → PG login → lobby UI → launch
  public/config.js   deploy-time front-end config (PG login URL etc.)
  PROTOCOL.md      ← message protocol + the ONE change you make to matchmaker.js
  test_lobby.js / smoke.js   29 unit + real-socket e2e (both green)
server/DEPLOY_MOBA_SUBDOMAIN.md    ← exact nginx + Let's Encrypt + pm2 runbook
```

## 2. What I saw in your `server/` (so we're in sync)
- ✅ P0 headless sim (`sim/`, pure data, seeded RNG) — golden-master passing.
- ✅ P1 WSS gateway + matchmaker + `Match` loop (clients are input/snapshot only).
- ✅ P2 input validation + rate-limit; movement clamped, bounds + hp/damage server-side.
- ⏳ Only **movement + basic combat** ported. Abilities (the 16 `ef_core.js` kits),
  minions/waves, towers, economy/shop, pets, wild camps, evolution **not yet**.
- ⏳ No TLS (plain `ws://…:8080`), and **no lobby** — your matchmaker auto-starts the
  instant `TEAM_SIZE*2` players queue. That's exactly the gap the lobby fills.

## 3. What I built (additive, non-conflicting)
- A **lobby service on port 8090** — your `ef-moba-server` on 8080 is untouched.
- **PG login**: client gets a PG `access_token`; the lobby server exchanges it for the
  canonical username via `GET {PG_API_BASE}/user` (Bearer). Names can't be spoofed.
  Gated `dev:Name` login for local testing (`PG_DEV_FALLBACK=1`, off in prod).
- **Lobby/rooms**: Quick Match, create/join-by-code, browsable list, ready-up, host
  start + countdown, host migration, modes 1v1 / 2v2 / co-op-vs-AI, friends helper.
- On start, every player gets a `launch` with a shared **`party` id** + their team/slot.
- **Deploy runbook** (`DEPLOY_MOBA_SUBDOMAIN.md`): nginx `/`→8090, `/game`→8080,
  `/play/`→static client, certbot TLS for `moba.etherfantasy.com`.
- Validated: `node lobby/test_lobby.js` (29) + `node lobby/smoke.js` (e2e, 2 clients →
  same party, opposite teams, auto-launch).

## 4. Push it live (you have the key)
Follow `server/DEPLOY_MOBA_SUBDOMAIN.md` end-to-end. Summary:
1. DNS A record `moba.etherfantasy.com → 13.250.39.41`; open 80/443 on the game box.
2. `scp` the `server/` tree + the static game client to the box; `npm install --omit=dev`
   in `~/ef-moba-server` (pulls `ws`).
3. Set `lobby/public/config.js` → `EF_PG_LOGIN_URL` (the real PG hosted-login URL),
   `EF_GAME_CLIENT="/play/index.html"`.
4. `pm2 start lobby/index.js --name ef-moba-lobby` with
   `PG_DEV_FALLBACK=0 LOBBY_PORT=8090 EF_GAME_WS=wss://moba.etherfantasy.com/game`.
5. nginx vhost (in the runbook) + `certbot --nginx -d moba.etherfantasy.com`.
6. Verify `https://moba.etherfantasy.com/health` and the two-browser lobby test.

After step 6: **landing + PG login + lobby + matchmaking are live on the web.**

## 5. Three items to make the MATCH itself fully server-hosted (no host)
The lobby gets players grouped and launched server-side. For the *gameplay* to run on
the server (not a browser), finish these — they're yours / shared:

**(a) `party` grouping in `matchmaker.js`** — small + additive. Carry `msg.party`/`msg.team`
through `gateway.js` into the seat, and group complete parties before the FIFO fallback.
Exact snippet in `server/lobby/PROTOCOL.md` §"Integration contract". Until then a launched
1v1 still pairs correctly by FIFO.

**(b) Finish porting sim systems** (your P0 continuation): abilities → minions/waves →
towers → economy/shop → pets/wild → evolution, golden-mastered against the browser sim
(`SERVER_PLAN.md` §5). This is the bulk of the remaining work and the real gate to a
playable server match.

**(c2) Relay the `signal` verb (team pings — small, additive).** The client now has a
signal/ping wheel and emits `{a:'signal', k:<0-5>, x, z}` via `netSendInput` when in a
networked match. It's a pure **relay** — no sim effect — so allies see each other's pings:
```js
// validate.js — add to the ACTIONS set and schema:
//   ACTIONS.add('signal')
//   if (msg.a === 'signal') { if (!Number.isInteger(msg.k)||!num(msg.x)||!num(msg.z)) return null;
//     return { a:'signal', k:msg.k, x:msg.x, z:msg.z }; }
// match.js — when a 'signal' input arrives, DON'T feed it to the sim; broadcast it:
//   this.send({ t:'signal', seatId, k:v.k, x:v.x, z:v.z });
// Client renders an incoming {t:'signal'} the same way fireSignal() does locally
//   (fxRing + mmPing + feed), keyed by SIGNALS[k]. Until this lands, pings are local-only
//   (the client already guards the send, so nothing breaks).
```

**(c) Wire the client `?net=server` path in `index.html`** (your README "next step 2"):
on launch the lobby sends the browser to `/play/index.html?net=server&ws=<gameWs>&party=…&team=…&slot=…`.
The client should, when `net=server`: open `ws`, send inputs via the existing
`netSendInput` verbs, and render `snap` frames by reusing `netGuestFrame`/`applyModel`
(it already has a guest-frame renderer). ⚠️ `index.html` is also edited by the hourly
game-feature auto-builder — land this in one focused pass / pause that task to avoid
merge churn.

## 6. So… can users start a game with no host, over the web?
- **Now, after the deploy:** YES for **finding/joining a match** — web landing, PG login,
  lobby, ready-up, launch. No LAN, no PeerJS, nobody hosts the lobby.
- **Full server-run gameplay:** once **(a)+(b)+(c)** above are done. (b) is the long pole.
  Until then `/play` loads the existing local/AI client so the flow is demoable.
- There is no "no-host but full game" shortcut without either finishing (b) or keeping the
  old PeerJS host — by design, server-authoritative play needs the server sim.

## 7. ACK (please fill in when you pick this up)
- [ ] Read `server/lobby/` + `PROTOCOL.md` + `DEPLOY_MOBA_SUBDOMAIN.md`
- [ ] Deployed lobby (8090) + nginx + TLS for `moba.etherfantasy.com`
- [ ] Set real `EF_PG_LOGIN_URL` (confirmed against pg-identity-docs)
- [ ] Added `party` grouping to `matchmaker.js`
- [ ] Relayed the `signal` verb (team pings) — validate + broadcast (no sim effect)
- [ ] Wired client `?net=server` render path
- [ ] Sim port progress: abilities __ / minions __ / towers __ / economy __ / pets __
- Notes / questions back: ________________________________________
