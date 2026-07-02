/**
 * Territory development tests — Feature Set 2 F4 (docs/briefs/FEATURESET-2.md):
 * geometric CT cost + the ⚙ maxLevel cap, and every track's sim effect —
 * AGRI food-per-tick (integer carry), ECON CT trickle to the governor,
 * DEF defender WarScore multiplier, MIL raise-cost discount.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, TICKS_PER_DAY, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  completeTraining,
  developCostCtUnits,
  developTerritory,
  type DemoWorldFile,
  loadDemoWorld,
  orderMarch,
  raiseArmy,
  raiseCost,
  runTick,
  type TickOptions,
  type WorldState,
} from '../src/index';

const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 3 };
const BALANCE = loadBalance();
const CT = CONSTANTS.CT_UNITS_PER_CT;
const DE = BALANCE.developmentEffects;

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
  const state = loadDemoWorld(makeGrid(3, 3), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('gov'), {
    name: 'Builder', kind: 'PLAYER', ctUnits: 100_000 * CT, officerNames: ['Choco', 'Maenak'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

test('develop cost: base × growth^level, wallet charged, ⚙ maxLevel cap, no partial mutation', () => {
  const { state, governorId, homeId } = fixture('dev-cost');
  const t = state.territories.get(homeId)!;
  const base = BALANCE.development.baseCostCtUnits.ECONOMY;
  const growth = BALANCE.development.costGrowthPerLevel;
  assert.equal(developCostCtUnits('ECONOMY', 0, BALANCE), base);
  assert.equal(developCostCtUnits('ECONOMY', 3, BALANCE), Math.round(base * growth ** 3));

  const wallet0 = state.ctBalances!.get(governorId)!;
  const r1 = developTerritory(state, homeId, 'ECONOMY', BALANCE);
  assert.deepEqual(r1, { level: 1, costCtUnits: base });
  assert.equal(t.development.ECONOMY, 1);
  assert.equal(state.ctBalances!.get(governorId), wallet0 - base);
  const r2 = developTerritory(state, homeId, 'ECONOMY', BALANCE);
  assert.equal(r2.costCtUnits, Math.round(base * growth), 'level 2 costs base×growth');

  // cap
  t.development.AGRICULTURE = BALANCE.development.maxLevel;
  assert.throws(() => developTerritory(state, homeId, 'AGRICULTURE', BALANCE), /max level/);
  // insolvency mutates nothing
  state.ctBalances!.set(governorId, 0);
  const before = structuredClone(t);
  assert.throws(() => developTerritory(state, homeId, 'DEFENSE', BALANCE), /insufficient CT/);
  assert.deepStrictEqual(state.territories.get(homeId), before);
  // ungoverned wilds cannot be developed
  const wild = [...state.territories.keys()].sort().find((id) => state.territories.get(id)!.governorKind === 'SYSTEM')!;
  assert.throws(() => developTerritory(state, wild, 'ECONOMY', BALANCE), /ungoverned wilds/);
});

test('AGRI: food production lands per tick via the integer carry (no more floor-to-zero)', () => {
  const { state, rng, homeId } = fixture('dev-agri');
  const t = state.territories.get(homeId)!;
  t.development.AGRICULTURE = 5;
  t.prosperity = 50;
  t.population = 0; // isolate production from consumption
  const perDay = Math.floor(BALANCE.food.productionBasePerAgriLevelPerDay * 5 * 0.75);
  const food0 = t.foodStock;
  const N = 100;
  for (let i = 1; i <= N; i++) runTick(state, i, rng.fork('sim'), BALANCE, OPTS);
  assert.equal(
    t.foodStock,
    food0 + Math.floor((N * perDay) / TICKS_PER_DAY),
    'carry math must telescope exactly',
  );
  assert.ok(t.foodStock > food0, 'low-level production must not floor to zero anymore');
});

test('ECON: the territory treasury pays the governor per tick (integer, carry-exact, never a mint)', () => {
  const { state, rng, governorId, homeId } = fixture('dev-econ');
  const t = state.territories.get(homeId)!;
  t.development.ECONOMY = 3;
  t.population = 0;
  t.ctTreasury = 1_000_000; // stocked larder — E5: ECON yield is REDISTRIBUTION from the treasury
  const treasury0 = t.ctTreasury;
  const wallet0 = state.ctBalances!.get(governorId)!;
  const N = 25;
  for (let i = 1; i <= N; i++) runTick(state, i, rng.fork('sim'), BALANCE, OPTS);
  const expected = Math.floor((N * 3 * DE.econCtUnitsPerLevelPerDay) / TICKS_PER_DAY);
  assert.equal(state.ctBalances!.get(governorId), wallet0 + expected);
  assert.equal(t.ctTreasury, treasury0 - expected, 'every ct_unit paid came out of the treasury');
  assert.ok(expected > 0, 'the yield actually drips');
  assert.ok(Number.isInteger(state.ctBalances!.get(governorId)!), 'integer money');

  // A drained treasury pays nothing (no mint, capped at what the larder holds).
  t.ctTreasury = 0;
  const wallet1 = state.ctBalances!.get(governorId)!;
  for (let i = N + 1; i <= N + 10; i++) runTick(state, i, rng.fork('sim'), BALANCE, OPTS);
  assert.equal(state.ctBalances!.get(governorId), wallet1, 'empty treasury ⇒ no yield');
  assert.equal(t.ctTreasury, 0, 'treasury never goes negative');
});

test('DEF: defender WarScore ×(1 + 0.1×level) turns an even fight into a defender win', () => {
  const run = (defenseLevel: number) => {
    const rng = createRng(`dev-def-${defenseLevel}`);
    const state = loadDemoWorld(makeGrid(3, 3), rng.fork('worldgen'), { monsterParcelPct: 0 });
    const orders = rng.fork('orders');
    const a = addGovernor(state, orders, { name: 'A', kind: 'NPC_KINGDOM', ctUnits: 10_000 * CT, officerNames: [] });
    const b = addGovernor(state, orders, { name: 'B', kind: 'NPC_KINGDOM', ctUnits: 10_000 * CT, officerNames: [] });
    const ids = [...state.territories.keys()].sort();
    const terrA = state.territories.get(ids[0]!)!;
    const hexB = state.adjacency!.get(terrA.hexIds[0]!)![0]!;
    const terrB = state.territories.get(state.hexes.get(hexB)!.territoryId!)!;
    claimTerritory(state, terrA.id, a.governorId);
    claimTerritory(state, terrB.id, b.governorId);
    completeTraining(state, raiseArmy(state, terrB.id, 'STANDARD', orders).id); // defender
    const attacker = raiseArmy(state, terrA.id, 'STANDARD', orders);
    completeTraining(state, attacker.id);
    terrB.foodStock = 10_000; // fed defender
    terrB.development.DEFENSE = defenseLevel;
    orderMarch(state, attacker.id, [hexB], OPTS);
    runTick(state, 1, rng.fork('sim'), BALANCE, OPTS);
    return state.battles.get([...state.battles.keys()].sort()[0]!)!;
  };

  // Baseline: equal armies + attacker command center ⇒ a DRAW (logistics suite).
  const flat = run(0);
  assert.equal(flat.warScore!.breakdown['defenseDev'], 1);
  assert.equal(flat.result!.winner, 'DRAW');
  // Earthworks at level 5: ×1.5 defense — decisive hold.
  const dug = run(5);
  assert.equal(dug.warScore!.breakdown['defenseDev'], 1 + DE.defenseWarScorePerLevel * 5);
  assert.equal(dug.result!.winner, 'DEFENDER');
  assert.equal(dug.result!.territoryOutcome, 'HELD');
});

test('MIL: raise-cost training discount per level on the raising parcel (⚙ capped)', () => {
  const flat = raiseCost('STANDARD', BALANCE, 0);
  const drilled = raiseCost('STANDARD', BALANCE, 3);
  assert.equal(flat.milDiscountPct, 0);
  assert.equal(drilled.milDiscountPct, DE.milRaiseDiscountPerLevel * 3);
  assert.equal(drilled.unitsCtUnits, Math.floor(flat.unitsCtUnits * (1 - drilled.milDiscountPct)));
  assert.equal(drilled.provisionsCtUnits, flat.provisionsCtUnits, 'provisions stay market price');
  const maxed = raiseCost('STANDARD', BALANCE, 99);
  assert.equal(maxed.milDiscountPct, DE.milRaiseDiscountMax, 'discount caps');

  // and raiseArmy actually charges the discounted price
  const { state, rng, governorId, homeId } = fixture('dev-mil');
  state.territories.get(homeId)!.development.MILITARY = 3;
  const wallet0 = state.ctBalances!.get(governorId)!;
  raiseArmy(state, homeId, 'STANDARD', rng.fork('orders'));
  assert.equal(state.ctBalances!.get(governorId), wallet0 - drilled.totalCtUnits);
});
