# CASTLE RULES — the complete consolidated rulebook (owner request 2026-08-31)

**This is the ONE document listing every castle rule in force**, consolidated from
`CASTLE-STAIRS-AND-WALLS-SPEC.md` (v18→v28 history — that doc remains the change log),
`CASTLE-ARCHITECTURE-STUDY.md` (the WHY — real fortification, miniaturized), `CASTLE-RENDER-BRIEF.md`,
and the live constants in `map-service/maps/generate.js` (GEN_VERSION 28). Every number here is read
from the code, not from memory. Enforcement column: **G** = generation-time repair/construction,
**CI** = asserted by `maps/test/castle_geometry.test.js` over all 37 world castles + 11 committed
estates + siege-test (1276 checks), **R** = renderer contract (preview3d = reference; MOBA mirrors).

## I. Site & massing

| ID | Rule | Numbers | Enf. |
|---|---|---|---|
| **R-FLAT** | The castle sits FLAT on the land — no mound/motte/earth ramps; elevation comes ONLY from the wall-walk. | `moundSteps=[]`, no MOUND tier | G+CI |
| **R-EN** | Every ring is a CLOSED loop; only arches pierce it. Anchors repair inward, never cull. | ring ≤ parcel inscribed radius | G+CI |
| **R-RING** | Tier ring ladder is a CEILING; the achieved radius affords `floor((R0−14)/12)+1` full-width wards — cramped land builds fewer rings, never a crushed nest. | KEEP 1 / CASTLE 2 / PALACE 3 | G+CI |
| **R-HEIGHT** | Hero-scale wall heights (v23 floors): KEEP 14 / CASTLE 16 / PALACE 18; inner rings climb; keep towers 20/24/30 (tiers 2/2/3). Arch headroom = 0.65×wallH. | `CASTLE_TIERS` | G |
| **R-KEEP** | Outer circumference ≥ keep's: PALACE ≥2× (target 3×), CASTLE ≥1.5× (target 2×); cramped land SHRINKS the keep (`keep.w`), never the ratio. | keep visual r ≈ 0.72×w | G+CI |
| **R-GAP** | Wards stay roomy at EVERY point: generation floor 12u wall-centerline (4.2 wall + 3.4 stair + margin), target 16u; segment-level, not just anchors. Too tight ⇒ fewer rings (R-RING), never thinner wards. **Measured truth (2026-08-31 review): polygon-pull dents compress a few castles to 9.5–11.7u locally — the CI hard floor is 9u (raised from 7.5), the 12u is the settle target, not a world guarantee.** | target 12/16 · CI ≥9 | G+CI |

## II. Walls

| ID | Rule | Numbers | Enf. |
|---|---|---|---|
| **R-BODY** | Curtain = the ring POLYLINE at thickness 4.2u; collision comes from the polyline with openings at gates. WALL anchors = vertices (`blocking:"WALL_RING"`), never independent cylinders. | t=4.2 | G+R |
| **R-WALK** | The wall top is one continuous WALKABLE walkway: `wallWalk{walkable,surfaceY=h,walkWidth≈1.9,merlons}` — merlon TEETH on BOTH parapet edges, clear centre, NEVER a block across the walk; inner teeth gapped at stair tops + gates; low inner guard-rail. | merlons w1.15 gap2.2 | G(data)+R |
| **R-JOINT** | No slit at any bend or wall↔tower miter: wall boxes overhang 1.6u past anchors + a fat corner post (r 3.4/3.8 ≥ half-thickness at any miter) seals every joint. | | R |

## III. Towers

| ID | Rule | Numbers | Enf. |
|---|---|---|---|
| **R-TURRET** | Tower = **DRUM_TURRET**, two parts: solid drum (ground → wall-walk height, `blocking:"SOLID"`, r 5.4 — units circle it, never through) + turret hut ABOVE an open walk-through band (the wall-walk passes THROUGH every tower, `wallWalkThrough`, `passageW 3.2`) with **archer ports** (3 arrow-loops, outward + flanks) and a roof. | contract on anchors + `wallRing.towers` | G(data)+R |
| **R-GATE-TOWER** | **No arch in the crook of a tower** (owner 2026-08-29): EVERY tower — mural `castle_tower_*`, lane `tw*`, and renderer-DERIVED — keeps ≥16u from every gate; a door is framed by its gatehouse only. | `TOWER_GATE_MIN=16`, `towers.gateClearance=16`, derived-tower clearance 16 | G+CI+R |
| **R-TWALL** | Free lane towers keep ≥ ~2× wall thickness off the ring centerline (never stuck in the wall / on stairs), relocating radially OUTWARD only (the courtyard belongs to the keep + player builds). | `MIND = 8.82` | G |
| **R-TSPACE** | Mural drums punctuate every ~26u of curtain run; corner towers skip anchors near gates (R-GATE-TOWER). | `every: 26` | R (from `wallRing.towers`) |

## IV. Gates & roads

| ID | Rule | Numbers | Enf. |
|---|---|---|---|
| **R-AR** | Through-wall passage ONLY via arches; an arch carries a destructible WOOD gate (`states CLOSED/OPEN/BROKEN`); walls are otherwise continuous. | | G+CI |
| **R-DOOR** | Openings are WIDE + TYPED: clear passage `gateOpenWidth = 13` (~9.6 m), flanking gatehouse towers seated OUTSIDE the passage; main/road gate = **PORTCULLIS** (raise-up), others = **DOUBLE_LEAF** (swing). **v28 review fix P4: no drawbridge ⇒ the portcullis crowns the widest ROAD door (was: castleGates[0], a side door).** | `GATE_OPEN_W=13` | G(data)+R |
| **R-GATE** | Gate-count ladder: outer wall `ringN+1` doors (KEEP 2 / CASTLE 3 / PALACE 4, road doors count, cap 5); each ward inward one fewer (floor 2), staggered — never a straight run to the keep. | | G+CI |
| **R-SPACE** | Doors ≥20u apart (two close openings erase the wall between). **Postern exception (v28):** a sally door added by R-REACH-ALL may sit ≥14u from a grand door (arches 5.5+5.5 still leave ≥3u of curtain) — cramped citadels must open before they stay pretty. | 20u / postern 14u | G |
| **R-POSTERN** | *(v28)* A wall that seals off a real ground pocket (≥25 walkable cells with no door facing it) gets a **postern door** (`castle_gate_Np`, r 5.5, DOUBLE_LEAF) at the best wall segment straddling pocket↔field — real castles have sally ports, never blank masonry facing a field. Site rules: ≥14u from doors, ≥16u from towers — but an **expendable** drum (not a gatehouse flanker, ≥16u from every door) may be DEMOTED to a wall anchor to make room. Hard cap 5 doors/ring holds; a pocket that still can't open is masked walk=0 instead (see R-REACH-ALL). | postern spacing 14u | G+CI |
| **R-ROAD / R-PATH** | **A road that meets the wall meets it AT a door** — never blank masonry. One wide door per road crossing: crossings of the same road MERGE (<22u), the anchor moves to the road-cell CENTROID (exact centre), arch half-width ≈ 0.75× road width (opening ≥1.5× road width, cap 26u); the approach re-carves outside→arch→inside and wall-hugging road cells sweep away. Post-repair corridors get doors too. **v28 review fix P2: repair-road doors size from their crossing (no more fixed r 5.5), and a POST-BAKE re-measure widens any door whose final road outgrew its arch (widen-only).** | v24 merge + v21 recarve + v28 re-measure | G+CI |
| **R-ENTRANCE** | The attackable entrance reads at a glance (gate leaves drawn swung open in the preview; runtime states in-engine). | | R |
| **R-BRIDGE** | The moat/water crossing (drawbridge/causeway site) names the MAIN gate; PORTCULLIS goes there. | | G |

## V. Stairs & access (walkability)

| ID | Rule | Numbers | Enf. |
|---|---|---|---|
| **R-TYPES** | EXACTLY TWO stair types (spiral retired): `PERPENDICULAR` (down the wall's inner normal, top tread flush ON the walk) and `PARALLEL` (flush along the wall face, embedded 0.35u, ending at walkable wall/tower). Width 3.4u. | off 3.45 | G |
| **R-ST1/2/3** | A stair never intersects a wall (centerline ≥3.3u clear outside the last ~4.5u top-contact); top lands ON the walk (never in a tower drum, ≥5u from tower anchors); foot stands INSIDE its ward on walkable ground. Design offsets (2026-08-31 review correction): PERPENDICULAR foot 2.7u + run off the wall face; PARALLEL embedded 0.35u at lateral offset 3.45u. | off 2.7 / 3.45 | G+CI |
| **R-STD** | Stairs are PER-RING DATA — renderers draw `rings[].stairs[]` VERBATIM; no renderer-side stair derivation exists. | | G+R |
| **R-REACH** | Every flight's foot is BFS-reachable from the courtyard (shared `traverse.js` model — generator and audit can never disagree); a ring never drops to zero stairs. | | G |
| **R-REACH-ALL** | *(v28, owner 2026-08-31 "units running non-stop into rocks/walls")* **Walkable ⇔ reachable, walls included.** The honest-walk-mask pass floods the WALLS-STAMPED model (the exact `stampWalls` the audit + engine use) and demands ONE connected field containing all spawns + lanes: (1) sealed pockets holding resources/build-spots get a CARVED corridor; (2) river/rock-split landmasses (≥25 cells) get a ford/causeway at the banks' closest approach; (3) wall-sealed pockets get a POSTERN (R-POSTERN); (4) whatever still can't connect is masked walk=0 and stranded objects/spawns hop to the main field — no engine can ever path a unit into ground it can't reach. CI runs the full traverse audit per artifact: components=1, isolatedCells=0, 100/100 walks, all stair feet. | 4 assertions × 48 castles | G+CI |
| **R-GRADE** | **Walkable grade (v27):** flight RUN targets `rise × 1.2` (grade ≈ 39.8°) wherever the ward/wall stretch affords it — longer on taller walls, not steeper. Tight geometry compresses but stays STEPPED. **Measured truth (2026-08-31 review, corrects the earlier 39.9° claim): world median 47.5°; 55% of 393 flights exceed 40.5° (ring-2 wards 100%, max 76.1°)** — tight wards physically can't stretch the run; the fix is R-SWITCH (switchback flights), not a longer plank. | `GRADE_RUN` | G |
| **R-STEP** | Every flight ships its full stepped spec: `steps` (≈h/1.5, 5–12), `riser`, `tread`, `rise`, `grade`, `width`, `material:"STONE"`, `render:"STEPS"`, `walkable`. **Render as steps — NEVER a sloped plank.** | | G(data)+R |
| **R-RAMP** | A renderer may substitute a ramp ONLY if it is **WOOD-coloured and ≤40°** (`rampAlt{material:"WOOD",maxGrade:40}`) — a ramp is gentler than the stair, never steeper, and reads as timber, not masonry. | 40° | R |
| **R-SWITCH** | *(v28, designed not built)* Tight tall walls get a SWITCHBACK (two flights + landing, `yFoot`/`landing` fields) to halve grade in the same footprint — `docs/briefs/STAIR-SWITCHBACK-SPEC.md`. Ships only after both renderers honor `yFoot`. | | spec |

## VI. Interior & surroundings

| ID | Rule | Numbers | Enf. |
|---|---|---|---|
| **R-TREE** | Lived-in ground: no TREE/ROCK inside the outer ring; nothing barges an arch (14u apron per gate; sweep asserts none within 10u of a door). | | G+CI |
| **R-WARD** | Breach ward: a flat open pocket ≥25u just inside the main gate — the break-through fight has ground. | | G |
| **R-PAD** | No-overlap build pads: baked tower/CC pads sit off the wall band (≥8.8u) — **EVERY ring's polyline (v28 review fix P1; previously only the outer ring was guarded and 16 castles had pads 0.2–8.3u from an inner ward wall)** — clearly off any castle structure (≥13.8u) and the keep. | `PAD_WALL/PAD_STRUCT`, all rings | G |
| **R-RCLR** | Roads stay walkable everywhere: no ROCK within 3 cells / FOREST within 2 cells of any road cell (castle approaches included). | BFS clear | G |
| **R-LAND** | Walkable ground is FLAT (zero height-noise under walkable cells); water shore shelves ≥6u (wade→swim), never a vertical plunge. | v23 | G |

## VII. Data contracts renderers MUST read (never re-derive)

- `siege.wallRing` / `castleGeom.rings[]`: `pts,h,t,archClearH,gates(+door),ringN,wallWalk{…},
  gateOpenWidth, towers{form:"DRUM_TURRET",every:26,wallWalkThrough,passageW:3.2,archerPorts:3,roof,
  gateClearance:16}`, per-ring `stairs[]` (full R-STEP fields), `surfaceY/walkWidth` per ring.
- Structure anchors: GATE `blocking:"DOOR"` r=arch half-width (road gates wider) · TOWER
  `blocking:"SOLID"` + DRUM_TURRET fields · WALL `blocking:"WALL_RING"` (collision from the polyline).
- The preview (`/designer/3d?parcel=…`, `preview3d.html`) is the REFERENCE implementation; the MOBA
  3D client mirrors it (open items relayed in `docs/coord/MOBA-CF-COORD.md`).

## VIII. Process (how the rules stay true)

1. **CI sweep** — `castle_geometry.test.js`: all 37 world castles generated live + all 11 committed
   estates + siege-test, 1084 assertions (incl. R-GATE-TOWER). Any breakage fails CI, not the owner's eyes.
2. **GEN_VERSION discipline** — geometry changes bump it (now 27); registry seed rows reseed; the map
   service exposes the served version.
3. **Re-bake contract** — after generator changes: `node tools/make_siege_test.mjs` +
   `node tools/estate_palace_maps.mjs` (deterministic, byte-stable), commit the artifacts.
4. **Delivery** — `sync-moba-maps.yml` auto-mirrors `data/moba-maps/` to the engine repo on every
   `deploy/map`; the engine's `deploy_client.sh` carries the FAIL-FAST freshness guard (never ships a
   stale vendored map; `tools/vendor-moba-maps.sh` is the one-line fix).
5. **Audit cadence** — full-rulebook reviews land in `docs/reports/` (latest: CASTLE-AUDIT-V27 + the
   post-generation CASTLE-RULES-REVIEW).
