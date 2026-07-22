/**
 * Governor wipe + overgrowth reversion — wave 4.2 (WORLD-BUILD-OUT-PLAN,
 * owner rulings 2026-07-17): wipe is a NATURAL CONDITION (zero territories),
 * not a timer. Overgrowth is the passive path; conquest the active one.
 * CT + officers (as a pool) survive; the map is cleaned.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, TICKS_PER_DAY } from '@clashfront/shared';
import {
  addGovernor,
  assignWorkerPet,
  claimTerritory,
  type DemoWorldFile,
  loadDemoWorld,
  orderMarch,
  raiseArmy,
  completeTraining,
  runTick,
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

function fixture(seed: string) {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(3, 3), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('orders'), {
    name: 'Doomed', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

test('wipe: losing the last territory disbands garrisons, frees officers, recalls workers; CT survives', () => {
  const f = fixture('wipe-basic');
  const army = raiseArmy(f.state, f.homeId, 'SCOUTS', f.rng.fork('raise'));
  completeTraining(f.state, army.id);
  assignWorkerPet(f.state, f.governorId, f.homeId, 'Matara', 'Earth', 'NONE', 'MINE', f.rng.fork('w'), BALANCE);
  // Overseer assignment exists from claimTerritory.
  const officers = f.state.officers!.get(f.governorId)!;
  assert.ok(officers.some((o) => o.assignedTerritoryId === f.homeId), 'overseer assigned pre-wipe');
  const ct0 = f.state.ctBalances!.get(f.governorId)!;

  // Simulate conquest of the last territory: hand it to the wild.
  const wildGov = [...f.state.governorKinds!.entries()].find(([, k]) => k === 'SYSTEM')![0]!;
  const terr = f.state.territories.get(f.homeId)!;
  terr.governorId = wildGov;
  terr.governorKind = 'SYSTEM';
  delete terr.overseerId;

  runTick(f.state, 1, f.rng.fork('sim'), BALANCE);

  assert.equal(f.state.armies.get(army.id)!.state, 'DISBANDED', 'garrison army disbanded');
  assert.equal(workersAt(f.state, f.homeId).length, 0, 'worker pets walked home');
  assert.ok(
    f.state.officers!.get(f.governorId)!.every((o) => o.assignedTerritoryId === undefined),
    'all officer assignments cleared (EXILE pool)',
  );
  assert.equal(f.state.ctBalances!.get(f.governorId)!, ct0, 'CT balance untouched');
});

test('wipe grace: a MARCHING army survives the wipe tick (arrival may re-establish)', () => {
  const f = fixture('wipe-grace');
  const army = raiseArmy(f.state, f.homeId, 'SCOUTS', f.rng.fork('raise'));
  completeTraining(f.state, army.id);
  // March the army away, then lose the territory the same tick.
  const homeHex = f.state.territories.get(f.homeId)!.hexIds[0]!;
  const away = f.state.adjacency!.get(homeHex)![0]!;
  orderMarch(f.state, army.id, [away], { travelTicksPerStep: 5 });
  const wildGov = [...f.state.governorKinds!.entries()].find(([, k]) => k === 'SYSTEM')![0]!;
  const terr = f.state.territories.get(f.homeId)!;
  terr.governorId = wildGov;
  terr.governorKind = 'SYSTEM';

  runTick(f.state, 1, f.rng.fork('sim'), BALANCE, { travelTicksPerStep: 5 });
  assert.equal(f.state.armies.get(army.id)!.state, 'MARCHING', 'marching army survives the wipe tick');
});

test('overgrowth: untrodden owned land drifts to 100 and reverts to WILD (buildings stay)', () => {
  const f = fixture('wipe-overgrow');
  const terr = f.state.territories.get(f.homeId)!;
  terr.development.AGRICULTURE = 3; // "buildings"/development to preserve
  // Push lastTroddenTick far into the past — beyond grace.
  terr.lastTroddenTick = -(CONSTANTS.REWILD_GRACE_DAYS * TICKS_PER_DAY + 10_000);
  terr.overgrowth = 99;
  // Free the overseer so nothing treads the land (claimTerritory assigned one —
  // treading is army/trodden-based in this sim, so just tick).
  let reverted = false;
  for (let t = 1; t <= TICKS_PER_DAY && !reverted; t++) {
    runTick(f.state, t, f.rng.fork('sim'), BALANCE);
    reverted = f.state.territories.get(f.homeId)!.governorKind === 'SYSTEM';
  }
  assert.ok(reverted, 'land reverted to WILD');
  const after = f.state.territories.get(f.homeId)!;
  assert.equal(after.development.AGRICULTURE, 3, 'development STAYS with the land');
  assert.equal(after.overseerId, undefined, 'overseer cleared');
});

test('recently-trodden land never overgrows', () => {
  const f = fixture('wipe-tended');
  const terr = f.state.territories.get(f.homeId)!;
  terr.lastTroddenTick = 0;
  terr.overgrowth = 0;
  for (let t = 1; t <= 20; t++) runTick(f.state, t, f.rng.fork('sim'), BALANCE);
  assert.equal(f.state.territories.get(f.homeId)!.overgrowth, 0, 'no drift inside grace');
  assert.equal(f.state.territories.get(f.homeId)!.governorKind, 'PLAYER');
});
