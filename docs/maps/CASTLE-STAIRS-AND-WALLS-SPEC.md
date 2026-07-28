# Castle stairs & walls — the ruleset (owner 2026-07-27, GEN_VERSION 15)

*The owner's directives, made law: "stairs shouldn't intersect with the walls … stairs need a clear
path to a platform wall … paths into the walls are arches that can have gates … most keeps should be
enclosed … castles do NOT need to be on an elevation — flat on the existing land." Every rule below
is (a) enforced at GENERATION time by a repair, and (b) asserted over EVERY castle in the world by
`map-service/maps/test/castle_geometry.test.js` — so a violation fails CI, not the owner's review.*

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
- **Stair** — the ONE legal ground→platform transition. Modes: `PARALLEL` (flush alongside a
  straight wall run, offset 3.8u from the centerline), `PERPENDICULAR` (straight flight into the
  courtyard, base PROJECTED onto the real nearest wall segment), switchback (tall walls, render
  kit), spiral (the PALACE's tall final wall only).

## The rules

| # | Rule | Generation-time enforcement |
|---|---|---|
| **R-FLAT** | The castle sits FLAT on the existing land — no mound, no motte, no ramps. Elevation advantage comes ONLY from the wall-walk. | `moundSteps` always `[]`; the siege block emits NO `MOUND` tier1 entry (ridges — natural terrain — remain). Renderers read `steps[0].raise ?? 0` → flat with no code change. |
| **R-EN** | Enclosed circuits: every ring is a CLOSED wall loop — the only openings are arches. | Ring radius is capped by the **parcel polygon's inscribed radius** (a ring bigger than the parcel is what degenerated the Vault-Palace to a 3-anchor triangle); anchors that still land on bad ground are pulled **radially inward until valid, never culled** (last resort: a wall may stand in water — closure beats terrain purity). |
| **R-AR** | Through-wall passage only via arches; each ring keeps ≥1 (outer ring: 2 opposed). An arch may carry a WOOD gate leaf with CLOSED/OPEN/BROKEN states. | Gate anchors are ring vertices; wall segments clip short of gate points (never sealed); the leaf is the destructible `castle_gate_*` structure. |
| **R-ST1** | A stair NEVER intersects a wall. Only its TOP TREAD (the last ~4.5u) touches the wall — flush against the inner face. Stairs inside wall-internal structures are out of scope for generated maps. | Every candidate stair's centerline is verified ≥3.3u clear of EVERY wall segment outside the top-contact zone; violators are dropped. |
| **R-ST2** | A stair needs a CLEAR run: foot on open courtyard ground, top landing ON the wall-walk platform. Every gate keeps ≥1 stair (the parapet is always reachable). | `PERPENDICULAR` flights are built by PROJECTING onto the actual nearest wall segment and descending its true inner normal (the old gate-tangent offset drifted 3–13u off curved walls); a gate whose candidates all fail gets its safe projected-perpendicular fallback. |
| **R-GAP** | Multi-ring wards stay READABLE: consecutive rings ≥4.5u apart even on tiny polygon-capped castles. | `Rin = max(16, min(0.85·R0, 36, R0 − 4.5))`. |

## How we prevent "the broken castle reaching the owner" again

1. **The failure class is unrepresentable**: anchors are repaired (inward pull), never culled — an
   open circuit cannot be emitted.
2. **The sweep test** (`castle_geometry.test.js`) generates **all 37 castle parcels in the world**
   (every zone's castles[] with a designated hero parcel) and asserts R-RING/R-EN/R-AR/R-ST1/
   R-ST2/R-FLAT — 333 assertions. Any generator change that breaks any castle anywhere fails the
   suite. On its first run it caught 13 pre-existing violations on 6 castles (marsh-flooded rings,
   stairs drifting off curved walls, too-thin wards) — all fixed in the same pass.
3. **GEN_VERSION discipline**: geometry changes bump the version; SEED_V0 registry rows auto-reseed,
   and the deploy smoke check + `/internal/v1/moba-maps` expose the served version.

## Renderer notes (CF preview = reference; MOBA engine mirrors)

- Flat: no earthwork mesh (preview already guards `baseRaise>0`); walls sit at terrain height.
- Stairs land flush at `wallH` (+ring lift, always 0 now) on the inner face; draw treads from
  `siege.stairs[]` — the data is the single source, never derive placement.
- The gate leaf renders per state: CLOSED (banded timber door), OPEN (raised/swung), BROKEN
  (shattered, passage free).
