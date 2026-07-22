/**
 * Wave 4.3 — prosperity/tax heartbeat (docs/02 §3–§5, WORLD-BUILD-OUT-PLAN
 * wave 4 items 14–15): target computation, carry movement (decay 2× growth),
 * pillage scars, daily population step, and the tax cycle drawing
 * system:treasury → territory/landlord (capped redistribution, journaled).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance, TICKS_PER_DAY } from '@clashfront/shared';
import {
  addGovernor,
  claimTerritory,
  type DemoWorldFile,
  ensureEconomy,
  loadDemoWorld,
  prosperityTarget,
  replayJournal,
  runTick,
  supplyComponents,
  taxFromSystemTreasury,
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

function fixture(seed: string) {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(3, 3), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('orders'), {
    name: 'Magistrate', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  const homeId = [...state.territories.keys()].sort()[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

test('prosperity moves toward its target — decay twice as fast as growth', () => {
  const f = fixture('prosp-move');
  const t = f.state.territories.get(f.homeId)!;
  // Rich, fed, happy: high target.
  t.foodStock = 10_000_000; t.morale = 100; t.population = 20_000; // at/above the VILLAGE cap ⇒ popScore 1
  t.development.AGRICULTURE = 10; t.development.ECONOMY = 10;
  t.development.DEFENSE = 10; t.development.MILITARY = 10;
  const target = prosperityTarget(f.state, t, BALANCE);
  assert.ok(target >= 90, `rich territory targets high (got ${target})`);

  t.prosperity = target - 40; // far enough below that a full day never hits the ceiling
  for (let tick = 1; tick <= TICKS_PER_DAY; tick++) runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
  const grown = f.state.territories.get(f.homeId)!.prosperity - (target - 40);
  assert.ok(
    grown >= BALANCE.prosperity.growthPerDay - 2 && grown <= BALANCE.prosperity.growthPerDay + 2,
    `~growthPerDay points/day up (got ${grown})`,
  );

  // Now crash the target (starve it) and watch it fall twice as fast.
  const f2 = fixture('prosp-fall');
  const t2 = f2.state.territories.get(f2.homeId)!;
  t2.foodStock = 0; t2.morale = 0; t2.population = 0; t2.prosperity = 90;
  for (let tick = 1; tick <= TICKS_PER_DAY; tick++) runTick(f2.state, tick, f2.rng.fork('sim'), BALANCE);
  const fallen = 90 - f2.state.territories.get(f2.homeId)!.prosperity;
  assert.ok(
    fallen >= BALANCE.prosperity.decayPerDay - 2 && fallen <= BALANCE.prosperity.decayPerDay + 2,
    `~decayPerDay points/day down (got ${fallen})`,
  );
});

test('WILD land is skipped — prosperity stays the frozen Taming Score', () => {
  const f = fixture('prosp-wild');
  const wildId = [...f.state.territories.keys()]
    .sort()
    .find((id) => {
      const t = f.state.territories.get(id)!;
      return t.zoneType === 'WILD' && t.governorKind === 'SYSTEM';
    });
  assert.ok(wildId !== undefined, 'demo grid has wild land');
  const before = f.state.territories.get(wildId!)!.prosperity;
  for (let tick = 1; tick <= 200; tick++) runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
  assert.equal(f.state.territories.get(wildId!)!.prosperity, before, 'Taming Score untouched');
});

test('daily population step: fed grows toward the food-gated cap, starving dies + morale bleeds', () => {
  const f = fixture('pop-step');
  const t = f.state.territories.get(f.homeId)!;
  t.development.AGRICULTURE = 5; // production ⇒ real foodPopCap
  t.foodStock = 100_000; t.population = 1000; t.morale = 50;
  const p0 = t.population;
  for (let tick = 1; tick <= TICKS_PER_DAY; tick++) runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
  const after = f.state.territories.get(f.homeId)!;
  assert.ok(after.population > p0, `fed population grows (${p0} → ${after.population})`);
  assert.ok(after.morale > 50, 'fed civil morale recovers');

  const f2 = fixture('pop-starve');
  const t2 = f2.state.territories.get(f2.homeId)!;
  t2.foodStock = 0; t2.development.AGRICULTURE = 0; t2.population = 1000; t2.morale = 50;
  const m0 = 50;
  for (let tick = 1; tick <= TICKS_PER_DAY; tick++) runTick(f2.state, tick, f2.rng.fork('sim'), BALANCE);
  const starved = f2.state.territories.get(f2.homeId)!;
  assert.ok(starved.population < 1000, 'starving population shrinks');
  assert.ok(starved.morale < m0, 'starving civil morale bleeds');
});

test('tax cycle: draws system:treasury → territory + landlord, capped, journaled + replayable', () => {
  const f = fixture('tax-cycle');
  const t = f.state.territories.get(f.homeId)!;
  t.population = 10_000; t.prosperity = 80; t.development.ECONOMY = 3;
  t.foodStock = 1_000_000; // keep prosperity ~stable across the day

  // Fund the house the honest way: the governor "spends" 500 CT whose split
  // routes 100% to system:treasury (a pure rake), journaled like any spend.
  const eco = ensureEconomy(f.state);
  const rake = 500 * CT;
  f.state.ctBalances!.set(f.governorId, f.state.ctBalances!.get(f.governorId)! - rake);
  eco.treasuryTotal += rake;
  eco.settlementJournal.push({
    seq: (eco.settlementJournal[eco.settlementJournal.length - 1]?.seq ?? -1) + 1,
    tick: 0, kind: 'SPEND', governorId: f.governorId, amountCtUnits: rake, reason: 'fixture_rake',
    splits: { loot: 0, landYield: 0, lords: 0, lordsEscrow: 0, burn: 0, treasury: rake },
  });

  // Claimed landlord with a wallet.
  const nft = f.state.landNfts.get(t.landNftId)!;
  nft.ownerPlayerId = f.governorId;
  const wallet0 = f.state.ctBalances!.get(f.governorId)!;
  const treasury0 = t.ctTreasury;
  const house0 = eco.treasuryTotal;

  // Tick across the tax boundary.
  for (let tick = 1; tick <= BALANCE.tax.cycleTicks; tick++) {
    runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
  }
  const after = f.state.territories.get(f.homeId)!;
  const taxRecords = eco.settlementJournal.filter((r) => r.kind === 'TAX');
  assert.ok(taxRecords.length >= 1, 'a TAX journal record exists');
  const rec = taxRecords.find((r) => r.reason === `tax:${f.homeId}`)!;
  assert.ok(rec !== undefined, 'home territory taxed');
  assert.equal(
    rec.amountCtUnits,
    rec.taxSplit!.governor + rec.taxSplit!.landlord,
    'split sums to the draw',
  );
  assert.ok(rec.taxSplit!.landlord > 0, 'claimed landlord got a share');
  assert.ok(after.ctTreasury > treasury0, 'territory treasury grew');
  assert.ok(eco.treasuryTotal < house0, 'system treasury shrank (redistribution)');
  assert.ok(
    f.state.ctBalances!.get(f.governorId)! > wallet0 - 1, // econ trickle also moves the wallet; landlord share adds
    'wallet did not lose CT',
  );
  // Double-entry: the journal replays to the exact live components.
  const live = supplyComponents(f.state);
  const replayed = replayJournal(eco.settlementJournal, eco.pendingYield);
  assert.deepEqual(replayed, live, 'journal replay reconciles after TAX records');
});

test('tax draw is CAPPED at what the house holds — an empty treasury pays nothing', () => {
  const f = fixture('tax-cap');
  const t = f.state.territories.get(f.homeId)!;
  t.population = 10_000; t.prosperity = 80;
  const eco = ensureEconomy(f.state);
  eco.treasuryTotal = 0;
  const r = taxFromSystemTreasury(f.state, t, 1_000_000, 0.3, undefined);
  assert.deepEqual(r, { drawn: 0, governorShare: 0, landlordShare: 0 });
  assert.equal(eco.settlementJournal.filter((x) => x.kind === 'TAX').length, 0, 'no journal spam');

  // Partially funded: draw caps at the balance.
  eco.treasuryTotal = 1000;
  const r2 = taxFromSystemTreasury(f.state, t, 1_000_000, 0.3, undefined);
  assert.ok(r2.drawn <= 1000, 'never draws more than the house holds');
  assert.equal(r2.landlordShare, 0, 'system-owned land pays no landlord');
  assert.equal(
    eco.treasuryTotal,
    1000 - r2.drawn,
    'unpaid nominal landlord share stays in the treasury',
  );
});

test('pillage scar: crashes peaceScore, then heals on schedule', () => {
  const f = fixture('scar-heal');
  const t = f.state.territories.get(f.homeId)!;
  t.foodStock = 1_000_000; t.morale = 100;
  const cleanTarget = prosperityTarget(f.state, t, BALANCE);
  f.state.pillageScars = new Map([[f.homeId, 100]]);
  const scarredTarget = prosperityTarget(f.state, t, BALANCE);
  assert.equal(cleanTarget - scarredTarget, 15, 'full scar removes the whole 15-point peace term');
  // ⚙ 0.02/hour ⇒ 1 point per 30 ticks ⇒ heals ~48 points/day.
  for (let tick = 1; tick <= TICKS_PER_DAY; tick++) runTick(f.state, tick, f.rng.fork('sim'), BALANCE);
  const scar = f.state.pillageScars.get(f.homeId) ?? 0;
  assert.ok(scar > 40 && scar < 60, `scar heals ~48/day (got ${100 - scar} healed)`);
});
