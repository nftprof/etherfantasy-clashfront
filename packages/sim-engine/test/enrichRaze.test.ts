/**
 * E3 enrichment + E4 raze tests — Feature Set 3 (docs/briefs/FEATURESET-3-ECONOMY.md):
 * enrich routes through the splitter (pool < paid — leakage is the design),
 * pools pay ⚙ enrichYieldPctPerDay to the CURRENT governor with an integer
 * carry, SYSTEM pools accumulate, conquest inherits the pool; raze salvages
 * ⚙ razeSalvagePct of the level's original cost (marked mint), burns the rest,
 * synthesizes investedCt for seeded levels, and guards level-0/wilds.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, TICKS_PER_DAY, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  developCostCtUnits,
  developTerritory,
  type DemoWorldFile,
  enrichTerritory,
  ensureEconomy,
  investedCtUnits,
  loadDemoWorld,
  razeTerritory,
  runTick,
  syntheticInvestedCtUnits,
  type TickOptions,
  type WorldState,
} from '../src/index';

const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 3 };
const BALANCE = loadBalance();
const E = BALANCE.economy;
const CT = CONSTANTS.CT_UNITS_PER_CT;

/** Synthetic demo-world file: cols×rows grid of square parcels, 4-way adjacency. */
function makeGrid(cols: number, rows: number): DemoWorldFile {
  const pid = (i: number) => `P${String(i).padStart(4, '0')}`;
  const parcels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * 2;
      const y = r * 2;
      const neighbors: string[] = [];
      if (c > 0) neighbors.push(pid(i - 1));
      if (c < cols - 1) neighbors.push(pid(i + 1));
      if (r > 0) neighbors.push(pid(i - cols));
      if (r < rows - 1) neighbors.push(pid(i + cols));
      parcels.push({
        parcelId: pid(i),
        tokenId: pid(i),
        center: [x, y] as [number, number],
        polygon: [[x - 1, y - 1], [x + 1, y - 1], [x + 1, y + 1], [x - 1, y + 1]] as [number, number][],
        neighbors: neighbors.sort(),
      });
    }
  }
  return {
    meta: { zone: 'TEST', sliceBBox: [-1, -1, cols * 2 - 1, rows * 2 - 1], generatedFrom: 'test-fixture' },
    parcels,
  };
}

function fixture(seed: string): { state: WorldState; rng: Rng; governorId: string; homeId: string } {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(4, 4), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('gov'), {
    name: 'Patron', kind: 'PLAYER', ctUnits: 100_000 * CT, officerNames: ['Choco', 'Maenak', 'Nara'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

// ── E3: enrichment ────────────────────────────────────────────────────────────

test('enrich: wallet debited in full; LANDYIELD share seeds the pools (leakage is the design)', () => {
  const { state, rng: _rng, governorId, homeId } = fixture('enrich-basic');
  const wallet0 = state.ctBalances!.get(governorId)!;
  const amount = 1_000 * CT;
  const { splits, poolCtUnits } = enrichTerritory(state, homeId, amount, BALANCE);
  assert.equal(state.ctBalances!.get(governorId), wallet0 - amount, 'the full amount leaves the wallet');
  assert.equal(splits.landYield, Math.floor(amount * E.landYieldShare));
  assert.equal(poolCtUnits, Math.floor(splits.landYield * E.landYieldSelfPct), 'this parcel pools the ⚙ self share');
  assert.ok(poolCtUnits < amount, 'the pool receives less than paid — the rest leaked to loot/lords/burn');
  // guards
  assert.throws(() => enrichTerritory(state, homeId, 0, BALANCE), /positive integer/);
  assert.throws(() => enrichTerritory(state, homeId, 10.5, BALANCE), /positive integer/);
  assert.throws(() => enrichTerritory(state, homeId, 10 ** 15, BALANCE), /insufficient CT/);
  const wild = [...state.territories.keys()].sort().find((id) => state.territories.get(id)!.governorKind === 'SYSTEM')!;
  assert.throws(() => enrichTerritory(state, wild, 1000, BALANCE), /ungoverned wilds/);
});

test('pool payout: ⚙ enrichYieldPctPerDay per tick with integer carry, to the CURRENT governor', () => {
  const { state, rng, governorId, homeId } = fixture('enrich-payout');
  state.territories.get(homeId)!.population = 0; // quiet world
  const pool0 = 144 * CT; // 1,440,000 → perDay 144,000 → exactly 100 ct_units per tick
  state.enrichmentPools!.set(homeId, pool0);
  const wallet0 = state.ctBalances!.get(governorId)!;

  runTick(state, 1, rng.fork('sim'), BALANCE, OPTS);
  const firstPay = Math.floor(Math.floor(pool0 * E.enrichYieldPctPerDay) / TICKS_PER_DAY);
  assert.equal(state.ctBalances!.get(governorId), wallet0 + firstPay, 'tick 1 pays the carry-exact amount');
  assert.equal(state.enrichmentPools!.get(homeId), pool0 - firstPay, 'every ct_unit paid left the pool');

  for (let t = 2; t <= 50; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
  const paid = state.ctBalances!.get(governorId)! - wallet0;
  assert.equal(state.enrichmentPools!.get(homeId), pool0 - paid, 'wallet gain === pool drain (redistribution)');
  assert.ok(paid > firstPay && Number.isInteger(paid));
});

test('SYSTEM-held pools accumulate silently; conquest inherits the remaining pool', () => {
  const { state, rng, governorId, homeId } = fixture('enrich-inherit');
  // Enriching home also seeds ring-1 neighbors — including a wild parcel.
  enrichTerritory(state, homeId, 10_000 * CT, BALANCE);
  const homeHex = state.territories.get(homeId)!.hexIds[0]!;
  const wildHex = state.adjacency!.get(homeHex)![0]!;
  const wildId = state.hexes.get(wildHex)!.territoryId!;
  const wildPool = state.enrichmentPools!.get(wildId) ?? 0;
  assert.ok(wildPool > 0, 'ring-1 wild neighbor got its LANDYIELD cut');

  for (let t = 1; t <= 20; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
  assert.equal(state.enrichmentPools!.get(wildId), wildPool, 'wild pools pay NO ONE — they accumulate');

  // Bloodless claim of the wild parcel: the pool is attached to the LAND.
  claimTerritory(state, wildId, governorId);
  const wallet0 = state.ctBalances!.get(governorId)!;
  runTick(state, 21, rng.fork('sim'), BALANCE, OPTS);
  assert.ok(state.ctBalances!.get(governorId)! > wallet0, 'the new holder collects the inherited yield');
  assert.ok(state.enrichmentPools!.get(wildId)! < wildPool, 'the inherited pool is draining to its new lord');
});

// ── E4: raze ──────────────────────────────────────────────────────────────────

test('raze: salvages ⚙ razeSalvagePct of the level cost, burns the rest, books the marked mint', () => {
  const { state, governorId, homeId } = fixture('raze-basic');
  developTerritory(state, homeId, 'ECONOMY', BALANCE); // level 1
  developTerritory(state, homeId, 'ECONOMY', BALANCE); // level 2
  const t = state.territories.get(homeId)!;
  const eco = ensureEconomy(state);
  const wallet0 = state.ctBalances!.get(governorId)!;
  const burned0 = eco.burnedTotal;
  const minted0 = eco.mintedTotal;
  const invested0 = investedCtUnits(state, homeId, 'ECONOMY', BALANCE);

  const levelCost = developCostCtUnits('ECONOMY', 1, BALANCE); // the level being razed (2 → 1)
  const result = razeTerritory(state, homeId, 'ECONOMY', BALANCE);
  assert.equal(result.level, 1);
  assert.equal(result.salvageCtUnits, Math.floor(levelCost * E.razeSalvagePct));
  assert.equal(result.burnedCtUnits, levelCost - result.salvageCtUnits);
  assert.equal(t.development.ECONOMY, 1);
  assert.equal(state.ctBalances!.get(governorId), wallet0 + result.salvageCtUnits);
  assert.equal(eco.burnedTotal, burned0 + result.burnedCtUnits);
  // the salvage re-mint is EXPLICIT and marked (E5: no silent faucets)
  assert.equal(eco.mintedTotal, minted0 + levelCost);
  assert.equal(eco.flowsByReason['mint:raze_salvage'], result.salvageCtUnits);
  assert.equal(eco.flowsByReason['mint:raze'], result.burnedCtUnits);
  assert.equal(investedCtUnits(state, homeId, 'ECONOMY', BALANCE), invested0 - levelCost);
  // journal carries the REWARD(mint) + BURN(mint) pair
  const tail = eco.settlementJournal.slice(-2);
  assert.deepEqual(tail.map((r) => r.kind), ['REWARD', 'BURN']);
  assert.deepEqual(tail.map((r) => r.source), ['mint', 'mint']);

  // build→raze cycle nets a heavy loss for the builder: spent 100%, recovered ⚙40%
  assert.ok(result.salvageCtUnits < levelCost * 0.5);
});

test('raze: seeded levels get a synthetic investedCt from the cost curve; guards hold', () => {
  const { state, governorId, homeId } = fixture('raze-synthetic');
  const t = state.territories.get(homeId)!;
  // genesis worlds seed AGRICULTURE 1 without a develop order
  assert.equal(t.development.AGRICULTURE, 1);
  assert.equal(
    investedCtUnits(state, homeId, 'AGRICULTURE', BALANCE),
    syntheticInvestedCtUnits('AGRICULTURE', 1, BALANCE),
  );
  const wallet0 = state.ctBalances!.get(governorId)!;
  const result = razeTerritory(state, homeId, 'AGRICULTURE', BALANCE);
  assert.equal(result.level, 0);
  assert.equal(result.salvageCtUnits, Math.floor(developCostCtUnits('AGRICULTURE', 0, BALANCE) * E.razeSalvagePct));
  assert.equal(state.ctBalances!.get(governorId), wallet0 + result.salvageCtUnits);
  // nothing left to raze
  assert.throws(() => razeTerritory(state, homeId, 'AGRICULTURE', BALANCE), /no level to raze/);
  assert.throws(() => razeTerritory(state, homeId, 'DEFENSE', BALANCE), /no level to raze/);
  const wild = [...state.territories.keys()].sort().find((id) => state.territories.get(id)!.governorKind === 'SYSTEM')!;
  assert.throws(() => razeTerritory(state, wild, 'AGRICULTURE', BALANCE), /ungoverned wilds/);
});

test('enrich → payout → raze flow is deterministic (bit-identical replays)', () => {
  const run = (): WorldState => {
    const { state, rng, homeId } = fixture('enrich-golden');
    enrichTerritory(state, homeId, 5_000 * CT, BALANCE);
    developTerritory(state, homeId, 'MILITARY', BALANCE);
    for (let t = 1; t <= 10; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
    razeTerritory(state, homeId, 'MILITARY', BALANCE);
    for (let t = 11; t <= 20; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
    return state;
  };
  assert.deepStrictEqual(run(), run());
});
