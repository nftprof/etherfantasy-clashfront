# Brief: recover POI / sizes / centers from the old hexagon-city (Cryptoverse) DB backup

Hand this to the agent that has access to the metadata **database backup** (and/or the old API repo).
Goal: pull three things the live services no longer serve — **POI locations**, **real parcel sizes
(m²)**, and **estate center coordinates** — so they can be joined to the committed map snapshot
(`data/hexagon-city-source/parcels-l2.json`, keyed by `tokenId`).

## What the system is (so you recognize the backup)
- **DB:** MongoDB (accessed via `mongoengine`). Connected in the Django backend as
  `mongoengine.connect(MONGO_NAME, host=MONGO_DATABASE_HOST)` — look for those two env vars to learn
  the **database name** and host/URI.
- **Repos that touch it:** `cryptoverse-backend-revamp` (Django REST + the `/metadata/<id>` endpoint),
  `cryptoverse-graphql` (Graphene), `cryptoverse-scripts-python` (seeding + on-chain sync),
  `_archive-cryptoverse-backend` (older copy). The metadata `tokenURI` was
  `https://api.cryptoverse.biz/metadata/<id>` (now dead).
- **Collection this is:** the land NFT collection "HexagonCity" / "Cryptoverse".
  Estate (L2) contract = `0x28cd2990f34db387d011d7cc693a2bcedd8dc654` (Ethereum);
  Parcel (L3) contract = `0x383FB8793294D82B3c20bf04c10f4B9B9cB2ACA7` (Polygon).
  If the dump has multiple DBs, the right one has a `lands` collection whose docs have these token_ids.

## The collections to find and export (priority order)

1. **`POI`**  ← the actual POI locations. Docs: `{ Name, X, Y, Radius }` (older rows may store an
   `XY` string like `"X=.. Y=.."` instead of numeric `X`/`Y`). Each doc is a **circle**; that IS
   "where the POI is on the map." **Export the whole collection.** (~20 docs.)
2. **`L2Center`**  ← estate center points defining the coordinate frame. Docs: `{ Name, X, Y }`
   (Name = estate name like `EDU_0347`). Export all.
3. **`lands`**  ← the master land table. For every doc export:
   `token_id, name, zone_name, type ("estate"|"parcel"), land_type, size, X, Y, poi, l2, l3_enabled,
   owner, chain_id, image_url`.
   - `size` = **`Area_Square_M`** → the **real area in m²** (answers "is a hex ½ acre?").
   - `poi` = **list of POI names** on that estate → the **POI membership**.
   - `X`,`Y` (on estates) = same frame as `L2Center`/`POI`.
   - Filtering: `type:"estate"` ≈ 8,482 docs; `type:"parcel"` ≈ 284k docs. Estates alone give POI +
     centers; sizes are on both.
4. **`land_sizes`** — `{ name, land_type }` size class per estate (optional; `land_type` is also on `lands`).
5. **`lands_L1`** — `{ token_id, zone_name, name, short_description, long_description }` (zone text).

Secondary (nice to have): `poi_percent` / `zone_percent` / `land_type_percent` (precomputed rarity),
`ipfs_hashes` (`{name,hash}` for image folders), `marketplace_orders` (ownership/price history),
`estate_transactions` / `parcel_transactions`, `last_blocks`.

## If it's an APP/file backup rather than a DB dump
Look for a **`Cryptoverse Resourses/`** directory (referenced but not committed in
`cryptoverse-scripts-python/app/cv_new.py`, ~lines 434–449). It holds the raw seed files:
`POI.json` (`{Name,X,Y,Radius}`), `L2Center.json` (`{Name,X,Y}`), `land_sizes.json`, and
`L2 Json/` + `L3 Json/` (each parcel has `Name` + `Area_Square_M`). These are equivalent to the
collections above.

## How it all fits (so the export is usable)
- **Coordinate frame:** `POI.X/Y/Radius`, `L2Center.X/Y`, and `lands.X/Y` are all in ONE global 2-D
  map space. Assignment rule (source of truth): an estate has a POI iff
  `(estate.X - POI.X)² + (estate.Y - POI.Y)² ≤ POI.Radius²`. L3 parcels inherit the parent estate's
  `poi`.
- **Join key:** `token_id` matches the snapshot's `tokenId` exactly. Encoding:
  L2 = `size(1)+zone(2)+index(4)`; L3 = `parentEstateSizeDigit(1)+zone(2)+parent(4)+sub(4)` (parent estate's size digit, NOT 6 — verified on-chain; see LAND-CONTRACTS-AND-SALE.md §5).
  `zoneMapper`: BUS00 CGI01 EDU02 ENT03 HS104 HS205 HS306 HUB07 KOL08 UW109 UW210 UW311.
- Note the snapshot's own `center` values are per-zone SVG space, a DIFFERENT frame from `lands.X/Y`.
  Prefer the DB `X/Y` (global frame) when it's available; they supersede the SVG centroids.

## Deliverable back to this repo
Three JSON exports dropped into `data/hexagon-city-source/`:
- `poi.json`  ← from `POI` collection (name, X, Y, radius)
- `l2center.json`  ← from `L2Center`
- `lands-export.json`  ← from `lands` (at minimum: token_id, name, zone_name, type, land_type, size,
  X, Y, poi[])

With those, POI placement, exact per-parcel m²/acres, and true estate centers all resolve directly —
no OpenSea/API-key path needed.
