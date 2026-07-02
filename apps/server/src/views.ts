/**
 * Public view builders — the wire shapes the HTTP snapshot (/api/state) and the
 * WS tick deltas share. Views are plain JSON objects keyed by ids; the client
 * joins them onto the static geometry of /api/world by `parcelId`.
 *
 * FOG OF WAR (Feature Set 2 F1): every builder takes an optional ViewerContext.
 * Without it the view is OMNISCIENT (server-internal use only). With it, views
 * are filtered by the viewer's intel grades:
 *   - territory ownership / zoneType / prosperity / morale / population are
 *     ALWAYS public (NFT record + map readability);
 *   - garrison + development detail only on ACCURATE (or own parcels);
 *   - FUZZY parcels expose garrison presence as a deterministic strength band;
 *   - UNKNOWN parcels expose no military contents at all (client renders "??");
 *   - foreign armies: full composition on ACCURATE (minus path/provisions —
 *     intent and logistics stay private), position + strength band on FUZZY,
 *     omitted entirely on UNKNOWN (deltas send {id, hidden:true} tombstones);
 *   - battles: participants always see everything; otherwise full on ACCURATE,
 *     winner + score bands on FUZZY, omitted on UNKNOWN.
 */
import type { Army, Balance, BattleInstance, DevelopmentTrack, Territory } from '@clashfront/shared';
import { DEVELOPMENT_TRACKS } from '@clashfront/shared';
import {
  armyStrength,
  developCostCtUnits,
  fuzzyBand,
  intelGrade,
  type IntelGrade,
  marchFoodPerStep,
  stepTicks,
  type TickOptions,
  type WorldState,
} from '@clashfront/sim-engine';

/** Per-viewer fog context. Omit the whole context for omniscient (internal) views. */
export interface ViewerContext {
  /** Viewing governor; undefined = anonymous spectator (everything UNKNOWN). */
  governorId?: string;
  /** hexId → intel grade (absent = UNKNOWN). */
  grades: ReadonlyMap<string, IntelGrade>;
  /** Fuzzy-band period index = floor(tick / ⚙ balance.intel.fuzzyPeriodTicks). */
  period: number;
}

export interface TerritoryView {
  id: string;
  parcelId: string;
  name: string;
  /** WILD | TOWN | … (docs/08 ZoneType) — public, terrain-like. */
  zoneType: string;
  governorId: string;
  governorKind: string;
  prosperity: number;
  morale: number;
  population: number;
  /** Present on per-viewer filtered views (ACCURATE | FUZZY | UNKNOWN). */
  intel?: IntelGrade;
  /** Development levels per track — own parcels or ACCURATE intel only (F4). */
  development?: Record<string, number>;
  /** E3 enrichment pool (ct_units) — own parcels or ACCURATE intel only. */
  enrichmentPool?: number;
  /**
   * E4 raze preview — OWN parcels only: salvage (ct_units) recovered for
   * razing the TOP level of each track right now (0 when the track is level 0).
   */
  razeSalvage?: Record<string, number>;
  /** Full garrison detail — own parcels or ACCURATE intel only. */
  garrison?: {
    armyId: string;
    governorId: string;
    troops: number;
    /** Wild-monster display name (roster-flavored), when the garrison is a monster. */
    monsterName?: string;
  };
  /** FUZZY intel: a garrison is present, strength known only as a band. */
  garrisonBand?: {
    governorId: string;
    band: { lo: number; hi: number };
    monsterName?: string;
  };
  overseerId?: string;
}

export interface ArmyView {
  id: string;
  /**
   * Delta tombstone: the army left the viewer's intel — drop it from the map.
   * All other fields absent when set.
   */
  hidden?: true;
  /** Present on per-viewer filtered views. */
  intel?: IntelGrade;
  governorId?: string;
  /** GARRISON | MARCHING | DISBANDED (DISBANDED views appear once in deltas so clients can drop them). */
  state?: string;
  parcelId?: string;
  hexId?: string;
  troops?: number;
  morale?: number;
  units?: { unitClass: string; count: number }[];
  strength?: number;
  /** FUZZY intel: strength known only as a deterministic band. */
  strengthBand?: { lo: number; hi: number };
  /**
   * E2: present while the army is MUSTERING (training queue nonempty) — own
   * armies or ACCURATE intel (a scout can see a half-empty camp). troops/units
   * above report the soldiers trained SO FAR.
   */
  mustering?: { remainingTroops: number; ratePerTick: number; readyTick: number };
  /** Carried battle logistics (docs/04 §7c) — OWN armies only. */
  provisions?: { food: number; gold: number; wood: number };
  /** Food burned per adjacency step while MARCHING — OWN armies only. */
  foodPerStep?: number;
  heroId?: string;
  heroName?: string;
  monsterName?: string;
  /** Remaining march path as parcelIds — OWN armies only. */
  path?: string[];
  /** Tick the army steps onto path[0] — OWN armies only. */
  nextArrivalTick?: number;
  /** Tick the army reaches the final parcel of its path — OWN armies only. */
  etaTick?: number;
}

export interface BattleView {
  id: string;
  parcelId: string;
  resolvedTick: number;
  winner: string;
  /** Present on per-viewer filtered views. */
  intel?: IntelGrade;
  attackerGovernorIds: string[];
  defenderGovernorIds: string[];
  /** Exact scores — participants or ACCURATE intel only. */
  attackerScore?: number;
  defenderScore?: number;
  /** FUZZY intel: scores as deterministic bands. */
  scoreBands?: { attacker: { lo: number; hi: number }; defender: { lo: number; hi: number } };
  /** armyId → soldiers lost (includes scatter losses) — participants/ACCURATE only. */
  casualties?: Record<string, number>;
  /** docs/04 §7c.6 outcome kind — participants/ACCURATE only. */
  outcome?: 'DECISIVE_ATTACKER' | 'DECISIVE_DEFENDER' | 'TIE';
  /** Retreat resolution per failed/tied attacker army — participants/ACCURATE only. */
  retreats?: {
    armyId: string;
    governorId: string;
    result: 'RETREATED' | 'SCATTERED' | 'DISBANDED';
    toParcelId?: string;
  }[];
  /** Endurance/structure terms — participants/ACCURATE only. */
  logistics?: {
    commandCenterTier: number;
    structureBonus: number;
    attackerEndurance: number;
    defenderEndurance: number;
    attackerFoodConsumed: number;
    defenderFoodConsumed: number;
    goldSpent: number;
    woodSpent: number;
  };
  territoryOutcome?: string;
  postVictoryAction?: string;
  lootCt?: number;
  /** Present only for the winner who still has to pick PILLAGE | OCCUPY. */
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

/** Stable float rounding for view JSON (endurance multipliers etc.). */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

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

/** Viewer's grade at a hex; omniscient (no context) reads as ACCURATE. */
function gradeAt(viewer: ViewerContext | undefined, hexId: string): IntelGrade {
  if (viewer === undefined) return 'ACCURATE';
  return intelGrade(viewer.grades, hexId);
}

export function territoryView(
  state: WorldState,
  t: Territory,
  parcelByHex: ParcelIndex,
  balance: Balance,
  viewer?: ViewerContext,
): TerritoryView {
  const hexId = t.hexIds[0]!;
  const parcelId = parcelByHex.get(hexId) ?? t.id;
  const own = viewer !== undefined && viewer.governorId !== undefined && t.governorId === viewer.governorId;
  const grade: IntelGrade = own ? 'ACCURATE' : gradeAt(viewer, hexId);

  const view: TerritoryView = {
    id: t.id,
    parcelId,
    name: t.name,
    zoneType: t.zoneType,
    governorId: t.governorId,
    governorKind: t.governorKind,
    prosperity: t.prosperity,
    morale: t.morale,
    population: t.population,
  };
  if (viewer !== undefined) view.intel = grade;

  const g = t.garrisonArmyId === undefined ? undefined : state.armies.get(t.garrisonArmyId);
  const live = g !== undefined && g.state !== 'DISBANDED' ? g : undefined;

  if (grade === 'ACCURATE') {
    view.development = { ...t.development };
    const pool = state.enrichmentPools?.get(t.id) ?? 0;
    if (pool > 0) view.enrichmentPool = pool;
    if (own || viewer === undefined) {
      const salvage: Record<string, number> = {};
      for (const track of DEVELOPMENT_TRACKS) {
        const level = t.development[track as DevelopmentTrack];
        salvage[track] =
          level > 0 ? Math.floor(developCostCtUnits(track as DevelopmentTrack, level - 1, balance) * balance.economy.razeSalvagePct) : 0;
      }
      view.razeSalvage = salvage;
    }
    if (live !== undefined) {
      view.garrison = {
        armyId: live.id,
        governorId: live.ownerGovernorId,
        troops: live.units.reduce((n, s) => n + s.count, 0),
        ...(state.monsterNames?.has(live.id) === true ? { monsterName: state.monsterNames.get(live.id)! } : {}),
      };
    }
    if (t.overseerId !== undefined) view.overseerId = t.overseerId;
  } else if (grade === 'FUZZY' && live !== undefined) {
    view.garrisonBand = {
      governorId: live.ownerGovernorId,
      band: fuzzyBand(armyStrength(live, balance), parcelId, viewer?.period ?? 0, balance.intel.fuzzyBandPct),
      ...(state.monsterNames?.has(live.id) === true ? { monsterName: state.monsterNames.get(live.id)! } : {}),
    };
  }
  return view;
}

export function armyView(
  state: WorldState,
  a: Army,
  parcelByHex: ParcelIndex,
  balance: Balance,
  options?: TickOptions,
  viewer?: ViewerContext,
): ArmyView | undefined {
  const parcelId = parcelByHex.get(a.hexId) ?? a.hexId;
  const own = viewer !== undefined && viewer.governorId !== undefined && a.ownerGovernorId === viewer.governorId;
  const grade: IntelGrade = own ? 'ACCURATE' : gradeAt(viewer, a.hexId);
  if (viewer !== undefined && !own && grade === 'UNKNOWN') return undefined;

  const monsterName = state.monsterNames?.get(a.id);

  if (viewer !== undefined && !own && grade === 'FUZZY') {
    return {
      id: a.id,
      intel: 'FUZZY',
      governorId: a.ownerGovernorId,
      state: a.state,
      parcelId,
      hexId: a.hexId,
      strengthBand: fuzzyBand(armyStrength(a, balance), parcelId, viewer.period, balance.intel.fuzzyBandPct),
      ...(monsterName !== undefined ? { monsterName } : {}),
    };
  }

  const view: ArmyView = {
    id: a.id,
    governorId: a.ownerGovernorId,
    state: a.state,
    parcelId,
    hexId: a.hexId,
    troops: a.units.reduce((n, s) => n + s.count, 0),
    morale: a.morale,
    units: a.units.map((s) => ({ unitClass: s.unitClass, count: s.count })),
    strength: Math.round(armyStrength(a, balance)),
  };
  if (viewer !== undefined) view.intel = grade;
  // E2: surface the training queue while mustering (own or ACCURATE views).
  const queue = state.trainingQueues?.get(a.id);
  if (queue !== undefined) {
    const remainingTroops = queue.remaining.reduce((n, s) => n + s.count, 0);
    if (remainingTroops > 0) {
      view.mustering = {
        remainingTroops,
        ratePerTick: queue.ratePerTick,
        readyTick: state.world.tick + Math.ceil(remainingTroops / queue.ratePerTick),
      };
    }
  }
  if (a.heroId !== undefined) {
    view.heroId = a.heroId;
    const officer = state.officers?.get(a.ownerGovernorId)?.find((o) => o.id === a.heroId);
    if (officer !== undefined) view.heroName = officer.name;
  }
  if (monsterName !== undefined) view.monsterName = monsterName;

  // Logistics + intent are private: own armies (or omniscient views) only.
  if (own || viewer === undefined) {
    view.provisions = { ...a.provisions };
    view.foodPerStep = marchFoodPerStep(a, balance);
    if (a.state === 'MARCHING' && a.path !== undefined && a.arrivalTick !== undefined) {
      view.path = a.path.map((h) => parcelByHex.get(h) ?? h);
      view.nextArrivalTick = a.arrivalTick;
      let eta = a.arrivalTick;
      for (let i = 1; i < a.path.length; i++) eta += stepTicks(state, a.path[i]!, options);
      view.etaTick = eta;
    }
  }
  return view;
}

export function battleView(
  state: WorldState,
  b: BattleInstance,
  parcelByHex: ParcelIndex,
  balance: Balance,
  viewer?: ViewerContext,
): BattleView | undefined {
  const owners = (armyIds: readonly string[]): string[] =>
    [...new Set(armyIds.map((id) => state.armies.get(id)?.ownerGovernorId ?? 'unknown'))].sort();
  const parcelId = parcelByHex.get(b.hexId) ?? b.hexId;
  const attackerGovernorIds = owners(b.attackerArmyIds);
  const defenderGovernorIds = owners(b.defenderArmyIds);
  const participant =
    viewer?.governorId !== undefined &&
    (attackerGovernorIds.includes(viewer.governorId) || defenderGovernorIds.includes(viewer.governorId));
  // Battles the viewer participates in are always ACCURATE (brief F1).
  const grade: IntelGrade = viewer === undefined || participant ? 'ACCURATE' : gradeAt(viewer, b.hexId);
  if (viewer !== undefined && grade === 'UNKNOWN') return undefined;

  const view: BattleView = {
    id: b.id,
    parcelId,
    resolvedTick: b.result?.resolvedTick ?? b.scheduledStartTick,
    winner: b.result?.winner ?? 'UNRESOLVED',
    attackerGovernorIds,
    defenderGovernorIds,
  };
  if (viewer !== undefined) view.intel = grade;

  if (viewer !== undefined && grade === 'FUZZY') {
    view.scoreBands = {
      attacker: fuzzyBand(b.warScore?.attacker ?? 0, `${parcelId}:atk`, viewer.period, balance.intel.fuzzyBandPct),
      defender: fuzzyBand(b.warScore?.defender ?? 0, `${parcelId}:def`, viewer.period, balance.intel.fuzzyBandPct),
    };
    if (b.result?.territoryOutcome !== undefined) view.territoryOutcome = b.result.territoryOutcome;
    return view;
  }

  view.attackerScore = Math.round(b.warScore?.attacker ?? 0);
  view.defenderScore = Math.round(b.warScore?.defender ?? 0);
  view.casualties = b.result?.casualties ?? {};
  const logi = state.battleLogistics?.get(b.id);
  if (logi !== undefined) {
    view.outcome = logi.outcomeKind;
    view.retreats = logi.retreats.map((r) => ({
      armyId: r.armyId,
      governorId: state.armies.get(r.armyId)?.ownerGovernorId ?? 'unknown',
      result: r.result,
      ...(r.toHexId !== undefined ? { toParcelId: parcelByHex.get(r.toHexId) ?? r.toHexId } : {}),
    }));
    view.logistics = {
      commandCenterTier: logi.commandCenterTier,
      structureBonus: logi.structureBonus,
      attackerEndurance: round3(logi.attackerEndurance),
      defenderEndurance: round3(logi.defenderEndurance),
      attackerFoodConsumed: logi.attackerFoodConsumed,
      defenderFoodConsumed: logi.defenderFoodConsumed,
      goldSpent: logi.goldSpent,
      woodSpent: logi.woodSpent,
    };
  }
  if (b.result?.territoryOutcome !== undefined) view.territoryOutcome = b.result.territoryOutcome;
  if (b.result?.postVictoryAction !== undefined) view.postVictoryAction = b.result.postVictoryAction;
  if (b.result?.lootCt !== undefined) view.lootCt = b.result.lootCt;
  const choice = state.pendingChoices?.get(b.id);
  // The pending choice is the winner's private decision.
  if (choice !== undefined && (viewer === undefined || viewer.governorId === choice.governorId)) {
    view.pendingChoice = {
      governorId: choice.governorId,
      territoryId: choice.territoryId,
      expiresTick: choice.expiresTick,
    };
  }
  return view;
}
