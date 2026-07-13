# Battlefield Render Parity — making a generated parcel look like the real game

**Question from the map-gen team:** the LLM map generator produces a good *artifact* (terrain
codes + placements) but it "doesn't look like the final playable map." What's the missing piece,
and can we get a backend converter that makes it game-ready?

**Answer:** the generator produces *map logic*. The live map's *look* comes from ~8 render layers
that the artifact doesn't describe — they're synthesized by the client at match start. The gap is
not "more art," it's **deriving those layers from the grid**. That derivation is deterministic, so
it belongs in a cacheable backend step: **`tools/battlefield_converter.cjs`** (shipped, self-tested)
turns an artifact into an **engine-ready render manifest** the renderer draws 1:1.

## Why the raw artifact looks flat — the 8 layers it's missing

Grounded in the live builder (`index.html`, ~L1450–1740). The artifact gives cells + placements;
the live map additionally has:

1. **A heightfield.** The live ground mesh is *draped* on `heightAt()` (rolling hills, raised rims,
   rocky summits). A flat 2-D code grid reads as cardboard. → converter **synthesizes** a heightfield
   from noise + code deltas (CLIFF/ROCK raise, WATER dips) and ships it as a `w×h` u8 grid.
2. **Biome material set.** Palette must resolve to a real *floor texture* (`floors/*.png`, tiled
   23×25 with a slight rotation), dry/wet tint, fog tint, and a water mode (water/lava/ice). The
   client only hard-codes 4 biomes; the converter maps all 8 palettes (volcanic→lava, tundra→ice…).
3. **Baked ground colour + sun-pool glow.** The live ground has per-vertex dirt/meadow/rock splotches
   plus one radial warm-centre→cool-edge overlay. This is procedural and reused as-is over the
   synthesized height — no artifact data needed, but it must be *applied* (the loader step).
4. **Worn lane ribbons.** Catmull-Rom trodden-trail ribbons (meander, width wobble, alpha-faded ends)
   through the lane waypoints. → converter passes `lanes[]`; loader calls the existing `laneRibbon()`.
5. **Layered trees, not flat cones.** FOREST cells → instanced low-poly pines (trunk + 2 foliage
   cones, per-tree HSL variation from the palette), terrain-draped. → converter emits `trees[]`
   (x,z,y,scale,hsl); décor `obstacles[]` fold in, landmarks flagged.
6. **Rock ridges/clusters.** ROCK/CLIFF cells → dodecahedron rock clusters (also the choke walls).
   → converter emits `rocks[]`.
7. **Ground scatter.** Seeded instanced grass tufts / flowers / bushes on OPEN cells, with keep-outs
   around structures + fountains. → converter emits `scatter.{grass,flower,bush}` (deterministic).
8. **Structure furniture + fountains.** Stone-pedestal towers, spawn-circle fountain discs, base
   cores, build pads, worn ground under them. → converter resolves `towers[]` (from `structures[]`),
   `fountains[]` (from `spawnZones[].canBase`), `buildSpots[]`, `resources[]`, `mobs[]`.

Plus one correctness item unique to generated parcels:

9. **Arena cut-out.** The built-in map is a full square; a generated parcel can be a polygon. `OOB`
   cells / `arena.bounds` must clip the ground so you don't see terrain outside the parcel. →
   converter ships `arena.bounds` + an `oob` mask for the loader to stencil/clip.

## The converter — `tools/battlefield_converter.cjs`

Dependency-free Node (CommonJS `.cjs` because the repo is ESM). Deterministic and **immutable per
`designVersion`** → compute once, cache forever.

```
const { convert } = require('./tools/battlefield_converter.cjs');
const manifest = convert(artifact, { parcelId, designVersion });
// CLI:  node tools/battlefield_converter.cjs artifact.json PARCEL-123 > manifest.json
//       node tools/battlefield_converter.cjs --selftest
```

**Coordinate canon (no rescale):** center origin · x east · +z north · fixed **±161** frame ·
`cellM 2`. The artifact is already in these world units (the live map's ±115·MAPK(1.4)=±161), so the
converter does **not** multiply by MAPK. It warns if `arena.half` differs from ±161.

### Manifest output (what the client renders)

```jsonc
{
  "schema":"ef-battlefield-manifest/1", "parcelId", "designVersion", "seed", "modes",
  "arena": { "shape", "sizeM", "half", "bounds":[[x,z]…] },   // bounds = clip polygon
  "grid":  { "w", "h", "cellM" },
  "biome": { "key":"meadow|jungle|desert|wetland", "palette", "floor":"grass_01",
             "dry":0x…, "wet":0x…, "fog":0x…, "water":"water|lava|ice" },
  "height":{ "w","h","hMin","hMax","data":"<b64 u8>" },       // worldY = hMin + u8/255*(hMax-hMin), bilinear
  "masks": { "walk","oob","water","road":"<b64 u8 per cell>" },
  "trees": [ { "x","z","y","s","hsl":[h,s,l], "landmark?" } ],
  "rocks": [ { "x","z","y","s" } ],
  "scatter":{ "grass":[…], "flower":[…], "bush":[…] },
  "lanes": [ [[x,z]…] ],
  "fountains":[{ "side","x","z" }], "towers":[{ "side","x","z","hpMax" }],
  "resources":[{ "kind","x","z","y","richness" }], "mobs":[…], "buildSpots":[…], "spawnZones":[…],
  "counts":{…}, "camera":{ "orbitCenter":[0,0], "radius" }, "warnings":[…]
}
```

Caps (perf-safe instancing): trees ≤700, rocks ≤400, grass ≤1400, flower ≤400, bush ≤260.

## Client wiring (the `?bfpreview=` loader — small, unbuilt)

The manifest is designed so the loader is thin and reuses existing builders:

1. `fetch` artifact → `convert()` (or fetch a pre-converted manifest from the backend cache).
2. `setBiome`-style apply: set `ground.material.map = floors/<biome.floor>.png`, dry/wet/fog tints,
   swap water material to lava/ice per `biome.water`.
3. Build ground plane from `height` (drape Y by bilinear-sampling `data`); keep the existing
   vertex-colour splotch bake + radial `groundGlow`. Clip to `arena.bounds` / `oob` mask.
4. `lanes[]` → `laneRibbon()` (unchanged).
5. Instance `trees[]`/`rocks[]`/`scatter.*` (reuse the pine/rock/tuft meshes; use `hsl` per tree).
6. Stamp `fountains[]`/`towers[]`/`resources[]`/`mobs[]`/`buildSpots[]` with the existing
   `mkTower`/fountain-disc/mine builders. **Towers/CC in a live match still arrive as net units on
   `buildSpots` anchors** (per `CLIENT-BATTLEFIELD-LOADER.md`) — bake them only for the static preview.
7. **Movement parity:** own-hero client prediction must gate on `masks.walk` exactly like the server
   (`server/maps/loader.js blockedAt`) or it rubber-bands. Minions/AI follow `lanes[]` server-side.

Deliverable tiers (unchanged from the TLDR): **(1) static `?bfpreview=<id>` orbit render** — the
VC-facing "this is the actual game" view; **(2) hero walk mode (M2)** gated on `masks.walk`.

## Boundary / ownership
- **Map-gen + server** own the artifact and `GET /internal/v1/designs/:id`. Unchanged.
- **This (client) session** owns the converter + the `?bfpreview=` loader.
- The converter can run **either** backend (cache the manifest next to `thumb.png`) **or** client
  (call `convert()` on the fetched artifact). Backend is preferred for caching + a thin client.

See also `CLIENT-BATTLEFIELD-LOADER.md` (movement-parity M2 handoff).
