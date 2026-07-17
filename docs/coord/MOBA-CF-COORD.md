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
- `docs/briefs/WEATHER-CONTINENT-PLAN.md` (this cycle)
- `data/continent-weather.json` — 12 continent probability cards v0.1 (this cycle)
- `packages/sim-engine/src/weather.ts` — `weatherAt()` Phase-0 scaffolding (this cycle)
- Allocate-context field extension — **PENDING** (bundle with COORD-002 impl)
- Type-advantage math in WarScore — Phase 2 (deferred, pet-element combat pass)

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
