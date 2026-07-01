/**
 * In-memory WorldState container for the tick engine (docs/01, docs/07 §3).
 * Hot state lives here during a tick; persistence (Redis write-through → Postgres)
 * is a later layer (docs/07). This container is what runTick mutates.
 */
import type { Army, BattleInstance, Hex, LandNFT, Region, Territory, World } from '@clashfront/shared';

export interface WorldState {
  world: World;
  regions: Map<string, Region>;
  hexes: Map<string, Hex>;
  territories: Map<string, Territory>;
  landNfts: Map<string, LandNFT>;
  armies: Map<string, Army>;
  battles: Map<string, BattleInstance>;
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
