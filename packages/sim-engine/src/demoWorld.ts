/**
 * MVP demo world — docs/briefs/MVP-JULY7.md items 1+2.
 *
 * Loads `data/demo-world.json` (the real hexagon-city EDU-zone parcel graph
 * produced by scripts/build-demo-world.mjs) into a canonical WorldState:
 * 1 parcel = 1 Territory = 1 Hex node. Hexification is PUNTED per the brief —
 * the parcel graph plays the `Hex` role; `q`/`r` are display-rounded parcel
 * centers with NO axial-grid semantics, and the movement topology lives in
 * `WorldState.adjacency` (hexId → neighbor hexIds).
 *
 * Also provides the MVP order helpers the game server (brief item 3) drives:
 * `addGovernor`, `claimTerritory`, `raiseArmy`, `orderMarch`, `findPath`.
 *
 * Determinism (AGENTS.md prime directive 6): every id and every roll derives
 * from the injected Rng; same (demo-world.json, seed) ⇒ bit-identical world.
 */
import {
  type Army,
  CONSTANTS,
  type GovernorKind,
  type Hex,
  type LandNFT,
  type Region,
  type Rng,
  type Territory,
  type UnitClass,
  type UnitStack,
  type World,
  loadBalance,
  type Balance,
  newId,
} from '@clashfront/shared';
import { defaultProvisionsFor, provisionCostCtUnits, type ProvisionOrder } from './logistics';
import type { DemoOfficer, WorldState } from './state';
import { stepTicks, type TickOptions } from './tick';

// ── demo-world.json shape (emitted by scripts/build-demo-world.mjs) ──────────

export interface DemoParcel {
  parcelId: string;
  tokenId?: string;
  center: [number, number];
  polygon: [number, number][];
  neighbors: string[];
}

export interface DemoWorldFile {
  meta: {
    zone: string;
    sliceBBox: [number, number, number, number];
    generatedFrom: string;
    [k: string]: unknown;
  };
  parcels: DemoParcel[];
}

// ── Demo content ─────────────────────────────────────────────────────────────

/**
 * Wild-monster display names — the Monster rows of data/CHARACTER_ROSTER.csv
 * (delivered 2026-07-02; display names only, per brief item 5 "roster names").
 */
export const DEMO_MONSTER_NAMES: readonly string[] = [
  'Goblin', 'Goblin_Gold', 'Gnoll_01_Claw', 'Gnoll_02_AxeShield', 'Gnoll_02_MaceShield',
  'Gnoll_03_Dynamite', 'Gnoll_03_Spear', 'Elemental_Magic', 'Elemental_Knight', 'Golem',
  'Skell_Base', 'Skell_Bluto', 'Skell_Jodan', 'Skell_Kai', 'Skell_Magic', 'Skell_Robin',
  'Ep02_Ice_Gargoyle_Warrior', 'Ep02_Ice_Gargoyle_Warrior_Elite', 'Ep02_Ice_Wolf',
  'Ep02_Snowman_01_Archer', 'Ep02_Snowman_02_SpearShield_Elite', 'Ep02_Snowman_03_Warrior_Elite',
  'Ep02_Summon_Wolf', 'Ep03_KoboldsBomber_Warrior', 'Ep03_KoboldsMiner_Warrior',
  'Ep03_KoboldsSlave_Warrior', 'Ep03_Kobolds_MaceShield_Elite', 'Ep03_Kobolds_Magician',
  'Ep03_Kobolds_Swordshield', 'Ep03_MineMole_Warrior_Fire', 'Ep03_MineMole_Warrior_Elite_Fire',
  'Ep04_Lizard_StandofAttack_Fire', 'Ep04_Mummy_Archer_Fire', 'Ep04_Mummy_Magician_Fire',
  'Ep04_Mummy_Warrior_Fire', 'Ep05_Horus_Magician_Elite_Fire', 'Ep05_Minotaur',
  'Ep05_Statue_Griffin_Warrior', 'Ep05_Statue_Griffin_Warrior_Elite', 'Ep05_Statue_Lion_Warrior',
  'Ep05_Statue_Lion_Warrior_Elite', 'Ep06_Werewolf', 'Ep11_DogRobot_DF_Elite',
  'Ep11_Engineer_Gun_LR', 'Ep11_Engineer_Hammer_DF', 'Ep11_Engineer_Spanner_SR',
  'Ep11_HumanRobot_AX_SR', 'Ep11_HumanRobot_Armor_DF', 'Ep11_HumanRobot_Gun_LR_Elite',
];

/** Demo army presets (brief item 4 "one button, demo unit stacks"). Counts per UnitClass. */
export const DEMO_ARMY_PRESETS = {
  STANDARD: [
    { unitClass: 'INFANTRY', count: 100 },
    { unitClass: 'ARCHER', count: 60 },
    { unitClass: 'CAVALRY', count: 40 },
  ],
  SCOUTS: [{ unitClass: 'CAVALRY', count: 30 }],
} as const satisfies Record<string, readonly { unitClass: UnitClass; count: number }[]>;

export type DemoArmyPreset = keyof typeof DEMO_ARMY_PRESETS;

// ── World loading ────────────────────────────────────────────────────────────

export interface LoadDemoWorldOptions {
  name?: string;
  /** Recorded on World.seed for replay provenance; defaults to the rng's seed path. */
  seed?: string;
  /** Fraction of parcels seeded with a wild-monster garrison (0..1). */
  monsterParcelPct?: number;
}

/**
 * Build the genesis WorldState from a demo-world file. Every parcel becomes a
 * WILD, SYSTEM-governed Territory with its own 1-hex footprint and LandNFT
 * (invariant 2, sourceParcelId provenance). A share of parcels gets a wild
 * monster garrison — stronger the further from the slice center (brief item 2).
 */
export function loadDemoWorld(file: DemoWorldFile, rng: Rng, options: LoadDemoWorldOptions = {}): WorldState {
  const balance = loadBalance();
  const monsterPct = options.monsterParcelPct ?? 0.25;
  const idRng = rng.fork('ids');
  const mkId = (prefix: Parameters<typeof newId>[0]) =>
    newId(prefix, { time: 0, random: () => idRng.next() });

  const parcels = [...file.parcels].sort((a, b) => (a.parcelId < b.parcelId ? -1 : 1));
  if (parcels.length === 0) throw new Error('loadDemoWorld: empty parcel list');

  const world: World = {
    id: mkId('world'),
    name: options.name ?? `${file.meta.zone} demo world`,
    seed: options.seed ?? rng.seed,
    tick: 0,
    startedAt: 0, // sim time origin; wall clock is bound at deploy, never inside the sim
  };

  const region: Region = { id: mkId('region'), worldId: world.id, name: file.meta.zone, hexIds: [] };

  // The wild-monster governor: SYSTEM-kind, owns every wild garrison.
  const wildGovernorId = mkId('npc');

  const hexes = new Map<string, Hex>();
  const territories = new Map<string, Territory>();
  const landNfts = new Map<string, LandNFT>();
  const adjacency = new Map<string, string[]>();
  const hexIdByParcel = new Map<string, string>();

  for (const p of parcels) {
    const hex: Hex = {
      id: mkId('hex'),
      worldId: world.id,
      // Display-rounded parcel center — NO axial semantics (hexification punted,
      // brief "Hexification punt"). Topology = WorldState.adjacency.
      q: Math.round(p.center[0]),
      r: Math.round(p.center[1]),
      terrain: 'PLAINS', // extraction report §8: no terrain in source; worldgen default
      moveCost: balance.travel.moveCostByTerrain.PLAINS,
      nodeIds: [],
    };
    hexes.set(hex.id, hex);
    hexIdByParcel.set(p.parcelId, hex.id);
    region.hexIds.push(hex.id);

    const terrId = mkId('terr');
    const nftId = mkId('nft');
    hex.territoryId = terrId;
    const tRng = rng.fork(`terr:${p.parcelId}`);
    territories.set(terrId, {
      id: terrId,
      worldId: world.id,
      regionId: region.id,
      name: `${file.meta.zone} ${p.parcelId}`,
      zoneType: 'WILD', // brief OUT-list: no rewilding timers — wild parcels just START wild
      hexIds: [hex.id],
      landNftId: nftId,
      governorId: wildGovernorId,
      governorKind: 'SYSTEM',
      population: tRng.int(100, 401),
      foodStock: tRng.int(100, 401),
      ctTreasury: tRng.int(0, 51) * CONSTANTS.CT_UNITS_PER_CT, // 0–50 CT pillage bait
      prosperity: tRng.int(20, 51),
      morale: tRng.int(40, 71),
      development: { AGRICULTURE: 1, ECONOMY: 0, DEFENSE: 0, MILITARY: 0 },
      structures: [],
      supplySource: false,
      lastTroddenTick: 0,
      overgrowth: 0,
      version: 1,
      updatedAt: 0,
    });
    landNfts.set(nftId, {
      id: nftId,
      territoryId: terrId,
      sourceParcelId: p.parcelId, // import provenance (docs/08 §4 LandNFT)
      ...(p.tokenId !== undefined ? { tokenId: p.tokenId, chainId: 137 } : {}), // L3 = Polygon (extraction §4)
      taxSplitLandlord: CONSTANTS.TAX_SPLIT_LANDLORD_DEFAULT,
    });
  }

  // Adjacency: parcel graph → hexId graph (neighbor lists sorted for determinism).
  for (const p of parcels) {
    const hexId = hexIdByParcel.get(p.parcelId)!;
    const neigh = p.neighbors
      .map((n) => {
        const h = hexIdByParcel.get(n);
        if (h === undefined) throw new Error(`demo-world adjacency: neighbor ${n} of ${p.parcelId} missing`);
        return h;
      })
      .sort();
    adjacency.set(hexId, neigh);
  }

  // Wild monster garrisons: on monsterPct of parcels, stronger away from center.
  const cx = parcels.reduce((s, p) => s + p.center[0], 0) / parcels.length;
  const cy = parcels.reduce((s, p) => s + p.center[1], 0) / parcels.length;
  const maxDist = Math.max(
    1e-9,
    ...parcels.map((p) => Math.hypot(p.center[0] - cx, p.center[1] - cy)),
  );
  const armies = new Map<string, Army>();
  const monsterNames = new Map<string, string>();
  for (const p of parcels) {
    const mRng = rng.fork(`monster:${p.parcelId}`);
    if (mRng.next() >= monsterPct) continue;
    const scale = 0.5 + 1.5 * (Math.hypot(p.center[0] - cx, p.center[1] - cy) / maxDist);
    const hexId = hexIdByParcel.get(p.parcelId)!;
    const terr = territories.get(hexes.get(hexId)!.territoryId!)!;
    const units: UnitStack[] = [
      { unitClass: 'INFANTRY', count: Math.max(1, Math.floor(mRng.int(30, 81) * scale)), veterancy: 0, hp: 100 },
      { unitClass: 'ARCHER', count: Math.floor(mRng.int(0, 41) * scale), veterancy: 0, hp: 100 },
    ];
    const monsterTroops = units.reduce((n, s) => n + s.count, 0);
    const army: Army = {
      id: newId('army', { time: 0, random: () => idRng.next() }),
      worldId: world.id,
      ownerGovernorId: wildGovernorId,
      state: 'GARRISON',
      hexId,
      units,
      // Monsters live off the wild: rations only, no command-center budget
      // (defenders eat the territory foodStock in battle — docs/04 §7c.3).
      provisions: { food: monsterTroops * balance.provisions.defaultFoodPerSoldier, gold: 0, wood: 0 },
      supply: CONSTANTS.SUPPLY_MAX_DEFAULT,
      supplyMax: CONSTANTS.SUPPLY_MAX_DEFAULT,
      morale: 60,
      supplyTrainIds: [],
      version: 1,
    };
    armies.set(army.id, army);
    terr.garrisonArmyId = army.id;
    monsterNames.set(army.id, mRng.pick(DEMO_MONSTER_NAMES));
  }

  return {
    world,
    regions: new Map([[region.id, region]]),
    hexes,
    territories,
    landNfts,
    armies,
    battles: new Map(),
    adjacency,
    governorKinds: new Map([[wildGovernorId, 'SYSTEM' as GovernorKind]]),
    ctBalances: new Map([[wildGovernorId, 0]]),
    officers: new Map([[wildGovernorId, []]]),
    pendingChoices: new Map(),
    monsterNames,
    battleLogistics: new Map(),
  };
}

// ── Governors, claiming, armies, marching ────────────────────────────────────

export interface AddGovernorOptions {
  name: string;
  kind: Extract<GovernorKind, 'PLAYER' | 'NPC_KINGDOM'>;
  /** Starting CT wallet in ct_units. */
  ctUnits: number;
  /** Officer display names (demo Masters from data/CHARACTER_ROSTER.csv). */
  officerNames: readonly string[];
  /** Fame per officer (feeds the WarScore hero term). Default 200. */
  officerFame?: number;
}

/** Register a governor (player session / NPC kingdom) with wallet + officer pool. */
export function addGovernor(
  state: WorldState,
  rng: Rng,
  options: AddGovernorOptions,
): { governorId: string; officers: DemoOfficer[] } {
  const time = state.world.tick;
  const governorId = newId(options.kind === 'PLAYER' ? 'player' : 'npc', {
    time,
    random: () => rng.next(),
  });
  const officers: DemoOfficer[] = options.officerNames.map((name) => ({
    id: newId('hero', { time, random: () => rng.next() }),
    ownerGovernorId: governorId,
    name,
    fame: options.officerFame ?? 200,
  }));
  state.governorKinds ??= new Map();
  state.ctBalances ??= new Map();
  state.officers ??= new Map();
  state.governorKinds.set(governorId, options.kind);
  state.ctBalances.set(governorId, options.ctUnits);
  state.officers.set(governorId, officers);
  return { governorId, officers };
}

/**
 * Claim an unowned (SYSTEM-governed, garrison-free) territory — brief loop step 3.
 * PLAYER governors must have a free officer and stay under the oversight cap
 * (docs/01 §11.3); the officer is auto-assigned as overseer. The claimed parcel
 * becomes the governor's supply source (demo rule so home-raised armies are fed).
 */
/**
 * CT cost to claim `territoryId` for `governorId` (product owner 2026-07-02):
 * BFS distance from the governor's NEAREST holding; steps ≤ freeRadiusSteps are
 * free (the "immediate block"), each step beyond costs costCtUnitsPerStep.
 * A governor with NO holdings claims free anywhere (founding).
 */
export function claimCostCtUnits(
  state: WorldState,
  territoryId: string,
  governorId: string,
  balance: Balance = loadBalance(),
): number {
  const target = state.territories.get(territoryId);
  if (target === undefined || state.adjacency === undefined) return 0;
  const own = new Set(
    [...state.territories.values()].filter((t) => t.governorId === governorId).map((t) => t.hexIds[0]!),
  );
  if (own.size === 0) return 0; // founding claim
  // BFS outward from the target until we touch a holding.
  const start = target.hexIds[0]!;
  let frontier = [start];
  const seen = new Set(frontier);
  for (let d = 1; frontier.length > 0; d++) {
    const next: string[] = [];
    for (const h of frontier) {
      for (const n of state.adjacency.get(h) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        if (own.has(n)) {
          const over = d - balance.claims.freeRadiusSteps;
          return over > 0 ? over * balance.claims.costCtUnitsPerStep : 0;
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return Number.MAX_SAFE_INTEGER; // disconnected — effectively unclaimable remotely
}

export function claimTerritory(
  state: WorldState,
  territoryId: string,
  governorId: string,
  overseerId?: string,
  balance: Balance = loadBalance(),
): void {
  const t = state.territories.get(territoryId);
  if (t === undefined) throw new Error(`claimTerritory: unknown territory ${territoryId}`);
  if (t.governorKind !== 'SYSTEM') throw new Error(`claimTerritory: ${t.name} is already governed`);
  if (t.garrisonArmyId !== undefined) throw new Error(`claimTerritory: ${t.name} is occupied by wild monsters`);
  const kind = state.governorKinds?.get(governorId);
  if (kind === undefined) throw new Error(`claimTerritory: unregistered governor ${governorId}`);
  if (kind === 'PLAYER') {
    const overseen = [...state.territories.values()].filter(
      (x) => x.governorId === governorId && x.overseerId !== undefined,
    ).length;
    if (overseen >= CONSTANTS.MAX_OVERSEEN_TERRITORIES) {
      throw new Error(
        `claimTerritory: oversight cap reached (MAX_OVERSEEN_TERRITORIES=${CONSTANTS.MAX_OVERSEEN_TERRITORIES})`,
      );
    }
    const pool = state.officers?.get(governorId) ?? [];
    const free =
      overseerId !== undefined
        ? pool.find((o) => o.id === overseerId)
        : [...pool].sort((a, b) => (a.id < b.id ? -1 : 1)).find((o) => o.assignedTerritoryId === undefined);
    if (free === undefined) {
      throw new Error(
        overseerId !== undefined
          ? `claimTerritory: ${overseerId} is not an officer of this governor`
          : 'claimTerritory: no free officer to assign as overseer',
      );
    }
    if (free.assignedTerritoryId !== undefined) {
      throw new Error(`claimTerritory: ${free.name} already oversees a territory`);
    }
    free.assignedTerritoryId = t.id;
    t.overseerId = free.id;
  }
  // Distance-based claim cost (docs/02; adjacent block free). Charged for any
  // wallet-bearing governor (players AND NPC kingdoms — the AI pays too).
  const cost = claimCostCtUnits(state, territoryId, governorId, balance);
  if (cost > 0) {
    const bal = state.ctBalances?.get(governorId) ?? 0;
    if (bal < cost) {
      // roll back the overseer assignment made above before failing
      if (t.overseerId !== undefined) {
        const o = (state.officers?.get(governorId) ?? []).find((x) => x.id === t.overseerId);
        if (o !== undefined) delete o.assignedTerritoryId;
        delete t.overseerId;
      }
      throw new Error(
        `claimTerritory: too far from your lands — costs ${Math.floor(cost / 10_000)} CT (you have ${Math.floor(bal / 10_000)})`,
      );
    }
    state.ctBalances!.set(governorId, bal - cost);
  }
  t.governorId = governorId;
  t.governorKind = kind;
  t.supplySource = true;
  t.lastTroddenTick = state.world.tick;
  t.version += 1;
}

/** CT cost breakdown of raising a preset army: training + the standard provision pack (docs/04 §7c.1). */
export interface RaiseCostBreakdown {
  /** Training cost, ct_units (Σ trainCtUnitsPerSoldier × count). */
  unitsCtUnits: number;
  /** Standard provision pack cost, ct_units (⚙ balance.provisions defaults × prices). */
  provisionsCtUnits: number;
  totalCtUnits: number;
  /** The pack itself — what the army carries at raise. */
  provisions: ProvisionOrder;
}

/** Cost of raising `preset`, including its default provision pack. */
export function raiseCost(preset: DemoArmyPreset, balance = loadBalance()): RaiseCostBreakdown {
  const spec = DEMO_ARMY_PRESETS[preset];
  const unitsCtUnits = spec.reduce(
    (sum, s) => sum + balance.units.trainCtUnitsPerSoldier[s.unitClass] * s.count,
    0,
  );
  const troops = spec.reduce((n, s) => n + s.count, 0);
  const provisions = defaultProvisionsFor(troops, balance);
  const provisionsCtUnits = provisionCostCtUnits(provisions, balance);
  return { unitsCtUnits, provisionsCtUnits, totalCtUnits: unitsCtUnits + provisionsCtUnits, provisions };
}

/**
 * Raise an army from a demo preset in a territory the governor controls.
 * Cost = training (Σ balance.units.trainCtUnitsPerSoldier × count) + the
 * standard provision pack (docs/04 §7c.1 — the army marches out provisioned),
 * paid from the MVP per-governor CT wallet (no ledger — brief OUT list).
 * Throws (without mutating) on insufficient funds. Optional `heroId` puts one
 * of the governor's officers in command (feeds the WarScore hero term, capped
 * at HERO_IMPACT_MAX).
 */
export function raiseArmy(
  state: WorldState,
  territoryId: string,
  preset: DemoArmyPreset,
  rng: Rng,
  heroId?: string,
): Army {
  const t = state.territories.get(territoryId);
  if (t === undefined) throw new Error(`raiseArmy: unknown territory ${territoryId}`);
  const gov = t.governorId;
  const balance = loadBalance();
  const spec = DEMO_ARMY_PRESETS[preset];
  const cost = raiseCost(preset, balance);
  const wallet = state.ctBalances?.get(gov);
  if (wallet === undefined) throw new Error(`raiseArmy: governor ${gov} has no CT wallet`);
  if (wallet < cost.totalCtUnits) {
    throw new Error(`raiseArmy: insufficient CT (${wallet} < ${cost.totalCtUnits} ct_units)`);
  }
  if (heroId !== undefined) {
    const officer = state.officers?.get(gov)?.find((o) => o.id === heroId);
    if (officer === undefined) throw new Error(`raiseArmy: ${heroId} is not an officer of ${gov}`);
  }
  state.ctBalances!.set(gov, wallet - cost.totalCtUnits);

  const army: Army = {
    id: newId('army', { time: state.world.tick, random: () => rng.next() }),
    worldId: state.world.id,
    ownerGovernorId: gov,
    ...(heroId !== undefined ? { heroId } : {}),
    state: 'GARRISON',
    hexId: t.hexIds[0]!,
    units: spec.map((s) => ({ unitClass: s.unitClass, count: s.count, veterancy: 0, hp: 100 })),
    provisions: { ...cost.provisions },
    supply: CONSTANTS.SUPPLY_MAX_DEFAULT,
    supplyMax: CONSTANTS.SUPPLY_MAX_DEFAULT,
    morale: 70,
    supplyTrainIds: [],
    version: 1,
  };
  state.armies.set(army.id, army);
  if (t.garrisonArmyId === undefined) t.garrisonArmyId = army.id;
  return army;
}

/**
 * Order an army to march along `path` (consecutive adjacency-graph hexIds,
 * excluding the current hex). First-step arrival = current tick + step time of
 * the first hex (travelTicksPerStep × moveCost). Movement resolves in the
 * MOVEMENT phase; hostile arrival spawns a battle the same tick it lands.
 */
export function orderMarch(state: WorldState, armyId: string, path: readonly string[], options?: TickOptions): void {
  const a = state.armies.get(armyId);
  if (a === undefined || a.state === 'DISBANDED') throw new Error(`orderMarch: no such army ${armyId}`);
  if (path.length === 0) throw new Error('orderMarch: empty path');
  if (state.adjacency === undefined) throw new Error('orderMarch: world has no adjacency graph');
  let from = a.hexId;
  for (const hexId of path) {
    const neigh = state.adjacency.get(from);
    if (neigh === undefined || !neigh.includes(hexId)) {
      throw new Error(`orderMarch: ${hexId} is not adjacent to ${from}`);
    }
    from = hexId;
  }
  // Leaving home: hand the garrison slot back.
  const here = state.hexes.get(a.hexId)?.territoryId;
  if (here !== undefined) {
    const t = state.territories.get(here);
    if (t?.garrisonArmyId === a.id) delete t.garrisonArmyId;
  }
  a.state = 'MARCHING';
  a.path = [...path];
  a.arrivalTick = state.world.tick + stepTicks(state, path[0]!, options);
  a.version += 1;
}

/**
 * Deterministic BFS shortest path over the parcel adjacency graph.
 * Returns hexIds from (exclusive) `fromHexId` to (inclusive) `toHexId`,
 * or undefined if unreachable. Neighbor order is the stored sorted order,
 * so equal-length paths tie-break identically on every run.
 */
/**
 * True if `hexId`'s territory is hostile ground for `governorId`: an armed
 * garrison (wild monsters or another governor's troops) holds it. Product-owner
 * rule (2026-07-02): armies cannot walk PAST enemies — hostile parcels never
 * appear mid-path; they may only be a march's FINAL destination (= attack).
 * Own/allied-garrison and empty parcels are passable.
 */
export function isHostileGround(state: WorldState, hexId: string, governorId: string): boolean {
  const t = [...state.territories.values()].find((x) => x.hexIds[0] === hexId);
  if (t === undefined) return false;
  if (t.garrisonArmyId === undefined) return false;
  const g = state.armies.get(t.garrisonArmyId);
  return g !== undefined && g.state !== 'DISBANDED' && g.ownerGovernorId !== governorId;
}

export function findPath(
  state: WorldState,
  fromHexId: string,
  toHexId: string,
  governorId?: string,
): string[] | undefined {
  if (state.adjacency === undefined) throw new Error('findPath: world has no adjacency graph');
  if (fromHexId === toHexId) return [];
  // Hostile-held parcels block transit (see isHostileGround) — traversable only
  // as the terminal node. No governorId = raw geometric path (internal callers).
  const blocked = (h: string): boolean =>
    governorId !== undefined && h !== toHexId && isHostileGround(state, h, governorId);
  const prev = new Map<string, string>();
  const queue = [fromHexId];
  const seen = new Set([fromHexId]);
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    for (const n of state.adjacency.get(cur) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (blocked(n)) continue;
      prev.set(n, cur);
      if (n === toHexId) {
        const path: string[] = [n];
        let p = cur;
        while (p !== fromHexId) {
          path.push(p);
          p = prev.get(p)!;
        }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return undefined;
}
