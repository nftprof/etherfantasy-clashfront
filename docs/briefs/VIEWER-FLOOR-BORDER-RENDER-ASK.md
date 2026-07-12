# Viewer ask — render the floor + polygon border for CF parcel maps

> **For the MOBA BattleEngine / OP48 client team** (owns the 3D render path). Agent D, 2026-07-11.
> Raised by the owner loading `map.etherfantasy.com/designer/3d?parcel=60203370158` and seeing props
> (trees, spawn rings, lane dots, attacker marker) floating on a dark void — **no ground floor, no
> parcel border**.

## The finding (proven — it is the VIEWER, not the map data)

The CF parcel artifact and the MOBA single-player artifact are **schema-identical** — same keys, and
both carry a full floor + border:

| | MOBA single-player (renders a floor ✓) | CF parcel `60203370158` (no floor drawn ✗) |
|---|---|---|
| `terrain` | 161×161, cellM 2, `cells` + `walk` present | **161×161, cellM 2, `cells` + `walk` present** |
| `arena.bounds` | `shape:"square"`, ±161 box | `shape:"polygon"`, 6-vertex parcel hexagon |
| floor cells | OPEN/FOREST/ROCK/WATER/ROAD | same types (8665 OPEN, 4303 FOREST, 970 ROCK, 938 WATER, 109 ROAD, 10936 OOB) |

The floor and the border are 100% in the data. The single-player renders because its arena is a
**square**; the CF parcel is a **polygon**, and the viewer appears to draw the floor only for the
square case. **OOB cells (`T.OOB = 6`) already mark every cell outside the parcel shape**, so the
viewer has two independent ways to clip the floor to the parcel outline.

## The ask (viewer / render.json side — no map change)

1. **Draw the ground floor from `terrain.cells`** for polygon arenas, not just square — one textured
   tile/mesh per non-OOB cell, colored by cell type (biome palette in `meta.palette`). The
   single-player already does this for squares; extend it to `arena.shape === "polygon"`.
2. **Clip to the parcel outline** — either skip `T.OOB` cells (simplest) or clip the floor mesh to
   `arena.bounds`. That draws the parcel border for free (the edge between floor and void).
3. **If the 3D path consumes `render.json`** (the C artifact from the engine team's
   `battlefield_converter.cjs`, not CF scope): confirm that converter emits a floor mesh + bounds
   from our raster `terrain` for polygon parcels. If it drops them for non-square arenas, that's the
   fix point.

## What CF/Agent D guarantees (so the viewer can rely on it)

- Every CF parcel artifact carries `terrain` (161×161 `cells`+`walk`) + `arena.bounds` (the polygon)
  + `arena.sizeM` (322). Verified across the committed set; the 5-invariant validator enforces it.
- Coordinates are the client's own ±161 frame, consumed as-is (no scaling).
- Determinism: same parcelId ⇒ byte-identical artifact, forever.

## Verification for the client team

Load any committed CF parcel (`60203370158`, or the castle flagship `60203670103`) in the REAL battle
client (not just the designer preview) and confirm the floor + border render. If the real client is a
different path from the designer and already handles polygons, only the **designer preview** needs the
fix — please confirm which. Owner wants to know: *does the real in-game battle show a proper floor, or
does the in-game viewer share the preview's gap?*
