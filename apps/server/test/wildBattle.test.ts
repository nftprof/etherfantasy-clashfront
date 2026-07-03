/**
 * LIVE wild-battle server tests (docs/04 §7b wild row prototype):
 * battle_started event + liveBattles in /api/state, WS battle channel
 * (subscribe permission, snapshots, steering auth), march lock while engaged,
 * pacing (subscribed battles step LIVE via battleTickOnce, unwatched ones
 * fast-forward at the world tick), settlement into the normal battle_resolved
 * → choice_pending → pillage flow, and save/load resuming a running battle.
 *
 * tickMs: null — every tick (world and battle) is driven by hand.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS } from '@clashfront/shared';
import { completeTraining, type DemoWorldFile } from '@clashfront/sim-engine';
import { ClashServer, Game, type GameConfig, parseMasterNames } from '../src/index';

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
    seed: 'wild-battle-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50, liveWildBattles: true },
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

/**
 * Stage: player joined, claimed a parcel adjacent to a monster lair, raised a
 * STANDARD army (instant-mustered), ready to march at the lair.
 */
async function stage(game: Game, server: ClashServer, base: string) {
  const player = (await api(base, '/api/join', { body: { name: 'Warlord' } })).json;
  // Nearest monster-garrisoned territory with a free neighbor.
  let lairTerrId: string | undefined;
  let homeTerrId: string | undefined;
  for (const id of [...game.state.territories.keys()].sort()) {
    const t = game.state.territories.get(id)!;
    if (t.governorKind !== 'SYSTEM' || t.garrisonArmyId === undefined) continue;
    const g = game.state.armies.get(t.garrisonArmyId);
    if (g === undefined || g.state === 'DISBANDED') continue;
    const freeNeighbor = (game.state.adjacency!.get(t.hexIds[0]!) ?? []).find((h) => {
      const nt = game.state.territories.get(game.state.hexes.get(h)!.territoryId!);
      return nt !== undefined && nt.governorKind === 'SYSTEM' && nt.garrisonArmyId === undefined;
    });
    if (freeNeighbor === undefined) continue;
    lairTerrId = id;
    homeTerrId = game.state.hexes.get(freeNeighbor)!.territoryId!;
    break;
  }
  assert.ok(lairTerrId !== undefined && homeTerrId !== undefined, 'demo world must contain a stageable lair');
  assert.equal((await api(base, '/api/claim', { token: player.token, body: { territoryId: homeTerrId } })).status, 200);
  const raise = (await api(base, '/api/raise', { token: player.token, body: { territoryId: homeTerrId, preset: 'STANDARD' } })).json;
  completeTraining(game.state, raise.army.id); // deterministic shortcut — no muster ticks
  return { player, lairTerrId: lairTerrId!, homeTerrId: homeTerrId!, armyId: raise.army.id as string };
}

test('wild battle e2e: march → battle_started → WS watch + steer → win → choice flow', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { player, lairTerrId, armyId } = await stage(game, server, base);

    // Second player with NO intel on the lair (joined, never claimed) — for permission checks.
    const stranger = (await api(base, '/api/join', { body: { name: 'Stranger' } })).json;

    assert.equal((await api(base, '/api/march', { token: player.token, body: { armyId, toTerritoryId: lairTerrId } })).status, 200);
    const r1 = server.tickOnce(); // arrival + battle ignition
    const started = r1.events.find((e) => e.type === 'battle_started') as any;
    assert.ok(started, 'battle_started event emitted');
    assert.ok(started.monsterName, 'monster garrison named');
    assert.equal(started.attackerGovernorIds[0], player.governorId);
    const battleId = started.battleId as string;
    assert.ok(game.wildBattle(battleId), 'running battle exists');
    assert.equal(r1.events.some((e) => e.type === 'battle_resolved'), false, 'no instant resolve');

    // /api/state surfaces the running battle to the participant…
    const st = (await api(base, '/api/state', { token: player.token })).json;
    assert.equal(st.liveBattles.length, 1);
    assert.equal(st.liveBattles[0].id, battleId);
    // …but not to a viewer with zero intel on that parcel.
    const stStranger = (await api(base, '/api/state', { token: stranger.token })).json;
    assert.equal(stStranger.liveBattles.length, 0, 'fogged viewers see no live battle');

    // Engaged armies cannot march away.
    const flee = await api(base, '/api/march', { token: player.token, body: { armyId, toTerritoryId: lairTerrId } });
    assert.equal(flee.status, 409);
    assert.equal(flee.json.error.code, 'ENGAGED');

    // WS battle channel: owner subscribes, gets hello + snapshots; steering works.
    const msgs: any[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${player.token}`);
    ws.addEventListener('message', (e) => msgs.push(JSON.parse(e.data as string)));
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('ws failed')));
    });
    ws.send(JSON.stringify({ t: 'battle_sub', battleId }));
    await until(() => msgs.some((m) => m.t === 'battle_hello'), 'battle_hello');
    const hello = msgs.find((m) => m.t === 'battle_hello');
    assert.ok(Array.isArray(hello.bounds) && hello.bounds.length >= 3, 'parcel-shaped bounds');
    assert.ok(hello.obstacles.length > 0, 'terrain present');
    assert.ok(hello.snap.towers.length >= 2, 'wild defenders hold towers');
    assert.ok(typeof hello.masterName === 'string' && hello.masterName.length > 0, 'a Master commands the waves');

    // A subscribed battle is PACED: the world tick must not fast-forward it.
    const btBefore = game.wildBattle(battleId)!.bt;
    server.tickOnce();
    assert.equal(game.wildBattle(battleId)!.bt, btBefore, 'paced battle skipped by world tick');

    // The LIVE driver steps it one battle tick and fans out a snapshot.
    server.battleTickOnce();
    await until(() => msgs.some((m) => m.t === 'battle_tick'), 'battle_tick');
    const snap = msgs.find((m) => m.t === 'battle_tick');
    assert.equal(snap.battleId, battleId);
    assert.ok(snap.waves.stockStart > 0);

    // Steering: owner commands accepted; stranger rejected (403 semantics via battle_err).
    ws.send(JSON.stringify({ t: 'battle_cmd', battleId, cmd: { kind: 'rally', x: 120, y: 120 } }));
    await until(() => game.wildBattle(battleId)?.rally !== undefined, 'rally applied');
    const wsStranger = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${stranger.token}`);
    const strangerMsgs: any[] = [];
    wsStranger.addEventListener('message', (e) => strangerMsgs.push(JSON.parse(e.data as string)));
    await new Promise<void>((resolve) => wsStranger.addEventListener('open', () => resolve()));
    wsStranger.send(JSON.stringify({ t: 'battle_sub', battleId }));
    await until(() => strangerMsgs.some((m) => m.t === 'battle_err'), 'stranger sub refused');
    assert.equal(strangerMsgs.find((m) => m.t === 'battle_err').code, 'FORBIDDEN');
    wsStranger.send(JSON.stringify({ t: 'battle_cmd', battleId, cmd: { kind: 'move', x: 1, y: 1 } }));
    await until(() => strangerMsgs.filter((m) => m.t === 'battle_err').length >= 2, 'stranger cmd refused');

    // Drive the battle LIVE to its decision, then settle at the world tick.
    for (let i = 0; i < 3000 && game.wildBattle(battleId)?.outcome === undefined; i++) server.battleTickOnce();
    assert.equal(game.wildBattle(battleId)?.outcome, 'ATTACKER', 'STANDARD army beats the lair');
    await until(() => msgs.some((m) => m.t === 'battle_end'), 'battle_end broadcast');
    const r2 = server.tickOnce();
    assert.ok(game.wildBattle(battleId) === undefined, 'settled at the world tick');
    const resolved = r2.events.find((e) => e.type === 'battle_resolved') as any;
    assert.ok(resolved && resolved.battleId === battleId);
    assert.equal(resolved.winner, 'ATTACKER');
    const choice = r2.events.find((e) => e.type === 'choice_pending') as any;
    assert.ok(choice && choice.governorId === player.governorId, 'normal pillage/occupy choice follows');
    const pillage = (await api(base, '/api/choice', { token: player.token, body: { battleId, action: 'PILLAGE' } })).json;
    assert.ok(pillage.battle.lootCt >= 0);
    ws.close();
    wsStranger.close();
  } finally {
    await server.stop();
  }
});

test('unwatched wild battles fast-forward at world ticks and resolve correctly', async () => {
  const game = new Game(gameConfig({ seed: 'wild-battle-accel' }));
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { player, lairTerrId, armyId } = await stage(game, server, base);
    assert.equal((await api(base, '/api/march', { token: player.token, body: { armyId, toTerritoryId: lairTerrId } })).status, 200);
    const r1 = server.tickOnce();
    const battleId = (r1.events.find((e) => e.type === 'battle_started') as any).battleId as string;
    // Nobody watching, owner not on WS ⇒ accelerated: settles within a few world ticks.
    let resolvedEv: any;
    for (let i = 0; i < 5 && resolvedEv === undefined; i++) {
      resolvedEv = server.tickOnce().events.find((e) => e.type === 'battle_resolved');
    }
    assert.ok(resolvedEv, 'accelerated battle resolved in a few world ticks');
    assert.equal(resolvedEv.battleId, battleId);
    assert.equal(resolvedEv.winner, 'ATTACKER');
    assert.ok(game.state.pendingChoices!.has(battleId), 'same post-victory path as LIVE');
  } finally {
    await server.stop();
  }
});

test('save/load: a running wild battle survives the snapshot and resumes unpaced', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-wild-'));
  const savePath = join(dir, 'save.json');
  const cfg = gameConfig({ seed: 'wild-battle-save', savePath });
  const game = new Game(cfg);
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const { player, lairTerrId, armyId } = await stage(game, server, base);
    assert.equal((await api(base, '/api/march', { token: player.token, body: { armyId, toTerritoryId: lairTerrId } })).status, 200);
    const r1 = server.tickOnce();
    const battleId = (r1.events.find((e) => e.type === 'battle_started') as any).battleId as string;
    game.setBattlePaced(battleId, true); // freeze it mid-flight like a LIVE viewer would
    game.stepBattle(battleId);
    game.stepBattle(battleId);
    const btAtSave = game.wildBattle(battleId)!.bt;
    assert.equal(btAtSave, 2);
  } finally {
    await server.stop(); // writes the snapshot
  }

  const game2 = new Game(cfg);
  const b = game2.wildBattle([...(game2.state.wildBattles?.keys() ?? [])][0]!);
  assert.ok(b !== undefined, 'running battle restored from the snapshot');
  assert.equal(b.bt, 2, 'mid-battle progress preserved');
  assert.equal(b.paced, false, 'resumes unpaced (no watchers yet)');
  // And it still finishes: fast-forward at world ticks.
  const server2 = new ClashServer({ game: game2, port: 0, tickMs: null, saveMs: null });
  await server2.start();
  try {
    let resolved = false;
    for (let i = 0; i < 6 && !resolved; i++) {
      resolved = server2.tickOnce().events.some((e) => e.type === 'battle_resolved');
    }
    assert.ok(resolved, 'restored battle resolves');
  } finally {
    await server2.stop();
  }
});
