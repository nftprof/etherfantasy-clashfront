/**
 * apps/server end-to-end tests (docs/briefs/MVP-JULY7.md item 3 §7):
 * boot on an ephemeral port → two players join → claim adjacent parcels →
 * raise → march into each other → battle resolves → choice applied → WS client
 * saw tick + battle events → snapshot save/load roundtrip preserves state.
 *
 * The server is constructed with `tickMs: null` and ticked by hand
 * (`server.tickOnce()`), so the whole run is deterministic — the only async
 * waits are WS message deliveries.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS } from '@clashfront/shared';
import type { DemoWorldFile } from '@clashfront/sim-engine';
import { ClashServer, Game, type GameConfig, HERO_NAMES, officerNamesForJoin, parseMasterNames } from '../src/index';

const CT = CONSTANTS.CT_UNITS_PER_CT;

function repoDataPath(file: string): string {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', 'data', file), // dist/test/
    join(__dirname, '..', '..', '..', 'data', file), // test/ (ts-node style)
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
    seed: 'server-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 5,
    startCtUnits: 2000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

interface ApiResponse {
  status: number;
  json: any;
  headers: Headers;
}

async function api(
  base: string,
  path: string,
  opts: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResponse> {
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text === '' ? undefined : JSON.parse(text), headers: res.headers };
}

async function until(cond: () => boolean, what: string, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ── Roster helpers ────────────────────────────────────────────────────────────

test('roster: masters parsed from the real CSV; join officer sets are 3 heroes + 5 masters', () => {
  assert.ok(MASTER_NAMES.length >= 15, `expected a healthy master roster, got ${MASTER_NAMES.length}`);
  assert.ok(MASTER_NAMES.includes('Maenak'));
  const first = officerNamesForJoin(0, MASTER_NAMES);
  assert.equal(first.length, 8);
  assert.deepEqual(first.slice(0, 3), [...HERO_NAMES]);
  for (const m of first.slice(3)) assert.ok(MASTER_NAMES.includes(m), `${m} not from the roster`);
  const second = officerNamesForJoin(1, MASTER_NAMES);
  assert.deepEqual(second.slice(0, 3), ['Irene 2', 'Kai 2', 'Leah 2']);
  assert.equal(new Set([...first, ...second]).size, 16, 'officer names must not collide across joins');
});

// ── The full playable loop over HTTP + WS ────────────────────────────────────

test('e2e: join → claim adjacent → raise → march into each other → battle → choice → WS saw it', async () => {
  const game = new Game(gameConfig({ npcEveryTicks: 0 })); // NPC off — this test isolates the PvP loop
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;

  try {
    // join two players
    const a = (await api(base, '/api/join', { body: { name: 'Alice' } })).json;
    const b = (await api(base, '/api/join', { body: { name: 'Bob' } })).json;
    assert.ok(a.token !== b.token && a.playerId.startsWith('player_') && a.governorId === a.playerId);
    assert.equal(a.officers.length, 8);
    assert.equal(a.officers[0].name, 'Irene');
    const badJoin = await api(base, '/api/join', { body: { name: '' } });
    assert.equal(badJoin.status, 400);
    assert.equal(badJoin.json.error.code, 'BAD_NAME');

    // world geometry + ETag caching
    const world = await api(base, '/api/world');
    assert.equal(world.status, 200);
    assert.equal(world.json.parcels.length, 648);
    assert.ok(world.json.parcels[0].territoryId.startsWith('terr_'));
    const etag = world.headers.get('etag')!;
    const cached = await api(base, '/api/world', { headers: { 'if-none-match': etag } });
    assert.equal(cached.status, 304);

    // pick two adjacent claimable parcels off the public state
    const state0 = (await api(base, '/api/state', { token: a.token })).json;
    assert.equal(state0.my.ctBalance, 2000 * CT);
    const terrByParcel = new Map<string, any>(state0.territories.map((t: any) => [t.parcelId, t]));
    const free = (pid: string): boolean => {
      const t = terrByParcel.get(pid);
      return t !== undefined && t.governorKind === 'SYSTEM' && t.garrison === undefined;
    };
    const pair = world.json.parcels.find((p: any) => free(p.id) && p.neighbors.some(free));
    assert.ok(pair, 'no adjacent free parcel pair in the demo world');
    const parcelA = pair.id as string;
    const parcelB = pair.neighbors.find(free) as string;
    const terrA = terrByParcel.get(parcelA)!.id as string;
    const terrB = terrByParcel.get(parcelB)!.id as string;

    // claim: auth required, double-claim rejected
    assert.equal((await api(base, '/api/claim', { body: { territoryId: terrA } })).status, 401);
    assert.equal((await api(base, '/api/claim', { token: a.token, body: { territoryId: terrA } })).status, 200);
    const dup = await api(base, '/api/claim', { token: b.token, body: { territoryId: terrA } });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.error.code, 'ALREADY_OWNED');
    assert.equal((await api(base, '/api/claim', { token: b.token, body: { territoryId: terrB } })).status, 200);

    // raise: ownership enforced, presets validated, wallets charged
    const raiseOnEnemy = await api(base, '/api/raise', { token: a.token, body: { territoryId: terrB, preset: 'STANDARD' } });
    assert.equal(raiseOnEnemy.status, 403);
    const badPreset = await api(base, '/api/raise', { token: a.token, body: { territoryId: terrA, preset: 'DOOMSTACK' } });
    assert.equal(badPreset.json.error.code, 'BAD_PRESET');
    const a1 = (await api(base, '/api/raise', { token: a.token, body: { territoryId: terrA, preset: 'STANDARD' } })).json;
    const a2 = (await api(base, '/api/raise', { token: a.token, body: { territoryId: terrA, preset: 'STANDARD' } })).json;
    const b1 = (await api(base, '/api/raise', { token: b.token, body: { territoryId: terrB, preset: 'STANDARD' } })).json;
    assert.ok(a1.army.heroName, 'auto-assigned officer should lead the army');
    assert.ok(a2.ctUnits < a1.ctUnits, 'raising must charge the wallet');

    // WS: bad token refused; good token gets hello
    const wsMsgs: any[] = [];
    const badWs = new WebSocket(`ws://127.0.0.1:${port}/ws?token=nope`);
    const badRefused = new Promise<void>((resolve) => {
      // undici's client fires 'error' on a refused handshake (and may skip 'close') — accept either.
      badWs.addEventListener('close', () => resolve());
      badWs.addEventListener('error', () => resolve());
    });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${a.token}`);
    ws.addEventListener('message', (e) => wsMsgs.push(JSON.parse(e.data as string)));
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('ws failed to open')));
    });
    await badRefused;
    assert.notEqual(badWs.readyState, badWs.OPEN, 'bad token must not yield an open socket');
    await until(() => wsMsgs.some((m) => m.t === 'hello'), 'ws hello');
    assert.equal(wsMsgs.find((m) => m.t === 'hello').playerId, a.playerId);

    // march both of Alice's armies into Bob's parcel (adjacent, 1 tick at travelTicksPerStep=1)
    const marchEnemyArmy = await api(base, '/api/march', { token: a.token, body: { armyId: b1.army.id, toTerritoryId: terrA } });
    assert.equal(marchEnemyArmy.status, 403);
    const m1 = (await api(base, '/api/march', { token: a.token, body: { armyId: a1.army.id, toTerritoryId: terrB } })).json;
    assert.equal(m1.etaTick, game.state.world.tick + 1);
    assert.deepEqual(m1.army.path, [parcelB]);
    assert.equal((await api(base, '/api/march', { token: a.token, body: { armyId: a2.army.id, toTerritoryId: terrB } })).status, 200);

    // tick → arrival + same-tick AUTO battle
    const r1 = server.tickOnce();
    assert.equal(r1.tick, 1);
    const battleEv = r1.events.find((e) => e.type === 'battle_resolved') as any;
    assert.ok(battleEv, `expected a battle, got events: ${r1.events.map((e) => e.type).join(',')}`);
    assert.equal(battleEv.parcelId, parcelB);
    assert.equal(battleEv.winner, 'ATTACKER');
    assert.deepEqual(battleEv.attackerGovernorIds, [a.governorId]);
    assert.deepEqual(battleEv.defenderGovernorIds, [b.governorId]);
    assert.ok(r1.events.some((e) => e.type === 'army_arrived' && (e as any).armyId === a1.army.id));
    const choiceEv = r1.events.find((e) => e.type === 'choice_pending') as any;
    assert.equal(choiceEv.governorId, a.governorId);
    assert.ok(r1.deltas.territories.length > 0 && r1.deltas.armies.length > 0 && r1.deltas.battles.length > 0);

    // the winner's choice: only Alice may spend it; OCCUPY flips the parcel
    const notYours = await api(base, '/api/choice', { token: b.token, body: { battleId: battleEv.battleId, action: 'OCCUPY' } });
    assert.equal(notYours.status, 403);
    const occupied = (await api(base, '/api/choice', { token: a.token, body: { battleId: battleEv.battleId, action: 'OCCUPY' } })).json;
    assert.equal(occupied.battle.territoryOutcome, 'OCCUPIED');
    assert.ok(occupied.battle.lootCt >= 0);

    const r2 = server.tickOnce(); // broadcasts the occupation event + territory delta
    assert.ok(r2.events.some((e) => e.type === 'territory_occupied' && (e as any).governorId === a.governorId));

    const stateA = (await api(base, '/api/state', { token: a.token })).json;
    const flipped = stateA.territories.find((t: any) => t.id === terrB);
    assert.equal(flipped.governorId, a.governorId);
    assert.deepEqual(stateA.my.territoryIds.sort(), [terrA, terrB].sort());
    assert.ok(stateA.players.some((p: any) => p.governorId === a.governorId && p.color));

    // Bob's evicted overseer is freed again (sim-engine occupation fix)
    const stateB = (await api(base, '/api/state', { token: b.token })).json;
    assert.equal(stateB.my.territoryIds.length, 0);
    assert.ok(
      stateB.my.officers.every((o: any) => o.assignedTerritoryId === undefined),
      'losing a territory must free its overseer',
    );

    // WS client saw the whole story
    await until(() => wsMsgs.filter((m) => m.t === 'tick').length >= 2, 'two tick broadcasts');
    const tickMsgs = wsMsgs.filter((m) => m.t === 'tick');
    assert.deepEqual(tickMsgs.map((m) => m.tick), [1, 2]);
    const allEvents = tickMsgs.flatMap((m) => m.events.map((e: any) => e.type));
    for (const expected of ['army_arrived', 'battle_resolved', 'choice_pending', 'territory_occupied']) {
      assert.ok(allEvents.includes(expected), `WS client missed ${expected} (saw: ${allEvents.join(',')})`);
    }
    ws.close();
  } finally {
    await server.stop();
  }
});

// ── NPC kingdom AI ────────────────────────────────────────────────────────────

test('NPC kingdom: seeded at boot on a cluster edge, expands deterministically every N ticks', () => {
  const g1 = new Game(gameConfig());
  const g2 = new Game(gameConfig());
  assert.ok(g1.npcGovernorId.startsWith('npc_'));
  const home = [...g1.state.territories.values()].filter((t) => t.governorId === g1.npcGovernorId);
  assert.equal(home.length, 1, 'NPC starts with exactly one claimed parcel');
  assert.equal(home[0]!.governorKind, 'NPC_KINGDOM');

  const events1: string[] = [];
  const events2: string[] = [];
  for (let i = 0; i < 5; i++) {
    events1.push(...g1.tick().events.map((e) => e.type));
    events2.push(...g2.tick().events.map((e) => e.type));
  }
  assert.ok(events1.includes('npc_expand'), `NPC must act at tick 5 (saw: ${events1.join(',')})`);
  assert.deepEqual(events1, events2, 'NPC behavior must be deterministic from seed + tick');
  assert.deepStrictEqual(g1.state, g2.state, 'two same-seed worlds must stay bit-identical');

  const npcArmies = [...g1.state.armies.values()].filter(
    (a) => a.ownerGovernorId === g1.npcGovernorId && a.state !== 'DISBANDED',
  );
  assert.equal(npcArmies.length, 1);
  assert.equal(npcArmies[0]!.state, 'MARCHING', 'the raised army must be marching at wild land');
  // it pays from the same wallet mechanics as players — no special powers
  assert.ok(g1.state.ctBalances!.get(g1.npcGovernorId)! < 20_000 * CT);
});

// ── Snapshot persistence ──────────────────────────────────────────────────────

test('snapshot save/load roundtrip preserves world, sessions, and future determinism', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clashfront-save-'));
  const savePath = join(dir, 'save.json');

  const g1 = new Game(gameConfig({ savePath }));
  const joined = g1.join('Zed');
  const firstFree = [...g1.state.territories.keys()]
    .sort()
    .find((id) => {
      const t = g1.state.territories.get(id)!;
      return t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined;
    })!;
  g1.claim(joined.governorId, firstFree);
  g1.raise(joined.governorId, firstFree, 'STANDARD');
  for (let i = 0; i < 3; i++) g1.tick();
  g1.saveToDisk();

  // fresh process boots from the snapshot
  const g2 = new Game(gameConfig({ savePath }));
  assert.deepStrictEqual(g2.state, g1.state, 'reloaded world state must be identical');
  assert.equal(g2.npcGovernorId, g1.npcGovernorId);
  const s2 = g2.sessionByToken(joined.token);
  assert.ok(s2 !== undefined && s2.governorId === joined.governorId, 'session tokens survive the reload');
  assert.deepEqual([...g2.governors.keys()].sort(), [...g1.governors.keys()].sort());

  // and both worlds keep evolving identically (order-seq + rng-fork persistence)
  for (let i = 0; i < 3; i++) {
    const r1 = g1.tick();
    const r2 = g2.tick();
    assert.deepEqual(r2.events, r1.events);
  }
  assert.deepStrictEqual(g2.state, g1.state, 'post-reload ticks must stay bit-identical');

  // a snapshot from a different seed is refused (fresh genesis instead of a mixed world)
  const g3 = new Game(gameConfig({ savePath, seed: 'other-seed' }));
  assert.equal(g3.state.world.tick, 0, 'foreign-seed snapshot must not be loaded');
  assert.equal(g3.sessions.size, 0);
});
