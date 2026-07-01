/**
 * seedWorld — deterministic tiny test world for engine development & tests.
 * NOT the production worldgen (roadmap T5 grows this to ~200 hexes / 12
 * territories). Everything derives from the injected Rng: same (config, seed)
 * → bit-identical world (AGENTS.md prime directive 6).
 *
 * Layout: 2 regions × 6 hexes (axial rows), 4 territories across ZoneTypes,
 * each 1:1 with a system-owned LandNFT (invariant 2), 2 NPC-kingdom governors,
 * 1 garrisoned army on a valid hex (invariant 8).
 */
import {
  type Army,
  CONSTANTS,
  type GovernorKind,
  type Hex,
  type HexTerrain,
  type LandNFT,
  type Region,
  type Rng,
  type Territory,
  type World,
  type ZoneType,
  loadBalance,
  newId,
} from '@clashfront/shared';
import type { WorldState } from './state';

export interface SeedConfig {
  name: string;
  /** World seed string — recorded on World.seed for replay (08 §4). */
  seed: string;
}

interface TerritorySpec {
  name: string;
  zoneType: ZoneType;
  region: 0 | 1;
  hexes: number[]; // indices into that region's hex list
  population: number;
  development: Territory['development'];
  supplySource: boolean;
}

const NPC_KINGDOM: GovernorKind = 'NPC_KINGDOM';

// Fixed deterministic geography: 2 rows of 6 axial hexes. Terrains chosen so all
// army-relevant hexes are passable land (01 §1).
const REGION_TERRAIN: readonly (readonly HexTerrain[])[] = [
  ['PLAINS', 'PLAINS', 'FOREST', 'HILLS', 'RIVER', 'PLAINS'],
  ['PLAINS', 'ROAD', 'PLAINS', 'HILLS', 'COAST', 'OCEAN'],
];

const TERRITORY_SPECS: readonly TerritorySpec[] = [
  {
    name: 'Aldershot', zoneType: 'VILLAGE', region: 0, hexes: [0, 1], population: 3_000,
    development: { AGRICULTURE: 3, ECONOMY: 1, DEFENSE: 0, MILITARY: 0 }, supplySource: false,
  },
  {
    name: 'Greyspire', zoneType: 'FORTRESS', region: 0, hexes: [3], population: 2_000,
    development: { AGRICULTURE: 1, ECONOMY: 0, DEFENSE: 3, MILITARY: 2 }, supplySource: true,
  },
  {
    name: 'Azure Bay', zoneType: 'TOWN', region: 1, hexes: [1, 2], population: 8_000,
    development: { AGRICULTURE: 2, ECONOMY: 3, DEFENSE: 1, MILITARY: 1 }, supplySource: false,
  },
  {
    name: 'Coronet', zoneType: 'CAPITAL', region: 1, hexes: [3], population: 15_000,
    development: { AGRICULTURE: 2, ECONOMY: 4, DEFENSE: 2, MILITARY: 2 }, supplySource: true,
  },
];

export function seedWorld(config: SeedConfig, rng: Rng): WorldState {
  const balance = loadBalance();
  // Deterministic ids: time component = 0 (sim time starts at tick 0), randomness
  // from a dedicated fork so id generation never perturbs other streams.
  const idRng = rng.fork('ids');
  const mkId = (prefix: Parameters<typeof newId>[0]) =>
    newId(prefix, { time: 0, random: () => idRng.next() });

  const world: World = {
    id: mkId('world'),
    name: config.name,
    seed: config.seed,
    tick: 0,
    startedAt: 0, // sim time origin; wall-clock is bound at deploy, never inside the sim
  };

  const governorIds = [mkId('npc'), mkId('npc')] as const; // 2 NPC-kingdom governors

  const regions = new Map<string, Region>();
  const hexes = new Map<string, Hex>();
  const regionList: Region[] = [];

  for (let r = 0; r < 2; r++) {
    const region: Region = {
      id: mkId('region'),
      worldId: world.id,
      name: r === 0 ? 'Northmarch' : 'Southreach',
      hexIds: [],
    };
    for (let q = 0; q < 6; q++) {
      const terrain = REGION_TERRAIN[r]![q]!;
      const hex: Hex = {
        id: mkId('hex'),
        worldId: world.id,
        q,
        r,
        terrain,
        moveCost: balance.travel.moveCostByTerrain[terrain],
        nodeIds: [],
      };
      hexes.set(hex.id, hex);
      region.hexIds.push(hex.id);
    }
    regions.set(region.id, region);
    regionList.push(region);
  }

  const territories = new Map<string, Territory>();
  const landNfts = new Map<string, LandNFT>();

  for (const spec of TERRITORY_SPECS) {
    const region = regionList[spec.region]!;
    const terrId = mkId('terr');
    const nftId = mkId('nft');
    const hexIds = spec.hexes.map((i) => region.hexIds[i]!);
    for (const hexId of hexIds) hexes.get(hexId)!.territoryId = terrId;

    const territory: Territory = {
      id: terrId,
      worldId: world.id,
      regionId: region.id,
      name: spec.name,
      zoneType: spec.zoneType,
      hexIds,
      landNftId: nftId,
      governorId: governorIds[spec.region],
      governorKind: NPC_KINGDOM,
      population: spec.population,
      foodStock: spec.population, // ~10 days of stock at 0.1 food/pop/day
      ctTreasury: 100 * CONSTANTS.CT_UNITS_PER_CT, // 100 CT starting treasury (integer ct_units)
      prosperity: rng.fork(`prosperity:${spec.name}`).int(45, 66),
      morale: rng.fork(`morale:${spec.name}`).int(55, 76),
      development: { ...spec.development },
      structures: [],
      supplySource: spec.supplySource,
      version: 1,
      updatedAt: 0,
    };
    territories.set(terrId, territory);

    // Invariant 2: 1 Territory ↔ 1 LandNFT, never orphaned. System-owned at genesis.
    landNfts.set(nftId, {
      id: nftId,
      territoryId: terrId,
      taxSplitLandlord: CONSTANTS.TAX_SPLIT_LANDLORD_DEFAULT,
    });

    if (spec.zoneType === 'CAPITAL') region.capitalTerritoryId = terrId;
  }

  // One garrisoned army at the FORTRESS (valid hex, invariant 8).
  const fortress = [...territories.values()].find((t) => t.zoneType === 'FORTRESS')!;
  const army: Army = {
    id: mkId('army'),
    worldId: world.id,
    ownerGovernorId: fortress.governorId,
    state: 'GARRISON',
    hexId: fortress.hexIds[0]!,
    units: [
      { unitClass: 'INFANTRY', count: 500, veterancy: 0, hp: 100 },
      { unitClass: 'ARCHER', count: 200, veterancy: 0, hp: 100 },
    ],
    supply: CONSTANTS.SUPPLY_MAX_DEFAULT,
    supplyMax: CONSTANTS.SUPPLY_MAX_DEFAULT,
    morale: 70,
    supplyTrainIds: [],
    version: 1,
  };
  fortress.garrisonArmyId = army.id;

  return {
    world,
    regions,
    hexes,
    territories,
    landNfts,
    armies: new Map([[army.id, army]]),
    battles: new Map(),
  };
}
