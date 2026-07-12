#!/usr/bin/env node
// world_terrain_bus.mjs — REPRODUCIBLE generator for data/world-terrain/BUS.json (Porthaven).
//
// Porthaven = the BUS Northern Commercial Coast, the world's mercantile metropolis continent.
// Owner-locked era (CONTINUOUS-WORLD-TERRAIN §3b): **MODERN port metropolis (New York /
// Singapore)** — street grid + waterfront piers/quays; star-fort-era citadel at the harbour
// mouth. Canon: CONTINUOUS-WORLD-TERRAIN §3 (BUS row = New York aerial reference), §3c
// (castles on ESTATES: PALACE→EPIC, CASTLE→GIANT, KEEP→LARGE); CONTINENT-TERRAIN-ATLAS §2.2
// (northern ocean on the NE-facing shore, S→N delta river network fed by the HUB watershed,
// low coastal bluffs, sea-ports along the whole coast, swamp deltas / verdant lowland).
//
// THE MODERN PORT METROPOLIS (the "Manhattan" of the world):
//   • THE CAPITAL "Porthaven" — a rectilinear street GRID core (7 avenues × 9 streets — the
//     modern planned grid IS correct here per §3b, unlike Arcadia's never-grid rule) + ONE
//     signature diagonal boulevard cutting the grid (the Longwalk — the Broadway move) +
//     an expressway ring ("Harbour Drive", the Singapore-ECP waterfront drive) + a Quayside
//     bund along the river's west bank COMBED with piers into the water + 2 trunk bridges
//     over the Broadwater (the Tidegate Bridge at the narrows + the South Bridge on the
//     Meridian Causeway) — the Brooklyn-Bridge moment.
//   • STAR-FORT CITADEL "Fort Tidegate" at the harbour mouth (kind CASTLE, star-fort era),
//     on its own L3-subdivided GIANT estate on the east headland commanding the river mouth.
//   • 3 SECONDARY PORT TOWNS along the commercial coast (small grid + harbour street + quay
//     row + piers each): Middlequay (central coast), Capemeet (the NW headland where the two
//     surface oceans join — the Singapore-style entrepôt), Eastreach (east coast).
//   • DELTA GEOGRAPHY: the main river arrives from HUB (Tianxia's Tianhe, HUB exit world
//     x=168 → BUS local x=128) as "the Broadwater", crosses the SW frontier marsh (the
//     clipped-pentagon corner is parcel-free), makes landfall at (172,152) and FANS into 3
//     distributaries reaching the sea (Broadwater mouth / the Reed Cut / the Saltmarsh
//     Reach); the Beiliu (HUB world x=210 → local 170) joins the stem at the landfall.
//     Causeways + trunk bridges cross the channels; marsh flats between.
//   • RURAL stays the organic countryside verbatim (owner-locked): towns = the real
//     GIANT+LARGE L2 estate anchors linked by valley-curve secondary roads (≤2 river
//     bridges, ridge-gap reroutes, connect-don't-double dedup) + seeded MEDIUM feeders.
//
// THE SEA (v1 representation): worldfield.js consumes rivers/roads/ridges only, so the
// Northern Ocean shore ships as ONE wide `rivers[]` band (id BUS-SEA) tracing the authored
// coastline — coastal parcels window it as their shore water (piers/quays touch real water
// on battle maps). The raw coastline polyline is ALSO exported as a top-level `coast[]`
// (additive; ignored by worldfield v1) for the future sea-fill kind. Sea = everything NE of
// the coast; the NW corner is where the BUS-north and ENT-west oceans join (atlas §7).
//
// DETERMINISTIC PICK RULES (all over data/hexagon-city-source/parcels-l2.json, zone==="BUS";
// ties broken by parcelId ascending; SEP = 55 zone-units between fortification picks):
//   CITY      = the EPIC estate nearest the authored coastline.               → 1001178
//   FORT      = the L3-SUBDIVIDED GIANT nearest the Broadwater mouth M=(147,31). → 2001144
//   3 TOWNS   = L3-SUBDIVIDED GIANTs by ascending coast distance, greedily accepted at
//               ≥SEP from every previous pick (city/fort/towns).
//               → 2001173 Middlequay · 2001117 Capemeet · 2001150 Eastreach
//   3 LIGHTS  = L3-SUBDIVIDED LARGEs by ascending coast distance, greedily accepted at
//               ≥30 from every previous pick (harbour-light keeps).
//               → 3000995 Deltalight · 3000986 Gullshoal · 3001035 Dunewatch
//   MARSHGATE = the L3-SUBDIVIDED LARGE nearest the causeway landfall (172,150). → 3001065
//   NOTE data fact: NO BUS EPIC estate is L3-subdivided (0/12) — the Grand Exchange palace
//   battle map arrives with the pre-designed ESTATE maps (canon decisions 4/5); fort, town
//   citadels and keeps are constrained to L3-subdivided estates so their castle POIs land on
//   PLAYABLE parcels today (the HUB build's precedent).
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d, shared
// rule in world_hero_parcels.mjs, identical in the EDU/HUB/BUS tools): each castle estate lists
// its HERO-MODE (3D) POI L3 parcelIds — castle parcel FIRST, length = LARGE 3 / GIANT 5 / EPIC 8.
// Deterministic pick: castle parcel = the L3 parcel containing (else nearest-center to) the
// castle POI point; the rest = greedy farthest-point spread over L3 centers PREFERRING parcels
// that intersect roads/rivers/coast polylines (they read as gates/bridge/harbour/approaches;
// eligible when spread ≥ 0.5× the step's best), ties by parcelId ascending. Estates with NO L3
// subdivision (all 12 BUS EPICs) emit heroParcels: [] + heroParcelsNote (designation DEFERRED
// until subdivision).
//
// HYDROLOGY (atlas: EDU plateau → HUB radial → BUS deltas → the northern ocean):
//   BUS-SEA  the Northern Ocean shore band (see THE SEA above).
//   RV1 the Broadwater (lower Tianhe): S border x=128 (HUB-RV1 exits HUB at (168,3); BUS
//       worldOffset x=40 ⇒ local = world−40), N through the frontier marsh, landfall
//       (172,152), past Porthaven's east waterfront, mouth into the sea at (148,28).
//   RV1B the Saltmarsh Reach: forks off RV1 at (165,118), NE across the delta, mouth (228,44).
//   RV1C the Reed Cut: forks off RV1B at (187,97), N, mouth (187,43).
//   RV2 the Beiliu: from HUB at x=170 (HUB exit world x=210), joins RV1 at the landfall.
//   RV3 the Westwater: NW-mass spring, NE to the sea at (104,13).
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_bus.mjs
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachHeroParcels, HERO_PARCELS_META } from "./world_hero_parcels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ---- deterministic rng (same family as the EDU/HUB generators) ---------------------------------
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const rng32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- Catmull-Rom spline + seeded meander (verbatim: the EDU/HUB tools) --------------------------
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
// a PLANNED straight street (the modern grid avenue) — sampled, no meander
function straight(ctrl, step = 0.6) {
  const out = [ctrl[0].slice()];
  for (let i = 1; i < ctrl.length; i++) {
    const [ax, ay] = ctrl[i - 1], [bx, by] = ctrl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return round2(out);
}
// modern RING ROAD — rounded rectangle (the expressway-ring shape; verbatim the HUB tool)
function roundedRectRing(c, rx, ry, cr, key, wobble = 0.05, n = 72) {
  const r = rng32(fnv1a(key));
  const ph = [r() * 6.283, r() * 6.283];
  cr = Math.min(cr, rx, ry);
  const ex = rx - cr, ey = ry - cr;
  const arcL = 2 * Math.PI * cr;
  const per = 4 * ex + 4 * ey + arcL;
  const pt = (s) => {
    let d = s;
    const segs = [
      { L: ex, f: (t) => [c[0] + t, c[1] - ry] },
      { L: arcL / 4, f: (t) => { const a = -Math.PI / 2 + t / cr; return [c[0] + ex + Math.cos(a) * cr, c[1] - ey + Math.sin(a) * cr]; } },
      { L: 2 * ey, f: (t) => [c[0] + rx, c[1] - ey + t] },
      { L: arcL / 4, f: (t) => { const a = t / cr; return [c[0] + ex + Math.cos(a) * cr, c[1] + ey + Math.sin(a) * cr]; } },
      { L: 2 * ex, f: (t) => [c[0] + ex - t, c[1] + ry] },
      { L: arcL / 4, f: (t) => { const a = Math.PI / 2 + t / cr; return [c[0] - ex + Math.cos(a) * cr, c[1] + ey + Math.sin(a) * cr]; } },
      { L: 2 * ey, f: (t) => [c[0] - rx, c[1] + ey - t] },
      { L: arcL / 4, f: (t) => { const a = Math.PI + t / cr; return [c[0] - ex + Math.cos(a) * cr, c[1] - ey + Math.sin(a) * cr]; } },
      { L: ex, f: (t) => [c[0] - ex + t, c[1] - ry] },
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
const distToPolyline = (p, line) => {
  let m = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    m = Math.min(m, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return m;
};

// grid index over network VERTICES (BUS has 195 GIANT+LARGE towns — same scaling need as HUB)
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
        if (best && (ring - 1) * CELL > Math.sqrt(bd)) break;
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
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/BUS.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));  // estates with playable L3 parcels
  const bus = l2.parcels.filter((p) => p.zone === "BUS");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const epics = bus.filter((p) => p.sizeClass === "EPIC").sort(byId);
  const giants = bus.filter((p) => p.sizeClass === "GIANT").sort(byId);
  const larges = bus.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = bus.filter((p) => p.sizeClass === "GIANT" || p.sizeClass === "LARGE")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const mediums = bus.filter((p) => p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));

  // ---- THE COAST (authored: the NE-facing shore of the diagonal landmass; sea = NE of it) --------
  // Traced against the real L2 parcel envelope (nothing seaward of these points holds a parcel).
  // The NW corner (x<26) is where the northern ocean meets the western (ENT) ocean — atlas §7.
  const COAST_CTRL = [
    [0, 44], [4, 36], [10, 26], [18, 15], [26, 8], [32, 5.4], [38, 2.5], [54, 0.5], [68, 2], [82, 5.5],
    [95, 10], [108, 14], [121, 18], [135, 26], [146, 34], [162, 38], [175, 40], [187, 42],
    [201, 44], [215, 46], [228, 48], [241, 50], [262, 54], [280, 60], [295, 70], [310, 80],
    [318, 90], [322, 100], [330, 110], [338, 118], [344, 128], [352, 136], [354.05, 142],
  ];
  const coast = natural(COAST_CTRL, 0.7, 46, "BUS|coast", 8);

  // ---- rivers (the delta network; see HYDROLOGY in the header) -----------------------------------
  const LANDFALL = [172, 152];                                     // marsh causeway landfall + Beiliu join
  const FORK = [165, 118];                                         // Broadwater ⋈ Saltmarsh Reach
  const riverBroadwater = natural(
    [[128, 240.8], [133, 222], [140, 203], [150, 185], [162, 168], LANDFALL, [176, 140], [172, 128],
     FORK, [158, 108], [151, 98], [146, 89], [142, 80], [140, 72], [139, 64], [140, 56], [143, 47],
     [146, 39], [147, 32], [148, 26]],
    1.6, 36, "BUS|river|broadwater");
  const riverSaltmarsh = natural(
    [FORK, [176, 107], [187, 97], [197, 87], [206, 77], [214, 67], [221, 57], [226, 49], [228, 42]],
    1.1, 26, "BUS|river|saltmarsh");
  const riverReedcut = natural(
    [[187, 97], [186, 84], [184, 71], [183, 59], [185, 50], [187, 41]],
    0.7, 18, "BUS|river|reedcut");
  const riverBeiliu = natural(
    [[170, 240.8], [174, 224], [178, 206], [181, 188], [178, 170], [174, 158], [172.2, 152.6]],
    1.0, 30, "BUS|river|beiliu");
  const riverWestwater = natural(
    [[55, 118], [61, 101], [69, 86], [78, 71], [87, 57], [93, 45], [98, 33], [102, 21], [104, 12]],
    1.0, 28, "BUS|river|westwater");
  const RIVERS = [riverBroadwater, riverSaltmarsh, riverReedcut, riverBeiliu, riverWestwater];

  // ---- ridges (atlas: low relief — coastal dunes NW, low downs inland SE) ------------------------
  const dunes = natural([[30, 26], [40, 21], [50, 17], [58, 14.5]], 1.0, 22, "BUS|ridge|dunes");
  const downs = natural([[213, 194], [228, 204], [244, 215], [258, 226]], 1.2, 26, "BUS|ridge|downs");
  const RIDGES = [dunes, downs];
  const RIDGE_GAPS = [[30, 26], [58, 14.5], [213, 194], [258, 226]];

  // ---- deterministic city/castle picks (rules in the header) -------------------------------------
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const dCoast = (p) => distToPolyline(p, coast);
  const city = epics.slice().sort((a, b) => (dCoast(a.center) - dCoast(b.center)) || byId(a, b))[0];
  const CITY = city.center.slice();
  const MOUTH = [147, 31];                                         // the Broadwater mouth (authored)
  const giantsPlay = giants.filter((p) => l3Parents.has(p.sourceIndex));
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const fort = giantsPlay.slice().sort((a, b) => (dist(a.center, MOUTH) - dist(b.center, MOUTH)) || byId(a, b))[0];
  const SEP = 55;
  const picked = [{ center: CITY }, fort];
  const townPicks = [];
  for (const g of giantsPlay.filter((p) => p !== fort).sort((a, b) => (dCoast(a.center) - dCoast(b.center)) || byId(a, b))) {
    if (townPicks.length >= 3) break;
    if (picked.every((q) => dist(q.center, g.center) >= SEP) && townPicks.every((q) => dist(q.center, g.center) >= SEP)) {
      townPicks.push(g); picked.push(g);
    }
  }
  const lightPicks = [];
  for (const g of largesPlay.slice().sort((a, b) => (dCoast(a.center) - dCoast(b.center)) || byId(a, b))) {
    if (lightPicks.length >= 3) break;
    if (picked.every((q) => dist(q.center, g.center) >= 30) && lightPicks.every((q) => dist(q.center, g.center) >= 30)) {
      lightPicks.push(g); picked.push(g);
    }
  }
  const marshgate = largesPlay.filter((p) => !lightPicks.includes(p))
    .sort((a, b) => (dist(a.center, [172, 150]) - dist(b.center, [172, 150])) || byId(a, b))[0];
  const FORT = fort.center.slice();
  const TOWN_NAMES = ["Middlequay", "Capemeet", "Eastreach"];      // coast-distance pick order
  const LIGHT_NAMES = ["Deltalight Keep", "Gullshoal Light", "Dunewatch Light"];

  // ---- THE CAPITAL "Porthaven" — the modern grid port metropolis ---------------------------------
  const urban = [];                                                // { id, name, tier, pts }
  let cwN = 0;
  const addUrban = (name, tier, pts, idOverride) => { cwN++; urban.push({ id: idOverride || `BUS-CW${String(cwN).padStart(2, "0")}`, name, tier, pts }); };
  // the expressway ring — Harbour Drive (the ECP waterfront-drive feel; east side nears the river)
  const harbourDrive = roundedRectRing(CITY, 6.0, 7.0, 1.8, "BUS|cap|ring", 0.05, 80);
  addUrban("Harbour Drive", "highway", harbourDrive, "BUS-CW-RING");
  // the street grid: 7 avenues (N–S) × 9 streets (E–W), exactly rectilinear (§3b: modern grid)
  const AVE_NAMES = ["West 3rd Avenue", "West 2nd Avenue", "West 1st Avenue", "Meridian Avenue", "East 1st Avenue", "East 2nd Avenue", "Dockside Avenue"];
  for (let k = -3; k <= 3; k++) {
    const x = +(CITY[0] + k * 1.4).toFixed(2);
    addUrban(AVE_NAMES[k + 3], k === 0 || k === 3 ? "secondary" : "local",
      straight([[x, CITY[1] - 5.6], [x, CITY[1] + 5.6]], 0.55));
  }
  const ST_NAMES = ["North 4th Street", "North 3rd Street", "North 2nd Street", "North 1st Street", "Grand Street", "South 1st Street", "South 2nd Street", "South 3rd Street", "South 4th Street"];
  for (let j = -4; j <= 4; j++) {
    const y = +(CITY[1] + j * 1.4).toFixed(2);
    addUrban(ST_NAMES[j + 4], j === 0 ? "secondary" : "local",
      straight([[CITY[0] - 4.2, y], [CITY[0] + 4.2, y]], 0.55));
  }
  // the Longwalk — the ONE diagonal boulevard cutting the grid (the Broadway move)
  addUrban("The Longwalk", "secondary",
    straight([[CITY[0] - 4.9, CITY[1] + 6.3], [CITY[0] + 2.8, CITY[1] - 6.3]], 0.5), "BUS-CW-LONGWALK");
  // the Quayside — a bund along the Broadwater's CITY bank, combed with piers into the water
  let i0 = 0, bd0 = Infinity;
  for (let i = 0; i < riverBroadwater.length; i++) { const d = dist(riverBroadwater[i], CITY); if (d < bd0) { bd0 = d; i0 = i; } }
  const qNear = riverBroadwater[i0];
  // side sign s.t. the bund offset +s·1.15·n̂ (n̂ = (-dy,dx)/L) lands on the CITY bank:
  // sign of (CITY − qNear)·n̂ — the Quayside must comb the city's own waterfront
  const citySide = Math.sign(-(CITY[0] - qNear[0]) * (riverBroadwater[i0 + 1][1] - riverBroadwater[i0 - 1][1]) + (CITY[1] - qNear[1]) * (riverBroadwater[i0 + 1][0] - riverBroadwater[i0 - 1][0])) || 1;
  const quayside = [];
  for (let i = Math.max(1, i0 - 13); i <= Math.min(riverBroadwater.length - 2, i0 + 13); i++) {
    const a = riverBroadwater[i - 1], b = riverBroadwater[i + 1], p = riverBroadwater[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    quayside.push([+(p[0] - (dy / L) * citySide * 1.15).toFixed(2), +(p[1] + (dx / L) * citySide * 1.15).toFixed(2)]);
  }
  addUrban("The Quayside", "secondary", quayside, "BUS-CW-QUAY");
  const pierR = rng32(fnv1a("BUS|cap|piers"));
  for (let q = 0; q < 4; q++) {
    const bi = Math.max(1, Math.min(quayside.length - 2, Math.round((0.2 + q * 0.2) * quayside.length + (pierR() - 0.5) * 2)));
    const a = quayside[bi];
    const rn = nearestOn([riverBroadwater], a[0], a[1]);
    const dx = rn.pt[0] - a[0], dy = rn.pt[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const reach = Math.max(0.35, L - 0.2);                          // a jetty INTO the water, short of midstream
    addUrban(`Pier ${q + 1}`, "local", straight([a, [a[0] + (dx / L) * reach, a[1] + (dy / L) * reach]], 0.4));
  }
  // two ferry lanes tying the ring's east edge to the Quayside
  for (const [tag, dy] of [["North", -2.8], ["South", 2.8]]) {
    const qn = nearestOn([quayside], CITY[0] + 6.0, CITY[1] + dy);
    addUrban(`${tag} Ferry Lane`, "local", straight([[CITY[0] + 6.0, CITY[1] + dy], qn.pt], 0.5));
  }

  // ---- SECONDARY PORT TOWNS — small grid + harbour street + quay row + piers ---------------------
  let mtN = 0;
  const addTown = (name, tier, pts) => { mtN++; urban.push({ id: `BUS-MT${String(mtN).padStart(2, "0")}`, name, tier, pts }); };
  const townQuays = [];
  townPicks.forEach((t, ti) => {
    const T = t.center, name = TOWN_NAMES[ti];
    let Q = coast[0], qd = Infinity;
    for (const p of coast) { const d = dist(p, T); if (d < qd) { qd = d; Q = p; } }
    const dq = [(Q[0] - T[0]) / (qd || 1), (Q[1] - T[1]) / (qd || 1)];
    const pq = [-dq[1], dq[0]];
    for (let k = -1; k <= 1; k++)
      addTown(`${name} ${["West", "Mid", "East"][k + 1]} Avenue`, "local",
        straight([[T[0] + k * 1.15, T[1] - 1.75], [T[0] + k * 1.15, T[1] + 1.75]], 0.5));
    for (let j = -1; j <= 1; j++)
      addTown(`${name} ${["High", "Market", "Low"][j + 1]} Street`, j === 0 ? "secondary" : "local",
        straight([[T[0] - 1.75, T[1] + j * 1.15], [T[0] + 1.75, T[1] + j * 1.15]], 0.5));
    addTown(`${name} Harbour Street`, "secondary", natural([T, Q], 0.25, 12, `BUS|town|${name}|harbour`, 8));
    addTown(`${name} Quay`, "local", straight([[Q[0] - pq[0] * 1.6, Q[1] - pq[1] * 1.6], [Q[0] + pq[0] * 1.6, Q[1] + pq[1] * 1.6]], 0.4));
    for (const s of [-0.9, 0.9])
      addTown(`${name} Pier`, "local", straight([[Q[0] + pq[0] * s, Q[1] + pq[1] * s], [Q[0] + pq[0] * s + dq[0] * 1.1, Q[1] + pq[1] * s + dq[1] * 1.1]], 0.4));
    townQuays.push({ name, at: [+Q[0].toFixed(1), +Q[1].toFixed(1)] });
  });

  // ---- TRUNK HIGHWAYS ------------------------------------------------------------------------------
  const gateSE = ringPointToward(harbourDrive, [143, 93]);
  const gateNE = ringPointToward(harbourDrive, [160, 59]);
  const gateW = ringPointToward(harbourDrive, [96, 62]);
  // RD1 the Meridian Causeway: from HUB (Imperial North Road, world x=171 → local 131) across the
  // frontier marsh beside the Broadwater, then the WEST-BANK parkway into Porthaven's SE gate —
  // it never crosses the river (the Tidegate Bridge on the Coast Road is THE Broadwater bridge)
  const roadMeridian = natural([[131, 240.2], [137, 222], [144, 204], [153, 186], [166, 167], [168, 150],
    [164, 128], [157, 116], [150, 104], [143, 93], [138, 88], gateSE], 0.7, 40, "BUS|road|meridian");
  // RD2 the Coast Road: Porthaven NE gate → Tidegate Bridge → Fort Tidegate → the delta bridges →
  // Middlequay → the east shore → Eastreach → E frontier stub
  const roadCoast = natural([gateNE, [140, 66], [150, 61], [160, 59], [172, 55], [187, 50], [202, 52],
    [218, 55], [241, 58], [258, 62], [273, 65], [288, 72], [302, 82], [312, 94], [318, 106],
    [322, 118], [326.5, 132.5], [334, 142], [344, 148], [354, 151]], 0.7, 42, "BUS|road|coast");
  // RD3 the West Shore Road: Porthaven W gate → the NW mass → Capemeet → W frontier stub
  const roadWestShore = natural([gateW, [112, 72], [96, 62], [80, 50], [66, 40], [52, 33], [35, 28],
    [24, 29], [17, 30], [10, 38], [5, 50], [3, 62]], 0.8, 42, "BUS|road|westshore");
  // RD4 the Southeast Frontier Road: branches off the Causeway at the landfall junction, crosses
  // the Beiliu once (the Beiliu Bridge) → the SE mass → S frontier stub
  const roadFrontier = natural([[168, 150], [180, 159], [195, 169], [216, 181], [232, 192], [247, 204],
    [262, 216], [275, 229], [288, 238], [291, 240.2]], 0.8, 40, "BUS|road|frontier");
  const HIGHWAYS = [roadMeridian, roadCoast, roadWestShore, roadFrontier];

  // ---- castles (§3c + the header's pick rules) ----------------------------------------------------
  const CASTLES = [
    { id: "BUS-PALACE-EXCHANGE", kind: "PALACE", at: CITY.slice(), townEstateId: city.parcelId,
      name: "The Grand Exchange", ref: "New York — the civic seat of Porthaven, the port metropolis: grid core, Harbour Drive ring, the Longwalk diagonal, Quayside piers" },
    { id: "BUS-FORT-TIDEGATE", kind: "CASTLE", at: FORT.slice(), townEstateId: fort.parcelId,
      name: "Fort Tidegate", ref: "star-fort citadel at the harbour mouth (Governors Island / Fort Siloso pattern) — the east headland commanding the Broadwater's exit to the sea" },
    { id: "BUS-CASTLE-MIDDLEQUAY", kind: "CASTLE", at: townPicks[0].center.slice(), townEstateId: townPicks[0].parcelId,
      name: "Middlequay Citadel", ref: "central-coast port town on the Coast Road — the mid-shore entrepôt" },
    { id: "BUS-CASTLE-CAPEMEET", kind: "CASTLE", at: townPicks[1].center.slice(), townEstateId: townPicks[1].parcelId,
      name: "Capemeet Citadel", ref: "the NW headland port where the northern and western oceans join (atlas §7) — the Singapore-style entrepôt" },
    { id: "BUS-CASTLE-EASTREACH", kind: "CASTLE", at: townPicks[2].center.slice(), townEstateId: townPicks[2].parcelId,
      name: "Eastreach Citadel", ref: "east-coast port town where the Coast Road turns for the frontier" },
    { id: "BUS-KEEP-DELTALIGHT", kind: "KEEP", at: lightPicks[0].center.slice(), townEstateId: lightPicks[0].parcelId,
      name: LIGHT_NAMES[0], ref: "harbour-light keep over the Saltmarsh Reach mouth — the delta lights" },
    { id: "BUS-KEEP-GULLSHOAL", kind: "KEEP", at: lightPicks[1].center.slice(), townEstateId: lightPicks[1].parcelId,
      name: LIGHT_NAMES[1], ref: "harbour-light keep on the east shore shoals" },
    { id: "BUS-KEEP-DUNEWATCH", kind: "KEEP", at: lightPicks[2].center.slice(), townEstateId: lightPicks[2].parcelId,
      name: LIGHT_NAMES[2], ref: "harbour-light keep behind the Gull Dunes, watching the northwest shore" },
    { id: "BUS-KEEP-MARSHGATE", kind: "KEEP", at: marshgate.center.slice(), townEstateId: marshgate.parcelId,
      name: "Marshgate Keep", ref: "causeway-guard keep on the Meridian Causeway's landfall out of the frontier marsh" },
  ];

  // ---- rural web (owner: rural stays the organic countryside — EDU/HUB style verbatim) -----------
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const netPolys = [...HIGHWAYS, ...urban.map((u) => u.pts)];
  const CITIES = [{ c: CITY, r: 10 }, { c: FORT, r: 4 }, ...townPicks.map((t) => ({ c: t.center, r: 5 }))];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "BUS|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(10, L * 0.35);
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 1.0, 30);
    if (crossings(poly, RIDGES) > 0) {                              // one reroute attempt via a ridge gap
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.8, 30);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
      // else: accept the crossing — a road over the low downs
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
    secN++; secondaries.push({ id: `BUS-SEC${String(secN).padStart(3, "0")}`, name, pts });
    netIdx.addPolyline(pts); netPolys.push(pts);
  };
  const townName = (t) => `Town ${t.id}`;
  // pass 1 — neighbour pair roads with UNION-FIND component tracking (the HUB pattern verbatim)
  const parent = new Map(towns.map((t) => [t.id, t.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const pairPolys = new Map();
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
    if (ca >= 0 && ca === cb) continue;                             // the urban web serves in-city pairs
    const pk = [t.id, nb.id].sort().join("~");
    if (seenPairs.has(pk)) continue;
    seenPairs.add(pk);
    const poly = routeRoad(t.at, nb.at, `sec|${pk}`);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.65) { union(t.id, nb.id); continue; }
    addSecondary(poly, `${townName(t)} – ${townName(nb)} Road`);
    union(t.id, nb.id);
    for (const id of [t.id, nb.id]) { if (!pairPolys.has(id)) pairPolys.set(id, []); pairPolys.get(id).push(poly); }
  }
  // pass 2 — connect every town COMPONENT to the CONNECTED network
  const connIdx = makeIndex();
  for (const h of HIGHWAYS) connIdx.addPolyline(h);
  for (const u of urban) connIdx.addPolyline(u.pts);
  const comps = new Map();
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
        const spur = natural([best.at, bpt], 0.3, 12, `BUS|road|spur|${best.id}`, 8);
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
  const pickR = rng32(fnv1a("BUS|locals|pick"));
  const shuffled = mediums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 60) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.2 || d > 26) continue;
    const r = rng32(fnv1a("BUS|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(4, L * 0.4);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.6, 10, "BUS|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.75) continue;
    locN++;
    locals.push({ id: `BUS-LOC${String(locN).padStart(2, "0")}`, name: `Hamlet ${m.id} Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- castle approaches: every castle sits ≤1u from the road network ------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.3, 10, "BUS|road|approach|" + c.id, 8);
    approaches.push({ id: `BUS-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- output --------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "BUS (Porthaven) macro feature network — the continuous-terrain field, port-metropolis continent",
      author: "Map-maker session, 2026-07-10 (regenerate with map-service/tools/world_terrain_bus.mjs)",
      coords: "BUS zone svg viewBox (0 0 354.05 242.41); y down; y=0 edge faces the northern ocean; y=242.41 edge faces HUB (south). Same space as data/hexagon-city-source/l3/BUS.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords.",
      grounding: "The landmass runs diagonally NW→SE; everything NE of the authored coastline is the Northern Ocean (atlas §2.2: the entire seaward edge is water, low relief, delta swamp at the mouths). Capital EPIC " + city.parcelId + " at (" + CITY.map((n) => n.toFixed(1)) + ") on the Broadwater's west bank; harbour mouth M=(147,31); the SW clipped-pentagon corner is parcel-free frontier marsh.",
      determinism: "generated by map-service/tools/world_terrain_bus.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale (1 parcel ≈ 0.65 u across); world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors).",
      sea: "v1: the Northern Ocean ships as the wide rivers[] band BUS-SEA tracing the coast (worldfield.js consumes rivers/roads/ridges only) — coastal parcels window it as their shore water, so quays/piers touch real water on battle maps. The raw coastline is also exported as coast[] (additive, ignored by worldfield v1) for a future sea-fill kind. Sea = NE of the coast; the NW corner (x<26) is where the northern and western (ENT) oceans join (atlas §7).",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — rivers/sea are terrain/visual continuity, not hard blockers; fords/bridges come with the real-water phase (CONTINUOUS-WORLD-TERRAIN §4b).",
      era: "Porthaven = MODERN PORT METROPOLIS (owner-locked 2026-07-10: New York / Singapore). Rectilinear street grid + one diagonal boulevard (the Longwalk) + expressway ring (Harbour Drive) + Quayside piers — the planned modern grid IS correct here (§3b), unlike Arcadia's never-grid rule. Fortification is star-fort era: Fort Tidegate at the harbour mouth. Rural countryside stays the organic EDU/HUB-style town web verbatim (owner-locked).",
      hierarchy: "roads carry tier: highway (4 trunk roads — Meridian Causeway / Coast Road / West Shore Road / Southeast Frontier Road — plus Harbour Drive) / secondary (grid boulevards, the Longwalk, the Quayside, town harbour streets + the rural town links: towns = the 195 GIANT+LARGE L2 estate anchors, valley curves, ≤2 river bridges each, connect-don't-double dedup) / local (grid avenues/streets, piers, ferry lanes, town grids+quays, ~60 seeded MEDIUM feeders, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c (castles on ESTATES; importance→size): PALACE the Grand Exchange (capital EPIC " + city.parcelId + ") / CASTLE Fort Tidegate — the star-fort at the harbour mouth (L3-subdivided GIANT " + fort.parcelId + ") / CASTLE at each secondary port town's L3-subdivided GIANT (" + townPicks.map((p) => p.parcelId).join("/") + ") / KEEP at 3 L3-subdivided coastal LARGEs — the harbour lights (" + lightPicks.map((k) => k.parcelId).join("/") + ") + Marshgate (" + marshgate.parcelId + ", the causeway guard). NO BUS EPIC is L3-subdivided (0/12) — the palace battle map arrives with the pre-designed ESTATE maps (canon 4/5); fort+citadels+keeps sit on playable L3 parcels and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META,
      continuity: "S border (shared frontier with HUB, aligned in world x; BUS worldOffset x=40 ⇒ local = world−40): receives HUB's Tianhe at local x=128 (HUB exit world x=168) as the Broadwater, HUB's Imperial North Road at local x=131 (world x=171) as the Meridian Causeway, and HUB's Beiliu at local x=170 (world x=210). The entries cross ~90 u of parcel-free SW frontier marsh (the clipped-pentagon corner) before landfall at (172,152) — documented, nothing windows there. N/NE: the Northern Ocean (3 delta mouths + the Westwater mouth). E: Coast Road frontier stub at (354,151). W: West Shore Road stub at (3,62) toward the joined oceans. SE: Frontier Road stub at (291,240).",
    },
    zone: "BUS",
    rivers: [
      { id: "BUS-SEA", name: "The Northern Ocean (shore band)", width: 3.0, pts: coast },
      { id: "BUS-RV1", name: "The Broadwater (lower Tianhe)", width: 1.4, pts: riverBroadwater },
      { id: "BUS-RV1B", name: "The Saltmarsh Reach", width: 1.0, joins: "BUS-RV1", pts: riverSaltmarsh },
      { id: "BUS-RV1C", name: "The Reed Cut", width: 0.8, joins: "BUS-RV1B", pts: riverReedcut },
      { id: "BUS-RV2", name: "The Beiliu", width: 0.8, joins: "BUS-RV1", pts: riverBeiliu },
      { id: "BUS-RV3", name: "The Westwater", width: 0.9, pts: riverWestwater },
    ],
    coast: [
      { id: "BUS-COAST", name: "The Northern Ocean coastline", seaSide: "NE", pts: coast },
    ],
    roads: [
      { id: "BUS-RD1", name: "The Meridian Causeway", tier: "highway", width: 0.5, pts: roadMeridian },
      { id: "BUS-RD2", name: "The Coast Road", tier: "highway", width: 0.5, pts: roadCoast },
      { id: "BUS-RD3", name: "The West Shore Road", tier: "highway", width: 0.45, pts: roadWestShore },
      { id: "BUS-RD4", name: "The Southeast Frontier Road", tier: "highway", width: 0.45, pts: roadFrontier },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: u.tier, width: u.tier === "highway" ? 0.42 : u.tier === "secondary" ? 0.32 : 0.22, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.32, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "BUS-RG1", name: "The Gull Dunes", width: 1.8, pts: dunes },
      { id: "BUS-RG2", name: "The Salt Downs", width: 2.0, pts: downs },
    ],
    castles: CASTLES,
    pois: [
      { id: "BUS-CITY", kind: "CAPITAL", at: CITY.slice(), note: "Porthaven, the port metropolis — EPIC estate " + city.parcelId + " on the Broadwater's west bank (grid core, Harbour Drive, the Longwalk, Quayside piers)" },
      // SINGULAR PLACE (depth-layer 2, data/singulars.json `first_dock`): the grand harbour POI
      // IS the singular — bound in place, never duplicated.
      { id: "BUS-HARBOUR", kind: "SEA_PORT", at: [+(CITY[0] + 8.7).toFixed(1), +(CITY[1] - 8).toFixed(1)], singularId: "first_dock", name: "The First Dock",
        legend: "Every sea-lane in the world was measured from this pier.",
        note: "the Broadwater harbour — Porthaven's deep-water roadstead between the Quayside and Fort Tidegate" },
      ...townQuays.map((q, i) => ({ id: `BUS-PORT-${TOWN_NAMES[i].toUpperCase()}`, kind: "SEA_PORT", at: q.at, note: `${q.name} quay — secondary port on the commercial coast` })),
      { id: "BUS-PORT-SKY", kind: "AIRSHIP_PORT", at: [296, 178], note: "Skyreach Anchorage — inland high-ground airship port facing the sky tier (atlas §2.2: BUS is the sky tier's closest dense surface population)" },
      // SINGULAR PLACE (depth-layer 2, data/singulars.json `salt_gate`): the delta's south gate —
      // the Tianhe enters the world's tax ledger here.
      { id: "BUS-GATE-S", kind: "GATE", at: [130, 240.8], connects: ["BUS", "HUB"], singularId: "salt_gate", name: "The Salt Gate",
        legend: "Porthaven taxes the tide itself here.",
        note: "south gate — receives the Tianhe (→ the Broadwater) + the Imperial North Road (→ the Meridian Causeway) from Tianxia across the frontier marsh" },
      { id: "BUS-GATE-SB", kind: "GATE", at: [170, 240.8], connects: ["BUS", "HUB"], note: "south-east water gate — receives the Beiliu from Tianxia" },
      { id: "BUS-GATE-SE", kind: "GATE", at: [291, 240.2], connects: ["BUS"], note: "southeast frontier gate — beyond-the-frontier stub" },
      { id: "BUS-GATE-E", kind: "GATE", at: [354, 151], connects: ["BUS"], note: "east frontier gate — beyond-the-frontier stub toward the sky tier's shoulder" },
      { id: "BUS-GATE-W", kind: "GATE", at: [3, 62], connects: ["BUS"], note: "west frontier gate — stub toward the joined oceans (BUS-north meets ENT-west, atlas §7)" },
    ],
  };
  // heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
  const heroStats = attachHeroParcels(out, bus, l3.singles);
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
writeFileSync(path.join(ROOT, "data/world-terrain/BUS.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/BUS.json sha256", h1.slice(0, 16),
  "| towns", b1.stats.towns,
  "| urban roads", b1.stats.urban,
  "| secondary roads", b1.stats.secondaries,
  "| local roads", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
