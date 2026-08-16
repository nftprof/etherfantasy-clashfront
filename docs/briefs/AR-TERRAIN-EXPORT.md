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

## ⚠ CRITICAL: a GLB has NO lights/sky/fog — you MUST supply the descriptor lighting

The #1 reason a terrain "looks nothing like the designer": a GLB is **geometry + baked
vertex-colors + textures ONLY**. The designer's look is ~60% its sky + light rig + fog + glow,
and **none of that is in the mesh**. Render the same candy.glb with a dark-grey background and it
looks dead; render it with the descriptor's pink sky + warm sun and it looks like the designer —
same bytes. So the AR renderer MUST apply `descriptor.lighting`:
- `scene.background` = `lighting.sky`; `scene.fog` = `lighting.fog`
- one `HemisphereLight(sky, fog, ~0.95)` + one `DirectionalLight(sun.color, sun.intensity)` aimed
  along `-sun.dir`
- enable `outputEncoding = sRGBEncoding`
Reference renders of every terrain lit exactly this way are committed next to each asset as
`<id>.preview.png` (also served at `/clash-lands/terrains/<id>.preview.png`) — match that and you
match the designer.

## v2 (2026-08-09) — export now KEEPS designed identity props + Ethermon AR rendering review

**Fix:** the first export stripped ALL props, so `candy.glb` was terrain+castle with no candy
elements (read as "cotton floor", not candy land). v2 keeps the DESIGNED props (candy lollipops/
canes/gumdrops/swirl trees, forest trees, rocks) — the identity — while still dropping only the
heavy random scatter (grass/flowers), HUD markers, and floating sky dressing (AR composites its
own sky). Detail geometry that ballooned tris (lollipop spiral rings, cane stripe rings, swirl
tori) is simplified to the base shapes in export, and props are subsampled to ~¼ for the budget.
Result: candy now renders as a full pink castle + lollipops/canes/gumdrops/swirl-trees over the
cotton floor with the soda river — validated by a standalone GLTFLoader round-trip. Tris (all
≤60k): castle 25.7k / candy 56.6k / lava 35.4k / water 25.8k / flat 6.5k.

### Ethermon AR rendering review (owner asked CF to review the AR project's rendering)

From the AR screenshots, the arena/castle is grey untextured placeholder geometry and the candy
world is spheres-on-sticks — i.e. the AR game is NOT yet loading these GLBs. To match the CF look:
1. **Load the terrain GLB** for the scene (`/clash-lands/terrains/<id>.glb`) instead of the local
   grey blocks — it carries baked vertex colours + materials, so it renders correctly with a
   simple hemisphere + directional light (no textures required beyond the floor).
2. **Use the descriptor's `lighting`** (`sky`/`fog`/`sun.dir`/`ambient`) so tint/direction match
   the designer; the GLB's per-vertex colour does the rest. Flat MeshLambert/Standard is fine.
3. **Apply `groundY` + `spawnBounds`** to place pets on the floor and inside the play area; use
   `walls[].polyline` (castle) as arena bounds / no-go, and `liquid.surfaceY`/`deepY` for the
   water/lava plane + hazard pockets.
4. **Scale:** GLBs are 1 unit = 1 m, origin-centered, ~322 m across. For an AR tabletop, scale the
   whole terrain group uniformly (e.g. ×0.03 for a ~10 m room) — pets scale with it.
5. **Draw calls:** castle/candy import as many small meshes — static-batch by material on import
   for mobile framerate (tris are already in budget).

## Castle gates — they ARE open (outer wall has 3), how to keep them open for the-wild

The castle (`castle.glb`, source v23 siege-test) has an outer curtain wall with **3 gates** and an
inner wall with **2** — confirmed in `castle.json → walls[].gates` (outer = `walls[0]`, `"outer":true`).
The wall MESH is physically clipped open at each gate and the wooden leaves are drawn **swung open**,
so each archway stands open in the GLB. They look subtle from a distance (each opening ≈ **11 m** in
a ~140 m ring), which is why "it seems not" to have gates — but they're there.

**For Ethermon AR's the-wild (pets walk in and out), keep the gates open:**
1. Do NOT rebuild the wall as a solid loop. Build pet collision from `walls[].polyline`, then
   **subtract an `openWidthM` (≈11 m) gap centred on each `gates[].at`** — that's exactly where the
   mesh has no wall. `gates[].state` is `"OPEN"`; there is no door collider in the GLB to remove.
2. If you want the pets funnelled, treat each gate `at` as a waypoint/portal between "outside" and
   "inside the ward"; the outer ring's 3 gates are the outer world↔bailey passages.
3. Want WIDER gates for easy pet flow? Ask CF to re-export the castle with a bigger gate radius —
   it's a one-number change on our side (`GATE_R`), then the mesh opening + `openWidthM` both grow.
The `gatesNote` field in every castle descriptor restates rule 1 inline.
