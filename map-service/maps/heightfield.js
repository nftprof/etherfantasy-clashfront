// heightfield.js — the continent ELEVATION layer (owner 2026-08-28: "build the heightfield").
//
// A per-zone low-res elevation grid derived from the SAME authored feature field the rest of the world
// uses (ridges → high crests, rivers → valley floors), plus gentle multi-scale hills. It is a REAL
// shared layer (data, not paint): the aerial mosaic HILLSHADES with it now, and parcel generation will
// consume it next so a battle map's ground elevation matches the overworld (aerial == battle maps).
//
// OWNER RULES (2026-08-28):
//   • Parcels (playable) stay MORE OR LESS FLAT — the base field is smooth + gentle, so small parcels
//     sit on near-level ground; a parcel fully on a slope, or at a valley bottom, is fine.
//   • The NON-PLAYABLE wild land between/around parcels carries the drama — ridges rise to high PEAKS,
//     river corridors sink to valley floors.
// Elevation is normalized 0 (sea level) … 1 (highest peak). Pure + deterministic (no RNG).
import { loadWorldField } from "./worldfield.js";

// value-noise hills: hashed lattice + smooth interpolation, summed over a few octaves. Deterministic.
const _h = (a, b) => { let n = ((a * 73856093) ^ (b * 19349663)) >>> 0; n = (n ^ (n >>> 13)) * 1274126177 >>> 0; return (n & 0xffff) / 0xffff; };
const _sm = (t) => t * t * (3 - 2 * t);
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = _sm(x - xi), fy = _sm(y - yi);
  const a = _h(xi, yi), b = _h(xi + 1, yi), c = _h(xi, yi + 1), d = _h(xi + 1, yi + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
function hills(zx, zy) {                    // 3 octaves of gentle rolling terrain → ~0..1
  return 0.55 * valueNoise(zx / 34, zy / 34) + 0.3 * valueNoise(zx / 13, zy / 13) + 0.15 * valueNoise(zx / 5, zy / 5);
}
// squared distance from point to a polyline (min over segments) — few authored polylines, cheap.
function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * dx, cy = ay + t * dy, d = (px - cx) ** 2 + (py - cy) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// Build the zone heightfield. su = zone-units per cell (1 = a cell per unit; coarse, smooth, cheap).
// Returns { gw, gh, su, minX, minY, data:Float32Array (row-major, 0..1), sample(zx,zy) bilinear }.
export function buildHeightfield(zone, { su = 1 } = {}) {
  const field = loadWorldField(zone) || {};
  const ridges = (field.ridges || []).filter((r) => r.pts && r.pts.length > 1);
  const rivers = (field.rivers || []).filter((r) => r.pts && r.pts.length > 1 && !r.fill);
  // zone bbox from all feature points (roads reach the corners) — fall back to a default box.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const list of ["ridges", "rivers", "roads"]) for (const f of field[list] || []) for (const p of f.pts || []) {
    if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1]; if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 160; maxY = 150; }
  minX = Math.floor(minX - 2); minY = Math.floor(minY - 2); maxX = Math.ceil(maxX + 2); maxY = Math.ceil(maxY + 2);
  const gw = Math.max(2, Math.ceil((maxX - minX) / su)), gh = Math.max(2, Math.ceil((maxY - minY) / su));
  const data = new Float32Array(gw * gh);

  // per-cell: gentle base hills, RAISED toward ridges (peaks), SUNK toward rivers (valleys).
  const RIDGE_REACH = 10, RIDGE_PEAK = 0.97;     // zone-units of ridge influence (broad massif); crest height
  const RIVER_REACH = 5, RIVER_FLOOR = 0.06;     // valley half-width; valley-floor height
  let mn = Infinity, mx = -Infinity;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const zx = minX + gx * su, zy = minY + gy * su;
    let e = 0.28 + 0.34 * hills(zx, zy);          // rolling base ~0.28..0.62
    for (const r of ridges) {
      const d = distToPolyline(zx, zy, r.pts), reach = RIDGE_REACH * (r.width ? Math.max(0.6, r.width / 2) : 1);
      if (d < reach) { const t = 1 - d / reach; e += (RIDGE_PEAK - e) * t * t; }   // rise to the crest
    }
    for (const r of rivers) {
      const d = distToPolyline(zx, zy, r.pts), reach = RIVER_REACH * (r.width ? Math.max(0.6, r.width) : 1);
      if (d < reach) { const t = 1 - d / reach; e -= (e - RIVER_FLOOR) * t * t; }  // sink to the valley floor
    }
    e = e < 0 ? 0 : e > 1 ? 1 : e;
    data[gy * gw + gx] = e; if (e < mn) mn = e; if (e > mx) mx = e;
  }

  const sample = (zx, zy) => {                    // bilinear elevation at zone coords
    const fx = (zx - minX) / su, fy = (zy - minY) / su;
    const x0 = Math.max(0, Math.min(gw - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(gh - 1, Math.floor(fy)));
    const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const a = data[y0 * gw + x0], b = data[y0 * gw + x1], c = data[y1 * gw + x0], d = data[y1 * gw + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  return { zone, gw, gh, su, minX, minY, min: mn, max: mx, data, sample };
}

// Hillshade a per-pixel RGB buffer IN PLACE from a per-PIXEL elevation buffer (0..1). Sun from the NW.
// The elevation buffer is built by the caller so it can CLIP to the land (open ocean = 0, flat sea — no
// features or mountains float over water). `step` = pixels between gradient samples (≈ 1 zone-unit).
export function hillshadeBuf(px, W, H, elev, step, { vscale = 26, ambient = 0.7, strength = 0.62, tint = true } = {}) {
  const s = Math.max(1, step | 0);
  const lx = -0.6, ly = -0.6, lz = 0.53, ll = Math.hypot(lx, ly, lz);
  const Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;
  const ROCK = [128, 122, 116], SNOW = [224, 228, 234];        // high-elevation bare rock → snow cap
  const HIGH = 0.70, SNOWCAP = 0.90;
  const at = (x, y) => elev[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = elev[y * W + x];
    const dzdx = (at(x + s, y) - at(x - s, y)) * vscale, dzdy = (at(x, y + s) - at(x, y - s)) * vscale;
    const nl = Math.hypot(dzdx, dzdy, 1), nx = -dzdx / nl, ny = -dzdy / nl, nz = 1 / nl;
    let lam = nx * Lx + ny * Ly + nz * Lz; if (lam < 0) lam = 0;
    const shade = ambient + strength * lam;
    const i = (y * W + x) * 4;
    let r = px[i], g = px[i + 1], b = px[i + 2];
    if (tint && h > HIGH) {                                     // bare rock → snow cap on high ground
      const tr = Math.min(1, (h - HIGH) / (1 - HIGH)) * 0.85;
      r += (ROCK[0] - r) * tr; g += (ROCK[1] - g) * tr; b += (ROCK[2] - b) * tr;
      if (h > SNOWCAP) { const ts = (h - SNOWCAP) / (1 - SNOWCAP); r += (SNOW[0] - r) * ts; g += (SNOW[1] - g) * ts; b += (SNOW[2] - b) * ts; }
    }
    px[i] = Math.min(255, r * shade); px[i + 1] = Math.min(255, g * shade); px[i + 2] = Math.min(255, b * shade);
  }
}
