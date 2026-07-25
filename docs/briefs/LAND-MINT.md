# Land mint UI — free-claim by size + direct-buy hook (owner 2026-07-21)

Let a wallet MINT unminted land. Contracts + config: `data/land-contracts.json`.

## The claim model (free-mint, live)
- Own the matching **SIZE token** → call the size-specific **distributor** `mintOne(tokenId, to)` /
  `mintMany([...tokenIds], to)` → the LAND NFT mints **free** (distributors hold MINTER_ROLE).
- Two distributors: **ETH estates** `0xB488…50F5`, **POL parcels** `0x411d…5265`.
- Six size tokens gate it: EPIC/GIANT/LARGE/MEDIUM/SMALL (ETH) + SINGLE (POL).

## The UI (owner: "like admin — VIEW all not-yet-minted; a wallet holding a size token sees + mints that size") — ✅ BUILT 2026-07-25
Lives in the Land Designer (`map-service/maps/designer.html`) behind the **🪙 Mint land** topbar
button. Flow, as shipped:
1. Connect wallet (MetaMask — already built; the panel reuses `connWallet`).
2. **On-chain `balanceOf`** of each size token on the *current* network (Ethereum → the 5 estate
   sizes; Polygon → SINGLE). Only sizes with balance > 0 are enabled (admins see all). Chain-switch
   buttons (`wallet_switchEthereumChain`, auto-add Polygon) flip between the estate + parcel worlds.
3. **Unminted explorer, gated by held size** (server `GET /internal/v1/unminted`):
   - Estates (ETH): a checkbox list of unminted estates of that size (id · zone · subdivided flag).
   - Parcels (POL): the continent **dot canvas** — minted dots greyed, unminted teal + click-to-select,
     selected gold; per-zone dropdown.
4. Click a row/dot → **hand-rolled ABI** `mintOne(tokenId, wallet)` (single) or `mintMany([…], wallet)`
   (multi-select batch) on the size's distributor via `eth_sendTransaction`; tx hash + auto-refresh.
   Selectors are keccak-256 of the signatures in `data/land-contracts.json` (`mintOne`=`0xbd6056f7`,
   `mintMany`=`0x798c35b7`), verified against the known `balanceOf`/`transfer` selectors.
5. **Direct-buy hook (SOON):** a disabled "💳 Buy with ETH/POL (soon)" button is present, to be wired
   to the future payable sale-minter (`data/land-contracts.json.directSale`); FCFS via the ERC-721
   duplicate guard.

⚠ The mint calldata is encoded against the **documented** distributor signatures; verify against the
deployed ABI on a networked box before enabling real mints (the sandbox can't reach an RPC). If the
real signature differs, update `SEL`/`SIZE_TOKENS` in `designer.html` + `data/land-contracts.json`.

## Deriving the UNMINTED set
Unminted tokenId = `ownerOf` reverts. Practical: **all tokenIds (corrected L3 snapshot) − minted
(NFT-data API items for the collection)**. The NFT-data API lists minted items; the complement is
unminted. Server endpoint (to build): `GET /internal/v1/unminted?size=LARGE&zone=…` → the unminted
tokenIds of that size (+ their map dots for parcels).

## ⛔ BLOCKER (must resolve before minting goes live)
The mint call needs the **exact on-chain tokenId**. The L3 snapshot still uses the OLD `6…` scheme
(`parcelId===tokenId`); the real ids embed the **size digit** (e.g. `20912230228` = GIANT·UW1·#1223·
#228). **Minting on the old ids would mint the wrong token or revert.** Need the regenerated,
ownerOf-validated L3 (`tokenId` corrected + `tokenIdOld` kept) pushed to this branch. This same fix
unblocks the ALREADY-SHIPPED ownership + metadata features (they currently match on the wrong id).

## Gaps
- **CGI + KOL**: on-chain estates exist but no map geometry in the snapshot — their shapes need
  sourcing before they can be shown/minted on the map.
- Size→digit decode table is only partially known (GIANT=2 from the owner's example); the corrected
  snapshot is the source of truth — do NOT reconstruct ids by guessing the size digits.
