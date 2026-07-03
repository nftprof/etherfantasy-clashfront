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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type Army,
  type Balance,
  createRng,
  DEVELOPMENT_TRACKS,
  type DevelopmentTrack,
  type GovernorKind,
  type PostVictoryAction,
  type Rng,
  type Territory,
  TICKS_PER_DAY,
  loadBalance,
} from '@clashfront/shared';
import {
  addGovernor,
  applyWildBattleCommand,
  armyEngagedIn,
  armyStrength,
  type BattleLogisticsRecord,
  claimTerritory,
  computeIntel,
  DEMO_ARMY_PRESETS,
  developTerritory,
  type DemoArmyPreset,
  type DemoOfficer,
  type DemoWorldFile,
  type EconomyState,
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
      /** F3: a monster lair split a raid army that is now marching (visible, interceptable). */
      type: 'wild_raid';
      tick: number;
      armyId: string;
      governorId: string;
      monsterName?: string;
      troops: number;
      fromParcelId: string;
      toParcelId: string;
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
  npcGovernorId = '';

  private readonly baseRng: Rng;
  private readonly balance: Balance = loadBalance();
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
    const save = this.tryLoadSave();
    if (save !== undefined) {
      this.state = deserializeWorldState(save.state);
      this.orderSeq = save.orderSeq;
      this.npcGovernorId = save.npcGovernorId;
      for (const s of save.sessions) this.sessions.set(s.token, s);
      for (const [id, meta] of save.governors) this.governors.set(id, meta);
      for (const [uid, gid] of save.pgBindings ?? []) this.pgBindings.set(uid, gid);
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
   */
  loginPg(pgUid: string, displayName: string): { playerId: string; token: string; governorId: string; officers: DemoOfficer[] } {
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

  march(governorId: string, armyId: unknown, toTerritoryId: unknown): { army: ArmyView; etaTick: number } {
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
    try {
      orderMarch(this.state, a.id, path, this.tickOptions);
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
    return { army: view, etaTick };
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
    return {
      battleId,
      parcelId: this.parcelId(b.hexId),
      size: b.field.size,
      bounds: b.field.bounds,
      spawn: b.field.spawn,
      heart: b.field.heart,
      obstacles: b.field.obstacles,
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
      ...(b.focusTgt !== undefined ? { focus: b.focusTgt } : {}),
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
    if ((kind === 'move' || kind === 'rally') && Number.isFinite(c?.['x']) && Number.isFinite(c?.['y'])) {
      parsed = { kind, x: c!['x'] as number, y: c!['y'] as number };
    } else if (kind === 'focus' && typeof c?.['targetId'] === 'string') {
      parsed = { kind: 'focus', targetId: c['targetId'] };
    } else {
      throw new ApiError(400, 'BAD_CMD', 'cmd must be {kind:move|rally,x,y} or {kind:focus,targetId}');
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

  /** Fog-filtered running-battle summaries for /api/state + map badges. */
  liveBattleSummaries(viewerGovernorId?: string): {
    id: string;
    parcelId: string;
    attackerGovernorIds: string[];
    defenderGovernorIds: string[];
    monsterName?: string;
    startedTick: number;
  }[] {
    const out: ReturnType<Game['liveBattleSummaries']> = [];
    if (this.state.wildBattles === undefined || this.state.wildBattles.size === 0) return out;
    const viewer = viewerGovernorId === undefined ? undefined : this.viewerContext(viewerGovernorId);
    for (const [id, b] of this.state.wildBattles) {
      const participant = viewerGovernorId !== undefined && b.attackerGovernorId === viewerGovernorId;
      if (!participant && (viewer === undefined || intelGrade(viewer.grades, b.hexId) !== 'ACCURATE')) continue;
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
      if (involved) return true;
      if (e.type === 'player_joined') return true;
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

  parcelId(hexId: string): string {
    return this.parcelByHex.get(hexId) ?? hexId;
  }

  /** ⚙ balance.economy.purchaseCapCtPerEpoch — surfaced by the /api/buy-ct stub. */
  purchaseCapCtPerEpoch(): number {
    return this.balance.economy.purchaseCapCtPerEpoch;
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
