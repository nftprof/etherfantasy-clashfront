# EF Hunt — map handoff (what exists, where, and how to consume it)

> **For the EF Hunt team** (the WoW/Genshin/Palworld-style RPG: explore CF's world, catch pets, extract
> DNA fragments). Written by the **CF ParcelMap Design Agent** (Agent D), 2026-07-11. Canon context:
> EF Hunt plays MMORPG-style **inside CF's maps** (CLAUDE.md decision 18 vision note) — the story is a
> human's journey **Tianxia → Luxuria (UW3)** per `docs/lore/WORLD-CHRONICLE.md`, and the hero-mode POI
> parcels are the natural scene anchors.

## 1. The three map layers (biggest → smallest)

| Layer | What | Where |
|---|---|---|
| **World geometry** | all 292,796 real NFT parcels (L2 estates + L3 singles), zone layout, SVG source | `data/hexagon-city-source/` |
| **Continent fields** | per-zone authored terrain: rivers, road network (highway/secondary/local), ridges, castles (+`heroParcels`), POIs, towns — continuous across parcels | `data/world-terrain/{EDU,HUB,BUS,ENT,CGI,KOL}.json` (six surface zones done; HS1-3/UW1-3 pending) |
| **Per-parcel playable maps** | one battlefield/scene per parcel, generated deterministically from the field + zone biome | committed samples in `data/cf-maps/`; **at scale: generated lazily by the map service** (below) |

## 2. The live map service — how EF Hunt pulls maps selectively

Maps are NOT pre-baked into git at scale; any parcel's map is generated on demand and cached
(immutable per designVersion, deterministic — same seed ⇒ same map):

- `GET https://map.etherfantasy.com/internal/v1/designs/<parcelId>` → the **raster artifact**
  (terrain grid `cells`+`walk`, byte-per-cell, T={OPEN,FOREST,ROCK,WATER,CLIFF,ROAD,OOB} + entities:
  obstacles, resources, spawn zones, structures, build spots) — the 3D-consumable form. Schema:
  `docs/briefs/ARTIFACT-SCHEMA.md` (frozen).
- `GET https://map.etherfantasy.com/internal/v1/designs/<parcelId>/command.json` → the **A1 vector**
  (bounds polygon, lanes, water/obstacle footprints, structure anchors) — the 2D/overview form.
  Schema: `docs/briefs/BATTLEFIELD-SCHEMA.md`.
- 3D preview today: `https://map.etherfantasy.com/designer/3d?parcel=<parcelId>`.
- Coordinate frame: the fixed ±161 arena (`sizeM=322`), center-origin, +z north — the MOBA client's
  frame, consumed as-is (no scaling).

**Recommendation for Hunt:** consume the raster artifact exactly like the MOBA 3D client does — the
same terrain grid that drives battle walkability drives an RPG's walkable overworld chunk; parcels are
seam-continuous by construction (adjacent parcels window the same continent field), so Hunt can stream
parcel-by-parcel like open-world chunks.

## 3. What's committed in-repo today (samples + flagships)

- `data/cf-maps/parcels/*.json` (+ `data/cf-maps/artifacts/*.artifact.json`): 9 real parcels across
  EDU/HUB/BUS, biome refs (CF-DESERT/SWAMP/TUNDRA/VOLCANIC/FOREST…), and the **flagship castle
  parcels**: Westgate Castle `60203670103` (Arcadia), Southgate Watch `60716650182` (Tianxia capital),
  Fort Tidegate `60011440099` (Porthaven), the Velaria Campanile `60314610147` (Mythoria canal
  quarter), plus isle flagships `CGI-FLAG-FROND` / `KOL-FLAG-CITADEL`. All validated (5 playability
  invariants). Index: `data/cf-maps/parcels/README.md`.
- `data/moba-maps/`: the MOBA-derived reference set (single-player benchmark + legacy arenas).

## 4. The layers EF Hunt cares about most (pets + DNA)

- **`data/zone-pet-population.json`** — per-zone pet ELEMENTS + rarity bands (common→mythic ladder):
  effectively **the wild-pet spawn table per continent** (starters up to RARE; HS/UW rare-gated; HS3/UW3
  to MYTHIC; prestige isles legendary/mythic residents). This is the catch-and-extract economy's
  geography.
- **`data/pet-domains.json`** — the 7 Master domains grouping all 17 pet species + the combat triangles.
- **`data/PETS_ROSTER.csv`** (128 pets) + **`data/CHARACTER_ROSTER.csv`** (Masters/Bosses/Monsters).
- **`data/master-homes.json`** — every Master's lore home (visitable NPCs for an RPG).
- **DNA fragments**: canon decision 13 — DNA-fragment drops feed pet-NFT crafting; ruins are dig-sites
  feeding the research/DNA economies (depth-layer 1, in build now).
- **Scene anchors**: each continent field's `castles[]` (+ `heroParcels`) and `pois[]` — including
  lore singulars (the Shaft of Tianxia, the Diminishing Stair in Carnavale → Blackmere, the First
  Dock…) — are the quest/dungeon anchors. The journey spine: Tianxia (start, "all roads lead here") →
  surface continents → the Shaft or the Diminishing Stair → Ironhold → Blackmere → Luxuria.

## 5. Zone metadata + docs index

- `data/zone-registry.json` — the canonical 12-zone registry: biomes, palettes, strength bands
  (surface ×1.0–1.3 / sky ×2.0 / UW ×2.5–5.0 — the level-curve geography), servers, `zoneLinks`
  (inter-zone travel incl. the airship ways + the secret Stair).
- `data/world-zone-detail.json` + `docs/maps/WORLD-ZONE-DETAIL.md` — parcel counts, estate ladders,
  geometry per zone.
- `docs/maps/CONTINUOUS-WORLD-TERRAIN.md` — THE world-model doc: continent city/era plan (§3/§3b),
  castles (§3c), estate battles + hero POIs (§3d), inter-zone linkage (§3e).
- `docs/maps/MAP-PIPELINE-GLOSSARY.md` — pipeline stages + which view reads which file.
- `docs/lore/WORLD-CHRONICLE.md` + `data/singulars.json` (hub branch) — the lore the maps encode.

## 6. What EF Hunt should NOT do

- Don't regenerate maps with different seeds/params — determinism is the cross-game contract (the same
  parcel must be the same place in CF, the MOBA, and Hunt).
- Don't hardcode server/topology or invent zone links — read `zone-registry.json`.
- The Diminishing Stair is single-file lore: a solo/party RPG door (perfect for Hunt), never an army
  route; don't surface it as a public map route.

## 7. Asks / open items for the Hunt team

1. Which parcels/regions do you want first? (Recommend: Tianxia capital region + the Diminishing Stair
   route — the story spine; all six surface fields are ready.)
2. Do you consume the raster artifact directly, or do you need the engine team's `render.json`
   converter output? (That converter is owned by the MOBA engine team, not CF.)
3. HS/UW fields (the second half of the journey) are unauthored — say when Hunt needs them and they
   move up Agent D's queue.
