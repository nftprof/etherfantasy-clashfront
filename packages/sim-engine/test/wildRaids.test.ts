/**
 * Active wild raids tests — Feature Set 2 F3 (docs/briefs/FEATURESET-2.md):
 * seeded spawn (fork per (tick, territoryId)), half-garrison split, weakest-
 * target selection with the defended threshold, visible/interceptable marches,
 * pillage-only outcomes (raiders never occupy owned land — with AND without a
 * battle), survivors auto-marching home + re-merging, and determinism.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Army, type Balance, CONSTANTS, createRng, loadBalance, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  armyStrength,
  claimTerritory,
  type DemoWorldFile,
  loadDemoWorld,
  raiseArmy,
  runTick,
  type TickOptions,
  troopCount,
  wildRaidChance,
  type WorldState,
} from '../src/index';

const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 3 };
const BALANCE = loadBalance();
const CT = CONSTANTS.CT_UNITS_PER_CT;

/** Raids every tick, always triggered — the deterministic test dial. */
const RAIDY: Balance = {
  ...BALANCE,
  wildRaids: { ...BALANCE.wildRaids, everyTicks: 1, baseChance: 1, edgeChanceBonus: 0, defendedStrengthThreshold: 1500 },
};

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

interface RaidFixture {
  state: WorldState;
  rng: Rng;
  governorId: string;
  wildGov: string;
  lair: Army;
  lairHex: string;
  /** Player territory adjacent to the lair. */
  farmId: string;
  farmHex: string;
}

/**
 * A hand-built monster lair next to a player territory on a monster-free grid:
 * every raid knob is under test control.
 */
function raidFixture(seed: string, lairTroops = 200): RaidFixture {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(5, 5), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const wildGov = [...state.governorKinds!.entries()].find(([, k]) => k === 'SYSTEM')![0];
  const orders = rng.fork('orders');
  const { governorId } = addGovernor(state, orders, {
    name: 'Farmer', kind: 'PLAYER', ctUnits: 20_000 * CT, officerNames: ['Choco', 'Maenak', 'Nara'],
  });

  const ids = [...state.territories.keys()].sort();
  const lairTerr = state.territories.get(ids[0]!)!;
  const lairHex = lairTerr.hexIds[0]!;
  const lair: Army = {
    id: `army_01LAIR0000000000000000FIX0`,
    worldId: state.world.id,
    ownerGovernorId: wildGov,
    state: 'GARRISON',
    hexId: lairHex,
    units: [{ unitClass: 'INFANTRY', count: lairTroops, veterancy: 0, hp: 100 }],
    provisions: { food: lairTroops * 10, gold: 0, wood: 0 },
    supply: CONSTANTS.SUPPLY_MAX_DEFAULT,
    supplyMax: CONSTANTS.SUPPLY_MAX_DEFAULT,
    morale: 60,
    supplyTrainIds: [],
    version: 1,
  };
  state.armies.set(lair.id, lair);
  lairTerr.garrisonArmyId = lair.id;
  state.monsterNames!.set(lair.id, 'Gnoll_01_Claw');

  // The player farm right next door (ungarrisoned unless a test raises troops).
  const farmHex = state.adjacency!.get(lairHex)![0]!;
  const farmId = state.hexes.get(farmHex)!.territoryId!;
  claimTerritory(state, farmId, governorId);
  return { state, rng, governorId, wildGov, lair, lairHex, farmId, farmHex };
}

test('wildRaidChance scales with distance from the center (⚙ base + edge bonus)', () => {
  const center = wildRaidChance(0, BALANCE);
  const edge = wildRaidChance(1, BALANCE);
  assert.equal(center, BALANCE.wildRaids.baseChance);
  assert.equal(edge, BALANCE.wildRaids.baseChance + BALANCE.wildRaids.edgeChanceBonus);
  assert.ok(edge > center, 'the frontier bites harder');
  assert.equal(wildRaidChance(7, BALANCE), edge, 'distance clamps at 1');
});

test('raid spawn: half the lair marches (visible, interceptable) at the weakest reachable territory', () => {
  const f = raidFixture('raid-spawn');
  runTick(f.state, 1, f.rng.fork('sim'), RAIDY, OPTS);

  assert.equal(f.state.wildRaids!.size, 1, 'one raid in flight');
  const rec = [...f.state.wildRaids!.values()][0]!;
  assert.equal(rec.lairArmyId, f.lair.id);
  assert.equal(rec.homeHexId, f.lairHex);
  assert.equal(rec.targetHexId, f.farmHex, 'ungarrisoned farm is the weakest target');
  const raid = f.state.armies.get(rec.armyId)!;
  assert.equal(raid.state, 'MARCHING', 'raid uses normal march mechanics — visible and interceptable');
  assert.deepEqual(raid.path, [f.farmHex]);
  assert.equal(troopCount(raid), 100, 'half of 200');
  assert.equal(troopCount(f.lair), 100, 'half stays home');
  assert.equal(f.state.monsterNames!.get(raid.id), 'Gnoll_01_Claw', 'the raid carries the lair flavor');
  // one raid per lair at a time
  runTick(f.state, 2, f.rng.fork('sim'), RAIDY, OPTS);
  assert.ok(
    [...f.state.wildRaids!.values()].filter((r) => r.lairArmyId === f.lair.id).length <= 1,
    'a lair never runs two raids at once',
  );
});

test('defended territories (garrison ≥ ⚙ threshold) are NEVER raided', () => {
  const f = raidFixture('raid-defended');
  // Garrison the farm hard: two STANDARD armies merged strength ≥ threshold.
  const g1 = raiseArmy(f.state, f.farmId, 'STANDARD', f.rng.fork('g1'));
  g1.morale = 100;
  assert.ok(armyStrength(g1, BALANCE) >= RAIDY.wildRaids.defendedStrengthThreshold, 'fixture: hard target');
  runTick(f.state, 1, f.rng.fork('sim'), RAIDY, OPTS);
  assert.equal(f.state.wildRaids!.size, 0, 'no soft target in range ⇒ no raid');
  assert.equal(troopCount(f.lair), 200, 'the lair stays home');
});

test('raid on an ungarrisoned farm: auto-PILLAGE on arrival, owner keeps the land, survivors march home and re-merge', () => {
  const f = raidFixture('raid-walkin');
  const farm = f.state.territories.get(f.farmId)!;
  const pop0 = farm.population;
  const wildWallet0 = f.state.ctBalances!.get(f.wildGov) ?? 0;

  runTick(f.state, 1, f.rng.fork('sim'), RAIDY, OPTS); // spawn
  const rec = [...f.state.wildRaids!.values()][0]!;
  runTick(f.state, 2, f.rng.fork('sim'), RAIDY, OPTS); // raid arrives → sacks the farm

  assert.equal(farm.governorId, f.governorId, 'raiders NEVER occupy owned land');
  assert.equal(farm.population, Math.floor(pop0 * (1 - CONSTANTS.PILLAGE_POP_LOSS)), 'the farm burned');
  assert.ok((f.state.ctBalances!.get(f.wildGov) ?? 0) > wildWallet0, 'monsters looted the treasury');
  const sack = f.state.walkInOutcomes!.find((o) => o.territoryId === f.farmId)!;
  assert.equal(sack.action, 'PILLAGE');
  assert.equal(sack.governorId, f.wildGov);
  assert.equal(f.state.battles.size, 0, 'ungarrisoned ⇒ bloodless sack');

  // Survivors auto-march home (ordered the same tick, resolved the next)…
  const raid = f.state.armies.get(rec.armyId)!;
  assert.equal(raid.state, 'MARCHING');
  assert.deepEqual(raid.path, [f.lairHex]);
  // …(raids off for the return leg, or the ever-raiding test lair would just split again)…
  const NORAID: Balance = { ...BALANCE, wildRaids: { ...BALANCE.wildRaids, everyTicks: 0 } };
  runTick(f.state, 3, f.rng.fork('sim'), NORAID, OPTS); // marches home + AI phase merges
  // …and re-merge into the lair garrison (the raid army is gone).
  assert.equal(
    troopCount(f.lair),
    200,
    `survivors must re-merge into the lair (lair at ${troopCount(f.lair)})`,
  );
  assert.ok(
    f.state.armies.get(rec.armyId) === undefined || f.state.armies.get(rec.armyId)!.state === 'DISBANDED',
    'the raid army dissolves back into the lair',
  );
  assert.ok(![...(f.state.wildRaids?.keys() ?? [])].includes(rec.armyId), 'raid record cleared');
});

test('raid into a weak garrison: normal battle rules; decisive raiders PILLAGE (never occupy)', () => {
  const f = raidFixture('raid-battle', 400); // big lair → raid of 200 infantry
  // A thin scout screen guards the farm — below the threshold, so raidable.
  const screen = raiseArmy(f.state, f.farmId, 'SCOUTS', f.rng.fork('screen'));
  assert.ok(armyStrength(screen, BALANCE) < RAIDY.wildRaids.defendedStrengthThreshold);
  f.state.territories.get(f.farmId)!.foodStock = 10_000; // fed defenders — still outnumbered

  runTick(f.state, 1, f.rng.fork('sim'), RAIDY, OPTS); // spawn
  runTick(f.state, 2, f.rng.fork('sim'), RAIDY, OPTS); // arrival → battle same tick

  assert.equal(f.state.battles.size, 1, 'a real battle happened');
  const battle = [...f.state.battles.values()][0]!;
  assert.equal(battle.result!.winner, 'ATTACKER', '200 infantry beat 30 scouts');
  assert.equal(battle.result!.territoryOutcome, 'PILLAGED', 'raider victory auto-pillages');
  assert.equal(battle.result!.postVictoryAction, 'PILLAGE');
  const farm = f.state.territories.get(f.farmId)!;
  assert.equal(farm.governorId, f.governorId, 'raiders NEVER occupy owned land');
  assert.equal(f.state.pendingChoices!.size, 0, 'monsters never get a PILLAGE/OCCUPY choice');
});

test('wild raids are deterministic (bit-identical replays, fork per (tick, territoryId))', () => {
  const run = (): WorldState => {
    const f = raidFixture('raid-golden', 300);
    raiseArmy(f.state, f.farmId, 'SCOUTS', f.rng.fork('screen'));
    for (let t = 1; t <= 12; t++) runTick(f.state, t, f.rng.fork('sim'), RAIDY, OPTS);
    return f.state;
  };
  assert.deepStrictEqual(run(), run());
});
