# Castle audit v27 — every castle battle map vs the v24/v25 rules (2026-08-31)

Read-only sweep of **49 castles** against `docs/maps/CASTLE-STAIRS-AND-WALLS-SPEC.md` (§v24 stepped
stairs / walk-through towers / wide road doors, §v25 grade+material+DRUM_TURRET+archer ports) and
`docs/maps/CASTLE-ARCHITECTURE-STUDY.md`, plus the owner's 2026-08-29 rule
"you can't have an arch between a wall and a tower" (audited here as **R-GATE-TOWER**, ≥16u).

**Populations audited**
1. **37 L3 castle parcels** — generated live: `loadWorldField(zone)` for
   EDU/HUB/BUS/ENT/UW2/UW3 → `field.castles[].heroParcels[0]` → `l3Row(pid)` →
   `generate(worldParcel(snap,{}))`.
2. **11 committed palace-estate artifacts** — `data/cf-maps/artifacts/{1101100, 1031491, 1020371,
   1071732, 1001178, 3110087, 1071729, 1071728, 1071738, 1071733, 3071605}.artifact.json` (read as
   committed).
3. **1 siege test** — `data/moba-maps/siege-test.artifact.json`.

**Freshness:** every artifact — live-generated AND all 12 committed files — reports
`meta.genVersion = 27`. The committed estates and the siege test are post-v25 bakes; **nothing
needs a re-bake** and no committed/live divergence was found.

## Rules & method

| Rule | What was checked | Data source |
|---|---|---|
| **R-STEP** | every stair flight carries the full stepped spec: `steps>0, riser>0, tread>0, rise>0, grade:number, material:"STONE", render:"STEPS", rampAlt:{material:"WOOD",maxGrade:40}` | all rings' `stairs[]` via `meta.castleGeom.rings[]` (falls back to `siege.stairs`) |
| **R-DOOR-ROAD** | every ROAD run crossing the outer wall ring has a GATE within ~6u of the crossing midpoint | terrain grid (b64 u8, `T.ROAD=5`, cellM 2) sampled at ~1u along `siege.wallRing.pts`; gates = `structures` kind GATE |
| **R-GATE-TOWER** | no GATE anchor within **16u** of ANY TOWER structure anchor (`castle_tower_*` **and** lane `tw*`) — owner 2026-08-29 | `structures` kinds GATE × TOWER, euclidean |
| **R-TURRET** | every `castle_tower_*` carries `form:"DRUM_TURRET"`, `wallWalkThrough:true`, `passageW>0`, `archerPorts>0` | `structures` |
| **R-WALLRING** | `siege.wallRing` carries `wallWalk{walkable,surfaceY,walkWidth,merlons}` + `gateOpenWidth` + `towers{form:"DRUM_TURRET",…}`; every `castleGeom.rings[]` entry carries `wallWalk` + `towers` too | `siege.wallRing` + `meta.castleGeom.rings[]` |
| **R-STAIR-GUARDS** | every flight has `foot[]`, `top[]`, `rise>0` | ring `stairs[]` |

Per the brief, flights with `grade > 40.5°` are **counted, not failed** (steep-but-stepped is legal
in tight wards; §v25 renders them as walkable STONE STEPS — a WOOD-ramp substitution is only legal
≤40°, so these flights can never be ramps).

## Headline

**All 49 castles pass R-STEP, R-DOOR-ROAD, R-TURRET, R-WALLRING and R-STAIR-GUARDS with zero
violations. R-GATE-TOWER fails on 2 of 49 — both against a LANE tower (`tw0`), never a castle
mural tower.**

- 393 flights world-wide; every single one carries the complete v24+v25 stepped spec (0 missing
  fields). 219/393 (56%) are steeper than 40.5° — allowed, but see the fix list.
- 121 road-wall crossings world-wide; every one has a gate on it (worst gate↔crossing distance
  5.7u, at BUS-KEEP-GULLSHOAL — inside the ~6u tolerance but the world's only sample >2u).
- Every `castle_tower_*` in the world is a conforming DRUM_TURRET (walk-through, passageW 3.2,
  3 archer ports); every wall ring (siege + all castleGeom rings) carries the full wall-walk +
  gateOpenWidth 13 + DRUM_TURRET tower contract.
- The generator's own `gateClearance:16` visibly works for mural towers: the minimum
  gate↔`castle_tower_*` distance anywhere in the world is exactly **16.0u** (EDU-KEEP-LANTERNHILL)
  — enforced, but with zero margin.

## Per-castle results

Columns: rings = `castleGeom.rings` count · fl = stair flights (all rings) · grade = min/median/max
(deg) · >40.5° = steep flights (allowed) · roadX = road-wall crossings · gateDmax = worst
gate↔crossing distance (u) · gate r = each GATE's arch half-width · gate↔twr = min gate↔tower
distance (u) + nearest pair.

| Castle | rings | fl | grade min/med/max | >40.5° | roadX | gateDmax | gate r | gate↔twr min | R-GATE-TOWER |
|---|---|---|---|---|---|---|---|---|---|
| EDU EDU-CASTLE-WESTGATE (20203670103) | 2 | 10 | 39.8/40.2/53.7 | 4 | 1 | 1.0 | 5.5/5.5/11.3 | 27.4 (g1↔ct2) | PASS |
| EDU EDU-KEEP-CLIFFWATCH (30203520121) | 1 | 4 | 39.7/39.8/39.9 | 0 | 2 | 1.0 | 12.8/10.5 | 21.1 (g1↔ct3) | PASS |
| EDU EDU-KEEP-LANTERNHILL (30203510131) | 1 | 3 | 39.7/39.7/39.9 | 0 | 2 | 0.0 | 12/9.8 | **16.0** (g0↔ct3) | PASS (0 margin) |
| EDU EDU-CASTLE-SOUTHREACH (20203680154) | 2 | 9 | 48.2/53.3/53.6 | 9 | 1 | 0.0 | 5.5/13/5.5 | 18.6 (g2↔ct3) | PASS |
| HUB HUB-CASTLE-TIEDU (20716710172) | 2 | 10 | 52.9/53.5/64.6 | 10 | 3 | 0.9 | 9.8/13/13 | 22.5 (g0↔ct1) | PASS |
| HUB HUB-CASTLE-DONGGUAN (20717190260) | 2 | 10 | 43.9/55.7/65.1 | 10 | 1 | 0.0 | 13/5.5/5.5 | 27.5 (g0↔ct0) | PASS |
| HUB HUB-KEEP-SOUTHGATE (30716650182) | 1 | 8 | 39.8/39.8/49.8 | 1 | 4 | 1.0 | 13/13/11.3/6 | 22.7 (g1↔ct2) | PASS |
| HUB HUB-KEEP-SOUTHSLOPE (30716190171) | 1 | 4 | 39.7/39.8/39.9 | 0 | 0 | — | 5.5/5.5 | 27.7 (g1↔ct1) | PASS |
| HUB HUB-KEEP-DRAGONTAIL (30716210150) | 1 | 4 | 39.7/39.8/39.8 | 0 | 2 | 0.0 | 13/13 | 26.1 (g1↔ct3) | PASS |
| BUS BUS-FORT-TIDEGATE (20011440099) | 2 | 11 | 39.8/48.4/53.5 | 7 | 4 | 1.0 | 13/13/13/13 | 22.1 (g2↔ct1) | PASS |
| BUS BUS-CASTLE-MIDDLEQUAY (20011730078) | 2 | 11 | 40.1/51.7/53.7 | 7 | 4 | 1.0 | 13/13/13/13 | 22.4 (g0↔ct0) | PASS |
| BUS BUS-CASTLE-CAPEMEET (20011170044) | 2 | 11 | 39.8/54.4/64.2 | 9 | 4 | 1.0 | 13/13/13/13 | 19.8 (g1↔ct1) | PASS |
| BUS BUS-CASTLE-EASTREACH (20011500104) | 2 | 10 | 39.8/40.0/53.6 | 2 | 2 | 0.0 | 13/5.5/13 | 24.1 (g2↔ct3) | PASS |
| BUS BUS-KEEP-DELTALIGHT (30009950121) | 1 | 3 | 39.8/39.9/39.9 | 0 | 1 | 0.0 | 5.5/9 | 16.9 (g0↔ct2) | PASS |
| BUS BUS-KEEP-GULLSHOAL (30009860125) | 1 | 4 | 39.8/39.8/39.8 | 0 | 4 | **5.7** | 13/6/13 | 17.5 (g2↔ct3) | PASS |
| BUS BUS-KEEP-DUNEWATCH (30010350134) | 1 | 6 | 39.8/39.8/39.9 | 0 | 3 | 0.0 | 5.5/10.5/13 | 20.1 (g2↔ct2) | PASS |
| BUS BUS-KEEP-MARSHGATE (30010650198) | 1 | 5 | 39.7/39.8/49.9 | 2 | 3 | 0.9 | 13/5.5/8.3 | 16.5 (g1↔ct2) | PASS |
| ENT ENT-CASTLE-RIVERGATE (20314880213) | 2 | 9 | 52.9/53.1/65.2 | 9 | 2 | 1.0 | 5.5/13/13 | 24.5 (g1↔ct3) | PASS |
| ENT ENT-CASTLE-FESTGATE (20314850240) | 2 | 8 | 39.7/39.9/40.2 | 0 | 2 | 1.0 | 5.5/12/5.5 | 28.0 (g2↔ct1) | PASS |
| ENT ENT-KEEP-TIDEWATCH (30314530132) | 1 | 4 | 39.8/39.8/49.9 | 1 | 0 | — | 5.5/5.5 | 37.7 (g1↔ct3) | PASS |
| ENT ENT-KEEP-CAMPANILE (30314610147) | 1 | 4 | 46.1/53.5/54.4 | 4 | 1 | 0.0 | 13/5.5 | 20.7 (g0↔ct0) | PASS |
| ENT ENT-KEEP-PETALPORT (30314590117) | 1 | 4 | 42.9/42.9/43.0 | 4 | 2 | 1.0 | 13/13 | 23.7 (g0↔ct3) | PASS |
| ENT ENT-KEEP-LANTERNSHORE (30314500098) | 1 | 4 | 39.8/39.8/39.9 | 0 | 2 | 1.0 | 13/13 | 20.2 (g1↔ct1) | PASS |
| ENT ENT-KEEP-SUNSTRAND (30314600114) | 1 | 3 | 39.7/39.8/39.8 | 0 | 1 | 1.0 | 5.5/13 | 27.4 (g1↔ct1) | PASS |
| UW2 UW2-CASTLE-MOURNGATE (21010900135) | 2 | 10 | 39.7/40.1/53.6 | 3 | 3 | 1.0 | 13/13/13 | 23.1 (g2↔ct3) | PASS |
| UW2 UW2-CASTLE-DEEPGATE (21010830174) | 2 | 10 | 39.7/40.1/53.7 | 3 | 1 | 0.0 | 5.5/13/5.5 | 30.2 (g2↔ct3) | PASS |
| UW2 UW2-CASTLE-PALEWATER (21010920077) | 2 | 9 | 39.9/53.5/53.7 | 5 | 1 | 0.0 | 5.5/13/5.5 | 16.3 (g1↔ct1) | PASS |
| UW2 UW2-KEEP-VIGILWATCH (31010750155) | 1 | 6 | 39.7/39.8/39.9 | 0 | 3 | 1.0 | 6/9.8/13 | 30.8 (g1↔ct0) | PASS |
| UW2 UW2-KEEP-FERRYWATCH (31010670023) | 1 | 4 | 39.7/39.8/39.8 | 0 | 1 | 1.0 | 8.3/5.5 | 30.5 (g0↔ct0) | PASS |
| UW2 UW2-KEEP-DROWNMEADOW (31010570121) | 1 | 3 | 39.8/39.8/39.9 | 0 | 2 | 1.0 | 9.8/13 | 25.0 (g0↔ct0) | PASS |
| UW2 UW2-KEEP-SUNKENCOURT (31010720149) | 1 | 6 | 39.8/39.9/54.9 | 1 | 4 | 0.9 | 13/13/13/13 | 17.3 (g1↔ct1) | PASS |
| UW2 UW2-KEEP-PALELANTERN (31010780195) | 1 | 5 | 39.7/39.9/49.9 | 2 | 3 | 1.0 | 12/5.5/5.5 | 22.7 (g2↔ct3) | PASS |
| UW3 UW3-PALACE-VAULTPALACE (31100870136) | 3 | 16 | 39.7/52.7/64.7 | 13 | 3 | 0.0 | 5.5/13/13/5.5 | 16.5 (g2↔ct1) | PASS |
| UW3 UW3-KEEP-MIRRORS (31100890117) | 1 | 4 | 39.7/39.8/39.9 | 0 | 1 | 0.9 | 5.5/5.5 | 18.1 (g1↔ct3) | PASS |
| UW3 UW3-KEEP-SILK (31100880181) | 1 | 3 | 39.7/39.8/39.8 | 0 | 2 | 0.0 | 7.5/13 | 16.2 (g0↔ct0) | PASS |
| UW3 UW3-KEEP-HUNGER (31100840037) | 1 | 4 | 39.7/39.8/39.8 | 0 | 2 | 0.0 | 5.5/5.5 | 21.3 (g0↔ct0) | PASS |
| UW3 UW3-KEEP-COIN (31100860055) | 1 | 8 | 39.7/39.8/39.9 | 0 | 4 | 1.0 | 13/9/13/13 | 22.5 (g2↔ct3) | PASS |
| ESTATE 1101100 | 3 | 17 | 39.7/52.7/61.1 | 13 | 4 | 1.0 | 13/9/13/13 | 19.7 (g1↔ct3) | PASS |
| ESTATE 1031491 | 3 | 17 | 39.8/54.0/59.5 | 14 | 4 | 1.0 | 5.5/13/9/13 | 16.5 (g0↔ct0) | PASS |
| ESTATE 1020371 | 3 | 18 | 39.8/52.7/**67.1** | 14 | 4 | 1.0 | 5.5/6/5.5/5.5 | 21.4 (g1↔ct3) | PASS |
| ESTATE 1071732 | 3 | 18 | 39.8/48.7/60.5 | 15 | 4 | 1.0 | 11.3/9.8/13/9 | 19.3 (g0↔ct0) | PASS |
| ESTATE 1001178 | 3 | 16 | 39.7/49.9/56.9 | 12 | 4 | 0.9 | 11.3/7.5/12.8/13 | 16.9 (g0↔ct3) | PASS |
| ESTATE 3110087 | 2 | 10 | **57.6/65.8/76.1** | 10 | 2 | 1.0 | 5.5/5.5/5.5 | 21.7 (g2↔ct0) | PASS |
| ESTATE 1071729 | 1 | 8 | 54.5/64.1/64.6 | 8 | 4 | 1.0 | 5.5/13/13/7.5 | 18.2 (g1↔ct1) | PASS |
| ESTATE 1071728 | 2 | 11 | 53.1/53.2/64.4 | 11 | 4 | 1.0 | 11.3/5.5/13/6 | 16.8 (g1↔ct3) | PASS |
| **ESTATE 1071738** | 2 | 11 | 40.0/48.5/53.5 | 7 | 4 | 1.0 | 6/5.5/13/13 | **9.8 (g0↔tw0)** | **FAIL** |
| ESTATE 1071733 | 1 | 6 | 53.1/62.3/65.1 | 6 | 3 | 1.9 | 5.5/5.5/13 | 20.5 (g0↔ct1) | PASS |
| ESTATE 3071605 | 1 | 4 | 39.8/39.9/50.0 | 1 | 2 | 0.0 | 13/5.5 | 17.8 (g0↔**tw0**) | PASS (near) |
| **siege-test** | 2 | 10 | 39.7/40.1/53.7 | 2 | 1 | 0.0 | 5.5/5.5/5.5 | **15.7 (g2↔tw0)** | **FAIL** |

(g = `castle_gate_`, ct = `castle_tower_`, tw = lane tower. R-STEP / R-DOOR-ROAD / R-TURRET /
R-WALLRING / R-STAIR-GUARDS: **PASS on every row** — omitted from the table for space.
HUB-SOUTHSLOPE and ENT-TIDEWATCH have 0 road crossings — no road reaches their wall; legal,
R-DOOR-ROAD vacuously passes.)

## Systemic violations (worst first)

### 1. R-GATE-TOWER vs LANE towers — the one real rule breach (2 castles + 1 near-miss)

The generator enforces the owner's 16u arch↔tower rule only against **castle mural towers**
(`castleGeom.rings[].towers.gateClearance:16`). **Lane towers (`tw*`) are placed by the lane pass
with no knowledge of gate positions**, and they are exactly what breaks the rule:

- **ESTATE 1071738** — `castle_gate_0` at (−33.7, −4.2) sits **9.8u** from DEFENDER lane tower
  `tw0` at (−43, −1). Clear violation: an arch effectively between the wall and a tower drum.
- **siege-test** — `castle_gate_2` at (14.1, 0.9) is **15.7u** from DEFENDER `tw0` (4.9, −11.8).
  Marginal (0.3u short), same mechanism.
- **ESTATE 3071605** — 17.8u from `tw0`: passes, but the nearest tower to a gate is again a lane
  tower, confirming this is a placement class, not two coincidences.

Every `castle_tower_*` pair in all 49 castles passes — the mural-tower clearance works.

### 2. Steep stairs — legal but pervasive (56% of all flights, 32/49 castles)

219 of 393 flights exceed 40.5°. Not a rule violation (steep-but-stepped is allowed in tight
wards, and every flight carries the STONE/STEPS spec so none can be mis-rendered as a ramp), but
the spec's own open item is "stair-grade toward ≤40° where the ward affords the run". Note that
for all 219, `grade > rampAlt.maxGrade` — the WOOD-ramp substitution is never legal on them.
Worst offenders (highest grades / highest steep share):

1. **ESTATE 3110087** — min 57.6°, median 65.8°, **max 76.1°** (all 10 flights steep; the world's
   steepest castle by far — 76° is a ladder, not a stair).
2. **ESTATE 1020371** — max 67.1° (14/18 steep).
3. **ENT-CASTLE-RIVERGATE** — max 65.2°, median 53.1 (9/9 steep).
4. **HUB-CASTLE-DONGGUAN / HUB-CASTLE-TIEDU** — max 65.1 / 64.6, 10/10 steep each.
5. **ESTATE 1071733 / 1071729** — medians 62.3 / 64.1 (every flight steep).
6. **UW3-PALACE-VAULTPALACE** — max 64.7 (13/16 steep; 3 rings squeeze the runs).

Pattern: multi-ring castles/palaces (tight wards cap the run length) and a handful of one-ring
estates whose walls sit near terrain obstacles. All 1-ring KEEPs on roomy ground sit at a uniform
~39.8° — the run-length solver is correct when space exists.

### 3. Boundary-tight mural-tower clearance (no failure, no margin)

Seven castles sit within 1u of the 16u limit: EDU-LANTERNHILL **16.0**, UW3-SILK 16.2,
UW2-PALEWATER 16.3, BUS-MARSHGATE 16.5, VAULTPALACE 16.5, ESTATE 1031491 16.5, ESTATE 1071728
16.8, ESTATE 1001178 16.9. The clearance clamps exactly at the constraint — any future jitter in
anchor placement (or a rule tightening) flips these to FAIL. Worth a small buffer (e.g. clamp at
17) if the rule is meant as "clearly not adjacent".

### 4. One marginal road-door alignment

**BUS-KEEP-GULLSHOAL**: one crossing's gate is 5.7u from the road-run midpoint (every other
crossing in the world is ≤2u). Inside the ~6u tolerance — likely an oblique/wide road whose
centroid drifts from the sampled midpoint — but it is the outlier to look at if the tolerance
ever tightens.

### Fully clean rules

- **R-STEP** — 393/393 flights carry the complete v24+v25 spec (steps/riser/tread/rise/grade/
  width 3.4/walkable/material STONE/render STEPS/rampAlt WOOD≤40). Zero missing fields anywhere.
- **R-TURRET** — every `castle_tower_*` in the world: `form:"DRUM_TURRET"`, `wallWalkThrough:true`,
  `passageW:3.2`, `archerPorts:3`.
- **R-WALLRING** — every `siege.wallRing` AND every `castleGeom.rings[]` entry carries
  `wallWalk{walkable,surfaceY,walkWidth:1.9,merlons BOTH}` + `gateOpenWidth:13` +
  `towers{form:"DRUM_TURRET",…,gateClearance:16}`.
- **R-STAIR-GUARDS** — all 393 flights have `foot`, `top`, `rise>0`.
- **R-DOOR-ROAD** — 121/121 road-wall crossings gated; road gates widened per v24
  (`r` up to 13 vs the 5.5 ladder default).

## Prioritized fix list

1. **[BUG — generator] Extend the 16u gate-clearance rule to LANE towers (`tw*`).** Either the
   lane-tower placement pass must respect gate anchors (push `tw*` ≥16u from every GATE) or the
   gate/ladder pass must treat lane towers as obstacles. Fixes ESTATE 1071738 (9.8u) and
   siege-test (15.7u); also lifts the 3071605 near-miss. Add the `tw*` case to
   `castle_geometry.test.js` so it sweeps GATE × **all** TOWER structures, not just `castle_tower_*`.
2. **[RE-BAKE after #1] ESTATE 1071738 + siege-test** — both are committed artifacts; once the
   generator fix lands, re-bake via `node map-service/tools/estate_palace_maps.mjs` (+ regenerate
   the siege test) so the committed files pick it up.
3. **[QUALITY — generator] Grade-relief pass for the worst steep castles.** Target the spec's own
   open item ("stair-grade toward ≤40° where the ward affords the run"): prefer PARALLEL flights
   (longer runs along the wall) when a perpendicular run would exceed ~55°, and consider splitting
   tall climbs into two flights with a landing. Priority order: ESTATE 3110087 (76.1° max),
   1020371, ENT-RIVERGATE, HUB-DONGGUAN/TIEDU, 1071733/1071729, VAULTPALACE. A 76° "stair" will
   read as broken geometry in the 3D client even rendered as steps.
4. **[HARDENING — generator] Add ~1u margin to the mural-tower gate clearance** (clamp 17u, keep
   the published `gateClearance:16` as the floor) so the seven boundary-tight castles stop
   riding the exact limit.
5. **[WATCH — no action yet] BUS-KEEP-GULLSHOAL road-door offset (5.7u)** — inside tolerance;
   re-check after any road-centroid change to the v24 road-door pass.
6. **[TEST] Encode this audit's R-GATE-TOWER + steep-count checks into the CI sweep** so the
   lane-tower class and any grade regressions fail CI rather than a future owner tour.

---
*Method: audit script run read-only from `map-service/maps` (Node ESM, imports `worldfield.js` +
`generate.js`); committed artifacts parsed as JSON. No map, artifact or generator file was
modified. 49/49 castles audited, 0 generate errors, all at GEN_VERSION 27.*

---
## STATUS UPDATE (same day, after fixes)
- ✅ Fix 1 DONE: lane towers (`tw*`) now obey the 16u gate clearance (generator relocation pass runs for
  EVERY tower, courtyard or field) + new CI check **R-GATE-TOWER** in the castle sweep (all GATE↔TOWER
  pairs). Estate 1071738 + siege-test re-baked clean; sweep 1084/1084.
- ⏭ Fix 2 (steep flights on tight tall castles, worst 76.1°): requires the SWITCHBACK flight — designed
  in `docs/briefs/STAIR-SWITCHBACK-SPEC.md`, not yet implemented (schema + both renderers).
