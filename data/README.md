# data/ — Imported world data

## `parcels.json` (NOT YET GENERATED — source snapshot delivered, axial conversion pending a design decision)

> **Update 2026-07-02 — extraction UNBLOCKED.** The hexagon-city (formerly Cryptoverse) map has been
> located and fully extracted into [`hexagon-city-source/`](./hexagon-city-source/) — 8,482 estates/
> parcels (L2) + 284,284 unique singles (L3) across 10 zones, with geometry, token IDs, and on-chain
> refs. See [`hexagon-city-source/MAP-EXTRACTION-REPORT.md`](./hexagon-city-source/MAP-EXTRACTION-REPORT.md)
> and the root [`../AGENT.md`](../AGENT.md). **Key catch:** the source map is **irregular SVG polygons,
> not hexes** — there are no `q,r` coordinates to import. Producing `parcels.json` requires a signed-off
> "hexes-per-parcel" rule and a rasterization/packing step (report §9); it was intentionally NOT
> fabricated because footprints are permanent once committed.

The permanent snapshot of the hexagone-city land map: every parcel, its hex footprint
(axial `q,r`), source zone, and on-chain reference. **Parcel sizes are PERMANENT**
(locked decision 1, `../CLAUDE.md`): once this file is committed, footprints never change;
re-extraction may only add provenance fields or fill in owners/terrain.

- **Format:** see [`parcels.sample.json`](./parcels.sample.json) (format example, fake data)
  and the typed definition `ParcelsFile` / `ParcelRecord` in
  [`packages/sim-engine/src/parcels.ts`](../packages/sim-engine/src/parcels.ts).
- **Importer:** `importParcels(file, {name, seed}, rng, options)` →
  canonical `Hex`/`Territory`/`LandNFT`/`Region` genesis `WorldState`
  (docs/08 §4; invariant 2 enforced; deterministic — same snapshot + seed ⇒ identical world).
- **Validation:** `parseParcelsFile` / `loadParcelsFile` reject duplicate parcel ids,
  duplicate hex coordinates across parcels, empty footprints, and non-axial coordinates.

### Where the map actually was (2026-07-02, resolved)

The `hexagone-city-website` repo is the marketing / account / Polygon-staking site and does **not**
contain the map. The real map is the **archived Cryptoverse frontend**
(`blockchainsuperheroes/_archive-cryptoverse-frontend`, `public/svg/{l1,l2,l3}`) — a Three.js +
`SVGLoader` parcel picker — backed by `cryptoverse-backend-revamp` / `cryptoverse-graphql` (land DB +
APIs) and `cryptoverse-scripts-python` (token encoding + Covalent ownership sync). `hexagon-crons` is
MATIC-staking (no land); `games-etherfantasy-backend` is characters/gameplay on Pentagon Chain (no land).
All of it is now extracted into [`hexagon-city-source/`](./hexagon-city-source/).

### Source-field mapping (importer)

| snapshot field | canonical target |
|---|---|
| `parcelId` | `LandNFT.sourceParcelId` (provenance; docs/08 §4) |
| `hexes[].q/r` | `Hex.q/r` (axial); `Hex.territoryId` back-reference |
| `hexes[].terrain` | `Hex.terrain` (omitted ⇒ `defaultTerrain` 'PLAINS' — biome overrides designated later, locked decision 2) |
| `zone` | `Region` grouping (one Region per distinct zone; fallback `Unzoned`); `ZoneType` via `zoneTypeBySourceZone` option (fallback `VILLAGE` — ❓ OPEN) |
| `chainId`/`contract`/`tokenId` | `LandNFT` on-chain refs |
| `ownerAddress` | informational until platform player-linking exists (`LandNFT` starts SYSTEM-owned) |
| footprint size ≥ `ESTATE_MIN_HEXES` | estate (linked-component battles, 04 §7b) — `isEstate()` |

Economic genesis (population, treasuries, NPC governors) is worldgen (roadmap T5),
not import: imported territories start dormant, `SYSTEM`-governed (`system:genesis`).
