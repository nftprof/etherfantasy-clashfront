/**
 * Wave 4.5 — civil rebellion (docs/01 §7): risk math, the deterministic hash
 * trigger, the rebel-army rising + same-tick battle, the unopposed flip, the
 * crushed-morale ceiling, and content-people-don't-rise.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, TICKS_PER_DAY } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  type DemoWorldFile,
  loadDemoWorld,
  raiseArmy,
  completeTraining,
  runTick,
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
    name: 'Tyrant', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

/** Make a territory maximally miserable so the hash roll fires within days. */
function immiserate(f: ReturnType<typeof fixture>): void {
  const t = f.state.territories.get(f.homeId)!;
  t.population = 2000;
  t.foodStock = 0; // starving (+riskFood)
  t.morale = 0; // nobody is content
  t.prosperity = 0; // poverty (+riskPoverty)
  t.development.AGRICULTURE = 0; // no production — the larder STAYS empty
}

test('a miserable territory rises; unopposed, the land falls to its own people', () => {
  const f = fixture('rebellion-unopposed');
  immiserate(f);
  let rose = false;
  let fell = false;
  // Fully-miserable ≈ (40+15)/100000 per tick ⇒ expected ~0.79 risings/day.
  // Run up to 5 sim-days — deterministic, the hash fires when it fires.
  for (let tick = 1; tick <= 5 * TICKS_PER_DAY && !fell; tick++) {
    runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
    if ((f.state.rebellions?.size ?? 0) > 0) rose = true;
    fell = f.state.territories.get(f.homeId)!.governorKind === 'SYSTEM';
  }
  assert.ok(rose, 'a rising spawned');
  assert.ok(fell, 'the unopposed rising flipped the land to the wilds');
  const t = f.state.territories.get(f.homeId)!;
  assert.ok(t.garrisonArmyId !== undefined, 'the rebels hold the land as its garrison');
  assert.equal(t.overseerId, undefined, 'overseer cleared');
  assert.ok(
    f.state.chronicle!.some((e) => e.kind === 'REBELLION') &&
      f.state.chronicle!.some((e) => e.kind === 'REBELLION_VICTORY'),
    'the Chronicle remembers the rising and the fall',
  );
  // The Land NFT never moved (ownership ≠ control, invariant 3).
  const nft = f.state.landNfts.get(t.landNftId)!;
  assert.equal(nft.ownerPlayerId, undefined, 'NFT ownership untouched');
});

test('a garrison fights the rising; a crushed rising caps civil morale (resentment lingers)', () => {
  const f = fixture('rebellion-crushed');
  immiserate(f);
  const t = f.state.territories.get(f.homeId)!;
  t.morale = 10; // still miserable enough to rise, garrison will crush it
  // A strong standing garrison: rebels (~100 infantry) can't beat 200 mixed troops.
  f.state.ctBalances!.set(f.governorId, 100_000 * CT);
  const army = raiseArmy(f.state, f.homeId, 'STANDARD', f.rng.fork('raise'));
  completeTraining(f.state, army.id);
  let rose = false;
  let crushed = false;
  for (let tick = 1; tick <= 5 * TICKS_PER_DAY && !crushed; tick++) {
    runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
    if ((f.state.rebellions?.size ?? 0) > 0) rose = true;
    crushed = f.state.chronicle?.some((e) => e.kind === 'REBELLION_CRUSHED') ?? false;
  }
  assert.ok(rose, 'a rising spawned against the garrison');
  assert.ok(crushed, 'the garrison crushed it');
  const after = f.state.territories.get(f.homeId)!;
  assert.equal(after.governorKind, 'PLAYER', 'the governor held the land');
  assert.ok(
    after.morale <= BALANCE.rebellion.crushedMoraleCeiling,
    'civil morale capped after the crushing',
  );
});

test('content, fed people never rise', () => {
  const f = fixture('rebellion-content');
  const t = f.state.territories.get(f.homeId)!;
  t.population = 2000;
  t.foodStock = 10_000_000;
  t.morale = 100; // risk *= (1 − 100/100) = 0
  t.prosperity = 80;
  for (let tick = 1; tick <= 2 * TICKS_PER_DAY; tick++) {
    runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
  }
  assert.equal(f.state.rebellions?.size ?? 0, 0, 'no rising');
  assert.equal(f.state.territories.get(f.homeId)!.governorKind, 'PLAYER');
});

test('occupation grace: a fresh governor change adds risk via governorSeen bookkeeping', () => {
  const f = fixture('rebellion-grace');
  // Tick once so governorSeen is primed with the current governor.
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE);
  const seen0 = f.state.governorSeen!.get(f.homeId)!;
  assert.equal(seen0.governorId, f.governorId);
  assert.ok(seen0.tick < 1 - BALANCE.rebellion.occupationGraceTicks, 'genesis claim starts OUT of grace');
  // Simulate a conquest: hand the territory to another governor mid-run.
  const { governorId: usurper } = addGovernor(f.state, f.rng.fork('g2'), {
    name: 'Usurper', kind: 'PLAYER', ctUnits: 1000 * CT, officerNames: ['Rex'],
  });
  const t = f.state.territories.get(f.homeId)!;
  t.governorId = usurper;
  runTick(f.state, 2, f.rng.fork('sim'), BALANCE);
  const seen1 = f.state.governorSeen!.get(f.homeId)!;
  assert.equal(seen1.governorId, usurper, 'change recorded');
  assert.equal(seen1.tick, 2, 'grace clock starts at the change tick');
});
