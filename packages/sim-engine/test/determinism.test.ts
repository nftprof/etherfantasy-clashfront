/**
 * Golden-master determinism test — AGENTS.md invariant 11 / docs/01 §6:
 * same (state, seed, inputs) → identical tick output, bit-for-bit.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '@clashfront/shared';
import { runTick, seedWorld, snapshot, type WorldState } from '../src/index';

function runWorld(seed: string, ticks: number): WorldState {
  const rng = createRng(seed);
  const state = seedWorld({ name: 'Testania', seed }, rng.fork('worldgen'));
  for (let t = 1; t <= ticks; t++) runTick(state, t, rng.fork('sim'));
  return state;
}

test('same (seed, ticks) → deep-equal world states', () => {
  const a = runWorld('golden-master-seed', 25);
  const b = runWorld('golden-master-seed', 25);
  assert.deepStrictEqual(a, b);
});

test('seedWorld alone is deterministic (ids included)', () => {
  const a = seedWorld({ name: 'W', seed: 's1' }, createRng('s1'));
  const b = seedWorld({ name: 'W', seed: 's1' }, createRng('s1'));
  assert.deepStrictEqual(a, b);
});

test('different seeds diverge', () => {
  const a = runWorld('seed-alpha', 10);
  const b = runWorld('seed-beta', 10);
  assert.notDeepStrictEqual(a, b);
});

test('ticking is stepwise-reproducible from a snapshot (replayability)', () => {
  const rng = createRng('replay');
  const state = seedWorld({ name: 'W', seed: 'replay' }, rng.fork('worldgen'));
  for (let t = 1; t <= 10; t++) runTick(state, t, rng.fork('sim'));

  const checkpoint = snapshot(state);
  const branchA = snapshot(checkpoint);
  const branchB = snapshot(checkpoint);
  for (let t = 11; t <= 20; t++) runTick(branchA, t, rng.fork('sim'));
  for (let t = 11; t <= 20; t++) runTick(branchB, t, rng.fork('sim'));

  assert.deepStrictEqual(branchA, branchB);
  // the checkpoint itself was not mutated by ticking its clones
  assert.equal(checkpoint.world.tick, 10);
  assert.notDeepStrictEqual(checkpoint, branchA);
});

test('tick monotonicity is enforced', () => {
  const rng = createRng('mono');
  const state = seedWorld({ name: 'W', seed: 'mono' }, rng.fork('worldgen'));
  runTick(state, 1, rng.fork('sim'));
  assert.throws(() => runTick(state, 1, rng.fork('sim')), /monotonicity/);
  assert.throws(() => runTick(state, 3, rng.fork('sim')), /monotonicity/);
});
