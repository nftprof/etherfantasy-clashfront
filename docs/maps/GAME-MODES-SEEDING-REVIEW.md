# CF map game modes — full seeding review (owner ask 2026-07-14: "does it all make sense")

> Audit of how every generated parcel seeds ALL battle modes, mapped to the owner's scenarios.
> Findings applied same-day (GEN_VERSION 4): geometry-based mode support + fair-subset CLASH rule.
> Result on a 40-parcel EDU sample: **DUEL 40/40 · SIEGE 40/40 · GUARD 40/40 · CLASH 39/40 ·
> DOMINION 39/40** (was CLASH 16/40 before the fix).

## 1. The owner's scenarios → modes (the taxonomy, now canon in `schema.js MODES`)

| Scenario (owner's words) | Mode | Setup on the seeded map |
|---|---|---|
| "the MOBA equivalent — two sides have CC" | **DUEL** | `atk_S` base (SW) vs `def_base` (NE, relocates INTO the castle courtyard when the parcel has a world fortification) — both sides a CC, **raze to win**. Estates' 3-lane arena = the full MOBA layout. |
| "you are occupying and someone attacks you" | **SIEGE** | Defender = the occupant: CC at `def_base` + the 6-anchor `bs_ring` build spots (CoC layer, decision 9) + pets on guard. Attacker arrives at the **edge entry matching their overworld approach** (`entry_e*`). Raze the CC / breach the hold. |
| "no CC — wild or another user's pets only; towers and pets; kill all to complete" | **GUARD** | **No CC either side.** Wild monsters or the occupant's pets+towers hold the interior; attacker must **KO every guard** (`objective: clear_all`). Pets are never lost — KO + auto-return (decision 9). |
| multi-army melee, attacks from all directions | **CLASH** | Each army bases at its own edge entry (`canBase`), all converge, last standing. |
| hold the middle | **DOMINION** | Same per-edge starts, objective = hold the `center` spawn zone (`OBJECTIVE`). |

## 2. "From every side there must be an entrance, with a clear path to the middle" — VERIFIED, it's a hard rule

This was already the system's spine; confirmed in code:

- **One entry per REAL edge** (`generate.js`): every boundary edge of the parcel polygon (N edges for
  an N-gon, 4 for a square) gets an `entry_e*` spawn at its midpoint — or **exactly at the world
  road/river crossing** when one crosses that edge (continuity contract: the neighbouring parcel's
  entry is the same world point, so a cross-parcel road IS the march route).
- **FIRM connectivity rule** (`validate.js`): every edge ↔ center ↔ every edge must connect on
  walkable ground; if a roll blocks a quadrant, the validator **carves a repair corridor** rather
  than shipping a sealed map. The center clearing is always walkable.
- **Sim gate re-proves it** (`simulate.js`, all HARD): `flow.allEdgesReachCenter` (BFS),
  `choke.minCorridor` (the tightest corridor on the base→center flow is wide enough that armies
  don't jam), `spawn.safeRadius` (no attacker entry drops inside a defender kill-box),
  `reach.contentOnOpenGround`, `lanes.pathable`.
- **"Entrance can be blocked by rocks"** = the **barriers** system (`BOULDER_PILE` / `FOREST_WALL` /
  `PORTCULLIS` / `ICE_WALL` HP-gates): destructible seals, and the hard check
  `barriers.optionalOnly` guarantees a gate only ever seals an OPTIONAL shortcut — **never the main
  path** — so every mode's dumb NPC route survives even before any gate is broken.

## 3. What the audit found wrong (fixed, GEN_VERSION 4)

1. **SIEGE/GUARD eligibility was coupled to SEEDED content.** The old rule required baked-in
   towers/mobs near the center — but in the real game the defending content of an occupied parcel
   (CC, placed defense modules, pets on GUARD) is the **occupant's runtime overlay**, not the seed.
   An open meadow was stamped "DUEL only" though its geometry hosts everything. Now: **geometry
   decides mode support** (a reachable defensible interior ⇒ SIEGE/GUARD), and
   `sim.contentReady.siegeGuards` separately reports whether THIS artifact already carries interior
   defenders (i.e. the wild parcel is playable as-seeded).
2. **CLASH fairness demanded ALL edges be equidistant to center** — impossible on elongated
   polygons (observed spread up to 119× on sliver arms) ⇒ only 16/40 maps could CLASH. Now the rule
   is a **mutually-fair subset**: ≥2 edge starts within 1.6× of each other qualify the map, and
   `sim.fairEdges` lists them (battle setup can offer those as ranked-fair starts; armies arriving
   on other edges keep their disclosed geographic advantage — which is how overworld approach
   works anyway).
3. **Mode semantics sharpened** (`schema.js`): DUEL explicitly = the two-CC MOBA equivalent;
   SIEGE = occupation defense; GUARD = no-CC clear-all with the pets-never-lost rule.

## 4. How a battle actually instantiates a mode (the runtime contract)

The seed map carries the **stage**: per-edge entries, two CC anchors, the center objective, the
build-spot ring, routes. The battle instantiation overlays the **actors**:
- attacker armies enter at the `entry_e*` matching their overworld approach direction (decision 11);
- an occupied defender contributes CC + placed modules (WALL/TOWER/GATE/TRAP/GRANARY/PET_DEN) on
  `buildSpots` + pets assigned to GUARD;
- wild parcels use the seeded mobs/towers (`contentReady`);
- mode selection: PvP with both CCs ⇒ DUEL/CLASH; attack on an occupation ⇒ SIEGE; attack on
  wild/pets-only ⇒ GUARD; objectives/events may pick DOMINION on any fair-edge map.

## 5. Residual items (not blockers)

- CLASH misses on ~1/40 maps (a shape with <2 mutually-fair edges) — acceptable; the map still
  hosts every other mode.
- Water shoreline staircase (visual) — smoothing pass tracked in `WATER-RENDER-SPEC.md` polish.
- The engine (MOBA repo) reads modes from `meta.modes` — no engine change needed; `fairEdges` +
  `contentReady` are additive fields for the battle allocator to consume when it wants them.
