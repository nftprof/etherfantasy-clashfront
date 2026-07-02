/**
 * Public view builders — the wire shapes the HTTP snapshot (/api/state) and the
 * WS tick deltas share. Views are plain JSON objects keyed by ids; the client
 * joins them onto the static geometry of /api/world by `parcelId`.
 *
 * No fog of war for the MVP (brief OUT list): every view here is public. The
 * only private data is the per-player `my` block assembled in game.ts.
 */
import type { Army, Balance, BattleInstance, Territory } from '@clashfront/shared';
import { armyStrength, stepTicks, type TickOptions, type WorldState } from '@clashfront/sim-engine';

export interface TerritoryView {
  id: string;
  parcelId: string;
  name: string;
  governorId: string;
  governorKind: string;
  prosperity: number;
  morale: number;
  population: number;
  /** Present iff a live army garrisons the parcel (monster or player/NPC). */
  garrison?: {
    armyId: string;
    governorId: string;
    troops: number;
    /** Wild-monster display name (roster-flavored), when the garrison is a monster. */
    monsterName?: string;
  };
  overseerId?: string;
}

export interface ArmyView {
  id: string;
  governorId: string;
  /** GARRISON | MARCHING | DISBANDED (DISBANDED views appear once in deltas so clients can drop them). */
  state: string;
  parcelId: string;
  hexId: string;
  troops: number;
  morale: number;
  units: { unitClass: string; count: number }[];
  strength: number;
  heroId?: string;
  heroName?: string;
  monsterName?: string;
  /** Remaining march path as parcelIds (MARCHING only). */
  path?: string[];
  /** Tick the army steps onto path[0] (MARCHING only). */
  nextArrivalTick?: number;
  /** Tick the army reaches the final parcel of its path (MARCHING only). */
  etaTick?: number;
}

export interface BattleView {
  id: string;
  parcelId: string;
  resolvedTick: number;
  winner: string;
  attackerGovernorIds: string[];
  defenderGovernorIds: string[];
  attackerScore: number;
  defenderScore: number;
  /** armyId → soldiers lost. */
  casualties: Record<string, number>;
  territoryOutcome?: string;
  postVictoryAction?: string;
  lootCt?: number;
  /** Present while the winner still has to pick PILLAGE | OCCUPY. */
  pendingChoice?: { governorId: string; territoryId: string; expiresTick: number };
}

/** Static per-parcel geometry + id joins, served once by GET /api/world (ETag-cached). */
export interface WorldParcelView {
  id: string; // parcelId — the join key for all dynamic views
  territoryId: string;
  hexId: string;
  center: [number, number];
  polygon: [number, number][];
  neighbors: string[]; // neighbor parcelIds
}

/** hexId → parcelId lookup (built once from LandNFT.sourceParcelId provenance). */
export type ParcelIndex = ReadonlyMap<string, string>;

export function buildParcelByHex(state: WorldState): Map<string, string> {
  const byHex = new Map<string, string>();
  for (const nft of state.landNfts.values()) {
    const terr = state.territories.get(nft.territoryId);
    if (terr === undefined) continue;
    const parcelId = nft.sourceParcelId ?? nft.territoryId;
    for (const hexId of terr.hexIds) byHex.set(hexId, parcelId);
  }
  return byHex;
}

export function territoryView(state: WorldState, t: Territory, parcelByHex: ParcelIndex): TerritoryView {
  const view: TerritoryView = {
    id: t.id,
    parcelId: parcelByHex.get(t.hexIds[0]!) ?? t.id,
    name: t.name,
    governorId: t.governorId,
    governorKind: t.governorKind,
    prosperity: t.prosperity,
    morale: t.morale,
    population: t.population,
  };
  if (t.garrisonArmyId !== undefined) {
    const g = state.armies.get(t.garrisonArmyId);
    if (g !== undefined && g.state !== 'DISBANDED') {
      view.garrison = {
        armyId: g.id,
        governorId: g.ownerGovernorId,
        troops: g.units.reduce((n, s) => n + s.count, 0),
        ...(state.monsterNames?.has(g.id) === true ? { monsterName: state.monsterNames.get(g.id)! } : {}),
      };
    }
  }
  if (t.overseerId !== undefined) view.overseerId = t.overseerId;
  return view;
}

export function armyView(
  state: WorldState,
  a: Army,
  parcelByHex: ParcelIndex,
  balance: Balance,
  options?: TickOptions,
): ArmyView {
  const view: ArmyView = {
    id: a.id,
    governorId: a.ownerGovernorId,
    state: a.state,
    parcelId: parcelByHex.get(a.hexId) ?? a.hexId,
    hexId: a.hexId,
    troops: a.units.reduce((n, s) => n + s.count, 0),
    morale: a.morale,
    units: a.units.map((s) => ({ unitClass: s.unitClass, count: s.count })),
    strength: Math.round(armyStrength(a, balance)),
  };
  if (a.heroId !== undefined) {
    view.heroId = a.heroId;
    const officer = state.officers?.get(a.ownerGovernorId)?.find((o) => o.id === a.heroId);
    if (officer !== undefined) view.heroName = officer.name;
  }
  const monsterName = state.monsterNames?.get(a.id);
  if (monsterName !== undefined) view.monsterName = monsterName;
  if (a.state === 'MARCHING' && a.path !== undefined && a.arrivalTick !== undefined) {
    view.path = a.path.map((h) => parcelByHex.get(h) ?? h);
    view.nextArrivalTick = a.arrivalTick;
    let eta = a.arrivalTick;
    for (let i = 1; i < a.path.length; i++) eta += stepTicks(state, a.path[i]!, options);
    view.etaTick = eta;
  }
  return view;
}

export function battleView(state: WorldState, b: BattleInstance, parcelByHex: ParcelIndex): BattleView {
  const owners = (armyIds: readonly string[]): string[] =>
    [...new Set(armyIds.map((id) => state.armies.get(id)?.ownerGovernorId ?? 'unknown'))].sort();
  const view: BattleView = {
    id: b.id,
    parcelId: parcelByHex.get(b.hexId) ?? b.hexId,
    resolvedTick: b.result?.resolvedTick ?? b.scheduledStartTick,
    winner: b.result?.winner ?? 'UNRESOLVED',
    attackerGovernorIds: owners(b.attackerArmyIds),
    defenderGovernorIds: owners(b.defenderArmyIds),
    attackerScore: Math.round(b.warScore?.attacker ?? 0),
    defenderScore: Math.round(b.warScore?.defender ?? 0),
    casualties: b.result?.casualties ?? {},
  };
  if (b.result?.territoryOutcome !== undefined) view.territoryOutcome = b.result.territoryOutcome;
  if (b.result?.postVictoryAction !== undefined) view.postVictoryAction = b.result.postVictoryAction;
  if (b.result?.lootCt !== undefined) view.lootCt = b.result.lootCt;
  const choice = state.pendingChoices?.get(b.id);
  if (choice !== undefined) {
    view.pendingChoice = {
      governorId: choice.governorId,
      territoryId: choice.territoryId,
      expiresTick: choice.expiresTick,
    };
  }
  return view;
}
