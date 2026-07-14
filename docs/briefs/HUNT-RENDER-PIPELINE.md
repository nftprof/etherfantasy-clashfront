# EF Hunt — rendering the world with the ONE map pipeline (owner directive 2026-07-13)

> Owner: Hunt must reuse the maps — the LANDSCAPE version rendered by the same engine, with Hunt
> placing its structures/story on top. "It already knows its land; I now need to see it use your
> renders for everything."

## The good news: Hunt already has the renderer

Hunt lives in the MOBA repo — which is where `shared/ef_battlefield.js` (the nine-layer scene
builder) and `tools/battlefield_converter.cjs` were born. Hunt does NOT need a new engine; it needs
the **manifests** (the per-parcel render data) and the placement rules. The proven chain, now live
on the CF designer (`map.etherfantasy.com`, commit e556f22):

```
l3 snapshot row → worldParcel() → generate() → ARTIFACT        (CF map-service, deterministic)
ARTIFACT → battlefield_converter.cjs → MANIFEST                (render.v{N}.json, cached, immutable)
MANIFEST → EF_BATTLEFIELD.buildBattlefield(scene, {…})         (identical pixels in Hunt, CF, MOBA)
```

## How Hunt gets a parcel's landscape (two modes)

1. **Online (dev + low volume):** `GET https://map.etherfantasy.com/internal/v1/designs/<parcelId>/render.json`
   — lazily generates + caches server-side; floors at `/floors/<name>.png`. Zero Hunt-side codegen.
2. **Baked (production/scene sets):** run the bake on the CF checkout for the parcels a chapter
   needs, then bulk-copy `render.v*.json` out of the registry:
   `node map-service/tools/bake_zone.mjs <ZONE> --out <dir>` then request each `render.json` once
   (or `require('./maps/battlefield_converter.cjs').convert(artifact, {parcelId})` directly over the
   baked artifacts). Manifests are deterministic + immutable per designVersion — bake once, ship in
   Hunt's asset bundle.

## Rendering rules for Hunt (the landscape-first contract)

- Build the scene with `buildBattlefield(scene, { manifest, THREE, floorsBase, addLights, addFog })`.
  Set `addLights/addFog: false` if Hunt owns its own atmosphere (day/night, dungeons); the module
  then contributes terrain/props only.
- **Place EVERYTHING with `bf.heightAt(x,z)`** — quest structures, NPCs, camps, dungeon doors. Never
  raycast against your own copy of the ground; the returned sampler IS the terrain truth.
- **Hunt's structures/story go ON TOP** — the manifest is the landscape layer; Hunt adds its scene
  objects to the same THREE scene (or under `bf.group`'s parent) and never edits the manifest.
- **Scene anchors come from the shared overlay**: `data/world-elements/<ZONE>.hunt.json` (Hunt
  authors these — `WORLD-ELEMENTS-OVERLAY.md`). Anchor [x,z] → `bf.heightAt` → place the prefab.
  That's how the Undertow/Sluice/camps materialize in BOTH games from one data point.
- **The Diminution**: scale the CHARACTER + camera by `_meta.charScale[zone]`
  (`DIMINUTION-SCALE-SPEC.md`) — the manifest/terrain is NEVER scaled.
- **POI parcels = the scene anchors** for story beats (decision 22 heroParcels in
  `data/world-terrain/<ZONE>.json` castles) — the castle/gate/harbour parcels are where Hunt's
  set-piece scenes live, same parcels CF opens hero-mode battles on.
- Coordinate frame: manifest coords render AS three.js coords (x east, +z = grid north axis,
  centre origin, ±161). One convention, no flips — see the preview3d.html parity path as reference
  consumer #2.

## Which parcels for the Hunt storyline

The Hunt route (Tianxia → the deep): HUB city outskirts → the Shaft (HUB-SHAFT) → UW1 → UW2
Blackmere (Undertow/Sluice anchors already seeded) → the Vault-Gate → UW3 Luxuria. Every leg's
zone field is delivered (`data/world-terrain/`), so ANY parcel id along the route renders today —
pick scene parcels, and where a specific look is needed, the designer (map.etherfantasy.com) is the
authoring tool: iterate the prompt, FREEZE, and Hunt bakes that designVersion.

## Coming (do not build against yet)

- `ef-asset-pack/1` themed prop packs (`ASSET-PACKS-CT.md`) — manifest-embedded; Hunt renders them
  for free once the module upgrade lands (candy world etc., ⚙ CT-gated on CF land; Hunt story zones
  may use dev packs without the CT gate).
- Biome-driven scatter colours (module upgrade, tracked with MOBA BattleEngine RAW).
