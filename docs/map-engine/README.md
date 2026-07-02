# Map Engine — Team Folder

> Everything the map/overworld-client team needs, in one place. Product owner directives
> (2026-07-02) are the two documents here:
>
> 1. [`01-streaming-overworld-client.md`](./01-streaming-overworld-client.md) — the zoom/arrive/goto
>    browser map that **never loads the whole world**.
> 2. [`02-battle-hosting-architecture.md`](./02-battle-hosting-architecture.md) — persistent map
>    content + the 10–20-battle real-time/accelerated hosting pool.

## Mission (one paragraph)

Build a browser overworld client where a player **follows their own units** — zoom, pan,
`goto(army|territory)`, arrival notifications — over the REAL hexagon-city geometry (292,766
parcels), with the strict rule that **users never see the entire map in detail**: they see where
their units, holdings, and battles are, plus low-detail context. The old marketplace
(map.pentagon.games) loaded parcels slowly on zoom; we are NOT reusing its renderer — we build a
streaming, tiled, game-first map on the extracted data.

## What already exists (read these first)

| Asset | Where | Notes |
|---|---|---|
| Full parcel geometry | `data/hexagon-city-source/` (74 MB) | 8,482 L2 estates + 284,284 L3 parcels; svgPath per parcel; `zone-layout.json` transforms; L1 PNGs + L2 SVG masters |
| Extraction report | `data/hexagon-city-source/MAP-EXTRACTION-REPORT.md` | data model, token-id encoding, zones, renderer post-mortem (§7: Three.js SVGLoader picker — reuse assets, rebuild client) |
| Demo world slice | `data/demo-world.json` + `packages/sim-engine/scripts/build-demo-world.mjs` | one-zone parcel graph (polygons, centers, neighbors) used by the July-7 MVP |
| Scale canon | `docs/04` §7b + `packages/shared/src/constants.ts` | **SVG geometry is the world, verbatim.** 1 engine unit = 1 m; SINGLE parcel = 240×240 m ≈ 14.2 acres; ladder to EPIC 480.3× |
| World sim canon | `docs/01` (travel, fog §9, rewilding §11), `docs/08` (schemas) | the map client renders THIS state |
| MVP scope | `docs/briefs/MVP-JULY7.md` | the July-7 build is the map client's v0 |

**The old map client (LOCATED 2026-07-02):** lives in the archived repo
`_archive-cryptoverse-frontend` — a Three.js + SVGLoader WebGL explorer:
`vendors/LandMap/LandMap.js` (engine), mounted by `pages/land-map.tsx` (explore view) and
`pages/land-selector.tsx` (auth/mint view). Confirmed features: TrackballControls zoom/pan/rotate
(zoom 20–325), zone → L2 → `showSelectedL3()` drill-in, `goToTokenId({tokenId, zone, zoom})` /
`goToChild()`, token-id search (`SearchForToken.tsx`), help overlay, minted-status tinting via
`/land/minted/*` polling.

**Verdict (aligned with extraction report §7): reuse the assets and the UX affordances, rebuild
the client.** Borrow the *interaction contract* — drill-in hierarchy, `goToTokenId` semantics
(our `goto(entity)` is its descendant), zoom ranges as tuning reference. Do NOT inherit the
architecture: it loads ALL l1/l2/l3 SVGs and parses/meshes them at runtime (the slow-zoom cause),
and it's coupled to the old Next.js app, auth, and `api.cryptoverse.vip`. Our tile-pyramid +
offline-triangulation design (doc 01) exists precisely to fix that.

## Non-negotiable principles

1. **The map = the SVG, verbatim** (canon). No regeneration; only unit scaling is ours.
2. **Never ship the whole world to a client.** Viewport streaming + LOD always.
3. **Static geometry is immutable ⇒ infinitely cacheable.** Ownership/armies/battles are a thin
   dynamic layer over immutable tiles.
4. **The player's units are the camera's anchors.** UX is "where are my armies/lands/battles",
   not "browse a map."
5. Browser-first: budget for mid-range laptops; target 60 fps pan/zoom, < 2 s cold start to a
   playable viewport, < 150 KB initial geometry payload.
