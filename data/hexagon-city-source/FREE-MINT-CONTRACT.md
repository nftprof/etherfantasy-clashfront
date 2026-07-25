# Free parcel minting — status + new-contract guide

All checks below were run **live on-chain** (Polygon mainnet, 2026-07).

## 1. Can the existing CLAIM continue right now? — YES

The parcel distributor `0x411d4B953BA5A54462728C78E71108F913565265` is fully operational:

| check | result |
|---|---|
| distributor holds `MINTER_ROLE` on parcel NFT `0x383f…` | ✅ `true` |
| `_mintingUsingTokenPaused` | ✅ `false` (free-mint active) |
| `upgradedToAddress` | `0x0` (not superseded) |

So a user who holds the parcel claim token (`singleToken` = `0x86ecd87a384D623f34230f283362948bf5904147`)
can still `mintOne(tokenId,to)` / `mintMany(tokenId[],to)`. Same is true on Ethereum for estates
(distributor `0xB488…` has MINTER_ROLE, not paused).

## 2. Can the SAME admin authorize a new minter? — YES

On the parcel NFT, `getRoleAdmin(MINTER_ROLE) == DEFAULT_ADMIN_ROLE` (verified), and
**`0x18b15e6f1eD6cE9cf82Cfa0Cfe1C04b69ED41919` holds `DEFAULT_ADMIN_ROLE`** (the same wallet that can
repoint metadata). So that wallet grants a new contract mint rights with:

```solidity
// on parcel NFT 0x383f…, called by 0x18b15e6f…1919
grantRole(0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6, newMinter); // MINTER_ROLE
```
(For estates on Ethereum: any of `0xAbb590…7976D` / `0x577B1abe…6c11` / `0x18b15e6f…1919` can grant.)

## 3. New contract to let users MINT FREE parcels directly

### ⚠️ The one thing you must handle: the NFT does NOT validate token ids
Simulated against the live contract: a `MINTER_ROLE` holder can `mint(to, tokenId)` for **any**
uint256 — minting garbage id `999999999999` succeeds. The only built-in guard is ERC-721's
duplicate check (minting an already-minted id reverts → **FCFS is automatic**). So your contract must
itself restrict minting to **real, unclaimed** parcel ids, or users could mint nonsense tokens.

**Clean validator, already on-chain:** the distributor's `getTokenSize(tokenId)` returns the size code
for loaded parcels and **0 for anything else** (verified: real parcel → `6`, garbage → `0`). So:
`require(distributor.getTokenSize(tokenId) != 0)`. (Alternative: a Merkle root of the 284,284 parcel
ids from `l3/*.json` — fully self-contained, no dependency on the old distributor.)

### Drop-in contract (Polygon; adapt for estates on ETH)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IParcelNFT { function mint(address to, uint256 tokenId) external returns (bool); }
interface IDistributor { function getTokenSize(uint256 tokenId) external view returns (uint8); }

/// Free, first-come-first-served parcel minting for the existing CVIP_PARCEL collection.
/// Requires MINTER_ROLE on the parcel NFT (granted by its DEFAULT_ADMIN_ROLE holder).
contract ParcelFreeMint {
    IParcelNFT   public immutable nft;         // 0x383fB8793294D82B3c20bf04c10f4B9B9cB2ACA7
    IDistributor public immutable validator;   // 0x411d4B953BA5A54462728C78E71108F913565265 (getTokenSize)
    address public owner;
    bool    public paused;
    uint256 public perWalletLimit;             // 0 = unlimited
    mapping(address => uint256) public mintedBy;

    event Claimed(address indexed to, uint256 indexed tokenId);
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor(address _nft, address _validator, uint256 _perWalletLimit) {
        nft = IParcelNFT(_nft);
        validator = IDistributor(_validator);
        owner = msg.sender;
        perWalletLimit = _perWalletLimit;
    }

    function claim(uint256 tokenId) public {
        require(!paused, "paused");
        require(validator.getTokenSize(tokenId) != 0, "invalid parcel id"); // real, loaded parcel
        if (perWalletLimit != 0) {
            require(mintedBy[msg.sender] < perWalletLimit, "wallet limit");
            mintedBy[msg.sender] += 1;
        }
        require(nft.mint(msg.sender, tokenId), "mint failed"); // reverts if already minted => FCFS
        emit Claimed(msg.sender, tokenId);
    }

    function claimMany(uint256[] calldata ids) external {
        if (perWalletLimit != 0) {
            require(mintedBy[msg.sender] + ids.length <= perWalletLimit, "wallet limit");
        }
        for (uint256 i = 0; i < ids.length; i++) claim(ids[i]);
    }

    function setPaused(bool p) external onlyOwner { paused = p; }
    function setPerWalletLimit(uint256 n) external onlyOwner { perWalletLimit = n; }
    function transferOwnership(address o) external onlyOwner { owner = o; }
}
```

### Deploy & wire (Polygon)
1. Deploy `ParcelFreeMint(0x383fB8793294D82B3c20bf04c10f4B9B9cB2ACA7, 0x411d4B953BA5A54462728C78E71108F913565265, <perWalletLimit>)`.
2. From `0x18b15e6f…1919`: `parcelNFT.grantRole(MINTER_ROLE, parcelFreeMint)`.
3. Users call `claim(tokenId)` (front end supplies unclaimed ids from the map — those where `ownerOf` reverts).

### Notes / gotchas
- **Coexistence:** the old distributor keeps its own `tokenid_used` flag, which your contract does NOT
  update. Harmless — if a claim-token holder later runs `distributor.mintOne` on a parcel your contract
  already minted, the NFT reverts (already minted); just a failed tx. To avoid confusion, consider
  pausing the old free path (`togglePause(true)`) or the new one per campaign.
- **Estates (ETH):** same contract shape, with NFT `0x28cd…` and validator distributor `0xB488…`
  (`getTokenSize` → 1..5). Grant MINTER_ROLE from an ETH admin.
- **CGI/KOL:** `getTokenSize` will validate any *loaded* id including CGI/KOL estates that have no map
  geometry — fine on-chain, but your UI can't show them until their shapes are sourced.
- **Reduce trust in the old distributor:** if you prefer not to depend on it, replace the
  `getTokenSize` check with a Merkle proof against a root built from `l3/*.json` (all 284,284 ids).
- Verify `getTokenSize`'s exact return type in the ABI (`uint8` here) when you compile.
