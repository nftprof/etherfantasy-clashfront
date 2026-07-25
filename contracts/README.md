# Clash Front — on-chain CT layer

The money boundary for the server-authoritative CT economy. Full design: [`docs/briefs/CT-VAULT-AND-KEEPER.md`](../docs/briefs/CT-VAULT-AND-KEEPER.md).

- `src/ClashCTVault.sol` — the deposit/withdraw/house-cut vault. Enforces the anti-cheat
  invariant **W ≤ D** (a user can never withdraw more CT than they deposited) on-chain, plus
  the **≥10% burn floor** on every house-cut sweep (net-sink) with the rest to the dev vault.
- `test/ClashCTVault.t.sol` — Foundry tests (deposit credit, delta withdraw, the W≤D backstop,
  stale-voucher + idempotent-cumulative-voucher).
- `keeper/` — the off-chain keeper (ethers): watches `Deposit` events → credits the CF backend
  (`/internal/chain/deposit`, idempotent). Standalone; NOT in the pnpm workspace.

## Build & test (Foundry)

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
forge build
forge test -vvv
```

## ⚠ Status: UNAUDITED

This handles real money. **It MUST be audited before mainnet.** Deploy the admin (`owner`) as a
timelock + multisig; keep the `withdrawalSigner` and keeper keys in an HSM/KMS. See the brief's
"Owner must confirm" and "Trust boundary" sections before deploying.
