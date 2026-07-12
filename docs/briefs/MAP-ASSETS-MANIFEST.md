# MAP ASSETS MANIFEST — the exact copy list for a local sync session

> **For the "Hunt x CF Map" local session** (no GitHub access; works from a local copy). Agent D,
> 2026-07-11. Everything below lives in **`etherfantasy-clashfront`**, branch
> **`claude/clash-front-overworld-mkcyia`**. ⚠ TWO mirrors, split state right now:
> **`https://github.com/nftprof/etherfantasy-clashfront`** = CURRENT for all map assets (Agent D
> pushes here); **`https://github.com/blockchainsuperheroes/etherfantasy-clashfront`** = carries a
> few C-session files the nftprof copy lacks (listed at the bottom). Clone nftprof, add the bsh
> extras.

## 1. Map DATA (the assets themselves)

| Path | What |
|---|---|
| `data/world-terrain/*.json` | the 8 continent terrain fields (EDU, HUB, BUS, ENT, CGI, KOL, UW2, UW3) — rivers/roads/ridges/castles(+heroParcels/estateMapId)/POIs/towns; **the atlas of every named place** |
| `data/cf-maps/parcels/*.json` | committed battle maps, A1/command form: 9 real batch parcels, CF-* biome refs, 7 flagship castle parcels, **5 palace ESTATE maps (keyed by estate id)**; index = its `README.md` |
| `data/cf-maps/artifacts/*.artifact.json` | the matching raster artifacts (terrain grid `cells`+`walk` + entities) — the 3D-consumable form |
| `data/moba-maps/` | MOBA-derived reference set (legacy arenas + the single-player benchmark) |
| `data/world-elements/*.json` | **the shared lore overlay layer** (ENT.hunt.json, UW2.hunt.json — Hunt's write path) |
| `data/zone-registry.json` | the 12-zone registry: biomes, palettes, strength bands, `_meta.charScale` (the Diminution), `zoneLinks`, servers |
| `data/zone-pet-population.json` · `data/pet-domains.json` · `data/master-homes.json` · `data/world-zone-detail.json` | pet spawn geography, domains, Master homes, zone detail |
| `data/PETS_ROSTER.csv` · `data/CHARACTER_ROSTER.csv` | the rosters |
| `data/hexagon-city-source/` | the WORLD GEOMETRY (all 292,796 real parcels: `parcels-l2.json`, `l3/*.json`, `svg/`, `zone-layout.json`) — LARGE but required for any parcel-level work |

## 2. Map CODE (generators + pipeline — needed to regenerate or extend)

| Path | What |
|---|---|
| `map-service/maps/` | the pipeline: `generate.js` (terrain+castles+ruins+overlay décor), `worldfield.js` (field windowing + overlay merge + `allPlaces()`), `command_converter.js` (A→A1), `thumb.js`, `archetypes.js`, `chronicle.js` (ruin lore), `validate.js`, `test/` (maps/hero_parcels/fill/overlay/loader/converter/endpoint suites) |
| `map-service/tools/` | `world_terrain_{edu,hub,bus,ent,cgi,kol,uw2,uw3}.mjs` (the 8 field generators, byte-stable), `world_hero_parcels.mjs` (the shared pick rule), `estate_palace_maps.mjs` |
| `map-service/server.js` + `lobby/` + `sim/` | the map service itself |
| `apps/server/dist/src/battlefield.js` | CF's 5-invariant validator + `loadParcelBattlefield` (validate anything you touch) |

## 3. Map DOCS (the contracts a sync session must know)

| Path | What |
|---|---|
| `docs/briefs/EF-HUNT-MAP-HANDOFF.md` | THE Hunt entry point (layers, map-service API, journey spine, Diminution, vessels §5c, overlay pointer §5b) |
| `docs/briefs/WORLD-ELEMENTS-OVERLAY.md` | the overlay contract (Hunt's write path) |
| `docs/briefs/MAP-DELIVERABLES-ROADMAP.md` | what's next + the sceneRef/asset-bindings interop proposal |
| `docs/briefs/ARTIFACT-SCHEMA.md` (frozen) · `docs/briefs/BATTLEFIELD-SCHEMA.md` | the two map formats |
| `docs/maps/CONTINUOUS-WORLD-TERRAIN.md` | the world model: city/era plan, castles §3c, estate battles + heroParcels §3d, zone links §3e |
| `docs/maps/` (rest) | glossary, gap analysis, zone detail, pet/master homes, modes |

## 4. LIVE, not in git

- **The map service**: `https://map.etherfantasy.com/internal/v1/designs/<parcelId>` (raster) +
  `…/command.json` (A1) + `/designer/3d?parcel=<id>` (3D preview). Backing registry on the box:
  `$MAPS_DIR` (default `~/ef-battlefields`) — generated-at-scale maps live THERE, not in git.
- The scratchpad proof PNGs are session-ephemeral — regenerate via `map-service` tools if needed.

## 5. On the OTHER mirror only (blockchainsuperheroes; grab these files into the local copy)

- `docs/lore/WORLD-CHRONICLE.md` (the three ages — the lore the maps encode)
- `data/singulars.json` (named places/relics/wardens register)
- `docs/briefs/DIMINUTION-SCALE-SPEC.md` (the engine hand-off for charScale)
- `docs/briefs/DEPTH-LAYERS-AGENT-SPLIT.md` (who builds what)
- `data/zone-cultures.json` (zone culture cards, if present)

## 6. One-liner for the local copy

```bash
git clone -b claude/clash-front-overworld-mkcyia https://github.com/nftprof/etherfantasy-clashfront ef-map-hub
# then add the 5 bsh-only files from
#   https://github.com/blockchainsuperheroes/etherfantasy-clashfront (same branch)
```

Sync rule for the local session: **map assets flow one way** (this repo → local copy; Agent D is the
source of truth for `data/world-terrain`, `data/cf-maps`, `map-service`); **Hunt's contributions flow
back** as `data/world-elements/*.hunt.json` (+ future sceneRef packages) — hand them to the owner or
any GitHub-capable session to commit here.

## 7. Context — what was agreed (the decisions this sync session inherits)

1. **One world, many lenses (the Cyberpunk-2077-and-its-anime model, owner-locked):** CF (battle),
   EF Hunt (RPG), and any future media render the SAME places from the same data. The artifact is
   gameplay truth; art is a skin; determinism is the cross-game contract — the same parcel is the
   same place everywhere, forever. Never regenerate with different seeds/params.
2. **The Hunt journey spine (owner-locked):** story starts in **Carnavale** (Mythoria) → down the
   **Diminishing Stair** (solo/party door, NEVER an army route — armies take the Shaft) → **Blackmere
   (UW2)** main story → **Luxuria (UW3)** finish → open-world pet-catching across the continents →
   end-game **UW3 Vault-stage** boss revisit (Leah & Irene = the Hunt renames; CF's Chronicle keeps
   Jiro/Ayume/Yui — the crosswalk is Hunt's).
3. **THE DIMINUTION:** the deep shrinks CHARACTERS, never geometry — `_meta.charScale` in the
   registry (UW2 visual 1/1.5, UW3 1/6; kinematic 0.667/0.4 ⚙). Camera scales with the model.
   Terrain/stats/arena untouched.
4. **The overlay layer is Hunt's write path:** point elements only; base geometry (roads, rivers,
   ridges, castles, terrain) is frozen and Agent D's. Elements materialize in BOTH games (Hunt scene
   anchors + CF battle-map décor).
5. **Estate battles (canon decision 18):** one command-view battle over a whole estate; 3D only at
   the hero POI parcels (LARGE 3 / GIANT 5 / EPIC 8, castle first — `heroParcels` in the fields);
   palaces on unsubdivided EPICs have committed **estate maps** keyed by estate id (`estateMapId`).
6. **Vessels (§5c of the Hunt handoff):** Hunt's boat rig = the small-boat reference; big ships =
   scaled-up silhouette on port-to-port sea lanes; **airships = the Final Fantasy IV flying wooden
   ship**, the only way up, docking at the mapped anchorages.
7. **The interop proposal awaiting owner lock (`MAP-DELIVERABLES-ROADMAP.md` §C):**
   `data/asset-bindings.json` (kind+biome → model ref; Hunt's rendered 3D elements = the first
   bindings, the MOBA client adopts the same table) + **`sceneRef`** (a parcel/estate map points at a
   hand-built ICONIC 3D scene package that dresses the procedural render; the artifact stays
   authoritative for collision, so CF battles fight inside the iconic scene unchanged). The
   hero-parcel/POI list is the iconic-destination shortlist.
8. **Remaining map work (`MAP-DELIVERABLES-ROADMAP.md` §B):** UW1 + HS1–3 fields → the 20K bake
   (blocked on A+B sign-offs) → the aerial-mosaic manifest → stage-⑥ allocate closure → the
   event-gated seed queue.

## 8. AGENT BRIEF — the "Hunt x CF Map" local sync session

**Identity:** you are the SYNC seam between Agent D (CF ParcelMap Design — GitHub-based, source of
truth for all map assets) and the EF Hunt build session (local-only, no GitHub). You work on the
owner's machine with a local copy of this repo (§6).

**Mission:** keep Hunt building on CURRENT map truth, and carry Hunt's world contributions back into
the hub — so the two games never fork the world.

**Duties:**
1. **Inbound sync (hub → Hunt):** keep the local copy fresh from the nftprof mirror (git pull; the
   §5 bsh-only files too). Surface to the Hunt session what changed (new fields, regenerated
   parcels, schema/doc updates — read commit messages; they are written as changelogs).
2. **Outbound sync (Hunt → hub):** collect Hunt's overlay files (`data/world-elements/*.hunt.json`
   — validate against `docs/briefs/WORLD-ELEMENTS-OVERLAY.md`: points only, unique ids, in-bbox),
   future sceneRef packages + asset-binding rows, and Hunt's schema questions/asks. Package them as
   ready-to-commit files + a short note; the owner (or any GitHub-capable session) lands them on
   `claude/clash-front-overworld-mkcyia`.
3. **Validation before handoff either way:** run the local gates — `cd map-service && npm test`
   (api.test.js has 4 pre-existing render.json failures; everything else must be green) and validate
   any touched battle map via `apps/server/dist/src/battlefield.js` (`validateBattlefield` +
   `loadParcelBattlefield`).
4. **Never fork the base layer:** do NOT edit `data/world-terrain/*`, `data/cf-maps/*`,
   `map-service/*`, or the registry locally except to test — changes there belong to Agent D;
   relay asks instead. Hunt-owned surfaces: `data/world-elements/*.hunt.json`, future
   `asset-bindings.json` rows + sceneRef packages, and Hunt's own game repo.
5. **Escalate to the owner** when: an id/coordinate conflict needs a judgment call, Hunt needs a
   geometry change (new road/bridge/clearing — that's an Agent D build), or the two mirrors diverge
   confusingly (nftprof = map truth; bsh = C-session docs; say so plainly).

**Reading order:** this manifest → `EF-HUNT-MAP-HANDOFF.md` → `WORLD-ELEMENTS-OVERLAY.md` →
`CONTINUOUS-WORLD-TERRAIN.md` → `ARTIFACT-SCHEMA.md`/`BATTLEFIELD-SCHEMA.md` →
`MAP-DELIVERABLES-ROADMAP.md`. Lore: `WORLD-CHRONICLE.md` + `data/singulars.json` (bsh).
