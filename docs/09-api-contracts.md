# 09 — API Contracts

> REST + WebSocket + internal event-bus contracts for Clash Front. Every schema, ID prefix, enum,
> and constant referenced here is canon from [`08-data-models.md`](./08-data-models.md) — this doc
> **never redefines types**, it specifies how they cross the wire. Fog-of-war filtering rules come
> from [`01-world-simulation.md` §9](./01-world-simulation.md); battle handoff semantics from
> [`04-battle-system.md`](./04-battle-system.md); service boundaries from
> [`07-backend-architecture.md`](./07-backend-architecture.md).

The API is a thin, validated **order-submission layer**. The tick engine is the only writer of sim
state (see [`01-world-simulation.md` §6](./01-world-simulation.md)): mutating endpoints do not apply
effects synchronously — they validate, enqueue an order, and return the order plus the tick at which
it takes effect. Reads are served from the Redis hot state / Postgres, always through the caller's
fog-of-war overlay.

---

## 1. Conventions

### 1.1 Base URL & versioning

```
https://api.clashfront.etherfantasy.com/v1
```

- Path-versioned (`/v1`). Breaking changes ⇒ `/v2`; additive fields are non-breaking (clients MUST
  ignore unknown fields).
- All bodies are JSON, UTF-8. Timestamps: UTC epoch ms (`bigint`, canon §1). CT amounts: integer
  `ct_units` (`CT_UNITS_PER_CT = 10_000`) — **never floats**.
- All entity IDs are the canonical prefixed ULIDs: `player_…`, `hero_…`, `terr_…`, `army_…`,
  `battle_…`, `nft_…`, `hex_…`.

### 1.2 Auth

Two-layer identity, matching `Player` in canon:

1. **Session token** — `Authorization: Bearer <ef-session-jwt>` issued by the shared EF identity
   service (same SSO across EF Mobile / Hunt / MOBA / Clash Front). Claims include `playerId` and
   `efMobaProfileId` links.
2. **Wallet-linked identity** — optional but required for NFT/CT settlement endpoints. Linking is a
   one-time SIWE (Sign-In-With-Ethereum) challenge that binds `Player.walletAddress`. Endpoints that
   move on-chain assets additionally require a fresh wallet signature in the request.

Internal (service-to-service and EF MOBA) calls use mTLS + HMAC request signing
(`X-EF-Signature: sha256=…` over method+path+body+timestamp), never session tokens.

### 1.3 Error envelope

Every non-2xx response:

```json
{
  "error": {
    "code": "INSUFFICIENT_CT",
    "message": "Development requires 5000000 ct_units; treasury has 1200000.",
    "details": { "requiredCt": 5000000, "availableCt": 1200000 },
    "retryable": false,
    "requestId": "req_01J9ZC5N8Q"
  }
}
```

Canonical codes (extend, don't rename): `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
`NOT_VISIBLE` (fog of war — indistinguishable from `NOT_FOUND` for army-scoped resources),
`VALIDATION_FAILED`, `INSUFFICIENT_CT`, `INSUFFICIENT_FOOD`, `INSUFFICIENT_POPULATION`,
`VERSION_CONFLICT` (optimistic-concurrency `version` mismatch), `ILLEGAL_PATH`, `NOT_GOVERNOR`,
`NOT_LANDLORD`, `BATTLE_LOBBY_CLOSED`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`.

### 1.4 Pagination

Cursor-based on ULID ordering: request `?limit=50&cursor=<opaque>`; response envelope
`{ "items": […], "nextCursor": "…" | null }`. Max `limit` 200.

### 1.5 Idempotency keys

**Mandatory** on every CT-moving or battle-result-writing request (marked ⚿ below); optional
elsewhere. Client sends `Idempotency-Key: <uuid>`; the server stores `(key, playerId/serviceId)` →
response for 48 h. Replay with the same key returns the stored response (`Idempotency-Replayed:
true`); same key with a different body ⇒ `409 IDEMPOTENCY_CONFLICT`. This is what makes
at-least-once delivery safe against invariant 1 (CT conservation) — a retried "develop" or
"battle result" can never double-spend or double-post the ledger.

### 1.6 Rate limits

Token buckets per player per group, surfaced via `X-RateLimit-Remaining` / `Retry-After` on 429:

| Group | Limit |
|---|---|
| Reads (world/map) | 600/min |
| Orders (army, territory) | 60/min |
| CT-moving (⚿) | 20/min |
| WebSocket subscriptions | 100 concurrent channels |

---

## 2. Player-facing REST endpoints

Column key: **Req** = key request fields, **Res** = key response fields. Errors listed are the
notable ones beyond the universal set. Mutations return `202 Accepted` with an `order` object
(`{ orderId, state: 'QUEUED', effectiveTick }`) unless noted; reads return `200`.

### 2.1 Account / Identity

| Endpoint | Purpose | Req | Res | Errors |
|---|---|---|---|---|
| `POST /v1/auth/wallet/link` | Bind wallet via SIWE challenge | `walletAddress`, `signature`, `nonce` | updated `Player` | `VALIDATION_FAILED` (bad sig), `409` wallet already linked |
| `GET /v1/me` | Current `Player` + heroes | — | `Player`, `Hero[]`, active `guildId` | — |
| `GET /v1/me/ct-balance` | CT balance **read from ledger** (authoritative), not the mirrored `Player.ctBalance` | — | `{ balanceCt, asOfLedgerId, pendingCt }` | — |
| `GET /v1/me/ledger` | Own `LedgerEntry` history | `cursor`, `reason?` filter | `LedgerEntry[]` (paginated) | — |

### 2.2 World / Map

All map reads are filtered through the caller's governor **fog-of-war overlay**
([`01-world-simulation.md` §9](./01-world-simulation.md)): always-public fields (terrain, territory
names, `zoneType`, `governorId`, listings, declared wars) are returned live; scout-gated fields
(army stacks, `foodStock`, morale, development, supply trains) are returned **only inside vision**,
otherwise as stale intel stamped `lastSeenTick` with `stale: true`, or omitted entirely. The API
never leaks live out-of-vision data.

| Endpoint | Purpose | Req | Res | Errors |
|---|---|---|---|---|
| `GET /v1/world` | World snapshot header | — | `World` (`id`,`tick`,`seed` omitted), region index, season | — |
| `GET /v1/regions/{regionId}` | Region + its territories (public fields) | — | `Region`, `Territory[]` (public projection) | `NOT_FOUND` |
| `GET /v1/territories/{terrId}` | Territory detail | — | full `Territory` if governor/inside vision; public projection + `lastSeenTick` otherwise | `NOT_FOUND` |
| `GET /v1/map/hexes` | Hex window | `q0,r0,q1,r1` bbox (≤ 4096 hexes) | `Hex[]`, visible `Army` positions (coarse size bands at range per §9), `visionTick` | `VALIDATION_FAILED` (bbox too big) |
| `GET /v1/map/armies/{armyId}` | Army detail | — | own army: full `Army`; hostile in vision: position + heading + size band; else `NOT_FOUND` | `NOT_FOUND`/`NOT_VISIBLE` |

### 2.3 Territory / Governance

Caller must be the territory's `governorId` (or an authorized guild/alliance officer) ⇒ else
`NOT_GOVERNOR`. All spends debit `Territory.ctTreasury` via `LedgerEntry` and are ⚿ idempotent.

| Endpoint | Purpose | Req | Res | Errors |
|---|---|---|---|---|
| `POST /v1/territories/{terrId}/develop` ⚿ | Raise one `DevelopmentTrack` one level | `track`, `expectedVersion` | order + `costCt`, `completesAtTick`, new level | `INSUFFICIENT_CT`, `VERSION_CONFLICT`, `422` max level |
| `POST /v1/territories/{terrId}/repair` ⚿ | Repair `StructureState.hp` | `structureKey`, `expectedVersion` | order + `costCt` | `INSUFFICIENT_CT`, `422` under siege |
| `PUT /v1/territories/{terrId}/tax-rate` | Set tax rate (bounds in `balance.json`) | `taxRatePct` | updated projection | `VALIDATION_FAILED` |
| `POST /v1/territories/{terrId}/raise-army` ⚿ | Convert population → new `Army` at seat hex | `units: UnitStack[]` (classes+counts), `heroId?` | new `Army` (state `GARRISON`), `costCt`, pop delta | `INSUFFICIENT_POPULATION`, `INSUFFICIENT_CT`, `422` MILITARY track cap |
| `POST /v1/territories/{terrId}/garrison` | Assign an owned army as `garrisonArmyId` | `armyId` | order | `422` army not at seat hex |

### 2.4 Army / Movement

Caller must be `Army.ownerGovernorId` (or delegated officer). Movement orders are validated against
path legality (adjacency, passability — [`01-world-simulation.md` §3](./01-world-simulation.md))
and applied in tick phase 3. **Every movement response returns `arrivalTick`** (final-destination
ETA) plus `perStepTicks` so clients can render the march.

| Endpoint | Purpose | Req | Res | Errors |
|---|---|---|---|---|
| `POST /v1/armies` ⚿ | Create army from garrison troops | `terrId`, `units`, `heroId?` | `Army` | `422` insufficient garrison |
| `POST /v1/armies/{armyId}/march` | Issue march order along a path | `path: hexId[]`, `expectedVersion` | order + `arrivalTick`, `perStepTicks[]` | `ILLEGAL_PATH`, `VERSION_CONFLICT`, `422` state `ENGAGED` |
| `POST /v1/armies/{armyId}/split` | Split stacks into a new army | `units: UnitStack[]` subset | both `Army` objects | `422` would empty source |
| `POST /v1/armies/{armyId}/merge` | Merge co-located friendly army in | `sourceArmyId` | merged `Army` | `422` not co-located |
| `PUT /v1/armies/{armyId}/hero` | Attach/detach leading `Hero` | `heroId \| null` | updated `Army` | `422` hero engaged elsewhere |
| `POST /v1/armies/{armyId}/recall` | Auto-path home to nearest friendly `supplySource` | — | order + `arrivalTick` | `422` no reachable friendly source |
| `POST /v1/armies/{armyId}/disband` | Disband (state `DISBANDED`; troops return to pop if at friendly territory) | `expectedVersion` | order | `422` state `ENGAGED` |

**Example — march order (the core verb of the game):**

```http
POST /v1/armies/army_01J9ZD3FA9/march
Authorization: Bearer <jwt>
Content-Type: application/json

{ "path": ["hex_01J9Z001", "hex_01J9Z002", "hex_01J9Z003"], "expectedVersion": 17 }
```

```json
{
  "order": { "orderId": "order_01J9ZD4K2M", "state": "QUEUED", "effectiveTick": 184203 },
  "army": { "id": "army_01J9ZD3FA9", "state": "MARCHING", "hexId": "hex_01J9Z000",
            "path": ["hex_01J9Z001", "hex_01J9Z002", "hex_01J9Z003"],
            "arrivalTick": 184248, "version": 18 },
  "perStepTicks": [15, 8, 22],
  "arrivalTick": 184248
}
```

### 2.5 Battle

Battle listing is fog-filtered: a player sees a `BattleInstance` lobby only if a governor they can
fight for has vision of its hex, or they are already a participant. Join windows and side
assignment rules are defined in [`04-battle-system.md`](./04-battle-system.md).

| Endpoint | Purpose | Req | Res | Errors |
|---|---|---|---|---|
| `GET /v1/battles?joinable=true` | Battles I can join | `cursor` | `BattleInstance[]` projections (`type`,`state`,`hexId`,`lobbyClosesAt`, side strengths as bands) | — |
| `GET /v1/battles/{battleId}` | Battle detail (participant or in-vision) | — | `BattleInstance` incl. `participants`, `warScore` when resolved | `NOT_FOUND` |
| `POST /v1/battles/{battleId}/join` ⚿ | Join/reinforce as hero (`BattleParticipant`) | `heroId`, `side` (`ATTACKER\|DEFENDER`) | `BattleParticipant`, assigned `side`, `efMobaMatchId?` if `LIVE` | `BATTLE_LOBBY_CLOSED`, `422` side not eligible (diplomacy), `422` hero already committed |
| `PUT /v1/battles/{battleId}/resolution-mode` | Choose `ResolutionMode` for **my participation** (`AUTO` ⇒ my hero is AI-simulated) | `heroId`, `mode: ResolutionMode` | updated participant | `422` battle already `RUNNING` |
| `POST /v1/battles/{battleId}/post-victory` ⚿ | Winning governor's `PostVictoryAction` — once, winner only (invariant 10) | `action: 'PILLAGE' \| 'OCCUPY'` | order + projected `lootCt` / `territoryOutcome` | `FORBIDDEN` (not winner), `409` already chosen |

**Example — join battle:**

```http
POST /v1/battles/battle_01J9ZE8Q4T/join
Idempotency-Key: 9f2c1e7a-…
{ "heroId": "hero_01J9Z9AA01", "side": "DEFENDER" }
```

```json
{
  "participant": { "playerId": "player_01J9Z8XX01", "heroId": "hero_01J9Z9AA01",
                   "side": "DEFENDER", "joinedTick": 184210, "role": "HERO" },
  "battle": { "id": "battle_01J9ZE8Q4T", "type": "SIEGE", "state": "LOBBY",
              "resolutionMode": "LIVE", "lobbyClosesAt": 1782950400000,
              "efMobaMatchId": null },
  "liveHandoff": { "expected": true, "connectVia": "EF MOBA client, match issued at lobby close" }
}
```

### 2.6 Economy / NFT

All ⚿. Wallet-linked identity required for buy/sell/lease.

| Endpoint | Purpose | Req | Res | Errors |
|---|---|---|---|---|
| `GET /v1/market/land` | Land NFTs for sale | filters: `regionId`, `zoneType`, price range | `LandNFT[]` + public `Territory` projection (`prosperity`, tax history summary) | — |
| `POST /v1/market/land/{nftId}/buy` ⚿ | Buy listed land | `maxPriceCt` (slippage guard) | `LandNFT` (new `ownerPlayerId`), `LedgerEntry` ref | `INSUFFICIENT_CT`, `409` already sold, `422` price > `maxPriceCt` |
| `PUT /v1/market/land/{nftId}/listing` | List/delist own NFT | `priceCt \| null` | updated `LandNFT` | `NOT_LANDLORD` |
| `POST /v1/market/land/{nftId}/lease` ⚿ | Create `Lease` to a governor | `lesseeGovernorId`, `rentCtPerDay`, `revenueSharePct`, `endAt` | `Lease` | `NOT_LANDLORD`, `409` active lease |
| `GET /v1/territories/{terrId}/tax-splits` | Effective tax split (landlord/governor/lease) | — | `{ taxSplitLandlord, lease?, last7dTaxCt }` | — |
| `GET /v1/me/ledger` | (see 2.1) full CT history incl. tax, pillage, bounty | — | `LedgerEntry[]` | — |

**Example — buy land:**

```http
POST /v1/market/land/nft_01J9ZF2H8B/buy
Idempotency-Key: 41d0b3c9-…
{ "maxPriceCt": 250000000 }
```

```json
{
  "nft": { "id": "nft_01J9ZF2H8B", "territoryId": "terr_01J9Z6QQ07",
           "ownerPlayerId": "player_01J9Z8XX01",
           "taxSplitLandlord": 0.30, "listedForSalePriceCt": null },
  "ledgerEntryId": "ledger_01J9ZF3M1C",
  "paidCt": 240000000,
  "note": "Ownership ≠ control: governorId of terr_01J9Z6QQ07 is unchanged."
}
```

### 2.7 Diplomacy / Contracts

Governor-scoped (player, guild officer, or alliance officer acting for `governorId`).

| Endpoint | Purpose | Req | Res | Errors |
|---|---|---|---|---|
| `POST /v1/diplomacy/proposals` | Propose stance change (`ALLIED`, `TRUCE`, `VASSAL_OF`, …) | `targetGovernorId`, `stance: DiplomacyStance`, `expiresAt?`, `tributeCtPerDay?` | proposal object | `422` illegal transition (e.g. TRUCE while not at WAR) |
| `POST /v1/diplomacy/proposals/{id}/accept` | Accept ⇒ creates/updates `DiplomacyRelation` | — | `DiplomacyRelation` | `409` expired/withdrawn |
| `GET /v1/diplomacy/relations` | My governor's relations | — | `DiplomacyRelation[]` | — |
| `POST /v1/contracts` ⚿ | Post `Contract` (escrows `rewardCt`) | `type: ContractType`, `targetRef?`, `rewardCt`, `expiresAt` | `Contract` (state `OPEN`) | `INSUFFICIENT_CT` |
| `POST /v1/contracts/{id}/take` | Take an open contract | — | `Contract` (state `TAKEN`, `takerId`) | `409` not `OPEN` |
| `POST /v1/contracts/{id}/fulfill` ⚿ | Claim fulfillment (server verifies via event history) | `evidenceRef?` (battleId etc.) | `Contract` (`FULFILLED`), ledger payout ref | `422` conditions unmet |

**Example — develop territory (CT-moving, idempotent):**

```http
POST /v1/territories/terr_01J9Z6QQ07/develop
Idempotency-Key: 7be4a2d1-…
{ "track": "AGRICULTURE", "expectedVersion": 42 }
```

```json
{
  "order": { "orderId": "order_01J9ZG1P6W", "state": "QUEUED", "effectiveTick": 184204 },
  "costCt": 5000000,
  "track": "AGRICULTURE",
  "fromLevel": 2, "toLevel": 3,
  "completesAtTick": 184324,
  "treasuryAfterCt": 7200000
}
```

---

## 3. WebSocket real-time API

```
wss://ws.clashfront.etherfantasy.com/v1
```

**Connect & auth:** first frame within 5 s must be
`{ "op": "AUTH", "token": "<ef-session-jwt>" }` → `{ "op": "AUTH_ACK", "playerId": …,
"worldTick": … }`. Heartbeat `PING`/`PONG` every 30 s; missed ×2 ⇒ disconnect.

**Channel model** — explicit subscribe, fog-filtered per subscriber at fan-out time:

| Channel | Scope | Carries |
|---|---|---|
| `region:{regionId}` | per-region | `army.moved`, `battle.spawned`, `territory.updated`, `supply.broken` for entities **in the subscriber's vision** within that region |
| `player:{playerId}` | own (implicit, auto-subscribed) | ledger credits, order state changes, contract/diplomacy events addressed to you |
| `battle:{battleId}` | per-battle-lobby | `battle.lobby.open`, participant joins, lobby countdown, resolution |
| `world` | global | `tax.tick` summary, season change, declared wars |

`{ "op": "SUB", "channel": "region:region_01J9Z100" }` → `SUB_ACK` including a **snapshot**, then
**deltas**. Every push carries the `tick` it was computed at; clients reconcile by discarding
messages with `tick <` their snapshot tick.

**Message types pushed:** `army.moved`, `battle.spawned`, `battle.lobby.open`, `tax.tick`,
`territory.updated`, `supply.broken`, `diplomacy.changed`.

**Example — snapshot (`SUB_ACK` for a region):**

```json
{
  "op": "SUB_ACK", "channel": "region:region_01J9Z100", "tick": 184203,
  "snapshot": {
    "territories": [ { "id": "terr_01J9Z6QQ07", "zoneType": "TOWN",
                       "governorId": "player_01J9Z8XX01", "prosperity": 61 } ],
    "visibleArmies": [ { "id": "army_01J9ZD3FA9", "hexId": "hex_01J9Z000",
                         "sizeBand": "500-1000", "heading": "hex_01J9Z001" } ]
  }
}
```

**Example — delta pushes:**

```json
{ "op": "EVENT", "channel": "region:region_01J9Z100", "type": "army.moved", "tick": 184218,
  "data": { "armyId": "army_01J9ZD3FA9", "fromHexId": "hex_01J9Z000",
            "toHexId": "hex_01J9Z001", "nextArrivalTick": 184226 } }

{ "op": "EVENT", "channel": "player:player_01J9Z8XX01", "type": "supply.broken", "tick": 184230,
  "data": { "armyId": "army_01J9ZD3FA9", "supply": 0,
            "penalty": 0.35, "moralePerTick": -1 } }
```

---

## 4. Internal event bus (service-to-service)

Kafka/NATS domain events (canon storage table, [`08-data-models.md` §6](./08-data-models.md)),
emitted by the tick engine and services at the end of each tick phase
([`07-backend-architecture.md`](./07-backend-architecture.md)). Envelope:
`{ eventId, topic, tick, ts, worldId, payload, causationId? }`. Events are the **replayable world
history**; consumers must be idempotent on `eventId`. These streams drive the AI planners
([`06-ai-architecture.md`](./06-ai-architecture.md)) and analytics; the WS gateway derives player
pushes (§3) from them after fog filtering.

| Topic | Emitted by | Payload core | Consumers |
|---|---|---|---|
| `world.TickCompleted` | tick engine | `tick`, phase timings | AI, ops |
| `territory.TerritoryDeveloped` | territory svc (phase 1) | `terrId`, `track`, `newLevel`, `costCt` | AI, analytics, WS |
| `territory.TerritoryPillaged` / `TerritoryOccupied` | battle svc | `terrId`, `battleId`, deltas | economy, AI, WS |
| `territory.TerritoryAbandoned` | territory svc (player order) | `terrId`, `governorId` (releasing governor) | AI, analytics, WS (public — ownership is never fogged) |
| `army.ArmyArrived` | movement (phase 3) | `armyId`, `hexId`, `finalDestination: bool` | battle scheduler, AI |
| `army.SupplyBroken` / `SupplyRestored` | supply (phase 4) | `armyId`, `supply` | AI, WS |
| `battle.BattleScheduled` | battle spawn (phase 7) | `BattleInstance` projection | EF MOBA allocator, WS |
| `battle.BattleResolved` | battle svc | `battleId`, `BattleResult`, `WarScore` | territory svc, economy, contracts (fulfillment checks), AI |
| `economy.LedgerPosted` | ledger svc | `LedgerEntry` | balance mirrors, analytics, chain anchor |
| `economy.TaxCollected` | economy (phase 1) | `terrId`, `taxCt`, split refs | WS `tax.tick` |
| `nft.NFTTransferred` / `nft.LeaseChanged` | market svc | `nftId`, `from`, `to`, `priceCt` | tax router, chain settlement |
| `diplomacy.StanceChanged` | diplomacy svc | `DiplomacyRelation` | supply graph (§5.2 of 01), AI, WS |

---

## 5. EF MOBA integration contract (LIVE battles)

Server-to-server only: mTLS + HMAC signing (§1.2). Never callable with a player session. Flow per
[`04-battle-system.md`](./04-battle-system.md): lobby closes → Clash Front requests allocation →
EF MOBA runs the match (authoritative during `RUNNING`) → posts the result callback → tick phase 7
maps it into `WarScore`/`BattleResult`.

**Allocation request** — `POST {efmoba}/internal/v1/matches/allocate` ⚿
(`Idempotency-Key = battleId` — one match per battle, ever):

```json
{
  "battleId": "battle_01J9ZE8Q4T",
  "type": "SIEGE",
  "terrain": { "hexTerrain": "HILLS", "structures": [ { "key": "walls", "level": 3, "hp": 74 } ] },
  "sides": {
    "ATTACKER": { "armies": [ { "armyId": "army_01J9ZD3FA9",
        "units": [ { "unitClass": "INFANTRY", "count": 800, "veterancy": 1, "hp": 92 } ],
        "supply": 0, "morale": 41 } ],
      "heroes": [ { "heroId": "hero_01J9Z9BB02", "efMobaProfileId": "efm_88123",
                    "equipmentIds": ["eq_x"], "resolutionMode": "LIVE" } ] },
    "DEFENDER": { "armies": ["…"], "heroes": ["…"] }
  },
  "modifiers": { "supplyBreakPenalty": { "ATTACKER": 0.35 }, "heroImpactMax": 0.20 },
  "stakes": { "defenderTerritoryId": "terr_01J9Z6QQ07", "postVictoryOptions": ["PILLAGE", "OCCUPY"] },
  "callbackUrl": "https://api.clashfront.etherfantasy.com/internal/v1/battles/battle_01J9ZE8Q4T/result"
}
```

Response: `{ "efMobaMatchId": "efm_match_01J9ZH…", "joinDeadline": 1782950520000 }` — stored on the
`BattleInstance`. AUTO-mode participants are simulated by EF MOBA bots inside the same match.

**Result callback** — `POST /internal/v1/battles/{battleId}/result` ⚿
(`Idempotency-Key = efMobaMatchId`; signed; replays return the stored ack):

```json
{
  "efMobaMatchId": "efm_match_01J9ZH…",
  "winner": "DEFENDER",
  "heroContributions": [
    { "heroId": "hero_01J9Z9AA01", "side": "DEFENDER", "rawImpact": 0.31, "kills": 9, "objectives": 2 }
  ],
  "casualties": { "army_01J9ZD3FA9": 412, "army_01J9ZDGG02": 120 },
  "structureDamage": [ { "key": "walls", "hpDelta": -30 } ],
  "durationMs": 1260000
}
```

Clash Front — not EF MOBA — computes the final `WarScore` (clamping each `rawImpact` to
`HERO_IMPACT_MAX = 0.20`, invariant 4; applying supply/morale/terrain terms) and writes
`BattleResult`. Casualties/loot post to the ledger exactly once via the idempotency key. Unknown
`battleId`, mismatched match id, or a second callback with a different body ⇒ `409` and an ops page
— battle results are never silently overwritten.

---

## 6. Chain / NFT settlement (minimal)

On-chain is a **settlement layer**, not the source of gameplay truth (canon §6: periodic anchoring,
not per-tick). All ⚿, wallet signature required, internal signing for callbacks.

| Endpoint | Purpose |
|---|---|
| `POST /v1/chain/land/{nftId}/mint` ⚿ | Mint the Land NFT on-chain for its `territoryId`; response returns `{ chainId, contract, tokenId, txHash }`, mirrored onto `LandNFT`. One mint per NFT ever (`Idempotency-Key = nftId`). |
| `POST /v1/chain/ct/withdraw` ⚿ | Anchor CT out to the wallet: posts `LedgerEntry` (`reason:'mint'`-conserving burn to `system:treasury` bridge account) then submits tx. |
| `POST /internal/v1/chain/callbacks/tx` ⚿ | Chain watcher callback: confirms/reverts pending mint/withdraw/transfer by `txHash`; on-chain transfer of a Land NFT updates `LandNFT.ownerPlayerId` (governor untouched — invariant 3). |

Off-chain trades (§2.6) settle instantly in the ledger; the chain mirror follows asynchronously via
`nft.NFTTransferred`.

---

## 7. EF Masters API (DEPLOYED — games-etherfantasy-backend)

> Canon 2026-07: **Masters are the RoTK generals** players command (owned or rented character NFTs)
> — see README glossary and the `Hero` mirror schema in [`08-data-models.md`](./08-data-models.md).
> These endpoints are **live on `api.etherfantasy.com`** and are the authoritative character source.
> Clash Front is a CONSUMER: it mirrors rosters and reports battle results; it never mutates
> ownership. (Product page: https://etherfantasy.com/masters)

| # | Endpoint | Method | Status | Clash Front usage |
|---|----------|--------|--------|-------------------|
| 1 | `/api/character/minted?owner={wallet}` | GET | ✅ live | Full character inventory for a wallet (onboarding sync). |
| 2 | `/api/gameplay/masters/active/{wallet}` | GET | ✅ live | **Roster sync** — the Masters a player can currently command (owned + unexpired rentals). Refresh on login, army-officer attach, and battle join. |
| 3 | `/api/gameplay/masters/ko/{masterId}` | GET | ✅ live | **KO gate** — checked before a Master may lead an army or join a `BattleInstance`. |
| 4 | `/api/gameplay/masters/result` | POST | ✅ live | **Result report** — Battle Orchestration posts each participating Master's outcome (incl. KO events) at `RESOLVED`. |
| 5 | `/api/gameplay/masters/revive` | POST | ✅ live | Player-initiated revive (limited uses); Clash Front proxies the action from the overworld UI. |

Sample payloads (as deployed):

```jsonc
// GET /api/gameplay/masters/active/{wallet}
{ "wallet": "0x61c8…35d09", "masters": [
  { "masterId": 3001, "tokenId": 52, "name": "Choco", "slug": "choco",
    "joinChance": 28, "alive": true, "koUntil": null,
    "source": "rented", "rentalExpires": "2026-07-31T09:31:50.000Z" } ] }

// GET /api/gameplay/masters/ko/{masterId}
{ "masterId": "3001", "isKO": false, "koUntil": null, "ko_total_count": 0,
  "revivesUsed": 0, "revivesRemaining": 2, "nextReviveAvailableAt": null }
```

**Integration rules:**
1. **Roster is externally owned.** `source`, `rentalExpires`, KO and revive state come from this API;
   Clash Front caches with a short TTL and re-validates at every gameplay gate (attach/join/revive).
2. **Rental expiry** (`rentalExpires` past) ⇒ the Master immediately detaches as army officer
   (army becomes AI-led, [`03-military.md`](./03-military.md) §5) and is barred from new battles.
3. **KO flow:** a Master KO'd inside a battle is reported via endpoint 4; while `koUntil` is in the
   future the Master cannot officer or join (endpoint 3 is the gate). Revives (endpoint 5) are
   limited (`revivesRemaining`) — a real strategic resource, exactly like losing a general in RoTK.
4. ❓ OPEN: exact `joinChance` semantics (availability roll when a battle spawns vs. per-wave);
   confirm with product owner + backend code once repo access lands.
5. ❓ OPEN: full character list & attributes — incoming from product owner; will extend the
   `Hero` mirror schema (do NOT invent stats).

---

## Cross-references

- [`README.md`](./README.md) — canon glossary, pillars, `HERO_IMPACT_MAX` firewall
- [`08-data-models.md`](./08-data-models.md) — every schema, enum, ID prefix, constant, and invariant used above
- [`01-world-simulation.md`](./01-world-simulation.md) — tick phases orders land in; path legality; fog-of-war rules enforced at this boundary (§9)
- [`02-economy.md`](./02-economy.md) — tax, prosperity, development costs behind §2.3/§2.6
- [`03-military.md`](./03-military.md) — unit raising, upkeep behind §2.3/§2.4
- [`04-battle-system.md`](./04-battle-system.md) — lobby windows, side assignment, WarScore mapping for §2.5/§5
- [`06-ai-architecture.md`](./06-ai-architecture.md) — AI consumers of the event bus (§4)
- [`07-backend-architecture.md`](./07-backend-architecture.md) — services emitting these events, tick engine, consistency model
