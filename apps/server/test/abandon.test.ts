/**
 * /api/abandon over HTTP (product owner 2026-07-03: "allow master to abandon
 * land to free up"): auth + ownership guards, the happy path (land reverts to
 * SYSTEM, the overseer returns to the free pool, no refund), the PUBLIC
 * territory_abandoned event (visible even to governors with no intel on the
 * parcel), re-claimability by another governor over the same API, and the 409
 * BATTLE_RAGING lock while a pending engine battle sits on the parcel.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { type Army, CONSTANTS, createRng, loadBalance } from '@clashfront/shared';
import { createEngineBattle, type DemoWorldFile } from '@clashfront/sim-engine';
import { ClashServer, Game, type GameConfig, parseMasterNames } from '../src/index';

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
    seed: 'abandon-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 20_000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

function claimableIds(game: Game): string[] {
  return [...game.state.territories.keys()].sort().filter((id) => {
    const t = game.state.territories.get(id)!;
    return t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined && t.zoneType !== 'TOWN';
  });
}

async function api(
  base: string,
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text === '' ? undefined : JSON.parse(text) };
}

test('/api/abandon: guards, overseer freed, no refund, public event, re-claim, battle lock', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const alice = (await api(base, '/api/join', { body: { name: 'Alice' } })).json;
    const bob = (await api(base, '/api/join', { body: { name: 'Bob' } })).json;
    const home = claimableIds(game)[0]!;
    game.claim(alice.governorId, home);

    // Guards: auth, unknown territory, someone else's land.
    assert.equal((await api(base, '/api/abandon', { body: { territoryId: home } })).status, 401);
    assert.equal((await api(base, '/api/abandon', { token: alice.token, body: { territoryId: 'terr_nope' } })).status, 404);
    const foreign = await api(base, '/api/abandon', { token: bob.token, body: { territoryId: home } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.json.error.code, 'NOT_YOUR_TERRITORY');

    // Battle lock: a PENDING ENGINE BATTLE on the parcel refuses the abandon.
    const t = game.state.territories.get(home)!;
    const fakeSide = (id: string, gov: string) => ({ id, ownerGovernorId: gov }) as Army;
    const battle = createEngineBattle(
      game.state, t.hexIds[0]!,
      [fakeSide('army_atk', bob.governorId)], [fakeSide('army_def', alice.governorId)],
      alice.governorId, game.state.world.tick, createRng('eb'), loadBalance(), false,
    );
    const raging = await api(base, '/api/abandon', { token: alice.token, body: { territoryId: home } });
    assert.equal(raging.status, 409);
    assert.equal(raging.json.error.code, 'BATTLE_RAGING');
    game.state.engineBattles!.delete(battle.id);

    // Happy path: land reverts to SYSTEM, overseer freed, wallet untouched.
    const wallet0 = game.state.ctBalances!.get(alice.governorId)!;
    const overseer0 = t.overseerId!;
    const ok = await api(base, '/api/abandon', { token: alice.token, body: { territoryId: home } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.territory.governorKind, 'SYSTEM');
    assert.equal(ok.json.territory.overseerId, undefined);
    assert.equal(ok.json.ctUnits, wallet0, 'no refund');
    const officers = game.myState(alice.governorId).officers;
    assert.ok(officers.every((o) => o.assignedTerritoryId === undefined), 'the overseer Master is free again');
    assert.ok(officers.some((o) => o.id === overseer0));

    // The event is PUBLIC: Bob (no intel on that parcel) still receives it.
    const events = game.tick().events.filter((e) => e.type === 'territory_abandoned') as any[];
    assert.equal(events.length, 1);
    assert.equal(events[0].territoryId, home);
    assert.equal(events[0].governorId, alice.governorId);
    const forBob = game.eventsFor(bob.governorId, events);
    assert.equal(forBob.length, 1, 'ownership changes are public intel');

    // Freed land is claimable by another governor over the same API.
    const claimed = await api(base, '/api/claim', { token: bob.token, body: { territoryId: home } });
    assert.equal(claimed.status, 200);
    assert.equal(claimed.json.territory.governorId, bob.governorId);
    // …and now Alice's abandon of Bob's parcel is refused again.
    assert.equal((await api(base, '/api/abandon', { token: alice.token, body: { territoryId: home } })).status, 403);
  } finally {
    await server.stop();
  }
});
