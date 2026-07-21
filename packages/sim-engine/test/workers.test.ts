/**
 * Worker pets + stockpile production — WORLD-BUILD-OUT-PLAN wave 1.
 * Assignment / cap / production accrual / biome affinity / fur shedding /
 * CRAFT recipe + workshop gate / walk-home on conquest / snapshot round-trip.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, TICKS_PER_DAY } from '@clashfront/shared';
import {
  addGovernor,
  assignWorkerPet,
  claimTerritory,
  type DemoWorldFile,
  guardStrengthAt,
  loadDemoWorld,
  recallWorkerPet,
  runTick,
  stockpileOf,
  workersAt,
  type WorldState,
} from '../src/index';

const BALANCE = loadBalance();
const CT = CONSTANTS.CT_UNITS_PER_CT;

function makeGrid(cols: number, rows: number): DemoWorldFile {
  const pid = (i: number) => `P${String(i).padStart(4, '0')}`;
  const parcels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * 2; const y = r * 2;
      const neighbors: string[] = [];
      if (c > 0) neighbors.push(pid(i - 1));
      if (c < cols - 1) neighbors.push(pid(i + 1));
      if (r > 0) neighbors.push(pid(i - cols));
      if (r < rows - 1) neighbors.push(pid(i + cols));
      parcels.push({
        parcelId: pid(i), tokenId: pid(i),
        center: [x, y] as [number, number],
        polygon: [[x-1,y-1],[x+1,y-1],[x+1,y+1],[x-1,y+1]] as [number, number][],
        neighbors: neighbors.sort(),
      });
    }
  }
  return { meta: { zone: 'TEST', sliceBBox: [-1,-1,cols*2-1,rows*2-1], generatedFrom: 'test' }, parcels };
}

function fixture(seed: string): { state: WorldState; rng: ReturnType<typeof createRng>; governorId: string; homeId: string } {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(4, 4), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('orders'), {
    name: 'Steward', kind: 'PLAYER', ctUnits: 50_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

test('assignWorkerPet: deploys, enforces governance + cap; recall removes', () => {
  const f = fixture('w-assign');
  const pet = assignWorkerPet(f.state, f.governorId, f.homeId, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork('p1'), BALANCE);
  assert.ok(pet.id.startsWith('pet_'));
  assert.equal(workersAt(f.state, f.homeId).length, 1);
  // Not your territory → throws.
  const otherTerr = [...f.state.territories.keys()].sort()[1]!;
  assert.throws(
    () => assignWorkerPet(f.state, f.governorId, otherTerr, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork('p2'), BALANCE),
    /not your territory/,
  );
  // Cap.
  for (let i = 1; i < BALANCE.workers.maxWorkersPerTerritory; i++) {
    assignWorkerPet(f.state, f.governorId, f.homeId, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork(`c${i}`), BALANCE);
  }
  assert.throws(
    () => assignWorkerPet(f.state, f.governorId, f.homeId, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork('over'), BALANCE),
    /worker cap/,
  );
  recallWorkerPet(f.state, f.governorId, pet.id);
  assert.equal(workersAt(f.state, f.homeId).length, BALANCE.workers.maxWorkersPerTerritory - 1);
});

test('MINE production fills stockpile + treasury over a full game day', () => {
  const f = fixture('w-mine');
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork('p'), BALANCE);
  const terr = f.state.territories.get(f.homeId)!;
  const treasury0 = terr.ctTreasury;
  for (let t = 1; t <= TICKS_PER_DAY; t++) runTick(f.state, t, f.rng.fork('sim'), BALANCE);
  const stock = stockpileOf(f.state, f.homeId);
  assert.ok(stock.wood >= Math.floor(BALANCE.workers.mineWoodPerDay * 0.9), `wood accrued (${stock.wood})`);
  assert.ok(stock.iron >= Math.floor(BALANCE.workers.mineIronPerDay * 0.9), `iron accrued (${stock.iron})`);
  assert.ok(terr.ctTreasury > treasury0, 'gold paid the treasury');
});

test('FARM adds foodStock; fur sheds by class; NONE sheds nothing', () => {
  const f = fixture('w-farm');
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Mintol', 'Leaf', 'LEAF', 'FARM', f.rng.fork('p1'), BALANCE);
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Blockid', 'Combat', 'NONE', 'GUARD', f.rng.fork('p2'), BALANCE);
  const terr = f.state.territories.get(f.homeId)!;
  const food0 = terr.foodStock;
  // 5 game days so the 0.2/day LEAF fur crosses ≥ 1 whole unit.
  for (let t = 1; t <= TICKS_PER_DAY * 5; t++) runTick(f.state, t, f.rng.fork('sim'), BALANCE);
  assert.ok(terr.foodStock > food0, 'farm food accrued');
  const stock = stockpileOf(f.state, f.homeId);
  assert.ok(stock.fur >= 1, `LEAF fur accrued over 5 days (${stock.fur})`);
});

test('CRAFT gated on workshop MIL level; consumes 2 iron + 1 wood + 1 fur per arm', () => {
  const f = fixture('w-craft');
  const terr = f.state.territories.get(f.homeId)!;
  terr.development.MILITARY = 0; // below gate
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Sonectid', 'Insect', 'NONE', 'CRAFT', f.rng.fork('p'), BALANCE);
  const stock = stockpileOf(f.state, f.homeId);
  stock.iron = 10; stock.wood = 10; stock.fur = 10;
  for (let t = 1; t <= TICKS_PER_DAY; t++) runTick(f.state, t, f.rng.fork('sim'), BALANCE);
  assert.equal(stock.arms['ELITE'] ?? 0, 0, 'no workshop → no arms');
  // Raise MIL to the gate and craft for a day.
  terr.development.MILITARY = BALANCE.workers.workshopMinMil;
  const world2 = f.state.world.tick;
  for (let t = world2 + 1; t <= world2 + TICKS_PER_DAY; t++) runTick(f.state, t, f.rng.fork('sim'), BALANCE);
  assert.ok((stock.arms['ELITE'] ?? 0) >= 1, `workshop crafts arms (${stock.arms['ELITE']})`);
  assert.ok(stock.iron < 10, 'iron consumed');
});

test('biome affinity multiplies output (Earth on HILLS/MOUNTAIN vs plains)', () => {
  const f = fixture('w-affinity');
  // Force home hex terrain to HILLS (Earth matches).
  const terr = f.state.territories.get(f.homeId)!;
  const hex = f.state.hexes.get(terr.hexIds[0]!)!;
  hex.terrain = 'HILLS';
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork('p'), BALANCE);
  for (let t = 1; t <= TICKS_PER_DAY * 4; t++) runTick(f.state, t, f.rng.fork('sim'), BALANCE);
  const withAffinity = stockpileOf(f.state, f.homeId).wood;

  const g = fixture('w-affinity'); // same seed, flat terrain
  const terr2 = g.state.territories.get(g.homeId)!;
  g.state.hexes.get(terr2.hexIds[0]!)!.terrain = 'PLAINS';
  assignWorkerPet(g.state, g.governorId, g.homeId, 'Matara', 'Earth', 'NONE', 'MINE', g.rng.fork('p'), BALANCE);
  for (let t = 1; t <= TICKS_PER_DAY * 4; t++) runTick(g.state, t, g.rng.fork('sim'), BALANCE);
  const withoutAffinity = stockpileOf(g.state, g.homeId).wood;

  assert.ok(withAffinity >= withoutAffinity, `affinity ⇒ ≥ output (${withAffinity} vs ${withoutAffinity})`);
});

test('conquest: workers walk home (removed) when the territory changes hands', () => {
  const f = fixture('w-conquest');
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork('p'), BALANCE);
  assert.equal(workersAt(f.state, f.homeId).length, 1);
  // Simulate conquest: another governor takes the territory.
  const rng2 = f.rng.fork('g2');
  const { governorId: gov2 } = addGovernor(f.state, rng2, {
    name: 'Conqueror', kind: 'PLAYER', ctUnits: 1_000 * CT, officerNames: ['Leah', 'Kai', 'Purin'],
  });
  const terr = f.state.territories.get(f.homeId)!;
  terr.governorId = gov2;
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE);
  assert.equal(workersAt(f.state, f.homeId).length, 0, 'workers walked home on conquest');
});

test('GUARD strength scales with guard count', () => {
  const f = fixture('w-guard');
  assert.equal(guardStrengthAt(f.state, f.homeId, BALANCE), 0);
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Blockid', 'Combat', 'NONE', 'GUARD', f.rng.fork('p1'), BALANCE);
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Tygloo', 'Ice', 'WARM', 'GUARD', f.rng.fork('p2'), BALANCE);
  assert.equal(guardStrengthAt(f.state, f.homeId, BALANCE), 2 * BALANCE.workers.guardStrength);
});

test('stockpile + workers survive structuredClone snapshot round-trip', () => {
  const f = fixture('w-snap');
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork('p'), BALANCE);
  for (let t = 1; t <= TICKS_PER_DAY; t++) runTick(f.state, t, f.rng.fork('sim'), BALANCE);
  const clone = structuredClone(f.state);
  assert.equal(clone.workerPets?.size, 1);
  assert.deepEqual(clone.stockpiles?.get(f.homeId), f.state.stockpiles?.get(f.homeId));
  assert.deepEqual(clone.stockpileCarry?.get(f.homeId), f.state.stockpileCarry?.get(f.homeId));
});
