# `data/cf-maps/parcels/` — CF per-parcel battlefield override (the `CF_PARCEL_MAPS_DIR`)

> **This is where CF-generated per-parcel maps go.** CF's `loadParcelBattlefield(parcelId)`
> (`apps/server/src/battlefield.ts`) reads **`<CF_PARCEL_MAPS_DIR>/<parcelId>.json`**, and
> `CF_PARCEL_MAPS_DIR` **defaults to THIS dir** (`data/cf-maps/parcels/`). Set the env var to point
> elsewhere (e.g. a shared box dir).
>
> **Not `data/moba-maps/parcels/`** — that dir is reserved for MOBA-derived maps (the reverse-engineered
> single-player map + future MOBA single-player modes). The maps CF *makes* are **cf-maps**.

## Where per-parcel CF maps ACTUALLY live (the source of truth)

Generated per-parcel maps are **NOT committed to this repo**. They are produced **lazily at runtime**
(canon decision 9 — battlefields materialize on first visit) and stored in the **map-service registry**
on the box:

- `$MAPS_DIR/<parcelId>/design.v{N}.json` (+ `current.json`, thumbs) — default `$MAPS_DIR = ~/ef-battlefields`.
- Immutable per `designVersion`; deterministic (same seed ⇒ same map).
- Served over the map-service API:
  - `GET /internal/v1/designs/<parcelId>` → the **raster** artifact (terrain grid + props → 3D viewer).
  - `GET /internal/v1/designs/<parcelId>/command.json` → the **A1 vector** (CF's 2D command view).

So "where are the CF parcel maps?" → **on the box, in the registry, served by the map service** — not in git.

## What THIS dir is for (the CF-side override)

`loadParcelBattlefield` lets an operator **drop an A1 map here** that CF's `battleStatic` will **prefer
over the standard stand-in** for the wild/command view. Opt-in, empty by default. Populate two ways:

1. **Sync from the registry** — save a parcel's A1 here:
   ```bash
   curl -s https://map.etherfantasy.com/internal/v1/designs/<parcelId>/command.json \
     > data/cf-maps/parcels/<parcelId>.json
   ```
2. **Hand-author** an A1 Battlefield JSON (see `docs/briefs/BATTLEFIELD-SCHEMA.md`) named `<parcelId>.json`.

## Real sample committed (integration end-to-end fixture)

- **`60200010000.json`** — a **real on-chain parcelId** (EDU zone L3 single, Academy Highlands biome; from
  `data/hexagon-city-source/l3/EDU.json`), generated at invest tier 2 (seeded: towers + gold + mob camps).
  Passes CF `validateBattlefield` (all 5 invariants) and loads via `loadParcelBattlefield("60200010000")`
  — test `apps/server/test/parcelSample.test.ts`. This is the **B (A1 vector)** form.
- Its matching **A (raster artifact)** — for the sim to build collision — is
  `data/cf-maps/artifacts/60200010000.artifact.json` (terrain grid `cells`+`walk` + entities). Schema +
  seam contract: **`docs/briefs/ARTIFACT-SCHEMA.md`**.

## Rules

- **Filename = `<parcelId>.json`** exactly (the id CF looks up).
- **Format = A1 Battlefield JSON** (same shape as `command.json` output / the `legacy-*.json` stand-ins).
- **Validated at load** against the 5 playability invariants (`validateBattlefield`); an invalid file is
  ignored and CF falls back to the stand-in — a bad drop can't break a battle.
- A real bridge/match-server map still wins upstream (engine path); this dir covers the wild/command view.

## Precedence (what CF serves for a battle)

`battleStatic` (`apps/server/src/game.ts`): **bridge/match-server map (engine path) > `cf-maps/parcels/<id>.json`
(this dir) > `moba-maps/legacy-3lane.json` (estates) / `legacy-1lane.json` (single) stand-in.**
