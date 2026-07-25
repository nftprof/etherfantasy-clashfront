/**
 * CT-vault keeper → server credit path (CT-VAULT-AND-KEEPER §2): the server
 * resolves a confirmed on-chain deposit's wallet to its governor and credits the
 * authoritative ledger idempotently; an unbound wallet is safely deferred; the
 * withdrawal authorization honours W ≤ D.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS } from '@clashfront/shared';
import type { DemoWorldFile } from '@clashfront/sim-engine';
import { Game, type GameConfig } from '../src/index';

const CT = CONSTANTS.CT_UNITS_PER_CT;

function repoDataPath(file: string): string {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', 'data', file),
    join(__dirname, '..', '..', '..', 'data', file),
  ];
  const found = candidates.find((p) => existsSync(p));
  assert.ok(found, `${file} missing from data/`);
  return found;
}
const WORLD_FILE = JSON.parse(readFileSync(repoDataPath('demo-world.json'), 'utf8')) as DemoWorldFile;

function gameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    worldFile: WORLD_FILE,
    seed: 'chain-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 0, // zero start so the deposit math is unambiguous
    npcCtUnits: 20_000 * CT,
    masterNames: [],
    ...overrides,
  };
}

const WALLET = '0xAbC0000000000000000000000000000000000001';

test('a confirmed deposit from a bound wallet credits the right governor, idempotently', () => {
  const game = new Game(gameConfig());
  const { governorId } = game.join('Depositor');
  game.walletBindings.set(WALLET.toLowerCase(), governorId); // bound at PG login in prod

  const r1 = game.applyChainDeposit(WALLET, 'tx1:0', 250 * CT);
  assert.deepEqual(r1, { resolved: true, applied: true, duplicate: false, governorId, walletCtUnits: 250 * CT });
  assert.equal(game.state.ctBalances!.get(governorId), 250 * CT);

  // Replaying the same event (keeper restart) never double-credits.
  const r2 = game.applyChainDeposit(WALLET, 'tx1:0', 250 * CT);
  assert.equal(r2.duplicate, true);
  assert.equal(game.state.ctBalances!.get(governorId), 250 * CT);
});

test('an unbound wallet is deferred (resolved:false) — no credit, no loss', () => {
  const game = new Game(gameConfig());
  const r = game.applyChainDeposit('0xDEAD00000000000000000000000000000000BEEF', 'tx9:1', 100 * CT);
  assert.deepEqual(r, { resolved: false, applied: false, duplicate: false });
});

test('withdrawal authorization honours W ≤ D and tracks the spent-down wallet', () => {
  const game = new Game(gameConfig());
  const { governorId } = game.join('Casher');
  game.walletBindings.set(WALLET.toLowerCase(), governorId);
  game.applyChainDeposit(WALLET, 'd1', 1000 * CT);
  assert.equal(game.chainWithdrawable(governorId).withdrawableCtUnits, 1000 * CT);

  // Spend CT in-game (negative-sum) → withdrawable follows the wallet down.
  game.state.ctBalances!.set(governorId, 300 * CT);
  const v = game.authorizeWithdrawal(governorId, 999_999 * CT);
  assert.equal(v.amountCtUnits, 300 * CT, 'clamped to what remains (≤ deposited)');
  assert.equal(v.authorizedCumulativeCtUnits, 300 * CT);
});

test('bad deposit inputs are rejected (server never trusts the caller)', () => {
  const game = new Game(gameConfig());
  const { governorId } = game.join('Guard');
  game.walletBindings.set(WALLET.toLowerCase(), governorId);
  assert.throws(() => game.applyChainDeposit(WALLET, '', 100 * CT), /depositId/);
  assert.throws(() => game.applyChainDeposit(WALLET, 'x', 0), /positive integer/);
  assert.throws(() => game.applyChainDeposit(WALLET, 'x', -5), /positive integer/);
});
