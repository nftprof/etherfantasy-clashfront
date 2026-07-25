# Land mint UI — free-claim by size + direct-buy hook (owner 2026-07-21)

Let a wallet MINT unminted land. Contracts + config: `data/land-contracts.json`.

## The claim model (free-mint, live)
- Own the matching **SIZE token** → call the size-specific **distributor** `mintOne(tokenId, to)` /
  `mintMany([...tokenIds], to)` → the LAND NFT mints **free** (distributors hold MINTER_ROLE).
- Two distributors: **ETH estates** `0xB488…50F5`, **POL parcels** `0x411d…5265`.
- Six size tokens gate it: EPIC/GIANT/LARGE/MEDIUM/SMALL (ETH) + SINGLE (POL).

## The UI (owner: "like admin — VIEW all not-yet-minted; a wallet holding a size token sees + mints that size")
1. Connect wallet (MetaMask — already built).
2. Read the wallet's **size-token balances** (ERC-721 `balanceOf`, or the NFT-data API per size
   contract) → the sizes they can claim.
3. **Unminted explorer, gated by held size:** hold a LARGE token → see ALL unminted LARGE land; etc.
   - Estates (ETH): a filterable list/map of unminted estates of that size.
   - Parcels (POL, huge): the continent **dot map** with SOLD dots hidden — every remaining dot is
     clickable + mintable (reuse the designer's light dot-picker; colour by unminted/size).
4. Click a dot/row → `mintOne(tokenId, wallet)` on the size's distributor (or `mintMany` for a
   multi-select batch). Show tx state.
5. **Direct-buy hook (SOON):** leave a "Buy with ETH/POL" path per item — wired to the future
   payable sale-minter (`data/land-contracts.json.directSale`); FCFS via the ERC-721 duplicate guard.

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
