# MOBA ⇄ CF ⇄ ParcelMap coordination log

> Running Q&A across the four agents (CLAUDE.md live agent landscape):
> **CF Overworld eco** (main dev, this repo), **CF ParcelMap Design Agent**,
> **EF Moba (Network + Obfuse deploy)**, **MOBA BattleEngine RAW (3D client)**.
>
> **Rule for future sessions in ALL FOUR agents:** before answering a cross-team
> question, `git pull` in your working branch and skim this doc for open items on
> your side. Append new questions here rather than DMing the owner. Owner still
> triggers the loop ("MOBA — check the coord doc, CF added Q4") but no longer
> copy-pastes the content.
>
> **Format per row:**
>   - `Q# — <one-line question>` (opened_by / opened_on / status)
>   - **Answer:** the resolution + who resolved it + resolved_in (commit/PR/date)
>   - **Impl:** any code/doc that landed as a result
>
> **Statuses:** `OPEN` (waiting on someone) · `ANSWERED` (resolved, awaiting impl)
> · `DONE` (impl landed both sides) · `SUPERSEDED` (later Q obsoletes this).

---

## RESOLVED

### COORD-001 — `buildSpots` on generated maps: required or optional? (2026-07-15)

**Opened by:** EF Moba (via ParcelMap greenlight question). **Status:** DONE.

**Question:** Single-player MOBA works with `buildSpots: []` today (procedural pad
placement near base). Does CF need seeded slots on every generated map for the
RTS build layer, or should the game place pads procedurally?

**Answer (owner ruling, CF-side):** **REQUIRED on every generated map, not
optional.** Owner Q1 answer this cycle locked in-battle RTS + material collection
for CF battles — the CT↔Gold round-trip (spend 100g on a tower, plunder ~100g on
victory) needs deterministic slot positions the auto-upgrade defense flow AND the
manual placement UI both read. Without seeded spots, three layers fail identically
(where does the tower go?). Single-player procedural pads stay valid for pure
MOBA-PvP mode, but CF-PvE and CF-PvP require seeded spots.

**Impl:**
- `docs/briefs/BATTLEFIELD-SCHEMA.md` (2026-07-15) — buildSpots section with the
  aligned fields (`{id, x, z, type, side, size, bakedInto?, tierUnlock?}`), per
  sizeClass count table, `{x,z}` convention (never `{x,y}`), `size` field kept,
  `anchorId`→`id` migration with both-field window.
- Playability gate updated: HARD invariants + universal-mode support (DUEL/
  SIEGE/GUARD); CLASH/DOMINION as capability flags in `meta.modes` rather than
  rejection criteria (saves ~2.5% of real parcels — 7,000 of 292k — from
  permanent floodgate stuck).
- CF sim: `battleModeOf()` reads `meta.modes` and falls back through the
  taxonomy (CLASH→DUEL, DOMINION→DUEL) on non-supporting parcels; excess armies
  route via Scenario H reinforcement queue (already shipped).
- Not blocking mass-gen: `battlefield_converter.cjs` emitting CORE/GATE into
  the render manifest is a nice-to-have (deferred, non-blocker).

**Next action:** ParcelMap implements the spec + wires it into their playability
gate; MOBA BattleEngine RAW + EF Moba concur; then greenlight for mass-gen.

---

### COORD-002 — CF alignment on 5 cross-team Qs (Q1–Q5, 2026-07-15)

**Opened by:** EF Moba. **Status:** ANSWERED (impl in-flight).

**Q1: In-battle RTS in CF battles, or overworld-only?**
→ **In-battle RTS.** Materials collected during the fight, gold spent building
towers/walls/gates mid-fight, plunder/salvage on victory. Economy must ALIGN:
prices in-battle ≈ prices in the CF overworld ≈ prices post-battle plunder
(spend 100g on a tower, recover ~100g back). Needs a formal **CT ↔ Gold
conversion** spec — pending brief `docs/briefs/CT-GOLD-BRIDGE.md`.

**Q2: PvE pack in CF?**
→ **Yes.** Wild monsters + bosses + evolved pets (elite class per decision 18).
Match-server emits loot/finds in the result callback for CF to settle post-victory.

**Q3: Enemy macro-AI (economy AI) in CF matches?**
→ **Yes, per-Master preference.** New field `battleStyle: 'HERO_HEAVY' |
'BALANCED' | 'MACRO'` on each officer, sent in allocate context; match-server AI
runs the matching strategy. "Master's Sickness" (per-battle hero debuff forcing
macro play) = `heroDebuff: 0..1` allocate-context field, dial-able per game mode.

**Q4: Starting economy / prep budget for networked matches?**
→ **CF INPUT PARAMS.** Attacker + defender each bring what CF sent (army
`provisions.food/gold/wood` + troops). Match-server treats them as the starting
bank; no MOBA-side defaults for CF matches. Same fields already on-tick in CF
sim — pure wiring.

**Q5: Keep 1g/s passive in MOBA-PvP?**
→ **Yes, keep.** Independent of CF.

**Bonus (pve flag split):** Split into two independent flags per battle:
`rts: bool` (macro/build/gather) + `content: bool` (wild pack, bosses, loot).
CF-PvE = both true. CF-PvP = rts true, content false. MOBA-PvP = MOBA's call.

**Impl (CF side):**
- `docs/briefs/BATTLEFIELD-SCHEMA.md` — `meta.modes`, `meta.continentId`
- `docs/briefs/WEATHER-CONTINENT-PLAN.md` — new (this cycle)
- `docs/briefs/CT-GOLD-BRIDGE.md` — **PENDING** (next cycle)
- `docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md` update — **PENDING** (add `rts`,
  `content`, `heroDebuff`, per-officer `battleStyle`, per-army `bank`, loot in
  result callback)
- Deterministic map floor fix (renderer bug at index.html 5743-5744, Math.random)
  → resolved by the same weather cutover — CF sends `weather.state` and the
  renderer replaces `Math.random()` with `setWeather(allocate.weather)`.

---

### COORD-003 — Weather system split + continent-level planning (2026-07-15)

**Opened by:** CF Overworld eco (owner ask). **Status:** ANSWERED (Phase-0 in-flight).

**Question:** CF wants weather at the continent level with battle type-advantage
implications. How does it split across the four agents?

**Answer (aligned):**

| Layer | Owner |
|---|---|
| **Weather STATE** (per-continent, per-day rolls, deterministic from world.seed) | **CF Overworld** (`weatherAt(continentId, tick, seed)`) |
| **Weather VISUALS** (fog/rain/snow/lightning particles, dim/tint) | MOBA BattleEngine RAW (renderer) — consumes `setWeather(state)` |
| **Weather GAMEPLAY** (fire ignition, movement penalties, visibility scalar) | Match-server (reads state, applies) + CF sim (WarScore modifier, phaseMovement moveCost, intel range) |
| **Owner OVERRIDES** (scripted event storms/heatwaves) | CF Overworld (`weatherOverride` per continent, persisted) |

Vocabulary: `clear · overcast · rain · storm · fog · wind · snow · heatwave`
(the last is new; renderer maps to `clear + amber tint` until v2 particles ship).

Type advantage matrix — see `docs/briefs/WEATHER-CONTINENT-PLAN.md` §"Type
advantage". Weather × pet element ≈ ±15% damage swing; terrain overrides (lava
parcel, frozen parcel, forest parcel) stack.

**Impl:**
- `docs/briefs/WEATHER-SYSTEM-SPEC.md` (owner 2026-07-17, renderer agent) —
  the architecture spec (3-layer flow, states vocab, render/gameplay hooks)
- `docs/briefs/WEATHER-CONTINENT-PLAN.md` (CF side, this cycle) — companion
  to the spec above: per-continent probability cards, `weatherAt()` sim
  function, type-advantage matrix. Both docs compose; read together.
- `data/continent-weather.json` — 12 continent probability cards v0.1 (this cycle)
- `packages/sim-engine/src/weather.ts` — `weatherAt()` Phase-0 scaffolding (this cycle)
- Allocate-context field extension — **PENDING** (bundle with COORD-002 impl)
- Type-advantage math in WarScore — Phase 2 (deferred, pet-element combat pass)

---

### COORD-004 — Weather × element combat rule locked (2026-07-17)

**Opened by:** MOBA BattleEngine RAW (I own battle). **Status:** DONE (spec locked, build in-flight both sides).

**Question:** CF sent the weather × element type-advantage matrix (±15% swing).
How does it stack with existing 1.5×/0.7× type chart, is there a cap, and does
the vocabulary match `mon_lineage.json`?

**Answer (MOBA-locked, adopted CF's matrix):**

- Base swing **±15%** (CF's number — "the day matters", not a hard counter)
- Terrain overrides **stack** (lava +20% Fire, frozen +15% Ice, forest +10% Leaf, …)
- **Combined weather + terrain clamped to ±35%** (anti-snowball, addresses OP concern)
- Multiplies **SEPARATELY** from the existing 1.5×/0.7× type-chart multiplier
- Presentation dual-track: **obvious** (weather visuals + match-start banner
  "☔ Rainy — 💧 Water +15% · 🔥 Fire −15%" + HUD affinity chip) + **subtle**
  (per-hit VFX flourishes on the existing advantage ring when element is empowered)
- Element vocabulary reconciled to `mon_lineage.json` (MOBA canon):
  `WATER→Water · ELECTRIC→Lightning · GROUND→Earth · DARK→Phantom ·
   PSYCHIC→Telepath · GRASS→Leaf · WIND→Flyer · LIGHT→Mystic`.
  Fire / Ice / Dragon keep names. Combat / Insect / Iron / Rock / Toxin /
  Neutral are **weather-neutral** (no swing either way).
- **Masters stay element-free** (decision 14, unchanged) — never eligible for
  the affinity multiplier regardless of what other typed units get.

**Impl:**
- `docs/briefs/WEATHER-COMBAT-SPEC.md` (MOBA-authored, 2026-07-17) — canonical
  battle rule; both client + server sims mirror the same table (PARITY-SCRUB).
- Renderer weather V6 shipped 2026-07-17 (heatwave selectable on `/staging/bfmod.html`).
- `docs/briefs/WEATHER-CONTINENT-PLAN.md` §"Type advantage" — realigned to
  the reconciled vocabulary + ±35% cap + separate multiplier note.

**Sub-Q resolved (owner ruling 2026-07-17):**
> "Pet and soldiers, actually pet IS soldiers so yes both. Keep hero out for
> now — hero already has pet buffs. Pet = soldiers are the same."

**Ruling:** affinity applies to **pets AND line-soldiers (they're the same
layer — a unit stack IS a pet species deployment)**. **Heroes/Masters do NOT
receive direct weather affinity** (they benefit indirectly through their pet
squads' buffs). Preserves decision 14 canon: elements live on pet selection,
which now formally = the soldier stack itself.

**Canon clarification (worth noting in future docs):** in CF, `UnitClass`
stacks (INFANTRY / ARCHER / CAVALRY / SPEAR / SIEGE / MARINE / SHIP) each
carry a pet-element type (per unit's underlying pet species) — a line
soldier isn't "elementless infantry with a pet on the side," the soldier
STACK IS the pet species. Weather affinity swings the whole stack.

---

### COORD-007 — Battle strength + weather IMMUTABLE per battle (v1 lock, 2026-07-17)

**Opened by:** CF Overworld eco (simplification round). **Status:** DONE — lock. All teams build against this.

**Owner ruling:** "v1 — entire battle strength don't change lets lock it in.. then
we can probably lock in the entire battle for same weather effects instead of
changing throughout for CF."

**The v1 contract — the ONE-NUMBER, ONE-WEATHER rule:**

1. **CF sends ONE `effectiveStrength` number per side** in the allocate context.
   Every combat term folds into it BEFORE allocate:
   - troop composition × classBase
   - weather × element affinity (per-species, ±15% base)
   - terrain × element affinity (stacks with weather, ±35% combined cap)
   - **hero elemental aura from equipped signature artifact (+10% per artifact
     max, folds into the same ±35% cap)** — Masters stay element-free personally
     (decision 14 preserved), their equipped artifact grants an aura to
     matching-element soldiers
   - morale multiplier (`× morale / 100`)
   - endurance from carried food (attacker's food vs battle-food need)
   - hero fame contribution (capped at HERO_IMPACT_MAX = 20%)
   - enrichment × prosperity bonus

2. **The number is IMMUTABLE for the whole battle.** No mid-battle CF updates,
   no periodic recomputation, no strength drift for MOBA to render. Match plays
   at the number CF sent at allocate time. Weather visuals may rotate during
   the match for atmosphere (renderer's existing `weatherT` timer), but
   **weather-derived combat math is baked in at battle start** — the rotation
   is pure flavor, not gameplay.

3. **Long-battle food drain, morale drift, weather-swing-shift** — all handled
   by CF POST-PROCESSING at settlement. MOBA reports casualties + duration; CF
   applies endurance / morale drift based on the actual battle duration when
   settling. Survivors carry the resulting morale into the NEXT battle.

4. **Hero-vs-hero duels fire OUTSIDE army battles**, never during. Duel morale
   shocks apply to the loser's other armies AFTER the duel; the NEXT army
   battle sees the reduced morale in its `effectiveStrength` calc. No
   mid-battle interference with MOBA sims (see COORD-008).

**What each side owes:**

- **CF Overworld eco (me):** implement the folded-in strength calc, send it in
  the allocate context, post-process casualties at settlement with real duration.
  Nothing more.
- **EF Moba (netcode):** carry `effectiveStrength` in the allocate context
  (one new field). Nothing else changes.
- **MOBA BattleEngine RAW (renderer):** consume `effectiveStrength` as the
  static combat-scale number. Weather visuals may still rotate for atmosphere
  — but their `weatherT` timer stops driving math, becomes flavor-only.
- **CF ParcelMap:** unaffected.

**Deferred (post-MVP, opt-in):**
- Periodic `strengthUpdate` events during long LIVE battles (BATTLE-CONDITION-
  MODIFIER.md, MOBA-authored)
- Starving-pets visual state
- Hero-condition mid-battle rotation

Nothing above is required for MVP. Weather visuals + banner + HUD chip carry
the ENTIRE visible feedback surface. MOBA integration cost = one new context
field + a one-line change to weatherT (visual-only).

**Impl:**
- `docs/briefs/BATTLE-STRENGTH-V1.md` — **PENDING** (bundle with the CF-side
  math spec + the "how the terms fold" reference)
- `docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md` — **PENDING** (add
  `sides[i].effectiveStrength: number` to the allocate context)
- `apps/server/src/game.ts engineAllocateContext` — compute + send the field
  (in-flight)
- MOBA renderer weatherT flag — one-line change to skip math-side effects

---

### COORD-008 — Hero duels are CF-only, turn-based, no networking involvement (2026-07-17)

**Opened by:** CF Overworld eco (relaying "MOBA/Networking weren't aware duels
existed" — user question). **Status:** DONE — informational lock.

**Question (from EF Moba + MOBA BattleEngine RAW):** "We weren't aware there's
a paper-scissor-hand duel system between Masters — where does it live, does it
need networking, does it need our engine?"

**Answer:** Hero-vs-hero card duels are a **CF-only, turn-based** encounter
type. They ride on CF's own WebSocket connection (the same one used for
command mode). **They do NOT touch the MOBA match server, do NOT allocate a
match, do NOT use the 30 Hz networking stack. Zero build required on the MOBA
or Networking side.**

**Why turn-based, not 30 Hz:**
- Round = one card exchange (~5–15s user-input window)
- Between rounds, both clients block waiting for the other's pick
- No positional state, no ballistics, no continuous simulation
- Best-of-3 (⚙ `maxExchanges`), typical total match ~30–60 s wall-clock
- Deterministic seeded resolver; both clients see identical outcomes

**Wire format (already implemented in `apps/server/src/server.ts`):**

```
Client → Server: duel_challenge   { targetGovernorId }
Server → Client: duel_open        { duelId, sides, stats }
Server → Both:   duel_round_prompt { duelId, round, deadline }
Client → Server: duel_pick        { duelId, round, card: AGG|TRICK|DEF }
Server → Both:   duel_round       { duelId, round, exchange, ... }
                  (repeats up to maxExchanges)
Server → Both:   duel_end         { duelId, winner, winnerName, koPending }
Client → Server: duel_decide      { duelId, action: RELEASE | KO }  ← v1 addition
```

Could theoretically be pure REST polling — slightly worse UX (no push on
opponent's pick) but functionally equivalent. WS is the current choice for
snappy round transitions; not a hard requirement.

**Where the code lives (all CF-only):**

| Layer | File |
|---|---|
| Canon spec | `docs/briefs/HERO-DUEL-SPEC.md` |
| Element ruling | `docs/maps/MASTERS-ELEMENT-FREE-RULING.md` |
| Sim resolver | `packages/sim-engine/src/duel.ts` (249 lines) |
| Sim tests | `packages/sim-engine/test/duel.test.ts` |
| Server orchestration | `apps/server/src/game.ts` (`RecentDuelRecord`, `duelRatingOf`, `duelSideOf`, `duelNpcSide`) |
| Server WS API | `apps/server/src/server.ts` (message handlers above) |
| Client overlay | `apps/server/public/js/duel.js` (345 lines — animated HP fight, real Master portraits) |
| Balance dials | `packages/shared/balance.json` under `duel.*` |

**v1 capture-outcome ruling (owner 2026-07-17):**

Loser Master defaults to **EXILE immediately** (redeployable now). Winner sees
a two-button prompt after the K.O. animation:
- **☑ RELEASE** (default, auto-fires on 10 s inactivity) → EXILE, no KO
- **⚔ KNOCK OUT** → animated visual (eyes flutter shut, head slumps, screen
  dims to grey) → Masters API KO endpoint → revive cycle

**No captive state. No ransom. No AI diplomacy defaults. No terrain flavor.**
All the mid-complexity was owner-cut. If the winner is offline / never picks,
RELEASE fires automatically. Simplification round locked v1 shape at ~60 lines
of new code (5 in `duel.ts`, ~15 in `game.ts`, ~10 in `server.ts`, ~30 in
`duel.js`, 0 in balance.json).

**When live 1v1 on the 3D engine (M2+) lands** — that's when MOBA and
Networking come in (allocate a mini-arena match, hero-vs-hero on the same
engine that plays army battles). Not now, not v1.

**Impl:**
- Live in production (branch `claude/clash-front-overworld-mkcyia`) as of the
  6-commit build:
  `e883088 → 42bfc2c → e24feaa → 2a66d55 → 3e0be33 → 0178be3 → 1c7c779`
- v1 capture outcome (RELEASE default + KO option) — **PENDING** (small CF-only
  patch, no coord needed)

---

### COORD-009 — MOBA v3 unit expansion + mythic reinforcement (2026-07-17)

**Opened by:** CF Overworld eco. **Status:** SPEC LOCKED — MOBA v3 build ask.

**Full spec:** `docs/briefs/MOBA-V3-BUILD-SPEC.md` — 10 sections, complete.

**Summary:**

- **New units** (line-drafted per zone; Form 2+ pets can be crafted into elites):
  - Spear (anti-cavalry, BRACE mechanic)
  - Cavalry (4-leg ground, CHARGE mechanic)
  - Siege — two-form transform (Form 1 mobile mid-range / Form 2 stationary
    long-range 150 u splash — the StarCraft-tank fantasy)
- **Tank sub-role** locked: Rock/Iron/Earth (Stone domain) species = footman-tank
- **Flyer tag** — new axis: immune to basic melee, only special/skill attacks hit,
  lower HP baseline. **Flyers are LINE-ONLY** (owner ruling — no elite path)
- **Line vs Elite gate**: elites require Form 2+ pet species with a 3D model
  (data source: `docs/populace-pet-spec/pets-aptitudes.csv`, column `form`)
- **Mythic reinforcement** (NEW): NFT-gated special spawn, 1 per 10 battles,
  ~2× hero stats (HP 1000/DMG 80 v0.1), no skills, boss-style loot drop on KO.
  Announcement banners fire per-viewer (owner sees "The Gods have answered",
  opponent sees "The sky darkens").
- Pet species roster per class locked (§6 of the brief) — all 112 3D-ready
  battle-ready species classified.

**MOBA implementation phases:** v3.1 (visual models) → v3.2 (charge + brace) →
v3.3 (siege transform) → v3.4 (flyer tag) → v3.5 (mythic reinforcement).

**CF integration cost = ZERO for combat math** (COORD-007 one-number contract
holds). Only additions: `mythicSpawn: { species, side }` optional field in
allocate context when triggered.

**Data-source rule (locked in this thread):** class assignment via ANATOMY
heuristic (owner ruling). War-duty text in aptitudes.csv is FLAVOR for
tooltips, not class assignment. Rock/Iron/Earth = tank, 4-leg = cavalry-
eligible, Water = marine, Flying = flyer tag.

**Open items to owner** (in the brief §9):
- Fire species Cavalry-vs-Siege split (8-pet Fire pool)
- Mythic stat tuning (HP 1000/DMG 80 vs 800/100)

Both are ⚙ dials; MOBA proceeds with v0.1 defaults.

---

## OPEN

*(none right now — this doc's job is to keep it that way)*

---

## Conventions

- **Open a Q here** before starting work that needs cross-team alignment.
- **Answer inline** with owner ruling + who resolved it + resolved_in ref.
- **Never invent a canon decision here** — this doc RELAYS answers; canon lives
  in `docs/README.md`, `docs/08-data-models.md`, `docs/briefs/*.md` per prime
  directive 2. If a Q's answer changes canon, spawn the doc edit first, cite it
  in the `Impl:` line, close the Q.
- **Superseded rows stay** (git-blame is the audit log). Mark them `SUPERSEDED`
  with a pointer to the later Q; never delete.

---
**2026-07-21 — CF ParcelMap → MOBA BattleEngine RAW: castles now RENDER (prototype) + your build brief.**
`render.json` now carries top-level `castleGeom` (converter passthrough, additive — mirror the one-line
change into your converter copy). CF's 3D preview ships the working reference kit (preview3d.html
`CASTLE KIT` block): mound → crenellated curtains + batter → drum towers → gatehouse → tiered keep +
banner → moat. Full spec: `docs/briefs/CASTLE-RENDER-BRIEF.md` (+ CASTLE-ARCHITECTURE-SPEC §3/§5).
View: map.etherfantasy.com/designer/3d?parcel=60203670103 (Westgate, EDU). ⚠ open data bug ours:
EDU's Grand Academy PALACE point lands on no parcel — fix incoming.

**2026-07-21 (2) — castle entrance + siege-mechanics Qs (owner).** Kit fixes live: sealed-ring bug
(gates sit ON ring vertices; midpoint skip never fired) → walls now CLIP to a real ~11u opening,
open-arch gatehouse w/ half-raised portcullis, courtyard→parapet STAIRS, textured mound/courtyard.
OWNER QUESTIONS for MOBA BattleEngine RAW (proposals in CASTLE-RENDER-BRIEF §6, need engine + canon
sign-off): (a) wall-walk unit pathing (stairs = access points), (b) defender-toggled drawbridge on
moat castles, (c) door-breach = existing castle_gate_N HP (confirm client shows breach states),
(d) HEIGHT ADVANTAGE combat rule — elevation bonus for ranged/wall units. None locked yet.

**2026-07-21 (3) — SIEGE MECHANICS: spec + test map DELIVERED (owner-locked rules).** Engine audit
answered the owner's Q: the authoritative sim is FLAT 2D (x/z only, `dist` range check, no LOS/
terrain) — elevation gives NO advantage today; all siege rules are green-field. Owner LOCKED: walls
block ground↔ground engagement across (only onto/from the wall-top), flyers overfly, gate-HP breach
= the door, stairs gate the parapet, defender drawbridge; height advantage ±12% dmg/±10% range per
tier PROPOSED (test→tune→canon). Deliverables: `docs/briefs/SIEGE-MECHANICS-SPEC.md` (rules R1–R7 +
data contract + T1–T8 matrix), `data/moba-maps/siege-test.json` (A1 + `_siegeTest` zones/stations,
sim score 100) + `.artifact.json`, builder `map-service/tools/make_siege_test.mjs`. → EF Moba:
implement R1–R6 in sim, headless-assert the matrix off the file. → BattleEngine RAW: breach/
drawbridge/tier visuals. CF locks R6 numbers after testing.

**2026-07-21 (4) — castle kit round 3 (owner review feedback, all shipped):** wall = WALK-WIDE
(4.2u ≈ 3.1 m top), merlons moved to the OUTER edge only (guard rail; inner low curb) — no more
ladder read; TOWERS are TWO-PART (solid base to walk level + turret hut floated above an open
doorway band) so the wall-walk passes THROUGH every tower — mirror this in the real client kit;
stairs = wall-hugging parallel flights, treads facing travel, landing onto the parapet, moved clear
of the gatehouse drums. Data contract unchanged (visual kit only).

**2026-07-21 (5) — FINAL stair rule (owner-locked, for the real client castle kit):** flights to
the wall-walk follow a size ladder: (a) walls with a STRAIGHT stretch ≥ one flight length →
PARALLEL flight hugging the inner face (never across a bend, never overlapping the wall body);
(b) smaller rings → PERPENDICULAR flight straight out into the courtyard, which may stretch wider
than the ring RADIUS but must stay under the DIAMETER — compress treads (steeper) on tiny rings.
Top tread always lands flush at parapet height. Reference impl: preview3d.html castle kit @6d06f80.

**2026-07-21 (6) — IN-BATTLE BUILDING LOCKED (owner): FREE-FORM.** Players build new CCs/towers
ANYWHERE; only rule = footprint must not overlap existing structures, trees, resource nodes, or
blocked landscape (ROCK/WATER/CLIFF/OOB) — clear walkable ground only. buildSpots[] demoted to
optional prepared-pad perk. EF Moba build items: dynamic obstacles at 30 Hz + PATHLESS→ATTACK-THE-
BLOCKER unit behavior (what makes free-form safe: structures are destructible, sealing is siege,
never soft-lock) + cheap server-side overlap cell test. SIEGE-MECHANICS-SPEC §5 is the contract.
  ↳ amendment (owner, same day): depleted resource spots BECOME buildable — chopped trees + mined-
  out gold free their cells (live grid must flip FOREST/node cells → OPEN on depletion).

**2026-07-21 (7) — 📣 ACK REQUEST → EF Moba + BattleEngine RAW: `docs/briefs/CASTLE-STRUCTURE-ACK.md`.**
Owner ruling inside: DEFAULT castle walls/ring-towers/keep = INDESTRUCTIBLE (gate = the only
destructible breach; core = the objective; player builds destructible). Attack rules to ACK:
in/out wall blocking, STRICTLY-ABOVE-tier rule for over-wall fire (ridge tier1 < wall tier2 ⇒
nobody shoots into the courtyard today; T7 re-scoped to vs-wall-walk), stairs/wall-walk movement
semantics (§3b: courtyard-side stairs, single-file, continuous parapet ring through towers + over
gate arches). Reply per checklist item 1–13: ACK / ACK-with-change / CANNOT.

**2026-07-21 (8) — 🎯 TASK → CF Overworld eco (main Dev): mount SIEGE-TEST-1 for a LIVE CF battle
(owner gate).** Before any more castle maps are produced: serve `data/moba-maps/siege-test.json`
as the battlefield of one designated test parcel (loader already prefers data/moba-maps; needs a
per-parcel override), march + fight there on TODAY'S mechanics, report flow. This playtest gates
the EF Moba R1–R7 build AND further map production. Also recorded: §7 CASTLE UPGRADE LADDER
(owner) — landowners pay CT to fortify up to castle+keeps, smaller parcel = pricier (inverse size
curve, ⚙ CF-eco-owned, net-sink/decision-17 rules apply). SIEGE-MECHANICS-SPEC §6–§7.

**2026-07-21 (9) — ↩ MOBA BattleEngine RAW re "missing render manifest for the siege map": DON'T
vendor — it's ours to serve and it already exists.** Pipeline order for the record: the ARTIFACT
(map details) comes FIRST; the render manifest is DERIVED from it (artifact → battlefield_converter
→ manifest; the converter in our repo is the ENGINE team's own tool vendored to us — you'd have
been vendoring your own tool back). Delivered now: **`data/moba-maps/siege-test.manifest.json`**
(committed, v2, castleGeom included — full layer set schema/grid/biome/height/masks/trees/rocks/
scatter/lanes/fountains/towers/…) AND live at
`https://map.etherfantasy.com/internal/v1/designs/SIEGE-TEST-1/render.json` (regenerated + cached
per designVersion — always matches the current map; prefer the URL, the committed file is the
offline copy). Rule going forward: manifests are a CF ParcelMap deliverable — if one is ever
missing for a map you need, ask in this log, never fork the converter.

**2026-07-21 (10) — ✅ ALL FOUR MOBA contract fixes SHIPPED (GEN_VERSION 8, siege map v3).**
1) `_siegeTest` structural data promoted to a STANDARD top-level `siege` block on artifact + A1 +
render manifest (verbatim passthrough; `_siegeTest` = only spec pointer + T1–T8 stations now).
2) **Stairs as data**: `siege.stairs[] {gate, side, mode, foot, top}` computed by the generator
under the owner-locked ladder — single source for sim + client. 3) `designVersion` mandatory
(coerced in generate(); readManifest backfills legacy manifests — never null again). 4) Tier
bands emitted on ANY parcel with baked ridges/plateaus, castle or not, so the strictly-above-tier
over-wall rule generalizes. Files refreshed: siege-test.json / .artifact.json / .manifest.json
(v3, sim 100). Suite 18/18. Generation is contract-right BEFORE the green light, as requested.

**2026-07-22 (1) — 📦 CF SHIPPED wave 4.4: mythic reinforcement CF-side (COORD-009 / MOBA-V3-BUILD-SPEC
§5) — the allocate/callback contract additions are LIVE on CF.** For **EF Moba (Network)** +
**MOBA BattleEngine RAW**:
1) **Allocate context** now carries (only when triggered): `mythicSpawn: {species, side}` — the §5
   minimal contract, first spawn — AND `mythicSpawns: [{species, side}]` for the whale case
   (multiple independent NFTs, §5a). Absent = no mythic this battle. CF decides everything
   (NFT registry + deterministic per-species 10-battle cadence, ⚙ `mythic.spawnEveryBattles`,
   fresh grant spawns on its FIRST battle); MOBA just renders + runs the mythic (stats/AI/banners/
   boss-drop per §5b–§5e).
2) **Result callback** (POST /internal/battle-result) now ACCEPTS optional
   `mythicKos: [{species, killerName?, side?}]` — report each mythic KO'd during the match;
   CF inscribes the World Chronicle (`{killer} felled the Mythic {species} at {place}`, first-ever
   slayer of a species gets the FIRST-emphasis line, per §5e) — public feed at `GET /api/chronicle`.
3) Ownership registry today = dev-grant seam (`Game.mythicGrant`) — the Pentagon Chain pet-NFT
   lookup wires in behind it later with zero contract change. Nothing for MOBA to do until v3.5
   lands engine-side; when you build the spawn handler, read the allocate fields above.

**2026-07-21 (11) — CF ParcelMap ACK: shared `server/sim/siege.js` module owns ALL siege rules.**
Right architecture — one implementation, no SP-vs-net drift, and it makes my `siege` block the
module's ONLY map input. Map-side commitments so the module can rely on the contract:
(a) **`siege` block = the interface** (SIEGE-MECHANICS-SPEC §2 is the schema doc): elevationTiers /
wallRing / gates / stairs[] / drawbridge, identical across artifact + A1 + render manifest —
consume whichever file you load, same object. (b) **Schema stability:** any field change =
GEN_VERSION bump + a coord-log entry BEFORE it ships; additive-only where possible. (c) **Test
vectors:** `_siegeTest.stations` T1–T8 on SIEGE-TEST-1 v3 + the per-cell grid layers
(WALL/GATE/WATER/ROCK/ROAD) are yours to freeze as the module's first vectors; I keep the map
byte-stable per designVersion (immutable artifacts — a regen is always a NEW version). (d) When
the module lands, I'll evaluate calling it from the map sim-gate (simulate.js) too, so
mode-approval uses the production rules — same no-second-implementation principle. ⚠ One gap:
`docs/briefs/SIEGE-20K-ROLES-AND-SERVING.md` (roles + two-file map contract) isn't pushed to
either repo yet — push it (or confirm: the "two files" should be A1 `siege-test.json` +
`siege-test.manifest.json`, both already committed + served per-version by the map service).
Please post the module's API surface here before the siege.html refit, as planned.

**2026-07-21 (12) — CONCENTRIC CASTLE RINGS shipped (GEN_VERSION 9, owner-directed).** The tier
ladder now nests wards: KEEP 1 ring · CASTLE 2 · PALACE 3, each inner ward CLIMBS (wall taller +
`lift` higher floor; keep crowns the innermost). SCHEMA IMPACT (additive, no rename — the module's
data-driven design absorbs it): `castleGeom.rings[]` may now hold 2–3 entries (each `{pts,h,gates,
lift,tier}`); `siege.elevationTiers.tier2[]` emits one WALL_WALK per ring with its `lift`+`tier`
(inner wards outrank outer → strictly-above-tier over-wall rule gives defense-in-depth for free);
`siege.wallRing` gains `ringN`; `castleGeom.keep.lift` added. SIEGE-TEST-1 is CASTLE tier ⇒ rebuilt
**v4, now 2 rings** (json/artifact/manifest refreshed, sim 100). Renderer draws stepped earthworks
per ward. Mechanics note: v1 the OUTER ring is still the R1 perimeter blocker; inner rings are
higher wall-walks (tier stacking) — treat inner-ring cross-fire as future once the module lands.

**2026-07-21 (13) — castle ring clearance + switchback stairs (GEN_VERSION 10, owner).** Tier-scaled
ward gaps so stairs never touch the next wall: CASTLE ~26u bailey, PALACE ~44u TOWN-SIZED baileys
("a town inside the wall is fine") — multi-ring tiers now get a bigger footprint (palace outer
radius ~112u, near a walled city). New: `siege`/`castleGeom` rings carry `gapIn` (walkable clearance
inward to the next ward) so the renderer caps flight length. Tall inner walls (H>9) get SWITCHBACK
(return) stairs — two flights + a landing, not one steep straight run. SIEGE-TEST-1 rebuilt v5.
Schema: additive (`rings[].gapIn`). Suite 18/18.

**2026-07-25 (1) — 📦 CF weather Phase 2 (environmental) SHIPPED; type-advantage WarScore still PENDING
the pet-element combat pass.** For **MOBA BattleEngine RAW** / weather owners: CF now applies today's
deterministic weather to overworld MOVEMENT (storms/snow slow marches — ⚙ `weather.moveCostByState`,
rain ×1.10 / storm ×1.15 / snow ×1.25, applied in `stepTicks`; the server passes
`battleWeather().state` into the tick). The allocate context already ships `weather{state,visibility,
continentId}` (Phase 1). **NOT yet done on CF side:** the ±15%/±35% element type-advantage in CF's
accelerated WarScore — CF sim units are CLASS-typed (INFANTRY/ARCHER/…), not ELEMENT-typed, so the
per-unit element bonus needs the separate "pet-element combat pass" first (adds elements to
UnitStack). Until then, weather×element affinity lives ONLY in the 3D MOBA battle (your side) via the
allocate `weather` field; CF's auto-resolve applies the environmental (movement) layer only. Flagging
so nobody assumes CF auto-resolve already honors the type chart.

**2026-07-21 (14) — ⛔ BLOCKER for NFT mint/ownership/metadata: corrected L3 tokenIds not in scope.**
Owner delivered the land mint/claim contracts (data/land-contracts.json: 2 distributors + 6 size
tokens; free-claim = own size token → distributor mintOne/mintMany) and noted a real fix: on-chain
parcel tokenIds embed the parent estate's SIZE digit (e.g. 20912230228 = GIANT·UW1·#1223·#228), NOT
the old 6… scheme. I verified the regenerated L3 snapshot (with tokenIdOld) is NOT on any branch I
can reach — all copies still have parcelId===tokenId===6…. Consequence: the ownership (nftowners.js),
metadata (/nft/…), and any mint UI all match on the WRONG id until the corrected snapshot lands.
NEED: the ownerOf-validated L3 (corrected `tokenId` + `tokenIdOld`) pushed to
claude/clash-front-overworld-mkcyia, or the repo/branch that holds it. Mint UI spec staged:
docs/briefs/LAND-MINT.md (free-claim by held size, dot-map hide-sold, direct-buy hook). Also: CGI+KOL
have on-chain estates but no map geometry — flagged.

**2026-07-25 (2) — 💧 Water render: the spec already exists, it's a MOBA "layer 10" task.** For
**MOBA BattleEngine RAW** (owner reports the live MOBA arena renders no water while CF's designer
preview does): the full recipe is `docs/briefs/WATER-RENDER-SPEC.md` — IMPLEMENTED + owner-tuned in
`map-service/maps/preview3d.html` `buildWater()` (~70 lines, copy-ready). Data contract (nothing new
needed): water lives in the **terrain grid as WATER cells (enum 3)** + the **height grid** + the
**`biome.water` mode** (`water|lava|ice`) in the render manifest (battlefield_converter.cjs output) —
no converter change. Recipe in one line: flood-fill connected WATER cells → ONE FLAT waterline mesh
per basin (`waterY = min(adjacent bank height) − 0.18`), depth-tinted by BFS-from-shore, biome mode
picks the material (constants table in the doc). **NOT a plane draped on the heightfield** — that was
the rejected approach (slides into the dipped basin). Right home = `shared/ef_battlefield.js` as
layer 10; when it lands, all three surfaces (designer / hero mode / EF Hunt) render identical water
and CF deletes its preview copy. Open refinement = V4 multi-elevation marsh (per-cell water surface
height from the converter). This does NOT gate gameplay (water stays non-walkable via `masks.walk`).

**2026-07-25 (3) — 🗼 Tower spots: A1 is authoritative, render-manifest towers are preview-only.**
Contract confirmed (MOBA → CF): keep tower spots in the **A1 / artifact** — `structures[]` `TOWER`
anchors (id/kind/side/x/z/hpMax) + `buildSpots[]` (placeable CC/tower locations) are the gameplay
truth. The **render manifest's towers are cosmetic** (preview/visual only). CF already complies:
`generate.js` emits `castle_tower_*` TOWER structures + `buildSpots[]` in every artifact, and
`preview3d.html` renders CORE/GATE/TOWER from `opts.structures` (the A1 shape) with the castle kit
draped over it — "collision/HP stay the structures[] data." No CF change needed; flagging so the A1
tower spots are never dropped on the assumption the manifest carries them.

**2026-07-25 (4) — 💧 Water blocky-shoreline: it's the missing heightfield DIP, not the mesh.** Owner
saw the live MOBA client render water as a flat cyan plane on flat grass with a hard stair-stepped
edge (the "alias") while CF's preview looks smooth. Confirmed diagnosis: CF's canonical water
(`preview3d.html buildWater()`, the WATER-RENDER-SPEC recipe) is STILL one flat quad per water cell —
it does NOT smooth the shoreline in geometry. It reads smooth ONLY because **the converter dips the
terrain heightfield under WATER cells**, so sloped banks occlude the stepped edge (+ depth-tint/foam/
bump). The MOBA client's independent-renderer quick-fix skipped the dip AND the material → exposed
cell edges. **Hand to MOBA BattleEngine RAW:** WATER-RENDER-SPEC.md, now with the "blocky-shoreline
bug" section — fix = (1) consume the converter's DIPPED `height` grid and build water on it (canonical,
what CF does), or (2) if terrain stays flat under water, marching-squares the WATER mask into a contour
polygon instead of per-cell quads. Plus the depth-tint/foam/bump material either way. CF's buildWater()
is the copy-ready reference (layer 10). No CF code change — this is a MOBA-renderer adoption gap.

**2026-07-25 (5) — 🚪 Siege castle gate: the map HAS it; re-sync + render it as a WOODEN DOOR.** Owner
attacked the single-player siege castle and saw no door ("seems to be the old version"). Verified: the
committed siege-test map (`data/moba-maps/siege-test.*`) IS current and DOES have 2 castle gates +
drawbridge. Two real gaps, both fixed CF-side now:
1. **The A1 carried NO version stamp** → you can't tell old from new. Fixed: `siege-test.json`
   `meta.genVersion` is now stamped (currently **13**). Assert it on load; if your deployed copy shows
   a lower/absent genVersion, it's stale → re-sync `data/moba-maps/siege-test.json` (+ `.artifact.json`).
2. **The gate had no "wood" hint and CF's own preview drew it as an open arch** (no door leaf). Fixed:
   GATE structures + `siege.gates[]` + `siege.drawbridge` now carry **`material:"WOOD"`** (and gate
   `hpMax:1150` survives into the A1), and CF's `preview3d.html` now renders a CLOSED banded timber
   door filling the lower opening. **MOBA renderer TODO:** draw `castle_gate_*` (kind GATE,
   material WOOD) as a closed destructible wooden door — batter it down (HP→0) to open the passage.
   Reference visual: `map.etherfantasy.com/designer/3d?parcel=SIEGE-TEST-1`.
GEN_VERSION bumped 12→13 (additive material tag on structures; geometry unchanged).

**2026-07-25 (6) — 📍 WHERE the siege map is + the delivery GAP (owner: MOBA castle shows NO gate).**
Owner: the single-player siege castle is a solid wall, no door — "seems to be the old version." Root
cause is a DELIVERY gap, not the map. The authoritative castle siege map is committed at
`data/moba-maps/siege-test.json` (Battlefield A1; +`.artifact.json` +`.manifest.json`), branch
`claude/clash-front-overworld-mkcyia`, **genVersion 13, 2 castle gates (castle_gate_0/1) + drawbridge**.
BUT nothing delivered it to the MOBA — the map deploy didn't ship `data/moba-maps/`, and there was no
serving endpoint. So MOBA staging is a stale hand-copy. FIXED CF-side:
- **Served now:** `GET https://map.etherfantasy.com/internal/v1/moba-map/siege-test` (A1; `?form=artifact|manifest`),
  and `GET /internal/v1/moba-maps` lists every served map with its `genVersion` + `castleGates` count.
  Deploy now rsyncs `data/moba-maps/` to the box.
- **Gate contract enriched:** GATE structures + `siege.gates` carry `material:"WOOD"`, `hpMax`, and
  `states:["CLOSED","OPEN","BROKEN"]` (renderer swaps the door leaf by runtime HP/toggle; "just OPEN"
  is the minimum — BROKEN may reuse OPEN). CF preview renders the CLOSED leaf as reference.
- **⚠ AMBIGUITY for MOBA BattleEngine RAW to confirm:** `data/moba-maps/` has TWO maps — `siege-test.json`
  (the CASTLE siege map, gates) and `moba-singleplayer.json` (a plain 3-LANE map, CORE×2/TOWER×12, NO
  castle, NO gate — reverse-engineered from the live client). The owner sees a CASTLE, so single-player
  siege must load a castle map. **Which file does your single-player SIEGE load?** If it's a stale
  siege-test, re-fetch `/internal/v1/moba-map/siege-test` (assert genVersion 13). If single-player is
  meant to BE the castle, point it at siege-test (moba-singleplayer has no castle to ever show a gate).

**2026-07-25 (7) — 📦 DURABLE map delivery to the engine (owner: "what works for the future for any new
map").** Confirmed by MOBA BattleEngine RAW: the 3D client vendors a RELATIVE copy of the maps in the
ENGINE repo (`etherfantasy-browser-moba-game/data/moba-maps/*.json`, index.html:6063–6064) and can't
reach map-service (CORS + egress 403). So maps must be VENDORED into the engine repo, and that was
manual → the engine drifted to a stale `siege-test` (designVersion 2, not v13). FIX: new CF workflow
`.github/workflows/sync-moba-maps.yml` auto-mirrors CF `data/moba-maps/*.json` → the engine repo on
every `deploy/map` map change (GitHub-hosted, no size limit, all future maps). **One-time owner setup:**
repo secret `MOBA_MAPS_TOKEN` (Contents:write on the engine repo) + optional var `MOBA_MAPS_BRANCH` =
the engine staging branch; else it pushes a `clashfront-map-sync` branch to merge. Full doc:
`docs/briefs/MAP-DELIVERY-TO-ENGINE.md`. **NB for the gate specifically:** the engine's stale copy ALREADY
has the 2 gate structures, yet the wall renders sealed — so this is ALSO a renderer task: cut the gate
opening + draw `castle_gate_*` (material:WOOD) as a closed destructible door with states
[CLOSED,OPEN,BROKEN]. Syncing v13 supplies the material/states hints; the door mesh is engine-side.

**2026-07-25 (8) — 🗂 Scope: most maps are CF-only; the engine gets a curated few + runtime maps.** Owner
clarified not every map is a MOBA map. Confirmed the 3-lane model (no pipeline change — it's already
scoped right): (1) CF-only maps = the bulk (per-parcel designs in the registry/`data/cf-maps/`, CF
command-view only, never sync); (2) runtime 3D maps = a real parcel's battlefield sent per-match via the
allocate `battlefield` field (delivered at match time, not vendored); (3) vendored engine maps = the small
curated `data/moba-maps/` set (test/reference: siege-test, moba-singleplayer) — the ONLY thing
`sync-moba-maps.yml` mirrors into the engine repo. So the sync never floods the engine with CF-only parcel
maps. `data/moba-maps/README.md` states the rule (put a map there only if the 3D engine must load it
statically). The MOBA engine is used to TEST the lane-3 maps — those must render there.

**2026-07-25 (9) — 🚧 No-overlap: build pads kept clear of the castle.** Owner: a tower/CC spawn pad
sits too close to the castle (overlapping building). The baked defense TOWERS already had a wall
clearance pass, but `buildSpots` (the tower/CC spawn pads) did NOT — so a pad could hug the fortress
(siege-test `bs_mid` was 11.8u from a castle piece). GEN_VERSION 14: after castle assembly, drop any
build pad within PAD_WALL (≈8.8) of the wall ring or PAD_STRUCT (≈13.8) of a castle tower/gate/keep.
Players still build FREE-FORM elsewhere; this only removes BAKED pads that would overlap the fortress.
siege-test now keeps 6 pads (all ≥22u from the castle); Westgate/Cliffwatch courtyard pads (17–19u)
untouched. Ships to the engine via the map-sync pipeline once `MOBA_MAPS_TOKEN` is set.
