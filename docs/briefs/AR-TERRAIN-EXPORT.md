# 🕹→📱 AR Terrain Export — Clash Lands reuses CF maps (owner 2026-08-07)

The Clash Lands AR pet game reuses the environments the designer builds — castle, lava lake,
regular water, flat field, candy world — as GLB terrains. We don't share a repo but share the EF
server; CF drops built assets, the AR game fetches them.

## Where the AR game fetches (LIVE)

```
https://map.etherfantasy.com/clash-lands/terrains/manifest.json   → {version, terrains:[...]}
https://map.etherfantasy.com/clash-lands/terrains/<id>.glb
https://map.etherfantasy.com/clash-lands/terrains/<id>.json        (descriptor)
https://map.etherfantasy.com/clash-lands/terrains/<id>.height.png  (collision heightfield)
```
CORS-open, cached 1h. Served by map-service from `data/cf-maps/ar-terrains/`. (The AR game's
message named `pets.etherfantasy.com`; that box is not writable from CF, so we serve from the
map host instead — same shared EF server, reachable over HTTPS. If you prefer the pets host,
point an nginx alias there at these files.)

## Terrains shipped (v1)

| id | source | tris | walls | liquid | notes |
|---|---|---|---|---|---|
| castle | siege-test | ~25.7k | 2 rings + gates | water (moat) | real curtain walls, drum towers, keep |
| lava | AR-LAVA | ~35.4k | — | **lava** | volcanic field + lava lake |
| water | AR-WATER | ~25.8k | — | water | river + pond, road crossing |
| flat | AR-FLAT | ~6.5k | — | — | open MOBA-style field |
| candy | CANDYLAND | ~39.4k | 2 rings | water | pastel candy world (bonus) |

All ≤60k tris (mobile budget). GLBs validated by a standalone GLTFLoader round-trip (not our
renderer) — they load and render as portable assets.

## The `.json` descriptor (their contract)

```jsonc
{
  "id":"castle", "schema":"clash-lands-terrain/1", "units":"meters", "upAxis":"Y", "originCentered":true,
  "bounds":{ "min":[-161,-2.6,-161], "max":[161,3.5,161], "sizeM":322 },
  "groundY":-2.6, "heightScale":6.1,             // floorY = groundY + gray/255 * heightScale
  "height":{ "file":"castle.height.png","w":161,"h":161,"cellM":2 },
  "liquid":{ "type":"lava|water|ice", "surfaceY":…, "deepY":…, "crust":"shallow; small deep pockets" },
  "walls":[ { "ring":0,"height":16,"polyline":[[x,z]…],"gates":[{"at":[x,z]}…] } … ],
  "spawnBounds":{ "min":[-x,-z],"max":[x,z] },
  "lighting":{ "sky":"#…","fog":"#…","sun":{dir,color,intensity},"ambient":0.9 },
  "landmarks":[ { "kind":"castle","tier":"CASTLE","at":[x,z],"rings":2 } … ]
}
```
Coords: origin-centered, +z north, **1 unit = 1 m** (their message asked meters; scale uniformly
if the AR scene wants a different physical size). Liquid follows their PG safety rule — mostly a
shallow crust, only small deep/hot pockets bottom out at `deepY`; only non-fire pets react to lava
(that's the AR game's rule to enforce; the descriptor just marks `type` + geometry).

## How assets are (re)built (CF side)

```
node map-service/tools/build_ar_terrains.mjs      # source manifests + descriptors + height.pngs
# then, with map-service running + three/playwright deps available:
MAPS_BASE=http://127.0.0.1:8150 PW_DEPS=<node_modules with three> node map-service/tools/export_ar_glb.mjs
```
The GLB pass loads each terrain's designer scene in `?export=1` mode (scatter/props/markers
stripped, ground LOD via `?stride=`), then GLTFExports the built THREE scene. Renderer gained an
optional `opts.groundStride` (visual LOD; collision stays full-res in the height.png). Committed
assets ship via the map deploy.

## Known follow-ups / owner's roadmap

- **Draw calls:** castle/candy export as many small meshes (~700; each wall/tower/merlon a mesh).
  Tris are fine; the AR importer should static-batch by material for mobile. A merge pass on the
  CF side is possible if preferred.
- **Higher-fidelity water/flat** (their phase 2): add authored foliage/rocks back at a controlled
  budget, better water shader hints.
- **Iconic assets / routes / race tracks** (owner): over time export named landmarks (specific
  castles, the Diminishing Stair, ports), and lane/road polylines as flyable ROUTES — the
  descriptor already carries `walls`/`landmarks`; a `routes[]` field (from manifest `lanes`) is the
  next add for race-track / fly-through modes.
