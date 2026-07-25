/**
 * Battle logistics tests — docs/04 §7c (Stream B, docs/briefs/MVP-JULY7.md):
 * provisioning API (CT-costed, garrison-at-friendly-territory only), default
 * provision packs at raiseArmy, march rations + starvation desertion, the v2
 * resolver's endurance/structure terms, TIE outcome (no territory change,
 * attacker retreats), scatter (SCATTER_CASUALTY_PCT + morale collapse), and
 * determinism of the whole thing.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Army, CONSTANTS, createRng, loadBalance, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  completeTraining,
  type DemoWorldFile,
  loadDemoWorld,
  orderMarch,
  provisionArmy,
  provisionCostCtUnits,
  raiseArmy,
  raiseCost,
  runTick,
  type TickOptions,
  troopCount,
  type WorldState,
} from '../src/index';

const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 3 };
const BALANCE = loadBalance();
const P = BALANCE.provisions;
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

/** Two adjacent SYSTEM, garrison-free territories (deterministic pick). */
function adjacentClaimablePair(state: WorldState): { terrA: string; hexA: string; terrB: string; hexB: string } {
  for (const id of [...state.territories.keys()].sort()) {
    const t = state.territories.get(id)!;
    if (t.governorKind !== 'SYSTEM' || t.garrisonArmyId !== undefined) continue;
    const hexA = t.hexIds[0]!;
    for (const n of state.adjacency!.get(hexA) ?? []) {
      const nt = state.territories.get(state.hexes.get(n)!.territoryId!)!;
      if (nt.governorKind === 'SYSTEM' && nt.garrisonArmyId === undefined) {
        return { terrA: id, hexA, terrB: nt.id, hexB: n };
      }
    }
  }
  throw new Error('no adjacent claimable pair');
}

interface TwoKingdoms {
  state: WorldState;
  rng: Rng;
  govA: string;
  govB: string;
  terrA: string;
  hexA: string;
  terrB: string;
  hexB: string;
  attacker: Army;
  defender: Army;
}

/**
 * Fixture: two NPC kingdoms on adjacent parcels of an empty (monster-free)
 * grid, one STANDARD army each; the defender's larder is stocked so only the
 * knobs a test tweaks decide the battle.
 */
function twoKingdoms(seed: string, grid = makeGrid(3, 3)): TwoKingdoms {
  const rng = createRng(seed);
  const state = loadDemoWorld(grid, rng.fork('worldgen'), { monsterParcelPct: 0 });
  const orders = rng.fork('orders');
  const { governorId: govA } = addGovernor(state, orders, {
    name: 'A', kind: 'NPC_KINGDOM', ctUnits: 10_000 * CT, officerNames: [],
  });
  const { governorId: govB } = addGovernor(state, orders, {
    name: 'B', kind: 'NPC_KINGDOM', ctUnits: 10_000 * CT, officerNames: [],
  });
  const { terrA, hexA, terrB, hexB } = adjacentClaimablePair(state);
  claimTerritory(state, terrA, govA);
  claimTerritory(state, terrB, govB);
  const defender = raiseArmy(state, terrB, 'STANDARD', orders);
  const attacker = raiseArmy(state, terrA, 'STANDARD', orders);
  completeTraining(state, defender.id); // E2: muster instantly — this suite tests battle logistics
  completeTraining(state, attacker.id);
  state.territories.get(terrB)!.foodStock = 10_000; // well-fed defender by default
  return { state, rng, govA, govB, terrA, hexA, terrB, hexB, attacker, defender };
}

// ── Provisioning (docs/04 §7c.1) ──────────────────────────────────────────────

test('raiseArmy buys the standard provision pack; cost breakdown = training + provisions', () => {
  const w = twoKingdoms('raise-pack');
  const cost = raiseCost('STANDARD', BALANCE);
  // STANDARD = 200 soldiers → defaults × 200.
  assert.deepEqual(w.attacker.provisions, {
    food: 200 * P.defaultFoodPerSoldier,
    gold: 200 * P.defaultGoldPerSoldier,
    wood: 200 * P.defaultWoodPerSoldier,
  });
  assert.deepEqual(cost.provisions, w.attacker.provisions);
  assert.equal(cost.provisionsCtUnits, provisionCostCtUnits(cost.provisions, BALANCE));
  assert.equal(cost.totalCtUnits, cost.unitsCtUnits + cost.provisionsCtUnits);
  // wallet was charged the FULL cost (one raise per governor in the fixture)
  assert.equal(w.state.ctBalances!.get(w.govA), 10_000 * CT - cost.totalCtUnits);
});

test('provisionArmy: CT deducted at balance prices; only in GARRISON at a FRIENDLY territory', () => {
  const w = twoKingdoms('provision-api');
  const wallet0 = w.state.ctBalances!.get(w.govA)!;
  const before = { ...w.attacker.provisions };

  const { costCtUnits } = provisionArmy(w.state, w.attacker.id, { food: 100, gold: 10, wood: 5 }, BALANCE);
  assert.equal(costCtUnits, 100 * P.ctUnitsPerFood + 10 * P.ctUnitsPerGold + 5 * P.ctUnitsPerWood);
  assert.equal(w.state.ctBalances!.get(w.govA), wallet0 - costCtUnits);
  assert.deepEqual(w.attacker.provisions, {
    food: before.food + 100, gold: before.gold + 10, wood: before.wood + 5,
  });

  // bad amounts / insolvency mutate nothing
  assert.throws(() => provisionArmy(w.state, w.attacker.id, { food: -1, gold: 0, wood: 0 }, BALANCE), /non-negative integer/);
  assert.throws(() => provisionArmy(w.state, w.attacker.id, { food: 10 ** 12, gold: 0, wood: 0 }, BALANCE), /insufficient CT/);
  assert.equal(w.state.ctBalances!.get(w.govA), wallet0 - costCtUnits);

  // not while marching…
  orderMarch(w.state, w.attacker.id, [w.hexB], OPTS);
  assert.throws(() => provisionArmy(w.state, w.attacker.id, { food: 1, gold: 0, wood: 0 }, BALANCE), /must be in GARRISON/);

  // …and not on foreign soil: march a fresh army of A onto a WILD parcel.
  const w2 = twoKingdoms('provision-foreign');
  const wildNeighbor = (w2.state.adjacency!.get(w2.hexA) ?? []).find((n) => {
    const t = w2.state.territories.get(w2.state.hexes.get(n)!.territoryId!)!;
    return t.governorKind === 'SYSTEM';
  })!;
  orderMarch(w2.state, w2.attacker.id, [wildNeighbor], OPTS);
  runTick(w2.state, 1, w2.rng.fork('sim'), BALANCE, OPTS);
  assert.equal(w2.attacker.state, 'GARRISON');
  assert.equal(w2.attacker.hexId, wildNeighbor);
  assert.throws(() => provisionArmy(w2.state, w2.attacker.id, { food: 1, gold: 0, wood: 0 }, BALANCE), /not at a friendly territory/);
});

// ── March rations & starvation (docs/04 §7c.1) ────────────────────────────────

test('marching at food=0 bleeds morale each tick (desertion is the daily §8 model — see desertion.test.ts)', () => {
  const w = twoKingdoms('starving', makeGrid(4, 4));
  // Send the attacker on a never-ending march (huge step time keeps it MARCHING).
  const far: TickOptions = { travelTicksPerStep: 100, choiceTimeoutTicks: 3 };
  w.attacker.provisions.food = 0;
  w.attacker.morale = 26;
  const before = w.attacker.units.map((s) => s.count); // 100/60/40
  const wildNeighbor = (w.state.adjacency!.get(w.hexA) ?? []).find((n) => n !== w.hexB)!;
  orderMarch(w.state, w.attacker.id, [wildNeighbor], far);
  for (let t = 1; t <= 4; t++) runTick(w.state, t, w.rng.fork('sim'), BALANCE, far);
  assert.equal(w.attacker.state, 'MARCHING');
  // −1 morale/tick while starving: 26 → 22 over 4 ticks.
  assert.equal(w.attacker.morale, 22);
  // Desertion is now docs/03 §8's daily-prorated model (wave 4.8): a 200-troop
  // army just below the threshold sheds NO whole soldiers over a 4-tick window —
  // attrition is a multi-hour bleed, exercised in desertion.test.ts.
  assert.deepEqual(w.attacker.units.map((s) => s.count), before);
});

test('march step consumes marchFoodPerStep-worth of carried food', () => {
  const w = twoKingdoms('march-food');
  const food0 = w.attacker.provisions.food;
  const wildNeighbor = (w.state.adjacency!.get(w.hexA) ?? []).find((n) => n !== w.hexB)!;
  orderMarch(w.state, w.attacker.id, [wildNeighbor], OPTS);
  runTick(w.state, 1, w.rng.fork('sim'), BALANCE, OPTS);
  // STANDARD 200 soldiers × ⚙ marchFoodPerStepPer100.
  assert.equal(w.attacker.provisions.food, food0 - Math.ceil((200 * P.marchFoodPerStepPer100) / 100));
});

// ── Battle resolution v2 (docs/04 §7c.6) ──────────────────────────────────────

test('TIE: equal armies → DRAW, both sides bleed, NO territory change, attacker retreats home', () => {
  const w = twoKingdoms('tie');
  const preAtk = w.attacker.units.map((s) => s.count);
  const stock0 = w.state.territories.get(w.terrB)!.foodStock;
  orderMarch(w.state, w.attacker.id, [w.hexB], OPTS);
  runTick(w.state, 1, w.rng.fork('sim'), BALANCE, OPTS);

  const battleId = [...w.state.battles.keys()].sort()[0]!;
  const battle = w.state.battles.get(battleId)!;
  const logi = w.state.battleLogistics!.get(battleId)!;

  // Attacker: full endurance + tier-2 command center (+10%) vs fully-fed
  // defender ⇒ gap 0.1/1.1 < TIE_THRESHOLD 0.15 ⇒ DRAW.
  assert.equal(battle.result!.winner, 'DRAW');
  assert.equal(logi.outcomeKind, 'TIE');
  assert.equal(logi.commandCenterTier, 2);
  assert.equal(logi.structureBonus, P.commandCenterTiers[1]!.bonus);
  assert.equal(logi.attackerEndurance, 1);
  assert.equal(logi.defenderEndurance, 1);
  assert.equal(w.state.pendingChoices!.size, 0, 'ties never yield a PILLAGE/OCCUPY choice');

  // no territory change; defender larder ate the battle's food need (800 for 200 men)
  const terrB = w.state.territories.get(w.terrB)!;
  assert.equal(terrB.governorId, w.govB);
  assert.equal(terrB.foodStock, stock0 - logi.defenderFoodConsumed);
  assert.equal(logi.defenderFoodConsumed, Math.ceil((200 * P.battleFoodNeedPer100) / 100));

  // symmetric smaller casualties (⚙ tieCasualtyFrac per stack, floored)
  const expectLost = preAtk.reduce((n, c) => n + Math.floor(c * P.tieCasualtyFrac), 0);
  assert.equal(battle.result!.casualties[w.attacker.id], expectLost);
  assert.equal(battle.result!.casualties[w.defender.id], expectLost);

  // attacker retreated to its own adjacent parcel (its origin home)
  assert.deepEqual(logi.retreats, [{ armyId: w.attacker.id, result: 'RETREATED', toHexId: w.hexA }]);
  assert.equal(w.attacker.state, 'GARRISON');
  assert.equal(w.attacker.hexId, w.hexA);

  // logistics were SPENT despite the draw: battle food + the tier-2 CC budget
  assert.equal(w.attacker.provisions.gold, 200 - logi.goldSpent);
  assert.equal(w.attacker.provisions.wood, 200 - logi.woodSpent);
  assert.equal(logi.goldSpent, Math.ceil((P.commandCenterTiers[1]!.goldPer100 * 200) / 100));
  assert.equal(
    w.attacker.provisions.food,
    200 * P.defaultFoodPerSoldier - Math.ceil((200 * P.marchFoodPerStepPer100) / 100) - logi.attackerFoodConsumed,
  );
});

test('endurance: an underfed attacker loses decisively to an equal, fed defender and retreats', () => {
  const w = twoKingdoms('underfed');
  w.attacker.provisions = { food: 0, gold: 0, wood: 0 }; // starved out before the walls
  orderMarch(w.state, w.attacker.id, [w.hexB], OPTS);
  runTick(w.state, 1, w.rng.fork('sim'), BALANCE, OPTS);

  const battleId = [...w.state.battles.keys()].sort()[0]!;
  const battle = w.state.battles.get(battleId)!;
  const logi = w.state.battleLogistics!.get(battleId)!;

  assert.equal(battle.result!.winner, 'DEFENDER');
  assert.equal(logi.outcomeKind, 'DECISIVE_DEFENDER');
  assert.equal(logi.attackerEndurance, P.enduranceFloor);
  assert.equal(logi.commandCenterTier, 0, 'no gold/wood ⇒ no command center');
  // beaten attacker retreated home rather than scattering (Day-1 wipe replaced)
  assert.deepEqual(logi.retreats, [{ armyId: w.attacker.id, result: 'RETREATED', toHexId: w.hexA }]);
  assert.equal(w.attacker.state, 'GARRISON');
  assert.equal(w.attacker.hexId, w.hexA);
  assert.equal(w.state.territories.get(w.terrB)!.governorId, w.govB, 'defender holds');
  assert.equal(battle.result!.territoryOutcome, 'HELD');
});

test('scatter: a beaten attacker with no friendly/neutral adjacent parcel takes SCATTER_CASUALTY_PCT extra and cripples', () => {
  const rng = createRng('scatter');
  const state = loadDemoWorld(makeGrid(3, 3), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const orders = rng.fork('orders');
  const { governorId: govA } = addGovernor(state, orders, {
    name: 'A', kind: 'NPC_KINGDOM', ctUnits: 10_000 * CT, officerNames: [],
  });
  const { governorId: govB } = addGovernor(state, orders, {
    name: 'B', kind: 'NPC_KINGDOM', ctUnits: 10_000 * CT, officerNames: [],
  });
  // B owns the corner AND both of its neighbors, each garrisoned — no retreat line.
  const cornerTerr = [...state.territories.keys()].sort()[0]!;
  const cornerHex = state.territories.get(cornerTerr)!.hexIds[0]!;
  claimTerritory(state, cornerTerr, govB);
  completeTraining(state, raiseArmy(state, cornerTerr, 'STANDARD', orders).id);
  for (const n of state.adjacency!.get(cornerHex)!) {
    const t = state.territories.get(state.hexes.get(n)!.territoryId!)!;
    claimTerritory(state, t.id, govB);
    completeTraining(state, raiseArmy(state, t.id, 'STANDARD', orders).id);
  }
  state.territories.get(cornerTerr)!.foodStock = 10_000;
  // A's raiding party is dropped on the corner, out of supplies (test teleport).
  const farTerr = [...state.territories.keys()].sort().find((id) => state.territories.get(id)!.governorKind === 'SYSTEM')!;
  claimTerritory(state, farTerr, govA);
  const raider = raiseArmy(state, farTerr, 'SCOUTS', orders);
  completeTraining(state, raider.id);
  delete state.territories.get(farTerr)!.garrisonArmyId; // teleport: hand back the home garrison slot
  raider.hexId = cornerHex;
  raider.provisions = { food: 0, gold: 0, wood: 0 };
  const preTroops = troopCount(raider);

  runTick(state, 1, rng.fork('sim'), BALANCE, OPTS);

  const battleId = [...state.battles.keys()].sort()[0]!;
  const battle = state.battles.get(battleId)!;
  const logi = state.battleLogistics!.get(battleId)!;
  assert.equal(logi.outcomeKind, 'DECISIVE_DEFENDER');
  assert.deepEqual(logi.retreats, [{ armyId: raider.id, result: 'SCATTERED' }]);
  // crippled remnant: extra SCATTER_CASUALTY_PCT applied on top of battle losses…
  assert.equal(battle.result!.casualties[raider.id], preTroops - troopCount(raider));
  assert.ok(troopCount(raider) > 0 && raider.state === 'GARRISON' && raider.hexId === cornerHex);
  // …with morale collapsed to the scatter floor
  assert.ok(raider.morale <= BALANCE.provisions.scatterMoraleFloor, `morale ${raider.morale} above scatter floor`);
  assert.equal(state.territories.get(cornerTerr)!.governorId, govB, 'defender holds the field');
});

// ── Determinism ───────────────────────────────────────────────────────────────

test('the logistics battle pipeline is deterministic (tie scenario, bit-identical replays)', () => {
  const run = (): WorldState => {
    const w = twoKingdoms('logi-golden');
    provisionArmy(w.state, w.attacker.id, { food: 50, gold: 5, wood: 5 }, BALANCE);
    orderMarch(w.state, w.attacker.id, [w.hexB], OPTS);
    for (let t = 1; t <= 10; t++) runTick(w.state, t, w.rng.fork('sim'), BALANCE, OPTS);
    return w.state;
  };
  assert.deepStrictEqual(run(), run());
});
