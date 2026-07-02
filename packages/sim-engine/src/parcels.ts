/**
 * Parcel importer — hexagone-city land snapshot (`data/parcels.json`) → canonical
 * `Hex`/`Territory`/`LandNFT`/`Region` (docs/08 §4), per CLAUDE.md next-step 1.
 *
 * Locked decisions honored (CLAUDE.md):
 *  1. The overworld map is FIXED — this importer never invents geometry; it converts
 *     the snapshotted hexagone-city footprint verbatim. Parcel sizes are PERMANENT.
 *  2. Terrain/biome overrides on the main map are designated later — hexes default to
 *     `defaultTerrain` ('PLAINS') unless the snapshot carries an explicit terrain.
 *  4. Estates (hexIds.length ≥ ESTATE_MIN_HEXES) fight as linked per-hex components —
 *     classification exposed via `isEstate()` (04 §7b).
 *
 * Determinism (AGENTS.md prime directive 6): all ids derive from the injected Rng and
 * a stable ordering (parcels sorted by parcelId, hexes by (q,r)), so the same
 * (snapshot, seed) is bit-for-bit reproducible.
 *
 * Economic genesis (population, food, treasuries, NPC governors) is worldgen's job
 * (roadmap T5), NOT the importer's: imported territories start dormant and
 * SYSTEM-governed. Invariants 2 (1 Territory ↔ 1 LandNFT) and 5–6 hold at genesis.
 */
import { readFileSync } from 'node:fs';
import {
  CONSTANTS,
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

// ── Snapshot format (data/parcels.json) ──────────────────────────────────────

/** One hex of a parcel's footprint, in axial coordinates (docs/08 `Hex.q/r`). */
export interface ParcelHex {
  q: number;
  r: number;
  /** Optional explicit terrain from the source map; omitted ⇒ `defaultTerrain`. */
  terrain?: HexTerrain;
}

/** One land parcel as snapshotted from the hexagone-city map. */
export interface ParcelRecord {
  /** Stable source id (marketplace parcel id / land-NFT token id as string). */
  parcelId: string;
  /** Display name, if the source has one. */
  name?: string;
  /** On-chain reference of the Land NFT, if known (docs/08 §1 on-chain refs). */
  chainId?: number;
  contract?: string;
  tokenId?: string;
  /** Source classification (`land_type` marketplace filter) — informational. */
  landType?: string;
  /** Source zone/district (`zone` marketplace filter) — becomes the Region grouping. */
  zone?: string;
  /** Landlord wallet at snapshot time — informational until player linking exists. */
  ownerAddress?: string;
  /** PERMANENT parcel footprint. 1 hex (smallest parcel) … ~10,000 (estate). */
  hexes: ParcelHex[];
}

/** Shape of `data/parcels.json` — see `data/README.md` for provenance rules. */
export interface ParcelsFile {
  /** Extraction provenance (source app/url/date) — informational, not simulated. */
  source?: { kind?: string; url?: string; extractedAt?: string; notes?: string };
  /** Only axial is supported; the snapshot tool must convert before writing. */
  coordinateSystem: 'axial';
  parcels: ParcelRecord[];
}

// ── Import options ───────────────────────────────────────────────────────────

export interface ImportParcelsOptions {
  /**
   * Source `zone` → canonical ZoneType. Unmatched zones fall back to 'VILLAGE'.
   * ❓ OPEN (CLAUDE.md): real zone/biome designations on the main map are a
   * product-owner decision — do not hardcode a "real" mapping here.
   */
  zoneTypeBySourceZone?: Record<string, ZoneType>;
  /** Terrain for hexes without explicit source terrain (locked decision 2). */
  defaultTerrain?: HexTerrain;
}

export interface ImportConfig {
  name: string;
  /** World seed string — recorded on World.seed for replay (08 §4). */
  seed: string;
}

/** Region name used for parcels whose snapshot carries no `zone`. */
export const UNZONED_REGION = 'Unzoned';

/**
 * Genesis governor for imported territories: SYSTEM-held until worldgen (T5)
 * assigns NPC kingdoms / players. Follows the `system:…` account convention
 * of docs/08 `LedgerEntry`. Territories are never orphaned of a governor.
 */
export const SYSTEM_GENESIS_GOVERNOR = 'system:genesis';

/** Estate classification per locked decision 4 / docs/08 `ESTATE_MIN_HEXES`. */
export function isEstate(territory: Pick<Territory, 'hexIds'>): boolean {
  return territory.hexIds.length >= CONSTANTS.ESTATE_MIN_HEXES;
}

// ── Validation ───────────────────────────────────────────────────────────────

function fail(msg: string): never {
  throw new Error(`parcels.json: ${msg}`);
}

/** Structural validation of a parsed parcels snapshot. Throws with a precise reason. */
export function parseParcelsFile(raw: unknown): ParcelsFile {
  if (typeof raw !== 'object' || raw === null) fail('not an object');
  const file = raw as Record<string, unknown>;
  if (file['coordinateSystem'] !== 'axial') {
    fail(`coordinateSystem must be "axial", got ${JSON.stringify(file['coordinateSystem'])}`);
  }
  if (!Array.isArray(file['parcels']) || file['parcels'].length === 0) {
    fail('parcels must be a non-empty array');
  }
  const seenParcelIds = new Set<string>();
  const seenHexes = new Set<string>(); // "q,r" — a hex belongs to exactly one parcel
  for (const p of file['parcels'] as unknown[]) {
    if (typeof p !== 'object' || p === null) fail('parcel entry is not an object');
    const parcel = p as Record<string, unknown>;
    const parcelId = parcel['parcelId'];
    if (typeof parcelId !== 'string' || parcelId.length === 0) {
      fail(`parcel with missing/empty parcelId: ${JSON.stringify(parcel).slice(0, 120)}`);
    }
    if (seenParcelIds.has(parcelId)) fail(`duplicate parcelId "${parcelId}"`);
    seenParcelIds.add(parcelId);
    const hexes = parcel['hexes'];
    if (!Array.isArray(hexes) || hexes.length === 0) {
      fail(`parcel "${parcelId}" must have a non-empty hexes array`);
    }
    for (const h of hexes as unknown[]) {
      if (typeof h !== 'object' || h === null) fail(`parcel "${parcelId}" has a non-object hex`);
      const { q, r } = h as Record<string, unknown>;
      if (!Number.isInteger(q) || !Number.isInteger(r)) {
        fail(`parcel "${parcelId}" hex coordinates must be integers, got (${q}, ${r})`);
      }
      const key = `${q},${r}`;
      if (seenHexes.has(key)) {
        fail(`hex (${key}) appears in more than one parcel (parcel "${parcelId}")`);
      }
      seenHexes.add(key);
    }
  }
  return raw as ParcelsFile;
}

/** Read + validate a parcels snapshot from disk (e.g. `data/parcels.json`). */
export function loadParcelsFile(path: string): ParcelsFile {
  return parseParcelsFile(JSON.parse(readFileSync(path, 'utf8')));
}

// ── Import ───────────────────────────────────────────────────────────────────

/**
 * Convert a validated parcels snapshot into a genesis WorldState:
 * one Territory + LandNFT per parcel (invariant 2), one Region per source zone,
 * every parcel hex a canonical Hex with `territoryId` back-reference.
 */
export function importParcels(
  file: ParcelsFile,
  config: ImportConfig,
  rng: Rng,
  options: ImportParcelsOptions = {},
): WorldState {
  parseParcelsFile(file); // revalidate: callers may hand-construct the object
  const balance = loadBalance();
  const defaultTerrain: HexTerrain = options.defaultTerrain ?? 'PLAINS';
  const zoneTypeMap = options.zoneTypeBySourceZone ?? {};

  // Deterministic ids: sim-time origin + dedicated fork (same pattern as seedWorld).
  const idRng = rng.fork('ids');
  const mkId = (prefix: Parameters<typeof newId>[0]) =>
    newId(prefix, { time: 0, random: () => idRng.next() });

  const world: World = {
    id: mkId('world'),
    name: config.name,
    seed: config.seed,
    tick: 0,
    startedAt: 0, // sim time origin; wall clock is bound at deploy, never inside the sim
  };

  // Stable processing order regardless of snapshot file order (determinism).
  const parcels = [...file.parcels].sort((a, b) => a.parcelId.localeCompare(b.parcelId));

  // One Region per distinct source zone, created in first-seen (sorted-parcel) order.
  const regions = new Map<string, Region>();
  const regionByZone = new Map<string, Region>();
  const regionFor = (zone: string | undefined): Region => {
    const name = zone ?? UNZONED_REGION;
    let region = regionByZone.get(name);
    if (region === undefined) {
      region = { id: mkId('region'), worldId: world.id, name, hexIds: [] };
      regionByZone.set(name, region);
      regions.set(region.id, region);
    }
    return region;
  };

  const hexes = new Map<string, Hex>();
  const territories = new Map<string, Territory>();
  const landNfts = new Map<string, LandNFT>();

  for (const parcel of parcels) {
    const region = regionFor(parcel.zone);
    const terrId = mkId('terr');
    const nftId = mkId('nft');

    const footprint = [...parcel.hexes].sort((a, b) => a.q - b.q || a.r - b.r);
    const hexIds: string[] = [];
    for (const cell of footprint) {
      const terrain = cell.terrain ?? defaultTerrain;
      const hex: Hex = {
        id: mkId('hex'),
        worldId: world.id,
        q: cell.q,
        r: cell.r,
        terrain,
        territoryId: terrId,
        moveCost: balance.travel.moveCostByTerrain[terrain],
        nodeIds: [],
      };
      hexes.set(hex.id, hex);
      hexIds.push(hex.id);
      region.hexIds.push(hex.id);
    }

    const territory: Territory = {
      id: terrId,
      worldId: world.id,
      regionId: region.id,
      name: parcel.name ?? `Parcel ${parcel.parcelId}`,
      zoneType: (parcel.zone !== undefined && zoneTypeMap[parcel.zone]) || 'VILLAGE',
      hexIds,
      landNftId: nftId,
      governorId: SYSTEM_GENESIS_GOVERNOR,
      governorKind: 'SYSTEM',
      // Dormant genesis — economic seeding is worldgen (T5), not import.
      population: 0,
      foodStock: 0,
      ctTreasury: 0,
      prosperity: 50,
      morale: 50,
      development: { AGRICULTURE: 0, ECONOMY: 0, DEFENSE: 0, MILITARY: 0 },
      structures: [],
      supplySource: false,
      lastTroddenTick: 0,
      overgrowth: 0,
      version: 1,
      updatedAt: 0,
    };
    territories.set(terrId, territory);

    // Invariant 2: 1 Territory ↔ 1 LandNFT, never orphaned. SYSTEM-owned until
    // the snapshot's ownerAddress is linked to a Player (platform integration).
    landNfts.set(nftId, {
      id: nftId,
      territoryId: terrId,
      chainId: parcel.chainId,
      contract: parcel.contract,
      tokenId: parcel.tokenId,
      sourceParcelId: parcel.parcelId,
      taxSplitLandlord: CONSTANTS.TAX_SPLIT_LANDLORD_DEFAULT,
    });
  }

  return {
    world,
    regions,
    hexes,
    territories,
    landNfts,
    armies: new Map(),
    battles: new Map(),
  };
}
