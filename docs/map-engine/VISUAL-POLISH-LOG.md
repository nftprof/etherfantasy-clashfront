# Map Visual Polish — iteration log

Recurring look-and-feel loop per `docs/briefs/MAP-VISUAL-POLISH.md` (visual lane only,
zero gameplay impact). One surgical, shippable improvement per entry.

## 2026-07-04 · #1 — atmospheric map vignette (focus 7: atmosphere)

- **What:** added a cinematic edge vignette + faint top/bottom depth wash over the map
  viewport (`app.css`, `#map-wrap::after`).
- **Why:** the overworld filled the frame flatly to the panel edges; a soft radial
  falloff + depth gradient frames it like a war-room table map (RoTK / Total War feel)
  and draws the eye to the center of action.
- **Safety:** pure presentational overlay — `z-index: 1` (above the map canvas, below
  every HUD overlay which are all `z-index ≥ 12`), `pointer-events: none`, center 60%
  fully transparent. Cannot touch interaction, layout, banners, toasts, tooltips, or the
  battle overlay. No JS, no sim/server changes.
- **Verify:** `pnpm -r build && pnpm -r test` green (CSS-only, unaffected). Playwright
  screenshot deferred (module not installed in this environment); change verified by
  inspection given it is an additive, HUD-safe overlay.

## 2026-07-04 · #2 — sunlit shallow-water shelf at the coast (focus 3: water)

- **What:** in the hypsometric compose pass (`terrain.js` `composeRows`), the last strip
  of water hugging the coast (elevation −0.15→0) now brightens toward a turquoise shelf
  before the existing foam line, so shorelines read as real sunlit shallows deepening to
  open sea — instead of one flat coastal band.
- **Why:** water depth cues are a top-tier-map staple; a shallow shelf makes coastlines
  legible and gives the sea real depth, complementing the deep-water ocean tile.
- **Safety:** pure baked-raster arithmetic (clamped blend), deterministic, no per-frame
  or perf cost (the field bakes once). No JS control-flow, no sim/server changes.
- **Verify:** `pnpm -r build && pnpm -r test` green; terrain.js parse-checked. Screenshot
  deferred (no Playwright module); change is a self-contained, clamped color blend.

## 2026-07-05 · #3 — cinematic landscape pass (focus 1/7: relief + atmosphere)

- **What (bold, LOTR-matte-painting direction):**
  1. **Painterly directional light** — the flat grayscale hillshade becomes coloured: warm sun on
     lit slopes, cool-blue shade in the valleys (`terrain.js composeRows`), so ridges read like a
     painting instead of a heightmap.
  2. **Aerial perspective** — high country (elevation ≥ 0.55) recedes under a cool pale haze, giving
     ranges real depth and distance.
  3. **Deeper relief** — `Z_SCALE` 1.1 → 1.35 so slopes sculpt harder under the new light.
  4. **Drifting cloud shadows (parallax)** — a slow GPU-composited layer (`app.css #map-wrap::before`)
     sweeps soft shade across the land, moving independently of the terrain for a cinematic parallax
     feel; `pointer-events:none`, z-index 1 (below HUD), honours `prefers-reduced-motion`.
- **Safety:** terrain changes are baked once (no per-frame cost); the cloud layer is one CSS transform
  animation (no JS). Ownership washes/HUD draw on top and are unaffected. Zero sim/server changes.
- **Verify:** build + test green, terrain parse-checked. (Trees polish is the next tick.)
