/**
 * Intel & fog tests — Feature Set 2 F1 (docs/briefs/FEATURESET-2.md):
 * territory-cluster sight radius growth + cap, army sight (1) vs scout-screen
 * sight (3), scout-reveal memory with decay to FUZZY, the FUZZY ring, fuzzy
 * band determinism/containment, and snapshot safety of the intel memory.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, type Balance } from '@clashfront/shared';
import {
  addGovernor,
  completeTraining,
  claimTerritory,
  clusterSightRadius,
  computeIntel,
  type DemoWorldFile,
  fuzzyBand,
  intelGrade,
  isScoutScreen,
  loadDemoWorld,
  raiseArmy,
  runTick,
  snapshot,
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

/** BFS distance from a seed set over the adjacency graph. */
function distances(state: WorldState, seeds: string[]): Map<string, number> {
  const d = new Map<string, number>();
  let frontier = seeds.filter((s) => !d.has(s));
  for (const s of frontier) d.set(s, 0);
  for (let step = 1; frontier.length > 0; step++) {
    const next: string[] = [];
    for (const h of frontier) {
      for (const n of state.adjacency!.get(h) ?? []) {
        if (d.has(n)) continue;
        d.set(n, step);
        next.push(n);
      }
    }
    frontier = next;
  }
  return d;
}

/** Grid world + one NPC governor (no officer/oversight friction) with a deep wallet. */
function gridWorld(seed: string, cols = 12, rows = 12): { state: WorldState; governorId: string } {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(cols, rows), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('gov'), {
    name: 'Scout Lord', kind: 'NPC_KINGDOM', ctUnits: 1_000_000 * CT, officerNames: [],
  });
  return { state, governorId };
}

/** Claim a k×k block of the grid (row-major — every claim is adjacent, so free). */
function claimBlock(state: WorldState, governorId: string, cols: number, k: number): string[] {
  const ids = [...state.territories.keys()].sort(); // grid pids sort row-major, terr ids do not —
  // map via territory name suffix instead: names end with the parcelId.
  const byParcel = new Map<string, string>();
  for (const id of ids) {
    const t = state.territories.get(id)!;
    const pid = t.name.split(' ').pop()!;
    byParcel.set(pid, id);
  }
  const pid = (i: number) => `P${String(i).padStart(4, '0')}`;
  const hexes: string[] = [];
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      const terrId = byParcel.get(pid(r * cols + c))!;
      claimTerritory(state, terrId, governorId);
      hexes.push(state.territories.get(terrId)!.hexIds[0]!);
    }
  }
  return hexes;
}

test('cluster sight radius grows with contiguous cluster size and caps at ⚙ clusterRadiusCap', () => {
  assert.equal(clusterSightRadius(1, BALANCE), 1);
  assert.equal(clusterSightRadius(4, BALANCE), 2);
  assert.equal(clusterSightRadius(16, BALANCE), 3);
  assert.equal(clusterSightRadius(36, BALANCE), 4);
  assert.equal(clusterSightRadius(64, BALANCE), BALANCE.intel.clusterRadiusCap, 'radius must cap');

  for (const [k, radius] of [
    [1, 1],
    [2, 2], // 4 parcels
    [4, 3], // 16 parcels
  ] as const) {
    const { state, governorId } = gridWorld(`cluster-${k}`);
    const owned = claimBlock(state, governorId, 12, k);
    const grades = computeIntel(state, governorId, BALANCE);
    const dist = distances(state, owned);
    for (const [hexId, d] of dist) {
      const expected = d <= radius ? 'ACCURATE' : d === radius + 1 ? 'FUZZY' : 'UNKNOWN';
      assert.equal(
        intelGrade(grades, hexId),
        expected,
        `k=${k} d=${d}: expected ${expected}`,
      );
    }
  }
});

test('armies see 1 step; cavalry-majority scout screens (SCOUTS preset) see 3', () => {
  const { state, governorId } = gridWorld('army-sight');
  const [home] = claimBlock(state, governorId, 12, 1);
  const rng = createRng('army-sight-orders');
  const homeTerrId = state.hexes.get(home!)!.territoryId!;

  const standard = raiseArmy(state, homeTerrId, 'STANDARD', rng);
  completeTraining(state, standard.id); // E2: muster instantly — this suite tests sight
  assert.equal(isScoutScreen(standard), false, 'STANDARD (20% cavalry) is not a scout screen');
  delete state.territories.get(homeTerrId)!.garrisonArmyId; // free the slot for the scouts
  const scouts = raiseArmy(state, homeTerrId, 'SCOUTS', rng);
  completeTraining(state, scouts.id);
  assert.equal(isScoutScreen(scouts), true, 'SCOUTS (pure cavalry) is a scout screen');

  // Teleport each far from home (test-only) and measure its reveal radius.
  const dHome = distances(state, [home!]);
  const far = [...state.hexes.keys()].sort().find((h) => (dHome.get(h) ?? 0) >= 9)!;
  const dFar = distances(state, [far]);

  standard.hexId = far; // scouts still at home: home influence reaches ≤ scoutSight+1
  const grades1 = computeIntel(state, governorId, BALANCE);
  for (const [hexId, d] of dFar) {
    if ((dHome.get(hexId) ?? 99) <= BALANCE.intel.scoutSight + 1) continue;
    const expected = d <= BALANCE.intel.armySight ? 'ACCURATE' : d === BALANCE.intel.armySight + 1 ? 'FUZZY' : 'UNKNOWN';
    assert.equal(intelGrade(grades1, hexId), expected, `standard sight at d=${d}`);
  }

  standard.hexId = home!; // send it back; now the scouts take point (home influence ≤ 2)
  scouts.hexId = far;
  const grades3 = computeIntel(state, governorId, BALANCE);
  for (const [hexId, d] of dFar) {
    if ((dHome.get(hexId) ?? 99) <= 2) continue;
    const expected = d <= BALANCE.intel.scoutSight ? 'ACCURATE' : d === BALANCE.intel.scoutSight + 1 ? 'FUZZY' : 'UNKNOWN';
    assert.equal(intelGrade(grades3, hexId), expected, `scout sight at d=${d}`);
  }
});

test('scout-reveal memory: seen parcels stay ACCURATE for decayTicks, then decay to FUZZY forever', () => {
  const decay: Balance = { ...BALANCE, intel: { ...BALANCE.intel, decayTicks: 5 } };
  const { state, governorId } = gridWorld('memory');
  const [home] = claimBlock(state, governorId, 12, 1);
  const rng = createRng('memory-run');
  const homeTerrId = state.hexes.get(home!)!.territoryId!;
  const scouts = raiseArmy(state, homeTerrId, 'SCOUTS', rng);
  completeTraining(state, scouts.id);

  const far = [...state.hexes.keys()].sort().find((h) => (distances(state, [home!]).get(h) ?? 0) >= 9)!;
  scouts.hexId = far;
  runTick(state, 1, rng.fork('sim'), decay, OPTS); // AI phase records the sight

  // The scouts vanish (disband) — memory alone must carry the reveal.
  scouts.state = 'DISBANDED';
  assert.equal(intelGrade(computeIntel(state, governorId, decay), far), 'ACCURATE', 'fresh memory grades ACCURATE');

  for (let t = 2; t <= 6; t++) runTick(state, t, rng.fork('sim'), decay, OPTS);
  assert.equal(intelGrade(computeIntel(state, governorId, decay), far), 'ACCURATE', 'tick 6: within decayTicks of sight at 1');

  runTick(state, 7, rng.fork('sim'), decay, OPTS);
  assert.equal(intelGrade(computeIntel(state, governorId, decay), far), 'FUZZY', 'tick 7: decayed to FUZZY');

  for (let t = 8; t <= 30; t++) runTick(state, t, rng.fork('sim'), decay, OPTS);
  assert.equal(intelGrade(computeIntel(state, governorId, decay), far), 'FUZZY', 'decayed memory is FUZZY forever');
});

test('fuzzyBand: deterministic, friendly-banded, always contains the true value, stable within a period', () => {
  for (const strength of [7, 42, 137, 850, 2_412, 15_000]) {
    for (const parcelId of ['P0001', 'P0777', 'edu-42']) {
      for (const period of [0, 1, 17]) {
        const a = fuzzyBand(strength, parcelId, period, BALANCE.intel.fuzzyBandPct);
        const b = fuzzyBand(strength, parcelId, period, BALANCE.intel.fuzzyBandPct);
        assert.deepEqual(a, b, 'same (parcelId, period) ⇒ same band');
        assert.ok(a.lo <= strength && strength <= a.hi, `band [${a.lo},${a.hi}] must contain ${strength}`);
        assert.ok(a.lo < a.hi, 'band must be a real range');
        assert.ok(Number.isInteger(a.lo) && Number.isInteger(a.hi), 'friendly numbers are integers');
      }
    }
  }
  // A new period rerolls the jitter (bands differ for at least one probe).
  const p0 = fuzzyBand(1_000, 'P0100', 0, BALANCE.intel.fuzzyBandPct);
  const p1 = fuzzyBand(1_000, 'P0100', 1, BALANCE.intel.fuzzyBandPct);
  const p2 = fuzzyBand(1_000, 'P0100', 2, BALANCE.intel.fuzzyBandPct);
  assert.ok(
    JSON.stringify(p0) !== JSON.stringify(p1) || JSON.stringify(p1) !== JSON.stringify(p2),
    'bands must reroll across periods',
  );
});

test('intel memory is snapshot-safe and tick-deterministic', () => {
  const run = (): WorldState => {
    const { state, governorId } = gridWorld('intel-golden');
    const owned = claimBlock(state, governorId, 12, 2);
    const rng = createRng('intel-golden-run');
    completeTraining(state, raiseArmy(state, state.hexes.get(owned[0]!)!.territoryId!, 'SCOUTS', rng).id);
    for (let t = 1; t <= 5; t++) runTick(state, t, rng.fork('sim'), BALANCE, OPTS);
    return state;
  };
  const a = run();
  const b = run();
  assert.deepStrictEqual(a, b, 'intel memory writes must be deterministic');
  assert.ok(a.intel !== undefined && a.intel.size > 0, 'memory recorded for the governor');

  const snap = snapshot(a);
  assert.deepStrictEqual(snap.intel, a.intel, 'snapshot preserves intel memory');
  snap.intel!.get([...snap.intel!.keys()][0]!)!.clear();
  assert.ok(a.intel.get([...a.intel.keys()][0]!)!.size > 0, 'snapshot is independent of the source');
});
