// SPDX-License-Identifier: MIT
/**
 * CT-vault keeper — the "backend job that picks up the CT and credits the backend"
 * (docs/briefs/CT-VAULT-AND-KEEPER.md). Reference implementation, Node + ethers v6.
 *
 *   1. Watches ClashCTVault `Deposit(user, amount, depositId)` events on Pentagon Chain.
 *   2. Waits CONFIRMATIONS blocks (re-org safety), then POSTs the credit to the CF
 *      server's /internal/chain/deposit (HMAC-signed, idempotent by depositId).
 *   3. Persists the last fully-processed block so a restart resumes exactly once.
 *   4. Re-queues deposits the server couldn't resolve yet (wallet not bound —
 *      user hasn't logged in); the vault still custodies the CT, nothing is lost.
 *
 * This process holds NO money and NO withdrawal keys — it only READS chain events
 * and calls a signed internal endpoint. The withdrawal SIGNER (separate, guarded
 * key) lives in signWithdrawalVoucher() and is invoked on a player's cash-out.
 *
 * Run:  CHAIN_RPC=… VAULT_ADDR=… CF_SERVER=… CHAIN_KEEPER_SECRET=… node keeper.mjs
 *   (npm i ethers)  — standalone; NOT part of the pnpm workspace.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { ethers } from 'ethers';

const CFG = {
  rpc: req('CHAIN_RPC'),
  vaultAddr: req('VAULT_ADDR'),
  cfServer: req('CF_SERVER').replace(/\/+$/, ''), // e.g. http://127.0.0.1:8130
  keeperSecret: req('CHAIN_KEEPER_SECRET'),
  confirmations: Number(process.env.CONFIRMATIONS ?? '12'),
  pollMs: Number(process.env.POLL_MS ?? '15000'),
  cursorFile: process.env.CURSOR_FILE ?? './.keeper-cursor.json',
  startBlock: Number(process.env.START_BLOCK ?? '0'),
  // EIP-712 withdrawal signer key — GUARD THIS. Optional (deposit-only keepers omit it).
  signerKey: process.env.WITHDRAWAL_SIGNER_KEY,
};

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

const VAULT_ABI = [
  'event Deposit(address indexed user, uint256 amount, uint256 indexed depositId)',
];

const provider = new ethers.JsonRpcProvider(CFG.rpc);
const vault = new ethers.Contract(CFG.vaultAddr, VAULT_ABI, provider);

function loadCursor() {
  if (existsSync(CFG.cursorFile)) return JSON.parse(readFileSync(CFG.cursorFile, 'utf8'));
  return { lastProcessedBlock: CFG.startBlock, retry: [] };
}
function saveCursor(c) {
  writeFileSync(CFG.cursorFile, JSON.stringify(c));
}

/** POST a credit to the CF server, HMAC-signed exactly like the battle-result callback. */
async function postDeposit(wallet, depositId, amountCtUnits) {
  const body = JSON.stringify({ wallet, depositId, amountCtUnits });
  const sig = 'v1=' + createHmac('sha256', CFG.keeperSecret).update(body).digest('hex');
  const res = await fetch(`${CFG.cfServer}/internal/chain/deposit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cf-signature': sig },
    body,
  });
  if (!res.ok) throw new Error(`server ${res.status}: ${await res.text()}`);
  return res.json(); // { ok, resolved, applied, duplicate, governorId?, walletCtUnits? }
}

/**
 * Convert an on-chain CT `amount` (wei, 18 dp) to backend ct_units.
 * CT_UNITS_PER_CT = 10_000 (shared/src/constants.ts). ⚙ Confirm the token's
 * decimals with the owner — this assumes 18-dp CT.
 */
const CT_DECIMALS = 18n;
const CT_UNITS_PER_CT = 10_000n;
function toCtUnits(amountWei) {
  // ct_units = amount / 10^decimals * 10_000  (floor)
  return Number((amountWei * CT_UNITS_PER_CT) / 10n ** CT_DECIMALS);
}

async function processDeposit(cursor, log) {
  const { user, amount, depositId } = log.args;
  const id = `${depositId}`; // the vault's monotonic id — the idempotency key
  const amountCtUnits = toCtUnits(amount);
  if (amountCtUnits <= 0) return; // dust below one ct_unit
  const r = await postDeposit(user.toLowerCase(), id, amountCtUnits);
  if (!r.resolved) {
    // Wallet not bound yet (user hasn't logged in). Re-queue for a later pass.
    if (!cursor.retry.some((x) => x.id === id)) {
      cursor.retry.push({ id, wallet: user.toLowerCase(), amountCtUnits });
    }
    console.log(`[keeper] deposit ${id} unresolved (wallet ${user} unbound) — re-queued`);
  } else {
    cursor.retry = cursor.retry.filter((x) => x.id !== id);
    console.log(`[keeper] deposit ${id} → ${r.governorId} (${amountCtUnits} ct_units, dup=${r.duplicate})`);
  }
}

async function tick() {
  const cursor = loadCursor();
  const head = await provider.getBlockNumber();
  const safeTo = head - CFG.confirmations;
  if (safeTo <= cursor.lastProcessedBlock) return;
  const from = cursor.lastProcessedBlock + 1;

  const events = await vault.queryFilter(vault.filters.Deposit(), from, safeTo);
  for (const log of events) await processDeposit(cursor, log);

  // Retry previously-unresolved deposits (idempotent server-side).
  for (const pending of [...cursor.retry]) {
    const r = await postDeposit(pending.wallet, pending.id, pending.amountCtUnits);
    if (r.resolved) {
      cursor.retry = cursor.retry.filter((x) => x.id !== pending.id);
      console.log(`[keeper] retried deposit ${pending.id} → ${r.governorId}`);
    }
  }

  cursor.lastProcessedBlock = safeTo;
  saveCursor(cursor);
}

/**
 * WITHDRAWAL SIGNER (separate concern) — call from the cash-out flow. Asks the
 * server how much the governor may withdraw (W ≤ D), signs the EIP-712 voucher
 * the player submits to ClashCTVault.withdraw(). GUARD `WITHDRAWAL_SIGNER_KEY`:
 * the on-chain W ≤ D backstop bounds a compromised signer to per-user deposits.
 */
export async function signWithdrawalVoucher(governorId, requestedCtUnits, userAddress) {
  if (!CFG.signerKey) throw new Error('WITHDRAWAL_SIGNER_KEY not set');
  const body = JSON.stringify({ governorId, requestedCtUnits });
  const sig = 'v1=' + createHmac('sha256', CFG.keeperSecret).update(body).digest('hex');
  const res = await fetch(`${CFG.cfServer}/internal/chain/authorize-withdraw`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cf-signature': sig },
    body,
  });
  const { amountCtUnits, authorizedCumulativeCtUnits } = await res.json();
  if (amountCtUnits <= 0) return { amountCtUnits: 0 };

  // ct_units → on-chain CT (wei). ⚙ confirm decimals.
  const authorizedCumulativeWei =
    (BigInt(authorizedCumulativeCtUnits) * 10n ** CT_DECIMALS) / CT_UNITS_PER_CT;
  const deadline = Math.floor(Date.now() / 1000) + 15 * 60;

  const signer = new ethers.Wallet(CFG.signerKey);
  const domain = { name: 'ClashCTVault', version: '1', chainId: (await provider.getNetwork()).chainId, verifyingContract: CFG.vaultAddr };
  const types = { Withdraw: [
    { name: 'user', type: 'address' },
    { name: 'authorizedCumulative', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ] };
  const signature = await signer.signTypedData(domain, types, {
    user: userAddress, authorizedCumulative: authorizedCumulativeWei, deadline,
  });
  return { authorizedCumulative: authorizedCumulativeWei.toString(), deadline, signature, amountCtUnits };
}

// ── Main loop (deposit pickup) ────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`[keeper] watching ${CFG.vaultAddr} → ${CFG.cfServer} (conf=${CFG.confirmations})`);
  const loop = async () => {
    try { await tick(); } catch (e) { console.error('[keeper] tick failed:', e.message); }
    setTimeout(loop, CFG.pollMs);
  };
  loop();
}
