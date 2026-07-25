/**
 * Wave 4.7 — logistics supply lines (docs/01 §5.2): the Dijkstra graph check.
 * Supplied at a friendly source; drains when the road is cut by hostile
 * occupation; roads (moveCost 0.5) extend reach; a distant army beyond range
 * starves. No friendly source anywhere ⇒ never supplied.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance } from '@clashfront/shared';
import type { Army, UnitStack } from '@clashfront/shared';
import {
  addGovernor,
  armyOwnersByHex,
  type DemoWorldFile,
  isSuppliedGraph,
  loadDemoWorld,
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

const UNITS: UnitStack[] = [{ unitClass: 'INFANTRY', count: 100, veterancy: 0, hp: 100 }];

function placeArmy(state: WorldState, gov: string, hexId: string, id: string): Army {
  const a: Army = {
    id, worldId: state.world.id, ownerGovernorId: gov, state: 'GARRISON', hexId,
    units: UNITS.map((u) => ({ ...u })), provisions: { food: 10, gold: 0, wood: 0 },
    supply: 50, supplyMax: CONSTANTS.SUPPLY_MAX_DEFAULT, morale: 70, supplyTrainIds: [], version: 1,
  };
  state.armies.set(a.id, a);
  return a;
}

/** A wide line of claimed friendly territory: parcel 0 = supply source seat, the rest a supply corridor. */
function corridorFixture(seed: string, len = 8) {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(len, 1), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('orders'), {
    name: 'Quartermaster', kind: 'PLAYER', ctUnits: 1_000_000 * CT, officerNames: ['A', 'B', 'C'],
  });
  // Order territories by SPATIAL position (hex center-x), NOT ULID — parcel i
  // sits at center-x = i·2, so this recovers the straight-line corridor order.
  const terrIds = [...state.territories.keys()].sort((a, b) => {
    const ax = state.hexes.get(state.territories.get(a)!.hexIds[0]!)!.q;
    const bx = state.hexes.get(state.territories.get(b)!.hexIds[0]!)!.q;
    return ax - bx;
  });
  // Own the whole line so the route graph is friendly-controlled end to end
  // (set ownership directly — this unit test isn't exercising the overseer cap).
  terrIds.forEach((tid, i) => {
    const t = state.territories.get(tid)!;
    t.governorId = governorId;
    t.governorKind = 'PLAYER';
    t.supplySource = i === 0; // only the seat territory is a supply source
  });
  const hexOf = (i: number) => state.territories.get(terrIds[i]!)!.hexIds[0]!;
  return { state, governorId, terrIds, hexOf };
}

test('supplied at a friendly source; a nearby friendly hex within range is supplied', () => {
  const f = corridorFixture('supply-basic');
  const atSource = placeArmy(f.state, f.governorId, f.hexOf(0), 'army_A0000000000000000000001');
  const nearby = placeArmy(f.state, f.governorId, f.hexOf(3), 'army_A0000000000000000000002');
  const owners = armyOwnersByHex(f.state);
  assert.equal(isSuppliedGraph(f.state, atSource, BALANCE, owners), true, 'on the source');
  // 3 plains hops (moveCost 1 each) = weighted dist 3 ≤ range 10.
  assert.equal(isSuppliedGraph(f.state, nearby, BALANCE, owners), true, 'within range along the corridor');
});

test('a hostile army astride the corridor cuts the line', () => {
  const f = corridorFixture('supply-cut');
  const far = placeArmy(f.state, f.governorId, f.hexOf(5), 'army_A0000000000000000000003');
  // Enemy governor plants an army on hex 2 — the only route back to the source.
  const { governorId: enemy } = addGovernor(f.state, createRng('enemy').fork('e'), {
    name: 'Raider', kind: 'PLAYER', ctUnits: 0, officerNames: ['X'],
  });
  placeArmy(f.state, enemy, f.hexOf(2), 'army_E0000000000000000000001');
  const owners = armyOwnersByHex(f.state);
  assert.equal(isSuppliedGraph(f.state, far, BALANCE, owners), false, 'road cut ⇒ unsupplied');
  // Remove the blockade → supplied again.
  f.state.armies.delete('army_E0000000000000000000001');
  assert.equal(
    isSuppliedGraph(f.state, far, BALANCE, armyOwnersByHex(f.state)),
    true,
    'road reopened ⇒ supplied',
  );
});

test('beyond weighted range on plains ⇒ starving', () => {
  const f = corridorFixture('supply-range', 14);
  // Hex 12: 12 plains hops (weighted 12) > range 10 ⇒ out of reach.
  const distant = placeArmy(f.state, f.governorId, f.hexOf(12), 'army_A0000000000000000000004');
  assert.equal(
    isSuppliedGraph(f.state, distant, BALANCE, armyOwnersByHex(f.state)),
    false,
    'too far along the corridor',
  );
});

test('roads (moveCost 0.5) double the effective reach', () => {
  const f = corridorFixture('supply-roads', 14);
  // Pave the corridor: every hex a ROAD (moveCost 0.5). Now hex 12 is weighted 6 ≤ 10.
  for (const hex of f.state.hexes.values()) hex.moveCost = 0.5;
  const distant = placeArmy(f.state, f.governorId, f.hexOf(12), 'army_A0000000000000000000005');
  assert.equal(
    isSuppliedGraph(f.state, distant, BALANCE, armyOwnersByHex(f.state)),
    true,
    'roads carry supply twice as far',
  );
});

test('no friendly supply source anywhere ⇒ never supplied', () => {
  const f = corridorFixture('supply-none');
  for (const t of f.state.territories.values()) t.supplySource = false;
  const a = placeArmy(f.state, f.governorId, f.hexOf(0), 'army_A0000000000000000000006');
  assert.equal(isSuppliedGraph(f.state, a, BALANCE, armyOwnersByHex(f.state)), false);
});

test('foreign-owned territory blocks the corridor even with no army on it', () => {
  const f = corridorFixture('supply-foreign');
  const far = placeArmy(f.state, f.governorId, f.hexOf(5), 'army_A0000000000000000000007');
  // Hand hex-3's territory to an enemy (no army, just ownership) — the edge is unfriendly.
  const { governorId: enemy } = addGovernor(f.state, createRng('enemy2').fork('e'), {
    name: 'Baron', kind: 'PLAYER', ctUnits: 0, officerNames: ['Y'],
  });
  const t3 = f.state.territories.get(f.terrIds[3]!)!;
  t3.governorId = enemy;
  t3.governorKind = 'PLAYER';
  assert.equal(
    isSuppliedGraph(f.state, far, BALANCE, armyOwnersByHex(f.state)),
    false,
    'enemy-owned ground severs the friendly route',
  );
});
