# EtherFantasy MOBA + Clash Front — full agent onboarding guide

> **Read this first if you are a new agent (Opus 4.8 / Fable 5) picking up any part of this project.**
> It is big and multi-session: 4–5 parallel agents (Fable-5 forks + Opus) built the MOBA engine, its
> netcode, a map generator, a headless battle engine, and the Clash Front strategy game that reuses
> the MOBA as its battle engine. This guide tells you **where to start, what the components are, where
> every seam/handoff lives, and which code owns each.** Written 2026-07-03.

---

## 0. The 60-second mental model

**ONE ENGINE, THREE PRODUCTS, run by 5 sessions.**

- **Product 1 — the MOBA game** itself: a browser 3D MOBA (Three.js single-file client + a
  Node authoritative server with a deterministic sim). Plays standalone today.
- **Product 2 — the netcode (v2)**: the real-time wire layer + lag compensation that makes online
  PvP feel native. Same architecture as League/AoV; the rebuild was the *wire layer*, not the model.
- **Product 3 — Clash Front (CF)**: a grand-strategy war game on a hex-parcel NFT map. **Every battle
  is a full MOBA match on this engine** (headless AI-vs-AI for the majority; live "hero mode" when a
  human jumps in). CF lives in a **separate repo** and calls into the MOBA engine.

The golden rule everywhere: **CF is additive. A normal MOBA match must play exactly as before.**

---

## 1. GitHub locations (all private, org `blockchainsuperheroes`) — VERIFIED IN

| Repo | What | Branch(es) |
|---|---|---|
| **`etherfantasy-browser-moba-game`** | **THE canonical engine** — MOBA game client (root `index.html` + assets) + authoritative server (`server/`) + netcode v2 + headless engine + **CF bridge layer** (`server/cf/`). | `main` (only) |
| **`etherfantasy-clashfront`** | **CF overworld** — the hex-map strategy hub, armies, economy, command-mode 2D viewer, the **battle bridge**, all `docs/briefs/*` contracts. Calls the MOBA engine. | `claude/clash-front-overworld-mkcyia` (active dev), `deploy/cf-mvp` (auto-deploy target), `claude/battle-engine-discovery`, `claude/map-extraction-hexagon-city`, `claude/map-import-clashfront-s3jmh1` |

Not part of this game (separate products in the same org): `games-etherfantasy` (website),
`games-etherfantasy-backend`, `products-pfpvault-*`, `products-website-frontend`, etc.

**Canonical-first rule:** the engine (`server/sim/`, `server/cf/`, `server/headless.js`) lives ONLY in
the MOBA repo. The CF repo re-pulls those; it never edits them in place. Contracts (`docs/briefs/*`)
are authored on the CF side and mirrored/consumed on the MOBA side.

**Git note:** MOBA repo uses **Git LFS** for binary assets (.glb/.vrm/.png/.mp3, ~558MB). Generated
`RELEASE/` + `node_modules` are gitignored. Local working copy: `C:\Users\ADMIN\Desktop\EF Moba`.

---

## 2. Live infrastructure (AWS, ARM64/Graviton, deploy key `~/.ssh/ef-moba-deploy`)

| Box | IP | Domain | pm2 processes (port) |
|---|---|---|---|
| **Singapore** (primary) | `13.250.39.41` | moba.etherfantasy.com + **cf.etherfantasy.com** | `ef-moba-server` (8080 game WS) · `ef-moba-lobby` (8090 lobby+landing) · **`cf-battle-api` (8140 CF allocate)** · **`clashfront` (8130 CF overworld)** |
| **Montreal** | `3.98.68.96` | ca.moba.etherfantasy.com | `ef-moba-server` (8080) · `ef-moba-lobby` (8090) — MOBA multi-region only |

nginx per-domain vhosts + certbot TLS. **⚠ Picking a region in the lobby routes the LOBBY websocket
too, not just the game server** — "test on Montreal" moves the whole session there. Both boxes run
their own copy; **they drift if deployed separately — keep in sync** (`deploy_client.sh` ships both).

---

## 3. WHERE TO START READING (in order)

### 3a. The MOBA game itself
1. **`index.html`** (repo root) — the entire 3D client (Three.js). Single file. Local play logic +
   a "net/guest" path (`netGuestFrame`, `netApplyServerSnap`) that renders a server-driven world.
2. **`server/sim/`** — the pure, deterministic simulation (NO DOM/Three): `state.js` (`makeWorld`,
   `mkUnit`, `killUnit`), `step.js` (the tick), `systems/` (ai, movement, combat), `rng.js` (seeded).
   This is the heart — the same `step()` runs live, headless, and for verification.
3. **`server/net/`** — the authoritative server: `gateway.js` (WSS handshake), `matchmaker.js`
   (form/join matches), `match.js` (Match lifecycle: draft→live→end, 30Hz tick, snapshots).
4. **`server/lobby/`** — the landing page + matchmaking + PG login + the $CT economy (grind/PvP,
   loot, leaderboard). `lobby/public/index.html` is the lobby UI; `lobby/index.js` the server.
5. **`server/index.js`** / `config.js` — game-server entry (30Hz tick, ports).

### 3b. The networking (netcode v2)
1. **`REALTIME-NETCODE-HISTORY.md`** (repo root) — **READ THIS BEFORE touching netcode.** The full
   lag investigation: the "lag" was a **client GC leak, NOT the network/AWS/Edgegap** (proven). Lists
   everything ruled out so you don't re-chase it.
2. **`server/PVP-NETCODE-V2.md`** — the v2 design: binary delta wire protocol (kills the 30Hz JSON-GC
   storm), zero-GC decode, tick-domain render clock, **lag compensation** (32-tick history, view-tick
   `vt`, server rewind). Architecture stays; only the wire layer was rebuilt.
3. **`server/net/proto.js`** — the binary v2 encoder/decoder. Client decoder is inline in `index.html`.
   Negotiated per-connection: `join {v:2}` → binary; legacy → v1 JSON.

### 3c. Clash Front integration (the bridge layer)
1. **`docs/briefs/BRIDGE-LAYER.md`** — the bridge-layer component reference (start here for CF).
2. **`docs/briefs/PVP-SERVER-REQUIREMENTS.md`** (R1–R14) + **`M1-HEADLESS-BATTLES.md`** — what CF needs.
3. **`server/cf/`** — the CF engine (see §5). **`server/headless.js`** — the deterministic runner.
4. Contracts: **`ALLOCATE-CALLBACK-SCHEMA.md`** (R1/R10 wire), **`TICKET-CONTRACT.md`** (hero-mode join),
   **`TELEMETRY-RELAY.md`** (command-mode relay), **`HERO-MODE-CLIENT.md`** (client plan).

---

## 4. Components map

| Component | What it is | Code |
|---|---|---|
| **MOBA 3D client** | Three.js browser game; local + net-guest render | `index.html` + `hero/ boss/ masters/ pets/ mons/ vrm/ shared/ model_calibration.js` |
| **Deterministic sim** | pure tick engine (shared by live/headless/verify) | `server/sim/**` |
| **Authoritative server** | WSS gateway, matchmaker, match lifecycle, snapshots | `server/net/**`, `index.js`, `snapshot.js` |
| **Netcode v2** | binary delta wire + lag comp + client decoder | `server/net/proto.js`, inline in `index.html` |
| **Lobby / economy** | landing, matchmaking, PG login, $CT (grind/PvP/loot/leaderboard) | `server/lobby/**`, `chain/`, `loot.js`, `vip.js`, `stats.js` |
| **Headless engine** | `runBattle(context)→report`, checksum/journal/verify | `server/headless.js`, `headless-worker.js` |
| **CF bridge layer** | allocate, HMAC callback, join ticket, telemetry relay | `server/cf/**` (see §5) |
| **Map generator** | deterministic battlefield JSON from a parcel | `server/maps/**` (+ CF `MAP-GENERATOR.md`) |
| **CF overworld** | hex map, armies, economy, command-mode viewer, battle bridge | **CF repo** `apps/`, `packages/`, `data/` |

---

## 5. The seams & handoffs (THE most important section)

Five sessions meet at a handful of well-defined seams. Each seam = a contract doc + the code on each
side. **If you touch a seam, read its contract doc first.**

### Seam A — CF overworld ↔ Bridge layer: **allocate + result callback** (battle resolution)
- **What:** CF asks the engine to resolve a battle; the engine returns a signed result.
- **Contract:** `docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md` (R1/R10/R13).
- **Bridge side (us):** `server/cf/api.js` `POST /internal/v1/matches/allocate` (:8140) → `battle.js`
  `allocate()` → `makeBattleWorld` + `runBattle` (accelerated) → `buildCallback` (HMAC) → `postCallback`.
- **CF side:** the overworld tick engine points `BATTLE_ENGINE_URL` at `:8140` and receives the callback.
- **Auth:** Bearer `~/.cf_battle_api_token`; callback signed with `~/.cf_battle_hmac_secret`.
- **Status:** ✅ LIVE (accelerated). Live-match mode = Seam D.

### Seam B — Bridge layer ↔ CF overworld: **telemetry relay** (command mode / spectate)
- **What:** a running MOBA match streams 2–4Hz top-down frames to the overworld's command-mode viewer,
  and polls player steering commands back.
- **Contract:** `docs/briefs/TELEMETRY-RELAY.md`.
- **Bridge side (us, the CLIENT):** `server/cf/bridge.js` (start/snapshot/commands/end) +
  `cf/run-exhibition.mjs`. Calls `cf.etherfantasy.com/bridge/battles/*`, Bearer `~/.cf_bridge_secret`.
- **CF side (the HOST):** `apps/server/src/bridge.ts` in the CF repo; viewer `apps/server/public/js/battle.js`.
- **Status:** ✅ LIVE + proven (exhibition round-trip).

### Seam C — Bridge layer ↔ MOBA client/gateway: **hero-mode join ticket**
- **What:** a CF player clicks "⚡ Take the field" and deep-links into a *specific* live match as their
  Master, authenticated by a one-time ticket.
- **Contract:** `docs/briefs/TICKET-CONTRACT.md` + `HERO-MODE-CLIENT.md` + `HANDOFF-client-to-server-bridge.md`.
- **Bridge side (us):** `server/cf/ticket.js` — `mintTicket`/`verifyTicket`/`joinUrl`; minted via
  `POST /internal/v1/matches/:id/ticket` (:8140).
- **Client side (OP 48):** parses `?match=&ticket=` in `index.html`, forwards them in `{t:'join',v:2}`.
- **Gateway side (netcode):** `server/net/gateway.js` calls `verifyTicket` → `mm.joinExisting` →
  `Match.addSeat`. **✅ already wired.**
- **Status:** ✅ ticket + gateway done. Blocked only on Seam D (a live match to join).

### Seam D — Bridge layer ↔ Netcode: **live-match creation** ✅ DONE (2026-07-03)
- **What:** hero mode needs a persistent 30Hz match in the game server that a ticket binds to.
- **Contract:** `docs/briefs/TICKET-CONTRACT.md §6`.
- **Bridge side:** `allocate(mode:"live")` POSTs `GAME_INTERNAL/internal/cf/live` (context UNwrapped)
  and binds the ticket to the id the game server returns.
- **Netcode side:** `POST /internal/cf/live` (`index.js`) → `mm.createLiveMatch(context)` (a `cfLive`
  Match ticking at 30Hz, kept open; possess/release officers via `Match.addSeat`).
- **Command channel (`net/cfpump.js`):** on live-match create, auto-registers with CF's bridge
  (`bridgeStart` + joinUrl → ⚡ lights) and streams 3Hz snapshots + polls steering. Needs the game
  server proc to have `CF_BRIDGE_URL` + `BRIDGE_SECRET` (it does).
- **Status:** ✅ verified live — `[cfpump] registered as battle BRX… (joinable)`, army spawns,
  snapshots streaming. The full hero-mode loop is closed.

### Seam E — Maps ↔ Bridge layer: **Battlefield JSON**
- **What:** the map generator's output is what `allocate`'s `battlefield` field consumes.
- **Contract:** CF `docs/briefs/MAP-GENERATOR.md` (schema in `ALLOCATE-CALLBACK-SCHEMA.md` A1).
- **Maps side:** `server/maps/**` (deterministic parcel→battlefield). **Bridge side:** `makeBattleWorld`
  reads `context.battlefield`. **Status:** schema aligned; wire up when the generator emits real maps.

### Seam F — Netcode ↔ MOBA client: **the v2 binary protocol**
- `server/net/proto.js` (server encode) ↔ inline decoder in `index.html` (client). Negotiated by
  `join {v:2}`. Owned by the netcode session.

---

## 6. Determinism & tamper-proof verification (why it all hangs together)

The sim is **pure + deterministic** (seeded `rng`, no `Math.random`/`Date.now` in `sim/`; per-world
`world._uidSeq`). This is load-bearing:
- **Headless resolution** (`runBattle`) fast-forwards the SAME `step()` — the tamper-proof arbiter for
  AI-vs-AI battles and for **verifying client-hosted results** (R11: journal hash + final checksum;
  a doctored result won't reproduce).
- **Lag compensation** journals the view-tick (`vt`) and keeps the rewind context non-enumerable, so
  replays stay bit-identical.
- The product decision: **client-authoritative + server-verified** lets us launch without solving
  real-time human-vs-human sync (the only thing deferred). See `REALTIME-NETCODE-HISTORY.md §6`.

---

## 7. Deploy & ops

- **MOBA client** (`/play`): `bash deploy_client.sh` — ships the full `CLIENT_FILES.txt` manifest
  (index.html + assets) to BOTH boxes via `~/.ssh/ef-moba-deploy`. nginx serves statically, no restart.
  Obfuscation: raw for testing; at launch ship **rename+minify only** (CFF is the FPS killer).
- **MOBA server** (`server/`): ship the WHOLE `server/` tree (tar, exclude `node_modules`) then pm2
  restart `ef-moba-server` / `ef-moba-lobby`. **⚠ Never cherry-pick server files onto a box — a mixed
  tree breaks the goldenmaster.**
- **CF bridge API** (`cf-battle-api` :8140): `scp server/cf/*.js` → `~/ef-moba-server/cf/` → `pm2
  restart cf-battle-api`. Secrets in `~/.cf_battle_*` (mode 600), sourced like BRIDGE_SECRET.
- **CF overworld** (`clashfront` :8130): its own repo, **auto-deploys** via a GitHub **self-hosted
  runner** on the Singapore box — push/merge to `deploy/cf-mvp` → builds+deploys. No inbound SSH.
- **⚠ pm2 restart:** never `--update-env` from a bare ssh shell — it wipes the process env (e.g.
  PLAY_ESCROW). Recreate with full env or plain `restart`.

## 8. Tests
`cd server && npm test` → **goldenmaster** (determinism) + **headless** (12) + **cf-battle** (13) +
(maps). Netcode adds `proto.test.js` / `v2socket.test.js`. Green = the sim is deterministic and the
allocate→callback loop works.

---

## 9. The sessions (who owns what)

| Session | Role | Owns |
|---|---|---|
| **CF Overworld dev (Opus)** | overworld hub + canon | CF repo, all `docs/briefs/*` contracts, `BATTLE_ENGINE_URL` wiring, PG login/landing |
| **EF v2 Moba Server (bridge layer)** | match-server / M1 | `server/cf/**`, `headless.js`, the ticket/allocate/callback/relay seams |
| **EF v2 Moba Server (network) — F5 fork** | netcode / headless perf | `server/net/**` (proto, gateway, match), lag comp, the v2 wire, live-match `createLiveMatch` |
| **EF v2 Moba Server (maps) — F5** | map generator | `server/maps/**`, `MAP-GENERATOR.md` |
| **EF Moba game-dev OP 48 (Cowork)** | 3D client | `index.html` gameplay, Masters-as-champions roster, hero-mode deep-link parse |

---

## 10. Current status & the single open critical-path item

- ✅ MOBA game, netcode v2, lobby/economy, headless engine, CF M1 (allocate/callback/casualties/verify),
  M1.5 smoke relay, hero-mode ticket seam + gateway, **live-match + command channel (Seam D) — the full
  clickable hero-mode loop is wired and verified live** (march → live match → watch in command mode →
  ⚡ take the field → result settles).
- Remaining is polish, not critical path: officer contribution stats hook; faithful finite-wave/
  structures builder; Montreal CF parity; content-parity of ability VFX in net mode; reinforce (D1b)=v2.
- Follow-ups (non-blocking): officer contribution stats hook; faithful finite-wave/structures builder
  (game-dev PARAM lane); Montreal CF parity; reinforce (D1b) = v2.

**When in doubt:** the sim in `server/sim/` is the single source of truth; every product is a different
harness around the same deterministic `step()`. Read the seam's contract doc before touching a seam.
