# Repurposing Plan — EF MOBA → Clash Front Battle Engine

> Deliverable of the battle-engine discovery mission (item 5 of the brief). Companion:
> [`BATTLE-ENGINE-DISCOVERY.md`](./BATTLE-ENGINE-DISCOVERY.md) (findings; §-references below point
> there unless noted). Aligned with clashfront canon: `docs/04-battle-system.md` (§7b battlefield
> generation, §4 drop-in, §6 result feedback) and `docs/09-api-contracts.md` §5 (allocation +
> result callback wire schema).
>
> Effort scale: **S** ≤ 1 focused day · **M** ≤ 1 week · **L** multi-week. Estimates assume one
> engineer/agent familiar with the codebase after reading the discovery report.

## 0. Strategy in one paragraph

Keep the MOBA's authoritative server sim as the battle kernel (deterministic, headless-proven,
tiny) and grow four new layers around it: **(A) battlefield data + generator** (the hex-shaped,
seeded terrain the sim and renderer both consume), **(B) battle-type rules** (FIELD/SIEGE/NAVAL
win conditions and unit behaviors replacing MOBA furniture), **(C) army-scale simulation**
(spatial hashing, squads, pathfinding, snapshot compression), and **(D) the orchestration
adapter** (HTTP allocate → match → signed result callback). Hero drop-in **(E)** ports the
possession model the P2P client already proved onto the server path. The client is re-pointed at
server-supplied battlefield data last **(G)** — headless AUTO/ACCELERATED battles (D+E) are
useful to Clash Front before a single pixel changes.

**Hard external dependency:** battlefield component dimensions = smallest-parcel size from the
hexagone-city extraction (maps session). Items A2+ are blocked on `data/parcels.json`; A1 and
everything in B/D/F can proceed against a placeholder hex radius behind a constant.

## 1. Ordered work items

### A. Battlefield foundation (the hexagon part)

**A1. Battlefield data model + shared loader — M**
Define `Battlefield`: hex boundary polygon (flat/pointy orientation + radius), heightfield
(closed-form control points, pve-style — see discovery §2.5), obstacle set `{x,z,r|polygon}`,
terrain-cost/impassable regions (water, cliffs), spawn zones per side (attacker edge / defender
center per battle type), structure anchor slots, and prop-scatter spec (cosmetic, client-only).
Serialize as plain JSON so the same object drives server sim and client renderer — this kills the
dual-map divergence (discovery §2.3) permanently.
*Deps:* none (placeholder radius). *Risk:* over-modeling — keep v1 to what `movement/combat`
actually read (bounds, obstacles, costs, spawns).

**A2. Deterministic battlefield generator — L**
`generate(seed) → Battlefield` with `seed = f(hexId, terrain, zoneType, development, structures)`
per docs/04 §7b, built on `sim/rng.js` (mulberry32). Biome tables keyed by `HexTerrain`
(PLAINS/FOREST/HILLS/MOUNTAIN/RIVER/COAST): elevation control points, obstacle density, water
features. Golden-master test: same inputs ⇒ byte-identical battlefield JSON.
*Deps:* A1; parcel size (for radius/area); biome designations (open question w/ product owner).
*Risk:* gameplay quality of generated terrain needs iteration — ship behind a versioned
`generatorVersion` field so battlefields can be regenerated when the algorithm improves without
breaking determinism guarantees for in-flight battles.

**A3. Hex bounds + terrain in the sim — M**
Replace the three square clamps (`config.MAP` in `step.js`/`movement.js` + the duplicated
literals in `abilities.js:24`) with `battlefield.clamp(pt)` (point-in-hex + edge projection);
movement checks impassable regions; abilities respect obstacle occlusion where the design wants
it. Delete the `MAP_MIN/MAX` duplication while at it.
*Deps:* A1. *Risk:* low — discovery §2.1 shows total square coupling is ~10 lines + literals.

**A4. Pre-designed estate set pieces — M (content L, ongoing)**
Loader path for hand-authored `Battlefield` JSON (castle/city-wall maps referencing real castle
design per canon). Engine-side this is just "load instead of generate"; the authoring itself is
content work outside this plan.
*Deps:* A1, B2 (structures). *Risk:* content pipeline/tooling appetite — flag early.

### B. De-MOBA the rules (battle types)

**B1. Strip MOBA furniture; pluggable win conditions — M**
Remove from the Clash Front path: lanes/waves (`ai.js:13-30`), towers, cores + tower-gated shield
(`combat.js:8-36`), camps, shop/`buy`, at-base respawn, passive gold, DRAFT champion select.
Introduce `BattleRules` per `BattleType`: FIELD = army rout/annihilation or timeout; SIEGE = keep
objective falls / garrison surrenders; NAVAL = fleet destruction/withdrawal. Keep the legacy MOBA
assembled from the same systems behind a mode flag (the MOBA product keeps running).
*Deps:* none — can start immediately. *Risk:* hidden coupling in `killUnit`/`giveXp` bounty
logic; sweep for `kind === 'core' | 'tower'` conditionals.

**B2. Structures with persistent HP — M**
`StructureState` units (walls/gates/towers as battlefield-anchored destructibles) hydrated from
the battle context with **incoming HP** and reported back as `structureDamage` deltas
(docs/09 §5 result schema). Walls block movement (feeds A3/C2 nav); gates are attackable
passables; keep = SIEGE win objective.
*Deps:* A1 anchors, B1 rules hooks. *Risk:* wall-as-obstacle vs pathfinding interplay — land C2
first or gate B2 behind it.

**B3. NAVAL variant — M**
Sea-hex battlefields (open water + reefs/islets as obstacles), SHIP unit class with turn-rate
movement flavor, embarked-cargo loss rule on ship death (canon docs/04 §7). Lowest priority of
the three types (canon: harbor *capture* is still a SIEGE).
*Deps:* A2 water biomes, C1. *Risk:* movement feel; scope-box to "floating FIELD" v1.

### C. Army-scale simulation

**C1. Spatial hash + army/squad model — L**
Grid-bucket index for `nearest()`/`aoe`/`lineShot` (discovery §4.2). Armies enter as
`UnitStack`s (docs/09 §5 allocate schema: `unitClass, count, veterancy, hp`) → spawn as
**squads** (n soldiers sharing one brain: target picking, formation slot, morale state), with
per-soldier state kept minimal (position, hp, attack cooldown). Squad-level AI decisions at
5–10 Hz, per-soldier steering at tick rate. Benchmark gate: 2×600 soldiers at 30 Hz on one core
with ≥50% headroom; if it fails, raise soldiers-per-visual-unit abstraction rather than lowering
army sizes.
*Deps:* B1 (unit taxonomy). *Risk:* the central perf bet of the whole program — do the benchmark
**first**, as a spike, before polishing behaviors.

**C2. Pathfinding — L**
Nothing exists today (discovery §4.1). Recommended: coarse nav grid baked from `Battlefield`
(obstacles + terrain costs) + A* for squad routes + local steering (existing push-outs survive as
the local layer); flow-field per assault objective is a natural SIEGE upgrade. Heroes can stay on
straight-line + push-out steering v1 (players route themselves around terrain).
*Deps:* A1/A3. *Risk:* biggest new-code system; keep the grid coarse (squad-width cells) and
resist navmesh perfectionism.

**C3. Snapshot compression + interest management — M**
Full-world 30 Hz JSON dies at army scale (discovery §3.2). v1: send squads as aggregates
(centroid, formation, count, hp-sum) + individually only heroes/structures/projectiles near the
client camera (AOI); delta-encode vs last ack'd snapshot; drop to 10–15 Hz for non-hero entities
(client already interpolates ~110 ms). Binary encoding is a later optimization — aggregate-first
wins 10× before byte-shaving.
*Deps:* C1 squads. *Risk:* client render must consume aggregates (G1 coupling).

### D. Orchestration adapter (Clash Front ⇄ battle engine)

**D1. Allocation API — M**
`POST /internal/v1/matches/allocate` on the game server per docs/09 §5, `Idempotency-Key =
battleId`: validate the battle context (armies, heroes, terrain block, modifiers, callbackUrl),
run the A2 generator from the context seed, create a `Match` in a **waiting-for-join** state
(replaces DRAFT; join deadline from the request), return `{efMobaMatchId, joinDeadline}`. Seed
becomes context-derived (`World.seed + battle.id` style), replacing `Date.now()` (discovery §3.1).
*Deps:* B1 (context → world build); A1 minimum. *Risk:* low — the matchmaker shrinks to a
registry keyed by match id + battle ticket.

**D2. Result callback + service auth — M**
On match end (or timeout/checkpoint), POST the result to `callbackUrl` per docs/09 §5:
`{efMobaMatchId, winner, heroContributions[{heroId, side, rawImpact, kills, objectives}],
casualties{armyId: n}, structureDamage[], durationMs}`, `Idempotency-Key = efMobaMatchId`, HMAC
(grow the loot-ticket pattern, discovery §3.5) with retry/backoff and result persistence until
ack'd. Also: reject unauthenticated `join` for battle matches — joins require a signed battle
ticket (battleId, heroId, side, exp) issued by Clash Front, closing the open-WS hole.
*Deps:* D1. *Risk:* delivery semantics (server dies mid-battle) — persist result-before-send;
clashfront side already specifies idempotent replay ack.

**D3. Headless AUTO/ACCELERATED runner — S**
The payoff item, and it's small: `runBattle(context) → report` looping `step()` to terminal state
(golden-master already proves the pattern, discovery §4.3). AI-led heroes get bot brains (existing
bot AI + B1 rules). Expose as an allocate-request flag or an in-process library for the clashfront
tick engine. Add checkpoint emission (serialize `world` every n ticks) for the docs/04 §6 crash
path.
*Deps:* B1, D1 context-build; benefits from C1 but works at small scale before it.
*Risk:* none notable — highest value-to-effort item in the plan.

**D4. Hero performance accounting — S**
Track per-hero `kills / objectives / damage / presence` during the match; normalize to
`rawImpact` 0..1 in the report. Clamping to `HERO_IMPACT_MAX` is **Clash Front's job** (canon
docs/09 §5) — the engine only reports raw numbers.
*Deps:* D2 schema. *Risk:* metric design (what counts as "objectives") — propose, let product
owner tune.

### E. Drop-in, reinforcement, bot backfill

**E1. Late seat attach / possession — M**
Decouple seats from world creation: battle matches start with all heroes AI-driven (bot brains);
a joining player **possesses** an existing AI hero (sets `owner`, clears bot flag), disconnect
reverts to AI (discovery §3.3 — the P2P client already implemented exactly this UX; port the
model, not the code). Delete the live-leaver-forfeit rule for battle matches
(`net/match.js:234-236`). Enforce join windows (lobby deadline, reinforce window % from canon
docs/04 §2) server-side.
*Deps:* D1 (waiting state), B1. *Risk:* snapshot/reconciliation for a hero that was AI a frame
ago — the `ackSeq` plumbing already handles fresh-start prediction, expect minor client work.

**E2. Reinforce mid-RUNNING — S**
Same possession path gated by the reinforce window + `MAX_HEROES_PER_SIDE`; spawn location =
side's rally zone from `Battlefield`.
*Deps:* E1. *Risk:* low.

### F. Config & canon reconciliation — S

Make tick/snapshot rates per-match parameters (battle context may request 30 Hz LIVE / faster
headless). Resolve the `BATTLE_TICK_MS = 100` canon vs `TICK_HZ = 30` reality (discovery §1.5) —
recommend canon updates to 33 ms, or explicitly documents that the constant is the *floor*.
Update `docs/08`/`docs/09` if field names shift during D1/D2 implementation. (Canon edits happen
in clashfront repo per its working rules.)

### G. Client (renderer) rework

**G1. Battlefield-driven rendering — L**
Client builds ground/props/water from the `Battlefield` JSON received at match start (or
regenerates from the seed with the same shared generator — preferred: ship generator as a shared
module, send only the seed+inputs). Replace: square ground plane, `clampMap`, minimap projection
(hex mask), camera bounds, scatter keep-outs (discovery §2.2 lists exact lines; all keyed to
`MAPK`). Remove MOBA HUD chrome (shop, lane pings, surrender) for battle mode; add army/squad
rendering fed by C3 aggregates (instanced meshes).
*Deps:* A1/A2 (shared generator), C3 (snapshot format). *Risk:* the 500 KB monolith — consider
extracting the map layer into a `shared/` module as part of this item (build.mjs already handles
multiple shared files); do **not** attempt a full client modularization inside this program.

**G2. Battle UX shell — M**
Join-from-overworld flow (battle ticket → WS → possession), reinforce prompt, battle-type HUD
(objective status, army strength bars), post-battle result screen feeding back to the overworld
client.
*Deps:* E1, D2, G1. *Risk:* design input needed from clashfront product surface.

## 2. Sequencing & dependency graph

```
parcels.json (maps session) ─────────┐
                                     ▼
B1 strip MOBA ──► D1 allocate ──► D3 headless runner ──► D2 result callback ──► [Clash Front
   │                   ▲                                        ▲                tick engine can
   │                   │                                        │                resolve battles]
A1 battlefield model ──┴──► A2 generator ──► A3 hex sim bounds  │
   │                              │                             │
   │                              ▼                             │
   │        C1 spatial hash/squads ──► C2 pathfinding ──► C3 snapshots
   │                              │                             │
   │                              ▼                             ▼
   └────► B2 structures/SIEGE   E1 possession ──► E2 reinforce  G1 client render ──► G2 UX
                 │                                                    │
                 └────► A4 estate set pieces          B3 naval ◄──────┘ (any time after A2/C1)
```

**Recommended milestones:**

1. **M1 — Headless battles (no client):** B1 + A1 + D1 + D3 + D2 (+F). Clash Front's tick engine
   can AUTO/ACCELERATED-resolve FIELD battles on placeholder-sized hex battlefields with real
   army stacks and result callbacks. *This unblocks the entire overworld roadmap (docs/10 T1+)
   without touching the client.*
2. **M2 — Real battlefields + armies:** A2 + A3 + C1 (+C1 benchmark gate) + C2. Requires parcel
   data. ACCELERATED replays become meaningful.
3. **M3 — Live hero play:** C3 + E1 + E2 + G1 + G2 + D4. First human-droppable FIELD battle.
4. **M4 — Sieges & estates:** B2 + A4 (+ estate campaign wiring on the clashfront side).
5. **M5 — Naval:** B3.

## 3. Top risks (ranked)

1. **Army-scale perf is an unvalidated bet** (C1). *Mitigation:* benchmark spike first; the
   squad abstraction dial (soldiers per rendered/simulated unit) is the escape valve.
2. **Parcel-size dependency stalls M2+.** *Mitigation:* everything in M1 uses a placeholder
   radius constant; only generator tuning and spawn layout truly need real dimensions.
3. **Pathfinding scope creep** (C2). *Mitigation:* coarse grid + A* + existing steering; defer
   flow fields to SIEGE polish; heroes keep dumb steering v1.
4. **Client monolith drag** (G1) — every render change edits one 500 KB obfuscated-at-build
   file. *Mitigation:* extract the map/battlefield layer to `shared/` in G1's first commit;
   M1/M2 deliberately require zero client work.
5. **Dual-source divergence recurring** — new battlefield code duplicated client/server like the
   old map (discovery §2.3) or ability tables (`abilities.js` hand-sync). *Mitigation:* the
   generator and battlefield schema live in ONE shared module consumed by both; add a parity test.
6. **Determinism regressions** as systems grow (silent `catch {}` in ability cast, unordered Map
   iteration when adding/removing squads). *Mitigation:* extend golden-master to a per-PR replay
   test; ban `Math.random`/`Date.now` in sim via lint (mirrors clashfront's own rule).
7. **Open design questions land late** — biome designations, estate threshold, reinforce
   windows, `MAX_HEROES_PER_SIDE`, hero objectives metric (D4). *Mitigation:* all are listed as
   product-owner questions in clashfront `CLAUDE.md`; none block M1.

## 4. What we explicitly do NOT do

- No rewrite of the sim kernel, netcode transport, or client renderer stack (Three.js r128 stays).
- No fog-of-war/vision system unless battle design asks for it (none exists today; adding one is
  a separate L-sized item).
- No per-match on-chain escrow for Clash Front battles — stakes resolve through the overworld
  (`WarScore`/ledger); `playEscrow.js` remains for the legacy MOBA product only.
- No cross-region/multi-box scaling work in this program (allocator capacity logic is Clash
  Front-side per docs/04 §3; one box per region matches current scale assumptions).
