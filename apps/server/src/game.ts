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
  type GovernorKind,
  type PostVictoryAction,
  type Rng,
  type Territory,
  loadBalance,
} from '@clashfront/shared';
import {
  addGovernor,
  armyStrength,
  type BattleLogisticsRecord,
  claimTerritory,
  DEMO_ARMY_PRESETS,
  type DemoArmyPreset,
  type DemoOfficer,
  type DemoWorldFile,
  findPath,
  loadDemoWorld,
  marchFoodPerStep,
  orderMarch,
  provisionArmy,
  raiseArmy,
  raiseCost,
  type RaiseCostBreakdown,
  resolvePostVictory,
  runTick,
  sortedIds,
  stepTicks,
  type TickOptions,
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
  if (msg.includes('not adjacent')) return new ApiError(400, 'BAD_PATH', msg);
  if (msg.includes('is not an officer')) return new ApiError(400, 'BAD_HERO', msg);
  if (msg.includes('must be in GARRISON')) return new ApiError(409, 'NOT_IN_GARRISON', msg);
  if (msg.includes('not at a friendly territory')) return new ApiError(409, 'NOT_FRIENDLY_TERRITORY', msg);
  if (msg.includes('non-negative integer')) return new ApiError(400, 'BAD_AMOUNT', msg);
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
  | { type: 'territory_occupied'; tick: number; battleId: string; territoryId: string; parcelId: string; governorId: string; lootCt: number }
  | { type: 'territory_pillaged'; tick: number; battleId: string; territoryId: string; parcelId: string; governorId: string; lootCt: number }
  | { type: 'npc_expand'; tick: number; governorId: string; armyId: string; fromParcelId: string; toParcelId: string };

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
}

// ── The game ─────────────────────────────────────────────────────────────────

export class Game {
  readonly state: WorldState;
  readonly sessions = new Map<string, Session>(); // token → session
  readonly governors = new Map<string, GovernorMeta>(); // governorId → meta
  npcGovernorId = '';

  private readonly baseRng: Rng;
  private readonly balance: Balance = loadBalance();
  private readonly parcelByHex: Map<string, string>;
  private orderSeq = 0;
  private pendingEvents: GameEvent[] = [];
  /** Battles whose territory outcome event has already been emitted (rebuilt on load). */
  private readonly emittedOutcomes = new Set<string>();
  private readonly lastViews = {
    territories: new Map<string, string>(),
    armies: new Map<string, string>(),
    battles: new Map<string, string>(),
  };

  constructor(private readonly config: GameConfig) {
    this.baseRng = createRng(config.seed);
    const save = this.tryLoadSave();
    if (save !== undefined) {
      this.state = deserializeWorldState(save.state);
      this.orderSeq = save.orderSeq;
      this.npcGovernorId = save.npcGovernorId;
      for (const s of save.sessions) this.sessions.set(s.token, s);
      for (const [id, meta] of save.governors) this.governors.set(id, meta);
      for (const [id, b] of this.state.battles) {
        if (b.result?.territoryOutcome !== undefined) this.emittedOutcomes.add(id);
      }
    } else {
      this.state = loadDemoWorld(config.worldFile, this.baseRng.fork('worldgen'), { seed: config.seed });
      this.registerWildGovernor();
      if (config.npcEveryTicks > 0) this.seedNpcKingdom();
    }
    this.parcelByHex = buildParcelByHex(this.state);
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
    return territoryView(this.state, t, this.parcelByHex);
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
      army: armyView(this.state, army, this.parcelByHex, this.balance, this.config.tickOptions),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      // Training + standard provision pack breakdown (docs/04 §7c.1).
      cost: raiseCost(preset as DemoArmyPreset, this.balance),
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
      army: armyView(this.state, a, this.parcelByHex, this.balance, this.config.tickOptions),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
      costCtUnits,
    };
  }

  march(governorId: string, armyId: unknown, toTerritoryId: unknown): { army: ArmyView; etaTick: number } {
    if (typeof armyId !== 'string') throw new ApiError(400, 'BAD_ARMY', 'armyId must be a string');
    const a = this.state.armies.get(armyId);
    if (a === undefined || a.state === 'DISBANDED') throw new ApiError(404, 'UNKNOWN_ARMY', `no such army ${armyId}`);
    if (a.ownerGovernorId !== governorId) throw new ApiError(403, 'NOT_YOUR_ARMY', `${armyId} is not your army`);
    const t = this.getTerritory(toTerritoryId);
    const toHex = t.hexIds[0]!;
    if (a.hexId === toHex) throw new ApiError(400, 'ALREADY_THERE', 'army is already on that parcel');
    const path = findPath(this.state, a.hexId, toHex, governorId); // hostile parcels block transit
    if (path === undefined || path.length === 0) throw new ApiError(400, 'UNREACHABLE', `no path to ${t.name}`);
    const fromParcelId = this.parcelId(a.hexId);
    try {
      orderMarch(this.state, a.id, path, this.config.tickOptions);
    } catch (e) {
      throw translateSimError(e);
    }
    const view = armyView(this.state, a, this.parcelByHex, this.balance, this.config.tickOptions);
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

  choice(
    governorId: string,
    battleId: unknown,
    action: unknown,
    overseerId?: unknown,
  ): { battle: BattleView; ctUnits: number } {
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
    this.emitOutcomeEvent(battleId, this.state.world.tick);
    return {
      battle: battleView(this.state, this.state.battles.get(battleId)!, this.parcelByHex),
      ctUnits: this.state.ctBalances?.get(governorId) ?? 0,
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

    runTick(this.state, tick, this.baseRng.fork('sim'), this.balance, this.config.tickOptions);

    const events: GameEvent[] = this.pendingEvents.splice(0);

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
      const v = battleView(this.state, this.state.battles.get(id)!, this.parcelByHex);
      events.push({
        type: 'battle_resolved',
        tick,
        battleId: id,
        parcelId: v.parcelId,
        winner: v.winner,
        ...(v.outcome !== undefined ? { outcome: v.outcome } : {}),
        attackerGovernorIds: v.attackerGovernorIds,
        defenderGovernorIds: v.defenderGovernorIds,
        attackerScore: v.attackerScore,
        defenderScore: v.defenderScore,
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

    // Newly pending PILLAGE/OCCUPY choices.
    for (const [battleId, c] of this.state.pendingChoices ?? []) {
      if (preChoices.has(battleId)) continue;
      const terr = this.state.territories.get(c.territoryId);
      events.push({
        type: 'choice_pending',
        tick,
        battleId,
        governorId: c.governorId,
        territoryId: c.territoryId,
        parcelId: terr === undefined ? c.territoryId : this.parcelId(terr.hexIds[0]!),
        expiresTick: c.expiresTick,
      });
    }

    // Territory outcomes decided during the tick (instant NPC choices, timeouts).
    for (const id of sortedIds(this.state.battles)) {
      const outcome = this.state.battles.get(id)!.result?.territoryOutcome;
      if (outcome === undefined || this.emittedOutcomes.has(id)) continue;
      this.emitOutcomeEvent(id, tick, events);
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

    let army: Army;
    try {
      army = raiseArmy(this.state, best.t.id, 'STANDARD', rng, this.autoPickHero(gov));
    } catch {
      return; // war chest empty — the kingdom rests this cycle
    }
    const target = this.nearestWildPath(army.hexId);
    if (target === undefined) return; // no wild land left — map fully tamed
    // Provision for the campaign (docs/04 §7c.1): the raise already bought the
    // standard pack; top up march rations to cover the road if affordable.
    const marchFood = marchFoodPerStep(army, this.balance) * target.path.length;
    if (marchFood > 0) {
      try {
        provisionArmy(this.state, army.id, { food: marchFood, gold: 0, wood: 0 }, this.balance);
      } catch {
        // war chest can't cover extra rations — march on the standard pack
      }
    }
    orderMarch(this.state, army.id, target.path, this.config.tickOptions);
    events.push({
      type: 'npc_expand',
      tick,
      governorId: gov,
      armyId: army.id,
      fromParcelId: this.parcelId(best.t.hexIds[0]!),
      toParcelId: this.parcelId(target.hexId),
    });
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
        travelTicksPerStep: this.config.tickOptions.travelTicksPerStep,
        // Claim-cost rule (docs/02): adjacent to your land = free; farther = CT/step.
        claims: {
          freeRadiusSteps: this.balance.claims.freeRadiusSteps,
          costCtUnitsPerStep: this.balance.claims.costCtUnitsPerStep,
        },
      },
      parcels,
    };
  }

  /** Full public dynamic state (GET /api/state); `my` block appended by the caller when authed. */
  publicState(): {
    tick: number;
    players: GovernorMeta[];
    territories: TerritoryView[];
    armies: ArmyView[];
    battles: BattleView[];
  } {
    const territories = sortedIds(this.state.territories).map((id) =>
      territoryView(this.state, this.state.territories.get(id)!, this.parcelByHex),
    );
    const armies: ArmyView[] = [];
    for (const id of sortedIds(this.state.armies)) {
      const a = this.state.armies.get(id)!;
      if (a.state === 'DISBANDED') continue;
      armies.push(armyView(this.state, a, this.parcelByHex, this.balance, this.config.tickOptions));
    }
    const battles = sortedIds(this.state.battles)
      .map((id) => battleView(this.state, this.state.battles.get(id)!, this.parcelByHex))
      .sort((a, b) => b.resolvedTick - a.resolvedTick || (a.id < b.id ? -1 : 1))
      .slice(0, 25);
    return {
      tick: this.state.world.tick,
      players: [...this.governors.values()],
      territories,
      armies,
      battles,
    };
  }

  /** Private per-player block for GET /api/state. */
  myState(governorId: string): {
    governorId: string;
    ctBalance: number;
    officers: DemoOfficer[];
    territoryIds: string[];
    armyIds: string[];
    pendingChoices: { battleId: string; territoryId: string; expiresTick: number }[];
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
    const pendingChoices: { battleId: string; territoryId: string; expiresTick: number }[] = [];
    for (const [battleId, c] of this.state.pendingChoices ?? []) {
      if (c.governorId === governorId) {
        pendingChoices.push({ battleId, territoryId: c.territoryId, expiresTick: c.expiresTick });
      }
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

  /** Changed-subset views since the last broadcast (JSON-string compare — cheap at 648 parcels). */
  private computeDeltas(): TickDeltas {
    const territories: TerritoryView[] = [];
    for (const id of sortedIds(this.state.territories)) {
      const v = territoryView(this.state, this.state.territories.get(id)!, this.parcelByHex);
      const s = JSON.stringify(v);
      if (this.lastViews.territories.get(id) !== s) {
        this.lastViews.territories.set(id, s);
        territories.push(v);
      }
    }
    const armies: ArmyView[] = [];
    for (const id of sortedIds(this.state.armies)) {
      const v = armyView(this.state, this.state.armies.get(id)!, this.parcelByHex, this.balance, this.config.tickOptions);
      const s = JSON.stringify(v);
      if (this.lastViews.armies.get(id) !== s) {
        this.lastViews.armies.set(id, s);
        armies.push(v);
      }
    }
    const battles: BattleView[] = [];
    for (const id of sortedIds(this.state.battles)) {
      const v = battleView(this.state, this.state.battles.get(id)!, this.parcelByHex);
      const s = JSON.stringify(v);
      if (this.lastViews.battles.get(id) !== s) {
        this.lastViews.battles.set(id, s);
        battles.push(v);
      }
    }
    return { territories, armies, battles };
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

  /** Total march ticks for a path (used for ETA echoes). */
  pathTicks(path: readonly string[]): number {
    return path.reduce((n, hexId) => n + stepTicks(this.state, hexId, this.config.tickOptions), 0);
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
  };
}

function deserializeWorldState(s: SerializedWorldState): WorldState {
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
    pendingChoices: new Map(s.pendingChoices) as WorldState['pendingChoices'],
    monsterNames: new Map(s.monsterNames),
    battleLogistics: new Map(s.battleLogistics ?? []),
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
