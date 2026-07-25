# POI (Points of Interest) — how they sit on the hexagon-city map

For the war-game session that needs "where the POIs are on the map." This documents the **exact
model** (reverse-engineered from source) and the **one data input** needed to place them, since the
POI coordinates are not committed in any repo (they live only in the now-dead DB + on OpenSea).

## The model (exact, from `cryptoverse-scripts-python/app/cv_new.py` `store_poi()`)

A POI is a **named circle** on the global map:

```
POI = { Name: str, X: float, Y: float, Radius: float }
```

Assignment rule — an **L2 estate** is tagged with a POI when the estate's center point falls inside
the circle:

```python
def isInside(cx, cy, radius, x, y):      # x,y = estate center; cx,cy,radius = POI circle
    return (x-cx)**2 + (y-cy)**2 <= radius**2
```

- An estate can carry **multiple POIs** (overlapping circles) → `lands.poi` is a list of names.
- **L3 singles inherit their parent estate's POI list** (the `/metadata` endpoint reads
  `land.l2.poi`). So POI is fundamentally an **estate-level** attribute; parcels get it via their parent.
- Estate centers come from `L2Center.json` (`{Name, X, Y}` → `lands.X/Y`); POI circles come from
  `POI.json` (`{Name, X, Y, Radius}` → `mongo.db.POI`). **Neither file is committed anywhere**
  (verified across the whole org) — same gap as the m² sizes.

## Coordinate space (important)

`L2Center` X/Y and the POI circle X/Y are in **one global 2-D map space** — NOT the per-zone SVG
viewBox space used by `parcels-l2.json` `center`. To relate them you must assemble zones into the
single world using `zone-layout.json` (`worldOffset` per zone + the 0.5·π X-rotation from the renderer;
see MAP-EXTRACTION-REPORT §3). Practically, the war game should reconstruct POIs in **its own world
space** (the one it builds parcels/hexes in) — see the recipe below, which is space-agnostic.

## What exists where

| POI data | source | reachable now? |
|---|---|---|
| POI circles (`Name,X,Y,Radius`) | uncommitted `POI.json` / dead `mongo.db.POI` | ❌ (DB decommissioned, file never committed) |
| estate centers (`Name,X,Y`) | uncommitted `L2Center.json` / dead DB | ❌ |
| **estate → POI membership** | `lands.poi` (dead API) **and OpenSea traits (live)** | ✅ via OpenSea (needs API key) |
| estate geometry / centers (per-zone SVG) | `parcels-l2.json` (this repo) | ✅ committed |

## Known POI names (partial — 20 total)

From OpenSea `hexagoncity` "POI" trait (20 distinct values). Confirmed so far:
`Ferry Port`, `Airport`, `Little Vegas`, `Underwater View`, `PvP Dome`, `Lake District`,
`University District`. The remaining ~13 come from the OpenSea Traits tab or `POI.json`.

## Recipe to produce `poi.json` (two ways)

**A. Exact — if you get `POI.json` + `L2Center.json` (or a DB export of `POI` + estate X/Y):**
the circles ARE the answer. Emit `poi.json = [{name, center:{x,y}, radius, sourceSpace:"L2Center"}]`
and map circle centers into world space with `zone-layout.json`. Membership recomputes exactly via
`isInside`.

**B. Reconstruct from membership (no circle file needed):** get, per estate, its POI list (OpenSea
export or `lands.poi`), then for each POI compute the **centroid + covering radius of its member
estates' centers** (from `parcels-l2.json`). This yields POI positions directly in the parcels
coordinate space — ideal for the war game. Run `tools/poi-reconstruct.py` (committed here) with a
membership file `{ "<estateTokenId>": ["Ferry Port", ...], ... }`.

## Where the metadata is served (answer: yes, but it's dynamic + dead)

The metadata **is** served by a repo: `cryptoverse-backend-revamp` → `GET /metadata/<tokenId>`
(Django, `cryptoverse/views.py`) builds the OpenSea JSON — `name`, `image`, `description`, and
`attributes` (`Zone`, `Size`, `Type`, and one `POI` entry per POI) — **dynamically from the MongoDB
`lands` collection**. The on-chain `tokenURI` points at it:

- Estate (L2), Ethereum `0x28cd2990f34db387d011d7cc693a2bcedd8dc654` → `https://api.cryptoverse.biz/metadata/<id>`
- Parcel (L3), Polygon `0x383FB8793294D82B3c20bf04c10f4B9B9cB2ACA7` → same base

Because it is generated from the DB (not static files), **there is no committed POI dataset** — and
`api.cryptoverse.biz` is now **NXDOMAIN (dead)**. So the POI trait values survive **only in OpenSea's
cache** (what you see in the collection UI). Recovering them = OpenSea API v2 with a key
(`/chain/ethereum/contract/0x28cd…c654/nfts/<id>` → `traits`), enumerated over the estate tokens
(which we already have in `parcels-l2.json`).

## What we need to finish this

Any ONE of:
1. `POI.json` + `L2Center.json` (best — exact circles), or
2. an **OpenSea API key** (we'll pull every estate→POI membership via the v2 traits endpoint and run
   recipe B automatically), or
3. a membership export `estateTokenId → [POI names]` (from OpenSea account export or a DB dump).

Then `poi.json` (name · center · radius · member estates) drops in next to `parcels-l2.json`, and each
estate/parcel can be stamped with its `poi` list.
