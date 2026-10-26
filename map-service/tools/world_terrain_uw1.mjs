#!/usr/bin/env node
// world_terrain_uw1.mjs — REPRODUCIBLE generator for data/world-terrain/UW1.json (Ironhold).
//
// Ironhold = UW1, the Upper Caverns — the FIRST level below the HUB shaft, the entry to the
// sequential boss-gated descent (atlas §2.8). 150.5 × 150.5, a perfect square (a constructed
// vault, not organic land); 1,233 L2 estates (1 EPIC · 9 GIANT · 27 LARGE · 98 MEDIUM · 1,098
// SMALL) + 28,915 L3 — the world's most estate-dense zone. Owner-locked era (CONTINUOUS-WORLD-
// TERRAIN §3b): **DWARVEN INDUSTRIAL FORGE-CITY** (Derinkuyu / Cappadocia underground warren) —
// tunnels + GALLERY RINGS + GREAT HALLS; fortification = gatehouse chokes at the level doors.
// Canon: atlas §2.8 (cool stone cavern warrens, `ashen` stone with `swamp` fungal pools; permanent
// low light; all four edges = rock; the ONLY connections are vertical: UP the HUB shaft, DOWN the
// boss-gate to UW2); CONTINUOUS-WORLD-TERRAIN §3c ladder / §3d heroParcels; zone-registry UW1
// (Earth/Dark · Stone/Iron/Gems · cityRef Derinkuyu · strength ×2.5); culture card (towns named for
// depth: Firstdelve, Ninth Landing, Lampsend; festival Veinsday; pillared warrens, gate-vaults,
// rune-braced shafts; kobold mining clans, iron-kin smith-holds).
// Lore (docs/lore/WORLD-CHRONICLE.md + data/singulars.json):
//   • THE MIDAS VEINS (`midas_veins`, PLACE) — "Gold-lust made mineral; the deeper you follow, the
//     richer, and the less of you comes back." Ironhold = GREED: wealth hoarded in stone. Bound here
//     to the richest iron/gold seam of the north galleries (a MINE POI).
//   • IRONHOLD'S GATE = the FIRST lock of the Binding; warden THE GATEKEEPER BELOW (`warden_uw1`,
//     "UW1 level boss"). Explicit BOSS STAGE at the Gatekeep (the boss hall on the Level Road, the
//     army route to the door) — the stage parcel is the castle's heroParcels[0] (playable L3 today).
//   • THE LAST ARGUMENT (siege hammer artifact) — "Ironhold diplomacy, final edition." (flavour only).
//
// THE WARREN (all four edges = rock — no coast, no sky, no horizontal neighbour):
//   • THE LANDING: the Shaft from Tianxia (HUB-SHAFT, the Worldshaft) lands at the EXACT zone
//     centre (atlas: "the descent from HUB lands at UW1's centre — the one entrance"). The Landing
//     is a PLAZA (Veinsday Court) with the Landing Keep watching the shaft foot.
//   • GALLERY RINGS (Derinkuyu): two ring highways around the Landing — the Inner Gallery (R 18)
//     and the Outer Gallery (R 40) — separated by two concentric rock CURTAINS (R 26, R 52) that
//     break only at the four GREAT HALLS (the N/E/S/W spoke highways) + the Forge Way.
//   • THE LEVEL ROAD: the E Great Hall continues to IRONHOLD'S GATE on the E wall (connects
//     UW1↔UW2; far side = UW2-GATE-UW1 on Blackmere's W wall) — the army descent (the Shaft chain
//     runs W→E through every vault: HUB shaft → UW1 E door → UW2 W door … UW2 E door → UW3 W door).
//   • RIVERS = dark `swamp` seeps (fungal watercourses): the Black Seep (W galleries → the Sump,
//     a FILL lake = a flooded hall, SW) and the Iron Seep (E galleries); the Drip Gallery (N).
//
// FORTIFICATION LADDER (§3c, importance → size; castles on ESTATES):
//   PALACE   = the sole EPIC 1091232 (un-subdivided) — THE FORGE-HALL OF IRONHOLD, the Deep King's
//              seat + the Great Forge (its battle map = the estate map, estateMapId).
//   CASTLEs  = GIANTs by deterministic nearest-to-anchor picks (SEP 12 between all picks, ties by
//              parcelId): THE GATEKEEP (nearest the Level Road midpoint between the Landing and
//              the gate — the Gatekeeper Below's boss hall) · FIRSTDELVE HOLD (nearest the Landing)
//              · NINTH LANDING CITADEL (nearest the SE galleries) · LAMPSEND BASTION (nearest the W
//              wall; un-subdivided — the HUB walled-city precedent).
//   KEEPs    = LARGEs: DOORWARD KEEP (nearest the gate) · SEAMWATCH KEEP (nearest the Midas Veins)
//              · SOUTHDELVE WATCH (nearest the S galleries) · FAR GALLERY WATCH (nearest the W
//              galleries) · THE LANDING KEEP (nearest the Landing).
//   CASTLE POI POINT = the estate's L3 child centre nearest the estate centre (ties by parcelId);
//              un-subdivided estates use the estate centre (the castle rides the estate map).
//   MEDIUM/SMALL: nothing baked (the countryside/warren lanes).
//
// HERO PARCELS: shared rule in world_hero_parcels.mjs (castle parcel first; GIANT 5 / LARGE 3;
// un-subdivided estates DEFERRED with a note).
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_uw1.mjs
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachHeroParcels, HERO_PARCELS_META } from "./world_hero_parcels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ---- deterministic rng (same family as the other zone generators) ------------------------------
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const rng32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- Catmull-Rom spline + seeded meander (verbatim family) -------------------------------------
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

// ---- geometry helpers (verbatim family) --------------------------------------------------------
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
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

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
// an arc of a circle (angles in DEGREES, y-down frame: N = −90°, E = 0°, S = 90°, W = ±180°)
function arc(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (a0 + ((a1 - a0) * i) / n) * (Math.PI / 180);
    pts.push([+(cx + Math.cos(t) * r).toFixed(2), +(cy + Math.sin(t) * r).toFixed(2)]);
  }
  return pts;
}

// ==================================================================================================
function buildField() {
  // ---- estates -----------------------------------------------------------------------------------
  const l2 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/parcels-l2.json"), "utf8"));
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/UW1.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));
  const uw1 = l2.parcels.filter((p) => p.zone === "UW1");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const epics = uw1.filter((p) => p.sizeClass === "EPIC").sort(byId);
  const giants = uw1.filter((p) => p.sizeClass === "GIANT").sort(byId);
  const larges = uw1.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = uw1.filter((p) => p.sizeClass === "GIANT" || p.sizeClass === "LARGE")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const mediums = uw1.filter((p) => p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- anchors + deterministic picks (rules in the header) ---------------------------------------
  const C = [150.51 / 2, 150.52 / 2];                               // THE LANDING — the Shaft foot
  const EGATE = [148.5, 76];                                        // IRONHOLD'S GATE (E wall doorway)
  const MV = [92, 30];                                              // the Midas Veins (north seam)
  const SUMP = [42, 118];                                           // the Sump (flooded hall, SW)
  const LAMP_END = [12, 74];                                        // the last lamp (W galleries)
  const SEP = 12;
  const forgeHall = epics[0];                                       // the sole EPIC
  const picked = [forgeHall];
  const pickNearest = (pool, pt) => {
    for (const cand of pool.slice().sort((a, b) => (dist(a.center, pt) - dist(b.center, pt)) || byId(a, b)))
      if (!picked.includes(cand) && picked.every((q) => dist(q.center, cand.center) >= SEP)) { picked.push(cand); return cand; }
    return null;
  };
  const giantsPlay = giants.filter((p) => l3Parents.has(p.sourceIndex));
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const gatekeep = pickNearest(giantsPlay, [(C[0] + EGATE[0]) / 2, (C[1] + EGATE[1]) / 2]);   // the boss hall on the Level Road
  const firstdelve = pickNearest(giantsPlay, C);
  const ninthLanding = pickNearest(giantsPlay, [112, 104]);
  const lampsend = pickNearest(giants, [2, 75]);                   // may be un-subdivided (the HUB precedent)
  const kDoorward = pickNearest(larges, EGATE);
  const kSeam = pickNearest(largesPlay, MV);
  const kSouth = pickNearest(largesPlay, [60, 105]);
  const kFar = pickNearest(largesPlay, [25, 60]);
  const kLanding = pickNearest(largesPlay, C);
  const kidsByParent = new Map();
  for (const s of l3.singles) {
    let arr = kidsByParent.get(s.parentIndex);
    if (!arr) { arr = []; kidsByParent.set(s.parentIndex, arr); }
    arr.push(s);
  }
  const castleAt = (estate) => {
    const kids = (kidsByParent.get(estate.sourceIndex) || []).slice().sort((a, b) => (a.parcelId < b.parcelId ? -1 : 1));
    if (!kids.length) return estate.center.slice();
    let best = kids[0];
    for (const k of kids) if (dist(k.center, estate.center) < dist(best.center, estate.center)) best = k;
    return [best.center[0], best.center[1]];
  };
  const GK_AT = castleAt(gatekeep);

  // ---- RIM WALLS + GALLERY CURTAINS (ridges — the warren is carved, not open) ----------------------
  const rimN = natural([[1.5, 2], [30, 1.8], [60, 2.2], [90, 1.9], [120, 2.1], [149, 2]], 0.5, 26, "UW1|rim|N");
  const rimS = natural([[1.5, 148.6], [30, 148.4], [60, 148.7], [90, 148.3], [120, 148.6], [149, 148.5]], 0.5, 26, "UW1|rim|S");
  const rimW = natural([[2, 2], [1.8, 30], [2.2, 60], [1.9, 90], [2.1, 120], [2, 148.5]], 0.4, 22, "UW1|rim|W");
  const rimE1 = natural([[148.6, 2], [148.3, 20], [148.7, 40], [148.4, 58], [148.5, 70.5]], 0.4, 22, "UW1|rim|E1");
  const rimE2 = natural([[148.5, 81.5], [148.7, 100], [148.3, 120], [148.6, 135], [148.5, 148.5]], 0.4, 22, "UW1|rim|E2");
  // the Inner Curtain (R 26): four quadrant arcs, gaps at the Great Halls (N/E/S/W) — the NW arc
  // ends early so the Forge Way (toward the Forge-Hall, −112°) passes without a breach
  const R1 = 26, R2 = 52, G = 9;                                    // gap half-angle at the spokes
  const inNE = natural(arc(C[0], C[1], R1, -90 + G, 0 - G, 10), 0.5, 12, "UW1|curt|in|NE", 6);
  const inSE = natural(arc(C[0], C[1], R1, 0 + G, 90 - G, 10), 0.5, 12, "UW1|curt|in|SE", 6);
  const inSW = natural(arc(C[0], C[1], R1, 90 + G, 180 - G, 10), 0.5, 12, "UW1|curt|in|SW", 6);
  const inNW = natural(arc(C[0], C[1], R1, -180 + G, -124, 8), 0.5, 12, "UW1|curt|in|NW", 6);
  // the Outer Curtain (R 52): same cut, NW arc split around the Forge Way
  const outNE = natural(arc(C[0], C[1], R2, -90 + G, 0 - G, 14), 0.6, 16, "UW1|curt|out|NE", 6);
  const outSE = natural(arc(C[0], C[1], R2, 0 + G, 90 - G, 14), 0.6, 16, "UW1|curt|out|SE", 6);
  const outSW = natural(arc(C[0], C[1], R2, 90 + G, 180 - G, 14), 0.6, 16, "UW1|curt|out|SW", 6);
  const outNW1 = natural(arc(C[0], C[1], R2, -180 + G, -122, 9), 0.6, 16, "UW1|curt|out|NW1", 6);
  const outNW2 = natural(arc(C[0], C[1], R2, -104, -90 - G, 3), 0.4, 10, "UW1|curt|out|NW2", 6);
  // free-standing gallery pillars (rock reefs) off the authored ways
  const pillar1 = natural([[118, 118], [121, 121], [124, 125]], 0.3, 6, "UW1|pillar|1", 8);
  const pillar2 = natural([[28, 28], [31, 31], [34, 35]], 0.3, 6, "UW1|pillar|2", 8);
  const pillar3 = natural([[120, 32], [123, 35], [127, 38]], 0.3, 6, "UW1|pillar|3", 8);
  const pillar4 = natural([[60, 132], [63, 135], [67, 138]], 0.3, 6, "UW1|pillar|4", 8);
  const RIDGES = [rimN, rimS, rimW, rimE1, rimE2, inNE, inSE, inSW, inNW, outNE, outSE, outSW, outNW1, outNW2, pillar1, pillar2, pillar3, pillar4];
  const gapAt = (r, deg) => [+(C[0] + Math.cos(deg * Math.PI / 180) * r).toFixed(2), +(C[1] + Math.sin(deg * Math.PI / 180) * r).toFixed(2)];
  const RIDGE_GAPS = [EGATE, gapAt(R1, -90), gapAt(R1, 0), gapAt(R1, 90), gapAt(R1, 180), gapAt(R1, -113),
    gapAt(R2, -90), gapAt(R2, 0), gapAt(R2, 90), gapAt(R2, 180), gapAt(R2, -113)];

  // ---- SEEPS + THE SUMP (rivers[] — dark fungal watercourses of the warren) -----------------------
  const pool = (cx, cy, r, key) => {
    const w = rng32(fnv1a(key));
    const pts = [];
    for (let a = 0; a <= 12; a++) {
      const t = (a / 12) * Math.PI * 2, rr = r * (0.9 + w() * 0.2);
      pts.push([+(cx + Math.cos(t) * (a === 12 ? r : rr)).toFixed(2), +(cy + Math.sin(t) * (a === 12 ? r : rr)).toFixed(2)]);
    }
    pts.push(pts[0].slice());
    return pts;
  };
  const sump = pool(SUMP[0], SUMP[1], 3.0, "UW1|sump");            // + width 4 ⇒ a ~5-radius black pool
  const blackSeep = natural([[30, 14], [26, 40], [21, 66], [23, 92], [33, 108], [40, 114.5]], 1.0, 22, "UW1|seep|black", 8);
  const ironSeep = natural([[122, 18], [126, 46], [123, 70], [129, 98], [124, 126], [118, 142]], 1.0, 22, "UW1|seep|iron", 8);
  const dripGallery = natural([[52, 8], [60, 16], [66, 24], [70, 34]], 0.5, 10, "UW1|seep|drip", 8);
  const deepSeep = natural([[88, 128], [96, 136], [106, 142]], 0.4, 8, "UW1|seep|deep", 8);
  const RIVERS = [sump, blackSeep, ironSeep, dripGallery, deepSeep];

  // ---- THE GALLERY RINGS + THE GREAT HALLS (highways) ------------------------------------------------
  const ring = (R, key) => {
    const ctrl = [];
    const w = rng32(fnv1a(key));
    for (let a = 0; a <= 32; a++) {
      const t = (a / 32) * Math.PI * 2, rr = R * (a === 32 ? 1 : 0.985 + w() * 0.03);
      ctrl.push([+(C[0] + Math.cos(t) * rr).toFixed(2), +(C[1] + Math.sin(t) * rr).toFixed(2)]);
    }
    ctrl[0] = ctrl[ctrl.length - 1].slice();                        // closed loop, seam-free
    return round2(spline(ctrl, 6));
  };
  const innerGallery = ring(18, "UW1|ring|inner");
  const outerGallery = ring(40, "UW1|ring|outer");
  // the four Great Halls — cross tunnels from the Landing through both curtains to the far galleries
  const hallN = natural([[C[0], C[1] - 2], [C[0] + 1, 50], [C[0], 30], [C[0] - 1, 12]], 0.5, 14, "UW1|hall|N", 8);
  const hallS = natural([[C[0], C[1] + 2], [C[0] - 1, 100], [C[0], 120], [C[0] + 1, 140]], 0.5, 14, "UW1|hall|S", 8);
  const hallW = natural([[C[0] - 2, C[1]], [55, C[1] - 1], [lampsend.center[0], lampsend.center[1]], [26, 74.5], [LAMP_END[0], LAMP_END[1]]], 0.5, 14, "UW1|hall|W", 8);
  // the Level Road: the E Great Hall continued to Ironhold's Gate — THROUGH the Gatekeep
  const levelRoad = natural([[C[0] + 2, C[1]], [GK_AT[0], GK_AT[1]], [120, 76.5], [EGATE[0], EGATE[1]]], 0.4, 16, "UW1|hall|E|level", 8);
  // the Forge Way: the Landing → the Forge-Hall (the −113° gap), continuing to the Midas seam road
  const FH = forgeHall.center.slice();
  const forgeWay = natural([[C[0] - 1.5, C[1] - 1.5], [(C[0] + FH[0]) / 2 - 1, (C[1] + FH[1]) / 2 + 1], [FH[0], FH[1]]], 0.4, 12, "UW1|hall|forge", 8);
  const seamRoad = natural([[FH[0], FH[1]], [78, 40], [MV[0], MV[1]], [100, 14]], 0.5, 14, "UW1|road|seam", 8);
  const HIGHWAYS = [innerGallery, outerGallery, hallN, hallS, hallW, levelRoad, forgeWay];
  const urban = [{ id: "UW1-RD8", name: "The Seam Road", tier: "secondary", pts: seamRoad }];

  // ---- castles (the ladder — see the header) ----------------------------------------------------------
  const CASTLES = [
    { id: "UW1-PALACE-FORGEHALL", kind: "PALACE", at: castleAt(forgeHall), townEstateId: forgeHall.parcelId,
      name: "The Forge-Hall of Ironhold", ref: "Derinkuyu's deepest chamber reimagined as the Deep King's walled hall: the Great Forge at its heart (the iron-kin smith-holds' seat), gate-vaults and rune-braced shafts; the only EPIC of the Upper Caverns (un-subdivided — its battle map is the pre-designed estate map)" },
    { id: "UW1-CASTLE-GATEKEEP", kind: "CASTLE", at: GK_AT.slice(), townEstateId: gatekeep.parcelId,
      name: "The Gatekeep", ref: "the Gatekeeper Below's boss hall astride the Level Road halfway to Ironhold's Gate — the gatehouse choke of the level door (era: gatehouse chokes at level doors); the FIRST lock of the Binding is fought here" },
    { id: "UW1-CASTLE-FIRSTDELVE", kind: "CASTLE", at: castleAt(firstdelve), townEstateId: firstdelve.parcelId,
      name: "Firstdelve Hold", ref: "the first hold ever dug below the Landing (towns are named for depth) — the citadel beside the Forge-Hall on the Inner Gallery" },
    { id: "UW1-CASTLE-NINTHLANDING", kind: "CASTLE", at: castleAt(ninthLanding), townEstateId: ninthLanding.parcelId,
      name: "Ninth Landing Citadel", ref: "the south-east galleries' citadel at the ninth landing of the old stair — the kobold mining clans' muster" },
    { id: "UW1-CASTLE-LAMPSEND", kind: "CASTLE", at: castleAt(lampsend), townEstateId: lampsend.parcelId,
      name: "Lampsend Bastion", ref: "where the lamps end: the bastion on the W Great Hall before the far dark galleries — the last lit hold of the warren" },
    { id: "UW1-KEEP-DOORWARD", kind: "KEEP", at: castleAt(kDoorward), townEstateId: kDoorward.parcelId,
      name: "Doorward Keep", ref: "the keep watching the approach to Ironhold's Gate across the Iron Seep" },
    { id: "UW1-KEEP-SEAMWATCH", kind: "KEEP", at: castleAt(kSeam), townEstateId: kSeam.parcelId,
      name: "Seamwatch Keep", ref: "the keep over the Midas Veins — Veinsday is struck here; the richest seam of the Upper Caverns" },
    { id: "UW1-KEEP-SOUTHDELVE", kind: "KEEP", at: castleAt(kSouth), townEstateId: kSouth.parcelId,
      name: "Southdelve Watch", ref: "the S Great Hall's watch-keep over the south galleries" },
    { id: "UW1-KEEP-FARGALLERY", kind: "KEEP", at: castleAt(kFar), townEstateId: kFar.parcelId,
      name: "Far Gallery Watch", ref: "the far western galleries' keep beyond Lampsend, by the Black Seep" },
    { id: "UW1-KEEP-LANDING", kind: "KEEP", at: castleAt(kLanding), townEstateId: kLanding.parcelId,
      name: "The Landing Keep", ref: "the shaft-foot keep: the first thing an army from Tianxia sees when the Shaft opens onto the Landing" },
  ];

  // ---- the warren web: towns (GIANT+LARGE) ↔ nearest neighbour, union-find to the network ----------
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const CITIES = [{ c: C, r: 8 }, { c: FH, r: 5 }, ...CASTLES.map((k) => ({ c: k.at, r: 4 }))];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "UW1|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(6, L * 0.35);
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 0.8, 20);
    if (crossings(poly, RIDGES) > 0) {                              // tunnels pass the curtains only at the gaps
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.6, 20);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
    }
    if (crossings(poly, RIVERS) > 1) {                              // ≤1 seep crossing per way
      const flat = build([a, b], 0.3, 14);
      if (crossings(flat, RIVERS) <= crossings(poly, RIVERS)) poly = flat;
    }
    return poly;
  }
  const secondaries = [];
  let secN = 0;
  const addSecondary = (pts, name) => {
    secN++; secondaries.push({ id: `UW1-SEC${String(secN).padStart(2, "0")}`, name, pts });
    netIdx.addPolyline(pts);
  };
  const townName = (t) => `Hold ${t.id}`;
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
    if (ca >= 0 && ca === cb) continue;
    const pk = [t.id, nb.id].sort().join("~");
    if (seenPairs.has(pk)) continue;
    seenPairs.add(pk);
    const poly = routeRoad(t.at, nb.at, `sec|${pk}`);
    if (nearFractionIdx(poly, netIdx, 1.6) > 0.65) { union(t.id, nb.id); continue; }
    addSecondary(poly, `${townName(t)} – ${townName(nb)} Gallery`);
    union(t.id, nb.id);
    for (const id of [t.id, nb.id]) { if (!pairPolys.has(id)) pairPolys.set(id, []); pairPolys.get(id).push(poly); }
  }
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
    if (best && bd >= 1.6) {
      const poly = routeRoad(best.at, bpt, `hwy|${best.id}`);
      if (nearFractionIdx(poly, netIdx, 1.6) > 0.65) {
        const spur = natural([best.at, bpt], 0.2, 8, `UW1|road|spur|${best.id}`, 8);
        addSecondary(spur, `${townName(best)} Spur`);
        connIdx.addPolyline(spur);
      } else {
        addSecondary(poly, `${townName(best)} Tunnel`);
        connIdx.addPolyline(poly);
      }
    }
    for (const t of members) for (const p of pairPolys.get(t.id) || []) connIdx.addPolyline(p);
  }

  // ---- local lanes: ~18 seeded MEDIUM holds → nearest network point ----------------------------------
  const locals = [];
  const pickR = rng32(fnv1a("UW1|locals|pick"));
  const shuffled = mediums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 18) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.0 || d > 16) continue;
    const r = rng32(fnv1a("UW1|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(3, L * 0.4);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.35, 7, "UW1|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 1.6) > 0.75) continue;
    locN++;
    locals.push({ id: `UW1-LOC${String(locN).padStart(2, "0")}`, name: `Hold ${m.id} Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- castle approaches: every castle sits ≤1u from the network ---------------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.2, 6, "UW1|road|approach|" + c.id, 8);
    approaches.push({ id: `UW1-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- output ----------------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "UW1 (Ironhold) macro feature network — the continuous-terrain field, dwarven forge-city warren",
      author: "CF ParcelMap Design Agent, 2026-10-26 (regenerate with map-service/tools/world_terrain_uw1.mjs)",
      coords: "UW1 zone svg viewBox (0 0 150.51 150.52); y down. Same space as data/hexagon-city-source/l3/UW1.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords. SEALED VAULT: no coast, no sky, no horizontal neighbour — all four edges are rock wall (atlas §2.8 mapVoid); the zone's doors are VERTICAL: UP the Shaft foot at the exact centre (HUB-SHAFT's far side) and DOWN Ironhold's Gate (E wall, the boss-gate to UW2).",
      grounding: "The upper dark: 1,233 L2 (1 EPIC · 9 GIANT · 27 LARGE · 98 MEDIUM · 1,098 SMALL) + 28,915 L3 over a 150.5 square — the most estate-dense zone of the world. The Shaft lands at the exact centre (" + C.map((n) => n.toFixed(2)) + "); the Forge-Hall EPIC " + forgeHall.parcelId + " at (" + FH.map((n) => n.toFixed(1)) + ") holds the Great Forge NW of the Landing; the GIANT belt lies centre-east (the Gatekeep " + gatekeep.parcelId + " astride the Level Road).",
      determinism: "generated by map-service/tools/world_terrain_uw1.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale (1 parcel ≈ 0.65 u across); world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors).",
      vault: "CAVERN ZONE: ridges[] are rock — four RIM WALLS seal the vault edges (rock on every edge parcel; the only rim break is Ironhold's Gate doorway, E wall) + two concentric GALLERY CURTAINS (R 26 and R 52 around the Landing — Derinkuyu's gallery rings) that break only at the four GREAT HALLS (N/E/S/W) and the Forge Way (NW), + four free-standing pillars. Tunnels cross the curtains only at those gaps (the routing rule).",
      water: "rivers[] are dark fungal SEEPS (the registry SWAMP family — atlas: `ashen` stone with `swamp` pools): the Black Seep (west galleries, into the Sump), the Iron Seep (east galleries), the Drip Gallery (north) and the Deep Seep (south-east) are linear band-clamped watercourses; THE SUMP is a `fill: true` flooded hall (worldfield.js FILL water: a solid black pool at its honest width).",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — seeps are terrain/visual continuity, not hard blockers; hazard crossings come with the real-water phase.",
      era: "Ironhold = DWARVEN INDUSTRIAL FORGE-CITY (owner-locked §3b: Derinkuyu / Cappadocia warren) — the Landing plaza at the shaft foot, two GALLERY RINGS (the Inner and Outer Gallery highways), four GREAT HALLS as cross tunnels, the Level Road to the level door, the Forge Way to the Forge-Hall, the Seam Road to the Midas Veins; a dense hold web (GIANT+LARGE holds linked by galleries) + ~18 MEDIUM feeder lanes. Towns are named for depth (Firstdelve, Ninth Landing, Lampsend).",
      hierarchy: "roads carry tier: highway (the Inner Gallery + the Outer Gallery rings, the four Great Halls incl. the LEVEL ROAD east to Ironhold's Gate, the Forge Way) / secondary (the Seam Road + the hold web galleries/tunnels/spurs) / local (~18 seeded MEDIUM feeders, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c (castles on ESTATES; importance→size): PALACE the Forge-Hall of Ironhold (EPIC " + forgeHall.parcelId + ", un-subdivided → estateMapId) / CASTLEs the Gatekeep (" + gatekeep.parcelId + "), Firstdelve Hold (" + firstdelve.parcelId + "), Ninth Landing Citadel (" + ninthLanding.parcelId + "), Lampsend Bastion (" + lampsend.parcelId + (l3Parents.has(lampsend.sourceIndex) ? "" : ", un-subdivided — the HUB walled-city precedent") + ") / KEEPs Doorward (" + kDoorward.parcelId + "), Seamwatch (" + kSeam.parcelId + "), Southdelve (" + kSouth.parcelId + "), Far Gallery (" + kFar.parcelId + "), the Landing Keep (" + kLanding.parcelId + "). Castles grow WALL/GATE/TOWER rings via maps/generate.js castleLayout. The remaining GIANT/LARGE estates take the ladder fort on their whole-estate maps when un-subdivided (worldfield.estateParcel) — MAP-POPULATION-GUIDE B-7 covers the subdivided ones.",
      heroParcels: HERO_PARCELS_META,
      continuity: "NO horizontal neighbours (sealed vault). Vertical links only, all POIs: UP = the Shaft foot at the Landing (UW1-SHAFT-FOOT, connects HUB↔UW1; far side = HUB-SHAFT in the Dragonmaw caldera — the world's single surface→underworld portal); DOWN = Ironhold's Gate (E wall, UW1-GATE-UW2, connects UW1↔UW2 — the FIRST lock of the Binding, warden the Gatekeeper Below; far side = UW2-GATE-UW1 on Blackmere's W wall). The Shaft chain runs W→E through every vault. The Diminishing Stair does not touch Ironhold (ENT→UW2).",
      creatures: "kobold mining clans (each seam has one) and iron-kin smith-holds; Earth/Dark pet affinity, rare-gated underworld populations (data/zone-pet-population.json: Iron/Rock/Earth/Toxin, uncommon→legendary, domain Stone). The level boss: the Gatekeeper Below at the Gatekeep (UW1-BOSS-STAGE).",
    },
    zone: "UW1",
    rivers: [
      { id: "UW1-SUMP", name: "The Sump", width: 4.0, fill: true, pts: sump },
      { id: "UW1-SP-BLACK", name: "The Black Seep", width: 1.2, joins: "UW1-SUMP", pts: blackSeep },
      { id: "UW1-SP-IRON", name: "The Iron Seep", width: 1.2, pts: ironSeep },
      { id: "UW1-SP-DRIP", name: "The Drip Gallery", width: 0.7, pts: dripGallery },
      { id: "UW1-SP-DEEP", name: "The Deep Seep", width: 0.6, pts: deepSeep },
    ],
    roads: [
      { id: "UW1-RD1", name: "The Inner Gallery", tier: "highway", width: 0.5, pts: innerGallery },
      { id: "UW1-RD2", name: "The Outer Gallery", tier: "highway", width: 0.5, pts: outerGallery },
      { id: "UW1-RD3", name: "The North Hall", tier: "highway", width: 0.45, pts: hallN },
      { id: "UW1-RD4", name: "The South Hall", tier: "highway", width: 0.45, pts: hallS },
      { id: "UW1-RD5", name: "The Lamp Hall", tier: "highway", width: 0.45, pts: hallW },
      { id: "UW1-RD6", name: "The Level Road", tier: "highway", width: 0.5, pts: levelRoad },
      { id: "UW1-RD7", name: "The Forge Way", tier: "highway", width: 0.45, pts: forgeWay },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: u.tier, width: 0.3, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.3, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.2, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.2, pts: a.pts })),
    ],
    ridges: [
      { id: "UW1-RG-RIM-N", name: "The Vault Wall (North)", width: 2.4, pts: rimN },
      { id: "UW1-RG-RIM-S", name: "The Vault Wall (South)", width: 2.4, pts: rimS },
      { id: "UW1-RG-RIM-W", name: "The Vault Wall (West)", width: 2.4, pts: rimW },
      { id: "UW1-RG-RIM-E1", name: "The Vault Wall (East, north reach)", width: 2.4, pts: rimE1 },
      { id: "UW1-RG-RIM-E2", name: "The Vault Wall (East, south reach)", width: 2.4, pts: rimE2 },
      { id: "UW1-RG-IN-NE", name: "The Inner Curtain (NE)", width: 1.3, pts: inNE },
      { id: "UW1-RG-IN-SE", name: "The Inner Curtain (SE)", width: 1.3, pts: inSE },
      { id: "UW1-RG-IN-SW", name: "The Inner Curtain (SW)", width: 1.3, pts: inSW },
      { id: "UW1-RG-IN-NW", name: "The Inner Curtain (NW)", width: 1.3, pts: inNW },
      { id: "UW1-RG-OUT-NE", name: "The Outer Curtain (NE)", width: 1.4, pts: outNE },
      { id: "UW1-RG-OUT-SE", name: "The Outer Curtain (SE)", width: 1.4, pts: outSE },
      { id: "UW1-RG-OUT-SW", name: "The Outer Curtain (SW)", width: 1.4, pts: outSW },
      { id: "UW1-RG-OUT-NW1", name: "The Outer Curtain (NW, west reach)", width: 1.4, pts: outNW1 },
      { id: "UW1-RG-OUT-NW2", name: "The Outer Curtain (NW, north reach)", width: 1.4, pts: outNW2 },
      { id: "UW1-RG-PILLAR-1", name: "The Ninth Pillar", width: 1.0, pts: pillar1 },
      { id: "UW1-RG-PILLAR-2", name: "The Lamp Pillar", width: 1.0, pts: pillar2 },
      { id: "UW1-RG-PILLAR-3", name: "The Seam Pillar", width: 1.0, pts: pillar3 },
      { id: "UW1-RG-PILLAR-4", name: "The Delve Pillar", width: 1.0, pts: pillar4 },
    ],
    castles: CASTLES,
    pois: [
      { id: "UW1-SHAFT-FOOT", kind: "UNDERWORLD_SHAFT", at: [+C[0].toFixed(2), +C[1].toFixed(2)], connects: ["HUB", "UW1"], name: "The Shaft Foot",
        note: "where the Worldshaft from Tianxia (HUB-SHAFT, singular `the_shaft`) opens onto Ironhold — the ONE way in from the surface (atlas §2.8). Armies from the surface arrive here; the Landing Keep watches it" },
      { id: "UW1-LANDING", kind: "PLAZA", at: [+(C[0] + 2.5).toFixed(2), +(C[1] + 2.5).toFixed(2)], name: "The Landing (Veinsday Court)",
        note: "the shaft-foot plaza at the heart of the gallery rings — Veinsday's free swing at a new seam is struck here; the Inner Gallery circles it" },
      { id: "UW1-FORGE", kind: "LANDMARK", at: castleAt(forgeHall), name: "The Great Forge",
        note: "the Forge-Hall's heart — the iron-kin smith-holds' master forge (The Last Argument, Ironhold diplomacy, final edition, was hammered here)" },
      { id: "UW1-MIDAS", kind: "MINE", at: MV.slice(), singularId: "midas_veins", name: "The Midas Veins",
        legend: "Gold-lust made mineral; the deeper you follow, the richer, and the less of you comes back.",
        note: "the richest iron/gold seam of the Upper Caverns (signature materials Stone/Iron/Gems; the depth gradient's first rich step) — Seamwatch Keep stands over it; the Seam Road climbs to it from the Forge-Hall" },
      { id: "UW1-SUMP-POI", kind: "LANDMARK", at: SUMP.slice(), name: "The Sump",
        note: "the flooded hall of the south-west galleries where the Black Seep ends — still black water under a stone sky" },
      { id: "UW1-LAMPSEND", kind: "LANDMARK", at: LAMP_END.slice(), name: "The Last Lamp",
        note: "the end of the lit galleries on the Lamp Hall — beyond it the far dark, Far Gallery Watch and the Black Seep" },
      { id: "UW1-BOSS-STAGE", kind: "BOSS_STAGE", at: GK_AT.slice(), name: "The First Lock",
        note: "the FIRST lock of the Binding (WORLD-CHRONICLE) — warden: THE GATEKEEPER BELOW (`warden_uw1`, the UW1 level boss). The explicit boss stage: the Gatekeep's hall astride the Level Road, inside GIANT estate " + gatekeep.parcelId + " — the stage parcel is the castle's heroParcels[0] (playable L3 today). Clear it to proceed to Ironhold's Gate" },
      { id: "UW1-GATE-UW2", kind: "GATE", at: EGATE.slice(), connects: ["UW1", "UW2"], boss: true, name: "Ironhold's Gate",
        note: "the level door down to Blackmere (UW2; far side = UW2-GATE-UW1 on Blackmere's W wall, Blackmere's Gate) — the boss-gated passage (atlas §2.8); Doorward Keep watches its approach across the Iron Seep. The Level Road runs from the Landing through the Gatekeep to this door" },
    ],
  };
  const heroStats = attachHeroParcels(out, uw1, l3.singles);
  return { out, stats: { towns: towns.length, secondaries: secondaries.length, locals: locals.length, approaches: approaches.length, heroStats } };
}

// ---- build twice, byte-compare, write once ---------------------------------------------------------
const b1 = buildField();
const s1 = JSON.stringify(b1.out) + "\n";
const s2 = JSON.stringify(buildField().out) + "\n";
const h1 = createHash("sha256").update(s1).digest("hex");
const h2 = createHash("sha256").update(s2).digest("hex");
if (h1 !== h2) { console.error("NON-DETERMINISTIC BUILD:", h1, "≠", h2); process.exit(1); }
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/UW1.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/UW1.json sha256", h1.slice(0, 16),
  "| holds", b1.stats.towns,
  "| galleries", b1.stats.secondaries,
  "| locals", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
