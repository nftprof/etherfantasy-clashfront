# Map Authoring Guide — how to ship a map that looks like the live MOBA map, first try

**Audience: the CF map-generator agent.** Read this end-to-end before generating another map.

## 0. The one-line diagnosis

> A map with **lanes + objects is ~30% finished.** The live map's good looks come from **nine
> render layers** that the client synthesises, each with numbers that were tuned by hand over many
> iterations. Generators keep shipping *map logic* and expecting it to look like *a map*.

Nobody wrote those numbers down — so every generated map arrives flat and then eats hours of polish.
This document is those numbers. Follow Part B literally and the map lands looking right on delivery.

---

## 1. CANON — never deviate

| Thing | Value |
|---|---|
| Frame | **±161 world units** (the live map is `±115 × MAPK`, `MAPK = 1.4`) → **322 × 322** |
| Origin | **centre**, `+z` = north, `+x` = east. No rescale on ingest. |
| Grid | `cellM = 2` → **161 × 161 cells** |
| Scale feel | 1 unit ≈ 0.74 m. A hero is ~5 units tall. |
| Camera | Perspective **FOV 50**, near 1, **far 500** |
| Blue side | SW corner. Red side | NE corner. (Diagonal symmetry, not mirror.) |

Anything outside ±161 is not walkable and not rendered.

---

## 2. PART A — LAYOUT (playability + readability)

These are the *structural* rules. Copy the proportions, not the literal coordinates.

### 2.1 Lanes — 3, and one is the diagonal
```
mid: [-72,-72] → [0,0]   → [72,72]      (the diagonal, corner to corner)
top: [-72,-60] → [-72,72] → [60,72]     (L-shaped, hugs the west then north edge)
bot: [-60,-72] → [72,-72] → [72,60]     (L-shaped, mirror of top)
```
(all × MAPK). **Mid is a straight diagonal; top/bot are L-shaped hugging the edges.** That's what
creates the two big triangular jungle pockets between them. Don't make three parallel lanes.

### 2.2 Chokes — ridges with gaps (this is what makes it a MOBA, not a field)
Rock ridge walls, each a line segment; a **gap in the middle** = the jungle path:
```
[[-52,-6],[-26,20]], [[-10,36],[16,62]]   ← upper-left jungle ridge (gap between the two)
[[-6,-52],[20,-26]], [[36,-10],[62,16]]   ← lower-right jungle ridge (gap between the two)
[[-86,-40],[-86,56]], [[86,-56],[86,40]]  ← west / east border ridges
[[-40,-86],[56,-86]], [[-56,86],[40,86]]  ← south / north border ridges
[[-100,0],[-84,0]], [[84,0],[100,0]]      ← corridor seals (start CLEAR of the lane)
[[0,-100],[0,-84]], [[0,84],[0,100]]
```
Rules that matter:
- **Border ridges** stop players strolling around the outside of the lanes.
- **Corridor seals** must start *clear of the lane* so units aren't pinched at towers.
- Gaps are the only jungle entrances → they become fight/ward points. **A map with no chokes plays
  like an open field and reads as empty.**

### 2.3 Structures
| Thing | Position | Notes |
|---|---|---|
| Cores (town halls) | `±82 × MAPK` (= ±114.8) | 2400 hp |
| Fountains | `±94 × MAPK` (= ±131.6) | behind the core; safe spawn |
| Towers (12, 6/side) | `(-40,-40) (-20,-20) (-72,-18) (-72,32) (-2,-72) (-44,-72)` ×MAPK, red mirrored | 1400 hp |

### 2.4 Elevation — **gentle**. This is the #1 thing generators get wrong.
```js
HILLS = [ {x:-38*MAPK, z: 38*MAPK, r:17*MAPK, h:4},
          {x: 38*MAPK, z:-38*MAPK, r:17*MAPK, h:4} ];
heightAt(x,z): for each hill, d=dist; if(d<r) y += h*0.5*(1+cos(PI*d/r));
```
**Two hills. Radius ~24. Max height 4 units on a 322-wide map.** That is *almost flat* — a soft
swell, not terrain. It exists to catch light and give a high-ground vision bonus (+15%), not to be
scenery. Generators that emit dramatic heightmaps produce lumpy, unreadable maps that also break
pathing. **Keep relief ≤ ~4 units and confine it to 1–3 soft domes.**

---

## 3. PART B — THE LOOK: nine layers, exact recipe

Ordered by visual impact. Miss layers 1–4 and no amount of props will save it.

### Layer 1 — Ground draped on the heightfield
Ground is a **deformed plane**, not a flat quad: every vertex gets `y = heightAt(x,z)`, then
`computeVertexNormals()`. Flat ground = cardboard, instantly.

### Layer 2 — A real photographic floor texture, tiled *wrong on purpose*
```js
t.wrapS = t.wrapT = RepeatWrapping;
t.repeat.set(23, 25);      // NON-SQUARE on purpose
t.center.set(0.5, 0.5);
t.rotation = 0.12;         // slight turn — breaks the visible grid
t.anisotropy = 8; t.encoding = sRGB;
```
The non-square repeat + 0.12 rad rotation is what kills the "tiled wallpaper" look. Use the real
files in `floors/` (`grass_01`, `grass_02`, `desert_01`, `desert_03`…). **Never a flat colour.**

### Layer 3 — Baked per-vertex colour splotches (the "hand-painted" feel)
Seeded value-noise, baked **once** into vertex colours (zero per-frame cost). It multiplies the map.
```js
big  = 0.62*noise(x, z, 82) + 0.38*noise(x+1500, z-900, 31);   // large blobs
fine = noise(x-700, z+400, 12);                                 // grain
dirt = smoothstep(0.30, 0.13, big);   // → mix toward (0.80, 0.70, 0.55)  warm worn earth
mead = smoothstep(0.64, 0.85, big);   // → mix toward (1.00, 1.06, 0.86) * 0.6  sun-bleached
// elevation read:
hN   = height / HILL_MAXH;
rim  = smoothstep(0.10, 0.50, hN) * 0.5;  // → (1.16, 1.13, 1.00) sun-catching slope rim
rock = smoothstep(0.45, 0.92, hN) * (0.4 + 0.6*noise(x+300, z-200, 9)); // → (0.93, 0.85, 0.77)
f    = 0.95 + fine*0.10;  // fine mottle, multiply rgb
```
This is the single biggest "why does theirs look good and mine doesn't" layer.

### Layer 4 — ONE radial ground-glow overlay (painterly lighting)
A single 256px canvas radial-gradient on a plane (`size 240*MAPK`, `y = 0.04`, transparent,
`depthWrite:false`, `renderOrder 0`):
```
0.00  rgba(255,244,214,0.16)   ← warm sun pool at map centre
0.32  rgba(255,240,205,0.05)
0.55  rgba(120,150,150,0.00)   ← CLEAR, readable mid-field
0.82  rgba(20,34,46,0.10)
1.00  rgba(10,18,28,0.26)      ← soft cool vignette at the edges
```
Warm centre → clear middle → cool edge. Cheap, and it does most of the "cinematic" work.

### Layer 5 — Fog + matching background (depth)
```js
scene.background = 0x0d1420;
scene.fog = new THREE.Fog(0x0d1420, 175, 310);   // clear mid-field, haze at the far edge
```
Background **must equal** the fog colour or the horizon shows a hard seam.
Lighting rig (do not "improve" it):
```js
HemisphereLight(0xbfd4ff, 0x223044, 0.9);
DirectionalLight(0xfff2dd, 0.8) at (60, 100, 40);
```
Decor `castShadow = false` — shadows on 1000 props tank the framerate and add nothing here.

### Layer 6 — Worn lane ribbons (not painted stripes)
Lanes are a **Catmull-Rom ribbon draped on the terrain**, not a straight quad:
```js
curve = CatmullRomCurve3(points, false, 'centripetal', 0.5);
SEG   = max(28, curveLength/3);
halfWidth hw = 4.4 * (1 + 0.17*sin(i*0.6 + seed) + 0.07*sin(i*0.21 + seed*3));   // width wobble
meander      = taper * (2.0*sin(t*2PI + seed) + 1.0*sin(t*14.77 + seed*2.3));    // snake the centre
             // taper = sin(PI*t)  → 0 at both ends, so it still meets the bases cleanly
y = heightAt(x,z) + 0.06;   renderOrder = 1;
alpha: fade in/out over the first & last 14% of the path (no hard start/end edge)
```
The meander + width wobble + faded ends is what makes it read as a **trodden path** instead of a
racing stripe. **The unit pathing still uses the original straight waypoints** — only the *visual*
centreline meanders (kept < half-width, so a unit on the true line stays on the painted path).

### Layer 7 — Layered low-poly trees (never flat cones)
```js
trunk   = Cylinder(0.4, 0.6, 2.4, 5)  color 0x4a3522,  y = 1.2
cone A  = Cone(baseR,        ht*0.62, 7)   y = 2.2 + ht*0.31
cone B  = Cone(baseR*0.66,   ht*0.50, 7)   y = 2.2 + ht*0.62
baseR = 2 + rand*1.6 ;  ht = 5 + rand*4 ;  random rotation.y
foliage = HSL(0.30 ± 0.03, 0.42 + rand*0.16, 0.20 + rand*0.08), flatShading: true
```
**Per-tree HSL variation + flat shading = hand-crafted.** One flat dark cone = cardboard cutout.
~32 in-field trees; each is also a collision obstacle (`r = 2`).

### Layer 8 — Rock ridges (the chokes, made of real rock)
Along each WALL segment, place a rock every ~5 units with ±0.75 jitter:
```js
Dodecahedron(2.6 + rand*1.2),  color 0x6e6a63,  y = 1.6,  random rotation on all 3 axes
obstacle r = 3
```

### Layer 9 — Seeded instanced scatter (the "lived-in" pass)
Four **capped InstancedMeshes**: grass tufts, small rocks, flowers, bushes.
- **Seeded RNG** → identical layout every load (never random per session).
- **Keep-outs**: cores, fountains, all 12 towers, the lanes, existing obstacles, the outer border.
- `castShadow = false`, built once, zero per-frame cost.

Suggested caps: grass ≤1400, flowers ≤400, bushes ≤260, rocks ≤400.

### Structures get furniture too
- **Fountain pad**: `Circle(r=8, 28)` with a **baked 256px canvas texture** — 6 concentric ripple
  rings, 24 rune ticks at r≈104, centre glow, team-tinted; `emissive 0.18`. Plus a `Ring(7.4, 8)`
  at `opacity .6` that softly pulses.
- **Towers/cores**: sit on a stone pedestal, with trodden/worn ground beneath.

### Biome tints — keep them **near-neutral**
`[dryTint, wetTint, fogTint, floorTexture]`:
```
meadow  [0xeaf0e0, 0xc2ccb4, 0x14202e, grass_01]
jungle  [0xe2ecd6, 0xb8c6a6, 0x0f1e16, grass_02]
desert  [0xf2e9d2, 0xd8c9a8, 0x2a2417, desert_01]
wetland [0xdfe8dc, 0xb6c4b4, 0x10221f, desert_03]
```
These are **light, near-white tints** — they let the photographic floor read true and only cast a
gentle mood. Saturated biome colours are the classic mistake: they turn the floor into flat
green/orange plastic. The fog tint is mixed **30%** into the weather fog so the haze carries the biome.

---

## 4. PART C — Delivery contract (what the generator must emit)

Emit the artifact; **`tools/battlefield_converter.cjs` already derives layers 1, 2, 7, 8, 9 for you**
(heightfield synthesis, palette→material set, tree/rock/scatter placement, arena clip) and outputs an
engine-ready render manifest. Your job is to give it good input:

```jsonc
{
  "arena":   { "shape", "sizeM": 322, "bounds": [[x,z]…] },     // ±161, no rescale
  "terrain": { "cellM": 2, "w":161, "h":161,
               "cells": "<b64 u8: OPEN0 FOREST1 ROCK2 WATER3 CLIFF4 ROAD5 OOB6>",
               "walk":  "<b64 u8: 1 = walkable>" },
  "lanes":   [ [[x,z]…] ],          // 3 chains: 1 diagonal + 2 L-shaped
  "obstacles":  [ {kind:"TREE|ROCK|<LANDMARK>", x, z, r} ],
  "resources":  [ {kind:"GOLD_MINE|WOOD_GROVE", x, z, richness} ],
  "structures": [ {kind:"TOWER", side, x, z, hpMax} ],          // 12, 6/side
  "spawnZones": [ {id, side, edge, x, z, canBase} ],            // canBase → fountain/core
  "buildSpots": [ {anchorId, x, z, size} ],
  "mobs":       [ {kind, x, z, count} ],
  "meta": { "seed", "designVersion", "params": { "palette" } }
}
```
Read `docs/briefs/BATTLEFIELD-RENDER-PARITY.md` for the manifest schema the converter emits.

---

## 5. PART D — Acceptance checklist (run this BEFORE you deliver)

A map is **not done** until every box is ticked. This is the thing that stops the hours of rework.

**Layout**
- [ ] Frame is exactly ±161, centre origin, `+z` north. Nothing outside.
- [ ] 3 lanes: **one diagonal + two L-shaped** hugging the edges (not 3 parallel).
- [ ] Two big jungle pockets exist between mid and the side lanes.
- [ ] Ridge chokes with **gaps** — the only jungle entrances. Border ridges seal the outside.
- [ ] Corridor seals start **clear of the lane** (units can't get pinched at towers).
- [ ] 2 cores (±114.8), 2 fountains (±131.6), 12 towers (6/side), diagonally symmetric.
- [ ] Relief ≤ ~4 units, 1–3 soft domes. **Not** a dramatic heightmap.
- [ ] `walk` bitmask agrees with the terrain codes; no unreachable pockets; both bases connected.

**Look** (the part that gets skipped)
- [ ] Ground is **draped on the heightfield**, not flat.
- [ ] Real tiled floor texture, `repeat(23,25)`, `rotation 0.12`. Not a flat colour.
- [ ] Per-vertex dirt/meadow/rim/rock splotches baked in.
- [ ] The single radial ground-glow overlay is present (warm centre → cool vignette).
- [ ] Fog `(0x0d1420, 175, 310)` and background set to the **same** colour.
- [ ] Lanes are meandering, width-wobbled, alpha-faded ribbons draped on terrain.
- [ ] Trees are trunk + **two** cones with per-tree HSL variation and flat shading.
- [ ] Ridge rocks are jittered dodecahedrons, ~1 per 5 units.
- [ ] Seeded scatter present, with keep-outs around structures/lanes.
- [ ] Biome tints are **near-white**, not saturated.
- [ ] Fountain pads have the baked rune/ripple texture + pulsing ring.

**Sanity**
- [ ] Non-square/polygon parcels: ground is **clipped** to `arena.bounds` (no terrain past the parcel).
- [ ] Screenshot from the game camera (FOV 50) at the map centre and at a base. If it doesn't look
      like the live map in those two shots, it isn't done.

---

## 6. PART E — The six mistakes that make a generated map look flat

1. **Flat ground.** No heightfield drape → cardboard. (Biggest offender.)
2. **Flat colour instead of a tiled photographic floor** — or a square 1:1 repeat with no rotation,
   which reads as obvious wallpaper.
3. **No baked vertex-colour splotches** — the ground is uniform and dead.
4. **No ground-glow overlay** — the scene has no light shape; everything is evenly, boringly lit.
5. **Saturated biome tints** — turns the floor into green/orange plastic. Keep tints near-white.
6. **Props instead of structure** — scattering 500 trees on an open field doesn't make a MOBA map.
   **Chokes with gaps** and the diagonal-mid/L-lane topology are what make it read and play.

---

## 7. TL;DR for the map agent

> Give me the **artifact** (Part C) with a **diagonal mid + two L-lanes + ridge chokes with gaps +
> gentle 2-dome relief**, run it through **`battlefield_converter.cjs`**, and make sure the renderer
> applies **all nine layers in Part B with those exact numbers**. Then run the **Part D checklist**
> before you call it delivered. That's the whole difference between "a map with lanes and objects"
> and "the live MOBA map."
