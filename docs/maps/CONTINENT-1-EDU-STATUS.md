# Continent 1 — EDU (Arcadia): M3 status report

> **From:** CF ParcelMap Design Agent · **To:** CF Overworld eco (main Dev) + owner · **Date:** 2026-10-27
> **Brief:** `docs/briefs/CONTINENT-1-EDU.md` (launch plan M3, PR #16). This is the report §3 of the brief asks for.
> **Deliverable file:** `data/world-terrain/EDU.continent.json` (regenerate: `node map-service/tools/world_continent_edu.mjs`,
> deterministic, 1 MB). **Operating manual for the bakes:** `docs/maps/MAP-POPULATION-GUIDE.md`.

## 0. Status at a glance

| § | Definition of done | Status | Where |
|---|---|---|---|
| 1.1 | 100 % of EDU baked into the LIVE registry on the box | 🟡 **queued, blocked by the box** — run `map-bake.yml` (zones=EDU, estates=true) is dispatched and will run the moment the self-hosted runner is restarted (M6: it died with the BUS-bake OOM on 2026-10-26 17:40 UTC; every queued run has waited since). EDU's 211 whole-estate maps ARE already live (phase 1). | §1 |
| 1.2 | 5 authored forts with `castleGeom` + hero-POI parcels | ✅ in the field + verified; the 4 subdivided castle parcels generate `castleGeom` and pass the sim gate; the Grand Academy (EPIC, un-subdivided) rides the committed estate map | §2 |
| 1.3 | Towns: 5 famous + lore towns | ✅ 5 famous towns located + biome/region-tagged; **6 lore towns** proposed at bridge-heads / road junctions, named per the EDU culture card | §3 |
| 1.4 | Roads / rivers / region gates / monuments + ruins | ✅ regions + gates computed per `REGION-GATE-SPEC.md` (23 regions, 15 gates, 5 barriers); 6 RUIN + 3 MONUMENT POIs placed | §4 |
| 1.5 | Per-parcel biome designation CF can load | ✅ **13,663 parcels + 211 estates**, canon `HexTerrain` names only (no new biome needed) | §5 |
| 1.6 | Box plumbing (`~/.ef_maps_key`, `~/.ef_maps_owners_url`) | ⬜ **owner / box admin** — files on the box, outside this agent's reach | §6 |

Two findings CF must act on (details §7): **(A) the id scheme** — CF's world uses the OLD token ids (`602…`); the registry and the fields use the current ids. The map-service now accepts both (alias shipped), and every record in the deliverable carries both ids. **(B) the travel graph** — EDU's 13,663 L3 parcels form ~100 disconnected clusters; the land between them is the 211 un-subdivided estates. "All of EDU" is only traversable if CF's world graph carries those estates as nodes (whole-estate maps exist for all of them).

---

## 1. Terrain bake (§1.1)

- **Done on the box (phase 1, 2026-10-26, run 40361626140):** all 211 EDU un-subdivided estate maps (1 EPIC palace, 4 GIANT castles, 6 LARGE keeps, 41 MEDIUM, 159 SMALL), 203/211 approved; the 8 unapproved re-settle via the new bare fallback chain on the next estate pass (chain retry).
- **Queued:** `map-bake.yml` zones=EDU estates=true (dispatched 2026-10-27 after the runner outage began). Expected: ~12 min, ~1.2 GB, ≈96–99 % sim-approved (the EDU sample measured 98.5 %). The run log prints the census before/after plus `bySize`/approved/forts and the failing-parcel list (bake-zone `FAILS`).
- **Existing EDU rows are orphans.** The July 2026 EDU bake (13,66x rows) was written under the old token ids and is unreachable by current ids — the census lists them as ORPHAN rows. Recommendation (needs owner OK, server state): delete them (1.3 GB) once the new bake has merged.
- **Failing-gate parcels that must pass** (castle / town / golden): checked locally — all 4 subdivided castle parcels pass; the 5 famous-town parcels and the 9 golden parcels will be reported from the bake log (`FAILS` list) and hand-fixed if any appear. The parcel-level bare fallback (guide §7 decision 5) would make this moot.
- **Thumbnails + `command.json`** are served per parcel by the map-service for every baked row — **now also under the old ids** (`GET /internal/v1/designs/60203670103` ≡ `/20203670103`).

## 2. Castles (§1.2) — ids in CF's scheme (old token id), current id = same tail with the size digit

| Fort | Estate | Castle parcel | Hero-POI parcels |
|---|---|---|---|
| CASTLE **Westgate Castle** | 2020367 | `60203670103` | 60203670103, 60203670019, 60203670376, 60203670126, 60203670000 |
| CASTLE **Southreach Castle** | 2020368 | `60203680154` | 60203680154, 60203680367, 60203680256, 60203680396, 60203680313 |
| KEEP **Cliffwatch Temple** | 3020352 | `60203520121` | 60203520121, 60203520157, 60203520197 |
| KEEP **Lantern Hill Temple** | 3020351 | `60203510131` | 60203510131, 60203510026, 60203510182 |
| PALACE **The Grand Academy** | 1020371 | estate map (`data/cf-maps/parcels/1020371.json`) | — (un-subdivided: the whole estate IS the battle map; the 8 EPIC hero POIs would be interior anchors of that map — see MAP-POPULATION-GUIDE B-7) |

All five carry `meta.castleGeom` (rings, keep, mound, per-zone style). The quota LARGE 3 / GIANT 5 / EPIC 8 is the shared rule in `tools/world_hero_parcels.mjs`. Full list for all zones: `docs/maps/CASTLE-INVENTORY.md`.

## 3. Towns (§1.3)

**Famous (from `data/towns.json`, verified present in the EDU table):**

| Town | CF id | Biome | Region |
|---|---|---|---|
| Saltmarket | 60202580008 | PLAINS | EDU-R01 |
| Ironhollow | 60203490046 | PLAINS | EDU-R03 |
| Goldenloaf | 60203600050 | ROAD | EDU-R01 |
| Wayfarer's Rest | 60202790103 | PLAINS | EDU-R21 |
| Vellmoor Relic Bazaar | 60203370064 | PLAINS | EDU-R01 |

**Lore towns proposed (player-ownable, `famous:false`) — named for lessons per the Arcadia culture card:**

| Town | CF id (current) | Site | Region | Goods |
|---|---|---|---|---|
| First Question | 60202620019 (50202620019) | bridge-head, Arcadia Flow | EDU-R01 | food, wood |
| Inkstone | 60202790001 (40202790001) | bridge-head, Arcadia Flow | EDU-R19 | stone, rareMetal |
| Bellterrace | 60203550072 (30203550072) | road junction | EDU-R01 | food, fur |
| Second Lesson | 60202860102 (40202860102) | bridge-head, West Tributary | EDU-R10 | wood, iron |
| Chalkford | 60200450000 (50200450000) | road junction | EDU-R01 | stone, food |
| Lamplight Row | 60203630295 (20203630295) | road junction | EDU-R03 | fur, rareMetal |

Delivered in the file as `towns[]` (CF's `FamousTown` schema + `famous:false`, `parcelIdCurrent`, `site`, `region`, `roads`) and, in the PR to CF's branch, as a `loreTowns[]` array in `data/towns.json` so the current `registerFamousTowns` loader (which treats every `towns[]` entry as a permanent dev-held sanctuary) does not swallow them — CF wires `loreTowns` as ownable towns.

**Town POI + market square + road spur on each parcel's design:** the generator does not yet have a TOWN feature (guide items B-5 / F-12); the towns sit on PLAINS/ROAD parcels on the road network, so marches reach them on roads today. The market-square archetype is the next generator item.

## 4. Roads, rivers, regions, gates, monuments, ruins (§1.4)

- **Roads/rivers through the designs:** every parcel the 54 roads cross is designated ROAD (1,213 parcels; 0.5× move cost on CF's side), every parcel the 2 rivers cross is RIVER (369). The road/river geometry is already painted into each parcel's battle map by the field window.
- **Regions (REGION-GATE-SPEC §2):** nodes = 13,663 parcels + 211 estates; adjacency = bbox touch (0.3 u) cut by the river/ridge bands; components ≥40 nodes = regions, slivers folded. **23 regions** (`EDU-R01` = the central plateau, 7,504 nodes; R03/R05/R07 the far banks; the rest rim pockets). Dial: `MIN_REGION` in the tool (raise to merge pockets).
- **Gates — 15, every touching region pair has ≥1** (reachability invariant): 5 bridges (Terrace Road over the Arcadia Flow / West Tributary at estates 3020361, 4020313, 4020332, 4020333 and parcel 60203470134), 3 passes over the rimwalls (3020344, 60203450079, 60203680256), 5 fords and 2 scrambles where no road crosses (the generator's `barriers[].gates` list; a ford/scramble is the owner's cue to draw a road there). Gate records carry `connects`, `barrier`, `road`, `biome`.
- **Barriers:** `EDU-B-EDU-RV1` (Arcadia Flow, 2 gates), `EDU-B-EDU-RV2` (West Tributary, 3), the three rimwalls (`RG1` 0 — the east rim has no crossing by design, `RG2` 2, `RG3` 1); `regionBoundary` = the feature polyline for the dotted-border overlay.
- **Monuments (3):** The Westgate Field `60203670111` · The North Stele `60203480130` (Tianxia road) · The Scholar's Cairn `60201890012` (the Gap).
- **Ruins (6, depth layer 1, two under each rimwall):** the Broken Lectern `60201350014` · the Drowned Library `60202280054` · the Old Examination Hall `60201760048` · the Unlit Beacon `60203680155` · the Quarry Chapel `60202020057` · the Fallen Torii `60202010004` — each with `ruinType` + inscription (`pois[]`).

## 5. Biome designation (§1.5)

`biomes` (13,663 parcels) + `estateBiomes` (211 estates), **canon `HexTerrain` only — no new biome is needed for EDU** (inland plateau: no COAST/OCEAN):

| Terrain | Parcels | Estates | Rule |
|---|---:|---:|---|
| PLAINS | 7,233 | 89 | towns · the river basin · open noise |
| FOREST | 3,384 | 66 | highland forest, denser toward the rim |
| ROAD | 1,213 | 31 | a world road crosses (bridges/passes included) |
| HILLS | 757 | 12 | ≤4.5 u under a rimwall (terraces) · castle parcels |
| MOUNTAIN | 707 | 5 | a rimwall crosses |
| RIVER | 369 | 8 | a river crosses |

Precedence ROAD > RIVER > MOUNTAIN > HILLS > PLAINS > FOREST; noise = 2-octave seeded value noise (spatially coherent patches). Golden-9 check: 60200030000 ROAD · 60200060000 PLAINS · 60202790016 RIVER · 60203370001 PLAINS · 60203370004 RIVER · 60203370006 PLAINS · 60203370158 RIVER · 60203670103 ROAD (Westgate) · 60203680173 ROAD.

**Format:** sibling file `data/world-terrain/EDU.continent.json` rather than a key inside `EDU.json` — the map-service fingerprints `EDU.json` and would re-seed all 13,663 battle maps on every designation tweak; the designation does not change battle maps. Keys = CF's ids; `idMap` old→current for the zone.

## 6. Box plumbing (§1.6) — owner

- `~/.ef_maps_key` (= the designer registry `x-maps-key`) and `~/.ef_maps_owners_url` → `http://localhost:8130/api/land-owners` on the cf box. Outside this agent's reach (no SSH; the runner is the only hand on the box and it is down).
- **Runner restart is the gating item for §1.1**: `actions-runner-cf` (user ubuntu) has been offline since the OOM kill. Queued and waiting in order: deploy ×2, BUS bake resume, UW1 bake, **EDU bake**.

## 7. Findings CF needs to act on

**A. Two id schemes.** `data/demo-world.json`, `data/towns.json` and the golden-9 brief use the OLD hexagon-city token id (`602…`, `tokenIdOld` in `l3/EDU.json`); the designer registry, world fields and castle inventory use the CURRENT size-encoded id (`502…`/`402…`/`302…`/`202…`, same 10-digit tail). Consequences: the July EDU bake rows are orphans (above); CF's thumbnail/command fetches by old id would have 404'd. **Fixed on the map-service side 2026-10-27:** `l3Row` / `canonicalParcelId` alias — any API path accepts either id and hits the same registry row (test-covered). CF's M3-CF rebuild of the world graph from `l3/EDU.json` should keep `tokenIdOld` as the hex id (to preserve save compatibility) or migrate once; either way carry both.

**B. The travel graph needs the estates.** The 13,663 L3 singles live only inside the 161 subdivided estates; at any sane touch threshold the L3-only graph is ~100 islands (measured 104 components at 0.04 u, 65 at 1.0 u). Between them the land is the 211 un-subdivided estates — real map units with live whole-estate battle maps. For "a continent players can fully play on", CF's world graph must include those estates as hexes (estate id = `1020371`-style, 7 digits, same in both schemes), with adjacency from bbox touch at 0.3 u; the 34 `landBridges` in the file list the remaining source-svg gaps to bridge explicitly. The region/gate partition in this file is computed over that full graph.

## 8. Open decisions (§4 of the brief)

1. **Lore towns:** 6 proposed (§3). Veto/rename freely; sites are deterministic picks (bridge-heads first).
2. **Failing-gate castle/town/golden parcels:** none among the castle parcels locally; towns/golden reported from the bake log; recommend the parcel-level bare fallback so the question disappears.
3. **Pre-bake render manifests:** no — lazy is fine for the playtest (first battle load converts once, then cached).
4. **Second continent:** **HUB (Tianxia)** — the only continent EDU connects to by land (`EDU-GATE-N` ↔ `HUB-GATE-S`, the Arcadia Flow → the Tianhe; `OVERWORLD-CONNECTIONS.md`), the capital heartland (24 EPICs), and the HUB shaft is the door to the underworld. BUS (Porthaven) is a sea-port hop (Mythoria/Porthaven/Arcadia do not border by land) and needs the ports layer first. HUB needs ~5 GB of registry disk (guide §7 decision 1).
5. **Regions granularity:** 23 regions today (one dominant plateau); raise `MIN_REGION` or merge the rim pockets if CF wants fewer toll gates.

## 9. Verification from CF's side (brief §2)

| Artifact | How to check now |
|---|---|
| thumbnails + `command.json` | `GET https://map.etherfantasy.com/internal/v1/designs/60203670103/thumb.png` (old id works) — full-zone coverage after the queued EDU bake merges |
| `heroParcels[]` | `EDU.continent.json castles[]` (both id schemes) or `data/world-terrain/EDU.json castles[]` (current ids) |
| towns | `EDU.continent.json towns[]` / `famousTowns[]`; PR adds `loreTowns[]` to `data/towns.json` |
| `biomes` | `EDU.continent.json biomes` + `estateBiomes`; load in preference to the procedural pass; `regions`/`gates`/`barriers` for the overlay + tolls |
| invest endpoint + key | needs `~/.ef_maps_key` on the box (§6) |
