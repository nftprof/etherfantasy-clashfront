# CLIENT_BATTLEFIELD_LOADER — the four inputs (Map-maker → OP 48)

> **Map-maker session, 2026-07-07**, answering OP 48's four asks to build the data-driven client loader
> (one build for all maps; the client goes data-driven from the artifact via the existing `m.obst` seam).
> TL;DR: **item 1 (raster artifact) + item 3 (coords) are DONE and frozen with real samples; render.json is
> the engine team's converter (item 4); item 2 = fetch-by-id.** You can build the loader against the raster
> artifact ALONE today — render.json is an optional pre-bake.

## Item 1 — schema + real sample

### 1a. Raster artifact (mine, frozen) ✅
- **Schema:** `docs/briefs/ARTIFACT-SCHEMA.md` (top-level shape, terrain-grid decode, element shapes).
- **Real sample:** `data/cf-maps/artifacts/60200010000.artifact.json` (real EDU parcel) + an 8-more batch in
  the same dir. Matching A1 command-vector for each in `data/cf-maps/parcels/<id>.json`.
- **The part your renderer needs:** `terrain = { cellM:2, w:161, h:161, cells:<b64>, walk:<b64> }` — a
  byte-per-cell grid. `cells` = terrain code `T{OPEN0,FOREST1,ROCK2,WATER3,CLIFF4,ROAD5,OOB6}`; `walk` =
  1 walkable / 0 blocked. Plus `obstacles` (point props: TREE/ROCK `{x,z,r}`), `lanes`, `spawnZones`,
  `structures` (towers; CORE is synthesized from `spawnZones` `def_base`/`atk_S`), `resources`, `mobs`.

### 1b. render.json (engine team's — see item 4) ⚠
render.json is the **derived** heightfield+biome+scatter manifest, produced by the engine team's
`tools/battlefield_converter.cjs` from my artifact. **It is NOT in CF scope**, so I can't ship a
render.json sample — that converter + its schema are the engine side's to publish (item 4). **You do not
need it to start:** the raster artifact already carries everything to build the ground — derive the
heightfield/scatter client-side from `terrain.cells` (the converter just pre-bakes that server-side as an
optimization). Treat render.json as optional v2.

## Item 2 — delivery channel + size budget → **fetch-by-id**

**Recommendation: fetch-by-id, not embed-in-start.** The artifact is **immutable per (parcelId,
designVersion)** → ideal for HTTP immutable caching; the client fetches once per parcel and reuses it across
every battle on that parcel. Embedding it in each `battle_hello` re-sends it every match and bloats the
start payload (worse for estates). Keep `battle_hello` carrying only the small **A1 command-vector** (for
the 2D command view — already the case); fetch the raster artifact by id for the 3D ground.

**Endpoints (map.etherfantasy.com, all public, immutable-cacheable, `?v=<designVersion>`):**
| GET | returns |
|---|---|
| `/internal/v1/designs/<parcelId>` | `{ row, artifact, budget }` — the **raster artifact** under `.artifact` |
| `/internal/v1/designs/<parcelId>/render.json` | the render manifest (engine converter; 404s if converter not deployed) |
| `/internal/v1/designs/<parcelId>/command.json` | the **A1 command-vector** (same shape `battle_hello` embeds) |

**Size budget (measured, real SINGLE parcel):** raster artifact ≈ **78 KB raw / ~5 KB gzipped** (the
161×161 grid dominates: 2×25,921 bytes base64). The A1 vector ≈ 66 KB raw / ~6 KB gzipped. **Serve gzipped**
and it's ~5–6 KB per parcel; cache immutably by `?v`. render.json will be the same order (heightfield) —
engine team to confirm exact. Estates = a series of ±161 components, so per-component the budget is
identical; you fetch each component's artifact by its id.

## Item 3 — coordinate confirmation ✅ (matches your ±161 authority, decision 4g)

- **Frame:** fixed **±161 world-units**, `sizeM = 322`, **center-origin**, **+z = north**. ATTACKER/blue
  spawns **SW (−)**, DEFENDER/red base **NE (+)**. Spawns at **±131.6**, cores at **±114.8**. Coords are
  consumed **AS-IS — no ×MAPK, no transform** anywhere in the CF path.
- **Terrain-grid → world:** `cellM = 2`, `w = h = 161`, **row-major** (`idx = cz*w + cx`), byte-per-cell.
  `wx = (cx + 0.5)*cellM − sizeM/2`,  `wz = (cz + 0.5)*cellM − sizeM/2` (so cell 0 = −160, cell 160 = +160;
  +z north). `walk` byte at `idx` == 1 ⇒ walkable. Decode: `Uint8Array.from(atob(b64), c=>c.charCodeAt(0))`.
- Bounds polygon is `arena.bounds` (square `[[−161,−161]…]` today; a real parcel polygon later — same
  frame). This is byte-for-byte the frame in `BATTLEFIELD-SCHEMA.md` + `ALLOCATE-CALLBACK-SCHEMA.md`.

## Item 4 — who owns render.json generation → **the engine team**

`tools/battlefield_converter.cjs` is the **engine team's** tool (CJS, dependency-free). It runs
**server-side in the map-service registry** (`registry.readManifest` loads it lazily) to derive the ~8
render layers (heightfield, biome, tree/rock scatter) from my raster artifact, and the map-service serves
the result at `/render.json`. **It is not in CF/Map-maker scope** — so:
- **Map-maker owns:** the **raster artifact** (the input) — frozen, sampled, done.
- **Engine team owns:** `battlefield_converter.cjs` + the **render.json schema** + shipping it on the box.
- **Ask back to the engine team:** publish the render.json schema + one real sample, **or** confirm the
  client derives the heightfield from the artifact's `terrain.cells` directly and render.json is skipped
  for v1. Either unblocks the loader; my half is ready now.

## Net for OP 48
Build `CLIENT_BATTLEFIELD_LOADER` against the **raster artifact** (fetch-by-id, decode `terrain` per item 3,
feed the existing `m.obst` seam). That's fully specified and sampled today. render.json is an optional
engine-side pre-bake — coordinate its schema with the engine team, not me.
