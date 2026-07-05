# HANDOFF — Battle · Command Mode · Hero Mode · Maps (integration completion)

> **Purpose.** Stand up a DEDICATED session that finishes the end-to-end battle path without the
> product owner middle-manning cross-session coordination. This doc is the single onboarding
> surface: architecture, exact contracts, what's DONE vs REMAINING, who owns each remaining piece,
> how to test, and the known blockers. Read this, then the linked contracts, then drive to green.
>
> **Scope owned by this handoff:** the seam from an overworld march → a battle the player can WATCH
> in command mode on the real MOBA map → and (optionally) DROP INTO as their Master in the 3D client
> (hero mode), plus getting per-parcel MAPS to flow. Everything CF-side is built and deployed; the
> remaining work is mostly in the MOBA repo sessions + a few CF follow-ups listed at the end.
>
> **Repos:** CF overworld = `blockchainsuperheroes/etherfantasy-clashfront` (this repo). Battle
> engine + 3D client = `blockchainsuperheroes/etherfantasy-browser-moba-game` (NOT in CF session
> scope — coordinate via the sessions below). Live box: **13.250.39.41**; CF deploys to
> **cf.etherfantasy.com**, MOBA to **moba.etherfantasy.com**.

---

## 1. Architecture — the four layers and the data flow

```
   OVERWORLD (CF, this repo)                MOBA repo (browser-moba-game)
   ┌───────────────────────┐   allocate    ┌──────────────────────────────┐
   │ sim-engine tick loop   │ ─── R1 ──────▶│ BRIDGE LAYER                 │
   │  · march + commandIntent│               │  · mint match + join ticket  │
   │  · createEngineBattle   │◀── R10 ───────│  · makeBattleWorld           │
   │    (LIVE/QUEUED/ACCEL)   │  HMAC callback│  · battle_hello + map layout │──▶ MATCH SERVER
   │ apps/server             │               │  · relay telemetry → CF      │    (network F5 Fork)
   │  · /api/state, WS        │  battle_hello │                              │    30 Hz match loop,
   │  · command view (battle.js)◀── relay ────│                              │    addSeat, snapshots
   │  · ⚡ hero doorway (joinUrl)              └──────────────────────────────┘
   └───────────────────────┘                              │ ticket
            ▲                                              ▼
            │ /api/land-owners, invest              3D CLIENT (OP 48)
            ▼                                       index.html — ticket=login bypass,
   MAP MAKER (F5) — per-parcel Battlefield JSON     auto-seat as your Master, joinAlly
```

- **Overworld sim (CF):** deterministic tick engine. A march that collides with a hostile/wild
  parcel becomes an **engine battle**. Mode is decided deterministically: **LIVE** (30 Hz, joinable)
  only if a participant pre-committed COMMAND and capacity allows; otherwise **ACCELERATED**
  (headless, playback-only). See §3.
- **Bridge layer (MOBA):** CF POSTs `allocate`; the bridge mints a match + join ticket, builds the
  battle world, and relays telemetry back to CF as `battle_hello` + `battle_tick` frames. Settles
  via an HMAC callback to CF.
- **Match server (MOBA, network F5 Fork):** the actual 30 Hz match loop; keeps the match open for
  the join window so a hero can late-seat.
- **3D client (MOBA, OP 48):** the player embodies their Master; a ticket bypasses login and
  auto-seats them.

**The golden rule that makes it all align:** ONE coordinate frame and ONE map schema. The command
view and the 3D match render the SAME `Battlefield` JSON in the SAME ±161 world-unit frame — see §5.

---

## 2. Sessions & seams (use these EXACT names; never say "netcode"/"the server")

| Session (verbatim) | Repo | Owns | Remaining for E2E |
|---|---|---|---|
| **Clash Front Overworld design** | `etherfantasy-clashfront` | CF game-dev, overworld UI, canon, all `briefs/*`; `BATTLE_ENGINE_URL` wiring; deploys cf.etherfantasy.com | CF follow-ups in §9 (command-queue build, CT reprice, maps Hooks 2–3) |
| **EF v2 Moba Server (network) (F5 Fork)** | MOBA | match server: 30 Hz loop, `addSeat`, snapshot streaming | Keep match LIVE for the join window + late-seat (reports DONE + probed — **retest**) |
| **EF v2 Moba Server (bridge layer)** | MOBA↔CF | allocate, ticket mint/verify, `makeBattleWorld`, **map layout in `battle_hello`**, telemetry relay | ① send the REAL loaded map layout in `battle_hello` (not a bare square) ② **auto-register the command channel from allocate** so CF's command view can subscribe to a LIVE engine battle |
| **EF Moba game dev OP 48** | MOBA (3D client) | `index.html` 3D client; hero-mode entry | Make the deployed client honor the ticket (login must not flash) + auto-seat as `youHn` |
| **EF v2 CF Moba (map maker) (F5)** | CF↔MOBA | LLM-generated per-parcel `Battlefield` JSON | Author per-parcel terrain to fill the ±161 frame at ~0.74 m/unit; flow designs through the registry |
| **MOBA BattleEngine** | courier MOBA↔CF | delivers real maps + battle data onto the CF side | Deliver a real `data/moba-maps/legacy.json` (CF loader already prefers it) |

**Seams:** bridge ↔ OP 48 = join-ticket format (`ALLOCATE-CALLBACK-SCHEMA.md` §1b); map maker ↔
bridge (via MOBA BattleEngine) = `Battlefield` JSON (`BATTLEFIELD-SCHEMA.md`); network ↔ OP 48 =
keep-match-live so the client can late-seat.

---

## 3. Battle system — allocate / callback / mode selection

**Contract:** `docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md` (R1 allocate, R10 HMAC callback, R13 rates,
§1b join tickets). **CF impl:** `apps/server/src/game.ts` `engineAllocateContext` + the tick loop;
`packages/sim-engine/src/engineBattle.ts` (`createEngineBattle`, `promoteQueuedEngineBattles`).

- A hostile co-location becomes a **PENDING ENGINE BATTLE**: the hex locks (further marches 409
  `ENGAGED`), CF POSTs `allocate` with the exact §1 payload (Authorization bearer + `Idempotency-Key:
  <battleId>`), and settles on the HMAC callback next tick (determinism preserved — engine results
  apply as server-boundary inputs).
- **Allocate failure ⇒ automatic fallback** to instant internal resolution (never brick a battle).
- **Mode (docs/04 §3a):** `LIVE` iff a participant pre-committed COMMAND **and** the live pool has
  room (else `QUEUED`, promoted when a slot frees, else `ACCELERATED` after
  `commandQueueTimeoutTicks`). No command ⇒ `ACCELERATED`. `CF_LIVE_BATTLES=0` forces accelerated.
- **Result callback** reports winner/reason + **casualties per side per UnitClass + structure damage
  per anchor + duration** — enough for CF to settle army stocks, landlord payout (maps Hook 3), and
  the review ring.

**Status: CF side DONE & DEPLOYED.** The engine battle lifecycle, allocate payload (±161 battlefield,
real officer `masterId`/`slug`, `joinWindowSec`), HMAC verify, fallback, and mode selection all ship
and are tested (`apps/server/test/engineBattle.test.ts`, `packages/sim-engine/test/engineCommand.test.ts`).

---

## 4. Command mode — the top-down command view

**CF impl:** `apps/server/public/js/battle.js` (data-driven `Battlefield`-JSON renderer),
`apps/server/src/bridge.ts` + `game.ts` `battleStatic` (attaches the `battlefield` to `battle_hello`).

- Every LIVE battle streams over the WS battle channel: `{t:'battle_sub'}` → `battle_hello` (static
  field incl. `battlefield` + first snapshot) → `battle_tick` frames. The command view renders the
  **exact map the 3D match plays on** (same `Battlefield` JSON) with the live unit snapshot on top.
- **The map renders even before units stream** — `battle_hello` always carries a well-formed (empty
  if needed) snapshot, so the ±161 map draws during the staging window with nothing moving.
- **Subscribe robustness (added 2026-07-05):** allocate → bridge-relay-bind is async, so a command
  view opened a beat early gets `NO_BATTLE`. The client now HOLDS the "relay connecting…" state and
  **re-subscribes until the bridge binds** (then `battle_hello` arrives and the map appears), bounded
  to ~2.2 min. **This is why the bridge layer MUST auto-register the command channel from allocate**
  — if it never binds, the retry eventually gives up.

**Command QUEUE economics (docs/04 §3a, decision 16 — CANON LOCKED, CODE PENDING → §9):**
command is a **pre-commitment bought at MARCH time**; a fee LADDER `commandFeeLadderCt = [1,3,5,10,20]`
CT by concurrent queue depth (max 5), non-overlapping in time, cancellable (refund), and NO late
command ("⚔ Battle already started — it's too late to take command now").

**Status: CF renderer DONE & DEPLOYED + under test** (`battlefield.test.ts`, `bridge.test.ts`).
**REMAINING (bridge layer):** ① send the REAL map layout in `battle_hello` (§1a of the allocate doc —
a bare square makes the top-down look nothing like the 3D match) ② auto-register the command channel
from allocate.

---

## 5. Coordinate frame & the map schema (the alignment keystone)

**Contract:** `docs/briefs/BATTLEFIELD-SCHEMA.md`. **Ratified canon 2026-07-05.**

- **Fixed ±161 world-unit arena for EVERY battle** (`sizeM = 322`), center-origin, +z north,
  blue/ATTACKER SW / red/DEFENDER NE, **spawns ±131.6, cores ±114.8**. Consumed **AS-IS — never
  ×MAPK** anywhere in the CF path.
- Coords are **dimensionless world-units**; the declared mapping is **±161 frame ≡ 1 CF parcel ≡
  ~14 acres → ~0.74 m/unit** (a label, never a runtime transform).
- **Estates don't grow the arena** — an estate is a SERIES of ±161 component battles (canon decision
  4), so parcel size scales army/structure/component COUNT, not arena size. The MOBA never changes
  arena scale.
- **Source of truth = the MOBA BattleEngine's `legacy.json`.** CF's loader
  (`apps/server/src/battlefield.ts`) PREFERS `data/moba-maps/legacy.json` if present, else the
  rescaled stand-ins `legacy-3lane.json` (estates/default) / `legacy-1lane.json` (single parcels) —
  all valid `Battlefield` JSON passing the 5 playability invariants.

**Status: CF side DONE.** **REMAINING:** MOBA BattleEngine drops a real `legacy.json`; map maker (F5)
authors per-parcel designs at ~0.74 m/unit. Both are zero-change on the CF renderer (same schema).

---

## 6. Hero mode — the ticket / ⚡ doorway

**Contract:** `ALLOCATE-CALLBACK-SCHEMA.md` §1b (join tickets) + §3b (live duration/window).
**CF impl:** allocate-response join grants persisted on the pending record; `joinUrl` PRIVATE to its
governor (owner-only `/api/state` `liveBattles` + strictly-private `battle_joinable` event); the
owner gets a gold **⚡ Take the field** button on the parcel card (`battle.js`).

- **Ticket (bridge mints at allocate for `mode:"live"`):** `base64url(payload).base64url(HMAC)` over
  `{m:matchId, g:governorId, u:userRef, side, exp}`, `exp ≤ join deadline`. The client boot parser
  accepts `match` + `ticket` URL params (OP 48 DONE) and forwards them in the `{t:'join',v:2}`
  handshake; validation seats the player as their Master (ONE-HERO per user).
- **Join window = ⚙ `battle.joinWindowSec` = 90 s** (CF sends it in the allocate context; matches the
  match server's staging window). The player has 90 s from battle start to take the field.
- **Command↔hero exclusivity (decision 11):** while embodied you cannot issue commands; multiple
  Masters may fight on one map but a user embodies exactly one at a time.

**Status: CF side DONE & DEPLOYED** (doorway, ticket passthrough shapes, join-window dial).
**REMAINING:** ① **network F5 Fork** — keep the match open ~10–15 min for the window (reports DONE +
8.1-min probe — **retest**) ② **OP 48** — the deployed client must actually honor the ticket (login
must not flash) + auto-seat as `youHn`.

**How to test hero mode end-to-end:** log in (PG), **March & Command** onto a battle, open the command
view (it now waits for the relay), and when `joinUrl` lands click **⚡ Take the field**. If the 3D
client still shows a login screen after a hard refresh, that's an OP 48 client-logic bug, not CF.

---

## 7. Maps — generation + the economy seam

**Contracts:** `BATTLEFIELD-SCHEMA.md` (the map), `docs/maps/ECONOMY-SEAM.md` + `docs/maps/README.md`
(the three CF↔maps hooks).

- **Hook 1 — ownership feed (DONE, CF):** `GET /api/land-owners → { owners: { parcelId: pgUsername } }`
  for PLAYER-owned parcels (canonical PG username). Activate on the box: `echo
  'http://localhost:8130/api/land-owners' > ~/.ef_maps_owners_url && pm2 restart ef-moba-lobby`.
- **Hook 2 — invest CT → map budget tier (PENDING, CF §9):** charge CT, then
  `POST moba.etherfantasy.com/internal/v1/designs/:parcelId/invest {level:0..5}` with `x-maps-key`
  (`~/.ef_maps_key` on the box). Tier persists, takes effect on the next design version.
- **Hook 3 — landowner payout (PENDING, CF §9):** compute the landlord's cut from the casualty
  callback (§3) at settlement — no maps-side work.
- **Per-parcel generation (map maker F5):** LLM emits generator PARAMETERS + a bounded `features[]`
  DSL (never raw geometry); deterministic + validator-gated. Until it lands, EVERY battle uses the
  stand-ins (§5).

---

## 8. Config, env & how to deploy / test

**Env (CF server; `deploy/remote-deploy.sh` sources secrets from `~/.cf_*` files):**
- `BATTLE_ENGINE_URL` (unset = engine OFF, instant resolves) · `CF_BATTLE_API_TOKEN` ·
  `CF_BATTLE_HMAC_SECRET` · `PUBLIC_BASE_URL` · `CF_LIVE_BATTLES` (0 = kill live).
- `PG_APP_KEY` (unset = dev name-only login) · `PG_API_URL`.
- `MASTERS_API_URL` (default `https://api.etherfantasy.com`; the box MUST reach it).
- `CF_MOBA_MAPS_DIR` (override for `data/moba-maps/`).
- `~/.ef_maps_owners_url`, `~/.ef_maps_key` (maps hooks, on the box).

**Deploy:** push `claude/clash-front-overworld-mkcyia` → `deploy/cf-mvp`; GitHub Actions self-hosted
runner deploys to cf.etherfantasy.com. Verify via the Actions run conclusion.

**Local dev:** `pnpm install && pnpm -r build && pnpm -r test` (must stay green — currently 4 +
sim-engine + server suites). Run the server with `tickMs` set; drive the client at `localhost`.

**Fastest way to SEE the command map (isolates CF from the live ticket path):** on any parcel card
click **⚔ Stage exhibition battle** → open it → the ±161 stand-in battlefield renders in command view.

---

## 9. Status matrix + the exact remaining work

**DONE & DEPLOYED (CF):** engine-battle lifecycle (allocate/callback/fallback) · ±161 battlefield in
the allocate context · command-vs-auto mode selection · command-view `Battlefield` renderer +
subscribe-retry · recent-battles review · hero-mode ⚡ doorway + private joinUrl · 90 s join-window
dial · PG login + Masters roster gate · battlefield stand-ins + real-`legacy.json` preference ·
`/api/land-owners` (maps Hook 1) · battle-start ETA badge on the map · self-serve exhibitions.

**REMAINING — MOBA repo (route to the named session):**
1. **bridge layer** — send the REAL map layout in `battle_hello`; auto-register the command channel
   from allocate (unblocks the live command view). *Highest-leverage remaining item.*
2. **network F5 Fork** — keep the match live for the 90 s window + late-seat (retest; reportedly done).
3. **OP 48** — client honors the ticket (no login flash) + auto-seats as the player's Master.
4. **MOBA BattleEngine / map maker F5** — real `legacy.json`, then per-parcel designs at ~0.74 m/unit.

**REMAINING — CF (this repo; canon locked, code pending):**
- **Command QUEUE build (decision 16):** fee ladder `commandFeeLadderCt=[1,3,5,10,20]` CT (max 5),
  non-overlap by `commandWindowTicks`, cancel + refund, "too late" rejection. Touchpoints:
  `packages/shared/{balance.json,src/balance.ts}`, `packages/sim-engine/src/engineBattle.ts`,
  `apps/server/src/game.ts` (`march` + a new cancel order), `apps/server/public/js/{ui,app,map}.js`,
  tests (`engineCommand.test.ts` churn). Replaces the fixed `commandSlotsPerPlayer` cap.
- **CT economy re-scale (owner 2026-07-05):** 1 CT ≈ $0.10; start balances ≈ 5 / 50 / 500 CT; most
  actions (e.g. raise a soldier batch) ≈ 1 CT. The current `balance.json` (train 20 000 units/soldier
  = 2 CT, claim 500 000 = 50 CT/step, develop 1 000 000 = 100 CT) is **10–100× too dear** for those
  balances — re-scale the whole CT column down and re-baseline `startCtUnits`/`npcCtUnits`. Integer
  money is canon (`docs/AGENTS.md`); keep everything in `ct_units` (`CT_UNITS_PER_CT = 10 000`).
- **Maps Hook 2 (invest → budget tier) + Hook 3 (landowner payout).**
- **Sealed-reveal review follow-up** (auto battles reveal on the normal timeline; `balance.review.
  revealDurationTicks` reserved, designed-not-wired).

**Known blocker chain for "watch on the same map, then take the field":** ①bridge auto-registers +
sends the real map → ②CF command view subscribes and shows the live map (CF ready) → ③network keeps
the match open → ④OP 48 client honors the ticket. CF is ready at every CF step; the chain is gated on
the MOBA sessions above.

---

## 10. Prime directives for whoever picks this up

- **Determinism** (no `Date.now`/`Math.random` in sim), **integer money** (`ct_units`), **canon
  names**, **doc-first** (never change a contract without updating its brief + `docs/08`/`README`).
- **One frame, one schema:** never introduce a second coordinate convention or a parallel navmesh —
  ±161 world-units + `Battlefield` JSON (A1) is the single source both clients consume.
- **Retry differently** on failure (owner rule): change the approach each attempt, don't repeat.
- Keep `pnpm -r build && pnpm -r test` green; deploy via `deploy/cf-mvp`; refer to every session by
  its exact name in §2.
