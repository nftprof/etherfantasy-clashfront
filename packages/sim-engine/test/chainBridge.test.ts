/**
 * On-chain CT bridge accounting (CT-VAULT-AND-KEEPER): the backend mirror of the
 * vault contract. Deposits credit the server wallet idempotently; the anti-cheat
 * invariant W ≤ D (ECONOMY-MASTER-SUMMARY §0b) is enforced on the withdrawable
 * figure; conservation replay stays exact through a deposit.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng, loadBalance } from '@clashfront/shared';
import {
  addGovernor,
  applyChainDeposit,
  chainWithdrawableCtUnits,
  type DemoWorldFile,
  loadDemoWorld,
  replayJournal,
  supplyComponents,
  withdrawalVoucherFigure,
  type WorldState,
} from '../src/index';

function makeGrid(n: number): DemoWorldFile {
  const pid = (i: number) => `P${String(i).padStart(4, '0')}`;
  const parcels = [];
  for (let i = 0; i < n; i++) {
    const x = i * 2;
    const neighbors: string[] = [];
    if (i > 0) neighbors.push(pid(i - 1));
    if (i < n - 1) neighbors.push(pid(i + 1));
    parcels.push({
      parcelId: pid(i), tokenId: pid(i),
      center: [x, 0] as [number, number],
      polygon: [[x-1,-1],[x+1,-1],[x+1,1],[x-1,1]] as [number, number][],
      neighbors: neighbors.sort(),
    });
  }
  return { meta: { zone: 'TEST', sliceBBox: [-1,-1,n*2-1,1], generatedFrom: 'test' }, parcels };
}

function fixture(seed: string): { state: WorldState; governorId: string } {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(3), rng.fork('worldgen'), { monsterParcelPct: 0 });
  // A governor with a ZERO starting wallet so the deposit math is unambiguous.
  const { governorId } = addGovernor(state, rng.fork('g'), {
    name: 'Depositor', kind: 'PLAYER', ctUnits: 0, officerNames: ['A'],
  });
  return { state, governorId };
}

test('a confirmed deposit credits the server wallet and books a DEPOSIT record', () => {
  const f = fixture('deposit');
  const r = applyChainDeposit(f.state, f.governorId, 'tx1:0', 500_000);
  assert.deepEqual(r, { applied: true, duplicate: false, walletCtUnits: 500_000 });
  assert.equal(f.state.ctBalances!.get(f.governorId), 500_000);
  const eco = f.state.economy!;
  assert.equal(eco.chainAccounts![f.governorId]!.depositedCtUnits, 500_000);
  assert.ok(
    eco.settlementJournal.some((e) => e.kind === 'DEPOSIT' && e.reason === 'chain_deposit' && e.amountCtUnits === 500_000),
    'a DEPOSIT journal record was booked',
  );
});

test('the same depositId is idempotent — replaying an event never double-credits', () => {
  const f = fixture('idem');
  applyChainDeposit(f.state, f.governorId, 'tx7:2', 300_000);
  const again = applyChainDeposit(f.state, f.governorId, 'tx7:2', 300_000);
  assert.deepEqual(again, { applied: false, duplicate: true, walletCtUnits: 300_000 });
  assert.equal(f.state.ctBalances!.get(f.governorId), 300_000, 'credited exactly once');
  assert.equal(
    f.state.economy!.settlementJournal.filter((e) => e.reason === 'chain_deposit').length,
    1,
    'one journal record only',
  );
});

test('W ≤ D: withdrawable never exceeds deposits, and shrinks with in-game spend', () => {
  const f = fixture('wleqd');
  applyChainDeposit(f.state, f.governorId, 'd1', 1_000_000);
  assert.equal(chainWithdrawableCtUnits(f.state, f.governorId), 1_000_000, 'fresh deposit fully withdrawable');

  // The player loses CT in-game (negative-sum machine) — the wallet drops.
  f.state.ctBalances!.set(f.governorId, 400_000);
  assert.equal(
    chainWithdrawableCtUnits(f.state, f.governorId),
    400_000,
    'withdrawable tracks the (spent-down) wallet, not the deposit',
  );

  // The voucher figure is the cumulative authorized total (≤ deposited).
  const v = withdrawalVoucherFigure(f.state, f.governorId, 999_999_999);
  assert.equal(v.amountCtUnits, 400_000, 'clamped to withdrawable');
  assert.equal(v.authorizedCumulativeCtUnits, 400_000, 'cumulative starts at the first authorization');
});

test('nothing deposited on-chain ⇒ nothing withdrawable (even with an in-game balance)', () => {
  const f = fixture('nowd');
  // Grant an in-game balance that did NOT arrive via a chain deposit.
  f.state.ctBalances!.set(f.governorId, 5_000_000);
  assert.equal(
    chainWithdrawableCtUnits(f.state, f.governorId),
    0,
    'in-game CT with no chain deposit basis is not withdrawable — you can only cash out what you put in',
  );
});

test('deposit preserves the economy conservation replay (journal == live state)', () => {
  const f = fixture('conserve');
  applyChainDeposit(f.state, f.governorId, 'c1', 250_000);
  applyChainDeposit(f.state, f.governorId, 'c2', 125_000);
  const live = supplyComponents(f.state);
  const replayed = replayJournal(f.state.economy!.settlementJournal, f.state.economy!.pendingYield);
  assert.deepEqual(replayed, live, 'the settlement journal replays to the exact live components');
});
