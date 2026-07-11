/**
 * Battlefield JSON (docs/briefs/BATTLEFIELD-SCHEMA.md — the A1 map contract) —
 * server-side loader + playability validator for the INTERIM stand-in maps.
 *
 * Until the map-generator lands (briefs/MAP-GENERATOR.md) every battle uses a
 * standard MOBA-style map (data/moba-maps/*.json). The match server/bridge may
 * ship the REAL exported map per battle; when it does, it takes precedence and
 * these stand-ins are unused (ALLOCATE-CALLBACK-SCHEMA.md §1a). Both consumers
 * render the SAME schema, so the swap is seamless.
 *
 * Coordinates are schema-canonical: dimensionless WORLD-UNITS (the fixed ±161
 * frame, sizeM 322; ~0.74 m/unit by the declared 14-acre parcel mapping —
 * BATTLEFIELD-SCHEMA "scale declaration"), origin at arena CENTRE (0,0), x =
 * east, z = north; consumed AS-IS (no ×MAPK). The CF viewer translates to its
 * [0,size]² space with the shared mobaToViewer convention.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Vec2 = [number, number];

export interface BattlefieldObstacle {
  id?: string;
  kind: string;
  x?: number;
  z?: number;
  r?: number;
  footprint?: Vec2[];
  /** false ⇒ blocks pathing (walkability). Missing ⇒ treated as impassable for radius/footprint kinds. */
  passable?: boolean;
}

export interface BattlefieldStructure {
  anchorId: string;
  kind: string;
  side?: 'ATTACKER' | 'DEFENDER';
  x: number;
  z: number;
  hp?: number;
  hpMax?: number;
}

export interface Battlefield {
  v?: number;
  _placeholder?: string;
  meta?: Record<string, unknown> & { seed?: string; biome?: string; sizeM?: number; laneCount?: number };
  arena: { shape?: string; sizeM: number; bounds: Vec2[] };
  obstacles?: BattlefieldObstacle[];
  resources?: { id?: string; kind: string; x: number; z: number; richness?: number }[];
  buildSpots?: { anchorId: string; x: number; z: number; size?: string; side?: string }[];
  spawnZones?: { id?: string; side?: 'ATTACKER' | 'DEFENDER'; edge?: string; x: number; z: number }[];
  lanes?: { id?: string; side?: string; waypoints: Vec2[] }[];
  structures?: BattlefieldStructure[];
  mobs?: { id?: string; kind: string; x: number; z: number; count?: number }[];
  thumbnail?: string;
}

// ── Geometry helpers (shared with the passability rule) ──────────────────────

function pointInPoly(poly: readonly Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** An obstacle blocks pathing iff passable !== true and it has a radius or footprint. */
function isImpassable(o: BattlefieldObstacle): boolean {
  if (o.passable === true) return false;
  return (typeof o.r === 'number' && o.r > 0) || (Array.isArray(o.footprint) && o.footprint.length >= 3);
}

function insideObstacle(o: BattlefieldObstacle, x: number, z: number): boolean {
  if (typeof o.r === 'number' && typeof o.x === 'number' && typeof o.z === 'number') {
    return Math.hypot(x - o.x, z - o.z) <= o.r;
  }
  if (Array.isArray(o.footprint) && o.footprint.length >= 3) return pointInPoly(o.footprint, x, z);
  return false;
}

/** The shared walkability rule (BATTLEFIELD-SCHEMA "Passability rule"). */
export function isWalkable(bf: Battlefield, x: number, z: number): boolean {
  if (!pointInPoly(bf.arena.bounds, x, z)) return false;
  for (const o of bf.obstacles ?? []) {
    if (isImpassable(o) && insideObstacle(o, x, z)) return false;
  }
  return true;
}

function segmentWalkable(bf: Battlefield, a: Vec2, b: Vec2, stepM = 2): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(len / stepM));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!isWalkable(bf, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
}

// ── The 5 playability invariants (BATTLEFIELD-SCHEMA "Validation invariants") ─

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const BASE_CLEAR_M = 14; // ⚙ invariant 4 base clear radius around a CORE

export function validateBattlefield(bf: Battlefield): ValidationResult {
  const errors: string[] = [];
  if (!bf.arena || !Array.isArray(bf.arena.bounds) || bf.arena.bounds.length < 3) {
    return { ok: false, errors: ['arena.bounds must be a polygon of ≥3 points'] };
  }

  // Invariant 1 — every spawnZone reaches its side's base via a walkable corridor.
  for (const sp of bf.spawnZones ?? []) {
    if (!isWalkable(bf, sp.x, sp.z)) {
      errors.push(`spawnZone ${sp.id ?? '?'} sits on unwalkable ground`);
      continue;
    }
    const core = (bf.structures ?? []).find((s) => s.kind === 'CORE' && s.side === sp.side);
    if (core && !segmentWalkable(bf, [sp.x, sp.z], [core.x, core.z])) {
      errors.push(`spawnZone ${sp.id ?? '?'} has no walkable corridor to its ${sp.side} base`);
    }
  }

  // Invariant 2 — every lane pathable end-to-end.
  for (const lane of bf.lanes ?? []) {
    const wp = lane.waypoints ?? [];
    for (let i = 1; i < wp.length; i++) {
      if (!segmentWalkable(bf, wp[i - 1]!, wp[i]!)) {
        errors.push(`lane ${lane.id ?? '?'} is blocked between waypoint ${i - 1} and ${i}`);
        break;
      }
    }
  }

  // Invariant 3 — buildSpots, resources, structures, mobs on walkable ground.
  const onGround = (label: string, x: number, z: number): void => {
    if (!isWalkable(bf, x, z)) errors.push(`${label} at (${x},${z}) is not on walkable ground`);
  };
  for (const b of bf.buildSpots ?? []) onGround(`buildSpot ${b.anchorId}`, b.x, b.z);
  for (const r of bf.resources ?? []) onGround(`resource ${r.id ?? r.kind}`, r.x, r.z);
  for (const s of bf.structures ?? []) onGround(`structure ${s.anchorId}`, s.x, s.z);
  for (const m of bf.mobs ?? []) onGround(`mob ${m.id ?? m.kind}`, m.x, m.z);

  // Invariant 4 — base clear radius around each CORE.
  for (const core of (bf.structures ?? []).filter((s) => s.kind === 'CORE')) {
    for (const o of bf.obstacles ?? []) {
      if (!isImpassable(o)) continue;
      let near = false;
      if (typeof o.r === 'number' && typeof o.x === 'number' && typeof o.z === 'number') {
        near = Math.hypot(core.x - o.x, core.z - o.z) - o.r < BASE_CLEAR_M;
      } else if (Array.isArray(o.footprint)) {
        near = o.footprint.some((p) => Math.hypot(core.x - p[0], core.z - p[1]) < BASE_CLEAR_M);
      }
      if (near) { errors.push(`CORE ${core.anchorId} base area is not clear of obstacle ${o.id ?? o.kind}`); break; }
    }
  }

  // Invariant 5 — deterministic (proxy: a stable seed is declared; the file is static).
  if (typeof bf.meta?.seed !== 'string' || bf.meta.seed === '') {
    errors.push('meta.seed must be a non-empty string (determinism)');
  }

  return { ok: errors.length === 0, errors };
}

// ── Stand-in loader (data/moba-maps/*.json) ──────────────────────────────────

// Walk up from __dirname to the repo root and return data/<sub> (works from src/ and dist/).
function resolveDataSubdir(sub: string): string {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'data', sub);
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) && existsSync(candidate)) return candidate;
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(__dirname, '..', '..', '..', '..', 'data', sub);
}

function resolveMapsDir(): string {
  const override = process.env['CF_MOBA_MAPS_DIR'];
  if (override !== undefined && override !== '') return override;
  return resolveDataSubdir('moba-maps');
}

// ── Per-parcel CF maps (the real designed battlefield) ───────────────────────
// The map service (map-service/) generates a per-parcel A1 Battlefield (raster →
// §3 command_converter) and serves it at /internal/v1/designs/<id>/command.json.
// An operator (or a small sync) drops these A1 files on the box as
// <CF_PARCEL_MAPS_DIR>/<parcelId>.json (default data/cf-maps/parcels/); when
// present + valid, CF prefers the parcel's OWN map over the standard stand-in.
// Absent/invalid ⇒ undefined ⇒ caller falls back to loadStandbyBattlefield.
// NOTE: CF-generated per-parcel maps live under data/cf-maps/; data/moba-maps/ is
// reserved for MOBA-derived maps (the reverse-engineered single-player map + the
// legacy-*.json stand-ins). Synchronous disk read, cached.
const parcelCache = new Map<string, Battlefield | null>();

function resolveParcelMapsDir(): string {
  const override = process.env['CF_PARCEL_MAPS_DIR'];
  if (override !== undefined && override !== '') return override;
  return join(resolveDataSubdir('cf-maps'), 'parcels');
}

/**
 * The designed Battlefield for a specific parcel, if one has been generated and
 * placed on the box (`<CF_PARCEL_MAPS_DIR>/<parcelId>.json`). Validated at load;
 * an invalid/missing file returns undefined so callers fall back to the stand-in.
 * Cached per parcelId (null = "checked, none") — the file is immutable per design.
 */
export function loadParcelBattlefield(parcelId: string | undefined): Battlefield | undefined {
  if (parcelId === undefined || parcelId === '') return undefined;
  const cached = parcelCache.get(parcelId);
  if (cached !== undefined) return cached ?? undefined;
  try {
    const path = join(resolveParcelMapsDir(), `${parcelId}.json`);
    if (!existsSync(path)) { parcelCache.set(parcelId, null); return undefined; }
    const bf = JSON.parse(readFileSync(path, 'utf8')) as Battlefield;
    const v = validateBattlefield(bf);
    if (!v.ok) { parcelCache.set(parcelId, null); return undefined; } // never ship an unplayable map
    parcelCache.set(parcelId, bf);
    return bf;
  } catch {
    parcelCache.set(parcelId, null);
    return undefined;
  }
}

const FILES: Record<1 | 3, string> = { 1: 'legacy-1lane.json', 3: 'legacy-3lane.json' };
// The REAL current-arena export (network/engine session, delivered 2026-07-07).
// data/moba-maps/legacy.json = the authoritative 3-lane ±161 MOBA arena the client
// plays 1:1. Per the 2026-07-07 map-pipeline model it is the CURRENT-GAME / TEST-DROP-IN
// tier, NOT a per-parcel design fallback: a CF parcel battle resolves to its OWN map
// (loadParcelBattlefield) first; legacy.json is only the estate/default (3-lane) test
// crutch. It is a 3-lane map, so it stands in ONLY for the 3-lane path — a SINGLE parcel
// must never render the 3-lane arena (owner correction), so laneCount 1 keeps the
// 1-lane stand-in until that single's own parcel map exists.
const REAL_MAP_FILE = 'legacy.json';
const cache = new Map<1 | 3, Battlefield>();

/**
 * The standard Battlefield for `laneCount` lanes (1 = single parcel, 3 =
 * estate/default). Prefers the real MOBA export (data/moba-maps/legacy.json)
 * when the MOBA BattleEngine session has delivered it; otherwise the interim
 * ±161 world-unit stand-ins (legacy-{1,3}lane.json). Cached; the returned object is
 * shared read-only (the client only reads it, the server only serialises it). A
 * missing/corrupt file returns undefined so callers can omit the field rather
 * than crash a battle.
 */
export function loadStandbyBattlefield(laneCount: 1 | 3 = 3): Battlefield | undefined {
  const cached = cache.get(laneCount);
  if (cached !== undefined) return cached;
  const dir = resolveMapsDir();
  // Prefer the real 3-lane arena export over the stand-in — but ONLY for the 3-lane
  // (estate/default) path. legacy.json is a 3-lane map; a single parcel (laneCount 1)
  // must never fall to it (owner 2026-07-07), so it keeps the 1-lane stand-in.
  const realPath = join(dir, REAL_MAP_FILE);
  if (laneCount === 3 && existsSync(realPath)) {
    try {
      const bf = JSON.parse(readFileSync(realPath, 'utf8')) as Battlefield;
      cache.set(laneCount, bf);
      return bf;
    } catch {
      /* fall through to the stand-in */
    }
  }
  try {
    const path = join(dir, FILES[laneCount]);
    const bf = JSON.parse(readFileSync(path, 'utf8')) as Battlefield;
    cache.set(laneCount, bf);
    return bf;
  } catch {
    return undefined;
  }
}
