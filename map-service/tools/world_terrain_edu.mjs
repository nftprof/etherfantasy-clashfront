#!/usr/bin/env node
// world_terrain_edu.mjs — REPRODUCIBLE generator for data/world-terrain/EDU.json (Arcadia).
//
// Regenerates the EDU macro feature network IN FULL: the authored trunk content from the
// 2026-07-10 pass (2 rivers, 3 roads, 3 ridges, 2 POIs — control points embedded verbatim, so
// their ids/points regenerate byte-identically) PLUS the real-city ROAD HIERARCHY
// (owner 2026-07-10: roads belong ONLY to the world layer; parcels play whatever overlaps them):
//
//   • tier "highway"   — the 3 authored trunk roads (Academy / Terrace / Northwest).
//   • tier "secondary" — TOWN links. Towns = the real EDU L2 estate anchors (GIANT + LARGE from
//     data/hexagon-city-source/parcels-l2.json, 28 anchors). Kyoto-style (the Arcadia aerial
//     reference): near the Grand Academy basin the links run roughly orthogonal (L-shaped grid
//     streets); elsewhere each town links to its nearest neighbour town + its nearest highway
//     point with valley-following Catmull-Rom + seeded meander curves. Segments avoid crossing
//     ridge polylines where a reroute via the rimwall's endpoint gap is cheap (else the pass is
//     accepted — a mountain road); river crossings are counted and kept ≤ 2 bridges per road.
//   • tier "local"     — short curvy feeders from ~20 seeded MEDIUM estates to the nearest
//     secondary/highway point.
//
// Dedup: a candidate that runs near-parallel (< 2 zone-units) to the existing network for most
// of its length is NOT drawn — the town gets a short connector instead ("connect, don't double").
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Same inputs ⇒
// byte-identical data/world-terrain/EDU.json.
//
// Usage: node map-service/tools/world_terrain_edu.mjs
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ---- deterministic rng (same family as the generator) -----------------------------------------
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const rng32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- Catmull-Rom spline + seeded meander (verbatim: the 2026-07-10 authoring pass) -------------
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
// seeded meander: displace each sample perpendicular to local direction by smooth noise
function meander(pts, amp, wavelen, seedKey) {
  const r = rng32(fnv1a(seedKey));
  const phases = [r() * 6.283, r() * 6.283, r() * 6.283];
  const freqs = [1, 2.7, 5.1].map((f) => (6.283 * f) / wavelen);
  let dist = 0;
  const out = pts.map((p, i) => {
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L; // unit normal
    const w = Math.sin(dist * freqs[0] + phases[0]) * 0.6 + Math.sin(dist * freqs[1] + phases[1]) * 0.3 + Math.sin(dist * freqs[2] + phases[2]) * 0.1;
    // fade the meander near the ends so exits/junctions stay put (continuity anchors)
    const fade = Math.min(1, i / 6, (pts.length - 1 - i) / 6);
    return [+(p[0] + nx * w * amp * fade).toFixed(2), +(p[1] + nz * w * amp * fade).toFixed(2)];
  });
  return out;
}
const natural = (ctrl, amp, wavelen, key, per = 10) => meander(spline(ctrl, per), amp, wavelen, key);

// ---- TRUNK network (authored 2026-07-10 — control points verbatim, ids/points frozen) -----------
// RIVER — the Arcadia Flow: SE plateau source, meanders NW past the Grand Academy's west flank,
// gathers a west tributary, exits the north edge toward HUB.
const riverMain = natural(
  [[132, 128], [118, 112], [104, 98], [96, 88], [88, 76], [82, 62], [74, 46], [70, 28], [66, 12], [64, 0]],
  2.2, 34, "EDU|river|main");
const riverTrib = natural(
  [[22, 116], [38, 106], [52, 96], [66, 88], [78, 80], [86, 72]], // joins main near (86,72)
  1.6, 26, "EDU|river|west-tributary");
// HIGHWAYS — cities form on water: Academy Road follows the river valley from the north gate to
// the Grand Academy; Terrace Road links the western GIANT estates; Northwest Road serves the frontier.
const roadAcademy = natural(
  [[62, 0], [68, 14], [72, 30], [78, 46], [86, 60], [96, 72], [106, 80], [112, 84], [120, 84], [126, 82]],
  1.1, 40, "EDU|road|academy");
const roadTerrace = natural(
  [[112, 84], [96, 86], [80, 84], [64, 82], [56, 90], [50, 102], [52, 112], [56, 122]], // Academy → GIANT cluster → S terraces
  1.0, 36, "EDU|road|terrace");
const roadNorthWest = natural(
  [[62, 0], [50, 12], [38, 24], [28, 38], [18, 52], [12, 68]], // north gate → NW frontier villages
  1.0, 38, "EDU|road|northwest");
// RIDGES — the plateau rimwall (S/E/W mountain frontier; north stays open toward HUB).
const ridgeEast = natural([[150, 20], [146, 44], [144, 70], [146, 96], [142, 120], [136, 140]], 1.8, 40, "EDU|ridge|east");
const ridgeSouth = natural([[136, 140], [116, 144], [92, 142], [68, 144], [44, 140], [24, 132]], 1.8, 44, "EDU|ridge|south");
const ridgeWest = natural([[24, 132], [14, 112], [8, 90], [6, 66], [8, 42], [14, 22]], 1.8, 40, "EDU|ridge|west");

const RIDGES = [ridgeEast, ridgeSouth, ridgeWest];
const RIVERS = [riverMain, riverTrib];
const HIGHWAYS = [roadAcademy, roadTerrace, roadNorthWest];
// rimwall endpoint gaps (the open north shoulders) — reroute candidates for ridge-crossing roads
const RIDGE_GAPS = [[150, 20], [136, 140], [24, 132], [14, 22]];

// ---- geometry helpers ---------------------------------------------------------------------------
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, qx = dx - cx, qy = dy - cy;
  const den = rx * qy - ry * qx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((cx - ax) * qy - (cy - ay) * qx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
// number of times polyline A crosses any polyline in set B
function crossings(A, set) {
  let n = 0;
  for (let i = 1; i < A.length; i++)
    for (const B of set)
      for (let j = 1; j < B.length; j++)
        if (segX(A[i - 1][0], A[i - 1][1], A[i][0], A[i][1], B[j - 1][0], B[j - 1][1], B[j][0], B[j][1])) n++;
  return n;
}
// nearest point (and its distance) on a set of polylines to (x,y) — vertex-sampled (dense polylines)
function nearestOn(set, x, y) {
  let best = null, bd = Infinity;
  for (const line of set) for (const p of line) {
    const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
    if (d < bd) { bd = d; best = p; }
  }
  return { pt: best, d: Math.sqrt(bd) };
}
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
// fraction of a polyline's vertices lying within `r` zone-units of the network set
function nearFraction(pts, set, r) {
  if (!set.length) return 0;
  let near = 0;
  for (const p of pts) if (nearestOn(set, p[0], p[1]).d < r) near++;
  return near / pts.length;
}

// ---- towns (the real EDU L2 estate anchors) -----------------------------------------------------
const l2 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/parcels-l2.json"), "utf8"));
const eduL2 = l2.parcels.filter((p) => p.zone === "EDU");
const towns = eduL2.filter((p) => p.sizeClass === "GIANT" || p.sizeClass === "LARGE")
  .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] }))
  .sort((a, b) => (a.id < b.id ? -1 : 1));
const mediums = eduL2.filter((p) => p.sizeClass === "MEDIUM")
  .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] }))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

const BASIN = [126.7, 81.4];               // the Grand Academy basin (Kyoto grid heart)
const BASIN_R = 32;                        // zone-units: inside → orthogonal street character
const inBasin = ([x, y]) => Math.hypot(x - BASIN[0], y - BASIN[1]) < BASIN_R;

// ---- secondary-road router ----------------------------------------------------------------------
// Route a→b as a natural curve. Near the basin: Kyoto-style — an L-shaped elbow (orthogonal-ish),
// light meander. Elsewhere: valley curve (seeded mid-point sway + meander). Ridge crossings get one
// reroute attempt via the nearest rimwall endpoint gap (accepted as a mountain pass if the detour
// is absurd); river crossings are minimized down to ≤ 2 bridges by flattening the curve.
function routeRoad(a, b, key) {
  const r = rng32(fnv1a("route|" + key));
  const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "EDU|road|" + key);
  const candidates = [];
  if (inBasin(a) && inBasin(b)) {
    // orthogonal-ish: two possible elbows; both stay candidates, scored below
    const e1 = [b[0], a[1]], e2 = [a[0], b[1]];
    candidates.push(build([a, e1, b], 0.35, 16), build([a, e2, b], 0.35, 16));
  } else {
    // valley curve: seeded perpendicular sway on the midpoint
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(10, L * 0.35);
    candidates.push(build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 1.0, 30));
  }
  // pick the candidate with fewest ridge crossings (river crossings tie-break)
  let poly = candidates[0], bs = Infinity;
  for (const c of candidates) {
    const s = crossings(c, RIDGES) * 10 + crossings(c, RIVERS);
    if (s < bs) { bs = s; poly = c; }
  }
  // ridge avoidance: one reroute attempt via the nearest rimwall endpoint gap
  if (crossings(poly, RIDGES) > 0) {
    let gap = RIDGE_GAPS[0], gd = Infinity;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
    const via = build([a, gap, b], 0.8, 30);
    const direct = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < direct * 2.2) poly = via;
    // else: accept the pass — a mountain road over the rimwall
  }
  // bridge budget: ≤ 2 river crossings per secondary road — flatten the curve until it fits
  if (crossings(poly, RIVERS) > 2) {
    const flat = build([a, b], 0.4, 24);
    if (crossings(flat, RIVERS) <= crossings(poly, RIVERS)) poly = flat;
  }
  return poly;
}

// ---- assemble the hierarchy ---------------------------------------------------------------------
const secondaries = [];                       // { id, name, pts }
const secondaryPts = () => secondaries.map((s) => s.pts);
const networkFor = (extra = []) => [...HIGHWAYS, ...secondaryPts(), ...extra];
const townName = (t) => `Town ${t.id}`;

let secN = 0;
const addSecondary = (pts, name) => { secN++; secondaries.push({ id: `EDU-SEC${String(secN).padStart(2, "0")}`, name, pts }); };

// candidate edges, deterministic order: each town → nearest neighbour town (dedup pair),
// then each town → nearest highway point.
const seenPairs = new Set();
for (const t of towns) {
  let nb = null, bd = Infinity;
  for (const u of towns) {
    if (u === t) continue;
    const d = Math.hypot(u.at[0] - t.at[0], u.at[1] - t.at[1]);
    if (d < bd) { bd = d; nb = u; }
  }
  if (!nb) continue;
  const pk = [t.id, nb.id].sort().join("~");
  if (seenPairs.has(pk)) continue;
  seenPairs.add(pk);
  const poly = routeRoad(t.at, nb.at, `sec|${pk}`);
  // dedup/merge: near-parallel to the existing network for most of its length → don't double it
  if (nearFraction(poly, networkFor(), 2.0) > 0.65) continue;
  addSecondary(poly, `${townName(t)} – ${townName(nb)} Road`);
}
for (const t of towns) {
  const net = networkFor();
  const { pt, d } = nearestOn(net, t.at[0], t.at[1]);
  if (d < 2.0) continue;                                        // town already sits on the network
  const poly = routeRoad(t.at, pt, `hwy|${t.id}`);
  if (nearFraction(poly, net, 2.0) > 0.65) {
    // near-parallel: connect instead of doubling — a short direct spur to the closest point
    const spur = natural([t.at, pt], 0.3, 12, `EDU|road|spur|${t.id}`, 8);
    addSecondary(spur, `${townName(t)} Spur`);
    continue;
  }
  addSecondary(poly, `${townName(t)} Highway Link`);
}

// ---- local roads: ~20 seeded MEDIUM estates → nearest secondary/highway point ------------------
const locals = [];
const pickR = rng32(fnv1a("EDU|locals|pick"));
const shuffled = mediums.slice();
for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
let locN = 0;
for (const m of shuffled) {
  if (locN >= 20) break;
  const net = [...networkFor(), ...locals.map((l) => l.pts)];
  const { pt, d } = nearestOn(net, m.at[0], m.at[1]);
  if (d < 1.2 || d > 26) continue;                               // already on the network / hopeless hermit
  const r = rng32(fnv1a("EDU|local|" + m.id));
  const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
  const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
  const sway = (r() - 0.5) * Math.min(4, L * 0.4);
  const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.6, 10, "EDU|road|loc|" + m.id, 8);
  if (nearFraction(poly, net, 2.0) > 0.75) continue;             // would double an existing road
  locN++;
  locals.push({ id: `EDU-LOC${String(locN).padStart(2, "0")}`, name: `Hamlet ${m.id} Lane`, pts: poly });
}

// ---- output -------------------------------------------------------------------------------------
const out = {
  _meta: {
    title: "EDU (Arcadia) macro feature network — the continuous-terrain field, starting continent",
    author: "Map-maker session, 2026-07-10 (road hierarchy added; regenerate with map-service/tools/world_terrain_edu.mjs)",
    coords: "EDU zone svg viewBox (0 0 155.77 148.06); y=0 edge faces HUB (north). Same space as data/hexagon-city-source/l3/EDU.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords.",
    grounding: "Grand Academy EPIC at (126.7,81.4); GIANT estates (61,85)/(64,75)/(55,112); atlas: plateau + rimwall S/E/W, river source flowing N toward HUB, terraces (CONTINENT-TERRAIN-ATLAS §2.4).",
    determinism: "generated by map-service/tools/world_terrain_edu.mjs — control points authored, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical polylines.",
    widths: "world-units at BATTLE scale are derived per-parcel; at zone scale width is in zone-units (1 parcel ≈ 0.68 u across, so the river ~1.2 u wide spans ~2 parcels).",
    gameplay: "units can walk over water for now (owner 2026-07-10) — rivers are terrain/visual continuity, not hard blockers; fords/bridges come with the toll/gate layer.",
    hierarchy: "roads carry tier: highway (the 3 authored trunk roads) / secondary (town links — towns = the 28 GIANT+LARGE L2 estate anchors, Kyoto-orthogonal near the Academy basin, valley curves elsewhere, ≤2 river bridges each) / local (short feeders from ~20 seeded MEDIUM estates). Roads belong ONLY to this world layer — parcels play whatever overlaps them (owner 2026-07-10).",
  },
  zone: "EDU",
  rivers: [
    { id: "EDU-RV1", name: "Arcadia Flow", width: 1.2, pts: riverMain },
    { id: "EDU-RV2", name: "West Tributary", width: 0.7, joins: "EDU-RV1", pts: riverTrib },
  ],
  roads: [
    { id: "EDU-RD1", name: "Academy Road", tier: "highway", width: 0.5, pts: roadAcademy },
    { id: "EDU-RD2", name: "Terrace Road", tier: "highway", width: 0.4, pts: roadTerrace },
    { id: "EDU-RD3", name: "Northwest Road", tier: "highway", width: 0.4, pts: roadNorthWest },
    ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.32, pts: s.pts })),
    ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
  ],
  ridges: [
    { id: "EDU-RG1", name: "East Rimwall", width: 2.5, pts: ridgeEast },
    { id: "EDU-RG2", name: "South Rimwall", width: 2.5, pts: ridgeSouth },
    { id: "EDU-RG3", name: "West Rimwall", width: 2.5, pts: ridgeWest },
  ],
  pois: [
    { id: "EDU-CITY", kind: "GRAND_ACADEMY", at: [126.7, 81.4], note: "the sole EPIC estate 1020371 — the capital city" },
    { id: "EDU-GATE-N", kind: "GATE", at: [63, 0], connects: ["EDU", "HUB"], note: "north gate — river + Academy Road exit toward Tianxia" },
  ],
};
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/EDU.json"), JSON.stringify(out) + "\n");
console.log("wrote data/world-terrain/EDU.json:",
  "towns", towns.length,
  "| secondary roads", secondaries.length,
  "| local roads", locals.length,
  "| total roads", out.roads.length);
