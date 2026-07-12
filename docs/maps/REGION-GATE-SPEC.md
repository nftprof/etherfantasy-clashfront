# Region & Gate Spec — overworld travel partitioning (base-terrain bake)

> **Map-maker session, 2026-07-07.** Implements the CF-overworld requirement (their
> `MAP-MAKER-HANDOFF-RECAP.md §1.9`): a continent is **partitioned into REGIONS by barriers**, and regions
> are **linked only through GATES** — you can travel between regions, but only through a gate parcel (where
> the landlord toll applies at runtime). Continents are **not fully separated** (gates connect them) and
> **not freely linked** (you must pass a gate). This is a **base-terrain field the generator bakes**; CF
> owns the client overlay renderer. Extends `CONTINUOUS-WORLD-TERRAIN.md` (regions = the areas the macro
> feature-network's ranges/rivers enclose; gates = the passes/bridges).

## 0. The seam (who does what)
- **Map-maker (me) — generator bakes 3 things** into the base terrain: per-parcel `regionId`, per-crossing
  `isGate`/`connects`, and per-barrier `regionBoundary` polyline (+ a gate marker at each crossing).
- **CF overworld (them) — renders the overlay**: the dotted region borders + gate icons, from those fields.
  No further generator work once the fields exist.
- **Runtime (not baked):** the landlord **toll / crossing policy** at a gate is a live layer, not terrain.

**NB — two different "barriers":** the existing `barriers[]` in a battle artifact are *battlefield*
destructible obstacles inside one ±161 map. The region barriers here are **overworld** — they partition the
continent's *parcel graph*, not a single battle map. Different layer, different field.

## 1. What a region is
A **region** = a maximal set of parcels on one continent you can travel between **without crossing a
barrier**. Barriers are the macro **ranges (mountains)** and **major rivers/coastline** from the continuous-
world feature-network (`CONTINUOUS-WORLD-TERRAIN.md §2`). So a mountain range or a great river splits a
continent into regions; the only way across is a **pass** (road over a range) or a **bridge/ford** (road
over a river) — those crossing parcels are **gates**.

## 2. The baked fields

### 2a. Per parcel (in the base-terrain record for the parcel)
```jsonc
{
  "parcelId": "60200010000",
  "zone": "EDU",
  "regionId": "EDU-R03",              // which region this parcel belongs to (stable, per continent)
  "isGate": false,                    // true ONLY on a crossing parcel
  "connects": null                    // on a gate: ["EDU-R03","EDU-R07"] — the two regions it links
}
```
- **`regionId`** — every parcel has exactly one. Format `<ZONE>-R<nn>` (zone-scoped, deterministic).
- **`isGate`** — `true` on the parcel that carries a pass/bridge across a barrier; else `false`.
- **`connects`** — on a gate only: the ordered pair of `regionId`s it joins. `null` otherwise.

### 2b. Per barrier (continent-level, for the overlay)
```jsonc
{
  "barrierId": "EDU-B02",
  "kind": "range",                    // "range" | "river" | "coast"
  "regionBoundary": [[x,z],[x,z],…],  // world-coord polyline = the border CF draws as the dotted line
  "sides": ["EDU-R03","EDU-R07"],     // the two regions this barrier separates
  "gates": [                          // ≥1 — the crossing markers CF pins on the border
    { "parcelId": "60200041000", "at": [x,z], "kind": "pass" }   // "pass" (range) | "bridge"/"ford" (river)
  ]
}
```
Delivered per continent as `regions[]` + `barriers[]` alongside `world-terrain.json`.

## 3. Generation algorithm (deterministic — no `Math.random`)
1. **Adjacency:** build the continent's parcel adjacency graph from real parcel positions/bboxes
   (`data/hexagon-city-source/l3/<ZONE>.json`).
2. **Cut barriers:** remove adjacencies that cross a macro barrier (a range ridgeline / river spine from the
   feature-network). 
3. **Regions = connected components** of the cut graph → assign `regionId` (`<ZONE>-R<nn>`, numbered by a
   stable key e.g. min parcelId in the component, so it's deterministic + order-insensitive).
4. **Gates:** for every pair of adjacent regions (they share a barrier), find the **narrowest deterministic
   crossing** (the shortest span where a road/pass/ford can bridge the barrier) and mark that parcel
   `isGate:true`, `connects:[A,B]`; add it to the barrier's `gates[]`. **Guarantee ≥1 gate per boundary** so
   **no region is ever unreachable** (invariant).
5. **regionBoundary** = the barrier's centerline polyline (range ridge / river spine) in world coords.

## 4. Dependency + rollout
- Regions **derive from the macro barriers** (ranges/rivers), so they bake **when a continent's macro
  terrain is authored** (the per-continent continuous-world pass, `CONTINUOUS-WORLD-TERRAIN.md §7`).
- **Un-authored continent (stamp floor):** the whole continent is **one region** (`<ZONE>-R00`), no internal
  barriers/gates — safe default (everything reachable), fills in when the continent is authored.
- **Bake-now:** included in the 20K base run (or a rebake) exactly as §1.9 asks; it's additive base-terrain
  data, no battle-artifact schema change.
- **Reachability is invariant** — the ≥1-gate-per-boundary rule means the region graph is always connected,
  so the whole continent is always traversable.

## 5. Ties to existing canon
- **Continuous world** — barriers ARE the feature-network's `ranges[]`/`rivers[]`; gates ARE the
  pass/bridge edge-crossings already defined (`CONTINUOUS-WORLD-TERRAIN.md §2`, §4). This spec just *labels*
  them into regions + gate parcels.
- **Terraform edge-freeze** — a gate's crossing is part of the frozen edge-contract; a landowner can't wall
  off a gate and orphan a region (the crossing stays open; only the interior is theirs).
- **Toll economy** — the gate is where the landlord toll/policy hooks at runtime (their layer, not baked).

## 6. Confirm back to CF / open
- **Field names locked** to §1.9: `regionId`, `isGate`, `connects`, `regionBoundary` (+ `barrierId`,
  `gates[]`, `sides`). If your recap uses different keys, tell me and I'll match exactly.
- **You render the overlay** (dotted borders + gate icons) off `barriers[].regionBoundary` +
  `gates[]`; I emit them. Nothing else needed on the generator side once macro terrain is authored.
- **Open:** (a) can a barrier ever be a hard wall with **no** gate (impassable frontier), or is ≥1 gate
  always required? (I assume always ≥1 — reachability invariant.) (b) Do you want a **region name** field
  (lore label) in addition to `regionId`, or is the id enough for v1?
