# Clash Front — on-chain CT layer

The money boundary for the server-authoritative CT economy. Full design: [`docs/briefs/CT-VAULT-AND-KEEPER.md`](../docs/briefs/CT-VAULT-AND-KEEPER.md).

- `src/ClashCTVault.sol` — the **UUPS-upgradeable** deposit/withdraw/house-cut vault. Enforces the
  anti-cheat invariant **W ≤ D** (a user can never withdraw more CT than they deposited) on-chain,
  plus the **≥10% burn floor** on every house-cut sweep (net-sink), rest to the dev vault.
- `script/Deploy.s.sol` — deploys the impl behind an ERC1967 proxy. **Admin/owner (upgrade + config)
  = `0xB2e3e82a95f5c4c47E30A5b420Ac4f99d32EF61f`.**
- `test/ClashCTVault.t.sol` — Foundry tests (via proxy): deposit credit, delta withdraw, the W≤D
  backstop, stale-voucher + idempotent-cumulative-voucher.
- `keeper/` — the off-chain keeper = the on-chain **moderator** role (pause rights only, no funds
  power). Watches `Deposit` events → credits the CF backend (`/internal/chain/deposit`, idempotent).
  Standalone; NOT in the pnpm workspace.

## Roles

| Role | Who | Powers |
|---|---|---|
| **owner / admin** | `0xB2e3…F61f` (multisig/timelock recommended) | upgrade the proxy, set signer/vault/moderator, unpause, rescue non-CT |
| **moderator** | the keeper's operational address | pause (incident response) — cannot move funds |
| **withdrawalSigner** | backend HSM key | signs EIP-712 withdrawal + sweep vouchers (bounded by on-chain W≤D) |

## Build & test (Foundry)

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts OpenZeppelin/openzeppelin-contracts-upgradeable foundry-rs/forge-std
forge build && forge test -vvv
```

## ⚠ Status: UNAUDITED

Handles real money. **Audit before mainnet.** Admin (owner) = a timelock + multisig; `withdrawalSigner`
+ keeper keys in an HSM/KMS. See the brief's "Owner must confirm" and "Trust boundary" before deploying.
