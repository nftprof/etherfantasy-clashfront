/**
 * E5 CONSERVATION — the most important test in the codebase
 * (docs/briefs/FEATURESET-3-ECONOMY.md E5 + the settlement-journal addition).
 *
 * A busy scripted world runs 200 ticks — joins, claims (free + distance-
 * charged), training queues, marches, field battles, pillages, occupations,
 * town walk-ins, wild raids, develop, enrich, raze, provisioning — and after
 * EVERY order batch and EVERY tick the supply identity must hold EXACTLY
 * (integer equality, no epsilon):
 *
 *   Σ wallets + Σ territory treasuries + Σ enrichment pools
 *     + burnedTotal + treasuryTotal + unclaimedLordYield  ===  mintedTotal
 *
 * Then the settlement journal (plus pending unflushed yield accruals) is
 * replayed from genesis and must reproduce every supply component exactly —
 * journal completeness IS the chain-settlement guarantee.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Balance, CONSTANTS, createRng, loadBalance } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  type DemoWorldFile,
  developTerritory,
  enrichTerritory,
  findPath,
  fnv1a,
  isMustering,
  loadDemoWorld,
  orderMarch,
  provisionArmy,
  raiseArmy,
  razeTerritory,
  replayJournal,
  resolvePostVictory,
  runTick,
  sortedIds,
  supplyComponents,
  type TickOptions,
  troopCount,
  type WorldState,
} from '../src/index';

const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 4 };
const BALANCE = loadBalance();
const CT = CONSTANTS.CT_UNITS_PER_CT;
/** Raid-happy dial so the frontier bites repeatedly inside 200 ticks. */
const RAIDY: Balance = {
  ...BALANCE,
  wildRaids: { ...BALANCE.wildRaids, everyTicks: 20, baseChance: 0.6, edgeChanceBonus: 0.4 },
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

function conserve(state: WorldState, where: string): void {
  const s = supplyComponents(state);
  const held =
    s.wallets + s.territoryTreasuries + s.enrichmentPools + s.burnedTotal + s.treasuryTotal + s.unclaimedLordYield;
  assert.equal(
    held,
    s.mintedTotal,
    `CONSERVATION BROKEN at ${where}: held ${held} !== minted ${s.mintedTotal} ` +
      `(wallets ${s.wallets}, treasuries ${s.territoryTreasuries}, pools ${s.enrichmentPools}, ` +
      `burned ${s.burnedTotal}, treasury ${s.treasuryTotal}, escrow ${s.unclaimedLordYield})`,
  );
}

/** Shortest march (≤ maxSteps) from `army` to any foreign parcel, sorted-deterministic. */
function pickTarget(state: WorldState, armyHex: string, gov: string, maxSteps: number): string[] | undefined {
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    if (t.governorId === gov || t.hexIds[0] === armyHex) continue;
    const path = findPath(state, armyHex, t.hexIds[0]!, gov);
    if (path !== undefined && path.length > 0 && path.length <= maxSteps) return path;
  }
  return undefined;
}

test('CONSERVATION: 200 busy ticks — supply identity holds EXACTLY every tick; journal replay reproduces the world', () => {
  const rng = createRng('conservation-200');
  const state = loadDemoWorld(makeGrid(8, 8), rng.fork('worldgen'), { monsterParcelPct: 0.3 });
  const orders = rng.fork('orders');
  conserve(state, 'genesis');

  const alice = addGovernor(state, orders, {
    name: 'Alice', kind: 'PLAYER', ctUnits: 40_000 * CT,
    officerNames: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
  });
  const bob = addGovernor(state, orders, {
    name: 'Bob', kind: 'PLAYER', ctUnits: 40_000 * CT,
    officerNames: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'],
  });
  const npck = addGovernor(state, orders, {
    name: 'Gnolldom', kind: 'NPC_KINGDOM', ctUnits: 60_000 * CT, officerNames: [],
  });
  conserve(state, 'joins');

  const free = [...state.territories.keys()].sort().filter((id) => {
    const t = state.territories.get(id)!;
    return t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined && t.zoneType !== 'TOWN';
  });
  assert.ok(free.length >= 8, 'fixture needs claimable land');
  const homes = new Map<string, string>([
    [alice.governorId, free[0]!],
    [bob.governorId, free[free.length - 1]!],
    [npck.governorId, free[Math.floor(free.length / 2)]!],
  ]);
  for (const [gov, home] of homes) claimTerritory(state, home, gov, undefined, RAIDY);
  conserve(state, 'founding claims');

  const govs = [alice.governorId, bob.governorId, npck.governorId];
  let choiceFlip = 0;
  let battlesSeen = 0;
  let raidsSeen = 0;
  let walkInsSeen = 0;
  let razed = false;
  let enriched = 0;

  for (let t = 1; t <= 200; t++) {
    // ── orders on the settled world (all failures tolerated — the point is flows) ──
    for (const gov of govs) {
      // resolve one pending PILLAGE/OCCUPY decision (alternating; rest time out)
      for (const cid of sortedIds(state.pendingChoices ?? new Map())) {
        const c = state.pendingChoices!.get(cid)!;
        if (c.governorId !== gov) continue;
        try {
          resolvePostVictory(state, cid, choiceFlip++ % 3 === 0 ? 'OCCUPY' : 'PILLAGE', RAIDY);
        } catch {
          /* expired/invalid — the tick loop defaults it */
        }
        break;
      }
      // march ONE idle, fully-mustered army at the nearest foreign parcel
      for (const id of sortedIds(state.armies)) {
        const a = state.armies.get(id)!;
        if (a.ownerGovernorId !== gov || a.state !== 'GARRISON') continue;
        if (isMustering(state, a.id) || troopCount(a) === 0) continue;
        const path = pickTarget(state, a.hexId, gov, 5);
        if (path !== undefined) {
          try {
            orderMarch(state, a.id, path, OPTS);
          } catch {
            /* blocked — try next tick */
          }
        }
        break;
      }
      // keep the war machine fed: queue a new levy at home when the yard is free
      const home = homes.get(gov)!;
      if (t % 7 === 0) {
        try {
          raiseArmy(state, home, 'STANDARD', orders);
        } catch {
          /* broke, queue busy, or home lost — skip */
        }
      }
    }

    // ── scripted economy beats ──
    if (t === 25) {
      const armyId = [...sortedIds(state.armies)].find((id) => {
        const a = state.armies.get(id)!;
        return a.ownerGovernorId === alice.governorId && a.state === 'GARRISON';
      });
      if (armyId !== undefined) {
        try {
          provisionArmy(state, armyId, { food: 200, gold: 20, wood: 20 }, RAIDY);
        } catch { /* not at friendly ground */ }
      }
    }
    if (t === 30 || t === 90 || t === 150) {
      try {
        enrichTerritory(state, homes.get(alice.governorId)!, 2_000 * CT, RAIDY);
        enriched++;
      } catch { /* home lost or broke */ }
    }
    if (t === 40) { try { developTerritory(state, homes.get(bob.governorId)!, 'DEFENSE', RAIDY); } catch { /* skip */ } }
    if (t === 60) { try { developTerritory(state, homes.get(alice.governorId)!, 'ECONOMY', RAIDY); } catch { /* skip */ } }
    if (t === 70) { try { developTerritory(state, homes.get(alice.governorId)!, 'MILITARY', RAIDY); } catch { /* skip */ } }
    if (t === 120) {
      try {
        razeTerritory(state, homes.get(alice.governorId)!, 'MILITARY', RAIDY);
        razed = true;
      } catch { /* nothing to raze */ }
    }
    if (t === 50) {
      const far = free.find((id) => state.territories.get(id)!.governorKind === 'SYSTEM' && id !== homes.get(alice.governorId));
      if (far !== undefined) { try { claimTerritory(state, far, alice.governorId, undefined, RAIDY); } catch { /* skip */ } }
    }

    conserve(state, `orders@${t}`);
    runTick(state, t, rng.fork('sim'), RAIDY, OPTS);
    conserve(state, `tick ${t}`);

    battlesSeen = state.battles.size;
    if ((state.wildRaids?.size ?? 0) > 0) raidsSeen++;
    walkInsSeen = state.walkInOutcomes?.length ?? 0;
  }

  // ── the world was actually BUSY (the identity must have been stressed) ──
  assert.ok(battlesSeen > 0, 'no battles — the scenario is too quiet to prove anything');
  assert.ok(walkInsSeen > 0, 'no pillages/walk-ins/raid sackings happened');
  assert.ok(raidsSeen > 0, 'no wild raids spawned');
  assert.ok(enriched >= 2 && razed, 'enrich + raze beats must have landed');
  const eco = state.economy!;
  assert.ok(eco.settlementJournal.length > 60, `journal too thin (${eco.settlementJournal.length})`);
  assert.ok(eco.burnedTotal > 0 && eco.treasuryTotal > 0 && eco.unclaimedLordYield > 0, 'all buckets in motion');

  // ── settlement guarantee: journal (+ pending accruals) replays to the exact world ──
  const replayed = replayJournal(eco.settlementJournal, eco.pendingYield);
  assert.deepStrictEqual(replayed, supplyComponents(state), 'journal replay must reproduce every supply component');

  // ── journal integrity: seq monotonic from 0, checksum chain re-derives ──
  eco.settlementJournal.forEach((r, i) => assert.equal(r.seq, i, 'monotonic seq from 0'));
  let chain = fnv1a('genesis');
  for (const rec of eco.settlementJournal) chain = fnv1a(`${chain}|${JSON.stringify(rec)}`);
  assert.equal(chain, eco.journalChecksum);
});

test('conservation scenario is deterministic (bit-identical replays incl. journal)', () => {
  const run = (): WorldState => {
    const rng = createRng('conserve-golden');
    const state = loadDemoWorld(makeGrid(5, 5), rng.fork('worldgen'), { monsterParcelPct: 0.3 });
    const orders = rng.fork('orders');
    const p = addGovernor(state, orders, {
      name: 'P', kind: 'PLAYER', ctUnits: 20_000 * CT, officerNames: ['X1', 'X2', 'X3'],
    });
    const home = [...state.territories.keys()].sort().find((id) => {
      const t = state.territories.get(id)!;
      return t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined;
    })!;
    claimTerritory(state, home, p.governorId, undefined, RAIDY);
    raiseArmy(state, home, 'STANDARD', orders);
    enrichTerritory(state, home, 1_000 * CT, RAIDY);
    for (let t = 1; t <= 40; t++) runTick(state, t, rng.fork('sim'), RAIDY, OPTS);
    return state;
  };
  const a = run();
  const b = run();
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a.economy!.settlementJournal, b.economy!.settlementJournal);
});
