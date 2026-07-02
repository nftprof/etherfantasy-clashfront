# Battle Engine Discovery — etherfantasy-browser-moba-game

> Deliverable of the battle-engine discovery mission (`docs/briefs/battle-engine-session-brief.md`).
> Read-only survey of `blockchainsuperheroes/etherfantasy-browser-moba-game` @ `15d610c` (main),
> conducted 2026-07-02. Companion document: [`REPURPOSING-PLAN.md`](./REPURPOSING-PLAN.md) (gap
> analysis + ordered work items). All file paths below are relative to the MOBA repo root; line
> numbers are from the surveyed commit.

## Executive summary

The MOBA repo contains **two games and three services**: a single-file 3D MOBA client
(`index.html`, ~5,800 lines), a single-file single-player PvE ARPG (`pve.html`, not
battle-relevant), a **headless authoritative game server** (`server/`, ~1,300 lines of Node),
a **lobby/matchmaking service** (`server/lobby/`), and a Pentagon Chain escrow client
(`server/chain/`).

The most important discovery: **the authoritative server simulation is already exactly the
foundation Clash Front needs** — pure-data (zero THREE/DOM), fixed-timestep, deterministic
(seeded mulberry32 RNG, passing golden-master test), tiny (≈650 lines of sim), and already
proven to fast-forward headlessly (the golden-master runs 1,200 ticks synchronously). The server
map is nothing but an **empty ±120 square clamp** — there is no terrain representation
server-side at all, so "replace the square map with seeded hex battlefields" is a green-field
build on a clean base, not a fight against entrenched geometry.

The bad news is symmetric: **nothing needed for army-scale battle exists yet.** No pathfinding
anywhere (client or server), no terrain/obstacles in the authoritative sim, O(n²) target
acquisition that will not survive hundreds of units, a full-world 30 Hz JSON snapshot with no
delta/interest management, no HTTP match-creation API (matches form only via WebSocket joins),
no mid-game join in the server path, no result callback to any service, and no service-to-service
auth on the game server. The client is a monolithic obfuscated-at-build single file with its
**own second hardcoded map that disagrees with the server's** (different tower counts, core HP,
minion stats, map scale) — the client renders a myth loosely correlated with the authoritative sim.

Verdict in one line: **keep the server sim skeleton and netcode shape, rebuild the map/army/API
layers around it, and treat the client as a renderer to be re-pointed at server-supplied
battlefield data.**

---

## 1. Codebase map

### 1.1 Tech stack

| Layer | Tech | Where |
|---|---|---|
| Client renderer | Three.js **r128**, pinned, from CDN (not bundled) | `index.html:541-543` |
| Client structure | Single-file HTML+JS monolith, `window.*` globals, no modules/framework | `index.html` (5,814 lines) |
| Shared client code | `shared/ef_core.js` (element kits, anims, synth SFX/voice), `shared/ef_touch.js`, `model_calibration.js` | loaded as globals `index.html:545-547` |
| Client UI | DOM/CSS HUD over canvas; minimap = 2D canvas | `index.html` (`#hud`, `#mm`) |
| Audio | 100% WebAudio synthesis + name-slice speech synthesis; no audio files in the play path | `ef_core.js:101-129`, `:76-99` |
| Game server | Node ≥20 ESM, single dependency `ws` | `server/package.json` |
| Lobby | Node ESM, `ws`, PG (Pentagon Games) JWT auth | `server/lobby/` |
| Chain | `ethers` → Pentagon Chain `PlayEscrow` (operator wallet) | `server/chain/playEscrow.js` |
| Build | `build/build.mjs` = **obfuscator + mirror**, not a bundler (javascript-obfuscator, optional domain lock). No transpile/tree-shake. | `build/build.mjs:24-104` |
| Deploy | pm2 on single EC2 boxes; client rsync'd static; nginx `/`→lobby 8090, `/game`→server 8080; regions `ca.moba` + `sg.moba.etherfantasy.com` | `server/README.md:20-26`, `PATCH_NETPLAY.md:20-21` |

### 1.2 Repo layout (battle-relevant subset)

```
index.html            # MOBA client (map, HUD, netcode, hero/RTS control) — monolith
pve.html              # single-player ARPG; fully client-side; NOT battle-relevant
shared/ef_core.js     # 17 element ability kits + anim/SFX canon (client side)
mon_lineage.json      # monster/type chart (client)
server/
  index.js            # HTTP /health + WSS gateway attach          (25 lines)
  config.js           # TICK_HZ=30, SNAPSHOT_HZ=30, MAP ±120, TEAM_SIZE, PICK_SEC
  net/gateway.js      # WS handshake, join routing, input validation+rate limit
  net/matchmaker.js   # queue → party-grouped or FIFO match formation
  net/match.js        # one match: DRAFT → LIVE(setInterval tick) → end (+escrow)
  sim/state.js        # pure-data world: mkUnit/makeWorld — ALL map layout lives here
  sim/step.js         # fixed-timestep step(world, dt, inputs); systems order AI→combat→movement
  sim/systems/        # ai.js (81), combat.js (42), movement.js (24)
  sim/abilities.js    # server mirror of ef_core kits (hand-synced ⚠)
  sim/items.js        # 8-item shop
  sim/rng.js          # mulberry32 seeded PRNG
  snapshot.js         # world → full-state JSON snapshot
  validate.js         # input schema whitelist + token bucket
  lobby/              # separate service: PG auth, rooms, launch handoff (PROTOCOL.md)
  chain/playEscrow.js # createGame/settle/refund/creditLoot (operator)
  test/goldenmaster.js# determinism test — synchronous 1,200-tick headless run
```

### 1.3 How client and server share code

**They mostly don't — they share numbers by hand.** `server/sim/abilities.js:5-6` carries an
explicit warning: *"⚠ KEEP IN SYNC with shared/ef_core.js (KITS, ARCH cd/mp/dmg, buildSuper)"*.
The ability tables, item shop (`sim/items.js` vs client `ITEMS[]`), XP/gold curves, and — worst —
the **map itself** are duplicated and already diverged (§2.3). `shared/ef_core.js` is genuinely
shared across the two *clients* (MOBA + PvE), not between client and server. The only wire-level
shared artifacts are the message schemas.

### 1.4 Build & run

- Client: open `index.html` (or `serve.py` on :8000). `npm run build` → obfuscated `RELEASE/`.
- Server: `cd server && npm install && npm start` (:8080). `npm run goldenmaster` = determinism test.
- Lobby: `LOBBY_PORT=8090 EF_GAME_WS=wss://… node lobby/index.js`.
- Smoke: `node server/test/smoke.js [ws://host:port]` — two scripted WS clients form and play a match.

### 1.5 Tick model

- Authoritative server: fixed **30 Hz** sim (`TICK_HZ`, `server/config.js:4`), snapshots every tick
  (**30 Hz**, `SNAPSHOT_HZ`), driven by `setInterval` in `net/match.js:169`. Ability cooldowns are
  frame-counted (`ab.cd * TICK_HZ`, `sim/step.js:46`); everything else is `dt`-based.
- Client solo / P2P-host path: variable-`dt` rAF loop; P2P host broadcasts **10 Hz** snapshots.
- ⚠ **Canon mismatch:** clashfront canon says `BATTLE_TICK_MS = 100` (10 Hz, `docs/08` §2). The
  real engine ticks at 30 Hz (33 ms). Either correct canon or make tick rate a battle-context
  parameter (see plan item F).

---

## 2. Map pipeline

### 2.1 Server map: an empty bounded plane

The entire authoritative "map" is:

- `config.js:7` — `MAP: { min: -120, max: 120 }`, a **square clamp** applied in
  `sim/step.js:10-11` (input clamp), `sim/systems/movement.js:21-22` (hard position clamp), and
  **duplicated as literals** in `sim/abilities.js:24-25` (`MAP_MIN=-120, MAP_MAX=120`).
- Layout constants in `makeWorld` (`sim/state.js:41-106`): spawns at `(-100,-100)`/`(100,100)`;
  1 core per team (5,000 HP) at spawn; **2 towers per team** on the diagonal
  (`[[-62,-62],[-28,-28]]` / mirrored, `state.js:93`); **5 neutral camps**
  (`[[0,-55],[0,55],[-55,0],[55,0],[0,0]]`, `state.js:99`); first minion wave at t=12 s.

There is **no heightfield, no obstacles, no collision geometry, no nav representation of any
kind** server-side. Units move in straight lines (`movement.js`), chase in straight lines
(`combat.js:25-27`), and are clamped to the square. Nothing is loaded from data — the map is
constructed inline in `makeWorld` from literals.

**Implication for hex battlefields:** the server needs a battlefield model built from scratch
(bounds polygon, terrain/obstacle set, spawn zones, nav) — but equally, there is *nothing to
tear out*. Total square-map coupling server-side is ~10 lines of clamps plus the layout literals.

### 2.2 Client map: rich, procedural-at-load, baked in JS

Everything derives from one knob, `MAPK = 1.4` (`index.html:1352` — "all geometry … derives from
this ONE knob"):

- **Square ground** `PlaneGeometry(240*MAPK, 240*MAPK, 96, 96)` = 336×336 units (`:1359`);
  movement clamp is a square `±115*MAPK` with playable ring `±90*MAPK` (`clampMap`, `:2919-2932`).
- **Elevation**: `heightAt(x,z)` sums 2 cosine hills (`HILLS`, `:1353-1358`); vertex colors baked
  from **seeded** value noise (`GNOISE_SEED=20260627`, `:1377-1404`); procedural canvas textures
  (grass/dirt/lane, `:1298-1345`); 4 biome retints chosen at match start (`:1372`, `:4878`).
- **3 lanes** as waypoint polylines (`LANES`, `:1452-1457`) rendered as Catmull-Rom ribbons;
  units path the raw polylines.
- **Obstacles**: 12 ridge-wall segments (`WALLS`, `:1480-1495`) + trees, all reduced to
  `{x,z,r}` circles in a global `obstacles[]`; **no grid, no navmesh** — per-frame steering with
  `avoidTrees/avoidStructures/separate` push-outs (`:5304`).
- **Camera** fixed-angle diagonal follow tuned to the square/diagonal layout (`:5345-5346`);
  **minimap** hardcodes a square world→150px projection rotated 90° (`:5124-5180`).
- **No fog of war** — every unit is always drawn and minimapped (`:5161-5171`); only atmospheric
  `THREE.Fog`.

The client **never receives map geometry over the wire** in either netcode path. The map is
rebuilt locally at match start.

### 2.3 The two maps disagree

The client visual map and the server authoritative map are **independently hardcoded and already
diverged**:

| | client `index.html` | server `sim/state.js` |
|---|---|---|
| Playable size | 336×336 (±115×1.4 clamp) | 240×240 (±120) |
| Towers | 6 per team (`:4855-4857`) | 2 per team |
| Core HP | 2,400 (+ innate cannon) | 5,000 (no attack) |
| Minions | hp 160/dmg 14 + heavy 500, 3+1/lane/30 s, +8%/min scaling, 32 cap | hp 220/dmg 22, 3/team/30 s, no lanes, no scaling, no cap |
| Neutral camps | 2 expansion camps + 2 boss lairs + masters | 5 plain camps |
| Economy | gold+wood, peons, build pads, legendaries | gold only, 8-item shop |

In server mode the client renders server units on top of *its own* scenery — cosmetic geometry
(walls, hills) has no authoritative counterpart, so units walk through "walls" the server doesn't
know about. **Any battlefield redesign must make the server the single source of geometry** (or
share a generator), otherwise this class of divergence recurs.

### 2.4 Complete inventory of MOBA-convention hardcoding

To become "armies vs terrain," each of these must be deleted or made a per-battle-type module.
Server-side occurrences are the ones that matter (client mirrors follow the renderer rework):

| Convention | Server | Client |
|---|---|---|
| Lanes / waypoints | none (minions walk at enemy core, `ai.js:54`) | `LANES` `:1452-1457`, minion wave loop `:5206-5212` |
| Towers | `state.js:93-97`; tower AI `ai.js:44-49` | `mkTower` `:3064`, 12 placements `:4855-4857` |
| Core + win condition | `state.js:87-91`; `killUnit` sets `world.winner` on core death `:136`; tower-gated core shield `combat.js:8-11,32-36` | `mkCore` `:3066`, `endGame` `:2685` |
| Minion waves | `spawnWaves` every 30 s, `ai.js:13-30` | `:5206-5212`, `mkMinion` `:3056` |
| Jungle camps | `state.js:98-104`, leash AI `ai.js:58-68` | `spawnWildCamp` `:3073`, boss lairs `:3097` |
| Shop/items/gold | `sim/items.js` (buy ≤22 of spawn), passive +1 g/s `step.js:77` | `ITEMS` `:3244+`, gold+wood RTS economy |
| XP/levels | `giveXp` `state.js:123-130`, bounties in `killUnit` | `giveXP` passive `:5220`, bounty/CS/streak `:2998` |
| Respawn | at-base full-HP respawn, `respT=6+2·lvl+min(10,t/90)` `state.js:142`, `step.js:69-77` | fountain respawn `:5214-5218` |
| Fountains | implicit (spawn = shop anchor + respawn point) | heal + anti-camp laser `:3204, :5233, :5280` |
| Draft/champion select | DRAFT phase, `PICK_SEC=60`, `net/match.js:38-51` | select screen `:4904-4928` |
| 5v5-style team caps | `TEAM_SIZE` env (default 1v1) | 2 humans/side cap `:4532-4539` |

Also RTS-layer extras (client-only, no server counterpart): town halls/build pads, peons,
masters recruiting, legendary drops. These simply die with the renderer rework.

### 2.5 Seeded-terrain assets already in the repo

- `server/sim/rng.js` — mulberry32; the right primitive for `seed = f(hexId, …)` battlefield
  generation. Deterministic, dependency-free, ESM.
- `pve.html` has a clean **closed-form heightfield → displaced-plane-mesh recipe**
  (`heightAt` summing radial mesas + `PlaneGeometry` displacement + height-threshold prop
  scatter + river/water kit, `pve.html:1641-1767, 3228-3287`) — the *pattern* to reuse for
  seeded battlefield terrain, but note it currently uses raw `Math.random()` (not seeded) and
  lives client-side only. **No seeded/procedural terrain generator exists anywhere in the repo
  today**; index.html's vertex-color noise is seeded (`GNOISE_SEED`) but cosmetic.

---

## 3. Match lifecycle & API surface

### 3.1 How matches are created today

**There is no match-creation API.** The only way a match comes into existence:

1. Client opens WS to the game server, sends
   `{t:'join', name, slot, team, party, ps, paid, loot, wallet, paidtx}` (`net/gateway.js:28-47`).
2. The matchmaker queues the seat. Seats sharing a lobby-issued `party` id form one match when
   all `ps` (expected party size) seats arrive — or after `MATCH_GRACE_MS=12 s`. Partyless seats
   pair FIFO at `TEAM_SIZE*2` (`net/matchmaker.js:24-50`).
3. `new Match(seats)` starts **DRAFT** (champion pick + ready + optional escrow staking, 60 s
   countdown) → `begin()` builds the world **from the seats** and starts the 30 Hz `setInterval`
   loop → **LIVE** → `end(winner)` when a core dies (`net/match.js`).

The lobby (separate service, `server/lobby/`) authenticates via PG JWT, manages rooms
(`1v1|2v2|coop|grind`), and on launch tells every client "connect to the game server with party
id X" (`lobby/PROTOCOL.md`). The lobby never talks to the game server directly — **the party id
travelling through the clients is the only integration**.

**Match seeding:** `seed = (Date.now() ^ (id*2654435761))` (`net/match.js:22`) — not injectable.
For clashfront's replayable ACCELERATED battles the seed must come from the battle context
(one-line change, listed in the plan).

### 3.2 Wire protocol (authoritative path)

- Server→client: `hello{seatId,tickHz}`, `queued`, `draft{seats,pickSec,paid,escrowId}`,
  `picks`, `stakeOpen`, `staked`, `payEntry`, `lootReady`, `escrowError`, `start{matchId,seed,seats}`,
  `snap{tick,winner,bank,units[],hr[]}`, `end{winner[,aborted,reason]}`, `loot{amount,tx}`, `pong`.
- Client→server: `join`, `in{a: move|amove|stop|atk|flash|potion|recall|cast|buy|pet, seq}`
  (schema-validated whitelist, `validate.js:4-20`; 40 msg/s token bucket), `pick`, `ready`,
  `wallet`, `paid`, `ping`.
- Snapshot = **full world state as JSON at 30 Hz** (`snapshot.js`): every unit
  `{uid,k,tm,slot,x,z,hp,mhp,st,o}` + per-hero rich rows. No deltas, no interest management,
  no binary encoding. Fine at ~20 units; at army scale (600–1,200 units) this is ~1–3 MB/s/client
  — the snapshot layer must be rebuilt (plan item C3).

### 3.3 Mid-game join

- **Authoritative server path: impossible today.** Seats are fixed at `Match` construction;
  `makeWorld(seed, seated)` runs once at `begin()`; there is no late-attach path. Worse, a live
  disconnect **instantly ends the match** — `dropSeat` during LIVE awards the win to the other
  team (`net/match.js:234-236`).
- **Legacy P2P path: exists.** The P2P host lets a joiner take over an AI hero or spawn as a
  3rd/4th hero mid-game (`README_MULTIPLAYER.md:38-42`, `netHostHero` `index.html:4768`), and AI
  reclaims the hero on disconnect. **The possession model clashfront wants (docs/04 §4) was
  already proven in the P2P design** — it needs porting to the server path, not inventing.

### 3.4 How results are emitted

To clients only: `{t:'end', winner}` broadcast on the seat sockets (`net/match.js:187`). The only
external side effects are on-chain: `escrow.settle(escrowId, winningTeam)` for paid matches and
`escrow.creditLoot(...)` for grind wins (`net/match.js:190-203`). **There is no result callback,
no webhook, no persistence** (stats/geo JSONL files on the lobby box are analytics, not results).
The `EfMobaMatchReport` contract (clashfront `docs/09` §5) is 100% new surface.

### 3.5 Inter-service auth

- **Game server WS: none.** `join` trusts `name`, `slot`, `team`, `party` from the client.
  Anyone who can reach :8080 can queue, occupy seats, and (knowing a party id) sit in someone's
  match. Identity is only verified at the *lobby* (PG JWT → canonical username, `lobby/auth.js`),
  and that identity **does not travel** to the game server.
- The one real service-to-service primitive: **HMAC-signed single-use loot tickets**
  (lobby signs, game server verifies; shared `LOOT_SECRET`, 30-min TTL, nonce replay guard —
  `server/loot.js:17-35`). This is the pattern (not the code) to grow into the signed
  battle-allocation/result contract clashfront requires (mTLS+HMAC, `docs/09` §1.2/§5).

---

## 4. NPC / army capability

### 4.1 What AI exists

- **Server** (`sim/systems/ai.js`, deliberately deterministic — positions only, no RNG):
  towers re-target nearest in range each tick; minions aggro ≤16 else walk at the enemy core;
  camps leash 26 from home; **bot heroes** chase the nearest visible enemy (vision 46) else push
  the core. Bots do **not** cast abilities (auto-attack only, confirmed by `PATCH_NETPLAY.md` §8).
  Bot heroes are created by team-balancing fill at world creation (`state.js:70-85`).
- **Client** (solo/P2P host): `aiHero` with retreat/re-engage hysteresis and default-spell usage
  (`index.html:3769+`); pve.html has a richer per-mob persona state machine (aggro/chase/flee/
  leash/return) + boid separation — good behavioral reference, not directly portable code.
- **Pathfinding: none, anywhere.** All movement in all paths is straight-line steering plus
  radius push-outs. No A*, no flow fields, no navmesh, no grid.

### 4.2 Can it simulate hundreds of units per side?

Current-state answer: **the architecture yes, the implementation no.**

- Entity model is cheap: plain JS objects, ~20 numeric fields, in one `Map` (`state.js:12-39`).
  Memory at 2,000 units is trivial.
- The blocker is **O(n²) proximity queries**: `nearest()` (`state.js:113-120`) linearly scans all
  units and is called per unit per tick by tower/minion/camp/bot AI, and `aoe`/`lineShot`
  abilities also scan all units (`abilities.js:41-55`). At 1,200 units × 30 Hz that is
  ~4×10⁷ distance checks/s *per match* in the hot path — likely still feasible on one core in
  isolation, but not for 50 concurrent matches, and it degrades quadratically exactly when
  battles get interesting. A spatial hash + squad-level (not per-soldier) decisions is mandatory
  (plan item C).
- Observed scale today: ~10–40 units per MOBA match; pve.html pushes ~60–130 client-side without
  a fixed tick. `SERVER_PLAN.md` sizes one c7g.large box at "200 ccu ≈ 50–100 matches" for
  MOBA-scale entity counts. No load test exists for army counts — treat army-scale perf as
  **unvalidated** until plan item C's benchmark.

### 4.3 Headless auto-resolve feasibility: HIGH

`test/goldenmaster.js` already does it: builds a world, loops `step()` 1,200 ticks synchronously
(no timers, no sockets), and asserts identical end states across runs. AUTO/ACCELERATED
resolution is therefore structurally proven:

- sim is pure and deterministic (mulberry32; AI uses no randomness; inputs are the only
  external factor — and in an all-AI battle there are none);
- a fast-forward runner is a `while (world.winner == null && tick < cap) step(world, dt, EMPTY)`
  loop — 25 min of battle at 30 Hz = 45,000 steps, sub-second at MOBA entity counts;
- missing pieces are only: constructing the world from a **battle context** instead of WS seats,
  a non-core win condition, and result extraction (plan items D/E).

One determinism caveat: ability cast handlers swallow errors (`try { ab.f(h, pt) } catch {}`,
`step.js:48`) — a hidden exception could silently fork sim behavior across versions; fine for
one process, worth tightening when replays/audit matter.

### 4.4 Existing capability summary

| Need (clashfront) | Today | Distance |
|---|---|---|
| Deterministic seeded sim | ✅ proven (golden-master) | seed injection only |
| Headless no-client match | ✅ structurally (test path) | needs runner + context |
| Bot backfill of heroes | ✅ at match start | needs mid-match possession |
| Hundreds of NPC soldiers/side | ❌ O(n²), no squads | spatial hash + army model |
| Terrain-aware combat | ❌ nothing server-side | green-field build |
| Match API + result callback | ❌ WS-join only | new HTTP adapter |
| Service auth | ❌ (HMAC ticket pattern only) | extend pattern |

---

## 5. Reuse verdicts

### KEEP AS-IS (foundation)

- `server/sim/step.js` fixed-timestep + input-queue shape; systems ordering (AI→combat→movement).
- `server/sim/rng.js` (mulberry32) — also the seed primitive for battlefield generation.
- `server/sim/state.js` `mkUnit`/`Map` entity model (extended, not replaced).
- `server/validate.js` input whitelist + rate limiting.
- `net/gateway.js` WS handshake shape; Nagle-off snapshot pacing insight (`gateway.js:14-16`).
- Golden-master testing methodology (`test/goldenmaster.js`) — extend to battlefield generation
  (same hexId+state ⇒ byte-identical terrain) and battle replays.
- Client prediction/interpolation/reconciliation machinery (`index.html:4773-4823`, `ackSeq`
  plumbing) — netplay feel survives the map change untouched.
- `shared/ef_core.js` hero kits/anim/SFX — hero drop-in keeps element kits per canon.
- Lobby PG auth (`lobby/auth.js`) for *player* identity; HMAC ticket pattern (`loot.js`) as the
  seed of *service* auth.
- pve.html heightfield→mesh + prop-scatter + water recipes as the terrain-generator pattern.

### MODIFY

- `makeWorld` — split into `makeBattle(context, battlefield)`: spawn zones from battlefield data,
  units from army stacks, win condition per `BattleType`. The bot-fill idea survives as officer
  backfill.
- `Match` lifecycle — DRAFT becomes the clashfront LOBBY window; external seed; remove
  leaver-forfeit (AI resumes per docs/04 §6); allow seat attach/detach while LIVE; emit result
  callback at end. Escrow settle stays only for legacy PvP mode (Clash Front stakes are *not*
  per-match escrow — outcomes flow through the overworld).
- `matchmaker` — becomes "match registry": matches are created by the allocation API, seats join
  *into* an existing match by battle ticket, FIFO queue kept only for the legacy MOBA mode.
- `snapshot.js` — delta + area-of-interest + aggregate squad records at army scale.
- `combat.js`/`ai.js` — spatial-hash queries; squad AI layer above per-unit reflexes.
- `movement.js` — clamp against battlefield bounds polygon + obstacle/terrain costs instead of
  the square; pathfinding for non-hero units.
- Client `index.html` map layer — replace baked square arena with battlefield-from-server data
  (§2.2 inventory: ground/clamp/minimap/camera/scatter all keyed off `MAPK`).

### DELETE (for Clash Front battles; legacy MOBA mode may retain them behind a flag)

- Lanes, minion waves, towers, cores + tower-gated core shield, jungle camps, masters,
  build pads/peons/wood, item shop + fountain-proximity shopping, at-base respawn loop,
  champion-select DRAFT UI (replaced by overworld lobby), surrender.
- Client P2P host/guest netcode (PeerJS path) — superseded by the authoritative server; keep only
  as reference for the mid-game possession UX it already implements.
- `Date.now()`-derived match seeds.

### FLAGS (things that make hex/terrain-heavy maps hard)

1. **No pathfinding exists** — with real obstacles, straight-line steering visibly breaks; this
   is the single largest new system (see plan item C2).
2. **Square assumptions client-side** are pervasive but shallow — ground plane, `clampMap`,
   minimap projection, camera bounds, scatter keep-outs — all keyed to `MAPK`/literals
   (§2.2 has exact lines).
3. **Dual-map divergence** (§2.3) — battlefield data must have exactly one source.
4. **Full-snapshot netcode** won't carry armies (§3.2).
5. **Monolithic obfuscated client** — every client change is an edit to a 500 KB single file;
   budget extraction work (or accept slow client iteration) in the plan.
6. **No fog of war / vision system** if battle design ever wants it (currently full vision).
7. **`BATTLE_TICK_MS` canon mismatch** (§1.5).

---

## 6. Ambiguities & unknowns (explicit)

- **Battlefield component dimensions** — blocked on the parcel-size extraction (maps session).
  Everything in the plan sizes spawn zones/army caps against "smallest parcel"; numbers TBD.
- **Which netcode path is live in production** for the deployed client (P2P vs server transport)
  — code contains both; docs imply migration to the server path; unverified against the deployed
  site.
- **games-etherfantasy-backend as accounts/heroes SoT** — not inspected this session (out of
  brief scope); the lobby's PG identity integration suggests Pentagon Games account API is the
  identity SoT, but hero *ownership* linkage is unconfirmed.
- **Army-scale server perf** — no benchmark exists; §4.2 estimates need validation before
  committing to per-soldier entity counts (vs. abstracted squads).
- **Asset licensing/fit for battlefield props** — client GLB/procedural assets reviewed only as
  code, not for art direction fit with hex battlefields.
- Client ability primitive internals (`aoe/castAt/lineShot` client bodies) were confirmed by
  signature, not read line-by-line; server mirrors were read fully.
