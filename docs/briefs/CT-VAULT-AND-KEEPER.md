# CT VAULT + KEEPER — the on-chain money boundary

> Builds the decision-17 vault the economy has always assumed (ECONOMY-MASTER-SUMMARY §0b,
> "the vault contract + keeper are designed, not built — the project's critical-path
> infrastructure"). This brief is the design of record for the on-chain CT layer, the backend
> credit pipeline, and the trust model.
>
> **Status: v0 scaffold. UNAUDITED — must be audited before mainnet.**

## 0. The one rule (why any of this exists)

**A user can NEVER withdraw more CT than they deposited** (`W ≤ D`). The game is a house-edged,
negative-sum CT machine; the only path to net-positive is a discretionary, vetted reward from the
developer vault. This makes cheating pointless *by construction* — no exploit pays out more CT
than deposits allow. The vault enforces `W ≤ D` **on-chain**, and the backend enforces the tighter
"you can only cash out what you still hold in-game" on top.

## 1. Server-authoritative model — confirmed, no weak link

**Gold, resources, and spendable CT live ONLY in server `WorldState`.** The client never holds an
authoritative balance — it renders `/api/state` snapshots and posts orders; every spend
(raise units, develop, market trade, enrich, caravan, craft) deducts **server-side, inside the
deterministic tick, BEFORE anything is granted.** There is no client-trusted balance to forge.

CT enters and leaves the game only across the vault boundary:

```
 mobile P2E onramp / player wallet
        │  deposit(CT)                 ← the ONLY faucet (besides marked genesis/join grants)
        ▼
  ┌──────────────┐   Deposit event    ┌────────┐   POST /internal/chain/deposit (HMAC)   ┌────────────┐
  │ ClashCTVault │ ─────────────────▶ │ keeper │ ──────────────────────────────────────▶ │ CF server  │
  │  (on-chain)  │                    └────────┘   (idempotent by depositId)              │  ctBalances│
  │  deposited[] │                                                                        │  + journal │
  │  withdrawn[] │ ◀───────────────── EIP-712 voucher ◀─── /internal/chain/authorize-withdraw
  └──────────────┘   withdraw(cum,sig)   signer (W≤D)                                     └────────────┘
```

- **1 CT = 10 000 `ct_units`** (shared `CT_UNITS_PER_CT`). The keeper converts on-chain wei → ct_units.
- Gold is bought from the server CT balance in-game (1 CT = 100 gold, fixed) — gold is **never** on-chain.
- The keeper holds **no money and no keys** — it only reads events and calls a signed endpoint.

## 2. Deposit flow (BUILT + tested)

1. Player `CT.approve(vault, amt)` then `vault.deposit(amt)` (or a mobile onramp `depositFor(player, amt)`).
2. Vault credits `deposited[user] += received`, emits `Deposit(user, amount, depositId)`.
3. Keeper waits `CONFIRMATIONS` blocks (re-org safety), POSTs `{wallet, depositId, amountCtUnits}` to
   `POST /internal/chain/deposit` (HMAC `X-CF-Signature`, same scheme as the battle-result callback).
4. Server resolves `wallet → governor` (bound at PG login from `mm_address`) and calls
   `economy.applyChainDeposit` — **idempotent by `depositId`**: credits `ctBalances`, raises the
   per-user `depositedCtUnits` ceiling, and books a `DEPOSIT` settlement-journal record (conservation
   replay stays exact). An **unbound wallet** returns `{resolved:false}` and the keeper re-queues it —
   the vault still custodies the CT, nothing is ever lost.

Backend seam (`packages/sim-engine/src/economy.ts`), covered by `test/chainBridge.test.ts`:
`applyChainDeposit`, `chainWithdrawableCtUnits`, `withdrawalVoucherFigure`, `ChainAccount`.
Server: `Game.applyChainDeposit / chainWithdrawable / authorizeWithdrawal`, `POST /internal/chain/*`.

## 3. Withdraw flow (contract BUILT; backend settlement = phase 2)

1. Player requests a cash-out. The backend computes `withdrawable = min(deposited − withdrawn, wallet)`
   — **both halves of `W ≤ D`**: never more than deposited, never more than you still hold (gameplay
   losses shrink the wallet, so the negative-sum edge falls out for free).
2. The **withdrawal signer** signs an EIP-712 voucher carrying the new **cumulative** authorized total.
3. Player submits `vault.withdraw(authorizedCumulative, deadline, sig)`. The vault pays
   `authorizedCumulative − withdrawn[user]`, advances `withdrawn`, and **hard-checks
   `authorizedCumulative ≤ deposited[user]`** — so even a compromised signer can't exceed deposits.
   Cumulative + monotonic ⇒ replaying an old voucher is a safe no-op.
4. **Phase 2 (owed):** the keeper observes the settled `Withdraw` event and calls a
   `settleChainWithdrawal` that debits the server wallet and advances the backend `withdrawnCtUnits`,
   with a reserve-at-authorization lifecycle so a player can't authorize-then-spend the same CT.

## 4. House cut → burn + vault (contract BUILT)

CT that gameplay consumed (deposited but never withdrawn) is the house's. `sweepHouseCut(burnAmount,
vaultAmount, minReserveAfter, nonce, deadline, sig)` is signer-authorized and enforces on-chain:
- **`burnAmount ≥ 10%` of the sweep** (`MIN_BURN_BPS`, the net-sink hard floor) — burned via the
  token's `burn()` or, if absent, sent to `0x…dEaD`.
- the rest → `devVault` (the discretionary prize pool).
- **`balance − sweep ≥ minReserveAfter`** — the signer attests how much must stay to cover
  outstanding user withdrawals, so an over-sweep can't strand user funds.

## 5. Trust boundary (the "no weak link" analysis)

| Actor | Can it steal? | Bound by |
|---|---|---|
| Client / player | No | server-authoritative balances; on-chain `W ≤ D` |
| Keeper (deposit) | No | read-only + a signed endpoint; holds no keys/funds; deposits are idempotent |
| Withdrawal signer (if stolen) | Only up to **each user's own deposits** | on-chain `withdrawn ≤ deposited` backstop |
| Sweep signer (if stolen) | Bounded by `minReserveAfter` + `≥10%`-burn | on-chain checks; still audit the reserve figure |
| Vault `owner` | Can rotate signer/vault, pause | **make it a timelock + multisig** |
| Guardian | Pause only (fast incident response) | cannot move funds |

Keys: `withdrawalSigner` + keeper HMAC secret in an HSM/KMS; `owner` a timelock+multisig; a separate
fast-pause guardian. `/internal/chain/*` is a deployment boundary — never on the public ingress.

## 6. Owner must confirm before deploy (⚙)

1. **CT token** on Pentagon Chain: address + decimals (keeper assumes 18-dp) + does it expose
   `burn()`? (sets `BURN_SUPPORTED`; else the sweep uses `0x…dEaD`).
2. **Withdrawal authorization model** — this v0 uses **backend-signed EIP-712 cumulative vouchers**
   (recommended: a stolen signer is bounded by `W ≤ D`). Alternatives (Merkle-batch self-claim /
   operator-direct) change the contract; confirm before build-out.
3. **Custody & admin** — immutable core + `Ownable2Step` + `Pausable` (v0). Confirm the `owner`
   timelock/multisig and the guardian key holder; decide if you want an upgradeable proxy (larger
   attack surface — not recommended for the vault).
4. **Rake band** — `≥10%` burn floor is hard-coded (`MIN_BURN_BPS`); the total cut (10–40%) is a
   backend policy realized through sweep sizing. Confirm the target take.

## 7. Env / wiring

- Server: `CHAIN_KEEPER_SECRET` turns `/internal/chain/*` ON (unset = 503). Wallet→governor binding is
  automatic at PG login (`mm_address`).
- Keeper: `CHAIN_RPC`, `VAULT_ADDR`, `CF_SERVER`, `CHAIN_KEEPER_SECRET`, `CONFIRMATIONS`,
  `WITHDRAWAL_SIGNER_KEY` (withdrawals only). `cd contracts && forge test` for the contract.

## 8. TODO (build-out after owner sign-off + audit)

- Phase-2 withdrawal settlement + reserve-at-authorization lifecycle (`settleChainWithdrawal`,
  conservation-preserving `WITHDRAW` journal — the journal already reserves the kind).
- Foundry sweep tests + fuzz/invariant tests (`W ≤ D` never breaks; conservation).
- Deposit-cap-per-epoch (the P2W faucet cap, ECONOMY-MASTER-SUMMARY) — enforce at `deposit()`.
- Full external audit + a testnet dry-run with the keeper before mainnet.
