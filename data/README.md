# data/ — Imported world data

## `parcels.json` (NOT YET PRESENT — extraction blocked on repo scope)

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

### Why the real snapshot isn't here yet (2026-07-02 findings)

The `hexagone-city-website` repo does **not** contain the map: it is the marketing /
account / Polygon-staking site. The actual hex map + land marketplace is a separate app
at **`map.hexagon.city`** (linked from the site header with `land_type` / `zone` /
`chain_ids` filters), whose codebase is not in this session's repo scope, and the remote
execution environment's network policy blocks fetching its API directly. `hexagon-crons`
is MATIC-staking sync (no land tables); `games-etherfantasy-backend` is accounts/heroes/
gameplay (no land either).

**Unblock paths (product owner):** add the map.hexagon.city codebase (or its land DB/API
export) to a session's repo scope, or hand over a raw export — any JSON/CSV with
parcel id → hex coordinates (+ zone, land type, chain refs) can be converted to this
format with a small script.

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
