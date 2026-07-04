# CF battle integration — M1 status: what the bridge has NOW vs what's PLANNED

> From the **bridge layer** (match-server). This is the authoritative "what can the overworld rely
> on today, and what's coming" for the CF↔engine seam. Field-level, because the overworld consumes
> the callback + telemetry. Updated 2026-07-04.

## 1. Live now in M1 (built, deployed on `cf-battle-api` :8140, suite green)

| Capability | State |
|---|---|
| **R1 allocate** `POST /internal/v1/matches/allocate` | ✅ accelerated (headless resolve+callback) **and** live (game-server match + ticket + joinUrl); Bearer-gated; idempotent by battleId |
| **R2 deterministic sim / external seed** | ✅ `seedU32(hex)`; sim pure/deterministic |
| **R11 tamper-proof** | ✅ `finalChecksum` + `journalHash` + `verifyResult` |
| **R12 headless runner** | ✅ `runBattle(context)→report` |
| **R13 rates** | ✅ `tickHz` per-match, echoed back |
| **M1.5 telemetry relay** | ✅ `cfpump` auto-registers a live match (start w/ joinUrl → ⚡), 3 Hz snapshots, command poll, end |
| **Hero-mode join ticket** | ✅ mint/verify, one-time, matchId-bound, joinUrl |
| **Map layout (battle_hello)** | ✅ REAL map at ratified **±161 frame** (sizeM 322): cores ±114.8, spawns ±131.6, **6 towers/side**, 3 lanes (LANES×MAPK), obstacles, camps — matches `legacy.json` |

## 2. The R10 result callback — field-by-field: REAL vs PLACEHOLDER/PLANNED

This is the table the overworld should trust against. `POST <callback.url>`, HMAC `X-CF-Signature`.

| Field | Now | Notes |
|---|---|---|
| `outcome.winner` (ATTACKER/DEFENDER/TIE) | ✅ **real** | from sim `winner` |
| `outcome.reason` (CORE_DESTROYED / FOOD_CLOCK / TIMEOUT) | ✅ **real** | |
| `sides.*.casualties` per UnitClass | ✅ **real** | death-hook tally (`world._deaths`) |
| `sides.*.survivors` per UnitClass | ✅ **real** | alive army units by cls |
| `structures[]` (anchorId, hp, destroyed) | ✅ **real** | live tower/core hp |
| `officers[].contribution.kills` | ✅ **real** | reads `hero.kills` |
| `officers[].state` (ALIVE / KO) | ⚠ **real once F5 wires revive enforcement** | KO = dead AND revive budget exhausted; plumbing done my side |
| `officers[].revivesUsed` | ⚠ **real once F5 wires** | I surface `hero.reviveBudget`; sim must `revivesUsed++`/stop respawn |
| `clock` (tickCount/durationSec/tickHz) | ✅ **real** | |
| `verify` (finalChecksum/journalHash/seed) | ✅ **real** | |
| `officers[].contribution.structureDamage` | ⛔ **placeholder 0 → PLANNED** | needs per-hero structure-damage hook |
| `officers[].contribution.damage` | ⛔ **placeholder 0 → PLANNED** | needs per-hero damage-dealt hook |
| `sides.*.provisionsConsumed` (food/gold/wood) | ⛔ **`{}` → PLANNED** | needs consumption/loot tracking |

**So today the overworld can settle on:** winner/reason, **army stock (casualties+survivors per class)**,
structure damage per anchor, officer kills, duration, and the verify block. Officer KO/revives go live
the moment F5 wires enforcement (see §4).

## 3. What I plan to ADD (bridge scope, in priority order)

1. **Officer `contribution.damage` + `structureDamage`** — add a per-hero stat accumulator in the sim
   (`hero.dmgDealt`, `hero.structDmg`), read them in `buildCallback`. Same pattern as the death hook.
   RAW/uncapped (overworld applies `HERO_IMPACT_MAX`). *← the officer-contribution question.*
2. **`provisionsConsumed`** — track food/gold/wood drawn during the battle (wave stock cost, CC tier
   spend) + looted, report per side.
3. **Food-clock → duration** — set `maxTicks` from `context.provisions.food` so the battle ends on the
   real food clock (~10–15 min), not just the 45-min backstop.
4. **R3/R5 faithful battlefield-from-JSON** — when the map-maker (F5) emits real per-parcel maps,
   `makeBattleWorld` positions the world FROM `context.battlefield` (bounds/spawnZones/structures)
   instead of the built-in MOBA map. Today: built-in map (M1-minimal), which now matches `legacy.json`.
5. **R8 reinforcement (D1b)** — `POST …/reinforce` (new edge lane + officer). Reserved for **v2**;
   client `joinAlly` already speaks the shape.

## 4. Pending seams owed by EF v2 Moba Server (network) (F5 Fork) — gate live-mode

I've plumbed the bridge half of both; they need the sim/match half:
1. **R4 finite army stock:** `createLiveMatch` → `makeBattleWorld(context, {stockWaves:true})`;
   `spawnWaves` drains `world._armyStock[team]` (`{0:int,1:int}`), stops line-spawns at 0. Player-spawned
   units exempt. *Until wired: live battles spawn wrong → wrong count + resolve too fast.*
2. **R6 revive budget:** respawn logic enforces `hero.reviveBudget` — `revivesUsed++` per respawn, **no
   respawn when `revivesUsed >= reviveBudget`** (officer stays KO). Infinity = endless (normal matches
   untouched). *Until wired: Masters respawn forever; my `state`/`revivesUsed` report ALIVE/0.*

## 5. Also open (other owners, not bridge)
- **OP 48 + deploy — login-bypass** on `/play` (the #1 demo blocker; ticket/joinUrl are correct).
- **Officer `contribution` beyond kills** — bridge will add it (§3.1); overworld confirms it's M1-needed.

**Bottom line:** allocate/callback/verify/relay/ticket/map are live and correct at M1. The gaps are
(a) two F5 sim seams that flip officer-KO + finite-waves from plumbed→live, and (b) my planned
contribution/provisions fields — none blocking the resolution loop today.
