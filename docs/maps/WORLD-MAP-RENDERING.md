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
  - STILL TO WIRE: (a) the world compositor pastes `thumbs3d/<id>.png` (clip to polygon) instead of
    the 2D raster, grey where absent; (b) a batch runner over the registry's generated designs +
    a hook so `regenerate`/save enqueues a re-capture.
