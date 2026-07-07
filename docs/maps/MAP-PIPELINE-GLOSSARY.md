# Map Model — combined alignment for ALL sessions (pipeline · tiers · layers · glossary)

> **THE single doc to align every session** (CF Overworld, network/engine, MOBA BattleEngine, map-maker,
> game-dev). It reconciles three models people have been using: the **pipeline** (data → renders), the
> **three tiers** (stand-in / legacy.json / parcel map), and the **four layers** (skeleton / obstacles /
> art / collision). Use these terms verbatim. Author: Clash Front Overworld design, 2026-07-06 (folds in
> the network/engine session's tier + layer model).
>
> **The two things everyone must hold:** (1) there is **ONE map** = a JSON artifact; the 2D/3D things you
> *see* are **renders** of it, not separate maps. (2) **A live battle's map wins over any static file** —
> the static files (legacy.json, stand-ins, parcel files) are the **fallback** for when no match is running.

---

## Three tiers of "map" (the word is overloaded — split it)

| Tier | Term | What it is | Status |
|---|---|---|---|
| **Stand-in** | `legacy-1lane.json` / `legacy-3lane.json` | CF's **hand-approximated guesses** at the current arena (built before the authoritative coords existed) | what CF renders **today** (placeholder) |
| **Legacy map** | **`legacy.json`** | the **REAL current single-player arena**, exported **authoritatively** from the engine sim | ← the missing piece; **network/engine session generated it** (`integration/legacy.json` in the moba repo). Replaces the stand-ins. |
| **Parcel map** | `parcel-<id>.json` (the artifact) | the **future per-parcel CF maps** (the 1000s) — each parcel its own arena | not built (generates on demand) |

**Key:** "CF renders stand-ins, not the actual client map" = *the stand-ins are rough copies; give CF the
authoritative `legacy.json`.* It is **NOT** about missing parcel maps — different track. (My
`data/moba-maps/moba-singleplayer.json` was a **reverse-engineered approximation** of the same arena; the
engine's `legacy.json` is the **authoritative** version and supersedes it when it lands.)

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

## Live vs static — the precedence (everyone must wire this the same way)

A running battle already ships **its own map** — with that match's actual obstacles — **live** in the
`battlefield` field of the engine/bridge telemetry (`bridgeStart` / `battle_hello`). The static files are
only the fallback. **Order of truth for what a battle renders:**

```
  1. LIVE match map (bridge/engine telemetry `battlefield`)     ← wins whenever a match is running
  2. the parcel's own file  (data/cf-maps/parcels/<id>.json)    ← CF override for that parcel
  3. legacy.json  (the authoritative arena)                     ← default when no per-parcel map
  4. legacy-{1,3}lane.json stand-in                             ← last resort (retired once legacy.json lands)
```

CF already respects this: the engine path attaches the live `battlefield`, and `loadStandbyBattlefield`
**prefers `data/moba-maps/legacy.json`** over the stand-ins. **If any loader ever prefers a static file
over live telemetry for a running match, that's a bug** (network session's flag — agreed).

## The reconciliation & the ONE divergence (read this — it prevents a mis-wire)

All three models describe the same thing; they agree on almost everything. The agreements:
- **legacy.json = the skeleton (layer ①)**, not the whole map. ✅ everyone.
- **3D art (layer ③) is client-side, never in any JSON.** ✅ everyone.
- **Live match map wins over static.** ✅ everyone.
- **"legacy" = the classic/current arena**, not "deprecated"; parcel maps are **additive**, same schema,
  different files — they never *replace* legacy.json. ✅ everyone.

**The one divergence — obstacles + walkability (layers ② + ④):**

| | **Legacy MOBA arena** (`legacy.json`) | **CF parcel maps** (the artifact) |
|---|---|---|
| Obstacles (②) | **per-match, seeded-random** — legacy.json's obstacles are a **sample roll**; every match re-rolls its own and sends them live. Only the skeleton is authoritative. | **AUTHORED + DETERMINISTIC in the artifact** — the AI *designs & saves* the terrain (canon decisions 3, 10). Not re-rolled. |
| Walkability (④) | derived at runtime from ① + ② | **authored** in the artifact (`terrain.walk`), baked deterministically |

**Why CF can't inherit the legacy "obstacles ride live/random" behavior:** (1) canon — CF fights on a
**designed** map, not random scenery; (2) **determinism** (AGENTS prime directive) — same seed ⇒
byte-identical map every load; (3) **command-view ↔ 3D fidelity** — CF's 2D command map is generated from
the artifact's authored obstacles/walkability; if obstacles were random-live, the command map would be a
*lie* about the ground units fight on.

**⇒ The integration rule:** for a **CF parcel** battle, the engine must **consume the CF artifact's
obstacle + walkability layers** (deterministic), NOT re-roll them. Random-per-match obstacles are correct
for the **legacy arena only**. This is the load-bearing alignment point (see **Open questions** below).

## Terminology crosswalk (network/engine session ↔ this doc)

| Network/engine session says | This doc's term | Note |
|---|---|---|
| "stand-ins" | **stand-in** (`legacy-{1,3}lane.json`) | same |
| "legacy.json / the current arena" | **legacy map** (`legacy.json`) | authoritative; = tier 2 |
| "parcel maps (the 1000s)" | **parcel map** (the per-parcel artifact) | same |
| "layer ① skeleton" | the artifact's `lanes`+`structures`(CORE/TOWER)+`spawnZones`+`bounds` | same |
| "layer ② obstacles" | `obstacles[]` + terrain FOREST/ROCK/WATER cells | legacy: sample/live · CF: authored |
| "layer ③ 3D terrain+art" | the **in-game render** assets (client) | never in JSON |
| "layer ④ collision" | `terrain.walk` grid | legacy: runtime · CF: authored |
| "live map in `bridgeStart.battlefield`" | the **live battlefield** (precedence #1) | wins over static |

## Delivery: `legacy.json` → `data/moba-maps/legacy.json`

- **Source:** the **network/engine session** (owns the sim geometry + the export). Sitting at
  `integration/legacy.json` in the moba repo.
- **Destination:** `data/moba-maps/legacy.json` in this (CF) repo — the loader **explicitly looks for it**
  and auto-prefers it over the stand-ins (`loadStandbyBattlefield`).
- **My take on "commit direct vs courier":** it's a **data file the loader asks for by name**, not code —
  committing it straight into `data/moba-maps/legacy.json` **with a change note** is clean and fine (I'd
  welcome it). One requirement: it must be **A1 Battlefield JSON** (`bounds` + `lanes{id,side,waypoints}` +
  `structures` incl. `CORE` + `spawnZones`); if the export is a different shape, run it through the
  converter first. Once it lands, my `data/moba-maps/moba-singleplayer.json` (reverse-engineered) becomes
  a redundant cross-check — keep or drop.

## The gap (why 3D preview ≠ in-game 3D)

Same artifact, **different renderer**. The **3D preview** (item 7) uses placeholder prefabs on flat
ground; the **in-game render** (item 8) uses the real client's models/terrain. Closing the gap for all
maps = making the real client (`index.html`) **data-driven from the artifact** (it already has the real
prefabs `mkTower`/`mkNode`/`mkCore`/terrain — they're just wired to hardcoded map data today). That is
the `CLIENT_BATTLEFIELD_LOADER.md` task (game-dev / OP48). **No new map format is needed — only the
renderer changes.**

## The 4 layers — reconciled with the integration agent's `legacy.json` model

The integration session models a battle map as **4 stacked layers**, with `legacy.json` = layer ① only.
That model is **accurate for `legacy.json` / the classic MOBA arena**, and it maps cleanly onto our terms —
with **one divergence that matters for CF maps**:

| Layer | Integration agent (legacy MOBA) | CF generated maps (the artifact) |
|---|---|---|
| **① Skeleton / blueprint** (lanes, towers, cores, spawns, bounds) | `legacy.json` — in the file ✅ | in the artifact ✅ (same) |
| **② Obstacles / scenery** (trees, boulders) | *"sample only in JSON; real ones ride live, random each match"* | **AUTHORED + DETERMINISTIC in the artifact** (obstacle footprints + terrain FOREST/ROCK/WATER cells). **Not random.** |
| **③ 3D terrain + art** (ground, models, textures) | client assets, not in JSON ✅ | client assets, not in JSON ✅ (same — this is "the gap") |
| **④ Collision / walkability** | *"derived at runtime from ① + ②"* | **AUTHORED in the artifact** (`terrain.walk` grid). Derived at BAKE time, not per match. |

**Agreement:** layer ① is the blueprint; layer ③ (3D art) is always client-side, never in the JSON — true
for every map. And "legacy" = the original single-player arena the game already ships. All correct.

**The divergence (CF ≠ legacy):** for CF parcel maps, layers **② (obstacles) and ④ (walkability) move INTO
the artifact and are DETERMINISTIC** — they do NOT "ride live / random each match." This is non-negotiable
for three reasons:
1. **Canon** — CF battles are fought against a **DESIGNED** map (decisions 3 + 10: terrain is authored, the
   AI designs + SAVES it), not random scenery.
2. **Determinism** (AGENTS prime directive) — same seed ⇒ byte-identical map, every load, every player.
   Random-per-match obstacles break golden-master reproducibility.
3. **Command-view ↔ 3D fidelity** — the 2D command view is generated from the artifact's authored
   obstacles/walkability (§3 converter). If obstacles were random-live, the command map would be a *lie*
   about the terrain the units actually fight on.

**So the alignment for integration:** when CF maps flow into the client, layers ② + ④ must come **from the
artifact** (deterministic), NOT be scattered live. The client's random-décor path is fine for **purely
cosmetic** props, but every **gameplay-relevant** obstacle + the walkable field are the artifact's, locked.
`legacy.json` (skeleton only) ⊂ the CF `artifact` (① + ② + ④ authored; ③ still client art).

## Open integration questions (for the network/engine + map-maker sessions)

1. **CF obstacle authority (the load-bearing one).** For a **CF parcel** battle, does the engine
   **consume the CF artifact's obstacle + walkability layers** as-is (required for determinism + designed
   terrain), or does it re-roll obstacles per match like the legacy arena? CF needs the former. What's the
   allocate-time contract to pass CF's obstacle/walk layer into the match?
2. **legacy.json format** — is the engine export already A1 Battlefield JSON (bounds/lanes/structures/
   spawns), or does it need a one-time conversion before landing at `data/moba-maps/legacy.json`?
3. **Live `battlefield` shape** — confirm the live `bridgeStart.battlefield` is the same A1 schema CF's
   command view renders, so live + static go through one renderer (they should, per §4f).

## One-line summary

**design params → the generator → the artifact (raster JSON, source of truth) → { A1 command map,
render manifest } → three renders: command view (2D), 3D preview (schematic), in-game render (real).**
