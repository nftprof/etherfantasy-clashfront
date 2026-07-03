/**
 * Wild-battle tactical sim tests — docs/04 §7b wild row prototype:
 * battlefield generation determinism, full-battle determinism (same seed + no
 * input ⇒ identical outcome), all three resolution paths (attacker win →
 * pendingChoice, attacker loss → casualties + retreat/disband, clock expiry →
 * TIE retreat), steering commands as timeline inputs, engagement locking, and
 * overworld integration through runTick with liveWildBattles enabled.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Army, type Balance, CONSTANTS, createRng, loadBalance, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  applyWildBattleCommand,
  armyEngagedIn,
  claimTerritory,
  completeTraining,
  createWildBattle,
  type DemoWorldFile,
  generateBattlefield,
  loadDemoWorld,
  orderMarch,
  raiseArmy,
  runTick,
  settleWildBattle,
  stepWildBattle,
  type TickOptions,
  troopCount,
  type WildBattleSetup,
  type WildBattleState,
  wildBattleSurvivors,
  type WorldState,
} from '../src/index';

const BALANCE = loadBalance();
const CT = CONSTANTS.CT_UNITS_PER_CT;
const POLY: [number, number][] = [[0, 0], [120, 10], [140, 80], [100, 140], [30, 120], [-10, 60]];

function setup(
  atk: { cls: string; count: number }[],
  def: { cls: string; count: number }[],
  seed = 'wb-test',
): WildBattleSetup {
  return {
    id: 'battle_TEST',
    seed,
    hexId: 'hex_TEST',
    polygon: POLY,
    attackers: [{ armyId: 'army_A', governorId: 'player_1', units: atk }],
    defenders: [{ armyId: 'army_D', governorId: 'npc_wild', units: def }],
    masterName: 'Irene',
    hasMaster: true,
    startedTick: 0,
  };
}

function runToEnd(s: WildBattleState, balance: Balance = BALANCE, cap = 5000): WildBattleState {
  while (s.outcome === undefined && s.bt < cap) stepWildBattle(s, balance);
  return s;
}

const STANDARD = [
  { cls: 'INFANTRY', count: 100 },
  { cls: 'ARCHER', count: 60 },
  { cls: 'CAVALRY', count: 40 },
];
const MID_GARRISON = [
  { cls: 'INFANTRY', count: 60 },
  { cls: 'ARCHER', count: 25 },
];

test('battlefield generation is deterministic and lane-shaped', () => {
  const a = generateBattlefield(POLY, 'field-seed');
  const b = generateBattlefield(POLY, 'field-seed');
  assert.deepEqual(a, b, 'same (polygon, seed) ⇒ same battlefield, forever');
  const c = generateBattlefield(POLY, 'other-seed');
  assert.notDeepEqual(a.spawn, c.spawn, 'different seed ⇒ different layout');
  assert.equal(a.size, 240, 'arena = one MOBA-map-sized battlefield (docs/04 §7b scale laws)');
  assert.ok(a.obstacles.length >= 5, 'terrain scatter present');
  const laneClear = a.obstacles.every((o) => {
    // distance from obstacle to the spawn→heart segment must exceed its radius
    const dx = a.heart.x - a.spawn.x;
    const dy = a.heart.y - a.spawn.y;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((o.x - a.spawn.x) * dx + (o.y - a.spawn.y) * dy) / len2));
    const d = Math.hypot(o.x - (a.spawn.x + t * dx), o.y - (a.spawn.y + t * dy));
    return d > o.r;
  });
  assert.ok(laneClear, 'the one lane spawn→heart is kept clear of obstacles');
});

test('uninput battles are deterministic: same seed ⇒ bit-identical outcome and state', () => {
  const s1 = runToEnd(createWildBattle(setup(STANDARD, MID_GARRISON), BALANCE));
  const s2 = runToEnd(createWildBattle(setup(STANDARD, MID_GARRISON), BALANCE));
  assert.equal(JSON.stringify(s1), JSON.stringify(s2), 'replay is bit-identical');
  const s3 = runToEnd(createWildBattle(setup(STANDARD, MID_GARRISON, 'other'), BALANCE));
  assert.notEqual(JSON.stringify(s1.field), JSON.stringify(s3.field), 'seed drives the world');
});

test('a STANDARD army beats a mid-tier garrison with strength to spare (demo balance)', () => {
  const s = runToEnd(createWildBattle(setup(STANDARD, MID_GARRISON), BALANCE));
  assert.equal(s.outcome, 'ATTACKER', 'demo balance: standard army wins the canonical first fight');
  const survivors = wildBattleSurvivors(s);
  let atkStart = 0;
  let atkLeft = 0;
  for (const { entry, survivors: n } of survivors) {
    assert.ok(n <= entry.soldiers, 'survivors never exceed committed soldiers');
    if (entry.side === 'ATTACKER') {
      atkStart += entry.soldiers;
      atkLeft += n;
    } else {
      assert.equal(n, 0, 'routed wild defenders report zero survivors');
    }
  }
  assert.ok(atkLeft > atkStart * 0.5, `winner keeps most of the army (kept ${atkLeft}/${atkStart})`);
});

test('waves + Master exhausted ⇒ DEFENDER wins (attacker loss condition)', () => {
  const s = runToEnd(
    createWildBattle(setup([{ cls: 'INFANTRY', count: 40 }], [
      { cls: 'INFANTRY', count: 160 },
      { cls: 'ARCHER', count: 60 },
    ]), BALANCE),
  );
  assert.equal(s.outcome, 'DEFENDER');
  assert.equal(s.stock.reduce((n, c) => n + c, 0), 0, 'wave budget fully spent');
  assert.equal(s.entities.filter((e) => e.side === 'ATTACKER').length, 0, 'no attacker left on the field');
  assert.equal(s.master?.revives, 0, 'Master out of runs');
});

test('clock expiry without a decision ⇒ TIMEOUT (attacker auto-retreat path)', () => {
  const balance: Balance = structuredClone(BALANCE);
  balance.wildBattle.clockTicks = 10; // nothing dies in 2.5 s
  const s = runToEnd(createWildBattle(setup(STANDARD, MID_GARRISON), balance), balance);
  assert.equal(s.outcome, 'TIMEOUT');
  assert.equal(s.bt, 10);
});

test('steering commands are inputs: a rally order forks the timeline', () => {
  const base = runToEnd(createWildBattle(setup(STANDARD, MID_GARRISON), BALANCE));
  const steered = createWildBattle(setup(STANDARD, MID_GARRISON), BALANCE);
  applyWildBattleCommand(steered, { kind: 'rally', x: 10, y: 10 });
  applyWildBattleCommand(steered, { kind: 'move', x: 5000, y: -12 }); // clamped into the arena
  runToEnd(steered);
  assert.ok(steered.rally !== undefined && steered.rally.x === 10, 'rally recorded');
  assert.notEqual(JSON.stringify(base.entities), JSON.stringify(steered.entities), 'inputs change the battle');
  // focus on a tower must be accepted; junk targets ignored.
  const s2 = createWildBattle(setup(STANDARD, MID_GARRISON), BALANCE);
  stepWildBattle(s2, BALANCE);
  applyWildBattleCommand(s2, { kind: 'focus', targetId: s2.towers[0]!.id });
  assert.equal(s2.focusTgt, s2.towers[0]!.id);
  applyWildBattleCommand(s2, { kind: 'focus', targetId: 'nope' });
  assert.equal(s2.focusTgt, s2.towers[0]!.id, 'unknown target ignored');
});

// ── Overworld integration (runTick + liveWildBattles) ────────────────────────

const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 5, liveWildBattles: true };

/** Grid fixture copied from the wildRaids tests (square parcels, 4-way adjacency). */
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

interface Fixture {
  state: WorldState;
  rng: Rng;
  governorId: string;
  army: Army;
  lair: Army;
  lairHex: string;
  homeId: string;
}

/** A player army standing at home, a monster lair next door. */
function fixture(seed: string, lairTroops = 60): Fixture {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(5, 5), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const wildGov = [...state.governorKinds!.entries()].find(([, k]) => k === 'SYSTEM')![0]!;
  const { governorId } = addGovernor(state, rng.fork('orders'), {
    name: 'Attacker', kind: 'PLAYER', ctUnits: 50_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  const ids = [...state.territories.keys()].sort();
  const homeId = ids[0]!;
  claimTerritory(state, homeId, governorId);
  const homeHex = state.territories.get(homeId)!.hexIds[0]!;
  const lairHex = state.adjacency!.get(homeHex)![0]!;
  const lairTerr = state.territories.get(state.hexes.get(lairHex)!.territoryId!)!;
  const lair: Army = {
    id: 'army_01LAIR0000000000000000WBT0',
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
  const officers = state.officers!.get(governorId)!;
  const army = raiseArmy(state, homeId, 'STANDARD', rng.fork('raise'), officers[0]!.id);
  completeTraining(state, army.id);
  return { state, rng, governorId, army, lair, lairHex, homeId };
}

test('runTick: player-vs-wild becomes a RUNNING battle, locks the armies, accelerates to victory + pendingChoice', () => {
  const f = fixture('wb-live-win');
  orderMarch(f.state, f.army.id, [f.lairHex], OPTS);
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE, OPTS);

  assert.equal(f.state.wildBattles!.size, 1, 'live battle created instead of instant resolve');
  const battle = [...f.state.wildBattles!.values()][0]!;
  assert.equal(battle.hexId, f.lairHex);
  assert.equal(battle.attackerGovernorId, f.governorId);
  assert.ok(battle.master?.name === 'Irene', 'the leading officer commands as Master');
  assert.ok(armyEngagedIn(f.state, f.army.id) !== undefined, 'attacker pinned');
  assert.throws(() => orderMarch(f.state, f.army.id, [f.army.hexId], OPTS), /engaged in battle/);
  assert.equal(f.state.battles.size, 0, 'no resolved BattleInstance yet');

  // Accelerated: unwatched battles finish within a few world ticks.
  const pre = troopCount(f.army);
  for (let t = 2; t <= 5 && f.state.wildBattles!.size > 0; t++) {
    runTick(f.state, t, f.rng.fork('sim'), BALANCE, OPTS);
  }
  assert.equal(f.state.wildBattles!.size, 0, 'battle settled');
  const resolved = [...f.state.battles.values()][0]!;
  assert.equal(resolved.result?.winner, 'ATTACKER');
  assert.equal(resolved.resolutionMode, 'LIVE');
  assert.ok(troopCount(f.army) <= pre, 'real casualties applied');
  assert.equal(f.state.armies.get(f.lair.id)!.state, 'DISBANDED', 'beaten mobs rout');
  const choice = f.state.pendingChoices!.get(resolved.id);
  assert.ok(choice !== undefined && choice.governorId === f.governorId, 'normal PILLAGE/OCCUPY choice queued');
});

test('runTick: hopeless assault ⇒ DEFENDER victory, attacker casualties + §7c.5 retreat ladder', () => {
  const f = fixture('wb-live-loss', 600); // 600 wild defenders vs 200
  orderMarch(f.state, f.army.id, [f.lairHex], OPTS);
  let settled: string | undefined;
  for (let t = 1; t <= 8; t++) {
    runTick(f.state, t, f.rng.fork('sim'), BALANCE, OPTS);
    if (t > 1 && f.state.wildBattles!.size === 0 && settled === undefined) {
      settled = [...f.state.battles.keys()][0];
      break;
    }
  }
  assert.ok(settled !== undefined, 'battle settled');
  const resolved = f.state.battles.get(settled)!;
  assert.equal(resolved.result?.winner, 'DEFENDER');
  const logi = f.state.battleLogistics!.get(settled)!;
  assert.equal(logi.outcomeKind, 'DECISIVE_DEFENDER');
  assert.equal(logi.retreats.length, 1, 'failed attacker goes through the retreat ladder');
  const rec = logi.retreats[0]!;
  const army = f.state.armies.get(f.army.id)!;
  if (rec.result === 'RETREATED') {
    assert.notEqual(army.hexId, f.lairHex, 'retreated off the battle parcel');
  } else {
    assert.ok(rec.result === 'DISBANDED' || rec.result === 'SCATTERED');
  }
  assert.ok((resolved.result?.casualties?.[f.army.id] ?? 0) > 0, 'attacker paid in blood');
  assert.ok(troopCount(f.state.armies.get(f.lair.id)!) <= 600, 'defender casualties tracked');
  assert.equal(resolved.result?.territoryOutcome, 'HELD', 'the wild keeps its ground');
});

test('runTick: clock expiry ⇒ TIE semantics (no territory change, attacker withdraws)', () => {
  const balance: Balance = structuredClone(BALANCE);
  balance.wildBattle.clockTicks = 8;
  balance.wildBattle.acceleratedTicksPerWorldTick = 8;
  const f = fixture('wb-live-tie');
  orderMarch(f.state, f.army.id, [f.lairHex], OPTS);
  runTick(f.state, 1, f.rng.fork('sim'), balance, OPTS); // battle created
  runTick(f.state, 2, f.rng.fork('sim'), balance, OPTS); // 8 ticks = clock out, settled
  assert.equal(f.state.wildBattles!.size, 0);
  const resolved = [...f.state.battles.values()][0]!;
  assert.equal(resolved.result?.winner, 'DRAW');
  assert.equal(f.state.battleLogistics!.get(resolved.id)!.outcomeKind, 'TIE');
  assert.equal(f.state.armies.get(f.lair.id)!.state, 'GARRISON', 'wild garrison holds');
  assert.equal(f.state.pendingChoices!.size, 0, 'ties never change territory');
});

test('paced battles are skipped by the world tick (a LIVE driver owns their stepping)', () => {
  const f = fixture('wb-paced');
  orderMarch(f.state, f.army.id, [f.lairHex], OPTS);
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE, OPTS);
  const battle = [...f.state.wildBattles!.values()][0]!;
  battle.paced = true;
  runTick(f.state, 2, f.rng.fork('sim'), BALANCE, OPTS);
  assert.equal(battle.bt, 0, 'paced battle untouched by the world tick');
  battle.paced = false;
  runTick(f.state, 3, f.rng.fork('sim'), BALANCE, OPTS);
  assert.ok(battle.bt > 0 || f.state.wildBattles!.size === 0, 'unpaced battle fast-forwards');
});

test('settleWildBattle maps tactical deaths back to unit stacks exactly', () => {
  const f = fixture('wb-casualties');
  orderMarch(f.state, f.army.id, [f.lairHex], OPTS);
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE, OPTS);
  const battle = [...f.state.wildBattles!.values()][0]!;
  battle.paced = true; // hold it: we settle by hand
  while (battle.outcome === undefined) stepWildBattle(battle, BALANCE);
  const expected = new Map<string, number>();
  for (const { entry, survivors } of wildBattleSurvivors(battle)) {
    if (entry.side !== 'ATTACKER') continue;
    expected.set(entry.cls, survivors);
  }
  settleWildBattle(f.state, battle.id, f.state.world.tick, BALANCE, OPTS);
  for (const stack of f.state.armies.get(f.army.id)!.units) {
    assert.equal(stack.count, expected.get(stack.unitClass), `${stack.unitClass} survivors match the sim`);
  }
});

test('PvP and NPC battles stay instant — only player-vs-wild runs live', () => {
  const f = fixture('wb-scope');
  // A second player claims and garrisons the parcel next to the attacker.
  const rng2 = f.rng.fork('p2');
  const { governorId: gov2 } = addGovernor(f.state, rng2, {
    name: 'Defender', kind: 'PLAYER', ctUnits: 50_000 * CT, officerNames: ['Leah', 'Kai', 'Purin'],
  });
  const homeHex = f.state.territories.get(f.homeId)!.hexIds[0]!;
  const otherHex = f.state.adjacency!.get(homeHex)!.find((h) => h !== f.lairHex)!;
  const otherId = f.state.hexes.get(otherHex)!.territoryId!;
  claimTerritory(f.state, otherId, gov2);
  const defArmy = raiseArmy(f.state, otherId, 'SCOUTS', rng2.fork('raise'));
  completeTraining(f.state, defArmy.id);
  orderMarch(f.state, f.army.id, [otherHex], OPTS);
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE, OPTS);
  assert.equal(f.state.wildBattles!.size, 0, 'PvP never goes live (scope control)');
  assert.equal(f.state.battles.size, 1, 'PvP resolved instantly as before');
  assert.equal([...f.state.battles.values()][0]!.resolutionMode, 'AUTO');
});
