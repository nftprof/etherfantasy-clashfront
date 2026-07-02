# 08 — Data Models (Canon)

> Single source of truth for schemas, IDs, enums, and invariants. Types are shown in TypeScript for
> agent legibility; the storage layer is Postgres (relational core) + Redis (hot state) per
> [`07-backend-architecture.md`](./07-backend-architecture.md). **Do not invent fields** — extend here first.

All numeric currency/resource amounts are stored as **integers in base units** (no floats for money).
CT uses 4 decimals → store as integer "milliCarats×10" (`ct_units`, 1 CT = 10_000 units). Food,
Population, Supply are whole integers. Prosperity/Morale are integers 0–100.

---

## 1. IDs & conventions

- All entity IDs are ULIDs (sortable) prefixed by type: `player_…`, `hero_…`, `master_…`, `pet_…`, `terr_…`, `army_…`, `battle_…`, `nft_…`, `hex_…`.
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
  ESTATE_MIN_HEXES: 7,          // ❓ OPEN proposal — Territory.hexIds.length ≥ this ⇒ estate battle mode (04 §7b)
  // Officer oversight cap (canon 2026-07, see 01 §11.3): occupation requires an assigned officer.
  MAX_MASTERS_PER_PLAYER: 52,
  MAX_HEROES_PER_PLAYER: 3,
  MAX_OVERSEEN_TERRITORIES: 55, // = MAX_MASTERS + MAX_HEROES; hard cap on simultaneous occupation
  // Rewilding (canon 2026-07, see 01 §11.2) — ⚙ proposals, tune in balance.json:
  REWILD_GRACE_DAYS: 14,        // untrodden days before overgrowth starts
  REWILD_RATE_PER_DAY: 3,       // overgrowth points/day after grace
  // World scale (LOCKED 2026-07-02): 1 engine unit = 1 meter; one SINGLE (L3) parcel = one
  // 240x240m MOBA arena ~= 14.2 acres. Ladder (median polygon area, x SINGLE): SMALL 27.7,
  // MEDIUM 116.7, LARGE 201.5, GIANT 302.5, EPIC 480.3 (~6,800 acres). Whole world ~= 29,900 km2.
  METERS_PER_ENGINE_UNIT: 1,
  ARENA_UNITS: 240,             // battlefield side length in engine units (existing MOBA arena)
  PARCEL_SINGLE_ACRES: 14.2,    // 240m x 240m = 57,600 m2
  // Pets & base-building (canon 2026-07, 04 §7b rule 2b + 05 §9) — ⚙ proposals:
  MAX_PETS_PER_TERRITORY: 3,    // base cap; +1 per PET_DEN level
  PET_RECOVERY_HOURS: 8,        // KO'd pet recovery cooldown
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

### Player, Hero (self identity) & Master (commanded generals)

> Canon (product owner, 2026-07): **Hero = the player's main self-identity** — their own persistent
> character (an EF MOBA avatar: Irene/Kai/Leah roster), **still fully playable** in battles.
> **Masters = the RoTK generals the player commands** (owned/rented character NFTs). Both can lead
> armies as officers and both can be played in a battle; the Hero is *who you are*, Masters are
> *who you command*.

```ts
interface Player {
  id: string;                 // player_…
  handle: string;
  walletAddress?: string;     // EVM address for CT / NFTs
  ctBalance: number;          // ct_units, mirrored from ledger (authoritative = ledger)
  heroIds: string[];          // the player's own self-identity avatar(s)
  masterIds: string[];        // mirror ids of commanded Masters (owned + active rentals)
  guildId?: string;
  createdAt: number; lastSeenAt: number;
}

// The player's SELF — persistent identity avatar. Playable in battles like any officer.
// Clash Front does NOT permanently level Heroes. These are equipment/fame, not power creep.
interface Hero {
  id: string;                 // hero_…
  ownerPlayerId: string;
  name: string;
  avatarSlug: string;         // EF MOBA playable character base (e.g. 'irene','kai','leah' + variant)
  fame: number;               // reputation; unlocks contracts/titles, cosmetic, soft influence
  equipmentIds: string[];     // affects HeroImpact within HERO_IMPACT_MAX cap only
  efMobaProfileId: string;    // link to EF MOBA account for LIVE battles
  titleIds: string[];
}

// A commanded GENERAL — mirror of a Master from the EF platform. AUTHORITATIVE source:
// games-etherfantasy-backend Masters API (09 §7) — Clash Front caches/mirrors, never owns.
interface Master {
  id: string;                 // master_…  (internal mirror id)
  commanderPlayerId: string;  // commanding player (owner OR renter)
  name: string;               // e.g. 'Choco'
  // ---- identity & tenure (from EF Masters API) ----
  masterId: number;           // EF masterId (e.g. 3001)
  tokenId: number;            // character NFT token
  slug: string;               // e.g. 'choco'
  source: 'OWNED' | 'RENTED';
  rentalExpiresAt?: number;   // epoch ms; RENTED only — on expiry the Master detaches everywhere
  joinChance: number;         // % — availability roll to join a spawning battle (❓ OPEN semantics)
  // ---- KO / revive lifecycle (from EF Masters API) ----
  alive: boolean;
  koUntil?: number;           // epoch ms; KO'd Masters cannot lead armies or join battles
  revivesUsed: number;
  revivesRemaining: number;
  nextReviveAvailableAt?: number;
  // ---- Clash Front-side (not in EF API) ----
  fame: number;               // per-Master renown (battles won under this general)
}
```

**Officer references:** fields named `heroId` on `Army`/`BattleParticipant` accept a `hero_…` OR
`master_…` id (prefix-typed ids disambiguate) — an army may be led by your own Hero or by a
commanded Master. `HERO_IMPACT_MAX` applies identically to both.

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
  battleMapId?: string;       // the UNIQUE battle-engine map for battles fought on this hex.
                              // Layer stitch: every overworld hexagon has its own battlefield in
                              // etherfantasy-browser-moba-game; BattleInstance.hexId → this map.
                              // Fighting FOR a territory means fighting ON it (see 04 §handoff).
}

interface Territory {
  id: string;                 // terr_…  (1:1 with Land NFT)
  worldId: string; regionId: string;
  name: string;
  zoneType: ZoneType;
  hexIds: string[];          // 1 (smallest parcel) … ~10,000 (estate). Parcel sizes are PERMANENT
                             // (imported from hexagone-city). isEstate ⇢ hexIds.length ≥ ESTATE_MIN_HEXES;
                             // estates fight as linked per-hex components (04 §7b) and have
                             // pre-designed castle/wall battle maps.
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
  // Oversight & rewilding (01 §11) ————————————————————————————————
  overseerId?: string;        // hero_…|master_… assigned overseer; REQUIRED while occupied by a player.
                              // One officer ⇒ one territory ⇒ MAX_OVERSEEN_TERRITORIES cap.
  lastTroddenTick: number;    // last tick an owner/officer/army touched any hex (or governor acted)
  overgrowth: number;         // 0–100, lazy-computed from lastTroddenTick (01 §11.2); 100 ⇒ WILD
                              // reversion for unowned land; NFT-owned land only overgrows.
  version: number; updatedAt: number;
}

interface StructureState {
  key: string;                // module: 'WALL','TOWER','GATE','TRAP','GRANARY','PET_DEN', or
                              // development-track builds ('granary','market','barracks',…)
  track: DevelopmentTrack;
  level: number;
  hp: number; maxHp: number;  // damaged in siege/base assault; repaired with CT
  anchor?: [number, number];  // player-placed position on the parcel battlefield, normalized 0–1
                              // (CoC layer, 04 §7b rule 2b); absent ⇒ auto-placed by generator
}

// A helper companion (Palworld model, 05 §9). Owned by a player, assignable to an occupied
// territory to GATHER (yield boost) and GUARD (fights raiders on the battlefield).
interface Pet {
  id: string;                 // pet_…
  ownerPlayerId: string;
  dexNumber: number;          // roster number (data/PETS_ROSTER.csv), e.g. 90
  name: string;               // e.g. 'Barkindle'
  element?: string;           // ❓ OPEN — element list pending
  battleReady: boolean;       // cosmetic-only pets gather but cannot guard
  flying: boolean;            // extends territory scouting/vision radius (01 §9)
  assignedTerritoryId?: string; // occupied territory this pet works/guards (cap: MAX_PETS_PER_TERRITORY)
  condition: number;          // 0–100; beaten down in raids — at 0 the pet is KO'd and auto-returns
                              // to the owner's roster (NEVER killed/lost), recovers over cooldown ⚙
  koRecoverAt?: number;       // epoch ms
}
```

### Land NFT & economy ledger
```ts
interface LandNFT {
  id: string;                 // nft_…
  territoryId: string;
  chainId?: number; contract?: string; tokenId?: string; // on-chain settlement (optional/mirrored)
  sourceParcelId?: string;    // hexagone-city parcel id (import provenance — data/parcels.json)
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
