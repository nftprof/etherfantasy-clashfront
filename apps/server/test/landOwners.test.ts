/**
 * Maps ownership feed (docs/maps/ECONOMY-SEAM.md §1): GET /api/land-owners returns
 * { owners: { parcelId: pgUsername } } for PLAYER-owned parcels whose controller
 * has a known PG username. The reported identity is the canonical PG username —
 * NOT the empire name, which differs when a PG account adopts a legacy empire.
 * Wild/system land and name-only (non-PG) players are absent → stay designable.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS } from '@clashfront/shared';
import type { DemoWorldFile } from '@clashfront/sim-engine';
import { ClashServer, Game, type GameConfig, parseMasterNames, type ServerConfig } from '../src/index';

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
    seed: 'landowners-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 2000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

function mockPgFetch(users: Record<string, Record<string, unknown>>): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = (headers['authorization'] ?? '').replace(/^Bearer /, '');
    const user = users[token];
    if (user === undefined) return new Response(JSON.stringify({ status: false }), { status: 401 });
    return new Response(JSON.stringify({ status: true, result: user }), { status: 200 });
  }) as typeof fetch;
}

async function withServer(
  cfg: Partial<ServerConfig>,
  game: Game,
  fn: (base: string, game: Game) => Promise<void>,
): Promise<void> {
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null, ...cfg });
  const port = await server.start();
  try {
    await fn(`http://127.0.0.1:${port}`, game);
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

/** Force a territory under a governor's control (bypasses claim mechanics for a focused feed test). */
function grantTerritory(game: Game, governorId: string): string {
  const terr = [...game.state.territories.values()].find((t) => t.governorKind === 'SYSTEM');
  assert.ok(terr, 'a SYSTEM territory to grant');
  terr.governorId = governorId;
  terr.governorKind = 'PLAYER';
  return game.parcelId(terr.hexIds[0]!);
}

const PG_USERS: Record<string, Record<string, unknown>> = {
  // pns_name 'Idon' is the canonical PG username; the legacy empire is named 'idon' (lowercase).
  'tok-idon': { id: 4242, pns_name: 'Idon', username: 'idon_pg', email: 'idon.cgg@gmail.com' },
};

test('land-owners feed: PG username (not empire name) for PLAYER parcels; wild & name-only absent', async () => {
  const cfg: Partial<ServerConfig> = {
    pgAppKey: 'pk_test_x',
    pgApiUrl: 'https://pg.mock.invalid',
    pgFetch: mockPgFetch(PG_USERS),
  };

  await withServer(cfg, new Game(gameConfig()), async (base, game) => {
    // Empty world → empty feed (well-formed, not an error).
    const empty = await fetch(`${base}/api/land-owners`).then((r) => r.json());
    assert.deepEqual(empty, { owners: {} });

    // A pre-PG banner 'idon' (dev name login), then the PG account adopts it.
    const legacy = await post(base, '/api/join', { name: 'idon' });
    const pg = await post(base, '/api/login-pg', { access_token: 'tok-idon' });
    assert.equal(pg.json.governorId, legacy.json.governorId, 'PG adopts the same-name legacy empire');
    assert.equal(game.governors.get(pg.json.governorId)?.name, 'idon', 'empire name stays lowercase');

    // A separate name-only player (no PG identity).
    const dev = await post(base, '/api/join', { name: 'DevGuy' });

    // Grant each a parcel; leave the rest wild.
    const idonParcel = grantTerritory(game, pg.json.governorId);
    const devParcel = grantTerritory(game, dev.json.governorId);

    const feed = (await fetch(`${base}/api/land-owners`).then((r) => r.json())) as { owners: Record<string, string> };
    // PG owner reported by CANONICAL PG USERNAME 'Idon', not the empire name 'idon'.
    assert.equal(feed.owners[idonParcel], 'Idon');
    // Name-only player is NOT in the feed (no PG username → parcel stays designable).
    assert.equal(feed.owners[devParcel], undefined);
    // Only the one PG-owned parcel is listed (wild land omitted).
    assert.deepEqual(Object.keys(feed.owners), [idonParcel]);
  });
});
