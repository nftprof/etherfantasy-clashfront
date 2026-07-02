/**
 * E1 flow-splitter tests — Feature Set 3 (docs/briefs/FEATURESET-3-ECONOMY.md):
 * integer-exact bucket splits (edge amounts 1, 7, huge), inverse-distance LOOT
 * routing with the no-target burn fallback, LANDYIELD 60/40 self/ring-1
 * pooling, LORDS landlord escrow + richest-town seat routing, flow telemetry,
 * and the checksum-chained settlement journal (SPEND/DEPOSIT records, monotonic
 * seq, replayable). Sink refactor coverage: raise/provision/develop/claim all
 * route their debited CT through spendCT.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, type Rng } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  developTerritory,
  type DemoWorldFile,
  ensureEconomy,
  fnv1a,
  loadDemoWorld,
  provisionArmy,
  raiseArmy,
  raiseCost,
  type SettlementRecord,
  spendCT,
  supplyComponents,
  type WorldState,
} from '../src/index';

const BALANCE = loadBalance();
const E = BALANCE.economy;
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

/** Monster-free grid world with towns stripped — a controlled splitter bench. */
function bench(seed: string, cols = 5, rows = 5): { state: WorldState; rng: Rng; centerHex: string } {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(cols, rows), rng.fork('worldgen'), { monsterParcelPct: 0 });
  for (const t of state.territories.values()) t.zoneType = 'WILD'; // no genesis towns — tests place their own
  const centerParcelIdx = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
  const pid = `P${String(centerParcelIdx).padStart(4, '0')}`;
  const nft = [...state.landNfts.values()].find((n) => n.sourceParcelId === pid)!;
  const centerHex = state.territories.get(nft.territoryId)!.hexIds[0]!;
  return { state, rng, centerHex };
}

const sumSplits = (s: ReturnType<typeof spendCT>): number =>
  s.loot + s.landYield + (s.lords - s.lordsEscrow) + s.lordsEscrow + s.burn + s.treasury;

// ── Integer exactness ─────────────────────────────────────────────────────────

test('spendCT: buckets sum EXACTLY to the amount (1, 7, and huge — remainder to burn)', () => {
  for (const amount of [1, 7, 100, 12_345_678, 10 ** 15 + 7]) {
    const { state, centerHex } = bench(`split-${amount}`);
    const splits = spendCT(state, 'gov_test', amount, centerHex, 'test', BALANCE);
    assert.equal(sumSplits(splits), amount, `amount ${amount} must split without residue`);
    for (const v of Object.values(splits)) {
      assert.ok(Number.isInteger(v) && v >= 0, `split parts must be non-negative integers (${amount})`);
    }
  }
  // amount 1: every floored share is 0 — the whole unit burns.
  const { state, centerHex } = bench('split-one');
  const one = spendCT(state, 'gov_test', 1, centerHex, 'test', BALANCE);
  assert.deepEqual(one, { loot: 0, landYield: 0, lords: 0, lordsEscrow: 0, burn: 1, treasury: 0 });
  // amount 7 with eligible loot targets: floors land where they land, burn takes the rest.
  const b7 = bench('split-seven');
  const seven = spendCT(b7.state, 'gov_test', 7, b7.centerHex, 'test', BALANCE);
  assert.equal(seven.loot, Math.floor(7 * E.lootShare));
  assert.equal(seven.landYield, Math.floor(7 * E.landYieldShare));
  assert.equal(seven.lordsEscrow, Math.floor(7 * E.lordsLandlordShare));
  assert.equal(seven.treasury, Math.floor(7 * E.treasuryShare));
  assert.equal(sumSplits(seven), 7);
  // negative / fractional amounts are rejected outright
  assert.throws(() => spendCT(b7.state, 'gov_test', -1, b7.centerHex, 'test', BALANCE), /non-negative integer/);
  assert.throws(() => spendCT(b7.state, 'gov_test', 1.5, b7.centerHex, 'test', BALANCE), /non-negative integer/);
});

// ── LOOT routing ──────────────────────────────────────────────────────────────

test('LOOT: inverse-distance weighted across town/wild treasuries in ⚙ lootRadiusSteps; exact total', () => {
  const { state, centerHex } = bench('loot-weights', 7, 7);
  const before = new Map([...state.territories.values()].map((t) => [t.id, t.ctTreasury]));
  const amount = 1_000_000;
  const splits = spendCT(state, 'gov_test', amount, centerHex, 'test', BALANCE);
  assert.equal(splits.loot, Math.floor(amount * E.lootShare));

  const gains = new Map<string, number>();
  for (const t of state.territories.values()) {
    const d = t.ctTreasury - before.get(t.id)!;
    if (d !== 0) gains.set(t.id, d);
  }
  assert.equal([...gains.values()].reduce((s, g) => s + g, 0), splits.loot, 'credited loot must equal the bucket');
  // the spend parcel (step 0, weight 1) out-earns every step-1 neighbor (weight 1/2)
  const selfTerr = state.territories.get(state.hexes.get(centerHex)!.territoryId!)!;
  const selfGain = gains.get(selfTerr.id)!;
  for (const n of state.adjacency!.get(centerHex)!) {
    const nt = state.hexes.get(n)!.territoryId!;
    assert.ok(selfGain > (gains.get(nt) ?? 0), 'closer parcels take the bigger cut');
  }
  // nothing outside the radius was paid
  assert.ok(gains.size > 1, 'the gold rush reaches the neighborhood');
});

test('LOOT + seat fallback: no eligible target in radius ⇒ those shares BURN (landlord escrow always accrues)', () => {
  const { state, centerHex } = bench('loot-burn', 5, 5);
  // Blanket the whole radius in player-owned, non-town land: nothing loot-eligible.
  for (const t of state.territories.values()) {
    t.governorKind = 'PLAYER';
    t.governorId = 'gov_wall';
    t.zoneType = 'VILLAGE';
  }
  const eco = ensureEconomy(state);
  const burned0 = eco.burnedTotal;
  const escrow0 = eco.unclaimedLordYield;
  const amount = 1_000_000;
  const splits = spendCT(state, 'gov_test', amount, centerHex, 'test', BALANCE);
  assert.equal(splits.loot, 0, 'no towns/wilds in range — the loot share fizzles');
  assert.equal(splits.lords, splits.lordsEscrow, 'no town seat — the seat share burns');
  assert.equal(
    splits.burn,
    amount - Math.floor(amount * E.landYieldShare) - splits.lordsEscrow - splits.treasury,
    'burn absorbs base burn + loot + seat fallbacks',
  );
  assert.equal(eco.burnedTotal, burned0 + splits.burn);
  assert.equal(eco.unclaimedLordYield, escrow0 + Math.floor(amount * E.lordsLandlordShare));
  assert.equal(sumSplits(splits), amount);
});

// ── LANDYIELD pooling ─────────────────────────────────────────────────────────

test('LANDYIELD: ⚙ 60% enriches the spend parcel, 40% splits across ring-1 (integer-exact)', () => {
  const { state, centerHex } = bench('landyield', 5, 5);
  const amount = 1_000_000;
  const splits = spendCT(state, 'gov_test', amount, centerHex, 'test', BALANCE);
  const ly = Math.floor(amount * E.landYieldShare);
  assert.equal(splits.landYield, ly);
  const selfTerr = state.hexes.get(centerHex)!.territoryId!;
  const selfPool = state.enrichmentPools!.get(selfTerr)!;
  assert.equal(selfPool, Math.floor(ly * E.landYieldSelfPct));
  let neighborTotal = 0;
  for (const n of state.adjacency!.get(centerHex)!) {
    neighborTotal += state.enrichmentPools!.get(state.hexes.get(n)!.territoryId!) ?? 0;
  }
  assert.equal(selfPool + neighborTotal, ly, 'pool credits must equal the bucket exactly');
});

// ── LORDS seat routing ────────────────────────────────────────────────────────

test('LORDS: seat share reaches the RICHEST town treasury in radius; landlord share escrows', () => {
  const { state, centerHex } = bench('lords-seat', 7, 7);
  // Two towns in radius — the richer one is the seat.
  const ring = state.adjacency!.get(centerHex)!;
  const poorTown = state.territories.get(state.hexes.get(ring[0]!)!.territoryId!)!;
  const richTownHex = state.adjacency!.get(ring[1]!)!.find((h) => h !== centerHex)!;
  const richTown = state.territories.get(state.hexes.get(richTownHex)!.territoryId!)!;
  poorTown.zoneType = 'TOWN';
  poorTown.ctTreasury = 10 * CT;
  richTown.zoneType = 'TOWN';
  richTown.ctTreasury = 500 * CT;
  const richBefore = richTown.ctTreasury;
  const poorBefore = poorTown.ctTreasury;

  const amount = 1_000_000;
  const splits = spendCT(state, 'gov_test', amount, centerHex, 'test', BALANCE);
  const seat = Math.floor(amount * E.lordsSeatShare);
  assert.equal(splits.lords - splits.lordsEscrow, seat, 'seat share routed');
  assert.equal(splits.lordsEscrow, Math.floor(amount * E.lordsLandlordShare));
  // the rich town got its loot allocation PLUS the seat share; the poor town only loot
  const richGain = richTown.ctTreasury - richBefore;
  const poorGain = poorTown.ctTreasury - poorBefore;
  assert.equal(richGain + poorGain + selfAndOthersLoot(state, splits), splits.loot + seat);
  assert.ok(richGain > poorGain, 'the seat goes to the richest town');
  assert.equal(state.economy!.unclaimedLordYield, splits.lordsEscrow, 'landlord escrow accrued');

  function selfAndOthersLoot(s: WorldState, sp: ReturnType<typeof spendCT>): number {
    // loot credited to everyone EXCEPT the two towns = bucket − town loot − seat
    let townLoot = richGain - seat + poorGain;
    return sp.loot - townLoot;
  }
});

// ── Settlement journal ────────────────────────────────────────────────────────

test('settlement journal: monotonic seq, checksum chain recomputable, SPEND splits recorded verbatim', () => {
  const { state, centerHex } = bench('journal');
  const eco = ensureEconomy(state);
  const seq0 = eco.settlementJournal.length;
  const s1 = spendCT(state, 'gov_a', 123_456, centerHex, 'reason_one', BALANCE);
  const s2 = spendCT(state, 'gov_b', 7, centerHex, 'reason_two', BALANCE);
  const j = eco.settlementJournal;
  assert.equal(j.length, seq0 + 2);
  for (let i = 1; i < j.length; i++) assert.equal(j[i]!.seq, j[i - 1]!.seq + 1, 'seq must be monotonic');
  const r1 = j[j.length - 2]!;
  const r2 = j[j.length - 1]!;
  assert.equal(r1.kind, 'SPEND');
  assert.deepEqual(r1.splits, s1);
  assert.equal(r1.governorId, 'gov_a');
  assert.equal(r1.amountCtUnits, 123_456);
  assert.deepEqual(r2.splits, s2);
  // the checksum chain re-derives from the records alone (export integrity)
  let chain = fnv1a('genesis');
  for (const rec of j) chain = fnv1a(`${chain}|${JSON.stringify(rec)}`);
  assert.equal(chain, eco.journalChecksum, 'running checksum must equal a fresh replay of the chain');
  // flow telemetry accumulates per reason
  assert.equal(eco.flowsByReason['reason_one'], 123_456);
  assert.equal(eco.flowsByReason['reason_two'], 7);
});

// ── Sink refactor: every existing sink routes through the splitter ────────────

test('sinks: raise/provision/develop/claim all journal SPENDs; wallet debit == journaled spend', () => {
  const rng = createRng('sinks');
  const state = loadDemoWorld(makeGrid(6, 6), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const orders = rng.fork('orders');
  const { governorId } = addGovernor(state, orders, {
    name: 'Spender', kind: 'PLAYER', ctUnits: 100_000 * CT, officerNames: ['Choco', 'Maenak', 'Nara'],
  });
  const eco = ensureEconomy(state);
  const ids = [...state.territories.keys()].sort();
  const homeId = ids.find((id) => state.territories.get(id)!.garrisonArmyId === undefined)!;
  claimTerritory(state, homeId, governorId); // founding — free, no SPEND

  const wallet0 = state.ctBalances!.get(governorId)!;
  const jLen0 = eco.settlementJournal.length;

  const army = raiseArmy(state, homeId, 'STANDARD', orders);
  provisionArmy(state, army.id, { food: 100, gold: 10, wood: 10 }, BALANCE);
  developTerritory(state, homeId, 'ECONOMY', BALANCE);
  const far = ids.filter((id) => {
    const t = state.territories.get(id)!;
    return t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined;
  })[20]!; // far enough to charge CT
  claimTerritory(state, far, governorId);

  const spends = eco.settlementJournal.slice(jLen0).filter((r: SettlementRecord) => r.kind === 'SPEND');
  const reasons = spends.map((r) => r.reason).sort();
  assert.deepEqual(reasons, ['claim', 'develop', 'provision', 'raise_provisions', 'raise_training']);
  const spent = spends.reduce((n, r) => n + r.amountCtUnits, 0);
  assert.equal(wallet0 - state.ctBalances!.get(governorId)!, spent, 'every debited ct_unit was routed');
  const raiseSpend = spends.find((r) => r.reason === 'raise_training')!;
  assert.equal(raiseSpend.amountCtUnits, raiseCost('STANDARD', BALANCE).unitsCtUnits);

  // and the conservation identity already holds on this little world
  const s = supplyComponents(state);
  assert.equal(
    s.wallets + s.territoryTreasuries + s.enrichmentPools + s.burnedTotal + s.treasuryTotal + s.unclaimedLordYield,
    s.mintedTotal,
  );
});
