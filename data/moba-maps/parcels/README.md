# `data/moba-maps/parcels/` — MOBA single-player maps ONLY

> **This dir is reserved for MOBA-derived maps** — the reverse-engineered single-player MOBA map, and
> any future MOBA single-player modes. **It is NOT where CF-generated maps go.**
>
> **CF's per-parcel generated maps live in [`../../cf-maps/parcels/`](../../cf-maps/parcels/)** — that
> is the `CF_PARCEL_MAPS_DIR` default that `loadParcelBattlefield` reads. The maps CF *makes* are cf-maps.

## Contents

- `MOBA-SINGLEPLAYER.json` — the current single-player MOBA map, reverse-engineered from the live client
  (`etherfantasy-browser-moba-game/index.html`: LANES / mkTower / mkNode / mkCore @ MAPK 1.4) into the
  A1 Battlefield schema. See `../moba-singleplayer.json` (identical) and the raster form served for the
  3D viewer at `map-service/maps/examples/moba-singleplayer.artifact.json`
  (`/designer/3d?parcel=MOBA-SINGLEPLAYER`).

Also in `../` (the MOBA reference maps): `legacy-1lane.json` / `legacy-3lane.json` (MOBA-style stand-ins)
and (when the MOBA BattleEngine session delivers it) `legacy.json` (the real MOBA export).
