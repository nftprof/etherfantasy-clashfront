/**
 * ABANDON tests (product owner 2026-07-03: "allow master to abandon land to
 * free up"): abandoning an owned territory frees the overseer back to the
 * governor's pool (oversight-cap relief), unbinds the garrison into a normal
 * field army, reverts the land to unowned/SYSTEM so anyone may claim it and
 * transit is unblocked, keeps EVERYTHING of value with the land (no refund —
 * enrichment pool, development, treasury stay), refuses foreign/SYSTEM land,
 * refuses contested ground (live wild battle / pending engine battle), and
 * stays bit-identical on replay.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, type Rng } from '@clashfront/shared';
import {
  abandonTerritory,
  addGovernor,
  claimTerritory,
  completeTraining,
  createEngineBattle,
  type DemoWorldFile,
  enrichTerritory,
  findPath,
  isHostileGround,
  loadDemoWorld,
  orderMarch,
  raiseArmy,
  runTick,
  type TickOptions,
  type WildBattleState,
  type WorldState,
} from '../src/index';

const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 3 };
const BALANCE = loadBalance();
const CT = CONSTANTS.CT_UNITS_PER_CT;

/** Synthetic demo-world file: cols×rows grid of square parcels, 4-way adjacency. */
function makeGrid(cols: number, rows: number): DemoWorldFile {
  const pid = (i: number) => `P${String(i).padStart(4, '0')}`;
  const parcels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * 2;
      const y = r * 2;
      const neighbors: string[] = [];
      if (c > 0) neighbors.push(pid(i - 1));
      if (c < cols - 1) neighbors.push(pid(i + 1));
      if (r > 0) neighbors.push(pid(i - cols));
      if (r < rows - 1) neighbors.push(pid(i + cols));
      parcels.push({
        parcelId: pid(i),
        tokenId: pid(i),
        center: [x, y] as [number, number],
        polygon: [[x - 1, y - 1], [x + 1, y - 1], [x + 1, y + 1], [x - 1, y + 1]] as [number, number][],
        neighbors: neighbors.sort(),
      });
    }
  }
  return {
    meta: { zone: 'TEST', sliceBBox: [-1, -1, cols * 2 - 1, rows * 2 - 1], generatedFrom: 'test-fixture' },
    parcels,
  };
}

function fixture(seed: string, cols = 4, rows = 4): { state: WorldState; rng: Rng; governorId: string; homeId: string } {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(cols, rows), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('gov'), {
    name: 'Renouncer', kind: 'PLAYER', ctUnits: 100_000 * CT, officerNames: ['Choco', 'Maenak'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

function freeOfficerCount(state: WorldState, gov: string): number {
  return (state.officers?.get(gov) ?? []).filter((o) => o.assignedTerritoryId === undefined).length;
}

test('abandon frees the overseer, reverts the land to SYSTEM and keeps value with the land', () => {
  const { state, governorId, homeId } = fixture('abandon-basic');
  const t = state.territories.get(homeId)!;
  const wild = [...(state.governorKinds ?? new Map()).entries()].find(([, k]) => k === 'SYSTEM')![0];

  // Claim assigned an overseer: 1 of 2 officers free.
  assert.equal(freeOfficerCount(state, governorId), 1);
  const overseerId = t.overseerId!;
  assert.ok(overseerId !== undefined);

  // Value on the land that must survive the abandon.
  enrichTerritory(state, homeId, 1_000 * CT, BALANCE);
  const pool = state.enrichmentPools!.get(homeId)!;
  assert.ok(pool > 0);
  const treasury0 = t.ctTreasury;
  const dev0 = { ...t.development };
  const wallet0 = state.ctBalances!.get(governorId)!;
  const version0 = t.version;

  abandonTerritory(state, homeId, governorId);

  assert.equal(t.governorKind, 'SYSTEM', 'land reverts to unowned/SYSTEM');
  assert.equal(t.governorId, wild, 'the wild governor takes the deed');
  assert.equal(t.overseerId, undefined);
  assert.equal(t.supplySource, false, 'the wilds feed no one');
  assert.ok(t.version > version0);
  // The overseer Master is FREE again — the whole point of the feature.
  assert.equal(freeOfficerCount(state, governorId), 2);
  const officer = state.officers!.get(governorId)!.find((o) => o.id === overseerId)!;
  assert.equal(officer.assignedTerritoryId, undefined);
  // NO refund — everything of value stays with the land.
  assert.equal(state.ctBalances!.get(governorId), wallet0, 'no CT refund');
  assert.equal(state.enrichmentPools!.get(homeId), pool, 'the enrichment pool stays with the land');
  assert.equal(t.ctTreasury, treasury0, 'the treasury stays with the land');
  assert.deepEqual(t.development, dev0, 'development stays with the land');
});

test('abandoned land is claimable by others (inheriting the pool) and by the abandoner again', () => {
  const { state, rng, governorId, homeId } = fixture('abandon-reclaim');
  enrichTerritory(state, homeId, 1_000 * CT, BALANCE);
  const pool = state.enrichmentPools!.get(homeId)!;
  abandonTerritory(state, homeId, governorId);

  const { governorId: rival } = addGovernor(state, rng.fork('rival'), {
    name: 'Squatter', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Nara'],
  });
  claimTerritory(state, homeId, rival);
  const t = state.territories.get(homeId)!;
  assert.equal(t.governorId, rival, 'a rival claims the abandoned parcel');
  assert.equal(state.enrichmentPools!.get(homeId), pool, 'the new holder inherits the pool');

  // Round trip: the rival abandons, the original governor re-claims.
  abandonTerritory(state, homeId, rival);
  claimTerritory(state, homeId, governorId);
  assert.equal(state.territories.get(homeId)!.governorId, governorId);
});

test('abandon unblocks transit: isHostileGround clears and paths route through', () => {
  // 3×1 strip: the middle parcel is the ONLY land route between the ends.
  // (Territory ids are ULIDs with random bits — resolve parcels by NAME.)
  const { state, rng, governorId, homeId } = fixture('abandon-transit', 3, 1);
  const byParcel = (pid: string) => [...state.territories.values()].find((x) => x.name.endsWith(pid))!;
  const midId = byParcel('P0001').id;
  const midHex = byParcel('P0001').hexIds[0]!;
  const leftHex = byParcel('P0000').hexIds[0]!;
  const rightHex = byParcel('P0002').hexIds[0]!;
  // fixture() claimed the sorted-first territory; move the wall to the middle.
  abandonTerritory(state, homeId, governorId);
  claimTerritory(state, midId, governorId);

  const { governorId: traveller } = addGovernor(state, rng.fork('traveller'), {
    name: 'Traveller', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Purin'],
  });
  assert.equal(isHostileGround(state, midHex, traveller), true, 'owned land is a blockade');
  assert.equal(findPath(state, leftHex, rightHex, traveller), undefined, 'no route past the sovereign wall');

  abandonTerritory(state, midId, governorId);
  assert.equal(isHostileGround(state, midHex, traveller), false, 'abandoned land no longer blockades');
  assert.deepEqual(findPath(state, leftHex, rightHex, traveller), [midHex, rightHex], 'transit routes through');
});

test('abandon unbinds the garrison into a normal field army that can march away', () => {
  const { state, rng, governorId, homeId } = fixture('abandon-garrison');
  const t = state.territories.get(homeId)!;
  const army = raiseArmy(state, homeId, 'SCOUTS', rng.fork('raise'));
  completeTraining(state, army.id);
  assert.equal(t.garrisonArmyId, army.id);

  abandonTerritory(state, homeId, governorId);
  assert.equal(t.garrisonArmyId, undefined, 'the garrison slot unbinds');
  assert.equal(army.state, 'GARRISON', 'the army still stands on the hex as a field army');
  assert.equal(army.hexId, t.hexIds[0]!);
  // …and is free to be used elsewhere.
  const away = state.adjacency!.get(army.hexId)![0]!;
  orderMarch(state, army.id, [away], OPTS);
  assert.equal(army.state, 'MARCHING');
});

test('cannot abandon foreign, SYSTEM or unknown land', () => {
  const { state, rng, governorId, homeId } = fixture('abandon-guards');
  const wildId = [...state.territories.keys()].sort().find((id) => state.territories.get(id)!.governorKind === 'SYSTEM')!;
  assert.throws(() => abandonTerritory(state, wildId, governorId), /not governed by/);
  assert.throws(() => abandonTerritory(state, 'terr_nope', governorId), /unknown territory/);
  const { governorId: rival } = addGovernor(state, rng.fork('rival'), {
    name: 'Covetor', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Nara'],
  });
  assert.throws(() => abandonTerritory(state, homeId, rival), /not governed by/);
  assert.equal(state.territories.get(homeId)!.governorId, governorId, 'ownership untouched');
});

test('cannot abandon contested ground: pending ENGINE battle and live wild battle both lock it', () => {
  const { state, rng, governorId, homeId } = fixture('abandon-battle-lock');
  const t = state.territories.get(homeId)!;
  const hexId = t.hexIds[0]!;
  const defender = raiseArmy(state, homeId, 'STANDARD', rng.fork('def'));
  completeTraining(state, defender.id);
  const { governorId: invader } = addGovernor(state, rng.fork('invader'), {
    name: 'Invader', kind: 'PLAYER', ctUnits: 50_000 * CT, officerNames: ['Kai'],
  });
  const nextId = [...state.territories.values()].find((x) => x.hexIds[0] === state.adjacency!.get(hexId)![0])!.id;
  claimTerritory(state, nextId, invader);
  const attacker = raiseArmy(state, nextId, 'STANDARD', rng.fork('atk'));
  completeTraining(state, attacker.id);

  // PENDING ENGINE BATTLE on the parcel (ALLOCATE-CALLBACK-SCHEMA lock).
  const battle = createEngineBattle(state, hexId, [attacker], [defender], governorId, state.world.tick, rng.fork('eb'));
  assert.throws(() => abandonTerritory(state, homeId, governorId), /battle rages/);
  state.engineBattles!.delete(battle.id);

  // Live wild battle lock (same gate, docs/04 §7b) — shape-only record suffices.
  state.wildBattles ??= new Map();
  state.wildBattles.set('battle_test', { hexId } as unknown as WildBattleState);
  assert.throws(() => abandonTerritory(state, homeId, governorId), /battle rages/);
  state.wildBattles.delete('battle_test');

  // Locks lifted — the abandon goes through.
  abandonTerritory(state, homeId, governorId);
  assert.equal(t.governorKind, 'SYSTEM');
});

test('claim → enrich → abandon → tick flow is deterministic (bit-identical replays)', () => {
  const run = (): WorldState => {
    const { state, rng, governorId, homeId } = fixture('abandon-golden');
    enrichTerritory(state, homeId, 2_000 * CT, BALANCE);
    for (let t = 1; t <= 5; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
    abandonTerritory(state, homeId, governorId);
    for (let t = 6; t <= 15; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
    return state;
  };
  assert.deepStrictEqual(run(), run());
});
