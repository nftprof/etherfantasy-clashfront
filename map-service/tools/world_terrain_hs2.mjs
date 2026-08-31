#!/usr/bin/env node
// world_terrain_hs2.mjs — REPRODUCIBLE generator for data/world-terrain/HS2.json (Emberfall).
//
// Emberfall = HS2, THE EMBER-CRYSTAL EMPIRE (owner-locked 2026-08-31, docs/maps/SKY-ZONES-DESIGN.md
// — SUPERSEDES the atlas §2.6 "floating volcano / caldera" reading): the fallen angels' militarized
// war capital, a high-tech IMPERIAL city POWERED BY EMBER-RED FIRE CRYSTALS. **NOT volcanic** — no
// magma, no lava, no ash cones ("we got enough of that in the underworld; a volcano in the air makes
// no sense"). The fire is in the GEMS: crystal fields, gem-fed reactors and forges run the war
// machine besieging Empyrea (HS3). "Red gems and dark scene walls, dark green military color."
// biomeFamily EMBER_CRYSTAL is already wired (palette `ember` renders ROCK as red crystal — every
// ROCK-heavy feature here becomes a crystal field automatically). Massing kept from
// CONTINUOUS-WORLD-TERRAIN §3b (the only part NOT superseded): **HIGH tiered fortress
// (Mont Saint-Michel / Minas Tirith)** — concentric tier rings climbing, ONE switchback gate-road,
// ringwall per tier, the keep crowns the top.
//
// OWNER ADDENDUM (2026-08-31, relayed mid-build — both applied):
//   • Sky isles have "probably no river": water MINIMAL — exactly ONE small dark reservoir
//     (fill: true, radius ~1.8 u — nothing that could grade deep/sailable; no navigable sky water).
//   • Sky-city battle maps read as THREE STACKED LAND LAYERS (5th-Element vertical city → 3
//     walkable decks): the tier rings are EXACTLY THREE strong, clearly banded concentric tiers —
//     LOWER WORKS / MID CITY / CROWN — so parcel maps windowed from the field inherit a 3-level
//     terraced read. No new data shapes: pure ridge structure.
//
// THE SKY ISLE (all four edges = sky-void rim — no coast, no land neighbour; atlas §2.6 "entire
// perimeter = mapVoid"):
//   • RIM WALLS: four `ridges[]` rim cliffs just inside the viewBox edges. ONE authored break: the
//     WEST rim gate (the Ember Gate, poi HS2-GATE-AEROPOLIS — the airship way back to HS1, the
//     isle's ONLY friendly door; zoneLinks HS1→HS2 branch). The EAST and SOUTH rims are unbroken.
//   • THE NORTH RIM = THE WAR FRONT facing Empyrea (HS3) — warFront, NO friendly gate
//     (zone-registry skyWar: the two isles are AT WAR, the link is severed). Fortified: the rim is
//     backed by THE BULWARK (a second authored ridge line, one gap for the War Road) with two
//     war-camp pois behind it and the forward trench poi HS2-WARFRONT between Bulwark and rim.
//   • THE THREE TIERS: exactly three concentric ring ridges (tierwalls) climbing to the crown —
//     Tier I r 26 (THE LOWER WORKS), Tier II r 17 (THE MID CITY), Tier III r 9 (THE CROWN) — each
//     with ONE gap, the gaps rotated 90° apart (W / S / E) so THE GRAND ASCENT (the single
//     switchback gate-road) spirals from the Ember Gate through every tierwall to the summit
//     war-palace. Military ring avenues (the Muster Ring outside + one parade per annulus + the
//     Crown Court) and straight radial cross-streets grid the tiers — an empire, not an organic town.
//   • CRYSTAL FIELDS: four belts of jagged ROCK spur clusters OUTSIDE the city (the ember palette
//     renders them as ember-red crystal): the Emberglass Reach (NE), the Shard Tiers (SE), the
//     Cindersea (SW), the Redvein Scarps (W) — each with a crystal-mine poi (the empire's power
//     source). NO magma rivers, NO `magma: true` flags anywhere on this isle.
//   • WATER: the ONE small reservoir — THE FORGE BASIN (fill: true, r ~1.8), the dark coolant pool
//     of the Crystal Forges in the gridded Forge Ward east of the fortress. Ordinary water, never lava.
//
// DETERMINISTIC PICK RULES (all over data/hexagon-city-source/parcels-l2.json, zone==="HS2";
// ties broken by parcelId ascending; SEP = 15 zone-units between fortification picks;
// "playable" = the estate has L3 subdivision — the UW2/HUB/BUS/ENT precedent, so every castle POI
// lands on a PLAYABLE parcel today). HS2 ships 0 EPIC + 0 GIANT (16 LARGE / 49 MEDIUM / 386
// SMALL), so the §3c ladder ADAPTS: the biggest class present (LARGE) takes the top role — the
// IMPERIAL WAR-PALACE is a field-declared kind "PALACE" on the best playable LARGE at the fortress
// crown; KEEPs ring the tiers on further playable LARGEs:
//   CROWN      = the playable LARGE nearest the zone center (59.0, 58.24).      → expected 3050435
//   WESTGATE   = the playable LARGE nearest the Ember Gate (2, 54).             → expected 3050441
//   BULWARK    = the playable LARGE nearest the war-front staging (60, 10).     → expected 3050448
//   PARADEWATCH= the playable LARGE nearest the south approach (57, 80).        → expected 3050439
//   SHARDWATCH = the playable LARGE nearest the Shard Tiers (96, 89).           → expected 3050436
//   CINDERHOLM = the playable LARGE nearest the Cindersea (33, 93).             → expected 3050438
//   SEAMWATCH  = the playable LARGE nearest the Redvein/forward seams (25, 26). → expected 3050449
//   (each pick = first candidate ≥SEP from every previous pick, UW2's pickNearest)
//   CASTLE POI POINT = the estate's L3 child center nearest the estate center (ties by parcelId) —
//   the estate's bbox center can fall in a coverage gap, and the world-layer invariant is that a
//   castle POI sits ON its castle parcel (the UW2 castleAt rule, verbatim).
//   The whole tier geometry (rings, parades, the Grand Ascent, the War Road) is centred on the
//   CROWN castle point, so the palace crowns the top by construction. A sanity guard throws if the
//   computed crown leaves the authored window (the isle's data would have changed).
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d, shared
// rule in world_hero_parcels.mjs, identical across all world_terrain_*.mjs tools): castle parcel
// FIRST, LARGE 3 (no GIANT/EPIC quotas apply on this isle — every castle estate is LARGE).
// attachHeroParcels also stamps estateMapId on the PALACE (pre-designed estate map key, canon 4/5).
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_hs2.mjs
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

// ---- Catmull-Rom spline + seeded meander (verbatim: the EDU/HUB/BUS/ENT/UW2 tools) --------------
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
// a PLANNED straight lane (military cross-streets, camp lanes, the Forge Ward grid) — no meander
function straight(ctrl, step = 0.6) {
  const out = [ctrl[0].slice()];
  for (let i = 1; i < ctrl.length; i++) {
    const [ax, ay] = ctrl[i - 1], [bx, by] = ctrl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return round2(out);
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
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

// grid index over network VERTICES (verbatim: the HUB/BUS/ENT/UW2 tools)
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
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/HS2.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));  // estates with playable L3 parcels
  const hs2 = l2.parcels.filter((p) => p.zone === "HS2");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const larges = hs2.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = larges.map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const mediums = hs2.filter((p) => p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- deterministic picks (rules in the header) ---------------------------------------------------
  const C = [118.018 / 2, 116.471 / 2];                             // the zone center (59.0, 58.24)
  const WGATE = [2, 54];                                            // the Ember Gate (W rim break → HS1)
  const SEP = 15;
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const picked = [];
  const pickNearest = (pool, pt) => {
    for (const cand of pool.slice().sort((a, b) => (dist(a.center, pt) - dist(b.center, pt)) || byId(a, b)))
      if (!picked.includes(cand) && picked.every((q) => dist(q.center, cand.center) >= SEP)) { picked.push(cand); return cand; }
    return null;
  };
  const crown = pickNearest(largesPlay, C);                         // the war-palace estate
  const kWestgate = pickNearest(largesPlay, WGATE);
  const kBulwark = pickNearest(largesPlay, [60, 10]);
  const kParade = pickNearest(largesPlay, [57, 80]);
  const kShard = pickNearest(largesPlay, [96, 89]);
  const kCinder = pickNearest(largesPlay, [33, 93]);
  const kSeam = pickNearest(largesPlay, [25, 26]);
  // castle POI point = the estate's L3 child center nearest the estate center (UW2 rule, verbatim)
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
  const CR = castleAt(crown);                                       // the fortress crown — the tier geometry's centre
  if (CR[0] < 45 || CR[0] > 75 || CR[1] < 38 || CR[1] > 68)
    throw new Error(`HS2 crown pick left the authored window: ${crown.parcelId} @ ${CR} — the isle's estate data changed; re-author the tier geometry`);
  const P = (aDeg, r) => [+(CR[0] + Math.cos((aDeg * Math.PI) / 180) * r).toFixed(2), +(CR[1] + Math.sin((aDeg * Math.PI) / 180) * r).toFixed(2)];

  // ---- RIM WALLS (sky-void — every edge is the edge of the sky) ------------------------------------
  const rimN = natural([[1.5, 2], [30, 1.8], [60, 2.2], [90, 1.9], [116.5, 2]], 0.5, 26, "HS2|rim|N");
  const rimS = natural([[1.5, 114.5], [30, 114.3], [60, 114.6], [90, 114.2], [116.5, 114.5]], 0.5, 26, "HS2|rim|S");
  const rimW1 = natural([[2, 2], [1.8, 18], [2.2, 34], [1.9, 49]], 0.4, 22, "HS2|rim|W1");
  const rimW2 = natural([[2.1, 59], [1.8, 76], [2.2, 96], [2, 114.5]], 0.4, 22, "HS2|rim|W2");
  const rimE = natural([[116, 2], [115.7, 24], [116.2, 48], [115.8, 72], [116.1, 94], [116, 114.5]], 0.4, 26, "HS2|rim|E");
  // THE BULWARK — the fortified second line behind the war-front rim; one gap for the War Road (x≈60)
  const bulwarkW = natural([[18, 7.2], [31, 6.9], [44, 6.7], [56.5, 6.6]], 0.4, 18, "HS2|bulwark|W", 8);
  const bulwarkE = natural([[63.5, 6.6], [76, 6.8], [89, 7], [100, 7.2]], 0.4, 18, "HS2|bulwark|E", 8);

  // ---- THE THREE TIERWALLS (owner addendum: EXACTLY THREE banded tiers — lower works / mid city /
  // crown; one gap each, rotated W → S → E so the single Grand Ascent switchbacks through) ----------
  const ringArc = (r, gapDeg, gapHalf, key, amp = 0.3) => {
    const ctrl = [];
    for (let a = gapDeg + gapHalf; a <= gapDeg + 360 - gapHalf + 1e-9; a += 15) ctrl.push(P(a, r));
    ctrl.push(P(gapDeg + 360 - gapHalf, r));
    return natural(ctrl, amp, 20, key, 6);
  };
  const tier1 = ringArc(26, 180, 7, "HS2|tier|1");                  // THE LOWER WORKS — gap W (the Ascent enters)
  const tier2 = ringArc(17, 90, 10, "HS2|tier|2");                  // THE MID CITY — gap S
  const tier3 = ringArc(9, 0, 14, "HS2|tier|3");                    // THE CROWN — gap E

  // ---- CRYSTAL FIELDS (jagged ROCK spur clusters — the ember palette renders them red crystal) -----
  const spurs = (cx0, cy0, n, spreadX, spreadY, key) => {
    const r = rng32(fnv1a(key));
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = cx0 + (r() - 0.5) * 2 * spreadX, y = cy0 + (r() - 0.5) * 2 * spreadY;
      const a = r() * Math.PI * 2, L = 2.2 + r() * 2.4;
      const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
      out.push(natural([[x - dx, y - dy], [x + (r() - 0.5) * 1.2, y + (r() - 0.5) * 1.2], [x + dx, y + dy]], 0.35, 5, `${key}|${i}`, 8));
    }
    return out;
  };
  const F_EMBERGLASS = [92, 29], F_SHARD = [96, 89], F_CINDER = [33, 93], F_REDVEIN = [20, 70];
  const spEmberglass = spurs(F_EMBERGLASS[0], F_EMBERGLASS[1], 5, 9, 8, "HS2|spur|emberglass");
  const spShard = spurs(F_SHARD[0], F_SHARD[1], 4, 8, 8, "HS2|spur|shard");
  const spCinder = spurs(F_CINDER[0], F_CINDER[1], 4, 8, 7, "HS2|spur|cinder");
  const spRedvein = spurs(F_REDVEIN[0], F_REDVEIN[1], 4, 6, 8, "HS2|spur|redvein");
  const SPURS = [...spEmberglass, ...spShard, ...spCinder, ...spRedvein];
  const RIDGES = [rimN, rimS, rimW1, rimW2, rimE, bulwarkW, bulwarkE, tier1, tier2, tier3, ...SPURS];
  const RIDGE_GAPS = [WGATE, P(180, 26), P(90, 17), P(0, 9), [60, 6.8]];

  // ---- WATER — the ONE small reservoir (owner addendum: sky isles have no rivers) ------------------
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
  const FORGE_BASIN = [92, 57];
  const lakeForge = pool(FORGE_BASIN[0], FORGE_BASIN[1], 1.8, "HS2|lake|forge");
  const RIVERS = [lakeForge];

  // ---- THE GRAND ASCENT + THE WAR ROAD (highways) --------------------------------------------------
  // RD1 the Grand Ascent: the Ember Gate → the west gatehouse → tierwall I gap (W) → switchback
  // through the Lower Works → tierwall II gap (S) → through the Mid City → tierwall III gap (E) →
  // the war-palace at the crown. The ONE road through every tierwall.
  const roadAscent = natural(
    [WGATE, [7, 53.7], [13, 53.4], [20, 52.8], [27, 52], [31.5, 51.3], P(180, 26),
     P(168, 23.5), P(150, 22), P(128, 20.5), P(108, 18.8), P(90, 17),
     P(72, 14.5), P(50, 12.5), P(28, 10.5), P(12, 9.5), P(0, 9),
     P(352, 6.2), [+(CR[0] + 3).toFixed(2), +(CR[1] - 0.8).toFixed(2)], CR.slice()],
    0.35, 30, "HS2|road|ascent");
  // RD2 the War Road: the Muster Ring's north point → the Arsenal Yards → the Bulwark gap → the
  // forward staging on the Sky-Throne Front. Never a gate — the front has no friendly door.
  const roadWar = natural(
    [P(270, 28.5), [+(CR[0] - 0.6).toFixed(2), +(CR[1] - 33).toFixed(2)], [60.8, 16], [60.3, 11.5], [60, 6.8], [59.6, 4.4]],
    0.35, 24, "HS2|road|war", 8);
  const HIGHWAYS = [roadAscent, roadWar];

  // ---- military ring avenues (authored secondaries — the empire's regular geometry) ----------------
  const ringRoad = (r, key) => {
    const ctrl = [];
    for (let a = 0; a <= 360 + 1e-9; a += 15) ctrl.push(P(a, r));
    return natural(ctrl, 0.2, 18, key, 6);
  };
  const roadMuster = ringRoad(28.5, "HS2|road|muster");             // outside tierwall I
  const roadParade1 = ringRoad(21.5, "HS2|road|parade1");           // the Lower Works annulus
  const roadParade2 = ringRoad(13, "HS2|road|parade2");             // the Mid City annulus
  const roadCourt = ringRoad(5.5, "HS2|road|court");                // the Crown court
  // the Forge Road: the Muster Ring's east point → the Forge Ward grid + the Crystal Forges
  const roadForge = natural([P(0, 28.5), [88.6, 52.8], [92, 53.4]], 0.3, 14, "HS2|road|forge", 8);
  const SECONDARIES_AUTHORED = [
    { id: "HS2-RD3", name: "The Muster Ring", pts: roadMuster },
    { id: "HS2-RD4", name: "The First Parade (Lower Works)", pts: roadParade1 },
    { id: "HS2-RD5", name: "The Second Parade (Mid City)", pts: roadParade2 },
    { id: "HS2-RD6", name: "The Crown Court", pts: roadCourt },
    { id: "HS2-RD7", name: "The Forge Road", pts: roadForge },
  ];

  // ---- military grid lanes (locals: radial cross-streets + the Forge Ward grid + camp lanes) -------
  const urban = [];
  let laneN = 0;
  const addLane = (name, pts, idOverride) => { laneN++; urban.push({ id: idOverride || `HS2-ML${String(laneN).padStart(2, "0")}`, name, pts }); };
  for (let k = 0; k < 8; k++) {                                     // Lower Works cross-streets (every 45°, off the gaps)
    const a = 22.5 + k * 45;
    addLane(`Works Cross-Street ${k + 1}`, straight([P(a, 18.7), P(a, 24.3)], 0.5));
  }
  for (let k = 0; k < 6; k++) {                                     // Mid City cross-streets (every 60°, off the gaps)
    const a = 15 + k * 60;
    addLane(`City Cross-Street ${k + 1}`, straight([P(a, 10.7), P(a, 15.3)], 0.5));
  }
  // the Forge Ward — the gridded industrial quarter around the Forge Basin (military grid, verbatim straight)
  addLane("Forge Ward, First Street", straight([[88.5, 52], [88.5, 60.5]], 0.5));
  addLane("Forge Ward, Second Street", straight([[95.5, 52], [95.5, 60.5]], 0.5));
  addLane("Forge Ward, North Row", straight([[87, 53.5], [97, 53.5]], 0.5));
  addLane("Forge Ward, South Row", straight([[87, 60.5], [97, 60.5]], 0.5));
  // war-camp lanes off the War Road staging
  addLane("Westmuster Camp Lane", straight([[60.3, 11.5], [44, 10.5]], 0.5));
  addLane("Eastmuster Camp Lane", straight([[60.3, 11.5], [77, 10.5]], 0.5));

  // ---- castles (§3c ladder ADAPTED — 0 EPIC/GIANT ⇒ LARGE takes the top role; header pick rules) ---
  const CASTLES = [
    { id: "HS2-PALACE-EMBERTHRONE", kind: "PALACE", at: CR.slice(), townEstateId: crown.parcelId,
      name: "The Ember Throne", ref: "the imperial war-palace crowning the third tier — the fallen angels' seat, its halls lit by gem-fed reactors (SKY-ZONES-DESIGN: the Ember-Crystal Empire's capital keep; Mont-Saint-Michel massing, the keep crowns the top). HS2 ships no EPIC/GIANT estate, so the biggest class present (LARGE) carries the PALACE — the §3c importance→size rule over the real ladder" },
    { id: "HS2-KEEP-WESTGATE", kind: "KEEP", at: castleAt(kWestgate), townEstateId: kWestgate.parcelId,
      name: "Westgate Bastion", ref: "the gatehouse keep over the Ember Gate approach — every friendly soul that reaches Emberfall passes under its guns (the isle's only door, the airship way back to Aeropolis)" },
    { id: "HS2-KEEP-BULWARK", kind: "KEEP", at: castleAt(kBulwark), townEstateId: kBulwark.parcelId,
      name: "The Bulwark Keep", ref: "the war-front bastion behind the Bulwark line — the muster of the siege of Empyrea; the War Road ends under its walls" },
    { id: "HS2-KEEP-PARADEWATCH", kind: "KEEP", at: castleAt(kParade), townEstateId: kParade.parcelId,
      name: "Paradewatch Keep", ref: "the southern tier bastion on the Muster Ring — watches the south approach to the Lower Works" },
    { id: "HS2-KEEP-SHARDWATCH", kind: "KEEP", at: castleAt(kShard), townEstateId: kShard.parcelId,
      name: "Shardwatch Keep", ref: "the south-east field keep over the Shard Tiers crystal belt — mine-guard of the empire's power source" },
    { id: "HS2-KEEP-CINDERHOLM", kind: "KEEP", at: castleAt(kCinder), townEstateId: kCinder.parcelId,
      name: "Cinderholm Keep", ref: "the south-west field keep over the Cindersea crystal belt" },
    { id: "HS2-KEEP-SEAMWATCH", kind: "KEEP", at: castleAt(kSeam), townEstateId: kSeam.parcelId,
      name: "Seamwatch Keep", ref: "the north-west keep over the Redvein forward seams — the last hold before the war-front rim" },
  ];

  // ---- rural web (garrison steadings — the organic web, MILITARIZED: straighter, lower meander) ----
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const s of SECONDARIES_AUTHORED) netIdx.addPolyline(s.pts);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const CITIES = [
    { c: CR, r: 6 },
    ...[kWestgate, kBulwark, kParade, kShard, kCinder, kSeam].map((k) => ({ c: k.center, r: 3.5 })),
  ];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "HS2|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(6, L * 0.25);               // empire roads: straighter than UW2's
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 0.6, 26);
    if (crossings(poly, RIDGES) > 0) {                              // one reroute attempt via a gap
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.5, 26);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
      // else: accept — a cut stair over a low crystal lip
    }
    if (crossings(poly, RIVERS) > 2) {
      const flat = build([a, b], 0.3, 20);
      if (crossings(flat, RIVERS) <= crossings(poly, RIVERS)) poly = flat;
    }
    return poly;
  }
  const secondaries = SECONDARIES_AUTHORED.slice();
  let secN = 0;
  const addSecondary = (pts, name) => {
    secN++; secondaries.push({ id: `HS2-SEC${String(secN).padStart(3, "0")}`, name, pts });
    netIdx.addPolyline(pts);
  };
  const townName = (t) => `Garrison ${t.id}`;
  // pass 1 — neighbour pair roads with UNION-FIND component tracking (the HUB/BUS/ENT/UW2 pattern)
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
    addSecondary(poly, `${townName(t)} – ${townName(nb)} Road`);
    union(t.id, nb.id);
    for (const id of [t.id, nb.id]) { if (!pairPolys.has(id)) pairPolys.set(id, []); pairPolys.get(id).push(poly); }
  }
  // pass 2 — connect every garrison COMPONENT to the CONNECTED network
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
        const spur = natural([best.at, bpt], 0.3, 10, `HS2|road|spur|${best.id}`, 8);
        addSecondary(spur, `${townName(best)} Spur`);
        connIdx.addPolyline(spur);
      } else {
        addSecondary(poly, `${townName(best)} Link`);
        connIdx.addPolyline(poly);
      }
    }
    for (const t of members) for (const p of pairPolys.get(t.id) || []) connIdx.addPolyline(p);
  }

  // ---- local lanes: ~18 seeded MEDIUM steadings → nearest network point ----------------------------
  const locals = [];
  const pickR = rng32(fnv1a("HS2|locals|pick"));
  const shuffled = mediums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 18) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.2 || d > 22) continue;
    const r = rng32(fnv1a("HS2|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(2.5, L * 0.3);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.4, 9, "HS2|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.75) continue;
    locN++;
    locals.push({ id: `HS2-LOC${String(locN).padStart(2, "0")}`, name: `Steading ${m.id} Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- castle approaches: every castle sits ≤1u from the road network -------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.25, 8, "HS2|road|approach|" + c.id, 8);
    approaches.push({ id: `HS2-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- output ---------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "HS2 (Emberfall) macro feature network — the continuous-terrain field, THE EMBER-CRYSTAL EMPIRE",
      author: "CF ParcelMap Design Agent (satellite HS2 build), 2026-08-31 (regenerate with map-service/tools/world_terrain_hs2.mjs)",
      coords: "HS2 zone svg viewBox (0 0 118.018 116.471); y down. Same space as data/hexagon-city-source/l3/HS2.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords. FLOATING SKY ISLE: no coast, no land neighbour — all four edges are sky-void rim (atlas §2.6 mapVoid); the isle's only friendly door is the WEST rim gate HS2-GATE-AEROPOLIS (airship way back to HS1); the NORTH rim is THE WAR FRONT facing Empyrea (HS3) — warFront, contested, NO gate (zone-registry skyWar: the link is severed).",
      grounding: "The largest sky isle (451 L2 + 13,694 L3 over 118.0 × 116.5) and the only one with ZERO EPIC/GIANT estates (16 LARGE / 49 MEDIUM / 386 SMALL — an unconsolidated isle seized by a military empire). The fortress crown sits on the playable LARGE nearest the zone center — " + crown.parcelId + " at (" + CR.map((n) => n.toFixed(1)) + "); the §3c importance→size ladder ADAPTS: LARGE (the biggest class present) carries the PALACE.",
      identity: "THE EMBER-CRYSTAL EMPIRE (owner-locked 2026-08-31, docs/maps/SKY-ZONES-DESIGN.md — SUPERSEDES the atlas §2.6 floating-volcano/caldera reading): the fallen angels' high-tech war capital POWERED BY EMBER-RED FIRE CRYSTALS — crystal fields, gem-fed reactors and forges, floodlit military districts, dark military green-grey ground, near-black walls, red crystal glow. NOT volcanic: NO magma rivers, NO lava, NO ash cones, NO `magma: true` anywhere on this isle (lava stays in the underworld — owner rule). biomeFamily EMBER_CRYSTAL (palette ember/ashen): every ROCK-class feature — the crystal-field spur ridges above all — renders as ember-red crystal automatically.",
      determinism: "generated by map-service/tools/world_terrain_hs2.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale; world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors). The one reservoir carries fill: true (worldfield.js FILL water) — deliberately SMALL (owner 2026-08-31: sky isles have no rivers; nothing deep/sailable in the sky).",
      tiers: "OWNER ADDENDUM 2026-08-31 — sky-city battle maps read as THREE STACKED LAND LAYERS (5th-Element vertical city, discretized into 3 walkable decks). Field-level delivery: the tier rings are EXACTLY THREE strong, clearly banded concentric tierwalls centred on the crown — Tier I r 26 THE LOWER WORKS / Tier II r 17 THE MID CITY / Tier III r 9 THE CROWN — so any parcel windowed from the fortress inherits a 3-level terraced read (Mont-Saint-Michel / Minas-Tirith massing, §3b). Each tierwall has ONE gap, rotated W→S→E: THE GRAND ASCENT is the single switchback gate-road from the Ember Gate through every tierwall to the war-palace. No new data shapes — pure ridge structure.",
      water: "rivers[] = ONE entry: THE FORGE BASIN (fill: true, r ~1.8 u) — the small dark coolant reservoir of the Crystal Forges in the gridded Forge Ward east of the fortress. Ordinary water, never lava; nothing that could grade deep/sailable (no navigable water in the sky). No other water on the isle.",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — the basin is terrain/visual continuity, not a hard blocker.",
      era: "Emberfall = HIGH-MEDIEVAL TIERED FORTRESS massing (§3b: Mont Saint-Michel / Minas Tirith — concentric tier rings, one switchback gate-road, ringwall per tier, the keep crowns the top) worn by a HIGH-TECH MILITARY EMPIRE (SKY-ZONES-DESIGN): ring parades + straight radial cross-streets grid the tiers, a gridded Forge Ward serves the reactors, war-camps muster at the front. Urban = regular military geometry (ring avenues, verbatim-straight lanes); rural = the organic garrison web, militarized (straighter, lower meander than the surface zones).",
      hierarchy: "roads carry tier: highway (2 — THE GRAND ASCENT, Ember Gate → crown, the one road through every tierwall; THE WAR ROAD, Muster Ring → the Bulwark gap → the Sky-Throne Front staging) / secondary (the Muster Ring + the two Parades + the Crown Court + the Forge Road + the garrison web: garrisons = the 16 LARGE L2 estate anchors, gap-aware reroutes, ≤2 water crossings, connect-don't-double dedup) / local (military cross-streets, the Forge Ward grid, war-camp lanes, ~18 seeded MEDIUM steading feeders, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c ADAPTED to the real ladder (0 EPIC / 0 GIANT ⇒ the biggest class present takes the top role): PALACE the Ember Throne (playable LARGE " + crown.parcelId + " at the fortress crown — the tier geometry is centred on its castle parcel) + 6 KEEPs on playable LARGEs (" + [kWestgate, kBulwark, kParade, kShard, kCinder, kSeam].map((p) => p.parcelId).join("/") + " — the west gatehouse, the war-front bastion, the south tier bastion, and the three crystal-field mine-guards). All 7 castle POIs sit on PLAYABLE L3 parcels (castleAt = the estate's child center nearest the estate center) and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META,
      continuity: "NO horizontal neighbours (floating isle — every edge is sky-void). Links, all POIs: WEST = HS2-GATE-AEROPOLIS, the Ember Gate (connects HS1↔HS2, the airship branch from the Aeropolis gateway — zoneLinks locked 2026-07-11; the isle's ONLY friendly door). NORTH = HS2-WARFRONT, the Sky-Throne Front facing Empyrea (HS3): warFront, contested, NO traversable link (skyWar — the fallen angels besiege the pinnacle; do not draw a HS2↔HS3 route).",
      creatures: "Fire/Electric pets (zone-registry primaryElements) haunt the crystal fields — heaviest over the Emberglass Reach and the Redvein Scarps; the pet layer reads data/zone-pet-population.json. The war machine musters at the Bulwark; the empire's boss holds the crown approach.",
    },
    zone: "HS2",
    rivers: [
      // the ONE reservoir (owner addendum 2026-08-31: sky isles have no rivers — water minimal,
      // small, never deep/sailable). fill: true = honest footprint at battle scale (a pool, not a stripe).
      { id: "HS2-LK-FORGE", name: "The Forge Basin", width: 3.0, fill: true, pts: lakeForge },
    ],
    roads: [
      { id: "HS2-RD1", name: "The Grand Ascent", tier: "highway", width: 0.5, pts: roadAscent },
      { id: "HS2-RD2", name: "The War Road", tier: "highway", width: 0.45, pts: roadWar },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: "local", width: 0.22, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.32, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "HS2-RG-RIM-N", name: "The Sky Rim (North — the War Front)", width: 2.4, pts: rimN },
      { id: "HS2-RG-RIM-S", name: "The Sky Rim (South)", width: 2.4, pts: rimS },
      { id: "HS2-RG-RIM-W1", name: "The Sky Rim (West, north reach)", width: 2.4, pts: rimW1 },
      { id: "HS2-RG-RIM-W2", name: "The Sky Rim (West, south reach)", width: 2.4, pts: rimW2 },
      { id: "HS2-RG-RIM-E", name: "The Sky Rim (East)", width: 2.4, pts: rimE },
      { id: "HS2-RG-BULWARK-W", name: "The Bulwark (west reach)", width: 1.8, pts: bulwarkW },
      { id: "HS2-RG-BULWARK-E", name: "The Bulwark (east reach)", width: 1.8, pts: bulwarkE },
      { id: "HS2-RG-TIER1", name: "The First Tierwall (The Lower Works)", width: 1.7, pts: tier1 },
      { id: "HS2-RG-TIER2", name: "The Second Tierwall (The Mid City)", width: 1.7, pts: tier2 },
      { id: "HS2-RG-TIER3", name: "The Third Tierwall (The Crown)", width: 1.7, pts: tier3 },
      ...spEmberglass.map((s, i) => ({ id: `HS2-RG-EG${i + 1}`, name: `The Emberglass Reach (${i + 1})`, width: 1.3, pts: s })),
      ...spShard.map((s, i) => ({ id: `HS2-RG-SH${i + 1}`, name: `The Shard Tiers (${i + 1})`, width: 1.3, pts: s })),
      ...spCinder.map((s, i) => ({ id: `HS2-RG-CI${i + 1}`, name: `The Cindersea (${i + 1})`, width: 1.3, pts: s })),
      ...spRedvein.map((s, i) => ({ id: `HS2-RG-RV${i + 1}`, name: `The Redvein Scarps (${i + 1})`, width: 1.3, pts: s })),
    ],
    castles: CASTLES,
    pois: [
      { id: "HS2-GATE-AEROPOLIS", kind: "GATE", at: WGATE.slice(), connects: ["HS1", "HS2"], name: "The Ember Gate",
        note: "the WEST rim gate — the airship way back to Aeropolis (HS1), the isle's ONLY friendly door (zoneLinks HS1→HS2 branch, owner-locked 2026-07-11: each sky isle is reached only through the HS1 gateway; you pick a side of the war at the gate). Westgate Bastion keeps its approach; the Grand Ascent begins here" },
      { id: "HS2-WARFRONT", kind: "WAR_FRONT", at: [59.5, 4.2], warFront: true, facing: "HS3", name: "The Sky-Throne Front",
        note: "the NORTH rim = the war front of the War of the Sky Throne (zone-registry skyWar): Emberfall's siege of Empyrea (HS3) musters here — the Bulwark line, the war-camps, the forward trench between Bulwark and rim. CONTESTED: no friendly link, no gate — do NOT draw a HS2↔HS3 route (the link is severed by the war; both isles are reached only via HS1)" },
      { id: "HS2-CAMP-WEST", kind: "WAR_CAMP", at: [44, 10.5], name: "Westmuster War-Camp",
        note: "the western muster of the siege — tents, engines, and drill yards behind the Bulwark's west reach" },
      { id: "HS2-CAMP-EAST", kind: "WAR_CAMP", at: [77, 10.5], name: "Eastmuster War-Camp",
        note: "the eastern muster of the siege — the Bulwark Keep's garrison drills here" },
      { id: "HS2-FORGES", kind: "LANDMARK", at: [92, 53.4], name: "The Crystal Forges",
        note: "the gem-fed forges of the war machine — the gridded Forge Ward around the Forge Basin coolant pool; ember crystal goes in, the empire's arms come out" },
      { id: "HS2-REACTOR", kind: "LANDMARK", at: [+(CR[0] - 3).toFixed(2), +(CR[1] + 12.2).toFixed(2)], name: "Reactor Ward",
        note: "the Mid City's crystal-reactor precinct on the Second Parade — the gem-fired heart that floodlights the tiers and powers the crown" },
      { id: "HS2-ARSENAL", kind: "LANDMARK", at: [60.8, 16], name: "The Arsenal Yards",
        note: "the staging yards on the War Road between the Muster Ring and the Bulwark — every engine of the siege rolls through here" },
      { id: "HS2-MINE-EMBERGLASS", kind: "MINE", at: F_EMBERGLASS.slice(), name: "The Emberglass Reach",
        note: "the north-east crystal field — ember-red crystal spurs (the ROCK class renders as red crystal on the ember palette); the empire's richest seam" },
      { id: "HS2-MINE-SHARD", kind: "MINE", at: F_SHARD.slice(), name: "The Shard Tiers",
        note: "the south-east crystal field — Shardwatch Keep guards the diggings" },
      { id: "HS2-MINE-CINDER", kind: "MINE", at: F_CINDER.slice(), name: "The Cindersea",
        note: "the south-west crystal field — a broken sea of dark crystal under Cinderholm Keep" },
      { id: "HS2-MINE-REDVEIN", kind: "MINE", at: F_REDVEIN.slice(), name: "The Redvein Scarps",
        note: "the west crystal field on the rim scarps — the forward seams that feed the war effort, under Seamwatch Keep's eye" },
    ],
  };
  // heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
  const heroStats = attachHeroParcels(out, hs2, l3.singles);
  return { out, stats: { crown: crown.parcelId, crownAt: CR, towns: towns.length, urban: urban.length, secondaries: secondaries.length, locals: locals.length, approaches: approaches.length, heroStats } };
}

// ---- build twice, byte-compare, write once ---------------------------------------------------------
const b1 = buildField();
const s1 = JSON.stringify(b1.out) + "\n";
const s2 = JSON.stringify(buildField().out) + "\n";
const h1 = createHash("sha256").update(s1).digest("hex");
const h2 = createHash("sha256").update(s2).digest("hex");
if (h1 !== h2) { console.error("NON-DETERMINISTIC BUILD:", h1, "≠", h2); process.exit(1); }
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/HS2.json"), s1);
console.log("crown:", b1.stats.crown, "@", b1.stats.crownAt.map((n) => n.toFixed(2)).join(","));
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/HS2.json sha256", h1.slice(0, 16),
  "| garrisons", b1.stats.towns,
  "| military lanes", b1.stats.urban,
  "| secondaries", b1.stats.secondaries,
  "| locals", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| ridges", b1.out.ridges.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
