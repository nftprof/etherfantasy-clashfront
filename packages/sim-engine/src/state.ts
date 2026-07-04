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
export type RetreatResult = 'RETREATED' | 'SCATTERED' | 'DISBANDED';

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
