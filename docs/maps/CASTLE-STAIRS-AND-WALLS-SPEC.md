# Castle stairs & walls — the ruleset (owner 2026-07-27 → 2026-08-02, GEN_VERSION 22)

*The owner's directives, made law: "stairs shouldn't intersect with the walls … stairs need a clear
path to a platform wall … paths into the walls are arches that can have gates … most keeps should be
enclosed … castles do NOT need to be on an elevation — flat on the existing land … **we only spec
two types of stairs**: perpendicular to the inner wall to the top surface of the wall, or along the
inner side of the wall but ending at a part of the wall or a tower you can walk into … the distance
between walls should be at least 1 stair's width + some margin … clear all trees inside the castle."
Every rule below is (a) enforced at GENERATION time by a repair, and (b) asserted over EVERY castle
in the world by `map-service/maps/test/castle_geometry.test.js` — so a violation fails CI, not the
owner's review.*

## Anatomy (shared vocabulary)

- **Wall body** — the curtain segment between two ring anchors: 4.2u thick, tier height
  (HERO-SCALE, owner 2026-08-02: KEEP 11 / CASTLE 14 / PALACE 17; the PALACE's final inner wall
  24 — even the lowest wall stands well over a hero, and the gate arch's clear opening is
  0.65×wallH, `siege.wallRing.archClearH`, so no hero ducks through a door). Solid: no fire
  through it (siege R1), no walking through it. **Collision contract (v22):** wall collision =
  the `wallRing` POLYLINE at thickness `t` 4.2 with openings at the gates — WALL anchors are
  vertices of that curtain (`blocking:"WALL_RING"`), TOWER structures are solid drums
  (`blocking:"SOLID"`, r 5.4), GATE structures are DOORS (`blocking:"DOOR"`, r 5.5 — the arch is
  PASSABLE unless the leaf is CLOSED). Engines build the navmesh from THIS; placing independent
  solid cylinders on gate/wall anchors is what makes units orbit towers.
- **Wall-walk platform** — the flat WALKABLE top of the wall body, published as DATA in
  `siege.wallRing.wallWalk` (owner 2026-08-22 "walls should be walkable … tooth on both side of the
  wall"): `{ walkable, surfaceY=h, walkWidth, merlons:{edge:"BOTH",w,depth,h,gap,inset} }`. Merlons
  are EDGE TEETH on **both** parapet edges (a low guard-rail sits under the inner teeth); a **clear
  central walkway** of `walkWidth` (~1.9u) runs the whole ring between the two tooth rows — a merlon
  is NEVER laid across the walk. Inner teeth are gapped at stair landings + gates so defenders step
  on/off freely. This is the `WALL_WALK` siege elevation tier — the ONLY elevation a castle grants.
- **Arch** — the ONE legal ground-level way through a wall: a `gateOpenWidth` (~13u ≈ 9.6 m, owner
  2026-08-22 "gates should be wide enough") opening at a gate anchor, framed by the twin-tower
  gatehouse — the flanking towers sit OUTSIDE the passage so it is not pinched — with a lintel above
  head height (`archClearH` = 0.65·h). An arch carries a **gate** (`castle_gate_*`: kind GATE,
  `material:"WOOD"`, `hpMax`, `states:[CLOSED,OPEN,BROKEN]`) of one of **two door types**
  (`gates[].door`): **PORTCULLIS** (iron grid, raises straight up — the main/road gate) or
  **DOUBLE_LEAF** (twin timber leaves, swing open left/right). Batter it to BROKEN and the arch
  stands open. Walls are otherwise CONTINUOUS: there is never a hole in a wall that is not an arch.
- **Stair** — the ONE legal ground→platform transition. Flights TOUCH the wall (v20): parallel
  flights embed 0.35u into the wall face and renderers extend the drawn flight 1u past the data
  top so the last tread lands flush into the wall/tower body. EXACTLY TWO types exist (owner 2026-08-01;
  the spiral is RETIRED): `PERPENDICULAR` (straight flight down the wall's inner normal, top tread
  flush on the wall-walk; base PROJECTED onto the real nearest wall segment) and `PARALLEL` (flush
  alongside a straight wall run, offset 3.8u from the centerline, ending at a walkable part of the
  wall or a walk-through tower). Stair width 3.4u. Tall walls climb with more/steeper treads of the
  same two types. **Tight wards use the PARALLEL pattern** (v19): where a full-tread perpendicular
  run can't fit the bailey, a wall-hugging parallel flight replaces the steep compressed run; the
  per-gate fallback chain is guard-checked end to end (clean perpendicular → permissive parallel →
  stairless gate — a stair jammed into a wall is never emitted).

## The rules

| # | Rule | Generation-time enforcement |
|---|---|---|
| **R-FLAT** | The castle sits FLAT on the existing land — no mound, no motte, no ramps. Elevation advantage comes ONLY from the wall-walk. | `moundSteps` always `[]`; the siege block emits NO `MOUND` tier1 entry (ridges — natural terrain — remain). Renderers read `steps[0].raise ?? 0` → flat with no code change. |
| **R-EN** | Enclosed circuits: every ring is a CLOSED wall loop — the only openings are arches. | Ring radius is capped by the **parcel polygon's inscribed radius** (a ring bigger than the parcel is what degenerated the Vault-Palace to a 3-anchor triangle); anchors that still land on bad ground are pulled **radially inward until valid, never culled** (last resort: a wall may stand in water — closure beats terrain purity). |
| **R-AR** | Through-wall passage only via arches. An arch may carry a WOOD gate leaf with CLOSED/OPEN/BROKEN states. | Gate anchors are ring vertices; wall segments clip short of gate points (never sealed); the leaf is the destructible `castle_gate_*` structure. |
| **R-GATE** | **Gate-count ladder (owner 2026-08-01):** the OUTERMOST wall carries `ringN+1` doors (KEEP 2 / CASTLE 3 / PALACE 4) — road doors count toward and may exceed the ladder (cap 5) — each ward inward carries one fewer, floored at 2 — evenly spread from the attacker approach, staggered per ward so there is never a straight run to the keep. | Road doors claim anchors first (R-ROAD), then `castleLayout` fills the ladder (evenly spaced wants from the attack bearing); inner-ward doors in `concentricRings` (staggered base angle + even spread). Sweep asserts the range per ring. |
| **R-ST1** | A stair NEVER intersects a wall. Only its TOP TREAD (the last ~4.5u) touches the wall — flush against the inner face. Stairs inside wall-internal structures are out of scope for generated maps. | Every candidate stair's centerline is verified ≥3.3u clear of EVERY wall segment outside the top-contact zone; violators are dropped. |
| **R-ST2** | A stair needs a CLEAR run: foot on open courtyard ground, top landing ON the wall-walk platform — never into a wall face, and never inside a tower drum (a top may land BESIDE a tower only if the tower is walk-through). Every gate keeps ≥1 stair (the parapet is always reachable). | `PERPENDICULAR` flights are built by PROJECTING onto the actual nearest wall segment and descending its true inner normal; candidate tops within 5u of a tower anchor are dropped; a gate whose candidates all fail gets its safe projected-perpendicular fallback (run compressed until the foot stands inside the ward). |
| **R-STD** | **Stairs are PER-RING DATA (v18):** every ring carries its own `stairs[]` computed with the full guard set, `siege.stairs` IS the outer ring's array, and renderers draw the flights VERBATIM (foot→top) — no renderer-side stair derivation exists anywhere. This retires the drift class where the preview and the data disagreed. | `concentricRings` calls `computeStairs` per ring (with the ring's own gates, the corner-tower list for ring 0, and the ward's ACTUAL clearance as the run cap so a flight never crosses the next wall line). |
| **R-GAP** | Multi-ring wards stay ROOMY at EVERY point — walls never merge, and the gap fits **at least 1 stair width + margin** (owner 2026-08-01). | Ward minimum = **12u ABSOLUTE** centerline-to-centerline (4.2 wall + 3.4 stair + ~4.4 margin), target **16u** where the radius affords it; per-anchor AND segment-level (every inner anchor pushed until it clears the outer ring's whole polyline); the push never crushes a ward below the keep footprint (14u) — only parcel-polygon dents may go deeper. `gapIn` = the ACTUAL min ward clearance. When 12u wards don't fit, the RING COUNT drops (R-RING), never the width (v19 — retires the v18 8.5u scale-down). |
| **R-RING** | **Adaptive ring count (v19, owner 2026-08-01, Jinjiang Citadel "either 1 ring wall or too compact"):** the tier's ringN (KEEP 1 / CASTLE 2 / PALACE 3) is a CEILING, not a mandate — the achieved outer radius affords `floor((R0 − keepFoot)/12) + 1` full-width wards; a cramped citadel builds ONE grand wall, never a crushed nest. Supersedes the v15 "rank = ring count" reading. | `castleLayout` computes the effective count from the final ring's average radius (`geom.ringNEff`); `concentricRings` builds exactly that many; the sweep recomputes the same formula from the artifact. |
| **R-ROAD** | **Road doors (v19, owner 2026-08-01, Vermilion Palace):** "a castle where a road leads to the wall must have an opening = a door where the road comes — apply to all castles." | The wall polyline is walked at ~1u; consecutive road-hit samples group into RUNS (an oblique road is ONE crossing, never a stitch-line); the anchor nearest each run's midpoint MOVES onto the road and becomes a GATE (cap 5 doors). A second pass after `validateAndRepair` catches repair-carved corridors/causeways: a new road run without a door converts the nearest WALL structure into a gate on the road. |
| **R-PATH** | **Road–door alignment (v21):** the door sits exactly where the path meets the wall — a road only ever crosses a wall at an arch, and a path never dead-ends into masonry or runs under a tower. | Road doors sit ON the crossing (anchor moved, v20); v21 re-carves each road door's approach as a clean bend through the arch (outside→arch→inside, reconnected to the network) and SWEEPS the wall line after the castle AND repair passes — road cells hugging the wall away from every door repaint to OPEN (walkability identical). Sweep rule R-PATH asserts zero wall-hugging road cells. |
| **R-SPACE** | **Gate spacing (v20):** doors never open within 20u of each other — two adjacent openings erase the wall stretch between their gatehouses. | Road-door, ladder and post-repair passes all enforce ≥20u; the render kit additionally clips wall segments PER-SAMPLE (a segment near two gates keeps its middle — nothing vanishes wholesale). |
| **R-REACH** | **Stair-foot reachability (v20, traverse-audit finding):** every emitted flight's foot is BFS-reachable from the courtyard over the walls-solid/arches-open model — no stair may descend into a sealed bailey pocket (walls + marsh). | `concentricRings` prunes unreachable-footed flights via the shared `traverse.js groundReachability` (the SAME stamping the audit endpoint uses — generator and audit can never disagree); a ring never drops to zero stairs (a fully-sealed ring keeps its flights and the audit paints them red). |
| **R-KEEP** | **Keep-ratio sizing law (v19, owner 2026-08-01):** the outer wall's circumference stays ≥2–3× the keep's (PALACE min 2×, target 3×; CASTLE min 1.5×, target 2×). Palaces spanning most of the parcel are INTENDED ("you feel like you are right at the gate"). | Roomy land exceeds the ratio by construction; on cramped footprints the KEEP SHRINKS (`castleGeom.keep.w`, renderer honors it) so the ratio holds. |
| **R-JOINT** | Wall runs join SEAMLESSLY — no slit at a bend or at a tower (owner 2026-07-28/08-01: "outer wall got gaps … please close this"). | Render kit: wall boxes overhang 1.6u past each anchor (v18, was 0.6 — sharp enclosure dents opened slits) and a fat corner post (3.4/3.8u ≥ the wall half-thickness at any miter angle, near-flush height) seals every wall↔wall / wall↔tower miter; gate anchors framed by the gatehouse. |
| **R-ENTRANCE** | The attackable entrance READS at a glance (owner 2026-07-28). | Designer preview renders the wooden gate leaves swung ~66° OPEN into the courtyard from the jambs; CLOSED/BROKEN remain runtime states in-engine. |
| **R-TREE** | **The walled interior is lived-in ground (owner 2026-08-01):** no trees/rocks inside the castle, and NOTHING ever barges a door arch. | `castleLayout` clears every FOREST/ROCK cell inside the outer ring polygon to OPEN (props can't bake there and the walk grid opens with it) and stamps a 14u apron disc at every gate so no canopy overhangs the entrance from outside. Sweep asserts zero TREE/ROCK props deep inside the interior or within 10u of a door. |
| **R-WALK** | **The wall top is WALKABLE (owner 2026-08-22):** every wall carries a clear central walkway; merlons are edge teeth on BOTH rims, NEVER laid across the walk; the walk passes through every tower. | `siege.wallRing.wallWalk` is emitted as DATA (`walkable`, `surfaceY`, `walkWidth`, `merlons.edge:"BOTH"`); the reference renderer draws teeth on both edges (inner teeth gapped at stair tops + gates) with the clear centre; consumers build the navmesh from this. |
| **R-DOOR** | **Gates are wide + typed (owner 2026-08-22):** each opening is `gateOpenWidth` (~13u) with flanking towers OUTSIDE the passage; the main/road gate = PORTCULLIS (raise-up), others = DOUBLE_LEAF (swing). | `GATE_OPEN_W` = 13 on `wallRing.gateOpenWidth` + each `siege.gates[]`; `door` decided per gate (nearest the drawbridge/road ⇒ PORTCULLIS, else DOUBLE_LEAF) and mirrored onto `castleGeom.rings[].gates[].door`. |

## How we prevent "the broken castle reaching the owner" again

1. **The failure class is unrepresentable**: anchors are repaired (inward pull), never culled — an
   open circuit cannot be emitted; stairs exist only as generator data that has already passed every
   guard, and renderers cannot invent their own (the per-gate renderer stair builders and the spiral
   are deleted, not just disabled).
2. **The sweep test** (`castle_geometry.test.js`) generates **all 37 castle parcels in the world**
   AND re-asserts **all 11 committed estate maps** against
   R-RING/R-EN/R-AR/R-GATE/R-ST1/R-ST2/R-ST3/R-STD/R-GAP/R-FLAT/R-TREE/R-ROAD/R-KEEP — 844 assertions at v19.
   Any generator change that breaks any castle anywhere — or a forgotten estate re-bake — fails CI.
3. **GEN_VERSION discipline**: geometry changes bump the version; SEED_V0 registry rows auto-reseed,
   and the deploy smoke check + `/internal/v1/moba-maps` expose the served version.

## Renderer notes (CF preview = reference; MOBA engine mirrors)

- Flat: no earthwork mesh (preview already guards `baseRaise>0`); walls sit at terrain height.
- **Stairs: draw `rings[].stairs[]` VERBATIM** — extrude each foot→top line as rising treads
  (~H/1.5 steps, 3.4u wide), top flush at `wallH`. Never derive stair placement; the data already
  guarantees clearance, run caps and landings.
- Drum towers skip within 9u of any data stair top (the landing stays clear); every drum is
  two-part walk-through (the wall-walk passes through an open band under the turret hut).
- **Wall-walk: read `wallRing.wallWalk`** — draw merlon teeth on BOTH parapet edges (inner teeth
  gapped at stair tops + gates), keep the central `walkWidth` clear + walkable; never a block on the
  walk. This is the reference for the MOBA engine's own wall mesh (2026-08-22 handshake).
- **Gate: read `wallRing.gateOpenWidth` + `gates[].door`** — carve the opening `gateOpenWidth` wide,
  seat flanking towers OUTSIDE it, and render PORTCULLIS (raise-up iron grid) or DOUBLE_LEAF (swing
  timber leaves) per the door type. Each renders per state: CLOSED / OPEN (raised or swung) / BROKEN.

## v24 — stepped stairs, walk-through towers, one wide road door (owner 2026-08-28)

Three fixes from a live 3D castle tour. The DATA now carries everything the renderer needs so the
common regressions (ramps, dead-end wall-walk, twin narrow doors) cannot recur:

1. **Stairs are STEPS, never ramps** ("no one builds wall ramps but stairs that's walkable"). Every
   `ring.stairs[]` flight now carries an explicit stepped-geometry spec: `mode`
   (`PERPENDICULAR` up onto the wall-walk | `PARALLEL` hugging the wall), `foot`, `top`, `rise` (wall
   height to climb), `steps` (tread count), `riser`, `tread`, `width` (3.4), `walkable:true`. **Renderer
   contract: extrude `steps` boxes rising by `riser` each along foot→top — NEVER a single sloped plank.**
   (`generate.js` computeStairs + the ring push; `preview3d.html` already renders treads = reference.)
2. **Towers pass the wall-walk THROUGH** ("towers should have holes you can walk through so you can walk
   along the entire top of the wall"). TOWER anchors carry `wallWalkThrough:true` + `passageW` (3.2).
   Ground level stays `blocking:"SOLID"` (units circle the drum, never through it); at parapet height the
   renderer cuts archway doorways on the two sides facing the adjacent wall runs, so the wall-walk is one
   continuous loop. (`generate.js` tower anchor emission.)
3. **One wide door CENTERED on the road** ("road leads to a wall with two entrances — just give it one big
   enough door, ≥1.5× road width, centered on the road"). The road-door pass reduces each wall-crossing to
   its road-cell CENTROID (exact centre) + width; MERGES crossings of the same road (<22u apart, keep the
   wider); moves the nearest anchor onto the centroid; and sets a per-gate arch half-width `gateR ≈
   0.75× road width` (⇒ opening ≥ 1.5× road width, capped 26u), emitted as the GATE anchor's `r`. Ladder
   gates keep the default 5.5. (`generate.js` ROAD DOORS block + gate emission + arch-clear disc.)

Re-bake: `node map-service/tools/estate_palace_maps.mjs` regenerates the 11 pre-designed palace estate
maps through the fixed pipeline; L3 castles generate the fields live. castle-geometry test: 1036 pass.

## v25 — walkable-grade access, wood ramps, tower turret + archer ports (owner 2026-08-28)
- **Stairs carry grade + material.** Each flight adds `grade` (deg), `material:"STONE"`, `render:"STEPS"`,
  and `rampAlt:{material:"WOOD",maxGrade:40}`. Render as walkable stone STEPS; a RAMP substitution must be
  WOOD and ≤ 40° (extend the run — a ramp is gentler than the stair, never steeper). "No one builds wall
  ramps but walkable stairs" — a ramp, if used, reads as timber, not masonry.
- **Tower = DRUM_TURRET.** Anchor adds `form:"DRUM_TURRET"` + `archerPorts` (3). Solid drum to wall-walk
  height; a turret hut ABOVE the walk with the two wall-facing sides OPEN (walk passes through,
  `wallWalkThrough`/`passageW`) and **arrow-loops facing outward + flanks** for stationary archers. This
  is the real mural-tower function (enfilade the wall foot + shoot the field), miniaturized. Full study:
  `docs/maps/CASTLE-ARCHITECTURE-STUDY.md`. `preview3d.html` renders the reference.
