/**
 * Pentagon Games identity login (docs/briefs/PG-IDENTITY.md):
 * POST /api/login-pg verifies the presented access token server-side against
 * GET {PG_API_URL}/user/info (mocked here via the injectable pgFetch) and maps
 * the verified pgUid to a governor — resume / adopt / create — with the binding
 * persisted in the save. PG disabled (no app key) keeps the dev name-only login.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS } from '@clashfront/shared';
import type { DemoWorldFile } from '@clashfront/sim-engine';
import { ClashServer, Game, type GameConfig, derivePgIdentity, parseMasterNames, type ServerConfig } from '../src/index';

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
    seed: 'pg-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 2000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

/**
 * Mock PG identity API: token → /user/info user object. Unknown token = 401
 * (PG has no dedicated verify endpoint — non-200 from /user/info means invalid).
 */
function mockPgFetch(users: Record<string, Record<string, unknown>>): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = (headers['authorization'] ?? '').replace(/^Bearer /, '');
    const user = users[token];
    if (user === undefined) {
      return new Response(JSON.stringify({ status: false, message: 'invalid token' }), { status: 401 });
    }
    return new Response(JSON.stringify({ status: true, result: user }), { status: 200 });
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

const PG_USERS: Record<string, Record<string, unknown>> = {
  'tok-idon': { id: 4242, pns_name: 'Idon', username: 'idon_pg', email: 'idon.cgg@gmail.com' },
  'tok-mallory': { id: 6666, username: 'Idon', email: 'mallory@example.com' }, // same display name, DIFFERENT account
  'tok-emailonly': { user_id: 'u-77', email: 'ada.lovelace@example.com' },
};

test('derivePgIdentity: PNS name → username → email local-part; id/user_id/uid + wrapped payloads', () => {
  assert.deepEqual(derivePgIdentity({ id: 1, pns_name: 'Pns', username: 'user', email: 'e@x.com' }), {
    pgUid: '1',
    displayName: 'Pns',
  });
  assert.deepEqual(derivePgIdentity({ result: { user_id: 'u-9', username: 'user', email: 'e@x.com' } }), {
    pgUid: 'u-9',
    displayName: 'user',
  });
  assert.deepEqual(derivePgIdentity({ uid: 7, email: 'ada.lovelace@example.com' }), {
    pgUid: '7',
    displayName: 'ada.lovelace',
  });
  assert.deepEqual(derivePgIdentity('garbage'), { displayName: '' });
});

test('pg login: disabled without PG_APP_KEY — 503, meta says so, name login untouched', async () => {
  await withServer({}, async (base) => {
    const world = (await fetch(`${base}/api/world`).then((r) => r.json())) as any;
    assert.equal(world.meta.pgEnabled, false);
    assert.equal(world.meta.pgAppKey, undefined, 'no key leaks when disabled');
    const denied = await post(base, '/api/login-pg', { access_token: 'tok-idon' });
    assert.equal(denied.status, 503);
    assert.equal(denied.json.error.code, 'PG_DISABLED');
    const joined = await post(base, '/api/join', { name: 'DevPlayer' });
    assert.equal(joined.status, 200);
    assert.ok(joined.json.token);
  });
});

test('pg login: create → resume → adoption → adopted never re-adoptable → 401/502/400', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-pg-'));
  const savePath = join(dir, 'save.json');
  const cfg: Partial<ServerConfig> = {
    pgAppKey: 'pk_test_x',
    pgApiUrl: 'https://pg.mock.invalid',
    pgFetch: mockPgFetch(PG_USERS),
  };
  let idonGovernorId = '';

  await withServer(
    cfg,
    async (base, _server, game) => {
      // /api/world meta advertises the publishable surface when enabled.
      const world = (await fetch(`${base}/api/world`).then((r) => r.json())) as any;
      assert.equal(world.meta.pgEnabled, true);
      assert.equal(world.meta.pgApiUrl, 'https://pg.mock.invalid');
      assert.equal(world.meta.pgAppKey, 'pk_test_x');

      // A pre-PG banner exists (dev name login) — the owner's governor to reclaim.
      const legacy = await post(base, '/api/join', { name: 'idon' }); // case differs from the PNS name
      assert.equal(legacy.status, 200);

      // ADOPTION: first PG login with PNS 'Idon' adopts the unbound same-name governor.
      const first = await post(base, '/api/login-pg', { access_token: 'tok-idon' });
      assert.equal(first.status, 200);
      assert.equal(first.json.governorId, legacy.json.governorId, 'adopts the richest unbound same-name governor');
      assert.notEqual(first.json.token, legacy.json.token, 'fresh cf token per login');
      idonGovernorId = first.json.governorId;

      // RESUME: same pgUid again → same governor, another fresh token.
      const again = await post(base, '/api/login-pg', { access_token: 'tok-idon' });
      assert.equal(again.json.governorId, idonGovernorId);
      assert.notEqual(again.json.token, first.json.token);

      // NEVER RE-ADOPTABLE: a different pgUid with the same display name gets a NEW
      // governor (numeric-suffix collision handling), not the adopted one.
      const mallory = await post(base, '/api/login-pg', { access_token: 'tok-mallory' });
      assert.equal(mallory.status, 200);
      assert.notEqual(mallory.json.governorId, idonGovernorId, 'bound governor must not be re-adopted');
      const malloryName = game.governors.get(mallory.json.governorId)?.name ?? '';
      assert.match(malloryName, /^Idon \d+$/, `collision suffix expected, got '${malloryName}'`);

      // CREATE from email local-part when no PNS/username.
      const email = await post(base, '/api/login-pg', { access_token: 'tok-emailonly' });
      assert.equal(email.status, 200);
      assert.equal(game.governors.get(email.json.governorId)?.name, 'ada.lovelace');

      // Invalid token → 401; missing token → 400.
      const bad = await post(base, '/api/login-pg', { access_token: 'tok-wrong' });
      assert.equal(bad.status, 401);
      assert.equal(bad.json.error.code, 'PG_TOKEN_INVALID');
      const empty = await post(base, '/api/login-pg', {});
      assert.equal(empty.status, 400);
      assert.equal(empty.json.error.code, 'BAD_TOKEN');

      game.saveToDisk();
    },
    new Game(gameConfig({ savePath })),
  );

  // PERSISTENCE: bindings survive a full save→reload; same pgUid resumes the SAME governor.
  await withServer(
    cfg,
    async (base, _server, game) => {
      assert.equal(game.pgBindings.get('4242'), idonGovernorId, 'binding reloaded from the save');
      const resumed = await post(base, '/api/login-pg', { access_token: 'tok-idon' });
      assert.equal(resumed.json.governorId, idonGovernorId);
    },
    new Game(gameConfig({ savePath })),
  );

  // PG DOWN (network failure) → 502 PG_UNAVAILABLE, never a fresh governor.
  const down: typeof fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  await withServer({ ...cfg, pgFetch: down }, async (base) => {
    const res = await post(base, '/api/login-pg', { access_token: 'tok-idon' });
    assert.equal(res.status, 502);
    assert.equal(res.json.error.code, 'PG_UNAVAILABLE');
  });
});
