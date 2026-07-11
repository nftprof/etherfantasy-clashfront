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
  Dock…) — are the quest/dungeon anchors.
- **The Hunt journey spine (owner-locked 2026-07-11):** the story **starts in Carnavale** (Mythoria's
  carnival town — the field, city, marinas, Sambadrome, and the `ENT-STAIR-DIMINISHING` POI are DONE)
  → **straight down the Diminishing Stair to Blackmere (UW2)** for the main story → **Luxuria (UW3)**
  to finish it → then open-world **pet-catching travel across the other continents** (all six surface
  fields ready; the rarity geography in `zone-pet-population.json` is the progression curve) → an
  **end-game revisit to the UW3 final-boss stage** — with **Leah and Irene** (the Hunt story's renamed
  leads; CF's Chronicle keeps the old-chronicle names Jiro/Ayume/Yui — treat it as the same figures at
  different remove, a name crosswalk the Hunt team owns).

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

## 5b. Putting YOUR lore onto the maps — the WORLD-ELEMENTS OVERLAY (the reverse path)

Hunt can POPULATE CF's maps with its own quest sites / NPC spots / camps / dungeon doors /
shrines / markets — point elements committed as **`data/world-elements/<ZONE>.hunt.json`**
(this repo, PR flow). They merge read-time into the zone field (`field.overlayElements` +
`allPlaces()`), window into parcels, and materialize on the battle maps as passive named décor
that CF reuses too — "two of the same world". Full contract (schema, point-only rule, id
precedence, ownership): **`docs/briefs/WORLD-ELEMENTS-OVERLAY.md`**. Starter sets are already
seeded for you (marked PROPOSED, you own them): `ENT.hunt.json` (the Fortune-Teller's Tent, the
Midway, the Sambadrome stage, the Mask-Seller, Descenders' Rest) and `UW2.hunt.json` (the
Stair-foot Camp, the Bowl-Keeper's Alcove, the Drowned Banquet door).

## 6. What EF Hunt should NOT do

- Don't regenerate maps with different seeds/params — determinism is the cross-game contract (the same
  parcel must be the same place in CF, the MOBA, and Hunt).
- Don't hardcode server/topology or invent zone links — read `zone-registry.json`.
- The Diminishing Stair is single-file lore: a solo/party RPG door (perfect for Hunt), never an army
  route; don't surface it as a public map route.

## 7. Asks / open items — ANSWERED by the Hunt team (2026-07-11, confirmed by Agent D)

1. **Start region**: Tianxia capital + the Diminishing Stair route (they verified the map service
   live — fetched `60716650182` and confirmed the raster drops into their Three.js scene as-is).
   **UW2 + UW3 fields are IN BUILD at the top of Agent D's queue** (they carry the Stair's lower
   mouth, the Bastion of Dominus, the Drowned Banquet, the Gardens of Enamora, and the UW3
   final-boss stage POI).
2. **Consumption**: raster artifact DIRECT — same ±161 frame (`sizeM=322`), x/z entity props read
   natively; no `render.json` converter needed. The engine-team converter is now MOBA-only scope.
3. **Sky fields (HS1–3)**: deferred until late-game pet-travel needs them.

**THE DIMINUTION (owner-locked; FINAL numbers 2026-07-11, Agent C's spec supersedes the earlier
2×/6× draft):** the deep diminishes CHARACTERS, never the geometry — the Diminishing Stair made
literal ("with every step you grow smaller and the steps grow vaster"). TWO knobs per tier, both in
**`data/zone-registry.json` → `_meta.charScale`** (the single machine-readable source; never
hardcode): **visual** (model+camera together — the lore numbers, LOCKED: surface/sky/UW1 = 1.0 the
contrast anchor; **UW2 = 1/1.5** the uncanny step; **UW3 = 1/6** the deception, six on purpose) and
**kinematic** (move speed/ranges — ⚙ playtest dial: UW2 0.667, UW3 0.4 ≈ √6). Camera follows the
scale down — that's what sells it. Terrain, structures, arena bounds, unit counts, and stats are
UNCHANGED (perception, never combat power); all combatants in a realm share its scale. Full engine
hand-off: `docs/briefs/DIMINUTION-SCALE-SPEC.md` (hub branch).

**Seam-streaming caveat (Agent D, honest print):** cross-parcel continuity is guaranteed for the
WORLD-FIELD features — roads, rivers, ridges, biome/palette enter and exit at exactly matching border
points (same polyline, same transform). The archetype NOISE COAT (tree/rock scatter micro-texture) is
seeded per-parcel: biome and density agree across a seam but individual props don't mirror — at
walking speed this reads as natural variation, not a cliff. Also each artifact pads OUTSIDE its parcel
polygon with `T.OOB` cells: when streaming chunks, clip to the polygon and let the neighbour own the
far side — never draw the OOB padding. Hunt-side economy notes (DNA 100/50, spend-weighted
RewardDistributor odds on-chain) are Agent C/owner scope — no map-side blocker; ruins (dig-sites) and
`zone-pet-population.json` are the map hooks.
