#!/usr/bin/env node
// world_terrain_edu.mjs — REPRODUCIBLE generator for data/world-terrain/EDU.json (Arcadia).
//
// Regenerates the EDU macro feature network IN FULL: the authored trunk content from the
// 2026-07-10 pass (2 rivers, 3 roads, 3 ridges, 2 POIs — control points embedded verbatim, so
// their ids/points regenerate byte-identically) PLUS the real-city ROAD HIERARCHY
// (owner 2026-07-10: roads belong ONLY to the world layer; parcels play whatever overlaps them):
//
//   • tier "highway"   — the 3 authored trunk roads (Academy / Terrace / Northwest).
//   • tier "secondary" — the JOKAMACHI castle-town web in the Academy basin (owner 2026-07-10:
//     Arcadia's urban core is a MEDIEVAL castle town, Himeji/Kanazawa style — NOT a planned
//     grid): a wobbly RING ROAD around Westgate Castle's walls (the Nijō-analog GIANT estate),
//     5 gently-kinked RADIALS from the castle gates outward to the highways / a river bridge /
//     the Grand Academy PALACE (which keeps its own short ring + the ceremonial approach), PLUS
//     the rural TOWN links exactly as before (owner: "the rural area we can use current"):
//     towns = the real EDU L2 estate anchors (GIANT + LARGE, 28 anchors); each town links to
//     its nearest neighbour town + its nearest network point with valley-following Catmull-Rom
//     + seeded meander curves — EXCEPT pairs fully inside the basin (the jokamachi web serves
//     those; the old orthogonal L-elbows are gone — medieval streets bend, never grid). Segments
//     avoid crossing ridge polylines where a reroute via the rimwall's endpoint gap is cheap
//     (else the pass is accepted — a mountain road); river crossings kept ≤ 2 bridges per road.
//   • tier "local"     — short curvy feeders from ~20 seeded MEDIUM estates to the nearest
//     secondary/highway point; a few organic inter-radial lanes + dead-end stubs in the castle
//     town (medieval TERMINUS lanes are fine); short castle approach roads.
//
// CASTLES (castles[]): the real-Kyoto fortification analogs mapped onto the real EDU estate
// anchors — Westgate Castle (Nijō) / the Grand Academy PALACE (Imperial Palace) / two east-hill
// temple KEEPs (Kiyomizu / Higashiyama) / Southreach Castle (Fushimi). Each carries its estate id
// and battle maps grow wall rings from them (map-service/maps/generate.js).
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d, shared
// rule in world_hero_parcels.mjs, identical in the EDU/HUB/BUS tools): each castle estate lists
// its HERO-MODE (3D) POI L3 parcelIds — castle parcel FIRST, length = LARGE 3 / GIANT 5 / EPIC 8.
// Deterministic pick: castle parcel = the L3 parcel containing (else nearest-center to) the
// castle POI point; the rest = greedy farthest-point spread over L3 centers PREFERRING parcels
// that intersect roads/rivers/coast polylines (they read as gates/bridge/harbour/approaches;
// eligible when spread ≥ 0.5× the step's best), ties by parcelId ascending. Estates with NO L3
// subdivision (the EDU EPIC 1020371 included — no EPIC is subdivided) emit heroParcels: [] +
// heroParcelsNote (designation DEFERRED until subdivision).
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
import { attachHeroParcels, HERO_PARCELS_META } from "./world_hero_parcels.mjs";

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

const BASIN = [126.7, 81.4];               // the Grand Academy basin (the Kyoto-analog urban heart)
const BASIN_R = 35;                        // zone-units: inside → medieval castle-town street character
const inBasin = ([x, y]) => Math.hypot(x - BASIN[0], y - BASIN[1]) < BASIN_R;

// ---- castles (the real-Kyoto fortification analogs on the real estate anchors) ------------------
// Deterministic picks from the L2 estate data (no authored coordinates beyond the Academy anchor):
//   Nijō analog   = the GIANT estate nearest WEST of the basin center (the shogunate seat).
//   Palace        = the Grand Academy itself (the sole EPIC estate).
//   Hill temples  = the two GIANT/LARGE estates nearest the East Rimwall (Kiyomizu-analog KEEPs).
//   Fushimi analog= the southern-most GIANT estate (y down = south).
const giants = eduL2.filter((p) => p.sizeClass === "GIANT");
const epicEstate = eduL2.find((p) => p.sizeClass === "EPIC");
const distToLine = (p, line) => { let m = Infinity; for (const q of line) m = Math.min(m, Math.hypot(q[0] - p[0], q[1] - p[1])); return m; };
const nijoEstate = giants.filter((p) => p.center[0] < BASIN[0])
  .sort((a, b) => (Math.hypot(a.center[0] - BASIN[0], a.center[1] - BASIN[1]) - Math.hypot(b.center[0] - BASIN[0], b.center[1] - BASIN[1])) || (a.parcelId < b.parcelId ? -1 : 1))[0];
const fushimiEstate = giants.slice().sort((a, b) => (b.center[1] - a.center[1]) || (a.parcelId < b.parcelId ? -1 : 1))[0];
const keepEstates = eduL2.filter((p) => (p.sizeClass === "GIANT" || p.sizeClass === "LARGE") && p !== nijoEstate && p !== fushimiEstate)
  .sort((a, b) => (distToLine(a.center, ridgeEast) - distToLine(b.center, ridgeEast)) || (a.parcelId < b.parcelId ? -1 : 1))
  .slice(0, 2);
const CASTLES = [
  { id: "EDU-CASTLE-WESTGATE", kind: "CASTLE", at: nijoEstate.center.slice(), townEstateId: nijoEstate.parcelId,
    name: "Westgate Castle", ref: "Nijō Castle — the shogunate seat west of the palace" },
  { id: "EDU-PALACE-ACADEMY", kind: "PALACE", at: [126.7, 81.4], townEstateId: epicEstate.parcelId,
    name: "The Grand Academy", ref: "Kyoto Imperial Palace / the university district" },
  { id: "EDU-KEEP-CLIFFWATCH", kind: "KEEP", at: keepEstates[0].center.slice(), townEstateId: keepEstates[0].parcelId,
    name: "Cliffwatch Temple", ref: "Kiyomizu-dera — fortified temple on the eastern hills" },
  { id: "EDU-KEEP-LANTERNHILL", kind: "KEEP", at: keepEstates[1].center.slice(), townEstateId: keepEstates[1].parcelId,
    name: "Lantern Hill Temple", ref: "the Higashiyama hill temples" },
  { id: "EDU-CASTLE-SOUTHREACH", kind: "CASTLE", at: fushimiEstate.center.slice(), townEstateId: fushimiEstate.parcelId,
    name: "Southreach Castle", ref: "Fushimi Castle — the southern outpost" },
];
const CASTLE_AT = CASTLES[0].at;           // Westgate Castle — the basin's centre of gravity

// ---- secondary-road router ----------------------------------------------------------------------
// Route a→b as a natural curve. Near the basin: MEDIEVAL street — a seeded off-axis kink (bends
// for defense, never an orthogonal grid elbow), light meander. Elsewhere: valley curve (seeded
// mid-point sway + meander). Ridge crossings get one reroute attempt via the nearest rimwall
// endpoint gap (accepted as a mountain pass if the detour is absurd); river crossings are
// minimized down to ≤ 2 bridges by flattening the curve.
function routeRoad(a, b, key) {
  const r = rng32(fnv1a("route|" + key));
  const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "EDU|road|" + key);
  const candidates = [];
  if (inBasin(a) && inBasin(b)) {
    // medieval kink: midpoint pushed off the chord by a seeded perpendicular bend (two mirror
    // candidates so the ridge/river scoring below can still pick the cleaner side)
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const k = (0.18 + r() * 0.17) * Math.min(L, 14);
    candidates.push(build([a, [mx - (dy / L) * k, my + (dx / L) * k], b], 0.35, 12),
                    build([a, [mx + (dy / L) * k, my - (dx / L) * k], b], 0.35, 12));
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
const secondaries = [];                       // { id, name, pts }  (rural town links, EDU-SEC*)
const jokamachi = [];                         // { id, name, tier, pts }  (the castle-town web, EDU-JK*)
const secondaryPts = () => secondaries.map((s) => s.pts);
const networkFor = (extra = []) => [...HIGHWAYS, ...jokamachi.map((j) => j.pts), ...secondaryPts(), ...extra];
const townName = (t) => `Town ${t.id}`;

let secN = 0;
const addSecondary = (pts, name) => { secN++; secondaries.push({ id: `EDU-SEC${String(secN).padStart(2, "0")}`, name, pts }); };

// ---- JOKAMACHI castle-town web (owner 2026-07-10: medieval, Himeji/Kanazawa character) ----------
// Ring road around Westgate Castle's walls, kinked radials from its gates outward, the Grand
// Academy's own short ring + ceremonial approach, and a few organic inter-radial lanes (dead-ends
// welcome — medieval towns have them). All seeded; built BEFORE the town links so basin towns
// connect into the web instead of drawing grid streets.
const wobblyRing = (c, rad, n, key) => {
  const r = rng32(fnv1a(key));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (1 + (r() - 0.5) * 0.22);                 // kinked, hand-laid — never a circle
    pts.push([+(c[0] + Math.cos(a) * rr).toFixed(2), +(c[1] + Math.sin(a) * rr).toFixed(2)]);
  }
  pts.push(pts[0].slice());                                     // closed loop
  return pts;
};
const ringPointToward = (ring, tgt) => {                        // ring vertex nearest the bearing → a gate
  let best = ring[0], bd = Infinity;
  for (const p of ring.slice(0, -1)) { const d = Math.hypot(p[0] - tgt[0], p[1] - tgt[1]); if (d < bd) { bd = d; best = p; } }
  return best;
};
// a radial: gently curved/kinked medieval street from a castle gate outward to its target
const radialRoad = (from, to, key) => {
  const r = rng32(fnv1a("jk-radial|" + key));
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1;
  const k = (r() - 0.5) * Math.min(6, L * 0.3);                 // seeded off-axis bend
  return natural([from, [mx - (dy / L) * k, my + (dx / L) * k], to], 0.5, 12, "EDU|jk|" + key, 8);
};
const JK_RING_R = 3.4, PAL_RING_R = 1.9;
const castleRing = wobblyRing(CASTLE_AT, JK_RING_R, 14, "EDU|jk|castle-ring");
const palaceRing = wobblyRing(BASIN, PAL_RING_R, 10, "EDU|jk|palace-ring");
jokamachi.push({ id: "EDU-JK-RING", name: "Westgate Castle Ring Road", tier: "secondary", pts: castleRing });
jokamachi.push({ id: "EDU-JK-PALRING", name: "Grand Academy Ring", tier: "secondary", pts: palaceRing });
// radial targets: the PALACE (the ceremonial approach), the two highways serving the basin, the
// river bridge west (crossing the Arcadia Flow, +3u of bridgehead on the far bank), and the
// southern town — 5 radials, each leaving the ring at the gate vertex facing its target.
const bridgeAt = nearestOn([riverMain], CASTLE_AT[0], CASTLE_AT[1]).pt;
const bridgeDir = [bridgeAt[0] - CASTLE_AT[0], bridgeAt[1] - CASTLE_AT[1]];
const bridgeLen = Math.hypot(bridgeDir[0], bridgeDir[1]) || 1;
const bridgeEnd = [+(bridgeAt[0] + (bridgeDir[0] / bridgeLen) * 3).toFixed(2), +(bridgeAt[1] + (bridgeDir[1] / bridgeLen) * 3).toFixed(2)];
const southTown = towns.reduce((best, t) => (Math.hypot(t.at[0] - 102.5, t.at[1] - 109.1) < Math.hypot(best.at[0] - 102.5, best.at[1] - 109.1) ? t : best), towns[0]);
const RADIALS = [
  { key: "ceremonial", name: "The Ceremonial Way", to: ringPointToward(palaceRing, CASTLE_AT) },
  { key: "academy-gate", name: "North Gate Street", to: nearestOn([roadAcademy], CASTLE_AT[0], CASTLE_AT[1] - JK_RING_R).pt },
  { key: "terrace-gate", name: "Terrace Gate Street", to: nearestOn([roadTerrace], CASTLE_AT[0] - JK_RING_R, CASTLE_AT[1]).pt },
  { key: "river-gate", name: "River Gate Street", to: bridgeEnd },
  { key: "south-gate", name: "South Gate Street", to: southTown.at },
];
const radialPolys = [];
for (const rd of RADIALS) {
  const gate = ringPointToward(castleRing, rd.to);
  const poly = radialRoad(gate, rd.to, rd.key);
  radialPolys.push(poly);
  jokamachi.push({ id: `EDU-JK-R${radialPolys.length}`, name: rd.name, tier: "secondary", pts: poly });
}
// the castle's own gate road: castle heart → the ring (the maps layer grows the walls from the POI)
jokamachi.push({ id: "EDU-JK-GATE", name: "Westgate Approach", tier: "local",
  pts: natural([CASTLE_AT, ringPointToward(castleRing, RADIALS[0].to)], 0.2, 8, "EDU|jk|gate", 8) });
jokamachi.push({ id: "EDU-JK-PALGATE", name: "Academy Forecourt", tier: "local",
  pts: natural([BASIN, ringPointToward(palaceRing, CASTLE_AT)], 0.15, 8, "EDU|jk|palgate", 8) });
// inter-radial lanes: short organic connectors partway out + one dead-end stub (TERMINUS is fine)
const lanePt = (poly, t) => { const i = Math.max(1, Math.min(poly.length - 1, Math.round(t * (poly.length - 1)))); return poly[i]; };
const laneR = rng32(fnv1a("EDU|jk|lanes"));
let jkLaneN = 0;
for (const [ai, bi] of [[0, 1], [1, 2], [4, 0]]) {
  const a = lanePt(radialPolys[ai], 0.3 + laneR() * 0.25);
  const b = lanePt(radialPolys[bi], 0.3 + laneR() * 0.25);
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.2) continue;
  jkLaneN++;
  jokamachi.push({ id: `EDU-JK-L${jkLaneN}`, name: `Castle Town Lane ${jkLaneN}`, tier: "local",
    pts: radialRoad(a, b, `lane${jkLaneN}`) });
}
{ // dead-end market stub off the south radial
  const a = lanePt(radialPolys[4], 0.45 + laneR() * 0.2);
  const ang = laneR() * Math.PI * 2, len = 1.6 + laneR() * 1.4;
  jkLaneN++;
  jokamachi.push({ id: `EDU-JK-L${jkLaneN}`, name: "Old Market Lane", tier: "local",
    pts: natural([a, [+(a[0] + Math.cos(ang) * len).toFixed(2), +(a[1] + Math.sin(ang) * len).toFixed(2)]], 0.25, 6, "EDU|jk|stub", 8) });
}

// candidate edges, deterministic order: each town → nearest neighbour town (dedup pair),
// then each town → nearest highway point. Pairs fully inside the basin are SKIPPED — the
// jokamachi web is the basin's street plan (towns there hook on via the second loop instead).
const seenPairs = new Set();
for (const t of towns) {
  let nb = null, bd = Infinity;
  for (const u of towns) {
    if (u === t) continue;
    const d = Math.hypot(u.at[0] - t.at[0], u.at[1] - t.at[1]);
    if (d < bd) { bd = d; nb = u; }
  }
  if (!nb) continue;
  if (inBasin(t.at) && inBasin(nb.at)) continue;               // the castle town serves basin pairs
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

// ---- castle approach roads: every castle sits ≤1u from the road network -------------------------
// (Westgate + the Academy already own gate roads; the hill KEEPs and Southreach get a short
// tier:local approach from the fort to the nearest network point when nothing passes close by.)
const approaches = [];
for (const c of CASTLES) {
  const net = [...networkFor(), ...locals.map((l) => l.pts), ...approaches.map((a) => a.pts)];
  const { pt, d } = nearestOn(net, c.at[0], c.at[1]);
  if (d <= 1.0) continue;
  approaches.push({ id: `EDU-CAP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`,
    pts: natural([c.at, pt], 0.3, 10, "EDU|road|approach|" + c.id, 8) });
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
    hierarchy: "roads carry tier: highway (the 3 authored trunk roads) / secondary (the JOKAMACHI castle-town web in the Academy basin — ring road + kinked radials around Westgate Castle, the Grand Academy's ring + ceremonial way (owner 2026-07-10: Arcadia's core is MEDIEVAL, Himeji/Kanazawa style, never a grid) — plus the rural town links: towns = the 28 GIANT+LARGE L2 estate anchors, valley curves, ≤2 river bridges each) / local (short feeders from ~20 seeded MEDIUM estates, castle-town lanes incl. dead-ends, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them (owner 2026-07-10).",
    castles: "castles[] = the real-Kyoto fortification analogs on the real estate anchors: CASTLE Westgate (Nijō, the GIANT nearest west of the basin) / PALACE Grand Academy (Imperial Palace, EPIC 1020371) / KEEP Cliffwatch + Lantern Hill (Kiyomizu & Higashiyama temples, nearest the East Rimwall) / CASTLE Southreach (Fushimi, southern-most GIANT). Battle maps grow WALL/GATE/TOWER rings from these POIs (maps/generate.js castle layout).",
    heroParcels: HERO_PARCELS_META,
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
    ...jokamachi.map((j) => ({ id: j.id, name: j.name, tier: j.tier, width: j.tier === "secondary" ? 0.32 : 0.22, pts: j.pts })),
    ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.32, pts: s.pts })),
    ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
    ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
  ],
  ridges: [
    { id: "EDU-RG1", name: "East Rimwall", width: 2.5, pts: ridgeEast },
    { id: "EDU-RG2", name: "South Rimwall", width: 2.5, pts: ridgeSouth },
    { id: "EDU-RG3", name: "West Rimwall", width: 2.5, pts: ridgeWest },
  ],
  castles: CASTLES,
  pois: [
    { id: "EDU-CITY", kind: "GRAND_ACADEMY", at: [126.7, 81.4], note: "the sole EPIC estate 1020371 — the capital city" },
    { id: "EDU-GATE-N", kind: "GATE", at: [63, 0], connects: ["EDU", "HUB"], note: "north gate — river + Academy Road exit toward Tianxia" },
  ],
};
// heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/EDU.json"), "utf8"));
const heroStats = attachHeroParcels(out, eduL2, l3.singles);
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/EDU.json"), JSON.stringify(out) + "\n");
console.log("heroParcels:", heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/EDU.json:",
  "towns", towns.length,
  "| jokamachi", jokamachi.length,
  "| secondary roads", secondaries.length,
  "| local roads", locals.length,
  "| approaches", approaches.length,
  "| total roads", out.roads.length,
  "| castles", CASTLES.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
