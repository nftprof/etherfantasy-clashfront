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

## Live data (optional, mutable)
Owner/mint/listing status via the legacy backend APIs (`/land/minted/l2`, `/land/<token_id>`,
`/metadata/<token_id>`, GraphQL `lands(...)`) — see report §6. The snapshot deliberately omits owners.

## Provenance
Extracted 2026-07-02 from `blockchainsuperheroes/_archive-cryptoverse-frontend` (SVG map) +
cryptoverse backend/graphql/scripts. Branch: `claude/map-extraction-hexagon-city`.
