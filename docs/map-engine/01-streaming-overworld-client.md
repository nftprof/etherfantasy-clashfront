# 01 — Streaming Overworld Client (zoom / arrive / goto)

> Directive: players **never see the entire map in detail** — they see where their units are.
> The old marketplace loaded parcel detail slowly on zoom; this design makes that impossible by
> construction: geometry is pre-tiled by LOD and streamed by viewport, and full detail simply does
> not exist above the neighborhood zoom level.

## 1. Tile pyramid (offline preprocessing)

One-time pipeline (extend `packages/sim-engine/scripts/`): SVG sources → **vector tile pyramid**,
published as static files (CDN/HTTP-cacheable, content-hashed, immutable).

| LOD | What a tile contains | Simplification | Typical use |
|---|---|---|---|
| Z0 world | zone outlines + region rollup centroids | heavy (Douglas-Peucker, ~50 pts/zone) | "where am I on the continent" |
| Z1 zone | L2 estate outlines + district shapes | moderate | strategic view, army routing |
| Z2 district | all parcel polygons, ≤ 40 pts each | light | operational view (MVP demo-world detail level) |
| Z3 neighborhood | full-fidelity parcel polygons + centers + adjacency edges | none | tactical view around a unit/holding |

- Tile scheme: quadtree over the SVG bounding box; target **≤ 300–500 parcels or ≤ 200 KB gzipped
  per tile**, whichever first.
- Format: plain JSON v0 (MVP); flat binary (or MVT) v1 if profiling demands.
- Every parcel feature carries `parcelId` (+ `tokenId`), so the dynamic layer can join by id.
- **Z3 is the maximum detail that exists.** There is deliberately no "whole map at Z3" path: a
  client at Z0 can never request full detail for everything — the pyramid is the enforcement.

## 2. Dynamic state layer (thin, real-time)

Static tiles never change; game state rides on top by parcel id:

- **Ownership/prosperity/overgrowth rollups**: server-computed aggregates per tile per LOD
  (e.g. Z0 = faction share per zone; Z2 = per-parcel owner color). Fetched with the tile,
  refreshed lazily (TTL ~30 s) — NOT per-tick.
- **Live entities** (armies marching, battles, own holdings): WebSocket **interest subscription =
  current viewport ∪ player's assets** (their armies, territories, active battles — always
  streamed regardless of viewport, so alerts work off-screen). Deltas per world tick.
- Fog of war (`docs/01` §9) is enforced server-side in the subscription — the client only ever
  receives what the player may see.

## 2b. Ambient state visualization (map ↔ battle contract, canon 2026-07-02)

The overworld map is a **symbolic, ambient view** of the same state the battle session renders in
detail — the player should *feel* the world from orbit and *confirm* it on the ground:

| World state | Overworld map shows | Battle session shows |
|---|---|---|
| Battle RUNNING on a parcel | 🔥 fire + smoke plume on that parcel (visible from Z1+) | the actual fight |
| Recently pillaged | smoldering/darkened parcel, fading over days | wrecked structures, burnt props |
| Major structures (estate castle/walls, developed bases) | simplified silhouette/icon at Z2+, generic marker at Z1 | the real placed structures (CoC layout) |
| Overgrowth / rewilded | bush/wild texture creep by `overgrowth` level | wild-growth props, monster spawns |
| Garrison/pets present | small presence pips on parcel card | the actual defenders on the field |

Rules: ambient effects are driven by the SAME state fields the battlefield generator reads
(`docs/04` §7b seed inputs) — one source of truth, two fidelities. Effects are part of the dynamic
layer (§2), not baked into tiles. Battles-on-fire are the loudest signal on the map by design —
war must be visible from far away.

**Units on the map (product owner 2026-07-02):** symbolic ≠ static — **your units and allied
units are ALWAYS visible, marching, with direction** (chevron + heading + path hint + ETA).
Enemy/neutral visibility is governed by **fog of war** (`docs/01` §9): seen only where you have
vision (own/allied territory, army sight radius, flying-pet scout bonus). **Scout indicators**
mark your vision sources (watchtower/army/pet 👁 badges) so players understand WHY they can see
an area. MVP ships own-unit direction arrows with no fog (full visibility); fog + scout badges
land in v0.3 (§6).

## 3. Camera & UX model (the "follow your units" contract)

- **Home rail** (always on screen): the player's armies, territories, battles — each with a
  `goto` affordance and status (marching ETA, under attack, battle lobby countdown).
- `goto(entity)`: camera flies to it; tiles for the destination viewport prefetch DURING the
  flight (flight duration ≥ fetch budget — loading is hidden inside the animation).
- `follow(army)`: camera tracks a marching army; tiles along the remaining path prefetch ahead
  (path is known — prefetching is trivial and exact).
- **Arrival/battle notifications** re-use `goto`. This is the primary navigation loop:
  notification → tap → you're there. Free browsing is secondary.
- Zoom is continuous; LOD swaps are cross-faded. Picking: spatial index (packed per tile) on the
  client; no per-polygon hit meshes.
- Minimap = Z0 rollup + dots for own assets (cheap, always loaded — it's tiny).

## 4. Rendering approach

- **Canvas2D for MVP** (demo-world scale, ~500 parcels — trivial), **WebGL (PixiJS or regl) for
  the full client**: one instanced draw per tile layer, polygons pre-triangulated in the tile
  build (earcut offline, not at runtime — this was the old app's mistake, SVG parsing/meshing at
  view time).
- Color = ownership/state lookup texture keyed by feature index; repaint = texture update, not
  geometry rebuild.
- Labels/icons (zone names, battle markers, army chevrons) in a DOM/canvas overlay, decluttered
  by LOD.
- Memory budget: keep ≤ ~40 tiles resident (LRU eviction); a viewport at any zoom touches ≤ 12.

## 5. Server surface (small)

| Endpoint | Purpose |
|---|---|
| `GET /tiles/{z}/{x}/{y}.json` | static vector tile (CDN, immutable, content-hashed) |
| `GET /state/tiles/{z}/{x}/{y}.json` | dynamic rollup for that tile (TTL cache) |
| `WS subscribe {viewport, assets:true}` | live deltas: armies, battles, ownership changes in view + own assets anywhere |
| `GET /world/entity/{id}` | resolve any entity → position/status (powers `goto`) |

## 6. Build order

1. **MVP (July 7)**: single-zone `demo-world.json`, Canvas2D, no tiling (the slice IS one tile),
   home rail + goto + march/battle markers over WS. This validates the UX contract.
2. **v0.2**: tile pyramid build script over all 10 zones; WebGL renderer; viewport WS interest.
3. **v0.3**: dynamic rollups, fog-of-war subscription filtering, follow-cam + path prefetch,
   minimap, decluttered labels.
4. **v1**: binary tiles if needed, mobile touch polish, battle-spectate deep links.
