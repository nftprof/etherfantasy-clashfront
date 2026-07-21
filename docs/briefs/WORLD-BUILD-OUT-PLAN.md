# World build-out plan — gap audit + build order

> Owner ask 2026-07-17: "let me know any elements not built for the world —
> let's start building it out fully." This doc = the full gap list, the build
> order, and the coherence rules so new systems don't overlap what exists.
> Companion: `TRANSPORT-DELIVERY-LAYER.md` (the new logistics/delivery spec).

## A. What EXISTS today (do not rebuild)

| System | Where | Status |
|---|---|---|
| Deterministic tick engine (8 phases) | `tick.ts` | ✅ LIVE |
| March + battle spawn + retreat ladder + pincer | `tick.ts`, `demoWorld.ts` | ✅ LIVE |
| Wild battles (live tactical sim) + engine battles (MOBA bridge) | `wildBattle.ts`, `engineBattle.ts` | ✅ LIVE |
| Command mode UX (20 batches) | `apps/server/public/js/battle.js` | ✅ LIVE |
| Fog of war (intel grades) | `intel.ts` | ✅ LIVE |
| Wild raids + town walk-ins | `tick.ts` (F2/F3) | ✅ LIVE |
| Food production (AGRI) + populace eats + enrichment pools + ECON trickle | `tick.ts` phaseProduction | ✅ LIVE (partial) |
| Army provisions (food/gold/wood) + march rations + battle-food | `logistics.ts` | ✅ LIVE |
| Morale (garrison regen / starvation cascade / victory-defeat deltas) | `tick.ts` phaseMorale | ✅ LIVE (partial) |
| Training queues (muster) | `tick.ts` runTraining | ✅ LIVE |
| Development tracks + raze salvage | `develop.ts` | ✅ LIVE |
| Economy container (flow splitter, journal, wallets) | `economy.ts` | ✅ LIVE |
| Hero duels (card v1 + RELEASE/KO) | `duel.ts` | ✅ LIVE |
| Weather Phase 0 (weatherAt + continent cards) | `weather.ts` | ✅ scaffolded |
| Reinforcement queue (Scenario H) | `tick.ts` | ✅ LIVE |
| PG identity + Masters roster gate | `apps/server` | ✅ LIVE |
| Battle review ring + duel review ring | `game.ts` | ✅ LIVE |
| Defense structures (build/repair on buildSpots) | `build.ts` | ✅ LIVE |

## B. GAP LIST — what is NOT built (the build-out)

Ordered by dependency (earlier items unblock later ones).

### Wave 1 — Resource foundation *(prereq for everything below)*
1. **Territory stockpile** — `{wood, iron, stone, rareMetal, fur}` per parcel. Today only foodStock + ctTreasury exist.
2. **Worker pet assignment** — pets assigned to a parcel with a role (MINE / FARM / CRAFT / GUARD). Today pets exist only as canon docs, no sim entity.
3. **Production per role** — MINE fills stockpile (biome-weighted), FARM adds foodStock, fur shedding per species class.
4. **Workshop + arms crafting** — CRAFT workers convert stockpile → arms inventory; elite hire consumes arm + Form 2 gate.

### Wave 2 — Dynamic economy
5. **AMM local markets** — per-parcel constant-product pools, fee spread by enrichment tier, price discovery.
6. **System balancer** — capped invisible arbitrageur (100K gold/hr, 100 trades/hr, ≥30% gaps only).
7. **Enrichment tiers** — the 9-dial tier system (T0-T5); today only the enrichment pool + payout exists, no tiers/caps.
8. **NPC baseline vendors** — fallback fixed-ratio trade at unowned/low-tier parcels (bootstraps the economy before AMM pools are seeded).

### Wave 3 — Transport & delivery *(the new layer — full spec in TRANSPORT-DELIVERY-LAYER.md)*
9. **Caravan entity** — civilian transport unit; carries goods, burns food, travels the parcel graph.
10. **Delivery order board** — request goods at destination by deadline; escrow + penalty fee; open contracts anyone can accept.
11. **Transit fees** — pass fee to warlord-occupied land, bribe fee to wild-occupied land, or fight through.
12. **Caravan raiding** — hostile armies + wild raiders can intercept caravans (cargo = loot).
13. **Ride requests** — move a Master/pet between two cities (passenger transport variant).
14. **Pet delivery contracts** — "deliver 5,000 of pet X at location Y for premium Z" (bulk livestock run).

### Wave 4 — World systems (canon written, sim missing)
15. **Tax cycle** — TAX_CYCLE_TICKS draws populace → treasury (double-entry ledger).
16. **Prosperity target computation** — growth/decay model (today prosperity only nudges from enrichment).
17. **Rebellion phase** — risk = f(morale, food, occupation, tax) → rebel army spawns. Today a stub.
18. **Supply Dijkstra** — real isSupplied over friendly-route graph (today: placeholder supplySource-on-same-hex check).
19. **Granary caps + structure bonuses** — production ceilings per development.
20. **Full desertion model** — DESERTION_RATE per stack below threshold; deserters spawn WILD bandits.
21. **ZoC contest + ambush checks** — movement phase interception rules (01 §3).
22. **Road/sea-lane discounts** — route cost modifiers (01 §4).
23. **Governor lifecycle / wipe** — zero-territories = wipe (armies disband, Masters → EXILE); overgrowth ticking. Canon locked 2026-07-17, not implemented.
24. **Weather Phase 1-2** — allocate-context weather field; WarScore affinity term; moveCost weather modifier; intel visibility scaling.
25. **Mythic reinforcement (CF side)** — NFT ownership check, 10-game cooldown tracker, allocate `mythicSpawn` field, Chronicle inscription on KO.
26. **Elite hire flow (CF side)** — workshop arm consumption + Form 2 species gate (pairs with #4).

### Wave 5 — World flavor (docs locked, sim missing)
27. **The World Remembers** — battle auto-naming, Chronicle feed, monument POIs, first-deed inscriptions.
28. **Towns** — player-ownable ports, markets, inns, no-war windows, treasure hunt.
29. **Singulars in play** — pickup/bind/inscription for the 36 named artifacts.
30. **Estate board battles** — LARGE+ estates as one command-view board with POI 3D battles (decision 22).
31. **Diplomacy** — guild/alliance, stances, contracts (mercenary/bounty/escort/trade-lease).
32. **NPC governor AI** — economy + military + diplomacy AI (today: round-robin develop + naive expand).

## C. Coherence rules (no-overlap contract)

New systems REUSE, never duplicate:

| New system | Must reuse |
|---|---|
| Caravans | The `Army` entity + phaseMovement (a caravan IS an army with `kind:'CARAVAN'`, no combat value, cargo hold). March rations, adjacency graph, arrival events — all existing code paths. |
| Delivery orders | The escrow pattern from command-queue fees (hold CT, refund on cancel, burn share on settle). The pendingChoices map pattern for open contracts. |
| Transit fees | The landlord-tax seam (30% flows) — pass fees route through the same flow splitter into `ctTreasury` + enrichment pools. |
| Caravan raiding | The existing battle-spawn path — a caravan on a hostile hex is just a defenseless army; wild raids (F3) already march at targets. Cargo transfers via the PILLAGE loot path. |
| Stockpile | Extends `Territory` state (like foodStock) — engine container fields, canon docs/08 untouched (same pattern as enrichmentPools). |
| Worker pets | The DemoOfficer assignment pattern (assignedTerritoryId) — pets get `assignedTerritoryId + role`. |
| AMM markets | The ctBalances wallet + economy journal — every trade is a journal entry; fees burn through the existing burn path. |
| Enrichment tiers | The existing enrichmentPools map — tier = f(cumulative pool investment), pure derivation, no new state. |
| Mythic spawns | The engineAllocateContext seam — one optional field; the reinforcement-queue announcement pattern for banners. |
| Wipe | disbandArmy + officer auto-free (game.ts:906) + overgrowth field already on Territory. |

## D. Build order (dependency-sorted)

```
WAVE 1 (this session, starting now)
  1. stockpile fields + serialization
  2. worker pet entity + assignment API
  3. role production in phaseProduction
  4. fur shedding
     └─ unlocks: crafting, AMM seeding, delivery cargo

WAVE 2
  5. workshop + arms crafting + elite gate
  6. AMM pools + trade API + fee tiers
  7. system balancer (new tick sub-phase)
  8. enrichment tier derivation + caps

WAVE 3
  9. caravan entity (Army kind:'CARAVAN')
 10. delivery order board + escrow
 11. transit fees (pass/bribe) in phaseMovement
 12. caravan raid interception
 13. ride + pet-delivery contract variants

WAVE 4 (parallelizable after wave 1)
 14. tax cycle          17. granary caps
 15. prosperity model   18. governor wipe
 16. rebellion risk     19. weather Phase 1-2
 20. mythic CF-side     21. supply Dijkstra

WAVE 5 (feature epics, each its own session)
 22. World Remembers    24. estate boards
 23. towns              25. diplomacy
```

## E. Session log

- 2026-07-17: doc created; wave 1 build started (stockpile + worker pets).
