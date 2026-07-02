# MAP-EXTRACTION-REPORT — hexagon-city (formerly Cryptoverse) land map

**Date:** 2026-07-02 · **Status:** extraction UNBLOCKED and delivered (see the prior
"blocked" note in [`../README.md`](../README.md) — it assumed the map lived at an
out-of-scope `map.hexagon.city`; the real source has now been located and extracted).

---

## 0. TL;DR — read this before importing

- **The map is real and fully extracted.** 8,482 estates/parcels (L2) + **284,284 unique
  single-parcels (L3)** = **292,766 land NFTs** across **10 zones**. Everything is in this folder.
- **⚠️ The source has NO hex grid.** hexagon-city parcels are **irregular SVG polygons**, each an
  arbitrary `<path>` outline. There are **no axial `q,r` coordinates anywhere** in the map, the
  backend DB, the contracts, or the crons. The war game's `Hex{q,r}` / `Territory{hexIds[]}` model
  is a *target* representation that **does not exist in the source** and must be **synthesized**
  (see §9). I did **not** fabricate `q,r` values — committing guessed permanent footprints would
  violate the project's "parcel footprints are PERMANENT" locked decision.
- **⚠️ Land is NOT on Pentagon Chain.** Estates are ERC-721 on **Ethereum (chainId 1)**; parcels
  are ERC-721 on **Polygon (chainId 137)**. Pentagon Chain (pentagon.games) is used only for game
  *characters* in a different backend, not for land. (Brief assumed Pentagon Chain — corrected here.)
- Consequently, `data/parcels.json` in the target's exact axial schema is **not yet producible from
  source alone**; this folder is the faithful raw snapshot + a documented conversion path.

---

## 1. What was delivered (files in `data/hexagon-city-source/`)

| File | Contents |
|---|---|
| `parcels-l2.json` | All **8,482** L2 estates/parcels: `tokenId`, `zone`, `sizeClass`, `l3Enabled`, `center`, `bbox`, exact `svgPath`. Plus embedded `zoneLayout` + `tokenEncoding` + counts. |
| `l3/<ZONE>.json` (×10) | All **284,314** L3 single-parcel paths (284,284 unique): `tokenId`, `parentIndex`, `subIndex`, `center`, `bbox`, `svgPath`. |
| `zone-layout.json` | Per-zone `viewBox`, SVG `transform`, 3D `worldOffset`, zone codes, size/zone/color mappers, token-encoding spec. |
| `svg/l1/*.png` (×10) | Per-zone background art (raw, lossless). |
| `svg/l2/*.svg` (×10) | Raw L2 vector masters (source of `parcels-l2.json`). |
| `MAP-EXTRACTION-REPORT.md` | This file. |

> Raw L3 SVGs (~65 MB) are intentionally **not** copied: each L3 parcel's exact geometry is already
> embedded as `svgPath` in `l3/<ZONE>.json`. They remain in
> `blockchainsuperheroes/_archive-cryptoverse-frontend/public/svg/l3/` if ever needed.

---

## 2. Data model (the map)

Three layers (`L1 → L2 → L3`):

- **L1 — zones** (12 defined, **10 have geometry**): `BUS EDU ENT HS1 HS2 HS3 HUB UW1 UW2 UW3`
  (also `CGI`, `KOL` exist in the encoding map but ship no parcels). L1 itself is descriptive
  (name/description), no geometry.
- **L2 — estates & parcels** (8,482): each is one SVG polygon with a `sizeClass`:

  | sizeClass | count | note |
  |---|---|---|
  | EPIC | 48 | largest |
  | GIANT | 172 | |
  | LARGE | 393 | |
  | MEDIUM | 1,082 | |
  | SMALL | 6,787 | smallest L2 |

  `l3Enabled=true` parcels are subdivided into L3 singles.
- **L3 — singles** (284,284 unique): the finest subdivision, all `sizeClass=SINGLE`, nested under an
  L2 parent via `parentIndex`.

### Token-ID encoding (ties geometry → on-chain NFT id)
```
L2 tokenId = sizeDigit(1) + zoneCode(2) + sourceIndex(4)
             e.g. SMALL parcel #0 in ENT = '5' + '03' + '0000' = 5030000   (7 digits)
L3 tokenId = '6' + zoneCode(2) + parentIndex(4) + subIndex(4)               (13 digits)
             e.g. ENT parent 2, sub 0            = '6' + '03' + '0002' + '0000' = 60300020000
sizeMapper : EPIC 1, GIANT 2, LARGE 3, MEDIUM 4, SMALL 5, SINGLE 6
zoneMapper : BUS 00, CGI 01, EDU 02, ENT 03, HS1 04, HS2 05, HS3 06, HUB 07, KOL 08, UW1 09, UW2 10, UW3 11
```
Source of truth for the encoding: `_archive-cryptoverse-frontend/vendors/LandMap/Helpers.js`
(`padTokenId`, `padTokenIdL3`) + `Defaults.js`.

---

## 3. Coordinate system (important)

- Each zone's parcels live in **that zone's own SVG `viewBox` space** (see `zone-layout.json`),
  with a per-zone `transform="translate(...)"` that recenters the group.
- Zones are assembled into one world **only at render time** in 3D: each zone group is placed at its
  `worldOffset (x,y,z)` and rotated `0.5·π` about X so the XZ plane is the ground
  (`vendors/LandMap/LandMap.js`).
- **There is no single unified 2D source grid, and no hexes.** `center`/`bbox` we emit are in the
  zone-local SVG space (anchor-point mean of the path; bézier control-point overshoot ignored — so
  treat them as *approximate* centroids, accurate to well within a parcel for these tiny shapes).

---

## 4. On-chain linkage

| | Estates (L2) | Parcels (L3) |
|---|---|---|
| Standard | ERC-721 | ERC-721 |
| Chain | **Ethereum (chainId 1)** | **Polygon (chainId 137)** |
| Contract | `estate_contract` (env-config, not committed) | `parcel_contract` (env-config, not committed) |

- Contract addresses are **not committed** (loaded from `app.config` in
  `cryptoverse-scripts-python`). Candidate hard-coded addresses appear in
  `cryptoverse-scripts-python/app/check_loaded_tokens.py`
  (`0xB488b04E5e804676e3ab085F0Fb9C3d9633b50F5`, `0x411d4B953BA5A54462728C78E71108F913565265`) —
  **verify against the live deployment before trusting**.
- ERC-721 Transfer topic used for sync: `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`.
- **Pentagon Chain**: used only for character minting in `games-etherfantasy-backend`
  (`api/blockchain/pentagonScanner.ts`); **no land** touches it.

---

## 5. Ownership

`owner` is a string field on the MongoDB `lands` document (empty string = unminted). It is refreshed
by cron scripts (`cryptoverse-scripts-python/app/estate_sync.py`, `parcel_sync.py`) that pull ERC-721
Transfer events via the **Covalent API** and write `owner`/`updated_at`/`txhash`. Ownership is **not**
in this snapshot (it is mutable) — pull it live from the API (§6) at import time if needed. The war
game's design starts all territories `SYSTEM`-owned anyway, so owners are optional.

---

## 6. Land APIs (for live owner/mint/listing status)

Backend: `cryptoverse-backend-revamp` (Django REST) + `cryptoverse-graphql` (Graphene). Legacy base
domain `api.cryptoverse.vip` (confirm current host). Key endpoints:

- `GET /land/layer1` · `/land/layer2` · `/land/layer3` (paginated; filter `zone_name`, `token_id`, `sold`, `poi`, `land_type`, `type`)
- `GET /land/<token_id>` — single land
- `GET /land/minted/l2` · `/land/minted/l3/<l2_token_id>` — minted token-id arrays
- `GET /land/listed/l2` · `/land/listed/l3/<l2_token_id>` — marketplace-listed token-id arrays
- `GET /metadata/<token_id>` — OpenSea-style metadata (zone, size, type, POI attributes)
- GraphQL: `lands(search:{zone_name,type,token_id,sold,land_type})`, `land(token_id)`, `continents`

`hexagon-crons` = MATIC staking sync only (no land). `games-etherfantasy-backend` = accounts/heroes/
gameplay (no land).

---

## 7. Renderer assessment (can we reuse the map client?)

The existing map renderer is `_archive-cryptoverse-frontend/vendors/LandMap/*` — **Three.js +
`SVGLoader`**, loads the L1/L2/L3 SVGs, extrudes each `<path>` to a mesh, colors by `sizeClass`,
polls `/land/minted/*` to tint sold parcels, click-selects parcels.

- **Reusable as-is?** Partially. It is a **parcel-picker/marketplace map**, not a strategy overworld
  (no camera/units/fog/territory overlay). It is coupled to the old Next.js app, SWR, and
  `api.cryptoverse.vip`.
- **Recommended:** **rebuild the overworld client on this extracted data**, not on the old code.
  Reuse the *assets* (SVG paths + L1 art) and the extrusion idea; drop the app coupling. The SVG
  polygons import cleanly into any renderer (Three.js, PixiJS, Mapbox/Leaflet as GeoJSON, or a
  hex-tiler once §9 is decided). Asset licensing: internal (blockchainsuperheroes) — confirm with
  product owner before shipping externally.

---

## 8. Completeness & caveats (per brief "flag, don't guess")

- **Counts are complete**: 8,482 L2 (0 duplicate token-ids) + 284,314 L3 paths → **284,284 unique**
  L3 (30 parcels are drawn as multiple sub-paths; dedupe by `tokenId`, treat as one multi-polygon).
- **No terrain / zoneType / POI-per-parcel geometry** in source. `poi` exists on the DB doc as a
  string list but is not spatial. Terrain must be assigned by worldgen (design doc default `PLAINS`).
- **`center`/`bbox` are approximate** (anchor-point based) — fine for placement/sorting, not for
  exact area. Exact area/centroid would need full bézier integration of `svgPath`.
- **Owners not included** (mutable — fetch live).
- **Contract addresses unverified** (env-config; candidates in §4).

---

## 9. Recommended path to the target's axial-hex schema

The target importer (`packages/sim-engine/src/parcels.ts`) requires `parcels.json` with
`hexes:[{q,r}]` and **rejects non-axial coords**. Since the source has none, a **deliberate
hexification step** is needed (a product/design decision, then a script):

1. **Decide hex budget per parcel.** Simplest deterministic rule: hex count by `sizeClass`
   (e.g. SINGLE=1, SMALL=1, MEDIUM=~4, LARGE=~9, GIANT=~25, EPIC=~100 … or scale by `bbox` area).
   The design bible already says estates span "hundreds up to ~10,000 hexes" — align the budget to that.
2. **Lay out hexes** either (a) by rasterizing each `svgPath` polygon onto an axial grid at a chosen
   hex size (geometry-faithful — parcels keep their real shape/adjacency), or (b) by packing
   `budget` hexes per parcel in reading order (simple, loses real shape). (a) is recommended since
   "parcel/estate boundaries are gameplay-critical."
3. **Preserve provenance**: set `parcelId`/`tokenId`/`zone`/`contract`/`chainId` from this snapshot so
   `LandNFT.sourceParcelId` round-trips.
4. Emit `data/parcels.json` in the sample schema, run `parseParcelsFile` to validate (no dup hexes).

Once decided, this is a ~1 file script over `parcels-l2.json` + `l3/*.json`. **Do not** commit the
axial `parcels.json` until step 1's sizing rule is signed off — it becomes permanent.

---

## 10. Source repos (provenance)

| Repo | Role |
|---|---|
| `_archive-cryptoverse-frontend` | **Map geometry** (SVG l1/l2/l3) + Three.js renderer + token encoding |
| `cryptoverse-backend-revamp` / `cryptoverse-graphql` | Land DB model (MongoDB `lands`) + REST/GraphQL APIs |
| `cryptoverse-scripts-python` | Token-id construction, on-chain (Covalent) ownership sync, contracts |
| `hexagone-city-website` | Newer marketing/mint/staking site — **no map** (map was the archived frontend) |
| `hexagon-crons` | MATIC staking sync — no land |
| `games-etherfantasy-backend` | Characters/gameplay (Pentagon Chain) — no land |
| `cryptoverse_land_pdf` | Static 42 MB PDF poster of the map (visual reference only) |
