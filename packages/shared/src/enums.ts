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
export type UnitClass = 'INFANTRY' | 'ARCHER' | 'CAVALRY' | 'SPEAR' | 'SIEGE' | 'MARINE' | 'SHIP';
export type PostVictoryAction = 'PILLAGE' | 'OCCUPY';
export type DiplomacyStance = 'WAR' | 'HOSTILE' | 'NEUTRAL' | 'TRUCE' | 'ALLIED' | 'VASSAL_OF' | 'SUZERAIN_OF';
export type ContractType = 'MERCENARY_DEFEND' | 'MERCENARY_ATTACK' | 'BOUNTY_HERO' | 'ESCORT_SUPPLY' | 'TRADE_LEASE';

/** Enumerable value lists (for iteration/validation; members mirror the union types above). */
export const ZONE_TYPES: readonly ZoneType[] = ['VILLAGE', 'TOWN', 'FORTRESS', 'HARBOR', 'CAPITAL', 'WILD', 'SEA'];
export const HEX_TERRAINS: readonly HexTerrain[] = ['PLAINS', 'FOREST', 'HILLS', 'MOUNTAIN', 'RIVER', 'COAST', 'OCEAN', 'ROAD'];
export const DEVELOPMENT_TRACKS: readonly DevelopmentTrack[] = ['AGRICULTURE', 'ECONOMY', 'DEFENSE', 'MILITARY'];
export const UNIT_CLASSES: readonly UnitClass[] = ['INFANTRY', 'ARCHER', 'CAVALRY', 'SPEAR', 'SIEGE', 'MARINE', 'SHIP'];
