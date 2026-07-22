/**
 * Wave 4.4 — mythic reinforcement CF-side (MOBA-V3-BUILD-SPEC §5 + COORD-009):
 * NFT registry, deterministic 10-battle cadence (fresh grant starts READY),
 * battle-record spawn attachment, and the World Chronicle KO inscription.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng, loadBalance } from '@clashfront/shared';
import {
  createEngineBattle,
  type EngineBattleState,
  grantMythicNft,
  loadDemoWorld,
  recordMythicKo,
  revokeMythicNft,
  rollMythicSpawns,
  type WorldState,
} from '../src/index';
import type { Army } from '@clashfront/shared';

const BALANCE = loadBalance();

function makeArmy(id: string, gov: string, hexId: string): Army {
  return {
    id,
    ownerGovernorId: gov,
    state: 'MARCHING',
    hexId,
    units: [{ unitClass: 'INFANTRY', count: 50 }],
    provisions: { food: 10, gold: 0, wood: 0 },
    morale: 70,
    supply: 100,
    version: 1,
  } as unknown as Army;
}

function makeBattle(id: string, atkGov: string, defGov: string): EngineBattleState {
  return {
    id,
    seed: '0123456789abcdef',
    hexId: 'H1',
    attackerArmyIds: [],
    defenderArmyIds: [],
    attackerGovernorId: atkGov,
    defenderGovernorId: defGov,
    startedTick: 0,
    status: 'ALLOCATING',
  };
}

function bareState(): WorldState {
  // rollMythicSpawns/recordMythicKo only touch the mythic containers — a
  // minimal state object keeps the cadence test readable.
  return { world: { tick: 0 } } as unknown as WorldState;
}

test('cadence: a fresh grant spawns on the FIRST battle, then exactly every ⚙ spawnEveryBattles', () => {
  const state = bareState();
  grantMythicNft(state, 'gov_A', 'Vernirox', BALANCE);
  const every = BALANCE.mythic.spawnEveryBattles;

  const spawnedOn: number[] = [];
  for (let i = 1; i <= every * 2 + 1; i++) {
    const b = makeBattle(`battle_${String(i).padStart(3, '0')}`, 'gov_A', 'sys_wild');
    rollMythicSpawns(state, b, BALANCE);
    if (b.mythicSpawns !== undefined) spawnedOn.push(i);
  }
  assert.deepEqual(spawnedOn, [1, 1 + every, 1 + 2 * every], 'first battle + every N after');
});

test('multiple NFTs run independent counters; sides are attributed correctly', () => {
  const state = bareState();
  grantMythicNft(state, 'gov_A', 'Vernirox', BALANCE);
  grantMythicNft(state, 'gov_A', 'Mytier', BALANCE);
  grantMythicNft(state, 'gov_B', 'Quadrossal', BALANCE);

  const b = makeBattle('battle_both', 'gov_A', 'gov_B');
  rollMythicSpawns(state, b, BALANCE);
  assert.ok(b.mythicSpawns !== undefined);
  const species = b.mythicSpawns.map((m) => `${m.side}:${m.species}`).sort();
  assert.deepEqual(species, ['ATTACKER:Mytier', 'ATTACKER:Vernirox', 'DEFENDER:Quadrossal']);

  // Revoke one — it stops spawning; the other keeps its own schedule.
  revokeMythicNft(state, 'gov_A', 'Vernirox');
  for (let i = 1; i <= BALANCE.mythic.spawnEveryBattles; i++) {
    const bi = makeBattle(`battle_r${String(i).padStart(3, '0')}`, 'gov_A', 'sys_wild');
    rollMythicSpawns(state, bi, BALANCE);
    if (i === BALANCE.mythic.spawnEveryBattles) {
      assert.deepEqual(
        bi.mythicSpawns?.map((m) => m.species),
        ['Mytier'],
        'only the still-owned NFT spawns',
      );
    }
  }
});

test('createEngineBattle attaches the spawn to the record (allocate-context source)', () => {
  const rng = createRng('mythic-engine');
  const state = loadDemoWorld(
    {
      meta: { zone: 'TEST', sliceBBox: [-1, -1, 3, 3], generatedFrom: 'test' },
      parcels: [
        { parcelId: 'P0', tokenId: 'P0', center: [0, 0], polygon: [[-1, -1], [1, -1], [1, 1], [-1, 1]], neighbors: ['P1'] },
        { parcelId: 'P1', tokenId: 'P1', center: [2, 0], polygon: [[1, -1], [3, -1], [3, 1], [1, 1]], neighbors: ['P0'] },
      ],
    },
    rng.fork('worldgen'),
    { monsterParcelPct: 0 },
  );
  grantMythicNft(state, 'gov_atk', 'Zedakazm', BALANCE);
  const hexId = [...state.hexes.keys()].sort()[0]!;
  const atk = makeArmy('army_ATK0000000000000000000001', 'gov_atk', hexId);
  state.armies.set(atk.id, atk);
  const battle = createEngineBattle(state, hexId, [atk], [], 'sys_wild', 5, rng.fork('battle'), BALANCE, false);
  assert.ok(battle.mythicSpawns !== undefined, 'spawn attached at creation');
  assert.deepEqual(battle.mythicSpawns, [
    { governorId: 'gov_atk', species: 'Zedakazm', side: 'ATTACKER' },
  ]);
});

test('World Chronicle: KO inscribed; first-ever slayer of a species gets the emphasis', () => {
  const state = bareState();
  recordMythicKo(state, 100, 'battle_X', 'the Fields of P0', {
    species: 'Vernirox',
    killerName: 'Irene',
  });
  recordMythicKo(state, 200, 'battle_Y', 'Azure Bay', { species: 'Vernirox', killerName: 'Choco' });
  assert.equal(state.chronicle!.length, 2);
  assert.equal(state.chronicle![0]!.first, true, 'first slayer flagged');
  assert.match(state.chronicle![0]!.text, /Irene felled the Mythic Vernirox at the Fields of P0/);
  assert.match(state.chronicle![0]!.text, /FIRST ever/);
  assert.equal(state.chronicle![1]!.first, undefined, 'second KO is a plain line');
  assert.equal(state.mythicFirstSlain!['Vernirox'], 'Irene', 'first-slayer registry sticks');
});
