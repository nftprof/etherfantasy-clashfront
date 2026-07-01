# 06 — AI Architecture

> The AI that makes the world feel alive. At launch, `LAUNCH_NPC_TERRITORY_PCT = 0.95` of all
> Territories are governed by **NPC Kingdoms** (`GovernorKind = 'NPC_KINGDOM'`, see
> [`08-data-models.md`](./08-data-models.md)). This document specifies the autonomous-agent
> architecture that runs them: how they develop, trade, ally, and wage war 24/7 on the world tick —
> without an LLM in the hot loop and without melting the tick engine
> ([`07-backend-architecture.md`](./07-backend-architecture.md)).

Design mandate (Pillar 8): **NPC kingdoms keep the world alive — they fight, expand, collapse, ally
24/7.** The world must never feel dead, and no NPC empire may snowball into owning everything.

---

## 1. Layered AI stack

Two layers, five agent roles. All are deterministic decision systems (utility AI + behavior trees),
not LLMs. An optional **Flavor Layer** (§10) may use a lightweight LLM strictly off the hot path.

```
┌──────────────────────────────────────────────────────────────┐
│  WORLD SIMULATION AI (Director)          — 1 per World       │
│  pacing, events, anti-stagnation, anti-runaway, backfill     │
├──────────────────────────────────────────────────────────────┤
│  PER-KINGDOM AGENTS                      — 1 set per Kingdom │
│  ┌────────────┬────────────┬─────────────┬────────────┐      │
│  │ Governor AI│ Military AI│ Diplomacy AI│ Economy AI │      │
│  │ develop,   │ armies,    │ stances,    │ trade,     │      │
│  │ tax, repair│ war ops    │ contracts   │ war chest  │      │
│  └────────────┴────────────┴─────────────┴────────────┘      │
├──────────────────────────────────────────────────────────────┤
│  WORLD TICK ENGINE (TICK_SECONDS = 60)   — see doc 07        │
└──────────────────────────────────────────────────────────────┘
```

Each agent reads world state, emits **the same commands a player Governor could issue** (develop,
train, march, offer truce, post `Contract`, list land). There is no NPC-only cheat API; the AI plays
by the rules in docs 01–05. This keeps balance honest and lets one command pipeline serve both.

### 1.1 Scheduling & budgets (not melting the server)

Kingdom agents do **not** all run every tick. Evaluation is staggered and budgeted:

| Agent | Cadence (ticks) | Trigger override | CPU budget / invocation |
|---|---|---|---|
| Governor AI (per Territory) | every 10 (~10 min) | Territory attacked, Prosperity < 20 | 2 ms |
| Military AI (per Kingdom) | every 5 | own Army `ENGAGED`/`RETREATING`, border incursion | 5 ms |
| Diplomacy AI (per Kingdom) | every 60 (~1 h) | war declared on kingdom, truce expiring | 2 ms |
| Economy AI (per Kingdom) | every 30 | treasury < war reserve, market shock event | 2 ms |
| Director | every 1 (cheap scan) + deep pass every 60 | never skipped | 10 ms scan / 50 ms deep |

- Kingdoms are hashed into cadence buckets by `kingdomId` so load spreads evenly across ticks.
- A global per-tick AI budget (target **≤ 200 ms of the 60 s tick**, §11) is enforced by a work
  queue: overflow work rolls to the next tick with priority aging — decisions degrade to *later*,
  never to *wrong*.
- Event triggers (attack, siege, expiry) enqueue an immediate re-evaluation for the affected agent
  only; the rest of the kingdom stays on cadence.

---

## 2. NPC Kingdom model

An NPC Kingdom is a Governor (`governorId` with `governorKind: 'NPC_KINGDOM'`) plus an AI state
record:

```ts
interface NpcKingdomAI {
  kingdomId: string;            // governorId
  archetype: Archetype;
  weights: PersonalityWeights;  // per-archetype, ± seeded jitter
  goals: Goal[];                // prioritized, re-planned by Governor/Military AI
  warReserveCt: number;         // Economy AI maintains this floor
  memory: GrudgeEntry[];        // decaying per-governor grievance/favor ledger
  rngSeed: string;              // deterministic stream, derived from World.seed
  cadenceBucket: number;
}
type Archetype = 'EXPANSIONIST' | 'MERCANTILE' | 'DEFENSIVE' | 'OPPORTUNIST' | 'ZEALOT';
```

### 2.1 Archetypes and personality bias

Personality is a weight vector multiplied into every utility score — one mechanism, five flavors:

| Weight | EXPANSIONIST | MERCANTILE | DEFENSIVE | OPPORTUNIST | ZEALOT |
|---|---|---|---|---|---|
| `aggression` | 1.4 | 0.6 | 0.5 | 1.1 | 1.5 |
| `greed` (CT/trade) | 0.9 | 1.5 | 0.8 | 1.3 | 0.6 |
| `caution` (supply/defense) | 0.7 | 1.0 | 1.5 | 0.8 | 0.5 |
| `loyalty` (honors pacts) | 0.9 | 1.1 | 1.2 | 0.4 | 1.3¹ |
| `vengefulness` (grudge decay⁻¹) | 1.0 | 0.7 | 1.1 | 0.9 | 1.6 |

¹ Zealots are loyal to allies but declare ideological wars regardless of profit; they target the
strongest neighbor, not the weakest.

Goals are archetype-templated: EXPANSIONIST seeds `CONQUER_REGION`, MERCANTILE seeds
`DOMINATE_TRADE_ROUTES`, DEFENSIVE seeds `FORTIFY_BORDERS`, OPPORTUNIST seeds `EXPLOIT_WARS`
(joins losing sides' enemies, takes `Contract`s), ZEALOT seeds `HUMBLE_THE_MIGHTY`.

### 2.2 Seeding at world launch

1. Worldgen partitions land Territories into kingdom clusters (3–12 Territories each) so that
   NPC Kingdoms hold `LAUNCH_NPC_TERRITORY_PCT = 0.95` of Territories; the remaining 5% are
   `SYSTEM`-governed starter/buyable zones near coasts and region edges.
2. Each kingdom gets an archetype (distribution ≈ 30% EXPANSIONIST, 25% MERCANTILE, 20% DEFENSIVE,
   15% OPPORTUNIST, 10% ZEALOT), weights jittered ±15% from `World.seed`.
3. Initial `DiplomacyRelation`s: neighbors start `NEUTRAL` or `HOSTILE` (archetype-pair table);
   ~10% of adjacent same-archetype pairs start `ALLIED` so the map has pre-existing blocs and
   stories on day one.
4. Land NFTs for NPC Territories are SYSTEM-owned mirrors until sold ([`02-economy.md`](./02-economy.md)).

---

## 3. Governor AI (economy & development)

Runs per NPC-governed Territory. Chooses one action per evaluation from a fixed action set by
**utility scoring**:

```
U(action) = BaseValue(action, territoryState) × PersonalityWeight × Urgency × Affordability
choose argmax U; if max U < ACT_THRESHOLD (0.15) → do nothing (save CT)
```

- `BaseValue` ∈ [0,1]: marginal value curves (diminishing returns per development level).
- `Urgency` ∈ [0.5, 3]: spikes on threats (food deficit, siege risk, low Morale).
- `Affordability` = `clamp01(ctTreasury / cost)²` — quadratic so poor territories hoard.

Action set: `DEVELOP(track)` for each `DevelopmentTrack`, `RAISE_ARMY`, `REINFORCE_GARRISON`,
`REPAIR(structure)`, `SET_TAX(rate)`, `BUILD_SUPPLY_TRAIN`, `STOCKPILE_FOOD`.

**Example scoring** — TOWN, Prosperity 62, Morale 71, foodStock covers 4 days, hostile neighbor
massing, development A2/E3/D1/M2, EXPANSIONIST kingdom:

| Action | Base | Personality | Urgency | Afford | **U** |
|---|---|---|---|---|---|
| DEVELOP AGRICULTURE | 0.55 (4-day food) | 0.9 | 1.6 (deficit soon) | 0.9 | **0.71** |
| DEVELOP ECONOMY | 0.40 (E3 diminishing) | 0.9 | 1.0 | 0.8 | 0.29 |
| DEVELOP DEFENSE | 0.60 (D1 low, threat) | 0.7 | 1.8 (massing) | 0.7 | 0.53 |
| DEVELOP MILITARY | 0.45 | 1.4 | 1.2 | 0.7 | 0.53 |
| RAISE_ARMY | 0.50 | 1.4 | 1.3 | 0.6 | 0.55 |
| REPAIR walls | 0.10 (near full HP) | 1.0 | 1.0 | 1.0 | 0.10 |

→ Develops **AGRICULTURE** (starving armies lose wars — the North Star). Next cycle, with food
secured, `RAISE_ARMY` likely wins. Tax rate is a controller, not a scored action: raise while
Morale > 60, cut when Morale < 40 or rebellion risk rises (`REBELLION_FOOD_THRESHOLD`, doc 08).

---

## 4. Military AI (armies & war)

One per kingdom; commands all its Armies. A shallow behavior tree gates a utility target-selector.

```
MilitaryAI.evaluate(kingdom):
  # 1. SURVIVAL (highest priority)
  for army in armies where supply < 0.25 * supplyMax or morale < DESERTION_MORALE_THRESHOLD + 10:
      order RETREAT toward nearest friendly supplySource territory        # doc 01 supply rules
  for territory in ownTerritories where underSiegeBattleId:
      hold garrison; request relief march if relief_power > 1.2 * besieger_power
      else Diplomacy AI: post Contract MERCENARY_DEFEND, call allies

  # 2. RESPOND TO AGGRESSION
  if recent attack by governor G:
      memory.grudge[G] += severity
      if kingdom_power > 0.8 * G.power → plan counter-offensive vs G's weakest border territory
      else → fortify, seek TRUCE or allies vs G (hand off to Diplomacy AI)

  # 3. OFFENSE (only if at WAR, or aggression-gated opportunity)
  target = argmax over enemy/neutral border territories T of:
      Score(T) = Value(T) × Winnability(T) × Reachability(T) × aggression
  if Score(target) > WAR_THRESHOLD and Economy AI confirms warReserve funded:
      compose & march
```

- **Value(T):** Prosperity, ZoneType (CAPITAL > FORTRESS > HARBOR > TOWN > VILLAGE), route/choke
  value, grudge bonus against its governor.
- **Winnability(T):** projected `WarScore` ratio from army strength, garrison + DEFENSE level,
  terrain, Morale ([`04-battle-system.md`](./04-battle-system.md)); clamp to 0 below 1.1:1
  projected power (DEFENSIVE archetype requires 1.5:1).
- **Reachability(T):** supply-aware. Simulate the march ([`01-world-simulation.md`](./01-world-simulation.md)):
  if projected supply on arrival < 40% of `supplyMax` after attaching available Supply Trains,
  Reachability = 0. **NPC armies do not overextend** — they will not initiate a fight that starts
  under `SUPPLY_BREAK_PENALTY` conditions. This is the single biggest "AI feels smart" rule.

**Composition** vs target: SIEGE units vs FORTRESS/walls; CAVALRY-heavy vs open PLAINS field armies;
SPEAR vs cavalry-heavy defenders; MARINE/SHIP for HARBOR/NAVAL ([`03-military.md`](./03-military.md)).
Rock–paper–scissors read from the same counter table players use.

**Consolidation:** after `OCCUPY`, armies pause 6–24h (caution-scaled) to restore supply/Morale and
garrison the gain before re-targeting. **Post-victory choice:** OPPORTUNIST and low-Reachability
wins → `PILLAGE`; EXPANSIONIST/ZEALOT with supply → `OCCUPY`; MERCANTILE pillages only HOSTILE
targets (bad for trade reputation otherwise).

**Player aggression:** attacks by players feed the same grudge memory. Kingdoms escalate
proportionally — raids draw counter-raids and `BOUNTY_HERO` Contracts on the offending Hero;
occupation of core territory draws full war and ally activation. Retaliation strength scales with
player fame (famous warmongers attract coalitions), making reputation a real cost.

---

## 5. Diplomacy AI (relations)

Maintains a scalar **Relation score** `R ∈ [-100, +100]` per (kingdom, governor) pair; the public
`DiplomacyStance` is derived by thresholds with hysteresis (no flip-flopping):

| R | Stance proposed |
|---|---|
| ≤ −60 | `WAR` (if Military AI confirms winnable or ZEALOT) |
| −60 … −20 | `HOSTILE` |
| −20 … +30 | `NEUTRAL` |
| +30 … +60 | `TRUCE`/non-aggression offered |
| ≥ +60 | `ALLIED` offered |

**Update rules (event-driven deltas, decay 1% of |R| per day toward 0):**

| Event | ΔR |
|---|---|
| Attacked us / ally | −40 / −20 |
| Pillaged our Territory | −60 |
| Shared enemy at WAR | +15 |
| Trade route active per week | +5 (×greed) |
| Tribute/gift received | +1 per 500 CT (cap +20) |
| Fulfilled our Contract | +25 |
| Broke truce/alliance (them) | −50, remembered (grudge, decays by vengefulness⁻¹) |
| Border pressure (armies massed) | −10 |

- **Alliances:** offered at R ≥ +60 to comparable-power kingdoms facing a shared threat; broken by
  OPPORTUNISTs (loyalty 0.4) when the ally's power drops below 40% of theirs, at −50 R with all
  observers (reputation is global).
- **Vassalage:** a kingdom below 30% of an aggressor's power that has lost ≥ 2 Territories in the
  war sues for `VASSAL_OF` with `tributeCtPerDay`; suzerain accepts if tribute NPV beats conquest
  cost (MERCANTILE almost always accepts; ZEALOT rarely).
- **Truces:** losing side offers when war exhaustion (casualty + treasury drain index) > 0.7;
  `expiresAt` set 7–21 days out; NPCs honor truces except OPPORTUNIST (breaks at 5%/day check if
  target becomes very weak — this is deliberate story fuel).
- **Contracts:** kingdoms **post** `MERCENARY_DEFEND`/`MERCENARY_ATTACK`/`BOUNTY_HERO` when their
  Military AI is outmatched (rewardCt from war reserve), and **take** `TRADE_LEASE`/escort work when
  MERCANTILE. This is a primary player-economy faucet: NPC wars pay players.
- **Player fame/reputation:** high-fame players get better first offers (+10 initial R), but
  players flagged truce-breakers are treated with OPPORTUNIST-grade suspicion by all NPCs.

---

## 6. Economy AI (trade, markets, war funding)

Per kingdom, cadence 30 ticks:

- **War reserve:** keeps `warReserveCt ≥ 14 days × projected army upkeep`. Military AI cannot launch
  offensives that would breach it — wars are funded or not fought.
- **Trade routes:** proposes routes to `NEUTRAL+` neighbors maximizing (price spread × route
  safety); cancels through WAR zones. Route income feeds +R (§5), coupling peace to profit.
- **Pricing:** posts buy/sell on regional markets ([`02-economy.md`](./02-economy.md)) at
  `basePrice × (1 + scarcity × greed)`; sells surplus food, buys food pre-war (a *tell* observant
  players can scout).
- **Land:** buys SYSTEM-listed Land NFTs adjacent to core Territories when treasury > 2× reserve
  (MERCANTILE bias ×1.5); sells/leases exclaves it cannot defend — feeding player-acquirable land
  supply.
- **Crisis:** treasury < 25% reserve → raise tax (Morale-capped), pause development, Diplomacy AI
  seeks tribute or peace.

---

## 7. World Simulation AI (the Director)

One per World. The Director never plays a kingdom; it tunes **pacing** so the map always has
stories. It watches aggregate metrics each tick and acts on a deep pass every 60 ticks.

**Metrics:** wars active per region, Territory flips per day, Gini coefficient of kingdom
territory counts, regional Prosperity mean, player-adjacent activity (fights near player holdings),
NPC-owned %.

**Anti-stagnation** (region has < N flips and < 1 war per week):
- Nudge: temporary `aggression × 1.3` modifier to 1–2 kingdoms in the region (decays 7 days).
- Inject: spawn events — succession crisis (kingdom splits in two), rebel uprising in a low-Morale
  Territory, wild-zone monster surge ([`05-pve-integration.md`](./05-pve-integration.md)), resource
  strike raising a Territory's Value (kingdoms converge on it).
- Escalate: seed a border `Contract` chain that pulls players and NPCs into the same conflict.

**Anti-runaway** (no NPC snowball; triggers when one kingdom exceeds **12% of world Territories or
2× the second-largest kingdom**):
- Coalition pressure: apply −15 R between the leader and all neighbors (fear); Diplomacy AIs form
  encircling alliances organically.
- Internal friction: distant Territories get −Morale/-Prosperity drift (overextension), raising
  rebellion odds; rebels spawn as new small kingdoms.
- Hard rail: the Director never deletes armies or Territories by fiat — it only shifts weights,
  Morale drift, and events, so counterplay stays legible and diegetic.

**Anti-collapse** (region Prosperity mean < 25 or a kingdom about to vanish with no player nearby):
- Prop up: emergency `STOCKPILE_FOOD`/repair urgency boost, a MERCANTILE neighbor "sends aid"
  (CT transfer via ledger, `reason:'trade'`), or a truce nudge (+20 R between exhausted belligerents).
- Kingdoms **are allowed to die** when players or NPCs earn it — collapse is content — but the
  Director ensures the corpse becomes something (rebel successor states, wild zones, cheap land),
  never a dead gray blob.

All Director interventions are **rate-limited (max 3 active interventions per region)** and logged
as first-class events (§11) so designers can audit "why did the world do that?"

---

## 8. Player-vs-NPC balance over time

NPC-owned share is designed to fall as the player base conquers:

| Phase | Target NPC-owned % | Director posture |
|---|---|---|
| Launch | 95% (`LAUNCH_NPC_TERRITORY_PCT`) | Strong kingdoms, tutorializing border wars near starter zones |
| Month 1–3 | 85–90% | Neutral; kingdoms fight players at full strength |
| Month 3–12 | 70–85% | Backfill begins: rebel states & migrations refill emptied regions |
| Mature | floor ≈ 60% | Late-game threats (invasion fleets, zealot crusades) target overextended *players* too |

**Backfill mechanics:** when NPC share in a region drops below its phase floor, the Director spawns
successor kingdoms from rebellions in low-Morale player-adjacent Territories, landing parties on
unclaimed coasts, or splinters of large kingdoms — always with in-fiction cause and Herald
announcements. Late-game NPC kingdoms skew OPPORTUNIST/ZEALOT so they engage player empires instead
of farming corners. The world floor guarantees new players always have NPC neighbors to fight,
trade with, and take Contracts from.

---

## 9. Battle behavior

When an NPC Army enters a `BattleInstance` ([`04-battle-system.md`](./04-battle-system.md)):

- **Resolution stance:** NPC kingdoms default to `AUTO`. If players join the opposing side (making
  it `LIVE`), the defenders' side remains army-driven; the AI's "hero seat" may be filled by an
  AI-controlled officer only where doc 04 permits, and its contribution is clamped by
  `HERO_IMPACT_MAX` like everyone else. High-stakes battles (CAPITAL siege) auto-post
  `MERCENARY_DEFEND` Contracts so *players* can be the NPC's heroes — NPCs hire humans rather than
  fake them.
- **AUTO tactics profile:** each archetype maps to a doctrine consumed by the resolver —
  DEFENSIVE holds terrain and walls, EXPANSIONIST commits reserves early, OPPORTUNIST withdraws at
  40% casualties (others at 60%), ZEALOT fights to 75% before Morale checks force rout.
- **Retreat rule:** AI sides concede and enter `RETREATING` when projected `WarScore` ratio < 0.5
  and a retreat path to supply exists — preserving armies for the counter-attack instead of
  suiciding, which keeps wars multi-battle affairs.

---

## 10. LLM flavor layer (optional, never in the hot loop)

Everything above is deterministic. A lightweight LLM adds *texture only*, asynchronously, from a
worker queue with cached/pre-generated fallbacks:

| Use | Trigger | Fallback if LLM unavailable |
|---|---|---|
| Kingdom/ruler/army names at worldgen | offline batch | curated name tables |
| Diplomacy message prose ("we accept your truce, dog") | stance change event | templated strings |
| War declarations, taunts, Herald news posts | Director/war events | templates |
| Rebel manifesto / event flavor | Director injections | templates |

Rules: the LLM **never chooses actions, numbers, or targets** — it verbalizes decisions already
made and logged; outputs are length-capped, profanity/PII-filtered, and cached by (event type,
archetype). Zero LLM calls occur inside the tick.

---

## 11. Determinism, testability, observability, performance

- **Determinism:** every kingdom decision uses a per-kingdom RNG stream derived from
  `World.seed + kingdomId + tick`. Replaying the event log with the same seed reproduces every
  decision bit-for-bit — required for bug repro and balance regression tests.
- **Decision log:** every agent invocation emits a `DecisionRecord { tick, agent, kingdomId,
  candidates: [{action, U, factorBreakdown}], chosen, latencyUs }` to the event bus
  (Kafka/NATS per doc 08 §6). Sampled at 100% for chosen actions, 10% for full candidate tables.
  This powers the tuning dashboard ("why did Kingdom X attack Y?") and Director audits.
- **Testing:** (1) unit tests on utility functions with golden scoring tables (like §3's);
  (2) headless world sims at 1000× speed for 90 sim-days asserting invariants — no kingdom > 12%
  Territories, ≥ 1 war/region/week, no region Prosperity mean pinned at 0, CT conservation (doc 08
  invariant 1); (3) archetype behavioral assertions (DEFENSIVE never initiates < 1.5:1 wars).
- **Performance budget:** total AI ≤ **200 ms per 60 s tick** at 500 kingdoms / 10,000 Territories
  (≈ 0.3% of tick). Per-invocation budgets in §1.1; a watchdog demotes any kingdom whose agent
  exceeds 5× budget to half cadence and alarms. AI state lives in Redis hot state with the rest of
  the sim (doc 08 §6); decisions are commands into the same queue player commands use (doc 07).

> ❓ OPEN: exact utility curve shapes, ΔR magnitudes, Director trigger thresholds, and the 12%
> anti-runaway cap live in `balance.json` (doc 08 §2 note) and are tuned from headless-sim sweeps,
> not hardcoded.

---

## Cross-references

- [`README.md`](./README.md) — canon glossary, Macro Pillars (esp. 8), `LAUNCH_NPC_TERRITORY_PCT`, Hero Impact Cap.
- [`01-world-simulation.md`](./01-world-simulation.md) — hex movement, routes, supply/logistics rules the Military AI simulates before marching.
- [`02-economy.md`](./02-economy.md) — markets, tax, Prosperity yields, Land NFT sales the Economy AI participates in.
- [`03-military.md`](./03-military.md) — UnitClass counters, upkeep, Supply Trains used in composition and reserve math.
- [`04-battle-system.md`](./04-battle-system.md) — `WarScore`, `ResolutionMode`, AUTO resolver consuming archetype doctrines.
- [`05-pve-integration.md`](./05-pve-integration.md) — wild zones and monster surges the Director injects.
- [`07-backend-architecture.md`](./07-backend-architecture.md) — tick engine, command queue, Redis/Postgres, event bus carrying `DecisionRecord`s.
- [`08-data-models.md`](./08-data-models.md) — all schemas/enums used here: `Territory`, `Army`, `DiplomacyRelation`, `DiplomacyStance`, `Contract`, `GovernorKind`, constants.
