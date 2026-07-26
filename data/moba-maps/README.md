# `data/moba-maps/` — the ENGINE-VENDORED map set (curated, small)

**This folder is the ONLY set of maps synced into the MOBA 3D engine repo** (via
`.github/workflows/sync-moba-maps.yml` → `etherfantasy-browser-moba-game/data/moba-maps/`). The 3D
client loads these from a relative path at startup, so they must be vendored. Keep it **curated and
small** — test/staging/reference maps only:

- `siege-test.*` — the siege mechanics + castle test map (what the single-player siege loads).
- `moba-singleplayer.json` / `MOBA-SINGLEPLAYER.*` — the reverse-engineered 3-lane single-player map.
- `legacy*.json` — interim stand-ins.

## Three delivery lanes — most maps are CF-only, NOT here (owner 2026-07-25)

1. **CF-only maps (the bulk).** Every parcel's designed battlefield — generated on demand, stored in
   the registry (`~/ef-battlefields`) / `data/cf-maps/`, served by the map-service and rendered in the
   CF command view. **These never enter this folder and never sync to the engine.**
2. **Runtime 3D maps.** When a real parcel gets a LIVE 3D battle, CF sends that parcel's battlefield in
   the allocate context (`battlefield` field → `battle_hello`; `docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md`).
   Delivered per-match at runtime — **not vendored here.**
3. **Vendored engine maps (this folder).** Static test/reference maps the engine loads at startup and
   the owner tests with. **These are what the sync pipeline delivers.**

## Rule of thumb
Put a map here ONLY if the 3D engine must load it statically (a test map, a fixed reference). A normal
gameplay/parcel map is CF-only (lane 1) or delivered at match time (lane 2) — do **not** drop it here,
or it will needlessly bloat the engine repo. See `docs/briefs/MAP-DELIVERY-TO-ENGINE.md`.
