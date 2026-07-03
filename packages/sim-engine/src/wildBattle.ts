/**
 * Wild-battle tactical sim — docs/04 §7b "battle anatomy" WILD row, prototyped.
 *
 * When a player army attacks a monster-garrisoned wild parcel, the fight is a
 * REAL RUNNING SIMULATION on that parcel's generated battlefield instead of an
 * instant WarScore resolve:
 *
 *   - The ATTACKER is the WAVES (StarCraft-campaign style, no CC): squads enter
 *     from the map edge every ⚙ waveEveryTicks; the army's remaining stock IS
 *     the wave budget. The Master fights as a hero entity with limited revives.
 *   - The DEFENDER (wild) holds towers + mob camps on the map, no CC. One lane.
 *   - Attacker WIN: defeat all mobs OR destroy all towers.
 *   - Attacker LOSS: waves exhausted AND Master out of revives AND field dead.
 *   - Clock expiry (⚙ clockTicks): non-decisive → TIMEOUT (attacker retreats).
 *
 * Determinism (AGENTS.md prime directive 6): the sim is a pure function of
 * (setup, seed, command inputs). Per-tick randomness derives statelessly from
 * `createRng(`${seed}:t${bt}`)` so the state is plain-JSON serializable and a
 * paused battle resumes bit-identically. Player steering commands (move /
 * focus / rally) enter as inputs and legitimately fork the timeline.
 *
 * Pacing is the CALLER's concern: step at 4 Hz for LIVE viewing or hundreds of
 * ticks per world tick for ACCELERATED resolution — same code path, same sim.
 */
import { type Balance, createRng, type Rng } from '@clashfront/shared';

// ── Wire/state shapes (plain JSON — snapshot-safe) ───────────────────────────

export type WildBattleSide = 'ATTACKER' | 'DEFENDER';
export type WildBattleOutcome = 'ATTACKER' | 'DEFENDER' | 'TIMEOUT';

export interface BfObstacle {
  x: number;
  y: number;
  r: number;
  kind: 'TREES' | 'ROCK' | 'POND';
}

export interface BfTower {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Attack cooldown ticks remaining. */
  cd: number;
}

export interface BfEntity {
  id: string;
  side: WildBattleSide;
  kind: 'UNIT' | 'MASTER' | 'MOB';
  /** UnitClass for units/mobs; 'MASTER' for the hero. */
  cls: string;
  /** Index into `roster` for casualty attribution (-1 for the Master). */
  rosterIx: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Attack cooldown ticks remaining. */
  cd: number;
  /** Mob camp anchor (leash center). */
  cx?: number;
  cy?: number;
  /** Current target id (entity or tower). */
  tgt?: string;
}

export interface WildBattlefield {
  /** Arena scale (240 = one MOBA-map-sized battlefield, 1 unit = 1 m — docs/04 §7b scale laws). */
  size: number;
  /** The parcel's own polygon normalized to arena scale — you fight on the outline of the land. */
  bounds: [number, number][];
  /** Attacker wave entry point on the map edge. */
  spawn: { x: number; y: number };
  /** Defender heart — the lane's far end. */
  heart: { x: number; y: number };
  obstacles: BfObstacle[];
}

/** One overworld unit stack's share of the battle (casualty attribution unit). */
export interface WildRosterEntry {
  armyId: string;
  side: WildBattleSide;
  cls: string;
  /** Pre-battle soldiers committed by this stack. */
  soldiers: number;
  /** Battle entities (squads) this stack fields in total. */
  entities: number;
  /** Entities of this entry killed so far. */
  dead: number;
}

export interface WildBattleState {
  id: string;
  seed: string;
  hexId: string;
  attackerArmyIds: string[];
  defenderArmyIds: string[];
  attackerGovernorId: string;
  defenderGovernorId: string;
  /** World tick the battle was created on. */
  startedTick: number;
  /** Battle ticks elapsed. */
  bt: number;
  clockTicks: number;
  field: WildBattlefield;
  towers: BfTower[];
  towersStart: number;
  /** Live entities only (dead are removed each tick). */
  entities: BfEntity[];
  roster: WildRosterEntry[];
  /** Unspawned attacker entities remaining per roster index (the wave budget). */
  stock: number[];
  mobsStart: number;
  mobsDead: number;
  master?: {
    name?: string;
    revives: number;
    alive: boolean;
    respawnAt?: number;
    moveTo?: { x: number; y: number };
  };
  /** Player steering inputs (attacker owner only). */
  rally?: { x: number; y: number };
  focusTgt?: string;
  /** Monotonic entity id counter. */
  nextId: number;
  outcome?: WildBattleOutcome;
  /**
   * Server-set pacing flag: true while a LIVE driver (spectator/steerer online)
   * owns the stepping — the world tick then skips this battle. An input, not
   * sim state; reset to false on snapshot load.
   */
  paced?: boolean;
}

export type WildBattleCmd =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'focus'; targetId: string }
  | { kind: 'rally'; x: number; y: number };

export interface WildBattleSetup {
  id: string;
  seed: string;
  hexId: string;
  /** The parcel's polygon in world coords (any scale — normalized to the arena). */
  polygon: [number, number][];
  attackers: { armyId: string; governorId: string; units: { cls: string; count: number }[] }[];
  defenders: { armyId: string; governorId: string; units: { cls: string; count: number }[] }[];
  masterName?: string;
  /** Master present at all? (armies without an officer fight without a hero.) */
  hasMaster: boolean;
  startedTick: number;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

function pointInPoly(poly: readonly [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Min distance from an interior point to the polygon boundary. */
function distToBoundary(poly: readonly [number, number][], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distToSegment(x, y, poly[j]![0], poly[j]![1], poly[i]![0], poly[i]![1]);
    if (d < best) best = d;
  }
  return best;
}

/** Farthest boundary intersection of a ray from (x,y) at angle θ (binary-search on the segment hit). */
function boundaryPointAt(poly: readonly [number, number][], x: number, y: number, theta: number): { x: number; y: number } {
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  // March outward until we exit, then bisect the crossing.
  let lo = 0;
  let hi = 4;
  while (pointInPoly(poly, x + dx * hi, y + dy * hi) && hi < 2000) hi *= 2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (pointInPoly(poly, x + dx * mid, y + dy * mid)) lo = mid;
    else hi = mid;
  }
  return { x: x + dx * lo, y: y + dy * lo };
}

// ── Battlefield generation ───────────────────────────────────────────────────

/**
 * Deterministic battlefield from (parcel polygon, seed): the polygon normalized
 * to arena scale is the bounds; a seeded heart + spawn-edge pair defines the
 * ONE lane; tree clusters / boulders / an optional pond scatter AROUND a clear
 * lane corridor. Pure function — same (polygon, seed) ⇒ same field, forever.
 */
export function generateBattlefield(
  polygon: readonly [number, number][],
  seed: string,
  size = 240,
): WildBattlefield {
  const rng = createRng(`${seed}:field`);
  // Normalize the polygon into [margin, size-margin], preserving aspect.
  const margin = 8;
  let mnx = Infinity;
  let mny = Infinity;
  let mxx = -Infinity;
  let mxy = -Infinity;
  for (const [x, y] of polygon) {
    if (x < mnx) mnx = x;
    if (y < mny) mny = y;
    if (x > mxx) mxx = x;
    if (y > mxy) mxy = y;
  }
  const s = (size - 2 * margin) / Math.max(mxx - mnx, mxy - mny, 1e-9);
  const ox = (size - (mxx - mnx) * s) / 2;
  const oy = (size - (mxy - mny) * s) / 2;
  const bounds = polygon.map(([x, y]) => [ox + (x - mnx) * s, oy + (y - mny) * s] as [number, number]);

  // Heart: poor-man pole of inaccessibility — best of centroid + seeded samples.
  let cx = 0;
  let cy = 0;
  for (const [x, y] of bounds) {
    cx += x;
    cy += y;
  }
  cx /= bounds.length;
  cy /= bounds.length;
  let heart = { x: cx, y: cy };
  let heartScore = pointInPoly(bounds, cx, cy) ? distToBoundary(bounds, cx, cy) : -1;
  const hRng = rng.fork('heart');
  for (let i = 0; i < 60; i++) {
    const x = margin + hRng.next() * (size - 2 * margin);
    const y = margin + hRng.next() * (size - 2 * margin);
    if (!pointInPoly(bounds, x, y)) continue;
    const d = distToBoundary(bounds, x, y);
    if (d > heartScore) {
      heartScore = d;
      heart = { x, y };
    }
  }

  // Spawn: seeded direction from the heart to the map edge, nudged inside.
  const theta = rng.fork('spawn').next() * 2 * Math.PI;
  const edge = boundaryPointAt(bounds, heart.x, heart.y, theta);
  const inDx = heart.x - edge.x;
  const inDy = heart.y - edge.y;
  const inLen = Math.max(1e-9, Math.hypot(inDx, inDy));
  const spawn = { x: edge.x + (inDx / inLen) * 7, y: edge.y + (inDy / inLen) * 7 };

  // Obstacles: scattered, but NEVER inside the lane corridor spawn→heart.
  const obstacles: BfObstacle[] = [];
  const oRng = rng.fork('obstacles');
  const tryPlace = (kind: BfObstacle['kind'], r: number): void => {
    for (let attempt = 0; attempt < 14; attempt++) {
      const x = oRng.next() * size;
      const y = oRng.next() * size;
      if (!pointInPoly(bounds, x, y)) continue;
      if (distToBoundary(bounds, x, y) < r + 2) continue;
      if (distToSegment(x, y, spawn.x, spawn.y, heart.x, heart.y) < r + 11) continue; // keep the lane clear
      if (Math.hypot(x - spawn.x, y - spawn.y) < r + 18) continue;
      if (Math.hypot(x - heart.x, y - heart.y) < r + 18) continue;
      if (obstacles.some((o) => Math.hypot(x - o.x, y - o.y) < r + o.r + 3)) continue;
      obstacles.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(r * 10) / 10, kind });
      return;
    }
  };
  if (oRng.next() < 0.5) tryPlace('POND', 10 + oRng.next() * 7);
  const trees = 7 + oRng.int(0, 5);
  for (let i = 0; i < trees; i++) tryPlace('TREES', 5 + oRng.next() * 6);
  const rocks = 3 + oRng.int(0, 3);
  for (let i = 0; i < rocks; i++) tryPlace('ROCK', 2 + oRng.next() * 2.5);

  return { size, bounds, spawn, heart, obstacles };
}

// ── Battle creation ──────────────────────────────────────────────────────────

function lanePoint(f: WildBattlefield, t: number): { x: number; y: number } {
  return { x: f.spawn.x + (f.heart.x - f.spawn.x) * t, y: f.spawn.y + (f.heart.y - f.spawn.y) * t };
}

/** Perpendicular unit vector of the lane. */
function lanePerp(f: WildBattlefield): { x: number; y: number } {
  const dx = f.heart.x - f.spawn.x;
  const dy = f.heart.y - f.spawn.y;
  const len = Math.max(1e-9, Math.hypot(dx, dy));
  return { x: -dy / len, y: dx / len };
}

export function createWildBattle(setup: WildBattleSetup, balance: Balance): WildBattleState {
  const wb = balance.wildBattle;
  const field = generateBattlefield(setup.polygon, setup.seed);
  const rng = createRng(`${setup.seed}:muster`);

  const roster: WildRosterEntry[] = [];
  const stock: number[] = [];
  for (const a of setup.attackers) {
    for (const u of a.units) {
      if (u.count <= 0) continue;
      const entities = Math.max(1, Math.round(u.count / wb.squadSize));
      roster.push({ armyId: a.armyId, side: 'ATTACKER', cls: u.cls, soldiers: u.count, entities, dead: 0 });
      stock.push(entities);
    }
  }
  const state: WildBattleState = {
    id: setup.id,
    seed: setup.seed,
    hexId: setup.hexId,
    attackerArmyIds: setup.attackers.map((a) => a.armyId),
    defenderArmyIds: setup.defenders.map((d) => d.armyId),
    attackerGovernorId: setup.attackers[0]?.governorId ?? 'unknown',
    defenderGovernorId: setup.defenders[0]?.governorId ?? 'unknown',
    startedTick: setup.startedTick,
    bt: 0,
    clockTicks: wb.clockTicks,
    field,
    towers: [],
    towersStart: 0,
    entities: [],
    roster,
    stock,
    mobsStart: 0,
    mobsDead: 0,
    nextId: 1,
    ...(setup.hasMaster
      ? { master: { ...(setup.masterName !== undefined ? { name: setup.masterName } : {}), revives: wb.masterRevives, alive: false, respawnAt: 0 } }
      : {}),
  };

  // Defender mobs: camps along the lane (guarding the ground) + a few wanderers.
  const perp = lanePerp(field);
  const campT = [0.55, 0.74, 0.92];
  let mobIx = 0;
  for (const d of setup.defenders) {
    for (const u of d.units) {
      if (u.count <= 0) continue;
      const entities = Math.max(1, Math.round(u.count / wb.squadSize));
      const rosterIx = roster.push({ armyId: d.armyId, side: 'DEFENDER', cls: u.cls, soldiers: u.count, entities, dead: 0 }) - 1;
      const stats = wb.unitStats[u.cls as keyof typeof wb.unitStats] ?? wb.unitStats.INFANTRY;
      for (let i = 0; i < entities; i++) {
        const wanderer = mobIx % 7 === 6;
        const r = rng.fork(`mob:${rosterIx}:${i}`);
        const t = wanderer ? 0.3 + r.next() * 0.55 : campT[mobIx % campT.length]!;
        const p = lanePoint(field, t);
        const off = wanderer ? (r.next() - 0.5) * 44 : (r.next() - 0.5) * 17;
        const along = (r.next() - 0.5) * 9;
        const laneDx = (field.heart.x - field.spawn.x) / Math.max(1e-9, Math.hypot(field.heart.x - field.spawn.x, field.heart.y - field.spawn.y));
        const laneDy = (field.heart.y - field.spawn.y) / Math.max(1e-9, Math.hypot(field.heart.x - field.spawn.x, field.heart.y - field.spawn.y));
        let x = p.x + perp.x * off + laneDx * along;
        let y = p.y + perp.y * off + laneDy * along;
        if (!pointInPoly(field.bounds, x, y)) {
          x = p.x;
          y = p.y;
        }
        state.entities.push({
          id: `d${state.nextId++}`,
          side: 'DEFENDER',
          kind: 'MOB',
          cls: u.cls,
          rosterIx,
          x,
          y,
          hp: stats.hp,
          maxHp: stats.hp,
          cd: 0,
          cx: x,
          cy: y,
        });
        state.mobsStart++;
        mobIx++;
      }
    }
  }

  // Towers: 2 for small camps, 3 for big — planted along the lane, jittered off-axis.
  const towerT = state.mobsStart >= 15 ? [0.5, 0.72, 0.9] : [0.6, 0.88];
  const tRng = rng.fork('towers');
  for (const t of towerT) {
    const p = lanePoint(field, t);
    const off = (tRng.next() - 0.5) * 14;
    let x = p.x + perp.x * off;
    let y = p.y + perp.y * off;
    if (!pointInPoly(field.bounds, x, y)) {
      x = p.x;
      y = p.y;
    }
    state.towers.push({ id: `t${state.nextId++}`, x, y, hp: wb.towerHp, maxHp: wb.towerHp, cd: 0 });
  }
  state.towersStart = state.towers.length;
  return state;
}

// ── Commands ─────────────────────────────────────────────────────────────────

export function applyWildBattleCommand(s: WildBattleState, cmd: WildBattleCmd): void {
  if (s.outcome !== undefined) return;
  const clamp = (v: number): number => Math.max(0, Math.min(s.field.size, v));
  switch (cmd.kind) {
    case 'move':
      if (s.master !== undefined) s.master.moveTo = { x: clamp(cmd.x), y: clamp(cmd.y) };
      return;
    case 'rally':
      s.rally = { x: clamp(cmd.x), y: clamp(cmd.y) };
      return;
    case 'focus': {
      const tower = s.towers.find((t) => t.id === cmd.targetId && t.hp > 0);
      const mob = s.entities.find((e) => e.id === cmd.targetId && e.side === 'DEFENDER');
      if (tower !== undefined || mob !== undefined) s.focusTgt = cmd.targetId;
      return;
    }
  }
}

// ── Stepping ─────────────────────────────────────────────────────────────────

interface Stats {
  hp: number;
  damage: number;
  cooldownTicks: number;
  range: number;
  speed: number;
}

function statsOf(e: BfEntity, wb: Balance['wildBattle']): Stats {
  if (e.kind === 'MASTER') {
    return { hp: wb.masterHp, damage: wb.masterDamage, cooldownTicks: wb.masterCooldownTicks, range: wb.masterRange, speed: wb.masterSpeed };
  }
  return wb.unitStats[e.cls as keyof typeof wb.unitStats] ?? wb.unitStats.INFANTRY;
}

/** Cheap deterministic hash for per-entity slide direction. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h >>> 0;
}

function spawnWave(s: WildBattleState, wb: Balance['wildBattle'], rng: Rng): void {
  let budget = wb.waveSize;
  let spawned = 0;
  // Round-robin across attacker roster entries with stock left.
  while (budget > 0) {
    let any = false;
    for (let ix = 0; ix < s.roster.length && budget > 0; ix++) {
      if (s.roster[ix]!.side !== 'ATTACKER' || (s.stock[ix] ?? 0) <= 0) continue;
      s.stock[ix]!--;
      budget--;
      any = true;
      const entry = s.roster[ix]!;
      const stats = wb.unitStats[entry.cls as keyof typeof wb.unitStats] ?? wb.unitStats.INFANTRY;
      const r = rng.fork(`u${spawned}`);
      s.entities.push({
        id: `a${s.nextId++}`,
        side: 'ATTACKER',
        kind: 'UNIT',
        cls: entry.cls,
        rosterIx: ix,
        x: s.field.spawn.x + (r.next() - 0.5) * 8,
        y: s.field.spawn.y + (r.next() - 0.5) * 8,
        hp: stats.hp,
        maxHp: stats.hp,
        cd: 0,
      });
      spawned++;
    }
    if (!any) break;
  }
}

/** True when the attacker has committed everything and lost it all. */
function attackerSpent(s: WildBattleState): boolean {
  if (s.stock.some((n, ix) => n > 0 && s.roster[ix]!.side === 'ATTACKER')) return false;
  if (s.entities.some((e) => e.side === 'ATTACKER')) return false;
  if (s.master !== undefined && (s.master.alive || s.master.revives > 0)) return false;
  return true;
}

/** Advance the battle by exactly one battle tick (no-op once decided). */
export function stepWildBattle(s: WildBattleState, balance: Balance): void {
  if (s.outcome !== undefined) return;
  const wb = balance.wildBattle;
  s.bt++;
  const rng = createRng(`${s.seed}:t${s.bt}`);
  const f = s.field;

  // 1 — waves from the map edge (the attacker IS the waves).
  if (s.bt === 1 || s.bt % wb.waveEveryTicks === 0) spawnWave(s, wb, rng.fork('wave'));

  // 2 — Master spawn/respawn (limited runs ⚙).
  const m = s.master;
  if (m !== undefined && !m.alive && m.revives > 0 && s.bt >= (m.respawnAt ?? 0)) {
    m.revives--;
    m.alive = true;
    s.entities.push({
      id: `m${s.nextId++}`,
      side: 'ATTACKER',
      kind: 'MASTER',
      cls: 'MASTER',
      rosterIx: -1,
      x: f.spawn.x,
      y: f.spawn.y,
      hp: wb.masterHp,
      maxHp: wb.masterHp,
      cd: 0,
    });
  }

  // Target lookup tables for this tick.
  const byId = new Map<string, BfEntity>();
  for (const e of s.entities) byId.set(e.id, e);
  const towersAlive = s.towers.filter((t) => t.hp > 0);
  const towerById = new Map(towersAlive.map((t) => [t.id, t]));
  if (s.focusTgt !== undefined && !byId.has(s.focusTgt) && !towerById.has(s.focusTgt)) delete s.focusTgt;

  const posOf = (id: string): { x: number; y: number } | undefined => byId.get(id) ?? towerById.get(id);

  // 3 — steering + target acquisition + movement (creation order = deterministic).
  for (const e of s.entities) {
    const st = statsOf(e, wb);
    // Validate current target.
    if (e.tgt !== undefined && posOf(e.tgt) === undefined) delete e.tgt;
    if (e.tgt !== undefined) {
      const te = byId.get(e.tgt);
      if (te !== undefined && te.side === e.side) delete e.tgt;
    }

    if (e.side === 'ATTACKER') {
      // Focus-fire order dominates within a generous obedience radius.
      if (s.focusTgt !== undefined) {
        const p = posOf(s.focusTgt);
        if (p !== undefined && Math.hypot(p.x - e.x, p.y - e.y) < wb.acquireRange * 2.5) e.tgt = s.focusTgt;
      }
      if (e.tgt === undefined) {
        e.tgt = nearestEnemyOf(s, e, wb.acquireRange, towersAlive);
      }
      // Push the lane: rally point override, else the defender heart.
      const goal =
        e.kind === 'MASTER' && m?.moveTo !== undefined
          ? m.moveTo
          : (s.rally ?? f.heart);
      if (e.kind === 'MASTER' && m?.moveTo !== undefined && Math.hypot(m.moveTo.x - e.x, m.moveTo.y - e.y) < 2.5) {
        delete m.moveTo;
      }
      // Endgame sweep: at the goal with nothing near — hunt anything left anywhere.
      if (e.tgt === undefined && Math.hypot(goal.x - e.x, goal.y - e.y) < 10) {
        e.tgt = nearestEnemyOf(s, e, Infinity, towersAlive);
      }
      moveEntity(s, e, st, e.tgt !== undefined ? posOf(e.tgt) : goal, wb);
    } else {
      // Mob: aggro on attackers near itself or its camp; leash back home.
      const camp = { x: e.cx ?? e.x, y: e.cy ?? e.y };
      if (e.tgt === undefined) {
        const near = nearestAttacker(s, e.x, e.y, wb.mobAggroRange);
        e.tgt = near ?? nearestAttacker(s, camp.x, camp.y, wb.mobAggroRange);
      }
      if (e.tgt !== undefined && Math.hypot(camp.x - e.x, camp.y - e.y) > wb.mobLeashRange) delete e.tgt;
      moveEntity(s, e, st, e.tgt !== undefined ? posOf(e.tgt) : camp, wb);
    }
  }

  // 3b — pairwise separation (cheap O(n²) at demo scale).
  const sep = 2.1;
  for (let i = 0; i < s.entities.length; i++) {
    const a = s.entities[i]!;
    for (let j = i + 1; j < s.entities.length; j++) {
      const b = s.entities[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= sep || d === 0) continue;
      const push = (sep - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;
    }
  }

  // 4 — attacks (entities, then towers).
  const damage = new Map<string, number>();
  const hit = (id: string, dmg: number): void => {
    damage.set(id, (damage.get(id) ?? 0) + dmg);
  };
  for (const e of s.entities) {
    if (e.cd > 0) e.cd--;
    if (e.tgt === undefined) continue;
    const p = posOf(e.tgt);
    if (p === undefined) continue;
    const st = statsOf(e, wb);
    const reach = st.range + (towerById.has(e.tgt) ? 2.5 : 1.1);
    if (Math.hypot(p.x - e.x, p.y - e.y) <= reach && e.cd === 0) {
      hit(e.tgt, st.damage);
      e.cd = st.cooldownTicks;
    }
  }
  for (const t of towersAlive) {
    if (t.cd > 0) {
      t.cd--;
      continue;
    }
    const tgt = nearestAttacker(s, t.x, t.y, wb.towerRange);
    if (tgt !== undefined) {
      hit(tgt, wb.towerDamage);
      t.cd = wb.towerCooldownTicks;
    }
  }

  // 5 — apply damage, remove the dead.
  for (const [id, dmg] of damage) {
    const tower = towerById.get(id);
    if (tower !== undefined) {
      tower.hp = Math.max(0, tower.hp - dmg);
      continue;
    }
    const e = byId.get(id);
    if (e !== undefined) e.hp -= dmg;
  }
  const survivors: BfEntity[] = [];
  for (const e of s.entities) {
    if (e.hp > 0) {
      survivors.push(e);
      continue;
    }
    if (e.kind === 'MOB') {
      s.mobsDead++;
      s.roster[e.rosterIx]!.dead++;
    } else if (e.kind === 'UNIT') {
      s.roster[e.rosterIx]!.dead++;
    } else if (m !== undefined) {
      m.alive = false;
      m.respawnAt = s.bt + wb.masterRespawnTicks;
    }
    if (s.focusTgt === e.id) delete s.focusTgt;
  }
  s.entities = survivors;

  // 6 — outcome checks (docs/04 §7b wild row).
  const towersLeft = s.towers.filter((t) => t.hp > 0).length;
  if (s.mobsDead >= s.mobsStart || (s.towersStart > 0 && towersLeft === 0)) {
    s.outcome = 'ATTACKER';
  } else if (attackerSpent(s)) {
    s.outcome = 'DEFENDER';
  } else if (s.bt >= s.clockTicks) {
    s.outcome = 'TIMEOUT';
  }
}

function nearestEnemyOf(
  s: WildBattleState,
  e: BfEntity,
  range: number,
  towersAlive: readonly BfTower[],
): string | undefined {
  let best: string | undefined;
  let bestD = range;
  for (const other of s.entities) {
    if (other.side === e.side) continue;
    const d = Math.hypot(other.x - e.x, other.y - e.y);
    if (d < bestD) {
      bestD = d;
      best = other.id;
    }
  }
  for (const t of towersAlive) {
    const d = Math.hypot(t.x - e.x, t.y - e.y) * 1.15; // slight mob preference — clear the field first
    if (d < bestD) {
      bestD = d;
      best = t.id;
    }
  }
  return best;
}

function nearestAttacker(s: WildBattleState, x: number, y: number, range: number): string | undefined {
  let best: string | undefined;
  let bestD = range;
  for (const e of s.entities) {
    if (e.side !== 'ATTACKER') continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e.id;
    }
  }
  return best;
}

/** Steer toward `goal` at class speed with obstacle push-outs + a stable tangential slide. */
function moveEntity(
  s: WildBattleState,
  e: BfEntity,
  st: Stats,
  goal: { x: number; y: number } | undefined,
  _wb: Balance['wildBattle'],
): void {
  if (goal !== undefined) {
    const dx = goal.x - e.x;
    const dy = goal.y - e.y;
    const d = Math.hypot(dx, dy);
    // Hold position at weapon range of the target (don't hug it).
    const stop = e.tgt !== undefined ? Math.max(1.2, st.range * 0.85) : 1.2;
    if (d > stop) {
      const step = Math.min(st.speed, d - stop);
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
    }
  }
  // Obstacle push-out + deterministic tangential slide (no pathfinding — 1 lane).
  const sign = hashId(e.id) % 2 === 0 ? 1 : -1;
  for (const o of s.field.obstacles) {
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d = Math.hypot(dx, dy);
    const min = o.r + 1.1;
    if (d >= min || d === 0) continue;
    const ux = dx / d;
    const uy = dy / d;
    e.x = o.x + ux * min + -uy * sign * st.speed * 0.6;
    e.y = o.y + uy * min + ux * sign * st.speed * 0.6;
  }
  // Stay on the parcel: outside the bounds → pull back toward the heart.
  if (!pointInPoly(s.field.bounds, e.x, e.y)) {
    const hx = s.field.heart.x - e.x;
    const hy = s.field.heart.y - e.y;
    const hd = Math.max(1e-9, Math.hypot(hx, hy));
    e.x += (hx / hd) * Math.max(st.speed, 1.5);
    e.y += (hy / hd) * Math.max(st.speed, 1.5);
  }
}

// ── Outcome accounting ───────────────────────────────────────────────────────

/**
 * Surviving soldiers per roster entry once the battle is decided:
 * survivors = (entities − dead) × soldiers-per-entity, rounded, clamped.
 * Attacker survivors include the unspawned stock (they simply never entered).
 * A routed defender (all mobs dead) reports zero survivors by construction.
 */
export function wildBattleSurvivors(s: WildBattleState): { entry: WildRosterEntry; survivors: number }[] {
  return s.roster.map((entry) => {
    const aliveEntities = Math.max(0, entry.entities - entry.dead);
    const survivors = Math.min(entry.soldiers, Math.round((aliveEntities / entry.entities) * entry.soldiers));
    return { entry, survivors };
  });
}
