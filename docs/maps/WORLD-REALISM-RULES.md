# World realism rules — the reusable rulebook for EVERY island (owner 2026-08-28)

## ★ NORTH STAR (owner 2026-08-28)
**Every area of every island is fully populated with planned detail — playable parcels AND non-playable
wild alike — so you can take drone shots coast-to-coast, all the way around the island, and it holds up.**
No bare filler anywhere. It's fine to load lands separately / hot-load adjacent tiles (adjacency
preload / streaming), but the DETAIL must be planned for the whole island, not just the played parts.
Consequences: (1) the non-playable wild is designed landscape (elevation-aware cover: rock peaks, wooded
slopes, meadow/marsh valleys — DONE), not noise; (2) the aerial + a future 3D fly-through both derive
from the same whole-island layers (heightfield + biome/cover + features), so a chunked streamer can page
the island in/out with neighbours preloaded and never show an empty gap; (3) coastlines, mountains,
forests, rivers all continue past the played parcels to the very shore.


These rules make the overworld aerial map read as a real world. They are **zone-agnostic** — the
pipeline (`map-service/maps/mosaic.js` + `heightfield.js`) takes a `zone` and applies all of them from
that zone's authored feature field (`data/world-terrain/<ZONE>.json`) + parcel geometry. **To realise a
new island: author its world-terrain field (rivers/roads/ridges/castles/pois) + have its L3 parcels,
then `node map-service/maps/mosaic.js <ZONE>` and commit the PNG.** No per-zone code.

This doc is the running record of the rules (owner: "document the rules — we'll reuse for other
islands") + the parameters to tune per island. Every new realism rule gets appended here.

## The pipeline order (mosaic bake)
1. **Parcels** → real polygon fill of each leaf's generated terrain (`genSampler`, = the battle map).
2. **Enclosed wild fill** → land-enclosed non-parcel space filled with seeded wilderness (connect the
   world); flood the sea in from the borders, anything it can't reach is interior.
3. **Shallows** → lighter water band hugging the coast, fading to deep sea.
4. **Land mask** → parcels + enclosed interior + thin coastal band. Everything else = OPEN OCEAN.
5. **Elevation + hillshade** → per-pixel elevation buffer, CLIPPED to land; sun-NW relief + rock/snow
   tint; frontier rim on the coast.
6. **Features** (roads, rivers, settlements) → drawn on top, CLIPPED TO LAND.
7. **Posterize** (drop 2 low bits) → keeps the PNG small.

## The rules & their tunables

| Rule | What | Params (in code) |
|---|---|---|
| **Aerial = battle maps** | The aerial is built FROM the parcels' generated terrain, never invented. Roads/rivers are realised in each battle map (`generate.js paintBand`); the aerial re-expresses them. Cities are the one thing still painted — next real build. | — |
| **Clip to land** | Roads/rivers/towns/mountains render ONLY on land; authored polylines run to the zone bbox, so without this they dangle over ocean. | `landReach = max(fillRadius, 2)·PPU` |
| **Open ocean = flat clean water** | Exterior sea has elevation 0 — no floating peaks/features. | — |
| **Continuous land** | Land-enclosed wild interior fills with seeded wilderness (non-traversible backdrop; no battle plays off a parcel). | `fillRadius` (coastal band, 3u) |
| **Shallows** | Lighter water band at the coast → deep sea, quantised to 4 bands. | `SH_OUT=5·PPU`, `SHALLOW`/`DEEP` colours |
| **Elevation** | Ridges → snow-capped massifs, rivers → valley floors, gentle hills between. Parcels ride the smooth base (near-flat / playable); the wild land carries peaks & valleys. | `heightfield.js`: `RIDGE_REACH 10`, `RIDGE_PEAK .97`, `RIVER_REACH 5`, `RIVER_FLOOR .06` |
| **Mountain tint** | High ground → bare rock, tops → snow. | `HIGH .70`, `SNOWCAP .90` |
| **Frontier rim** | Rocky coastal highland just outside the shore FRAMES the continent ("wall ridges outside the map lands") instead of land ending in water. | `RIM_OUTER=6·PPU`, `RIM_PEAK .6` (< snow line) |
| **Road widths** | Tiered, a FRACTION of a parcel (a highway used to be ~1u ≈ a whole single parcel — wrong). Dark casing under pale fill. | `RAD = {highway .18, secondary .11, local .07}` (zone-units radius) |
| **Rivers** | Real flowing water at honest width (naval-ready), banked. Main rivers stay prominent. | `river.width` from the field; `waterDominant` for the widest |
| **Settlements** | Castle/capital/town POIs → an organic town footprint (irregular muted tiles + scattered lanes), sized by kind. A town PATCH, never a board (canon 22). | `SETTLE_R` by kind |
| **PNG size** | Hillshade makes every pixel unique → posterize (drop 2 bits) + quantise shade (24 levels) + shallows (4 bands). | — |

## ELEVATION ↔ MOBA navigability (owner 2026-08-28)
Elevation complicates the MOBA — so the rule: **parcels stay flat & playable**; the drama lives in the
**non-playable wild** (peaks, coastal rim, steep slopes). The owner is fine with **sections of a map
that are entirely NON-NAVIGABLE**. So when the heightfield feeds `generate()` (next build): mark
high/steep ground as **BLOCKED / non-navigable** terrain (impassable cliff), never as walkable slope —
the battle map keeps a flat playable core with impassable high ground at the margins. No slope-movement
mechanics in the MOBA.

## Per-island checklist (realise a new continent)
1. Author `data/world-terrain/<ZONE>.json` (rivers, tiered roads, ridges, castles, capital POIs) — the
   top-down guideline. Roads should hub on capitals ("all roads lead to Rome"); ridges frame the rim.
2. Ensure the zone's L3 parcels exist (`data/hexagon-city-source/l3/<ZONE>.json`).
3. `node map-service/maps/mosaic.js <ZONE>` → commit `data/cf-maps/world-mosaic/<ZONE>.png` (+ planner).
4. Verify by rendering + LOOKING (never "it's good" from code). Tune the params above per the island's
   biome/era (`zone-cultures.json`).

## Backlog (realism improvements, in progress — owner autonomous sprint 2026-08-28)
Done: clip-to-land · frontier rim · shallows · elevation/hillshade · narrow roads · organic towns ·
enclosed wild fill · water rivers · ELEVATION-AWARE WILD COVER (rock peaks / wooded slopes / meadow-marsh valleys — the non-playable land is designed landscape). Next: river mouths/deltas · bridges & fords at road×river · ports at
coast · farmland rings round towns · beaches · lakes as water · biome-blended borders · gazetteer labels ·
per-zone era palettes · heightfield→generate (non-navigable high ground) · roll the bake to all zones.
(Full 20-item plan: `WORLD-REALISM-AUDIT.md`.)
