/**
 * COMMAND-vs-AUTO mode selection + live-match POOL/QUEUE state machine
 * (docs/04 §3a — the scaling keystone). Pure unit tests of the sim decision
 * (createEngineBattle) and queue promotion (promoteQueuedEngineBattles),
 * driven directly on a minimal WorldState — no HTTP, deterministic.
 *
 * State machine under test:
 *   no command intent / live disabled ............... ACCELERATED (mode set, ALLOCATING)
 *   command + free slot + pool room ................. LIVE        (mode 'live', ALLOCATING)
 *   command + free slot + pool FULL ................. QUEUED      (queuedTick set, mode unset)
 *   command + every opting gov at slot cap .......... ACCELERATED (downgrade, no command slot held)
 *   QUEUED + a live slot frees ...................... promoted to LIVE (ALLOCATING)
 *   QUEUED past commandQueueTimeoutTicks ............ falls back to ACCELERATED
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Army, type Balance, createRng, loadBalance } from '@clashfront/shared';
import {
  createEngineBattle,
  engineCommandSlotCount,
  engineLivePoolCount,
  promoteQueuedEngineBattles,
  type WorldState,
} from '../src/index';

function balanceWith(patch: Partial<Balance['battle']>): Balance {
  const b = JSON.parse(JSON.stringify(loadBalance())) as Balance;
  b.battle = { ...b.battle, ...patch };
  return b;
}

/** Minimal world state — only the fields the mode/queue logic touches. */
function state(): WorldState {
  return { engineBattles: undefined } as unknown as WorldState;
}

function army(id: string, gov: string, command = false): Army {
  return { id, ownerGovernorId: gov, commandIntent: command, version: 1 } as unknown as Army;
}

test('no command intent ⇒ ACCELERATED (never live)', () => {
  const s = state();
  const rng = createRng('t');
  const b = createEngineBattle(
    s, 'hex1', [army('a1', 'govA')], [army('d1', 'govB')], 'govB', 1, rng.fork('b'), loadBalance(), true,
  );
  assert.equal(b.status, 'ALLOCATING');
  assert.equal(b.mode, 'accelerated');
  assert.equal(b.commandGovernorIds, undefined);
});

test('command intent + free slot + pool room ⇒ LIVE; intent is consumed off the army', () => {
  const s = state();
  const rng = createRng('t');
  const atk = army('a1', 'govA', true);
  const b = createEngineBattle(s, 'hex1', [atk], [army('d1', 'govB')], 'govB', 1, rng.fork('b'), loadBalance(), true);
  assert.equal(b.status, 'ALLOCATING');
  assert.equal(b.mode, 'live');
  assert.deepEqual(b.commandGovernorIds, ['govA']);
  assert.equal(atk.commandIntent, false, 'command intent consumed at the collision');
  assert.equal(engineLivePoolCount(s), 1);
  assert.equal(engineCommandSlotCount(s, 'govA'), 1);
});

test('command intent but live disabled ⇒ ACCELERATED', () => {
  const s = state();
  const rng = createRng('t');
  const b = createEngineBattle(
    s, 'hex1', [army('a1', 'govA', true)], [army('d1', 'govB')], 'govB', 1, rng.fork('b'), loadBalance(), false,
  );
  assert.equal(b.mode, 'accelerated');
  assert.equal(b.commandGovernorIds, undefined);
});

test('every opting governor at the slot cap ⇒ downgrade to ACCELERATED', () => {
  const bal = balanceWith({ commandSlotsPerPlayer: 1, liveMatchPoolMax: 8 });
  const s = state();
  const rng = createRng('t');
  // First command battle takes govA's only slot (goes live).
  const b1 = createEngineBattle(s, 'h1', [army('a1', 'govA', true)], [army('d1', 'govB')], 'govB', 1, rng.fork('b1'), bal, true);
  assert.equal(b1.mode, 'live');
  assert.equal(engineCommandSlotCount(s, 'govA'), 1);
  // Second command battle for govA — no free slot ⇒ accelerated, no slot held.
  const b2 = createEngineBattle(s, 'h2', [army('a2', 'govA', true)], [army('d2', 'govB')], 'govB', 2, rng.fork('b2'), bal, true);
  assert.equal(b2.mode, 'accelerated');
  assert.equal(b2.commandGovernorIds, undefined);
  assert.equal(engineCommandSlotCount(s, 'govA'), 1, 'still just the one live slot');
});

test('pool full ⇒ QUEUED, then promoted to LIVE when a live slot frees', () => {
  const bal = balanceWith({ commandSlotsPerPlayer: 2, liveMatchPoolMax: 1, commandQueueTimeoutTicks: 20 });
  const s = state();
  const rng = createRng('t');
  const b1 = createEngineBattle(s, 'h1', [army('a1', 'govA', true)], [army('d1', 'govZ')], 'govZ', 1, rng.fork('b1'), bal, true);
  assert.equal(b1.mode, 'live');
  assert.equal(engineLivePoolCount(s), 1);
  // Pool is full ⇒ govB's command battle QUEUES (slot reserved, live deferred).
  const b2 = createEngineBattle(s, 'h2', [army('a2', 'govB', true)], [army('d2', 'govZ')], 'govZ', 1, rng.fork('b2'), bal, true);
  assert.equal(b2.status, 'QUEUED');
  assert.equal(b2.mode, undefined, 'no mode while queued');
  assert.equal(b2.queuedTick, 1);
  assert.deepEqual(b2.commandGovernorIds, ['govB']);
  assert.equal(engineCommandSlotCount(s, 'govB'), 1, 'a queued command battle still holds the slot');

  // Promotion with the pool still full: it keeps waiting.
  promoteQueuedEngineBattles(s, 5, bal, true);
  assert.equal(s.engineBattles!.get(b2.id)!.status, 'QUEUED');

  // The live battle settles (removed from the map) ⇒ a slot frees.
  s.engineBattles!.delete(b1.id);
  promoteQueuedEngineBattles(s, 6, bal, true);
  const promoted = s.engineBattles!.get(b2.id)!;
  assert.equal(promoted.status, 'ALLOCATING');
  assert.equal(promoted.mode, 'live');
  assert.equal(promoted.queuedTick, undefined);
});

test('QUEUED past commandQueueTimeoutTicks ⇒ falls back to ACCELERATED', () => {
  const bal = balanceWith({ commandSlotsPerPlayer: 2, liveMatchPoolMax: 1, commandQueueTimeoutTicks: 3 });
  const s = state();
  const rng = createRng('t');
  createEngineBattle(s, 'h1', [army('a1', 'govA', true)], [army('d1', 'govZ')], 'govZ', 0, rng.fork('b1'), bal, true);
  const b2 = createEngineBattle(s, 'h2', [army('a2', 'govB', true)], [army('d2', 'govZ')], 'govZ', 0, rng.fork('b2'), bal, true);
  assert.equal(b2.status, 'QUEUED');
  // Still within the window (pool full) — keeps waiting.
  promoteQueuedEngineBattles(s, 2, bal, true);
  assert.equal(s.engineBattles!.get(b2.id)!.status, 'QUEUED');
  // Waited the timeout ⇒ accelerated fallback, command slot released.
  promoteQueuedEngineBattles(s, 3, bal, true);
  const done = s.engineBattles!.get(b2.id)!;
  assert.equal(done.status, 'ALLOCATING');
  assert.equal(done.mode, 'accelerated');
  assert.equal(done.commandGovernorIds, undefined);
  assert.equal(done.queuedTick, undefined);
});

test('live disabled promotes a QUEUED battle straight to ACCELERATED', () => {
  const bal = balanceWith({ commandSlotsPerPlayer: 2, liveMatchPoolMax: 1, commandQueueTimeoutTicks: 20 });
  const s = state();
  const rng = createRng('t');
  createEngineBattle(s, 'h1', [army('a1', 'govA', true)], [army('d1', 'govZ')], 'govZ', 0, rng.fork('b1'), bal, true);
  const b2 = createEngineBattle(s, 'h2', [army('a2', 'govB', true)], [army('d2', 'govZ')], 'govZ', 0, rng.fork('b2'), bal, true);
  assert.equal(b2.status, 'QUEUED');
  promoteQueuedEngineBattles(s, 1, bal, false); // kill switch flipped
  const done = s.engineBattles!.get(b2.id)!;
  assert.equal(done.status, 'ALLOCATING');
  assert.equal(done.mode, 'accelerated');
});
