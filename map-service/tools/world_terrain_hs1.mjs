#!/usr/bin/env node
// world_terrain_hs1.mjs — REPRODUCIBLE generator for data/world-terrain/HS1.json (Aeropolis).
//
// Aeropolis = HS1, the Cloud Gateway Isle — the lowest floating isle of the sky tier and the
// GATE TO HEAVEN: every surface airship (Arcadia + Porthaven) lands HERE first, then branches to
// ONE of Emberfall (HS2) or Empyrea (HS3) — the two are at war and have no direct link
// (zone-registry zoneLinks, owner-locked 2026-07-11). Owner-locked identity (SKY-ZONES-DESIGN
// 2026-08-31): **the CASTLE IN THE SKY — an ABANDONED LEAFY UTOPIA** — Machu Picchu / Cusco
// terraced citadel gone green: vines swallowing white stone, hanging gardens grown wild, bird
// flocks as the living weather, empty plazas — and the ONE working airship dock as the only
// maintained thing on the isle. Mood: serene, melancholy, green-on-white.
// Canon: CONTINUOUS-WORLD-TERRAIN §3 (HS1 row = Cloud Gateway mesa, Cusco/Machu Picchu; terraced
// mesa, single dock gateway, stepped districts), §3b (ANCIENT terraced sky citadel: contour
// terraces + switchback ways up to one airship-dock gateway; summit citadel + dock gatehouse),
// §3c (castles on ESTATES: PALACE→EPIC, CASTLE→GIANT, KEEP→LARGE), §3d (heroParcels via the
// SHARED world_hero_parcels.mjs rule), §3e + zone-registry zoneLinks (surface→HS1 gateway,
// HS1→HS2 | HS1→HS3 branch gates); CONTINENT-TERRAIN-ATLAS §2.5 (verdant cloud-forest mesa,
// E 1.0 free-floating / M 0.6 cloud-fed / T 0.5 mild; ALL rims = sky-void mapVoid, the only
// entry = the airship dock; cloud-cataracts pour off the rim; Wind/Grass pet homeland).
// OWNER ADDENDUM (2026-08-31, applied here): sky isles have "probably no river" — water is
// MINIMAL + DECORATIVE (small garden channels + two small pools, the old irrigation of the
// utopia; nothing deep or sailable). And sky-city battle maps must read as THREE STACKED LAND
// LAYERS — delivered at field level as PRONOUNCED CONTOUR TERRACING: three STRONG banded terrace
// walls (Garden / Middle / High) from rim to summit, so windowed parcel maps inherit a 3-level
// terraced read. No new data shapes.
//
// THE FLOATING ISLE (all four edges = sky-void — no coast, no horizontal neighbour; the UW2
// sealed-vault pattern with VOID where Blackmere has rock):
//   • SKY RIMS: four `ridges[]` rim walls just inside the viewBox edges — the cliff-lip into
//     open sky. THREE authored breaks, the isle's only doors: the AIRSHIP DOCK GATEWAY on the
//     south rim (facing the surface world), the EMBER GATE on the east rim (toward HS2) and the
//     EMPYREAN GATE on the north rim (toward HS3).
//   • CONTOUR TERRACES (the three-band keystone): concentric terrace WALLS arcing about the
//     summit heart TC=(100,55) — the isle's high point sits EAST (data reality: the one EPIC
//     estate is at (101.9,54.7), a citadel perched over the void like Machu Picchu itself):
//       WALL LOW  (r80, west reach only — where the isle is broad): the Garden Wall.
//       WALL MID  (r50): the Middle Wall — below it lie the stepped DOCK DISTRICTS (data
//                  reality again: 5 of 6 GIANT estates cluster in the south lower city).
//       WALL HIGH (r30): the High Wall — the summit band.
//     plus the light CITADEL CROWN (r15) ringing the palace. Each wall has ONE authored stair
//     gap; the switchback trunk zigzags gap to gap.
//   • WATER (minimal, decorative — owner addendum): two small fill pools (the Mirror of Heaven
//     on the summit shoulder, the Gardens Pool in the wild north-west gardens) + three narrow
//     garden channels — the Gardenfall stepping down the walls (waterfalls over the terraces),
//     the Cloudfall and the Veilfall pouring off the rim into the void (the atlas'
//     cloud-cataracts). Nothing deep, nothing sailable.
//   • ROADS = the ABANDONMENT read: ONE grand switchback trunk (the Way of Ascent — dock →
//     three stair-gates → summit), ONE processional crescent in the mid band, the two branch
//     ways to the sky gates, a sparse overgrown hamlet web + few feeders (locals capped at 10 —
//     roughly half a living zone's), castle approaches. The dock quarter keeps its lanes — the
//     one maintained corner.
//
// DETERMINISTIC PICK RULES (all over data/hexagon-city-source/parcels-l2.json, zone==="HS1";
// ties broken by parcelId ascending; SEP = 10 zone-units between fortification picks — UW2's 15
// scaled to the smaller isle (113.6 vs 150.5 viewBox; the garden castle and its rim watch-keep
// sit 10.9 apart, which is the intent: a hold and its watch);
// "playable" = the estate has L3 subdivision — castles/keeps constrained to playable estates so
// their castle POIs land on PLAYABLE parcels today, the UW2/HUB/BUS/ENT precedent; gate keeps
// are picked BEFORE the remaining castles so the rim watches stay near their gates):
//   AEROPOLIS    = the EPIC estate (HS1 has exactly one).                        → 1040345
//   HEAVENSGATE  = the playable GIANT nearest the dock gateway D=(57,114.2).     → 2040342
//   EMBERWATCH   = the playable LARGE nearest the Ember Gate EG=(111.7,82).      → 3040337
//   EMPYREAWATCH = the playable LARGE (excl. prior) nearest the Empyrean Gate
//                  NG=(52,1.9).                                                  → 3040326
//   STAIRWATCH   = the playable LARGE (excl. prior) nearest the Middle Wall's
//                  stair-gate G_MID=(50.3,60.2).                                 → 3040335
//   TERRACEHALL  = the playable GIANT (excl. prior) nearest the lower-city heart
//                  LC=(75,103).                                                  → 2040341
//   GARDENHOLD   = the playable GIANT (excl. prior) nearest the garden heart
//                  GH=(38,22).                                                   → 2040339
//   Each pick = first candidate by distance ≥SEP from every previous pick.
//   CASTLE POI POINT (subdivided estates) = the estate's L3 child center nearest the estate
//                  center (ties by parcelId) — the UW2 rule; a castle POI must sit ON its
//                  castle parcel.
//   NOTE data fact: the ONE HS1 EPIC (1040345) is NOT L3-subdivided (the zone-wide 0-EPIC
//   pattern) — the Aeropolis battle map arrives with the pre-designed ESTATE maps (canon
//   decisions 4/5) and its heroParcels DEFER; the castles + keeps sit on playable L3 parcels
//   and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d,
// shared rule in world_hero_parcels.mjs, identical across all world_terrain_*.mjs tools):
// castle parcel FIRST, LARGE 3 / GIANT 5 / EPIC 8; the un-subdivided Aeropolis EPIC defers.
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write. The tool also asserts the
// authored trunk/processional/branch ways cross NO terrace-wall ridge (they pass the gaps).
//
// Usage: node map-service/tools/world_terrain_hs1.mjs
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachHeroParcels, HERO_PARCELS_META } from "./world_hero_parcels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ---- deterministic rng (same family as the EDU/HUB/BUS/ENT/UW2/UW3 generators) ------------------
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const rng32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- Catmull-Rom spline + seeded meander (verbatim: the sibling tools) --------------------------
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
// a short PLANNED straight lane (the dock landing stair) — sampled, no meander
function straight(ctrl, step = 0.6) {
  const out = [ctrl[0].slice()];
  for (let i = 1; i < ctrl.length; i++) {
    const [ax, ay] = ctrl[i - 1], [bx, by] = ctrl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return round2(out);
}
// contour-terrace control points: an arc about (cx,cy), radius r, θ0→θ1 degrees (y-down frame:
// θ90 = due south, θ180 = due west, θ270 = due north), one control point every ~`step` degrees.
function arcCtrl(cx, cy, r, deg0, deg1, step = 12) {
  const n = Math.max(2, Math.ceil(Math.abs(deg1 - deg0) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const th = ((deg0 + ((deg1 - deg0) * i) / n) * Math.PI) / 180;
    out.push([+(cx + Math.cos(th) * r).toFixed(2), +(cy + Math.sin(th) * r).toFixed(2)]);
  }
  return out;
}

// ---- geometry helpers (verbatim family) ----------------------------------------------------------
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

// grid index over network VERTICES (verbatim: the sibling tools)
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

// ==================================================================================================
function buildField() {
  // ---- estates -----------------------------------------------------------------------------------
  const l2 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/parcels-l2.json"), "utf8"));
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/HS1.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));  // estates with playable L3 parcels
  const hs1 = l2.parcels.filter((p) => p.zone === "HS1");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const epics = hs1.filter((p) => p.sizeClass === "EPIC").sort(byId);
  const giants = hs1.filter((p) => p.sizeClass === "GIANT").sort(byId);
  const larges = hs1.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = hs1.filter((p) => p.sizeClass === "GIANT" || p.sizeClass === "LARGE")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const mediums = hs1.filter((p) => p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- the authored frame (viewBox 0 0 113.6 116.01) ----------------------------------------------
  const TC = [100, 55];                    // the terrace center — the isle's high heart, EAST (data)
  const DOCK = [57, 114.2];                // the airship dock gateway — the south-rim break
  const EGATE = [111.7, 82];               // the Ember Gate — the east-rim break, toward HS2
  const NGATE = [52, 1.9];                 // the Empyrean Gate — the north-rim break, toward HS3
  const G_MID = [50.3, 60.2];              // the Middle Wall stair-gate (r50 θ174)
  const LC = [75, 103];                    // the lower-city heart (the stepped dock districts)
  const GH = [38, 22];                     // the garden heart (the wild north-west hanging gardens)
  const SEP = 10;                          // UW2's 15 scaled to the smaller isle (header rule)

  // ---- deterministic picks (rules in the header) ---------------------------------------------------
  const aeropolis = epics[0];              // HS1 has exactly one EPIC
  const AERO = aeropolis.center.slice();
  const giantsPlay = giants.filter((p) => l3Parents.has(p.sourceIndex));
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const picked = [{ center: AERO }];
  const pickNearest = (pool, pt) => {
    for (const cand of pool.slice().sort((a, b) => (dist(a.center, pt) - dist(b.center, pt)) || byId(a, b)))
      if (!picked.includes(cand) && picked.every((q) => dist(q.center, cand.center) >= SEP)) { picked.push(cand); return cand; }
    return null;
  };
  const heavensgate = pickNearest(giantsPlay, DOCK);
  const kEmber = pickNearest(largesPlay, EGATE);      // gate keeps BEFORE the remaining castles
  const kEmpyrea = pickNearest(largesPlay, NGATE);
  const kStair = pickNearest(largesPlay, G_MID);
  const terracehall = pickNearest(giantsPlay, LC);
  const gardenhold = pickNearest(giantsPlay, GH);
  // castle POI point = the estate's L3 child center nearest the estate center (ties by parcelId
  // ascending) — the world-layer invariant is that a castle POI sits ON its castle parcel.
  const kidsByParent = new Map();
  for (const s of l3.singles) {
    let arr = kidsByParent.get(s.parentIndex);
    if (!arr) { arr = []; kidsByParent.set(s.parentIndex, arr); }
    arr.push(s);
  }
  const castleAt = (estate) => {
    const kids = (kidsByParent.get(estate.sourceIndex) || []).slice()
      .sort((a, b) => (a.parcelId < b.parcelId ? -1 : 1));
    if (!kids.length) return estate.center.slice();
    let best = kids[0];
    for (const k of kids) if (dist(k.center, estate.center) < dist(best.center, estate.center)) best = k;
    return [best.center[0], best.center[1]];
  };

  // ---- SKY RIMS (void cliff-lips; three authored gate breaks) --------------------------------------
  const rimS1 = natural([[1.8, 114.2], [14, 114], [26, 114.3], [38, 114], [50, 114.2]], 0.4, 20, "HS1|rim|S1");
  const rimS2 = natural([[64, 114.2], [76, 114], [88, 114.3], [100, 114], [111.8, 114.2]], 0.4, 20, "HS1|rim|S2");
  const rimE1 = natural([[111.8, 1.9], [111.5, 20], [111.9, 40], [111.6, 58], [111.8, 75]], 0.35, 20, "HS1|rim|E1");
  const rimE2 = natural([[111.8, 89], [111.5, 98], [111.9, 106], [111.8, 114.2]], 0.35, 16, "HS1|rim|E2");
  const rimN1 = natural([[1.8, 1.9], [12, 2.1], [23, 1.8], [34, 2.1], [45, 1.9]], 0.4, 20, "HS1|rim|N1");
  const rimN2 = natural([[59, 1.9], [72, 2.1], [85, 1.8], [98, 2.1], [111.8, 1.9]], 0.4, 20, "HS1|rim|N2");
  const rimW = natural([[1.9, 1.8], [1.7, 25], [2.1, 50], [1.8, 75], [2.1, 95], [1.9, 114.2]], 0.4, 24, "HS1|rim|W");

  // ---- CONTOUR TERRACE WALLS (the three-band keystone; gaps = the switchback stair-gates) ----------
  const wallLow1 = natural(arcCtrl(...TC, 80, 136, 180), 0.35, 22, "HS1|wall|LOW1", 8);
  const wallLow2 = natural(arcCtrl(...TC, 80, 190, 219), 0.35, 20, "HS1|wall|LOW2", 8);
  const wallMid1 = natural(arcCtrl(...TC, 50, 96, 168), 0.35, 22, "HS1|wall|MID1", 8);
  const wallMid2 = natural(arcCtrl(...TC, 50, 180, 244), 0.35, 22, "HS1|wall|MID2", 8);
  const wallHigh1 = natural(arcCtrl(...TC, 30, 76, 124), 0.3, 18, "HS1|wall|HIGH1", 8);
  const wallHigh2 = natural(arcCtrl(...TC, 30, 136, 284), 0.3, 20, "HS1|wall|HIGH2", 8);
  const crown1 = natural(arcCtrl(...TC, 15, 60, 207, 10), 0.2, 12, "HS1|wall|CR1", 8);
  const crown2 = natural(arcCtrl(...TC, 15, 223, 300, 10), 0.2, 12, "HS1|wall|CR2", 8);
  // the Roost Crag — the bird-thronged spur between the citadel and the east rim
  const crag = natural([[104.5, 41], [107, 44], [108.5, 47.5]], 0.25, 6, "HS1|crag", 8);
  const WALLS = [wallLow1, wallLow2, wallMid1, wallMid2, wallHigh1, wallHigh2, crown1, crown2];
  const RIDGES = [rimS1, rimS2, rimE1, rimE2, rimN1, rimN2, rimW, ...WALLS, crag];
  const GAP_LOW = [20.3, 48], GAP_HIGH = [80.7, 78], GAP_CROWN = [87.7, 46.4];   // r80 θ185 / r30 θ130 / r15 θ215
  const RIDGE_GAPS = [DOCK, EGATE, NGATE, G_MID, GAP_LOW, GAP_HIGH, GAP_CROWN];

  // ---- WATER (minimal + decorative — owner addendum; the old irrigation of the utopia) -------------
  const pool = (cx, cy, r, key) => {
    const w = rng32(fnv1a(key));
    const pts = [];
    for (let a = 0; a <= 10; a++) {
      const t = (a / 10) * Math.PI * 2, rr = r * (0.9 + w() * 0.2);
      pts.push([+(cx + Math.cos(t) * (a === 10 ? r : rr)).toFixed(2), +(cy + Math.sin(t) * (a === 10 ? r : rr)).toFixed(2)]);
    }
    pts.push(pts[0].slice());
    return pts;
  };
  const lakeMirror = pool(89, 40, 1.5, "HS1|pool|mirror");
  const lakeGarden = pool(38, 24, 1.8, "HS1|pool|garden");
  // the Gardenfall: Mirror of Heaven → over the High Wall → over the Middle Wall → the Gardens Pool
  const chGardenfall = natural([[89, 40], [78, 36], [65, 31], [52, 27], [40, 24.5]], 0.35, 12, "HS1|ch|gardenfall", 8);
  // the Cloudfall: the Gardens Pool → over the Garden Wall → off the WEST rim into the void
  const chCloudfall = natural([[38, 24], [26, 26], [14, 28], [3, 30]], 0.35, 12, "HS1|ch|cloudfall", 8);
  // the Veilfall: a mid-terrace spring → over the Garden Wall's south reach → off the SOUTH rim
  // (the cataract every arriving airship passes — west of the dock break)
  const chVeilfall = natural([[44, 84], [41, 95], [39, 105], [38, 113.5]], 0.3, 12, "HS1|ch|veilfall", 8);
  const RIVERS = [lakeMirror, lakeGarden, chGardenfall, chCloudfall, chVeilfall];

  // ---- THE WAY OF ASCENT (the grand switchback trunk: dock → stair-gates → summit) -----------------
  // leg 1 west along the apron (r≈65) → the Middle Wall gate; leg 2 east along the mid band
  // (r≈40) → the High Wall gate; leg 3 west along the summit band (r≈22) → the Citadel Crown
  // gate; leg 4 up to the palace. A true zigzag — never a straight climb.
  const roadAscent = natural(
    [[57, 114], [54, 101], [43.7, 87.5], [37.2, 71.8], G_MID, [61.4, 65.4], [65.4, 75], [70.3, 81.8],
     GAP_HIGH, [81, 66], [78, 55], [80.1, 45.7], GAP_CROWN, [94, 50], [101.9, 54.7]],
    0.45, 20, "HS1|road|ascent");
  // the Processional Way: the mid-band crescent (r≈35) — the empty ceremonial round of the utopia
  const roadProcession = natural(arcCtrl(...TC, 35, 100, 250, 15), 0.4, 22, "HS1|road|procession");
  // the Empyrean Way: the north gate → down the wild gardens → the Middle Wall stair-gate
  const roadEmpyrean = natural([[52, 2.5], [44, 12], [38, 22], [34, 34], [33, 46], [38, 58], [44, 62], G_MID], 0.4, 20, "HS1|road|empyrean");
  // the Emberway: the High Wall stair-gate → around the summit's south shoulder → the east gate
  const roadEmber = natural([GAP_HIGH, [88, 78.5], [96, 79.5], [104, 80.8], [111.4, 82]], 0.3, 14, "HS1|road|ember", 8);
  const HIGHWAYS = [roadAscent];
  const SECONDARIES_AUTHORED = [
    { id: "HS1-RD2", name: "The Processional Way", pts: roadProcession },
    { id: "HS1-RD3", name: "The Empyrean Way", pts: roadEmpyrean },
    { id: "HS1-RD4", name: "The Emberway", pts: roadEmber },
  ];
  // in-tool invariant: the authored ways pass the stair-gates, never over a terrace wall
  for (const [nm, poly] of [["ascent", roadAscent], ["procession", roadProcession], ["empyrean", roadEmpyrean], ["ember", roadEmber]]) {
    const n = crossings(poly, WALLS);
    if (n > 0) { console.error(`AUTHORED ROAD ${nm} crosses a terrace wall ${n}×  — widen the stair-gap`); process.exit(1); }
  }

  // ---- dock-quarter + terrace-town lanes (the one maintained corner + the empty districts) ---------
  const urban = [];
  let dtN = 0;
  const addLane = (name, tier, pts, idOverride) => { dtN++; urban.push({ id: idOverride || `HS1-DQ${String(dtN).padStart(2, "0")}`, name, tier, pts }); };
  const HG = castleAt(heavensgate);
  addLane("The Landing Stair", "local", straight([[HG[0], HG[1]], [DOCK[0], DOCK[1] - 0.8]], 0.5), "HS1-DQ-LANDING");
  addLane("Heavensgate Crescent", "local", natural([[HG[0] - 2.4, HG[1] - 1.2], [HG[0], HG[1] - 2.4], [HG[0] + 2.4, HG[1] - 1.0]], 0.2, 5, "HS1|town|heavensgate|cres", 8));
  const TH = castleAt(terracehall);
  addLane("Terracehall Steps", "local", natural([[TH[0] - 2.4, TH[1] + 1.1], [TH[0], TH[1] - 1.8], [TH[0] + 2.4, TH[1] + 0.9]], 0.2, 5, "HS1|town|terracehall|steps", 8));
  const GD = castleAt(gardenhold);
  addLane("Gardenhold Walk", "local", natural([[GD[0] - 2.2, GD[1] + 1.2], [GD[0], GD[1] + 2.2], [GD[0] + 2.2, GD[1] + 1.0]], 0.2, 5, "HS1|town|gardenhold|walk", 8));
  // the Silent Plaza round — the empty ceremonial circle on the Processional Way
  const PLAZA = [65.5, 49];
  const plazaRound = [];
  for (let a = 0; a <= 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    plazaRound.push([+(PLAZA[0] + Math.cos(t) * 2.5).toFixed(2), +(PLAZA[1] + Math.sin(t) * 2.5).toFixed(2)]);
  }
  addLane("The Silent Plaza Round", "local", round2(plazaRound), "HS1-DQ-PLAZA");

  // ---- castles (§3c + the header's pick rules) -----------------------------------------------------
  const CASTLES = [
    { id: "HS1-AEROPOLIS", kind: "PALACE", at: AERO.slice(), townEstateId: aeropolis.parcelId,
      name: "The Aeropolis", ref: "the summit citadel of the Castle in the Sky — the abandoned utopia's white-stone crown on the eastern crag, perched over the void (Machu Picchu itself); vines hold its walls now, and only the birds keep court" },
    { id: "HS1-CASTLE-HEAVENSGATE", kind: "CASTLE", at: HG.slice(), townEstateId: heavensgate.parcelId,
      name: "Heavensgate Castle", ref: "the dock gatehouse — the ONE maintained thing on the isle: it guards the Gate to Heaven, where every surface airship lands first" },
    { id: "HS1-CASTLE-TERRACEHALL", kind: "CASTLE", at: TH.slice(), townEstateId: terracehall.parcelId,
      name: "Terracehall Castle", ref: "the old seat of the stepped lower city — the Cusco districts under the Middle Wall, plazas empty, stairs green with moss" },
    { id: "HS1-CASTLE-GARDENHOLD", kind: "CASTLE", at: GD.slice(), townEstateId: gardenhold.parcelId,
      name: "Gardenhold Castle", ref: "the garden palace of the wild north-west — the hanging gardens grew over it a century ago; the Empyrean Way passes its gate" },
    { id: "HS1-KEEP-EMBERWATCH", kind: "KEEP", at: castleAt(kEmber), townEstateId: kEmber.parcelId,
      name: "Emberwatch Keep", ref: "rim watch-keep on the south-east shoulder, watching the Ember Gate — the branch way to Emberfall (HS2)" },
    { id: "HS1-KEEP-EMPYREAWATCH", kind: "KEEP", at: castleAt(kEmpyrea), townEstateId: kEmpyrea.parcelId,
      name: "Empyreawatch Keep", ref: "rim watch-keep over the north gardens, watching the Empyrean Gate — the branch way to Empyrea (HS3), the rightful pinnacle" },
    { id: "HS1-KEEP-STAIRWATCH", kind: "KEEP", at: castleAt(kStair), townEstateId: kStair.parcelId,
      name: "Stairwatch Keep", ref: "the keep at the Middle Wall's stair-gate, where the Way of Ascent and the Empyrean Way meet — whoever holds it holds the climb" },
  ];

  // ---- overgrown hamlet web (the organic countryside style, scaled DOWN — abandonment) -------------
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const s of SECONDARIES_AUTHORED) netIdx.addPolyline(s.pts);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const CITIES = [
    { c: AERO, r: 5 }, { c: heavensgate.center, r: 4 }, { c: terracehall.center, r: 4 }, { c: gardenhold.center, r: 4 },
    { c: kEmber.center, r: 3.5 }, { c: kEmpyrea.center, r: 3.5 }, { c: kStair.center, r: 3.5 },
  ];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "HS1|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(8, L * 0.35);
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 0.9, 26);
    if (crossings(poly, RIDGES) > 0) {                              // one reroute attempt via a stair-gate
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.7, 26);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
      // else: accept — a terrace stair over a low garden wall
    }
    if (crossings(poly, RIVERS) > 2) {                              // bridge budget: ≤ 2 water crossings
      const flat = build([a, b], 0.4, 20);
      if (crossings(flat, RIVERS) <= crossings(poly, RIVERS)) poly = flat;
    }
    return poly;
  }
  const secondaries = SECONDARIES_AUTHORED.slice();
  let secN = 0;
  const addSecondary = (pts, name) => {
    secN++; secondaries.push({ id: `HS1-SEC${String(secN).padStart(3, "0")}`, name, pts });
    netIdx.addPolyline(pts);
  };
  const townName = (t) => `Terrace ${t.id}`;
  // pass 1 — neighbour pair ways with UNION-FIND component tracking (the sibling pattern)
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
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.65) { union(t.id, nb.id); continue; }
    addSecondary(poly, `${townName(t)} – ${townName(nb)} Old Way`);
    union(t.id, nb.id);
    for (const id of [t.id, nb.id]) { if (!pairPolys.has(id)) pairPolys.set(id, []); pairPolys.get(id).push(poly); }
  }
  // pass 2 — connect every terrace COMPONENT to the CONNECTED network
  const connIdx = makeIndex();
  for (const h of HIGHWAYS) connIdx.addPolyline(h);
  for (const s of SECONDARIES_AUTHORED) connIdx.addPolyline(s.pts);
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
        const spur = natural([best.at, bpt], 0.3, 10, `HS1|road|spur|${best.id}`, 8);
        addSecondary(spur, `${townName(best)} Spur`);
        connIdx.addPolyline(spur);
      } else {
        addSecondary(poly, `${townName(best)} Link`);
        connIdx.addPolyline(poly);
      }
    }
    for (const t of members) for (const p of pairPolys.get(t.id) || []) connIdx.addPolyline(p);
  }

  // ---- local lanes: ≤10 seeded MEDIUM feeders (HALF a living zone's — the overgrown countryside) ---
  const locals = [];
  const pickR = rng32(fnv1a("HS1|locals|pick"));
  const shuffled = mediums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 10) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.2 || d > 22) continue;
    const r = rng32(fnv1a("HS1|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(3.5, L * 0.4);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.5, 9, "HS1|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.75) continue;
    locN++;
    locals.push({ id: `HS1-LOC${String(locN).padStart(2, "0")}`, name: `Terrace ${m.id} Green Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- castle approaches: every castle sits ≤1u from the road network -------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.25, 8, "HS1|road|approach|" + c.id, 8);
    approaches.push({ id: `HS1-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- output ---------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "HS1 (Aeropolis) macro feature network — the continuous-terrain field, the abandoned Castle in the Sky",
      author: "CF ParcelMap Design Agent (HS1 satellite build), 2026-08-31 (regenerate with map-service/tools/world_terrain_hs1.mjs)",
      coords: "HS1 zone svg viewBox (0 0 113.6 116.01); y down. Same space as data/hexagon-city-source/l3/HS1.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords. FLOATING SKY ISLE: no coast, no sea, no horizontal neighbour — all four edges are SKY-VOID cliff-lips (atlas §2.5 mapVoid), so there is NO cross-zone geometric continuity contract; the isle's only doors are the three airship-gate POIs (S: the surface Gate to Heaven, E: HS2, N: HS3).",
      grounding: "346 L2 + 14,071 L3 over a 113.6×116 square. The one EPIC estate " + aeropolis.parcelId + " sits at (" + AERO.map((n) => n.toFixed(1)) + ") on the EAST crag — the summit citadel perched over the void (Machu Picchu itself), so the terrace rings arc about TC=(100,55) and descend WESTWARD; 5 of the 6 GIANT estates cluster in the SOUTH lower city — the stepped Cusco districts under the dock.",
      determinism: "generated by map-service/tools/world_terrain_hs1.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale; world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors). The two garden pools carry fill: true (their small authored width windows honestly); every channel is a band-clamped narrow flow. WATER IS MINIMAL BY OWNER RULE (2026-08-31): sky isles have no true rivers — these are the utopia's old garden irrigation + rim cataracts, decorative, never deep or sailable.",
      terraces: "THREE-BAND KEYSTONE (owner 2026-08-31 — sky-city battle maps read as three stacked land layers): ridges[] are the isle's CONTOUR TERRACE WALLS, three STRONG banded rings from rim to summit — the Garden Wall (r80, west reach where the isle is broad), the Middle Wall (r50, above the stepped dock districts) and the High Wall (r30, the summit band) — plus the light Citadel Crown (r15) and the four SKY RIMS (void cliff-lips; the only rim breaks are the three gate doorways). Each wall has ONE stair-gate; parcel maps windowed from the field inherit the 3-level terraced read.",
      water: "rivers[] = the old GARDEN WATERCOURSES, minimal + decorative: the Mirror of Heaven (a small fill pool on the summit shoulder) feeds the Gardenfall, which steps down over the High and Middle Walls (terrace waterfalls) to the Gardens Pool (fill, in the wild north-west gardens); the Cloudfall pours from it over the Garden Wall and off the WEST rim into the void; the Veilfall drops off the SOUTH rim — the cataract every arriving airship passes. Cloud-cataracts, not rivers (atlas §2.5): nothing deep, nothing navigable, no naval semantics in the sky.",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — the channels are visual continuity, not hard blockers.",
      era: "Aeropolis = the ABANDONED LEAFY UTOPIA (owner-locked SKY-ZONES-DESIGN 2026-08-31: castle in the sky — utopia, birds, abandoned, leafy): Machu Picchu / Cusco terraced citadel gone green — vines over white stone, hanging gardens wild, EMPTY plazas, bird flocks as the living weather, and the ONE working airship dock as the only maintained thing. Abandonment reads through SPARSENESS: one grand switchback trunk, one processional crescent, two branch ways, a thin overgrown hamlet web, locals capped at 10 (half a living zone's). Urban = the dock quarter's Landing Stair + a crescent per castle town + the Silent Plaza round — never a grid.",
      hierarchy: "roads carry tier: highway (1 trunk — the WAY OF ASCENT, the grand switchback: dock → Middle Wall stair-gate → High Wall stair-gate → Citadel Crown gate → the Aeropolis; a true zigzag, one leg per band) / secondary (the Processional Way mid-band crescent, the Empyrean Way to the north gate, the Emberway to the east gate, + the overgrown terrace web: hamlets = the 22 GIANT+LARGE L2 estate anchors, stair-gate reroutes, ≤2 water crossings each, connect-don't-double dedup) / local (dock-quarter lanes, the Silent Plaza round, ≤10 seeded MEDIUM green lanes, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c (castles on ESTATES; importance→size): PALACE the Aeropolis (EPIC " + aeropolis.parcelId + ", the summit citadel) / CASTLE Heavensgate (playable GIANT " + heavensgate.parcelId + ", the dock gatehouse) + Terracehall (" + terracehall.parcelId + ", the lower-city seat) + Gardenhold (" + gardenhold.parcelId + ", the wild gardens) / KEEPs Emberwatch (" + kEmber.parcelId + ") + Empyreawatch (" + kEmpyrea.parcelId + ") + Stairwatch (" + kStair.parcelId + ") — the rim/stair watches by the three gates. The one HS1 EPIC is NOT L3-subdivided — the Aeropolis battle map arrives with the pre-designed ESTATE maps (canon 4/5); castles+keeps sit on playable L3 parcels and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META,
      continuity: "NO horizontal neighbours (floating isle). AIRSHIP links only, all POIs (zone-registry zoneLinks, owner-locked 2026-07-11): the GATE TO HEAVEN on the south rim = the surface gateway (Arcadia EDU + Porthaven BUS airship ways land at HS1 FIRST — the Gateway Anchorage); the EMBER GATE (east rim) branches to Emberfall (HS2) and the EMPYREAN GATE (north rim) to Empyrea (HS3) — the two upper isles are AT WAR (skyWar) and have no direct link: you pick a side at this gateway.",
      creatures: "bird flocks are the living weather of the abandoned isle (SKY-ZONES-DESIGN) — heaviest at the Roost Crag by the citadel; Wind/Grass pet homeland (atlas §2.5); the pet layer reads data/zone-pet-population.json. No bosses baked at field level — the isle is serene, not hostile.",
    },
    zone: "HS1",
    rivers: [
      { id: "HS1-LK-MIRROR", name: "The Mirror of Heaven", width: 2.4, fill: true, pts: lakeMirror },
      { id: "HS1-LK-GARDEN", name: "The Gardens Pool", width: 2.8, fill: true, pts: lakeGarden },
      { id: "HS1-CH1", name: "The Gardenfall", width: 0.7, joins: "HS1-LK-GARDEN", pts: chGardenfall },
      { id: "HS1-CH2", name: "The Cloudfall", width: 0.8, joins: "HS1-LK-GARDEN", pts: chCloudfall },
      { id: "HS1-CH3", name: "The Veilfall", width: 0.7, pts: chVeilfall },
    ],
    roads: [
      { id: "HS1-RD1", name: "The Way of Ascent", tier: "highway", width: 0.45, pts: roadAscent },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: u.tier, width: 0.22, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.3, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.2, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "HS1-RG-RIM-S1", name: "The Sky's Edge (South, west reach)", width: 2.4, pts: rimS1 },
      { id: "HS1-RG-RIM-S2", name: "The Sky's Edge (South, east reach)", width: 2.4, pts: rimS2 },
      { id: "HS1-RG-RIM-E1", name: "The Sky's Edge (East, north reach)", width: 2.4, pts: rimE1 },
      { id: "HS1-RG-RIM-E2", name: "The Sky's Edge (East, south reach)", width: 2.4, pts: rimE2 },
      { id: "HS1-RG-RIM-N1", name: "The Sky's Edge (North, west reach)", width: 2.4, pts: rimN1 },
      { id: "HS1-RG-RIM-N2", name: "The Sky's Edge (North, east reach)", width: 2.4, pts: rimN2 },
      { id: "HS1-RG-RIM-W", name: "The Sky's Edge (West)", width: 2.4, pts: rimW },
      { id: "HS1-RG-LOW1", name: "The Garden Wall (south reach)", width: 2.0, pts: wallLow1 },
      { id: "HS1-RG-LOW2", name: "The Garden Wall (north reach)", width: 2.0, pts: wallLow2 },
      { id: "HS1-RG-MID1", name: "The Middle Wall (south reach)", width: 2.2, pts: wallMid1 },
      { id: "HS1-RG-MID2", name: "The Middle Wall (north reach)", width: 2.2, pts: wallMid2 },
      { id: "HS1-RG-HIGH1", name: "The High Wall (east reach)", width: 2.2, pts: wallHigh1 },
      { id: "HS1-RG-HIGH2", name: "The High Wall (west reach)", width: 2.2, pts: wallHigh2 },
      { id: "HS1-RG-CROWN1", name: "The Citadel Crown (long reach)", width: 1.4, pts: crown1 },
      { id: "HS1-RG-CROWN2", name: "The Citadel Crown (north reach)", width: 1.4, pts: crown2 },
      { id: "HS1-RG-ROOST", name: "The Roost Crag", width: 1.1, pts: crag },
    ],
    castles: CASTLES,
    pois: [
      { id: "HS1-DOCK-GATEWAY", kind: "GATE", at: DOCK.slice(), connects: ["EDU", "BUS", "HS1"], name: "The Gate to Heaven",
        note: "the airship dock gateway on the south rim — the ONLY entry from the surface world and the one maintained thing on the abandoned isle (the Gateway Anchorage of zone-registry zoneLinks: ALL surface airships — Arcadia EDU-PORT-SKY + Porthaven BUS-PORT-SKY Skyreach Anchorage — land HERE first, then branch to HS2 or HS3). Heavensgate Castle is its gatehouse; the Landing Stair climbs from the quay to the Way of Ascent; every arriving airship passes the Veilfall pouring off the rim" },
      { id: "HS1-GATE-EMBER", kind: "GATE", at: EGATE.slice(), connects: ["HS1", "HS2"], name: "The Ember Gate",
        note: "the east-rim airship gate toward Emberfall (HS2), the fallen-angel war capital — one of the two branches from the gateway isle (the sky war: HS2 and HS3 have NO direct link; you pick a side here). Emberwatch Keep holds the shoulder above it; the Emberway runs from the High Wall stair-gate" },
      { id: "HS1-GATE-EMPYREA", kind: "GATE", at: NGATE.slice(), connects: ["HS1", "HS3"], name: "The Empyrean Gate",
        note: "the north-rim airship gate toward Empyrea (HS3), the rightful frozen pinnacle — the other branch from the gateway isle. Empyreawatch Keep watches it over the wild gardens; the Empyrean Way descends to the Middle Wall stair-gate" },
      { id: "HS1-PLAZA-SILENT", kind: "LANDMARK", at: PLAZA.slice(), name: "The Silent Plaza",
        note: "the empty ceremonial circle on the Processional Way — the utopia's gathering place, its flagstones green with moss; no one has spoken here in a hundred years" },
      { id: "HS1-GARDENS", kind: "LANDMARK", at: [38, 22], name: "The Hanging Gardens",
        note: "the wild north-west gardens around the Gardens Pool — the utopia's pride, grown gloriously feral; the Gardenfall still feeds them, terrace to terrace, exactly as the dead gardeners built it" },
      { id: "HS1-ROOST", kind: "LANDMARK", at: [107, 44], name: "The Roost of a Thousand Wings",
        note: "the bird-thronged crag between the Citadel Crown and the east rim — the flocks are the isle's living weather (SKY-ZONES-DESIGN); they rise at dawn and wheel about the Aeropolis like a crown of wings" },
    ],
  };
  // heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
  const heroStats = attachHeroParcels(out, hs1, l3.singles);
  return { out, stats: { towns: towns.length, urban: urban.length, secondaries: secondaries.length, locals: locals.length, approaches: approaches.length, heroStats } };
}

// ---- build twice, byte-compare, write once ---------------------------------------------------------
const b1 = buildField();
const s1 = JSON.stringify(b1.out) + "\n";
const s2 = JSON.stringify(buildField().out) + "\n";
const h1 = createHash("sha256").update(s1).digest("hex");
const h2 = createHash("sha256").update(s2).digest("hex");
if (h1 !== h2) { console.error("NON-DETERMINISTIC BUILD:", h1, "≠", h2); process.exit(1); }
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/HS1.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/HS1.json sha256", h1.slice(0, 16),
  "| terraces", b1.stats.towns,
  "| urban lanes", b1.stats.urban,
  "| secondary ways", b1.stats.secondaries,
  "| locals", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
