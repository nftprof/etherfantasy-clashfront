/**
 * Feature Set 2 server tests (docs/briefs/FEATURESET-2.md):
 * F1 — fog-filtered state/deltas/events per viewer (ownership public, military
 * fogged; FUZZY bands; participants always ACCURATE; hidden tombstones; intel
 * memory surviving snapshot save/load).
 * (F2 towns, F3 wild raids, F4 develop get their server-facing tests below as
 * they land.)
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS, loadBalance } from '@clashfront/shared';
import { armyStrength, developCostCtUnits, type DemoWorldFile } from '@clashfront/sim-engine';
import { ClashServer, Game, type GameConfig, parseMasterNames } from '../src/index';

const CT = CONSTANTS.CT_UNITS_PER_CT;
const BALANCE = loadBalance();

function repoDataPath(file: string): string {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', 'data', file), // dist/test/
    join(__dirname, '..', '..', '..', 'data', file), // test/ (ts-node style)
  ];
  const found = candidates.find((p) => existsSync(p));
  assert.ok(found, `${file} missing from data/`);
  return found;
}

const WORLD_FILE = JSON.parse(readFileSync(repoDataPath('demo-world.json'), 'utf8')) as DemoWorldFile;
const MASTER_NAMES = parseMasterNames(readFileSync(repoDataPath('CHARACTER_ROSTER.csv'), 'utf8'));

function gameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    worldFile: WORLD_FILE,
    seed: 'fs2-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 5000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

/** SYSTEM + garrison-free territory ids, sorted. */
function claimableIds(game: Game): string[] {
  return [...game.state.territories.keys()].sort().filter((id) => {
    const t = game.state.territories.get(id)!;
    return t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined;
  });
}

/** BFS distances (steps) from a hex over the parcel graph. */
function distancesFrom(game: Game, fromHex: string): Map<string, number> {
  const d = new Map<string, number>([[fromHex, 0]]);
  const queue = [fromHex];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const n of game.state.adjacency!.get(cur) ?? []) {
      if (d.has(n)) continue;
      d.set(n, d.get(cur)! + 1);
      queue.push(n);
    }
  }
  return d;
}

const hexOf = (game: Game, terrId: string): string => game.state.territories.get(terrId)!.hexIds[0]!;

/** E2: tick until every training queue has mustered (bounded — fails loudly if stuck). */
function musterAll(game: Game): void {
  for (let i = 0; i < 30 && (game.state.trainingQueues?.size ?? 0) > 0; i++) game.tick();
  assert.equal(game.state.trainingQueues?.size ?? 0, 0, 'armies must finish mustering');
}

// ── F1: fog-filtered /api/state shapes ────────────────────────────────────────

test('F1 fog: ownership public everywhere; military detail gated by intel grade', () => {
  const game = new Game(gameConfig());
  const alice = game.join('Alice');
  const bob = game.join('Bob');

  const free = claimableIds(game);
  const home = free[0]!;
  game.claim(alice.governorId, home);
  const homeHex = hexOf(game, home);
  const dist = distancesFrom(game, homeHex);

  // Bob claims far away (≥ 8 steps) so Alice's holdings are UNKNOWN to him.
  const farForBob = free.find((id) => (dist.get(hexOf(game, id)) ?? 0) >= 8)!;
  game.claim(bob.governorId, farForBob);

  const raised = game.raise(alice.governorId, home, 'STANDARD');
  assert.ok(raised.army.provisions !== undefined && raised.army.foodPerStep !== undefined, 'own army keeps logistics');

  // Alice's view of her own parcel: ACCURATE with garrison + development.
  const stateA = game.stateFor(alice.governorId);
  const homeViewA = stateA.territories.find((t) => t.id === home)!;
  assert.equal(homeViewA.intel, 'ACCURATE');
  assert.ok(homeViewA.development !== undefined, 'development visible on ACCURATE');
  assert.equal(homeViewA.garrison?.armyId, raised.army.id);

  // Bob's view of the same parcel: ownership public, contents fogged.
  const stateB = game.stateFor(bob.governorId);
  const homeViewB = stateB.territories.find((t) => t.id === home)!;
  assert.equal(homeViewB.intel, 'UNKNOWN');
  assert.equal(homeViewB.governorId, alice.governorId, 'ownership is ALWAYS public');
  assert.equal(homeViewB.prosperity, homeViewA.prosperity, 'prosperity is ALWAYS public');
  assert.equal(homeViewB.garrison, undefined, 'garrison hidden on UNKNOWN');
  assert.equal(homeViewB.garrisonBand, undefined);
  assert.equal(homeViewB.development, undefined, 'development (defenses) hidden on UNKNOWN');
  assert.ok(!stateB.armies.some((a) => a.id === raised.army.id), "Alice's army hidden from Bob");

  // Alice sees a FUZZY strength band on a monster garrison exactly 2 steps out.
  const fuzzyMonster = [...game.state.territories.values()].find(
    (t) => t.garrisonArmyId !== undefined && dist.get(t.hexIds[0]!) === 2,
  );
  if (fuzzyMonster !== undefined) {
    const view = stateA.territories.find((t) => t.id === fuzzyMonster.id)!;
    assert.equal(view.intel, 'FUZZY');
    assert.ok(view.garrison === undefined && view.garrisonBand !== undefined, 'FUZZY exposes a band, not detail');
    const truth = armyStrength(game.state.armies.get(fuzzyMonster.garrisonArmyId!)!, BALANCE);
    assert.ok(
      view.garrisonBand.band.lo <= truth && truth <= view.garrisonBand.band.hi,
      `band [${view.garrisonBand.band.lo},${view.garrisonBand.band.hi}] must contain ${truth}`,
    );
  }
  // …and adjacent parcels grade ACCURATE (cluster radius 1).
  const ring1 = stateA.territories.filter((t) => dist.get(game.state.territories.get(t.id)!.hexIds[0]!) === 1);
  assert.ok(ring1.length > 0 && ring1.every((t) => t.intel === 'ACCURATE'));

  // Anonymous spectators get ownership colors only — zero military anywhere.
  const spectator = game.stateFor(undefined);
  assert.equal(spectator.armies.length, 0, 'spectators see no armies');
  assert.ok(
    spectator.territories.every((t) => t.garrison === undefined && t.garrisonBand === undefined && t.development === undefined),
    'spectators see no military contents',
  );
  assert.ok(spectator.territories.some((t) => t.governorId === alice.governorId), 'ownership still painted');
});

test('F1 fog: battles are ACCURATE for participants, banded on FUZZY, dropped on UNKNOWN; events filtered', () => {
  const game = new Game(gameConfig({ seed: 'fs2-battle' }));
  const alice = game.join('Alice');
  const bob = game.join('Bob');
  const carol = game.join('Carol');

  // Alice and Bob on adjacent parcels; Carol far away.
  const free = claimableIds(game);
  const adjacentPair = (): { a: string; b: string } => {
    for (const id of free) {
      const hex = hexOf(game, id);
      for (const n of game.state.adjacency!.get(hex) ?? []) {
        const nt = game.state.territories.get(game.state.hexes.get(n)!.territoryId!)!;
        if (nt.governorKind === 'SYSTEM' && nt.garrisonArmyId === undefined) return { a: id, b: nt.id };
      }
    }
    throw new Error('no adjacent claimable pair');
  };
  const pair = adjacentPair();
  game.claim(alice.governorId, pair.a);
  game.claim(bob.governorId, pair.b);
  const dist = distancesFrom(game, hexOf(game, pair.a));
  const farForCarol = free.find((id) => id !== pair.a && id !== pair.b && (dist.get(hexOf(game, id)) ?? 0) >= 8)!;
  game.claim(carol.governorId, farForCarol);

  const a1 = game.raise(alice.governorId, pair.a, 'STANDARD');
  game.raise(bob.governorId, pair.b, 'STANDARD');
  musterAll(game); // E2: training takes time — one queue per parcel
  const a2 = game.raise(alice.governorId, pair.a, 'STANDARD');
  musterAll(game);
  game.march(alice.governorId, a1.army.id, pair.b);
  game.march(alice.governorId, a2.army.id, pair.b);

  const result = game.tick();
  const battleEv = result.events.find((e) => e.type === 'battle_resolved') as any;
  assert.ok(battleEv, 'battle must resolve on arrival');

  // Both participants see the full battle (always ACCURATE), incl. the winner's private choice.
  const battleForAlice = game.stateFor(alice.governorId).battles.find((b) => b.id === battleEv.battleId)!;
  assert.equal(battleForAlice.intel, 'ACCURATE');
  assert.ok(battleForAlice.attackerScore !== undefined && battleForAlice.casualties !== undefined);
  assert.ok(battleForAlice.pendingChoice !== undefined, 'winner sees the pending choice');
  const battleForBob = game.stateFor(bob.governorId).battles.find((b) => b.id === battleEv.battleId)!;
  assert.equal(battleForBob.intel, 'ACCURATE', 'defender participated — always ACCURATE');
  assert.equal(battleForBob.pendingChoice, undefined, "the choice is the winner's private decision");

  // Carol: battle parcel is UNKNOWN — dropped from state and events.
  const stateC = game.stateFor(carol.governorId);
  assert.ok(!stateC.battles.some((b) => b.id === battleEv.battleId), 'UNKNOWN battles are dropped');
  const eventsC = game.eventsFor(carol.governorId, result.events);
  assert.ok(!eventsC.some((e) => e.type === 'battle_resolved'), 'battle events fogged for Carol');
  assert.ok(!eventsC.some((e) => e.type === 'choice_pending'), 'choice_pending is strictly private');
  const eventsA = game.eventsFor(alice.governorId, result.events);
  assert.ok(eventsA.some((e) => e.type === 'battle_resolved'), 'participants keep their battle events');
  assert.ok(eventsA.some((e) => e.type === 'choice_pending'), 'the winner is told about the choice');
});

test('F1 fog: an army marching out of sight sends a {hidden:true} tombstone delta once', () => {
  const game = new Game(gameConfig({ seed: 'fs2-tombstone' }));
  const alice = game.join('Alice');
  const bob = game.join('Bob');

  const free = claimableIds(game);
  // Alice and Bob adjacent; Bob's army will march away from Alice's parcel.
  let home = '';
  let bobHome = '';
  for (const id of free) {
    const hex = hexOf(game, id);
    for (const n of game.state.adjacency!.get(hex) ?? []) {
      const nt = game.state.territories.get(game.state.hexes.get(n)!.territoryId!)!;
      if (nt.governorKind === 'SYSTEM' && nt.garrisonArmyId === undefined) {
        home = id;
        bobHome = nt.id;
        break;
      }
    }
    if (home !== '') break;
  }
  game.claim(alice.governorId, home);
  game.claim(bob.governorId, bobHome);
  const raised = game.raise(bob.governorId, bobHome, 'STANDARD');
  musterAll(game); // E2: a mustering army cannot march

  // Prime Alice's delta cache: she currently sees Bob's army (adjacent = ACCURATE).
  const first = game.deltasFor(alice.governorId);
  assert.ok(
    first.armies.some((a) => a.id === raised.army.id && a.hidden === undefined),
    'adjacent army starts visible to Alice',
  );

  // Bob marches 4+ steps away from Alice's parcel.
  const dist = distancesFrom(game, hexOf(game, home));
  const target = free.find((id) => {
    const d = dist.get(hexOf(game, id));
    return id !== home && id !== bobHome && d !== undefined && d >= 5;
  })!;
  game.march(bob.governorId, raised.army.id, target);

  let sawFuzzy = false;
  let sawTombstone = 0;
  for (let i = 0; i < 12; i++) {
    game.tick();
    for (const v of game.deltasFor(alice.governorId).armies) {
      if (v.id !== raised.army.id) continue;
      if (v.hidden === true) sawTombstone++;
      else if (v.intel === 'FUZZY') {
        sawFuzzy = true;
        assert.ok(v.strengthBand !== undefined && v.units === undefined, 'FUZZY army = band, no composition');
        assert.ok(v.parcelId !== undefined, 'position stays visible on FUZZY');
      }
    }
  }
  assert.ok(sawFuzzy, "Bob's army should pass through Alice's FUZZY ring");
  assert.equal(sawTombstone, 1, 'exactly one tombstone when it leaves her intel');
});

// ── F2: neutral towns over the game API ───────────────────────────────────────

test('F2 towns: walk-in emits town_entered, resolves via /api/choice with the choiceId', () => {
  const game = new Game(gameConfig({ seed: 'fs2-town' }));
  const alice = game.join('Alice');

  // A TOWN with an adjacent claimable parcel (the real demo world seeds ~6%).
  const towns = [...game.state.territories.values()].filter((t) => t.zoneType === 'TOWN');
  assert.ok(towns.length > 0, 'demo world must seed towns');
  let townId = '';
  let homeId = '';
  for (const town of towns) {
    for (const n of game.state.adjacency!.get(town.hexIds[0]!) ?? []) {
      const nt = game.state.territories.get(game.state.hexes.get(n)!.territoryId!)!;
      if (nt.governorKind === 'SYSTEM' && nt.garrisonArmyId === undefined && nt.zoneType !== 'TOWN') {
        townId = town.id;
        homeId = nt.id;
        break;
      }
    }
    if (townId !== '') break;
  }
  assert.ok(townId !== '', 'need a town with a claimable neighbor');

  game.claim(alice.governorId, homeId);
  const raised = game.raise(alice.governorId, homeId, 'STANDARD');
  musterAll(game); // E2: muster before marching
  game.march(alice.governorId, raised.army.id, townId);
  const result = game.tick();

  assert.ok(!result.events.some((e) => e.type === 'battle_resolved'), 'bloodless — no battle');
  const entered = result.events.find((e) => e.type === 'town_entered') as any;
  assert.ok(entered, 'town_entered event expected');
  assert.equal(entered.governorId, alice.governorId);
  assert.equal(entered.armyId, raised.army.id);
  assert.equal(entered.zoneType, 'TOWN');

  const my = game.myState(alice.governorId);
  const pending = my.pendingChoices.find((c) => c.choiceId === entered.choiceId)!;
  assert.equal(pending.walkIn, true);
  assert.equal(pending.battleId, entered.choiceId, 'battleId doubles as the /api/choice key');

  const resolved = game.choice(alice.governorId, entered.choiceId, 'OCCUPY');
  assert.equal(resolved.territory?.governorId, alice.governorId, 'bloodless conquest');
  assert.equal(resolved.action, 'OCCUPY');
  assert.ok((resolved.lootCt ?? 0) >= 0);
  const followUp = game.tick();
  const occupiedEv = [...result.events, ...followUp.events].find(
    (e) => e.type === 'territory_occupied' && (e as any).battleId === entered.choiceId,
  );
  assert.ok(occupiedEv, 'territory_occupied event carries the choiceId');
});

// ── F4: development over the API + NPC investment ─────────────────────────────

test('F4 develop: POST /api/develop — auth, ownership, track validation, cost, event, view', async () => {
  const game = new Game(gameConfig({ seed: 'fs2-develop' }));
  const server = new ClashServer({ game, port: 0, tickMs: null, saveMs: null });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const join = await fetch(`${base}/api/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    }).then((r) => r.json() as any);
    const home = claimableIds(game)[0]!;
    game.claim(join.governorId, home);

    const post = (body: unknown, token = join.token) =>
      fetch(`${base}/api/develop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

    assert.equal((await post({ territoryId: home, track: 'ECONOMY' }, 'nope')).status, 401);
    const badTrack = await post({ territoryId: home, track: 'VIBES' });
    assert.equal(badTrack.status, 400);
    assert.equal((await badTrack.json() as any).error.code, 'BAD_TRACK');
    const foreign = claimableIds(game)[1]!;
    assert.equal((await post({ territoryId: foreign, track: 'ECONOMY' })).status, 403);

    const wallet0 = game.state.ctBalances!.get(join.governorId)!;
    const ok = await post({ territoryId: home, track: 'ECONOMY' });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as any;
    assert.equal(body.level, 1);
    assert.equal(body.track, 'ECONOMY');
    assert.equal(body.costCtUnits, developCostCtUnits('ECONOMY', 0, BALANCE));
    assert.equal(body.ctUnits, wallet0 - body.costCtUnits);
    assert.equal(body.territory.development.ECONOMY, 1, 'TerritoryView exposes the new level');
    const result = game.tick();
    const ev = result.events.find((e) => e.type === 'territory_developed') as any;
    assert.ok(ev, 'territory_developed event expected');
    assert.equal(ev.governorId, join.governorId);
    assert.equal(ev.track, 'ECONOMY');
    assert.equal(ev.level, 1);
  } finally {
    await server.stop();
  }
});

test('F4 develop: the NPC kingdom invests round-robin in its strongest territory', () => {
  const game = new Game(gameConfig({ seed: 'fs2-npc-dev', npcEveryTicks: 2 }));
  const events: string[] = [];
  const tracksSeen = new Set<string>();
  for (let i = 0; i < 16; i++) {
    for (const e of game.tick().events) {
      events.push(e.type);
      if (e.type === 'territory_developed') tracksSeen.add((e as any).track);
    }
  }
  assert.ok(events.includes('territory_developed'), 'NPC must develop');
  assert.ok(tracksSeen.size >= 3, `round-robin across tracks (saw: ${[...tracksSeen].join(',')})`);
  const totals = [...game.state.territories.values()]
    .filter((t) => t.governorId === game.npcGovernorId)
    .map((t) => Object.values(t.development).reduce((n, l) => n + l, 0));
  assert.ok(Math.max(...totals) >= 3, 'levels actually landed on an NPC holding');
});

test('F1 fog: intel memory survives the snapshot save/load roundtrip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clashfront-fs2-'));
  const savePath = join(dir, 'save.json');
  const g1 = new Game(gameConfig({ seed: 'fs2-save', savePath }));
  const alice = g1.join('Alice');
  const home = claimableIds(g1)[0]!;
  g1.claim(alice.governorId, home);
  for (let i = 0; i < 3; i++) g1.tick();
  assert.ok(g1.state.intel !== undefined && (g1.state.intel.get(alice.governorId)?.size ?? 0) > 0, 'memory recorded');
  g1.saveToDisk();

  const g2 = new Game(gameConfig({ seed: 'fs2-save', savePath }));
  assert.deepStrictEqual(g2.state.intel, g1.state.intel, 'intel memory must survive the roundtrip');
  assert.deepStrictEqual(g2.stateFor(alice.governorId), g1.stateFor(alice.governorId));
});
