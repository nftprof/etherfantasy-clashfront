/**
 * In-memory WorldState container for the tick engine (docs/01, docs/07 §3).
 * Hot state lives here during a tick; persistence (Redis write-through → Postgres)
 * is a later layer (docs/07). This container is what runTick mutates.
 *
 * The optional maps below the core entity maps are MVP demo state
 * (docs/briefs/MVP-JULY7.md): they live on WorldState (engine-owned container),
 * NOT on the canonical docs/08 entity interfaces, so canon stays untouched.
 */
import type { Army, BattleInstance, GovernorKind, Hex, LandNFT, Region, Territory, World } from '@clashfront/shared';

/**
 * MVP demo officer — stands in for a Hero/Master mirror (docs/08) until the live
 * Masters API sync lands (post-MVP). Overseer assignment + army leadership only.
 */
export interface DemoOfficer {
  id: string;                   // hero_… (demo; real world will also carry master_…)
  ownerGovernorId: string;
  name: string;                 // display name from data/CHARACTER_ROSTER.csv
  fame: number;                 // feeds the WarScore hero term (capped by HERO_IMPACT_MAX)
  assignedTerritoryId?: string; // territory this officer oversees (docs/01 §11.3)
}

/**
 * Post-victory decision pending on a battle winner (PILLAGE | OCCUPY).
 * Kept in a WorldState map instead of on BattleInstance so the canonical
 * docs/08 battle schema is not extended for an MVP-only mechanism.
 */
export interface PendingChoice {
  battleId: string;
  governorId: string;           // winning governor who must choose
  territoryId: string;
  createdTick: number;
  expiresTick: number;          // tick at which the default action is applied
}

export interface WorldState {
  world: World;
  regions: Map<string, Region>;
  hexes: Map<string, Hex>;
  territories: Map<string, Territory>;
  landNfts: Map<string, LandNFT>;
  armies: Map<string, Army>;
  battles: Map<string, BattleInstance>;
  // ── MVP demo state (docs/briefs/MVP-JULY7.md) ──────────────────────────────
  /**
   * Parcel-graph adjacency: hexId → sorted neighbor hexIds. The MVP runs on the
   * real hexagon-city parcel polygons (1 parcel = 1 Hex node, hexification
   * punted per the brief) — axial q/r on Hex are display-rounded centers only
   * and carry NO grid semantics; THIS map is the movement topology.
   */
  adjacency?: Map<string, string[]>;
  /** governorId → GovernorKind (players/NPCs/monster-SYSTEM registered at runtime). */
  governorKinds?: Map<string, GovernorKind>;
  /** MVP CT wallet per governor in ct_units (no ledger service yet — brief OUT list). */
  ctBalances?: Map<string, number>;
  /** governorId → officer pool (overseer cap = CONSTANTS.MAX_OVERSEEN_TERRITORIES). */
  officers?: Map<string, DemoOfficer[]>;
  /** battleId → pending PILLAGE/OCCUPY decision. */
  pendingChoices?: Map<string, PendingChoice>;
  /** armyId → monster display name (roster-flavored wild garrisons; display only). */
  monsterNames?: Map<string, string>;
}

/**
 * Deep snapshot/clone of the whole world state (structuredClone handles Maps).
 * Used for golden-master determinism tests, replay checkpoints, and rollback.
 */
export function snapshot(state: WorldState): WorldState {
  return structuredClone(state);
}

/**
 * Deterministic iteration helper: entity ids sorted lexicographically.
 * ULIDs sort by creation time, so processing order is stable and replayable
 * regardless of Map insertion order.
 */
export function sortedIds(map: ReadonlyMap<string, unknown>): string[] {
  return [...map.keys()].sort();
}
