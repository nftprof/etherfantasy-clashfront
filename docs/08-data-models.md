# 08 — Data Models (Canon)

> Single source of truth for schemas, IDs, enums, and invariants. Types are shown in TypeScript for
> agent legibility; the storage layer is Postgres (relational core) + Redis (hot state) per
> [`07-backend-architecture.md`](./07-backend-architecture.md). **Do not invent fields** — extend here first.

All numeric currency/resource amounts are stored as **integers in base units** (no floats for money).
CT uses 4 decimals → store as integer "milliCarats×10" (`ct_units`, 1 CT = 10_000 units). Food,
Population, Supply are whole integers. Prosperity/Morale are integers 0–100.

---

## 1. IDs & conventions

- All entity IDs are ULIDs (sortable) prefixed by type: `player_…`, `hero_…`, `terr_…`, `army_…`, `battle_…`, `nft_…`, `hex_…`.
- Timestamps are UTC epoch milliseconds (`bigint`).
- `version` (integer) on every mutable simulated entity for optimistic concurrency.
- Soft-delete via `deleted_at` where relevant; the world never hard-deletes territories.
- On-chain references use `chain_id` + `contract` + `token_id` (EVM-compatible; chain-agnostic).

---

## 2. Canonical constants

```ts
export const CONSTANTS = {
  HERO_IMPACT_MAX: 0.20,        // max fraction of combat power a hero can contribute
  TICK_SECONDS: 60,             // world sim tick
  BATTLE_TICK_MS: 100,          // live battle server tick (EF MOBA owns this)
  TRAVEL_ADJACENT_MIN: 15,
  TRAVEL_REGION_HOURS: 3,
  TRAVEL_OCEAN_HOURS: 12,
  PROSPERITY_MIN: 0, PROSPERITY_MAX: 100,
  MORALE_MIN: 0, MORALE_MAX: 100,
  SUPPLY_MAX_DEFAULT: 100,
  SUPPLY_BREAK_PENALTY: 0.35,   // combat power lost when supply cut
  LAUNCH_NPC_TERRITORY_PCT: 0.95,
  TAX_SPLIT_LANDLORD_DEFAULT: 0.30, // landlord share of tax before leases
  PILLAGE_INFRA_LOSS: 0.50,     // fraction of development destroyed on pillage
  PILLAGE_POP_LOSS: 0.25,
  REBELLION_FOOD_THRESHOLD: 0,  // food stock at/below → rebellion risk rises
  DESERTION_MORALE_THRESHOLD: 25,
  CT_UNITS_PER_CT: 10_000,
} as const;
```

> ❓ OPEN: exact numeric tuning (travel multipliers, yield curves) is Economy/Sim owned and lives in a
> `balance.json` config, versioned separately so designers can retune without code changes.

---

## 3. Enums

```ts
export type ZoneType = 'VILLAGE' | 'TOWN' | 'FORTRESS' | 'HARBOR' | 'CAPITAL' | 'WILD' | 'SEA';
export type HexTerrain = 'PLAINS' | 'FOREST' | 'HILLS' | 'MOUNTAIN' | 'RIVER' | 'COAST' | 'OCEAN' | 'ROAD';
export type DevelopmentTrack = 'AGRICULTURE' | 'ECONOMY' | 'DEFENSE' | 'MILITARY';
export type GovernorKind = 'PLAYER' | 'GUILD' | 'ALLIANCE' | 'NPC_KINGDOM' | 'SYSTEM';
export type BattleType = 'FIELD' | 'SIEGE' | 'NAVAL';
export type ResolutionMode = 'AUTO' | 'LIVE' | 'ACCELERATED';
export type BattleState = 'SCHEDULED' | 'LOBBY' | 'RUNNING' | 'RESOLVED' | 'CANCELLED';
export type ArmyState = 'GARRISON' | 'MARCHING' | 'ENGAGED' | 'RETREATING' | 'DISBANDED';
export type UnitClass = 'INFANTRY' | 'ARCHER' | 'CAVALRY' | 'SPEAR' | 'SIEGE' | 'MARINE' | 'SHIP';
export type PostVictoryAction = 'PILLAGE' | 'OCCUPY';
export type DiplomacyStance = 'WAR' | 'HOSTILE' | 'NEUTRAL' | 'TRUCE' | 'ALLIED' | 'VASSAL_OF' | 'SUZERAIN_OF';
export type ContractType = 'MERCENARY_DEFEND' | 'MERCENARY_ATTACK' | 'BOUNTY_HERO' | 'ESCORT_SUPPLY' | 'TRADE_LEASE';
```

---

## 4. Core entities

### Player & Hero
```ts
interface Player {
  id: string;                 // player_…
  handle: string;
  walletAddress?: string;     // EVM address for CT / NFTs
  ctBalance: number;          // ct_units, mirrored from ledger (authoritative = ledger)
  heroIds: string[];
  guildId?: string;
  createdAt: number; lastSeenAt: number;
}

interface Hero {
  id: string;                 // hero_…
  ownerPlayerId: string;
  name: string;
  // Clash Front does NOT permanently level heroes. These are equipment/fame, not power creep.
  fame: number;               // reputation; unlocks contracts/titles, cosmetic, soft influence
  equipmentIds: string[];     // affects HeroImpact within HERO_IMPACT_MAX cap only
  efMobaProfileId: string;    // link to EF MOBA account for LIVE battles
  titleIds: string[];
}
```

### World / Region / Territory / Hex
```ts
interface World { id: string; name: string; seed: string; tick: number; startedAt: number; }

interface Region { id: string; worldId: string; name: string; hexIds: string[]; capitalTerritoryId?: string; }

interface Hex {
  id: string;                 // hex_…
  worldId: string;
  q: number; r: number;       // axial coordinates
  terrain: HexTerrain;
  territoryId?: string;       // owning territory (undefined for open sea/wild filler)
  moveCost: number;           // base traversal cost multiplier
  nodeIds: string[];
}

interface Territory {
  id: string;                 // terr_…  (1:1 with Land NFT)
  worldId: string; regionId: string;
  name: string;
  zoneType: ZoneType;
  hexIds: string[];
  landNftId: string;          // nft_…  (ownership / landlord)
  governorId: string;         // controller: player/guild/alliance/npc/system
  governorKind: GovernorKind;
  // resources & state
  population: number;
  foodStock: number;
  ctTreasury: number;         // ct_units held by the territory (governor-controlled)
  prosperity: number;         // 0–100
  morale: number;             // 0–100 (civil morale)
  // development levels per track (0..MAX_DEV_LEVEL)
  development: Record<DevelopmentTrack, number>;
  structures: StructureState[];
  garrisonArmyId?: string;
  supplySource: boolean;      // can this territory originate supply for armies?
  underSiegeBattleId?: string;
  version: number; updatedAt: number;
}

interface StructureState {
  key: string;                // e.g. 'walls','granary','market','barracks'
  track: DevelopmentTrack;
  level: number;
  hp: number; maxHp: number;  // damaged in siege; repaired with CT
}
```

### Land NFT & economy ledger
```ts
interface LandNFT {
  id: string;                 // nft_…
  territoryId: string;
  chainId?: number; contract?: string; tokenId?: string; // on-chain settlement (optional/mirrored)
  ownerPlayerId?: string;     // undefined ⇒ SYSTEM-owned (buyable)
  leaseId?: string;           // active lease, if any
  taxSplitLandlord: number;   // landlord share of tax (default CONSTANTS.TAX_SPLIT_LANDLORD_DEFAULT)
  listedForSalePriceCt?: number;
}

interface Lease {
  id: string; nftId: string;
  lesseeGovernorId: string;
  rentCtPerDay: number;
  revenueSharePct: number;    // extra cut to lessee of development revenue
  startAt: number; endAt: number;
}

// Append-only, double-entry. This is the AUTHORITATIVE source of CT truth.
interface LedgerEntry {
  id: string; ts: number;
  fromAccount: string;        // 'player_…' | 'terr_…' | 'system:treasury' | 'contract:…'
  toAccount: string;
  amountCt: number;           // ct_units, positive
  reason: string;             // 'tax','build','train','repair','pillage','bounty','lease','trade','mint'
  refId?: string;             // linked battle/contract/order
}
```

### Army / Unit / Supply
```ts
interface Army {
  id: string;                 // army_…
  worldId: string;
  ownerGovernorId: string;
  heroId?: string;            // leading officer (optional; AI-led if absent)
  state: ArmyState;
  hexId: string;              // current position
  path?: string[];            // remaining hexIds when MARCHING
  arrivalTick?: number;       // tick at next hex / destination
  units: UnitStack[];
  supply: number;             // 0..supplyMax
  supplyMax: number;
  morale: number;             // 0–100
  supplyTrainIds: string[];
  version: number;
}

interface UnitStack {
  unitClass: UnitClass;
  count: number;
  veterancy: number;          // 0..3, raises effective strength (soft, within reason)
  hp: number;                 // aggregate condition 0–100
}

interface SupplyTrain {
  id: string; armyId?: string; hexId: string;
  capacity: number; carrying: number; // food/CT ferried
  state: 'IDLE' | 'MOVING' | 'RAIDED';
}
```

### Battle
```ts
interface BattleInstance {
  id: string;                 // battle_…
  worldId: string;
  type: BattleType;
  state: BattleState;
  hexId: string;              // where it happens
  attackerArmyIds: string[];
  defenderArmyIds: string[];
  defenderTerritoryId?: string; // set for SIEGE
  resolutionMode: ResolutionMode;
  scheduledStartTick: number;
  lobbyClosesAt?: number;
  efMobaMatchId?: string;     // set when LIVE handed to EF MOBA
  participants: BattleParticipant[];
  warScore?: WarScore;
  result?: BattleResult;
}

interface BattleParticipant {
  playerId: string; heroId: string; side: 'ATTACKER' | 'DEFENDER';
  joinedTick: number; role: 'HERO';
}

interface WarScore {
  attacker: number; defender: number; // computed aggregate
  breakdown: Record<string, number>;  // 'army','supply','morale','terrain','hero','structures'
}

interface BattleResult {
  winner: 'ATTACKER' | 'DEFENDER' | 'DRAW';
  postVictoryAction?: PostVictoryAction; // chosen by winning governor/player
  casualties: Record<string, number>;    // armyId → units lost
  lootCt?: number;
  territoryOutcome?: 'HELD' | 'OCCUPIED' | 'PILLAGED';
  resolvedTick: number;
}
```

### Diplomacy & contracts
```ts
interface DiplomacyRelation {
  id: string; worldId: string;
  aGovernorId: string; bGovernorId: string;
  stance: DiplomacyStance;
  since: number; expiresAt?: number;     // truces expire
  tributeCtPerDay?: number;              // for VASSAL/SUZERAIN
}

interface Contract {
  id: string; type: ContractType;
  posterGovernorId: string;
  targetRef?: string;                     // territory/hero/hex
  rewardCt: number;
  state: 'OPEN' | 'TAKEN' | 'FULFILLED' | 'EXPIRED';
  takerId?: string; expiresAt: number;
}
```

---

## 5. Invariants (must always hold)

1. **CT conservation:** sum of all account balances derived from `LedgerEntry` equals total minted CT. No CT is created outside a `reason:'mint'` entry.
2. **1 Territory ↔ 1 LandNFT.** Never orphan either side.
3. **Ownership ≠ control:** `LandNFT.ownerPlayerId` and `Territory.governorId` are independent.
4. **Hero cap:** any battle resolution must clamp hero contribution to `HERO_IMPACT_MAX`.
5. **No negative resources:** `population, foodStock, ctTreasury, supply ≥ 0` after every tick.
6. **Prosperity/Morale bounded** to `[0,100]`.
7. **Territories are never hard-deleted**; they change `governorId`/`zoneType` instead.
8. **Army position is a valid hex**; a MARCHING army always has a `path` and `arrivalTick`.
9. **A SIEGE BattleInstance** references exactly one `defenderTerritoryId`.
10. **Only the winning governor/player may choose `PostVictoryAction`**, and only once per resolved battle.

---

## 6. Storage mapping (summary)

| Concern | Store | Notes |
|--------|-------|------|
| Ledger, NFTs, players, heroes, territories (cold) | Postgres | source of truth, ACID |
| Hot territory/army/battle state | Redis (write-through to PG each tick) | fast sim reads |
| Battle live state | EF MOBA battle servers | authoritative during LIVE |
| Event log / analytics | Kafka/NATS → warehouse | replayable world history |
| On-chain settlement | EVM chain | periodic anchoring of CT/NFT, not per-tick |

See [`07-backend-architecture.md`](./07-backend-architecture.md) for the tick engine and consistency model.
