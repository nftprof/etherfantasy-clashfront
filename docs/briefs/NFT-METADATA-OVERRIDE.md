# NFT metadata override — SOURCE endpoints for pg-nft-data (owner 2026-07-21)

Hand these to the **pg-nft-data override service** (docs: blockchainsuperheroes.github.io/pg-nft-data-docs).
The map service is the override metadata SOURCE for BOTH collections; point the override at these
and update the on-chain metadata URI later.

Base: `https://map.etherfantasy.com`  (env `PUBLIC_MAP_URL` overrides the absolute image/external URLs)

| Collection | Chain | Contract | Metadata URI pattern |
|---|---|---|---|
| Parcels | Polygon | `0x383fb8793294d82b3c20bf04c10f4b9b9cb2aca7` | `GET /nft/{contract}/{tokenId}` |
| Estate | Ethereum | `0x28cd2990f34db387d011d7cc693a2bcedd8dc654` | `GET /nft/{contract}/{tokenId}` |

- **`GET /nft/<contract>/<tokenId>`** → OpenSea-style JSON: `{ name, description, image, external_url,
  attributes[] }`. `tokenId === parcelId` for the Polygon parcels collection, so metadata is derived
  live from that parcel (Continent, Zone, Size, Designed y/n, status). Estate tokens carry
  Chain=Ethereum + (when resolvable) the estate's fortification name.
- **`image` = `GET /nft/<contract>/<tokenId>/image`** → the parcel's live design **thumbnail** PNG;
  **falls back to the EtherFantasy logo** placeholder when the parcel isn't designed yet
  (`map-service/assets/ef-logo-512.png`). So the image updates itself as land gets designed.
- `external_url` deep-links the 3D designer view of that parcel.
- CORS `*`, cached 120s (metadata) / 300s (thumb) / 3600s (logo). No auth (public).

Example: `https://map.etherfantasy.com/nft/0x383fb8793294d82b3c20bf04c10f4b9b9cb2aca7/60314880213`
