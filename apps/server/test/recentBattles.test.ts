/**
 * Recently-resolved battle review ring (docs/04 §7b): battles resolve fast
 * (accelerated is the default per §3a), so the last ⚙ review.ringCap settled
 * fights are kept — newest-first, fog-filtered per viewer — for a post-battle
 * review panel. These tests drive the INSTANT (AUTO) wild-lair resolution path:
 *
 *   - a settled wild battle lands in recentBattles with counts + a timeline,
 *     is NOT in liveBattleSummaries, and is fog-gated (no intel ⇒ absent);
 *   - the ring is bounded to the cap (oldest evicted);
 *   - the ring survives a snapshot round-trip.
 *
 * tickMs: null — every world tick is driven by hand. (The engine-callback
 * settlement path + per-UnitClass casualties are covered in engineBattle.test.ts.)
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { type Balance, CONSTANTS, loadBalance } from '@clashfront/shared';
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

/** Temp balance.json = the packaged balance with `review` overrides (ring-cap pressure). */
function balanceFileWith(patch: Partial<Balance['review']>): string {
  const base = JSON.parse(JSON.stringify(loadBalance())) as Balance;
  base.review = { ...base.review, ...patch };
  const p = join(mkdtempSync(join(tmpdir(), 'cf-review-')), 'balance.json');
  writeFileSync(p, JSON.stringify(base));
  return p;
}

function gameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    worldFile: WORLD_FILE,
    seed: 'recent-battles-test',
    // Default resolution (no liveWildBattles/engineBattles) = INSTANT AUTO battles.
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 50_000 * CT,
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

/** Up to `k` distinct monster lairs each with a distinct garrison-free neighbor. */
function findLairs(game: Game, k: number): { lairTerrId: string; homeTerrId: string }[] {
  const pairs: { lairTerrId: string; homeTerrId: string }[] = [];
  const used = new Set<string>();
  for (const id of [...game.state.territories.keys()].sort()) {
    if (pairs.length >= k) break;
    const t = game.state.territories.get(id)!;
    if (t.governorKind !== 'SYSTEM' || t.garrisonArmyId === undefined) continue;
    const g = game.state.armies.get(t.garrisonArmyId);
    if (g === undefined || g.state === 'DISBANDED') continue;
    const lairHex = t.hexIds[0]!;
    if (used.has(lairHex)) continue;
    const freeNeighbor = (game.state.adjacency!.get(lairHex) ?? []).find((h) => {
      if (used.has(h)) return false;
      const nt = game.state.territories.get(game.state.hexes.get(h)!.territoryId!);
      return nt !== undefined && nt.governorKind === 'SYSTEM' && nt.garrisonArmyId === undefined;
    });
    if (freeNeighbor === undefined) continue;
    used.add(lairHex);
    used.add(freeNeighbor);
    pairs.push({ lairTerrId: id, homeTerrId: game.state.hexes.get(freeNeighbor)!.territoryId! });
  }
  return pairs;
}

/** Claim `home`, raise a STANDARD army, march it onto the adjacent `lair`. */
async function assault(game: Game, base: string, token: string, homeTerrId: string, lairTerrId: string): Promise<void> {
  assert.equal((await api(base, '/api/claim', { token, body: { territoryId: homeTerrId } })).status, 200);
  const raise = (await api(base, '/api/raise', { token, body: { territoryId: homeTerrId, preset: 'STANDARD' } })).json;
  completeTraining(game.state, raise.army.id);
  assert.equal((await api(base, '/api/march', { token, body: { armyId: raise.army.id, toTerritoryId: lairTerrId } })).status, 200);
}

test('a settled wild battle is recorded in recentBattles (counts + timeline), off the live list, fog-gated', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const player = (await api(base, '/api/join', { body: { name: 'Warlord' } })).json;
    const stranger = (await api(base, '/api/join', { body: { name: 'Stranger' } })).json;
    const [lair] = findLairs(game, 1);
    assert.ok(lair, 'demo world must contain a stageable lair');
    await assault(game, base, player.token, lair.homeTerrId, lair.lairTerrId);

    // Instant AUTO resolution: arrival + battle + settlement all on one world tick.
    let resolved: any;
    for (let i = 0; i < 6 && resolved === undefined; i++) {
      resolved = server.tickOnce().events.find((e: any) => e.type === 'battle_resolved');
    }
    assert.ok(resolved, 'wild battle resolved');
    const battleId = resolved.battleId as string;

    const st = (await api(base, '/api/state', { token: player.token })).json;
    const rec = st.recentBattles.find((b: any) => b.battleId === battleId);
    assert.ok(rec, 'settled wild battle recorded');
    assert.equal(rec.mine, true);
    assert.equal(rec.parcelId, resolved.parcelId);
    assert.ok(rec.startStrength.attacker > 0, 'start strength captured before settlement');
    assert.ok(rec.casualties.defender >= 0 && rec.survivors.attacker >= 0, 'counts present');
    assert.equal(rec.casualties.attacker, rec.startStrength.attacker - rec.survivors.attacker, 'casualties = start - survivors');
    assert.ok(Array.isArray(rec.timeline) && rec.timeline.length >= 2, 'timeline present');
    assert.equal(rec.timeline[0].a, rec.startStrength.attacker, 'timeline anchored at start');
    assert.equal(rec.timeline[rec.timeline.length - 1].a, rec.survivors.attacker, 'timeline ends at survivors');
    // A resolved battle is NOT in liveBattleSummaries.
    assert.equal(st.liveBattles.some((b: any) => b.id === battleId), false, 'settled battle off the live list');

    // Fog: a viewer with no intel on that parcel never sees the battle.
    const stStranger = (await api(base, '/api/state', { token: stranger.token })).json;
    assert.equal(stStranger.recentBattles.some((b: any) => b.battleId === battleId), false, 'fogged viewer sees nothing');
    // Anonymous view is fogged too.
    assert.equal(
      game.recentBattlesFor(undefined).some((b) => b.battleId === battleId),
      false,
      'anonymous spectator sees no recent battles',
    );
  } finally {
    await server.stop();
  }
});

test('recentBattles is bounded to review.ringCap — the oldest ages out', async () => {
  const game = new Game(gameConfig({ seed: 'recent-bounded', balancePath: balanceFileWith({ ringCap: 3 }) }));
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const player = (await api(base, '/api/join', { body: { name: 'Warlord' } })).json;
    const lairs = findLairs(game, 4);
    assert.ok(lairs.length === 4, 'demo world must contain four stageable lairs');
    for (const l of lairs) await assault(game, base, player.token, l.homeTerrId, l.lairTerrId);

    // One tick fights all four collisions; four battle_resolved this world tick.
    const resolvedIds: string[] = [];
    for (let i = 0; i < 6 && resolvedIds.length < 4; i++) {
      for (const e of server.tickOnce().events as any[]) {
        if (e.type === 'battle_resolved') resolvedIds.push(e.battleId);
      }
    }
    assert.equal(resolvedIds.length, 4, 'four battles resolved');

    const ring = game.recentBattlesFor(player.governorId);
    assert.equal(ring.length, 3, 'ring bounded to the cap of 3');
    // Pushed in sorted-id order → the lowest battleId is the oldest, evicted first.
    const oldest = [...resolvedIds].sort()[0]!;
    assert.equal(ring.some((b) => b.battleId === oldest), false, 'oldest battle aged out');
    // Newest-first ordering: the top entry has the highest resolvedTick (ties by nothing here — same tick).
    assert.ok(ring.every((b) => b.resolvedTick === ring[0]!.resolvedTick), 'all four settled on the same tick');
  } finally {
    await server.stop();
  }
});

test('recentBattles survives a snapshot round-trip', async () => {
  const savePath = join(mkdtempSync(join(tmpdir(), 'cf-recent-save-')), 'save.json');
  const cfg = gameConfig({ seed: 'recent-save', savePath });
  const game = new Game(cfg);
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  let battleId = '';
  let playerGov = '';
  try {
    const player = (await api(base, '/api/join', { body: { name: 'Warlord' } })).json;
    playerGov = player.governorId;
    const [lair] = findLairs(game, 1);
    await assault(game, base, player.token, lair.homeTerrId, lair.lairTerrId);
    let resolved: any;
    for (let i = 0; i < 6 && resolved === undefined; i++) {
      resolved = server.tickOnce().events.find((e: any) => e.type === 'battle_resolved');
    }
    assert.ok(resolved, 'wild battle resolved');
    battleId = resolved.battleId;
    assert.ok(game.recentBattlesFor(playerGov).some((b) => b.battleId === battleId));
  } finally {
    await server.stop(); // writes the snapshot
  }

  const game2 = new Game(cfg);
  const ring2 = game2.recentBattlesFor(playerGov);
  assert.ok(ring2.some((b) => b.battleId === battleId), 'recent battle restored from the snapshot');
  const rec = ring2.find((b) => b.battleId === battleId)!;
  assert.ok(Array.isArray(rec.timeline) && rec.timeline.length >= 2, 'timeline restored intact');
});
