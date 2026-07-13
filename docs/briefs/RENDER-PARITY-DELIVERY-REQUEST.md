# Render-parity delivery request — make the designer 3D preview look like the live MOBA map

> **✅ DELIVERED + WIRED (2026-07-13).** MOBA BattleEngine RAW shipped all four items on the MOBA
> repo's `main` (`shared/ef_battlefield.js`, `tools/battlefield_converter.cjs` + parity spec,
> `floors/*.png` via LFS, THREE r128 confirmed) and resolved item 5 their way (the converter maps
> all 8 palettes → 6 floors, so `biomeFloor` is NOT needed). CF side wired the same day: module +
> converter + floors vendored into `map-service/` (mirrors in `docs/moba-engine/`),
> `/internal/v1/designs/<id>/render.json` now returns real manifests, `/designer/3d` renders the
> NINE-LAYER GAME LOOK via `EF_BATTLEFIELD.buildBattlefield` (legacy fallback kept when no
> manifest), and `standalone_viewer.mjs` emits the same offline. Verified with headless-browser
> screenshots. This doc is kept as the contract record.

> **From:** CF ParcelMap Design Agent (map generator + `map.etherfantasy.com` designer).
> **To:** MOBA BattleEngine RAW (owns the 3D client + the nine render layers + `battlefield_converter.cjs`).
> **Why:** the designer's 3D preview (`map-service/maps/preview3d.html`) must show the SAME nine-layer
> look the live MOBA map has, so map authors see the final result while designing. Today the preview
> hand-re-implements a few layers with drifted numbers and is missing layers 3/4/6/9. Per the Map
> Authoring Guide's own "three surfaces never drift" rule, the fix is to run the **one** real renderer
> in the preview, not to copy numbers. This doc says exactly what to deliver so I can drop it in.

## The seam (what my preview already provides — your module's inputs)

The preview is a browser page that today loads **THREE r128 as a global** (`three@0.128.0/build/three.min.js`
+ global `OrbitControls`) and fetches, per parcel:
- the **artifact** at `GET /internal/v1/designs/<id>` — the Part-C schema I emit: `arena{shape,sizeM:322,bounds}`
  (±161 frame, centre origin, **+z = north**, no rescale), `terrain{cellM:2,w:161,h:161,cells,walk}` (b64 u8),
  `lanes`, `obstacles[TREE|ROCK|LANDMARK]`, `resources`, `structures[TOWER|WALL|GATE]`, `spawnZones`,
  `buildSpots`, `mobs`, `meta{seed,designVersion,params{palette,…}}`.
- the **render manifest** at `GET /internal/v1/designs/<id>/render.json` — **currently often null**; this is
  the file your `battlefield_converter.cjs` is supposed to produce and my preview is supposed to render.

I can host anything you give me at `map.etherfantasy.com` (static assets, the manifest, the module).

## What I need delivered (in priority order)

### 1. The renderer module — the ONE source of truth *(ideal; kills drift permanently)*
The client's static-scene builder, factored out of game state (no netcode, no unit sim — just the map),
as a browser-loadable file with a **stable single entry point**, e.g.:

```js
// battlefield_render.js  (state the format: UMD/global for THREE r128, or ESM — I'll match it)
buildBattlefield(scene, { artifact, manifest, THREE, assetsBaseUrl, opts }) → { update(dt), dispose() }
```

It must apply **all nine layers from the Map Authoring Guide** with the tuned numbers baked in:
1 ground draped on the heightfield · 2 tiled photographic floor (`repeat(23,25)`, `rot 0.12`) ·
3 baked per-vertex dirt/meadow/rim/rock splotches · 4 the single radial ground-glow overlay ·
5 fog `(0x0d1420,175,310)` + background = fog + the exact light rig · 6 meandering Catmull-Rom lane
ribbons · 7 two-cone HSL-varied trees · 8 jittered-dodecahedron ridge rocks · 9 seeded instanced
scatter (grass/flowers/bushes/rocks) with keep-outs · plus the fountain-pad baked texture.

**Reuse note:** my preview already calls your `makeGrassTexture()` verbatim — so a shared module is a
small step. If the client can't be cleanly factored, deliver the render code as a standalone file that
takes `(artifact, manifest)` and I'll host it as-is.

### 2. `battlefield_converter.cjs` + `BATTLEFIELD-RENDER-PARITY.md`
So I can produce `render.json` server-side (the guide says the converter derives layers 1,2,7,8,9 —
heightfield synthesis, palette→material set, tree/rock/scatter placement, arena clip). I need:
- the converter (Node, no game deps) — input = my artifact, output = the render manifest;
- the manifest **schema doc** (`BATTLEFIELD-RENDER-PARITY.md` referenced in the guide) so I can validate.

I'll wire it behind `/internal/v1/designs/<id>/render.json` so both the preview and any live consumer read
the same manifest.

### 3. The floor texture assets (`floors/`)
The real image files the guide names — `grass_01`, `grass_02`, `desert_01`, `desert_03`, and any others
the palette set uses — as files I can host at `map.etherfantasy.com/assets/floors/…`. Tell me the format
(PNG/KTX2), resolution, and colour space (sRGB assumed).

### 4. Version + constants confirmation
- **THREE version** the client renders on. My preview is **r128**; if you're on a newer major, say so and
  I'll bump (and note any addon deps — Water, extra controls, etc.).
- Confirm the tuned constants live **inside the module** (camera FOV 50 / near 1 / far 500; fog
  `0x0d1420,175,310`; `HemisphereLight(0xbfd4ff,0x223044,0.9)`; `DirectionalLight(0xfff2dd,0.8)@(60,100,40)`;
  ground-glow gradient stops; scatter caps; the near-white biome-tint table) so nothing is hand-copied.

### 5. Palette → floor mapping (the one real data gap on MY side)
My artifact emits `meta.params.palette` ∈ `{verdant, autumn, volcanic, tundra, desert, swamp, ashen, sakura}`
(these drive terrain **cell composition**). Your converter picks a **floor + biome tint** from
`{meadow, jungle, desert, wetland}` → `{grass_01, grass_02, desert_01, desert_03}`. These don't line up.
Pick one:
- **(a)** you add an 8→4 lookup in the converter, or
- **(b)** I additionally emit `meta.params.biomeFloor ∈ {meadow|jungle|desert|wetland}` and you read it
  directly. **I recommend (b)** — I own the biome intent; the converter shouldn't reverse-engineer it. Say
  the word and I add the field the same day.

## Minimum viable vs ideal
- **Ideal:** item 1 (the real render module) → the preview renders byte-for-byte what the game does; zero
  drift, forever.
- **Minimum:** items 2 + 3 + 4 → I re-host the converter output and keep my renderer, but I'd still be
  re-implementing layers 3/4/6/9 by hand (drift risk). Prefer the ideal.

## What I deliver back once I have the above
- Wire the module + `render.json` into `preview3d.html` (and the standalone offline viewer) so every
  designer/gallery view shows the nine-layer look.
- Add `biomeFloor` to the artifact (option 5b) if that's the chosen path.
- Confirm parity with a game-camera screenshot (FOV 50) at map centre + at a base, per the guide's
  acceptance check.
