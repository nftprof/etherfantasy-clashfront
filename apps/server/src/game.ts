/**
 * Game — the server-side wrapper around the deterministic sim core
 * (docs/briefs/MVP-JULY7.md item 3 + the item-5 NPC slice).
 *
 * Owns the WorldState, the session table, the order API (join/claim/raise/
 * march/choice), per-tick event derivation + changed-subset deltas for the WS
 * broadcast, the NPC kingdom AI, and JSON snapshot persistence.
 *
 * Determinism boundary (docs/AGENTS.md prime directive 6): everything that
 * mutates the world draws randomness ONLY from forks of the seeded base RNG —
 * player orders from `order:<seq>` streams (seq persisted in the snapshot),
 * the sim from runTick's own `t<tick>` forks, the NPC from `npc:<tick>` forks.
 * Wall clock and crypto randomness are allowed ONLY for session tokens, which
 * never touch the sim.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type Army,
  type Balance,
  CONSTANTS,
  createRng,
  DEVELOPMENT_TRACKS,
  type DevelopmentTrack,
  type GovernorKind,
  newId,
  type PostVictoryAction,
  type Rng,
  type Territory,
  TICKS_PER_DAY,
  ulid,
  loadBalance,
} from '@clashfront/shared';
import {
  abandonTerritory,
  addGovernor,
  applyWildBattleCommand,
  armyEngagedIn,
  armyInEngineBattle,
  armyStrength,
  type BattleLogisticsRecord,
  claimTerritory,
  computeIntel,
  DEMO_ARMY_PRESETS,
  developTerritory,
  type DemoArmyPreset,
  type DemoOfficer,
  type DemoWorldFile,
  type DuelExchange,
  type DuelSide,
  type BuildSpot,
  buildStructure,
  repairStructure,
  type EconomyState,
  engineCommandSlotCount,
  type EngineBattleState,
  type EngineOutcome,
  type EngineSideResult,
  enrichTerritory,
  ensureEconomy,
  findPath,
  type IntelGrade,
  intelGrade,
  isMustering,
  loadDemoWorld,
  marchFoodPerStep,
  orderMarch,
  provisionArmy,
  recordMint,
  raiseArmy,
  raiseCost,
  type RaiseCostBreakdown,
  razeTerritory,
  resolvePostVictory,
  runTick,
  type SettlementRecord,
  sortedIds,
  stepTicks,
  stepWildBattle,
  supplyComponents,
  type TickOptions,
  type TrainingQueue,
  troopCount,
  type WalkInOutcome,
  type WildBattleCmd,
  type WildBattleState,
  type WildRaidRecord,
  type WorldState,
} from '@clashfront/sim-engine';
import type { AllocateJoinGrant } from './battleEngine';
import { loadStandbyBattlefield, loadParcelBattlefield } from './battlefield';
import type { OwnedMaster } from './masters';
import { GOVERNOR_PALETTE, NPC_COLOR, officerNamesForJoin, WILD_COLOR } from './roster';
import {
  armyView,
  type ArmyView,
  battleView,
  type BattleView,
  buildParcelByHex,
  territoryView,
  type TerritoryView,
  type ViewerContext,
  type WorldParcelView,
} from './views';

/** Placeable base-building module keys (docs/briefs/BASE-BUILDING-DEFENSE-LAYER.md). */
const BUILD_KEYS: readonly string[] = ['TOWER', 'WALL', 'GATE', 'TRAP', 'GRANARY', 'PET_DEN'];

// ── Errors ────────────────────────────────────────────────────────────────────

/** API error carrying an HTTP status + machine code; serialized as {error:{code,message}}. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Translate sim-engine order-validation throws into 4xx ApiErrors. */
/**
 * Read the "special links" from data/zone-registry.json — the not-plannable
 * edges Agent D locks: kraken drags, the Diminishing Stair, etc. Cached module-
 * lifetime because the registry is a world-constitution file (changes rarely,
 * server restarts on a change). Returns [] on any read/parse failure so an
 * absent or broken file never blocks /api/world.
 */
let zoneLinksCache: unknown[] | undefined;
function readZoneLinks(): unknown[] {
  if (zoneLinksCache !== undefined) return zoneLinksCache;
  const candidates = [
    join(process.cwd(), 'data', 'zone-registry.json'),
    join(process.cwd(), '..', '..', 'data', 'zone-registry.json'),
    join(process.cwd(), '..', '..', '..', 'data', 'zone-registry.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
      const zl = raw['zoneLinks'] as { locked?: unknown[] } | undefined;
      zoneLinksCache = Array.isArray(zl?.locked) ? zl!.locked as unknown[] : [];
      return zoneLinksCache;
    } catch { /* fall through */ }
  }
  zoneLinksCache = [];
  return zoneLinksCache;
}

function translateSimError(e: unknown): ApiError {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('already governed')) return new ApiError(409, 'ALREADY_OWNED', msg);
  if (msg.includes('occupied by wild monsters')) return new ApiError(409, 'WILD_OCCUPIED', msg);
  if (msg.includes('oversight cap')) return new ApiError(409, 'OVERSIGHT_CAP', msg);
  if (msg.includes('no free officer')) return new ApiError(409, 'NO_FREE_OFFICER', msg);
  if (msg.includes('insufficient CT')) return new ApiError(400, 'INSUFFICIENT_CT', msg);
  if (msg.includes('already at max level')) return new ApiError(409, 'MAX_DEV_LEVEL', msg);
  if (msg.includes('ungoverned wilds')) return new ApiError(409, 'UNGOVERNED', msg);
  if (msg.includes('not adjacent')) return new ApiError(400, 'BAD_PATH', msg);
  if (msg.includes('is not an officer')) return new ApiError(400, 'BAD_HERO', msg);
  if (msg.includes('must be in GARRISON')) return new ApiError(409, 'NOT_IN_GARRISON', msg);
  if (msg.includes('not at a friendly territory')) return new ApiError(409, 'NOT_FRIENDLY_TERRITORY', msg);
  if (msg.includes('non-negative integer')) return new ApiError(400, 'BAD_AMOUNT', msg);
  if (msg.includes('positive integer')) return new ApiError(400, 'BAD_AMOUNT', msg);
  if (msg.includes('still mustering')) return new ApiError(409, 'MUSTERING', msg);
  if (msg.includes('engaged in battle')) return new ApiError(409, 'ENGAGED', msg);
  if (msg.includes('training queue busy')) return new ApiError(409, 'QUEUE_BUSY', msg);
  if (msg.includes('no level to raze')) return new ApiError(409, 'NOTHING_TO_RAZE', msg);
  if (msg.includes('a battle rages')) return new ApiError(409, 'BATTLE_RAGING', msg);
  return new ApiError(400, 'BAD_ORDER', msg);
}

// ── Events (WS `tick` payload) ────────────────────────────────────────────────

export type GameEvent =
  | { type: 'player_joined'; tick: number; governorId: string; name: string; color: string }
  | { type: 'territory_claimed'; tick: number; territoryId: string; parcelId: string; governorId: string }
  | { type: 'army_raised'; tick: number; armyId: string; territoryId: string; parcelId: string; governorId: string; preset: string }
  | { type: 'march_ordered'; tick: number; armyId: string; governorId: string; fromParcelId: string; toParcelId: string; etaTick: number }
  | { type: 'army_arrived'; tick: number; armyId: string; governorId: string; parcelId: string }
  | {
      /**
       * A LIVE wild battle started on a parcel (docs/04 §7b wild row): a player
       * army is assaulting a monster lair in real time. Watch via WS
       * {t:'battle_sub'}; the attacking owner may steer. Resolution arrives
       * later as a normal battle_resolved.
       */
      type: 'battle_started';
      tick: number;
      battleId: string;
      parcelId: string;
      attackerGovernorIds: string[];
      defenderGovernorIds: string[];
      monsterName?: string;
      attackerTroops: number;
      defenderTroops: number;
      /**
       * True for PENDING ENGINE BATTLES (external MOBA match — no built-in
       * command feed yet); the client keeps the viewer closed and puts the
       * hero-mode doorway on the parcel card instead.
       */
      engine?: true;
      /**
       * True only for LIVE (30 Hz, steerable) engine battles (docs/04 §3a):
       * the command viewer / ⚡ doorway is offered ONLY for these. Accelerated
       * (AUTO) engine battles resolve fast and are watch-only after — no viewer.
       */
      live?: boolean;
    }
  | {
      /**
       * Hero-mode doorway (ALLOCATE-CALLBACK-SCHEMA §1b): a live-mode engine
       * allocate returned a join grant for this governor. STRICTLY PRIVATE to
       * `governorId` — never broadcast to other viewers (fog/canon rule).
       */
      type: 'battle_joinable';
      tick: number;
      battleId: string;
      parcelId: string;
      governorId: string;
      joinUrl: string;
    }
  | {
      type: 'battle_resolved';
      tick: number;
      battleId: string;
      parcelId: string;
      /** 'ATTACKER' | 'DEFENDER' | 'DRAW'. */
      winner: string;
      /** docs/04 §7c.6 outcome kind (DECISIVE_ATTACKER | DECISIVE_DEFENDER | TIE). */
      outcome?: 'DECISIVE_ATTACKER' | 'DECISIVE_DEFENDER' | 'TIE';
      attackerGovernorIds: string[];
      defenderGovernorIds: string[];
      attackerScore: number;
      defenderScore: number;
    }
  | {
      /** Battle clock expired below TIE_THRESHOLD — no territory change; the attacker retreats (docs/04 §7c.4). */
      type: 'battle_tied';
      tick: number;
      battleId: string;
      parcelId: string;
      attackerGovernorIds: string[];
      defenderGovernorIds: string[];
    }
  | {
      /** A failed/tied attacker army fell back to an adjacent parcel (docs/04 §7c.5). */
      type: 'army_retreated';
      tick: number;
      battleId: string;
      armyId: string;
      governorId: string;
      fromParcelId: string;
      toParcelId: string;
    }
  | {
      /** A failed/tied attacker army had no retreat line: SCATTER_CASUALTY_PCT extra losses, morale collapse; disbanded = true when < ⚙10% remained. */
      type: 'army_scattered';
      tick: number;
      battleId: string;
      armyId: string;
      governorId: string;
      parcelId: string;
      disbanded: boolean;
    }
  | { type: 'choice_pending'; tick: number; battleId: string; governorId: string; territoryId: string; parcelId: string; expiresTick: number }
  | {
      /**
       * F2 walk-in: an army ended its march on a garrison-free town/settlement —
       * bloodless PILLAGE/OCCUPY choice, no battle. Resolve via POST /api/choice
       * with { battleId: choiceId }. Private to the arriving governor.
       */
      type: 'town_entered';
      tick: number;
      choiceId: string;
      armyId: string;
      governorId: string;
      territoryId: string;
      parcelId: string;
      zoneType: string;
      expiresTick: number;
    }
  /** battleId doubles as the choiceId for bloodless (walk-in / raid-sacking) outcomes. */
  | { type: 'territory_occupied'; tick: number; battleId: string; territoryId: string; parcelId: string; governorId: string; lootCt: number }
  | { type: 'territory_pillaged'; tick: number; battleId: string; territoryId: string; parcelId: string; governorId: string; lootCt: number }
  | { type: 'npc_expand'; tick: number; governorId: string; armyId: string; fromParcelId: string; toParcelId: string }
  | {
      /** F4: a development track leveled up (player order or NPC round-robin). */
      type: 'territory_developed';
      tick: number;
      territoryId: string;
      parcelId: string;
      governorId: string;
      track: string;
      level: number;
      costCtUnits: number;
    }
  | {
      /** E2: an army finished mustering — its training queue is empty and it may march. */
      type: 'army_mustered';
      tick: number;
      armyId: string;
      governorId: string;
      parcelId: string;
      troops: number;
    }
  | {
      /** E3: a governor enriched a parcel — amountCtUnits went through the splitter, toPoolCtUnits landed in pools. */
      type: 'territory_enriched';
      tick: number;
      territoryId: string;
      parcelId: string;
      governorId: string;
      amountCtUnits: number;
      /** LANDYIELD share that actually reached enrichment pools (spend parcel + ring-1). */
      toPoolCtUnits: number;
    }
  | {
      /** E4: a development level was razed for salvage. */
      type: 'territory_razed';
      tick: number;
      territoryId: string;
      parcelId: string;
      governorId: string;
      track: string;
      /** Level AFTER the raze. */
      level: number;
      salvageCtUnits: number;
      burnedCtUnits: number;
    }
  | {
      /**
       * A governor ABANDONED a territory — it reverts to unowned wilds; the
       * overseer and any garrison are freed; development, structures and the
       * enrichment pool STAY with the land. PUBLIC (ownership changes are
       * public intel — docs/briefs/FEATURESET-2.md F1).
       */
      type: 'territory_abandoned';
      tick: number;
      territoryId: string;
      parcelId: string;
      governorId: string;
    }
  | {
      /** F3: a monster lair split a raid army that is now marching (visible, interceptable). */
      type: 'wild_raid';
      tick: number;
      armyId: string;
      governorId: string;
      monsterName?: string;
      troops: number;
      fromParcelId: string;
      toParcelId: string;
    }
  | {
      /**
       * A HERO-vs-HERO card duel settled (docs/briefs/HERO-DUEL-SPEC.md, decision 14).
       * Champions settle it; troops are spared. The loser Master is KO'd. Visible
       * to both governors (challenger + target) and ACCURATE-intel bystanders of
       * the parcel it happened on — a great-deed style public beat.
       */
      type: 'duel_resolved';
      tick: number;
      duelId: string;
      parcelId?: string;
      challengerGovernorId: string;
      targetGovernorId: string;
      /** Both governor ids, so eventsFor lets each participant through. */
      attackerGovernorIds: string[];
      defenderGovernorIds: string[];
      winnerName: string;
      loserName: string;
      /** True when the challenger (side A) won. */
      challengerWon: boolean;
    };

export interface TickDeltas {
  territories: TerritoryView[];
  armies: ArmyView[];
  battles: BattleView[];
}

export interface TickResult {
  tick: number;
  events: GameEvent[];
  deltas: TickDeltas;
}

/**
 * One keyframe of a battle's compact strength-progression timeline (docs/04
 * §7b post-battle review). NOT 30 Hz telemetry — a few keyframes synthesized
 * from start troop counts → known final casualties with a seeded rhythm (an
 * honest reconstruction for AUTO/accelerated battles, a scrub track for review).
 * `t` is a 0..1 fraction of the fight; `a`/`b` are attacker/defender troop
 * counts at that point; `ev` tags a notable beat (engage / rout).
 */
export interface BattleTimelineFrame {
  t: number;
  a: number;
  b: number;
  ev?: string[];
}

/**
 * A recently-resolved battle kept in the bounded review ring (docs/04 §7b).
 * Battles resolve fast (accelerated is the default per §3a) — the player can no
 * longer catch them live, so the last ⚙ `review.ringCap` settlements are kept
 * (newest-first, fog-filtered per viewer) for a post-battle result/replay panel.
 * `hexId` is internal (the fog gate); `recentBattlesFor` strips it and adds a
 * per-viewer `mine`.
 */
export interface RecentBattleRecord {
  battleId: string;
  parcelId: string;
  parcelName: string;
  /** Internal fog gate — never exposed on the wire (stripped by recentBattlesFor). */
  hexId: string;
  attackerGovernorIds: string[];
  defenderGovernorIds: string[];
  attackerLabel: string;
  defenderLabel: string;
  monsterName?: string;
  startedTick: number;
  resolvedTick: number;
  winner: 'ATTACKER' | 'DEFENDER' | 'TIE';
  /** Engine outcome reason (e.g. NEXUS_DESTROYED) or the §7c.6 outcomeKind. */
  reason: string;
  /** AUTO (instant WarScore) | LIVE (wild tactical sim) | ACCELERATED (external engine). */
  resolutionMode: string;
  /** True when the fight had a real LIVE/bridge telemetry feed (client may hold a final frame). */
  wasLive: boolean;
  casualties: { attacker: number; defender: number };
  survivors: { attacker: number; defender: number };
  startStrength: { attacker: number; defender: number };
  timeline: BattleTimelineFrame[];
}

/**
 * A recently-settled HERO-vs-HERO card duel kept in a bounded ring for review
 * (docs/briefs/HERO-DUEL-SPEC.md). The `rounds[]` is the deterministic replay
 * script (played cards + who won each round + any artifact proc) the card UI
 * re-reveals. `hexId` is the internal fog gate — stripped by `recentDuelsFor`.
 */
export interface RecentDuelRecord {
  duelId: string;
  parcelId?: string;
  hexId?: string;
  challengerGovernorId: string;
  targetGovernorId: string;
  challengerName: string;
  targetName: string;
  challengerArtifact?: string;
  targetArtifact?: string;
  /** 'A' (challenger) | 'D' (target). */
  winner: 'A' | 'D';
  winnerName: string;
  exchanges: DuelExchange[];
  resolvedTick: number;
  /** True when a human picked at least one stance live (vs pure auto/NPC). */
  wasLive: boolean;
}

// ── Sessions / governors ─────────────────────────────────────────────────────

export interface Session {
  token: string;
  playerId: string; // = governorId for the MVP (name-only login, no account layer)
  governorId: string;
  name: string;
}

export interface GovernorMeta {
  governorId: string;
  name: string;
  kind: GovernorKind;
  color: string;
}

// ── Config / persistence shapes ───────────────────────────────────────────────

export interface GameConfig {
  worldFile: DemoWorldFile;
  seed: string;
  tickOptions: TickOptions;
  /** NPC kingdom acts every N ticks (0 disables the NPC entirely). */
  npcEveryTicks: number;
  /** Starting CT wallet per joining player, in ct_units. */
  startCtUnits: number;
  /** NPC kingdom war chest, in ct_units. */
  npcCtUnits: number;
  /** Master display names (data/CHARACTER_ROSTER.csv); falls back to a built-in list when empty. */
  masterNames: readonly string[];
  /** JSON snapshot path; loaded on construction when present, written by saveToDisk(). */
  savePath?: string;
  /** Override balance.json path (tests/scenarios; default = the packaged balance). */
  balancePath?: string;
}

interface SaveFileV1 {
  version: 1;
  seed: string;
  orderSeq: number;
  npcGovernorId: string;
  sessions: Session[];
  governors: [string, GovernorMeta][];
  /** PG identity bindings: pgUid → governorId (docs/briefs/PG-IDENTITY.md). Optional for pre-PG saves. */
  pgBindings?: [string, string][];
  /** governorId → canonical PG username (docs/maps/ECONOMY-SEAM.md §1). Optional for pre-maps saves. */
  pgUsernames?: [string, string][];
  purchases?: [string, number][];
  /** Recently-resolved battle review ring (docs/04 §7b). Optional for pre-review saves. */
  recentBattles?: RecentBattleRecord[];
  /** Recently-settled hero-duel review ring (HERO-DUEL-SPEC.md). Optional for pre-duel saves. */
  recentDuels?: RecentDuelRecord[];
  /** Monotonic duel counter (seeds each duel's deterministic RNG). Optional for pre-duel saves. */
  duelSeq?: number;
  state: SerializedWorldState;
}

interface SerializedWorldState {
  world: WorldState['world'];
  regions: [string, unknown][];
  hexes: [string, unknown][];
  territories: [string, unknown][];
  landNfts: [string, unknown][];
  armies: [string, unknown][];
  battles: [string, unknown][];
  adjacency: [string, string[]][];
  governorKinds: [string, GovernorKind][];
  ctBalances: [string, number][];
  officers: [string, DemoOfficer[]][];
  pendingChoices: [string, unknown][];
  monsterNames: [string, string][];
  /** Optional for pre-logistics saves (Stream B, docs/04 §7c). */
  battleLogistics?: [string, BattleLogisticsRecord][];
  /** Intel memory (F1): governorId → [hexId, lastAccurateTick][]. Optional for pre-fog saves. */
  intel?: [string, [string, number][]][];
  /** Bloodless PILLAGE/OCCUPY outcome log (F2/F3). Optional for older saves. */
  walkInOutcomes?: WalkInOutcome[];
  /** Live wild-raid provenance (F3). Optional for older saves. */
  wildRaids?: [string, WildRaidRecord][];
  /** F4 production/trickle carries. Optional for older saves. */
  foodCarry?: [string, number][];
  econCarry?: [string, number][];
  /** RUNNING live wild battles (docs/04 §7b) — plain JSON, resumed on load (unpaced). Optional for older saves. */
  wildBattles?: [string, WildBattleState][];
  /** PENDING ENGINE BATTLES (ALLOCATE-CALLBACK-SCHEMA) — plain JSON. Optional for older saves. */
  engineBattles?: [string, EngineBattleState][];
  /** Feature Set 3 (circular economy). All optional for pre-FS3 saves. */
  economy?: EconomyState;
  enrichmentPools?: [string, number][];
  enrichCarry?: [string, number][];
  trainingQueues?: [string, TrainingQueue][];
  devInvestedCt?: [string, Partial<Record<DevelopmentTrack, number>>][];
}

// ── The game ─────────────────────────────────────────────────────────────────

export class Game {
  readonly state: WorldState;
  readonly sessions = new Map<string, Session>(); // token → session
  readonly governors = new Map<string, GovernorMeta>(); // governorId → meta
  /** PG identity bindings: pgUid → governorId (persisted — survives restarts). */
  readonly pgBindings = new Map<string, string>();
  /**
   * governorId → canonical PG username (the `pns_name`/`pns`/`username` PG returns
   * at login). Captured at PG login and persisted. This is the identity the maps
   * side compares against for owner-only design (docs/maps/ECONOMY-SEAM.md §1) —
   * NOT the governor's empire name, which can differ when a PG user adopts a
   * legacy empire (PG "nftprof" → empire "Idon").
   */
  readonly pgUsernames = new Map<string, string>();
  /** governorId → lifetime purchased ct_units (E5 dev-phase faucet, cap-enforced). */
  readonly purchases = new Map<string, number>();
  npcGovernorId = '';

  private readonly baseRng: Rng;
  private readonly balance: Balance;
  private readonly parcelByHex: Map<string, string>;
  private readonly hexByParcel = new Map<string, string>();
  /** Effective tick options: config + the real-parcel polygon provider for wild battlefields. */
  private readonly tickOptions: TickOptions;
  /** parcelId → source polygon (wild-battlefield bounds come from the land's true shape). */
  private readonly polygonByParcel = new Map<string, [number, number][]>();
  private orderSeq = 0;
  private pendingEvents: GameEvent[] = [];
  /** Battles whose territory outcome event has already been emitted (rebuilt on load). */
  private readonly emittedOutcomes = new Set<string>();
  /** Live wild battles whose battle_started event has been emitted (seeded on load). */
  private readonly announcedWildBattles = new Set<string>();
  /** Engine battles whose battle_joinable grants have been emitted (seeded on load). */
  private readonly announcedJoinables = new Set<string>();
  /**
   * Recently-resolved battle review ring (docs/04 §7b) — bounded to ⚙
   * review.ringCap, oldest-first (newest at the end); populated at settlement
   * in tick(), restored from the snapshot. Fog-filtered per viewer on read.
   */
  private recentBattles: RecentBattleRecord[] = [];
  /**
   * Recently-settled HERO-vs-HERO card duels (docs/briefs/HERO-DUEL-SPEC.md),
   * newest-last, capped at ⚙ review.ringCap. A monotonic counter seeds each
   * duel's deterministic RNG (duels are real-time, outside the tick).
   */
  private recentDuels: RecentDuelRecord[] = [];
  private duelSeq = 0;
  private readonly lastViews = {
    territories: new Map<string, string>(),
    armies: new Map<string, string>(),
    battles: new Map<string, string>(),
  };
  /** Per-viewer delta caches (F1 fog): governorId → view JSON caches. */
  private readonly viewerLastViews = new Map<
    string,
    { territories: Map<string, string>; armies: Map<string, string>; battles: Map<string, string> }
  >();

  constructor(private readonly config: GameConfig) {
    this.baseRng = createRng(config.seed);
    this.balance = loadBalance(config.balancePath);
    const save = this.tryLoadSave();
    if (save !== undefined) {
      this.state = deserializeWorldState(save.state);
      this.orderSeq = save.orderSeq;
      this.npcGovernorId = save.npcGovernorId;
      for (const s of save.sessions) this.sessions.set(s.token, s);
      for (const [id, meta] of save.governors) this.governors.set(id, meta);
      for (const [uid, gid] of save.pgBindings ?? []) this.pgBindings.set(uid, gid);
      for (const [gid, uname] of save.pgUsernames ?? []) this.pgUsernames.set(gid, uname);
      for (const [gid, amt] of save.purchases ?? []) this.purchases.set(gid, amt);
      this.recentBattles = save.recentBattles ?? [];
      this.recentDuels = save.recentDuels ?? [];
      this.duelSeq = save.duelSeq ?? 0;
      for (const [id, b] of this.state.battles) {
        if (b.result?.territoryOutcome !== undefined) this.emittedOutcomes.add(id);
      }
    } else {
      this.state = loadDemoWorld(config.worldFile, this.baseRng.fork('worldgen'), { seed: config.seed });
      this.registerWildGovernor();
      if (config.npcEveryTicks > 0) this.seedNpcKingdom();
    }
    this.parcelByHex = buildParcelByHex(this.state);
    for (const [hexId, parcelId] of this.parcelByHex) this.hexByParcel.set(parcelId, hexId);
    for (const p of config.worldFile.parcels) this.polygonByParcel.set(p.parcelId, p.polygon);
    this.tickOptions = {
      ...config.tickOptions,
      parcelPolygonOf: (hexId) => this.polygonByParcel.get(this.parcelByHex.get(hexId) ?? ''),
    };
    // Loaded battles resume UNPACED (no watchers yet) and pre-announced (their
    // battle_started already went out before the snapshot).
    for (const [id, b] of this.state.wildBattles ?? []) {
      b.paced = false;
      this.announcedWildBattles.add(id);
    }
    // Loaded engine battles with join grants are pre-announced too — reconnecting
    // clients re-read joinUrl from /api/state (liveBattles), not from a replayed event.
    for (const [id, b] of this.state.engineBattles ?? []) {
      if (b.joins !== undefined) this.announcedJoinables.add(id);
    }
  }

  // ── Boot-time governors ────────────────────────────────────────────────────

  private registerWildGovernor(): void {
    for (const [id, kind] of this.state.governorKinds ?? []) {
      if (kind === 'SYSTEM') {
        this.governors.set(id, { governorId: id, name: 'The Wilds', kind, color: WILD_COLOR });
      }
    }
  }

  /**
   * Item-5 slice: one NPC kingdom seeded at boot, claiming the garrison-free
   * parcel FARTHEST from the slice centroid (a cluster edge), so its expansion
   * marches visibly inward across wild land.
   */
  private seedNpcKingdom(): void {
    const rng = this.baseRng.fork('npc-genesis');
    const pool = this.config.masterNames;
    const officerNames = pool.length >= 3 ? pool.slice(-3) : ['Maenak', 'Maple', 'Purin'];
    const { governorId } = addGovernor(this.state, rng, {
      name: 'Gnoll Dominion',
      kind: 'NPC_KINGDOM',
      ctUnits: this.config.npcCtUnits,
      officerNames,
    });
    this.npcGovernorId = governorId;
    this.governors.set(governorId, { governorId, name: 'Gnoll Dominion', kind: 'NPC_KINGDOM', color: NPC_COLOR });

    // Farthest claimable territory from the world centroid (deterministic; ties by id).
    const centers = new Map<string, [number, number]>();
    for (const p of this.config.worldFile.parcels) centers.set(p.parcelId, p.center);
    const byHex = buildParcelByHex(this.state);
    let cx = 0;
    let cy = 0;
    for (const [, c] of centers) {
      cx += c[0];
      cy += c[1];
    }
    cx /= Math.max(1, centers.size);
    cy /= Math.max(1, centers.size);
    let best: { id: string; d: number } | undefined;
    for (const id of sortedIds(this.state.territories)) {
      const t = this.state.territories.get(id)!;
      if (t.governorKind !== 'SYSTEM' || t.garrisonArmyId !== undefined) continue;
      const c = centers.get(byHex.get(t.hexIds[0]!) ?? '');
      if (c === undefined) continue;
      const d = Math.hypot(c[0] - cx, c[1] - cy);
      if (best === undefined || d > best.d) best = { id, d };
    }
    if (best !== undefined) claimTerritory(this.state, best.id, governorId);
  }

  // ── Order RNG (persisted sequence — no stream replay after snapshot reload) ──

  private orderRng(label: string): Rng {
    return this.baseRng.fork(`order:${this.orderSeq++}:${label}`);
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  sessionByToken(token: string | undefined): Session | undefined {
    return token === undefined ? undefined : this.sessions.get(token);
  }

  requireSession(token: string | undefined): Session {
    const s = this.sessionByToken(token);
    if (s === undefined) throw new ApiError(401, 'UNAUTHORIZED', 'missing or unknown bearer token');
    return s;
  }

  // ── Order API ─────────────────────────────────────────────────────────────

  join(name: unknown): { playerId: string; token: string; governorId: string; officers: DemoOfficer[] } {
    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 24) {
      throw new ApiError(400, 'BAD_NAME', 'name must be a non-empty string of at most 24 characters');
    }
    const cleanName = name.trim();
    // MVP identity model is name-only login: joining with an EXISTING banner name
    // RESUMES that governor with a fresh token (lost localStorage ≠ lost empire).
    // Only governors that were created via join (they have sessions) are resumable —
    // NPC/system governors have none and can never be hijacked by name.
    // Duplicate names existed before resume shipped (each join minted a governor),
    // so pick the SAME-NAME governor with the most holdings — territories, then
    // armies, then treasury — not merely the oldest session (an empty husk).
    const candidates = new Set<string>();
    for (const s of this.sessions.values()) {
      if (s.name.toLowerCase() === cleanName.toLowerCase()) candidates.add(s.governorId);
    }
    // Session-less PLAYER governors are resumable too: early save formats dropped
    // sessions on reload, orphaning real empires. kind==='PLAYER' keeps NPCs safe.
    for (const g of this.governors.values()) {
      if (g.kind === 'PLAYER' && g.name.toLowerCase() === cleanName.toLowerCase()) candidates.add(g.governorId);
    }
    const existing = this.richestGovernor(candidates);
    if (existing !== undefined) return this.resumeGovernor(existing);
    const joinIndex = this.sessions.size;
    const { governorId, officers } = addGovernor(this.state, this.orderRng('join'), {
      name: cleanName,
      kind: 'PLAYER',
      ctUnits: this.config.startCtUnits,
      officerNames: officerNamesForJoin(joinIndex, this.config.masterNames),
    });
    const token = randomBytes(16).toString('hex'); // server boundary — never feeds the sim
    const session: Session = { token, playerId: governorId, governorId, name: cleanName };
    this.sessions.set(token, session);
    const color = GOVERNOR_PALETTE[joinIndex % GOVERNOR_PALETTE.length]!;
    this.governors.set(governorId, { governorId, name: cleanName, kind: 'PLAYER', color });
    this.pendingEvents.push({ type: 'player_joined', tick: this.state.world.tick, governorId, name: cleanName, color });
    return { playerId: governorId, token, governorId, officers };
  }

  /**
   * PG-identity login (docs/briefs/PG-IDENTITY.md). The caller has ALREADY
   * verified the access token server-side against GET /user/info — this maps
   * the verified pgUid to a governor and mints a fresh cf token (same Session
   * model as name-only join):
   *
   *   existing binding        → resume that governor
   *   unbound same-name gov   → ADOPTION: bind + resume (how a pre-PG banner —
   *                             e.g. "Idon" — is reclaimed by its owner's PG
   *                             account; a governor already bound to another
   *                             pgUid is never re-adoptable)
   *   otherwise               → create a new governor named displayName
   *                             (numeric suffix on name collisions)
   *
   * ROSTER GATE (docs/09 §7): when `ownedMasters` is supplied (PG yielded a
   * wallet and the EF Masters API was reachable) the resolved governor's officer
   * pool is RE-SYNCED to exactly those Masters — carrying the real masterId/slug/
   * source/koUntil into battle. Refreshed on every login. `undefined` (no wallet
   * / API down) or `[]` (wallet owns nothing) keep the demo roster so the game
   * never bricks (see `syncOfficersFromMasters`).
   */
  loginPg(
    pgUid: string,
    displayName: string,
    bindGovernorId?: string,
    ownedMasters?: OwnedMaster[],
  ): { playerId: string; token: string; governorId: string; officers: DemoOfficer[] } {
    const base = this.resolveLoginGovernor(pgUid, displayName, bindGovernorId);
    // Record the canonical PG username against the resolved governor so the maps
    // ownership feed (docs/maps/ECONOMY-SEAM.md §1) reports the PG identity, not
    // the empire name (which differs when a PG account adopts a legacy empire).
    const uname = displayName.trim();
    if (uname !== '') this.pgUsernames.set(base.governorId, uname);
    this.syncOfficersFromMasters(base.governorId, ownedMasters);
    return { ...base, officers: this.state.officers?.get(base.governorId) ?? [] };
  }

  /**
   * Maps ownership feed (docs/maps/ECONOMY-SEAM.md §1): `{ parcelId: pgUsername }`
   * for every PLAYER-owned parcel whose controlling governor has a known PG
   * username. Parcels absent from this map (wild/system land, or a player who
   * signed in name-only without PG) stay designable by any signed-in account —
   * the agreed testing default; we never fabricate an owner. Deterministic,
   * read-only, and safe to serve publicly (viewing is public on the maps side).
   */
  landOwners(): Record<string, string> {
    const owners: Record<string, string> = {};
    for (const t of this.state.territories.values()) {
      if (t.governorKind === 'SYSTEM') continue;
      const uname = this.pgUsernames.get(t.governorId);
      const hex = t.hexIds[0];
      if (uname === undefined || hex === undefined) continue;
      owners[this.parcelId(hex)] = uname;
    }
    return owners;
  }

  /** Resolve pgUid → governor (rebind / resume / adopt / create). See loginPg. */
  private resolveLoginGovernor(
    pgUid: string,
    displayName: string,
    bindGovernorId?: string,
  ): { playerId: string; token: string; governorId: string; officers: DemoOfficer[] } {
    // EXPLICIT (RE)BIND (2026-07-03): the client passes the previous session's token
    // when signing in, proving control of that governor — the PG account claims it
    // even when names differ (PG "nftprof" → the "Idon" empire), and a subsequent
    // proven bind MOVES the binding (your PG account, your choice of empire). Only
    // PLAYER governors not bound to a DIFFERENT PG account are bindable.
    if (bindGovernorId !== undefined && this.governors.get(bindGovernorId)?.kind === 'PLAYER') {
      const otherOwner = [...this.pgBindings.entries()].find(([uid, gid]) => gid === bindGovernorId && uid !== pgUid);
      if (otherOwner === undefined) {
        this.pgBindings.set(pgUid, bindGovernorId);
        return this.resumeGovernor(bindGovernorId);
      }
    }
    const bound = this.pgBindings.get(pgUid);
    if (bound !== undefined && this.governors.has(bound)) return this.resumeGovernor(bound);
    const clean = (displayName.trim() === '' ? `pg-${pgUid.slice(0, 16)}` : displayName.trim()).slice(0, 24);
    // Adoption: same-name PLAYER governors not yet bound to any PG account
    // (duplicates pre-date resume — pick the one with the most holdings).
    const boundIds = new Set(this.pgBindings.values());
    const candidates = new Set<string>();
    for (const g of this.governors.values()) {
      if (g.kind === 'PLAYER' && !boundIds.has(g.governorId) && g.name.toLowerCase() === clean.toLowerCase()) {
        candidates.add(g.governorId);
      }
    }
    const adopted = this.richestGovernor(candidates);
    if (adopted !== undefined) {
      this.pgBindings.set(pgUid, adopted);
      return this.resumeGovernor(adopted);
    }
    const res = this.join(this.uniqueGovernorName(clean));
    this.pgBindings.set(pgUid, res.governorId);
    return res;
  }

  /**
   * Reconcile a governor's officer pool against the LIVE EF Masters roster
   * (docs/09 §7) — "you command only the Masters your wallet holds". Runs at the
   * server boundary (PG login), NEVER inside the sim tick, so determinism holds.
   *
   *   owned === undefined  → API unreachable / no wallet: keep existing officers
   *                          (demo roster fallback — never brick the game).
   *   owned === []         → wallet owns nothing: keep the demo roster as a
   *                          playability fallback (a governor is never left with
   *                          zero officers) and LOG it.
   *   owned non-empty      → the officer pool BECOMES those Masters:
   *                            • an owned Master already mirrored (by masterId)
   *                              keeps its officer object → its overseer/army
   *                              assignment survives; its fields are refreshed.
   *                            • a newly owned Master gets a fresh hero_… officer.
   *                            • an officer whose Master is no longer owned (or a
   *                              demo officer with no masterId) is REMOVED if free,
   *                              but KEPT until idle if BUSY (oversees a territory
   *                              or leads a live army) — the least-surprising rule:
   *                              never yank a general out of an ongoing command.
   */
  private syncOfficersFromMasters(governorId: string, owned?: OwnedMaster[]): void {
    if (owned === undefined) return; // API down / no wallet — demo roster stands.
    if (owned.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`[masters] governor ${governorId} wallet owns no Masters — keeping demo roster (playability fallback)`);
      return;
    }
    const rng = this.orderRng('masters-sync');
    const time = this.state.world.tick;
    const existing = this.state.officers?.get(governorId) ?? [];
    // Busy = oversees a territory OR leads a non-disbanded army (can't be yanked).
    const leading = new Set<string>();
    for (const a of this.state.armies.values()) {
      if (a.state !== 'DISBANDED' && a.heroId !== undefined) leading.add(a.heroId);
    }
    const isBusy = (o: DemoOfficer): boolean => o.assignedTerritoryId !== undefined || leading.has(o.id);
    const priorByMaster = new Map<string, DemoOfficer>();
    for (const o of existing) {
      if (o.masterId !== undefined) priorByMaster.set(String(o.masterId), o);
    }
    const ownedKeys = new Set(owned.map((m) => String(m.masterId)));
    const next: DemoOfficer[] = [];
    // 1. Every owned Master → an officer (reuse the mirror to preserve assignment).
    for (const m of owned) {
      const prior = priorByMaster.get(String(m.masterId));
      const officer: DemoOfficer = prior ?? {
        id: newId('hero', { time, random: () => rng.next() }),
        ownerGovernorId: governorId,
        name: m.name,
        fame: 200,
      };
      officer.name = m.name;
      officer.masterId = m.masterId;
      if (m.slug !== undefined) officer.slug = m.slug;
      if (m.source !== undefined) officer.source = m.source;
      officer.koUntil = m.koUntil ?? null;
      if (m.joinChance !== undefined) officer.joinChance = m.joinChance;
      if (m.rentalExpires !== undefined) officer.rentalExpires = m.rentalExpires;
      next.push(officer);
    }
    // 2. No-longer-owned officers (and demo officers with no masterId): drop if
    //    free, keep until idle if busy.
    for (const o of existing) {
      const stillOwned = o.masterId !== undefined && ownedKeys.has(String(o.masterId));
      if (stillOwned) continue; // already carried in pass 1
      if (isBusy(o)) next.push(o);
    }
    this.state.officers ??= new Map();
    this.state.officers.set(governorId, next);
  }

  /** Mint a fresh session token for an existing governor (name-resume + PG login). */
  private resumeGovernor(governorId: string): { playerId: string; token: string; governorId: string; officers: DemoOfficer[] } {
    const meta = this.governors.get(governorId);
    if (meta === undefined) throw new ApiError(500, 'INTERNAL', `governor ${governorId} has no meta`);
    const token = randomBytes(16).toString('hex'); // server boundary — never feeds the sim
    this.sessions.set(token, { token, playerId: governorId, governorId, name: meta.name });
    return { playerId: governorId, token, governorId, officers: this.state.officers?.get(governorId) ?? [] };
  }

  /**
   * The governor with the most holdings — territories, then armies, then
   * treasury (ties by id for determinism). Duplicate names existed before
   * resume shipped, so name lookups must not resume an empty husk.
   */
  private richestGovernor(governorIds: ReadonlySet<string>): string | undefined {
    const score = (govId: string): [number, number, number] => [
      [...this.state.territories.values()].filter((t) => t.governorId === govId).length,
      [...this.state.armies.values()].filter((a) => a.ownerGovernorId === govId).length,
      this.state.ctBalances?.get(govId) ?? 0,
    ];
    return [...governorIds].sort((a, b) => {
      const sa = score(a), sb = score(b);
      return sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2] || (a < b ? -1 : 1);
    })[0];
  }

  /** `base`, else `base 2`, `base 3`… — unique across governor + session names, ≤ 24 chars. */
  private uniqueGovernorName(base: string): string {
    const taken = new Set<string>();
    for (const g of this.governors.values()) taken.add(g.name.toLowerCase());
    for (const s of this.sessions.values()) taken.add(s.name.toLowerCase());
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) {
      const suffix = ` ${i}`;
      const candidate = base.slice(0, 24 - suffix.length) + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  claim(governorId: string, territoryId: unknown, overseerId?: unknown): TerritoryView {
    const t = this.getTerritory(territoryId);
    const overseer = this.validateOverseerParam(governorId, overseerId);
    try {
      claimTerritory(this.state, t.id, governorId, overseer);
    } catch (e) {
      throw translateSimError(e);
    }
    this.pendingEvents.push({
      type: 'territory_claimed',
      tick: this.state.world.tick,
      territoryId: t.id,
      parcelId: this.parcelId(t.hexIds[0]!),
      governorId,
    });
    return territoryView(this.state, t, this.parcelByHex, this.balance, this.viewerContext(governorId));
  }

  raise(
    governorId: string,
    territoryId: unknown,
    preset: unknown,
    heroId?: unknown,
  ): { army: ArmyView; ctUnits: number; cost: RaiseCostBreakdown } {
    const t = this.getTerritory(territoryId);
    if (t.governorId !== governorId) throw new ApiError(403, 'NOT_YOUR_TERRITORY', `${t.name} is not governed by you`);
    if (typeof preset !== 'string' || !(preset in DEMO_ARMY_PRESETS)) {
      throw new ApiError(400, 'BAD_PRESET', `preset must be one of ${Object.keys(DEMO_ARMY_PRESETS).join(', ')}`);
    }
    if (heroId !== undefined && typeof heroId !== 'string') throw new ApiError(400, 'BAD_HERO', 'heroId must be a string');
    const hero = (heroId as string | undefined) ?? this.autoPickHero(governorId);
    let army: Army;
    try {
      army = raiseArmy(this.state, t.id, preset as DemoArmyPreset, this.orderRng('raise'), hero);
    } catch (e) {
      throw translateSimError(e);
    }
    this.pendingEvents.push({
      type: 'army_raised',
      tick: this.state.world.tick,
      armyId: army.id,
      territoryId: t.id,
      parcelId: this.parcelId(t.hexIds[0]!),
      governorId,
      preset,
    });
    return {
      army: armyView(this.state, army, this.parcelByHex, this.balance, this.tickOptions, this.viewerContext(governorId))!,
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      // Training + standard provision pack breakdown (docs/04 §7c.1),
      // including the parcel's F4 MIL-track training discount.
      cost: raiseCost(preset as DemoArmyPreset, this.balance, t.development.MILITARY),
    };
  }

  /**
   * POST /api/provision — buy food/gold/wood for an army with CT (docs/04 §7c.1).
   * Only the owner may provision; the sim enforces GARRISON-at-friendly-territory.
   */
  provision(
    governorId: string,
    armyId: unknown,
    food: unknown,
    gold: unknown,
    wood: unknown,
  ): { army: ArmyView; ctUnits: number; costCtUnits: number } {
    if (typeof armyId !== 'string') throw new ApiError(400, 'BAD_ARMY', 'armyId must be a string');
    const a = this.state.armies.get(armyId);
    if (a === undefined || a.state === 'DISBANDED') throw new ApiError(404, 'UNKNOWN_ARMY', `no such army ${armyId}`);
    if (a.ownerGovernorId !== governorId) throw new ApiError(403, 'NOT_YOUR_ARMY', `${armyId} is not your army`);
    const amount = (v: unknown, name: string): number => {
      if (v === undefined) return 0;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        throw new ApiError(400, 'BAD_AMOUNT', `${name} must be a non-negative integer`);
      }
      return v;
    };
    const order = { food: amount(food, 'food'), gold: amount(gold, 'gold'), wood: amount(wood, 'wood') };
    let costCtUnits: number;
    try {
      ({ costCtUnits } = provisionArmy(this.state, a.id, order, this.balance));
    } catch (e) {
      throw translateSimError(e);
    }
    return {
      army: armyView(this.state, a, this.parcelByHex, this.balance, this.tickOptions, this.viewerContext(governorId))!,
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      costCtUnits,
    };
  }

  /**
   * POST /api/develop — raise one development track on an owned territory (F4).
   * CT cost = ⚙ base × growth^currentLevel, cap ⚙ development.maxLevel.
   */
  develop(
    governorId: string,
    territoryId: unknown,
    track: unknown,
  ): { territory: TerritoryView; ctUnits: number; costCtUnits: number; track: DevelopmentTrack; level: number } {
    const t = this.getTerritory(territoryId);
    if (t.governorId !== governorId) throw new ApiError(403, 'NOT_YOUR_TERRITORY', `${t.name} is not governed by you`);
    if (typeof track !== 'string' || !DEVELOPMENT_TRACKS.includes(track as DevelopmentTrack)) {
      throw new ApiError(400, 'BAD_TRACK', `track must be one of ${DEVELOPMENT_TRACKS.join(', ')}`);
    }
    let level: number;
    let costCtUnits: number;
    try {
      ({ level, costCtUnits } = developTerritory(this.state, t.id, track as DevelopmentTrack, this.balance));
    } catch (e) {
      throw translateSimError(e);
    }
    this.pendingEvents.push({
      type: 'territory_developed',
      tick: this.state.world.tick,
      territoryId: t.id,
      parcelId: this.parcelId(t.hexIds[0]!),
      governorId,
      track,
      level,
      costCtUnits,
    });
    return {
      territory: territoryView(this.state, t, this.parcelByHex, this.balance, this.viewerContext(governorId)),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      costCtUnits,
      track: track as DevelopmentTrack,
      level,
    };
  }

  // ── BASE-BUILDING (docs/briefs/BASE-BUILDING-DEFENSE-LAYER.md, decision 7) ──

  /** The map's buildSpot slots for a parcel (world-unit positions) — the placement grid + cap. */
  private buildSpotsForParcel(parcelId: string): BuildSpot[] {
    const bf = loadParcelBattlefield(parcelId) ?? loadStandbyBattlefield(1);
    return (bf?.buildSpots ?? []).map((b) => ({ anchorId: b.anchorId, x: b.x, z: b.z }));
  }

  /** Structures serialized for a territory view (post-build echo). */
  private structuresOf(territoryId: string): unknown[] {
    return (this.state.territories.get(territoryId)?.structures ?? []).map((s) => ({ ...s }));
  }

  /**
   * POST /api/build — place or UPGRADE a destructible defense module on a
   * buildSpot of a parcel YOU govern. Body: { parcelId | territoryId, anchorId,
   * key }. Charges the develop SINK cost ladder (decision 17); mutates
   * Territory.structures with a tier + HP; the tier + HP ride the allocate
   * context into the battle (the MOBA engine already consumes tiered towers).
   */
  build(
    governorId: string,
    ref: { parcelId?: unknown; territoryId?: unknown },
    anchorId: unknown,
    key: unknown,
  ): { territory: TerritoryView; ctUnits: number; costCtUnits: number; tier: number; action: string; structures: unknown[] } {
    const t = ref.territoryId !== undefined ? this.getTerritory(ref.territoryId) : this.getTerritoryByParcel(ref.parcelId);
    if (t.governorId !== governorId) throw new ApiError(403, 'NOT_YOUR_TERRITORY', `${t.name} is not governed by you`);
    if (typeof anchorId !== 'string' || anchorId === '') throw new ApiError(400, 'BAD_ANCHOR', 'anchorId (a buildSpot id) is required');
    if (typeof key !== 'string' || !BUILD_KEYS.includes(key)) {
      throw new ApiError(400, 'BAD_KEY', `key must be one of ${BUILD_KEYS.join(', ')}`);
    }
    const parcelId = this.parcelId(t.hexIds[0]!);
    let out: ReturnType<typeof buildStructure>;
    try {
      out = buildStructure(this.state, t.id, { anchorId, key, buildSpots: this.buildSpotsForParcel(parcelId), arenaSize: 322, balance: this.balance });
    } catch (e) {
      throw translateSimError(e);
    }
    return {
      territory: territoryView(this.state, t, this.parcelByHex, this.balance, this.viewerContext(governorId)),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      costCtUnits: out.costCtUnits,
      tier: out.tier,
      action: out.action,
      structures: this.structuresOf(t.id),
    };
  }

  /** POST /api/repair — restore a siege-damaged module to full HP for CT (a SINK). */
  repair(
    governorId: string,
    ref: { parcelId?: unknown; territoryId?: unknown },
    anchorId: unknown,
  ): { territory: TerritoryView; ctUnits: number; costCtUnits: number; structures: unknown[] } {
    const t = ref.territoryId !== undefined ? this.getTerritory(ref.territoryId) : this.getTerritoryByParcel(ref.parcelId);
    if (t.governorId !== governorId) throw new ApiError(403, 'NOT_YOUR_TERRITORY', `${t.name} is not governed by you`);
    if (typeof anchorId !== 'string' || anchorId === '') throw new ApiError(400, 'BAD_ANCHOR', 'anchorId is required');
    const parcelId = this.parcelId(t.hexIds[0]!);
    let out: ReturnType<typeof repairStructure>;
    try {
      out = repairStructure(this.state, t.id, { anchorId, buildSpots: this.buildSpotsForParcel(parcelId), arenaSize: 322, balance: this.balance });
    } catch (e) {
      throw translateSimError(e);
    }
    return {
      territory: territoryView(this.state, t, this.parcelByHex, this.balance, this.viewerContext(governorId)),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      costCtUnits: out.costCtUnits,
      structures: this.structuresOf(t.id),
    };
  }

  /**
   * WILD-garrison seeding (in lieu of a player): write N DEFENDER towers onto a
   * WILD parcel's buildSpots so it is an attackable PvE target. Deterministic
   * from the parcel's slot layout; idempotent (skips a parcel that already has
   * structures). Shares the player build write path (allowSystem). Returns the
   * number of towers seeded.
   */
  seedWildGarrison(territoryId: string): number {
    const t = this.state.territories.get(territoryId);
    if (t === undefined || t.governorKind !== 'SYSTEM') return 0;
    if ((t.structures ?? []).length > 0) return 0; // already seeded
    const parcelId = this.parcelId(t.hexIds[0]!);
    const spots = this.buildSpotsForParcel(parcelId);
    if (spots.length === 0) return 0;
    const n = Math.min(this.balance.build.wild.towerCount, spots.length);
    let seeded = 0;
    for (let i = 0; i < n; i++) {
      try {
        buildStructure(this.state, t.id, { anchorId: spots[i]!.anchorId, key: 'TOWER', buildSpots: spots, arenaSize: 322, allowSystem: true, balance: this.balance });
        // Seed to the configured base tier (level 1 already placed; upgrade to baseTier).
        for (let tier = 1; tier < this.balance.build.wild.baseTier; tier++) {
          buildStructure(this.state, t.id, { anchorId: spots[i]!.anchorId, key: 'TOWER', buildSpots: spots, arenaSize: 322, allowSystem: true, balance: this.balance });
        }
        seeded++;
      } catch { /* slot conflict / cap — skip */ }
    }
    return seeded;
  }

  /**
   * POST /api/enrich — convert wallet CT into the parcel's enrichment pool
   * (E3). Only on a parcel YOU govern. The amount goes through the flow
   * splitter: its LANDYIELD share seeds the pools (this parcel ⚙ 60% + ring-1
   * 40%) — the pool receives less than paid; the leakage is the design.
   * Body: { territoryId, amountCtUnits } (integer ct_units) — `amountCt`
   * (whole CT) is accepted as a convenience and converted ×CT_UNITS_PER_CT.
   */
  enrich(
    governorId: string,
    territoryId: unknown,
    amountCtUnits: unknown,
    amountCt?: unknown,
  ): { territory: TerritoryView; ctUnits: number; amountCtUnits: number; toPoolCtUnits: number } {
    const t = this.getTerritory(territoryId);
    if (t.governorId !== governorId) throw new ApiError(403, 'NOT_YOUR_TERRITORY', `${t.name} is not governed by you`);
    let amount: number;
    if (amountCtUnits !== undefined) {
      if (typeof amountCtUnits !== 'number' || !Number.isInteger(amountCtUnits) || amountCtUnits <= 0) {
        throw new ApiError(400, 'BAD_AMOUNT', 'amountCtUnits must be a positive integer');
      }
      amount = amountCtUnits;
    } else if (typeof amountCt === 'number' && Number.isInteger(amountCt) && amountCt > 0) {
      amount = amountCt * 10_000; // CT_UNITS_PER_CT
    } else {
      throw new ApiError(400, 'BAD_AMOUNT', 'provide amountCtUnits (integer ct_units) or amountCt (whole CT)');
    }
    let splits: ReturnType<typeof enrichTerritory>['splits'];
    try {
      ({ splits } = enrichTerritory(this.state, t.id, amount, this.balance));
    } catch (e) {
      throw translateSimError(e);
    }
    this.pendingEvents.push({
      type: 'territory_enriched',
      tick: this.state.world.tick,
      territoryId: t.id,
      parcelId: this.parcelId(t.hexIds[0]!),
      governorId,
      amountCtUnits: amount,
      toPoolCtUnits: splits.landYield,
    });
    return {
      territory: territoryView(this.state, t, this.parcelByHex, this.balance, this.viewerContext(governorId)),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      amountCtUnits: amount,
      toPoolCtUnits: splits.landYield,
    };
  }

  /**
   * POST /api/raze — strip one development level for salvage (E4).
   * Governor-only; ⚙ razeSalvagePct of the level's original cost returns to
   * the wallet, the rest burns.
   */
  raze(
    governorId: string,
    territoryId: unknown,
    track: unknown,
  ): { territory: TerritoryView; ctUnits: number; track: DevelopmentTrack; level: number; salvageCtUnits: number; burnedCtUnits: number } {
    const t = this.getTerritory(territoryId);
    if (t.governorId !== governorId) throw new ApiError(403, 'NOT_YOUR_TERRITORY', `${t.name} is not governed by you`);
    if (typeof track !== 'string' || !DEVELOPMENT_TRACKS.includes(track as DevelopmentTrack)) {
      throw new ApiError(400, 'BAD_TRACK', `track must be one of ${DEVELOPMENT_TRACKS.join(', ')}`);
    }
    let result: ReturnType<typeof razeTerritory>;
    try {
      result = razeTerritory(this.state, t.id, track as DevelopmentTrack, this.balance);
    } catch (e) {
      throw translateSimError(e);
    }
    this.pendingEvents.push({
      type: 'territory_razed',
      tick: this.state.world.tick,
      territoryId: t.id,
      parcelId: this.parcelId(t.hexIds[0]!),
      governorId,
      track,
      level: result.level,
      salvageCtUnits: result.salvageCtUnits,
      burnedCtUnits: result.burnedCtUnits,
    });
    return {
      territory: territoryView(this.state, t, this.parcelByHex, this.balance, this.viewerContext(governorId)),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      track: track as DevelopmentTrack,
      ...result,
    };
  }

  /**
   * POST /api/abandon — release an owned territory (product owner 2026-07-03):
   * the land reverts to unowned/SYSTEM, the overseer Master returns to the
   * free officer pool and any garrison becomes a normal field army standing
   * there. NO refund — development, structures, treasury and the enrichment
   * pool stay with the land. 409 BATTLE_RAGING while any battle (live wild /
   * pending engine, incl. bridge-bound) rages on the parcel.
   */
  abandon(governorId: string, territoryId: unknown): { territory: TerritoryView; ctUnits: number } {
    const t = this.getTerritory(territoryId);
    if (t.governorId !== governorId) throw new ApiError(403, 'NOT_YOUR_TERRITORY', `${t.name} is not governed by you`);
    try {
      abandonTerritory(this.state, t.id, governorId);
    } catch (e) {
      throw translateSimError(e);
    }
    this.pendingEvents.push({
      type: 'territory_abandoned',
      tick: this.state.world.tick,
      territoryId: t.id,
      parcelId: this.parcelId(t.hexIds[0]!),
      governorId,
    });
    return {
      territory: territoryView(this.state, t, this.parcelByHex, this.balance, this.viewerContext(governorId)),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
    };
  }

  march(
    governorId: string,
    armyId: unknown,
    toTerritoryId: unknown,
    command: unknown = false,
  ): { army: ArmyView; etaTick: number; command: boolean; commandAtCapacity: boolean } {
    if (typeof armyId !== 'string') throw new ApiError(400, 'BAD_ARMY', 'armyId must be a string');
    const a = this.state.armies.get(armyId);
    if (a === undefined || a.state === 'DISBANDED') throw new ApiError(404, 'UNKNOWN_ARMY', `no such army ${armyId}`);
    if (a.ownerGovernorId !== governorId) throw new ApiError(403, 'NOT_YOUR_ARMY', `${armyId} is not your army`);
    if (armyEngagedIn(this.state, a.id) !== undefined) {
      throw new ApiError(409, 'ENGAGED', 'that army is locked in a running battle — steer it or await the outcome');
    }
    const t = this.getTerritory(toTerritoryId);
    const toHex = t.hexIds[0]!;
    if (a.hexId === toHex) throw new ApiError(400, 'ALREADY_THERE', 'army is already on that parcel');
    const path = findPath(this.state, a.hexId, toHex, governorId); // hostile parcels block transit
    if (path === undefined || path.length === 0) throw new ApiError(400, 'UNREACHABLE', `no path to ${t.name}`);
    const fromParcelId = this.parcelId(a.hexId);
    // COMMAND intent (docs/04 §3a): `MARCH & COMMAND` asks for a LIVE steerable
    // battle. Best-effort — if the governor is already at its command-slot cap
    // we still march (intent recorded), but flag that this fight will AUTO-resolve.
    const wantCommand = command === true;
    const commandAtCapacity =
      wantCommand && engineCommandSlotCount(this.state, governorId) >= this.balance.battle.commandSlotsPerPlayer;
    try {
      orderMarch(this.state, a.id, path, this.tickOptions, wantCommand);
    } catch (e) {
      throw translateSimError(e);
    }
    const view = armyView(this.state, a, this.parcelByHex, this.balance, this.tickOptions, this.viewerContext(governorId))!;
    const etaTick = view.etaTick ?? this.state.world.tick;
    this.pendingEvents.push({
      type: 'march_ordered',
      tick: this.state.world.tick,
      armyId: a.id,
      governorId,
      fromParcelId,
      toParcelId: this.parcelId(toHex),
      etaTick,
    });
    return { army: view, etaTick, command: wantCommand, commandAtCapacity };
  }

  /**
   * Optional explicit-overseer param (docs/01 §11.3): undefined = auto-assign;
   * a string must name one of the caller's FREE officers (400/BAD_OFFICER otherwise).
   */
  private validateOverseerParam(governorId: string, overseerId: unknown): string | undefined {
    if (overseerId === undefined || overseerId === null || overseerId === '' || overseerId === 'auto') return undefined;
    if (typeof overseerId !== 'string') throw new ApiError(400, 'BAD_OFFICER', 'overseerId must be a string');
    const officer = (this.state.officers?.get(governorId) ?? []).find((o) => o.id === overseerId);
    if (officer === undefined) throw new ApiError(400, 'BAD_OFFICER', 'that officer is not yours');
    if (officer.assignedTerritoryId !== undefined) {
      throw new ApiError(409, 'OFFICER_BUSY', `${officer.name} already oversees a territory`);
    }
    return overseerId;
  }

  /**
   * Resolve a pending PILLAGE/OCCUPY choice. `battleId` is the choice key:
   * the battle id for post-victory choices, the `choiceId` of a town_entered
   * event for bloodless F2 walk-ins. Returns `battle` for the former,
   * `territory` + `action`/`lootCt` for the latter (action 'CANCELLED' when
   * the walk-in army left the parcel before deciding).
   */
  choice(
    governorId: string,
    battleId: unknown,
    action: unknown,
    overseerId?: unknown,
  ): { ctUnits: number; battle?: BattleView; territory?: TerritoryView; action?: string; lootCt?: number } {
    if (typeof battleId !== 'string') throw new ApiError(400, 'BAD_BATTLE', 'battleId must be a string');
    if (action !== 'PILLAGE' && action !== 'OCCUPY') {
      throw new ApiError(400, 'BAD_ACTION', "action must be 'PILLAGE' or 'OCCUPY'");
    }
    const overseer = action === 'OCCUPY' ? this.validateOverseerParam(governorId, overseerId) : undefined;
    const pending = this.state.pendingChoices?.get(battleId);
    if (pending === undefined) throw new ApiError(404, 'NO_PENDING_CHOICE', `no pending choice for battle ${battleId}`);
    if (pending.governorId !== governorId) throw new ApiError(403, 'NOT_YOUR_CHOICE', 'that victory is not yours to spend');
    try {
      resolvePostVictory(this.state, battleId, action as PostVictoryAction, this.balance, overseer);
    } catch (e) {
      throw translateSimError(e);
    }
    const ctUnits = this.state.ctBalances?.get(governorId) ?? 0;
    if (pending.battleId !== undefined) {
      this.emitOutcomeEvent(pending.battleId, this.state.world.tick);
      return {
        battle: battleView(this.state, this.state.battles.get(pending.battleId)!, this.parcelByHex, this.balance, this.viewerContext(governorId))!,
        ctUnits,
      };
    }
    // Walk-in (F2): surface the bloodless outcome now; the WS event follows.
    const outcome = (this.state.walkInOutcomes ?? []).find((o) => o.choiceId === battleId);
    const terr = this.state.territories.get(pending.territoryId);
    if (outcome !== undefined && terr !== undefined) {
      this.pendingEvents.push({
        type: outcome.action === 'OCCUPY' ? 'territory_occupied' : 'territory_pillaged',
        tick: this.state.world.tick,
        battleId,
        territoryId: terr.id,
        parcelId: this.parcelId(terr.hexIds[0]!),
        governorId: outcome.governorId,
        lootCt: outcome.lootCt,
      });
    }
    return {
      ctUnits,
      ...(terr !== undefined
        ? { territory: territoryView(this.state, terr, this.parcelByHex, this.balance, this.viewerContext(governorId)) }
        : {}),
      action: outcome?.action ?? 'CANCELLED',
      ...(outcome !== undefined ? { lootCt: outcome.lootCt } : {}),
    };
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  /** Advance the world one tick; returns events + changed-subset deltas for the WS broadcast. */
  tick(): TickResult {
    const tick = this.state.world.tick + 1;

    // Pre-tick capture for event derivation (cheap at demo scale).
    const preArmyStates = new Map<string, string>();
    for (const [id, a] of this.state.armies) preArmyStates.set(id, a.state);
    const preBattles = new Set(this.state.battles.keys());
    const preChoices = new Set(this.state.pendingChoices?.keys() ?? []);
    const preWalkInCount = this.state.walkInOutcomes?.length ?? 0;
    const preRaids = new Set(this.state.wildRaids?.keys() ?? []);
    const preMustering = new Set(this.state.trainingQueues?.keys() ?? []);
    const preWild = new Set(this.state.wildBattles?.keys() ?? []);
    const preEngine = new Set(this.state.engineBattles?.keys() ?? []);
    // Review ring (docs/04 §7b): capture the pre-settlement troop counts (start
    // strengths for the timeline) + the engine reason/live-flag that the settled
    // BattleInstance does not preserve — battles about to settle read them below.
    const preTroopCounts = new Map<string, number>();
    for (const [id, a] of this.state.armies) preTroopCounts.set(id, troopCount(a));
    const settlingEngine = new Map<string, { reason: string; live: boolean }>();
    for (const [id, b] of this.state.engineBattles ?? []) {
      if (b.outcome !== undefined) settlingEngine.set(id, { reason: b.outcome.reason, live: b.mode === 'live' });
    }

    runTick(this.state, tick, this.baseRng.fork('sim'), this.balance, this.tickOptions);

    const events: GameEvent[] = this.pendingEvents.splice(0);

    // E2: training queues that completed this tick (army still standing).
    for (const armyId of [...preMustering].sort()) {
      if (this.state.trainingQueues?.has(armyId) === true) continue;
      const a = this.state.armies.get(armyId);
      if (a === undefined || a.state === 'DISBANDED') continue;
      events.push({
        type: 'army_mustered',
        tick,
        armyId,
        governorId: a.ownerGovernorId,
        parcelId: this.parcelId(a.hexId),
        troops: troopCount(a),
      });
    }

    // Arrivals: MARCHING → GARRISON this tick.
    for (const id of sortedIds(this.state.armies)) {
      const a = this.state.armies.get(id)!;
      if (preArmyStates.get(id) === 'MARCHING' && a.state === 'GARRISON') {
        events.push({
          type: 'army_arrived',
          tick,
          armyId: a.id,
          governorId: a.ownerGovernorId,
          parcelId: this.parcelId(a.hexId),
        });
      }
    }

    // New battles (MVP battles resolve the tick they spawn) + their §7c
    // logistics outcomes (tie / retreat / scatter).
    for (const id of sortedIds(this.state.battles)) {
      if (preBattles.has(id)) continue;
      const v = battleView(this.state, this.state.battles.get(id)!, this.parcelByHex, this.balance)!;
      // Post-battle review (docs/04 §7b): the fight just settled — record it in
      // the bounded ring so the player can review it after it ends.
      this.pushRecentBattle(v, tick, preTroopCounts, settlingEngine.get(id));
      events.push({
        type: 'battle_resolved',
        tick,
        battleId: id,
        parcelId: v.parcelId,
        winner: v.winner,
        ...(v.outcome !== undefined ? { outcome: v.outcome } : {}),
        attackerGovernorIds: v.attackerGovernorIds,
        defenderGovernorIds: v.defenderGovernorIds,
        attackerScore: v.attackerScore ?? 0,
        defenderScore: v.defenderScore ?? 0,
      });
      const logi: BattleLogisticsRecord | undefined = this.state.battleLogistics?.get(id);
      if (logi === undefined) continue;
      if (logi.outcomeKind === 'TIE') {
        events.push({
          type: 'battle_tied',
          tick,
          battleId: id,
          parcelId: v.parcelId,
          attackerGovernorIds: v.attackerGovernorIds,
          defenderGovernorIds: v.defenderGovernorIds,
        });
      }
      for (const r of logi.retreats) {
        const governorId = this.state.armies.get(r.armyId)?.ownerGovernorId ?? 'unknown';
        if (r.result === 'RETREATED' && r.toHexId !== undefined) {
          events.push({
            type: 'army_retreated',
            tick,
            battleId: id,
            armyId: r.armyId,
            governorId,
            fromParcelId: v.parcelId,
            toParcelId: this.parcelId(r.toHexId),
          });
        } else {
          events.push({
            type: 'army_scattered',
            tick,
            battleId: id,
            armyId: r.armyId,
            governorId,
            parcelId: v.parcelId,
            disbanded: r.result === 'DISBANDED',
          });
        }
      }
    }

    // LIVE wild battles that ignited this tick (docs/04 §7b wild row) — the
    // parcel is now a running fight, watchable/steerable via the WS battle channel.
    for (const [battleId, b] of this.state.wildBattles ?? []) {
      if (preWild.has(battleId) || this.announcedWildBattles.has(battleId)) continue;
      this.announcedWildBattles.add(battleId);
      const monsterName = b.defenderArmyIds
        .map((id) => this.state.monsterNames?.get(id))
        .find((n) => n !== undefined);
      events.push({
        type: 'battle_started',
        tick,
        battleId,
        parcelId: this.parcelId(b.hexId),
        attackerGovernorIds: [b.attackerGovernorId],
        defenderGovernorIds: [b.defenderGovernorId],
        ...(monsterName !== undefined ? { monsterName } : {}),
        attackerTroops: b.roster.filter((r) => r.side === 'ATTACKER').reduce((n, r) => n + r.soldiers, 0),
        defenderTroops: b.roster.filter((r) => r.side === 'DEFENDER').reduce((n, r) => n + r.soldiers, 0),
      });
    }
    for (const id of [...this.announcedWildBattles]) {
      if (this.state.wildBattles?.has(id) !== true) this.announcedWildBattles.delete(id); // settled — done announcing
    }

    // PENDING ENGINE BATTLES that ignited this tick (ALLOCATE-CALLBACK-SCHEMA):
    // the parcel is locked while the external MOBA engine resolves the match;
    // the server allocates it between ticks and the callback settles it later.
    for (const [battleId, b] of this.state.engineBattles ?? []) {
      if (preEngine.has(battleId)) continue;
      const troopsOf = (ids: readonly string[]): number =>
        ids.reduce((n, id) => {
          const a = this.state.armies.get(id);
          return a === undefined || a.state === 'DISBANDED' ? n : n + troopCount(a);
        }, 0);
      events.push({
        type: 'battle_started',
        tick,
        battleId,
        parcelId: this.parcelId(b.hexId),
        attackerGovernorIds: [b.attackerGovernorId],
        defenderGovernorIds: [b.defenderGovernorId],
        attackerTroops: troopsOf(b.attackerArmyIds),
        defenderTroops: troopsOf(b.defenderArmyIds),
        engine: true,
        live: b.mode === 'live', // AUTO (accelerated/queued) ⇒ watch-only, no live viewer (§3a)
      });
    }

    // Hero-mode doorways (§1b): live-mode allocates land join grants between
    // ticks (server boundary); announce each battle's grants ONCE, each grant
    // PRIVATE to its governor (eventsFor enforces it).
    for (const [battleId, b] of this.state.engineBattles ?? []) {
      if (b.joins === undefined || this.announcedJoinables.has(battleId)) continue;
      this.announcedJoinables.add(battleId);
      for (const j of b.joins) {
        events.push({
          type: 'battle_joinable',
          tick,
          battleId,
          parcelId: this.parcelId(b.hexId),
          governorId: j.governorId,
          joinUrl: j.joinUrl,
        });
      }
    }
    for (const id of [...this.announcedJoinables]) {
      if (this.state.engineBattles?.has(id) !== true) this.announcedJoinables.delete(id); // settled
    }

    // Newly pending PILLAGE/OCCUPY choices — battle victories get choice_pending,
    // bloodless F2 walk-ins get town_entered (both private to the chooser).
    for (const [choiceId, c] of this.state.pendingChoices ?? []) {
      if (preChoices.has(choiceId)) continue;
      const terr = this.state.territories.get(c.territoryId);
      const parcelId = terr === undefined ? c.territoryId : this.parcelId(terr.hexIds[0]!);
      if (c.battleId !== undefined) {
        events.push({
          type: 'choice_pending',
          tick,
          battleId: c.battleId,
          governorId: c.governorId,
          territoryId: c.territoryId,
          parcelId,
          expiresTick: c.expiresTick,
        });
      } else {
        events.push({
          type: 'town_entered',
          tick,
          choiceId,
          armyId: c.armyId ?? '',
          governorId: c.governorId,
          territoryId: c.territoryId,
          parcelId,
          zoneType: terr?.zoneType ?? 'WILD',
          expiresTick: c.expiresTick,
        });
      }
    }

    // Bloodless outcomes decided during the tick (walk-in resolutions/timeouts,
    // NPC instant walk-ins, wild-raid sackings) — battleId carries the choiceId.
    const walkIns = this.state.walkInOutcomes ?? [];
    for (let i = preWalkInCount; i < walkIns.length; i++) {
      const o = walkIns[i]!;
      const terr = this.state.territories.get(o.territoryId);
      events.push({
        type: o.action === 'OCCUPY' ? 'territory_occupied' : 'territory_pillaged',
        tick,
        battleId: o.choiceId,
        territoryId: o.territoryId,
        parcelId: terr === undefined ? o.territoryId : this.parcelId(terr.hexIds[0]!),
        governorId: o.governorId,
        lootCt: o.lootCt,
      });
    }

    // Territory outcomes decided during the tick (instant NPC choices, timeouts).
    for (const id of sortedIds(this.state.battles)) {
      const outcome = this.state.battles.get(id)!.result?.territoryOutcome;
      if (outcome === undefined || this.emittedOutcomes.has(id)) continue;
      this.emitOutcomeEvent(id, tick, events);
    }

    // Wild raids spawned this tick (F3) — the frontier bites back.
    for (const [raidId, rec] of this.state.wildRaids ?? []) {
      if (preRaids.has(raidId)) continue;
      const raid = this.state.armies.get(raidId);
      if (raid === undefined) continue;
      const monsterName = this.state.monsterNames?.get(raidId);
      events.push({
        type: 'wild_raid',
        tick,
        armyId: raidId,
        governorId: raid.ownerGovernorId,
        ...(monsterName !== undefined ? { monsterName } : {}),
        troops: troopCount(raid),
        fromParcelId: this.parcelId(rec.homeHexId),
        toParcelId: this.parcelId(rec.targetHexId),
      });
    }

    // NPC kingdom acts on the settled world (its orders resolve next tick).
    if (this.config.npcEveryTicks > 0 && tick % this.config.npcEveryTicks === 0) {
      this.npcAct(tick, events);
    }

    return { tick, events, deltas: this.computeDeltas() };
  }

  /**
   * Emit territory_occupied/pillaged for a battle whose outcome just landed.
   * HELD outcomes are marked silently (no territory changed hands).
   */
  private emitOutcomeEvent(battleId: string, tick: number, sink?: GameEvent[]): void {
    this.emittedOutcomes.add(battleId);
    const b = this.state.battles.get(battleId);
    const outcome = b?.result?.territoryOutcome;
    if (b === undefined || outcome === undefined || outcome === 'HELD') return;
    const terr = territoryAtHex(this.state, b.hexId);
    const winnerGov =
      outcome === 'OCCUPIED' && terr !== undefined
        ? terr.governorId
        : winnerGovernorOf(this.state, b, this.balance);
    const ev: GameEvent = {
      type: outcome === 'OCCUPIED' ? 'territory_occupied' : 'territory_pillaged',
      tick,
      battleId,
      territoryId: terr?.id ?? '',
      parcelId: terr === undefined ? '' : this.parcelId(terr.hexIds[0]!),
      governorId: winnerGov,
      lootCt: b.result?.lootCt ?? 0,
    };
    (sink ?? this.pendingEvents).push(ev);
  }

  // ── NPC kingdom AI (item 5 slice — same public order API, no special powers) ──

  private npcAct(tick: number, events: GameEvent[]): void {
    const gov = this.npcGovernorId;
    if (gov === '' || this.governors.get(gov) === undefined) return;
    const rng = this.baseRng.fork(`npc:${tick}`);

    // Strongest owned territory: max garrison strength, tie → prosperity, tie → id.
    let best: { t: Territory; s: number } | undefined;
    for (const id of sortedIds(this.state.territories)) {
      const t = this.state.territories.get(id)!;
      if (t.governorId !== gov) continue;
      const g = t.garrisonArmyId === undefined ? undefined : this.state.armies.get(t.garrisonArmyId);
      const s = g !== undefined && g.state !== 'DISBANDED' ? armyStrength(g, this.balance) : 0;
      if (best === undefined || s > best.s || (s === best.s && t.prosperity > best.t.prosperity)) {
        best = { t, s };
      }
    }
    if (best === undefined) return; // kingdom wiped out

    // F4: the kingdom invests too — strongest territory, round-robin across tracks.
    const track = DEVELOPMENT_TRACKS[Math.floor(tick / this.config.npcEveryTicks) % DEVELOPMENT_TRACKS.length]!;
    try {
      const dev = developTerritory(this.state, best.t.id, track, this.balance);
      events.push({
        type: 'territory_developed',
        tick,
        territoryId: best.t.id,
        parcelId: this.parcelId(best.t.hexIds[0]!),
        governorId: gov,
        track,
        level: dev.level,
        costCtUnits: dev.costCtUnits,
      });
    } catch {
      // maxed out or the war chest can't afford it — the kingdom skips the upgrade
    }

    // E2 — training takes time, for the kingdom too: dispatch ONE fully-
    // mustered army standing on the muster grounds (the strongest territory,
    // where raises happen), then queue the next raise. Armies garrisoning
    // conquered parcels elsewhere stay put.
    const musterHex = best.t.hexIds[0]!;
    for (const id of sortedIds(this.state.armies)) {
      const a = this.state.armies.get(id)!;
      if (
        a.ownerGovernorId !== gov ||
        a.state !== 'GARRISON' ||
        a.hexId !== musterHex ||
        isMustering(this.state, a.id) ||
        armyInEngineBattle(this.state, a.id) !== undefined || // pinned in a pending engine battle
        troopCount(a) === 0
      ) {
        continue;
      }
      const target = this.nearestWildPath(a.hexId);
      if (target === undefined) break; // no wild land left — map fully tamed
      // Provision for the campaign (docs/04 §7c.1): the raise already bought
      // the standard pack; top up march rations to cover the road if affordable.
      const marchFood = marchFoodPerStep(a, this.balance) * target.path.length;
      if (marchFood > 0) {
        try {
          provisionArmy(this.state, a.id, { food: marchFood, gold: 0, wood: 0 }, this.balance);
        } catch {
          // war chest can't cover extra rations — march on the standard pack
        }
      }
      orderMarch(this.state, a.id, target.path, this.tickOptions);
      events.push({
        type: 'npc_expand',
        tick,
        governorId: gov,
        armyId: a.id,
        fromParcelId: this.parcelId(best.t.hexIds[0]!),
        toParcelId: this.parcelId(target.hexId),
      });
      break; // one expansion column per cycle
    }

    // Queue the next levy (starts a training queue — ⚙ one per territory).
    try {
      raiseArmy(this.state, best.t.id, 'STANDARD', rng, this.autoPickHero(gov));
    } catch {
      // war chest empty or the muster grounds are busy — the kingdom waits
    }
  }

  /** Deterministic BFS to the nearest SYSTEM-governed (wild) parcel; path excludes the start hex. */
  private nearestWildPath(fromHexId: string): { hexId: string; path: string[] } | undefined {
    const adj = this.state.adjacency;
    if (adj === undefined) return undefined;
    const prev = new Map<string, string>();
    const seen = new Set([fromHexId]);
    const queue = [fromHexId];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi]!;
      for (const n of adj.get(cur) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        prev.set(n, cur);
        const terr = territoryAtHex(this.state, n);
        if (terr !== undefined && terr.governorKind === 'SYSTEM') {
          const path: string[] = [n];
          let p = cur;
          while (p !== fromHexId) {
            path.push(p);
            p = prev.get(p)!;
          }
          return { hexId: n, path: path.reverse() };
        }
        queue.push(n);
      }
    }
    return undefined;
  }

  /** First officer (by id) neither overseeing a territory nor leading a live army. */
  private autoPickHero(governorId: string): string | undefined {
    const pool = this.state.officers?.get(governorId) ?? [];
    const leading = new Set<string>();
    for (const a of this.state.armies.values()) {
      if (a.state !== 'DISBANDED' && a.heroId !== undefined) leading.add(a.heroId);
    }
    return [...pool]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .find((o) => o.assignedTerritoryId === undefined && !leading.has(o.id))?.id;
  }

  // ── LIVE wild battles: viewing, steering, pacing (docs/04 §7b wild row) ────

  /** The running wild battle, or undefined once settled. */
  wildBattle(battleId: string): WildBattleState | undefined {
    return this.state.wildBattles?.get(battleId);
  }

  /**
   * Spectating permission: participants always; everyone else needs ACCURATE
   * intel on the parcel (same F1 rule as full battle views).
   */
  canViewBattle(governorId: string, battleId: string): boolean {
    const b = this.wildBattle(battleId);
    if (b === undefined) return false;
    if (b.attackerGovernorId === governorId || b.defenderGovernorId === governorId) return true;
    return intelGrade(this.viewerContext(governorId).grades, b.hexId) === 'ACCURATE';
  }

  /** Static battlefield payload — sent once per battle_sub. */
  battleStatic(battleId: string): Record<string, unknown> | undefined {
    const b = this.wildBattle(battleId);
    if (b === undefined) return undefined;
    const monsterName = b.defenderArmyIds
      .map((id) => this.state.monsterNames?.get(id))
      .find((n) => n !== undefined);
    // Real battlefield map for the command view (BATTLEFIELD-SCHEMA / §1a): use
    // the parcel's designed map once the generator ships; for now a standard
    // MOBA-style stand-in (3-lane for estates, 1-lane for single parcels). The
    // legacy painterly field (bounds/spawn/heart/obstacles) stays as a fallback.
    const terrId = this.state.hexes.get(b.hexId)?.territoryId;
    const territory = terrId === undefined ? undefined : this.state.territories.get(terrId);
    const laneCount: 1 | 3 = (territory?.hexIds.length ?? 1) >= CONSTANTS.ESTATE_MIN_HEXES ? 3 : 1;
    // Precedence: the parcel's OWN generated map (map-service §3 A1) if one is on the
    // box, else the standard MOBA-style stand-in. A bridge/match-server map still wins
    // upstream (attached in the engine path); this covers the wild/command view.
    const parcelId = this.parcelId(b.hexId);
    const battlefield = loadParcelBattlefield(parcelId) ?? loadStandbyBattlefield(laneCount);
    return {
      battleId,
      parcelId,
      size: b.field.size,
      bounds: b.field.bounds,
      spawn: b.field.spawn,
      heart: b.field.heart,
      obstacles: b.field.obstacles,
      ...(battlefield !== undefined ? { battlefield } : {}),
      attackerGovernorId: b.attackerGovernorId,
      defenderGovernorId: b.defenderGovernorId,
      ...(b.master?.name !== undefined ? { masterName: b.master.name } : {}),
      ...(monsterName !== undefined ? { monsterName } : {}),
      clockTicks: b.clockTicks,
      tickHz: this.balance.wildBattle.tickHz,
      waveEveryTicks: this.balance.wildBattle.waveEveryTicks,
      startedTick: b.startedTick,
    };
  }

  /** Per-battle-tick snapshot for subscribers (compact keys, 0.1 m positions). */
  battleSnapshot(battleId: string): Record<string, unknown> | undefined {
    const b = this.wildBattle(battleId);
    if (b === undefined) return undefined;
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    const wb = this.balance.wildBattle;
    let stock = 0;
    let stockStart = 0;
    for (let i = 0; i < b.roster.length; i++) {
      if (b.roster[i]!.side !== 'ATTACKER') continue;
      stock += b.stock[i] ?? 0;
      stockStart += b.roster[i]!.entities;
    }
    return {
      battleId,
      bt: b.bt,
      clockLeft: Math.max(0, b.clockTicks - b.bt),
      ...(b.outcome !== undefined ? { outcome: b.outcome } : {}),
      units: b.entities.map((e) => ({
        id: e.id,
        k: e.kind === 'MASTER' ? 'M' : e.kind === 'MOB' ? 'm' : 'u',
        c: e.cls,
        s: e.side === 'ATTACKER' ? 'A' : 'D',
        x: r1(e.x),
        y: r1(e.y),
        hp: Math.max(0, Math.round(e.hp)),
        mh: e.maxHp,
      })),
      towers: b.towers.map((t) => ({ id: t.id, x: r1(t.x), y: r1(t.y), hp: t.hp, mh: t.maxHp })),
      ...(b.master !== undefined
        ? {
            master: {
              alive: b.master.alive,
              revives: b.master.revives,
              respawnIn: b.master.alive ? 0 : Math.max(0, (b.master.respawnAt ?? 0) - b.bt),
              ...(b.master.name !== undefined ? { name: b.master.name } : {}),
            },
          }
        : {}),
      waves: { stock, stockStart, size: wb.waveSize, nextIn: wb.waveEveryTicks - (b.bt % wb.waveEveryTicks) },
      mobs: b.mobsStart - b.mobsDead,
      mobsStart: b.mobsStart,
      towersAlive: b.towers.filter((t) => t.hp > 0).length,
      towersStart: b.towersStart,
      ...(b.rally !== undefined ? { rally: b.rally } : {}),
      ...((b.rallyQueue?.length ?? 0) > 0 ? { rallyQueue: b.rallyQueue } : {}),
      ...(b.focusTgt !== undefined ? { focus: b.focusTgt } : {}),
      ...(b.stance !== undefined ? { stance: b.stance } : {}),
      ...(b.strategy !== undefined ? { strategy: b.strategy } : {}),
      ...(b.retreating === true ? { retreating: true } : {}),
    };
  }

  /**
   * Steering input — ONLY the attacking army's owner commands the assault
   * (move the Master / focus-fire a target / set the wave rally point).
   */
  battleCommand(governorId: string, battleId: unknown, cmd: unknown): void {
    if (typeof battleId !== 'string') throw new ApiError(400, 'BAD_BATTLE', 'battleId must be a string');
    const b = this.wildBattle(battleId);
    if (b === undefined) throw new ApiError(404, 'NO_BATTLE', `no running battle ${battleId}`);
    if (b.attackerGovernorId !== governorId) {
      throw new ApiError(403, 'NOT_YOUR_BATTLE', 'only the attacking commander steers this assault');
    }
    const c = cmd as Record<string, unknown> | undefined;
    const kind = c?.['kind'];
    let parsed: WildBattleCmd;
    if (kind === 'move' && Number.isFinite(c?.['x']) && Number.isFinite(c?.['y'])) {
      parsed = { kind: 'move', x: c!['x'] as number, y: c!['y'] as number };
    } else if (kind === 'rally' && Number.isFinite(c?.['x']) && Number.isFinite(c?.['y'])) {
      parsed = { kind: 'rally', x: c!['x'] as number, y: c!['y'] as number, queue: c?.['queue'] === true || c?.['queue'] === 1 };
    } else if (kind === 'focus' && typeof c?.['targetId'] === 'string') {
      parsed = { kind: 'focus', targetId: c['targetId'] };
    } else if (kind === 'stance' && (c?.['stance'] === 'ALL_IN' || c?.['stance'] === 'DEFEND' || c?.['stance'] === 'FOLLOW' || c?.['stance'] === 'CLEAR')) {
      parsed = { kind: 'stance', stance: c['stance'] as 'ALL_IN' | 'DEFEND' | 'FOLLOW' | 'CLEAR' };
    } else if (kind === 'retreat') {
      parsed = { kind: 'retreat' };
    } else if (kind === 'strategy' && (c?.['strategy'] === 'FIGHT_TO_DEATH' || c?.['strategy'] === 'HOLD' || c?.['strategy'] === 'FLEE_IF_LOSING')) {
      parsed = { kind: 'strategy', strategy: c['strategy'] as 'FIGHT_TO_DEATH' | 'HOLD' | 'FLEE_IF_LOSING' };
    } else {
      throw new ApiError(400, 'BAD_CMD', 'cmd must be one of move|rally|focus|stance|retreat|strategy');
    }
    applyWildBattleCommand(b, parsed);
  }

  /**
   * One LIVE battle tick (the server's 4 Hz driver). Tactical state only —
   * overworld settlement always happens inside the next world tick, so the
   * deterministic phase order owns every map mutation.
   */
  stepBattle(battleId: string): void {
    const b = this.wildBattle(battleId);
    if (b !== undefined && b.outcome === undefined) stepWildBattle(b, this.balance);
  }

  /** ⚙ balance.wildBattle.tickHz — the LIVE battle driver's frame rate. */
  battleTickHz(): number {
    return this.balance.wildBattle.tickHz;
  }

  /** Pacing input: true = a LIVE driver owns stepping; false = world-tick fast-forward. */
  setBattlePaced(battleId: string, paced: boolean): void {
    const b = this.wildBattle(battleId);
    if (b !== undefined) b.paced = paced;
  }

  /**
   * BRIDGE source (docs/briefs/TELEMETRY-RELAY.md): an external match server
   * reported the outcome of a BOUND wild battle. We only set the outcome —
   * the next world tick settles casualties/loot through the normal
   * deterministic phase order (v1: survivor accounting still uses the sim's
   * own roster state; per-unit external casualties are a later contract rev).
   */
  forceWildBattleOutcome(battleId: string, winner: 'A' | 'B' | 'DRAW'): void {
    const b = this.wildBattle(battleId);
    if (b === undefined || b.outcome !== undefined) return;
    b.outcome = winner === 'A' ? 'ATTACKER' : winner === 'B' ? 'DEFENDER' : 'TIMEOUT';
    b.paced = false; // hand it back — the next world tick settles it
  }

  /** parcelId → hexId join (bridge parcel validation). */
  hexOfParcel(parcelId: string): string | undefined {
    return this.hexByParcel.get(parcelId);
  }

  // ── ENGINE battles: allocate context + result callback (ALLOCATE-CALLBACK-SCHEMA) ──

  /** Engine battles still awaiting the server's allocate POST (sorted, deterministic). */
  pendingEngineAllocations(): string[] {
    const out: string[] = [];
    for (const [id, b] of this.state.engineBattles ?? []) {
      if (b.status === 'ALLOCATING') out.push(id);
    }
    return out.sort();
  }

  /**
   * Build the R1 allocate context for a pending engine battle — EXACTLY the
   * schema in docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md §1. M1 battlefield:
   * the FIXED standard ±161 m MOBA arena (sizeM 322) as a 4-pt bounds polygon +
   * the parcel's real structures (anchorId `anchor_<i>` = index into
   * territory.structures); officers ride with a revive budget of 3; seed/battleId
   * come from the sim (never wall clock).
   *
   * MODE SELECTION (§3a/§3b): the LIVE-vs-accelerated decision is made by the
   * sim at the collision tick (command intent + per-player command slots + the
   * global live pool — docs/04 §3a) and stamped on the record as `mode`. This
   * method simply HONORS `b.mode`, with the `liveBattles` kill switch as a final
   * clamp (CF_LIVE_BATTLES=0 forces accelerated even if the sim marked it live).
   */
  engineAllocateContext(
    battleId: string,
    callbackUrl: string,
    liveBattles = true,
  ): Record<string, unknown> | undefined {
    const b = this.state.engineBattles?.get(battleId);
    if (b === undefined) return undefined;
    const mode: 'live' | 'accelerated' = liveBattles && b.mode === 'live' ? 'live' : 'accelerated';
    b.mode = mode;
    const terrId = this.state.hexes.get(b.hexId)?.territoryId;
    const territory = terrId === undefined ? undefined : this.state.territories.get(terrId);
    // WILD garrison: a battle on ungoverned land seeds towers (in lieu of a player)
    // so a wild parcel is a real attackable PvE target (base-building brief §wild).
    if (terrId !== undefined && territory?.governorKind === 'SYSTEM') this.seedWildGarrison(terrId);
    // FIXED standard MOBA arena (the client's real frame — OP 48, docs/04 §7b):
    // half-edge ±161 WORLD-UNITS (= client clampMap ±115 · MAPK 1.4). Dimensionless
    // world-units (~0.74 m/unit by the declared 14-acre parcel mapping), consumed
    // AS-IS post-MAPK — NEVER multiply by MAPK here. Every CF battle uses this one
    // arena; estates fight as a SERIES of standard ±161 component battles (canon
    // decision 4), so parcel size scales army / structure COUNT, not arena size.
    const S = 322; // sizeM = 2·161 (world-unit edge)
    const armiesOf = (ids: readonly string[], entryEdge: 'S' | 'N'): Record<string, unknown>[] =>
      ids
        .map((id) => this.state.armies.get(id))
        .filter((a): a is Army => a !== undefined && a.state !== 'DISBANDED')
        .map((a) => {
          const officer =
            a.heroId === undefined
              ? undefined
              : this.state.officers?.get(a.ownerGovernorId)?.find((o) => o.id === a.heroId);
          return {
            armyId: a.id,
            units: a.units.filter((u) => u.count > 0).map((u) => ({ cls: u.unitClass, count: u.count })),
            officers:
              officer === undefined
                ? []
                : [{
                    // REAL EF masterId (docs/09 §7) so the MOBA client maps to the
                    // champion + pre-locks the seat; fall back to the internal
                    // hero_… id only for demo officers with no owned Master.
                    masterId: officer.masterId ?? officer.id,
                    name: officer.name,
                    ...(officer.slug !== undefined ? { slug: officer.slug } : {}),
                    level: Math.max(1, Math.floor(officer.fame / 100)),
                    revives: 3,
                  }],
            provisions: { food: a.provisions.food, gold: a.provisions.gold, wood: a.provisions.wood },
            entryEdge,
          };
        });
    const wildDefender = this.state.governorKinds?.get(b.defenderGovernorId) === 'SYSTEM';
    return {
      v: 1,
      battleId,
      seed: b.seed,
      mode,
      rates: { tickHz: 30, commandSnapshotHz: 3 },
      // ⚙ LIVE-only: how long the match server holds the 30 Hz match open in its
      // pre-combat STAGING window so a hero-mode ⚡ click can late-seat (network
      // F5 Fork's dial). Omitted for accelerated battles (no join window).
      ...(mode === 'live' ? { joinWindowSec: this.balance.battle.joinWindowSec } : {}),
      parcel: {
        parcelId: this.parcelId(b.hexId),
        zone: String(this.config.worldFile.meta.zone),
        kind: territory === undefined || territory.governorKind === 'SYSTEM' ? 'WILD' : 'PLAYER',
      },
      // CENTER-ORIGIN coords (LOCKED — BATTLEFIELD-SCHEMA.md / TELEMETRY-RELAY): (0,0) = arena
      // center, x east, z NORTH (+); world-UNITS post-MAPK, consumed AS-IS (never re-scaled).
      // Attacker/blue enters south (−z), defender/red holds north (+z). Known-good client
      // magnitudes: spawns ±131.6, cores ±114.8 (both OUTSIDE the retired ±120 frame).
      // Anchors are 0..1 parcel-normalized → (anchor−0.5)*S maps into [−S/2, +S/2] = [−161, +161].
      battlefield: {
        arena: { shape: 'polygon', sizeM: S, bounds: [[-S / 2, -S / 2], [S / 2, -S / 2], [S / 2, S / 2], [-S / 2, S / 2]] },
        laneCount: 1,
        obstacles: [],
        spawnZones: [
          { id: 'spawn_atk_s', side: 'ATTACKER', edge: 'S', x: 0, z: -131.6 },
          { id: 'spawn_def_n', side: 'DEFENDER', edge: 'N', x: 0, z: 131.6 },
        ],
        structures: (territory?.structures ?? []).map((s, i) => ({
          anchorId: `anchor_${i}`,
          kind: s.key.toUpperCase(),
          side: 'DEFENDER',
          x: Math.round(((s.anchor?.[0] ?? 0.5) - 0.5) * S),
          z: Math.round(((s.anchor?.[1] ?? 0.85) - 0.5) * S),
          tier: s.level,
          hp: s.hp,
          hpMax: s.maxHp,
        })),
        mobs: [],
      },
      sides: {
        ATTACKER: { governorId: b.attackerGovernorId, armies: armiesOf(b.attackerArmyIds, 'S') },
        DEFENDER: {
          governorId: wildDefender ? null : b.defenderGovernorId, // null governor = WILD
          armies: armiesOf(b.defenderArmyIds, 'N'),
        },
      },
      callback: { url: callbackUrl, keyId: 'cf-hmac-1' },
    };
  }

  /**
   * "Launch live session on this land" test button (integration team, 2026-07-06).
   * Builds a `mode:"live"` allocate payload DIRECTLY (no sim collision) — seats the
   * player's Master (ATTACKER) vs an AI enemy Master (DEFENDER), 200 units a side,
   * on the fixed ±161 arena — so a tester can spawn a command-mode / hero-mode match
   * on any parcel. The server POSTs this to the match server and opens the returned
   * joinUrl. Mints a FRESH battleId + seed per call (a live match dies on a server
   * restart, so the button must never cache — allocate anew each click). Same
   * battlefield / coord frame / officer shape as `engineAllocateContext`.
   */
  launchLiveContext(governorId: string, parcelId: string, callbackUrl: string): Record<string, unknown> {
    const officers = this.state.officers?.get(governorId) ?? [];
    const withMaster = officers.filter((o) => o.masterId !== undefined);
    const roster = withMaster.length > 0 ? withMaster : officers;
    if (roster.length === 0) {
      throw new ApiError(409, 'NO_MASTER', 'you have no Master to command — sign in with a wallet that owns one');
    }
    const atk = roster[0]!;
    const def = roster[1] ?? roster[0]!; // distinct enemy if you own ≥2 Masters, else reuse (AI foe)
    const officerPayload = (o: DemoOfficer): Record<string, unknown> => ({
      masterId: o.masterId ?? o.id, // REAL EF masterId so the MOBA client maps the champion + pre-locks the seat
      name: o.name,
      ...(o.slug !== undefined ? { slug: o.slug } : {}),
      level: Math.max(1, Math.floor(o.fame / 100)),
      revives: 3,
    });
    const hexId = this.hexByParcel.get(parcelId);
    const terrId = hexId === undefined ? undefined : this.state.hexes.get(hexId)?.territoryId;
    const territory = terrId === undefined ? undefined : this.state.territories.get(terrId);
    const S = 322; // fixed ±161 arena (docs/04 §7b)
    const army = (cls: string, count: number, officer: DemoOfficer, entryEdge: 'S' | 'N'): Record<string, unknown> => ({
      armyId: newId('army'),
      units: [{ cls, count }],
      officers: [officerPayload(officer)],
      provisions: { food: 1000, gold: 200, wood: 200 },
      entryEdge,
    });
    return {
      v: 1,
      battleId: newId('battle'),
      seed: ulid(),
      mode: 'live',
      rates: { tickHz: 30, commandSnapshotHz: 3 },
      joinWindowSec: this.balance.battle.joinWindowSec,
      parcel: {
        parcelId,
        zone: String(this.config.worldFile.meta.zone),
        kind: territory === undefined || territory.governorKind === 'SYSTEM' ? 'WILD' : 'PLAYER',
      },
      battlefield: {
        arena: { shape: 'polygon', sizeM: S, bounds: [[-S / 2, -S / 2], [S / 2, -S / 2], [S / 2, S / 2], [-S / 2, S / 2]] },
        laneCount: 1,
        obstacles: [],
        spawnZones: [
          { id: 'spawn_atk_s', side: 'ATTACKER', edge: 'S', x: 0, z: -131.6 },
          { id: 'spawn_def_n', side: 'DEFENDER', edge: 'N', x: 0, z: 131.6 },
        ],
        structures: (territory?.structures ?? []).map((s, i) => ({
          anchorId: `anchor_${i}`,
          kind: s.key.toUpperCase(),
          side: 'DEFENDER',
          x: Math.round(((s.anchor?.[0] ?? 0.5) - 0.5) * S),
          z: Math.round(((s.anchor?.[1] ?? 0.85) - 0.5) * S),
          tier: s.level,
          hp: s.hp,
          hpMax: s.maxHp,
        })),
        mobs: [],
      },
      sides: {
        ATTACKER: { governorId, armies: [army('INFANTRY', 200, atk, 'S')] },
        DEFENDER: { governorId: null, armies: [army('ARCHER', 200, def, 'N')] }, // null governor = AI/WILD enemy
      },
      callback: { url: callbackUrl, keyId: 'cf-hmac-1' },
    };
  }

  /**
   * Allocate succeeded: record the live matchId + any hero-mode join grants;
   * the battle now awaits the callback. Live matches run in real time (up to
   * ~40 min) — an ALLOCATED battle has NO tick-based timeout; the engine's
   * own TIMEOUT reason is the clock authority. Grants without a governorId
   * (the single attacker-oriented response shape) belong to the attacker.
   */
  markEngineAllocated(battleId: string, matchId?: string, joins?: AllocateJoinGrant[]): void {
    const b = this.state.engineBattles?.get(battleId);
    if (b === undefined || b.status !== 'ALLOCATING') return;
    b.status = 'ALLOCATED';
    if (matchId !== undefined) b.matchId = matchId;
    if (joins !== undefined && joins.length > 0) {
      b.joins = joins.map((j) => ({
        governorId: j.governorId ?? b.attackerGovernorId,
        joinUrl: j.joinUrl,
        ...(j.ticket !== undefined ? { ticket: j.ticket } : {}),
      }));
    }
  }

  /** Allocate failed (network/5xx): the next tick resolves it via the instant path. */
  markEngineAllocateFailed(battleId: string): void {
    const b = this.state.engineBattles?.get(battleId);
    if (b === undefined || b.status !== 'ALLOCATING' || b.outcome !== undefined) return;
    b.status = 'FALLBACK';
  }

  /**
   * Verified R10 result callback (server boundary — the HTTP layer already
   * checked the HMAC + replay window). Validates + normalizes the payload and
   * sets the outcome on the pending engine battle; the NEXT world tick settles
   * it through the deterministic phase order. Idempotent by battleId: a
   * re-delivered result (still-pending duplicate or already-settled battle)
   * acks without reprocessing.
   */
  applyEngineResult(payload: Record<string, unknown>): { applied: boolean; duplicate: boolean } {
    const battleId = payload['battleId'];
    if (typeof battleId !== 'string' || battleId === '') {
      throw new ApiError(400, 'BAD_RESULT', 'battleId (string) is required');
    }
    const b = this.state.engineBattles?.get(battleId);
    if (b === undefined) {
      if (this.state.battles.has(battleId)) return { applied: false, duplicate: true }; // already settled
      throw new ApiError(404, 'NO_BATTLE', `no pending engine battle ${battleId}`);
    }
    if (b.outcome !== undefined) return { applied: false, duplicate: true };

    const outcome = payload['outcome'] as Record<string, unknown> | undefined;
    const winner = outcome?.['winner'];
    if (winner !== 'ATTACKER' && winner !== 'DEFENDER' && winner !== 'TIE') {
      throw new ApiError(400, 'BAD_RESULT', "outcome.winner must be 'ATTACKER' | 'DEFENDER' | 'TIE'");
    }
    const sides = (payload['sides'] ?? {}) as Record<string, unknown>;
    const sideOf = (name: 'ATTACKER' | 'DEFENDER'): EngineSideResult => {
      const s = (sides[name] ?? {}) as Record<string, unknown>;
      const casualties: Record<string, number> = {};
      for (const [cls, n] of Object.entries((s['casualties'] ?? {}) as Record<string, unknown>)) {
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) casualties[cls] = Math.floor(n);
      }
      const pcRaw = s['provisionsConsumed'] as Record<string, unknown> | undefined;
      const pc: { food?: number; gold?: number; wood?: number } = {};
      for (const key of ['food', 'gold', 'wood'] as const) {
        const v = pcRaw?.[key];
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) pc[key] = Math.floor(v);
      }
      return { casualties, ...(Object.keys(pc).length > 0 ? { provisionsConsumed: pc } : {}) };
    };
    const structures: EngineOutcome['structures'] = [];
    if (Array.isArray(payload['structures'])) {
      for (const raw of payload['structures'] as unknown[]) {
        const s = raw as Record<string, unknown> | undefined;
        if (typeof s?.['anchorId'] !== 'string' || typeof s['hp'] !== 'number') continue;
        structures.push({ anchorId: s['anchorId'], hp: s['hp'], destroyed: s['destroyed'] === true });
      }
    }
    const matchId = typeof payload['matchId'] === 'string' ? payload['matchId'] : b.matchId;
    b.outcome = {
      winner,
      reason: typeof outcome?.['reason'] === 'string' ? outcome['reason'] : 'UNKNOWN',
      sides: { ATTACKER: sideOf('ATTACKER'), DEFENDER: sideOf('DEFENDER') },
      ...(structures.length > 0 ? { structures } : {}),
      ...(matchId !== undefined ? { matchId } : {}),
    };
    if (matchId !== undefined) b.matchId = matchId;
    return { applied: true, duplicate: false };
  }

  /** Governor lookup by id or display name (case-insensitive) — bridge start attribution. */
  findGovernorId(ref: { governorId?: string; governorName?: string }): string | undefined {
    if (ref.governorId !== undefined && this.governors.has(ref.governorId)) return ref.governorId;
    if (ref.governorName !== undefined) {
      const needle = ref.governorName.trim().toLowerCase();
      for (const g of this.governors.values()) {
        if (g.name.toLowerCase() === needle) return g.governorId;
      }
    }
    return undefined;
  }

  /**
   * Fog-filtered running-battle summaries for /api/state + map badges: LIVE
   * wild battles + PENDING ENGINE BATTLES (`engine: true` — external MOBA
   * matches, no built-in command feed). VISIBILITY RULE (§3b): `joinUrl` is
   * PRIVATE to its governor — included ONLY on the owning governor's view,
   * never for other participants, spectators, or broadcasts.
   */
  liveBattleSummaries(viewerGovernorId?: string): {
    id: string;
    parcelId: string;
    attackerGovernorIds: string[];
    defenderGovernorIds: string[];
    monsterName?: string;
    startedTick: number;
    /** Pending ENGINE battle (external match) — the client has no watch feed for it yet. */
    engine?: true;
    /** Hero-mode deep link — present ONLY on the owning governor's own view. */
    joinUrl?: string;
  }[] {
    const out: ReturnType<Game['liveBattleSummaries']> = [];
    const viewer = viewerGovernorId === undefined ? undefined : this.viewerContext(viewerGovernorId);
    const visible = (attackerGov: string, defenderGov: string, hexId: string): boolean => {
      const participant =
        viewerGovernorId !== undefined && (attackerGov === viewerGovernorId || defenderGov === viewerGovernorId);
      return participant || (viewer !== undefined && intelGrade(viewer.grades, hexId) === 'ACCURATE');
    };
    for (const [id, b] of this.state.wildBattles ?? []) {
      if (!visible(b.attackerGovernorId, b.defenderGovernorId, b.hexId)) continue;
      const monsterName = b.defenderArmyIds
        .map((aid) => this.state.monsterNames?.get(aid))
        .find((n) => n !== undefined);
      out.push({
        id,
        parcelId: this.parcelId(b.hexId),
        attackerGovernorIds: [b.attackerGovernorId],
        defenderGovernorIds: [b.defenderGovernorId],
        ...(monsterName !== undefined ? { monsterName } : {}),
        startedTick: b.startedTick,
      });
    }
    for (const [id, b] of this.state.engineBattles ?? []) {
      // Only genuinely-LIVE engine battles get the map LIVE badge / command viewer.
      // AUTO (accelerated) + QUEUED battles resolve headless and are watch-only — a
      // LIVE badge on them reads as "stuck" (§3a: command is the opt-in live path).
      if (b.mode !== 'live') continue;
      if (!visible(b.attackerGovernorId, b.defenderGovernorId, b.hexId)) continue;
      const myJoin =
        viewerGovernorId === undefined ? undefined : b.joins?.find((j) => j.governorId === viewerGovernorId);
      out.push({
        id,
        parcelId: this.parcelId(b.hexId),
        attackerGovernorIds: [b.attackerGovernorId],
        defenderGovernorIds: [b.defenderGovernorId],
        startedTick: b.startedTick,
        engine: true,
        ...(myJoin !== undefined ? { joinUrl: myJoin.joinUrl } : {}),
      });
    }
    return out;
  }

  // ── HERO-vs-HERO card duel (docs/briefs/HERO-DUEL-SPEC.md, decision 14) ─────
  //
  // v1 is a CARD duel owned entirely by CF: rating + Named artifacts set the
  // odds; it AUTO-RESOLVES; an online player picks a card per round (else NPC).
  // game.ts owns validation + the deterministic side inputs + settlement (record
  // the KO, emit the event, push the review ring). The real-time round loop +
  // pick-window timers live in server.ts (the WS/wall-clock boundary), driven by
  // the shared sim-engine resolver so online and auto never disagree.

  duelConfig(): Balance['duel'] {
    return this.balance.duel;
  }

  /** A governor's lead champion for a duel = highest-fame officer (deterministic tiebreak by id). */
  private leadOfficerOf(governorId: string): DemoOfficer | undefined {
    const pool = this.state.officers?.get(governorId) ?? [];
    if (pool.length === 0) return undefined;
    return [...pool].sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0) || (a.id < b.id ? -1 : 1))[0];
  }

  /**
   * A Master's element-FREE duel rating (docs/maps/MASTERS-ELEMENT-FREE-RULING.md):
   * a fame term + a deterministic per-Master component so champions differ even at
   * fame 0 (a fair, seeded spread — never Math.random). Higher ⇒ more initiative.
   */
  private duelRatingOf(o: DemoOfficer): number {
    const idComponent = createRng(`duel-rating/${o.masterId ?? o.id}`).int(0, 400);
    return 400 + (o.fame ?? 0) * 8 + idComponent;
  }

  private duelSideOf(o: DemoOfficer): DuelSide {
    // Artifacts are not yet equipped in the demo roster — the hook exists (the
    // wildcard) and is surfaced the moment officers carry an equipped artifact.
    // The champion slug resolves the head-shot portrait (public/avatars/<slug>.png).
    return { ref: o.id, name: o.name, rating: this.duelRatingOf(o), ...(o.slug !== undefined ? { slug: o.slug } : {}) };
  }

  /** A synthesized NPC/wild opponent when the target governor has no officer (e.g. a lair warden). */
  private duelNpcSide(name: string, seedKey: string): DuelSide {
    return { ref: `npc:${seedKey}`, name, rating: 350 + createRng(`duel-npc/${seedKey}`).int(0, 350) };
  }

  /**
   * Validate + build a challenge. `battleId` (a live battle in command mode) scopes
   * the target to the opposing side; otherwise `targetGovernorId` names a foe
   * directly (lone-occupation style). Returns the two element-free DuelSides + a
   * deterministic seed + the duelId. Throws ApiError on an illegal challenge.
   */
  buildDuelChallenge(
    challengerGovernorId: string,
    req: { championId?: string; targetGovernorId?: string; battleId?: string },
  ): { duelId: string; seed: string; A: DuelSide; D: DuelSide; targetGovernorId: string; parcelId?: string } {
    if (this.governors.get(challengerGovernorId) === undefined) {
      throw new ApiError(401, 'UNAUTHORIZED', 'unknown challenger');
    }
    // Resolve the target governor + the parcel context.
    let targetGovernorId = typeof req.targetGovernorId === 'string' ? req.targetGovernorId : undefined;
    let parcelId: string | undefined;
    let hexId: string | undefined;
    if (typeof req.battleId === 'string') {
      const wb = this.state.wildBattles?.get(req.battleId);
      const eb = this.state.engineBattles?.get(req.battleId);
      const b = wb ?? eb;
      if (b === undefined) throw new ApiError(404, 'NO_BATTLE', 'that battle is not running');
      const atk = b.attackerGovernorId;
      const def = b.defenderGovernorId;
      if (challengerGovernorId !== atk && challengerGovernorId !== def) {
        throw new ApiError(403, 'NOT_A_COMBATANT', 'you are not fighting in that battle');
      }
      targetGovernorId = challengerGovernorId === atk ? def : atk;
      hexId = b.hexId;
      parcelId = this.parcelId(b.hexId);
    }
    if (targetGovernorId === undefined) throw new ApiError(400, 'NO_TARGET', 'no duel target');
    if (targetGovernorId === challengerGovernorId) throw new ApiError(400, 'SELF_DUEL', 'you cannot duel yourself');

    // Challenger champion (chosen or lead).
    const chPool = this.state.officers?.get(challengerGovernorId) ?? [];
    const champion = req.championId !== undefined ? chPool.find((o) => o.id === req.championId) : this.leadOfficerOf(challengerGovernorId);
    if (champion === undefined) throw new ApiError(409, 'NO_CHAMPION', 'you have no Master to send to the duel');

    // Target champion (lead officer, else a synthesized warden).
    const targetLead = this.leadOfficerOf(targetGovernorId);
    const A = this.duelSideOf(champion);
    const D = targetLead !== undefined
      ? this.duelSideOf(targetLead)
      : this.duelNpcSide(this.governors.get(targetGovernorId)?.name ?? 'Warden', `${targetGovernorId}:${this.duelSeq}`);

    const nonce = this.duelSeq++;
    const duelId = `duel_${nonce}_${this.state.world.tick}`;
    const seed = `${this.state.world.seed}/duel/${nonce}/${this.state.world.tick}/${challengerGovernorId}/${targetGovernorId}`;
    return { duelId, seed, A, D, targetGovernorId, ...(parcelId !== undefined && hexId !== undefined ? { parcelId } : {}) };
  }

  /**
   * Apply a settled duel: KO the loser Master (record koUntil — enforcement is
   * post-MVP per state.ts), emit the `duel_resolved` event (visible to both
   * governors), and push the review ring (capped at ⚙ review.ringCap). `nowMs`
   * is the wall clock from the server boundary (game.ts stays Date.now-free).
   */
  recordDuelResult(args: {
    duelId: string;
    seed: string;
    challengerGovernorId: string;
    targetGovernorId: string;
    A: DuelSide;
    D: DuelSide;
    winner: 'A' | 'D';
    exchanges: DuelExchange[];
    parcelId?: string;
    hexId?: string;
    wasLive: boolean;
    nowMs: number;
  }): void {
    const loserSide = args.winner === 'A' ? args.D : args.A;
    const winnerSide = args.winner === 'A' ? args.A : args.D;
    // KO the loser Master if it is a real officer (not a synthesized warden).
    const koIso = new Date(args.nowMs + this.balance.wildBattle.masterRespawnTicks * 1000).toISOString();
    for (const gid of [args.challengerGovernorId, args.targetGovernorId]) {
      const o = this.state.officers?.get(gid)?.find((x) => x.id === loserSide.ref);
      if (o !== undefined) o.koUntil = koIso;
    }
    this.pendingEvents.push({
      type: 'duel_resolved',
      tick: this.state.world.tick,
      duelId: args.duelId,
      ...(args.parcelId !== undefined ? { parcelId: args.parcelId } : {}),
      challengerGovernorId: args.challengerGovernorId,
      targetGovernorId: args.targetGovernorId,
      attackerGovernorIds: [args.challengerGovernorId],
      defenderGovernorIds: [args.targetGovernorId],
      winnerName: winnerSide.name,
      loserName: loserSide.name,
      challengerWon: args.winner === 'A',
    });
    const rec: RecentDuelRecord = {
      duelId: args.duelId,
      ...(args.parcelId !== undefined ? { parcelId: args.parcelId } : {}),
      ...(args.hexId !== undefined ? { hexId: args.hexId } : {}),
      challengerGovernorId: args.challengerGovernorId,
      targetGovernorId: args.targetGovernorId,
      challengerName: args.A.name,
      targetName: args.D.name,
      ...(args.A.artifactName !== undefined ? { challengerArtifact: args.A.artifactName } : {}),
      ...(args.D.artifactName !== undefined ? { targetArtifact: args.D.artifactName } : {}),
      winner: args.winner,
      winnerName: winnerSide.name,
      exchanges: args.exchanges,
      resolvedTick: this.state.world.tick,
      wasLive: args.wasLive,
    };
    this.recentDuels.push(rec);
    const cap = this.balance.review.ringCap;
    if (this.recentDuels.length > cap) this.recentDuels.splice(0, this.recentDuels.length - cap);
  }

  /**
   * Fog-filtered recent-duels ring for /api/state + WS ticks. A duel is visible
   * to its two governors always, and to ACCURATE-intel bystanders of the parcel
   * it happened on. `hexId` is stripped; a per-viewer `mine` flag is added.
   */
  recentDuelsFor(viewerGovernorId?: string): (Omit<RecentDuelRecord, 'hexId'> & { mine: boolean })[] {
    const viewer = viewerGovernorId === undefined ? undefined : this.viewerContext(viewerGovernorId);
    const out: (Omit<RecentDuelRecord, 'hexId'> & { mine: boolean })[] = [];
    for (let i = this.recentDuels.length - 1; i >= 0; i--) {
      const rec = this.recentDuels[i]!;
      const participant =
        viewerGovernorId !== undefined &&
        (rec.challengerGovernorId === viewerGovernorId || rec.targetGovernorId === viewerGovernorId);
      const accurate =
        viewer !== undefined && rec.hexId !== undefined && intelGrade(viewer.grades, rec.hexId) === 'ACCURATE';
      if (!participant && !accurate) continue;
      const { hexId: _hex, ...wire } = rec;
      void _hex;
      out.push({ ...wire, mine: participant });
    }
    return out;
  }

  // ── Recently-resolved battle review (docs/04 §7b) ──────────────────────────

  /**
   * Record a just-settled battle into the bounded review ring. Start strengths
   * come from `preTroops` (captured before runTick); survivors from the settled
   * armies (0 for routed/disbanded). `engineInfo` carries the reason + live flag
   * the BattleInstance drops. Trimmed to ⚙ review.ringCap (oldest evicted).
   */
  private pushRecentBattle(
    v: BattleView,
    tick: number,
    preTroops: ReadonlyMap<string, number>,
    engineInfo?: { reason: string; live: boolean },
  ): void {
    const b = this.state.battles.get(v.id);
    if (b === undefined) return;
    const sumPre = (ids: readonly string[]): number => ids.reduce((n, id) => n + (preTroops.get(id) ?? 0), 0);
    const sumNow = (ids: readonly string[]): number =>
      ids.reduce((n, id) => {
        const a = this.state.armies.get(id);
        return n + (a !== undefined && a.state !== 'DISBANDED' ? troopCount(a) : 0);
      }, 0);
    const aStart = sumPre(b.attackerArmyIds);
    const aNow = sumNow(b.attackerArmyIds);
    const bStart = sumPre(b.defenderArmyIds);
    const bNow = sumNow(b.defenderArmyIds);
    const winner: RecentBattleRecord['winner'] =
      v.winner === 'DEFENDER' ? 'DEFENDER' : v.winner === 'ATTACKER' ? 'ATTACKER' : 'TIE';
    const label = (ids: readonly string[], fallback: string): string => {
      const names = ids.map((g) => this.governors.get(g)?.name).filter((n): n is string => n !== undefined);
      return names.length > 0 ? names.join(', ') : fallback;
    };
    const monsterName = b.defenderArmyIds
      .map((id) => this.state.monsterNames?.get(id))
      .find((n) => n !== undefined);
    const rec: RecentBattleRecord = {
      battleId: v.id,
      parcelId: v.parcelId,
      parcelName: territoryAtHex(this.state, b.hexId)?.name ?? v.parcelId,
      hexId: b.hexId,
      attackerGovernorIds: v.attackerGovernorIds,
      defenderGovernorIds: v.defenderGovernorIds,
      attackerLabel: label(v.attackerGovernorIds, 'Attackers'),
      defenderLabel: monsterName ?? label(v.defenderGovernorIds, 'Defenders'),
      ...(monsterName !== undefined ? { monsterName } : {}),
      startedTick: b.scheduledStartTick,
      resolvedTick: tick,
      winner,
      reason: engineInfo?.reason ?? v.outcome ?? (winner === 'TIE' ? 'TIE' : `DECISIVE_${winner}`),
      resolutionMode: v.resolutionMode,
      wasLive: engineInfo?.live === true || v.resolutionMode === 'LIVE',
      casualties: { attacker: Math.max(0, aStart - aNow), defender: Math.max(0, bStart - bNow) },
      survivors: { attacker: aNow, defender: bNow },
      startStrength: { attacker: aStart, defender: bStart },
      timeline: this.synthTimeline(v.id, aStart, aNow, bStart, bNow),
    };
    this.recentBattles.push(rec);
    const cap = Math.max(1, this.balance.review.ringCap);
    if (this.recentBattles.length > cap) this.recentBattles.splice(0, this.recentBattles.length - cap);
  }

  /**
   * Compact, DETERMINISTIC strength-progression timeline (docs/04 §7b): ⚙
   * review.timelineKeyframes frames interpolating each side's troop count from
   * its start down to its known survivors, with a seeded per-battle rhythm so
   * the losses land in uneven beats (not a straight ramp). Monotonic (troops
   * only fall). This is a RECONSTRUCTION — never fabricated unit positions —
   * and doubles as the sealed-reveal scrub track for AUTO battles.
   */
  private synthTimeline(battleId: string, aStart: number, aFinal: number, bStart: number, bFinal: number): BattleTimelineFrame[] {
    const N = Math.max(2, Math.floor(this.balance.review.timelineKeyframes));
    let sd = 0;
    for (const c of battleId) sd = (sd * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = (): number => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    // Cumulative, normalized weights over the N-1 steps (last = 1) — the seeded rhythm.
    const cumWeights = (steps: number): number[] => {
      const w: number[] = [];
      let sum = 0;
      for (let i = 0; i < steps; i++) {
        const x = 0.4 + rnd();
        w.push(x);
        sum += x;
      }
      const cum: number[] = [];
      let acc = 0;
      for (const x of w) {
        acc += x / sum;
        cum.push(acc);
      }
      return cum;
    };
    const aw = cumWeights(N - 1);
    const bw = cumWeights(N - 1);
    const frames: BattleTimelineFrame[] = [{ t: 0, a: aStart, b: bStart, ev: ['engage'] }];
    for (let i = 1; i < N; i++) {
      const a = Math.round(aStart - (aStart - aFinal) * aw[i - 1]!);
      const b = Math.round(bStart - (bStart - bFinal) * bw[i - 1]!);
      const frame: BattleTimelineFrame = { t: Math.round((i / (N - 1)) * 100) / 100, a, b };
      if (i === N - 1) frame.ev = ['decided'];
      frames.push(frame);
    }
    return frames;
  }

  /**
   * Fog-filtered recently-resolved battles for /api/state + the review panel
   * (docs/04 §7b), NEWEST FIRST. Reuses the liveBattleSummaries intel gate: the
   * viewer sees a battle only if they fought in it OR held ACCURATE intel on its
   * parcel. The internal `hexId` is stripped; a per-viewer `mine` is added. A
   * currently-live battle is NOT here — this is strictly post-resolution.
   */
  recentBattlesFor(viewerGovernorId?: string): (Omit<RecentBattleRecord, 'hexId'> & { mine: boolean })[] {
    const viewer = viewerGovernorId === undefined ? undefined : this.viewerContext(viewerGovernorId);
    const visible = (rec: RecentBattleRecord): boolean => {
      const participant =
        viewerGovernorId !== undefined &&
        (rec.attackerGovernorIds.includes(viewerGovernorId) || rec.defenderGovernorIds.includes(viewerGovernorId));
      return participant || (viewer !== undefined && intelGrade(viewer.grades, rec.hexId) === 'ACCURATE');
    };
    const out: (Omit<RecentBattleRecord, 'hexId'> & { mine: boolean })[] = [];
    for (let i = this.recentBattles.length - 1; i >= 0; i--) {
      const rec = this.recentBattles[i]!;
      if (!visible(rec)) continue;
      const { hexId: _hexId, ...pub } = rec;
      out.push({
        ...pub,
        mine: viewerGovernorId !== undefined && rec.attackerGovernorIds.includes(viewerGovernorId),
      });
    }
    return out;
  }

  // ── Snapshots for the API ─────────────────────────────────────────────────

  /** Static world geometry (GET /api/world) — parcels + territory/hex id joins. */
  worldGeometry(): { meta: Record<string, unknown>; parcels: WorldParcelView[] } {
    const terrByParcel = new Map<string, { territoryId: string; hexId: string }>();
    for (const nft of this.state.landNfts.values()) {
      const t = this.state.territories.get(nft.territoryId);
      if (t !== undefined && nft.sourceParcelId !== undefined) {
        terrByParcel.set(nft.sourceParcelId, { territoryId: t.id, hexId: t.hexIds[0]! });
      }
    }
    const parcels: WorldParcelView[] = [];
    for (const p of [...this.config.worldFile.parcels].sort((a, b) => (a.parcelId < b.parcelId ? -1 : 1))) {
      const join = terrByParcel.get(p.parcelId);
      if (join === undefined) continue; // dropped island — not in the world
      parcels.push({
        id: p.parcelId,
        territoryId: join.territoryId,
        hexId: join.hexId,
        center: p.center,
        polygon: p.polygon,
        neighbors: p.neighbors,
      });
    }
    return {
      meta: {
        zone: this.config.worldFile.meta.zone,
        sliceBBox: this.config.worldFile.meta.sliceBBox,
        seed: this.config.seed,
        travelTicksPerStep: this.tickOptions.travelTicksPerStep,
        // Claim-cost rule (docs/02): adjacent to your land = free; farther = CT/step.
        claims: {
          freeRadiusSteps: this.balance.claims.freeRadiusSteps,
          costCtUnitsPerStep: this.balance.claims.costCtUnitsPerStep,
        },
        // ⚙ Post-battle review (docs/04 §7b) — the client's "Review all" timer.
        review: { timerSec: this.balance.review.reviewTimerSec },
        // ⚙ Command-mode dials the client visualizes (DEFEND guard-ring radius etc).
        command: {
          defendRadius: this.balance.wildBattle.command.defendRadius,
          followRadius: this.balance.wildBattle.command.followRadius,
        },
        // World-map SPECIAL LINKS from the registry — the "not-plannable" edges
        // (kraken drags, secret entrances) that the map view renders on top of
        // the hand-authored surface graph. Data source: data/zone-registry.json
        // zoneLinks.locked (Agent D). Empty when the registry is absent.
        zoneLinks: readZoneLinks(),
      },
      parcels,
    };
  }

  /**
   * GET /api/economy — public economy telemetry (E5 + settlement addition).
   * The balance team cannot tune what it cannot see.
   */
  economyView(): {
    tick: number;
    supply: {
      minted: number;
      burned: number;
      treasury: number;
      wallets: number;
      territoryTreasuries: number;
      enrichmentPools: number;
      unclaimedLordYield: number;
      /** wallets + territoryTreasuries + enrichmentPools (CT still in play). */
      circulating: number;
    };
    flowsByReason: Record<string, number>;
    /** LOOT-bucket inflow per region over the last ⚙ lootWindowTicks. */
    topRegionsByLootInflow: { regionId: string; regionName: string; lootCtUnits: number }[];
    /** Same rollup per parcel (warzone heatmap), top 20. */
    topParcelsByLootInflow: { parcelId: string; territoryId: string; lootCtUnits: number }[];
    lootWindowTicks: number;
    journal: { headSeq: number; checksum: string; last24hByKind: Record<string, number> };
    purchaseCapCtPerEpoch: number;
    /**
     * ⚙ splitter shares + enrich/raze knobs (balance.economy) — clients render
     * spend leakage honestly from server truth instead of hardcoded mirrors.
     */
    shares: {
      loot: number;
      landYield: number;
      lordsLandlord: number;
      lordsSeat: number;
      burn: number;
      treasury: number;
      landYieldSelfPct: number;
      enrichYieldPctPerDay: number;
      enrichLootPct: number;
      razeSalvagePct: number;
    };
    /** ⚙ training.musterPenalty — mustering armies fight at this fraction of strength. */
    musterPenalty: number;
  } {
    const eco = ensureEconomy(this.state);
    const s = supplyComponents(this.state);
    const tick = this.state.world.tick;

    const byTerritory = new Map<string, number>();
    for (const r of eco.recentLoot) {
      if (r.tick < tick - this.balance.economy.lootWindowTicks) continue;
      byTerritory.set(r.territoryId, (byTerritory.get(r.territoryId) ?? 0) + r.amountCtUnits);
    }
    const byRegion = new Map<string, number>();
    for (const [terrId, amt] of byTerritory) {
      const regionId = this.state.territories.get(terrId)?.regionId ?? 'unknown';
      byRegion.set(regionId, (byRegion.get(regionId) ?? 0) + amt);
    }
    const topRegionsByLootInflow = [...byRegion.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 10)
      .map(([regionId, lootCtUnits]) => ({
        regionId,
        regionName: this.state.regions.get(regionId)?.name ?? regionId,
        lootCtUnits,
      }));
    const topParcelsByLootInflow = [...byTerritory.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 20)
      .map(([territoryId, lootCtUnits]) => ({
        parcelId: this.parcelId(this.state.territories.get(territoryId)?.hexIds[0] ?? territoryId),
        territoryId,
        lootCtUnits,
      }));

    const last24hByKind: Record<string, number> = {};
    const dayCutoff = tick - TICKS_PER_DAY;
    for (let i = eco.settlementJournal.length - 1; i >= 0; i--) {
      const r = eco.settlementJournal[i]!;
      if (r.tick < dayCutoff) break;
      last24hByKind[r.kind] = (last24hByKind[r.kind] ?? 0) + r.amountCtUnits;
    }

    return {
      tick,
      supply: {
        minted: s.mintedTotal,
        burned: s.burnedTotal,
        treasury: s.treasuryTotal,
        wallets: s.wallets,
        territoryTreasuries: s.territoryTreasuries,
        enrichmentPools: s.enrichmentPools,
        unclaimedLordYield: s.unclaimedLordYield,
        circulating: s.wallets + s.territoryTreasuries + s.enrichmentPools,
      },
      flowsByReason: { ...eco.flowsByReason },
      topRegionsByLootInflow,
      topParcelsByLootInflow,
      lootWindowTicks: this.balance.economy.lootWindowTicks,
      journal: {
        headSeq: eco.settlementJournal[eco.settlementJournal.length - 1]?.seq ?? -1,
        checksum: eco.journalChecksum,
        last24hByKind,
      },
      purchaseCapCtPerEpoch: this.balance.economy.purchaseCapCtPerEpoch,
      shares: {
        loot: this.balance.economy.lootShare,
        landYield: this.balance.economy.landYieldShare,
        lordsLandlord: this.balance.economy.lordsLandlordShare,
        lordsSeat: this.balance.economy.lordsSeatShare,
        burn: this.balance.economy.burnShare,
        treasury: this.balance.economy.treasuryShare,
        landYieldSelfPct: this.balance.economy.landYieldSelfPct,
        enrichYieldPctPerDay: this.balance.economy.enrichYieldPctPerDay,
        enrichLootPct: this.balance.economy.enrichLootPct,
        razeSalvagePct: this.balance.economy.razeSalvagePct,
      },
      musterPenalty: this.balance.training.musterPenalty,
    };
  }

  /**
   * GET /internal/economy/settlement?afterSeq=N — the exportable settlement
   * journal slice for the future chain-settlement worker (PlayEscrow vault,
   * backend as operator). Records are append-only with monotonic seq; the
   * checksum is the running FNV-1a chain over the WHOLE journal — the worker
   * verifies it against its own replayed chain head.
   */
  settlementSlice(afterSeq: number): { headSeq: number; checksum: string; records: SettlementRecord[] } {
    const eco = ensureEconomy(this.state);
    const records = eco.settlementJournal.filter((r) => r.seq > afterSeq);
    return {
      headSeq: eco.settlementJournal[eco.settlementJournal.length - 1]?.seq ?? -1,
      checksum: eco.journalChecksum,
      records,
    };
  }

  /**
   * Per-viewer intel context (F1 fog): grades computed fresh from live state
   * so order responses reflect ownership changes immediately. `undefined`
   * governorId = anonymous spectator — everything grades UNKNOWN (ownership/
   * prosperity stay public on territory views).
   */
  viewerContext(governorId?: string): ViewerContext {
    const period = Math.floor(this.state.world.tick / this.balance.intel.fuzzyPeriodTicks);
    if (governorId === undefined) return { grades: new Map<string, IntelGrade>(), period };
    return { governorId, grades: computeIntel(this.state, governorId, this.balance), period };
  }

  /**
   * Full dynamic state (GET /api/state), fog-filtered for `viewerGovernorId`
   * (undefined = anonymous spectator: ownership/prosperity only, no military).
   */
  stateFor(viewerGovernorId?: string): {
    tick: number;
    players: GovernorMeta[];
    territories: TerritoryView[];
    armies: ArmyView[];
    battles: BattleView[];
    liveBattles: ReturnType<Game['liveBattleSummaries']>;
    recentBattles: ReturnType<Game['recentBattlesFor']>;
    recentDuels: ReturnType<Game['recentDuelsFor']>;
  } {
    const viewer = this.viewerContext(viewerGovernorId);
    const territories = sortedIds(this.state.territories).map((id) =>
      territoryView(this.state, this.state.territories.get(id)!, this.parcelByHex, this.balance, viewer),
    );
    const armies: ArmyView[] = [];
    for (const id of sortedIds(this.state.armies)) {
      const a = this.state.armies.get(id)!;
      if (a.state === 'DISBANDED') continue;
      const v = armyView(this.state, a, this.parcelByHex, this.balance, this.tickOptions, viewer);
      if (v !== undefined) armies.push(v);
    }
    const battles = sortedIds(this.state.battles)
      .map((id) => battleView(this.state, this.state.battles.get(id)!, this.parcelByHex, this.balance, viewer))
      .filter((v): v is BattleView => v !== undefined)
      .sort((a, b) => b.resolvedTick - a.resolvedTick || (a.id < b.id ? -1 : 1))
      .slice(0, 25);
    return {
      tick: this.state.world.tick,
      players: [...this.governors.values()],
      territories,
      armies,
      battles,
      liveBattles: this.liveBattleSummaries(viewerGovernorId),
      recentBattles: this.recentBattlesFor(viewerGovernorId),
      recentDuels: this.recentDuelsFor(viewerGovernorId),
    };
  }

  /** Private per-player block for GET /api/state. */
  myState(governorId: string): {
    governorId: string;
    ctBalance: number;
    officers: DemoOfficer[];
    territoryIds: string[];
    armyIds: string[];
    /**
     * Pending PILLAGE/OCCUPY decisions. `battleId` is the /api/choice key
     * (equal to `choiceId`); `walkIn: true` marks bloodless F2 town entries
     * (no battle behind them — resolve exactly the same way).
     */
    pendingChoices: {
      battleId: string;
      choiceId: string;
      territoryId: string;
      parcelId: string;
      expiresTick: number;
      walkIn: boolean;
      armyId?: string;
    }[];
    /** COMMAND-slot budget (docs/04 §3a) — the march popover shows "Command used/max". */
    commandSlots: { used: number; max: number };
  } {
    const territoryIds: string[] = [];
    for (const id of sortedIds(this.state.territories)) {
      if (this.state.territories.get(id)!.governorId === governorId) territoryIds.push(id);
    }
    const armyIds: string[] = [];
    for (const id of sortedIds(this.state.armies)) {
      const a = this.state.armies.get(id)!;
      if (a.state !== 'DISBANDED' && a.ownerGovernorId === governorId) armyIds.push(id);
    }
    const pendingChoices: ReturnType<Game['myState']>['pendingChoices'] = [];
    for (const [choiceId, c] of this.state.pendingChoices ?? []) {
      if (c.governorId !== governorId) continue;
      const terr = this.state.territories.get(c.territoryId);
      pendingChoices.push({
        battleId: choiceId,
        choiceId,
        territoryId: c.territoryId,
        parcelId: terr === undefined ? c.territoryId : this.parcelId(terr.hexIds[0]!),
        expiresTick: c.expiresTick,
        walkIn: c.battleId === undefined,
        ...(c.armyId !== undefined ? { armyId: c.armyId } : {}),
      });
    }
    return {
      governorId,
      ctBalance: this.state.ctBalances?.get(governorId) ?? 0,
      officers: this.state.officers?.get(governorId) ?? [],
      territoryIds,
      armyIds,
      pendingChoices,
      commandSlots: {
        used: engineCommandSlotCount(this.state, governorId),
        max: this.balance.battle.commandSlotsPerPlayer,
      },
    };
  }

  // ── Deltas ────────────────────────────────────────────────────────────────

  /** OMNISCIENT changed-subset views since the last tick (tickOnce() return value / server-side use). */
  private computeDeltas(): TickDeltas {
    const territories: TerritoryView[] = [];
    for (const id of sortedIds(this.state.territories)) {
      const v = territoryView(this.state, this.state.territories.get(id)!, this.parcelByHex, this.balance);
      const s = JSON.stringify(v);
      if (this.lastViews.territories.get(id) !== s) {
        this.lastViews.territories.set(id, s);
        territories.push(v);
      }
    }
    const armies: ArmyView[] = [];
    for (const id of sortedIds(this.state.armies)) {
      const v = armyView(this.state, this.state.armies.get(id)!, this.parcelByHex, this.balance, this.tickOptions)!;
      const s = JSON.stringify(v);
      if (this.lastViews.armies.get(id) !== s) {
        this.lastViews.armies.set(id, s);
        armies.push(v);
      }
    }
    const battles: BattleView[] = [];
    for (const id of sortedIds(this.state.battles)) {
      const v = battleView(this.state, this.state.battles.get(id)!, this.parcelByHex, this.balance)!;
      const s = JSON.stringify(v);
      if (this.lastViews.battles.get(id) !== s) {
        this.lastViews.battles.set(id, s);
        battles.push(v);
      }
    }
    return { territories, armies, battles };
  }

  /**
   * Fog-filtered changed-subset views for one viewer (F1). Each viewer has its
   * own compare cache, so intel-grade transitions (army marches into/out of
   * sight, scout memory decays) surface as deltas even when the underlying
   * entity did not change. An army leaving the viewer's intel is sent ONCE as
   * `{id, hidden:true}` so the client drops its marker.
   */
  deltasFor(viewerGovernorId: string): TickDeltas {
    const viewer = this.viewerContext(viewerGovernorId);
    let cache = this.viewerLastViews.get(viewerGovernorId);
    if (cache === undefined) {
      cache = { territories: new Map(), armies: new Map(), battles: new Map() };
      this.viewerLastViews.set(viewerGovernorId, cache);
    }
    const territories: TerritoryView[] = [];
    for (const id of sortedIds(this.state.territories)) {
      const v = territoryView(this.state, this.state.territories.get(id)!, this.parcelByHex, this.balance, viewer);
      const s = JSON.stringify(v);
      if (cache.territories.get(id) !== s) {
        cache.territories.set(id, s);
        territories.push(v);
      }
    }
    const armies: ArmyView[] = [];
    const HIDDEN = 'hidden';
    for (const id of sortedIds(this.state.armies)) {
      const a = this.state.armies.get(id)!;
      const v = armyView(this.state, a, this.parcelByHex, this.balance, this.tickOptions, viewer);
      if (v === undefined) {
        // Out of intel: tombstone once if the viewer had previously seen it.
        const prev = cache.armies.get(id);
        if (prev !== undefined && prev !== HIDDEN) {
          cache.armies.set(id, HIDDEN);
          armies.push({ id, hidden: true });
        }
        continue;
      }
      const s = JSON.stringify(v);
      if (cache.armies.get(id) !== s) {
        cache.armies.set(id, s);
        armies.push(v);
      }
    }
    const battles: BattleView[] = [];
    for (const id of sortedIds(this.state.battles)) {
      const v = battleView(this.state, this.state.battles.get(id)!, this.parcelByHex, this.balance, viewer);
      if (v === undefined) continue;
      const s = JSON.stringify(v);
      if (cache.battles.get(id) !== s) {
        cache.battles.set(id, s);
        battles.push(v);
      }
    }
    return { territories, armies, battles };
  }

  /**
   * Fog-filter a tick's event list for one viewer (F1). An event passes when
   * the viewer is involved (their governorId appears in it), or every viewer-
   * private type check passes and at least one referenced parcel is ACCURATE.
   * choice_pending is strictly private to the choosing governor.
   */
  eventsFor(viewerGovernorId: string, events: readonly GameEvent[]): GameEvent[] {
    const viewer = this.viewerContext(viewerGovernorId);
    const accurate = (parcelId: unknown): boolean => {
      if (typeof parcelId !== 'string') return false;
      const hexId = this.hexByParcel.get(parcelId);
      return hexId !== undefined && intelGrade(viewer.grades, hexId) === 'ACCURATE';
    };
    return events.filter((e) => {
      const rec = e as unknown as Record<string, unknown>;
      const involved =
        rec['governorId'] === viewerGovernorId ||
        (Array.isArray(rec['attackerGovernorIds']) && (rec['attackerGovernorIds'] as string[]).includes(viewerGovernorId)) ||
        (Array.isArray(rec['defenderGovernorIds']) && (rec['defenderGovernorIds'] as string[]).includes(viewerGovernorId));
      if (e.type === 'choice_pending') return rec['governorId'] === viewerGovernorId;
      // Hero-mode join grants are strictly private (§3b visibility rule) —
      // an ACCURATE-intel bystander must never receive another player's joinUrl.
      if (e.type === 'battle_joinable') return rec['governorId'] === viewerGovernorId;
      if (involved) return true;
      if (e.type === 'player_joined') return true;
      // Ownership changes are PUBLIC intel (F1: ownership is never fogged) —
      // an abandoned parcel is free land everyone may race to claim.
      if (e.type === 'territory_abandoned') return true;
      return accurate(rec['parcelId']) || accurate(rec['fromParcelId']) || accurate(rec['toParcelId']);
    });
  }

  // ── Persistence (JSON snapshot, atomic write) ─────────────────────────────

  serialize(): SaveFileV1 {
    return {
      version: 1,
      seed: this.config.seed,
      orderSeq: this.orderSeq,
      npcGovernorId: this.npcGovernorId,
      sessions: [...this.sessions.values()],
      governors: [...this.governors.entries()],
      pgBindings: [...this.pgBindings.entries()],
      pgUsernames: [...this.pgUsernames.entries()],
      purchases: [...this.purchases.entries()],
      recentBattles: this.recentBattles,
      recentDuels: this.recentDuels,
      duelSeq: this.duelSeq,
      state: serializeWorldState(this.state),
    };
  }

  /** Atomic snapshot write: tmp file + rename. Call from the save interval + shutdown. */
  saveToDisk(): void {
    const path = this.config.savePath;
    if (path === undefined) return;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.serialize()), 'utf8');
    renameSync(tmp, path);
  }

  private tryLoadSave(): SaveFileV1 | undefined {
    const path = this.config.savePath;
    if (path === undefined) return undefined;
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return undefined; // no snapshot yet — fresh genesis
    }
    const parsed = JSON.parse(raw) as SaveFileV1;
    if (parsed.version !== 1) throw new Error(`unsupported save version ${String(parsed.version)} at ${path}`);
    if (parsed.seed !== this.config.seed) {
      // Different world seed ⇒ the snapshot belongs to another world; refuse to mix.
      console.warn(`[server] ignoring ${path}: snapshot seed '${parsed.seed}' != WORLD_SEED '${this.config.seed}'`);
      return undefined;
    }
    return parsed;
  }

  // ── Small helpers ─────────────────────────────────────────────────────────

  private getTerritory(territoryId: unknown): Territory {
    if (typeof territoryId !== 'string') throw new ApiError(400, 'BAD_TERRITORY', 'territoryId must be a string');
    const t = this.state.territories.get(territoryId);
    if (t === undefined) throw new ApiError(404, 'UNKNOWN_TERRITORY', `no such territory ${territoryId}`);
    return t;
  }

  /** Resolve a territory by its parcelId (the client-facing id) — for build/repair. */
  private getTerritoryByParcel(parcelId: unknown): Territory {
    if (typeof parcelId !== 'string') throw new ApiError(400, 'BAD_PARCEL', 'parcelId must be a string');
    const hexId = this.hexByParcel.get(parcelId);
    const terrId = hexId !== undefined ? this.state.hexes.get(hexId)?.territoryId : undefined;
    const t = terrId !== undefined ? this.state.territories.get(terrId) : undefined;
    if (t === undefined) throw new ApiError(404, 'UNKNOWN_TERRITORY', `no territory on parcel ${parcelId}`);
    return t;
  }

  parcelId(hexId: string): string {
    return this.parcelByHex.get(hexId) ?? hexId;
  }

  /** Is battleId a PENDING engine battle (allocated or awaiting allocate, callback not applied)? */
  engineBattleRunning(battleId: string): boolean {
    const b = this.state.engineBattles?.get(battleId);
    return b !== undefined && b.outcome === undefined;
  }

  /** ⚙ balance.economy.purchaseCapCtPerEpoch — surfaced by the /api/buy-ct stub. */
  purchaseCapCtPerEpoch(): number {
    return this.balance.economy.purchaseCapCtPerEpoch;
  }

  /**
   * E5 dev-phase CT purchase (owner 2026-07-03: "for now we use CT freely for
   * game testing"): mints to the wallet, journaled as a purchase faucet, HARD
   * capped at ⚙ purchaseCapCtPerEpoch per governor (epoch = world lifetime for
   * the MVP — real payments + epoch reset come with the on-chain phase).
   */
  buyCt(governorId: string, amountCtUnits: unknown): { ctUnits: number; boughtCtUnits: number; remainingCapCtUnits: number } {
    if (typeof amountCtUnits !== 'number' || !Number.isInteger(amountCtUnits) || amountCtUnits <= 0) {
      throw new ApiError(400, 'BAD_AMOUNT', 'amountCtUnits must be a positive integer');
    }
    const cap = this.balance.economy.purchaseCapCtPerEpoch;
    const used = this.purchases.get(governorId) ?? 0;
    const grant = Math.min(amountCtUnits, cap - used);
    if (grant <= 0) {
      throw new ApiError(409, 'PURCHASE_CAP', `purchase cap reached (${cap} ct_units per governor this epoch)`);
    }
    this.purchases.set(governorId, used + grant);
    const bal = this.state.ctBalances?.get(governorId) ?? 0;
    this.state.ctBalances?.set(governorId, bal + grant);
    recordMint(this.state, governorId, grant, 'purchase', 'wallet');
    return { ctUnits: bal + grant, boughtCtUnits: grant, remainingCapCtUnits: cap - used - grant };
  }

  /** Total march ticks for a path (used for ETA echoes). */
  pathTicks(path: readonly string[]): number {
    return path.reduce((n, hexId) => n + stepTicks(this.state, hexId, this.tickOptions), 0);
  }
}

// ── WorldState (de)serialization ─────────────────────────────────────────────

function serializeWorldState(state: WorldState): SerializedWorldState {
  return {
    world: state.world,
    regions: [...state.regions.entries()],
    hexes: [...state.hexes.entries()],
    territories: [...state.territories.entries()],
    landNfts: [...state.landNfts.entries()],
    armies: [...state.armies.entries()],
    battles: [...state.battles.entries()],
    adjacency: [...(state.adjacency ?? new Map<string, string[]>()).entries()],
    governorKinds: [...(state.governorKinds ?? new Map<string, GovernorKind>()).entries()],
    ctBalances: [...(state.ctBalances ?? new Map<string, number>()).entries()],
    officers: [...(state.officers ?? new Map<string, DemoOfficer[]>()).entries()],
    pendingChoices: [...(state.pendingChoices ?? new Map()).entries()],
    monsterNames: [...(state.monsterNames ?? new Map<string, string>()).entries()],
    battleLogistics: [...(state.battleLogistics ?? new Map<string, BattleLogisticsRecord>()).entries()],
    intel: [...(state.intel ?? new Map<string, Map<string, number>>()).entries()].map(
      ([gov, mem]) => [gov, [...mem.entries()]] as [string, [string, number][]],
    ),
    walkInOutcomes: [...(state.walkInOutcomes ?? [])],
    wildRaids: [...(state.wildRaids ?? new Map<string, WildRaidRecord>()).entries()],
    foodCarry: [...(state.foodCarry ?? new Map<string, number>()).entries()],
    econCarry: [...(state.econCarry ?? new Map<string, number>()).entries()],
    wildBattles: [...(state.wildBattles ?? new Map<string, WildBattleState>()).entries()],
    engineBattles: [...(state.engineBattles ?? new Map<string, EngineBattleState>()).entries()],
    economy: ensureEconomy(state),
    enrichmentPools: [...(state.enrichmentPools ?? new Map<string, number>()).entries()],
    enrichCarry: [...(state.enrichCarry ?? new Map<string, number>()).entries()],
    trainingQueues: [...(state.trainingQueues ?? new Map<string, TrainingQueue>()).entries()],
    devInvestedCt: [...(state.devInvestedCt ?? new Map()).entries()] as [string, Partial<Record<DevelopmentTrack, number>>][],
  };
}

function deserializeWorldState(s: SerializedWorldState): WorldState {
  // Migration: pre-F2 saves keyed pendingChoices by battleId without an `id`.
  const pendingChoices = new Map(s.pendingChoices) as NonNullable<WorldState['pendingChoices']>;
  for (const [key, c] of pendingChoices) {
    if (c.id === undefined) {
      c.id = key;
      c.battleId ??= key;
    }
  }
  return {
    world: s.world,
    regions: new Map(s.regions) as WorldState['regions'],
    hexes: new Map(s.hexes) as WorldState['hexes'],
    territories: new Map(s.territories) as WorldState['territories'],
    landNfts: new Map(s.landNfts) as WorldState['landNfts'],
    armies: new Map(s.armies) as WorldState['armies'],
    battles: new Map(s.battles) as WorldState['battles'],
    adjacency: new Map(s.adjacency),
    governorKinds: new Map(s.governorKinds),
    ctBalances: new Map(s.ctBalances),
    officers: new Map(s.officers),
    pendingChoices,
    monsterNames: new Map(s.monsterNames),
    battleLogistics: new Map(s.battleLogistics ?? []),
    intel: new Map((s.intel ?? []).map(([gov, mem]) => [gov, new Map(mem)])),
    walkInOutcomes: s.walkInOutcomes ?? [],
    wildRaids: new Map(s.wildRaids ?? []),
    foodCarry: new Map(s.foodCarry ?? []),
    econCarry: new Map(s.econCarry ?? []),
    wildBattles: new Map(s.wildBattles ?? []),
    engineBattles: new Map(s.engineBattles ?? []),
    ...(s.economy !== undefined ? { economy: s.economy } : {}),
    enrichmentPools: new Map(s.enrichmentPools ?? []),
    enrichCarry: new Map(s.enrichCarry ?? []),
    trainingQueues: new Map(s.trainingQueues ?? []),
    devInvestedCt: new Map(s.devInvestedCt ?? []),
  };
}

function territoryAtHex(state: WorldState, hexId: string): Territory | undefined {
  const terrId = state.hexes.get(hexId)?.territoryId;
  return terrId === undefined ? undefined : state.territories.get(terrId);
}

/** The governor who won a battle (strongest surviving winner-side contributor, deterministic). */
function winnerGovernorOf(state: WorldState, b: { attackerArmyIds: readonly string[]; defenderArmyIds: readonly string[]; result?: { winner: string } }, balance: Balance): string {
  const side = b.result?.winner === 'DEFENDER' ? b.defenderArmyIds : b.attackerArmyIds;
  const byGov = new Map<string, number>();
  for (const id of side) {
    const a = state.armies.get(id);
    if (a === undefined) continue;
    byGov.set(a.ownerGovernorId, (byGov.get(a.ownerGovernorId) ?? 0) + armyStrength(a, balance));
  }
  return [...byGov.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]?.[0] ?? 'unknown';
}
