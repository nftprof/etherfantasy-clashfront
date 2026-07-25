# Land contracts, claim mechanism, metadata repoint & selling remaining supply

All values below were **read live on-chain** (Ethereum + Polygon mainnet) via the Infura key committed
in `cryptoverse-scripts-python/app/check_loaded_tokens.py`, 2026-07. Names: EtherFantasy Land =
Hexagon City = Cryptoverse (`CVIP_ESTATE` / `CVIP_PARCEL`).

## 1. The contracts (verified live)

| role | chain | address | notes |
|---|---|---|---|
| **Estate NFT (L2)** `CVIP_ESTATE` | Ethereum (1) | `0x28cd2990f34db387d011d7cc693a2bcedd8dc654` | ERC-721 + AccessControl + Enumerable. **729 / 8,482 minted → 7,753 unclaimed** |
| **Parcel NFT (L3)** `CVIP_PARCEL` | Polygon (137) | `0x383fb8793294d82b3c20bf04c10f4b9b9cb2aca7` | **17,066 / 284,284 minted → 267,218 unclaimed** |
| **Estate Distributor** (claim/mint) | Ethereum (1) | `0xB488b04E5e804676e3ab085F0Fb9C3d9633b50F5` | holds MINTER_ROLE on estate NFT; free-mint **active** (`_mintingUsingTokenPaused=false`) |
| **Parcel Distributor** (claim/mint) | Polygon (137) | `0x411d4B953BA5A54462728C78E71108F913565265` | holds MINTER_ROLE on parcel NFT; free-mint **active** |

> Earlier notes called `0xB488…`/`0x411d…` "testnet/mock — ignore." **That was wrong** — they are the
> live land **distributor** contracts. Corrected.

## 2. Metadata repoint — who can do it, and how

Both NFTs currently return `tokenURI = https://api.cryptoverse.biz/metadata/<id>` — **dead**
(NXDOMAIN). Repoint by calling **`setBaseURI(string)`** on each NFT. The new base must **end with `/`**
(the contract appends the tokenId): e.g. `setBaseURI("https://api.etherfantasy.com/metadata/")`.

Access is **AccessControl, not Ownable** — `setBaseURI` requires `DEFAULT_ADMIN_ROLE`. **Current admin
holders (verified via `hasRole`):**

| NFT | DEFAULT_ADMIN_ROLE holders |
|---|---|
| Estate (ETH) `0x28cd…` | `0xAbb590532A0FA89F0DAB20f3C121712957A7976D`, `0x577B1abe38De35E41243EE14910dFfda313f6c11`, `0x18b15e6f1eD6cE9cf82Cfa0Cfe1C04b69ED41919` |
| Parcel (POL) `0x383f…` | `0x18b15e6f1eD6cE9cf82Cfa0Cfe1C04b69ED41919` |

**`0x18b15e6f1eD6cE9cf82Cfa0Cfe1C04b69ED41919` is admin on BOTH chains** — that's the wallet to sign the
two `setBaseURI` txns. (`0xAbb590…` is the CG commission vault; `0xA3398CF3…Cb76` was granted early then
**revoked** — no longer admin on the NFTs.)

⚠️ You own **hexagon.city**, but the stale base is **cryptoverse.biz** — DNS-forwarding the old host
only works if you also control `cryptoverse.biz`. Cleanest: `setBaseURI` to a domain you control
(api.etherfantasy.com or api.hexagon.city) and serve the new metadata there. The NFT also has
`getAttributes/updateAttributes(tokenId,uint256)` (on-chain attribute slot) and an `upgrade(address)`
pointer if you ever migrate logic.

## 3. Free minting: the LAND (claim) tokens

Users free-mint a land NFT by owning the matching size-specific "land token", then the distributor
`mintOne(tokenId,to)` / `mintMany(tokenId[],to)` (both **nonpayable**). Live token addresses:

**Estates (Ethereum), distributor `0xB488…` — own the token for that estate size:**
| size | claim token |
|---|---|
| EPIC | `0xe0A8F1Cb96a370E0736960e1B360c3d7e7f80280` |
| GIANT | `0xB27f33682418c52b1DCCA1300B4982e3F6945800` |
| LARGE | `0x2060599F7A1523B65b23aAC59570C8984e693D7a` |
| MEDIUM | `0xDCb620d7e340c11919d580f1959D0c770F53D23B` |
| SMALL | `0x7fa38443E5caEc9F8D9c3fC37CD1daE2A523d2f2` |
| (single) | `0x0` — n/a on Ethereum |

**Parcels (Polygon), distributor `0x411d…`:**
| size | claim token |
|---|---|
| SINGLE | `0x86ecd87a384D623f34230f283362948bf5904147` |

Distributor admin (controls `updateTokens`, `updatePrice`, `togglePause`, `withdrawAll`,
`withdrawWallet`): `0xAbb590…7976D` and `0x18b15e6f…1919` on both chains (`0x577B1abe…` also on ETH).
`withdrawWallet` = `0xA3398CF357C154B6abB5460427f6DC37aB36Cb76`. `tokenPrice = 1e18`.

## 4. Selling the REMAINING unclaimed supply, FCFS, in native ETH / POL

**Unclaimed today: 7,753 estates (ETH) + 267,218 parcels (POL).** The "unclaimed set" = every tokenId
in the snapshot whose `ownerOf` reverts (use the ownership indexer in `OWNERSHIP-DATA.md`).

**The existing distributor cannot do this:** `mintOne`/`mintMany` are **nonpayable**, and the only gate
is owning a claim token — there is **no native-currency public-sale path**. So a native FCFS sale needs
a **new sale-minter contract per chain**:

- `payable` `buy(uint256 tokenId)` / `buyMany(uint256[])` → `require(msg.value >= price[sizeOf(tokenId)])`,
  then call the NFT's `mint(buyer, tokenId)` (the NFT exposes `mint(address,uint256)` gated by
  `MINTER_ROLE`). ERC-721's built-in duplicate guard makes it **naturally FCFS** — a second buyer of the
  same tokenId reverts.
- A `DEFAULT_ADMIN_ROLE` holder (`0x18b15e6f…1919`) grants the new sale contract `MINTER_ROLE` on the
  NFT (`grantRole(MINTER_ROLE, saleContract)`). No change to the NFT itself.
- It **coexists** with the free-claim distributor (both just call `mint`). If you don't want a tokenId to
  be both free-claimable and for-sale, either reserve claim-token holders' ids or `togglePause(true)` the
  free path.
- Price per size in native (ETH on mainnet, POL on Polygon); `withdraw` to treasury. Optional expiry /
  allowlist.
- **L1 gas caveat:** estates are on Ethereum — each mint is an L1 tx (buyer pays gas). Fine for
  higher-value estates; for 267k Polygon parcels gas is negligible.

This is net-new but small (a ~100-line minter + MINTER_ROLE grant). It is independent of the
buy/sell **secondary** marketplace decision in `MARKETPLACE-SOURCE.md` (that's for reselling already-
owned land; this is primary issuance of unclaimed supply).

## 5. ⚠️ Snapshot correction + a coverage gap (both found via this on-chain check)

- **L3 token-id encoding was wrong and is now fixed.** On-chain parcel ids use the **parent estate's
  size digit**, not `6`: `L3 tokenId = parentEstateSizeDigit(1) + zoneCode(2) + parentIndex(4) +
  subIndex(4)` (e.g. `20912230228` = GIANT·UW1·#1223·#228). All 284,314 L3 ids in `l3/*.json` were
  regenerated (old value kept as `tokenIdOld`; `parentSizeClass` added); validated 20/20 against live
  `ownerOf`. **L2 estate ids were already correct.**
- **CGI and KOL zones exist on-chain but have NO map geometry.** Sampled minted estates include
  `50800xx` (KOL) and `50100xx` (CGI) — zones present in the id encoding but with no SVG in the map
  (the map covers 10 zones: BUS EDU ENT HS1 HS2 HS3 HUB UW1 UW2 UW3). So a slice of sellable land can't
  be rendered on the current map. Decide whether CGI/KOL are in scope; if so, their geometry must be
  sourced separately (not in `_archive-cryptoverse-frontend`).
