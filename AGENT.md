# AGENT.md — hexagon-city map handoff (for the Clash Front overworld/import agent)

You asked (via `docs/briefs/map-session-brief.md`) for the hexagon-city land map so it can become the
Clash Front overworld. It has been located, extracted, and committed. Start here.

## Where it is
`data/hexagon-city-source/` — full snapshot + **`MAP-EXTRACTION-REPORT.md`** (read that for detail).

- `parcels-l2.json` — 8,482 estates/parcels (geometry + tokenId + sizeClass + l3Enabled).
- `l3/<ZONE>.json` ×10 — 284,314 L3 single paths (284,284 unique parcels).
- `zone-layout.json` — per-zone viewBox / transform / 3D worldOffset / token+size+zone mappers.
- `svg/l1/*.png`, `svg/l2/*.svg` — raw renderable art/masters.

**Totals:** 10 zones · 8,482 L2 · 284,284 unique L3 · **292,766 land NFTs**.

## The 3 things that will bite you if you skip the report
1. **There are no hexes in the source.** hexagon-city parcels are **irregular SVG polygons** — no
   `q,r`, no grid, anywhere (map, DB, chain, crons). Your `Hex{q,r}`/`Territory{hexIds[]}` model must
   be **synthesized** from these polygons. I deliberately did **not** invent `q,r` (footprints are
   permanent once committed). `MAP-EXTRACTION-REPORT.md` §9 gives a concrete hexification recipe.
2. **`data/parcels.json` (axial) is NOT produced yet** — it needs a signed-off "hexes per sizeClass"
   rule first (report §9), then a ~1-file script over these snapshots. `parcels.sample.json` is still
   just the format example.
3. **Land is Ethereum (estates) + Polygon (parcels), NOT Pentagon Chain.** Pentagon Chain is
   characters-only. Use `chainId` 1 / 137 and the `tokenId` encoding in `zone-layout.json` for
   `LandNFT` on-chain refs. Contract addresses are env-config (candidates + how to verify in report §4).

## Field mapping into your importer
| snapshot | your target |
|---|---|
| `tokenId` / `parcelId` | `LandNFT.sourceParcelId`, on-chain ref |
| `zone` | `Region` grouping + `ZoneType` (still an OPEN mapping — see README) |
| `sizeClass` (EPIC/GIANT/LARGE/MEDIUM/SMALL/SINGLE) | hex budget per parcel → estate vs single |
| `svgPath` + `center`/`bbox` | rasterize to axial grid (shape-faithful) OR pack N hexes |
| `l3Enabled` (L2) / `parentIndex` (L3) | L2↔L3 hierarchy |
| terrain / owner | NOT in source — worldgen default `PLAINS`; owners fetched live if needed |

## Parcel size
Every parcel now has `areaSvg` (polygon area in its zone's SVG units²) — robust **relative** size.
Real area exists in source as `size`=`Area_Square_M` (m²) but is only in the live DB/OpenSea, not
committed. Size ladder (median, ×SINGLE): SINGLE 1 · SMALL 27.7 · MEDIUM 116.7 · LARGE 201.5 ·
GIANT 302.5 · EPIC 480.3. Parcels also carry `areaM2Est`/`areaAcresEst` under the adopted anchor
**SINGLE = ½ acre** (`k=7,252 m²/svg²`) — hexagon-city is a full world/city (~1,052 km², 259,892 ac
across 10 zones; HUB 25% + BUS 22% dominate). Rescale from one real OpenSea/API `size` value if needed
(report §11).

## POI (points of interest)
POIs are **named circles** `{name, X, Y, Radius}`; an estate carries a POI when its center is inside
the circle (`(x-X)²+(y-Y)² ≤ R²`); L3 parcels inherit their parent estate's POI list. The circle
coords (`POI.json`) + estate centers (`L2Center.json`) are **not committed anywhere** (dead DB), so POI
positions can't be placed from the repo alone. See `data/hexagon-city-source/POI-MODEL.md` for the full
model + reconstruction tool `tools/poi-reconstruct.py` (feed it estate→POI membership from OpenSea → it
emits `poi.json` with centers/radii in the parcels coordinate space). ~20 POIs.

## Live data (optional, mutable)
Owner/mint/listing status via the legacy backend APIs (`/land/minted/l2`, `/land/<token_id>`,
`/metadata/<token_id>`, GraphQL `lands(...)`) — see report §6. The snapshot deliberately omits owners.

## Original map explorer (reference)
`data/hexagon-city-source/map-explorer-reference/` — verbatim copy of the original Three.js +
SVGLoader land-map client (zone select · zoom · drill to parcel · search). The live site
`map.hexagon.city` is DEAD (404) and the land API is gone, so this + the SVGs are the surviving copy.
Reference-only (won't build as-is; old Next.js app coupling). See its README to rebuild a no-backend viewer.

## Provenance
Extracted 2026-07-02 from `blockchainsuperheroes/_archive-cryptoverse-frontend` (SVG map) +
cryptoverse backend/graphql/scripts. Branch: `claude/map-extraction-hexagon-city`.
