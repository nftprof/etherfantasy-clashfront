/**
 * Masters roster gate (docs/09 §7) — a governor commands ONLY the Masters their
 * PG wallet owns/rents, pulled live from the EF Masters API. The API is mocked
 * via the injectable `mastersFetch` (NO real network); PG login is mocked via
 * `pgFetch` exactly as in pgLogin.test.ts.
 *
 * Covered:
 *   - derivePgIdentity surfaces the wallet from `mm_address`
 *   - wallet with 2 masters ⇒ officer pool = those 2 (carry masterId/slug/source)
 *   - API unreachable / non-200 ⇒ demo-roster fallback, login still succeeds
 *   - empty master list ⇒ playability fallback (demo roster kept), logged
 *   - re-login refresh: added master appears; removed FREE master gone; removed
 *     BUSY master retained (until idle)
 *   - allocate context carries the REAL masterId + slug for an owned-master officer
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS, type Army } from '@clashfront/shared';
import type { DemoWorldFile, EngineBattleState } from '@clashfront/sim-engine';
import {
  ClashServer,
  derivePgIdentity,
  Game,
  type GameConfig,
  type OwnedMaster,
  parseMasterNames,
  type ServerConfig,
} from '../src/index';

const CT = CONSTANTS.CT_UNITS_PER_CT;

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
    seed: 'masters-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 2000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

/** PG user objects keyed by access token; each carries an mm_address wallet. */
const PG_USERS: Record<string, Record<string, unknown>> = {
  'tok-alice': { id: 100, username: 'Alice', email: 'alice@x.com', mm_address: '0xAAA' },
  'tok-bob': { id: 200, username: 'Bob', email: 'bob@x.com', mm_address: '0xBBB' },
  'tok-nowallet': { id: 300, username: 'NoWallet', email: 'nw@x.com' }, // no mm_address
};

function mockPgFetch(): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = (headers['authorization'] ?? '').replace(/^Bearer /, '');
    const user = PG_USERS[token];
    if (user === undefined) return new Response(JSON.stringify({ status: false }), { status: 401 });
    return new Response(JSON.stringify({ status: true, result: user }), { status: 200 });
  }) as typeof fetch;
}

/** Masters API mock reading a MUTABLE per-wallet roster map (re-login refresh). */
function mockMastersFetch(rosters: Record<string, OwnedMaster[]>): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    const m = /\/masters\/active\/([^/?]+)/.exec(url);
    const wallet = m ? decodeURIComponent(m[1]!) : '';
    const roster = rosters[wallet];
    if (roster === undefined) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ wallet, masters: roster }), { status: 200 });
  }) as typeof fetch;
}

async function withServer(
  cfg: Partial<ServerConfig>,
  fn: (base: string, server: ClashServer, game: Game) => Promise<void>,
  game = new Game(gameConfig()),
): Promise<void> {
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null, ...cfg });
  const port = await server.start();
  try {
    await fn(`http://127.0.0.1:${port}`, server, game);
  } finally {
    await server.stop();
  }
}

async function post(base: string, path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const PG_CFG = { pgAppKey: 'pk_test', pgApiUrl: 'https://pg.mock.invalid', pgFetch: mockPgFetch() };

test('derivePgIdentity: surfaces wallet from mm_address (omitted when absent)', () => {
  assert.deepEqual(derivePgIdentity({ id: 1, username: 'u', mm_address: '0xDeAd' }), {
    pgUid: '1',
    displayName: 'u',
    wallet: '0xDeAd',
  });
  // No mm_address ⇒ no wallet key (feature stays off, demo roster).
  assert.deepEqual(derivePgIdentity({ id: 2, username: 'u2' }), { pgUid: '2', displayName: 'u2' });
});

test('roster gate: wallet with 2 masters ⇒ officer pool = exactly those masters', async () => {
  const rosters: Record<string, OwnedMaster[]> = {
    '0xAAA': [
      { masterId: 3001, name: 'Choco', slug: 'choco', source: 'rented', koUntil: null, joinChance: 28, rentalExpires: '2026-07-31T00:00:00.000Z' },
      { masterId: 3002, name: 'Maple', slug: 'maple', source: 'owned', koUntil: null, joinChance: 50 },
    ],
  };
  await withServer({ ...PG_CFG, mastersFetch: mockMastersFetch(rosters) }, async (base) => {
    const res = await post(base, '/api/login-pg', { access_token: 'tok-alice' });
    assert.equal(res.status, 200);
    const officers = res.json.officers as any[];
    assert.equal(officers.length, 2, 'exactly the owned Masters, not the 8-officer demo roster');
    const byId = new Map(officers.map((o) => [o.masterId, o]));
    assert.equal(byId.get(3001).name, 'Choco');
    assert.equal(byId.get(3001).slug, 'choco');
    assert.equal(byId.get(3001).source, 'rented');
    assert.equal(byId.get(3002).slug, 'maple');
    assert.equal(byId.get(3002).source, 'owned');
    // Every officer carries a real masterId (none are demo).
    assert.ok(officers.every((o) => typeof o.masterId === 'number'));
  });
});

test('roster gate: API unreachable ⇒ demo-roster fallback, login still succeeds', async () => {
  const down: typeof fetch = (async () => {
    throw new TypeError('masters api down');
  }) as typeof fetch;
  await withServer({ ...PG_CFG, mastersFetch: down }, async (base) => {
    const res = await post(base, '/api/login-pg', { access_token: 'tok-alice' });
    assert.equal(res.status, 200, 'login never bricks on a Masters API hiccup');
    const officers = res.json.officers as any[];
    assert.equal(officers.length, 8, 'demo roster (3 heroes + 5 masters)');
    assert.ok(officers.every((o) => o.masterId === undefined), 'demo officers carry no masterId');
  });
});

test('roster gate: empty master list ⇒ playability fallback (demo roster), logged', async () => {
  const rosters: Record<string, OwnedMaster[]> = { '0xAAA': [] };
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.join(' ')); };
  try {
    await withServer({ ...PG_CFG, mastersFetch: mockMastersFetch(rosters) }, async (base) => {
      const res = await post(base, '/api/login-pg', { access_token: 'tok-alice' });
      assert.equal(res.status, 200);
      const officers = res.json.officers as any[];
      assert.ok(officers.length > 0, 'never zero officers');
      assert.ok(officers.every((o) => o.masterId === undefined), 'demo roster kept');
    });
  } finally {
    console.log = orig;
  }
  assert.ok(logs.some((l) => l.includes('[masters]') && l.includes('owns no Masters')), 'empty-roster fallback logged');
});

test('roster gate: no wallet ⇒ masters never fetched, demo roster', async () => {
  let fetched = false;
  const spy: typeof fetch = (async () => { fetched = true; return new Response('{}', { status: 200 }); }) as typeof fetch;
  await withServer({ ...PG_CFG, mastersFetch: spy }, async (base) => {
    const res = await post(base, '/api/login-pg', { access_token: 'tok-nowallet' });
    assert.equal(res.status, 200);
    assert.equal((res.json.officers as any[]).length, 8, 'demo roster');
  });
  assert.equal(fetched, false, 'no wallet ⇒ Masters API never called');
});

test('roster gate: re-login refresh — add appears, removed FREE gone, removed BUSY retained', async () => {
  const rosters: Record<string, OwnedMaster[]> = {
    '0xAAA': [ { masterId: 3001, name: 'Choco', slug: 'choco' }, { masterId: 3002, name: 'Maple', slug: 'maple' } ],
    '0xBBB': [ { masterId: 4001, name: 'Purin', slug: 'purin' }, { masterId: 4002, name: 'Blis', slug: 'blis' } ],
  };
  await withServer({ ...PG_CFG, mastersFetch: mockMastersFetch(rosters) }, async (base, _server, game) => {
    // ── Alice: FREE eviction + addition ──
    const first = await post(base, '/api/login-pg', { access_token: 'tok-alice' });
    assert.deepEqual(new Set((first.json.officers as any[]).map((o) => o.masterId)), new Set([3001, 3002]));
    // Master 3002 leaves the wallet, 3003 arrives (a new mint/rental); 3001/3002 both FREE.
    rosters['0xAAA'] = [ { masterId: 3001, name: 'Choco', slug: 'choco' }, { masterId: 3003, name: 'Amy', slug: 'amy' } ];
    const second = await post(base, '/api/login-pg', { access_token: 'tok-alice' }); // same pgUid ⇒ resume + re-sync
    assert.equal(second.json.governorId, first.json.governorId, 'resume, not a new governor');
    assert.deepEqual(
      new Set((second.json.officers as any[]).map((o) => o.masterId)),
      new Set([3001, 3003]),
      'added 3003, dropped FREE 3002, kept 3001',
    );

    // ── Bob: BUSY retention ──
    const bob1 = await post(base, '/api/login-pg', { access_token: 'tok-bob' });
    const bobGov = bob1.json.governorId as string;
    // Make Master 4002 BUSY (overseeing a territory) so it can't be yanked.
    const busy = game.state.officers!.get(bobGov)!.find((o) => o.masterId === 4002)!;
    busy.assignedTerritoryId = 'terr_busy';
    // 4002 leaves the wallet while busy.
    rosters['0xBBB'] = [ { masterId: 4001, name: 'Purin', slug: 'purin' } ];
    const bob2 = await post(base, '/api/login-pg', { access_token: 'tok-bob' });
    const ids = new Set((bob2.json.officers as any[]).map((o) => o.masterId));
    assert.ok(ids.has(4001), 'still-owned master kept');
    assert.ok(ids.has(4002), 'BUSY no-longer-owned master retained until idle');
    assert.equal((bob2.json.officers as any[]).find((o: any) => o.masterId === 4002).assignedTerritoryId, 'terr_busy');
  });
});

test('allocate context carries the REAL masterId + slug for an owned-master officer', () => {
  const game = new Game(gameConfig());
  const owned: OwnedMaster[] = [
    { masterId: 3001, name: 'Choco', slug: 'choco', source: 'rented', koUntil: null, joinChance: 28 },
  ];
  const { governorId } = game.loginPg('u-choco', 'Alice', undefined, owned);
  const officer = game.state.officers!.get(governorId)!.find((o) => o.masterId === 3001)!;
  assert.ok(officer, 'owned master became an officer');

  // Minimal engine battle led by the owned-master officer (server-boundary state).
  const hexId = [...game.state.hexes.keys()][0]!;
  const atkArmy = {
    id: 'army_TEST00000000000000000001',
    ownerGovernorId: governorId,
    heroId: officer.id,
    state: 'MARCHING',
    hexId,
    units: [{ unitClass: 'INFANTRY', count: 100 }],
    provisions: { food: 20, gold: 0, wood: 0 },
  } as unknown as Army;
  game.state.armies.set(atkArmy.id, atkArmy);
  const battleId = 'battle_TEST0000000000000000001';
  const battle: EngineBattleState = {
    id: battleId,
    seed: '0123456789abcdef',
    hexId,
    attackerArmyIds: [atkArmy.id],
    defenderArmyIds: [],
    attackerGovernorId: governorId,
    defenderGovernorId: 'sys_wild',
    startedTick: 0,
    status: 'ALLOCATING',
  };
  game.state.engineBattles ??= new Map();
  game.state.engineBattles.set(battleId, battle);

  const ctx = game.engineAllocateContext(battleId, 'http://cb/internal/battle-result') as any;
  const officersOut = ctx.sides.ATTACKER.armies[0].officers;
  assert.deepEqual(officersOut, [{ masterId: 3001, name: 'Choco', slug: 'choco', level: 2, revives: 3 }]);
});
