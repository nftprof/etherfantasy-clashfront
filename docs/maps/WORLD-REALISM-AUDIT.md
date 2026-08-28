# World realism audit — making the layers connect as one real world (owner 2026-08-28)

Owner ask: *"full audit + 20 things to make the map realistic — the layers should connect as if it's a
real map / real world; playable battle maps inside a complete universe usable for fly-through, story,
narrative. What are we missing vs a real world landscape and city built on top?"*

This is the **CF ParcelMap Design Agent** brief for the road from "a grid of parcels with roads drawn
on" to "one believable world you can fly through and tell stories in." It audits what exists, then lists
20 concrete builds, grouped and prioritised.

---

## A. Current state — the layers we have, and how they connect today

| Layer | Data / code | State |
|---|---|---|
| **Parcel geometry** | `data/hexagon-city-source/` (L2 estates, L3 singles) | ✅ real, tessellating; fixed forever |
| **Playable battle maps** | `generate()` per parcel → terrain artifact + thumb | ✅ per-polygon, playable, fair |
| **Macro feature field** | `data/world-terrain/<ZONE>.json` — rivers, tiered roads, ridges, castles, POIs | ✅ authored per zone; roads hub on capitals |
| **Aerial mosaic** | `map-service/maps/mosaic.js` — terrain + wild fill + baked roads/rivers/towns | ✅ new (2026-08-27/28) |
| **Biomes / culture** | `zone-registry.json`, `zone-cultures.json`, biome families | ✅ per zone |
| **Weather** | `data/continent-weather.json` | ◑ data exists, not rendered on the map |
| **Lore / history** | `docs/lore/WORLD-CHRONICLE.md`, `data/singulars.json`, towns | ◑ authored, weakly tied to map pixels |
| **Vertical world** | `zoneLinks` (airship, Diminishing Stair, Shaft), sky HS1–3, UW1–3 | ◑ canon + links; not a continuous fly-through |
| **Live state** | sim (siege/fire/ownership/battles) | ✗ not surfaced on the aerial map yet |
| **Elevation / hydrology** | — | ✗ **no continent-wide heightfield or watershed model** |

**How they connect today:** roads & rivers thread parcel-to-parcel via the `edgeCrossings` continuity
contract; the mosaic composites parcels + wild fill + the feature network into one continent image. That
is real continuity for the 2D top-down. **What does NOT connect yet:** elevation (no topography binds the
layers), hydrology (rivers are drawn lines, not flow from source to sea), the sea (outer world is void,
not water), the vertical layers (surface/sky/underworld are separate bakes), zone-to-zone (each continent
bakes in its own frame — no world atlas), and time (no seasons/weather/live-state on the map).

**The realism gap in one sentence:** we have a *plan drawing* of a world (correct geometry, roads, rivers,
towns) but not yet a *physical* world (topography → water → coast → climate → settlement logic → history),
and not yet a *living, navigable* one (time, depth, a fly-through camera). The 20 below close that gap.

---

## B. The 20 — grouped, each with why / effort / owner

### I. Terrain & nature (the physical ground)

1. **Continent heightfield (elevation model).** The keystone missing layer. A per-zone low-res elevation
   grid (ridges high, river valleys low, coast → 0) that the mosaic **hillshades** (sun-angle relief) and
   that everything else obeys. Instantly reads as real terrain; unlocks 2/3/8/9. *Big; CF ParcelMap.*
2. **Coherent hydrology.** Rivers should rise at high ground/springs, gather tributaries downhill, and
   reach a lake or the sea; add deltas/estuaries at the coast and lakes in basins. Derive/repair river
   polylines from the heightfield so water always flows downhill and connects source→sea. *Med; CF ParcelMap.*
3. **Render the sea (retire the void).** The outer dark is currently nothing; a real world has ocean —
   water colour, depth shading, shallows/reefs near shore, beaches at the land edge. Required for the
   naval layer and for a believable coastline. *Med; CF ParcelMap.*
4. **Biome bands & ecotones.** Blend biome families across zone borders and drive biomes by
   altitude/latitude (snow on peaks, tree-line, marsh in lowlands, desert belts) instead of hard per-zone
   blocks. No more seams between continents. *Med; CF ParcelMap.*
5. **Farmland & managed nature (von Thünen rings).** Real land near towns is *worked*: gardens → crops →
   pasture → managed forest → wild. Ring settlements with cultivated field-patchwork (hedgerows, crop
   colours, orchards/vineyards) so towns sit in agriculture, not raw wilderness. *Med; CF ParcelMap.*

### II. Water crossings & coast (where layers meet)

6. **Bridges, fords & ferries.** Wherever a road meets a river there must be an explicit crossing
   (bridge/ford), and wherever none exists the road should detour to one. These are realism AND gameplay
   choke points. Emit crossing structures at road×river intersections. *Small–Med; CF ParcelMap.*
7. **Ports, harbours & lighthouses.** Where a river meets the sea or a town sits on the coast, place a
   port (jetties, breakwater, warehouses) — the naval anchor and a trade/story hub. Lighthouses on
   headlands. *Small–Med; CF ParcelMap.*
8. **Roads that respect terrain.** Roads should switchback on slopes, hug valleys/contours, bend around
   lakes/ridges, and thin by tier — not run straight over mountains. Route the macro/side roads against
   the heightfield + obstacles. *Med; CF ParcelMap.*
9. **Full road connectivity ("every town reachable").** Extend beyond the capital hub: a minimum-spanning
   + desire-line network so *every* settlement pair has a plausible route, with proper junctions and a
   clear hierarchy (highway → secondary → local → lane). *Med; CF ParcelMap.*

### III. Cities & settlement (the world built on top)

10. **Settlement placement logic.** Real cities sit at river confluences, fords, harbours, crossroads,
    defensible hills. Give every town a geographic *reason* and add secondary villages/hamlets scaling with
    road density & good land — so the population map reads as organic, not sprinkled. *Med; CF ParcelMap.*
11. **Urban morphology (core → walls → suburbs).** Replace the uniform footprint with a real city: dense
    core, market square/plaza, districts, radial density falloff, curtain wall + gates for fortified towns,
    a harbour district if coastal, the castle/keep as the citadel. *Med; CF ParcelMap.*
12. **Era/culture art direction per zone.** Lock a coherent look per continent so terrain, roads, roofs,
    fields and city grammar all read the culture: Porthaven = colonial entrepôt (godowns, quays),
    HUB Tianxia = imperial China (axial boulevards, ring canals, grand gates), Mythoria = medieval walled
    city, sky HS1–3 = modern/near-future (skyports, clean blocks). Tie to `zone-cultures.json`. *Med; CF ParcelMap.*

### IV. One world (cohesion across layers & continents)

13. **Elevation/biome edge-continuity in parcels.** Extend the `edgeCrossings` contract so a parcel's
    battle map agrees with its neighbours on **elevation and biome** at shared edges (a ridge parcel is
    steep/rocky; a river parcel has the river entering/leaving at the right edges) — no seams on a
    fly-through from aerial → parcel → 3D. *Med; CF ParcelMap + MOBA BattleEngine RAW.*
14. **World atlas (stitch all 12 continents + the sea).** Place every zone in ONE global frame with a
    shared ocean, straits/land-bridges/sea-routes between continents, and consistent projection — so the
    world is one map, not eight independent bakes. *Big; CF ParcelMap + CF Overworld.*
15. **Vertical world made navigable.** Make surface ↔ sky isles (HS1–3) ↔ underworld (UW1–3) one traversable
    stack via the `zoneLinks` anchors (airship gateways, the Diminishing Stair, the Shaft), placed and
    visible on the map, so a fly-through can descend/ascend between layers. *Med; CF ParcelMap + CF Overworld.*

### V. A living, story-ready world (time, history, camera)

16. **Named everything (a gazetteer).** Real maps name rivers, mountains, forests, bays, regions, roads,
    passes. Extend the few authored names (Arcadia Flow, Grand Academy) to a full per-zone gazetteer — the
    substrate for labels, story and the Chronicle. *Small–Med; CF ParcelMap + CF Overworld (lore).*
17. **History written on the land.** Wire the World Chronicle to the map: monument POIs at great-battle
    sites, ruins from the three ages, first-deed inscriptions, shifted borders — so a fly-through *reads*
    the past. Plus an exploration POI layer (shrines, monasteries, mines, quarries, windmills, waystations,
    standing stones). *Med; CF Overworld + CF ParcelMap.*
18. **Dynamic layer — seasons, weather, day/night + live state.** Render `continent-weather.json` and a
    real-time overlay (siege blazes, fire, smoke, ownership flips, active battles) composited over the
    static aerial, refreshing ~hourly — the "living aerial map from a plane." *Med; CF Overworld + CF ParcelMap.*
19. **Cinematic fly-through camera + seamless LOD.** A spline/orbit camera that flies the world (title
    screen, "arrive at your land", story beats) with streaming LOD: aerial mosaic → parcel design thumb →
    full 3D scene, no pop. The tooling that turns the world into trailers & narrative. *Big; MOBA BattleEngine RAW + CF ParcelMap.*
20. **World-bible data model (the single source of truth).** One schema binding parcel ↔ elevation ↔
    hydrology ↔ roads ↔ settlements ↔ POIs ↔ names ↔ culture ↔ lore ↔ ownership ↔ live-state, queryable and
    renderable by every consumer (mosaic, sim, MOBA, story tools). This is what actually makes "the layers
    connect as if real" — every layer derived from and consistent with one model, not authored in parallel.
    *Big; CF ParcelMap + CF Overworld — the umbrella the other 19 hang on.*

---

## C. Priorities

**Do first (highest realism-per-effort, unblocks the rest):**
1. **#1 Heightfield** — the physical substrate; #2/#3/#4/#8 all derive from it.
2. **#3 Render the sea** — kills the "islands on void" read immediately, pairs with the new wild-fill.
3. **#6 Bridges/fords + #7 ports** — cheap, high-impact realism + naval/gameplay anchors.
4. **#5 Farmland rings + #11 urban morphology** — makes towns and their surroundings read real.
5. **#16 Gazetteer** — cheap, and everything narrative depends on names.

**Then the connective builds:** #2 hydrology, #4 biome bands, #8–#10 roads & settlement logic, #13 edge
continuity, #12 era art direction.

**Then the world-scale / living builds:** #14 world atlas, #15 vertical world, #17 history-on-land,
#18 dynamic layer, #19 fly-through camera — all resting on **#20 the world-bible model**, which should be
designed early even though it's delivered incrementally.

**Cross-team:** items touching parcel interiors (#13) and the 3D fly-through (#19) need **MOBA BattleEngine
RAW**; world-frame/travel/lore/live-state (#14/#15/#17/#18) coordinate with **CF Overworld eco**. Log
cross-team questions in `docs/coord/MOBA-CF-COORD.md`.

## D. Done already (the foundation this builds on)
Aerial macro-network baked (rivers/roads/towns), continuous wild-fill of land-enclosed interior
(non-traversible backdrop), organic town texture, per-polygon playable maps, `edgeCrossings` road/river
continuity, per-zone culture cards, the World Chronicle, `zoneLinks` travel canon. See
`WORLD-CONTINUITY-AND-ROADS.md`, `WORLD-MAP-RENDERING.md`, `CONTINUOUS-WORLD-TERRAIN.md`.
