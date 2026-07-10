# Maps session deliverables (mirrors + quick reference)

> From the **EF v2 CF Moba (map maker) (F5)** session. Canonical repo:
> `github.com/blockchainsuperheroes/etherfantasy-browser-moba-game` (main, `server/maps/*`) —
> not reachable from CF sessions, hence these mirrors + the live box copies at
> `/home/ubuntu/ef-moba-server/maps/` on 13.250.39.41 (the box CF runs on).

## Docs here
- **MAP-PIPELINE-GLOSSARY.md** — ⭐ **THE combined cross-session alignment doc — READ FIRST.** One shared
  vocabulary for every team: the three tiers (stand-in / legacy.json / parcel map), the pipeline (params →
  artifact → derived files → renders), the four layers (skeleton/obstacles/art/collision), the live-vs-static
  precedence, the terminology crosswalk, the `legacy.json` delivery plan, and — critically — the ONE
  divergence (CF parcel maps author obstacles + walkability deterministically; the legacy arena re-rolls
  them live). Reconciles the CF, network/engine, and BattleEngine models.
- **REGION-GATE-SPEC.md** — ⭐ (Map-maker, 2026-07-07): the CF-overworld travel requirement (§1.9 handoff) —
  continents **partitioned into REGIONS by barriers (ranges/rivers)**, linked only through **GATE parcels**
  (pass/bridge). The generator bakes 3 base-terrain fields — per-parcel `regionId`, per-crossing
  `isGate`/`connects`, per-barrier `regionBoundary` polyline (+ gate markers); CF renders the dotted-border
  overlay; landlord toll = runtime. ≥1 gate per boundary (reachability invariant). Extends the continuous-
  world macro layer.
- **CONTINUOUS-WORLD-TERRAIN.md** — ⭐ DECISION (Map-maker, 2026-07-07): the default terrain is **one
  authored continuous world per continent**; each parcel is a **window** cropped from it (rivers/roads/
  ranges continuous across parcels), modelled on a **real city per continent** from the aerial view. Adds a
  feature-network layer (roads + districts) to `world-terrain.json`, an **edge-freeze terraform rule**
  (edges frozen, interior free), and a new **CF aerial mosaic view** (tiled thumbnails). Stamps stay as the
  floor; author one continent/week. Extends the Atlas + macro-terrain brief.
- **ZONE-REGISTRY.md** + **`../../data/zone-registry.json`** — ⭐ THE CANONICAL 12-ZONE LIST (Map-maker,
  2026-07-07): the generator/sim input — `zoneId`, `zoneCode` (parcelId→zone lookup), locked continent
  **names** (Olympus·Fortuna·Tianxia·Mythoria·Porthaven·Arcadia·Aeropolis·Emberfall·Empyrea·Ironhold·
  Blackmere·Luxuria), `family` + `strengthMultiplier`/`zoneAvgStrength` (SURFACE ×1.0–1.3 · SKY fixed ×2.0 ·
  UNDERWORLD range ×2.5/3.5/5.0), biomeFamily, primaryElements, signatureMaterials, real parcel counts.
  The base pass reads biome/position; the seed pass reads family/strength for wild sizing.
- **WORLD-ZONE-DETAIL.md** + **`../../data/world-zone-detail.json`** — ⭐ FOR WORLD PLANNING (Map-maker,
  2026-07-07): full per-zone facts computed from the real extraction — parcel counts by L2 size class
  (EPIC/GIANT/LARGE/MEDIUM/SMALL), L3 singles, totals, density, worldOffset/viewBox, biome/elements/
  materials/strength. World totals: 8,482 L2 + 284,314 L3 = 292,796 parcels. The 12-zone planning table.
- **ZONE-BIOME-SEEDING-GUIDANCE.md** — ⭐ FOR THE ECONOMICS DEV (Map-maker, 2026-07-07): the map/terrain
  half of `MAP-ECONOMY-SEEDING-PARAMS.md` — all 10 zones (tier/biome/elements/server), a **materials ×
  zones richness matrix** (food/timber/stone/iron/gold/fish/obsidian/gems/aether/herb/arcane/light/dark),
  the **"broad but thin, concentrated rich"** gradient rule (iron minable everywhere, richest UW3), per-zone
  detail cards (materials/recruits/POI-types/wild-boss/hazards), and the resource-node vocabulary the
  generator must grow into. Grounded in the Atlas + biome-recruitment.
- **PET-AND-MASTER-HOMES.md** — ⭐ (Map-maker, 2026-07-07): which **PentaPet element-types populate each
  zone** (the wild + recruit pool per region — UW3/Luxuria = dark/mystic ✅) + each **Master's home zone**
  (home = the land of the Master's element, which its matching-element buff resonates with). Grounded in the
  228-pet element roster + the 12-zone registry. Blocker flagged: the 47 Masters have no element data yet
  (owner/API needed); Bosses (elements in-name) are homed.
- **MAP-MODES.md** — ⭐ (Map-maker, 2026-07-07): ONE map serves MANY modes — the spawn/entry **anchors are
  not enemy waves**; a MODE (Versus / Siege / Dominion / Guard / Duel / Clash) just lights up a subset +
  sets the win-point. Attacker enters by approach direction; defender holds the middle. Renderer spec for
  labels + a mode toggle/legend. Also documents the biome→ground-colour fix (desert no longer renders green).
- **ECONOMY-SEAM.md** — the three CF↔maps hooks: ownership feed, invest flow, payout note.
- **LAND-VALUE-AND-IMPROVEMENT.md** — PROPOSAL (for owner review): the land-layer economic model —
  how a landowner spends/burns CT to raise a parcel/estate's investment tier and unlock more resource
  tiles, strategic ground, defenses, and (estates only) castle grades; the improvement menu, value
  realization, guardrails, and open questions. Grounded in `INVEST_TIERS` + ECONOMY-SEAM + net-sink canon.
- **BATTLE-MAP-TEMPLATE-LIBRARY.md** — 24 open-field battlefield templates (real game maps +
  historical battlefields), the archetype taxonomy, A1-schema methodology, and the NEW
  battlefield-archetype appendix. Design input to expand the generator from 7 → ~48 archetypes.
- **CASTLE-TEMPLATE-LIBRARY.md** — 24 castle/fortification siege templates (real forts worldwide),
  each mapped to the estate "series of ±161 components, keep = final component" model, plus the NEW
  castle-archetype appendix (prioritizes a shared `wall()` primitive).
- **CONTINENT-TERRAIN-ATLAS.md** — the macro-terrain constitution of all 10 zones (BUS/EDU/ENT/HUB
  surface · HS1–3 sky · UW1–3 underworld), grounded in the real extracted geometry (worldOffset,
  bboxes, parcel counts): per-continent biomes/palettes, ranges/coasts/rivers, frontier edges, and
  seaport/airship/shaft/boss hotspots. The authored-override seed for `world-terrain.json`.
- **../briefs/MAP-MACRO-TERRAIN-AND-POSITION-CONSTRAINTS.md** — the world envelope (biome field +
  position-role + edge-type system) each parcel map is designed inside.
- **../briefs/MAP-GENERATOR-LLM-CURRICULUM.md** — the fitness function + repair loop + difficulty
  ladder that challenges the LLM to design playable, novel maps within that envelope.
- **MAP-LAYER-MODEL.md** — PROPOSAL: a map = a stack of toggleable OVERLAYS (pathing, entry points,
  build spots, resources, wild masters, walkability, ground texture…), each = an A1 array, each
  LLM-designable per-layer, each tier-limited; plus the ≥1-entry-per-edge invariant. The designer-UI
  + per-layer-LLM spec.
- **BIOME-RECRUITMENT-AND-ARMY.md** — PROPOSAL: biome-gated recruitment (element↔biome → which
  soldier/worker classes recruit on a map) feeding the persistent army.

## Live API quick-reference (moba.etherfantasy.com, lobby :8090 on the shared box)
- `GET  /internal/v1/designs[?status=]` · `GET /internal/v1/designs/:parcelId` (lazy v0; returns
  `{row, artifact, budget}`) · `GET …/thumb.png[?v=N]` — all public.
- `POST /internal/v1/designs/:parcelId/prompt|regenerate|freeze` — signed-in PG user
  (owner-enforced the moment the ownership feed exists) or `x-maps-key`.
- `POST /internal/v1/designs/:parcelId/invest {level:0..5}` — `x-maps-key` only (key file:
  `~/.ef_maps_key` on the box). CF charges the CT, then calls this.
- `GET /internal/v1/parcels` — world parcels ⊕ design status (feeds the /designer land map).
- Designer UI: https://moba.etherfantasy.com/designer

## Canon honoured
- Battlefield frame: fixed **±161 world-units (sizeM 322)**, center-origin, +z north; ~0.74 m/unit
  is a label, never a runtime transform. Estates = multiple ±161 components.
- Artifacts are Battlefield JSON (A1) verbatim: arena/lanes/obstacles/resources/buildSpots/
  spawnZones/structures/mobs + additive terrain grid & walkmask + meta(seed/budget).
- LLM emits parameters + a bounded features[] placement DSL — never geometry; budget-clamped,
  validator-gated, byte-identical per seed.
