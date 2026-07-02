/**
 * E2 training-queue tests — Feature Set 3 (docs/briefs/FEATURESET-3-ECONOMY.md):
 * mustering shells (full cost up-front, 0 soldiers), materialization rate
 * (⚙ baseRatePerTick × (1 + MIL × milRateBonus)), the STANDARD ≈8-demo-tick
 * pace, the march lock, the per-territory queue cap, the muster combat
 * penalty, and queue cleanup when a mustering army dies.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  completeTraining,
  type DemoWorldFile,
  isMustering,
  loadDemoWorld,
  orderMarch,
  raiseArmy,
  runTick,
  type TickOptions,
  trainingRatePerTick,
  troopCount,
  type WorldState,
} from '../src/index';

const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 3 };
const BALANCE = loadBalance();
const TR = BALANCE.training;
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

function fixture(seed: string): { state: WorldState; rng: Rng; governorId: string; homeId: string; homeHex: string } {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(4, 4), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('gov'), {
    name: 'Marshal', kind: 'PLAYER', ctUnits: 100_000 * CT, officerNames: ['Choco', 'Maenak', 'Nara'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId, homeHex: state.territories.get(homeId)!.hexIds[0]! };
}

test('trainingRatePerTick: ⚙ base at MIL 0, +milRateBonus per level', () => {
  assert.equal(trainingRatePerTick(0, BALANCE), TR.baseRatePerTick);
  assert.equal(trainingRatePerTick(3, BALANCE), Math.round(TR.baseRatePerTick * (1 + 3 * TR.milRateBonus)));
  assert.ok(trainingRatePerTick(0, BALANCE) >= 1);
});

test('raise spawns a MUSTERING shell: 0 soldiers, full provisions, full cost charged, queue running', () => {
  const { state, rng, governorId, homeId } = fixture('muster-shell');
  const wallet0 = state.ctBalances!.get(governorId)!;
  const army = raiseArmy(state, homeId, 'STANDARD', rng.fork('orders'));
  assert.equal(troopCount(army), 0, 'the shell starts empty');
  assert.ok(army.provisions.food > 0, 'the provision pack is bought up-front');
  assert.ok(state.ctBalances!.get(governorId)! < wallet0, 'the FULL cost is paid up-front');
  assert.equal(isMustering(state, army.id), true);
  const q = state.trainingQueues!.get(army.id)!;
  assert.equal(q.territoryId, homeId);
  assert.equal(q.remaining.reduce((n, s) => n + s.count, 0), 200);
  assert.equal(q.ratePerTick, TR.baseRatePerTick);
});

test(`STANDARD (200 soldiers) musters in exactly ceil(200/${TR.baseRatePerTick}) ticks — the demo pace`, () => {
  const { state, rng, homeId } = fixture('muster-pace');
  const army = raiseArmy(state, homeId, 'STANDARD', rng.fork('orders'));
  const expectTicks = Math.ceil(200 / TR.baseRatePerTick);
  assert.ok(expectTicks >= 6 && expectTicks <= 10, 'brief: STANDARD completes in ~6–10 demo ticks');
  for (let t = 1; t <= expectTicks; t++) {
    assert.equal(isMustering(state, army.id), t !== 1 ? true : true);
    runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
    assert.equal(troopCount(army), Math.min(200, t * TR.baseRatePerTick), `tick ${t}: rate × ticks soldiers`);
  }
  assert.equal(isMustering(state, army.id), false, 'queue dissolves when the last soldier trains');
  assert.equal(state.trainingQueues!.has(army.id), false);
  // stacks filled in preset order: infantry first, then archers, then cavalry
  assert.deepEqual(army.units.map((u) => u.count), [100, 60, 40]);
});

test('a mustering army cannot march; a mustered one can', () => {
  const { state, rng, homeId, homeHex } = fixture('muster-lock');
  const army = raiseArmy(state, homeId, 'STANDARD', rng.fork('orders'));
  const next = state.adjacency!.get(homeHex)![0]!;
  assert.throws(() => orderMarch(state, army.id, [next], OPTS), /still mustering/);
  completeTraining(state, army.id);
  orderMarch(state, army.id, [next], OPTS); // no throw
  assert.equal(army.state, 'MARCHING');
});

test('queue cap: one active queue per territory (⚙); a second parcel trains in parallel', () => {
  const { state, rng, governorId, homeId, homeHex } = fixture('muster-cap');
  raiseArmy(state, homeId, 'STANDARD', rng.fork('o1'));
  assert.throws(() => raiseArmy(state, homeId, 'SCOUTS', rng.fork('o2')), /training queue busy/);
  // a second territory has its own drill yard
  const otherHex = state.adjacency!.get(homeHex)![0]!;
  const otherId = state.hexes.get(otherHex)!.territoryId!;
  claimTerritory(state, otherId, governorId);
  const second = raiseArmy(state, otherId, 'SCOUTS', rng.fork('o3'));
  assert.equal(isMustering(state, second.id), true);
  assert.equal(state.trainingQueues!.size, 2);
});

test('muster penalty: an army caught mid-muster fights at ⚙ musterPenalty of its trained strength', () => {
  const run = (defenderMustering: boolean): { defenderArmy: number; winner: string } => {
    const rng = createRng(`muster-penalty-${defenderMustering}`);
    const state = loadDemoWorld(makeGrid(3, 3), rng.fork('worldgen'), { monsterParcelPct: 0 });
    const orders = rng.fork('orders');
    const a = addGovernor(state, orders, { name: 'A', kind: 'NPC_KINGDOM', ctUnits: 50_000 * CT, officerNames: [] });
    const b = addGovernor(state, orders, { name: 'B', kind: 'NPC_KINGDOM', ctUnits: 50_000 * CT, officerNames: [] });
    const ids = [...state.territories.keys()].sort();
    const terrA = state.territories.get(ids[0]!)!;
    const hexB = state.adjacency!.get(terrA.hexIds[0]!)![0]!;
    const terrB = state.territories.get(state.hexes.get(hexB)!.territoryId!)!;
    claimTerritory(state, terrA.id, a.governorId);
    claimTerritory(state, terrB.id, b.governorId);
    const defender = raiseArmy(state, terrB.id, 'STANDARD', orders);
    completeTraining(state, defender.id);
    const attacker = raiseArmy(state, terrA.id, 'STANDARD', orders);
    completeTraining(state, attacker.id);
    terrB.foodStock = 10_000;
    if (defenderMustering) {
      // fake a live queue: same trained troops, but the camp is still forming
      state.trainingQueues!.set(defender.id, {
        armyId: defender.id,
        territoryId: terrB.id,
        remaining: [{ unitClass: 'INFANTRY', count: 50 }],
        ratePerTick: 0, // frozen — keeps troop counts identical between runs
        startedTick: 0,
      });
    }
    orderMarch(state, attacker.id, [hexB], OPTS);
    runTick(state, 1, rng.fork('sim'), BALANCE, OPTS);
    const battle = state.battles.get([...state.battles.keys()].sort()[0]!)!;
    return { defenderArmy: battle.warScore!.breakdown['defenderArmy']!, winner: battle.result!.winner };
  };
  const steady = run(false);
  const rushed = run(true);
  assert.ok(
    Math.abs(rushed.defenderArmy - steady.defenderArmy * TR.musterPenalty) < 1e-6,
    `mustering defender term ${rushed.defenderArmy} must be ×${TR.musterPenalty} of ${steady.defenderArmy}`,
  );
  assert.equal(steady.winner, 'DRAW', 'baseline: equal armies draw');
  assert.equal(rushed.winner, 'ATTACKER', 'rushing a mustering enemy is valid strategy');
});

test('an army wiped mid-muster loses its queue (soldiers die unborn, CT stays spent)', () => {
  const { state, rng, homeId } = fixture('muster-wipe');
  const army = raiseArmy(state, homeId, 'STANDARD', rng.fork('orders'));
  runTick(state, 1, rng.fork('sim'), BALANCE, OPTS); // a few soldiers exist now
  assert.ok(troopCount(army) > 0 && isMustering(state, army.id));
  army.state = 'DISBANDED'; // killed by whatever means
  runTick(state, 2, rng.fork('sim'), BALANCE, OPTS);
  assert.equal(state.trainingQueues!.has(army.id), false, 'the TRAINING sub-phase reaps dead queues');
});

test('training is deterministic (bit-identical replays)', () => {
  const run = (): WorldState => {
    const { state, rng, homeId } = fixture('muster-golden');
    raiseArmy(state, homeId, 'STANDARD', rng.fork('orders'));
    for (let t = 1; t <= 12; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
    return state;
  };
  assert.deepStrictEqual(run(), run());
});
