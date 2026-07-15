/**
 * Canonical entity interfaces — verbatim from docs/08-data-models.md §4.
 * Storage notes (Postgres/Redis mapping) live in the doc; this file is the type canon.
 * Do NOT invent fields — extend docs/08 first (AGENTS.md prime directive 2).
 *
 * Conventions (08 §1): ULID ids type-prefixed; timestamps UTC epoch ms; money/resources
 * are integers in base units (CT in ct_units, 1 CT = 10_000 units — never floats for money).
 */
import type {
  ArmyState,
  BattleState,
  BattleType,
  ContractType,
  DevelopmentTrack,
  DiplomacyStance,
  GovernorKind,
  HexTerrain,
  MarchStance,
  PostVictoryAction,
  ResolutionMode,
  UnitClass,
  ZoneType,
} from './enums';

// ── Player & Hero ────────────────────────────────────────────────────────────

export interface Player {
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
export interface Hero {
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
// games-etherfantasy-backend Masters API (docs/09 §7) — Clash Front caches/mirrors, never owns.
// Officer fields (Army.heroId, BattleParticipant.heroId) accept hero_… OR master_… ids.
export interface Master {
  id: string;                 // master_…  (internal mirror id)
  commanderPlayerId: string;  // commanding player (owner OR renter)
  name: string;               // e.g. 'Choco'
  masterId: number;           // EF masterId (e.g. 3001)
  tokenId: number;            // character NFT token
  slug: string;               // e.g. 'choco'
  source: 'OWNED' | 'RENTED';
  rentalExpiresAt?: number;   // epoch ms; RENTED only — on expiry the Master detaches everywhere
  joinChance: number;         // % — availability roll to join a spawning battle (semantics ❓ OPEN)
  alive: boolean;
  koUntil?: number;           // epoch ms; KO'd Masters cannot lead armies or join battles
  revivesUsed: number;
  revivesRemaining: number;
  nextReviveAvailableAt?: number;
  fame: number;               // per-Master renown (battles won under this general)
}

// ── World / Region / Territory / Hex ─────────────────────────────────────────

export interface World { id: string; name: string; seed: string; tick: number; startedAt: number; }

export interface Region { id: string; worldId: string; name: string; hexIds: string[]; capitalTerritoryId?: string; }

export interface Hex {
  id: string;                 // hex_…
  worldId: string;
  q: number; r: number;       // axial coordinates
  terrain: HexTerrain;
  territoryId?: string;       // owning territory (undefined for open sea/wild filler)
  moveCost: number;           // base traversal cost multiplier
  nodeIds: string[];
}

export interface Territory {
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
  // Oversight & rewilding (docs/01 §11) ————————————————————————————
  overseerId?: string;        // hero_…|master_… assigned overseer; REQUIRED while occupied by a player.
  lastTroddenTick: number;    // last tick an owner/officer/army touched any hex (or governor acted)
  overgrowth: number;         // 0–100, lazy-computed from lastTroddenTick; 100 ⇒ WILD reversion (unowned only)
  version: number; updatedAt: number;
}

export interface StructureState {
  key: string;                // module: 'WALL','TOWER','GATE','TRAP','GRANARY','PET_DEN', or
                              // development-track builds ('granary','market','barracks',…)
  track: DevelopmentTrack;
  level: number;
  hp: number; maxHp: number;  // damaged in siege/base assault; repaired with CT
  anchor?: [number, number];  // player-placed position on the parcel battlefield, normalized 0–1
                              // (CoC layer, docs/04 §7b rule 2b); absent ⇒ auto-placed by generator
}

// A helper companion (Palworld model, docs/05 §9). Owned by a player, assignable to an occupied
// territory to GATHER (yield boost) and GUARD (fights raiders on the battlefield).
export interface Pet {
  id: string;                 // pet_…
  ownerPlayerId: string;
  dexNumber: number;          // roster number (data/PETS_ROSTER.csv), e.g. 90
  name: string;               // e.g. 'Barkindle'
  element?: string;           // ❓ OPEN — element list pending
  battleReady: boolean;       // cosmetic-only pets gather but cannot guard
  flying: boolean;            // extends territory scouting/vision radius (docs/01 §9)
  assignedTerritoryId?: string; // occupied territory this pet works/guards (cap: MAX_PETS_PER_TERRITORY)
  condition: number;          // 0–100; beaten down in raids — at 0 the pet is KO'd and auto-returns
                              // to the owner's roster (NEVER killed/lost), recovers over cooldown ⚙
  koRecoverAt?: number;       // epoch ms
}

// ── Land NFT & economy ledger ────────────────────────────────────────────────

export interface LandNFT {
  id: string;                 // nft_…
  territoryId: string;
  chainId?: number; contract?: string; tokenId?: string; // on-chain settlement (optional/mirrored)
  sourceParcelId?: string;    // hexagone-city parcel id (import provenance — data/parcels.json)
  ownerPlayerId?: string;     // undefined ⇒ SYSTEM-owned (buyable)
  leaseId?: string;           // active lease, if any
  taxSplitLandlord: number;   // landlord share of tax (default CONSTANTS.TAX_SPLIT_LANDLORD_DEFAULT)
  listedForSalePriceCt?: number;
}

export interface Lease {
  id: string; nftId: string;
  lesseeGovernorId: string;
  rentCtPerDay: number;
  revenueSharePct: number;    // extra cut to lessee of development revenue
  startAt: number; endAt: number;
}

// Append-only, double-entry. This is the AUTHORITATIVE source of CT truth.
export interface LedgerEntry {
  id: string; ts: number;
  fromAccount: string;        // 'player_…' | 'terr_…' | 'system:treasury' | 'contract:…'
  toAccount: string;
  amountCt: number;           // ct_units, positive
  reason: string;             // 'tax','build','train','repair','pillage','bounty','lease','trade','mint'
  refId?: string;             // linked battle/contract/order
}

// ── Army / Unit / Supply ─────────────────────────────────────────────────────

export interface Army {
  id: string;                 // army_…
  worldId: string;
  ownerGovernorId: string;
  heroId?: string;            // leading officer (optional; AI-led if absent)
  state: ArmyState;
  hexId: string;              // current position
  path?: string[];            // remaining hexIds when MARCHING
  arrivalTick?: number;       // tick at next hex / destination
  units: UnitStack[];
  provisions: { food: number; gold: number; wood: number }; // carried battle logistics (docs/04 §7c):
                              // food = battle clock; gold+wood = temporary command-center budget.
  supply: number;             // 0..supplyMax
  supplyMax: number;
  morale: number;             // 0–100
  supplyTrainIds: string[];
  /**
   * COMMAND-intent (docs/04 §3a, MVP-demo state — not canon docs/08): set by a
   * `MARCH & COMMAND` order, cleared when consumed at the collision tick. When
   * true and the owning governor holds a free command slot + the live pool has
   * room, the resulting engine battle allocates LIVE (30 Hz, joinable/steerable)
   * instead of accelerated. Best-effort: cap/pool pressure downgrades to AUTO.
   */
  commandIntent?: boolean;
  /**
   * March-intent (Gap 4, owner 2026-07-14): HOSTILE (default, absent = HOSTILE
   * for back-compat) = "march to fight" — any hostile co-location spawns a
   * battle. EVASIVE = "just passing through" — two EVASIVE armies co-crossing
   * an UNOWNED hex don't spawn a battle. Set by orderMarch; consumed at the
   * collision tick.
   */
  stance?: MarchStance;
  /**
   * Gap 2 (owner 2026-07-14): the last hex this army stood on BEFORE its
   * current one. Set on arrival at a new hex; cleared on a new march. Used by
   * retreatArmy as the first-choice retreat direction ("retreat back the way
   * you came"). Persists through a battle so the retreat cascade can find it.
   */
  cameFromHexId?: string;
  /**
   * Gap 2 pincer (owner 2026-07-14): retreatArmy set this when it retreated
   * INTO a hostile-occupied came-from hex. The subsequent battle can no longer
   * cascade-retreat — losing it (or fleeing) ABANDONS the army: all soldiers
   * lost, Master returns to the undeployed officer pool. Cleared when the
   * army breaks through (wins) or when the army departs on a new march.
   */
  retreatPincered?: boolean;
  version: number;
}

export interface UnitStack {
  unitClass: UnitClass;
  count: number;
  veterancy: number;          // 0..3, raises effective strength (soft, within reason)
  hp: number;                 // aggregate condition 0–100
}

export interface SupplyTrain {
  id: string; armyId?: string; hexId: string;
  capacity: number; carrying: number; // food/CT ferried
  state: 'IDLE' | 'MOVING' | 'RAIDED';
}

// ── Battle ───────────────────────────────────────────────────────────────────

export interface BattleInstance {
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

export interface BattleParticipant {
  playerId: string; heroId: string; side: 'ATTACKER' | 'DEFENDER';
  joinedTick: number; role: 'HERO';
}

export interface WarScore {
  attacker: number; defender: number; // computed aggregate
  breakdown: Record<string, number>;  // 'army','supply','morale','terrain','hero','structures'
}

export interface BattleResult {
  winner: 'ATTACKER' | 'DEFENDER' | 'DRAW';
  postVictoryAction?: PostVictoryAction; // chosen by winning governor/player
  casualties: Record<string, number>;    // armyId → units lost
  lootCt?: number;
  territoryOutcome?: 'HELD' | 'OCCUPIED' | 'PILLAGED';
  resolvedTick: number;
}

// ── Diplomacy & contracts ────────────────────────────────────────────────────

export interface DiplomacyRelation {
  id: string; worldId: string;
  aGovernorId: string; bGovernorId: string;
  stance: DiplomacyStance;
  since: number; expiresAt?: number;     // truces expire
  tributeCtPerDay?: number;              // for VASSAL/SUZERAIN
}

export interface Contract {
  id: string; type: ContractType;
  posterGovernorId: string;
  targetRef?: string;                     // territory/hero/hex
  rewardCt: number;
  state: 'OPEN' | 'TAKEN' | 'FULFILLED' | 'EXPIRED';
  takerId?: string; expiresAt: number;
}
