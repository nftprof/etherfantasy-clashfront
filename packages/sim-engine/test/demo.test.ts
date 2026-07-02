/**
 * MVP demo-world tests — docs/briefs/MVP-JULY7.md item 2.
 *
 * Covers (brief): a scripted scenario (raise, march, battle, occupy) reaching an
 * identical end state across runs (golden master); the officer oversight cap
 * (MAX_OVERSEEN_TERRITORIES); no negative resources; plus PILLAGE/OCCUPY choice
 * defaults, the HERO_IMPACT_MAX cap in WarScore, and loading the real
 * data/demo-world.json parcel graph.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  armyStrength,
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

function checkBasicInvariants(state: WorldState): void {
  for (const t of state.territories.values()) {
    assert.ok(t.population >= 0 && Number.isInteger(t.population), `${t.name}: bad population`);
    assert.ok(t.foodStock >= 0, `${t.name}: negative foodStock`);
    assert.ok(t.ctTreasury >= 0 && Number.isInteger(t.ctTreasury), `${t.name}: bad ctTreasury`);
    assert.ok(t.prosperity >= 0 && t.prosperity <= 100, `${t.name}: prosperity bounds`);
    assert.ok(t.morale >= 0 && t.morale <= 100, `${t.name}: morale bounds`);
  }
  for (const a of state.armies.values()) {
    for (const s of a.units) assert.ok(s.count >= 0 && Number.isInteger(s.count), `${a.id}: bad unit count`);
    assert.ok(a.supply >= 0 && a.supply <= a.supplyMax, `${a.id}: supply bounds`);
    assert.ok(state.hexes.has(a.hexId), `${a.id}: off-map position`);
  }
  for (const [gov, bal] of state.ctBalances ?? []) {
    assert.ok(bal >= 0 && Number.isInteger(bal), `governor ${gov}: bad CT balance ${bal}`);
  }
}

/** First claimable (SYSTEM, garrison-free) territory id, deterministic order. */
function firstClaimable(state: WorldState): string {
  for (const id of [...state.territories.keys()].sort()) {
    const t = state.territories.get(id)!;
    if (t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined) return id;
  }
  throw new Error('no claimable territory in fixture');
}

/** Weakest live monster garrison (by WarScore army strength; ties by id). */
function weakestMonster(state: WorldState): { armyId: string; hexId: string; territoryId: string } {
  let best: { armyId: string; hexId: string; territoryId: string; s: number } | undefined;
  for (const id of [...state.armies.keys()].sort()) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED' || state.monsterNames?.has(id) !== true) continue;
    const s = armyStrength(a, BALANCE);
    if (best === undefined || s < best.s) {
      best = { armyId: id, hexId: a.hexId, territoryId: state.hexes.get(a.hexId)!.territoryId!, s };
    }
  }
  assert.ok(best, 'fixture seeded no monsters');
  return best;
}

interface ScenarioResult {
  state: WorldState;
  governorId: string;
  homeId: string;
  /** Territory the battle actually happened on (the march may be INTERCEPTED by a garrison en route). */
  targetId: string;
  battleId: string;
}

/**
 * The scripted MVP loop: claim → raise → march → battle → pending choice.
 * Fully deterministic given `seed`; stops the tick loop the moment the first
 * battle resolves (for players: before its post-victory choice times out).
 */
function runScenario(
  seed: string,
  opts: { officerNames?: readonly string[]; ctUnits?: number; kind?: 'PLAYER' | 'NPC_KINGDOM' } = {},
): ScenarioResult {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(6, 6), rng.fork('worldgen'), { monsterParcelPct: 0.35 });
  const orders = rng.fork('orders');
  const { governorId, officers } = addGovernor(state, orders, {
    name: 'Alice',
    kind: opts.kind ?? 'PLAYER',
    ctUnits: opts.ctUnits ?? 2_000 * CT,
    officerNames: opts.officerNames ?? ['Choco', 'Maenak', 'Nara'],
    officerFame: 100_000, // absurd fame — proves the HERO_IMPACT_MAX cap clamps it
  });
  const homeId = firstClaimable(state);
  claimTerritory(state, homeId, governorId);
  const target = weakestMonster(state);
  const leader = officers.find((o) => o.assignedTerritoryId === undefined);
  const army = raiseArmy(state, homeId, 'STANDARD', orders, leader?.id);
  completeTraining(state, army.id); // E2: muster instantly — this scenario tests the battle loop
  const path = findPath(state, army.hexId, target.hexId);
  assert.ok(path !== undefined && path.length > 0, 'no path to the monster parcel');
  orderMarch(state, army.id, path, OPTS);

  let battleId: string | undefined;
  for (let t = 1; t <= 100; t++) {
    runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
    if (state.battles.size > 0) {
      battleId = [...state.battles.keys()].sort()[0]!;
      break;
    }
  }
  assert.ok(battleId !== undefined, 'no battle spawned within 100 ticks');
  const battle = state.battles.get(battleId)!;
  assert.equal(battle.result!.winner, 'ATTACKER', 'scenario expects the player army to win its first battle');
  // The march may be intercepted before the picked target — the fight is wherever it halted.
  const battleTerrId = state.hexes.get(battle.hexId)!.territoryId!;
  return { state, governorId, homeId, targetId: battleTerrId, battleId };
}

// ── Determinism ───────────────────────────────────────────────────────────────

test('loadDemoWorld is deterministic (ids, monsters, adjacency included)', () => {
  const a = loadDemoWorld(makeGrid(4, 4), createRng('dw'), { monsterParcelPct: 0.4 });
  const b = loadDemoWorld(makeGrid(4, 4), createRng('dw'), { monsterParcelPct: 0.4 });
  assert.deepStrictEqual(a, b);
  assert.ok(a.monsterNames!.size > 0, 'expected monsters at 40%');
});

test('golden master: scripted claim→raise→march→battle→occupy scenario is identical across runs', () => {
  const run = (): WorldState => {
    const r = runScenario('golden-demo');
    resolvePostVictory(r.state, r.battleId, 'OCCUPY', BALANCE);
    const rng = createRng('golden-demo');
    const end = r.state.world.tick + 10; // capture — runTick advances world.tick
    for (let t = r.state.world.tick + 1; t <= end; t++) {
      runTick(r.state, t, rng.fork('sim'), BALANCE, OPTS);
    }
    return r.state;
  };
  const a = run();
  const b = run();
  assert.deepStrictEqual(a, b);
});

// ── The playable loop ─────────────────────────────────────────────────────────

test('scenario: battle resolves, hero term capped, OCCUPY switches governor + assigns overseer', () => {
  const { state, governorId, targetId, battleId } = runScenario('scenario-occupy');
  const battle = state.battles.get(battleId)!;

  assert.equal(battle.state, 'RESOLVED');
  assert.equal(battle.type, 'FIELD');
  assert.equal(battle.resolutionMode, 'AUTO');
  assert.equal(battle.result!.winner, 'ATTACKER', 'STANDARD preset must beat the weakest monster');
  // invariant 4: officer term hard-capped at HERO_IMPACT_MAX of the army term.
  const bd = battle.warScore!.breakdown;
  assert.ok(bd.attackerHero! > 0, 'officer-led army should have a hero term');
  assert.ok(
    bd.attackerHero! <= CONSTANTS.HERO_IMPACT_MAX * bd.attackerArmy! + 1e-9,
    `hero term ${bd.attackerHero} exceeds ${CONSTANTS.HERO_IMPACT_MAX} cap`,
  );
  // pending choice exposed for the player winner
  const choice = state.pendingChoices!.get(battleId)!;
  assert.equal(choice.governorId, governorId);
  assert.equal(choice.territoryId, targetId);

  resolvePostVictory(state, battleId, 'OCCUPY', BALANCE);
  const target = state.territories.get(targetId)!;
  assert.equal(target.governorId, governorId);
  assert.equal(target.governorKind, 'PLAYER');
  assert.ok(target.overseerId !== undefined, 'occupation requires an assigned overseer');
  const officer = state.officers!.get(governorId)!.find((o) => o.id === target.overseerId);
  assert.equal(officer?.assignedTerritoryId, targetId);
  assert.equal(battle.result!.territoryOutcome, 'OCCUPIED');
  assert.equal(state.pendingChoices!.has(battleId), false);
  // monster garrison is gone
  for (const a of state.armies.values()) {
    if (state.monsterNames?.has(a.id) === true) assert.notEqual(a.hexId, battle.hexId);
  }
  checkBasicInvariants(state);
});

test('scenario: PILLAGE loots CT and degrades the territory (per canon constants)', () => {
  const { state, governorId, targetId, battleId } = runScenario('scenario-pillage');
  const before = structuredClone(state.territories.get(targetId)!);
  const walletBefore = state.ctBalances!.get(governorId)!;

  resolvePostVictory(state, battleId, 'PILLAGE', BALANCE);
  const t = state.territories.get(targetId)!;
  assert.equal(t.governorId, before.governorId, 'pillage must NOT capture the territory');
  assert.equal(t.population, Math.floor(before.population * (1 - CONSTANTS.PILLAGE_POP_LOSS)));
  assert.equal(t.development.AGRICULTURE, Math.floor(before.development.AGRICULTURE * (1 - CONSTANTS.PILLAGE_INFRA_LOSS)));
  assert.ok(t.prosperity <= before.prosperity, 'prosperity must take a hit');
  const loot = state.battles.get(battleId)!.result!.lootCt!;
  assert.ok(loot > 0 && Number.isInteger(loot));
  assert.equal(state.ctBalances!.get(governorId), walletBefore + loot);
  checkBasicInvariants(state);
});

test('unresolved player choice times out to PILLAGE after choiceTimeoutTicks', () => {
  const { state, battleId, targetId } = runScenario('scenario-timeout');
  const rng = createRng('scenario-timeout');
  const start = state.world.tick;
  for (let t = start + 1; t <= start + (OPTS.choiceTimeoutTicks! + 1); t++) {
    runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
  }
  assert.equal(state.pendingChoices!.has(battleId), false, 'choice must expire');
  assert.equal(state.battles.get(battleId)!.result!.territoryOutcome, 'PILLAGED');
  assert.equal(state.territories.get(targetId)!.governorKind, 'SYSTEM', 'timeout default never captures');
});

test('NPC attacker auto-occupies on victory (no overseer requirement)', () => {
  const { state, governorId, targetId, battleId } = runScenario('scenario-npc', {
    kind: 'NPC_KINGDOM',
    officerNames: [],
  });
  const t = state.territories.get(targetId)!;
  assert.equal(state.battles.get(battleId)!.result!.territoryOutcome, 'OCCUPIED');
  assert.equal(t.governorId, governorId);
  assert.equal(t.governorKind, 'NPC_KINGDOM');
  assert.equal(t.overseerId, undefined);
  assert.equal(state.pendingChoices!.size, 0, 'NPCs decide instantly');
});

test('occupation converts to pillage when the player has no free officer', () => {
  // One officer: consumed as overseer of the claimed home parcel → none left to occupy with.
  const { state, governorId, targetId, battleId } = runScenario('scenario-nofficer', {
    officerNames: ['Choco'],
  });
  resolvePostVictory(state, battleId, 'OCCUPY', BALANCE);
  assert.equal(state.battles.get(battleId)!.result!.territoryOutcome, 'PILLAGED');
  const t = state.territories.get(targetId)!;
  assert.notEqual(t.governorId, governorId, 'no officer ⇒ occupation must convert to pillage');
  assert.ok(state.ctBalances!.get(governorId)! > 0, 'pillage loot still paid');
});

// ── Oversight cap ─────────────────────────────────────────────────────────────

test('claim cost: founding free, adjacent free, distance charges CT, broke governor rejected', () => {
  const rng = createRng('claimcost');
  const state = loadDemoWorld(makeGrid(8, 8), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const balance = loadBalance();
  const perStep = balance.claims.costCtUnitsPerStep;
  const { governorId } = addGovernor(state, rng.fork('gov'), {
    name: 'Founder', kind: 'PLAYER', ctUnits: perStep * 20, officerNames: ['A', 'B', 'C', 'D'],
  });
  // grid ids sort row-major: pick a corner, its neighbor, and a far corner
  const ids = [...state.territories.keys()].sort();
  const corner = state.territories.get(ids[0]!)!;
  const cornerHex = corner.hexIds[0]!;
  const neighborHex = state.adjacency!.get(cornerHex)![0]!;
  const neighbor = [...state.territories.values()].find((t) => t.hexIds[0] === neighborHex)!;
  const far = ids[ids.length - 1]!; // opposite corner of an 8x8 grid — well past free radius

  claimTerritory(state, corner.id, governorId); // founding — free
  assert.equal(state.ctBalances!.get(governorId), perStep * 20);
  claimTerritory(state, neighbor.id, governorId); // adjacent — free
  assert.equal(state.ctBalances!.get(governorId), perStep * 20);
  const before = state.ctBalances!.get(governorId)!;
  claimTerritory(state, far, governorId); // distant — charged
  const charged = before - state.ctBalances!.get(governorId)!;
  assert.ok(charged > 0 && charged % perStep === 0, `charged ${charged} should be a positive multiple of ${perStep}`);
  // a broke governor cannot claim far land
  const broke = addGovernor(state, rng.fork('gov2'), {
    name: 'Pauper', kind: 'PLAYER', ctUnits: 0, officerNames: ['X', 'Y'],
  });
  claimTerritory(state, ids[1]!, broke.governorId); // founding free
  const farForPauper = [...state.territories.values()].find(
    (t) => t.governorId !== broke.governorId && t.governorKind === 'SYSTEM' && t.id > ids[40]!,
  )!;
  assert.throws(() => claimTerritory(state, farForPauper.id, broke.governorId), /too far from your lands/);
  // and the failed claim must not leak the overseer
  const officers = state.officers!.get(broke.governorId)!;
  assert.equal(officers.filter((o) => o.assignedTerritoryId !== undefined).length, 1);
});

test(`oversight cap: claim #${CONSTANTS.MAX_OVERSEEN_TERRITORIES + 1} rejected even with free officers`, () => {
  const rng = createRng('cap');
  const state = loadDemoWorld(makeGrid(8, 8), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('gov'), {
    name: 'Empress',
    kind: 'PLAYER',
    // Enough CT that distance-based claim costs (docs/02, claims balance) never
    // gate this test — it targets the OVERSIGHT CAP, not the wallet.
    ctUnits: 1_000_000_000,
    officerNames: Array.from({ length: CONSTANTS.MAX_OVERSEEN_TERRITORIES + 1 }, (_, i) => `Officer${i}`),
  });
  const ids = [...state.territories.keys()].sort();
  for (let i = 0; i < CONSTANTS.MAX_OVERSEEN_TERRITORIES; i++) {
    claimTerritory(state, ids[i]!, governorId);
  }
  assert.throws(
    () => claimTerritory(state, ids[CONSTANTS.MAX_OVERSEEN_TERRITORIES]!, governorId),
    /oversight cap/,
  );
  assert.throws(() => {
    // and with officers exhausted instead of the cap:
    const poor = addGovernor(state, rng.fork('gov2'), {
      name: 'Duke', kind: 'PLAYER', ctUnits: 0, officerNames: [],
    });
    claimTerritory(state, ids[CONSTANTS.MAX_OVERSEEN_TERRITORIES]!, poor.governorId);
  }, /no free officer/);
});

// ── Resource safety ───────────────────────────────────────────────────────────

test('raiseArmy with insufficient CT throws without mutating; balances never negative', () => {
  const rng = createRng('poor');
  const state = loadDemoWorld(makeGrid(4, 4), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('gov'), {
    name: 'Pauper', kind: 'PLAYER', ctUnits: 100 * CT, officerNames: ['Choco'],
  });
  const home = firstClaimable(state);
  claimTerritory(state, home, governorId);
  const armiesBefore = state.armies.size;
  assert.throws(() => raiseArmy(state, home, 'STANDARD', rng.fork('orders')), /insufficient CT/);
  assert.equal(state.ctBalances!.get(governorId), 100 * CT, 'failed raise must not charge');
  assert.equal(state.armies.size, armiesBefore);
  checkBasicInvariants(state);
});

// ── The real extracted world ──────────────────────────────────────────────────

test('real data/demo-world.json loads into a connected, monster-seeded world', () => {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', 'data', 'demo-world.json'), // dist/test/
    join(__dirname, '..', '..', '..', 'data', 'demo-world.json'), // test/ (ts-node style)
  ];
  const path = candidates.find((p) => existsSync(p));
  assert.ok(path, 'data/demo-world.json missing — run scripts/build-demo-world.mjs');
  const file = JSON.parse(readFileSync(path, 'utf8')) as DemoWorldFile;

  const rng: Rng = createRng('edu-demo');
  const state = loadDemoWorld(file, rng.fork('worldgen'));
  assert.equal(state.territories.size, file.parcels.length);
  assert.equal(state.hexes.size, file.parcels.length);
  assert.ok(state.monsterNames!.size > 50, 'expected a healthy monster population');
  // adjacency mirrors the file symmetrically
  for (const [hexId, neigh] of state.adjacency!) {
    for (const n of neigh) assert.ok(state.adjacency!.get(n)!.includes(hexId), 'asymmetric adjacency');
  }
  // connected: BFS from the first hex reaches everything
  const start = [...state.adjacency!.keys()].sort()[0]!;
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const n of state.adjacency!.get(queue[i]!)!) {
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  assert.equal(seen.size, state.hexes.size, 'demo world must be one connected graph');
  // and it ticks
  for (let t = 1; t <= 5; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
  checkBasicInvariants(state);
});
