/**
 * Intel & fog of war — Feature Set 2 F1 (docs/briefs/FEATURESET-2.md).
 *
 * Per-governor parcel intel grades. Ownership/prosperity are ALWAYS public
 * (NFT record + map readability); military contents are fogged:
 *
 *   ACCURATE — inside a sight source: own territory clusters (radius
 *              1 + floor(sqrt(clusterSize)/2), cap ⚙ clusterRadiusCap), own
 *              armies (sight ⚙ armySight; cavalry-majority scout screens see
 *              ⚙ scoutSight), or scout memory younger than ⚙ decayTicks.
 *   FUZZY    — one adjacency ring beyond the ACCURATE set, or decayed scout
 *              memory. Strengths render as deterministic bands (fuzzyBand).
 *   UNKNOWN  — everything else. Contents render as "??".
 *
 * Grading is a PURE read (computeIntel); the per-governor memory is written
 * once per tick by updateIntelMemory (called from the AI phase — deterministic,
 * snapshot-safe on WorldState.intel). All randomness in fuzzy bands is a seeded
 * hash of (parcelId, period) — stable across refreshes, no true value leaking.
 */
import { type Balance, createRng, loadBalance } from '@clashfront/shared';
import type { Army } from '@clashfront/shared';
import { troopCount } from './logistics';
import { sortedIds, type WorldState } from './state';

export type IntelGrade = 'ACCURATE' | 'FUZZY' | 'UNKNOWN';

/** Convenience: grade lookup with UNKNOWN default. */
export function intelGrade(grades: ReadonlyMap<string, IntelGrade>, hexId: string): IntelGrade {
  return grades.get(hexId) ?? 'UNKNOWN';
}

/**
 * A cavalry-majority army is a scout screen (the SCOUTS preset is pure cavalry):
 * strictly more than half its soldiers are CAVALRY ⇒ sight ⚙ scoutSight.
 */
export function isScoutScreen(army: Pick<Army, 'units'>): boolean {
  const troops = troopCount(army);
  if (troops === 0) return false;
  const cavalry = army.units.reduce((n, s) => n + (s.unitClass === 'CAVALRY' ? s.count : 0), 0);
  return cavalry * 2 > troops;
}

/** Territory sight radius for a contiguous own-parcel cluster of `size` parcels. */
export function clusterSightRadius(size: number, balance: Balance = loadBalance()): number {
  return Math.min(balance.intel.clusterRadiusCap, 1 + Math.floor(Math.sqrt(size) / 2));
}

/** BFS out to `radius` steps from every seed hex (seeds included), over the parcel graph. */
function expand(
  adjacency: ReadonlyMap<string, string[]> | undefined,
  seeds: Iterable<string>,
  radius: number,
  into: Set<string>,
): void {
  let frontier: string[] = [];
  for (const s of seeds) {
    if (!into.has(s)) {
      into.add(s);
      frontier.push(s);
    } else {
      frontier.push(s); // still expand from it — a bigger radius may reach further
    }
  }
  for (let d = 0; d < radius && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const h of frontier) {
      for (const n of adjacency?.get(h) ?? []) {
        if (into.has(n)) continue;
        into.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
}

/**
 * The governor's CURRENT accurate-sight set: territory clusters + army sight.
 * Pure; deterministic (sorted iteration, sorted adjacency).
 */
export function accurateSources(
  state: WorldState,
  governorId: string,
  balance: Balance = loadBalance(),
): Set<string> {
  const acc = new Set<string>();

  // Own parcels (1 parcel = 1 hex in the MVP world) → contiguous clusters via
  // flood fill over adjacency restricted to own parcels.
  const own = new Set<string>();
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    if (t.governorId !== governorId) continue;
    for (const h of t.hexIds) own.add(h);
  }
  const unvisited = new Set(own);
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    if (t.governorId !== governorId) continue;
    const seed = t.hexIds[0]!;
    if (!unvisited.has(seed)) continue;
    // flood fill this cluster
    const cluster: string[] = [seed];
    unvisited.delete(seed);
    for (let i = 0; i < cluster.length; i++) {
      for (const n of state.adjacency?.get(cluster[i]!) ?? []) {
        if (unvisited.has(n)) {
          unvisited.delete(n);
          cluster.push(n);
        }
      }
    }
    expand(state.adjacency, cluster, clusterSightRadius(cluster.length, balance), acc);
  }

  // Own armies: sight 1 (⚙ armySight), scout screens sight 3 (⚙ scoutSight).
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED' || a.ownerGovernorId !== governorId) continue;
    const sight = isScoutScreen(a) ? balance.intel.scoutSight : balance.intel.armySight;
    expand(state.adjacency, [a.hexId], sight, acc);
  }
  return acc;
}

/**
 * Grade every parcel for `governorId`. Returned map holds ACCURATE/FUZZY
 * entries only — absent hexes are UNKNOWN (use intelGrade()).
 */
export function computeIntel(
  state: WorldState,
  governorId: string,
  balance: Balance = loadBalance(),
): Map<string, IntelGrade> {
  const tick = state.world.tick;
  const acc = accurateSources(state, governorId, balance);
  const fuzzy = new Set<string>();

  // Scout memory: recent sight stays ACCURATE, older decays to FUZZY (forever).
  const mem = state.intel?.get(governorId);
  if (mem !== undefined) {
    for (const [hexId, last] of mem) {
      if (acc.has(hexId)) continue;
      if (tick - last <= balance.intel.decayTicks) acc.add(hexId);
      else fuzzy.add(hexId);
    }
  }

  // FUZZY band = one adjacency ring beyond the ACCURATE set.
  for (const h of acc) {
    for (const n of state.adjacency?.get(h) ?? []) {
      if (!acc.has(n)) fuzzy.add(n);
    }
  }

  const out = new Map<string, IntelGrade>();
  for (const h of acc) out.set(h, 'ACCURATE');
  for (const h of fuzzy) if (!out.has(h)) out.set(h, 'FUZZY');
  return out;
}

/**
 * Record the current tick's accurate sight into per-governor memory
 * (WorldState.intel). Called once per tick from the AI phase — the write half
 * of the scout-reveal/decay mechanic. SYSTEM governors (wild monsters) keep no
 * memory; the NPC AI reads raw state anyway (it may cheat for now).
 */
export function updateIntelMemory(state: WorldState, tick: number, balance: Balance = loadBalance()): void {
  for (const gov of [...(state.governorKinds ?? new Map<string, string>()).keys()].sort()) {
    const kind = state.governorKinds!.get(gov);
    if (kind !== 'PLAYER' && kind !== 'NPC_KINGDOM') continue;
    const acc = accurateSources(state, gov, balance);
    if (acc.size === 0) continue;
    state.intel ??= new Map();
    let mem = state.intel.get(gov);
    if (mem === undefined) {
      mem = new Map();
      state.intel.set(gov, mem);
    }
    for (const h of [...acc].sort()) mem.set(h, tick);
  }
}

// ── Fuzzy display bands ───────────────────────────────────────────────────────

/** Friendly rounding step so bands read as "~150–300", not "~143–287". */
function friendlyStep(x: number): number {
  if (x < 100) return 10;
  if (x < 500) return 25;
  if (x < 2_000) return 50;
  if (x < 10_000) return 100;
  return 500;
}

/**
 * Deterministic fuzzy strength band for a FUZZY-grade parcel/army:
 * ±bandPct (⚙ balance.intel.fuzzyBandPct) around a seeded-jittered center,
 * rounded outward to friendly numbers. Seed = (parcelId, period) where
 * period = floor(tick / ⚙ fuzzyPeriodTicks) — stable within a period, and the
 * true value is ALWAYS inside [lo, hi] (jitter is bounded so no info leaks).
 */
export function fuzzyBand(
  trueStrength: number,
  parcelId: string,
  period: number,
  bandPct = loadBalance().intel.fuzzyBandPct,
): { lo: number; hi: number } {
  const t = Math.max(0, trueStrength);
  const r = createRng(`fuzzy:${parcelId}:${period}`).next();
  // Center jitter bounded to ±40% of the band half-width — containment holds:
  // lo ≤ t·(1+0.4b)(1−b) ≤ t and hi ≥ t·(1−0.4b)(1+b) ≥ t for b ≤ 1.
  const center = t * (1 + (r * 2 - 1) * bandPct * 0.4);
  const rawLo = center * (1 - bandPct);
  const rawHi = center * (1 + bandPct);
  const lo = Math.max(0, Math.floor(rawLo / friendlyStep(rawLo)) * friendlyStep(rawLo));
  const step = friendlyStep(rawHi);
  const hi = Math.max(Math.ceil(rawHi / step) * step, lo + step);
  return { lo, hi };
}
