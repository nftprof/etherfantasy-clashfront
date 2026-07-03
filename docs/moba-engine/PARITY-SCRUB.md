# Parity scrub — single-player vs server (net) mode

> 2026-07-03 audit. The single-player client runs the FULL local game; the server sim
> (`server/sim/`) is a parallel re-implementation, so anything not explicitly ported is
> silently missing or different in co-op/PvP. This is the definitive diff, with status.
> Rule going forward: **any gameplay change in index.html's local mode needs a matching
> sim port (or an entry here), or the modes drift again.**

## ✅ Fixed in this pass (v2.2)

| # | Gap | Was | Now |
|---|-----|-----|-----|
| 1 | **Hero move speed** | server 30 u/s vs single-player 16 — net heroes moved ~2× faster (the deepest "doesn't feel like SP" cause) | 16, client prediction HS matched |
| 2 | **Minion stats** | 220hp/22dmg/range6/speed 22 (2.4× too fast) | client-exact: 160hp/14dmg/range2.5/speed 9/atkSpd .8 |
| 3 | **Heavy soldiers** | didn't exist on server | 1 per lane per wave (500hp/24dmg/range3/speed7/atkSpd.6, `soldier` kind, `bigminion` model) |
| 4 | **Lanes** | ONE implicit lane (spawn → diagonal to core) | the client's 3 lanes (mid/top/bot) as waypoint marches, ×MAPK-scaled to the same coords |
| 5 | **Wave scaling** | none | +8%/min, cap +120% (client curve) |
| 6 | **Minion cap** | none | 32/team |
| 7 | **First wave** | 12s | 2s (client pacing) — shipped in v2.1 |
| 8 | **Tower stats** | 1600hp/95dmg/range24/atkSpd.8 | client mkTower: 1400/85/21/1.0 |
| 9 | **Recall** | set a state and did nothing | real 4s stand-still channel → teleport home + full hp/mp; any damage interrupts |
| 10 | **Basic-attack projectiles** (net render) | invisible | target uid on wire + cosmetic shots (v2.1) |

## ✅ Fixed in v2.3 (2026-07-03)

| # | Gap | Resolution |
|---|-----|-----------|
| A | **Per-champion hero stats** | `sim/heroes.js` mirrors HERO_PROFILE (Irene 660/48/r11/as1.05, Leah 600/56/r10/ms15, **Kai 780/60/r3 MELEE**) + the client-default 660/46/r3/ms16 baseline (= what SP gives Masters/mons with no profile; bots too). Pick message now carries the hero NAME (`hn`) — server whitelist lookup only, uninjectable. Client prediction speed now per-champion (`NET.myMs`, e.g. Leah 15). |
| B | **Obstacles / collision** | Server generates the obstacle field **seeded from the match rng** in `makeWorld` (client placement bands ×MAPK + structure clearance) → circle push-out in `movementSystem` (covers flash-into-rock) → list ships in the `start` payload → net-mode clients REPLACE their local random collision array with it (walkable/moveTo/build/minimap all read that array). NOTE: SP clients roll their own random scenery per load, so a shared field was impossible without the server owning it. |

## ⚠️ Still missing / different (flagged, with suggested owner)

| # | Gap | Detail | Owner / note |
|---|-----|--------|--------------|
| B2 | **Net-mode scenery visuals** | Collision now uses the server field, but the client still *draws* its local random rocks/trees — some drawn scenery isn't solid and some solid spots look empty. | Game-dev: in net mode, rebuild the visual scenery from the `obstacles` array (their tree/rock builders already take x,z) — pure cosmetic pass. |
| A2 | **Kai's custom Q (Crescent Cleave)** | SP swaps Kai's Q for a 180° frontal cleave; the server kit keeps the element Q. | Port the cleave into sim/abilities.js keyed off hn==='Kai' (small). |
| C | **Map layout** | SP: towers per lane, bases/town halls, spawn heal zone; server: 2 towers/team on mid only, no bases/heal. | Game-dev + me; part of the same battlefield-data move as B. |
| D | **Type effectiveness** | SP: typeMult (super-effective by mon types) on every hit; server: none (elements exist, types don't reach the sim). | Port with A (types ride the same shared table). |
| E | **Pets** | SP: summonable pet w/ own kit + heal; server: `pet` kind renders but is never spawned. | Sim port, medium. |
| F | **Items** | server has 8 basic items (mirrored) but SP has legendaries + drop-on-death + loot; also SP shop gating = near town hall/spawn, server gate = spawn dist only. | Two layers: basic-shop drift check (small), legendaries/drops (content). |
| G | **Evolution** | SP: Form-2 model swap + stat boost; server: none. | Content port (game-dev), sim side mechanical. |
| H | **Master helpers** | SP: recruitable neutral champions (walk-up take-command). Server: none — but this IS the Clash Front possession mechanic (D2b), so it lands with CF M2. | CF track. |
| I | **Ability VFX for remote casts** | Server doesn't broadcast cast events → enemy spells are invisible (damage just appears). Own casts show local FX only. | Me — add a cast-event section to the v2 wire (uid, ability, x,z), client plays the same castAt/fxRing visuals. Next netcode item. |
| J | **Shift order queue** | SP: 24-deep order queue per unit (pumpQueue); guest mode explicitly disables it ("server owns ordering"). | Client-side re-enable: keep the queue locally, send next input when the current completes. |
| K | **Air units / canHitAir** | SP melee can't hit flyers; server has no air flag. | Port with A/D. |
| L | **Wave spawn stagger** | SP staggers minions 0.7s apart (cosmetic); sim spawns each wave atomically with offsets. | Accepted difference (determinism-friendly). |
| M | **Kill/death cosmetics** | First Blood banner, kill feed, streaks — client-side, partially driven by local-only events. | Client polish; can key off hr kill deltas. |

## How to keep this from drifting again

1. `server/sim/` mirrors ef_core.js for abilities — extend that pattern: **one shared
   stats/types/items module** consumed by BOTH the local client and the sim (item A/D/K).
2. **Battlefield data** (CF A1 schema) becomes the single source for map layout/obstacles (B/C).
3. Any index.html gameplay edit that touches numbers → grep this file; if the system is
   ported, mirror the change in `server/sim/` in the same commit.
