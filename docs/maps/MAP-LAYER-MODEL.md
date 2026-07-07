# Map Layer Model — toggleable overlays, per-layer LLM design, tier limits (PROPOSAL for review)

> **Status: PROPOSAL for the product owner.** Formalizes the owner's layer idea (2026-07-06): a map is
> a stack of independent OVERLAYS (pathing, entry points, build spots, resources, wild masters,
> walkability, ground texture…), each **enable/disable-able**, each **LLM-designable per-layer**, each
> **limited by land tier/investment**. The key: **this is already the shape of the A1 schema** — every
> array is a layer. This doc names the layers, their A1 backing, their tier limits, and the invariants.
> Companions: `BATTLEFIELD-SCHEMA.md` (A1), `MAP-GENERATOR-LLM-CURRICULUM.md` (how the LLM designs),
> `MAP-MACRO-TERRAIN-AND-POSITION-CONSTRAINTS.md` (the world envelope), `LAND-VALUE-AND-IMPROVEMENT.md`
> (tiers). Author: Clash Front Overworld design session, 2026-07-06.

---

## 0. TL;DR

A battlefield is **one artifact rendered as N independent layers**. In the designer each layer has an
**on/off toggle**; the **LLM can (re)design any single layer** in place (leaving the others fixed); and
each layer's **count/richness is capped by the land's investment tier** (`INVEST_TIERS`) so a basic
parcel can place *a few* of a thing and a Golden estate *many* — never unlimited. Two hard rules hold
for every map: **connectivity** (units can path) and **≥1 reinforcement entry point per edge**.

---

## 1. The layers (each = an A1 array = a toggleable overlay)

| # | Layer (overlay) | A1 backing | Toggle | LLM designs it | Tier limit (`INVEST_TIERS`) |
|---|---|---|---|---|---|
| 1 | **Ground / biome texture** | `meta.biome` + `meta.params.palette` + `terrain.cells` | selector (palette) | from macro-terrain (fixed by zone) | — (biome is derived, §MACRO-TERRAIN) |
| 2 | **Walkability / obstruction** | `terrain.walk` + `obstacles[].passable:false` | on/off | yes (place blockers) | `density`, `roughness` |
| 3 | **Soldier pathing (lanes)** | `lanes[]` `{id,side,waypoints}` | on/off per lane | yes | `laneCount` 1→3 |
| 4 | **Unit entry points** | `spawnZones[]` (per edge) | on/off per edge | yes | — (but **≥1 per edge required**, §3) |
| 5 | **Build spots (optional)** | `buildSpots[]` | on/off | yes | tier caps the COUNT |
| 6 | **Resources (tree / gold)** | `resources[]` GOLD_MINE / WOOD_GROVE | on/off | yes | `resourceNodes` (2→8) · `resourceRichness` (40%→100%) |
| 7 | **Defensive structures (towers/walls/gates)** | `structures[]` TOWER/WALL/GATE (CORE fixed) | on/off | yes | `towers` (0→6) · `barriers` (0→4) |
| 8 | **Wild masters / camps / bosses** | `mobs[]` | on/off | yes | `mobCamps` (1→6) |
| 9 | **Landmark (rarity)** | `obstacles[]` landmark kinds + `landmarkAt` | on/off | yes | tier ≥2 only |
| 10 | **Décor / props (visual)** | `obstacles[].passable:true` (trees/rocks) | on/off | yes | `density` |

Rendering already treats these as layers: the 2D command view (`battle.js drawBattlefieldMap`) and the
3D preview draw each array in its own pass, so **toggling a layer = skip that array's draw + omit it
from the artifact**. No renderer change is needed to support toggles — the data already separates.

---

## 2. Per-layer LLM design (design one overlay at a time)

The curriculum's generate→score→repair loop runs **per layer**: the LLM is handed the current artifact
+ ONE target layer + that layer's tier budget, and returns only that layer's params/features. The
generator re-bakes just that array; the validator re-checks the whole map. Benefits:

- **Iterate a single layer** ("re-roll the resources, keep the lanes/towers") — cheap, targeted.
- **Enable a layer on demand** ("add wild camps to this map") without disturbing the rest.
- **Owner-directed** ("more gold on the east side") maps to a single-layer prompt.
- Determinism preserved: each layer bakes from `seed ^ layerIndex`.

Layers have **dependencies** the LLM must respect: pathing (3) + entry points (4) depend on walkability
(2); structures (7)/resources (6)/mobs (8)/buildSpots (5) must sit on walkable ground and not seal a
lane/spawn. The validator enforces these regardless of what the LLM proposes.

---

## 3. Invariants (hold for EVERY map, tier-independent)

1. **Connectivity** — every lane pathable end-to-end; no spawn walled off (existing invariants 1–2).
2. **≥1 reinforcement entry point PER EDGE (NEW — owner 2026-07-06).** Every map edge must expose at
   least one `spawnZone` (or entry corridor) reachable from the interior, because marching
   reinforcements can arrive from ANY edge (canon decision 11 / `docs/04` §7b). A `sea`/`mapVoid` edge
   (constraints brief §4) is exempt — it is not a valid arrival edge — but every *land/pass/river* edge
   needs one. **Proposed as validator invariant 1b**; the generator auto-carves an entry if a layer edit
   would leave a land edge with none.
3. **On-walkable placement** — build spots, resources, structures, mobs, landmarks on walkable ground
   (existing invariant 3).
4. **Base clear radius** around each CORE (existing invariant 4).
5. **Determinism** (existing invariant 5).

Toggling layers can never break 1–5: disabling a layer just removes optional content; the validator
still guarantees the remaining map plays and every land edge can reinforce.

---

## 4. Tier limits = the land's "how many" budget

Counts are **not** free — they scale with how much CT was invested (the `INVEST_TIERS` ladder in
`map-service/maps/schema.js`, and `LAND-VALUE-AND-IMPROVEMENT.md`). A **basic (tier-0) parcel**: 2
resource tiles, 0 towers, 1 camp, no landmark. A **Golden (tier-5) estate**: 8 tiles, 6 towers, 6 camps,
4 barriers, landmark. So "place 10 gold mines, not 1000" is enforced by `clampParams(params, budget)` —
the LLM is TOLD the budget and hard-clamped to it; a fresh parcel literally cannot fake a rich map. Land
CLASS also gates layers: only **estates** unlock the WALL/GATE/keep structures (castle grade, decision 5).

| Layer | tier-0 (basic) | tier-5 (Golden) |
|---|---|---|
| Resources (tree/gold) | 2 @ ≤40% | 8 @ 100% |
| Towers | 0 | 6 |
| Barriers/walls | 0 | 4 |
| Wild camps | 1 | 6 |
| Landmark | — | 1 |
| Build spots | ⚙ small | ⚙ larger |
| Lanes | 1 | up to 3 |

(Build-spot and lane caps to be added to `INVEST_TIERS` when this is ratified — currently only the six
above are budgeted.)

---

## 5. Designer UI (what this implies to build)

- A **layer panel**: one row per layer (§1) with an **eye toggle** (show/hide + include/exclude from the
  saved artifact) and a **"✨ design this layer"** button (fires the per-layer LLM loop, §2).
- Each layer shows its **tier budget** ("Towers 2 / 3 used") and blocks over-placement.
- A **ground-texture selector** (palette) on layer 1.
- **Invariant guardrails**: the editor refuses to save a map that fails §3 (e.g. a land edge with no
  entry point) and offers "auto-fix" (carve an entry / open a lane) — same repairs the generator uses.
- The saved artifact is exactly the union of enabled layers → renders identically in the 2D command view
  and 3D preview (the layers ARE the arrays).

---

## 6. Ties to existing systems

- **`docs/briefs/BATTLEFIELD-SCHEMA.md`** — the A1 arrays that ARE the layers.
- **`docs/briefs/MAP-GENERATOR-LLM-CURRICULUM.md`** — the per-layer generate→score→repair loop.
- **`docs/briefs/MAP-MACRO-TERRAIN-AND-POSITION-CONSTRAINTS.md`** — layer 1 (biome) + the per-edge type
  system that decides which edges need an entry point (§3.2).
- **`docs/maps/LAND-VALUE-AND-IMPROVEMENT.md`** + **`map-service/maps/schema.js INVEST_TIERS`** — the
  tier budgets that cap each layer's count (§4).
- **Canon decisions 9 (build anchors), 11 (edge reinforcement), 5 (estates-only castles), 13 (net-sink /
  full-CT drafting).**
