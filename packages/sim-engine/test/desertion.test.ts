/**
 * Wave 4.8 — desertion in the field (docs/03 §8): the rate formula, the daily
 * bleed via integer carry, deserters returning home to the populace, the
 * wild-bandit band that rises from accumulated deserters, and the officer
 * resistance term.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, TICKS_PER_DAY } from '@clashfront/shared';
import type { Army, UnitStack } from '@clashfront/shared';
import {
  addGovernor,
  desertionRatePerDay,
  type DemoWorldFile,
  loadDemoWorld,
  runTick,
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
    name: 'Commander', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  return { state, rng, governorId };
}

function army(state: WorldState, gov: string, hexId: string, morale: number, count = 1000): Army {
  const units: UnitStack[] = [{ unitClass: 'INFANTRY', count, veterancy: 0, hp: 100 }];
  const a: Army = {
    id: 'army_D0000000000000000000001', worldId: state.world.id, ownerGovernorId: gov,
    state: 'GARRISON', hexId, units, provisions: { food: 0, gold: 0, wood: 0 },
    supply: 0, supplyMax: CONSTANTS.SUPPLY_MAX_DEFAULT, morale, supplyTrainIds: [], version: 1,
  };
  state.armies.set(a.id, a);
  return a;
}

test('desertionRatePerDay: 0 at healthy morale, rises as morale falls, mults + cap apply', () => {
  const f = fixture('rate');
  const hex = [...f.state.hexes.keys()][0]!;
  const healthy = army(f.state, f.governorId, hex, 30);
  healthy.supply = 100;
  assert.equal(desertionRatePerDay(f.state, healthy, BALANCE), 0, 'morale ≥ 25 ⇒ no desertion');

  // morale 0, supply cut (×2), starving (×1.5) ⇒ base 0.05 × 1.0 × 2 × 1.5 = 0.15.
  const broken = army(f.state, f.governorId, hex, 0);
  broken.state = 'GARRISON';
  const r = desertionRatePerDay(f.state, broken, BALANCE);
  assert.ok(Math.abs(r - 0.15) < 1e-9, `expected 0.15, got ${r}`);

  // Never exceeds the hard cap even when retreating stacks the last multiplier.
  broken.state = 'RETREATING'; // ×1.5 more ⇒ 0.225, capped to 0.20.
  assert.equal(desertionRatePerDay(f.state, broken, BALANCE), BALANCE.desertion.hardCapPerDay);
});

test('a broken army bleeds troops over a day and deserters return to its own populace', () => {
  const f = fixture('bleed');
  // The army stands on its OWN territory so deserters can slip home.
  const terrId = [...f.state.territories.keys()].sort()[0]!;
  const t = f.state.territories.get(terrId)!;
  t.governorId = f.governorId;
  t.governorKind = 'PLAYER';
  const pop0 = t.population;
  const hex = t.hexIds[0]!;
  const a = army(f.state, f.governorId, hex, 0, 1000); // morale 0, supply 0, food 0
  const n0 = a.units[0]!.count;

  for (let tick = 1; tick <= TICKS_PER_DAY; tick++) runTick(f.state, tick, f.rng.fork('sim'), BALANCE);

  const left = f.state.armies.get(a.id)!.units[0]!.count;
  const deserted = n0 - left;
  assert.ok(deserted > 0, `some troops deserted (${deserted})`);
  // rate 0.15/day (morale 0, supply cut, starving) × 1000 ≈ 150 over a day.
  assert.ok(deserted >= 100 && deserted <= 180, `~150/day expected, got ${deserted}`);
  const popGain = f.state.territories.get(terrId)!.population - pop0;
  assert.ok(popGain > 0, 'some deserters slipped home to the populace');
  assert.ok(popGain <= deserted, 'never more return home than actually deserted');
});

test('deserters in hostile country turn to banditry — a WILD band rises', () => {
  const f = fixture('bandits');
  // Give the governor a HOME territory so the zero-territories wipe (phase 6)
  // doesn't disband our army before it can bleed. The broken army then sits on
  // SEPARATE wild ground — no home to slip back to, so deserters turn brigand.
  const owned = [...f.state.territories.keys()].sort()[0]!;
  const home = f.state.territories.get(owned)!;
  home.governorId = f.governorId;
  home.governorKind = 'PLAYER';
  const wildTerr = [...f.state.territories.keys()]
    .sort()
    .find((id) => f.state.territories.get(id)!.governorKind === 'SYSTEM' && id !== owned)!;
  const hex = f.state.territories.get(wildTerr)!.hexIds[0]!;
  army(f.state, f.governorId, hex, 0, 5000); // big broken army ⇒ plenty of deserters

  let rose = false;
  for (let tick = 1; tick <= 3 * TICKS_PER_DAY && !rose; tick++) {
    runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
    rose = f.state.chronicle?.some((e) => e.kind === 'BANDITS_RISE') ?? false;
  }
  // The Chronicle records the band's spawn strength ("… — N strong"); the band
  // then co-locates with the broken army and may fight the same tick, so we
  // assert the SPAWN size from the record, not the post-battle survivor count.
  const entry = f.state.chronicle?.find((e) => e.kind === 'BANDITS_RISE');
  assert.ok(entry !== undefined, 'a Deserter Bandits band rose from the wild deserters');
  const strength = Number(/(\d+) strong/.exec(entry!.text)?.[1]);
  assert.ok(
    strength >= BALANCE.desertion.banditMinBand,
    `the band rose at least banditMinBand strong (${strength})`,
  );
});

test('a famed officer slows desertion (leadership resistance term)', () => {
  const f = fixture('leadership');
  const hex = [...f.state.hexes.keys()][0]!;
  const led = army(f.state, f.governorId, hex, 0);
  const officers = f.state.officers!.get(f.governorId)!;
  officers[0]!.fame = 100; // full leadership ⇒ ×(1 − 0.25) resistance
  led.heroId = officers[0]!.id;
  const rateLed = desertionRatePerDay(f.state, led, BALANCE);

  const unled = army(f.state, f.governorId, hex, 0);
  unled.id = 'army_D0000000000000000000002';
  delete unled.heroId;
  f.state.armies.set(unled.id, unled);
  const rateUnled = desertionRatePerDay(f.state, unled, BALANCE);

  assert.ok(rateLed < rateUnled, 'a famed officer reduces the desertion rate');
  assert.ok(Math.abs(rateLed - rateUnled * 0.75) < 1e-9, 'exactly the 25% resistance at fame 100');
});
