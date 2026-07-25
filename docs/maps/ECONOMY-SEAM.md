# Maps ↔ CF overworld economy seam (invest + ownership + payout)

> For the CF overworld dev. Everything on the maps side is DEPLOYED on both boxes and tested —
> these are the three hooks, in the order you'll likely wire them. Coordinates are center-origin
> in the fixed ±161 world-unit frame (sizeM 322; canon ratified 2026-07-08, your bfe108e —
> ~0.74 m/unit is a label, never a runtime transform).
>
> ⚠ MIRROR for the CF sessions (this repo can't reach the moba repo). CANONICAL lives at
>   github.com/blockchainsuperheroes/etherfantasy-browser-moba-game · main · server/maps/ECONOMY-SEAM.md
>   (also deployed on the box you run on: /home/ubuntu/ef-moba-server/maps/ECONOMY-SEAM.md @ 13.250.39.41).
> Mirrored at moba commit bcdb017 (2026-07-08) — if in doubt, the box copy is always current.

## 1. Ownership feed → "only the owner designs their land"

Expose ANY url returning either shape (canonical PG usernames, case-insensitive):

```jsonc
{ "owners": { "60203370020": "nftprof", … } }      // map form
[ { "parcelId": "60203370020", "owner": "nftprof" }, … ]  // or array form
```

Then on the game box: `echo '<your url>' > ~/.ef_maps_owners_url` + `pm2 restart ef-moba-lobby`.
Behavior (already live, unit-tested `editDecision`):
- parcel in the feed + signed-in user ≠ owner → **403** "this land belongs to X" on
  prompt / regenerate / freeze. Owner or admin → allowed.
- parcel NOT in the feed (unowned/wild) → any signed-in account may design (testing default —
  tell us if wild land should become admin-only instead).
- viewing (GET designs / thumbnails / parcels) stays public regardless.
- feed is polled with a 5-min cache; a transient outage keeps the last snapshot.

## 2. Invest flow → "landowner CT raises the map budget"

You charge the CT (economy is yours); then tell the registry the parcel's new tier:

```
POST https://moba.etherfantasy.com/internal/v1/designs/<parcelId>/invest
Headers: content-type: application/json · x-maps-key: <read ~/.ef_maps_key on this box>
Body:    { "level": 0..5 }
→ 200 { ok, row, budget }   (idempotent — setting the same level twice is a no-op)
```

- The key lives at `~/.ef_maps_key` on the game box (same box your server runs on — read it
  directly, it never needs to travel). Same value on the Montreal box.
- Tiers (caps enforced on every future generation, incl. LLM prompts — the model is told the
  budget AND clamped to it): 0 Untamed (2 nodes · 40% richness · 1 camp · 0 towers) → 2 Developed
  (4 · 70% · 3 · 2 · landmark unlocked) → 5 Golden (8 · 100% · 6 · 6). Full table:
  `server/maps/schema.js INVEST_TIERS`.
- Tier persists across redesigns and takes effect on the parcel's NEXT design version; battles
  always load `current.json`, so it's live the next time anyone fights there. Suggested UX:
  after a successful invest, trigger a regenerate (owner prompt or plain
  `POST …/regenerate {byOwner:true}` with the same key) so the richer map exists immediately.
- Downgrades (raids? decay?) work the same way — `level` is absolute, not additive.

## 3. Landowner passive income → "CT split when units die on my land"

No maps-side work: the battle result callback already reports **casualties per side per
UnitClass + structure damage per anchor + duration**. Your settlement code computes the
landowner's cut from those. If you want a per-battle "land fee" line item, that's also purely
overworld accounting.

## Not in scope here
- The designer's "invest" button UX (currently says "coming soon — invest in Clash Front"):
  point it at your overworld flow whenever it exists; the designer re-reads the budget on every
  load so tier changes show up immediately.
- bfpreview / true-render underlays: game-dev OP 48 (`CLIENT_BATTLEFIELD_LOADER.md`).

## NFT ownership wired (owner 2026-07-21) — REAL on-chain land gating

The map designer now gates editing on **real NFT ownership** via the PG NFT-data API (base
`https://nft-data.pentagon.games`), replacing the game-only land-owners feed as the authority:
- **PARCELS (Polygon)** `0x383fb8793294d82b3c20bf04c10f4b9b9cb2aca7` — `tokenId === parcelId`
  (verified in the l3 snapshot), so a wallet's owned tokenIds ARE its editable parcelIds.
- **ESTATE (Ethereum)** `0x28cd2990f34db387d011d7cc693a2bcedd8dc654` — the L2 estate tokens.
- Query form: `GET /api/v1/collection/<contract>/items?owner=<wallet>&page&limit`.
- Wallet = the PG login's `mm_address` (captured in auth.normaliseProfile). `maps/nftowners.js`
  fetches per-wallet (cached 2 min, injectable fetch for tests). Server: `GET /internal/v1/my-land`
  → the connected wallet's parcels + estates; the edit gate (`editGate`) allows admin OR the wallet
  that owns the parcel; `MAPS_STRICT_NFT=1` makes NFT ownership the ONLY path (default OFF = keep the
  testing fallback). Client: after login the designer pulls `/my-land`, rings the owned parcels in
  white and shows "you own N parcels on-chain + M estates". +4 tests (`nftowners.test.js`).
- **Still open:** blocking edits to land owned by *someone else* needs the full parcelId→owner map
  (the API is wallet-scoped; a per-token or bulk-owner endpoint, or a periodic crawl, would let the
  gate deny non-owners in the default mode too). Direct on-chain `ownerOf/balanceOf` via the user's
  web3 provider is a future client add (owner noted it as an option).
