# Map Macro-Terrain & Position Constraints — the world envelope the LLM designs INSIDE

> **Companion to** `MAP-GENERATOR-LLM-CURRICULUM.md` (how the LLM is challenged) and the
> `docs/maps/BATTLE-MAP-TEMPLATE-LIBRARY.md` + `CASTLE-TEMPLATE-LIBRARY.md` (the 48 archetypes) and
> `docs/maps/CONTINENT-TERRAIN-ATLAS.md` (the authored per-zone overrides).
> **For:** the map-maker session (`map-service/maps/*` generator) + the overworld.
> Author: Clash Front Overworld design session, 2026-07-06.

## 0. The governing principle

**Position, shape, biome, and edge-type are DERIVED facts — hard constraints — not LLM choices.**
The overworld map is FIXED (canon decision 1). Where a parcel sits determines its bounds polygon
(pentagon-clipped at map edges), its biome (from a smooth world field), its elevation, and what each
of its edges *is* (land / sea / map-void / river / pass). The LLM designs only the **tactical
interior** — lanes, cover, chokes, structures — *inside* that envelope. This:

1. **Kills incoherence** — no desert beside grassland, because biome comes from a continuous field, not
   a per-parcel dice roll.
2. **Guarantees seams match** — adjacent parcels agree on their shared edge for free (both read the
   same world field at the same boundary; determinism stitches them — no cross-parcel messaging).
3. **Maximizes the design challenge** — a coastal-highland-river parcel with one map-void side and a
   through-flowing river is a *far* harder, more interesting problem than a blank ±161 box (see the
   curriculum brief). Variety emerges from the WORLD, not from the LLM guessing biomes.

Two layers produce the envelope: the **Master Terrain field** (macro, §1–2) and the **Position Role +
edge-type** classifier (per-parcel, §3–4). §5 is the coherence contract; §6 is the exact envelope
handed to the LLM; §7 is the `world-terrain.json` asset; §8 is the build plan.

---

## 1. The Master Terrain field (macro biome coherence)

Biome is sampled from a **smooth, low-frequency world field**, never per-parcel random. For each
parcel center `(wx, wz)` (world coords via `zone-layout.json worldOffset`) compute three scalars:

| Field | Source | Range |
|---|---|---|
| **elevation** | authored range overrides ∪ 3-octave value-noise; underworld tiers forced low, sky tiers forced high | 0..1 (sea-level 0.35, snowline 0.8) |
| **moisture** | distance-to-water falloff + 2-octave noise (wetter near coasts/rivers) | 0..1 |
| **temperature** | latitude band (world-z) − elevation lapse + zone theme bias | 0..1 |

All three are **deterministic** (seeded noise, no `Date.now`/`Math.random`) and **continuous**, so
neighbors differ by a small delta. Continents bias the fields (a desert zone shifts moisture down; a
sky zone forces elevation up) — see the Continent Terrain Atlas.

### 1a. The biome matrix (Whittaker-style → the 8 palettes)

`(elevation, moisture, temperature) → biome`, mapped onto the existing palettes so the renderer +
generator need no new colors:

| Condition | Biome | Palette | Renderer BIOME |
|---|---|---|---|
| low elev · hot · dry | Desert / dunes | `desert` | DESERT |
| low elev · hot · wet | Jungle / marsh | `swamp` | TEMPERATE_FOREST |
| low-mid · temperate · mid-wet | Grassland / steppe | `verdant` | TEMPERATE_GRASS |
| mid · temperate · wet | Temperate forest | `verdant`/`autumn` | TEMPERATE_FOREST |
| mid · cool · seasonal | Autumn woodland | `autumn` | TEMPERATE_FOREST |
| mid · mild · blossom (authored sacred) | Sakura grove | `sakura` | TEMPERATE_FOREST |
| high elev · cold | Alpine / tundra / snow | `tundra` | SNOW |
| any · authored hot-zone | Volcanic / ash | `volcanic`/`ashen` | VOLCANIC |

**Transition bands are mandatory:** two biomes ≥2 steps apart on the wheel may only meet across an
authored transition (river valley, oasis, foothill, coastline). The field's smoothness makes this the
default; the atlas names the deliberate exceptions.

### 1b. Continuous features (cross parcels — never stop at a boundary)

- **Rivers** flow downhill along the elevation gradient through a CHAIN of parcels: each riverine
  parcel records `{enters: edge, exits: edge, width}` that matches its upstream/downstream neighbors.
- **Coastlines** are one contiguous sea region; a parcel is coastal iff any neighbor (or the map void)
  is sea. The sea edge is the same waterline both parcels see.
- **Mountain ranges** are ridge-connected chains (authored spines + elevation threshold), not lone
  peaks; a `pass` edge on one parcel is a `pass` edge on its neighbor.

---

## 2. Vertical tiers (sky / surface / underworld are their own biome families)

The world is three stacked tiers (`HS*` sky islands ↑ / `BUS EDU ENT HUB` surface / `UW*` underworld ↓).
Each is a distinct biome family so the tiers read as different worlds:

- **Sky (HS1–3)** — floating islands: forced high elevation, `void-rim` bounds (island edges = OOB
  drop, not land), thin scattered land, `skyPlateau` archetype, sakura/verdant/tundra palettes.
  Reached only by airship (edges are void, so no land approach — reinforcement lanes arrive at a dock).
- **Surface** — the standard biome matrix (§1a) across the city-continents.
- **Underworld (UW1–3)** — forced low elevation, no sky, `cavernWarren`/`volcanic` families, `carve`
  negative-space, HAZARD lava terrain, boss-gated descent. Edges are rock/void, lit by authored glow.

Tier is a hard field on every parcel; it overrides the surface biome matrix.

---

## 3. Position Role classifier (per-parcel, derived)

From the parcel's **polygon + adjacency + the macro field**, classify its role (drives special
elements, §4). A parcel may carry several tags (coastal + highland + frontier):

| Role | Trigger | Injects |
|---|---|---|
| **Interior lowland** | central, full polygon, low elev | open, resource-rich; `openSteppe`/grass |
| **Edge / Pentagon** | on map boundary — a clipped side | that side = `mapVoid`: OOB beyond bounds, **no spawn there**, frontier cliff/fog |
| **Corner** | ≥2 clipped sides | two walled void sides; back-to-corner last-stand shape |
| **Coastal** | a neighbor/edge is sea | one edge = impassable water + **beach-landing spawn**; seaport slot on estates |
| **Riverine** | a river crosses | water enters+exits at neighbor-matched edges; ford/bridge = the choke |
| **Mountain / highland** | high-elev range zone | CLIFF/ROCK dense, chokier, `ridgePasses`; passes = only routes; +defense |
| **Frontier** | edge of an ENABLED zone (faces disabled land / "beyond the frontier") | walled void side, watchtower landmark |
| **Crossroads** | high adjacency + central | +1 lane, a trade-road through, +landmark rarity |
| **Sky-island** | HS tier | void-rim bounds, airship-dock spawn, sparse land |
| **Deep** | UW tier | cavern carve, HAZARD lava, boss/glow |

## 4. Per-edge type system (the machinery)

Every one of a parcel's polygon edges gets a type — this single tag drives spawns, walls, and lanes:

| Edge type | Meaning | Effect on the arena |
|---|---|---|
| `land` | borders a land neighbor | normal — spawn/lane allowed |
| `sea` | borders the sea | impassable water band; beach spawn only; no lane exits here |
| `mapVoid` | map boundary (pentagon clip) or disabled zone | OOB beyond bounds → cliff/void wall; **never a spawn** |
| `river-crossing` | a river enters/exits here | forces a water gap + a ford/bridge lane at the matched point |
| `mountain-pass` | a range gap shared with a neighbor | the only walkable throat on that side |

**Spawn/lane law:** attacker/defender spawns and reinforcement edge-lanes may only sit on `land`,
`river-crossing`, or `mountain-pass` edges (canon: reinforcements enter at the approach edge). `sea`
and `mapVoid` edges are sealed — this is how a pentagon edge parcel correctly refuses a spawn on its
missing side.

---

## 5. The coherence contract (why seams match with zero coordination)

Adjacent parcels are generated **independently** yet agree on their shared boundary, because both read
the **same macro field at the same edge**. Concretely, for the shared edge between A and B:
- biome/elevation are sampled at the shared midpoint → both get the same values (± the smooth delta).
- if a river crosses there, both derive `{crossing, point, width}` from the same flow field → A's
  `exits:E` == B's `enters:W`.
- if it's the coastline, both see the same waterline; if it's the map void, both see OOB.

So there is **no cross-parcel messaging, no locking, no ordering dependence** — determinism stitches
the world. This is the same property that makes the whole sim deterministic (AGENTS.md prime
directive). The atlas's authored overrides are also global fields, so they compose the same way.

---

## 6. The constraint envelope handed to the LLM

The generation brief (see the curriculum) gains a **context envelope**. Mark which fields are HARD
(the LLM must honor them exactly) vs SOFT (its design freedom):

```jsonc
{
  // ── HARD (derived; the LLM may NOT change these) ─────────────────────────
  "bounds":  [[...]],                    // the parcel's REAL polygon (pentagon if edge)
  "edges":   { "N":"land", "E":"sea", "S":"river-crossing", "W":"mapVoid" },
  "tier":    "surface",                  // sky | surface | underworld
  "macro":   { "biome":"TEMPERATE_FOREST", "palette":"autumn",
               "elevation":"highland", "moisture":0.6, "temperature":0.4,
               "continent":"ENT", "zone":"ENT" },
  "through": { "river": { "enters":"S", "exits":"N", "width":14 } },  // must stay continuous+walkable
  "roles":   ["coastal","highland","riverine"],
  "landmarkSlot": "CRATER_LAKE",         // position-seeded rarity (or null)
  "investTier": 3,                       // budget ceiling (schema INVEST_TIERS)

  // ── CONTEXT (for coherence + fidelity; not directly emitted) ─────────────
  "neighborBiomes": { "N":"FOREST", "E":"OCEAN", "S":"FOREST", "W":"ALPINE" },
  "brief": "a defender-favored river-crossing on a forested highland coast; novel"

  // ── SOFT (the LLM designs this: lanes, cover, chokes, structures, features) —
}
```

**Why this maximizes challenge (see curriculum §difficulty ladder):** the LLM must produce a *playable,
balanced, novel* map that simultaneously (a) routes the through-river S→N and keeps it walkable/forded,
(b) seals the `sea` and `mapVoid` edges and spawns only on valid edges, (c) reflects highland
(chokier, cliff cover) + forest palette, and (d) still scores on balance + interest + fidelity +
novelty. It cannot fall back on "scatter trees on a square." Every constrained parcel is a distinct
tactical puzzle — the world guarantees variety the LLM would never invent on its own.

Hard-constraint violations are **auto-rejected before scoring** (a spawn on a `sea` edge, a walled-off
river, bounds mutated) — same trust boundary as `clampParams`. The generator/validator repair what it
can (carve the ford) and bounce what it can't.

---

## 7. `world-terrain.json` — the static asset

Precompute ONCE (offline), store beside `data/parcels.json`, read at generation time (browser-light,
zero runtime cost, fully deterministic):

```jsonc
{
  "version": 1,
  "field": { "seed": "cf-world-v1", "seaLevel": 0.35, "snowLine": 0.8, "octaves": 3 },
  "overrides": [                         // authored regions (from the Continent Terrain Atlas)
    { "kind":"range",   "zone":"ENT", "spine":[[..],[..]], "elevation":0.9 },
    { "kind":"sea",     "edgeOf":["BUS","ENT"], "line":[[..],[..]] },
    { "kind":"volcanic","zone":"UW1", "region":[[..]] },
    { "kind":"river",   "path":[[src],..,[mouth]], "width":14 }
  ],
  "parcels": {                           // baked per-parcel result (the field sampled + roles)
    "60203370020": { "tier":"surface", "biome":"TEMPERATE_FOREST", "palette":"autumn",
      "elevation":"highland", "moisture":0.61, "temperature":0.42,
      "edges":{"N":"land","E":"sea","S":"river-crossing","W":"mapVoid"},
      "roles":["coastal","highland","riverine"],
      "through":{"river":{"enters":"S","exits":"N","width":14}},
      "landmarkSlot":"CRATER_LAKE" }
    // …one entry per parcel
  }
}
```

- **`overrides`** = the authored layer (mountains, seas, deserts, sacred zones) — the owner's
  "designate mountains etc. later" (canon decision 2). The Continent Terrain Atlas is the source list.
- **`parcels`** = the baked result: the field sampled + roles + edges classified per parcel. This is
  what the generator reads. Rebake only when overrides change (rare) — parcel results are otherwise
  permanent (parcel geometry is fixed, canon decision 1).

---

## 8. Build plan

1. **`world-terrain.json` baker** (offline script, deterministic): sample the field + apply overrides
   → per-parcel `{tier, biome, palette, elevation, moisture, temperature, edges, roles, through,
   landmarkSlot}`. Needs parcel polygons + adjacency (from `data/hexagon-city-source/`) + the atlas
   overrides. ~a few hundred lines; no runtime cost.
2. **Position/edge classifier** (~50 lines over parcel geometry + adjacency): the role + edge-type
   derivation (§3–4). Unit-testable on a handful of hand-placed parcels.
3. **Generator intake**: `generate()` accepts the parcel's `world-terrain.json` entry as HARD
   context; `clampParams`/validator enforce the envelope (reject spawns on sealed edges, walled
   rivers); the LLM brief includes the envelope (§6).
4. **Atlas overrides**: the Continent Terrain Atlas (background session) fills `overrides` per zone.
5. **Determinism test**: same parcel + same `world-terrain.json` ⇒ byte-identical map; adjacent
   parcels agree on shared-edge facts (the coherence contract, §5).

This layer + the curriculum + the 48 templates = the full spec: **what the world imposes** ·
**how the LLM is challenged** · **the archetype vocabulary**.
