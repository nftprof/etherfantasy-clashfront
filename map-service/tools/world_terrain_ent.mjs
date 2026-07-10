#!/usr/bin/env node
// world_terrain_ent.mjs — REPRODUCIBLE generator for data/world-terrain/ENT.json (Mythoria).
//
// Mythoria = the ENT Western Carnival Coast, the world's festival/spectacle continent — a long,
// warm, lush ribbon hugging the WESTERN OCEAN its whole 526-unit length. Owner-locked era
// (CONTINUOUS-WORLD-TERRAIN §3b): **FESTIVAL mythic resort coast (Rio de Janeiro)** — a Rio
// carnival ribbon + a Venetian canal quarter as ONE POI city; shore-following strands, marina
// inlets, canal quarter, stilt lanes; fortification = watchtowers + temple keeps on headlands.
// Canon: CONTINUOUS-WORLD-TERRAIN §3 (ENT row = Rio aerial reference: coast ribbon between hills
// + sea, marina inlets, carnival waterfront), §3c (castles on ESTATES: PALACE→EPIC, CASTLE→GIANT,
// KEEP→LARGE), §3d (heroParcels via the SHARED world_hero_parcels.mjs rule);
// CONTINENT-TERRAIN-ATLAS §2.3 (entire W long edge = sea, interior N–S spine, short rivers W off
// the spine, latitude gradient, sparsest settlement — open festival grounds between resort
// estates). Zone-registry note: ENT is served as TWO slices (north/south) — purely server-side;
// the terrain field is ONE continuous zone (ignored here by design).
//
// THE CARNIVAL CAPITAL "Carnavale" (the "Rio" of the world, on the SW coast):
//   • a shore-following COAST RIBBON between the hills and the sea — NEVER a grid: the Mirella
//     Strand (the Copacabana beachfront lane hugging the authored coast arc), the Grand Carnavale
//     Way (the ONE Sambadrome-style festival parade avenue running parallel one block inland),
//     short curved festa cross-lanes between them, two winding LADEIRA hill lanes climbing east,
//     and the Way of Masks — the ceremonial approach up to the palace on the heights.
//   • MARINA INLETS combed with small piers: two water notches cut into the strand + 5 jetties.
//   • the PALACE OF MASKS (kind PALACE) at the heart of the capital EPIC estate on the hill
//     shelf behind the beach (Rio: the ribbon city below, the landmarks above).
//   • the CORCOVADO MOMENT: the Lady of Tides — a colossal statue LANDMARK above the bay on the
//     Lady's Crest, kept by TIDEWATCH TEMPLE (kind KEEP) on the L3-subdivided LARGE estate the
//     crest crosses; the Sugarcone dome closes the beach's north headland (the Sugarloaf move).
//   • THE VELARIA QUARTER — the Venetian canal quarter at the city's south end, on the SERENATA
//     DELTA: the river fans at the Velaria Fan into two distributaries (the Vela Reach + the
//     Lantern Reach); three canal CUTS between them, fondamenta lanes along the water, four
//     bridges, Lantern Plaza, and the VELARIA CAMPANILE (kind KEEP — the watchtower campanile)
//     on the L3-subdivided LARGE estate at the fan's landward bank.
//   • 3 RESORT TOWNS along the coast (strand lane + harbour way + marina inlet + 2 piers + two
//     curved festa lanes each — organic, never grid): Lanternshore, Petalport, Sunstrand; each
//     is a LARGE estate ⇒ its fortification is a WATCHTOWER KEEP (…"Watch"), per the §3c ladder.
//   • 2 CITADELS on L3-subdivided GIANTs (§3c GIANT→CASTLE): Rivergate Citadel (the Mirthwater
//     valley gate where the caravan road runs the river's bank) + Festgate Citadel (the eastern
//     gate of the festival grounds on the Festival Road).
//   • RURAL stays the organic countryside verbatim (owner-locked): towns = the real GIANT+LARGE
//     L2 estate anchors linked by valley-curve secondary roads (ridge-gap reroutes, ≤2 river
//     bridges, connect-don't-double dedup) + seeded MEDIUM feeders.
//
// THE SEA (v1 representation, the BUS precedent): worldfield.js consumes rivers/roads/ridges
// only, so the Western Ocean shore ships as ONE wide `rivers[]` band (id ENT-SEA) tracing the
// authored coastline — coastal parcels window it as their shore water (strands/piers/marinas
// touch real water on battle maps). The raw coastline polyline is ALSO exported as a top-level
// `coast[]` (additive; ignored by worldfield v1) for the future sea-fill kind. Sea = everything
// WEST of the coast; at the far NW the western ocean joins BUS's northern ocean (atlas §7).
//
// DETERMINISTIC PICK RULES (all over data/hexagon-city-source/parcels-l2.json, zone==="ENT";
// ties broken by parcelId ascending; SEP = 50 zone-units between fortification picks;
// "playable" = the estate has L3 subdivision — forts/keeps are constrained to playable estates
// so their castle POIs land on PLAYABLE parcels today, the HUB/BUS builds' precedent):
//   CITY      = the EPIC estate nearest the authored coastline.               → 1031491
//   RIVERGATE = the playable GIANT nearest the Mirthwater polyline.           → 2031488
//   FESTGATE  = the playable GIANT (excl. RIVERGATE) nearest the authored
//               festival-grounds gate point FG=(200,435).                     → 2031485
//   3 TOWNS   = playable LARGEs by ascending coast distance, greedily accepted while
//               dCoast ≤ 65 and ≥SEP from every previous pick (city/citadels/towns).
//               → 3031459 Petalport · 3031450 Lanternshore · 3031460 Sunstrand
//   CAMPANILE = the playable LARGE (excl. towns) nearest the Velaria Fan F=(70,468). → 3031461
//   TEMPLE    = the playable LARGE (excl. all above) nearest the capital EPIC center. → 3031453
//   NOTE data fact: NO ENT EPIC estate is L3-subdivided (0/3) — the Palace of Masks battle map
//   arrives with the pre-designed ESTATE maps (canon decisions 4/5); citadels + keeps sit on
//   playable L3 parcels and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d, shared
// rule in world_hero_parcels.mjs, identical in the EDU/HUB/BUS/ENT tools): each castle estate
// lists its HERO-MODE (3D) POI L3 parcelIds — castle parcel FIRST, length = LARGE 3 / GIANT 5 /
// EPIC 8; estates with NO L3 subdivision (all 3 ENT EPICs) emit heroParcels: [] + a deferral note.
//
// HYDROLOGY (atlas: HUB west-radial → ENT spine gap → the Western Ocean; short rivers W off the
// spine):
//   ENT-SEA  the Western Ocean shore band (see THE SEA above).
//   RV1 the Mirthwater (lower Xijiang): received from HUB on the E border at local y=178
//       (HUB-RV3 exits HUB at world (3,168); ENT worldOffset z=−10 ⇒ local y = world z + 10),
//       W across ~160 u of parcel-free eastern back-country, through the Mythos Gap in the
//       spine (y≈160–185), past Rivergate Citadel's south bank, mouth into the sea at (10.5,193)
//       under the Mirthmouth Bridge (the Garland Road's one river crossing).
//   RV2 the Serenata: rises on the spine's south end (118,402), SW past the hills, along the
//       Velaria Campanile's bank, fans at the Velaria Fan (70,468) into the Vela Reach (RV2A,
//       W to the sea at 25,469) + the Lantern Reach (RV2B, SW to the sea at 41,484); three
//       canal cuts (CN1–CN3) lace the quarter between them.
//   RV3 the Blossomrun: spine spring (133,98), W across the north cluster, sea mouth (5.5,100)
//       by Lanternshore.
//   + five short MARINA INLETS (capital ×2, one per resort town) — small sea notches.
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_ent.mjs
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachHeroParcels, HERO_PARCELS_META } from "./world_hero_parcels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ---- deterministic rng (same family as the EDU/HUB/BUS generators) -----------------------------
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const rng32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- Catmull-Rom spline + seeded meander (verbatim: the EDU/HUB/BUS tools) ----------------------
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
// a short PLANNED straight lane (jetties, canal bridges) — sampled, no meander
function straight(ctrl, step = 0.6) {
  const out = [ctrl[0].slice()];
  for (let i = 1; i < ctrl.length; i++) {
    const [ax, ay] = ctrl[i - 1], [bx, by] = ctrl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return round2(out);
}

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
// offset a contiguous y-range of a (near y-monotone) polyline sideways, toward a reference point
// — the shore-following move: strands/avenues/fondamentas hug the water they parallel.
function offsetRange(pts, yA, yB, d, toward) {
  let i0 = -1, i1 = -1;
  for (let i = 0; i < pts.length; i++) if (pts[i][1] >= yA && pts[i][1] <= yB) { if (i0 < 0) i0 = i; i1 = i; }
  if (i0 < 0) return [];
  const mid = pts[Math.floor((i0 + i1) / 2)];
  const a0 = pts[Math.max(0, i0 - 1)], b0 = pts[Math.min(pts.length - 1, i1 + 1)];
  const mdx = b0[0] - a0[0], mdy = b0[1] - a0[1], mL = Math.hypot(mdx, mdy) || 1;
  const sgn = Math.sign((toward[0] - mid[0]) * (-mdy / mL) + (toward[1] - mid[1]) * (mdx / mL)) || 1;
  const out = [];
  for (let i = i0; i <= i1; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], p = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    out.push([+(p[0] + (-dy / L) * sgn * d).toFixed(2), +(p[1] + (dx / L) * sgn * d).toFixed(2)]);
  }
  return out;
}

// grid index over network VERTICES (verbatim: the HUB/BUS tools)
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
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/ENT.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));  // estates with playable L3 parcels
  const ent = l2.parcels.filter((p) => p.zone === "ENT");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const epics = ent.filter((p) => p.sizeClass === "EPIC").sort(byId);
  const giants = ent.filter((p) => p.sizeClass === "GIANT").sort(byId);
  const larges = ent.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = ent.filter((p) => p.sizeClass === "GIANT" || p.sizeClass === "LARGE")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const mediums = ent.filter((p) => p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));

  // ---- THE COAST (authored: the WESTERN long edge is the sea, atlas §2.3; traced against the ----
  // real L2 parcel envelope — nothing seaward/west of these points holds a parcel). Runs N→S the
  // whole 526-unit ribbon: north-cap frontier → bay-and-headland strip → the Carnavale beach arc
  // (the shore swings SE past the capital) → around the SW cap toward the south frontier rim.
  const COAST_CTRL = [
    [20, 2], [22, 15], [11, 30], [7.5, 45], [1.5, 60], [1.4, 75], [3, 90], [6.8, 105], [5.8, 120],
    [11.5, 135], [10.4, 150], [10.4, 165], [10.9, 180], [10.4, 195], [8.4, 210], [7.8, 225],
    [7.2, 240], [9.2, 255], [9.4, 270], [10.2, 285], [9.6, 297], [16.5, 309], [16.2, 318], [16.4, 330],
    [13.2, 345], [8.5, 360], [3, 375], [2.2, 390], [1.2, 405], [1.5, 420], [3.8, 433],
    [7.5, 442], [11.4, 450], [17.5, 458], [23.6, 465], [31, 474], [39.9, 482], [50, 489],
    [58, 494.5], [61, 500.5], [78, 506.5], [94.3, 511], [111, 518.5],
  ];
  const coast = natural(COAST_CTRL, 0.6, 44, "ENT|coast", 8);

  // ---- rivers (see HYDROLOGY in the header) -------------------------------------------------------
  const FAN = [70, 468];                                            // the Velaria Fan (delta head)
  const riverMirthwater = natural(
    [[289.56, 178], [262, 176.5], [235, 174.5], [208, 173], [182, 172], [156, 171.5], [128, 172],
     [105, 168], [85, 164.5], [72, 162.5], [55, 166], [38, 173], [24, 182], [14, 188], [10.5, 193]],
    1.2, 34, "ENT|river|mirthwater");
  const riverSerenata = natural(
    [[118, 402], [112, 415], [104, 428], [96, 440], [88, 452], [83, 459], [81.8, 462], [79, 465.3], [75, 466.9], FAN],
    0.8, 24, "ENT|river|serenata");
  const riverVela = natural(
    [FAN, [63, 468.4], [54, 468.9], [44, 469.4], [33, 469.6], [25.2, 469.3]],
    0.35, 14, "ENT|river|vela");
  const riverLantern = natural(
    [FAN, [64, 471.8], [57, 475.4], [50, 479.2], [45, 482], [40.8, 484.3]],
    0.35, 14, "ENT|river|lantern");
  const cuts = [
    { id: "ENT-CN1", name: "The Mirror Cut", pts: natural([[61, 469.1], [60, 471.4], [59.2, 473.9]], 0.12, 5, "ENT|canal|1", 8) },
    { id: "ENT-CN2", name: "The Ribbon Cut", pts: natural([[54, 469.4], [52.4, 473.6], [50.6, 478.2]], 0.12, 5, "ENT|canal|2", 8) },
    { id: "ENT-CN3", name: "The Masque Cut", pts: natural([[47, 469.8], [45.9, 475.2], [44.9, 481.2]], 0.12, 5, "ENT|canal|3", 8) },
  ];
  const riverBlossomrun = natural(
    [[133, 98], [115, 102], [95, 105], [75, 106], [55, 107], [35, 106], [20, 104], [10, 102], [5.5, 100]],
    0.9, 26, "ENT|river|blossomrun");
  const RIVERS = [riverMirthwater, riverSerenata, riverVela, riverLantern, riverBlossomrun];

  // ---- ridges (atlas: the interior N–S spine + the capital's Rio hills) ---------------------------
  const spineN = natural([[150, 45], [143, 85], [136, 120], [132, 145], [129, 160]], 1.4, 30, "ENT|ridge|spineN");
  const spineS = natural([[122, 185], [114, 225], [110, 265], [112, 305], [118, 345], [124, 375], [124, 395]], 1.4, 32, "ENT|ridge|spineS");
  const sugarcone = natural([[4.5, 429], [7, 426], [9, 423]], 0.4, 8, "ENT|ridge|sugarcone", 8);
  const ladysCrest = natural([[34, 426], [41, 419], [48, 412]], 0.5, 10, "ENT|ridge|crest", 8);
  const RIDGES = [spineN, spineS, sugarcone, ladysCrest];
  const RIDGE_GAPS = [[150, 45], [129, 160], [122, 185], [124, 395], [34, 426], [48, 412]];

  // ---- deterministic city/castle picks (rules in the header) --------------------------------------
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const dCoast = (p) => distToPolyline(p, coast);
  const city = epics.slice().sort((a, b) => (dCoast(a.center) - dCoast(b.center)) || byId(a, b))[0];
  const CITY = city.center.slice();
  const giantsPlay = giants.filter((p) => l3Parents.has(p.sourceIndex));
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const rivergate = giantsPlay.slice()
    .sort((a, b) => (distToPolyline(a.center, riverMirthwater) - distToPolyline(b.center, riverMirthwater)) || byId(a, b))[0];
  const FG = [200, 435];                                            // the festival-grounds gate (authored)
  const festgate = giantsPlay.filter((p) => p !== rivergate)
    .sort((a, b) => (dist(a.center, FG) - dist(b.center, FG)) || byId(a, b))[0];
  const SEP = 50;
  const picked = [{ center: CITY }, rivergate, festgate];
  const townPicks = [];
  for (const g of largesPlay.slice().sort((a, b) => (dCoast(a.center) - dCoast(b.center)) || byId(a, b))) {
    if (townPicks.length >= 3) break;
    if (dCoast(g.center) > 65) break;                               // resort towns live ON the coast
    if (picked.every((q) => dist(q.center, g.center) >= SEP)) { townPicks.push(g); picked.push(g); }
  }
  const campanile = largesPlay.filter((p) => !picked.includes(p))
    .sort((a, b) => (dist(a.center, FAN) - dist(b.center, FAN)) || byId(a, b))[0];
  picked.push(campanile);
  const temple = largesPlay.filter((p) => !picked.includes(p))
    .sort((a, b) => (dist(a.center, CITY) - dist(b.center, CITY)) || byId(a, b))[0];
  picked.push(temple);
  const TOWN_NAMES = ["Petalport", "Lanternshore", "Sunstrand"];    // coast-distance pick order

  // ---- TRUNK HIGHWAYS (built first — the urban web snaps its gates onto them) ---------------------
  // RD1 the Garland Road: the coastal trunk running the ribbon N→S — north-cap frontier stub →
  // Petalport → Lanternshore → the Mirthmouth Bridge (its ONE Mirthwater crossing) → the bay strip →
  // Sunstrand → past the Lady's Crest → behind Carnavale's beach → the Serenata Bridge at the
  // Velaria Campanile → ends at the canal quarter's head.
  const roadGarland = natural(
    [[24, 10], [28, 20], [30, 28.9], [22, 44], [14, 60], [6.5, 84], [14, 100], [20, 108], [15, 122],
     [14, 138], [12.5, 158], [16, 172], [14, 186], [11, 205], [9.5, 230], [8.6, 255], [10.5, 278],
     [16, 300], [17.5, 322], [15, 345], [10, 365], [6.5, 378], [20, 382], [34, 384], [46.3, 386],
     [48.5, 400], [56, 418], [52, 432], [62, 447], [72, 458], [80, 462.5], [88, 468], [92, 471]],
    0.8, 42, "ENT|road|garland");
  // RD2 the West Caravan Road (Mythoria leg): received from HUB on the E border at local y=171
  // (HUB-RD3 exits HUB at world (3,161)); W along the Mirthwater's NORTH bank across the frontier
  // back-country, through the Mythos Gap, Rivergate Citadel, joins the Garland Road at (16,172).
  const roadCaravan = natural(
    [[289.56, 171], [262, 168.5], [235, 166], [208, 164.5], [182, 163.5], [156, 163], [132, 162],
     [112, 160.5], [92, 159.5], [72, 158.8], [52, 161], [34, 166], [16, 172]],
    0.7, 40, "ENT|road|caravan");
  // RD3 the Festival Road: the south-east artery — from the Garland's end at the canal quarter,
  // E through the southern festival grounds, Festgate Citadel, between the two great festival
  // EPIC estates, to the E frontier stub.
  const roadFestival = natural(
    [[92, 471], [108, 473], [126, 471], [143, 465], [160, 455], [178, 444], [192, 436], [206.2, 430.2],
     [214, 443], [222, 460], [234, 472], [247, 479], [260, 476], [272, 469], [281, 462], [288.8, 458]],
    0.8, 40, "ENT|road|festival");
  const HIGHWAYS = [roadGarland, roadCaravan, roadFestival];

  // ---- THE CAPITAL "Carnavale" — the carnival coast ribbon (never a grid) -------------------------
  const urban = [];                                                 // { id, name, tier, pts }
  let cwN = 0;
  const addUrban = (name, tier, pts, idOverride) => { cwN++; urban.push({ id: idOverride || `ENT-CW${String(cwN).padStart(2, "0")}`, name, tier, pts }); };
  // the Mirella Strand — the beachfront lane hugging the authored coast arc (the Copacabana move)
  const strand = offsetRange(coast, 434, 464, 1.0, CITY);
  addUrban("The Mirella Strand", "secondary", strand, "ENT-CW-STRAND");
  // the Grand Carnavale Way — the ONE Sambadrome festival parade avenue, one block inland
  const avenue = offsetRange(coast, 436.5, 462, 2.6, CITY);
  addUrban("The Grand Carnavale Way", "secondary", avenue, "ENT-CW-CARNAVALE");
  // short festa cross-lanes between strand and avenue (curved — never a grid)
  const FESTA = ["Garland Lane", "Mask Lane", "Tambour Lane", "Serenade Lane", "Confetti Lane"];
  for (let k = 0; k < 5; k++) {
    const s = strand[Math.round(((k + 0.5) / 5) * (strand.length - 1))];
    const { pt } = nearestOn([avenue], s[0], s[1]);
    addUrban(FESTA[k], "local", natural([s, [(s[0] + pt[0]) / 2 + 0.25, (s[1] + pt[1]) / 2], pt], 0.18, 4, `ENT|cap|festa|${k}`, 6));
  }
  // two LADEIRA hill lanes winding east off the avenue toward the palace shelf
  const aveAt = (f) => avenue[Math.round(f * (avenue.length - 1))];
  const lad1a = aveAt(0.3), lad2a = aveAt(0.72);
  addUrban("Sun Ladeira", "local", natural([lad1a, [lad1a[0] + 5, lad1a[1] - 1.6], [lad1a[0] + 9, lad1a[1] + 1.8], [lad1a[0] + 13.5, lad1a[1] + 0.6]], 0.5, 8, "ENT|cap|ladeira1", 8));
  addUrban("Moon Ladeira", "local", natural([lad2a, [lad2a[0] + 4.5, lad2a[1] + 1.8], [lad2a[0] + 8.5, lad2a[1] - 1.2], [lad2a[0] + 12.5, lad2a[1] + 0.4]], 0.5, 8, "ENT|cap|ladeira2", 8));
  // the Way of Masks — ceremonial approach from the avenue up to the Palace of Masks, continuing
  // through the palace gate to the Garland Road (the capital's landward gate — snapped onto RD1)
  const wayA = aveAt(0.55);
  const masksGate = nearestOn([roadGarland], CITY[0] + 7, CITY[1] - 3).pt;
  addUrban("The Way of Masks", "secondary", natural([wayA, [(wayA[0] + CITY[0]) / 2, (wayA[1] + CITY[1]) / 2 - 1.6], [CITY[0] - 4, CITY[1] + 0.4], CITY, masksGate], 0.4, 14, "ENT|cap|masks", 8), "ENT-CW-MASKS");
  // marina inlets (water — collected into rivers[]) + jetty piers combing the strand
  const inlets = [];
  const addInlet = (id, name, sPt) => {
    const cn = nearestOn([coast], sPt[0], sPt[1]);
    const dx = sPt[0] - cn.pt[0], dy = sPt[1] - cn.pt[1], L = Math.hypot(dx, dy) || 1;
    inlets.push({ id, name, pts: straight([[cn.pt[0] - (dx / L) * 0.8, cn.pt[1] - (dy / L) * 0.8], [cn.pt[0] + (dx / L) * 0.9, cn.pt[1] + (dy / L) * 0.9]], 0.3) });
  };
  addInlet("ENT-INL-CARN1", "Carnavale North Marina", strand[Math.round(0.28 * (strand.length - 1))]);
  addInlet("ENT-INL-CARN2", "Carnavale South Marina", strand[Math.round(0.62 * (strand.length - 1))]);
  for (let q = 0; q < 5; q++) {
    const s = strand[Math.round(((q + 0.5) / 5.6) * (strand.length - 1))];
    const cn = nearestOn([coast], s[0], s[1]);
    const dx = cn.pt[0] - s[0], dy = cn.pt[1] - s[1], L = Math.hypot(dx, dy) || 1;
    addUrban(`Carnavale Pier ${q + 1}`, "local", straight([s, [s[0] + (dx / L) * (L + 0.7), s[1] + (dy / L) * (L + 0.7)]], 0.35));
  }

  // ---- THE VELARIA QUARTER — the Venetian canal quarter on the Serenata delta ---------------------
  addUrban("Vela Fondamenta", "local", offsetRange(riverVela, 466, 472, 0.9, [55, 461]), "ENT-CW-FONDA-V");
  addUrban("Lantern Fondamenta", "local", offsetRange(riverLantern, 468, 486, 0.9, [60, 481]), "ENT-CW-FONDA-L");
  addUrban("The Vela Bridge", "local", straight([[25.6, 464.8], [26.8, 468.2], [28.4, 471.4]], 0.4));      // strand end → over the Vela mouth
  addUrban("The Plaza Bridge", "local", straight([[57.4, 467.3], [56.7, 470.3]], 0.35));                    // over the Vela Reach into Lantern Plaza
  addUrban("The Ribbon Bridge", "local", straight([[54.6, 473.4], [50.6, 472.7]], 0.35));                   // over the Ribbon Cut
  addUrban("The Lantern Bridge", "local", straight([[54.8, 478.9], [51.4, 476.3]], 0.35));                  // over the Lantern Reach
  // Lantern Plaza — the masked-festival square (a small paved ring between the waters)
  const plazaR = 0.95, plazaC = [56, 472.2];
  const plaza = [];
  for (let a = 0; a <= 8; a++) plaza.push([+(plazaC[0] + Math.cos((a / 8) * 6.2832) * plazaR).toFixed(2), +(plazaC[1] + Math.sin((a / 8) * 6.2832) * plazaR).toFixed(2)]);
  addUrban("Lantern Plaza", "local", plaza, "ENT-CW-PLAZA");

  // ---- RESORT TOWNS — strand lane + harbour way + marina + 2 piers + curved festa lanes -----------
  let mtN = 0;
  const addTown = (name, tier, pts) => { mtN++; urban.push({ id: `ENT-MT${String(mtN).padStart(2, "0")}`, name, tier, pts }); };
  const townQuays = [];
  townPicks.forEach((t, ti) => {
    const T = t.center, name = TOWN_NAMES[ti];
    const cn = nearestOn([coast], T[0], T[1]);
    const Q = cn.pt;
    const tStrand = offsetRange(coast, Q[1] - 2.4, Q[1] + 2.4, 0.9, T);
    addTown(`${name} Strand`, "local", tStrand);
    const sMid = tStrand[Math.floor(tStrand.length / 2)] || Q;
    addTown(`${name} Harbour Way`, "secondary", natural([T, [(T[0] + sMid[0]) / 2, (T[1] + sMid[1]) / 2 + 0.9], sMid], 0.35, 12, `ENT|town|${name}|harbour`, 8));
    for (const f of [0.15, 0.85]) {
      const s = tStrand[Math.round(f * (tStrand.length - 1))];
      const pn = nearestOn([coast], s[0], s[1]);
      const dx = pn.pt[0] - s[0], dy = pn.pt[1] - s[1], L = Math.hypot(dx, dy) || 1;
      addTown(`${name} Pier`, "local", straight([s, [s[0] + (dx / L) * (L + 0.7), s[1] + (dy / L) * (L + 0.7)]], 0.35));
    }
    addInlet(`ENT-INL-${name.toUpperCase()}`, `${name} Marina`, sMid);
    addTown(`${name} Crescent`, "local", natural([[T[0] - 2.1, T[1] - 1.3], [T[0], T[1] - 2.2], [T[0] + 2.1, T[1] - 1.1]], 0.2, 5, `ENT|town|${name}|cres`, 8));
    addTown(`${name} Festa Lane`, "local", natural([[T[0] - 1.7, T[1] + 1.6], [T[0] + 0.2, T[1] + 2.1], [T[0] + 1.9, T[1] + 1.2]], 0.2, 5, `ENT|town|${name}|festa`, 8));
    townQuays.push({ name, at: [+Q[0].toFixed(1), +Q[1].toFixed(1)] });
  });

  // ---- TRUNK HIGHWAYS ------------------------------------------------------------------------------
  // RD1 the Garland Road: the coastal trunk running the ribbon N→S — north-cap frontier stub →
  // Petalport → Lanternshore → the Mirthmouth Bridge (its ONE Mirthwater crossing) → the bay strip →
  // Sunstrand → past the Lady's Crest → behind Carnavale's beach → the Serenata Bridge at the
  // Velaria Campanile → ends at the canal quarter's head.
  const roadGarland = natural(
    [[24, 10], [28, 20], [30, 28.9], [22, 44], [14, 60], [6.5, 84], [14, 100], [20, 108], [15, 122],
     [14, 138], [12.5, 158], [16, 172], [14, 186], [11, 205], [9.5, 230], [8.6, 255], [10.5, 278],
     [16, 300], [17.5, 322], [15, 345], [10, 365], [6.5, 378], [20, 382], [34, 384], [46.3, 386],
     [48.5, 400], [56, 418], [52, 432], [62, 447], [72, 458], [80, 462.5], [88, 468], [92, 471]],
    0.8, 42, "ENT|road|garland");
  // RD2 the West Caravan Road (Mythoria leg): received from HUB on the E border at local y=171
  // (HUB-RD3 exits HUB at world (3,161)); W along the Mirthwater's NORTH bank across the frontier
  // back-country, through the Mythos Gap, Rivergate Citadel, joins the Garland Road at (16,172).
  const roadCaravan = natural(
    [[289.56, 171], [262, 168.5], [235, 166], [208, 164.5], [182, 163.5], [156, 163], [132, 162],
     [112, 160.5], [92, 159.5], [72, 158.8], [52, 161], [34, 166], [16, 172]],
    0.7, 40, "ENT|road|caravan");
  // RD3 the Festival Road: the south-east artery — from the Garland's end at the canal quarter,
  // E through the southern festival grounds, Festgate Citadel, between the two great festival
  // EPIC estates, to the E frontier stub.
  const roadFestival = natural(
    [[92, 471], [108, 473], [126, 471], [143, 465], [160, 455], [178, 444], [192, 436], [206.2, 430.2],
     [214, 443], [222, 460], [234, 472], [247, 479], [260, 476], [272, 469], [281, 462], [288.8, 458]],
    0.8, 40, "ENT|road|festival");
  const HIGHWAYS = [roadGarland, roadCaravan, roadFestival];

  // ---- castles (§3c + the header's pick rules) ----------------------------------------------------
  const CASTLES = [
    { id: "ENT-PALACE-MASKS", kind: "PALACE", at: CITY.slice(), townEstateId: city.parcelId,
      name: "The Palace of Masks", ref: "Rio de Janeiro — the carnival capital Carnavale: the palace on the hill shelf above the beach ribbon (Mirella Strand, the Grand Carnavale Way, marina inlets, the Velaria canal quarter)" },
    { id: "ENT-CASTLE-RIVERGATE", kind: "CASTLE", at: rivergate.center.slice(), townEstateId: rivergate.parcelId,
      name: "Rivergate Citadel", ref: "the Mirthwater valley gate — the citadel between the West Caravan Road and the river, watching the road from Tianxia" },
    { id: "ENT-CASTLE-FESTGATE", kind: "CASTLE", at: festgate.center.slice(), townEstateId: festgate.parcelId,
      name: "Festgate Citadel", ref: "the eastern gate of the southern festival grounds on the Festival Road" },
    { id: "ENT-KEEP-TIDEWATCH", kind: "KEEP", at: temple.center.slice(), townEstateId: temple.parcelId,
      name: "Tidewatch Temple", ref: "temple keep on the Lady's Crest above Carnavale — keeper of the Lady of Tides (the Corcovado moment)" },
    { id: "ENT-KEEP-CAMPANILE", kind: "KEEP", at: campanile.center.slice(), townEstateId: campanile.parcelId,
      name: "The Velaria Campanile", ref: "watchtower campanile of the Velaria canal quarter, on the Serenata's bank at the delta head (the Venetian move)" },
    { id: "ENT-KEEP-PETALPORT", kind: "KEEP", at: townPicks[0].center.slice(), townEstateId: townPicks[0].parcelId,
      name: "Petalport Watch", ref: "watchtower keep on the blossom coast's northern headlands" },
    { id: "ENT-KEEP-LANTERNSHORE", kind: "KEEP", at: townPicks[1].center.slice(), townEstateId: townPicks[1].parcelId,
      name: "Lanternshore Watch", ref: "watchtower keep over the lantern-lit resort shore at the Blossomrun mouth" },
    { id: "ENT-KEEP-SUNSTRAND", kind: "KEEP", at: townPicks[2].center.slice(), townEstateId: townPicks[2].parcelId,
      name: "Sunstrand Watch", ref: "watchtower keep over the warm southern strands north of the capital" },
  ];

  // ---- rural web (owner: rural stays the organic countryside — EDU/HUB/BUS style verbatim) --------
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const netPolys = [...HIGHWAYS, ...urban.map((u) => u.pts)];
  const CITIES = [
    { c: [18, 450], r: 12 }, { c: CITY, r: 5 }, { c: FAN, r: 8 },
    { c: rivergate.center, r: 4 }, { c: festgate.center, r: 4 },
    ...townPicks.map((t) => ({ c: t.center, r: 4 })),
  ];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "ENT|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(10, L * 0.35);
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 1.0, 30);
    if (crossings(poly, RIDGES) > 0) {                              // one reroute attempt via a ridge gap
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.8, 30);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
      // else: accept the crossing — a road over the low blossom hills
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
    secN++; secondaries.push({ id: `ENT-SEC${String(secN).padStart(3, "0")}`, name, pts });
    netIdx.addPolyline(pts); netPolys.push(pts);
  };
  const townName = (t) => `Town ${t.id}`;
  // pass 1 — neighbour pair roads with UNION-FIND component tracking (the HUB/BUS pattern verbatim)
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
        const spur = natural([best.at, bpt], 0.3, 12, `ENT|road|spur|${best.id}`, 8);
        addSecondary(spur, `${townName(best)} Spur`);
        connIdx.addPolyline(spur);
      } else {
        addSecondary(poly, `${townName(best)} Link`);
        connIdx.addPolyline(poly);
      }
    }
    for (const t of members) for (const p of pairPolys.get(t.id) || []) connIdx.addPolyline(p);
  }

  // ---- local roads: ~40 seeded MEDIUM estates → nearest network point -----------------------------
  const locals = [];
  const pickR = rng32(fnv1a("ENT|locals|pick"));
  const shuffled = mediums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 40) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.2 || d > 26) continue;
    const r = rng32(fnv1a("ENT|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(4, L * 0.4);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.6, 10, "ENT|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.75) continue;
    locN++;
    locals.push({ id: `ENT-LOC${String(locN).padStart(2, "0")}`, name: `Hamlet ${m.id} Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- castle approaches: every castle sits ≤1u from the road network ------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.3, 10, "ENT|road|approach|" + c.id, 8);
    approaches.push({ id: `ENT-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- output --------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "ENT (Mythoria) macro feature network — the continuous-terrain field, festival mythic resort coast",
      author: "Map-maker session, 2026-07-10 (regenerate with map-service/tools/world_terrain_ent.mjs)",
      coords: "ENT zone svg viewBox (0 0 289.56 525.86); y down; the W long edge faces the Western Ocean; y=0/y=525.86 caps are the frontier rim. Same space as data/hexagon-city-source/l3/ENT.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords. NOTE: ENT is served as two zone slices (north/south) — purely server-side; this terrain field is ONE continuous zone.",
      grounding: "The ribbon runs 526 u N–S, the world's most elongated zone (atlas §2.3): the entire W long edge is sea; a low interior N–S spine (the Mythos Spine) separates the wet festival coast from the drier eastern back-country; settlement is the world's sparsest — open festival grounds between resort estates. Capital EPIC " + city.parcelId + " at (" + CITY.map((n) => n.toFixed(1)) + ") on the SW coast's hill shelf behind the Carnavale beach arc; the E border faces Tianxia (HUB) across ~160 u of parcel-free back-country; the SE mass (y 405–520) holds the southern festival grounds + the two other EPIC estates.",
      determinism: "generated by map-service/tools/world_terrain_ent.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale (1 parcel ≈ 0.65 u across); world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors).",
      sea: "v1: the Western Ocean ships as the wide rivers[] band ENT-SEA tracing the coast (worldfield.js consumes rivers/roads/ridges only) — coastal parcels window it as their shore water, so strands/piers/marinas touch real water on battle maps. The raw coastline is also exported as coast[] (additive, ignored by worldfield v1) for a future sea-fill kind. Sea = W of the coast; at the far NW the western ocean joins BUS's northern ocean (atlas §7 — one continuous shore around the surface continent's NW).",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — rivers/sea are terrain/visual continuity, not hard blockers; fords/bridges come with the real-water phase (CONTINUOUS-WORLD-TERRAIN §4b).",
      era: "Mythoria = FESTIVAL MYTHIC RESORT COAST (owner-locked §3b: Rio carnival ribbon + a Venetian canal quarter as one POI city). The capital Carnavale is a shore-following COAST RIBBON — strand + one Sambadrome parade avenue + curved festa lanes + winding ladeiras — NEVER a grid; the Velaria Quarter adds canal streets (water polylines) with fondamentas + bridges + Lantern Plaza; fortification = watchtowers + temple keeps (the §3c ladder: PALACE on the capital EPIC, citadels on GIANTs, keeps on LARGEs). Rural countryside stays the organic EDU/HUB/BUS-style town web verbatim (owner-locked).",
      hierarchy: "roads carry tier: highway (3 trunk roads — the Garland Road / the West Caravan Road (Mythoria leg) / the Festival Road) / secondary (the Mirella Strand, the Grand Carnavale Way, the Way of Masks, town harbour ways + the rural town links: towns = the 45 GIANT+LARGE L2 estate anchors, valley curves, ≤2 river bridges each, connect-don't-double dedup) / local (festa lanes, ladeiras, piers, fondamentas, canal bridges, Lantern Plaza, town strands+lanes, ~40 seeded MEDIUM feeders, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c (castles on ESTATES; importance→size): PALACE the Palace of Masks (capital EPIC " + city.parcelId + ") / CASTLE Rivergate Citadel (L3-subdivided GIANT " + rivergate.parcelId + ", the Mirthwater valley gate) / CASTLE Festgate Citadel (L3-subdivided GIANT " + festgate.parcelId + ", the festival-grounds gate) / KEEP Tidewatch Temple (" + temple.parcelId + ", the Corcovado moment) + the Velaria Campanile (" + campanile.parcelId + ", the canal-quarter watchtower) + the 3 resort-town watches (" + townPicks.map((p) => p.parcelId).join("/") + "). NO ENT EPIC is L3-subdivided (0/3) — the palace battle map arrives with the pre-designed ESTATE maps (canon 4/5); citadels+keeps sit on playable L3 parcels and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META,
      continuity: "E border (shared frontier with HUB, aligned in world z; ENT worldOffset z=−10 ⇒ local y = world z + 10): receives HUB's Xijiang at local y=178 (HUB-RV3 exits HUB at world (3,168)) as the Mirthwater, and HUB's West Caravan Road at local y=171 (HUB-RD3 exits at world (3,161)) as the Caravan Road's Mythoria leg. Both enter at x=289.56 and cross ~160 u of parcel-free eastern back-country before the settled ribbon — documented, nothing windows there. W: the Western Ocean the full length (the Mirthwater, Serenata delta, Blossomrun + 5 marina inlets all mouth there); far NW = the two surface oceans join (atlas §7). N cap: Garland Road frontier stub at (24,10). SE: Festival Road frontier stub at (288.8,458). S cap: frontier rim (no crossing authored).",
    },
    zone: "ENT",
    rivers: [
      { id: "ENT-SEA", name: "The Western Ocean (shore band)", width: 3.0, pts: coast },
      { id: "ENT-RV1", name: "The Mirthwater (lower Xijiang)", width: 1.2, pts: riverMirthwater },
      { id: "ENT-RV2", name: "The Serenata", width: 0.9, pts: riverSerenata },
      { id: "ENT-RV2A", name: "The Vela Reach", width: 0.7, joins: "ENT-RV2", pts: riverVela },
      { id: "ENT-RV2B", name: "The Lantern Reach", width: 0.7, joins: "ENT-RV2", pts: riverLantern },
      ...cuts.map((c) => ({ id: c.id, name: c.name, width: 0.5, joins: "ENT-RV2A", pts: c.pts })),
      { id: "ENT-RV3", name: "The Blossomrun", width: 0.8, pts: riverBlossomrun },
      ...inlets.map((n) => ({ id: n.id, name: n.name + " Inlet", width: 0.5, joins: "ENT-SEA", pts: n.pts })),
    ],
    coast: [
      { id: "ENT-COAST", name: "The Western Ocean coastline", seaSide: "W", pts: coast },
    ],
    roads: [
      { id: "ENT-RD1", name: "The Garland Road", tier: "highway", width: 0.5, pts: roadGarland },
      { id: "ENT-RD2", name: "The West Caravan Road (Mythoria leg)", tier: "highway", width: 0.5, pts: roadCaravan },
      { id: "ENT-RD3", name: "The Festival Road", tier: "highway", width: 0.45, pts: roadFestival },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: u.tier, width: u.tier === "highway" ? 0.42 : u.tier === "secondary" ? 0.32 : 0.22, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.32, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "ENT-RG1", name: "The Mythos Spine (North)", width: 2.0, pts: spineN },
      { id: "ENT-RG2", name: "The Mythos Spine (South)", width: 2.0, pts: spineS },
      { id: "ENT-RG3", name: "The Sugarcone", width: 1.4, pts: sugarcone },
      { id: "ENT-RG4", name: "The Lady's Crest", width: 1.4, pts: ladysCrest },
    ],
    castles: CASTLES,
    pois: [
      { id: "ENT-CITY", kind: "CAPITAL", at: [18, 451], note: "Carnavale, the carnival capital — the festival ribbon between the hills and the Western Ocean; EPIC estate " + city.parcelId + " (the Palace of Masks) on the shelf above the beach" },
      { id: "ENT-MARINA", kind: "SEA_PORT", at: [14, 452], note: "the Carnavale marinas — twin inlets combed with jetty piers along the Mirella Strand" },
      ...townQuays.map((q) => ({ id: `ENT-PORT-${q.name.toUpperCase()}`, kind: "SEA_PORT", at: q.at, note: `${q.name} quay — resort marina on the carnival coast` })),
      { id: "ENT-LADY", kind: "LANDMARK", at: [43, 418], note: "the Lady of Tides — the colossal statue on the Lady's Crest above Carnavale's bay (the Corcovado moment), kept by Tidewatch Temple" },
      { id: "ENT-SAMBADROME", kind: "LANDMARK", at: [20.5, 450], note: "the Grand Sambadrome — the parade stands of the Grand Carnavale Way, the festival avenue's heart" },
      { id: "ENT-PLAZA", kind: "LANDMARK", at: [56, 472.2], note: "Lantern Plaza — the Velaria Quarter's masked-festival square between the canal reaches" },
      { id: "ENT-GATE-E", kind: "GATE", at: [289.56, 171], connects: ["ENT", "HUB"], note: "east gate — receives the West Caravan Road (world z=161) and, at local y=178, the Xijiang (→ the Mirthwater) from Tianxia across the eastern back-country" },
      { id: "ENT-GATE-SE", kind: "GATE", at: [288.8, 458], connects: ["ENT"], note: "southeast frontier gate — the Festival Road's beyond-the-frontier stub" },
      { id: "ENT-GATE-N", kind: "GATE", at: [24, 10], connects: ["ENT"], note: "north-cap frontier gate — the Garland Road's beyond-the-frontier stub toward the joined oceans (atlas §7)" },
    ],
  };
  // heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
  const heroStats = attachHeroParcels(out, ent, l3.singles);
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
writeFileSync(path.join(ROOT, "data/world-terrain/ENT.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/ENT.json sha256", h1.slice(0, 16),
  "| towns", b1.stats.towns,
  "| urban roads", b1.stats.urban,
  "| secondary roads", b1.stats.secondaries,
  "| local roads", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
