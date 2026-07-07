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
>
> **🔎 REVIEW REQUESTED — two sessions must concur on the 2026-07-07 updates below** (the generation path +
> the two-layer base-terrain/seeding model + the "3-lane is a test drop-in, not a design fallback"
> correction): **EF Moba game dev OP 48** (owns the 3D client / hero-mode entry) and the **merged
> integration+network session** (owns `legacy.json`, the match server, + the repo-to-repo map courier).
> Please read **"How a parcel gets its map"** and **"Live vs static — the precedence"** and reply concur /
> flag. **Related decision:** `CONTINUOUS-WORLD-TERRAIN.md` — parcels are windows into one authored
> continuous world (roads/rivers continuous across parcels; edge-freeze terraform; a new CF aerial mosaic
> view). *(Session note 2026-07-07: this doc is authored by the **Map-maker** session; integration + network
> are now one merged session.)*

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

## How a parcel gets its map — the generation path + the two seeding layers (READ THIS)

> **For sessions that don't know CF has an LLM/generator path yet:** CF maps are **not hand-authored one
> by one** and they are **not** the shared 3-lane arena. A parcel's map is **generated** — an LLM emits a
> compact *recipe*, a deterministic generator bakes it into the artifact. This section is the intended
> production pipeline that **replaces** the 3-lane test drop-in.

### What the LLM/user actually produces — it is NOT file A/B/C/D
The four files below (A artifact, B command.json, C render.json, D thumb.png) are all **outputs of the
generator**. The **LLM never writes any of them.** The LLM (or a landowner tuning the designer) writes a
**fifth thing, upstream of all of them**: the **design params** (archetype, palette, feature counts, a
bounded placement DSL — the *recipe*, never geometry). The lineage is **five stages**:

```
  ① design params      ②  generator        ③ THE ARTIFACT (A)      ④ derived files          views
    (LLM / designer) ──▶ (deterministic) ──▶ raster, source of ──▶  B command.json  ──▶ 2D command view
    the RECIPE           params → artifact    truth                 C render.json    ──▶ 3D preview / in-game
    (not geometry)                                                  D thumb.png      ──▶ designer preview
```

- **Stage ① (design params)** = what the LLM/user makes. **Not A/B/C/D.** Transient recipe.
- **Stage ③ (the artifact, file A)** = the source of truth. `legacy.json` sits **in this same slot** but for
  the *shared current arena* (authored by the network/engine session), **not** per-parcel or LLM-made — see
  the note under "Which view reads which file".
- The designer just **re-runs ②→③→④** every time the params change; that is what "generate a new version" is.

### The two layers of a parcel map — BASE TERRAIN, then SEEDING (owner, 2026-07-07)
A parcel's artifact is built in **two independent passes**, and this is the key to world-scale:

| Layer | What's in it | When it's made | Purpose |
|---|---|---|---|
| **① Base terrain** (unseeded) | landscape only — ground/biome, **rivers**, hills, coast, walkable field, bounds, lane/entry skeleton. **No units, no towers, no wild NPCs.** | **Batch, up front** — **~20K** maps generated for the world so **every parcel always has a floor map** (this is what kills the 3-lane drop-in). | the guaranteed, deterministic ground every battle is fought on |
| **② Seeding** (the game layer) | wild NPCs, towers / CC / defensive structures, resource richness, occupation state — the **"wild-occupied"** dressing on top of the base terrain. | **Lazily, near players** *(preferred)* — when a player approaches, auto-seed that parcel **and its neighbours** on top of the base terrain; **OR** pre-seed all ~20K in detail later when capacity allows. | turns bare terrain into a playable, occupied battlefield |

**So the rollout is:** first the **whole world gets base terrain** (20K unseeded base maps — just landscape +
rivers), then **seeding grows outward from where players actually are** (auto-seed the nearby parcels' wild
+ towers on top of the base), with **full pre-seeding of all 20K as an optional later batch**. This is a
refinement of canon decision 9 (battlefields materialize lazily): the **base terrain can be pre-baked in
bulk**; the **seed (wild/towers/game entities) is the lazy, near-player part**. Both layers live in the
same artifact (A) — seeding just fills the `structures` / `mobs` / resource fields the base pass left empty.

**Why this matters for other sessions:** a CF parcel battle must load **that parcel's base(+seed) artifact**,
never the shared 3-lane arena. The base-terrain floor is what guarantees step 2 of the precedence chain
always resolves, so step 3 (the 3-lane test drop-in) is never hit in production.

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

## Which view reads which file (delivery + tool) — the exact answer

**One source file (the artifact) → three derived files. Each view reads a different one.** So the 2D
command view and the 3D hero view do **not** read the same file — they read two derivations of the same
artifact.

### The files (per parcel/design)
| # | File | Format | Made by | It's the… |
|---|---|---|---|---|
| A | **artifact** (`design.v{N}.json`) | **RASTER** JSON (terrain grid `cells`+`walk`, obstacles, lanes, structures, spawns, meta) | the generator | **source of truth** (in the registry) |
| B | **`command.json`** | **A1 vector** JSON (bounds, `lanes{waypoints}`, `structures` incl CORE, obstacle footprints) | `command_converter` (§3), from A | the **2D command map** data |
| C | **`render.json`** | manifest JSON (heightfield + biome + scatter) | `battlefield_converter.cjs`, from A | the **3D heightfield** data |
| D | **`thumb.png`** | PNG image | `thumb.js`→`png.js` (server), from A | the **top-down thumbnail** |

### The four views
| View | Where | Reads file(s) | Format | Rendering tool |
|---|---|---|---|---|
| **Designer 2D preview** | the studio (`designer.html`) | **D `thumb.png`** | PNG (server-rendered) | server `thumb.js`/`png.js` — a top-down raster image; the studio just `<img>`-tags it |
| **2D command-mode map** | CF game command overlay | **B `command.json`** — or the **A1 `battlefield`** delivered LIVE in `battle_hello`; else static (`cf-maps/parcels/<id>.json`, `legacy.json`) | A1 vector JSON | client `battle.js drawBattlefieldMap` (canvas 2D) |
| **3D preview** (designer) | `/designer/3d` | **A artifact** (`/internal/v1/designs/<id>`) + optional **C `render.json`** | raster JSON (+ manifest) | client `preview3d.html` (three.js, **placeholder** prefabs) |
| **Final 3D in-game (hero)** | the real match client | **A artifact** (per `CLIENT_BATTLEFIELD_LOADER.md`) — or the **live match map** | raster JSON (or live) | client `index.html` (three.js, **real** prefabs) |

**So, directly:**
- **Command mode map** = the **A1 vector** (`command.json`, or the live `battlefield` in `battle_hello`). Tool: `drawBattlefieldMap`.
- **Final 3D hero map** = the **raster artifact** (+ `render.json` heightfield), or the live match map. Tool: `index.html`.
- These are **two different files** (B vs A) built from the **same source** (A). The 2D command map is a
  *vector* derivation (footprints + lanes); the 3D needs the *raster* grid (per-cell terrain) — which is
  why they don't share one file.
- The **designer 2D preview** is a **third thing** again — just the server-baked `thumb.png` image.

**Where `legacy.json` sits vs A/B/C/D (common question):** it is **not** one of A/B/C/D and not a *derived*
file. `legacy.json` occupies the **same slot as file A (the artifact / source)** — but for the **one shared
current arena**, authored by the network/engine session, rather than per-parcel and generator-made. It is
"the human/engine-made equivalent of a parcel artifact." A/B/C/D exist **per designed parcel**; `legacy.json`
is a **single world-wide file**. In the CF overworld it is a **fallback/test map only** (see the precedence
correction) — a real parcel battle uses that parcel's own artifact (A), not `legacy.json`.

## Live vs static — the precedence (everyone must wire this the same way)

A running battle already ships **its own map** — with that match's actual obstacles — **live** in the
`battlefield` field of the engine/bridge telemetry (`bridgeStart` / `battle_hello`). The static files are
only the fallback. **Order of truth for what a battle renders:**

```
  1. LIVE match map (bridge/engine telemetry `battlefield`)     ← wins whenever a match is running
  2. the parcel's own map  (data/cf-maps/parcels/<id>.json)     ← THE PRODUCTION PATH — every parcel has one
     └─ base-terrain layer (always present, 1 of ~20K)
        + optional seeding layer (wild/towers/resources)
  ─────────────────────────────────────────────────────────────────────────────────────────────
  3. legacy.json / legacy-{1,3}lane.json                        ← ⚠ TEST DROP-IN ONLY, not a design fallback
```

> **⚠ CORRECTION (owner, 2026-07-07) — the 3-lane is a test crutch, NOT the intended fallback.**
> "Falling back to `legacy.json`" = dropping into the **single shared 3-lane MOBA arena**. **We do not want
> that for a CF parcel battle.** The 3-lane map is only in the chain because, before the per-parcel maps
> existed, it was the **only** map we had to test the integration between the **CF command view** and the
> **hero-mode session jumping in and out** of a battle. It is a **development drop-in**, not the production
> default. **The design goal is that step 3 is never reached** — every parcel resolves at step 2 to **its
> own base-terrain map** (one of the ~20K pre-generated; see the generation section above). Once the 20K
> base maps are seeded, `legacy.json` / the stand-ins survive **only** as (a) the map for the *current*
> standalone MOBA game and (b) an integration-test fixture. **Any CF overworld battle that renders the
> 3-lane arena in production is a bug**, not a fallback.

CF already respects the live-wins rule: the engine path attaches the live `battlefield`, and
`loadStandbyBattlefield` **prefers `data/moba-maps/legacy.json`** over the stand-ins **for the current
arena** — but that whole static tier is the test crutch, not the per-parcel design path. **If any loader
ever prefers a static file over live telemetry for a running match, that's a bug** (network session's flag
— agreed).

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
4. **Base-terrain vs seeding split (new, 2026-07-07).** Do OP 48 + the integration session agree with a
   **two-pass artifact** — a bulk-generated **base-terrain** floor (landscape + rivers, no entities) for all
   ~20K parcels, then a **seeding** pass (wild NPCs / towers / resources) done **lazily near players** (or
   pre-batched later)? Specifically: (a) is the base-terrain-only artifact a valid map to load if a battle
   starts before seeding (i.e. terrain-only is playable), or must every battle-loaded parcel be seeded
   first? (b) When seeding runs near-player, who triggers it — CF overworld tick, or the match allocate?
5. **Retire the 3-lane in production.** Confirm the client + bridge will treat `legacy.json` / the
   `legacy-{1,3}lane` stand-ins as the **current-MOBA / test map only**, and that a **CF parcel** battle
   must resolve to the parcel's own artifact — never the shared 3-lane arena. (This is the correction above;
   need OP 48 + integration to concur so no one wires the 3-lane as the CF default.)

## One-line summary

**design params → the generator → the artifact (raster JSON, source of truth) → { A1 command map,
render manifest } → three renders: command view (2D), 3D preview (schematic), in-game render (real).**
