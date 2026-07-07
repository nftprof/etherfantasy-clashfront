# Map Pipeline & Glossary — one shared vocabulary for "the map"

> **The point of confusion this resolves:** there is **ONE map** — a JSON artifact. Everything else is
> either a **derived data file** (also JSON) or a **render** (pixels on screen). The 2D and 3D things you
> "see" are NOT separate maps — they are *views* of the same artifact. Use the terms below verbatim so
> all sessions mean the same thing. Author: Clash Front Overworld design, 2026-07-06.

---

## The pipeline (data → renders)

```
  AI / LLM              GENERATOR              THE ARTIFACT                     DERIVED FILES            RENDERS (pixels)
 ┌─────────┐          ┌───────────┐        ┌────────────────────┐
 │ design  │  params  │ generate()│  bake  │  map artifact      │   command_converter (§3)
 │ params  │ ───────▶ │ determin- │ ─────▶ │  *.artifact.json   │ ─┬─▶  A1 Battlefield JSON ──▶  ▣ 2D COMMAND VIEW
 │(PARAM_  │          │  istic    │        │  = RASTER          │  │    (vector: bounds,          (drawBattlefieldMap;
 │ SPACE + │          └───────────┘        │  terrain grid +    │  │     lanes, cores,           the top-down map)
 │ feature │                               │  props + lanes +   │  │     footprints)
 │  DSL)   │                               │  structures + meta │  │
 └─────────┘                               │  ⟵ SOURCE OF TRUTH │  ├─▶  render manifest ──────▶  ▣ 3D PREVIEW (schematic)
   NOT the map —                           │    (in the         │  │    (render.json:            (preview3d.html;
   just the recipe                         │     registry)      │  │     heightfield +           placeholder prefabs)
                                           └────────────────────┘  │     scatter)
                                                     │             │
                                                     └─────────────┴─▶  (same artifact) ───────▶  ▣ IN-GAME 3D  ← the goal
                                                                                                   (index.html, real
                                                                                                    models/terrain) — the GAP
```

**Read it as:** the LLM writes *parameters* → the generator bakes ONE *artifact* (the raster JSON, the
source of truth) → that artifact is (a) converted to the *A1 vector* for the 2D command view, (b)
enriched with a *render manifest* for 3D, and (c) rendered three ways. **One artifact, many views.**

---

## Glossary — the term for each thing

| # | The thing | **Term to use** | File? | What it actually is |
|---|---|---|---|---|
| 1 | What the AI/LLM produces | **design params** (PARAM_SPACE + feature-DSL) | transient | archetype/palette/counts — the *recipe*, **NOT geometry**. Clamped + validated. |
| 2 | The deterministic builder | **the generator** (`map-service/maps/generate.js`) | code | `design params → the artifact` |
| 3 | The canonical map DATA | **the artifact** / **map artifact** (`*.artifact.json`) | ✅ | the **RASTER**: 161×161 terrain grid (`cells`+`walk`) + obstacles + resources + structures + lanes + `meta.params`. **THE source of truth.** Lives in the registry (`~/ef-battlefields/<parcelId>/design.v{N}.json`). |
| 4 | Vector form for the command view | **A1 Battlefield JSON** (a.k.a. **command map**) | ✅ | derived from the artifact by the §3 `command_converter`: `bounds` + `lanes{id,side,waypoints}` + `structures` (incl. `CORE`) + obstacle **footprint polygons**. Served at `/…/command.json`; stored in `data/cf-maps/parcels/`. |
| 5 | 3D-enrichment data | **render manifest** (`render.json`) | ✅ | heightfield + biome + tree/rock scatter derived from the artifact (needs the engine's converter). Optional; makes 3D non-flat. |
| 6 | The **2D image** I showed you | **command view** (a *render*) | ❌ pixels | `battle.js drawBattlefieldMap` drawing the A1 vector — the in-game top-down command overlay. |
| 7 | The **3D** at `/designer/3d` I showed you | **3D preview** (a *render*) | ❌ pixels | `preview3d.html` drawing the artifact with **placeholder** prefabs (cones/cylinders) on flat ground. Schematic. |
| 8 | The **final in-game 3D** (real game) | **in-game render** / **game 3D** | ❌ pixels | the real client (`index.html`) drawing the artifact with **real models/terrain/lighting**. The target — see "the gap". |

**Rule of thumb:** items 1, 3, 4, 5 are **files** (JSON). Items 6, 7, 8 are **renders** (pixels) — they
don't exist as files, they're painted from the files at view time.

---

## Direct answers to the questions

- **"Is the entire map just a .json?"** — **Yes.** The map *is* the **artifact** (`*.artifact.json`, raster).
  Its two derived files (the **A1 command map** and the **render manifest**) are also JSON. Everything you
  *see* is a **render** of that JSON — not another map.
- **"`.artifact.json` is the raster (drives the 3D)?"** — Yes, and more precisely it drives **everything**:
  the 3D preview reads it directly; the 2D command view reads its **A1** derivation; the in-game 3D will
  read the same artifact. It is the single source.
- **"…vs the final 3D map in game?"** — that's the **in-game render** (item 8) — the real client painting
  the artifact with real assets. Same data, best renderer.
- **"…vs what the AI/LLM generates?"** — the LLM generates **design params** (item 1), not a map. The
  generator turns params into the artifact.
- **"…vs the 2D map you showed?"** — the **command view** (item 6): a render of the A1 command map.
- **"…vs the 3D map you showed?"** — the **3D preview** (item 7): a schematic render of the artifact.

## Template vs example vs parcel map (three levels — don't conflate)

| Level | Term | Keyed by | Tied to real land? | Example |
|---|---|---|---|---|
| **Recipe** | **template / archetype** | a name | no | `openSteppe`, "The Hot Gates" (the 48-template library) — a *design pattern*, not a map file |
| **Sample** | **example map** (a.k.a. demo/reference map) | a made-up id | **no** | **`CF-GRASSLAND`, `CF-FOREST`, …** — a concrete generated *instance* with a demo id, for the team to look at. Generic. Not a parcel. |
| **Real** | **parcel map** | the **real `parcelId`** (on-chain token id) | **yes** | an **EDU-zone parcel** like `60203370020` — the deterministic map for *that specific land*, generated on first visit, permanent |

So:
- **`CF-GRASSLAND` is an example/sample map** — a generic reference instance, **not** a template (templates
  are the archetype recipes) and **not** a real parcel.
- **A parcel map** is keyed by the parcel's real token id (EDU parcels start `602…` — zone code `02`),
  and its **biome is DERIVED from where it sits** (EDU = academy highland plateau, per the Continent
  Terrain Atlas), not chosen freely. Same generator, same artifact format — the only differences are (a)
  the **seed = the real parcelId** and (b) the **biome/edges come from the world-terrain field** instead of
  hand-picked params. So a parcel map is just "an example map whose id and biome are the land's, not made up."

## The gap (why 3D preview ≠ in-game 3D)

Same artifact, **different renderer**. The **3D preview** (item 7) uses placeholder prefabs on flat
ground; the **in-game render** (item 8) uses the real client's models/terrain. Closing the gap for all
maps = making the real client (`index.html`) **data-driven from the artifact** (it already has the real
prefabs `mkTower`/`mkNode`/`mkCore`/terrain — they're just wired to hardcoded map data today). That is
the `CLIENT_BATTLEFIELD_LOADER.md` task (game-dev / OP48). **No new map format is needed — only the
renderer changes.**

## One-line summary

**design params → the generator → the artifact (raster JSON, source of truth) → { A1 command map,
render manifest } → three renders: command view (2D), 3D preview (schematic), in-game render (real).**
