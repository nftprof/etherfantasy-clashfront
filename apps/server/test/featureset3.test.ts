/**
 * Feature Set 3 server tests (docs/briefs/FEATURESET-3-ECONOMY.md + the
 * settlement-journal addition): /api/enrich, /api/raze, the /api/buy-ct 501
 * stub, GET /api/economy telemetry (supply identity over the wire), the
 * /internal/economy/settlement journal export (afterSeq slicing + checksum +
 * replay equality), mustering army views/events over the API, and snapshot
 * persistence of the whole economy container.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS, loadBalance } from '@clashfront/shared';
import {
  type DemoWorldFile,
  developCostCtUnits,
  replayJournal,
  supplyComponents,
} from '@clashfront/sim-engine';
import { ClashServer, Game, type GameConfig, parseMasterNames } from '../src/index';

const CT = CONSTANTS.CT_UNITS_PER_CT;
const BALANCE = loadBalance();
const E = BALANCE.economy;

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
    seed: 'fs3-test',
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

test('E3/E4 over HTTP: enrich + raze endpoints — auth, ownership, amounts, events, view fields', async () => {
  const game = new Game(gameConfig());
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const alice = (await api(base, '/api/join', { body: { name: 'Alice' } })).json;
    const home = claimableIds(game)[0]!;
    const foreign = claimableIds(game)[1]!;
    game.claim(alice.governorId, home);

    // /api/enrich — guards
    assert.equal((await api(base, '/api/enrich', { body: { territoryId: home, amountCtUnits: 100 } })).status, 401);
    assert.equal(
      (await api(base, '/api/enrich', { token: alice.token, body: { territoryId: foreign, amountCtUnits: 100 } })).status,
      403,
    );
    const badAmt = await api(base, '/api/enrich', { token: alice.token, body: { territoryId: home, amountCtUnits: -5 } });
    assert.equal(badAmt.status, 400);
    assert.equal(badAmt.json.error.code, 'BAD_AMOUNT');

    // happy path: full amount debited, LANDYIELD lands in pools, view shows the pool
    const wallet0 = game.state.ctBalances!.get(alice.governorId)!;
    const amount = 1_000 * CT;
    const ok = (await api(base, '/api/enrich', { token: alice.token, body: { territoryId: home, amountCtUnits: amount } })).json;
    assert.equal(ok.ctUnits, wallet0 - amount);
    assert.equal(ok.toPoolCtUnits, Math.floor(amount * E.landYieldShare));
    assert.equal(ok.territory.enrichmentPool, Math.floor(ok.toPoolCtUnits * E.landYieldSelfPct));
    // amountCt (whole CT) convenience form
    const okCt = (await api(base, '/api/enrich', { token: alice.token, body: { territoryId: home, amountCt: 10 } })).json;
    assert.equal(okCt.amountCtUnits, 10 * CT);
    const evs = game.tick().events.filter((e) => e.type === 'territory_enriched') as any[];
    assert.equal(evs.length, 2);
    assert.equal(evs[0].governorId, alice.governorId);
    assert.equal(evs[0].amountCtUnits, amount);

    // /api/raze — guards + salvage
    const noLevel = await api(base, '/api/raze', { token: alice.token, body: { territoryId: home, track: 'DEFENSE' } });
    assert.equal(noLevel.status, 409);
    assert.equal(noLevel.json.error.code, 'NOTHING_TO_RAZE');
    const badTrack = await api(base, '/api/raze', { token: alice.token, body: { territoryId: home, track: 'VIBES' } });
    assert.equal(badTrack.json.error.code, 'BAD_TRACK');
    assert.equal(
      (await api(base, '/api/raze', { token: alice.token, body: { territoryId: foreign, track: 'AGRICULTURE' } })).status,
      403,
    );
    // genesis AGRICULTURE 1 — the razeSalvage preview matches the payout
    const view = game.stateFor(alice.governorId).territories.find((t) => t.id === home)!;
    const preview = view.razeSalvage!['AGRICULTURE'];
    assert.equal(preview, Math.floor(developCostCtUnits('AGRICULTURE', 0, BALANCE) * E.razeSalvagePct));
    const walletBefore = game.state.ctBalances!.get(alice.governorId)!;
    const razed = (await api(base, '/api/raze', { token: alice.token, body: { territoryId: home, track: 'AGRICULTURE' } })).json;
    assert.equal(razed.salvageCtUnits, preview);
    assert.equal(razed.level, 0);
    assert.equal(razed.ctUnits, walletBefore + preview);
    assert.equal(razed.territory.development.AGRICULTURE, 0);
    const razeEv = game.tick().events.find((e) => e.type === 'territory_razed') as any;
    assert.ok(razeEv, 'territory_razed event expected');
    assert.equal(razeEv.salvageCtUnits, preview);
    assert.equal(razeEv.track, 'AGRICULTURE');

    // /api/buy-ct — the E5 purchase-cap stub
    const buy = await api(base, '/api/buy-ct', { token: alice.token, body: { amountCt: 100 } });
    assert.equal(buy.status, 501);
    assert.equal(buy.json.error.code, 'NOT_ENABLED');
    assert.match(buy.json.error.message, new RegExp(String(E.purchaseCapCtPerEpoch)));
  } finally {
    await server.stop();
  }
});

test('GET /api/economy + /internal/economy/settlement: supply identity over the wire, journal export replays', async () => {
  const game = new Game(gameConfig({ seed: 'fs3-econ' }));
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const alice = (await api(base, '/api/join', { body: { name: 'Alice' } })).json;
    const home = claimableIds(game)[0]!;
    game.claim(alice.governorId, home);
    await api(base, '/api/raise', { token: alice.token, body: { territoryId: home, preset: 'STANDARD' } });
    await api(base, '/api/enrich', { token: alice.token, body: { territoryId: home, amountCtUnits: 500 * CT } });
    for (let i = 0; i < 10; i++) server.tickOnce();

    // public telemetry — no auth needed
    const eco = (await api(base, '/api/economy')).json;
    const s = eco.supply;
    assert.equal(
      s.wallets + s.territoryTreasuries + s.enrichmentPools + s.burned + s.treasury + s.unclaimedLordYield,
      s.minted,
      'the supply identity holds over the wire',
    );
    assert.ok(s.burned > 0 && s.enrichmentPools > 0 && s.unclaimedLordYield > 0);
    assert.ok(eco.flowsByReason['raise_training'] > 0 && eco.flowsByReason['enrich'] === 500 * CT);
    assert.ok(eco.journal.headSeq >= 3 && typeof eco.journal.checksum === 'string');
    assert.ok(Object.keys(eco.journal.last24hByKind).length > 0, '24h totals by kind present');
    assert.ok(Array.isArray(eco.topRegionsByLootInflow) && eco.topRegionsByLootInflow.length > 0, 'loot heatmap rollup');
    assert.ok(eco.topRegionsByLootInflow[0].lootCtUnits > 0);
    assert.ok(Array.isArray(eco.topParcelsByLootInflow) && eco.topParcelsByLootInflow.length > 0);
    assert.equal(eco.purchaseCapCtPerEpoch, E.purchaseCapCtPerEpoch);

    // journal export: full dump, then an afterSeq slice, both checksum-anchored
    const full = (await api(base, '/internal/economy/settlement')).json;
    assert.equal(full.headSeq, eco.journal.headSeq);
    assert.equal(full.records.length, full.headSeq + 1);
    const slice = (await api(base, `/internal/economy/settlement?afterSeq=${full.headSeq - 2}`)).json;
    assert.equal(slice.records.length, 2);
    assert.equal(slice.records[0].seq, full.headSeq - 1);
    assert.equal(slice.checksum, full.checksum);
    const badSeq = await api(base, '/internal/economy/settlement?afterSeq=nope');
    assert.equal(badSeq.status, 400);

    // settlement guarantee over the exported records
    const replayed = replayJournal(full.records, game.state.economy!.pendingYield);
    assert.deepStrictEqual(replayed, supplyComponents(game.state));
  } finally {
    await server.stop();
  }
});

test('snapshot: the economy container (journal/pools/queues/investedCt) survives save/load and keeps flowing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clashfront-fs3-'));
  const savePath = join(dir, 'save.json');
  const g1 = new Game(gameConfig({ seed: 'fs3-save', savePath }));
  const alice = g1.join('Alice');
  const home = claimableIds(g1)[0]!;
  g1.claim(alice.governorId, home);
  g1.raise(alice.governorId, home, 'STANDARD');
  g1.enrich(alice.governorId, home, 100 * CT);
  g1.develop(alice.governorId, home, 'MILITARY');
  for (let i = 0; i < 3; i++) g1.tick();
  g1.saveToDisk();

  const g2 = new Game(gameConfig({ seed: 'fs3-save', savePath }));
  assert.deepStrictEqual(g2.state.economy, g1.state.economy, 'journal + supply totals survive the roundtrip');
  assert.deepStrictEqual(g2.state.enrichmentPools, g1.state.enrichmentPools);
  assert.deepStrictEqual(g2.state.trainingQueues, g1.state.trainingQueues);
  assert.deepStrictEqual(g2.state.devInvestedCt, g1.state.devInvestedCt);
  // and both worlds keep journaling identically (seq continuity)
  for (let i = 0; i < 3; i++) {
    g1.tick();
    g2.tick();
  }
  assert.deepStrictEqual(g2.state.economy!.settlementJournal, g1.state.economy!.settlementJournal);
  assert.equal(g2.state.economy!.journalChecksum, g1.state.economy!.journalChecksum);
});
