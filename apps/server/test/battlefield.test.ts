/**
 * Battlefield-JSON stand-in tests (docs/briefs/BATTLEFIELD-SCHEMA.md + §1a):
 *  - the interim stand-in maps (data/moba-maps/*.json) parse and pass all five
 *    playability invariants,
 *  - the loader returns real MOBA-style layouts (lanes + structures),
 *  - the command-view battle_hello payload carries a `battlefield` object so the
 *    top-down view can render exactly the map the 3D match plays on.
 *
 * tickMs: null — world ticks driven by hand.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS } from '@clashfront/shared';
import type { DemoWorldFile } from '@clashfront/sim-engine';
import {
  type Battlefield,
  ClashServer,
  Game,
  type GameConfig,
  loadStandbyBattlefield,
  parseMasterNames,
  validateBattlefield,
} from '../src/index';

const CT = CONSTANTS.CT_UNITS_PER_CT;
const SECRET = 'test-bridge-secret';

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
    seed: 'battlefield-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 2000 * CT,
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

async function openWs(port: number, token: string): Promise<{ ws: WebSocket; msgs: any[] }> {
  const msgs: any[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  ws.addEventListener('message', (e) => msgs.push(JSON.parse(e.data as string)));
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('ws failed to open')));
  });
  return { ws, msgs };
}

/** A battlefield must be a symmetric competitive layout with cores for both sides. */
function assertCompetitiveLayout(bf: Battlefield, label: string): void {
  assert.ok((bf.lanes?.length ?? 0) >= 1, `${label}: has at least one lane`);
  const cores = (bf.structures ?? []).filter((s) => s.kind === 'CORE');
  assert.ok(cores.some((s) => s.side === 'ATTACKER'), `${label}: attacker CORE present`);
  assert.ok(cores.some((s) => s.side === 'DEFENDER'), `${label}: defender CORE present`);
  assert.ok((bf.structures ?? []).some((s) => s.kind === 'TOWER'), `${label}: has towers`);
  assert.ok((bf.spawnZones?.length ?? 0) >= 2, `${label}: both spawn zones present`);
}

// ── the stand-in map files ───────────────────────────────────────────────────

for (const file of ['legacy-3lane.json', 'legacy-1lane.json']) {
  test(`battlefield: ${file} parses + passes all 5 playability invariants`, () => {
    const path = join(repoDataPath('moba-maps'), file);
    const bf = JSON.parse(readFileSync(path, 'utf8')) as Battlefield;
    const res = validateBattlefield(bf);
    assert.deepEqual(res.errors, [], `${file} invariants: ${res.errors.join('; ')}`);
    assert.ok(res.ok);
    // FIXED standard MOBA arena: ±161 m half-edge (sizeM 322) for every battle.
    assert.equal(bf.arena.sizeM, 322, 'standard arena is 322 m (±161) per the client frame');
    assert.equal(bf.meta?.sizeM, 322, 'meta.sizeM agrees with the arena');
    // Cores sit at the client known-good ±114.8, well inside ±161.
    for (const core of (bf.structures ?? []).filter((s) => s.kind === 'CORE')) {
      assert.ok(Math.abs(core.x) <= 161 && Math.abs(core.z) <= 161, `${file}: CORE ${core.anchorId} inside ±161`);
      assert.ok(
        Math.max(Math.abs(core.x), Math.abs(core.z)) > 100,
        `${file}: CORE ${core.anchorId} near its base edge (~114.8)`,
      );
    }
    assert.ok(typeof bf._placeholder === 'string' && bf._placeholder.length > 0, 'marked as a stand-in');
    assertCompetitiveLayout(bf, file);
  });
}

test('battlefield: 3-lane has three lanes, 1-lane has one; loader is deterministic', () => {
  const three = loadStandbyBattlefield(3);
  const one = loadStandbyBattlefield(1);
  assert.ok(three && one);
  assert.equal(three!.lanes!.length, 3, '3-lane stand-in has three lanes');
  assert.equal(one!.lanes!.length, 1, '1-lane stand-in has one central lane');
  assert.deepEqual(validateBattlefield(three!).errors, []);
  assert.deepEqual(validateBattlefield(one!).errors, []);
  // Cached shared reference (server serialises it read-only).
  assert.equal(loadStandbyBattlefield(3), three);
});

test('battlefield: validator rejects a lane blocked by an impassable obstacle', () => {
  const bad: Battlefield = {
    meta: { seed: 'x' },
    arena: { sizeM: 240, bounds: [[-120, -120], [120, -120], [120, 120], [-120, 120]] },
    obstacles: [{ id: 'wall', kind: 'BOULDER', x: 0, z: 0, r: 20, passable: false }],
    spawnZones: [{ id: 's', side: 'ATTACKER', edge: 'S', x: 0, z: -110 }],
    lanes: [{ id: 'mid', side: 'ATTACKER', waypoints: [[0, -100], [0, 100]] }],
    structures: [{ anchorId: 'c', kind: 'CORE', side: 'ATTACKER', x: 0, z: -100 }],
  };
  const res = validateBattlefield(bad);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('lane mid is blocked')), res.errors.join('; '));
});

// ── the command-view payload carries the map (bridge / engine / wild all wired) ─

test('battlefield: bridge battle_hello carries a battlefield with lanes + structures', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null, bridgeSecret: SECRET });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const player = (await api(base, '/api/join', { body: { name: 'Watcher' } })).json;
    const parcelId = game.worldGeometry().parcels[0]!.id;
    const start = (await api(base, '/bridge/battles/start', {
      token: SECRET,
      body: {
        matchId: 'bf-match',
        parcelId,
        attacker: { armyLabel: 'Expedition', troops: 400 },
        defender: { label: 'Garrison', troops: 300 },
        arena: { shape: 'square', size: 240 },
        exhibition: true,
      },
    })).json;
    const battleId = start.battleId as string;
    const { ws, msgs } = await openWs(port, player.token);
    ws.send(JSON.stringify({ t: 'battle_sub', battleId }));
    await until(() => msgs.some((m) => m.t === 'battle_hello' && m.battleId === battleId), 'battle_hello');
    const hello = msgs.find((m) => m.t === 'battle_hello');
    assert.ok(hello.battlefield, 'battle_hello carries a battlefield object');
    assertCompetitiveLayout(hello.battlefield as Battlefield, 'bridge hello');
    assert.deepEqual(validateBattlefield(hello.battlefield as Battlefield).errors, []);
    ws.close();
  } finally {
    await server.stop();
  }
});
