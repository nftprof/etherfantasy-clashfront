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

## 4b. The master pool → burn → land-earmark model (owner 2026-07-25)

The owner's redistribution pattern, and how it maps to the two layers:

- **Every in-game action is a CT spend.** A spend maps to a **land ID** (the parcel it happens
  on — the sim already threads `spendHexId` through `spendCT`). The spent CT goes into a **MASTER
  POOL** rather than vanishing.
- **Rewards follow DESTRUCTION.** When assets are destroyed/"burned" in-game on a parcel (units
  lost, structures razed, a base pillaged), CT **shifts from the master pool, earmarked to the
  parcel where the destruction happened.** Resources bought on Land A but destroyed on Land B ⇒
  the CT accrues to **Land B** — "wherever it burns to ashes is where CT accumulates." Contested,
  war-torn land therefore earns the most: **war makes land valuable.**
- **Who earns:** the **LAND-NFT OWNER** (landlord) of the destruction parcel is the earner — it's
  their asset appreciating from the war fought on it. The **WARLORD/occupier does NOT earn from
  this pool**; the warlord's reward is the existing **pillage loot** (immediate, from the enemy
  treasury) — landlord = passive burn-pool yield, warlord = active spoils. (⚙ a small governor
  share of the burn-pool accrual is a tunable option, mirroring the 30/70 tax split, if you want
  occupiers to also benefit — flagged as an open dial below.)
- **The ≥10% protocol burn** is taken off the top of every pool→land shift (net-sink); the rest is
  the redistribution to landlords.

### Which layer owns which "burn" — the critical split

There are TWO distinct "burns" and they live in different layers:

| | The economy BURN (in-game) | The protocol BURN (on-chain) |
|---|---|---|
| What | asset destruction on a parcel drives pool→land earmark | ≥10% of CT flows destroyed forever (net-sink) |
| Where | **backend sim** — only it knows *what* was destroyed *where* | **vault contract** — `sweepHouseCut` / `_burn` |
| Currency | in-game `ct_units` (the master pool + earmarks are ledger state) | real on-chain CT |

**Master pool + earmark distribution is a BACKEND feature** — the contract cannot know land IDs or
destruction events, so it never holds per-land state. On-chain, the master pool is simply the
vault's aggregate CT custody.

### Why this does NOT break W ≤ D (the reconciliation)

A landlord who earns pool CT gets richer **in-game** — but **`chainWithdrawableCtUnits =
min(deposited − withdrawn, wallet)`** still caps their on-chain cash-out at their **own deposits**.
Earned pool CT (beyond their deposit basis) is spendable in-game (buys units, enriches land — which
burns/redistributes it onward) but is **NOT withdrawable**. This is exactly the doctrine: *in-game
rich ≠ on-chain profit; the only path to net-positive is the discretionary dev vault.* So the
redistribution pool makes land valuable and war meaningful **without** minting withdrawable CT and
**without** weakening the anti-cheat backstop. ⚠ If instead you intend pool earnings to be
**withdrawable** (players net-positive from war), that is a different, weaker invariant — it needs a
`credited[user]` on-chain that the moderator raises, and the "vault is the only net-positive path"
rule is relaxed. **Confirm which you want (see §6.5)** — it changes the contract.

## 5. Trust boundary (the "no weak link" analysis)

| Actor | Can it steal? | Bound by |
|---|---|---|
| Client / player | No | server-authoritative balances; on-chain `W ≤ D` |
| Keeper (deposit) | No | read-only + a signed endpoint; holds no keys/funds; deposits are idempotent |
| Withdrawal signer (if stolen) | Only up to **each user's own deposits** | on-chain `withdrawn ≤ deposited` backstop |
| Sweep signer (if stolen) | Bounded by `minReserveAfter` + `≥10%`-burn | on-chain checks; still audit the reserve figure |
| Vault `owner` / **admin** = `0xB2e3…F61f` | Upgrade the proxy, rotate signer/vault/moderator, unpause | **make it a timelock + multisig** — an upgrade can change everything |
| **Moderator** (= the keeper) | Pause only (fast incident response) | cannot move funds, cannot upgrade |

Keys: `withdrawalSigner` + keeper HMAC secret in an HSM/KMS; `owner` a timelock+multisig; a separate
fast-pause guardian. `/internal/chain/*` is a deployment boundary — never on the public ingress.

## 6. Owner decisions

**LOCKED (owner 2026-07-25):**
- **Admin/owner** = `0xB2e3e82a95f5c4c47E30A5b420Ac4f99d32EF61f` (set at `initialize`). Upgrade + config.
- **Upgradeable** — UUPS proxy (ERC1967), upgrade gated `onlyOwner`. (Deploy the admin as a
  timelock/multisig — an upgrade can rewrite any logic.)
- **Keeper = moderator** — pause rights only, no funds power.
- **Withdrawal model** — backend-signed EIP-712 cumulative vouchers (a stolen signer bounded by W≤D).
- **Earner** — the LAND-NFT OWNER of the destruction parcel; the warlord earns via pillage loot, not
  the burn pool (§4b).

**STILL TO CONFIRM (⚙):**
1. **CT token** on Pentagon Chain: address + decimals (keeper assumes 18-dp) + does it expose
   `burn()`? (sets `burnSupported`; else the sweep uses `0x…dEaD`).
2. **Rake band** — `≥10%` burn floor is on-chain; the total cut (10–40%) is realized by sweep sizing.
   Confirm the target take.
3. **Master-pool tuning** — what fraction of a spend enters the pool vs. burns immediately; what
   fraction of destroyed-asset value earmarks to the land; immediate vs. accrual payout.
4. **Governor share** — does the occupying warlord get a ⚙ slice of the burn-pool accrual (like the
   30/70 tax split), or strictly loot-only? (Recommendation: loot-only for v1.)
5. **⚠ Withdrawable-vs-in-game (the invariant fork)** — are landlord pool earnings **in-game only**
   (recommended; on-chain W≤D unchanged, matches the locked doctrine) or **withdrawable** (players
   net-positive from war; needs an on-chain `credited[user]` the moderator raises and relaxes the
   "vault is the only net-positive path" rule)? This changes the contract — see §4b.

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
