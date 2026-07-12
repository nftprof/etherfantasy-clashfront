/**
 * BASE-BUILDING defense layer (docs/briefs/BASE-BUILDING-DEFENSE-LAYER.md,
 * decision 7 / docs/04 §7b rule 2b). A parcel owner places/upgrades destructible
 * defense MODULES (TOWER/WALL/GATE/…) onto the map's buildSpot slots; the CF
 * engine seeds the SAME modules onto WILD parcels (in lieu of a player). Both
 * write `Territory.structures`, which `engineAllocateContext` maps into the
 * allocate `battlefield.structures[]` the MOBA engine already consumes.
 *
 * Cost is the develop SINK path (decision 17: ≥10% burns, redistributes around
 * the parcel). Pure integer money; no randomness — fully deterministic. The
 * caller (server) owns authorization + supplies the map's buildSpots (the sim
 * has no battlefield loader).
 */
import { type Balance, loadBalance } from '@clashfront/shared';
import type { StructureState } from '@clashfront/shared';
import { spendCT } from './economy';
import type { WorldState } from './state';

/** A map buildSpot slot (from the parcel battlefield): id + world-unit position. */
export interface BuildSpot {
  anchorId: string;
  x: number;
  z: number;
}

export type BuildAction = 'PLACE' | 'UPGRADE';

/** CT cost (ct_units) to take `key` from `currentTier` (0 = not yet built) to the next tier. */
export function buildCostCtUnits(key: string, currentTier: number, balance: Balance = loadBalance()): number {
  const base = balance.build.baseCostCtUnitsByKey[key] ?? balance.build.baseCostCtUnitsByKey['TOWER'] ?? 6000;
  return Math.round(base * Math.pow(balance.build.costGrowthPerTier, currentTier));
}

/** Per-tier max HP a module persists with (tier clamped to the hpByTier ladder). */
export function structureMaxHp(tier: number, balance: Balance = loadBalance()): number {
  const ladder = balance.build.hpByTier;
  const i = Math.max(0, Math.min(ladder.length - 1, tier - 1));
  return ladder[i]!;
}

/** Map a module key to the development track it tags (cosmetic grouping; combat comes from the engine). */
function trackForKey(key: string): StructureState['track'] {
  if (key === 'GRANARY') return 'AGRICULTURE';
  if (key === 'PET_DEN') return 'ECONOMY';
  return 'DEFENSE'; // TOWER / WALL / GATE / TRAP
}

const EPS = 1e-6;

/** The normalized [0..1] anchor a world-unit buildSpot maps to on the arena of size `arenaSize`. */
export function normalizeAnchor(spot: BuildSpot, arenaSize: number): [number, number] {
  return [spot.x / arenaSize + 0.5, spot.z / arenaSize + 0.5];
}

/**
 * Place or UPGRADE a defense module on a buildSpot of a territory. Throws
 * (without mutating) on: unknown territory; ungoverned land when `allowSystem`
 * is false; an `anchorId` not in `buildSpots`; the buildSpot cap
 * (structures already at capacity and this is a NEW placement); the module tier
 * cap; or insufficient CT. Charges the develop SINK path. Ownership is the
 * caller's job — the sim only enforces world rules.
 */
export function buildStructure(
  state: WorldState,
  territoryId: string,
  opts: {
    anchorId: string;
    key: string;
    buildSpots: readonly BuildSpot[];
    arenaSize: number;
    /** WILD-seeding path: allow writing structures onto SYSTEM land (no CT charge). */
    allowSystem?: boolean;
    balance?: Balance;
  },
): { structure: StructureState; costCtUnits: number; tier: number; action: BuildAction } {
  const balance = opts.balance ?? loadBalance();
  const t = state.territories.get(territoryId);
  if (t === undefined) throw new Error(`buildStructure: unknown territory ${territoryId}`);
  const system = t.governorKind === 'SYSTEM';
  if (system && opts.allowSystem !== true) throw new Error(`buildStructure: ${t.name} is ungoverned wilds`);

  const spot = opts.buildSpots.find((s) => s.anchorId === opts.anchorId);
  if (spot === undefined) throw new Error(`buildStructure: ${opts.anchorId} is not a buildSpot on ${t.name}`);
  const cap = opts.buildSpots.length;
  const anchor = normalizeAnchor(spot, opts.arenaSize);

  t.structures ??= [];
  const existing = t.structures.find(
    (s) => s.anchor !== undefined && Math.abs(s.anchor[0] - anchor[0]) < EPS && Math.abs(s.anchor[1] - anchor[1]) < EPS,
  );
  const action: BuildAction = existing === undefined ? 'PLACE' : 'UPGRADE';

  if (action === 'PLACE' && t.structures.length >= cap) {
    throw new Error(`buildStructure: ${t.name} has no free buildSpot (cap ${cap})`);
  }
  const curTier = existing?.level ?? 0;
  if (curTier >= balance.build.maxTier) {
    throw new Error(`buildStructure: ${opts.key} already at max tier (${balance.build.maxTier})`);
  }

  // Cost + SINK (players pay; WILD seeding is free — no owner wallet).
  const costCtUnits = system ? 0 : buildCostCtUnits(opts.key, curTier, balance);
  if (!system) {
    const wallet = state.ctBalances?.get(t.governorId);
    if (wallet === undefined) throw new Error(`buildStructure: governor ${t.governorId} has no CT wallet`);
    if (wallet < costCtUnits) throw new Error(`buildStructure: insufficient CT (${wallet} < ${costCtUnits} ct_units)`);
    state.ctBalances!.set(t.governorId, wallet - costCtUnits);
    spendCT(state, t.governorId, costCtUnits, t.hexIds[0]!, 'build', balance);
  }

  const tier = curTier + 1;
  const maxHp = structureMaxHp(tier, balance);
  let structure: StructureState;
  if (existing === undefined) {
    structure = { key: opts.key, track: trackForKey(opts.key), level: tier, hp: maxHp, maxHp, anchor };
    t.structures.push(structure);
  } else {
    existing.level = tier;
    existing.maxHp = maxHp;
    existing.hp = maxHp; // an upgrade restores to full
    existing.key = opts.key;
    structure = existing;
  }
  t.lastTroddenTick = state.world.tick;
  t.version += 1;
  return { structure, costCtUnits, tier, action };
}

/**
 * Restore a siege-damaged module to full HP for CT = repairCostFractionOfBuild ×
 * the tier's build cost. Throws on unknown territory/ungoverned land, no module
 * at the anchor, an undamaged module, or insufficient CT.
 */
export function repairStructure(
  state: WorldState,
  territoryId: string,
  opts: { anchorId: string; buildSpots: readonly BuildSpot[]; arenaSize: number; balance?: Balance },
): { costCtUnits: number; hp: number } {
  const balance = opts.balance ?? loadBalance();
  const t = state.territories.get(territoryId);
  if (t === undefined) throw new Error(`repairStructure: unknown territory ${territoryId}`);
  if (t.governorKind === 'SYSTEM') throw new Error(`repairStructure: ${t.name} is ungoverned wilds`);
  const spot = opts.buildSpots.find((s) => s.anchorId === opts.anchorId);
  if (spot === undefined) throw new Error(`repairStructure: ${opts.anchorId} is not a buildSpot on ${t.name}`);
  const anchor = normalizeAnchor(spot, opts.arenaSize);
  const s = (t.structures ?? []).find(
    (x) => x.anchor !== undefined && Math.abs(x.anchor[0] - anchor[0]) < EPS && Math.abs(x.anchor[1] - anchor[1]) < EPS,
  );
  if (s === undefined) throw new Error(`repairStructure: no module at ${opts.anchorId}`);
  if (s.hp >= s.maxHp) throw new Error(`repairStructure: ${s.key} is already at full HP`);
  const tierCost = buildCostCtUnits(s.key, s.level - 1, balance);
  const costCtUnits = Math.max(1, Math.round(tierCost * balance.build.repairCostFractionOfBuild));
  const wallet = state.ctBalances?.get(t.governorId);
  if (wallet === undefined) throw new Error(`repairStructure: governor ${t.governorId} has no CT wallet`);
  if (wallet < costCtUnits) throw new Error(`repairStructure: insufficient CT (${wallet} < ${costCtUnits} ct_units)`);
  state.ctBalances!.set(t.governorId, wallet - costCtUnits);
  spendCT(state, t.governorId, costCtUnits, t.hexIds[0]!, 'build', balance);
  s.hp = s.maxHp;
  t.lastTroddenTick = state.world.tick;
  t.version += 1;
  return { costCtUnits, hp: s.hp };
}
