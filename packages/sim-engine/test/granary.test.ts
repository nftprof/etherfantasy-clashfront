/**
 * Wave 4.6 — granary caps (docs/02 §6): the larder has a ceiling. Food
 * production above `granaryBaseCap × (1 + granaryPerLevelBonus × granary level)`
 * is wasted; a GRANARY structure is the only lever that lifts it; existing
 * over-cap stock (from a raid/gift) is never trimmed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, TICKS_PER_DAY } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  type DemoWorldFile,
  granaryCap,
  loadDemoWorld,
  runTick,
  structureLevel,
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
    name: 'Steward', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

test('food production stops at the base granary cap', () => {
  const f = fixture('granary-base');
  const t = f.state.territories.get(f.homeId)!;
  t.development.AGRICULTURE = 8; // strong production so it would blow past the cap
  t.prosperity = 100;
  t.population = 0; // no consumption fighting the accrual
  t.foodStock = 0;
  assert.equal(structureLevel(t, 'GRANARY'), 0, 'no granary yet');
  const cap = granaryCap(t, BALANCE);
  assert.equal(cap, BALANCE.food.granaryBaseCap, 'base cap with no granary');
  for (let tick = 1; tick <= 10 * TICKS_PER_DAY; tick++) runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
  assert.equal(f.state.territories.get(f.homeId)!.foodStock, cap, 'stock parks exactly at the cap');
});

test('a granary structure raises the ceiling', () => {
  const f = fixture('granary-lifted');
  const t = f.state.territories.get(f.homeId)!;
  t.development.AGRICULTURE = 8;
  t.prosperity = 100;
  t.population = 0;
  t.foodStock = 0;
  t.structures.push({ key: 'GRANARY', track: 'AGRICULTURE', level: 2, hp: 100, maxHp: 100 });
  const cap = granaryCap(t, BALANCE);
  assert.equal(cap, Math.floor(BALANCE.food.granaryBaseCap * (1 + BALANCE.food.granaryPerLevelBonus * 2)));
  assert.ok(cap > BALANCE.food.granaryBaseCap, 'granary lifts the cap');
  for (let tick = 1; tick <= 20 * TICKS_PER_DAY; tick++) runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
  assert.equal(f.state.territories.get(f.homeId)!.foodStock, cap, 'stock parks at the lifted cap');
});

test('existing over-cap stock is never trimmed (raid/gift overfill is legitimate)', () => {
  const f = fixture('granary-overfill');
  const t = f.state.territories.get(f.homeId)!;
  t.development.AGRICULTURE = 4;
  t.population = 0;
  const overfill = granaryCap(t, BALANCE) + 5000;
  t.foodStock = overfill;
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE);
  assert.equal(
    f.state.territories.get(f.homeId)!.foodStock,
    overfill,
    'production adds nothing while over cap, but never trims what is stored',
  );
});
