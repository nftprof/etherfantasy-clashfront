/**
 * Neutral towns tests — Feature Set 2 F2 (docs/briefs/FEATURESET-2.md):
 * genesis seeding (⚙ balance.towns, never on monster lairs, frontier towns
 * richer), the bloodless walk-in choice (NO battle) with both PILLAGE and
 * OCCUPY resolutions, NPC instant occupy, the timeout default, cancellation
 * when the army leaves, the population threshold, foreign garrison-free towns,
 * and determinism of the whole flow.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  completeTraining,
  type DemoWorldFile,
  findPath,
  loadDemoWorld,
  orderMarch,
  raiseArmy,
  resolvePostVictory,
  runTick,
  type TickOptions,
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

interface TownFixture {
  state: WorldState;
  rng: Rng;
  governorId: string;
  homeId: string;
  townId: string;
  townHex: string;
  armyId: string;
}

/**
 * A player next to a hand-made TOWN, army raised and marched onto it, one tick
 * run: the walk-in choice is pending (kind = PLAYER) — NO battle happened.
 */
function walkInFixture(seed: string, kind: 'PLAYER' | 'NPC_KINGDOM' = 'PLAYER'): TownFixture {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(4, 4), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const orders = rng.fork('orders');
  const { governorId } = addGovernor(state, orders, {
    name: 'Walker',
    kind,
    ctUnits: 5_000 * CT,
    officerNames: kind === 'PLAYER' ? ['Choco', 'Maenak', 'Nara'] : [],
  });
  const ids = [...state.territories.keys()].sort();
  const homeId = ids.find((id) => {
    const t = state.territories.get(id)!;
    return t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined;
  })!;
  claimTerritory(state, homeId, governorId);
  const homeHex = state.territories.get(homeId)!.hexIds[0]!;
  const townHex = state.adjacency!.get(homeHex)![0]!;
  const town = state.territories.get(state.hexes.get(townHex)!.territoryId!)!;
  town.zoneType = 'TOWN';
  town.population = 1_500;
  town.ctTreasury = 200 * CT;
  town.prosperity = 60;
  const army = raiseArmy(state, homeId, 'STANDARD', orders);
  completeTraining(state, army.id); // E2: muster instantly — this suite tests walk-ins
  orderMarch(state, army.id, [townHex], OPTS);
  runTick(state, 1, rng.fork('sim'), BALANCE, OPTS);
  return { state, rng, governorId, homeId, townId: town.id, townHex, armyId: army.id };
}

// ── Genesis seeding ───────────────────────────────────────────────────────────

test('town seeding: ⚙ pct of garrison-free parcels become richer-with-distance TOWNs, never on monster lairs', () => {
  const rng = createRng('townseed');
  const state = loadDemoWorld(makeGrid(16, 16), rng.fork('worldgen'), { monsterParcelPct: 0.3 });
  const towns = [...state.territories.values()].filter((t) => t.zoneType === 'TOWN');
  assert.ok(towns.length >= 4, `expected a handful of towns on 256 parcels, got ${towns.length}`);
  for (const t of towns) {
    assert.equal(t.garrisonArmyId, undefined, `town ${t.name} must not sit on a monster lair`);
    assert.ok(t.population >= Math.floor(BALANCE.towns.popBase * 0.85), `${t.name}: town-scale population`);
    assert.ok(t.population >= BALANCE.towns.walkInMinPopulation, 'towns are always walk-in-able');
    assert.ok(Number.isInteger(t.ctTreasury) && t.ctTreasury >= Math.floor(BALANCE.towns.treasuryCtUnitsBase * 0.85));
    assert.ok(t.prosperity >= BALANCE.towns.prosperityBase);
    assert.equal(t.foodStock, t.population * BALANCE.towns.foodPerPop);
    assert.equal(t.governorKind, 'SYSTEM', 'towns start neutral');
  }
  // determinism: same seed reseeds identical towns
  const again = loadDemoWorld(makeGrid(16, 16), createRng('townseed').fork('worldgen'), { monsterParcelPct: 0.3 });
  assert.deepStrictEqual(again, state);
});

// ── The bloodless walk-in ─────────────────────────────────────────────────────

test('walk-in: arriving at a garrison-free town yields a pendingChoice WITHOUT battle', () => {
  const f = walkInFixture('walkin-pending');
  assert.equal(f.state.battles.size, 0, 'NO battle on a bloodless walk-in');
  const choice = [...f.state.pendingChoices!.values()].find((c) => c.territoryId === f.townId);
  assert.ok(choice, 'walk-in choice must be pending');
  assert.equal(choice.battleId, undefined, 'walk-ins have no battle behind them');
  assert.equal(choice.armyId, f.armyId);
  assert.equal(choice.governorId, f.governorId);
  assert.equal(f.state.territories.get(f.townId)!.governorKind, 'SYSTEM', 'town unclaimed until the choice');
});

test('walk-in OCCUPY: bloodless conquest under the existing oversight rules', () => {
  const f = walkInFixture('walkin-occupy');
  const choice = [...f.state.pendingChoices!.values()].find((c) => c.territoryId === f.townId)!;
  const treasury0 = f.state.territories.get(f.townId)!.ctTreasury;
  const wallet0 = f.state.ctBalances!.get(f.governorId)!;

  resolvePostVictory(f.state, choice.id, 'OCCUPY', BALANCE);
  const town = f.state.territories.get(f.townId)!;
  assert.equal(town.governorId, f.governorId);
  assert.equal(town.governorKind, 'PLAYER');
  assert.equal(town.zoneType, 'TOWN', 'occupation keeps the town a town');
  assert.ok(town.overseerId !== undefined, 'player occupation requires an overseer');
  assert.equal(town.garrisonArmyId, f.armyId, 'the walk-in army garrisons its prize');
  const seized = Math.floor(treasury0 * BALANCE.pillageOccupy.occupySeizeTreasuryPct);
  assert.equal(f.state.ctBalances!.get(f.governorId), wallet0 + seized);
  const outcome = f.state.walkInOutcomes!.find((o) => o.choiceId === choice.id)!;
  assert.equal(outcome.action, 'OCCUPY');
  assert.equal(outcome.lootCt, seized);
  assert.equal(f.state.pendingChoices!.size, 0);
});

test('walk-in PILLAGE: the town burns — existing loot math, no capture', () => {
  const f = walkInFixture('walkin-pillage');
  const choice = [...f.state.pendingChoices!.values()].find((c) => c.territoryId === f.townId)!;
  const before = structuredClone(f.state.territories.get(f.townId)!);
  // The raise spend's LANDYIELD ring already seeded the town's enrichment pool (E1/E3).
  const pool0 = f.state.enrichmentPools!.get(f.townId) ?? 0;
  const wallet0 = f.state.ctBalances!.get(f.governorId)!;

  resolvePostVictory(f.state, choice.id, 'PILLAGE', BALANCE);
  const town = f.state.territories.get(f.townId)!;
  assert.equal(town.governorKind, 'SYSTEM', 'pillage never captures');
  assert.equal(town.population, Math.floor(before.population * (1 - CONSTANTS.PILLAGE_POP_LOSS)));
  // E5: the per-pop scavenge is CAPPED at what the treasury still holds after
  // the treasury share — pillage is redistribution, never a mint. E3: the
  // pillager also carries off ⚙ enrichLootPct of the enrichment pool.
  const lootTreasury = Math.floor(before.ctTreasury * BALANCE.pillageOccupy.pillageLootTreasuryPct);
  const lootPool = Math.floor(pool0 * BALANCE.economy.enrichLootPct);
  const loot =
    lootTreasury +
    Math.min(before.population * BALANCE.pillageOccupy.pillageLootCtUnitsPerPop, before.ctTreasury - lootTreasury) +
    lootPool;
  assert.equal(f.state.ctBalances!.get(f.governorId), wallet0 + loot);
  assert.equal(f.state.enrichmentPools!.get(f.townId), pool0 - lootPool, 'the rest of the pool stays with the land');
  const outcome = f.state.walkInOutcomes!.find((o) => o.choiceId === choice.id)!;
  assert.equal(outcome.action, 'PILLAGE');
  assert.equal(outcome.lootCt, loot);
});

test('walk-in timeout defaults to PILLAGE for players; leaving first CANCELS the claim', () => {
  // timeout → default PILLAGE
  const f1 = walkInFixture('walkin-timeout');
  const c1 = [...f1.state.pendingChoices!.values()].find((c) => c.territoryId === f1.townId)!;
  for (let t = 2; t <= c1.expiresTick; t++) runTick(f1.state, t, f1.rng.fork('sim'), BALANCE, OPTS);
  assert.equal(f1.state.pendingChoices!.size, 0, 'choice must expire');
  const o1 = f1.state.walkInOutcomes!.find((o) => o.choiceId === c1.id)!;
  assert.equal(o1.action, 'PILLAGE', 'player default is PILLAGE');

  // army marches home before deciding → cancelled, town untouched
  const f2 = walkInFixture('walkin-cancel');
  const c2 = [...f2.state.pendingChoices!.values()].find((c) => c.territoryId === f2.townId)!;
  const townBefore = structuredClone(f2.state.territories.get(f2.townId)!);
  const homeHex = f2.state.territories.get(f2.homeId)!.hexIds[0]!;
  orderMarch(f2.state, f2.armyId, [homeHex], OPTS);
  for (let t = 2; t <= c2.expiresTick; t++) runTick(f2.state, t, f2.rng.fork('sim'), BALANCE, OPTS);
  assert.equal(f2.state.pendingChoices!.size, 0, 'choice expired');
  assert.equal(f2.state.walkInOutcomes!.length, 0, 'no loot from afar — cancelled');
  assert.deepStrictEqual(f2.state.territories.get(f2.townId), townBefore, 'town untouched');
});

test('NPC walk-in resolves instantly as OCCUPY', () => {
  const f = walkInFixture('walkin-npc', 'NPC_KINGDOM');
  assert.equal(f.state.battles.size, 0);
  assert.equal(f.state.pendingChoices!.size, 0, 'NPCs decide instantly');
  const town = f.state.territories.get(f.townId)!;
  assert.equal(town.governorId, f.governorId);
  assert.equal(town.governorKind, 'NPC_KINGDOM');
  assert.equal(f.state.walkInOutcomes!.find((o) => o.territoryId === f.townId)?.action, 'OCCUPY');
});

test('ordinary wild hamlets (pop < ⚙ walkInMinPopulation) do NOT trigger walk-ins', () => {
  const rng = createRng('walkin-threshold');
  const state = loadDemoWorld(makeGrid(4, 4), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const orders = rng.fork('orders');
  const { governorId } = addGovernor(state, orders, {
    name: 'Walker', kind: 'PLAYER', ctUnits: 5_000 * CT, officerNames: ['Choco', 'Maenak'],
  });
  const ids = [...state.territories.keys()].sort();
  const homeId = ids.find((id) => state.territories.get(id)!.garrisonArmyId === undefined)!;
  claimTerritory(state, homeId, governorId);
  const homeHex = state.territories.get(homeId)!.hexIds[0]!;
  const wildHex = state.adjacency!.get(homeHex)![0]!;
  const wild = state.territories.get(state.hexes.get(wildHex)!.territoryId!)!;
  assert.ok(wild.population < BALANCE.towns.walkInMinPopulation, 'fixture: a plain wild hamlet');
  const army = raiseArmy(state, homeId, 'STANDARD', orders);
  completeTraining(state, army.id);
  orderMarch(state, army.id, [wildHex], OPTS);
  runTick(state, 1, rng.fork('sim'), BALANCE, OPTS);
  assert.equal(state.pendingChoices!.size, 0, 'no choice on a plain wild parcel');
  assert.equal(state.battles.size, 0);
  assert.equal(wild.governorKind, 'SYSTEM');
});

test('a garrison-free FOREIGN town falls to a walk-in too (bloodless conquest of owned land)', () => {
  const rng = createRng('walkin-foreign');
  const state = loadDemoWorld(makeGrid(5, 5), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const orders = rng.fork('orders');
  const alice = addGovernor(state, orders, {
    name: 'Alice', kind: 'PLAYER', ctUnits: 5_000 * CT, officerNames: ['Choco', 'Maenak'],
  });
  const bob = addGovernor(state, orders, {
    name: 'Bob', kind: 'PLAYER', ctUnits: 5_000 * CT, officerNames: ['Purin', 'Blis'],
  });
  const ids = [...state.territories.keys()].sort();
  const homeId = ids.find((id) => state.territories.get(id)!.garrisonArmyId === undefined)!;
  claimTerritory(state, homeId, alice.governorId);
  const homeHex = state.territories.get(homeId)!.hexIds[0]!;
  const townHex = state.adjacency!.get(homeHex)![0]!;
  const town = state.territories.get(state.hexes.get(townHex)!.territoryId!)!;
  town.zoneType = 'TOWN';
  town.population = 2_000;
  claimTerritory(state, town.id, bob.governorId); // Bob owns it — but posts no garrison
  const bobOverseer = town.overseerId;
  assert.ok(bobOverseer !== undefined);

  const army = raiseArmy(state, homeId, 'STANDARD', orders);
  completeTraining(state, army.id);
  const path = findPath(state, army.hexId, townHex, alice.governorId)!;
  orderMarch(state, army.id, path, OPTS);
  runTick(state, 1, rng.fork('sim'), BALANCE, OPTS);

  assert.equal(state.battles.size, 0, 'no garrison ⇒ no battle');
  const choice = [...state.pendingChoices!.values()].find((c) => c.territoryId === town.id)!;
  assert.equal(choice.governorId, alice.governorId);
  resolvePostVictory(state, choice.id, 'OCCUPY', BALANCE);
  assert.equal(town.governorId, alice.governorId);
  const freed = state.officers!.get(bob.governorId)!.find((o) => o.id === bobOverseer)!;
  assert.equal(freed.assignedTerritoryId, undefined, "Bob's evicted overseer is freed");
});

test('walk-in flow is deterministic (bit-identical replays)', () => {
  const run = (): WorldState => {
    const f = walkInFixture('walkin-golden');
    for (let t = 2; t <= 10; t++) runTick(f.state, t, f.rng.fork('sim'), BALANCE, OPTS);
    return f.state;
  };
  assert.deepStrictEqual(run(), run());
});
