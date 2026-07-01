import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, TICKS_PER_DAY } from '../src/constants';
import { createRng } from '../src/rng';
import { idPrefix, isId, newId, ulid } from '../src/ids';
import { loadBalance } from '../src/balance';
import { HEX_TERRAINS, UNIT_CLASSES, DEVELOPMENT_TRACKS } from '../src/enums';

test('CONSTANTS canon spot-checks (docs/08 §2)', () => {
  assert.equal(CONSTANTS.HERO_IMPACT_MAX, 0.2);
  assert.equal(CONSTANTS.TICK_SECONDS, 60);
  assert.equal(CONSTANTS.CT_UNITS_PER_CT, 10_000);
  assert.equal(TICKS_PER_DAY, 1440);
});

test('rng: same seed → identical stream; fork is order-insensitive', () => {
  const a = createRng('world-42');
  const b = createRng('world-42');
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());

  // fork depends only on seed path, not parent draw count
  const p1 = createRng('base');
  const p2 = createRng('base');
  p2.next(); p2.next(); p2.next();
  assert.equal(p1.fork('stream').next(), p2.fork('stream').next());

  // different seeds diverge
  assert.notEqual(createRng('x').next(), createRng('y').next());

  // int bounds
  const r = createRng('ints');
  for (let i = 0; i < 200; i++) {
    const v = r.int(3, 7);
    assert.ok(v >= 3 && v < 7 && Number.isInteger(v));
  }
});

test('ids: prefix-typed ULIDs, sortable by time, deterministic with injected rng', () => {
  const rng = createRng('ids');
  const mk = (t: number) => newId('terr', { time: t, random: () => rng.next() });
  const id1 = mk(1_000);
  const id2 = mk(2_000);
  assert.ok(isId(id1, 'terr'), `bad id: ${id1}`);
  assert.equal(idPrefix(id1), 'terr');
  assert.ok(id1 < id2, 'ids must sort by timestamp');
  assert.match(ulid({ time: 0, random: () => 0 }), /^[0-9A-HJKMNP-TV-Z]{26}$/);

  // deterministic: same seed + time → same id
  const r1 = createRng('same');
  const r2 = createRng('same');
  assert.equal(
    newId('army', { time: 5, random: () => r1.next() }),
    newId('army', { time: 5, random: () => r2.next() }),
  );
});

test('balance.json loads, is typed-complete for enum-keyed tables', () => {
  const b = loadBalance();
  assert.equal(typeof b.version, 'number');
  for (const t of HEX_TERRAINS) assert.equal(typeof b.travel.moveCostByTerrain[t], 'number');
  for (const u of UNIT_CLASSES) {
    assert.equal(typeof b.upkeep.perUnitClassPer100PerDay[u].food, 'number');
    assert.ok(Number.isInteger(b.upkeep.perUnitClassPer100PerDay[u].ctUnits), 'money is integer ct_units');
  }
  for (const d of DEVELOPMENT_TRACKS) {
    assert.ok(Number.isInteger(b.development.baseCostCtUnits[d]), 'money is integer ct_units');
  }
  // doc-sourced spot checks
  assert.equal(b.travel.moveCostByTerrain.ROAD, 0.5);
  assert.equal(b.development.costGrowthPerLevel, 1.6);
  assert.equal(b.tax.cycleTicks, 1440);
  assert.equal(b.supply.rangeHexes, 10);
});
