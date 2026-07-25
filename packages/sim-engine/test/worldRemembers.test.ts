/**
 * Wave 5.1 — THE WORLD REMEMBERS (decision 19): great battles christen
 * themselves, archive in the World Chronicle, and leave monument POIs. Small
 * battles pass unremembered; the scan is idempotent + capped per parcel.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance } from '@clashfront/shared';
import type { BattleInstance, BattleMode } from '@clashfront/shared';
import {
  addGovernor,
  battleName,
  claimTerritory,
  type DemoWorldFile,
  loadDemoWorld,
  raiseArmy,
  completeTraining,
  orderMarch,
  recordGreatBattles,
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

function plantBattle(state: WorldState, id: string, hexId: string, casualties: number, tick: number, mode = 'DUEL'): void {
  const b: BattleInstance = {
    id, worldId: state.world.id, type: 'FIELD', state: 'RESOLVED', hexId,
    attackerArmyIds: [], defenderArmyIds: [], resolutionMode: 'INSTANT',
    scheduledStartTick: tick, participants: [],
    result: {
      winner: 'ATTACKER',
      casualties: { atk: Math.floor(casualties / 2), def: Math.ceil(casualties / 2) },
      resolvedTick: tick,
      mode: mode as BattleMode,
    },
  } as unknown as BattleInstance;
  state.battles.set(id, b);
}

test('battleName christens after the site, deterministic per battle id', () => {
  const state = loadDemoWorld(makeGrid(2, 1), createRng('name').fork('w'), { monsterParcelPct: 0 });
  const terrId = [...state.territories.keys()].sort()[0]!;
  const hexId = state.territories.get(terrId)!.hexIds[0]!;
  const name = state.territories.get(terrId)!.name;
  const n1 = battleName(state, hexId, 'SIEGE', 'battle_X');
  const n2 = battleName(state, hexId, 'SIEGE', 'battle_X');
  assert.equal(n1, n2, 'stable per id');
  assert.ok(n1.includes(name), 'names after the site');
  assert.match(n1, /Siege|Storming/, 'SIEGE mode ⇒ a siege name');
});

test('a great battle archives + monuments; a small one passes unremembered', () => {
  const state = loadDemoWorld(makeGrid(2, 1), createRng('great').fork('w'), { monsterParcelPct: 0 });
  const terrId = [...state.territories.keys()].sort()[0]!;
  const hexId = state.territories.get(terrId)!.hexIds[0]!;

  plantBattle(state, 'battle_small', hexId, BALANCE.chronicle.greatBattleCasualties - 1, 1);
  plantBattle(state, 'battle_great', hexId, BALANCE.chronicle.greatBattleCasualties + 20, 1, 'SIEGE');
  recordGreatBattles(state, 1, BALANCE);

  const entries = (state.chronicle ?? []).filter((e) => e.kind === 'GREAT_BATTLE');
  assert.equal(entries.length, 1, 'only the great battle is remembered');
  assert.equal(entries[0]!.battleId, 'battle_great');
  const monuments = state.monuments!.get(terrId) ?? [];
  assert.equal(monuments.length, 1, 'a monument POI on the parcel');
  assert.equal(monuments[0]!.kind, 'MONUMENT', 'a siege leaves a MONUMENT');
  assert.ok(monuments[0]!.battleName.length > 0);
});

test('the scan is idempotent — re-running never double-archives', () => {
  const state = loadDemoWorld(makeGrid(2, 1), createRng('idem').fork('w'), { monsterParcelPct: 0 });
  const hexId = state.territories.get([...state.territories.keys()].sort()[0]!)!.hexIds[0]!;
  plantBattle(state, 'battle_g', hexId, 500, 3);
  recordGreatBattles(state, 3, BALANCE);
  recordGreatBattles(state, 3, BALANCE); // same tick, again
  assert.equal((state.chronicle ?? []).filter((e) => e.kind === 'GREAT_BATTLE').length, 1);
});

test('monuments are capped per parcel — oldest scars fade', () => {
  const state = loadDemoWorld(makeGrid(2, 1), createRng('cap').fork('w'), { monsterParcelPct: 0 });
  const terrId = [...state.territories.keys()].sort()[0]!;
  const hexId = state.territories.get(terrId)!.hexIds[0]!;
  const cap = BALANCE.chronicle.monumentCapPerParcel;
  for (let i = 0; i < cap + 3; i++) {
    plantBattle(state, `battle_${i}`, hexId, 500, i + 1);
    recordGreatBattles(state, i + 1, BALANCE);
  }
  const monuments = state.monuments!.get(terrId) ?? [];
  assert.equal(monuments.length, cap, 'kept at the cap');
  assert.equal(monuments[monuments.length - 1]!.battleId, `battle_${cap + 2}`, 'newest retained');
  assert.equal(monuments[0]!.battleId, `battle_3`, 'oldest faded away');
});

test('integration: a full-scale battle crosses the threshold and is remembered', () => {
  const rng = createRng('integration');
  const state = loadDemoWorld(makeGrid(3, 1), rng.fork('w'), { monsterParcelPct: 0 });
  const { governorId: atkGov } = addGovernor(state, rng.fork('a'), {
    name: 'Aggressor', kind: 'PLAYER', ctUnits: 1_000_000 * CT, officerNames: ['A', 'B', 'C'],
  });
  const { governorId: defGov } = addGovernor(state, rng.fork('d'), {
    name: 'Defender', kind: 'PLAYER', ctUnits: 1_000_000 * CT, officerNames: ['X', 'Y', 'Z'],
  });
  const terrs = [...state.territories.keys()].sort((a, z) => {
    const ax = state.hexes.get(state.territories.get(a)!.hexIds[0]!)!.q;
    const zx = state.hexes.get(state.territories.get(z)!.hexIds[0]!)!.q;
    return ax - zx;
  });
  const home = terrs[0]!;
  const target = terrs[1]!;
  claimTerritory(state, home, atkGov);
  claimTerritory(state, target, defGov);
  // An overwhelming attacker vs a large garrison ⇒ a decisive rout that sheds
  // far more than greatBattleCasualties (150).
  const atk = raiseArmy(state, home, 'STANDARD', rng.fork('ra'));
  completeTraining(state, atk.id);
  atk.units.forEach((s) => (s.count *= 6)); // ~1200 troops — crushing
  const def = raiseArmy(state, target, 'STANDARD', rng.fork('rd'));
  completeTraining(state, def.id);
  def.units.forEach((s) => (s.count *= 3)); // ~600 defenders to lose
  state.territories.get(target)!.garrisonArmyId = def.id;

  const targetHex = state.territories.get(target)!.hexIds[0]!;
  orderMarch(state, atk.id, [targetHex], { travelTicksPerStep: 1 });
  for (let t = 1; t <= 5; t++) runTick(state, t, rng.fork(`s${t}`), BALANCE, { travelTicksPerStep: 1 });

  const great = (state.chronicle ?? []).find((e) => e.kind === 'GREAT_BATTLE');
  assert.ok(great !== undefined, 'the clash was remembered');
  assert.match(great!.text, /fell/, 'the toll is recorded');
});
