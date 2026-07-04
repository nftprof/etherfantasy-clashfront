/**
 * ENGINE battle integration tests (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md):
 * the overworld tick engine wired to the M1 external battle engine.
 *
 *   - flag OFF ⇒ zero behavior change (instant resolve, no engine state, no HTTP)
 *   - flag ON ⇒ hostile co-location becomes a PENDING ENGINE BATTLE: hex locked
 *     (march 409 ENGAGED), allocate POSTed with the EXACT schema payload +
 *     Authorization/Idempotency-Key headers
 *   - result callback: valid HMAC applies casualties per UnitClass + winner +
 *     structure damage next tick; bad HMAC → 401; stale issuedAt → 401;
 *     replayed nonce for another battle → 401; re-delivered battleId → 200
 *     without double-apply
 *   - allocate failure (5xx) ⇒ FALLBACK: the internal instant resolution
 *     settles the battle next tick (never brick a battle)
 *
 * The engine is mocked with a local node:http server. tickMs: null — every
 * world tick is driven by hand.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { type Balance, CONSTANTS, loadBalance } from '@clashfront/shared';
import { completeTraining, type DemoWorldFile, type EngineBattleState } from '@clashfront/sim-engine';
import { ClashServer, Game, type GameConfig, parseMasterNames, signCallbackBody } from '../src/index';

/** Write a temp balance.json = the packaged balance with `battle` overrides (cap-pressure tests). */
function balanceFileWith(patch: Partial<Balance['battle']>): string {
  const base = JSON.parse(JSON.stringify(loadBalance())) as Balance;
  base.battle = { ...base.battle, ...patch };
  const p = join(mkdtempSync(join(tmpdir(), 'cf-balance-')), 'balance.json');
  writeFileSync(p, JSON.stringify(base));
  return p;
}

const CT = CONSTANTS.CT_UNITS_PER_CT;
const HMAC_SECRET = 'test-hmac-secret';
const API_TOKEN = 'test-api-token';

function repoDataPath(file: string): string {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', 'data', file),
    join(__dirname, '..', '..', '..', 'data', file),
  ];
  const found = candidates.find((p) => existsSync(p));
  assert.ok(found, `${file} missing from data/`);
  return found;
}

const WORLD_FILE = JSON.parse(readFileSync(repoDataPath('demo-world.json'), 'utf8')) as DemoWorldFile;
const MASTER_NAMES = parseMasterNames(readFileSync(repoDataPath('CHARACTER_ROSTER.csv'), 'utf8'));

function gameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    worldFile: WORLD_FILE,
    seed: 'engine-battle-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50, engineBattles: true },
    npcEveryTicks: 0,
    startCtUnits: 5000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

async function api(
  base: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method: opts.body !== undefined ? 'POST' : 'GET',
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text === '' ? undefined : JSON.parse(text) };
}

async function until(cond: () => boolean, what: string, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Signed POST of a result callback to /internal/battle-result. */
async function postCallback(
  base: string,
  payload: unknown,
  secret = HMAC_SECRET,
): Promise<{ status: number; json: any }> {
  const raw = JSON.stringify(payload);
  const res = await fetch(`${base}/internal/battle-result`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cf-signature': signCallbackBody(secret, raw) },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, json: text === '' ? undefined : JSON.parse(text) };
}

interface CapturedRequest {
  headers: http.IncomingHttpHeaders;
  body: any;
}

/** Local mock of the engine's allocate endpoint. */
async function mockEngine(
  status: number,
  body: unknown,
): Promise<{ url: string; requests: CapturedRequest[]; close: () => Promise<void> }> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      requests.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as import('node:net').AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}/internal/v1/matches/allocate`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Two adjacent SYSTEM garrison-free territories (deterministic pick). */
function findAdjacentFreePair(game: Game): { t1: string; t2: string } {
  const free = (id: string | undefined): boolean => {
    if (id === undefined) return false;
    const t = game.state.territories.get(id);
    return t !== undefined && t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined;
  };
  for (const id of [...game.state.territories.keys()].sort()) {
    if (!free(id)) continue;
    const t = game.state.territories.get(id)!;
    for (const n of game.state.adjacency!.get(t.hexIds[0]!) ?? []) {
      const nid = game.state.hexes.get(n)!.territoryId;
      if (nid !== undefined && nid !== id && free(nid)) return { t1: id, t2: nid };
    }
  }
  throw new Error('demo world must contain two adjacent free parcels');
}

/**
 * Stage a PvP collision: Defender claims + garrisons t2; Attacker claims t1,
 * raises a STANDARD army and marches onto t2. Ticks until the collision tick.
 * `afterJoin` runs before any claims — mode-selection tests flip governor kinds there.
 * `command` issues the attacker's march as `MARCH & COMMAND` (docs/04 §3a).
 */
async function stagePvp(
  game: Game,
  server: ClashServer,
  base: string,
  afterJoin?: (attacker: any, defender: any) => void,
  command = false,
) {
  const attacker = (await api(base, '/api/join', { body: { name: 'Attacker' } })).json;
  const defender = (await api(base, '/api/join', { body: { name: 'Defender' } })).json;
  afterJoin?.(attacker, defender);
  const { t1, t2 } = findAdjacentFreePair(game);
  assert.equal((await api(base, '/api/claim', { token: defender.token, body: { territoryId: t2 } })).status, 200);
  const defRaise = (await api(base, '/api/raise', { token: defender.token, body: { territoryId: t2, preset: 'STANDARD' } })).json;
  completeTraining(game.state, defRaise.army.id);
  assert.equal((await api(base, '/api/claim', { token: attacker.token, body: { territoryId: t1 } })).status, 200);
  const atkRaise = (await api(base, '/api/raise', { token: attacker.token, body: { territoryId: t1, preset: 'STANDARD' } })).json;
  completeTraining(game.state, atkRaise.army.id);
  const marchRes = await api(base, '/api/march', {
    token: attacker.token,
    body: { armyId: atkRaise.army.id, toTerritoryId: t2, command },
  });
  assert.equal(marchRes.status, 200);
  // March until the collision tick (step time = travelTicksPerStep × moveCost).
  let events: any[] = [];
  for (let i = 0; i < 12; i++) {
    events = server.tickOnce().events as any[];
    if (events.some((e: any) => e.type === 'battle_started' || e.type === 'battle_resolved')) break;
  }
  return {
    attacker, defender, t1, t2,
    atkArmyId: atkRaise.army.id as string, defArmyId: defRaise.army.id as string,
    events, march: marchRes.json,
  };
}

// ── Flag OFF: zero behavior change ───────────────────────────────────────────

test('engine flag OFF: PvP collisions resolve instantly, no engine battles exist', async () => {
  const game = new Game(gameConfig({ seed: 'engine-off', tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 } }));
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { events } = await stagePvp(game, server, base);
    assert.ok(events.some((e: any) => e.type === 'battle_resolved'), 'instant resolve, same tick');
    assert.equal(events.some((e: any) => e.type === 'battle_started'), false, 'no pending battle announced');
    assert.equal(game.state.engineBattles?.size ?? 0, 0, 'no engine battle state');
    assert.equal(game.pendingEngineAllocations().length, 0);
    // The callback receiver is OFF too.
    const cb = await postCallback(base, { battleId: 'battle_X' });
    assert.equal(cb.status, 503);
  } finally {
    await server.stop();
  }
});

// ── Flag ON: allocate context + full callback flow ───────────────────────────

test('engine e2e: collision → pending battle (hex locked) → allocate per schema → HMAC callback settles it', async () => {
  const JOIN_URL = 'https://moba.example/play?net=server&match=efm_test_1&ticket=tkt.abc';
  const engine = await mockEngine(201, {
    matchId: 'efm_test_1',
    joinDeadline: '2026-07-03T00:00:00Z',
    tickHz: 30,
    // single attacker-oriented live join shape (what the netcode session returns today)
    ticket: 'tkt.abc',
    joinUrl: JOIN_URL,
  });
  const game = new Game(gameConfig());
  const server = new ClashServer({
    game,
    port: 0,
    tickMs: null,
    saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET },
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    // A real defender structure so the battlefield/damage lanes are exercised.
    const pre = findAdjacentFreePair(game);
    game.state.territories.get(pre.t2)!.structures.push({
      key: 'TOWER',
      track: 'DEFENSE',
      level: 1,
      hp: 2000,
      maxHp: 2000,
      anchor: [0.5, 0.625],
    });

    // MARCH & COMMAND (docs/04 §3a): the attacker opts into a LIVE steerable battle.
    const { attacker, defender, t2, atkArmyId, defArmyId, events } = await stagePvp(game, server, base, undefined, true);
    const started = events.find((e: any) => e.type === 'battle_started');
    assert.ok(started, 'pending engine battle announced');
    assert.equal(started.live, true, 'command march ⇒ LIVE engine battle');
    assert.equal(events.some((e: any) => e.type === 'battle_resolved'), false, 'NOT resolved instantly');
    const battleId = started.battleId as string;
    assert.match(battleId, /^battle_[0-9A-HJKMNP-TV-Z]{26}$/, 'prefix-typed ULID');
    assert.equal(started.attackerTroops, 200);
    assert.equal(started.defenderTroops, 200);
    const pending = game.state.engineBattles!.get(battleId)!;
    assert.match(pending.seed, /^[0-9a-f]{16}$/, 'seeded engine seed, never wall clock');

    // Hex locked exactly like a running wild battle: the army cannot march away.
    const flee = await api(base, '/api/march', { token: attacker.token, body: { armyId: atkArmyId, toTerritoryId: pre.t1 } });
    assert.equal(flee.status, 409);
    assert.equal(flee.json.error.code, 'ENGAGED');

    // Allocate fired with the EXACT schema payload + headers.
    await until(() => engine.requests.length > 0, 'allocate POST');
    await until(() => game.state.engineBattles!.get(battleId)!.status === 'ALLOCATED', 'allocated status');
    const req = engine.requests[0]!;
    assert.equal(req.headers['authorization'], `Bearer ${API_TOKEN}`);
    assert.equal(req.headers['idempotency-key'], battleId);
    assert.equal(req.headers['content-type'], 'application/json');
    const atkArmy = game.state.armies.get(atkArmyId)!;
    const defArmy = game.state.armies.get(defArmyId)!;
    const officerOf = (govId: string, heroId: string | undefined) =>
      game.state.officers!.get(govId)!.find((o) => o.id === heroId)!;
    const atkOfficer = officerOf(attacker.governorId, atkArmy.heroId);
    const defOfficer = officerOf(defender.governorId, defArmy.heroId);
    const parcelId = game.parcelId(game.state.territories.get(t2)!.hexIds[0]!);
    assert.deepStrictEqual(req.body, {
      v: 1,
      battleId,
      seed: pending.seed,
      mode: 'live', // PLAYER on both sides ⇒ hero-joinable live match (§3b mode selection)
      rates: { tickHz: 30, commandSnapshotHz: 3 },
      parcel: { parcelId, zone: String(WORLD_FILE.meta.zone), kind: 'PLAYER' },
      battlefield: {
        arena: { shape: 'polygon', sizeM: 240, bounds: [[0, 0], [240, 0], [240, 240], [0, 240]] },
        laneCount: 1,
        obstacles: [],
        spawnZones: [
          { id: 'spawn_atk_s', side: 'ATTACKER', edge: 'S', x: 120, z: 8 },
          { id: 'spawn_def_n', side: 'DEFENDER', edge: 'N', x: 120, z: 232 },
        ],
        structures: [
          { anchorId: 'anchor_0', kind: 'TOWER', side: 'DEFENDER', x: 120, z: 150, hp: 2000, hpMax: 2000 },
        ],
        mobs: [],
      },
      sides: {
        ATTACKER: {
          governorId: attacker.governorId,
          armies: [{
            armyId: atkArmyId,
            units: [
              { cls: 'INFANTRY', count: 100 },
              { cls: 'ARCHER', count: 60 },
              { cls: 'CAVALRY', count: 40 },
            ],
            officers: [{ masterId: atkOfficer.id, name: atkOfficer.name, level: 2, revives: 3 }],
            provisions: { food: atkArmy.provisions.food, gold: atkArmy.provisions.gold, wood: atkArmy.provisions.wood },
            entryEdge: 'S',
          }],
        },
        DEFENDER: {
          governorId: defender.governorId,
          armies: [{
            armyId: defArmyId,
            units: [
              { cls: 'INFANTRY', count: 100 },
              { cls: 'ARCHER', count: 60 },
              { cls: 'CAVALRY', count: 40 },
            ],
            officers: [{ masterId: defOfficer.id, name: defOfficer.name, level: 2, revives: 3 }],
            provisions: { food: defArmy.provisions.food, gold: defArmy.provisions.gold, wood: defArmy.provisions.wood },
            entryEdge: 'N',
          }],
        },
      },
      callback: { url: `http://127.0.0.1:${port}/internal/battle-result`, keyId: 'cf-hmac-1' },
    });

    // Live join grant (single shape → the attacker): stored on the record and
    // exposed ONLY to the owning governor's /api/state view (§3b visibility rule).
    assert.equal(pending.mode, 'live');
    assert.deepEqual(pending.joins, [{ governorId: attacker.governorId, joinUrl: JOIN_URL, ticket: 'tkt.abc' }]);
    const atkLb = (await api(base, '/api/state', { token: attacker.token })).json.liveBattles
      .find((b: any) => b.id === battleId);
    assert.ok(atkLb, 'pending engine battle listed for the owner');
    assert.equal(atkLb.engine, true);
    assert.equal(atkLb.joinUrl, JOIN_URL, 'owner sees the hero-mode doorway');
    const defLb = (await api(base, '/api/state', { token: defender.token })).json.liveBattles
      .find((b: any) => b.id === battleId);
    assert.ok(defLb, 'the other participant still sees the battle');
    assert.equal(defLb.joinUrl, undefined, 'joinUrl is PRIVATE to its governor');
    const anonLbs = (await api(base, '/api/state')).json.liveBattles ?? [];
    assert.equal(anonLbs.some((b: any) => b.joinUrl !== undefined), false, 'never in anonymous views');

    // The join grant is announced ONCE via battle_joinable, STRICTLY private to
    // its governor even against a participant with ACCURATE intel.
    const rj = server.tickOnce();
    const joinables = rj.events.filter((e: any) => e.type === 'battle_joinable') as any[];
    assert.equal(joinables.length, 1);
    assert.equal(joinables[0].governorId, attacker.governorId);
    assert.equal(joinables[0].joinUrl, JOIN_URL);
    assert.ok(game.eventsFor(attacker.governorId, rj.events).some((e) => e.type === 'battle_joinable'));
    assert.equal(
      game.eventsFor(defender.governorId, rj.events).some((e) => e.type === 'battle_joinable'),
      false,
      'battle_joinable never reaches another session',
    );
    assert.equal(server.tickOnce().events.some((e) => e.type === 'battle_joinable'), false, 'announced once');

    // Result callback (R10): attacker wins, per-UnitClass casualties, tower down.
    const preFood = atkArmy.provisions.food;
    const callback = {
      v: 1,
      battleId,
      matchId: 'efm_test_1',
      outcome: { winner: 'ATTACKER', reason: 'CORE_DESTROYED' },
      sides: {
        ATTACKER: {
          casualties: { INFANTRY: 40 },
          survivors: { INFANTRY: 60, ARCHER: 60, CAVALRY: 40 },
          provisionsConsumed: { food: 50 },
          officers: [{ masterId: atkOfficer.id, state: 'ALIVE', revivesUsed: 1, contribution: { kills: 5, structureDamage: 2000, damage: 9000 } }],
        },
        DEFENDER: {
          casualties: { INFANTRY: 100, ARCHER: 60, CAVALRY: 40 },
          survivors: {},
          officers: [],
        },
      },
      structures: [{ anchorId: 'anchor_0', hp: 0, destroyed: true }],
      clock: { tickCount: 9000, durationSec: 300, tickHz: 30 },
      verify: { finalChecksum: 'aa', journalHash: 'bb', seed: pending.seed },
      issuedAt: new Date().toISOString(),
      nonce: 'nonce-e2e-1',
    };
    // Wrong secret first: 401, nothing applied.
    const bad = await postCallback(base, callback, 'wrong-secret');
    assert.equal(bad.status, 401);
    assert.equal(game.state.engineBattles!.get(battleId)!.outcome, undefined, 'bad HMAC applies nothing');
    // Stale issuedAt: 401.
    const stale = await postCallback(base, { ...callback, issuedAt: new Date(Date.now() - 11 * 60_000).toISOString() });
    assert.equal(stale.status, 401);
    assert.equal(stale.json.error.code, 'STALE_RESULT');
    // Valid: 200 + applied.
    const ok = await postCallback(base, callback);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json, { ok: true, applied: true, duplicate: false });
    assert.equal(game.state.engineBattles!.get(battleId)!.outcome?.winner, 'ATTACKER');

    // Replayed nonce for a DIFFERENT battle: 401.
    const replayedNonce = await postCallback(base, { ...callback, battleId: 'battle_01AAAAAAAAAAAAAAAAAAAAAAAA' });
    assert.equal(replayedNonce.status, 401);
    assert.equal(replayedNonce.json.error.code, 'NONCE_REPLAYED');

    // The NEXT world tick settles it deterministically.
    const r = server.tickOnce();
    assert.equal(game.state.engineBattles!.has(battleId), false, 'settled');
    const resolved = r.events.find((e: any) => e.type === 'battle_resolved') as any;
    assert.ok(resolved && resolved.battleId === battleId);
    assert.equal(resolved.winner, 'ATTACKER');
    // Casualties per UnitClass hit the REAL armies; survivors march on.
    assert.deepEqual(
      game.state.armies.get(atkArmyId)!.units.map((u) => ({ cls: u.unitClass, count: u.count })),
      [{ cls: 'INFANTRY', count: 60 }, { cls: 'ARCHER', count: 60 }, { cls: 'CAVALRY', count: 40 }],
    );
    assert.equal(game.state.armies.get(atkArmyId)!.provisions.food, preFood - 50, 'provisions consumed');
    assert.equal(game.state.armies.get(defArmyId)!.state, 'DISBANDED', 'routed defender');
    // Structure damage per anchor.
    assert.equal(game.state.territories.get(t2)!.structures[0]!.hp, 0);
    // Canon battle record: LIVE MOBA match id + ACCELERATED resolution.
    const battle = game.state.battles.get(battleId)!;
    assert.equal(battle.resolutionMode, 'ACCELERATED');
    assert.equal(battle.efMobaMatchId, 'efm_test_1');
    // Normal post-battle flow: pillage/occupy pending choice for the winner.
    const choice = r.events.find((e: any) => e.type === 'choice_pending') as any;
    assert.ok(choice && choice.battleId === battleId && choice.governorId === attacker.governorId);
    const pillage = await api(base, '/api/choice', { token: attacker.token, body: { battleId, action: 'PILLAGE' } });
    assert.equal(pillage.status, 200);
    assert.ok(pillage.json.battle.lootCt >= 0);

    // Re-delivered battleId after settlement: 200 ack, no double-apply.
    const redelivered = await postCallback(base, callback);
    assert.equal(redelivered.status, 200);
    assert.equal(redelivered.json.duplicate, true);
    server.tickOnce();
    assert.equal(game.state.armies.get(atkArmyId)!.units[0]!.count, 60, 'no double-applied casualties');
  } finally {
    await server.stop();
    await engine.close();
  }
});

// ── Allocate failure ⇒ internal fallback ─────────────────────────────────────

test('allocate failure (5xx) falls back to the internal instant resolution', async () => {
  const engine = await mockEngine(500, { error: 'boom' });
  const game = new Game(gameConfig({ seed: 'engine-fallback' }));
  const server = new ClashServer({
    game,
    port: 0,
    tickMs: null,
    saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET },
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { events } = await stagePvp(game, server, base);
    const started = events.find((e: any) => e.type === 'battle_started');
    assert.ok(started, 'pending engine battle created');
    const battleId = started.battleId as string;
    await until(() => game.state.engineBattles!.get(battleId)!.status === 'FALLBACK', 'fallback status');
    // Next tick: lock dropped, instant WarScore resolution settles the field.
    const r = server.tickOnce();
    assert.equal(game.state.engineBattles!.size, 0, 'engine record dropped');
    const resolved = r.events.find((e: any) => e.type === 'battle_resolved') as any;
    assert.ok(resolved, 'battle resolved through the internal path');
    assert.ok(['ATTACKER', 'DEFENDER', 'DRAW'].includes(resolved.winner));
    assert.equal(game.state.battles.get(resolved.battleId)!.resolutionMode, 'AUTO', 'instant resolver');
  } finally {
    await server.stop();
    await engine.close();
  }
});

// ── Mode selection + live-match lifetime (§3b) ───────────────────────────────

/** Free SYSTEM parcel adjacent to a live monster lair (deterministic pick). */
function findLairAssault(game: Game): { homeTerrId: string; lairTerrId: string } {
  for (const id of [...game.state.territories.keys()].sort()) {
    const t = game.state.territories.get(id)!;
    if (t.governorKind !== 'SYSTEM' || t.garrisonArmyId === undefined) continue;
    const g = game.state.armies.get(t.garrisonArmyId);
    if (g === undefined || g.state === 'DISBANDED') continue;
    const freeNeighbor = (game.state.adjacency!.get(t.hexIds[0]!) ?? []).find((h) => {
      const nt = game.state.territories.get(game.state.hexes.get(h)!.territoryId!);
      return nt !== undefined && nt.governorKind === 'SYSTEM' && nt.garrisonArmyId === undefined;
    });
    if (freeNeighbor !== undefined) {
      return { homeTerrId: game.state.hexes.get(freeNeighbor)!.territoryId!, lairTerrId: id };
    }
  }
  throw new Error('demo world must contain a stageable monster lair');
}

test('PLAYER vs wild ⇒ mode live; join grant survives the snapshot; a live match is NEVER auto-fallen-back', async () => {
  const JOIN_URL = 'https://moba.example/play?net=server&match=efm_live_9&ticket=tkt.live';
  const engine = await mockEngine(201, {
    matchId: 'efm_live_9',
    joinDeadline: '2026-07-04T00:00:00Z',
    tickHz: 30,
    ticket: 'tkt.live',
    joinUrl: JOIN_URL,
  });
  const savePath = join(mkdtempSync(join(tmpdir(), 'cf-engine-live-')), 'save.json');
  const config = gameConfig({ seed: 'engine-live-wild', savePath });
  const game = new Game(config);
  const server = new ClashServer({
    game,
    port: 0,
    tickMs: null,
    saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET },
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const player = (await api(base, '/api/join', { body: { name: 'Raider' } })).json;
    const { homeTerrId, lairTerrId } = findLairAssault(game);
    assert.equal((await api(base, '/api/claim', { token: player.token, body: { territoryId: homeTerrId } })).status, 200);
    const raise = (await api(base, '/api/raise', { token: player.token, body: { territoryId: homeTerrId, preset: 'STANDARD' } })).json;
    completeTraining(game.state, raise.army.id);
    // MARCH & COMMAND (docs/04 §3a): opt into a LIVE steerable wild assault.
    assert.equal(
      (await api(base, '/api/march', { token: player.token, body: { armyId: raise.army.id, toTerritoryId: lairTerrId, command: true } })).status,
      200,
    );
    let started: any;
    for (let i = 0; i < 12 && started === undefined; i++) {
      started = server.tickOnce().events.find((e) => e.type === 'battle_started');
    }
    assert.ok(started, 'engine battle ignited');
    assert.equal(started.engine, true, 'battle_started marks engine battles');
    assert.equal(started.live, true, 'command march ⇒ LIVE engine battle');
    const battleId = started.battleId as string;

    // Allocate went out as a LIVE match: a PLAYER is on the field who elected command (§3a).
    await until(() => game.state.engineBattles!.get(battleId)!.status === 'ALLOCATED', 'allocated status');
    const body = engine.requests[0]!.body;
    assert.equal(body.mode, 'live');
    assert.deepEqual(body.rates, { tickHz: 30, commandSnapshotHz: 3 });
    assert.equal(body.parcel.kind, 'WILD');
    assert.equal(body.sides.DEFENDER.governorId, null, 'wild defender stays null');

    // A live match runs in REAL time (up to ~40 min): no tick-based timeout may
    // fall it back or auto-resolve it — the result callback is the only exit.
    for (let i = 0; i < 30; i++) {
      const r = server.tickOnce();
      assert.equal(r.events.some((e) => e.type === 'battle_resolved'), false, `no auto-resolve at tick +${i + 1}`);
    }
    const rec = game.state.engineBattles!.get(battleId)!;
    assert.equal(rec.status, 'ALLOCATED', 'still awaiting the callback after 30 ticks');
    assert.equal(rec.mode, 'live');
    const flee = await api(base, '/api/march', { token: player.token, body: { armyId: raise.army.id, toTerritoryId: homeTerrId } });
    assert.equal(flee.status, 409, 'armies stay pinned for the whole live match');

    // Snapshot round-trip: the join grant is part of the record like everything else.
    game.saveToDisk();
    const game2 = new Game(config);
    const rec2 = game2.state.engineBattles!.get(battleId)!;
    assert.equal(rec2.mode, 'live');
    assert.deepEqual(rec2.joins, [{ governorId: player.governorId, joinUrl: JOIN_URL, ticket: 'tkt.live' }]);
    const mine2 = game2.liveBattleSummaries(player.governorId).find((b) => b.id === battleId);
    assert.ok(mine2 !== undefined && mine2.engine === true);
    assert.equal(mine2.joinUrl, JOIN_URL, 'owner view keeps the doorway after reload');
    assert.equal(
      game2.liveBattleSummaries(undefined).some((b) => b.joinUrl !== undefined),
      false,
      'anonymous view never carries a joinUrl',
    );
  } finally {
    await server.stop();
    await engine.close();
  }
});

test('pure AI battles (NPC vs NPC) stay mode accelerated', async () => {
  const engine = await mockEngine(201, { matchId: 'efm_ai_1' });
  const game = new Game(gameConfig({ seed: 'engine-npc-vs-npc' }));
  const server = new ClashServer({
    game,
    port: 0,
    tickMs: null,
    saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET },
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { events } = await stagePvp(game, server, base, (attacker, defender) => {
      // Both banners are AI kingdoms — nobody can take the field.
      game.state.governorKinds!.set(attacker.governorId, 'NPC_KINGDOM');
      game.state.governorKinds!.set(defender.governorId, 'NPC_KINGDOM');
    });
    const started = events.find((e: any) => e.type === 'battle_started') as any;
    assert.ok(started, 'engine battle ignited');
    await until(() => engine.requests.length > 0, 'allocate POST');
    assert.equal(engine.requests[0]!.body.mode, 'accelerated');
    await until(() => game.state.engineBattles!.get(started.battleId)!.status === 'ALLOCATED', 'allocated');
    assert.equal(game.state.engineBattles!.get(started.battleId)!.mode, 'accelerated');
    assert.equal(game.state.engineBattles!.get(started.battleId)!.joins, undefined, 'no join grants without a joinUrl');
  } finally {
    await server.stop();
    await engine.close();
  }
});

test('CF_LIVE_BATTLES=0 (liveBattles:false) forces accelerated even with COMMAND intent', async () => {
  const engine = await mockEngine(201, { matchId: 'efm_kill_1' });
  // Kill switch flows into the sim (tickOptions.liveBattles) AND the allocate clamp.
  const game = new Game(gameConfig({
    seed: 'engine-live-off',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50, engineBattles: true, liveBattles: false },
  }));
  const server = new ClashServer({
    game,
    port: 0,
    tickMs: null,
    saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET, liveBattles: false },
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    // Even with MARCH & COMMAND, the kill switch downgrades to accelerated.
    const { events } = await stagePvp(game, server, base, undefined, true);
    const started = events.find((e: any) => e.type === 'battle_started') as any;
    assert.ok(started, 'engine battle ignited');
    assert.equal(started.live, false, 'kill switch ⇒ never live');
    await until(() => engine.requests.length > 0, 'allocate POST');
    assert.equal(engine.requests[0]!.body.mode, 'accelerated', 'kill switch wins over COMMAND intent');
  } finally {
    await server.stop();
    await engine.close();
  }
});

test('plain MARCH (command=false) ⇒ accelerated engine battle — no live match, no join grant', async () => {
  // Accelerated allocate returns no join grant (no hero-mode doorway).
  const engine = await mockEngine(201, { matchId: 'efm_auto_1' });
  const game = new Game(gameConfig({ seed: 'engine-auto-default' }));
  const server = new ClashServer({
    game, port: 0, tickMs: null, saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET },
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { attacker, events } = await stagePvp(game, server, base); // command defaults to false
    const started = events.find((e: any) => e.type === 'battle_started') as any;
    assert.ok(started, 'engine battle ignited');
    assert.equal(started.live, false, 'AUTO march ⇒ NOT a live battle');
    const battleId = started.battleId as string;
    await until(() => engine.requests.length > 0, 'allocate POST');
    assert.equal(engine.requests[0]!.body.mode, 'accelerated', 'default march allocates accelerated');
    await until(() => game.state.engineBattles!.get(battleId)!.status === 'ALLOCATED', 'allocated');
    const rec = game.state.engineBattles!.get(battleId)!;
    assert.equal(rec.mode, 'accelerated');
    assert.equal(rec.joins, undefined, 'accelerated battles carry no hero-mode doorway');
    // Owner view: no joinUrl on the accelerated battle.
    const lb = (await api(base, '/api/state', { token: attacker.token })).json.liveBattles.find((b: any) => b.id === battleId);
    assert.equal(lb?.joinUrl, undefined, 'no ⚡ doorway for an AUTO battle');
  } finally {
    await server.stop();
    await engine.close();
  }
});

test('COMMAND beyond the per-player slot cap ⇒ auto-resolve + march flags commandAtCapacity (§3a)', async () => {
  const engine = await mockEngine(201, { matchId: 'efm_cap_1' });
  // Cap of ONE command slot; pre-occupy it with an in-flight command battle.
  const game = new Game(gameConfig({ seed: 'engine-slot-cap', balancePath: balanceFileWith({ commandSlotsPerPlayer: 1 }) }));
  const server = new ClashServer({
    game, port: 0, tickMs: null, saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET },
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { events, march } = await stagePvp(game, server, base, (attacker) => {
      // The attacker is already commanding one live battle (slot full).
      game.state.engineBattles ??= new Map<string, EngineBattleState>();
      game.state.engineBattles.set('battle_00000000000000000000000000', {
        id: 'battle_00000000000000000000000000',
        seed: '0000000000000000',
        hexId: 'hex_not_a_real_parcel',
        attackerArmyIds: [], defenderArmyIds: [],
        attackerGovernorId: attacker.governorId,
        defenderGovernorId: 'gov_other',
        startedTick: 0,
        status: 'ALLOCATED',
        mode: 'live',
        commandGovernorIds: [attacker.governorId],
      });
    }, true);
    // March response flags the at-capacity downgrade for the UI toast.
    assert.equal(march.command, true);
    assert.equal(march.commandAtCapacity, true, 'march surfaces the at-capacity downgrade');
    const started = events.find((e: any) => e.type === 'battle_started') as any;
    assert.ok(started, 'engine battle ignited');
    assert.equal(started.live, false, 'over the slot cap ⇒ AUTO-resolve, not live');
    await until(() => engine.requests.length > 0, 'allocate POST');
    assert.equal(engine.requests[0]!.body.mode, 'accelerated', 'downgraded to accelerated at the slot cap');
  } finally {
    await server.stop();
    await engine.close();
  }
});

// ── engine-feed bind: the match server's auto-registered D2b feed attaches to the ──
//    EXISTING pending engine battle (one battle, one badge; end() is display-only). ──
test('engine feed bind: bridge start with a pending engine battleId attaches display-only (no dupe, no world mutation)', async () => {
  const engine = await mockEngine(201, {
    matchId: 'efm_feed_1',
    joinDeadline: '2026-07-03T00:00:00Z',
    tickHz: 30,
    ticket: 'tkt.feed',
    joinUrl: 'https://moba.example/play?net=server&match=efm_feed_1&ticket=tkt.feed',
  });
  const game = new Game(gameConfig());
  const server = new ClashServer({
    game, port: 0, tickMs: null, saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET },
    bridgeSecret: 'feed-secret',
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { attacker, t2, events } = await stagePvp(game, server, base);
    const battleId = events.find((e: any) => e.type === 'battle_started')!.battleId as string;
    await until(() => game.state.engineBattles!.get(battleId)!.status === 'ALLOCATED', 'allocated');
    const parcelId = game.parcelId(game.state.territories.get(t2)!.hexIds[0]!);

    // Unknown battleId ⇒ 404 (not a wild battle, not an engine battle).
    const bad = await api(base, '/bridge/battles/start', {
      body: { token: 'feed-secret', matchId: 'x', parcelId, battleId: 'battle_NOPE',
        attacker: { armyLabel: 'A', troops: 1 }, defender: { label: 'D', troops: 1 }, arena: { shape: 'square', size: 240 } },
    });
    assert.equal(bad.status, 404);

    // Correct battleId ⇒ binds as a display-only engine feed (200, exhibition:false).
    const ok = await api(base, '/bridge/battles/start', {
      body: { token: 'feed-secret', matchId: 'efm_feed_1', parcelId, battleId,
        attacker: { governorName: 'Attacker', armyLabel: '1st Expedition', troops: 200 },
        defender: { label: 'Garrison', troops: 200 }, arena: { shape: 'square', size: 240 } },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.battleId, battleId, 'feed rides the SAME battleId — one battle, one badge');
    assert.equal(ok.json.exhibition, false, 'consequence feed, not an exhibition');

    // A second registration of the same id is refused (no duplicate feed).
    const dupe = await api(base, '/bridge/battles/start', {
      body: { token: 'feed-secret', matchId: 'efm_feed_1', parcelId, battleId,
        attacker: { armyLabel: 'A', troops: 1 }, defender: { label: 'D', troops: 1 }, arena: { shape: 'square', size: 240 } },
    });
    assert.equal(dupe.status, 409);

    // Ending the RELAY does not settle the battle — the HMAC callback still owns it.
    const outcomeBefore = game.state.engineBattles!.get(battleId)!.outcome;
    assert.equal(outcomeBefore, undefined);
    await api(base, `/bridge/battles/${battleId}/end`, { body: { token: 'feed-secret', winner: 'A' } });
    server.tickOnce();
    assert.ok(game.state.engineBattles!.has(battleId), 'battle still pending after feed end — callback settles it, not the relay');
    void attacker;
  } finally {
    await server.stop();
    await engine.close();
  }
});

// ── Recently-resolved review ring (docs/04 §7b) ──────────────────────────────
test('review ring: engine-callback settlement records the fight in recentBattles (per-UnitClass casualties, fog, not live)', async () => {
  const engine = await mockEngine(201, { matchId: 'efm_rev_1' });
  const game = new Game(gameConfig({ seed: 'engine-review-ring' }));
  const server = new ClashServer({
    game, port: 0, tickMs: null, saveMs: null,
    battleEngine: { url: engine.url, token: API_TOKEN, hmacSecret: HMAC_SECRET },
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    // Plain MARCH (command=false) ⇒ accelerated engine battle.
    const { attacker, defender, atkArmyId, defArmyId, events } = await stagePvp(game, server, base);
    const battleId = events.find((e: any) => e.type === 'battle_started')!.battleId as string;
    // A stranger with zero intel on the parcel — used for the fog assertion.
    const stranger = (await api(base, '/api/join', { body: { name: 'Stranger' } })).json;
    await until(() => game.state.engineBattles!.get(battleId)!.status === 'ALLOCATED', 'allocated');

    // Callback: attacker wins, per-UnitClass casualties both sides (defender wiped).
    const callback = {
      v: 1,
      battleId,
      matchId: 'efm_rev_1',
      outcome: { winner: 'ATTACKER', reason: 'CORE_DESTROYED' },
      sides: {
        ATTACKER: { casualties: { INFANTRY: 30 }, survivors: {} },
        DEFENDER: { casualties: { INFANTRY: 100, ARCHER: 60, CAVALRY: 40 }, survivors: {} },
      },
      issuedAt: new Date().toISOString(),
      nonce: 'rev-nonce-1',
    };
    assert.equal((await postCallback(base, callback)).status, 200);
    // Not in the ring until the world tick settles it.
    assert.equal(game.recentBattlesFor(attacker.governorId).some((b) => b.battleId === battleId), false);
    server.tickOnce();

    const st = (await api(base, '/api/state', { token: attacker.token })).json;
    const rec = st.recentBattles.find((b: any) => b.battleId === battleId);
    assert.ok(rec, 'settled engine battle recorded in recentBattles');
    assert.equal(rec.winner, 'ATTACKER');
    assert.equal(rec.reason, 'CORE_DESTROYED', 'engine outcome reason carried through');
    assert.equal(rec.mine, true, 'attacker sees it as theirs');
    assert.equal(rec.wasLive, false, 'accelerated battle had no live telemetry');
    assert.equal(rec.resolutionMode, 'ACCELERATED');
    // Aggregate casualties reflect the per-UnitClass callback (30 attacker, 200 defender wiped).
    assert.equal(rec.casualties.attacker, 30);
    assert.equal(rec.casualties.defender, 200);
    assert.equal(rec.survivors.attacker, 170);
    assert.equal(rec.survivors.defender, 0);
    assert.ok(Array.isArray(rec.timeline) && rec.timeline.length >= 2, 'compact strength timeline present');
    assert.equal(rec.timeline[0].a, 200, 'timeline starts at full strength');
    assert.equal(rec.timeline[rec.timeline.length - 1].a, 170, 'timeline ends at survivors');
    // A resolved battle is NOT in liveBattleSummaries.
    assert.equal(st.liveBattles.some((b: any) => b.id === battleId), false, 'settled battle off the live list');
    // The defender participant also sees it; the fogged stranger does not.
    assert.ok(game.recentBattlesFor(defender.governorId).some((b) => b.battleId === battleId), 'defender sees the fight');
    assert.equal(
      game.recentBattlesFor(stranger.governorId).some((b) => b.battleId === battleId),
      false,
      'a viewer with no intel on the parcel never sees the battle',
    );
    void atkArmyId;
    void defArmyId;
  } finally {
    await server.stop();
    await engine.close();
  }
});
