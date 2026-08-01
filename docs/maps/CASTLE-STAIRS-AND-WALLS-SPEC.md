# Castle stairs & walls — the ruleset (owner 2026-07-27 → 2026-08-01, GEN_VERSION 18)

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
  (KEEP 7 / CASTLE 9 / PALACE 11; the PALACE's final inner wall 18). Solid: no fire through it
  (siege R1), no walking through it.
- **Wall-walk platform** — the flat walkable top of the wall body. Merlons on the OUTER edge only,
  a low curb on the inner edge. This is the `WALL_WALK` siege elevation tier — the ONLY elevation
  a castle grants.
- **Arch** — the ONE legal ground-level way through a wall: a ~11u opening at a gate anchor, framed
  by the twin-tower gatehouse with a lintel above head height. An arch MAY carry a **gate leaf**
  (`castle_gate_*`: kind GATE, `material:"WOOD"`, `hpMax`, `states:[CLOSED,OPEN,BROKEN]`) — batter
  it to BROKEN and the arch stands open. Walls are otherwise CONTINUOUS: there is never a hole in a
  wall that is not an arch.
- **Stair** — the ONE legal ground→platform transition. EXACTLY TWO types exist (owner 2026-08-01;
  the spiral is RETIRED): `PERPENDICULAR` (straight flight down the wall's inner normal, top tread
  flush on the wall-walk; base PROJECTED onto the real nearest wall segment) and `PARALLEL` (flush
  alongside a straight wall run, offset 3.8u from the centerline, ending at a walkable part of the
  wall or a walk-through tower). Stair width 3.4u. Tall walls climb with more/steeper treads of the
  same two types.

## The rules

| # | Rule | Generation-time enforcement |
|---|---|---|
| **R-FLAT** | The castle sits FLAT on the existing land — no mound, no motte, no ramps. Elevation advantage comes ONLY from the wall-walk. | `moundSteps` always `[]`; the siege block emits NO `MOUND` tier1 entry (ridges — natural terrain — remain). Renderers read `steps[0].raise ?? 0` → flat with no code change. |
| **R-EN** | Enclosed circuits: every ring is a CLOSED wall loop — the only openings are arches. | Ring radius is capped by the **parcel polygon's inscribed radius** (a ring bigger than the parcel is what degenerated the Vault-Palace to a 3-anchor triangle); anchors that still land on bad ground are pulled **radially inward until valid, never culled** (last resort: a wall may stand in water — closure beats terrain purity). |
| **R-AR** | Through-wall passage only via arches. An arch may carry a WOOD gate leaf with CLOSED/OPEN/BROKEN states. | Gate anchors are ring vertices; wall segments clip short of gate points (never sealed); the leaf is the destructible `castle_gate_*` structure. |
| **R-GATE** | **Gate-count ladder (owner 2026-08-01):** the OUTERMOST wall carries `ringN+1` doors (KEEP 2 / CASTLE 3 / PALACE 4), each ward inward carries one fewer, floored at 2 — evenly spread from the attacker approach, staggered per ward so there is never a straight run to the keep. | Outer doors picked in `castleLayout` (evenly spaced wants from the attack bearing); inner-ward doors in `concentricRings` (staggered base angle + even spread). Sweep asserts the exact count per ring. |
| **R-ST1** | A stair NEVER intersects a wall. Only its TOP TREAD (the last ~4.5u) touches the wall — flush against the inner face. Stairs inside wall-internal structures are out of scope for generated maps. | Every candidate stair's centerline is verified ≥3.3u clear of EVERY wall segment outside the top-contact zone; violators are dropped. |
| **R-ST2** | A stair needs a CLEAR run: foot on open courtyard ground, top landing ON the wall-walk platform — never into a wall face, and never inside a tower drum (a top may land BESIDE a tower only if the tower is walk-through). Every gate keeps ≥1 stair (the parapet is always reachable). | `PERPENDICULAR` flights are built by PROJECTING onto the actual nearest wall segment and descending its true inner normal; candidate tops within 5u of a tower anchor are dropped; a gate whose candidates all fail gets its safe projected-perpendicular fallback (run compressed until the foot stands inside the ward). |
| **R-STD** | **Stairs are PER-RING DATA (v18):** every ring carries its own `stairs[]` computed with the full guard set, `siege.stairs` IS the outer ring's array, and renderers draw the flights VERBATIM (foot→top) — no renderer-side stair derivation exists anywhere. This retires the drift class where the preview and the data disagreed. | `concentricRings` calls `computeStairs` per ring (with the ring's own gates, the corner-tower list for ring 0, and the ward's ACTUAL clearance as the run cap so a flight never crosses the next wall line). |
| **R-GAP** | Multi-ring wards stay ROOMY at EVERY point — walls never merge, and the gap fits **at least 1 stair width + margin** (owner 2026-08-01). | v18: ward minimum = **12u** centerline-to-centerline (4.2 wall + 3.4 stair + ~4.4 margin), per-anchor AND segment-level (every inner anchor pushed until it clears the outer ring's whole polyline). On footprints too small to hold every ward at 12u (story-override palaces on LARGE estates) the minimum scales down to the honest radius budget, floored at 8.5u; the push NEVER crushes a ward below the keep footprint (14u) — only parcel-polygon dents may go deeper. `gapIn` = the ACTUAL min ward clearance. |
| **R-JOINT** | Wall runs join SEAMLESSLY — no slit at a bend or at a tower (owner 2026-07-28/08-01: "outer wall got gaps … please close this"). | Render kit: wall boxes overhang 1.6u past each anchor (v18, was 0.6 — sharp enclosure dents opened slits) and a fat corner post (3.4/3.8u ≥ the wall half-thickness at any miter angle, near-flush height) seals every wall↔wall / wall↔tower miter; gate anchors framed by the gatehouse. |
| **R-ENTRANCE** | The attackable entrance READS at a glance (owner 2026-07-28). | Designer preview renders the wooden gate leaves swung ~66° OPEN into the courtyard from the jambs; CLOSED/BROKEN remain runtime states in-engine. |
| **R-TREE** | **The walled interior is lived-in ground (owner 2026-08-01):** no trees/rocks inside the castle, and NOTHING ever barges a door arch. | `castleLayout` clears every FOREST/ROCK cell inside the outer ring polygon to OPEN (props can't bake there and the walk grid opens with it) and stamps a 14u apron disc at every gate so no canopy overhangs the entrance from outside. Sweep asserts zero TREE/ROCK props deep inside the interior or within 10u of a door. |

## How we prevent "the broken castle reaching the owner" again

1. **The failure class is unrepresentable**: anchors are repaired (inward pull), never culled — an
   open circuit cannot be emitted; stairs exist only as generator data that has already passed every
   guard, and renderers cannot invent their own (the per-gate renderer stair builders and the spiral
   are deleted, not just disabled).
2. **The sweep test** (`castle_geometry.test.js`) generates **all 37 castle parcels in the world**
   AND re-asserts **all 11 committed estate maps** against
   R-RING/R-EN/R-AR/R-GATE/R-ST1/R-ST2/R-ST3/R-STD/R-GAP/R-FLAT/R-TREE — 751 assertions at v18.
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
- The gate leaf renders per state: CLOSED (banded timber door), OPEN (raised/swung), BROKEN
  (shattered, passage free).
