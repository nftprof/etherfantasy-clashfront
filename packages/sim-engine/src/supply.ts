/**
 * Wave 4.7 — logistics supply lines (docs/01 §5.2, the flagship system).
 *
 * `isSupplied(army)` = a bounded Dijkstra over the FRIENDLY-CONTROLLED route
 * graph, seeded at the army's hex. An edge into hexB is usable iff:
 *   - hexB is NOT occupied by a hostile army (ZoC/blockade);
 *   - hexB is wild (no territory) OR controlled by the army's governor
 *     (MVP: no diplomacy yet — allied/suzerain edges land when DiplomacyStance
 *     ships);
 * edge weight = hexB.moveCost (ROAD 0.5 ⇒ roads DOUBLE effective reach). The
 * army is supplied iff some friendly `supplySource` territory's seat hex is
 * within `range = rangeHexes + trainRangeBonusHexes × activeTrains` weighted
 * hexes. Cut the road (occupy/pillage a route hex) and the edge vanishes —
 * encirclement starves an army without a battle (§5.5).
 *
 * Determinism: integer/float math over sorted iteration; the frontier extracts
 * its minimum with hexId as the tie-breaker — no RNG, no wall clock.
 */
import { type Balance, type Army } from '@clashfront/shared';
import { sortedIds, type WorldState } from './state';

/** hexId → set of governorIds with a live (non-caravan) army standing on it. */
export function armyOwnersByHex(state: WorldState): Map<string, Set<string>> {
  const byHex = new Map<string, Set<string>>();
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED' || a.kind === 'CARAVAN') continue;
    let set = byHex.get(a.hexId);
    if (set === undefined) {
      set = new Set();
      byHex.set(a.hexId, set);
    }
    set.add(a.ownerGovernorId);
  }
  return byHex;
}

/** Friendly supplySource seat hexes for `governorId` (the Dijkstra targets). */
function supplyAnchorHexes(state: WorldState, governorId: string): Set<string> {
  const anchors = new Set<string>();
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    if (!t.supplySource) continue;
    if (t.governorId !== governorId) continue; // MVP: only own supply sources
    const seat = t.hexIds[0];
    if (seat !== undefined) anchors.add(seat);
  }
  return anchors;
}

/** A hex is friendly-passable for `governorId` iff wild or governed by them, and not hostile-occupied. */
function edgeUsable(
  state: WorldState,
  hexId: string,
  governorId: string,
  ownersByHex: Map<string, Set<string>>,
): boolean {
  const hex = state.hexes.get(hexId);
  if (hex === undefined) return false;
  // Hostile occupation blocks the edge (a foreign army sits astride the road).
  const owners = ownersByHex.get(hexId);
  if (owners !== undefined) {
    for (const o of owners) if (o !== governorId) return false;
  }
  // Territory control: wild ground is traversable; owned ground must be friendly.
  if (hex.territoryId !== undefined) {
    const terr = state.territories.get(hex.territoryId);
    if (terr !== undefined && terr.governorKind !== 'SYSTEM' && terr.governorId !== governorId) {
      return false;
    }
  }
  return true;
}

/**
 * Bounded Dijkstra: is `army` supplied? Reuses a precomputed `ownersByHex`
 * (built once per SUPPLY phase). The starting hex is always the seed (dist 0)
 * regardless of who else stands there — the army IS there; the friendly check
 * applies only to hexes we expand INTO.
 */
export function isSuppliedGraph(
  state: WorldState,
  army: Army,
  balance: Balance,
  ownersByHex: Map<string, Set<string>>,
): boolean {
  const governorId = army.ownerGovernorId;
  const anchors = supplyAnchorHexes(state, governorId);
  if (anchors.size === 0) return false; // no friendly supply source anywhere
  if (anchors.has(army.hexId)) return true; // standing on one — trivially supplied

  const activeTrains = army.supplyTrainIds?.length ?? 0;
  const range = balance.supply.rangeHexes + balance.supply.trainRangeBonusHexes * activeTrains;

  const dist = new Map<string, number>([[army.hexId, 0]]);
  const settled = new Set<string>();
  // Simple frontier — the reachable set is bounded by `range` (≤ ~2×range hops
  // at ROAD cost), so a linear-scan extract-min stays cheap and deterministic.
  while (true) {
    let u: string | undefined;
    let best = Infinity;
    for (const [h, d] of dist) {
      if (settled.has(h)) continue;
      if (d < best || (d === best && (u === undefined || h < u))) {
        best = d;
        u = h;
      }
    }
    if (u === undefined || best > range) return false; // frontier exhausted / out of range
    settled.add(u);
    const neighbors = state.adjacency?.get(u) ?? [];
    for (const v of neighbors) {
      if (settled.has(v)) continue;
      if (!edgeUsable(state, v, governorId, ownersByHex)) continue;
      const step = state.hexes.get(v)?.moveCost ?? 1;
      const nd = best + step;
      if (nd > range) continue; // pruned — beyond supply reach
      if (nd < (dist.get(v) ?? Infinity)) dist.set(v, nd);
      if (anchors.has(v) && nd <= range) return true; // reached a friendly source
    }
  }
}
