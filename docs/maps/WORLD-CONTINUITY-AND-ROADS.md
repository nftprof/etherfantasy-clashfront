# World continuity, roads & per-zone era design — the plan (owner 2026-08-27)

Goal: before public launch, the world must **feel continuous and real** — a single land parcelled out
to owners, not islands of parcels floating on black. This brief is the running plan; phases ship
incrementally and each is verified by rendering + looking (never "it's good" from code alone).

## 0. Settled fact — the land already tessellates (do NOT redo it)

Measured across 200 nearest-neighbour L3 pairs in EDU: **180 (90%) share polygon edges EXACTLY
(gap < 0.001 zone-units)**. Parcels DO use their full per-parcel polygon. The visible "gaps" were:
1. **Baked border strokes** — a 1px raster outline per parcel, upscaled into black seams. REMOVED.
2. **Real open space** — the ~10% of neighbours that aren't truly adjacent are separated by genuine
   road / river / undeveloped strips (a continent is ~8–9% legitimately non-parcel; see
   WORLD-MAP-RENDERING.md trap #4). This is the DEFAULT LAND between plots — to be filled continuous.

So the fix is **fill the between-parcel space with continuous default land**, not re-cut geometry.

## 1. Continuous default land (PHASE 1 — the between-parcel fill)

The space between parcels (roads, commons, undeveloped) must read as continuous wilderness LAND, not
dark void. Approach: in the mosaic bake, after filling every parcel polygon, fill the **internal**
non-parcel area (within a land mask = parcel coverage dilated by ~a few parcel-widths, so internal
gaps + road corridors fill but the outer frontier / ocean stays dark) with seeded WILDERNESS terrain
(grass + forest clumps, the zone biome). Parcels = developed plots ON the continuous land; the macro
road/river network (feature overlay) threads over it. "It's OK to still have clusters of trees or
roads yet to be built" (owner) — the wilderness fill IS that unclaimed land.

## 2. Road continuity (PHASE 2 — parcel-to-parcel links)

Roads currently stretch WITHIN a parcel (seeded per-parcel) and don't connect to neighbours — reads
wrong. Two layers must both be continuous:

- **Macro network** (`data/world-terrain/<ZONE>.json` roads: highway/secondary/local) — already
  threads continuously across parcels via the `edgeCrossings` continuity contract (a road leaves
  parcel A at the exact shared-edge point it enters parcel B). This is correct; keep + extend.
- **Per-parcel SIDE roads** — the small brown paths inside each battle map are seeded independently,
  so they dead-end at the parcel edge instead of meeting the neighbour's. **Fix (generator):** seed
  side roads to ATTACH to the parcel's `edgeCrossings` (enter/exit at shared-edge points), so most
  adjacent parcels' side roads line up across the seam. Some dead-ends / "road to be built" are fine.
- **"All roads lead to Rome"** — main city / castle estates are the network hub: highways radiate
  from the capital, secondary roads feed them, local roads branch to plots. Author per zone in the
  world-terrain road graph (or generate from the castle POIs outward).

## 3. Per-zone ERA & city design (PHASE 3 — historical references)

Each zone gets an era-appropriate road/city grammar (owner 2026-08-27). Ground-war eras for the
surface; modernise/future for the sky. Map by zone culture (`data/zone-cultures.json`) + geography:

| Zone (culture) | Era / reference | Road & city grammar |
|---|---|---|
| **Porthaven** (mercantile port) | **early Singapore / colonial entrepôt** | harbour front, godowns, grid quays radiating from the port; jetties, bridges over creeks |
| **HUB — Tianxia** (imperial, R. Tianhe) | **ancient China** capital | axial boulevards, ward grid, ring canals, grand gates; cardinal orientation |
| **EDU — Arcadia** (scholarly) | **classical / medieval academy town** | organic lanes to the Grand Academy, ring roads, stone bridges |
| medieval zones (Mythoria etc.) | **medieval European** walled city | radial from the keep, curtain-wall gates, market square, winding lanes |
| **Sky HS1/HS2/HS3** (above-ground isles) | **modern / near-future** | airfields & skyports, elevated causeways, clean orthogonal blocks, no ground-war forts |
| UW deep (Blackmere/Magma) | drowned-gothic / infernal | causeways over water & lava, sparse, boss-gate arteries |

Deliverable per zone: a road-era spec + regenerated macro side-road graph + generator grammar tweak,
re-render + capture. Study references first, then author. (This table is the working assignment;
refine against `docs/lore/ZONE-CULTURES.md` + the 12-continent era plan in CONTINUOUS-WORLD-TERRAIN.md.)

## 4. Water (DONE 2026-08-27)

Main rivers + oceans flow as real water (`waterDominant`) — mostly-water parcels with island remnants
+ causeway bridges, naval-ready. See WORLD-MAP-RENDERING.md. Bridges + island-expansion become player
upgrades later.

## Phase order & status
- [x] Land tessellation confirmed (no redo) · water-dominant rivers/oceans.
- [ ] **Phase 1** — continuous between-parcel wilderness fill (mosaic bake + land mask).
- [ ] **Phase 2** — per-parcel side-road continuity (attach to edgeCrossings) + roads-to-castle.
- [ ] **Phase 3** — per-zone era road/city grammar, zone by zone, references first.

## 5. Polygon vs thumbnail vs playable map — the shape mismatch (owner 2026-08-27)

Diagnostic (one edge parcel, `scratchpad/compare` method): polygon = the true shape; **3D thumbnail
= a full SQUARE arena that ignores the polygon**; playable map = respects the polygon (OOB outside).
Measured OOB (non-polygon fraction of the ±161 square): **33–40% for compact parcels, up to 91% for
slivers**.

- **The playable map is NOT the bug.** Per canon 5b the parcel's irregular shape IS the battlefield
  and the OOB surround is intentional non-playable boundary (cliff/water) — same as the clean hexes
  in cf.etherfantasy.com. So each battle map is already built per-polygon.
- **The 3D thumbnail IS the mismatch.** The designer 3D scene renders the whole ±161 square (OOB and
  all), so the capture is a square that doesn't match the parcel shape → jagged at map scale.
- **Map-view fix (DONE):** default the /designer surface to the generated PLANNER terrain, which fills
  each TRUE polygon cleanly. 3D thumbs are now an opt-in layer, not the map surface.
- **Thumb fix (TODO, MOBA BattleEngine RAW domain):** the 3D designer scene / capture should render
  the BOUNDS polygon shape (OOB transparent/void) so the thumbnail matches the parcel — then thumbs
  can return as the map surface + zoom LOD. Alternatively the capture pipeline clips each thumb to the
  fitToArena bounds polygon before compositing. Relay to the MOBA/3D agent.
- **genSampler mapping note:** the mosaic's terrain sampler maps polygon-bbox→whole-arena, which for
  non-square parcels samples some OOB into the interior; a fitToArena-correct mapping would place the
  real playable terrain exactly. Minor at map scale; fix alongside the thumb work.
