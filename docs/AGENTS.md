# AGENTS.md — How AI Agents Build Clash Front

> Read this **first**. It tells an implementation agent (Claude Code, Cursor, Codex, or a human)
> how to work in this repo: the canon, conventions, the task graph, and the definition of done.
> Then read your assigned subsystem doc, then [`08-data-models.md`](./08-data-models.md).

Clash Front is the persistent-world war layer of Ether Fantasy. This repo currently holds the
**design & implementation bible** (`docs/`). Code is built on top of it, most likely by **forking the
existing EF MOBA codebase** and adding the overworld as sibling packages (see
[`07-backend-architecture.md`](./07-backend-architecture.md) for the monorepo layout).

---

## 0. Prime directives

1. **Obey the North Star.** The macro game matters more than any single battle. If a change makes an
   individual battle decide a war on its own, it is wrong. See [`README.md`](./README.md).
2. **Canon is law.** All names, enums, IDs, constants, and schemas come from [`README.md`](./README.md)
   (Glossary) and [`08-data-models.md`](./08-data-models.md). Never invent or rename. To add a term,
   edit those files in the same change.
3. **The server is authoritative.** Never trust the client for simulation, economy, or battle outcomes.
4. **CT is sacred.** Every carat moves through the double-entry `LedgerEntry`. No CT is created outside a
   `reason:'mint'` entry. Respect the CT-conservation invariant.
5. **Hero impact is capped** at `HERO_IMPACT_MAX = 0.20`. This is the anti-pay-to-win firewall; never
   exceed it in any resolution path.
6. **Determinism & replayability.** The world tick must be deterministic given `(state, seed, inputs)`.
   No wall-clock `Date.now()`/`Math.random()` inside simulation — inject a seeded RNG and the tick number.

---

## 1. Repository layout (target)

The `docs/` bible exists today. Code lands as a TypeScript monorepo (pnpm workspaces), forking EF MOBA
in as a sibling. Proposed layout (finalize in [`07`](./07-backend-architecture.md)):

```
/docs                     # this bible (source of truth for design)
/packages
  /shared                 # canonical types (mirrors 08-data-models.md), constants, balance.json
  /sim-engine             # authoritative world tick engine (01, 06)
  /economy                # CT ledger, tax, prosperity, NFT economy (02)
  /military               # armies, units, supply (03)
  /battle-orchestration   # battle scheduler + EF MOBA handoff (04)
  /ai                     # governor/military/diplomacy/economy/world-director AI (06)
  /api-gateway            # REST + WebSocket contracts (09)
  /ef-moba                # FORKED existing MOBA (LIVE battle servers) — added when repo access granted
/apps
  /web                    # browser client: hex map renderer (PixiJS/Phaser) + UI
  /world-server           # deploys the sim + services
/infra                    # IaC, migrations, deploy
```

### Sibling repositories (the real system landscape)

Clash Front builds **on top of existing EF systems**. Integration targets (all under `blockchainsuperheroes/`):

| Repo | Role | Stack | Clash Front usage |
|------|------|-------|-------------------|
| `etherfantasy-browser-moba-game` | **The battle engine** — browser 3D MOBA client + authoritative multiplayer server (Pentagon Chain) | TS (browser + server) | LIVE battle handoff target ([`04`](./04-battle-system.md), [`09`](./09-api-contracts.md)). Battles happen *within* a land territory here. |
| `hexagone-city-website` | **The overworld map base** — browser hex map with NFT-owned land | TypeScript | Source of the map/zone/land-NFT data model and renderer. Import its hexes/zones into canonical `Hex`/`Territory` ([`08`](./08-data-models.md)); its NFT owners are our Landlords. |
| `games-etherfantasy-backend` | EF platform backend (`api.etherfantasy.com`) | Node/Express TS | Accounts/identity/heroes source of truth (confirm), platform API integration. |
| `hexagon-crons` | Scheduled jobs for hexagon city | Python | Reference for existing land/yield cron logic. |
| `_archive-infra-hexr-backend` | Old hexagon-city backend (**archived**) | C# | Historical reference only — do not build against. |

**Chains (corrected 2026-07-02):** estates (L2) = ERC-721 on **Ethereum** (chainId 1); parcels
(L3) = ERC-721 on **Polygon** (chainId 137); **Pentagon Chain = characters (Masters), the
MOBA PlayEscrow, and the CT TOKEN itself** (CT is a live on-chain token — product owner
2026-07-02). The chain service ([`07`](./07-backend-architecture.md)) must be multi-chain;
`LandNFT.chainId` models land per-NFT. CT flow model: players DEPOSIT CT into the game
(escrow; deposit caps per epoch = the anti-P2W faucet cap) and WITHDRAW out; the in-game
ledger is authoritative between settlements; spends/rewards settle via the EXISTING per-user
AA/internal wallet stack (same system that tracks NPCs; backend = operator; batched; real
burns; settlement journal in the sim — [`02`](./02-economy.md) §13). CT on Pentagon Chain:
`0x6a3a8407E6d33cDb63650741Bd1f3a97a1D2D4b9` — CLOSED-ecosystem token (earned across EF games,
not freely traded outside the chain ecosystem). PlayEscrow remains the operator-call reference.

> ❓ OPEN — **Repo access.** These sibling repos must be added to the agent session's repo scope to be
> readable. Until then, build against the **battle handoff contract** in
> [`09-api-contracts.md`](./09-api-contracts.md) and a stub battle server. Do not block overworld work on it.
> ❓ OPEN — confirm whether hero/account source of truth is `games-etherfantasy-backend`.

---

## 2. Conventions

- **Language:** TypeScript everywhere (matches a JS/TS MOBA fork). `strict: true`.
- **Money & resources:** integers in base units. CT in `ct_units` (`1 CT = 10_000 units`). Never floats for money.
- **IDs:** ULIDs, type-prefixed (`terr_`, `army_`, `battle_`…). See [`08 §1`](./08-data-models.md).
- **Time:** UTC epoch ms for timestamps; simulation progresses by **tick number**, not wall clock.
- **Concurrency:** optimistic via `version`; single-writer per shard/region for the tick (see [`07`](./07-backend-architecture.md)).
- **Config vs code:** balance numbers (yield curves, travel multipliers, costs) live in `balance.json`,
  versioned separately so designers retune without redeploying logic. Code reads constants from `shared`.
- **Tests:** every simulation rule needs a deterministic unit test with a fixed seed. Economy changes need
  a CT-conservation property test. Battle resolution needs the "whale can't flip a lopsided battle" test.
- **Docs stay in sync:** if code changes a rule or schema, update the owning doc in the same PR.

---

## 3. The subsystem map (who owns what)

| Doc | Package(s) | Depends on | Exposes |
|-----|-----------|-----------|---------|
| [01 World Sim](./01-world-simulation.md) | `sim-engine` | shared, data models | tick loop, movement, supply |
| [02 Economy](./02-economy.md) | `economy` | 01, shared | CT ledger, tax, prosperity, NFT econ |
| [03 Military](./03-military.md) | `military` | 01, 02 | army strength → WarScore input |
| [04 Battle](./04-battle-system.md) | `battle-orchestration` | 03, EF MOBA | WarScore, BattleResult, map writeback |
| [05 PvE](./05-pve-integration.md) | `sim-engine`,`ai` | 01, 02 | wild zones, bosses, EF Hunt hooks |
| [06 AI](./06-ai-architecture.md) | `ai` | 01–04 | NPC kingdom behavior, world director |
| [07 Backend](./07-backend-architecture.md) | all | 08 | services, stores, scaling |
| [09 API](./09-api-contracts.md) | `api-gateway` | all | REST/WS/event contracts |

**Build order (critical path):** `shared/data-models` → `sim-engine` tick → `economy` → `military` →
`battle-orchestration` (against stub) → `ai` → `api-gateway`/`web`. EF MOBA fork slots into
`battle-orchestration` when available. Full sequencing in [`10-development-roadmap.md`](./10-development-roadmap.md).

---

## 4. How to pick up work

1. **Read** this file, your subsystem doc, and [`08-data-models.md`](./08-data-models.md).
2. **Confirm the contract.** Your code's inputs/outputs must match the schemas in `08` and the endpoints
   in [`09`](./09-api-contracts.md). If they don't, fix the doc first (canon before code).
3. **Write the deterministic test first** for the rule/formula you're implementing.
4. **Implement** in the owning package. Read balance numbers from `balance.json`, constants from `shared`.
5. **Verify invariants** (see below) still hold.
6. **Update the doc** if behavior/schema changed.
7. **Small, reviewable changes.** One system slice per PR. Cross-link the doc section in the PR body.

### Parallelization
The docs are structured so agents can work in parallel. Safe concurrent workstreams once `shared` +
`sim-engine` skeleton exist: Economy, Military, AI, and Web-map can proceed independently against the
shared types. **Synchronize** at: schema changes (`08`), the tick operation order (`01`), and the
WarScore formula (which `03` and `04` must agree on).

---

## 5. Invariant checklist (run in CI / before every merge)

From [`08 §5`](./08-data-models.md) — a change that breaks any of these is rejected:

- [ ] **CT conservation:** Σ balances (from ledger) == total minted CT.
- [ ] **1 Territory ↔ 1 LandNFT**, never orphaned.
- [ ] **Ownership ≠ control:** landlord and governor independent.
- [ ] **Hero cap:** every resolution clamps hero contribution ≤ `HERO_IMPACT_MAX`.
- [ ] **No negative resources** after any tick (population, food, treasury, supply ≥ 0).
- [ ] **Prosperity/Morale** ∈ [0,100].
- [ ] **Territories never hard-deleted.**
- [ ] **Marching army** always has a valid `path` + `arrivalTick`; position is a real hex.
- [ ] **SIEGE battle** references exactly one `defenderTerritoryId`.
- [ ] **Post-victory action** chosen once, only by the winner.
- [ ] **Determinism:** same `(state, seed, inputs)` → identical tick output (golden-master test).

---

## 6. Definition of Done (per system)

A system is "done" when: it matches its doc; deterministic tests pass with fixed seeds; invariants hold in
CI; it reads balance from `balance.json`; it emits the domain events listed in [`09`](./09-api-contracts.md);
it has observability (structured logs/metrics for its tick budget); and the owning doc reflects reality.

---

## 7. Anti-goals (do not do)

- Do **not** make heroes permanently level up in Clash Front (power creep). Fame/equipment only, within the cap.
- Do **not** let any single NPC empire snowball to own the world — the AI director prevents stagnation ([`06`](./06-ai-architecture.md)).
- Do **not** put chain calls in the hot tick loop — CT is off-chain-authoritative, anchored periodically ([`07`](./07-backend-architecture.md)).
- Do **not** design MOBA combat mechanics here — EF MOBA owns that; we own the map and the handoff.
- Do **not** duplicate rules across docs — cross-link the canonical source.

---

## 8. When you are unsure

- If a number is missing, check `balance.json` / [`08`](./08-data-models.md); if truly undefined, mark it
  `> ❓ OPEN:` in the relevant doc and pick a labeled placeholder — never silently invent a "real" value.
- If a design choice would weaken the North Star or the hero cap, stop and flag it, don't ship it.
- If EF MOBA integration details are needed and the fork isn't present, build to the contract in [`09`](./09-api-contracts.md) with a stub.

---

## Cross-references
- [`README.md`](./README.md) — pillars, glossary, canon constants
- [`08-data-models.md`](./08-data-models.md) — schemas & invariants
- [`07-backend-architecture.md`](./07-backend-architecture.md) — services & monorepo layout
- [`10-development-roadmap.md`](./10-development-roadmap.md) — phasing & first-2-weeks tasks
