/**
 * Battle-bridge tests (docs/briefs/TELEMETRY-RELAY.md): the external
 * telemetry-relay API that lets a real MOBA match server feed an overworld
 * battle. Covers auth, exhibition lifecycle end-to-end (start → snapshot
 * fan-out through the WS battle channel → steering queue → end), coordinate
 * translation, permission modes, liveness timeouts, and the guarantee that
 * exhibition battles never mutate the world.
 *
 * tickMs: null — world ticks driven by hand; timeouts tested by injecting
 * wall-clock values into BridgeHub.sweep().
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS } from '@clashfront/shared';
import type { DemoWorldFile } from '@clashfront/sim-engine';
import {
  BRIDGE_DEAD_MS,
  BRIDGE_STALE_MS,
  ClashServer,
  Game,
  type GameConfig,
  mobaToViewer,
  parseMasterNames,
  viewerToMoba,
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
    seed: 'bridge-test',
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

function startBody(parcelId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    matchId: 'test-match-1',
    parcelId,
    attacker: { armyLabel: '1st Test Expedition', troops: 480 },
    defender: { label: 'Test Garrison', troops: 350 },
    arena: { shape: 'square', size: 240 },
    exhibition: true,
    ...extra,
  };
}

// ── coordinate translation ────────────────────────────────────────────────────

test('bridge: coordinate translation MOBA ↔ viewer', () => {
  // Square ±120 (x east, z north) ↔ viewer [0,240]² (y down/south).
  assert.deepEqual(mobaToViewer(0, 0, 240), { x: 120, y: 120 }); // center
  assert.deepEqual(mobaToViewer(0, -120, 240), { x: 120, y: 240 }); // south edge = bottom
  assert.deepEqual(mobaToViewer(0, 120, 240), { x: 120, y: 0 }); // north edge = top
  assert.deepEqual(mobaToViewer(-120, 0, 240), { x: 0, y: 120 }); // west = left
  assert.deepEqual(mobaToViewer(120, 60, 240), { x: 240, y: 60 });
  assert.deepEqual(viewerToMoba(120, 240, 240), { x: 0, z: -120 });
  // roundtrip
  for (const [x, z] of [[-120, -120], [37.5, -12.25], [0, 119]] as const) {
    const v = mobaToViewer(x, z, 240);
    assert.deepEqual(viewerToMoba(v.x, v.y, 240), { x, z });
  }
});

// ── auth ─────────────────────────────────────────────────────────────────────

test('bridge: disabled without secret; auth enforced with one', async () => {
  const off = new ClashServer({ game: new Game(gameConfig()), port: 0, tickMs: null, saveMs: null });
  const offPort = await off.start();
  try {
    const r = await api(`http://127.0.0.1:${offPort}`, '/bridge/battles/start', { body: {} });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'BRIDGE_DISABLED');
  } finally {
    await off.stop();
  }

  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null, bridgeSecret: SECRET });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const parcelId = game.worldGeometry().parcels[0]!.id;
    // no token
    let r = await api(base, '/bridge/battles/start', { body: startBody(parcelId) });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'BAD_BRIDGE_SECRET');
    // wrong bearer
    r = await api(base, '/bridge/battles/start', { token: 'wrong', body: startBody(parcelId) });
    assert.equal(r.status, 401);
    // right secret in the BODY (curl convenience on start)
    r = await api(base, '/bridge/battles/start', { body: { ...startBody(parcelId), token: SECRET } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(String(r.json.battleId).length > 0);
    // GET commands requires the bearer too
    r = await api(base, `/bridge/battles/${r.json.battleId}/commands?afterSeq=0`);
    assert.equal(r.status, 401);
  } finally {
    await server.stop();
  }
});

// ── validation ───────────────────────────────────────────────────────────────

test('bridge: start/snapshot validation', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null, bridgeSecret: SECRET });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const parcelId = game.worldGeometry().parcels[0]!.id;
    let r = await api(base, '/bridge/battles/start', { token: SECRET, body: startBody('nope-parcel') });
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'UNKNOWN_PARCEL');
    r = await api(base, '/bridge/battles/start', { token: SECRET, body: { ...startBody(parcelId), arena: { shape: 'hex', size: 240 } } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'BAD_ARENA');
    r = await api(base, '/bridge/battles/start', {
      token: SECRET,
      body: { ...startBody(parcelId), attacker: { armyLabel: 'X', troops: 1, governorName: 'Nobody Known' } },
    });
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'UNKNOWN_GOVERNOR');
    // bind to a non-existent sim battle
    r = await api(base, '/bridge/battles/start', { token: SECRET, body: { ...startBody(parcelId), battleId: 'WBNOPE' } });
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'NO_SIM_BATTLE');

    const battleId = (await api(base, '/bridge/battles/start', { token: SECRET, body: startBody(parcelId) })).json.battleId as string;
    r = await api(base, `/bridge/battles/${battleId}/snapshot`, { token: SECRET, body: { tick: 1, clockMs: 1000 } });
    assert.equal(r.status, 400); // no units[]
    r = await api(base, `/bridge/battles/${battleId}/snapshot`, {
      token: SECRET,
      body: { tick: 1, clockMs: 1000, units: [{ id: 'u1', kind: 'squad', team: 'A', x: 500, z: 0, hp: 1, maxHp: 1 }] },
    });
    assert.equal(r.status, 400); // out of the ±120 square
    assert.equal(r.json.error.code, 'BAD_UNIT');
    r = await api(base, '/bridge/battles/unknown/snapshot', { token: SECRET, body: { tick: 1, clockMs: 1, units: [] } });
    assert.equal(r.status, 404);
  } finally {
    await server.stop();
  }
});

// ── exhibition lifecycle e2e ─────────────────────────────────────────────────

test('bridge e2e: start → WS hello → snapshot fan-out → steering queue → end (no world mutation)', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null, bridgeSecret: SECRET });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const player = (await api(base, '/api/join', { body: { name: 'Watcher' } })).json;
    const parcelId = game.worldGeometry().parcels[0]!.id;
    const ownersBefore = new Map([...game.state.territories].map(([id, t]) => [id, t.governorId]));

    const start = (await api(base, '/bridge/battles/start', { token: SECRET, body: startBody(parcelId) })).json;
    const battleId = start.battleId as string;
    assert.equal(start.exhibition, true);
    assert.equal(start.parcelId, parcelId);

    // Public live-battle summary immediately (even for anonymous /api/state).
    const state = (await api(base, '/api/state')).json;
    const lb = state.liveBattles.find((b: any) => b.id === battleId);
    assert.ok(lb, 'exhibition battle listed in liveBattles');
    assert.equal(lb.exhibition, true);
    assert.equal(lb.attackerLabel, '1st Test Expedition');

    // battle_started event goes out on the next world tick, to everyone.
    const { ws, msgs } = await openWs(port, player.token);
    server.tickOnce();
    await until(() => msgs.some((m) => m.t === 'tick' && m.events.some((e: any) => e.type === 'battle_started' && e.battleId === battleId)), 'battle_started event');
    const startedEv = msgs.flatMap((m) => m.events ?? []).find((e: any) => e.type === 'battle_started' && e.battleId === battleId);
    assert.equal(startedEv.exhibition, true);
    assert.equal(startedEv.open, true, 'no governor named ⇒ open commands');
    assert.equal(startedEv.armyLabel, '1st Test Expedition');

    // Subscribe → square-arena hello.
    ws.send(JSON.stringify({ t: 'battle_sub', battleId }));
    await until(() => msgs.some((m) => m.t === 'battle_hello' && m.battleId === battleId), 'battle_hello');
    const hello = msgs.find((m) => m.t === 'battle_hello');
    assert.equal(hello.mode, 'square');
    assert.equal(hello.bridge, true);
    assert.equal(hello.openCommands, true);
    assert.equal(hello.size, 240);
    assert.deepEqual(hello.bounds, [[0, 0], [240, 0], [240, 240], [0, 240]]);
    assert.ok(hello.snap, 'hello carries a snapshot (empty placeholder before first telemetry)');

    // Telemetry snapshot → translated battle_tick fan-out.
    const snapRes = await api(base, `/bridge/battles/${battleId}/snapshot`, {
      token: SECRET,
      body: {
        tick: 42,
        clockMs: 61_250,
        units: [
          { id: 'Am1', kind: 'master', team: 'A', x: 0, z: -110, hp: 380, maxHp: 420, name: 'Cid' },
          { id: 'As1', kind: 'squad', team: 'A', x: -30, z: -60, hp: 96, maxHp: 110, cls: 'ARCHER' },
          { id: 'Bs1', kind: 'mob', team: 'B', x: 40, z: 22, hp: 120, maxHp: 120 },
          { id: 'Bt1', kind: 'tower', team: 'B', x: -45, z: 40, hp: 610, maxHp: 900 },
          { id: 'Bc1', kind: 'core', team: 'B', x: 0, z: 100, hp: 1600, maxHp: 1600 },
        ],
        score: { a: 12, b: 3 },
        waves: { stock: 16, stockStart: 24 },
        runs: 2,
        spawns: [{ id: 'lane-south', team: 'A', x: 0, z: -116 }],
      },
    });
    assert.equal(snapRes.status, 200, JSON.stringify(snapRes.json));
    await until(() => msgs.some((m) => m.t === 'battle_tick' && m.battleId === battleId), 'battle_tick fan-out');
    const tickMsg = msgs.find((m) => m.t === 'battle_tick');
    assert.equal(tickMsg.bt, 42);
    assert.equal(tickMsg.clockLeft, 61, 'clockMs → whole seconds for the HUD (tickHz 1)');
    const master = tickMsg.units.find((u: any) => u.id === 'Am1');
    assert.deepEqual({ k: master.k, s: master.s, x: master.x, y: master.y }, { k: 'M', s: 'A', x: 120, y: 230 }, 'MOBA (0,-110) → viewer (120,230)');
    const archer = tickMsg.units.find((u: any) => u.id === 'As1');
    assert.deepEqual([archer.x, archer.y, archer.k, archer.c], [90, 180, 'u', 'ARCHER']);
    const mob = tickMsg.units.find((u: any) => u.id === 'Bs1');
    assert.deepEqual([mob.k, mob.s, mob.x, mob.y], ['m', 'D', 160, 98]);
    // tower + core land in the towers array (structure rendering path)
    assert.deepEqual(tickMsg.towers.map((t: any) => t.id).sort(), ['Bc1', 'Bt1']);
    const tower = tickMsg.towers.find((t: any) => t.id === 'Bt1');
    assert.deepEqual([tower.x, tower.y, tower.hp, tower.mh], [75, 80, 610, 900]);
    // HUD synthesis
    assert.equal(tickMsg.mobs, 1);
    assert.equal(tickMsg.towersAlive, 2);
    assert.equal(tickMsg.towersStart, 2);
    assert.deepEqual(tickMsg.waves, { stock: 16, stockStart: 24, size: 0, nextIn: 0 });
    assert.deepEqual(tickMsg.master, { alive: true, revives: 2, respawnIn: 0, name: 'Cid' });
    assert.deepEqual(tickMsg.spawns, [{ id: 'lane-south', s: 'A', x: 120, y: 236 }]);

    // Steering: viewer coords in, MOBA coords out of the poll queue.
    ws.send(JSON.stringify({ t: 'battle_cmd', battleId, cmd: { kind: 'move', x: 120, y: 240 } })); // bottom center = south edge
    ws.send(JSON.stringify({ t: 'battle_cmd', battleId, cmd: { kind: 'focus', targetId: 'Bt1' } }));
    ws.send(JSON.stringify({ t: 'battle_cmd', battleId, cmd: { kind: 'rally', x: 180, y: 60 } }));
    await until(() => server.bridge.commandsAfter(battleId, 0).commands.length === 3, 'commands queued');
    const poll = (await api(base, `/bridge/battles/${battleId}/commands?afterSeq=0`, { token: SECRET })).json;
    assert.equal(poll.headSeq, 3);
    assert.equal(poll.ended, false);
    assert.deepEqual(
      poll.commands.map((c: any) => ({ seq: c.seq, kind: c.kind, x: c.x, z: c.z, targetId: c.targetId })),
      [
        { seq: 1, kind: 'move', x: 0, z: -120, targetId: undefined },
        { seq: 2, kind: 'focus', x: undefined, z: undefined, targetId: 'Bt1' },
        { seq: 3, kind: 'rally', x: 60, z: 60, targetId: undefined },
      ],
    );
    assert.equal(poll.commands[0].by, player.governorId);
    // afterSeq slicing
    const poll2 = (await api(base, `/bridge/battles/${battleId}/commands?afterSeq=2`, { token: SECRET })).json;
    assert.deepEqual(poll2.commands.map((c: any) => c.seq), [3]);
    // rally/focus markers echo into the next snapshot
    await api(base, `/bridge/battles/${battleId}/snapshot`, {
      token: SECRET,
      body: { tick: 43, clockMs: 60_000, units: [{ id: 'Am1', kind: 'master', team: 'A', x: 0, z: -110, hp: 380, maxHp: 420 }] },
    });
    await until(() => msgs.some((m) => m.t === 'battle_tick' && m.bt === 43), 'second battle_tick');
    const tick2 = msgs.find((m) => m.t === 'battle_tick' && m.bt === 43);
    assert.deepEqual(tick2.rally, { x: 180, y: 60 });
    assert.equal(tick2.focus, 'Bt1');

    // End: banner frame + next-tick exhibition events + zero world mutation.
    const endRes = await api(base, `/bridge/battles/${battleId}/end`, { token: SECRET, body: { winner: 'A', summary: 'core down' } });
    assert.equal(endRes.status, 200);
    await until(() => msgs.some((m) => m.t === 'battle_end' && m.battleId === battleId), 'battle_end frame');
    assert.equal(msgs.find((m) => m.t === 'battle_end').outcome, 'ATTACKER');
    server.tickOnce();
    await until(
      () => msgs.some((m) => m.t === 'tick' && (m.events ?? []).some((e: any) => e.type === 'battle_resolved' && e.battleId === battleId)),
      'battle_resolved event',
    );
    const resolved = msgs.flatMap((m) => m.events ?? []).find((e: any) => e.type === 'battle_resolved' && e.battleId === battleId);
    assert.equal(resolved.winner, 'ATTACKER');
    assert.equal(resolved.exhibition, true);
    assert.equal(resolved.attackerScore, 12);
    for (const [id, gov] of ownersBefore) {
      assert.equal(game.state.territories.get(id)!.governorId, gov, 'exhibition must not change any territory');
    }
    assert.equal(game.state.battles.size, 0, 'no sim battle record created');
    // post-end behavior
    assert.equal((await api(base, `/bridge/battles/${battleId}/commands?afterSeq=3`, { token: SECRET })).json.ended, true);
    assert.equal((await api(base, `/bridge/battles/${battleId}/snapshot`, { token: SECRET, body: { tick: 44, clockMs: 1, units: [] } })).status, 409);
    assert.equal((await api(base, '/api/state')).json.liveBattles.length, 0, 'summary gone after end');
    ws.close();
  } finally {
    await server.stop();
  }
});

// ── permissions: named commander restricts steering ─────────────────────────

test('bridge: governorName restricts steering to the named commander', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null, bridgeSecret: SECRET });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const cmd = (await api(base, '/api/join', { body: { name: 'Commander' } })).json;
    const other = (await api(base, '/api/join', { body: { name: 'Bystander' } })).json;
    const parcelId = game.worldGeometry().parcels[0]!.id;
    const start = (
      await api(base, '/bridge/battles/start', {
        token: SECRET,
        body: startBody(parcelId, { attacker: { armyLabel: 'Named Host', troops: 10, governorName: 'commander' } }),
      })
    ).json;
    const battleId = start.battleId as string;

    const a = await openWs(port, cmd.token);
    const b = await openWs(port, other.token);
    a.ws.send(JSON.stringify({ t: 'battle_sub', battleId }));
    b.ws.send(JSON.stringify({ t: 'battle_sub', battleId }));
    await until(() => a.msgs.some((m) => m.t === 'battle_hello') && b.msgs.some((m) => m.t === 'battle_hello'), 'both hellos');
    assert.equal(a.msgs.find((m) => m.t === 'battle_hello').openCommands, false, 'named commander ⇒ not open');

    b.ws.send(JSON.stringify({ t: 'battle_cmd', battleId, cmd: { kind: 'move', x: 10, y: 10 } }));
    await until(() => b.msgs.some((m) => m.t === 'battle_err'), 'bystander rejected');
    assert.equal(b.msgs.find((m) => m.t === 'battle_err').code, 'NOT_YOUR_BATTLE');
    a.ws.send(JSON.stringify({ t: 'battle_cmd', battleId, cmd: { kind: 'move', x: 10, y: 10 } }));
    await until(() => server.bridge.commandsAfter(battleId, 0).commands.length === 1, 'commander queued');
    assert.equal(server.bridge.commandsAfter(battleId, 0).commands[0]!.by, cmd.governorId);
    a.ws.close();
    b.ws.close();
  } finally {
    await server.stop();
  }
});

// ── liveness: stale badge, then auto-end DRAW ────────────────────────────────

test('bridge: 30 s silence marks stale, 2 min auto-ends DRAW (exhibition)', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null, bridgeSecret: SECRET });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const player = (await api(base, '/api/join', { body: { name: 'Watcher' } })).json;
    const parcelId = game.worldGeometry().parcels[0]!.id;
    const battleId = (await api(base, '/bridge/battles/start', { token: SECRET, body: startBody(parcelId) })).json.battleId as string;
    const { ws, msgs } = await openWs(port, player.token);
    ws.send(JSON.stringify({ t: 'battle_sub', battleId }));
    await until(() => msgs.some((m) => m.t === 'battle_hello'), 'hello');

    const t0 = Date.now();
    server.bridge.sweep(t0 + BRIDGE_STALE_MS + 1000);
    await until(() => msgs.some((m) => m.t === 'battle_tick' && m.stale === true), 'stale battle_tick');

    // a fresh snapshot clears the stale flag
    await api(base, `/bridge/battles/${battleId}/snapshot`, {
      token: SECRET,
      body: { tick: 1, clockMs: 5000, units: [{ id: 'u1', kind: 'squad', team: 'A', x: 0, z: 0, hp: 1, maxHp: 1 }] },
    });
    await until(() => msgs.some((m) => m.t === 'battle_tick' && m.bt === 1 && m.stale === undefined), 'fresh tick unstale');

    // dead silence past the hard limit → DRAW, viewer banner, exhibition events
    server.bridge.sweep(Date.now() + BRIDGE_DEAD_MS + 1000);
    await until(() => msgs.some((m) => m.t === 'battle_end' && m.battleId === battleId), 'auto battle_end');
    assert.equal(msgs.find((m) => m.t === 'battle_end').outcome, 'TIMEOUT');
    const r = server.tickOnce();
    void r;
    await until(
      () => msgs.some((m) => m.t === 'tick' && (m.events ?? []).some((e: any) => e.type === 'battle_resolved' && e.battleId === battleId && e.winner === 'DRAW')),
      'DRAW battle_resolved',
    );
    assert.ok(
      msgs.flatMap((m) => m.events ?? []).some((e: any) => e.type === 'battle_tied' && e.battleId === battleId),
      'battle_tied companion event for the stalemate toast',
    );
    ws.close();
  } finally {
    await server.stop();
  }
});

// ── self-serve exhibitions (POST /api/exhibition) ─────────────────────────────

test('exhibition endpoint: disabled without secret; guards; stages + rejects double-book', async () => {
  // bridge off → 503
  const off = new ClashServer({ game: new Game(gameConfig()), port: 0, tickMs: null, saveMs: null });
  const offPort = await off.start();
  try {
    const p = (await api(`http://127.0.0.1:${offPort}`, '/api/join', { body: { name: 'Promoter' } })).json;
    const r = await api(`http://127.0.0.1:${offPort}`, '/api/exhibition', { token: p.token, body: { parcelId: WORLD_FILE.parcels[0]!.parcelId } });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'BRIDGE_DISABLED');
  } finally {
    await off.stop();
  }

  const server = new ClashServer({ game: new Game(gameConfig()), port: 0, tickMs: null, saveMs: null, bridgeSecret: SECRET });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const p = (await api(base, '/api/join', { body: { name: 'Promoter' } })).json;
    // auth required
    assert.equal((await api(base, '/api/exhibition', { body: { parcelId: 'x' } })).status, 401);
    // unknown parcel
    const bad = await api(base, '/api/exhibition', { token: p.token, body: { parcelId: 'nope-123' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'BAD_PARCEL');
    // happy path: stages the bundled emitter, which registers a live bridge battle
    const parcelId = WORLD_FILE.parcels[0]!.parcelId;
    const ok = await api(base, '/api/exhibition', { token: p.token, body: { parcelId } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.ok, true);
    // one per governor while running
    const dup = await api(base, '/api/exhibition', { token: p.token, body: { parcelId } });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.error.code, 'EXHIBITION_RUNNING');
    // the spawned emitter reaches the bridge: a live battle appears on that parcel
    await until(() => (server.bridge.liveSummaries() as any[]).some((b) => b.parcelId === parcelId), 'staged battle live', 15_000);
  } finally {
    await server.stop(); // kills the emitter child
  }
});
