# 05 — PvE Integration (EF Hunt)

> **EF Hunt** (*Live the Story. Become Stronger.*) is the EF ecosystem's story + PvE progression
> product ([`00-vision-and-product.md`](./00-vision-and-product.md#2-the-ether-fantasy-ecosystem)).
> This doc specifies how EF Hunt content lives **inside** the persistent Clash Front world: `WILD`
> zones, monster nodes, dungeons, world bosses, and geography-mapped story arcs. PvE is not a side
> mode — it is how the frontier gets opened, how the map stays alive between wars, and how the
> narrative physically changes the world.
>
> Canon terms (`ZoneType`, `Territory`, `Hero`, CT, Prosperity, `Contract`, `Node`, `LedgerEntry`)
> are defined in [`README.md`](./README.md#canonical-glossary) and
> [`08-data-models.md`](./08-data-models.md) — never redefined here.

---

## 1. Role in the ecosystem

EF Hunt supplies **Growth**; Clash Front supplies the **map it grows on**. The integration contract:

| Shared spine | Mechanism |
|---|---|
| **Shared Hero** | The same `Hero` record fights EF Hunt PvE and leads Clash Front armies. PvE grants `fame`, `equipmentIds`, `titleIds` — never permanent levels (Clash Front does not level heroes; see `Hero` in [`08-data-models.md`](./08-data-models.md#4-core-entities)). |
| **Shared CT wallet** | All PvE CT rewards settle through the same double-entry `LedgerEntry` ledger (invariant 1). One currency, one truth. |
| **Shared world state** | PvE content is placed on real `Hex`es and `Node`s of the one `World`. Clearing it has persistent map consequences — no instanced resets (North Star). |
| **Shared clock** | PvE spawning/despawning is driven by the world tick (`TICK_SECONDS = 60`) and seasons ([`01-world-simulation.md`](./01-world-simulation.md)). |

Narrative flow (*Begin Your Journey → Become Stronger → Prove Yourself → Change the World*): EF Hunt
is where a new player earns their first CT, first equipment, and first fame — and the frontier they
clear becomes the territory their guild later governs.

---

## 2. WILD zones: the uncontrolled frontier

A `WILD` zone is a full `Territory` with `zoneType: 'WILD'`, `governorKind: 'SYSTEM'`, and a
SYSTEM-owned `LandNFT` (`ownerPlayerId: undefined` ⇒ buyable later). Invariants 2 and 7 hold: the
NFT exists from world genesis, and taming never deletes the territory — it **mutates** `zoneType`
and `governorId`.

| Property | Governed territory (`VILLAGE/TOWN/…`) | `WILD` territory |
|---|---|---|
| Governor | Player / Guild / Alliance / NPC Kingdom | `SYSTEM` (the wilderness itself) |
| Tax / Prosperity yield | Full economy loop ([`02-economy.md`](./02-economy.md)) | None; `prosperity` frozen at a low **Taming Score** proxy (see below) |
| Population / Food | Simulated per tick | 0 / 0 (no civil sim) |
| Supply source | Possible (`supplySource: true`) | Never — armies crossing deep WILD burn Supply with no relief |
| Hostility | Battles only vs. other governors | **Threat Level 0–100**; hostile spawns attack armies and supply trains passing through |
| Battles | `FIELD/SIEGE/NAVAL` vs. players/NPCs | PvE `BattleInstance`s vs. SYSTEM-owned spawn armies (same scheduler, [`04-battle-system.md`](./04-battle-system.md)) |
| Claimable | Via war (Occupy) | Via **Taming** (below) |

### 2.1 Taming: clearing a WILD zone

Each WILD territory tracks a **Taming Score 0–100** (stored in the `prosperity` field while
`zoneType = 'WILD'`, so no schema change; semantics flip on conversion). Clearing PvE content inside
the territory raises it; unresolved spawns decay it (−1 per 6h per active spawn).

```
Taming flow (per WILD territory):
  clear nodes/dungeons → TamingScore ↑ → at 100, a CAPSTONE spawn appears (den/boss)
  → defeat capstone → zoneType flips WILD → VILLAGE (or HARBOR if coastal)
  → territory enters a 72h CLAIM WINDOW: any Governor may Occupy uncontested;
    contested claims spawn a normal FIELD BattleInstance
  → LandNFT remains SYSTEM-owned and listed for sale (listedForSalePriceCt set by system auction)
```

**What taming unlocks:** a new claimable `Territory` (fresh Land NFT supply for the market), any
`Route`s that crossed it become safe (Threat Level → 0, movement cost multiplier removed), its
resource `Node`s convert to governed production, and adjacent WILD territories reveal their content
(fog-of-frontier). This is the primary faucet of *map growth* — expansion into the 5% non-NPC world
at launch (`LAUNCH_NPC_TERRITORY_PCT = 0.95` covers NPC kingdoms; WILD is carved from both frontier
gaps and NPC collapse, see [`06-ai-architecture.md`](./06-ai-architecture.md)).

---

## 3. PvE content types on the overworld

All PvE content is a **WildSpawn** attached to a `Node` on a `Hex`. Schema (to be merged into
[`08-data-models.md`](./08-data-models.md) §4 in the same PR — do not invent fields elsewhere):

```ts
export type WildSpawnKind = 'MONSTER_NODE' | 'ROAMER' | 'DUNGEON' | 'EXPEDITION' | 'WORLD_BOSS';

interface WildSpawn {
  id: string;                  // spawn_…
  worldId: string; hexId: string; nodeId: string;
  kind: WildSpawnKind;
  tier: 1 | 2 | 3 | 4 | 5;     // region-gated difficulty (see §7)
  threat: number;              // 0–100 contribution to territory Threat Level
  spawnedTick: number; despawnTick?: number;
  storyArcId?: string;         // set for narrative spawns (§5)
  rewardTableId: string;       // balance.json-versioned loot table
  state: 'DORMANT' | 'ACTIVE' | 'ENGAGED' | 'CLEARED' | 'ESCALATED';
}
```

| Kind | Where | Spawn rule | Despawn / escalation | Cleared by |
|---|---|---|---|---|
| **MONSTER_NODE** | WILD hexes; low-Prosperity governed hexes (< 20) | Tick-driven: each WILD territory rolls per hour toward a target density (2–5 active per territory) | Despawns 72h after spawn if uncleared, respawns elsewhere | Solo/party Heroes (EF Hunt combat) or an `Army` sweep (`AUTO`) |
| **ROAMER** (rare/roaming monster) | Moves hex-to-hex along `Route`s like a mini-army | Seasonal + rare tick roll (~1 per Region per week); path visible to scouts | Escalates: if alive 7 days, upgrades one tier and starts raiding Supply Trains | Hero party intercept; drops rare equipment |
| **DUNGEON** | Fixed `Node`s (shrines, ruins) on specific hexes | Persistent entrance; interior instances via EF Hunt, but the *entrance* is contested map space | Never despawns; lockout timers per Hero (§7) | 1–5 Heroes; first-clear raises Taming Score sharply |
| **EXPEDITION** | Multi-hex chain of objectives across a Region | Weekly/seasonal schedule tied to story beats (§5) | Expires at season end | Guild-scale: mixes Hero fights with army escort legs (uses `ESCORT_SUPPLY`-style logistics) |
| **WORLD_BOSS** | One anchor hex; threat radius over a Region | Seasonal story trigger or Threat Level ≥ 90 in ≥ 3 adjacent WILD territories | Does **not** despawn — escalates (§6) | Server-scale cooperation |

Spawning is executed by the PvE director inside the world tick loop
([`07-backend-architecture.md`](./07-backend-architecture.md)): every tick it reconciles actual vs.
target spawn density per Region, honoring seasonal modifiers from
[`01-world-simulation.md`](./01-world-simulation.md) (e.g., winter halves MONSTER_NODE density but
doubles ROAMER aggression).

---

## 4. Resource rewards & CT conservation

PvE is a **CT source** and must obey invariant 1 (*no CT created outside `reason:'mint'`*). Two
funding paths, both auditable:

1. **Minted rewards** — `LedgerEntry { fromAccount: 'system:treasury', toAccount: 'player_…',
   reason: 'mint', refId: spawnId }`. All baseline PvE CT is issuance and counts against the
   CT sink/source ratio target (0.9–1.1, [`00-vision-and-product.md`](./00-vision-and-product.md#8-success-metrics-macro-game-kpis)).
   The PvE mint budget is a per-season cap in `balance.json`; the director throttles reward tables
   when the rolling ratio exceeds 1.05.
2. **Funded bounties** — Governors/NPC Kingdoms post `Contract`s (e.g., `BOUNTY_HERO`-analogous
   PvE bounty; see §8) whose `rewardCt` is escrowed player/treasury CT. This is circulation, not
   issuance — no mint entry.

| Reward | From | Enters economy as |
|---|---|---|
| CT | Loot tables (minted) + bounty contracts (funded) | Wallet CT; spent into sinks (build/train/repair, [`02-economy.md`](./02-economy.md)) |
| **Materials** (hide, ore, essence) | MONSTER_NODE, ROAMER, DUNGEON | Crafting inputs for hero equipment & structure repair discounts — a *sink enabler*, not currency |
| **Food-adjacent** (game meat, wild harvest) | MONSTER_NODE sweeps by armies | Credits the sweeping army's `supply` or the nearest friendly territory's `foodStock` (whole integers; never negative — invariant 5) |
| **Equipment / cosmetics** | DUNGEON, ROAMER, WORLD_BOSS | `Hero.equipmentIds` — affects HeroImpact only within `HERO_IMPACT_MAX = 0.20` (invariant 4) |
| **Fame / titles** | First-clears, boss kills, taming capstones | `Hero.fame`, `titleIds` — reputation, contract gating, cosmetics |

> **Hard rule for implementers:** there is no code path that credits CT from PvE except a ledger
> write with `reason:'mint'` (system-funded) or a `Contract` escrow release (player/NPC-funded).
> Reward tables that bypass the ledger violate invariant 1 and fail audit replay.

---

## 5. Lore & story mapped to geography

Story arcs are **placed, not paged**. Each arc (`storyArcId`) binds to a Region and expresses beats
as world-state changes:

| Beat type | Example | World effect |
|---|---|---|
| **Regional arc unlock** | "The Ashen Isles" opens when any Hero tames a HARBOR-coastal WILD territory in the archipelago | New Region's WILD content activates; new sea `Route` drawn |
| **Route blocker** | Boss "Vorag the Landslide" awakens in a mountain pass | The pass hexes' `moveCost` ×4 and Threat 100 until the boss falls — armies must detour (travel time is a weapon, Pillar 2) |
| **NPC kingdom flip** | Season 2 finale: cult corrupts an NPC Kingdom's court | That kingdom's `DiplomacyStance` shifts `HOSTILE` toward all neighbors; its border territories gain corrupted MONSTER_NODEs ([`06-ai-architecture.md`](./06-ai-architecture.md) executes the personality swap) |
| **Seasonal map beat** | Winter Hunt festival | ROAMER density ×3 for two weeks; unique loot table; taming decay paused |

Individual *story chapters* (dialogue, solo quests) run inside EF Hunt clients, but every chapter's
**gate and consequence live on the Clash Front map**. A player cannot out-level geography: reaching
Tier 4 story content requires physically traveling (real travel time) to a Tier 4 Region.

---

## 6. World bosses as macro events

A WORLD_BOSS is a Region-scale threat with a public **escalation clock**:

```
Phase 0 DORMANT   — rumors (scout reports, story beats), 3–7 days
Phase 1 ACTIVE    — boss anchored; threat radius = 2 hexes; Prosperity −1/day in radius
Phase 2 ESCALATED — radius grows +1 hex / 3 days; spawns raiding packs that attack
                    Supply Trains, garrisons, and NPC Kingdom patrols alike
Phase 3 RAMPAGE   — boss besieges the nearest governed Territory (real SIEGE
                    BattleInstance, SYSTEM as attacker). Loss ⇒ territory flips to WILD
                    (zoneType mutation — never deletion, invariant 7)
```

**Cooperation is structural:** the boss's health pool is sized for multiple guilds; damage credit is
shared; even governors at `WAR` stance can contribute (a temporary PvE-scope truce flag suppresses
friendly-fire targeting in the boss `BattleInstance` only — the war resumes at resolution). Rewards
scale with contribution: minted CT (§4), unique equipment, fame, and a Prosperity +10 recovery pulse
for the threatened Region.

**Ignoring it is a real strategy with real cost:** rival regions may deliberately let a boss eat a
competitor's frontier. NPC Kingdoms will not — their Military AI treats Phase 2+ bosses as invasions
([`06-ai-architecture.md`](./06-ai-architecture.md)) and marches on them, which can strip their
borders and open *them* to opportunistic players. Wild threats pressure everyone.

---

## 7. Difficulty scaling & anti-farm economics

PvE must never become a CT printer that trivializes tax/lease/contract income (target: non-combat
earners ≥ 25%, and sink/source 0.9–1.1).

| Control | Rule |
|---|---|
| **Region tier gating** | Regions carry tier 1–5; reward tables scale with tier, but tier N content requires physical presence in a tier N Region — travel time (`TRAVEL_REGION_HOURS = 3`, `TRAVEL_OCEAN_HOURS = 12`) is the throttle |
| **Per-Hero diminishing returns** | Rolling 24h window: clears 1–5 at 100% rewards, 6–10 at 50%, 11–20 at 20%, then materials-only (CT reward = 0, no mint entry) |
| **Dungeon lockouts** | Per-Hero per-dungeon: 20h lockout; first-clear-of-week bonus only once |
| **Node contest, not queue** | A `CLEARED` MONSTER_NODE respawns *elsewhere* in the territory — no camping fixed coordinates |
| **Season mint budget** | Global PvE mint cap in `balance.json`; director degrades CT (not materials/fame) rewards first when approaching cap |
| **Army-sweep discount** | `AUTO` army sweeps of nodes yield Food/Supply and Taming Score but only 25% of the Hero CT reward — mass military farming is intentionally inefficient |
| **No power creep** | All combat-relevant PvE output is equipment inside the `HERO_IMPACT_MAX = 0.20` clamp; fame and titles are influence, not stats |

> ❓ OPEN: exact diminishing-return breakpoints and the seasonal mint cap are Economy-owned tuning in
> `balance.json`, per [`08-data-models.md`](./08-data-models.md#2-canonical-constants).

---

## 8. How PvE feeds PvP and the macro game

- **Fame gates Contracts.** High-`fame` Heroes unlock higher-tier `Contract` boards
  (`MERCENARY_ATTACK/DEFEND`, `BOUNTY_HERO`, `ESCORT_SUPPLY`) — PvE reputation converts into paid
  PvP work. Proposed addition to `ContractType` (merge into 08 in the same PR):
  `'HUNT_BOUNTY'` — a Governor escrows `rewardCt` for clearing a named `WildSpawn` in/near their
  territory (funded sink path, §4).
- **Equipment sharpens, never dominates.** Boss/dungeon gear improves HeroImpact strictly within
  the 20% clamp; armies (≥ 80%) still win wars.
- **Taming opens frontiers.** New claimable territories, new Land NFTs on the market, new Routes —
  expansion pressure that generates the *next* wars. Empire-builders fund Hero parties (via
  `HUNT_BOUNTY`) to open the land they intend to Occupy.
- **Threat as terrain.** Uncleared WILD along a border is a defensive moat and a supply hazard —
  choosing *not* to tame is a legitimate military posture.
- **NPC Kingdoms compete for PvE.** Their AI tames adjacent WILD territories and answers bosses,
  so passive players watch the frontier close without them ([`06-ai-architecture.md`](./06-ai-architecture.md)).

---

## Cross-references

- [`README.md`](./README.md) — canonical glossary (`ZoneType WILD`, `Territory`, `Hero`, CT,
  Prosperity, `Contract`, `Node`, `Route`), North Star, Macro Pillars
- [`00-vision-and-product.md`](./00-vision-and-product.md) — EF Hunt's role, shared CT wallet/heroes,
  KPI targets (sink/source ratio, non-combat earners)
- [`01-world-simulation.md`](./01-world-simulation.md) — hexes, travel time, seasons driving spawn cycles
- [`02-economy.md`](./02-economy.md) — CT sinks/sources, Prosperity, why PvE mint budgets exist
- [`03-military.md`](./03-military.md) — armies/supply trains that WILD threats raid; army sweeps
- [`04-battle-system.md`](./04-battle-system.md) — PvE `BattleInstance`s reuse the battle scheduler
- [`06-ai-architecture.md`](./06-ai-architecture.md) — NPC Kingdom responses to wild threats; PvE director placement in the AI loop
- [`07-backend-architecture.md`](./07-backend-architecture.md) — tick engine hosting the spawn director
- [`08-data-models.md`](./08-data-models.md) — `ZoneType`, `Territory`, `LedgerEntry`, invariants;
  merge target for `WildSpawn` and `HUNT_BOUNTY`
