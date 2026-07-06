# Maps ↔ CF overworld economy seam (invest + ownership + payout)

> For the CF overworld dev. Everything on the maps side is DEPLOYED on both boxes and tested —
> these are the three hooks, in the order you'll likely wire them. Coordinates are center-origin
> in the fixed ±161 world-unit frame (sizeM 322; canon ratified 2026-07-08, your bfe108e —
> ~0.74 m/unit is a label, never a runtime transform).
>
> WHERE THIS FILE LIVES (sessions have different roots — use whichever you can reach):
>   repo  https://github.com/blockchainsuperheroes/etherfantasy-browser-moba-game · main ·
>         server/maps/ECONOMY-SEAM.md
>   local C:\Users\ADMIN\Desktop\EF Moba\server\maps\ECONOMY-SEAM.md
>   boxes /home/ubuntu/ef-moba-server/maps/ECONOMY-SEAM.md  (13.250.39.41 = the box CF runs on,
>         and 3.98.68.96)

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
