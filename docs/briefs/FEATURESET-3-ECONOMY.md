# Feature Set 3 — The Circular War Economy

> Product-owner directive (2026-07-02): economy must be CIRCULAR WITH A BURN. Spent CT
> redistributes into recoverable world value + lord yields + burn. Money must never buy power
> directly (no infinite soldiers — training takes TIME); money buys STAKES on the map (enrichment,
> structures) that other players can take or destroy. The game must NET-SINK CT. This brief is
> canon-adjacent: the durable rules also land in docs/02-economy.md §12.

## E1 — The Flow Splitter (every wallet→world spend)

A single sim primitive `spendCT(governorId, amount, spendParcelId, reason)` that splits EVERY
sink (training, provisions, develop, structures, claims, enrichment, repairs) into buckets ⚙:

| Bucket | Default ⚙ | Destination |
|---|---|---|
| LOOT      | 0.30 | treasuries of towns/wild parcels within `lootRadiusSteps` ⚙ of the spend parcel (weighted by distance; creates warzone gold rushes) |
| LANDYIELD | 0.20 | `enrichment` pool of the spend parcel's neighborhood — yields over time to the CURRENT holder (E3) |
| LORDS     | 0.25 | landlord of the parcel (0.15) + estate/region seat holder (0.10). MVP (no NFT landlords yet): route to the region's richest town treasury + mark `unclaimedLordYield` for future landlord settlement |
| BURN      | 0.20 | destroyed (ledger reason 'burn'); world CT supply shrinks |
| TREASURY  | 0.05 | `system:treasury` account (dev/protocol) |

Invariants: buckets sum EXACTLY to amount (integer math, remainder to BURN); in-world actions
never mint (only cross-game/purchase faucets mint, capped); every split is a ledger entry.

## E2 — Training takes time (the anti-whale wall)

Raising an army becomes a TRAINING QUEUE per territory: pay full cost up-front (through the
splitter), soldiers materialize at `trainRatePerTick ⚙ × (1 + MIL_level × milRateBonus ⚙)`,
per-parcel queue cap ⚙. The army exists immediately as a "mustering" garrison that fills up;
mustering units fight at a penalty ⚙ if attacked (rushing a mustering enemy is valid strategy).
UI: queue progress on parcel card + army card. NPC kingdom uses the same queues.

## E3 — Enrichment (money → contestable yield)

New action `POST /api/enrich {territoryId, amountCt}`: CT (bought or earned) converts to the
parcel's `enrichment` pool (through the splitter — yes, enriching also leaks to neighbors/lords/
burn). The pool pays out `enrichYieldPctPerDay ⚙` of itself per day AS CT to the parcel's
CURRENT governor + raises prosperity while pool > 0. The pool is attached to LAND, not the
payer: conquer the parcel, inherit the remaining pool. Pillaging a parcel loots a share ⚙ of its
enrichment pool. Whale money becomes everyone's incentive to invade.

## E4 — Raze / plunder infrastructure

`POST /api/raze {territoryId, target: track|structureKey}` (governor of the parcel only — you
raze land YOU hold, typically freshly conquered): destroys one development level / structure,
recovers `razeSalvagePct ⚙ (0.40)` of the ORIGINAL invested CT to the razer, burns the rest.
Requires tracking invested-CT per level/structure (`investedCt` on the territory per track).
Pillage (existing) stays the in-battle variant; raze is the deliberate peacetime strip-mining.
Every build→raze cycle nets a burn: the structural sink.

## E5 — Faucet governance

- Cross-game CT earnings: external mint (out of scope here, EF platform).
- $ purchases: `purchaseCapCtPerEpoch ⚙` per account (stub the check; real payments out of scope).
- In-world: pillage/loot/yield/salvage are all REDISTRIBUTION of already-minted CT. Assert via
  a conservation test: sum(all wallets + all territory treasuries + all enrichment pools +
  cumulative burn + treasury) is constant across any tick window with no external mint.

## Economy telemetry (build with it, not after)

`GET /api/economy` (public): world CT supply, cumulative burned, faucet volume, top sinks by
reason, warzone heatmap data (loot bucket flows by region). The balance team cannot tune what
it cannot see.

## Client surface (phase 2)

Training queue UI, enrich action + pool/yield display on parcel card, raze UI with salvage
preview, economy dashboard page (or rail section), tips: `training` (first queue), `enrich`,
`raze`. March preview: mustering-penalty warning when attacking/being caught mid-muster.

## Build order

1. Sim/server (worktree): E1 splitter refactor of ALL existing sinks + E2 queues + E3 enrich +
   E4 raze + E5 caps/conservation test + /api/economy. Heavy test coverage — the conservation
   invariant is the most important test in the codebase.
2. Client phase: the UI surface above.
3. docs/02-economy.md §12 canon summary (orchestrator, with this brief as source).
