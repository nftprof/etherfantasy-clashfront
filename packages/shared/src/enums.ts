/**
 * Canonical enums / union types — verbatim from docs/08-data-models.md §3.
 * Never invent or rename members; extend the doc first (AGENTS.md prime directive 2).
 */
export type ZoneType = 'VILLAGE' | 'TOWN' | 'FORTRESS' | 'HARBOR' | 'CAPITAL' | 'WILD' | 'SEA';
export type HexTerrain = 'PLAINS' | 'FOREST' | 'HILLS' | 'MOUNTAIN' | 'RIVER' | 'COAST' | 'OCEAN' | 'ROAD';
export type DevelopmentTrack = 'AGRICULTURE' | 'ECONOMY' | 'DEFENSE' | 'MILITARY';
export type GovernorKind = 'PLAYER' | 'GUILD' | 'ALLIANCE' | 'NPC_KINGDOM' | 'SYSTEM';
export type BattleType = 'FIELD' | 'SIEGE' | 'NAVAL';
export type ResolutionMode = 'AUTO' | 'LIVE' | 'ACCELERATED';
export type BattleState = 'SCHEDULED' | 'LOBBY' | 'RUNNING' | 'RESOLVED' | 'CANCELLED';
export type ArmyState = 'GARRISON' | 'MARCHING' | 'ENGAGED' | 'RETREATING' | 'DISBANDED';

/**
 * Intent of a march (Gap 4, docs/maps/BATTLE-SCENARIO-MATRIX.md §4). HOSTILE
 * = "march to fight" — the default and pre-2026-07-14 behaviour (any hostile
 * co-location spawns a battle). EVASIVE = "just passing through" — two EVASIVE
 * armies co-crossing an UNOWNED hex don't spawn a battle. An EVASIVE army
 * still fights when it meets a hostile OWNER's garrison / wilds / a HOSTILE
 * opponent — the flag only unlocks pass-through TRUCE between two commuters.
 */
export type MarchStance = 'HOSTILE' | 'EVASIVE';

/**
 * Battle mode taxonomy (docs/maps/GAME-MODES-SEEDING-REVIEW.md, Agent D 2026-07-14).
 * Semantic hint attached to a BattleInstance for the client/reports — the sim's
 * math is currently symmetric enough that mode doesn't change the resolution,
 * but the mode tells the map view which layout/objective to render and the
 * player what they're actually fighting for:
 *   DUEL     — 2-CC MOBA equivalent, raze to win
 *   SIEGE    — occupation defense, attacker enters via approach-edge
 *   GUARD    — no CC either side (wild mobs / pets-only), kill-all-to-complete
 *   CLASH    — 3+ armies (or 2 without stakes), last standing on per-edge starts
 *   DOMINION — hold the center = take an unclaimed parcel (Gap 3: the fix for
 *              "simultaneous arrival on unowned land was arbitrary lex-first")
 */
export type BattleMode = 'DUEL' | 'SIEGE' | 'GUARD' | 'CLASH' | 'DOMINION';
export type UnitClass = 'INFANTRY' | 'ARCHER' | 'CAVALRY' | 'SPEAR' | 'SIEGE' | 'MARINE' | 'SHIP';
export type PostVictoryAction = 'PILLAGE' | 'OCCUPY';
export type DiplomacyStance = 'WAR' | 'HOSTILE' | 'NEUTRAL' | 'TRUCE' | 'ALLIED' | 'VASSAL_OF' | 'SUZERAIN_OF';
export type ContractType = 'MERCENARY_DEFEND' | 'MERCENARY_ATTACK' | 'BOUNTY_HERO' | 'ESCORT_SUPPLY' | 'TRADE_LEASE';

/** Enumerable value lists (for iteration/validation; members mirror the union types above). */
export const ZONE_TYPES: readonly ZoneType[] = ['VILLAGE', 'TOWN', 'FORTRESS', 'HARBOR', 'CAPITAL', 'WILD', 'SEA'];
export const HEX_TERRAINS: readonly HexTerrain[] = ['PLAINS', 'FOREST', 'HILLS', 'MOUNTAIN', 'RIVER', 'COAST', 'OCEAN', 'ROAD'];
export const DEVELOPMENT_TRACKS: readonly DevelopmentTrack[] = ['AGRICULTURE', 'ECONOMY', 'DEFENSE', 'MILITARY'];
export const UNIT_CLASSES: readonly UnitClass[] = ['INFANTRY', 'ARCHER', 'CAVALRY', 'SPEAR', 'SIEGE', 'MARINE', 'SHIP'];
