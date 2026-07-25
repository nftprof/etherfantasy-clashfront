# Getting REAL on-chain land ownership (for the map designer)

The designer is right: its `owner`/`minted` flags come from CF's `/api/land-owners` (game-side player
bindings), not the chain. This document closes that gap.

## Which of the three proposed options actually work

| option | verdict |
|---|---|
| 1. Collection contract → query holders | ✅ **viable — do this** |
| 2. Holder export from `api.hexagon.city` | ❌ **dead.** Probed directly: `api.hexagon.city/land/*` and `/metadata/*` return **404**, `map.hexagon.city` returns **404**, `api.cryptoverse.biz` is **NXDOMAIN**. The entire legacy API is decommissioned. |
| 3. `pg-nft-data` override service crawling holders | ✅ likely best if it already crawls — free alongside metadata |

**Plus a 4th option nobody listed: the DB backup.** The old MongoDB backup (see
`BACKUP-RECOVERY-BRIEF.md`) has an **`owner` field on every `lands` document** — an instant
wallet↔tokenId map for all ~292k tokens, no chain calls. It's stale (as of backup date) but it is the
fastest way to a full baseline; then reconcile against chain for current truth.

## ✅ Contract addresses — CONFIRMED by the project owner

> Naming note: **Hexagon City / Cryptoverse is now "EtherFantasy Land"** — same collections, same
> token ids, same map. Treat all three names as the same asset.

| layer | chain | contract | contents |
|---|---|---|---|
| **Estates (L2)** | Ethereum (chainId **1**) | **`0x28cd2990f34db387d011d7cc693a2bcedd8dc654`** | SMALL → EPIC estates (8,482 tokens) |
| **Parcels (L3)** | Polygon (chainId **137**) | **`0x383fb8793294d82b3c20bf04c10f4b9b9cb2aca7`** | SINGLE parcels (284,284 tokens) |

These are the live collections behind OpenSea `hexagoncity` (Ethereum) and `hexagoncity-527508635`
(Polygon).

Two other repo addresses ARE live and useful (not mock): the **land distributor** contracts
`0xB488b04E…50F5` (ETH) / `0x411d4B95…5265` (Polygon) — these mint/claim land and hold MINTER_ROLE.
See `LAND-CONTRACTS-AND-SALE.md`. Genuinely testnet/mock (ignore): `0x97DE6ec3…cfcDE` /
`0x5BCEfFc5…12672` (brownie `deploy.py`), `0xC438b9F1…041c` (`deploy_custom()`), and `ExampleNFT.sol`.

**Verified live** (2026-07, via the Infura key committed in `check_loaded_tokens.py`): estate NFT
`0x28cd…` = `CVIP_ESTATE`, **729/8,482 minted**; parcel NFT `0x383f…` = `CVIP_PARCEL`,
**17,066/284,284 minted**. So most land is unminted — `minted` status must come from chain, and the
unminted set is exactly the primary-sale inventory (`LAND-CONTRACTS-AND-SALE.md §4`).

## How to build the holder map (don't brute-force it)

`ownerOf(tokenId)` per token = **292,766 RPC calls** (8,482 estates + 284,284 parcels). Avoid. Options,
best first:

1. **Provider NFT API** — e.g. Alchemy `getOwnersForContract` / `getOwnersForCollection`, or Reservoir
   `/owners/v2`. One paginated call set per collection → full `{tokenId: owner}` map. Simplest.
2. **Transfer-event replay** — index ERC-721 `Transfer(address,address,uint256)`
   (topic `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`) from the mint block to
   head; last transfer per tokenId = current owner. **This is exactly what the legacy system did** —
   see `cryptoverse-scripts-python/app/estate_sync.py` (Ethereum) and `parcel_sync.py` (Polygon), which
   pulled these via Covalent and wrote `lands.owner` + `last_blocks` for resumable sync. That code is a
   working reference implementation.
3. **`ownerOf` multicall** — batch via Multicall3 if you must go direct. Still heavy for 284k.

Two chains: estates on **Ethereum (1)**, parcels on **Polygon (137)** — you need an indexer per chain.

## Joining to the map snapshot

`tokenId` in `parcels-l2.json` / `l3/<ZONE>.json` is the **on-chain token id** — join directly to
`ownerOf` results, no translation. Encoding: L2 = `size(1)+zone(2)+index(4)`;
L3 = `parentEstateSizeDigit(1)+zone(2)+parent(4)+sub(4)` (parent estate's size digit, NOT 6 — verified on-chain; see LAND-CONTRACTS-AND-SALE.md §5).

Then the designer's semantics become accurate:
- `minted` = tokenId exists on-chain (`ownerOf` doesn't revert) — **not** "appears in the CF feed".
- `owner` = the actual wallet.
- CF's `/api/land-owners` stays as a **separate** layer: wallet → PG player binding. Keep the two
  distinct — a real holder who never logged into CF must read as *minted + owned*, just *unbound*.

Suggested shape for the feed the designer already consumes (`MAPS_OWNERS_URL`):
```json
{ "<tokenId>": { "owner": "0x…", "minted": true, "player": "pgUsername|null", "chainId": 1 } }
```
so one feed carries both on-chain truth and game binding without conflating them.

## Caveat on "claimed" land
If "claimed lands" are being represented by **new tokens on Pentagon Chain** rather than the existing
ETH/Polygon NFTs, then the legacy contracts above are only historical provenance and ownership should
come from the new contract instead. Resolve this before building the indexer — see
`MARKETPLACE-SOURCE.md`.
