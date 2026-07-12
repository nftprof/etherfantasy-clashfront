# Designer floor/border — it's OUR viewer + a stale deploy (not the map, not the MOBA repo)

> Agent D, 2026-07-11. Raised by the owner loading `map.etherfantasy.com/designer/3d?parcel=
> 60203370158` and seeing props (trees, spawn rings, lane dots) floating on a dark void — no ground
> floor, no parcel border. **Corrected finding below** supersedes the first draft that pointed this at
> the client team.

## What's actually true

1. **The map data is complete.** The CF parcel artifact is schema-identical to the reverse-engineered
   MOBA single-player artifact: same keys, `terrain` 161×161 (`cells`+`walk`), `arena.bounds` (the
   parcel polygon), `arena.sizeM`. Floor + border are 100% in the data. Nothing to fix map-side.

2. **The designer 3D viewer is OURS** — `map-service/maps/preview3d.html` (this repo, committed). It
   already **reuses the MOBA game's renderer verbatim**: `makeGrassTexture()` copied from the client's
   `index.html`, the game's hemisphere+sun lighting, and a **polygon-clipped grass floor** built from
   the artifact's OOB cells (an alpha mask → the parcel silhouette). So the "borrow the game's engine"
   step is already done; **we do NOT need the MOBA repo to render the floor.**

3. **The live site not showing the floor = a STALE DEPLOY.** The committed viewer draws a green
   polygon floor even with no `render.json` (it falls back to a flat-but-textured, silhouette-clipped
   ground). If the deployed page shows bare props, the box is running an older `map-service` build that
   predates the floor code. **Fix: redeploy the map service** — `deploy/remote-deploy-map.sh` (a pm2
   restart of `ef-map-service` on :8150; zero-dependency ESM, no build). Then hard-refresh.

## The one genuinely external piece (fidelity, not floor)

The viewer fetches `GET /internal/v1/designs/<id>/render.json` for a **3D heightfield** (hills). If it
404s (the case for generated parcels), the floor renders **flat but fully textured + clipped** — a
proper green parcel, just not hilly. That `render.json` converter (raster → heightfield mesh) is the
**engine team's `battlefield_converter.cjs`**, not CF scope. It's the difference between "flat green
parcel" and "single-player-grade rolling terrain" — a fidelity upgrade, not the floor/border fix.

## Two separate questions, two owners

| Surface | Owner | Status |
|---|---|---|
| `designer/3d` preview (map owner's "see what players see") | **Agent D — map-service** | floor/border code committed; needs a **map-service redeploy** |
| 3D heightfield in that preview (hills) | engine team (`render.json` converter) | optional fidelity; 404 → flat-textured fallback |
| the REAL in-game battle client (MOBA `index.html`) | OP48 / BattleEngine | confirm it renders polygon-parcel floors (it renders squares today) |

## Action

1. **Redeploy map-service on the box** (owner or a box-capable session): `bash deploy/remote-deploy-map.sh`
   → the designer immediately shows the green polygon floor + border for every parcel.
2. (Optional, engine team) point `battlefield_converter.cjs` at generated parcels so `render.json`
   exists → hills instead of flat.
3. (Client team) confirm the shipping battle client renders polygon-parcel floors, or shares the
   old square-only assumption.
