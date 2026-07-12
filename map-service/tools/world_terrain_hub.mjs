#!/usr/bin/env node
// world_terrain_hub.mjs — REPRODUCIBLE generator for data/world-terrain/HUB.json (Tianxia).
//
// Tianxia = the HUB Capital Heartland, the RoTK-China destination continent. Owner direction
// 2026-07-10: "a few major cities in China today that's famous, like Beijing, Shanghai, ChengDu
// etc — modern living, high population, with an ancient history." Canon: CONTINUOUS-WORLD-TERRAIN
// §3 (HUB row = Beijing/Chengdu/Xi'an LAYERED metropolis), §3b (Tianxia era row), §3c (castles on
// ESTATES: PALACE→EPIC, CASTLE→GIANT/metro EPICs, KEEP→LARGE); CONTINENT-TERRAIN-ATLAS §2.1
// (central massif + shaft at ≈(179,114), radial rivers, river crossroads, no coast).
//
// THE LAYERED CHINESE METROPOLIS (each city = ancient core + modern ring layer, both visible):
//   • THE CAPITAL "Zhongdu" (Beijing pattern) — ancient imperial core (rectangular Palace Wall
//     Road + the straight N–S Meridian Way ceremonial axis + the E–W Avenue of Lasting Peace;
//     rectilinear planned axes ARE correct here, unlike Arcadia's never-grid rule) WRAPPED in
//     TWO concentric modern ring roads (rounded-rectangle "Inner/Outer Ring Road", Beijing
//     2nd/3rd-ring style, tier highway) + 6 radial expressways + grid-ish chord lanes between
//     the rings + hutong lanes in the old core.
//   • 4 SECONDARY METROS, each a historic core + ONE modern ring, pattern varied per city:
//     Shanghai-style river-port ON the main river (bund roads both banks, ring crossing the
//     river twice, quay stubs), Xi'an-style walled rectangular core (wall ring road + bell-tower
//     cross axes + outer ring) ×2, Chengdu-style ring-radial (ring + core + 6 radials).
//   • RURAL stays the current organic countryside verbatim (owner-locked): towns = the real
//     GIANT+LARGE L2 estate anchors linked by valley-curve secondary roads (≤2 river bridges,
//     ridge-gap reroutes, "connect, don't double" dedup) + seeded MEDIUM-estate local feeders.
//
// DETERMINISTIC PICK RULES (all over data/hexagon-city-source/parcels-l2.json, zone==="HUB";
// ties broken by parcelId ascending):
//   CAPITAL   = the EPIC estate nearest the main river crossroads K=(146,127) — the authored
//               Tianhe⋈Jinshui confluence west of the Dragonmaw massif.        → 1071732
//   RIVERPORT = the EPIC (≠capital) nearest the Tianhe main-river polyline.     → 1071729
//   3 more METROS = farthest-point sampling among the remaining EPICs (each pick maximizes its
//               minimum distance to all previous picks, seeded {capital, riverport}).
//               → 1071728 (E, Xi'an-style) · 1071738 (NW, Chengdu-style) · 1071733 (SE, Xi'an-style)
//   BRIDGE-GUARD = the L3-SUBDIVIDED GIANT nearest the Capital Bridge (West Caravan Road × Tianhe).
//   FORK-GUARD   = the L3-SUBDIVIDED GIANT nearest the East Fork (East Frontier Road ⋈ Southeast
//                  Road junction — the corridor between Dragonmaw and Dragontail).
//   KEEPs        = the 3 L3-SUBDIVIDED LARGE estates nearest the massif rim circle (beacon towers)
//                  + SHAFTWATCH = the unconstrained LARGE nearest the rim (inside the caldera).
//   NOTE data fact: NO HUB EPIC estate is L3-subdivided (0/24) — palace/metro castle battle maps
//   arrive with the pre-designed ESTATE maps (canon decisions 4/5); the strategic forts + keeps
//   are constrained to L3-subdivided estates so their castle POIs land on PLAYABLE parcels today.
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d, shared
// rule in world_hero_parcels.mjs, identical in the EDU/HUB/BUS tools): each castle estate lists
// its HERO-MODE (3D) POI L3 parcelIds — castle parcel FIRST, length = LARGE 3 / GIANT 5 / EPIC 8.
// Deterministic pick: castle parcel = the L3 parcel containing (else nearest-center to) the
// castle POI point; the rest = greedy farthest-point spread over L3 centers PREFERRING parcels
// that intersect roads/rivers/coast polylines (they read as gates/bridge/harbour/approaches;
// eligible when spread ≥ 0.5× the step's best), ties by parcelId ascending. Estates with NO L3
// subdivision (all 24 HUB EPICs + Shaftwatch's LARGE) emit heroParcels: [] + heroParcelsNote
// (designation DEFERRED until subdivision).
//
// HYDROLOGY (atlas: EDU plateau → HUB radial → BUS deltas; HUB west-radial → ENT):
//   RV1 Tianhe (main): receives Arcadia Flow at the S border x=164 (EDU-RV1 exits EDU at world
//       x = 100+64 = 164; HUB worldOffset = (0,0) so HUB local x = world x — the zone viewBoxes
//       overlap on the flat picker, so the S edge is the shared frontier, aligned in x), flows N
//       past the capital's west flank, exits N toward the BUS deltas.
//   RV2 Jinshui: massif west-rim spring, wraps the capital's N+W, joins RV1 at K (the crossroads).
//   RV3 Xijiang: west radial toward ENT (rain-fed spring SW of the capital plain).
//   RV4 Beiliu: massif NE spring, exits N (the second BUS-bound run).
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_hub.mjs
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachHeroParcels, HERO_PARCELS_META } from "./world_hero_parcels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ---- deterministic rng (same family as the EDU generator) --------------------------------------
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const rng32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- Catmull-Rom spline + seeded meander (verbatim: the EDU 2026-07-10 pass) --------------------
function spline(pts, per = 8) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
function meander(pts, amp, wavelen, seedKey) {
  const r = rng32(fnv1a(seedKey));
  const phases = [r() * 6.283, r() * 6.283, r() * 6.283];
  const freqs = [1, 2.7, 5.1].map((f) => (6.283 * f) / wavelen);
  let dist = 0;
  return pts.map((p, i) => {
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    const w = Math.sin(dist * freqs[0] + phases[0]) * 0.6 + Math.sin(dist * freqs[1] + phases[1]) * 0.3 + Math.sin(dist * freqs[2] + phases[2]) * 0.1;
    const fade = Math.min(1, i / 6, (pts.length - 1 - i) / 6);
    return [+(p[0] + nx * w * amp * fade).toFixed(2), +(p[1] + nz * w * amp * fade).toFixed(2)];
  });
}
const natural = (ctrl, amp, wavelen, key, per = 10) => meander(spline(ctrl, per), amp, wavelen, key);
const round2 = (pts) => pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
// a PLANNED straight street (the Chinese imperial axis / modern avenue) — sampled, no meander
function straight(ctrl, step = 0.6) {
  const out = [ctrl[0].slice()];
  for (let i = 1; i < ctrl.length; i++) {
    const [ax, ay] = ctrl[i - 1], [bx, by] = ctrl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return round2(out);
}
// modern RING ROAD — rounded rectangle (the Beijing 2nd/3rd-ring shape), smooth with a tiny
// seam-free periodic wobble (integer harmonics of the closed parameter → the loop closes exactly)
function roundedRectRing(c, rx, ry, cr, key, wobble = 0.05, n = 72) {
  const r = rng32(fnv1a(key));
  const ph = [r() * 6.283, r() * 6.283];
  cr = Math.min(cr, rx, ry);
  const ex = rx - cr, ey = ry - cr;                     // straight half-extents
  const straightL = 4 * (2 * ex + 2 * ey) / 4, arcL = 2 * Math.PI * cr;
  const per = 4 * ex + 4 * ey + arcL;                   // perimeter (2 h-edges·2ex + 2 v-edges·2ey + 4 arcs)
  const pt = (s) => {                                   // s ∈ [0,per) → point on the rounded rect, clockwise from top-middle
    let d = s;
    const segs = [
      { L: ex, f: (t) => [c[0] + t, c[1] - ry] },                                            // top right half
      { L: arcL / 4, f: (t) => { const a = -Math.PI / 2 + t / cr; return [c[0] + ex + Math.cos(a) * cr, c[1] - ey + Math.sin(a) * cr]; } },
      { L: 2 * ey, f: (t) => [c[0] + rx, c[1] - ey + t] },                                    // right edge
      { L: arcL / 4, f: (t) => { const a = t / cr; return [c[0] + ex + Math.cos(a) * cr, c[1] + ey + Math.sin(a) * cr]; } },
      { L: 2 * ex, f: (t) => [c[0] + ex - t, c[1] + ry] },                                    // bottom edge
      { L: arcL / 4, f: (t) => { const a = Math.PI / 2 + t / cr; return [c[0] - ex + Math.cos(a) * cr, c[1] + ey + Math.sin(a) * cr]; } },
      { L: 2 * ey, f: (t) => [c[0] - rx, c[1] + ey - t] },                                    // left edge
      { L: arcL / 4, f: (t) => { const a = Math.PI + t / cr; return [c[0] - ex + Math.cos(a) * cr, c[1] - ey + Math.sin(a) * cr]; } },
      { L: ex, f: (t) => [c[0] - ex + t, c[1] - ry] },                                        // top left half
    ];
    for (const sg of segs) { if (d <= sg.L) return sg.f(d); d -= sg.L; }
    return segs[segs.length - 1].f(segs[segs.length - 1].L);
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const [x, y] = pt(t * per);
    const w = wobble * (Math.sin(2 * Math.PI * 3 * t + ph[0]) * 0.7 + Math.sin(2 * Math.PI * 7 * t + ph[1]) * 0.3);
    const dx = x - c[0], dy = y - c[1], L = Math.hypot(dx, dy) || 1;
    out.push([x + (dx / L) * w, y + (dy / L) * w]);
  }
  out.push(out[0].slice());
  return round2(out);
}
// modern ring — ellipse variant (Chengdu ring / metro rings)
function ellipseRing(c, rx, ry, key, wobble = 0.06, n = 56) {
  const r = rng32(fnv1a(key));
  const ph = [r() * 6.283, r() * 6.283];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n, a = t * 2 * Math.PI;
    const w = 1 + wobble * (Math.sin(2 * Math.PI * 3 * t + ph[0]) * 0.7 + Math.sin(2 * Math.PI * 5 * t + ph[1]) * 0.3);
    out.push([c[0] + Math.cos(a) * rx * w, c[1] + Math.sin(a) * ry * w]);
  }
  out.push(out[0].slice());
  return round2(out);
}
// medieval/ancient wobbly ring (historic cores — the EDU jokamachi ring, verbatim character)
function wobblyRing(c, rad, n, key) {
  const r = rng32(fnv1a(key));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (1 + (r() - 0.5) * 0.22);
    pts.push([+(c[0] + Math.cos(a) * rr).toFixed(2), +(c[1] + Math.sin(a) * rr).toFixed(2)]);
  }
  pts.push(pts[0].slice());
  return pts;
}
const ringPointToward = (ring, tgt) => {
  let best = ring[0], bd = Infinity;
  for (const p of ring.slice(0, -1)) { const d = Math.hypot(p[0] - tgt[0], p[1] - tgt[1]); if (d < bd) { bd = d; best = p; } }
  return best;
};

// ---- geometry helpers (verbatim family) ---------------------------------------------------------
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, qx = dx - cx, qy = dy - cy;
  const den = rx * qy - ry * qx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((cx - ax) * qy - (cy - ay) * qx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function crossings(A, set) {
  let n = 0;
  for (let i = 1; i < A.length; i++)
    for (const B of set)
      for (let j = 1; j < B.length; j++)
        if (segX(A[i - 1][0], A[i - 1][1], A[i][0], A[i][1], B[j - 1][0], B[j - 1][1], B[j][0], B[j][1])) n++;
  return n;
}
function nearestOn(set, x, y) {
  let best = null, bd = Infinity;
  for (const line of set) for (const p of line) {
    const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
    if (d < bd) { bd = d; best = p; }
  }
  return { pt: best, d: Math.sqrt(bd) };
}
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

// grid index over network VERTICES (HUB has 164 towns vs EDU's 28 — O(all-points) scans would
// crawl; same nearest-vertex semantics as the EDU tool's nearestOn, deterministic insertion order)
const CELL = 4;
function makeIndex() {
  const cells = new Map();
  let n = 0;
  const key = (cx, cy) => cx + "," + cy;
  return {
    addPolyline(pts) {
      for (const p of pts) {
        const k = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
        let arr = cells.get(k);
        if (!arr) { arr = []; cells.set(k, arr); }
        arr.push([p[0], p[1], n++]);
      }
    },
    nearest(x, y, maxR = 60) {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      let best = null, bd = Infinity, bi = Infinity;
      const maxRing = Math.ceil(maxR / CELL) + 1;
      for (let ring = 0; ring <= maxRing; ring++) {
        if (best && (ring - 1) * CELL > Math.sqrt(bd)) break;      // ring floor beats best → done
        for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const arr = cells.get(key(cx + dx, cy + dy));
          if (!arr) continue;
          for (const [px, py, pi] of arr) {
            const d = (px - x) * (px - x) + (py - y) * (py - y);
            if (d < bd || (d === bd && pi < bi)) { bd = d; bi = pi; best = [px, py]; }
          }
        }
      }
      return { pt: best, d: best ? Math.sqrt(bd) : Infinity };
    },
  };
}
const nearFractionIdx = (pts, idx, r) => {
  let near = 0;
  for (const p of pts) if (idx.nearest(p[0], p[1], r + CELL).d < r) near++;
  return near / pts.length;
};

// =================================================================================================
function buildField() {
  // ---- estates ----------------------------------------------------------------------------------
  const l2 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/parcels-l2.json"), "utf8"));
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/HUB.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));  // estates with playable L3 parcels
  const hub = l2.parcels.filter((p) => p.zone === "HUB");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const epics = hub.filter((p) => p.sizeClass === "EPIC").sort(byId);
  const giants = hub.filter((p) => p.sizeClass === "GIANT").sort(byId);
  const larges = hub.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = hub.filter((p) => p.sizeClass === "GIANT" || p.sizeClass === "LARGE")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const mediums = hub.filter((p) => p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));

  // ---- the massif + shaft (atlas §2.1: caldera rim around (179,114), gap facing the capital) ----
  const SHAFT = [179, 114];
  const RIM_R = 12;
  const gapDir = Math.atan2(122.8 - SHAFT[1], 156.6 - SHAFT[0]);   // toward the capital plain (SW-W)
  const rimR = rng32(fnv1a("HUB|ridge|rim"));
  const rimPh = [rimR() * 6.283, rimR() * 6.283];
  const rim = [];
  const A0 = gapDir + (22 * Math.PI) / 180, SWEEP = 2 * Math.PI - (44 * Math.PI) / 180;
  for (let i = 0; i <= 80; i++) {
    const t = i / 80, a = A0 + t * SWEEP;
    const rr = RIM_R * (1 + 0.09 * (Math.sin(2 * Math.PI * 3 * t + rimPh[0]) * 0.7 + Math.sin(2 * Math.PI * 6 * t + rimPh[1]) * 0.3));
    rim.push([+(SHAFT[0] + Math.cos(a) * rr).toFixed(2), +(SHAFT[1] + Math.sin(a) * rr).toFixed(2)]);
  }
  const armN = natural([[179, 102.4], [184, 92], [188.5, 80], [192.5, 68]], 1.6, 30, "HUB|ridge|armN");
  const armSE = natural([[187.6, 122.4], [196, 134], [203, 144], [209, 153]], 1.6, 30, "HUB|ridge|armSE");
  const RIDGES = [rim, armN, armSE];
  const gapMid = [+(SHAFT[0] + Math.cos(gapDir) * RIM_R).toFixed(2), +(SHAFT[1] + Math.sin(gapDir) * RIM_R).toFixed(2)];
  const RIDGE_GAPS = [gapMid, [192.5, 68], [209, 153], rim[0], rim[rim.length - 1]];

  // ---- rivers ------------------------------------------------------------------------------------
  const K = [146, 127];                                            // Tianhe ⋈ Jinshui — THE river crossroads
  const riverTianhe = natural(
    [[164, 229.5], [163, 205], [160, 180], [156, 158], [150, 140], K, [145, 110], [148, 92], [155, 79], [159.5, 66], [163, 48], [166, 26], [168, 3]],
    2.0, 36, "HUB|river|tianhe");
  const riverJinshui = natural(
    [[166, 113.5], [160, 110], [152, 112], [147, 118], [146.2, 126.6]],                       // joins Tianhe at K
    0.9, 20, "HUB|river|jinshui");
  const riverXijiang = natural(
    [[132, 142], [112, 150], [90, 156], [66, 160], [44, 163], [24, 166], [3, 168]],
    1.8, 34, "HUB|river|xijiang");
  const riverBeiliu = natural(
    [[192, 102], [197, 88], [202, 72], [206, 52], [208, 30], [210, 8]],
    1.4, 30, "HUB|river|beiliu");
  const RIVERS = [riverTianhe, riverJinshui, riverXijiang, riverBeiliu];

  // ---- deterministic city/castle picks (rules in the header) -------------------------------------
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const distToLine = (p, line) => { let m = Infinity; for (const q of line) m = Math.min(m, Math.hypot(q[0] - p[0], q[1] - p[1])); return m; };
  const capital = epics.slice().sort((a, b) => (dist(a.center, K) - dist(b.center, K)) || byId(a, b))[0];
  const port = epics.filter((p) => p !== capital)
    .sort((a, b) => (distToLine(a.center, riverTianhe) - distToLine(b.center, riverTianhe)) || byId(a, b))[0];
  const metroPicks = [capital, port];
  for (let i = 0; i < 3; i++) {
    const next = epics.filter((p) => !metroPicks.includes(p)).sort((a, b) => {
      const ma = Math.min(...metroPicks.map((q) => dist(q.center, a.center)));
      const mb = Math.min(...metroPicks.map((q) => dist(q.center, b.center)));
      return (mb - ma) || byId(a, b);
    })[0];
    metroPicks.push(next);
  }
  const [, , metroE, metroNW, metroSE] = metroPicks;               // FPS order: E · NW · SE (data-derived)
  const CAP = capital.center.slice(), PORT = port.center.slice();
  const ME = metroE.center.slice(), MNW = metroNW.center.slice(), MSE = metroSE.center.slice();

  // ---- THE CAPITAL "Zhongdu" — Beijing-pattern layered metropolis --------------------------------
  const urban = [];                                                // { id, name, tier, pts }
  let cwN = 0;
  const addUrban = (name, tier, pts, idOverride) => { cwN++; urban.push({ id: idOverride || `HUB-CW${String(cwN).padStart(2, "0")}`, name, tier, pts }); };
  const ring1 = roundedRectRing(CAP, 5.4, 4.8, 1.6, "HUB|cap|ring1", 0.05, 72);
  const ring2 = roundedRectRing(CAP, 8.8, 7.8, 2.6, "HUB|cap|ring2", 0.06, 88);
  const palaceWall = roundedRectRing(CAP, 1.7, 2.2, 0.35, "HUB|cap|palace-wall", 0.02, 40);
  addUrban("Inner Ring Road", "highway", ring1, "HUB-CW-RING1");
  addUrban("Outer Ring Road", "highway", ring2, "HUB-CW-RING2");
  addUrban("Palace Wall Road", "local", palaceWall, "HUB-CW-WALL");
  // the grand N–S ceremonial axis (Forbidden-City pattern: gate tower → palace → gate tower).
  // PLANNED = exactly rectilinear (rectilinear axes ARE correct in Tianxia, unlike Arcadia):
  // ring vertices only donate the crossing ordinate; the free coordinate is snapped exact.
  const gate2N = [CAP[0], ringPointToward(ring2, [CAP[0], CAP[1] - 100])[1]];
  const gate2S = [CAP[0], ringPointToward(ring2, [CAP[0], CAP[1] + 100])[1]];
  addUrban("The Meridian Way", "secondary", straight([gate2N, [CAP[0], CAP[1] - 2.2], CAP, [CAP[0], CAP[1] + 2.2], gate2S], 0.5), "HUB-CW-AXIS");
  // the E–W modern avenue just south of the palace (Chang'an Avenue pattern) — exact straight
  const aveY = CAP[1] + 3.0;
  addUrban("Avenue of Lasting Peace", "secondary",
    straight([[CAP[0] - 5.4, aveY], [CAP[0], aveY], [CAP[0] + 5.4, aveY]], 0.5), "HUB-CW-AVE");
  // 6 radial expressways ring1 → ring2 (N/S handled by the axis)
  const RAD_DIRS = [["NE", 0.7071, -0.7071], ["E", 1, 0], ["SE", 0.7071, 0.7071], ["SW", -0.7071, 0.7071], ["W", -1, 0], ["NW", -0.7071, -0.7071]];
  const radR = rng32(fnv1a("HUB|cap|radials"));
  for (const [tag, dx, dy] of RAD_DIRS) {
    const tgt = [CAP[0] + dx * 40, CAP[1] + dy * 40];
    const a = ringPointToward(ring1, tgt), b = ringPointToward(ring2, tgt);
    const mx = (a[0] + b[0]) / 2 + (radR() - 0.5) * 0.4, my = (a[1] + b[1]) / 2 + (radR() - 0.5) * 0.4;
    addUrban(`${tag} Expressway`, "highway", natural([a, [mx, my], b], 0.08, 8, `HUB|cap|rad|${tag}`, 8));
  }
  // modern grid-ish chord streets between the rings + hutong lanes in the ancient core.
  // Exactly axis-aligned; endpoint ordinates = the rounded-rect ring2 boundary solved analytically
  // (ex/ey = straight half-extents 6.2/5.2, corner r 2.6 → chord meets the corner arc).
  const chord = (a, b) => straight([a, b], 0.6);
  const vChordY = 5.2 + Math.sqrt(2.6 * 2.6 - 0.6 * 0.6);        // vertical chords at |dx|=6.8
  const hChordX = 6.2 + Math.sqrt(2.6 * 2.6 - 1.0 * 1.0);        // horizontal chords at |dy|=6.2
  addUrban("West Chord Street", "local", chord([CAP[0] - 6.8, CAP[1] - vChordY], [CAP[0] - 6.8, CAP[1] + vChordY]));
  addUrban("East Chord Street", "local", chord([CAP[0] + 6.8, CAP[1] - vChordY], [CAP[0] + 6.8, CAP[1] + vChordY]));
  addUrban("North Chord Street", "local", chord([CAP[0] - hChordX, CAP[1] - 6.2], [CAP[0] + hChordX, CAP[1] - 6.2]));
  addUrban("South Chord Street", "local", chord([CAP[0] - hChordX, CAP[1] + 6.2], [CAP[0] + hChordX, CAP[1] + 6.2]));
  // the Imperial-City second enclosure around the palace precinct: hutong lane north + market
  // lanes east/west, closed at the south by the Avenue — the Beijing double-wall courtyard read
  addUrban("North Hutong Lane", "local", chord([CAP[0] - 3.4, CAP[1] - 3.4], [CAP[0] + 3.4, CAP[1] - 3.4]));
  addUrban("West Market Lane", "local", chord([CAP[0] - 3.4, CAP[1] - 3.4], [CAP[0] - 3.4, aveY]));
  addUrban("East Market Lane", "local", chord([CAP[0] + 3.4, CAP[1] - 3.4], [CAP[0] + 3.4, aveY]));

  // ---- SECONDARY METROS — one historic core + ONE modern ring each --------------------------------
  let metroN = 0;
  const addMetro = (name, tier, pts) => { metroN++; urban.push({ id: `HUB-MT${String(metroN).padStart(2, "0")}`, name, tier, pts }); };
  // Shanghai-style river-port on the Tianhe: bund roads both banks + ring crossing the river + quays
  const pNear = nearestOn([riverTianhe], PORT[0], PORT[1]);
  let i0 = 0, bd0 = Infinity;
  for (let i = 0; i < riverTianhe.length; i++) { const d = dist(riverTianhe[i], PORT); if (d < bd0) { bd0 = d; i0 = i; } }
  const bund = (side, name) => {
    const off = side * 1.15, pts = [];
    for (let i = Math.max(1, i0 - 14); i <= Math.min(riverTianhe.length - 2, i0 + 14); i++) {
      const a = riverTianhe[i - 1], b = riverTianhe[i + 1], p = riverTianhe[i];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      pts.push([+(p[0] - (dy / L) * off).toFixed(2), +(p[1] + (dx / L) * off).toFixed(2)]);
    }
    addMetro(name, "secondary", pts);
    return pts;
  };
  const portSideSign = Math.sign((PORT[0] - pNear.pt[0]) * (riverTianhe[i0 + 1][1] - riverTianhe[i0 - 1][1]) - (PORT[1] - pNear.pt[1]) * (riverTianhe[i0 + 1][0] - riverTianhe[i0 - 1][0])) || 1;
  const bundNear = bund(portSideSign, "East Bund");                // the old-town bank
  bund(-portSideSign, "West Bund");
  const portRingC = [(PORT[0] + pNear.pt[0]) / 2, (PORT[1] + pNear.pt[1]) / 2];
  const portRing = ellipseRing(portRingC, 4.6, 4.0, "HUB|port|ring", 0.05, 56);
  addMetro("Jinjiang Ring Road", "highway", portRing);
  addMetro("Jinjiang Old Town", "local", wobblyRing(PORT, 1.6, 12, "HUB|port|core"));
  addMetro("Dock Street", "secondary", straight([PORT, pNear.pt], 0.5));
  const quayR = rng32(fnv1a("HUB|port|quays"));
  for (let q = 0; q < 3; q++) {
    const bi = Math.max(1, Math.min(bundNear.length - 2, Math.round((0.25 + q * 0.25) * bundNear.length + (quayR() - 0.5) * 2)));
    const a = bundNear[bi];
    const rn = nearestOn([riverTianhe], a[0], a[1]);
    const dx = rn.pt[0] - a[0], dy = rn.pt[1] - a[1], L = Math.hypot(dx, dy) || 1;
    addMetro(`Quay ${q + 1}`, "local", straight([a, [a[0] + (dx / L) * (L + 0.6), a[1] + (dy / L) * (L + 0.6)]], 0.4));
  }
  // Xi'an-style walled city (rect wall ring + bell-tower cross axes + one modern ring)
  const xianWeb = (C, tag, name, wall = [2.7, 2.2], ringRxy = [5.2, 4.5]) => {
    const wallRing = roundedRectRing(C, wall[0], wall[1], 0.4, `HUB|${tag}|wall`, 0.03, 48);
    const ring = ellipseRing(C, ringRxy[0], ringRxy[1], `HUB|${tag}|ring`, 0.05, 56);
    addMetro(`${name} Wall Road`, "secondary", wallRing);
    addMetro(`${name} Ring Road`, "highway", ring);
    addMetro(`${name} North–South Axis`, "secondary", straight([ringPointToward(ring, [C[0], C[1] - 100]), C, ringPointToward(ring, [C[0], C[1] + 100])], 0.5));
    addMetro(`${name} East–West Axis`, "secondary", straight([ringPointToward(ring, [C[0] - 100, C[1]]), C, ringPointToward(ring, [C[0] + 100, C[1]])], 0.5));
    return ring;
  };
  const ringE = xianWeb(ME, "metroE", "Yong'an");
  const ringSE = xianWeb(MSE, "metroSE", "Nanping", [2.4, 2.0], [4.6, 4.0]);
  // Chengdu-style ring-radial (ring + old round core + 6 curved radials)
  const ringNW = ellipseRing(MNW, 4.8, 4.3, "HUB|metroNW|ring", 0.06, 56);
  addMetro("Xichuan Ring Road", "highway", ringNW);
  addMetro("Xichuan Round City", "local", wobblyRing(MNW, 1.5, 12, "HUB|metroNW|core"));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.35;
    const from = ringPointToward(wobblyRing(MNW, 1.5, 12, "HUB|metroNW|core"), [MNW[0] + Math.cos(a) * 30, MNW[1] + Math.sin(a) * 30]);
    const to = [MNW[0] + Math.cos(a) * (4.8 + 2.0), MNW[1] + Math.sin(a) * (4.3 + 1.8)];
    addMetro(`Xichuan Radial ${k + 1}`, "secondary", natural([from, to], 0.15, 8, `HUB|metroNW|rad${k}`, 8));
  }

  // ---- TRUNK HIGHWAYS — the radial national-road star (capital ↔ metros ↔ zone edges) ------------
  const gate2E = ringPointToward(ring2, [CAP[0] + 100, CAP[1]]);
  const gate2W = ringPointToward(ring2, [CAP[0] - 100, CAP[1]]);
  const portGateS = ringPointToward(portRing, CAP);
  const portGateN = ringPointToward(portRing, [171, 3]);
  const eGate = ringPointToward(ringE, [286, 86]);
  const seGate = ringPointToward(ringSE, [230, 149]);
  const roadNorth = natural([gate2N, [158.8, 104], [160.5, 90], portGateS, portGateN, [166, 50], [167.5, 34], [169, 18], [171, 3]], 0.7, 40, "HUB|road|north");
  // south road: crosses the Tianhe ONCE (~y≈186, the South Bridge) then holds the WEST bank down
  // to the border at x=162 — mirroring EDU's Academy Road exit (EDU local x62 = world x162, road
  // west of the river at 164, so road/river arrive in the same order on both sides of the frontier)
  const roadSouth = natural([gate2S, [158, 146], [160.5, 166], [162.5, 186], [161, 202], [161.5, 216], [162, 228.5]], 0.7, 40, "HUB|road|south");
  const roadWest = natural([gate2W, [132, 128], [112, 134], [92, 141], [70, 148], [46, 155], [24, 159], [3, 161]], 0.8, 42, "HUB|road|west");
  const roadEast = natural([gate2E, [176, 129.5], [186, 131.5], [205, 127], [228, 120], [252, 110], [272, 99], [286, 86], eGate, [312, 72], [330, 79], [345, 84]], 0.8, 42, "HUB|road|east");
  const roadNW = natural([[112, 134], [98, 118], [82, 104], [64, 93], [54, 88.5], [49, 82.5], [42, 77], [34, 68], [26, 58]], 0.8, 40, "HUB|road|northwest");
  const roadSE = natural([[205, 127], [216, 138], [230, 149], seGate, [260, 162], [278, 161], [298, 159]], 0.8, 40, "HUB|road|southeast");
  const HIGHWAYS = [roadNorth, roadSouth, roadWest, roadEast, roadNW, roadSE];

  // ---- castles (§3c + the task's metro/strategic/keep picks) --------------------------------------
  const capBridge = (() => {                                        // West Caravan Road × Tianhe = the Capital Bridge
    for (let i = 1; i < roadWest.length; i++)
      for (let j = 1; j < riverTianhe.length; j++)
        if (segX(roadWest[i - 1][0], roadWest[i - 1][1], roadWest[i][0], roadWest[i][1],
                 riverTianhe[j - 1][0], riverTianhe[j - 1][1], riverTianhe[j][0], riverTianhe[j][1]))
          return [(roadWest[i - 1][0] + roadWest[i][0]) / 2, (roadWest[i - 1][1] + roadWest[i][1]) / 2];
    return K;
  })();
  const giantsPlay = giants.filter((p) => l3Parents.has(p.sourceIndex));
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const EAST_FORK = [205, 127];                                     // East Frontier Road ⋈ Southeast Road
  const bridgeGuard = giantsPlay.slice().sort((a, b) => (dist(a.center, capBridge) - dist(b.center, capBridge)) || byId(a, b))[0];
  const forkGuard = giantsPlay.filter((p) => p !== bridgeGuard)
    .sort((a, b) => (dist(a.center, EAST_FORK) - dist(b.center, EAST_FORK)) || byId(a, b))[0];
  const rimDev = (p) => Math.abs(dist(p.center, SHAFT) - RIM_R);
  const keeps = largesPlay.slice().sort((a, b) => (rimDev(a) - rimDev(b)) || byId(a, b)).slice(0, 3);
  const shaftwatch = larges.filter((p) => !keeps.includes(p)).sort((a, b) => (rimDev(a) - rimDev(b)) || byId(a, b))[0];
  const CASTLES = [
    { id: "HUB-PALACE-ZHONGDU", kind: "PALACE", at: CAP.slice(), townEstateId: capital.parcelId,
      name: "The Vermilion Palace", ref: "Beijing — Forbidden City heart of Zhongdu, the capital; N–S Meridian Way axis + two modern ring roads" },
    { id: "HUB-CASTLE-JINJIANG", kind: "CASTLE", at: PORT.slice(), townEstateId: port.parcelId,
      name: "Jinjiang River Citadel", ref: "Shanghai — river-port metropolis on the Tianhe; bund quays, ring road across the river" },
    { id: "HUB-CASTLE-YONGAN", kind: "CASTLE", at: ME.slice(), townEstateId: metroE.parcelId,
      name: "Yong'an Walled City", ref: "Xi'an — rectangular ancient wall, bell-tower cross axes, one modern ring; the eastern frontier metro" },
    { id: "HUB-CASTLE-XICHUAN", kind: "CASTLE", at: MNW.slice(), townEstateId: metroNW.parcelId,
      name: "Xichuan Round City", ref: "Chengdu — ring-radial city of the northwestern plain" },
    { id: "HUB-CASTLE-NANPING", kind: "CASTLE", at: MSE.slice(), townEstateId: metroSE.parcelId,
      name: "Nanping Walled City", ref: "Xi'an-pattern southern sister city on the Southeast Road" },
    { id: "HUB-CASTLE-TIEDU", kind: "CASTLE", at: bridgeGuard.center.slice(), townEstateId: bridgeGuard.parcelId,
      name: "Iron Ford Bridge Fort", ref: "bridge-guard GIANT on the western river approach to the capital (the Capital Bridge, West Caravan Road over the Tianhe)" },
    { id: "HUB-CASTLE-DONGGUAN", kind: "CASTLE", at: forkGuard.center.slice(), townEstateId: forkGuard.parcelId,
      name: "Dongguan Fort", ref: "fork-guard GIANT at the East Fork (East Frontier ⋈ Southeast Road — the corridor between Dragonmaw and Dragontail)" },
    { id: "HUB-KEEP-SOUTHGATE", kind: "KEEP", at: keeps[0].center.slice(), townEstateId: keeps[0].parcelId,
      name: "Southgate Watch", ref: "watch keep on the capital's southeastern shoulder (inside the Outer Ring)" },
    { id: "HUB-KEEP-SOUTHSLOPE", kind: "KEEP", at: keeps[1].center.slice(), townEstateId: keeps[1].parcelId,
      name: "South Slope Beacon", ref: "beacon tower on the massif's southern slope" },
    { id: "HUB-KEEP-DRAGONTAIL", kind: "KEEP", at: keeps[2].center.slice(), townEstateId: keeps[2].parcelId,
      name: "Dragontail Beacon", ref: "beacon tower under the Dragontail Ridge" },
    { id: "HUB-KEEP-SHAFTWATCH", kind: "KEEP", at: shaftwatch.center.slice(), townEstateId: shaftwatch.parcelId,
      name: "Shaftwatch Beacon", ref: "beacon tower inside the Dragonmaw caldera, watching the Worldshaft (estate-map castle — its LARGE estate has no L3 subdivision)" },
  ];

  // ---- rural web (owner: "the rural area we can use current" — the EDU town-link style verbatim) --
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const netPolys = [...HIGHWAYS, ...urban.map((u) => u.pts)];
  const CITIES = [{ c: CAP, r: 11 }, { c: PORT, r: 7 }, { c: ME, r: 7 }, { c: MNW, r: 7 }, { c: MSE, r: 7 }];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "HUB|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(10, L * 0.35);
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 1.0, 30);
    if (crossings(poly, RIDGES) > 0) {                              // one reroute attempt via a rim gap
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.8, 30);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
      // else: accept the pass — a mountain road over the massif shoulder
    }
    if (crossings(poly, RIVERS) > 2) {                              // bridge budget: ≤ 2 river crossings
      const flat = build([a, b], 0.4, 24);
      if (crossings(flat, RIVERS) <= crossings(poly, RIVERS)) poly = flat;
    }
    return poly;
  }
  const secondaries = [];
  let secN = 0;
  const addSecondary = (pts, name) => {
    secN++; secondaries.push({ id: `HUB-SEC${String(secN).padStart(3, "0")}`, name, pts });
    netIdx.addPolyline(pts); netPolys.push(pts);
  };
  const townName = (t) => `Town ${t.id}`;
  // pass 1 — neighbour pair roads (EDU style verbatim), tracked with UNION-FIND so pass 2 can
  // guarantee every pair-cluster reaches the trunk (164 towns ⇒ pair links alone leave floating
  // two-town strands; EDU's 28 towns hid that — HUB must connect every cluster).
  const parent = new Map(towns.map((t) => [t.id, t.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const pairPolys = new Map();                                      // town id → its pair polylines
  const seenPairs = new Set();
  for (const t of towns) {
    let nb = null, bdN = Infinity;
    for (const u of towns) {
      if (u === t) continue;
      const d = dist(u.at, t.at);
      if (d < bdN) { bdN = d; nb = u; }
    }
    if (!nb) continue;
    const ca = inCity(t.at), cb = inCity(nb.at);
    if (ca >= 0 && ca === cb) continue;                             // the metro web serves in-city pairs
    const pk = [t.id, nb.id].sort().join("~");
    if (seenPairs.has(pk)) continue;
    seenPairs.add(pk);
    const poly = routeRoad(t.at, nb.at, `sec|${pk}`);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.65) { union(t.id, nb.id); continue; } // near-net: both count as served
    addSecondary(poly, `${townName(t)} – ${townName(nb)} Road`);
    union(t.id, nb.id);
    for (const id of [t.id, nb.id]) { if (!pairPolys.has(id)) pairPolys.set(id, []); pairPolys.get(id).push(poly); }
  }
  // pass 2 — connect every town COMPONENT to the CONNECTED network (trunk + urban + earlier links).
  // connIdx holds only geometry known to touch the trunk; a component's best-placed town links in,
  // then the whole component's pair roads join connIdx.
  const connIdx = makeIndex();
  for (const h of HIGHWAYS) connIdx.addPolyline(h);
  for (const u of urban) connIdx.addPolyline(u.pts);
  const comps = new Map();                                          // root id → [towns] (id order)
  for (const t of towns) { const r = find(t.id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(t); }
  for (const root of [...comps.keys()].sort()) {
    const members = comps.get(root);
    let best = null, bd = Infinity, bpt = null;
    for (const t of members) {
      const { pt, d } = connIdx.nearest(t.at[0], t.at[1]);
      if (pt && d < bd) { bd = d; best = t; bpt = pt; }
    }
    if (best && bd >= 2.0) {
      const poly = routeRoad(best.at, bpt, `hwy|${best.id}`);
      if (nearFractionIdx(poly, netIdx, 2.0) > 0.65) {
        const spur = natural([best.at, bpt], 0.3, 12, `HUB|road|spur|${best.id}`, 8);
        addSecondary(spur, `${townName(best)} Spur`);
        connIdx.addPolyline(spur);
      } else {
        addSecondary(poly, `${townName(best)} Link`);
        connIdx.addPolyline(poly);
      }
    }
    for (const t of members) for (const p of pairPolys.get(t.id) || []) connIdx.addPolyline(p);
  }

  // ---- local roads: ~60 seeded MEDIUM estates → nearest network point -----------------------------
  const locals = [];
  const pickR = rng32(fnv1a("HUB|locals|pick"));
  const shuffled = mediums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 60) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.2 || d > 26) continue;
    const r = rng32(fnv1a("HUB|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(4, L * 0.4);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.6, 10, "HUB|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.75) continue;
    locN++;
    locals.push({ id: `HUB-LOC${String(locN).padStart(2, "0")}`, name: `Hamlet ${m.id} Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }
  // the Worldshaft pilgrim road: capital E gate → through the Dragonmaw gap → the shaft mouth
  const shaftRoad = natural([gate2E, [(gate2E[0] + gapMid[0]) / 2, (gate2E[1] + gapMid[1]) / 2 - 0.6], gapMid, SHAFT], 0.3, 14, "HUB|road|shaft", 8);
  locals.push({ id: "HUB-LOC-SHAFT", name: "Worldshaft Pilgrim Road", pts: shaftRoad });
  netIdx.addPolyline(shaftRoad);

  // ---- castle approaches: every castle sits ≤1u from the road network ------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.3, 10, "HUB|road|approach|" + c.id, 8);
    approaches.push({ id: `HUB-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- output --------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "HUB (Tianxia) macro feature network — the continuous-terrain field, capital continent",
      author: "Map-maker session, 2026-07-10 (regenerate with map-service/tools/world_terrain_hub.mjs)",
      coords: "HUB zone svg viewBox (0 0 358.2 231.1); y down; y=0 edge faces BUS (north). Same space as data/hexagon-city-source/l3/HUB.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords.",
      grounding: "Worldshaft + Dragonmaw massif at (179,114) (atlas §2.1: caldera rim, radial rivers, river crossroads); capital EPIC " + capital.parcelId + " at (" + CAP.map((n) => n.toFixed(1)) + "); river crossroads K=(146,127).",
      determinism: "generated by map-service/tools/world_terrain_hub.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale (1 parcel ≈ 0.68 u across); world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors).",
      gameplay: "units can walk over water for now (owner 2026-07-10) — rivers are terrain/visual continuity, not hard blockers; fords/bridges come with the toll/gate layer.",
      era: "Tianxia = LAYERED CHINESE METROPOLIS (owner-locked 2026-07-10: Beijing/Chengdu/Xi'an — modern living, high population, ancient history). Ancient imperial cores (rect palace/city walls + straight ceremonial axes — planned rectilinear IS correct here, unlike Arcadia's never-grid rule) wrapped in modern ring roads + radial expressways. Rural countryside stays the organic EDU-style town web verbatim (owner-locked).",
      hierarchy: "roads carry tier: highway (6 radial trunk roads — the national-road star N/S/W/E/NW/SE — plus every modern ring road + the capital's radial expressways) / secondary (city axes, wall roads, bunds, Chengdu radials + the rural town links: towns = the 164 GIANT+LARGE L2 estate anchors, valley curves, ≤2 river bridges each, connect-don't-double dedup) / local (old-town cores, hutong/chord lanes, quays, ~40 seeded MEDIUM feeders, the Worldshaft pilgrim road, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c (castles on ESTATES; importance→size): PALACE Zhongdu/Vermilion (capital EPIC " + capital.parcelId + ") / CASTLE at each secondary-metro EPIC (" + [port, metroE, metroNW, metroSE].map((p) => p.parcelId).join("/") + ") / CASTLE at 2 strategic L3-subdivided GIANTs (bridge-guard " + bridgeGuard.parcelId + ", fork-guard " + forkGuard.parcelId + ") / KEEP at 3 L3-subdivided massif LARGEs (" + keeps.map((k) => k.parcelId).join("/") + ") + Shaftwatch (" + shaftwatch.parcelId + ", caldera). NO HUB EPIC is L3-subdivided — palace/metro castle battle maps arrive with the pre-designed ESTATE maps (canon 4/5); the forts+keeps sit on playable L3 parcels and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META,
      continuity: "S border: receives EDU's Arcadia Flow at x=164 (EDU-RV1 exits EDU local (64,0) = world x 100+64; HUB worldOffset (0,0) ⇒ HUB local x = world x; the flat-picker viewBoxes overlap in z, so the S edge is the shared frontier aligned in x) + the Southern Tribute Road stub. N border: Tianhe + Imperial North Road + Beiliu exit toward BUS. W border: Xijiang + West Caravan Road exit toward ENT. E/NE: frontier-rim stubs (beyond-the-frontier).",
    },
    zone: "HUB",
    rivers: [
      { id: "HUB-RV1", name: "Tianhe", width: 1.3, pts: riverTianhe },
      { id: "HUB-RV2", name: "Jinshui", width: 0.8, joins: "HUB-RV1", pts: riverJinshui },
      { id: "HUB-RV3", name: "Xijiang", width: 1.0, pts: riverXijiang },
      { id: "HUB-RV4", name: "Beiliu", width: 0.7, pts: riverBeiliu },
    ],
    roads: [
      { id: "HUB-RD1", name: "Imperial North Road", tier: "highway", width: 0.5, pts: roadNorth },
      { id: "HUB-RD2", name: "Southern Tribute Road", tier: "highway", width: 0.5, pts: roadSouth },
      { id: "HUB-RD3", name: "West Caravan Road", tier: "highway", width: 0.5, pts: roadWest },
      { id: "HUB-RD4", name: "East Frontier Road", tier: "highway", width: 0.5, pts: roadEast },
      { id: "HUB-RD5", name: "Northwest Frontier Road", tier: "highway", width: 0.45, pts: roadNW },
      { id: "HUB-RD6", name: "Southeast Road", tier: "highway", width: 0.45, pts: roadSE },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: u.tier, width: u.tier === "highway" ? 0.42 : u.tier === "secondary" ? 0.32 : 0.22, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.32, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "HUB-RG1", name: "Dragonmaw Rim", width: 2.5, pts: rim },
      { id: "HUB-RG2", name: "Dragonspine North Arm", width: 2.2, pts: armN },
      { id: "HUB-RG3", name: "Dragontail Ridge", width: 2.2, pts: armSE },
    ],
    castles: CASTLES,
    pois: [
      { id: "HUB-CITY", kind: "CAPITAL", at: CAP.slice(), note: "Zhongdu, the capital — EPIC estate " + capital.parcelId + " at the Tianhe⋈Jinshui river crossroads" },
      // SINGULAR PLACE (depth-layer 2, data/singulars.json `the_shaft`): the existing Worldshaft
      // POI IS the singular — bound in place, never duplicated.
      { id: "HUB-SHAFT", kind: "UNDERWORLD_SHAFT", at: SHAFT.slice(), singularId: "the_shaft", name: "The Shaft of Tianxia",
        connects: ["HUB", "UW1"], warden: "the Shaft-Guardian",
        legend: "The wound where the deep first broke through; the only road down.",
        note: "the Worldshaft — the world's single surface→UW portal, inside the Dragonmaw caldera (atlas §2.1). The ARMY descent: Tianxia → Ironhold (UW1) → UW2 → UW3 (the industrial way, boss-gated). EF Hunt cycle-2+ civilians descend it WITH the freight (the Stair is Mythoria's one-soul route; the Shaft is Tianxia's freight route) — no separate Tianxia↔Blackmere portal needed." },
      { id: "HUB-GATE-S", kind: "GATE", at: [164, 229.5], connects: ["HUB", "EDU"], note: "south gate — receives the Arcadia Flow (→ Tianhe) + the Southern Tribute Road from Arcadia" },
      { id: "HUB-GATE-N", kind: "GATE", at: [170, 3], connects: ["HUB", "BUS"], note: "north gate — Tianhe + Imperial North Road exit toward the Porthaven deltas" },
      { id: "HUB-GATE-W", kind: "GATE", at: [3, 161], connects: ["HUB", "ENT"], note: "west gate — Xijiang + West Caravan Road exit toward Mythoria" },
      { id: "HUB-GATE-NW", kind: "GATE", at: [26, 58], connects: ["HUB"], note: "northwest frontier gate — beyond-the-frontier stub" },
      { id: "HUB-GATE-E", kind: "GATE", at: [345, 84], connects: ["HUB"], note: "east frontier gate — beyond-the-frontier stub toward the sky tier's shoulder" },
      { id: "HUB-PORT-SKY", kind: "AIRSHIP_PORT", at: [+(ME[0] + 8).toFixed(1), +(ME[1] - 5.5).toFixed(1)], note: "Yong'an Sky Dock — the NE-shoulder airship port facing the sky tier (atlas §2.1)" },
    ],
  };
  // heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
  const heroStats = attachHeroParcels(out, hub, l3.singles);
  return { out, stats: { towns: towns.length, urban: urban.length, secondaries: secondaries.length, locals: locals.length, approaches: approaches.length, heroStats } };
}

// ---- build twice, byte-compare, write once --------------------------------------------------------
const b1 = buildField();
const s1 = JSON.stringify(b1.out) + "\n";
const s2 = JSON.stringify(buildField().out) + "\n";
const h1 = createHash("sha256").update(s1).digest("hex");
const h2 = createHash("sha256").update(s2).digest("hex");
if (h1 !== h2) { console.error("NON-DETERMINISTIC BUILD:", h1, "≠", h2); process.exit(1); }
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/HUB.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/HUB.json sha256", h1.slice(0, 16),
  "| towns", b1.stats.towns,
  "| urban roads", b1.stats.urban,
  "| secondary roads", b1.stats.secondaries,
  "| local roads", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
