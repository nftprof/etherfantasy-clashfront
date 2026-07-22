/**
 * In-memory WorldState container for the tick engine (docs/01, docs/07 §3).
 * Hot state lives here during a tick; persistence (Redis write-through → Postgres)
 * is a later layer (docs/07). This container is what runTick mutates.
 *
 * The optional maps below the core entity maps are MVP demo state
 * (docs/briefs/MVP-JULY7.md): they live on WorldState (engine-owned container),
 * NOT on the canonical docs/08 entity interfaces, so canon stays untouched.
 */
import type { Army, BattleInstance, DevelopmentTrack, GovernorKind, Hex, LandNFT, Region, Territory, World } from '@clashfront/shared';
import type { EconomyState } from './economy';
import type { EngineBattleState } from './engineBattle';
import type { WildBattleState } from './wildBattle';

/**
 * MVP officer — mirror of a commanded Hero/Master (docs/08 `Master` interface).
 * Overseer assignment + army leadership. The optional `masterId…rentalExpires`
 * fields carry the LIVE EF Masters API roster (docs/09 §7) when a governor is
 * gated to the Masters their wallet owns/rents (server-boundary sync on PG
 * login, apps/server game.ts `syncOfficersFromMasters`); demo-roster officers
 * (dev name-login, API-down) leave them undefined.
 */
export interface DemoOfficer {
  id: string;                   // hero_… (internal ref; carries the real masterId below)
  ownerGovernorId: string;
  name: string;                 // display name (Masters API name, or data/CHARACTER_ROSTER.csv)
  fame: number;                 // feeds the WarScore hero term (capped by HERO_IMPACT_MAX)
  assignedTerritoryId?: string; // territory this officer oversees (docs/01 §11.3)
  // ── LIVE Masters API mirror (docs/09 §7) — present only for owned/rented Masters ──
  masterId?: number | string;   // EF masterId (e.g. 3001) — the champion key sent into battle
  slug?: string;                // champion slug (e.g. 'choco') — lets the MOBA pre-lock the seat
  source?: 'owned' | 'rented';  // ownership tenure from the Masters API
  koUntil?: string | null;      // ISO ts while KO'd (stored; live KO gate is post-MVP)
  joinChance?: number;          // % availability roll (docs/09 §7)
  rentalExpires?: string;       // ISO ts; RENTED only
}

/**
 * A pending PILLAGE | OCCUPY decision — post-victory on a battle winner, OR a
 * bloodless walk-in (F2 neutral towns: an army ends its march on a garrison-
 * free foreign/SYSTEM TOWN or populated SYSTEM settlement — no battle).
 * Kept in a WorldState map instead of on BattleInstance so the canonical
 * docs/08 battle schema is not extended for an MVP-only mechanism.
 */
export interface PendingChoice {
  /** Map key: = battleId for post-battle choices, `walkin:<armyId>:<tick>` for walk-ins. */
  id: string;
  /** Present for post-battle choices only. */
  battleId?: string;
  /** Walk-ins only: the arriving army — it must still stand on the territory when the choice resolves. */
  armyId?: string;
  governorId: string;           // governor who must choose
  territoryId: string;
  createdTick: number;
  expiresTick: number;          // tick at which the default action is applied
}

/**
 * Resolved bloodless outcome (walk-in PILLAGE/OCCUPY, wild-raid auto-pillage) —
 * the battle-less counterpart of BattleResult.territoryOutcome, appended so the
 * server can derive events after the fact (snapshot-safe).
 */
export interface WalkInOutcome {
  /** The PendingChoice id (or `raid:<armyId>:<tick>` for wild-raid auto-pillage). */
  choiceId: string;
  territoryId: string;
  governorId: string;
  armyId?: string;
  action: 'PILLAGE' | 'OCCUPY';
  lootCt: number;
  tick: number;
}

/** How a failed/tied attacker army left the field (docs/04 §7c.5). */
/**
 * Outcome of an ArmyRetreatRecord (docs/04 §7c.5 + Gap 2 pincer 2026-07-14):
 *   RETREATED  — army fell back to a safe adjacent hex (or came-from)
 *   SCATTERED  — nowhere safe, crippled remnant stands on the battle hex
 *   DISBANDED  — remnant below the scatter-disband threshold, army destroyed
 *   ABANDONED  — the PINCER outcome: army was previously retreated INTO a
 *                hostile came-from, that pincer battle was lost/fled; ALL
 *                soldiers lost, army fully disbanded, but the officer/Master
 *                returns to the undeployed pool (the officer→army link
 *                auto-frees on DISBANDED — game.ts:906). The escape hatch.
 */
export type RetreatResult = 'RETREATED' | 'SCATTERED' | 'DISBANDED' | 'ABANDONED';

export interface ArmyRetreatRecord {
  armyId: string;
  result: RetreatResult;
  /** Destination hex when result = RETREATED (absent for SCATTERED/DISBANDED — the army stays/dies on the battle hex). */
  toHexId?: string;
}

/**
 * Battle-logistics outcome record (docs/04 §7c.6) — endurance/structure terms,
 * outcome kind and retreat resolution for one resolved battle. Kept in a
 * WorldState map (battleId → record) instead of on BattleInstance so the
 * canonical docs/08 battle schema is not extended for the MVP resolver.
 */
export interface BattleLogisticsRecord {
  battleId: string;
  outcomeKind: 'DECISIVE_ATTACKER' | 'DECISIVE_DEFENDER' | 'TIE';
  /** Endurance multipliers actually applied (enduranceFloor..1). */
  attackerEndurance: number;
  defenderEndurance: number;
  /** Temporary command center erected from carried gold+wood: 0 = none, 1..N = balance.provisions.commandCenterTiers index+1. */
  commandCenterTier: number;
  /** Attacker score bonus fraction from the command center. */
  structureBonus: number;
  /** Carried food the attacker side burned (spent win or lose). */
  attackerFoodConsumed: number;
  /** Territory foodStock the defender side ate (home advantage is literal). */
  defenderFoodConsumed: number;
  /** Gold/wood spent erecting the command center (spent win or lose). */
  goldSpent: number;
  woodSpent: number;
  /** Retreat resolution per failed/tied attacker army. */
  retreats: ArmyRetreatRecord[];
}

export interface WorldState {
  world: World;
  regions: Map<string, Region>;
  hexes: Map<string, Hex>;
  territories: Map<string, Territory>;
  landNfts: Map<string, LandNFT>;
  armies: Map<string, Army>;
  battles: Map<string, BattleInstance>;
  // ── MVP demo state (docs/briefs/MVP-JULY7.md) ──────────────────────────────
  /**
   * Parcel-graph adjacency: hexId → sorted neighbor hexIds. The MVP runs on the
   * real hexagon-city parcel polygons (1 parcel = 1 Hex node, hexification
   * punted per the brief) — axial q/r on Hex are display-rounded centers only
   * and carry NO grid semantics; THIS map is the movement topology.
   */
  adjacency?: Map<string, string[]>;
  /** governorId → GovernorKind (players/NPCs/monster-SYSTEM registered at runtime). */
  governorKinds?: Map<string, GovernorKind>;
  /** MVP CT wallet per governor in ct_units (no ledger service yet — brief OUT list). */
  ctBalances?: Map<string, number>;
  /** governorId → officer pool (overseer cap = CONSTANTS.MAX_OVERSEEN_TERRITORIES). */
  officers?: Map<string, DemoOfficer[]>;
  /** battleId → pending PILLAGE/OCCUPY decision. */
  pendingChoices?: Map<string, PendingChoice>;
  /** armyId → monster display name (roster-flavored wild garrisons; display only). */
  monsterNames?: Map<string, string>;
  /** battleId → logistics outcome (endurance/CC terms, TIE, retreat resolution — docs/04 §7c). */
  battleLogistics?: Map<string, BattleLogisticsRecord>;
  /**
   * Intel memory (F1 fog of war): governorId → hexId → last tick the parcel was
   * inside one of the governor's ACCURATE sources. Within balance.intel.decayTicks
   * the memory still grades ACCURATE; older entries grade FUZZY forever.
   * Updated once per tick in the AI phase; snapshot-safe.
   */
  intel?: Map<string, Map<string, number>>;
  /** Bloodless PILLAGE/OCCUPY outcomes (F2 walk-ins, F3 raid sackings) — append-only log. */
  walkInOutcomes?: WalkInOutcome[];
  /** Live wild-raid provenance (F3): raid armyId → home lair record. Snapshot-safe. */
  wildRaids?: Map<string, WildRaidRecord>;
  /** F4 AGRI: territoryId → fractional food-production carry (integer, /TICKS_PER_DAY units). */
  foodCarry?: Map<string, number>;
  /** F4 ECON: territoryId → fractional CT-trickle carry (integer ct_units·ticks, /TICKS_PER_DAY units). */
  econCarry?: Map<string, number>;
  // ── Feature Set 3: circular economy (docs/briefs/FEATURESET-3-ECONOMY.md) ──
  /** E1/E5 economy container: supply totals, flow telemetry, settlement journal. */
  economy?: EconomyState;
  /**
   * E3 enrichment pools: territoryId → pooled ct_units. Attached to LAND, not
   * the payer — conquest inherits, PILLAGE loots ⚙ enrichLootPct. Engine
   * container field (canonical docs/08 Territory untouched), like foodCarry.
   */
  enrichmentPools?: Map<string, number>;
  /** E3: territoryId → fractional enrich-payout carry (integer ct_units·ticks, /TICKS_PER_DAY units). */
  enrichCarry?: Map<string, number>;
  /** E2 training queues: armyId → mustering queue (one active queue per territory ⚙). */
  trainingQueues?: Map<string, TrainingQueue>;
  /** E4: territoryId → invested ct_units per development track (raze salvage basis). */
  devInvestedCt?: Map<string, Partial<Record<DevelopmentTrack, number>>>;
  /**
   * RUNNING live wild battles (docs/04 §7b wild row): battleId → tactical
   * battle state. Created by BATTLE SPAWNING when a player army attacks a
   * monster-garrisoned wild parcel with TickOptions.liveWildBattles enabled;
   * advanced accelerated inside the tick (or LIVE by the server's 4 Hz driver
   * when `paced`), settled into a normal RESOLVED BattleInstance. Plain-JSON,
   * snapshot-safe — a saved world resumes its battles.
   */
  wildBattles?: Map<string, WildBattleState>;
  /**
   * PENDING ENGINE BATTLES (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md): battleId →
   * battle awaiting the external MOBA engine. Created by BATTLE SPAWNING when
   * TickOptions.engineBattles is on (replacing the instant WarScore resolve);
   * the hex is locked like a running wild battle; the server allocates the
   * match and applies the HMAC result callback as a server-boundary input; the
   * next tick settles it deterministically. Plain-JSON, snapshot-safe.
   */
  engineBattles?: Map<string, EngineBattleState>;
  /**
   * Reinforcement queue at locked hexes (Scenario H,
   * docs/briefs/REINFORCEMENT-LANE-QUEUE.md): battleId → queued armies. Filled
   * by BATTLE SPAWNING when an army arrives on a hex whose battle is already
   * running; drained when the battle resolves (all entries dropped) or when a
   * governor withdraws its army (server API). Plain-JSON, snapshot-safe.
   */
  reinforcementQueue?: Map<string, ReinforcementQueueEntry[]>;
  // ── Wave 1: resource foundation (WORLD-BUILD-OUT-PLAN, owner 2026-07-17) ──
  /** territoryId → material stockpile (map-based; CT is account-based). */
  stockpiles?: Map<string, Stockpile>;
  /** workerPetId → worker pet deployment (MINE/FARM/CRAFT/GUARD on a parcel). */
  workerPets?: Map<string, WorkerPet>;
  /** territoryId → fractional production carries per resource (integer, /TICKS_PER_DAY units). */
  stockpileCarry?: Map<string, Partial<Record<string, number>>>;
  /**
   * Wave 2: per-parcel AMM markets — territoryId → resource → constant-product
   * pool (market.ts). Seeded lazily on first trade; depth scales with
   * enrichment tier. Plain JSON, snapshot-safe.
   */
  markets?: Map<string, Partial<Record<string, { resource: number; gold: number }>>>;
  /**
   * Wave 3: delivery order board (TRANSPORT-DELIVERY-LAYER) — orderId →
   * contract. Escrowed rewards, deadlines + penalties, courier acceptance.
   * Plain JSON, snapshot-safe. Type lives in transport.ts.
   */
  deliveryOrders?: Map<string, import('./transport').DeliveryOrder>;
  // ── Wave 4.3: prosperity/tax heartbeat (docs/02 §3–§5) ────────────────────
  /**
   * territoryId → signed fractional prosperity-movement carry (integer,
   * /TICKS_PER_DAY units; positive while growing toward target, negative while
   * decaying — reset on direction change). Same pattern as foodCarry.
   */
  prosperityCarry?: Map<string, number>;
  /**
   * territoryId → pillage scar 0..100 (docs/02 §3 peaceScore = 1 − scar/100).
   * Set to 100 on pillage; decays ⚙ pillageScarDecayPerHour (~2 days to heal).
   * Engine container field — canonical docs/08 Territory untouched.
   */
  pillageScars?: Map<string, number>;
  // ── Wave 4.4: mythic reinforcement (MOBA-V3-BUILD-SPEC §5) ────────────────
  /** governorId → owned mythic-species NFTs (sorted; the spawn-right registry, decision 18). */
  mythicNfts?: Map<string, string[]>;
  /** governorId → species → battles since the last spawn (⚙ spawnEveryBattles triggers). */
  mythicCounters?: Map<string, Record<string, number>>;
  /** The public World Chronicle feed (decision 19 seed) — append-only. Type in mythics.ts. */
  chronicle?: import('./mythics').ChronicleEntry[];
  /** species → display name of the first player ever to slay that mythic. */
  mythicFirstSlain?: Record<string, string>;
  // ── Wave 4.5: civil rebellion (docs/01 §7) ────────────────────────────────
  /** territoryId → last-seen governor + the tick it changed (occupation-grace bookkeeping). */
  governorSeen?: Map<string, { governorId: string; tick: number }>;
  /** Live risings: rebel armyId → territoryId. Settled by the next phase-6 sweep (flip or crush). */
  rebellions?: Map<string, string>;
}

/**
 * A mustering army's training queue (Feature Set 3 E2): the full cost was paid
 * up-front (through the flow splitter); soldiers materialize `ratePerTick` per
 * tick in the PRODUCTION phase's TRAINING sub-phase. The army cannot march
 * while `remaining` is nonempty; attacked mid-muster it fights with the troops
 * trained so far × ⚙ training.musterPenalty.
 */
export interface TrainingQueue {
  armyId: string;
  territoryId: string;
  /** Soldiers still to materialize, per stack (same order as army.units). */
  remaining: { unitClass: string; count: number }[];
  /** Soldiers materialized per tick (⚙ baseRatePerTick × (1 + MIL × milRateBonus)). */
  ratePerTick: number;
  startedTick: number;
}

/**
 * A wild raid in flight (F3 active wild enemies): half a monster lair's
 * garrison marching at a player/NPC territory. Survivors auto-march back to
 * homeHexId and re-merge into the lair garrison; the record is dropped when
 * the raid army dies, merges, or replaces a fallen lair.
 */
export interface WildRaidRecord {
  armyId: string;
  /** The lair garrison the raid split from (survivors re-merge into it). */
  lairArmyId: string;
  homeHexId: string;
  targetHexId: string;
  spawnedTick: number;
}

/**
 * One army queued to reinforce a running battle at a locked hex
 * (docs/briefs/REINFORCEMENT-LANE-QUEUE.md, owner 2026-07-14). Scenario H of
 * BATTLE-SCENARIO-MATRIX.md §4: a march arrives at a hex whose battle is
 * already running; the army is offered to reinforce (queued), never silently
 * absorbed. The client turns the queue entry into a "join or approach from
 * another edge" prompt.
 *
 * The sim owns bookkeeping ONLY — actual soldier drain into the live match is
 * the match-server's job (per §"What each side owns" in the brief). The sim
 * knows the queue exists (for events + UX + engagement lock) but does NOT
 * mutate army.units while queued — those soldiers stand at the edge until they
 * commit (post-MVP, or engine handshake) or WITHDRAW.
 */
export interface ReinforcementQueueEntry {
  armyId: string;
  governorId: string;
  /** The hex the army came from — becomes the arrival EDGE identity for the lane. */
  edgeFromHexId: string;
  /** Which running-battle side the reinforcement joins. */
  side: 'ATTACKER' | 'DEFENDER';
  /** True when the army carries a Master (heroes join immediately, don't count vs soldierCapLive). */
  hasHero: boolean;
  queuedTick: number;
}

/**
 * Territory stockpile — the map-based material store (WORLD-BUILD-OUT-PLAN
 * wave 1, owner 2026-07-17). Materials are MAP-based (mined where they sit);
 * CT is ACCOUNT-based. Fed by MINE worker pets; consumed by CRAFT (arms),
 * fortification upgrades, and caravan cargo loading. Engine container field
 * (canonical docs/08 Territory untouched — same pattern as enrichmentPools).
 */
export interface Stockpile {
  wood: number;
  iron: number;
  stone: number;
  rareMetal: number;
  fur: number;
  /** Crafted arms by unit class (elite hire consumes 1). */
  arms: Partial<Record<string, number>>;
}

export function emptyStockpile(): Stockpile {
  return { wood: 0, iron: 0, stone: 0, rareMetal: 0, fur: 0, arms: {} };
}

/**
 * A worker pet deployed on a parcel (wave 1). Pets are commodity BODIES
 * (uncapped — the NFT blueprint is what's scarce, decision 18). Each worker
 * has a species (element + fur class from pets-aptitudes) and a role.
 *   MINE  → stockpile materials (biome-weighted)
 *   FARM  → territory foodStock
 *   CRAFT → converts stockpile materials into arms (needs workshop ⚙)
 *   GUARD → defensive contribution when the parcel is raided
 * All roles shed fur per species furClass (warm 0.5/day, leaf 0.2, phantom
 * 0.1, none 0).
 */
export type WorkerRole = 'MINE' | 'FARM' | 'CRAFT' | 'GUARD';

export interface WorkerPet {
  id: string;                  // pet_…
  ownerGovernorId: string;
  species: string;             // roster name (e.g. 'Chulember')
  element: string;             // t1 from pets-aptitudes (e.g. 'Fire')
  /** Fur shedding class: WARM | LEAF | PHANTOM | NONE. */
  furClass: string;
  assignedTerritoryId: string;
  role: WorkerRole;
  assignedTick: number;
}

/**
 * Deep snapshot/clone of the whole world state (structuredClone handles Maps).
 * Used for golden-master determinism tests, replay checkpoints, and rollback.
 */
export function snapshot(state: WorldState): WorldState {
  return structuredClone(state);
}

/**
 * Deterministic iteration helper: entity ids sorted lexicographically.
 * ULIDs sort by creation time, so processing order is stable and replayable
 * regardless of Map insertion order.
 */
export function sortedIds(map: ReadonlyMap<string, unknown>): string[] {
  return [...map.keys()].sort();
}
