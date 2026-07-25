# Where the land MARKETPLACE source actually lives

**Correction to a standing finding.** A previous session concluded: *"the real land NFT marketplace
lives at map.hexagon.city, whose codebase has never been in any of my in-scope repos — I don't have
the marketplace source to fork."* **That is not correct.**

`map.hexagon.city` was only a **deployment host**, not a codebase. The marketplace source exists and
is identified below. (This is the same trap that earlier blocked the map extraction, where
`hexagone-city-website` — a Next.js marketing/MATIC-staking site with only `StakingContract.abi.json`
+ `erc20.abi.json` — was mistaken for the map app. It isn't; that observation was right, the
conclusion drawn from it was wrong.)

## The marketplace stack (4 layers, all in the org)

| layer | repo | what's there |
|---|---|---|
| **Frontend** | `blockchainsuperheroes/_archive-cryptoverse-frontend` | `pages/marketplace/[estate]/[slug].tsx`, plus `pages/land-map.tsx` / `pages/land-selector.tsx` and the Three.js map engine `vendors/LandMap/`. Same app served the map **and** the marketplace. |
| **Backend API** | `blockchainsuperheroes/cryptoverse-backend-revamp` → `marketplace/` (Django app) | `models.py` (`Order`), `views.py` (incl. **server-side Web3 signature generation**), `serializers.py`, `urls.py`, `marketplace_abi.json` |
| **Contracts** | `blockchainsuperheroes/cg_marketplace_contract` and `cg_marketplace_contract_brownie` | the marketplace smart contracts |
| **Indexers / crons** | `cryptoverse-scripts-python` (`marketplace_sync.py`, `marketplace_events.py`, `*_new.py`), `cg-marketplace-sync-python`, `cg-marketplace-sync-sql`, `land-market-maker-cron`, `track-pending-tx-script` (`lock_parcel.py`, `lock_estate.py`) | order/transfer ingestion (Covalent), listing locks, market-maker |

**Land token claim:** `cryptoverse-scripts-python/app/land_distributor_abi.json` is the entry point for
the "claim tokens for your land" feature.

## Architecture (as built)

- **Signed-order marketplace**, not fully on-chain order books: the Django backend generates a Web3
  signature (`marketplace/views.py`) that the client submits to the marketplace contract.
- `Order` document (MongoDB collection `marketplace_orders`):
  `orderId, chainId, sender, recipient, type ("List" | "Offer"), marketplace, currency, symbol,
  askAmount, nftContract, tokenId, orderStatus ("OPEN"|"COMPLETED"|"CANCELED"...), expiryTime,
  createdAt, updatedAt, txhash, blockNumber`
- Endpoints: `GET /marketplace/assets` (paginated listings; filters `zone`, `land_type`, `chain_ids`,
  `order_by`, `filter=listed`), `GET /marketplace/estate/<token_id>`, `GET /marketplace/parcel/<token_id>`
  → asset + active order + `sale_history` + `offers` + `avg_price`.
- **Chains:** estates ERC-721 on **Ethereum (1)** `0x28cd2990f34db387d011d7cc693a2bcedd8dc654`;
  parcels ERC-721 on **Polygon (137)** `0x383FB8793294D82B3c20bf04c10f4B9B9cB2ACA7`.
- **Status: the legacy backend + DB are DEAD** (`api.cryptoverse.biz`, `api.hexagon.city/land/*`,
  `map.hexagon.city` all 404/NXDOMAIN). The NFTs themselves are still live on-chain and on OpenSea.

## RECOMMENDED: build on the CURRENT Pentagon stack (verified)

Do **not** resurrect the legacy marketplace. There is an actively maintained stack (all three repos
committed within days of each other, May 2026):

| repo | stack |
|---|---|
| `marketplace-v2-contract` | Foundry, Solidity 0.8.20, OZ v5 → `src/MarketplaceV2.sol` = `PentagonMarketplaceV2 is Ownable, ReentrancyGuard` (322 lines) |
| `products-pfpvault-backend` | NestJS 10 + TypeORM + **PostgreSQL**, ethers v5, socket.io |
| `products-pfpvault-frontend` | React 19 + Vite 6, **wagmi 2 / viem 2** |
| `products-marketplace` | **empty repo, no commits — ignore** |

**It is generic over any ERC-721.** The contract uses only `IERC721.ownerOf / isApprovedForAll /
safeTransferFrom` plus optional ERC-2981 royalties (`try/catch`, so collections without 2981 simply
get zero royalty). There is no PFP-specific logic; collections are gated purely by
`mapping(address => bool) whitelistedCollections`.

- **Design:** fully **on-chain order book** — no EIP-712/off-chain signed orders (unlike the legacy
  stack). Listing and cancelling each cost gas. Cheap on Pentagon; expensive if land stays on L1.
- **Structs:** `Listing{seller, collection, price, paymentToken, expiry}`,
  `CollectionBid{bidId, bidder, price, size, trait, paymentToken, collection, createdAt}`.
- **Functions:** `listNFTs` (batch), `cancelListing`, `buyNFT` (batch, payable), `placeBid`
  (collection-wide, with `size` + `trait`), `acceptBid` (partial fill by tokenIds), `cancelBid`,
  `whitelistCollection`, `setMarketplaceFee`, `withdrawFunds`.
- **Events:** `NFTListed, NFTListingCancelled, NFTSold, NFTBidPlaced, NFTBidAccepted, NFTBidCancelled,
  CollectionWhitelisted, MarketplaceFeeUpdated`.
- **Payments:** `paymentToken == address(0)` → native PC, else any ERC-20. **Bids are ERC-20-only** (WPC).
- **Fees:** per-collection bps (currently 250 = 2.5%), but note the **double-charge model** — buyer
  pays `price + fee`, seller receives `price - fee - royalty` ⇒ **~5% effective take**. Decide if
  that's right for land.
- **Backend is a pure read-side indexer + metadata service** — no write endpoints for listings/bids,
  no server-side signing. All writes go on-chain; listeners in `src/listener/*` catch up.

### Onboarding LAND requires NO code changes
The listeners are **DB-driven**, not hardcoded (`list-nft-listener.service.ts:36-58` loads
`contracts` where `type = MARKETPLACE`, joined to `chains`, and spins up a provider per row):
1. Owner calls `whitelistCollection(landAddress, true)` and `setMarketplaceFee(landAddress, bps)`.
2. `POST /admin/collections` with `{ name, creator, contractAddress, chainId, tokenUri }`.
3. Ensure `chains` + `contracts` rows exist so the listeners subscribe.
4. Sellers `setApprovalForAll`, then list.

**This is the hook for the NEW metadata:** metadata ingestion is generic —
`transfer-listener.service.ts:282` does `collection.tokenUri.replace('{id}', id)`. So point
`tokenUri` at the new metadata service (`https://…/metadata/{id}`) and the indexer picks up the new
traits automatically. (The per-collection metadata entities in the backend are vestigial/unused.)

### Chain support
`SUPPORTED_NETWORKS = [3344, 42161]` (Pentagon + Arbitrum); frontend resolves the marketplace address
**per connected chain** from the backend (`ContractAddressContext.tsx`) — nothing hardcoded. The
multi-chain seams are cut and the Arbitrum precedent proves the path. But the contract has **only ever
been deployed to Pentagon 3344** (`broadcast/` has only `3344/`). Supporting Ethereum 1 / Polygon 137
= deploy per chain + add DB rows + add chain to `wagmi.ts` and `SUPPORTED_NETWORKS`.

### ⚠️ Two blockers to resolve before building
1. **Repo ≠ production.** The README lists live V1 at `0xecC0ba6e…a76A` but
   `broadcast/Deploy.s.sol/3344/run-latest.json` records `0xd748a523…78cb`, and the README documents a
   **moderator role that does not exist in the committed source**. Verify deployed bytecode against a
   known commit before trusting the repo as source of truth.
2. **Auth bug:** the backend issues a JWT from an unsigned `{ walletAddress }` POST — no signature
   challenge, so anyone can mint a JWT for any address (`TokenContext.tsx:56-60`). Funds are safe
   (on-chain), but portfolio/cart/notifications are exposed. Fix with a sign-in-with-Ethereum challenge.

### Land-specific gaps (the real work)
- **No map/spatial UI exists** — the frontend is grid/table PFP-oriented. The map view is net-new
  (but you already have it at `map.etherfantasy.com` + the reference client in this repo).
- Traits are a flat `attributes: jsonb` + a string `trait` on bids — zone/estate grouping renders as
  generic traits.
- `MIN_BID` / `BID_INCREMENT` are **constants** (`0.01 ether`), not per-collection — high-value land
  inherits PFP-scale granularity.

## Guidance for the new public front end (map + NEW metadata + trading)

The goal — a public site that renders the map, serves **new** metadata, and lets users sell/trade
claimed land — decomposes into four pieces. Only the first is done:

1. **Map rendering** ✅ already built (`map.etherfantasy.com`) from `data/hexagon-city-source/`.
   Reference client: `data/hexagon-city-source/map-explorer-reference/`.
2. **Metadata service** — the new metadata needs a `tokenURI` target. Legacy pattern to copy:
   `cryptoverse-backend-revamp/cryptoverse/views.py` `GET /metadata/<token_id>` builds the OpenSea JSON
   (`name`, `image`, `description`, `attributes[]`) from the DB. Note: whoever mints/controls the token
   contract controls `tokenURI`; you cannot change metadata for the *existing* ETH/Polygon land NFTs
   unless their contract's base URI is still admin-settable.
3. **Order/listing backend + indexer** — port the `Order` model + `/marketplace/*` endpoints + the
   sync crons, OR use `products-pfpvault-backend`.
4. **Trading contract** — reuse `cg_marketplace_contract`, or adopt `marketplace-v2-contract`.

**Key decision to make first:** are the "claimed lands" being represented by the **existing**
Ethereum/Polygon land NFTs, or by **new tokens on Pentagon Chain**? If new tokens on Pentagon Chain,
build on `marketplace-v2-contract` + `products-pfpvault-*` and treat the legacy repos purely as
reference. If the existing NFTs, you need a multi-chain (ETH+Polygon) marketplace — which is what the
legacy stack already was.

## What to hand the other session
This file + `MAP-EXTRACTION-REPORT.md`, `POI-MODEL.md`, `BACKUP-RECOVERY-BRIEF.md`, and the repo list
above. The marketplace source is available to clone — it is not out of scope.
