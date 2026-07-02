# Mission Brief — hexagone-city map extraction for Clash Front

Paste this as the first message of a session scoped to `blockchainsuperheroes/hexagone-city-website`
(and ideally `hexagon-crons` + `games-etherfantasy-backend` too).

---

## Context (read carefully, this is your only context)

We are building **Clash Front**, a persistent grand-strategy war game layered ON TOP of the
hexagone-city NFT land map. The strategy layer lives in a separate repo
(`blockchainsuperheroes/etherfantasy-clashfront`, branch `claude/clash-front-overworld-mkcyia`)
containing the full design bible; you may not have access to it — this brief is self-contained.

Key facts that constrain your work:
- The hexagone-city **overworld map is FIXED** — its geometry will never change. It becomes the
  strategy game's world map. Each hexagon = 1 land parcel; parcels are NFTs.
- **Parcel sizes are PERMANENT.** Small parcels are single hexes; **estates** span hundreds up to
  ~10,000 hexes. In the war game, each hex becomes a unique seeded battlefield; estates are fought
  hex-by-hex as linked components, so parcel/estate boundaries are gameplay-critical data.
- The strategy layer models this as: `Hex { id, q, r, terrain, territoryId, battleMapId }` and
  `Territory { id, zoneType, hexIds[], landNftId, governorId, … }` with 1 Territory = 1 Land NFT.

## Your mission

1. **Map the map.** Reverse-engineer how hexagone-city stores its map and land data: hex grid
   scheme (axial/offset coords?), parcel/estate definitions, NFT contract linkage (Pentagon Chain),
   ownership records, terrain/zone attributes if any, and how the frontend renders it (library,
   data files, API endpoints). Report the data model you find.
2. **Extract the parcel table.** Produce a single canonical snapshot file `parcels.json` containing
   ALL parcels: `{ parcelId, tokenId/contract, hexes: [{q,r}], sizeClass (smallest…estate),
   center, name/district if any, currentOwner (optional) }`. Include a `meta` block documenting the
   coordinate system, units, extraction source (file/API/chain), and extraction date. This file is
   the permanent import source for the war game — completeness matters more than speed; state
   explicitly if any parcels could not be extracted and why.
3. **Renderer assessment.** Briefly assess whether the existing map renderer could be reused/embedded
   as the war-game overworld client (tech, coupling, licensing of assets), vs. rebuilding on its data.
4. **Deliver:** commit `parcels.json` + a `MAP-EXTRACTION-REPORT.md` (findings from 1 & 3) to a
   feature branch of the maps repo, or if write access is unavailable, output them as files for
   manual transfer to `etherfantasy-clashfront/data/`.

## Rules
- Do NOT modify existing map/site code or data — read-only extraction.
- Prefer primary sources (data files, contracts, DB/API) over inferring from render code.
- If the repo references a backend/API for land data, document the endpoints; check
  `games-etherfantasy-backend` and `hexagon-crons` if they're in scope.
- Flag ambiguities explicitly rather than guessing (e.g. duplicate parcels, unassigned hexes,
  sea/void hexes, multiple contracts).
