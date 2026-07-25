# Water render spec — "layer 10" for EF_BATTLEFIELD (2026-07-14)

> **To: MOBA BattleEngine RAW.** The live MOBA arena has no terrain water, so when you add water
> (generated parcels HAVE it — rivers/ponds in the manifest `masks.water`), use this recipe. It is
> IMPLEMENTED AND TUNED in CF's designer preview (`map-service/maps/preview3d.html`, `buildWater()`,
> commit 0546fa2 — copy it, it's ~70 lines) after visual iteration with the owner. The right home is
> `shared/ef_battlefield.js` as **layer 10**: then the designer, hero mode, and EF Hunt all render
> identical water, and CF deletes its preview-side copy (same never-drift argument as layers 1–9).

## Why not the obvious thing (what we tried first, looked wrong)

A water-tinted plane DRAPED on the heightfield fails: the converter DIPS the terrain under water
cells, so a draped surface slides down the banks into the basin — water shaped like a shrink-wrapped
bathtub. Blurred-canvas footprints also leave milky white shoreline fringes. Owner rejected both.

## The recipe (what shipped)

1. **Flat waterline per basin.** Flood-fill connected WATER components in the cell grid. Per
   component: `waterY = min(ground height of adjacent non-water, non-OOB cells) − 0.18` (landlocked
   fallback: `hMin + 0.8`). Build a FLAT mesh from the component's cells — one quad per cell at
   `waterY`, corner vertices shared. The dipped basin walls (already in the heightfield) hide the
   edges; the ground's floor texture reads through as the bottom.
2. **Depth tint via vertex colours.** Multi-source BFS from every shore cell across the water
   (distance in cells, cap 5). Per corner vertex, average adjacent cell distances,
   `t = min(1, d/4)`, lerp shallow→deep RGB.
3. **Foam bake at the bank line** — subtle: `d < 0.5 ⇒ f = (1−d/0.5)·0.4`, lerp toward 1.12 (near
   white). Hard lesson: strong foam (→1.35 @ 0.8) blows out small/shallow bodies where every cell is
   "shore" — keep it subtle. Skip for lava.
4. **Animated bump + damped specular.** Seeded tileable value-noise canvas (256², 8×8 lattice,
   smoothstep bilinear) as `bumpMap`; scroll `offset` per frame (`x += 0.00022·speed`,
   `y += 0.00013·speed`). Specular must be DAMPED or ponds blow out to white at reflection angles.
5. **Modes from `manifest.biome.water`** (`water | lava | ice`) — tuned constants (MeshPhong):

| mode | color | shallow RGB | deep RGB | opacity | shininess | specular | emissive (I) | bumpScale | scroll |
|---|---|---|---|---|---|---|---|---|---|
| water | `0x2e6ea8` | 0.62,0.80,0.92 | 0.10,0.26,0.44 | 0.90 | **64** | `0x5f83a8` | `0x06121e` (.25) | 0.38 | 1× |
| lava | `0xd8491c` | 1.0,0.62,0.25 | 0.42,0.06,0.02 | 0.97 | 6 | `0x1a0a00` | `0xff5a1e` (.8) | 1.2 | 0.25× |
| ice | `0xbfdcea` | 0.92,0.98,1.0 | 0.55,0.72,0.85 | 0.93 | 170 | `0xffffff` | `0x0a141c` (.1) | 0.15 | 0 (still) |

`transparent: true, depthWrite: false, vertexColors: true, renderOrder: 1`. Determinism: the bump
noise and any jitter draw from the parcel seed — same water every load, all clients.

## V4 addendum (2026-07-17) — the multi-elevation marsh case

Found on regenerated `60202790016`: ONE connected water component sprawling across different
elevations. A single flat waterline per body (this recipe) leaves the higher ground inside the
component exposed as pale dipped floor; a terrain-following sheen glares. **The correct fix needs
the PRE-dip ground height** — per-cell fill level `waterSurfaceY = preDipGround − ε`, which only the
converter knows at dip time. Recommendation for the module V4: the converter emits a per-cell water
SURFACE height (u8 grid alongside `masks.water`, same encoding as `height`), and the renderer builds
the water mesh from it directly — flat within each basin, stepped across elevation, no derivation
client-side. Also carry the biome styles (incl. the wetland murk row above) and skip-foam-on-tiny-
bodies from the CF preview iterations.

## ⚠ The blocky-shoreline bug (2026-07-25) — why a quick-fix water plane looks aliased

Symptom (seen in the live MOBA client's independent renderer): water is a flat cyan plane on flat
grass with a hard, stair-stepped shoreline and no depth/foam. **Root cause: the terrain heightfield
was NOT dipped under the water cells.** This recipe's mesh is deliberately still ONE FLAT QUAD PER
CELL — it does **not** smooth the shoreline in geometry. It only reads smooth because **the converter
lowers (dips) the ground under every WATER cell**, so the sloped banks physically OCCLUDE the
cell-stepped water edge, and the depth-tint + bank foam hide the seam. Render water as a plane on
UN-dipped flat ground and every cell corner is exposed → the blocky look.

**So the fix is one of two, in order of preference:**
1. **Consume the converter's DIPPED height grid** (the `height` field in the render manifest —
   already dipped under water) and build the flat-per-cell water mesh at `waterY` on top of it. This
   is what CF's `preview3d.html` does; it's the canonical path. No new geometry smoothing needed.
2. **If your renderer keeps terrain flat under water** (no dip), you MUST smooth the water FOOTPRINT
   edge yourself — marching-squares the WATER cell mask into a contour polygon and build the surface
   from that outline (optionally inset ~0.5 cell), instead of union-of-cell-quads. A raw per-cell
   plane on flat ground will always alias.

Either way, also apply the depth-tint + bank foam + animated bump + biome material below — a flat
untinted cyan plane reads as a bug even with a smooth edge.

## Integration notes

- Everything you need is already in the manifest: `masks.water`, the height grid, `biome.water`.
  No converter change required.
- Gameplay is untouched — water stays non-walkable via `masks.walk`; this is render-only.
- When it lands in the module, ping CF (ParcelMap Design Agent): we delete `buildWater()` from
  preview3d.html the same day so there is exactly ONE water implementation.
