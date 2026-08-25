# World-map rendering — the contract (and the recurring "gaps" bug)

**The world overview (`/designer/world`) must render the real overworld the way cf.etherfantasy.com
does: every parcel as its true land polygon, tiled at its real position, composing the continent.**
This doc exists because the same class of bug — *false gaps between parcels* — has been "fixed" more
than once (owner 2026-08-23: "make sure we document this, it's not the first time"). Read it before
touching any world/overview/mosaic renderer.

## The data model (why gaps appear)

hexagon-city land is a **hierarchy**, NOT a flat grid and NOT a hex grid
(`data/hexagon-city-source/MAP-EXTRACTION-REPORT.md` line 13 — "NO hex grid; irregular SVG polygons"):

- **L2** (`parcels-l2.json`, ~8,482): estates/parcels with `sizeClass` SMALL…GIANT, each an SVG
  polygon. A field `l3Enabled` says whether it was subdivided.
- **L3** (`l3/<ZONE>.json`, ~293k total): the `singles` — an L2 SMALL parcel split into ~14-acre
  single plots.

A **LEAF** = a parcel with no children = **(every L3 single) ∪ (every L2 with `l3Enabled === false`)**.
Leaves TESSELLATE the owned land; L2 parents OVERLAP their L3 children (never render both).

## The recurring bug — four traps, all producing false "gaps"

1. **Arena-in-a-box.** Do NOT draw a parcel as its ±161 *battle arena* squished into its bbox — the
   arena has an OOB margin around the inscribed polygon, so neighbours don't abut → seams everywhere.
   **Fix:** fill the parcel's real polygon (`svgPathToPolygon(s.svgPath)`, worldfield.js) by scanline;
   adjacent polygons then share edges exactly (this is what CF's overworld does — `store.parcels →
   polygon`).
2. **L3-only.** Rendering only L3 singles omits the un-subdivided L2 estates (MEDIUM/GIANT), which
   then read as **wide black channels**. **Fix:** render ALL leaves (L3 singles + L2 `l3Enabled=false`).
3. **Center-radius view clipping.** When clipping to a view, selecting parcels whose *center* is near
   the focus DROPS big estates whose center is outside the view but whose body covers it (an estate is
   huge; its center can be far). **Fix:** select by **bbox-intersects-view**, never center distance.
4. **Mistaking real non-parcel land for a bug.** ~8–9% of the region genuinely belongs to NO parcel —
   the roads/rivers/public space between plots (measured: HUB core ≈ 8.6% covered by neither L3 nor any
   L2). That is REAL. Fill it with wilderness terrain + the mapped road network
   (`data/world-terrain/<ZONE>.json`, tiered roads), do NOT try to close it with parcels.

**Verification rule (owner 2026-08-23, "you told me twice it's good"):** never declare the gaps fixed
from code alone — render the region and LOOK, and/or run the coverage probe (point-in-polygon grid:
% covered by L3 / L2-leaf / neither). Report the numbers.

## What the world view must show (owner 2026-08-23)

1. **Clear parcel borders** — stroke every parcel outline so the tessellation reads.
2. **Status** — generated vs not: **grey** the parcels that have no design yet.
3. **Real 3D map thumbnails, per parcel** — where there's a castle you see a castle, where there's
   candy land you see the candy thumb, etc. The flat 2D terrain-colour raster (`thumb.js`) is the
   ORIGINAL/reference layer only — the overworld texture is the **top-down render of the parcel's 3D
   designer scene**, cached per `parcelId+designVersion`. Ungenerated → grey (no thumb yet).

## Tools

- `map-service/tools/world_mosaic.mjs` — the reference compositor: real-polygon fill, leaf selection
  (L3 + L2 `l3Enabled=false`), bbox-intersect view clip. Emits `<stem>.png` + a click-through
  `<stem>.json` (per-parcel rects). This is the 2D reference layer.
- **3D-thumb pipeline (BUILT 2026-08-23):**
  - `preview3d.html?thumb=1` — clean **top-down orthographic** capture mode: no HUD/beacons/fog,
    transparent background (so the compositor clips to the polygon), sets `window.__CF_THUMB.ready`.
  - `map-service/tools/capture_thumb.mjs <parcelId…>` — headless capture → transparent PNG cached at
    `data/cf-maps/thumbs3d/<id>.v<designVersion>.png` (+ a stable `<id>.png` alias to the current
    version). Version-idempotent: `--force` re-shoots; a new `designVersion` writes a new file.
  - **Run it as a server pipeline, ONCE per map version, and re-run on regenerate** (owner
    2026-08-23) — not lazy-per-view. Proven on castle / candy / a normal parcel (distinct, correct).
  - `capture_thumb.mjs --from-service` — enumerate the running service's designed parcels
    (`GET /internal/v1/designs`) and capture them all; `--dir <artifacts>` and explicit ids also work.

## The aerial mosaic → the `/designer` select-map (owner 2026-08-25 "this should replace Arcadia")

The flat grey polygon select-map on `/designer` is REPLACED by the aerial 3D-thumb mosaic as its base
layer (real thumbs where designed, grey where not), with the interactive dots/selection drawn on top.

- `map-service/maps/mosaic.js` — `bakeMosaic({zone})` is the render core of `world_mosaic.mjs` lifted
  into a **reusable, disk-cached** function (renders ALL leaves; cache key includes a thumb-mtime
  fingerprint so a re-shot thumb re-bakes). CLI: `node map-service/maps/mosaic.js <ZONE>` bakes +
  commits `data/cf-maps/world-mosaic/<ZONE>.png` (~0.3 MB).
- `GET /internal/v1/mosaic.png|.json?zone=` — the baked continent + alignment meta (`world` bbox,
  `pxPerUnit`, `thumbed`). `designer.html` `drawMosaicBase()` draws it under the dots, **Y-flipped**
  to the select-map's y-up frame (the source is y-down like the SVG).
- **Committed-mosaic fallback = how it ships.** The raw thumbs are 286 MB, box-side, gitignored — they
  do NOT deploy. So bake the mosaic **where the thumbs live** and COMMIT the tiny PNG; `bakeMosaic`
  serves that committed file whenever the host has no thumbs. The live box therefore shows real 3D
  thumbs immediately; if the box later runs its own capture, a fresh bake overrides it.
- **Deploy** (`.github/workflows/map-deploy.yml`): ships `data/cf-maps/world-mosaic/*`, then a
  **non-fatal** post-restart step captures 3D thumbs on the box (if Chromium present) + force-rebakes.
  No Chromium ⇒ the step self-skips and the committed mosaic keeps serving. **Re-bake contract:** after
  regenerating a zone's maps, re-run `capture_thumb` + `node maps/mosaic.js <ZONE>` and commit the PNG.
- STILL TO WIRE: (a) an interactive `/designer/world` overview built on the same route; (b) a
  save/`regenerate` hook that enqueues a per-parcel re-capture + zone re-bake automatically.
