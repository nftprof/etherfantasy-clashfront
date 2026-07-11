#!/usr/bin/env node
// world_terrain_uw3.mjs — REPRODUCIBLE generator for data/world-terrain/UW3.json (Luxuria).
//
// Luxuria = UW3, the Inferno Vault — the deepest, final level; the world's smallest zone by far
// (63.3 × 64.0, 92 L2 estates): not a continent, ONE grand volcanic vent chamber. Owner-locked
// era (CONTINUOUS-WORLD-TERRAIN §3b): **INFERNAL BAROQUE DECADENCE** (Pompeii pleasure-city +
// vent chamber) — a pleasure-palace RING around the magma throne, spoke boulevards, sin-palace
// compounds as the castle analogs; the Throne precinct is the fortification. Canon:
// CONTINUOUS-WORLD-TERRAIN §3 (UW3 row = volcanic vent chamber: a single central caldera,
// magma-river spokes), §3c ladder (SCALED — see below), §3d heroParcels;
// CONTINENT-TERRAIN-ATLAS §2.10 (volcanic wall-to-wall, thin ashen rim, E 0.2 / M 0.2 / T 1.0
// the hottest ground in the world; all four edges = mapVoid rock/magma wall; the ONLY
// connection is up = the boss-gate to UW2; a dead-end vault — the bottom of the world).
// Lore (docs/lore/WORLD-CHRONICLE.md, hub mirror + data/singulars.json):
//   • THE GARDENS OF ENAMORA (`gardens_enamora`) — UW3's heart: "Perpetual twilight; everything
//     blooms, nothing bears fruit." The twilight garden precinct between the Magma Throne and
//     the palace ring (the Twilight Walk arc, N-NW of the throne).
//   • THE FINAL VAULT OF LUXURIA = the THIRD lock of the Binding; warden THE INFERNO CHAMPION.
//     Explicit FINAL-BOSS STAGE POI (UW3-VAULT-STAGE, kind BOSS_STAGE) — the Hunt end-game
//     revisit happens here: the Throne precinct at the vault, behind/above the throne as seen
//     from the Penitents' Way, ON the Vault-Palace castle estate so the stage parcel IS the
//     castle's heroParcels[0] (a playable L3 parcel today).
//   • BOSS-GATE up = the Vault Gate (W wall, connects UW2↔UW3) — armies' only door (the Shaft
//     chain); the Diminishing Stair goes no deeper than Blackmere.
//
// THE VENT CHAMBER (all four edges = rock — no coast, no sky, no horizontal neighbour):
//   • RIM WALLS: four `ridges[]` walls just inside the viewBox edges; the only break is the
//     Vault Gate doorway (W wall). Obsidian reef spurs at the four corners.
//   • THE MAGMA THRONE: the central caldera lava pool — a `rivers[]` disc band, `magma: true`
//     (additive flag, ignored by worldfield v1; palette = the registry VOLCANIC family, whose
//     battle-map WATER cells already render as lava).
//   • MAGMA FLOWS: four `magma: true` rivers radiating from the throne to the walls between
//     the boulevards (atlas: "lava rivers radiating from the throne") + a SE fissure vein.
//   • ROADS: the RING OF SIGHS (highway — the pleasure-palace ring around the throne), the
//     PENITENTS' WAY (highway — the Vault Gate arrival avenue onto the ring), SPOKE BOULEVARDS
//     (secondary — ring → each sin-palace compound), the Twilight Walk + the Lovers' Stair
//     (local — the garden precinct), the tiny hamlet web + feeders (a vault has almost no
//     countryside — the KOL "scaled way down" precedent), castle approaches.
//
// FORTIFICATION LADDER — SCALED (the isles precedent, KOL citadel-on-authored-ground → here
// real land with NO GIANT/EPIC: 92 L2 = 52 SMALL + 30 MEDIUM + 10 LARGE): §3c maps importance
// to the biggest sizes that EXIST, so UW3's TOP fortification role rides the best LARGE as a
// CASTLE (the Vault-Palace), and the sin-palace compounds are KEEPs on the remaining playable
// LARGEs. Documented deviation: no PALACE kind is emitted (no EPIC exists to carry it).
//
// DETERMINISTIC PICK RULES (all over data/hexagon-city-source/parcels-l2.json, zone==="UW3";
// ties broken by parcelId ascending; SEP = 10 zone-units between fortification picks;
// "playable" = the estate has L3 subdivision — 8/10 LARGEs are):
//   VAULT-PALACE = the playable LARGE nearest the throne center C=(31.64,32.02).  → 3110087
//   4 SIN KEEPS  = remaining playable LARGEs ordered by |dist(center,C) − RING_R(12.5)|
//                  ascending (nearest the palace ring), greedily accepted while ≥SEP from
//                  every previous pick.  → 3110089 · 3110088 · 3110084 · 3110086
//   CASTLE POI POINT = the estate's L3 child center nearest the estate center (ties by
//                  parcelId) — an estate's bbox center can fall in a coverage gap, and the
//                  world-layer invariant is that a castle POI sits ON its castle parcel.
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d,
// shared rule in world_hero_parcels.mjs): castle parcel FIRST, LARGE 3 each (all five castle
// estates are L3-subdivided — every UW3 castle is fully designated).
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_uw3.mjs
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachHeroParcels, HERO_PARCELS_META } from "./world_hero_parcels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ---- deterministic rng (same family as the EDU/HUB/BUS/ENT/UW2 generators) ----------------------
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const rng32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- Catmull-Rom spline + seeded meander (verbatim family) ---------------------------------------
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
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

// grid index over network VERTICES (verbatim family)
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
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/UW3.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));
  const uw3 = l2.parcels.filter((p) => p.zone === "UW3");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const larges = uw3.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = larges.map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const mediums = uw3.filter((p) => p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- deterministic picks (rules in the header) ---------------------------------------------------
  const C = [63.29 / 2, 64.04 / 2];                                 // the throne center
  const WGATE = [1.2, 32];                                          // the Vault Gate (W wall doorway)
  const RING_R = 12.5;
  const SEP = 10;
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const vaultPalace = largesPlay.slice().sort((a, b) => (dist(a.center, C) - dist(b.center, C)) || byId(a, b))[0];
  const picked = [vaultPalace];
  // castle POI point = the estate's L3 child center nearest the estate center (rule in header)
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
  const VP_AT = castleAt(vaultPalace);
  const sinKeeps = [];
  for (const cand of largesPlay.filter((p) => p !== vaultPalace)
    .sort((a, b) => (Math.abs(dist(a.center, C) - RING_R) - Math.abs(dist(b.center, C) - RING_R)) || byId(a, b))) {
    if (sinKeeps.length >= 4) break;
    if (picked.every((q) => dist(q.center, cand.center) >= SEP)) { sinKeeps.push(cand); picked.push(cand); }
  }
  const SIN_NAMES = ["The House of Mirrors", "The House of Silk", "The House of Hunger", "The House of Coin"];
  const SIN_REFS = [
    "sin-palace compound of PRIDE on the palace ring — every wall a mirror, every mirror a lie",
    "sin-palace compound of SLOTH-IN-SILK above the south boulevards — the couches never empty, the lamps never out",
    "sin-palace compound of GLUTTONY by the north flows — its ovens draw straight from the magma",
    "sin-palace compound of GREED at the north-west spoke — its vault doors outnumber its windows",
  ];

  // ---- RIM WALLS + obsidian reefs (the vent chamber is carved, not open) ---------------------------
  const rimN = natural([[1, 1.3], [16, 1.1], [32, 1.5], [48, 1.2], [62.3, 1.4]], 0.3, 14, "UW3|rim|N");
  const rimS = natural([[1, 62.8], [16, 62.6], [32, 63], [48, 62.6], [62.3, 62.8]], 0.3, 14, "UW3|rim|S");
  const rimE = natural([[62.1, 1.3], [61.9, 16], [62.3, 32], [62, 48], [62.1, 62.8]], 0.3, 14, "UW3|rim|E");
  const rimW1 = natural([[1.2, 1.3], [1, 12], [1.3, 22], [1.2, 28.5]], 0.25, 10, "UW3|rim|W1", 8);
  const rimW2 = natural([[1.2, 35.5], [1, 44], [1.3, 54], [1.2, 62.8]], 0.25, 10, "UW3|rim|W2", 8);
  const reefNE = natural([[52, 7], [55.5, 10.5], [58, 14]], 0.25, 6, "UW3|reef|NE", 8);
  const reefSE = natural([[53, 51], [56.5, 54.5], [59, 58]], 0.25, 6, "UW3|reef|SE", 8);
  const reefSW = natural([[5, 53], [8.5, 56.5], [12, 59]], 0.25, 6, "UW3|reef|SW", 8);
  const reefNW = natural([[5, 6], [8, 9], [11, 12]], 0.25, 6, "UW3|reef|NW", 8);
  const RIDGES = [rimN, rimS, rimE, rimW1, rimW2, reefNE, reefSE, reefSW, reefNW];
  const RIDGE_GAPS = [WGATE, [32, 5], [58, 32], [32, 60], [15, 15], [48, 48]];

  // ---- THE MAGMA THRONE + the radiating flows (rivers[], all magma) --------------------------------
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
  const throne = pool(C[0], C[1], 2.2, "UW3|throne");               // + width 5 ⇒ a ~4.7-radius lava disc
  const flowN = natural([[31.6, 27.6], [30.2, 20], [29, 12], [28.2, 4]], 0.6, 12, "UW3|flow|N", 8);
  const flowE = natural([[36, 33.5], [44, 36.5], [52, 40], [59.5, 43.5]], 0.6, 12, "UW3|flow|E", 8);
  const flowS = natural([[30.8, 36.4], [28.8, 44], [26.4, 52], [24.4, 60]], 0.6, 12, "UW3|flow|S", 8);
  const flowW = natural([[27.4, 30.2], [20, 27.2], [12, 24.4], [4, 21.6]], 0.6, 12, "UW3|flow|W", 8);
  const veinSE = natural([[47, 55], [52, 58], [57, 60.5]], 0.25, 6, "UW3|vein|SE", 8);
  const RIVERS = [throne, flowN, flowE, flowS, flowW, veinSE];

  // ---- THE RING OF SIGHS + the Penitents' Way (the pleasure-palace ring + the arrival avenue) ------
  const ringCtrl = [];
  const ringW = rng32(fnv1a("UW3|ring"));
  for (let a = 0; a <= 28; a++) {
    const t = (a / 28) * Math.PI * 2, rr = RING_R * (a === 28 ? 1 : 0.985 + ringW() * 0.03);
    ringCtrl.push([+(C[0] + Math.cos(t) * rr).toFixed(2), +(C[1] + Math.sin(t) * rr).toFixed(2)]);
  }
  ringCtrl[0] = ringCtrl[ringCtrl.length - 1].slice();              // closed loop, seam-free
  const roadRing = round2(spline(ringCtrl, 6));
  const roadPenitents = natural([[1.2, 32], [6, 32.3], [11.5, 31.8], [19.15, 32.02]], 0.25, 10, "UW3|road|penitents", 8);
  const HIGHWAYS = [roadRing, roadPenitents];
  // spoke boulevards: ring → each sin-palace compound (+ the Vault-Palace's own approach spoke)
  const ringPtToward = (target) => {
    const dx = target[0] - C[0], dy = target[1] - C[1], L = Math.hypot(dx, dy) || 1;
    return [+(C[0] + (dx / L) * RING_R).toFixed(2), +(C[1] + (dy / L) * RING_R).toFixed(2)];
  };
  const BLVD_NAMES = ["The Boulevard of Mirrors", "The Boulevard of Silk", "The Boulevard of Hunger", "The Boulevard of Coin"];
  const spokes = sinKeeps.map((k, i) => {
    const a = ringPtToward(k.center), b = k.center.slice();
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    return { id: `UW3-SP${i + 1}`, name: BLVD_NAMES[i], pts: natural([a, [mx + (i % 2 ? 0.9 : -0.9), my + (i % 2 ? -0.7 : 0.7)], b], 0.3, 10, `UW3|spoke|${i}`, 8) };
  });
  const vpSpoke = { id: "UW3-SP0", name: "The Vaultward Boulevard",
    pts: natural([ringPtToward(vaultPalace.center), vaultPalace.center.slice()], 0.25, 8, "UW3|spoke|vp", 8) };
  // the garden precinct: the Twilight Walk (arc between throne and ring, N-NW) + the Lovers' Stair
  const arc = [];
  for (let a = 0; a <= 8; a++) {
    const t = (-150 + (a / 8) * 80) * (Math.PI / 180);              // −150° → −70° (N-NW of the throne)
    arc.push([+(C[0] + Math.cos(t) * 8.75).toFixed(2), +(C[1] + Math.sin(t) * 8.75).toFixed(2)]);
  }
  const twilightWalk = round2(spline(arc, 6));
  const GARDEN_AT = [+(C[0] + Math.cos(-110 * Math.PI / 180) * 8.75).toFixed(2), +(C[1] + Math.sin(-110 * Math.PI / 180) * 8.75).toFixed(2)];
  const loversStair = natural([GARDEN_AT, [+(C[0] + Math.cos(-110 * Math.PI / 180) * RING_R).toFixed(2), +(C[1] + Math.sin(-110 * Math.PI / 180) * RING_R).toFixed(2)]], 0.15, 5, "UW3|garden|stair", 8);
  const urban = [
    { id: "UW3-GW1", name: "The Twilight Walk", tier: "local", pts: twilightWalk },
    { id: "UW3-GW2", name: "The Lovers' Stair", tier: "local", pts: loversStair },
  ];

  // ---- castles (the SCALED ladder — see the header) -------------------------------------------------
  const CASTLES = [
    { id: "UW3-CASTLE-VAULTPALACE", kind: "CASTLE", at: VP_AT.slice(), townEstateId: vaultPalace.parcelId,
      name: "The Vault-Palace of Luxuria", ref: "the Throne precinct's palace behind/above the Magma Throne (seen from the Penitents' Way) — the Inferno Champion's seat and the FINAL VAULT's warding castle; UW3's top fortification rides the best LARGE (no GIANT/EPIC exists in the vault — the §3c ladder scaled, the isles precedent)" },
    ...sinKeeps.map((k, i) => ({ id: `UW3-KEEP-${["MIRRORS", "SILK", "HUNGER", "COIN"][i]}`, kind: "KEEP", at: castleAt(k), townEstateId: k.parcelId,
      name: SIN_NAMES[i], ref: SIN_REFS[i] })),
  ];

  // ---- tiny hamlet web (a vault has almost no countryside — the KOL scaled-down precedent) ---------
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const s of [...spokes, vpSpoke]) netIdx.addPolyline(s.pts);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const CITIES = [{ c: C, r: 6 }, { c: vaultPalace.center, r: 3.5 }, ...sinKeeps.map((k) => ({ c: k.center, r: 3.5 }))];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "UW3|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(5, L * 0.35);
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 0.7, 18);
    if (crossings(poly, RIDGES) > 0) {
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.6, 18);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
    }
    if (crossings(poly, RIVERS) > 1) {                              // ember-bridge budget: ≤1 magma crossing
      const flat = build([a, b], 0.3, 14);
      if (crossings(flat, RIVERS) <= crossings(poly, RIVERS)) poly = flat;
    }
    return poly;
  }
  const secondaries = [...spokes, vpSpoke];
  let secN = 0;
  const addSecondary = (pts, name) => {
    secN++; secondaries.push({ id: `UW3-SEC${String(secN).padStart(2, "0")}`, name, pts });
    netIdx.addPolyline(pts);
  };
  const townName = (t) => `Compound ${t.id}`;
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
    addSecondary(poly, `${townName(t)} – ${townName(nb)} Way`);
    union(t.id, nb.id);
    for (const id of [t.id, nb.id]) { if (!pairPolys.has(id)) pairPolys.set(id, []); pairPolys.get(id).push(poly); }
  }
  const connIdx = makeIndex();
  for (const h of HIGHWAYS) connIdx.addPolyline(h);
  for (const s of [...spokes, vpSpoke]) connIdx.addPolyline(s.pts);
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
        const spur = natural([best.at, bpt], 0.2, 8, `UW3|road|spur|${best.id}`, 8);
        addSecondary(spur, `${townName(best)} Spur`);
        connIdx.addPolyline(spur);
      } else {
        addSecondary(poly, `${townName(best)} Link`);
        connIdx.addPolyline(poly);
      }
    }
    for (const t of members) for (const p of pairPolys.get(t.id) || []) connIdx.addPolyline(p);
  }

  // ---- local lanes: ~12 seeded MEDIUM compounds → nearest network point ----------------------------
  const locals = [];
  const pickR = rng32(fnv1a("UW3|locals|pick"));
  const shuffled = mediums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 12) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.0 || d > 14) continue;
    const r = rng32(fnv1a("UW3|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(2.5, L * 0.4);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.35, 7, "UW3|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 1.6) > 0.75) continue;
    locN++;
    locals.push({ id: `UW3-LOC${String(locN).padStart(2, "0")}`, name: `Compound ${m.id} Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- castle approaches: every castle sits ≤1u from the road network -------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.2, 6, "UW3|road|approach|" + c.id, 8);
    approaches.push({ id: `UW3-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- output ---------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "UW3 (Luxuria) macro feature network — the continuous-terrain field, infernal baroque vent chamber",
      author: "CF ParcelMap Design Agent (Agent D build), 2026-07-11 (regenerate with map-service/tools/world_terrain_uw3.mjs)",
      coords: "UW3 zone svg viewBox (0 0 63.29 64.04); y down. Same space as data/hexagon-city-source/l3/UW3.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords. SEALED VAULT (the bottom of the world): no coast, no sky, no horizontal neighbour — all four edges are rock/magma wall (atlas §2.10 mapVoid); the zone's ONLY door is the Vault Gate boss-POI (W wall, up to UW2). A dead-end vault by design.",
      grounding: "The world's smallest zone by far (92 L2 + 4,825 L3 over 63×64 — less than a fifth the linear size of any other zone): ONE grand volcanic vent chamber, not a continent. 52 SMALL + 30 MEDIUM + 10 LARGE — NO GIANT/EPIC (the fortification ladder is SCALED — see castles). The Magma Throne caldera sits at the exact zone center (" + C.map((n) => n.toFixed(2)) + "); the Vault-Palace LARGE " + vaultPalace.parcelId + " at (" + vaultPalace.center.map((n) => n.toFixed(1)) + ") holds the throne precinct behind it.",
      determinism: "generated by map-service/tools/world_terrain_uw3.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale (1 parcel ≈ 0.65 u across); world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors).",
      vault: "CAVERN ZONE: ridges[] are the vent chamber's walls — four RIM WALLS seal the vault edges (rock on every edge parcel; the only ridge break is the Vault Gate doorway, W wall) + four corner OBSIDIAN REEFS. Unlike Blackmere there are no interior curtains: the vault is ONE grand chamber around the throne (atlas §2.10 volcanicCaldera).",
      magma: "rivers[] are ALL MAGMA here (`magma: true` on every entry — additive flag, ignored by worldfield v1; palette = the registry VOLCANIC family, whose battle-map WATER cells already render as lava): the MAGMA THRONE (the central caldera lava disc — the final boss's seat, the deepest point of the world) + four MAGMA FLOWS radiating N/E/S/W between the boulevards + the SE fissure vein. The Ring of Sighs crosses the four flows on ember bridges (road-over-magma = the crossing chokepoints when real-water/hazard phase lands, CONTINUOUS-WORLD-TERRAIN §4b).",
      gameplay: "units can walk over water/magma for now (owner 2026-07-10, phase 1) — flows are terrain/visual continuity, not hard blockers; hazard crossings come with the real-water phase.",
      era: "Luxuria = INFERNAL BAROQUE DECADENCE (owner-locked §3b: Pompeii pleasure-city + vent chamber) — the pleasure-palace RING around the magma throne (the Ring of Sighs), SPOKE boulevards to the sin-palace compounds, the Gardens of Enamora twilight precinct between throne and ring, the Penitents' Way from the Vault Gate. Countryside is nearly nil (the KOL scaled-way-down precedent): a tiny compound web + ~12 MEDIUM feeders.",
      hierarchy: "roads carry tier: highway (the RING OF SIGHS — the closed palace ring around the throne — and the PENITENTS' WAY, the Vault Gate arrival avenue) / secondary (the 5 spoke boulevards ring→compounds + the compound web links) / local (the Twilight Walk + the Lovers' Stair garden lanes, ~12 seeded MEDIUM feeders, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c with the ladder SCALED to what exists (NO GIANT/EPIC in the vault — the isles precedent): the TOP fortification rides the best playable LARGE as CASTLE the Vault-Palace of Luxuria (" + vaultPalace.parcelId + ", the playable LARGE nearest the throne — the Inferno Champion's warding castle at the FINAL VAULT); the four SIN-PALACE compounds are KEEPs on the remaining playable LARGEs nearest the palace ring (" + sinKeeps.map((p) => p.parcelId).join("/") + "). No PALACE kind is emitted (no EPIC exists to carry it). All five castle estates are L3-subdivided — every UW3 castle is fully designated (LARGE 3 heroParcels each); castles grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META,
      continuity: "NO horizontal neighbours (sealed vault; the bottom of the world). The ONLY link is UP: the Vault Gate (W wall POI, connects UW2↔UW3 — the descent's last boss-gate; its far side is UW2-GATE-UW3 on Blackmere's east wall). The FINAL VAULT itself is the THIRD lock of the Binding (warden: the Inferno Champion) — a boss STAGE, not a travel gate; there is nothing below. The Diminishing Stair goes no deeper than Blackmere.",
      creatures: "THE final boss: the Inferno Champion holds the Final Vault (atlas §2.10 — a Fire elemental-champion tier boss). Highest Fire-pet affinity in the world; the pet layer reads data/zone-pet-population.json. EF Hunt: the main story FINISHES here and the end-game revisit returns to the UW3-VAULT-STAGE POI (docs/briefs/EF-HUNT-MAP-HANDOFF.md).",
    },
    zone: "UW3",
    rivers: [
      { id: "UW3-THRONE", name: "The Magma Throne", width: 5.0, magma: true, pts: throne },
      { id: "UW3-FL-N", name: "The North Flow", width: 1.4, magma: true, joins: "UW3-THRONE", pts: flowN },
      { id: "UW3-FL-E", name: "The East Flow", width: 1.4, magma: true, joins: "UW3-THRONE", pts: flowE },
      { id: "UW3-FL-S", name: "The South Flow", width: 1.4, magma: true, joins: "UW3-THRONE", pts: flowS },
      { id: "UW3-FL-W", name: "The West Flow", width: 1.4, magma: true, joins: "UW3-THRONE", pts: flowW },
      { id: "UW3-VN-SE", name: "The Whisper Vein", width: 0.6, magma: true, pts: veinSE },
    ],
    roads: [
      { id: "UW3-RD1", name: "The Ring of Sighs", tier: "highway", width: 0.45, pts: roadRing },
      { id: "UW3-RD2", name: "The Penitents' Way", tier: "highway", width: 0.45, pts: roadPenitents },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: u.tier, width: 0.2, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.3, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.2, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.2, pts: a.pts })),
    ],
    ridges: [
      { id: "UW3-RG-RIM-N", name: "The Vault Wall (North)", width: 1.8, pts: rimN },
      { id: "UW3-RG-RIM-S", name: "The Vault Wall (South)", width: 1.8, pts: rimS },
      { id: "UW3-RG-RIM-E", name: "The Vault Wall (East)", width: 1.8, pts: rimE },
      { id: "UW3-RG-RIM-W1", name: "The Vault Wall (West, north reach)", width: 1.8, pts: rimW1 },
      { id: "UW3-RG-RIM-W2", name: "The Vault Wall (West, south reach)", width: 1.8, pts: rimW2 },
      { id: "UW3-RG-REEF-NE", name: "The Gilded Reef", width: 1.1, pts: reefNE },
      { id: "UW3-RG-REEF-SE", name: "The Whisper Reef", width: 1.1, pts: reefSE },
      { id: "UW3-RG-REEF-SW", name: "The Velvet Reef", width: 1.1, pts: reefSW },
      { id: "UW3-RG-REEF-NW", name: "The Mourning Reef", width: 1.1, pts: reefNW },
    ],
    castles: CASTLES,
    pois: [
      // SINGULAR PLACES (depth-layer 2, data/singulars.json on the hub): gardens_enamora.
      { id: "UW3-THRONE-POI", kind: "LANDMARK", at: [+C[0].toFixed(2), +C[1].toFixed(2)], name: "The Magma Throne",
        note: "the central caldera lava lake — the final boss's seat and the deepest point of the world (atlas §2.10); the Ring of Sighs circles it, the four Flows radiate from it" },
      { id: "UW3-GARDENS", kind: "LANDMARK", at: [+GARDEN_AT[0], +GARDEN_AT[1]], singularId: "gardens_enamora", name: "The Gardens of Enamora",
        legend: "Perpetual twilight; everything blooms, nothing bears fruit.",
        note: "the twilight garden precinct between the Magma Throne and the palace ring (the Twilight Walk arc, N-NW of the throne; the Lovers' Stair climbs to the Ring of Sighs) — Luxuria's heart" },
      { id: "UW3-VAULT-STAGE", kind: "BOSS_STAGE", at: VP_AT.slice(), name: "The Final Vault of Luxuria",
        note: "the THIRD lock of the Binding (WORLD-CHRONICLE) — warden: THE INFERNO CHAMPION. The explicit FINAL-BOSS STAGE: the Throne precinct at the vault, behind/above the throne as seen from the Penitents' Way, inside the Vault-Palace estate " + vaultPalace.parcelId + " — the stage parcel is the castle's heroParcels[0] (playable L3 today). EF Hunt: the main story finishes here; the end-game revisit returns to this stage" },
      { id: "UW3-GATE-UW2", kind: "GATE", at: WGATE.slice(), connects: ["UW2", "UW3"], boss: true, name: "The Vault Gate",
        note: "the descent's LAST boss-gate — up to Blackmere (UW2; far side = UW2-GATE-UW3 across the Ferry Dark). The only way in or out of the Inferno Vault; armies come this way (the Shaft chain). The Penitents' Way runs from this door to the Ring of Sighs" },
    ],
  };
  // heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
  const heroStats = attachHeroParcels(out, uw3, l3.singles);
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
writeFileSync(path.join(ROOT, "data/world-terrain/UW3.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/UW3.json sha256", h1.slice(0, 16),
  "| compounds", b1.stats.towns,
  "| garden lanes", b1.stats.urban,
  "| secondary boulevards", b1.stats.secondaries,
  "| locals", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
