# Map-maker hand-off — the authoritative recap before the 20K bulk run

> **The one doc to hand the map-maker team before generating base maps at scale.** Consolidates
> `MAP-PIPELINE-GLOSSARY.md` (the model) + `MAP-ECONOMY-SEEDING-PARAMS.md` (the economy layer) into a single
> checklist, organized around the thing that matters most here: **what gets BAKED into every one of the
> ~20K (world-wide ~293K) base artifacts — and is therefore expensive to redo — vs. what is LAZY and
> re-runnable.** Lock the first list before the bulk run; the second can evolve. Author: CF Overworld
> design, 2026-07-07.

## The core model (unchanged — hold it exactly)

**Five stages, one artifact, many views:**
```
① design params (LLM/designer, the RECIPE — never geometry)
   → ② generator (deterministic)
      → ③ THE ARTIFACT (raster JSON — terrain grid + obstacles + lanes + structures + spawns; SOURCE OF TRUTH)
         → ④ derived: B command.json (2D command view) · C render.json (3D) · D thumb.png (overworld + designer)
```
- The **LLM writes params, never map files.** "New version" = re-run ②→③→④.
- **A live match's own `battle_hello` map beats any static file.** Static = fallback only.
- **A CF parcel battle must resolve to ITS OWN artifact — never the shared 3-lane arena** (that's a test
  drop-in; rendering it in production is a bug).

---

## ⚠ THE RISK AXIS — bake-now vs. redoable (read this before generating anything)

| | **BASE TERRAIN (layer ①)** | **SEEDING (layer ②)** |
|---|---|---|
| **What** | landscape, biome, rivers, coast, hills, **bounds**, walkable field, **lane/entry skeleton** | resources, mob camps, boss, towers, command center, garrison — **the economy** |
| **When** | **bulk, up front — all ~20K at once** | **lazy, near-player** (or pre-batched later) |
| **Cost to redo** | **HIGH — a full 20K (→293K) regeneration** | **LOW — re-run ②→③→④ per parcel any time** |
| **⇒ Lock status** | **LOCK THE INVARIANTS BELOW NOW** | can evolve after launch |

**The whole point of this recap:** the base-terrain invariants (§1) are the expensive-to-change ones — get
them right before the bulk run. The economy/seeding catalog (§2) is lazy and re-runnable, so it's allowed to
iterate. Do **not** bake any economy content into the base pass.

---

## §1. BASE-TERRAIN invariants — LOCK before the 20K run (expensive to redo)

1. **Coordinate frame — FIXED ±161 world-units** (`sizeM = 322`), **center-origin**, **+z = north**,
   blue/ATTACKER SW · red/DEFENDER NE, **spawns ±131.6**, **cores ±114.8**, consumed **as-is (NO ×MAPK)**.
   Same frame for **every** parcel AND every estate component. *(Canon §4g — do not re-scale.)*
2. **Grid resolution — 161×161** terrain grid (`cells` + `walk`). This is the raster resolution baked into
   every artifact; changing it later = rebuild all. Confirm this is the resolution the 3D client + command
   converter both expect **before** bulk.
3. **Biome is DERIVED from world position, not chosen** — from the continuous world-terrain field /
   Continent Terrain Atlas (e.g. EDU zone `602…` = academy highland plateau). The generator reads the
   parcel's location → biome/edges; params don't hand-pick it for a real parcel.
4. **Continuous world** (`CONTINUOUS-WORLD-TERRAIN.md`) — parcels are **windows into one authored world**:
   **rivers/roads run continuous across parcel edges**; edge-freeze terraform. A parcel's edges must match
   its neighbours'. This cross-parcel continuity is baked at base time — the costliest thing to retrofit.
5. **Bounds = the parcel's ACTUAL shape**, normalized to arena scale (not a generic square).
6. **Lane/entry skeleton** — walkable field + lanes + **edge-spawn anchors on every edge** (a Master's
   overworld arrival enters at the edge matching approach direction and opens a NEW lane, canon decision
   11). Leave the anchors even though units are seeded later.
7. **Seed = the real `parcelId`** (deterministic). Same parcel ⇒ byte-identical base map forever.
8. **Land size → component count** — one ±161 map = the smallest parcel; estates are a **series** of ±161
   components (single 1 → EPIC ~480; castle = the final component). Base pass must know a parcel's component
   count from its size. *(Estates get pre-designed castle/wall maps — `CASTLE-TEMPLATE-LIBRARY.md`.)*

**If any of §1 is wrong, it's a 20K/293K rebuild. Confirm all 8 with OP 48 (3D client geometry) + the
integration/network session (match server) BEFORE the bulk run.**

---

## §2. SEEDING catalog — the economy layer (lazy, re-runnable — safe to evolve)

Placed by the generator into the artifact's `structures`/`mobs`/`resources` fields, deterministically from
`seed = parcelId + tier + biome`. Counts from `INVEST_TIERS` tier (0–5) × biome (`BATTLE-MAP-AND-UNIT-SPEC`
§1–2). **Never bake these into the base pass.**

| Entity | Count driver | Economy rule to encode |
|---|---|---|
| **Gold tile** | tier (2→8, biome split) | **FINITE**, enrich-seeded, depletes, no regrow; ~50 gold@100%; **match-local tactical** (trains elites), not overworld balance |
| **Wood grove** | tier + wood biome | **RENEWABLE**, regrow ~3 world-days; ~60 wood; feeds arms |
| **Ore/iron** | tier + ore biome (`UW3` default) | **FINITE**; ~40 iron; feeds arms + Industry |
| **Food-yield field** *(net-new)* | plains/leaf biome + tier | marks food-rich ground; **farmed on overworld** (upkeep + battle clock + pop growth), NOT in-battle |
| **Rare node** (gems=Carat/CT-tier) | tier-4+/wild, **boss-gated** | placed **latent**; **unlocks only on boss-clear**; finite window; needs an `unlocked` state flag |
| **Mob camp** | tier (1→6) | richer land = MORE monsters; strength per §3 |
| **BOSS** | tier-4+/wild | tuned **HARDER than the attacker** (net-sink); gates the rare node; 10-boss roster |
| **Command center** | tier | in-battle: **gold trains ELITES**; persists; capture = use |
| **Towers/walls/gates/traps** | tier (towers 0→6, walls 0→4) | **persist** across battles; let masterless land defend; pillage ≈30% materials |
| **Garrison/population** | ≥ `minGarrison` **100 pets** | the ≥100-per-side battle floor + the land's population (draft ≤50%→100%) |

**Biome also sets** the resource split (gold/wood/ore, owner bias ±20%) **and** the local unit species pool
(pets whose element sits in that biome). **Richer/higher-tier land can spawn STRONGER units.**

**Per-node flags the artifact must carry:** `reserve` (remaining amount) + `renewable` (true=wood /
false=gold,iron,rare) so the CF overworld tracks **depletion across battles** (anti-farm, decision-17-safe).

---

## §3. Zone strength — CANONICAL in `WORLD-ZONE-DETAIL.md` / `data/world-zone-detail.json`

Wild is **never trivially weak** — sized per zone. **The world-planning session has published the real
extraction — use it, not any earlier guessed bands:**

| Tier | Zones (`strengthMultiplier`) | `zoneAvgStrength` |
|---|---|---|
| **Surface** | HUB 1.0 · ENT 1.1 · BUS 1.2 · EDU 1.3 | 100 / 110 / 120 / 130 |
| **Sky (HS)** | HS1 · HS2 · HS3 — fixed ×2.0 | 200 each |
| **Underworld (UW)** | UW1 2.5 · UW2 3.5 · UW3 5.0 | 250 / 350 / **500** |

`zoneAvgStrength = 100 × mult`; the seed pass reads it per zone (keyed by `zoneId`; `zoneCode =
parcelId.slice(1,3)`). `UW3` = Luxuria, end-game, ore-default. Base-terrain **biome** also derives from the
zone: `biomeFamily`/`palettes`/`worldOffset`/`viewBox` are in `data/world-zone-detail.json`. **Sky ×2.0
(parallel, all three HS islands) is owner-CONFIRMED (2026-07-08)** — the 1/2/3× climb idea is dropped.

---

## §4. Determinism + thumbnails (why both layers must be pure functions of the seed)

- **No `Math.random` at generate/seed time — seeded RNG only.** Same seed ⇒ byte-identical artifact.
- **`thumb.png` (file D) textures the CF OVERWORLD** (canon decision 10) — so seeding's visible richness is
  what a player *sees* on the top-level map. Deterministic seeding ⇒ **stable thumbnails** + golden-master
  battles. A non-deterministic seed pass would make the overworld texture flicker and break reproducibility.

---

## §5. Integration sync (so the generated map actually drives the economy)

The map is only half the loop — these must travel allocate→match→callback (full table in
`MAP-ECONOMY-SEEDING-PARAMS.md` §3; confirm with integration/network + OP 48):
- **Allocate:** engine **consumes the CF artifact's obstacle + walk layers as-is** (deterministic — CF does
  **not** re-roll obstacles like the legacy arena; **glossary open-Q #1, load-bearing**); ±161 frame;
  elite:line **1:3 deploy cap**; **food→morale battle clock** (min 5 min → 10% floor); zone wild band.
- **Callback:** casualties (line/elite/worker), **arms consumed + 30% salvage of all fallen**, outcome incl.
  **DRAW / RETREAT** (retreat: 5–30% arms, 10–80% units, ~30% convert to enemy), **in-match gold stays
  match-local**, **rare-node unlock flag**, swift-win raw metrics (speed/kills/survivors).

---

## §6. The invariant that overrides everything (decision 17)

**Nothing in-match mints CT.** Gold/wood/iron/food are **backend resources**; CT is the on-chain base
layer, **per-user capped**. The match reports resource *flows*; **CT settlement stays CF-side**. In-game
rewards = **earning back your own spend** (boss = net sink); **net-positive only via leaderboard +
discretionary vault grants**. The base loop is negative-sum by construction — the map/seed must never
create a CT faucet.

---

## Pre-flight checklist — tick before generating the 20K

- [ ] **§1.1–1.8 base-terrain invariants confirmed** with OP 48 (client geometry) + integration/network
      (match server): ±161 frame, **161×161 grid res**, biome-from-world, **continuous edges/rivers**,
      real-shape bounds, edge-spawn skeleton, `parcelId` seed, size→component count.
- [ ] **Base pass carries ZERO economy content** (no resources/mobs/towers/garrison) — seeding is a
      separate, later pass.
- [ ] **Determinism proven** — regenerate a sample parcel twice → byte-identical artifact + thumbnail.
- [ ] **Continuity proven** — two adjacent parcels' shared edge (river/road) lines up.
- [ ] **Seeding catalog (§2) + zone input (§3)** agreed as the layer-② contract (can evolve, but agree the
      fields/flags now so the artifact schema has slots: `reserve`, `renewable`, rare-node `unlocked`).
- [ ] **Integration params (§5)** acknowledged by integration/network + OP 48 (esp. **artifact obstacle/walk
      authority** — the load-bearing one).
- [ ] **Decision-17 no-mint** acknowledged.

**Bottom line for the map team:** lock **§1** now (it's baked into all 20K/293K); treat **§2** as a
re-runnable contract you can iterate; keep everything **deterministic**; and make sure **§5** is agreed so
the beautiful maps you generate actually settle the economy correctly.
