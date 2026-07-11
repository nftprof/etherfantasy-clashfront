/**
 * Real-parcel sample map — end-to-end load + validate (Map-maker → integration hand-off).
 *
 * Proves the full path for ONE real on-chain parcelId: a generated
 * `data/cf-maps/parcels/<parcelId>.json` is (a) found by the parcel loader by id,
 * (b) passes all five playability invariants (validateBattlefield), and (c) carries
 * a real designed layout (a CORE per side, ≥1 lane, authored obstacles) — i.e. the
 * artifact the engine must consume AS-IS (integration Q1), not the 3-lane drop-in.
 *
 * Parcel: EDU zone L3 single 60200010000 (Academy Highlands biome, Continent Atlas).
 * tickMs: null — no world ticks needed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadParcelBattlefield, validateBattlefield } from '../src/index';

const PARCEL_ID = '60200010000';

test('real parcel 60200010000 loads by id from data/cf-maps/parcels', () => {
  const bf = loadParcelBattlefield(PARCEL_ID);
  assert.ok(bf, 'loadParcelBattlefield returned a map for the real parcelId');
  assert.equal(bf.meta?.parcelId, PARCEL_ID, 'the loaded map is keyed to the real parcelId');
});

test('real parcel map passes all five playability invariants', () => {
  const bf = loadParcelBattlefield(PARCEL_ID);
  assert.ok(bf);
  const v = validateBattlefield(bf);
  assert.ok(v.ok, `validateBattlefield failed: ${JSON.stringify(v)}`);
});

test('real parcel map carries a real designed layout (2 COREs, a lane, authored obstacles)', () => {
  const bf = loadParcelBattlefield(PARCEL_ID);
  assert.ok(bf);
  const cores = (bf.structures ?? []).filter((s) => s.kind === 'CORE');
  assert.equal(cores.length, 2, 'one CORE per side (ATTACKER + DEFENDER)');
  assert.ok((bf.lanes ?? []).length >= 1, 'at least one lane');
  assert.ok((bf.obstacles ?? []).length > 0, 'authored obstacles present (consumed as-is, not re-rolled)');
  assert.equal(bf.arena.sizeM, 322, 'fixed ±161 world-unit arena');
});

// The full batch of real parcels (EDU/HUB/BUS × invest tiers) integration correlation-tests against.
const BATCH = [
  '60200010000', '60200030000', '60200060000', // EDU (Highmar)
  '60700010000', '60700040000', '60700190000', // HUB (Aurelia)
  '60000080000', '60000170001', '60000200002', // BUS (Porthaven)
];

for (const id of BATCH) {
  test(`batch parcel ${id} loads + passes all five invariants + has 2 COREs`, () => {
    const bf = loadParcelBattlefield(id);
    assert.ok(bf, `loadParcelBattlefield(${id}) returned a map`);
    assert.equal(bf.meta?.parcelId, id, 'keyed to its real parcelId');
    const v = validateBattlefield(bf);
    assert.ok(v.ok, `validateBattlefield failed for ${id}: ${JSON.stringify(v)}`);
    assert.equal((bf.structures ?? []).filter((s) => s.kind === 'CORE').length, 2, 'CORE per side');
  });
}
