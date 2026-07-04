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
