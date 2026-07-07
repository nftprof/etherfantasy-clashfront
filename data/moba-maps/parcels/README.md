# `data/moba-maps/parcels/` — CF per-parcel battlefield override (the `CF_PARCEL_MAPS_DIR`)

> **If you were looking for `data/parcel-maps/` — that path does not exist. This is it.**
> CF's `loadParcelBattlefield(parcelId)` (`apps/server/src/battlefield.ts`) reads
> **`<CF_PARCEL_MAPS_DIR>/<parcelId>.json`**, and `CF_PARCEL_MAPS_DIR` **defaults to THIS dir**
> (`data/moba-maps/parcels/`). Set the env var to point elsewhere (e.g. a shared box dir).

## Where per-parcel maps ACTUALLY live (the source of truth)

Generated per-parcel maps are **NOT committed to this repo**. They are produced **lazily at runtime**
and stored in the **map-service registry** on the box:

- `$MAPS_DIR/<parcelId>/design.v{N}.json` (+ `current.json`, thumbs) — default `$MAPS_DIR = ~/ef-battlefields`.
- Immutable per `designVersion`; deterministic (same seed ⇒ same map).
- Served over the map-service API:
  - `GET /internal/v1/designs/<parcelId>` → the **raster** artifact (terrain grid + props).
  - `GET /internal/v1/designs/<parcelId>/command.json` → the **A1 vector** (what CF's command view renders).

So "where are the parcel maps?" → **on the box, in the registry, served by the map service** — not in git.

## What THIS dir is for (the CF-side override)

`loadParcelBattlefield` lets an operator **drop an A1 map here** that CF's `battleStatic` will **prefer
over the standard stand-in** (`legacy-{1,3}lane.json`) for the wild/command view. It is an **opt-in
override**, empty by default. Populate it two ways:

1. **Sync from the registry** — curl the A1 for a parcel and save it here:
   ```bash
   curl -s https://map.etherfantasy.com/internal/v1/designs/<parcelId>/command.json \
     > data/moba-maps/parcels/<parcelId>.json
   ```
2. **Hand-author** an A1 Battlefield JSON (see `docs/briefs/BATTLEFIELD-SCHEMA.md`) named `<parcelId>.json`.

## Rules

- **Filename = `<parcelId>.json`** exactly (the id CF looks up).
- **Format = A1 Battlefield JSON** (same shape as `command.json` output / the `legacy-*.json` stand-ins).
- **Validated at load** against the 5 playability invariants (`validateBattlefield`); an invalid file is
  ignored and CF falls back to the stand-in — a bad drop can't break a battle.
- A real bridge/match-server map still wins upstream (engine path); this dir covers the wild/command view.

## Precedence (what CF serves for a battle)

`battleStatic` (`apps/server/src/game.ts`): **bridge/match-server map (engine path) > `parcels/<id>.json`
(this dir) > `legacy-3lane.json` (estates) / `legacy-1lane.json` (single) stand-in.**

## Example

`MOBA-SINGLEPLAYER.json` here = the real single-player MOBA map reverse-engineered to A1 (see
`../moba-singleplayer.json` and the map-service example served at
`/internal/v1/designs/MOBA-SINGLEPLAYER`). It shows the exact file format expected in this dir.
