// worldmap.js — the 2D WORLD OVERVIEW (owner 2026-08-07: "view the whole CF game map as one 2D
// picture — dots / small thumbs combined; % of total land we've generated; + the non-parcel
// areas so the world is complete").
// ---------------------------------------------------------------------------
// The CF game map IS the designer map. This assembles every zone into ONE world picture the way
// the source assembles them in 3D: each zone is a TILE placed at its `worldOffset` (zone-layout.json),
// sized by its viewBox aspect. Inside each tile, parcels are rasterized to a coarse COVERAGE GRID
// (small enough that all zones together fit a thumbnail world map) — each cell knows how many
// parcels fall in it and how many are GENERATED (have a registry design row). Non-parcel wilderness
// is the tile area with no parcel cells; a zone counts as having its wilderness field authored when
// data/world-terrain/<ZONE>.json exists.
//
// Deterministic + pure over (zoneList, l3Zone, registry set, zone-layout, world-terrain presence).
// No Math.random, no Date. Payload is tiny (grids are ⚙ ≤48×48 per zone, run-length-free u16 counts).
import fs from "node:fs";
import path from "node:path";
import { zoneList, l3Zone, dataRoot } from "./worldfield.js";

const GRID_MAX = 48;                 // ⚙ coarse cells per long side of a zone tile
const TILE_BASE = 120;               // ⚙ world-units the longest side of a unit-aspect tile spans

let _cache = null;                   // built once; zone data is static, generated-set is passed in

function zoneLayout() {
  try { return JSON.parse(fs.readFileSync(path.join(dataRoot(), "hexagon-city-source/zone-layout.json"), "utf8")).zoneLayout || {}; }
  catch { return {}; }
}
function hasWildernessField(zoneId) {
  try { return fs.existsSync(path.join(dataRoot(), "world-terrain", zoneId + ".json")); } catch { return false; }
}

// Build the static skeleton (zone tiles + per-cell parcel counts). Generated overlay is applied
// per-request from the live registry set so coverage updates without a rebuild.
function skeleton() {
  if (_cache) return _cache;
  const layout = zoneLayout();
  const zones = [];
  for (const z of zoneList()) {
    if (!z.bbox) continue;
    const [x0, y0, x1, y1] = z.bbox;
    const w = Math.max(1e-6, x1 - x0), h = Math.max(1e-6, y1 - y0);
    // coarse grid: longest side = GRID_MAX, other side scaled by aspect (min 1)
    const gw = w >= h ? GRID_MAX : Math.max(1, Math.round(GRID_MAX * w / h));
    const gh = h >= w ? GRID_MAX : Math.max(1, Math.round(GRID_MAX * h / w));
    const total = new Uint16Array(gw * gh);          // parcels per cell
    const ids = [];                                   // parcelId per cell (first parcel — for click-through)
    for (let i = 0; i < gw * gh; i++) ids.push(null);
    const cellOf = [];                                // parcelId -> cell index (for the generated overlay)
    for (const r of l3Zone(z.zoneId)) {
      const c = r.center || (r.bbox && [(r.bbox[0] + r.bbox[2]) / 2, (r.bbox[1] + r.bbox[3]) / 2]);
      if (!c) continue;
      const gx = Math.min(gw - 1, Math.max(0, Math.floor((c[0] - x0) / w * gw)));
      const gy = Math.min(gh - 1, Math.max(0, Math.floor((c[1] - y0) / h * gh)));
      const k = gy * gw + gx;
      total[k]++; if (!ids[k]) ids[k] = String(r.parcelId);
      cellOf.push([String(r.parcelId), k]);
    }
    const lay = layout[z.zoneId] || {};
    const off = lay.worldOffset || { x: 0, z: 0 };
    const aspect = w / h;
    const tileW = aspect >= 1 ? TILE_BASE : TILE_BASE * aspect;
    const tileH = aspect >= 1 ? TILE_BASE / aspect : TILE_BASE;
    zones.push({
      zoneId: z.zoneId, name: z.name, biomeFamily: z.biomeFamily, count: z.count,
      grid: { w: gw, h: gh }, total: Array.from(total), ids,
      world: { x: off.x || 0, z: off.z || 0, w: tileW, h: tileH },
      wilderness: hasWildernessField(z.zoneId),
      cellOf,
    });
  }
  _cache = { zones };
  return _cache;
}

// worldMap(generatedSet) → the full overview payload. generatedSet = Set<parcelId string> from the
// live registry (reg.list()). Everything downstream (coverage %, per-cell generated counts) derives
// from it, so the same skeleton serves every request.
export function worldMap(generatedSet) {
  const gen = generatedSet || new Set();
  const sk = skeleton();
  let totalParcels = 0, totalGenerated = 0, zonesWithWild = 0;
  const zones = sk.zones.map((z) => {
    const generated = new Uint16Array(z.grid.w * z.grid.h);
    let zg = 0;
    for (const [pid, k] of z.cellOf) if (gen.has(pid)) { generated[k]++; zg++; }
    totalParcels += z.count; totalGenerated += zg;
    if (z.wilderness) zonesWithWild++;
    return {
      zoneId: z.zoneId, name: z.name, biomeFamily: z.biomeFamily,
      count: z.count, generated: zg, coverage: z.count ? zg / z.count : 0,
      grid: z.grid, total: z.total, generatedGrid: Array.from(generated), ids: z.ids,
      world: z.world, wilderness: z.wilderness,
    };
  });
  // world bounds (tile rects placed at world offsets) so the client can fit-to-view
  let X0 = Infinity, Z0 = Infinity, X1 = -Infinity, Z1 = -Infinity;
  for (const z of zones) {
    X0 = Math.min(X0, z.world.x - z.world.w / 2); X1 = Math.max(X1, z.world.x + z.world.w / 2);
    Z0 = Math.min(Z0, z.world.z - z.world.h / 2); Z1 = Math.max(Z1, z.world.z + z.world.h / 2);
  }
  return {
    schema: "cf-worldmap/1",
    stats: {
      zones: zones.length, zonesWithWilderness: zonesWithWild,
      totalParcels, totalGenerated,
      parcelCoverage: totalParcels ? totalGenerated / totalParcels : 0,
      wildernessCoverage: zones.length ? zonesWithWild / zones.length : 0,
    },
    bounds: (isFinite(X0) ? { x0: X0, z0: Z0, x1: X1, z1: Z1 } : { x0: 0, z0: 0, x1: 1, z1: 1 }),
    zones,
  };
}

export const _internal = { skeleton, GRID_MAX, TILE_BASE };
