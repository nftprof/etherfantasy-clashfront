/**
 * BridgeHub — the external-battle relay ("bridge" BattleSource).
 *
 * A running overworld battle's live feed can come from two sources:
 *   'sim'    — the built-in wildBattle tactical sim (packages/sim-engine),
 *              stepped by ClashServer's 4 Hz driver.
 *   'bridge' — an EXTERNAL match server (the real MOBA engine) that PUSHES
 *              telemetry snapshots to us over HTTP and PULLS queued
 *              command-mode inputs from us (docs/briefs/TELEMETRY-RELAY.md,
 *              M1 brief D2b). The overworld viewer (public/js/battle.js) is
 *              identical for both — this hub translates the external wire
 *              shapes into the exact battle_hello/battle_tick frames the
 *              viewer already speaks.
 *
 * Two lifecycle modes:
 *   EXHIBITION (smoke-test path): the battle exists only as a display —
 *     no overworld armies, no map mutation on end. Score/casualties are
 *     display-only; the map badge/flames/toasts fire as usual.
 *   BOUND (battleId param): the relay takes over the live feed of a REAL
 *     pending wild battle; on end the reported winner is forced onto the
 *     sim battle and the next world tick settles it through the normal
 *     deterministic phase order. Signal loss on a bound battle UNBINDS it
 *     (the sim resumes); only exhibition battles auto-end DRAW.
 *
 * Coordinates: the external match runs on the LEGACY SQUARE arena, ±half
 * of `arena.size` in MOBA units (x east, z north). The viewer space is
 * [0, size]² with y growing DOWN (south edge = bottom). One translation
 * pair (mobaToViewer / viewerToMoba) owns the conversion in both
 * directions; everything else passes through untouched.
 *
 * Wall clock is allowed here (stale/timeout detection) — the bridge is a
 * server boundary, never the sim.
 */
import { ApiError } from './game';

// ── Wire shapes (HTTP, external side) ────────────────────────────────────────

export type BridgeTeam = 'A' | 'B';
export type BridgeUnitKind = 'squad' | 'master' | 'mob' | 'tower' | 'core';
export type BridgeWinner = 'A' | 'B' | 'DRAW';

export interface BridgeUnitIn {
  id: string;
  kind: BridgeUnitKind;
  team: BridgeTeam;
  /** MOBA units, square arena: x ∈ [-size/2, size/2] east, z ∈ [-size/2, size/2] north. */
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  /** Optional unit class for rendering flavor (e.g. 'INFANTRY', 'ARCHER'). */
  cls?: string;
  /** Display name (masters). */
  name?: string;
}

export interface BridgeSnapshotIn {
  /** Engine tick (any monotonic counter). */
  tick: number;
  /** Milliseconds REMAINING on the match clock. */
  clockMs: number;
  units: BridgeUnitIn[];
  score?: { a: number; b: number };
  /** Attacker wave budget, if the match models waves. */
  waves?: { stock: number; stockStart: number };
  /** Master revives remaining ("runs"), if the match models them. */
  runs?: number;
}

export interface BridgeStartIn {
  matchId: string;
  parcelId: string;
  attacker: { governorName?: string; governorId?: string; armyLabel: string; troops: number };
  defender: { label: string; troops: number };
  arena: { shape: 'square'; size: number };
  /** Bind to a REAL pending wild battle (its live feed switches to the bridge). */
  battleId?: string;
  /** Display-only battle: no overworld consequences on end. Default true when battleId is absent. */
  exhibition?: boolean;
}

export interface BridgeCommandOut {
  seq: number;
  kind: 'move' | 'focus' | 'rally';
  /** MOBA units (square arena) — present for move/rally. */
  x?: number;
  z?: number;
  /** Present for focus. */
  targetId?: string;
  /** Governor who issued it ('' when exhibition commands are open to any viewer). */
  by: string;
  /** Wall-clock ms when queued (freshness hint for the AI officer). */
  atMs: number;
}

// ── Coordinate translation (the ONE place both directions live) ─────────────

/** MOBA square-arena point (±size/2, z north) → viewer point ([0,size]², y down). */
export function mobaToViewer(x: number, z: number, size: number): { x: number; y: number } {
  return { x: size / 2 + x, y: size / 2 - z };
}

/** Viewer point ([0,size]², y down) → MOBA square-arena point (±size/2, z north). */
export function viewerToMoba(x: number, y: number, size: number): { x: number; z: number } {
  return { x: x - size / 2, z: size / 2 - y };
}

// ── Internal battle record ───────────────────────────────────────────────────

/** Timeouts (wall-clock, server boundary): stale badge, then auto-end. */
export const BRIDGE_STALE_MS = 30_000;
export const BRIDGE_DEAD_MS = 120_000;

interface BridgeBattle {
  id: string;
  matchId: string;
  parcelId: string;
  exhibition: boolean;
  /** Bound sim battle id (non-exhibition takeover) — equals `id` when bound. */
  bound: boolean;
  /** Governor allowed to steer; undefined = open to any authenticated viewer (exhibition only). */
  startedByGovernorId?: string;
  attackerLabel: string;
  defenderLabel: string;
  attackerTroops: number;
  defenderTroops: number;
  size: number;
  startedTick: number;
  startedAtMs: number;
  lastSnapshotAtMs: number;
  stale: boolean;
  ended?: { winner: BridgeWinner; summary?: string; atMs: number };
  /** Last translated viewer snapshot (late subscribers get it in battle_hello). */
  lastSnap?: Record<string, unknown>;
  /** HUD baselines captured from telemetry (max-tracked — late spawns never exceed 100%). */
  mobsStart: number;
  towersStart: number;
  wavesStockStart: number;
  /** Command queue (their server polls GET …/commands?afterSeq=N). */
  commands: BridgeCommandOut[];
  nextSeq: number;
  /** Last steering markers, echoed into snapshots so the viewer renders them. */
  rally?: { x: number; y: number };
  focus?: string;
}

/** How the hub talks back to the server/world (injected — no ws/game imports here). */
export interface BridgeHubDeps {
  /** Fan a WS frame out to the battle's subscribers. */
  broadcast(battleId: string, msg: Record<string, unknown>): void;
  /** Queue a world event for the next tick broadcast (delivered to ALL clients). */
  pushEvent(ev: Record<string, unknown>): void;
  /** Current world tick (event stamping). */
  worldTick(): number;
  /** parcelId → hexId join; undefined = unknown parcel. */
  hexOfParcel(parcelId: string): string | undefined;
  /** Resolve a governor by display name (case-insensitive) or id. */
  findGovernorId(ref: { governorId?: string; governorName?: string }): string | undefined;
  /** BOUND battles: does this sim battle exist and still run? */
  simBattleRunning(battleId: string): boolean;
  /** BOUND battles: the sim battle's attacking governor (steering permission). */
  simBattleAttacker(battleId: string): string | undefined;
  /** BOUND battles: force the sim outcome; the next world tick settles it. */
  forceSimOutcome(battleId: string, winner: BridgeWinner): void;
}

const COMMAND_QUEUE_CAP = 200;
/** Ended battles linger this long so the emitter's final polls still resolve. */
const ENDED_LINGER_MS = 60_000;

// ── The hub ──────────────────────────────────────────────────────────────────

export class BridgeHub {
  private readonly battles = new Map<string, BridgeBattle>();
  private counter = 0;

  constructor(private readonly deps: BridgeHubDeps) {}

  /** Is this battleId bridge-fed (exhibition or bound)? */
  has(battleId: string): boolean {
    return this.battles.has(battleId);
  }

  /** Is this battleId a BOUND sim battle (the world tick must not step it)? */
  isBound(battleId: string): boolean {
    return this.battles.get(battleId)?.bound === true && this.battles.get(battleId)?.ended === undefined;
  }

  /** Running (non-ended) bridge battle, or throw 404. */
  private running(battleId: string): BridgeBattle {
    const b = this.battles.get(battleId);
    if (b === undefined) throw new ApiError(404, 'NO_BATTLE', `no bridge battle ${battleId}`);
    if (b.ended !== undefined) throw new ApiError(409, 'ENDED', `battle ${battleId} already ended`);
    return b;
  }

  // ── POST /bridge/battles/start ─────────────────────────────────────────────

  start(body: Record<string, unknown>, nowMs = Date.now()): { battleId: string; parcelId: string; exhibition: boolean } {
    const b = body as unknown as Partial<BridgeStartIn>;
    if (typeof b.matchId !== 'string' || b.matchId === '') throw new ApiError(400, 'BAD_MATCH', 'matchId (string) is required');
    if (typeof b.parcelId !== 'string' || this.deps.hexOfParcel(b.parcelId) === undefined) {
      throw new ApiError(404, 'UNKNOWN_PARCEL', `no such parcel ${String(b.parcelId)}`);
    }
    if (b.arena?.shape !== 'square' || typeof b.arena.size !== 'number' || !(b.arena.size > 0)) {
      throw new ApiError(400, 'BAD_ARENA', "arena must be {shape:'square', size:>0} (v1 supports square only)");
    }
    if (typeof b.attacker?.armyLabel !== 'string' || typeof b.defender?.label !== 'string') {
      throw new ApiError(400, 'BAD_SIDES', 'attacker.armyLabel and defender.label are required');
    }

    // Bind mode: take over a real pending wild battle's live feed.
    let bound = false;
    let id: string;
    let startedBy: string | undefined;
    if (typeof b.battleId === 'string' && b.battleId !== '') {
      if (!this.deps.simBattleRunning(b.battleId)) {
        throw new ApiError(404, 'NO_SIM_BATTLE', `no running wild battle ${b.battleId} to bind`);
      }
      if (this.battles.has(b.battleId)) throw new ApiError(409, 'ALREADY_BOUND', `battle ${b.battleId} is already bridge-fed`);
      bound = true;
      id = b.battleId;
      startedBy = this.deps.simBattleAttacker(b.battleId);
    } else {
      id = `BRX${String(++this.counter).padStart(4, '0')}-${b.matchId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)}`;
      startedBy = this.deps.findGovernorId({
        ...(typeof b.attacker.governorId === 'string' ? { governorId: b.attacker.governorId } : {}),
        ...(typeof b.attacker.governorName === 'string' ? { governorName: b.attacker.governorName } : {}),
      });
      if ((b.attacker.governorId !== undefined || b.attacker.governorName !== undefined) && startedBy === undefined) {
        throw new ApiError(404, 'UNKNOWN_GOVERNOR', 'attacker.governorName/governorId does not match any governor');
      }
    }
    const exhibition = bound ? false : b.exhibition !== false; // unbound defaults to exhibition

    const rec: BridgeBattle = {
      id,
      matchId: b.matchId,
      parcelId: b.parcelId,
      exhibition,
      bound,
      ...(startedBy !== undefined ? { startedByGovernorId: startedBy } : {}),
      attackerLabel: b.attacker.armyLabel,
      defenderLabel: b.defender.label,
      attackerTroops: typeof b.attacker.troops === 'number' ? Math.max(0, Math.round(b.attacker.troops)) : 0,
      defenderTroops: typeof b.defender.troops === 'number' ? Math.max(0, Math.round(b.defender.troops)) : 0,
      size: b.arena.size,
      startedTick: this.deps.worldTick(),
      startedAtMs: nowMs,
      lastSnapshotAtMs: nowMs,
      stale: false,
      mobsStart: 0,
      towersStart: 0,
      wavesStockStart: 0,
      commands: [],
      nextSeq: 1,
    };
    this.battles.set(id, rec);

    // Bound battles already announced themselves when the sim ignited them.
    if (!bound) {
      this.deps.pushEvent({
        type: 'battle_started',
        tick: this.deps.worldTick(),
        battleId: id,
        parcelId: rec.parcelId,
        attackerGovernorIds: startedBy !== undefined ? [startedBy] : [],
        defenderGovernorIds: [],
        attackerTroops: rec.attackerTroops,
        defenderTroops: rec.defenderTroops,
        exhibition,
        bridge: true,
        armyLabel: rec.attackerLabel,
        defenderLabel: rec.defenderLabel,
        open: startedBy === undefined,
      });
    }
    return { battleId: id, parcelId: rec.parcelId, exhibition };
  }

  // ── POST /bridge/battles/:id/snapshot ──────────────────────────────────────

  snapshot(battleId: string, body: Record<string, unknown>, nowMs = Date.now()): { ok: true } {
    const b = this.running(battleId);
    const snap = this.translateSnapshot(b, body as unknown as Partial<BridgeSnapshotIn>);
    b.lastSnapshotAtMs = nowMs;
    if (b.stale) b.stale = false;
    b.lastSnap = snap;
    this.deps.broadcast(battleId, { t: 'battle_tick', ...snap });
    return { ok: true };
  }

  /**
   * External telemetry → the viewer's battle_tick shape. squad/master/mob
   * become units (k 'u'/'M'/'m'); tower/core become the towers array (HP bars,
   * range rings, rubble, focus-picking all reuse the existing renderer).
   */
  translateSnapshot(b: BridgeBattle, s: Partial<BridgeSnapshotIn>): Record<string, unknown> {
    if (!Array.isArray(s.units)) throw new ApiError(400, 'BAD_SNAPSHOT', 'units[] is required');
    if (typeof s.tick !== 'number' || typeof s.clockMs !== 'number') {
      throw new ApiError(400, 'BAD_SNAPSHOT', 'tick and clockMs (numbers) are required');
    }
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    const half = b.size / 2;
    const units: Record<string, unknown>[] = [];
    const towers: Record<string, unknown>[] = [];
    let defendersAlive = 0;
    let master: { alive: boolean; revives: number; respawnIn: number; name?: string } | undefined;
    for (const u of s.units) {
      if (
        typeof u?.id !== 'string' ||
        typeof u.x !== 'number' ||
        typeof u.z !== 'number' ||
        Math.abs(u.x) > half + 1 ||
        Math.abs(u.z) > half + 1
      ) {
        throw new ApiError(400, 'BAD_UNIT', `unit ${String(u?.id)} needs id + x/z within ±${half}`);
      }
      const p = mobaToViewer(u.x, u.z, b.size);
      const hp = Math.max(0, Math.round(u.hp ?? 0));
      const mh = Math.max(1, Math.round(u.maxHp ?? 1));
      if (u.kind === 'tower' || u.kind === 'core') {
        towers.push({ id: u.id, x: r1(p.x), y: r1(p.y), hp, mh });
        continue;
      }
      if (u.kind === 'master') {
        master = { alive: hp > 0, revives: typeof s.runs === 'number' ? s.runs : 0, respawnIn: 0, ...(u.name !== undefined ? { name: u.name } : {}) };
      }
      if (u.team === 'B' && (u.kind === 'squad' || u.kind === 'mob')) defendersAlive++;
      units.push({
        id: u.id,
        k: u.kind === 'master' ? 'M' : u.kind === 'mob' ? 'm' : 'u',
        c: u.cls ?? u.kind.toUpperCase(),
        s: u.team === 'A' ? 'A' : 'D',
        x: r1(p.x),
        y: r1(p.y),
        hp,
        mh,
      });
    }
    const towersAlive = towers.filter((t) => (t['hp'] as number) > 0).length;
    b.mobsStart = Math.max(b.mobsStart, defendersAlive);
    b.towersStart = Math.max(b.towersStart, towers.length);
    const stock = s.waves?.stock ?? 0;
    b.wavesStockStart = Math.max(b.wavesStockStart, s.waves?.stockStart ?? stock);
    return {
      battleId: b.id,
      bt: Math.round(s.tick),
      // hello advertises tickHz 1 ⇒ the HUD clock reads clockLeft as seconds.
      clockLeft: Math.max(0, Math.round(s.clockMs / 1000)),
      units,
      towers,
      ...(master !== undefined ? { master } : {}),
      waves: { stock, stockStart: b.wavesStockStart, size: 0, nextIn: 0 },
      mobs: defendersAlive,
      mobsStart: Math.max(1, b.mobsStart),
      towersAlive,
      towersStart: b.towersStart,
      ...(s.score !== undefined ? { score: s.score } : {}),
      ...(b.rally !== undefined ? { rally: b.rally } : {}),
      ...(b.focus !== undefined ? { focus: b.focus } : {}),
    };
  }

  // ── WS side: battle_hello + steering ───────────────────────────────────────

  /** Static battle_hello payload (same slot as Game.battleStatic for sim battles). */
  battleStatic(battleId: string): Record<string, unknown> | undefined {
    const b = this.battles.get(battleId);
    if (b === undefined) return undefined;
    const sz = b.size;
    return {
      battleId,
      parcelId: b.parcelId,
      mode: 'square', // viewer: square arena frame, flat backdrop, no lane/terrain
      bridge: true,
      exhibition: b.exhibition,
      openCommands: b.startedByGovernorId === undefined && b.exhibition,
      size: sz,
      bounds: [
        [0, 0],
        [sz, 0],
        [sz, sz],
        [0, sz],
      ],
      // south-center entry / north-center heart: orientation hints only (no lane drawn in square mode)
      spawn: { x: sz / 2, y: sz - 8 },
      heart: { x: sz / 2, y: 8 },
      obstacles: [],
      attackerGovernorId: b.startedByGovernorId ?? '',
      defenderGovernorId: 'bridge',
      attackerLabel: b.attackerLabel,
      defenderLabel: b.defenderLabel,
      matchId: b.matchId,
      clockTicks: 0,
      tickHz: 1,
      waveEveryTicks: 0,
      startedTick: b.startedTick,
    };
  }

  /** Latest translated snapshot (battle_hello's `snap`). */
  battleSnapshot(battleId: string): Record<string, unknown> | undefined {
    const b = this.battles.get(battleId);
    if (b === undefined) return undefined;
    return b.lastSnap ?? { battleId, bt: 0, clockLeft: 0, units: [], towers: [], waves: { stock: 0, stockStart: 0, size: 0, nextIn: 0 }, mobs: 0, mobsStart: 1, towersAlive: 0, towersStart: 0 };
  }

  /** Spectating permission: exhibition battles are public to any session. */
  canView(battleId: string): boolean {
    return this.battles.has(battleId);
  }

  /**
   * Command-mode steering (WS battle_cmd → queue). Permission: the governor
   * named at start (or the bound battle's attacker); when none was named,
   * exhibition commands are open to any authenticated viewer.
   */
  command(governorId: string, battleId: string, cmd: unknown): void {
    const b = this.running(battleId);
    if (b.startedByGovernorId !== undefined && b.startedByGovernorId !== governorId) {
      throw new ApiError(403, 'NOT_YOUR_BATTLE', 'only the named commander steers this battle');
    }
    const c = cmd as Record<string, unknown> | undefined;
    const kind = c?.['kind'];
    let out: BridgeCommandOut;
    const atMs = Date.now();
    if ((kind === 'move' || kind === 'rally') && Number.isFinite(c?.['x']) && Number.isFinite(c?.['y'])) {
      const vx = Math.max(0, Math.min(b.size, c!['x'] as number));
      const vy = Math.max(0, Math.min(b.size, c!['y'] as number));
      const m = viewerToMoba(vx, vy, b.size);
      out = { seq: b.nextSeq++, kind, x: Math.round(m.x * 10) / 10, z: Math.round(m.z * 10) / 10, by: governorId, atMs };
      if (kind === 'rally') b.rally = { x: vx, y: vy };
    } else if (kind === 'focus' && typeof c?.['targetId'] === 'string') {
      out = { seq: b.nextSeq++, kind: 'focus', targetId: c['targetId'], by: governorId, atMs };
      b.focus = c['targetId'];
    } else {
      throw new ApiError(400, 'BAD_CMD', 'cmd must be {kind:move|rally,x,y} or {kind:focus,targetId}');
    }
    b.commands.push(out);
    if (b.commands.length > COMMAND_QUEUE_CAP) b.commands.splice(0, b.commands.length - COMMAND_QUEUE_CAP);
  }

  // ── GET /bridge/battles/:id/commands?afterSeq=N ────────────────────────────

  commandsAfter(battleId: string, afterSeq: number): { battleId: string; headSeq: number; ended: boolean; commands: BridgeCommandOut[] } {
    const b = this.battles.get(battleId);
    if (b === undefined) throw new ApiError(404, 'NO_BATTLE', `no bridge battle ${battleId}`);
    if (!Number.isInteger(afterSeq)) throw new ApiError(400, 'BAD_SEQ', 'afterSeq must be an integer');
    return {
      battleId,
      headSeq: b.nextSeq - 1,
      ended: b.ended !== undefined,
      commands: b.commands.filter((c) => c.seq > afterSeq),
    };
  }

  // ── POST /bridge/battles/:id/end ───────────────────────────────────────────

  end(battleId: string, body: Record<string, unknown>, nowMs = Date.now()): { ok: true; exhibition: boolean } {
    const b = this.running(battleId);
    const winner = body['winner'];
    if (winner !== 'A' && winner !== 'B' && winner !== 'DRAW') {
      throw new ApiError(400, 'BAD_WINNER', "winner must be 'A' | 'B' | 'DRAW'");
    }
    const summary = typeof body['summary'] === 'string' ? body['summary'] : undefined;
    this.finish(b, winner, summary, nowMs);
    return { ok: true, exhibition: b.exhibition };
  }

  private finish(b: BridgeBattle, winner: BridgeWinner, summary: string | undefined, nowMs: number): void {
    b.ended = { winner, ...(summary !== undefined ? { summary } : {}), atMs: nowMs };
    // Viewer banner immediately (same frame the sim path sends).
    const outcome = winner === 'A' ? 'ATTACKER' : winner === 'B' ? 'DEFENDER' : 'TIMEOUT';
    this.deps.broadcast(b.id, { t: 'battle_end', battleId: b.id, outcome });
    const govs = b.startedByGovernorId !== undefined ? [b.startedByGovernorId] : [];
    if (b.bound) {
      // Real battle: the sim settles it inside the next world tick (its own
      // battle_resolved event follows through the normal path).
      this.deps.forceSimOutcome(b.id, winner);
      return;
    }
    // Exhibition: display-only outcome events, NO map mutation.
    const score = (b.lastSnap?.['score'] as { a: number; b: number } | undefined) ?? { a: 0, b: 0 };
    this.deps.pushEvent({
      type: 'battle_resolved',
      tick: this.deps.worldTick(),
      battleId: b.id,
      parcelId: b.parcelId,
      winner: winner === 'A' ? 'ATTACKER' : winner === 'B' ? 'DEFENDER' : 'DRAW',
      attackerGovernorIds: govs,
      defenderGovernorIds: [],
      attackerScore: score.a,
      defenderScore: score.b,
      exhibition: true,
      bridge: true,
      attackerLabel: b.attackerLabel,
      defenderLabel: b.defenderLabel,
      ...(summary !== undefined ? { summary } : {}),
    });
    if (winner === 'DRAW') {
      this.deps.pushEvent({
        type: 'battle_tied',
        tick: this.deps.worldTick(),
        battleId: b.id,
        parcelId: b.parcelId,
        attackerGovernorIds: govs,
        defenderGovernorIds: [],
        exhibition: true,
        attackerLabel: b.attackerLabel,
        defenderLabel: b.defenderLabel,
      });
    }
  }

  // ── Liveness sweep (called from the server's timers; tests inject nowMs) ────

  sweep(nowMs = Date.now()): void {
    for (const [id, b] of this.battles) {
      if (b.ended !== undefined) {
        if (nowMs - b.ended.atMs > ENDED_LINGER_MS) this.battles.delete(id);
        continue;
      }
      const quiet = nowMs - b.lastSnapshotAtMs;
      if (quiet > BRIDGE_DEAD_MS) {
        if (b.bound) {
          // Give the real battle back to the sim rather than forcing a DRAW.
          this.battles.delete(id);
          continue;
        }
        this.finish(b, 'DRAW', 'signal lost — relay timed out', nowMs);
        continue;
      }
      if (quiet > BRIDGE_STALE_MS && !b.stale) {
        b.stale = true;
        const base = this.battleSnapshot(id)!;
        this.deps.broadcast(id, { t: 'battle_tick', ...base, stale: true });
      }
    }
  }

  /** Exhibition live-battle summaries merged into /api/state (bound ones come from the sim). */
  liveSummaries(): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (const b of this.battles.values()) {
      if (b.bound || b.ended !== undefined) continue;
      out.push({
        id: b.id,
        parcelId: b.parcelId,
        attackerGovernorIds: b.startedByGovernorId !== undefined ? [b.startedByGovernorId] : [],
        defenderGovernorIds: [],
        startedTick: b.startedTick,
        exhibition: true,
        bridge: true,
        attackerLabel: b.attackerLabel,
        defenderLabel: b.defenderLabel,
      });
    }
    return out;
  }
}
