#!/usr/bin/env node
// world_terrain_hs3.mjs — REPRODUCIBLE generator for data/world-terrain/HS3.json (Empyrea).
//
// Empyrea = HS3, THE FROZEN PINNACLE — the highest place in the world, the rightful summit of
// the sky tier, reached last. Owner-locked identity (docs/maps/SKY-ZONES-DESIGN.md, 2026-08-31):
// **ice and frozen** — a white-gold divine city above the weather line, glacial terraces, frozen
// serenity, pilgrim ways converging upward (CONTINUOUS-WORLD-TERRAIN §3 "Sky Sanctum, frost
// summit, sacred; Lhasa (Potala); sacred summit citadel, pilgrim roads converging up"; §3b
// "FAR-FUTURE sacred summit: pilgrim ways converging up to a levitating precinct; clean radial
// platforms; the Sanctum"). biomeFamily SNOW (zone-registry). Atlas §2.7: the sky tier's cold
// pole (E 1.0 / M 0.35 / T 0.3), 403 SMALL + 54 MEDIUM + 6 LARGE + 1 EPIC — many small
// shrine-plots around one great sanctum; ALL RIMS = sky-void.
//
// OWNER ADDENDUM (2026-08-31, applied here):
//   • MINIMAL FROZEN WATER — floating isles have "probably no river": one SMALL still summit
//     lake (the Mirror of Heaven, fill:true but tiny — nothing deep/sailable, no navigable
//     water in the sky) + two SHORT frozen melt channels. No magma anywhere.
//   • THREE STACKED LAND LAYERS — sky-city battle maps must read as three discrete vertical
//     levels; at field level this is EXACTLY THREE strong, clearly banded glacial terrace
//     rings: the PILGRIMS' RING (base) → the WHITE TERRACES (middle) → the SANCTUM RING
//     (summit precinct). No new data shapes — pure ridges[] structure; parcels windowed from
//     the field inherit the 3-level terraced read.
//
// THE SKY ISLE (all four edges = sky-void rims — no coast, no neighbour, the UW2 vault pattern
// with sky instead of rock):
//   • RIM WALLS: four `ridges[]` cliff-walls just inside the land bbox (the Sky's Edge). The
//     ONLY break is the south-WEST rim gate (the Aeropolis Gate — the HS1 branch arrives here;
//     zoneLinks canon: ALL surface airships land at HS1 FIRST, then branch; the Arcadia and
//     Porthaven ways reach Empyrea through it, received at the Pilgrims' Anchorage).
//   • THE WAR RIM: the SOUTH rim faces Emberfall (HS2) = THE WAR FRONT (the fire-crystal
//     empire besieging the frozen pinnacle — the two are AT WAR, no link, no friendly gate).
//     Fortified: an extra interior ridge (the Bastion Line, two reaches with one sally gap)
//     behind the rim + the HS3-WARFRONT poi on the forward ground.
//   • THE ASCENT: five pilgrim ways converge UPWARD (northward — the summit EPIC sits in the
//     north-center) through the three terrace rings' authored gaps: the Way of Ascent (highway,
//     from the gate/anchorage), the War Road (from the Bastion Line sally gap), the Dawnway
//     (east), the Vesper Way (west), the Aurora Stair (north-east). Near the top the geometry
//     turns PROCESSIONAL — the Last Ascent + the platform spokes are straight radial lanes
//     (clean radial platforms per §3b: the White Terrace, the Dawn / Vesper Platforms).
//   • FROZEN WATER: the Mirror of Heaven (small still summit pool, fill:true — the SNOW
//     palette renders it icy) + two short melt channels (the Weeping of the Ice, the Dawnmelt).
//   • THE DEEP VAULTS: one sealed poi beneath the Sanctum ice, neutrally named — the doors are
//     old and they are shut; nothing more is said (deep canon stays beneath the ice).
//
// DETERMINISTIC PICK RULES (all over data/hexagon-city-source/parcels-l2.json, zone==="HS3";
// ties broken by parcelId ascending; SEP = 12 zone-units between fortification picks;
// "playable" = the estate has L3 subdivision — keeps constrained to playable estates so their
// castle POIs land on PLAYABLE parcels today, the UW2/HUB/BUS/ENT precedent):
//   SANCTUM      = the EPIC estate nearest the authored summit anchor SA=(45,21) (the zone's
//                  single EPIC).                                             → 1060463
//   PILGRIMWATCH = the playable LARGE nearest the Aeropolis Gate (the gate/anchorage watch).
//                                                                            → 3060459
//   SHIELDGATE   = the playable LARGE (excl. prior) nearest the war front — the WAR-ROAD
//                  bastion keep.                                             → 3060457
//   DAWNSHIELD   = the playable LARGE (excl. prior) nearest the war front — the second war
//                  bastion, guarding the Dawnway's eastern approach.         → 3060461
//   AURORA       = the playable LARGE (excl. prior) nearest the north-east anchor NE=(95,12)
//                  (the Aurora Stair terrace keep).                          → 3060462
//   DATA FACT: every HS3 LARGE estate sits in the NORTHERN terraces (y 21–46) — the estate
//   table simply put no LARGE in the south, so the war rim itself is held by the Bastion Line
//   ridge + the HS3-WARFRONT poi, and the two bastion KEEPs anchor where the war approaches
//   pass the terrace rings. The 2 non-playable LARGEs (3060458 E, 3060460 NW) are left wild.
//   CASTLE POI POINT (subdivided estates) = the estate's L3 child center nearest the estate
//                  center (ties by parcelId) — the world-layer invariant is that a castle POI
//                  sits ON its castle parcel.
//   NOTE data fact: the single HS3 EPIC (1060463) is NOT L3-subdivided — the Sanctum battle
//   map arrives with the pre-designed ESTATE maps (canon decisions 4/5) and its heroParcels
//   DEFER; the four keeps sit on playable L3 parcels and grow WALL/GATE/TOWER rings via
//   maps/generate.js castleLayout.
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d,
// shared rule in world_hero_parcels.mjs, identical across all world_terrain_*.mjs tools):
// castle parcel FIRST, LARGE 3 / GIANT 5 / EPIC 8; the un-subdivided Sanctum EPIC defers.
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_hs3.mjs
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
// a PLANNED straight lane (processional ways, platform spokes) — sampled, no meander
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
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/HS3.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));  // estates with playable L3 parcels
  const hs3 = l2.parcels.filter((p) => p.zone === "HS3");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const epics = hs3.filter((p) => p.sizeClass === "EPIC").sort(byId);
  const larges = hs3.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = hs3.filter((p) => p.sizeClass === "LARGE" || p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const smalls = hs3.filter((p) => p.sizeClass === "SMALL")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- deterministic picks (rules in the header) ---------------------------------------------------
  const SA = [45, 21];                                              // the authored summit anchor
  const GATE = [2.9, 92];                                           // the Aeropolis Gate (SW rim break)
  const ANCH = [9.5, 95.5];                                         // the Pilgrims' Anchorage (inside the gate)
  const WAR = [57, 111];                                            // the war-front forward ground (S rim)
  const SALLY = [57, 107.4];                                        // the Bastion Line sally gap
  const NEA = [95, 12];                                             // the north-east (Aurora) anchor
  const SEP = 12;
  const sanctum = epics.slice().sort((a, b) => (dist(a.center, SA) - dist(b.center, SA)) || byId(a, b))[0];
  const S = sanctum.center.slice();                                 // the summit — everything converges here
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const picked = [{ center: S }];
  const pickNearest = (pool, pt) => {
    for (const cand of pool.slice().sort((a, b) => (dist(a.center, pt) - dist(b.center, pt)) || byId(a, b)))
      if (!picked.includes(cand) && picked.every((q) => dist(q.center, cand.center) >= SEP)) { picked.push(cand); return cand; }
    return null;
  };
  const kPilgrim = pickNearest(largesPlay, GATE);
  const kShield = pickNearest(largesPlay, WAR);
  const kDawn = pickNearest(largesPlay, WAR);
  const kAurora = pickNearest(largesPlay, NEA);
  // castle POI point = the estate's L3 child center nearest the estate center (ties by parcelId
  // ascending) — an estate's bbox center can fall in a gap between its child parcels, and the
  // world-layer invariant (hero_parcels.test.js) is that a castle POI sits ON its castle parcel.
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

  // ---- RIM WALLS (the Sky's Edge — all four edges = sky-void; the ONLY break = the Aeropolis Gate)
  const rimN = natural([[3, 3.6], [30, 3.4], [58, 3.8], [86, 3.5], [111.9, 3.7]], 0.5, 26, "HS3|rim|N");
  const rimS = natural([[3, 114.2], [30, 114.0], [58, 114.3], [86, 113.9], [111.9, 114.1]], 0.5, 26, "HS3|rim|S");
  const rimW1 = natural([[3.0, 3.6], [2.8, 25], [3.2, 47], [2.9, 68], [3.1, 86.5]], 0.4, 22, "HS3|rim|W1");
  const rimW2 = natural([[3.1, 97.5], [2.8, 105], [3.0, 114.2]], 0.4, 14, "HS3|rim|W2", 8);
  const rimE = natural([[111.9, 3.7], [112.1, 30], [111.7, 58], [112.2, 86], [111.9, 114.1]], 0.4, 26, "HS3|rim|E");
  // the Bastion Line — the fortified WAR RIM interior ridge (faces Emberfall/HS2; no friendly
  // gate — the only break is the defenders' sally gap the War Road issues from)
  const warA = natural([[26, 107.8], [35, 107.3], [45, 107.6], [54.3, 107.4]], 0.5, 18, "HS3|war|A", 8);
  const warB = natural([[59.7, 107.4], [69, 107.7], [79, 107.2], [88, 107.6]], 0.5, 18, "HS3|war|B", 8);

  // ---- THE THREE TERRACE RINGS (owner addendum: EXACTLY three strong banded glacial rings ⇒ the
  // three stacked land layers; arcs centered on the summit, gaps ONLY where the pilgrim ways pass)
  const arc = (r, a0, a1, key) => {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 8));
    const ctrl = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;      // y down: 90° = due south
      ctrl.push([+(S[0] + Math.cos(a) * r).toFixed(2), +(S[1] + Math.sin(a) * r).toFixed(2)]);
    }
    return natural(ctrl, 0.35, 14, key, 6);
  };
  // LAYER 1 — the Pilgrims' Ring (base terrace, r 52): gaps at az 124–112 (the Way of Ascent),
  // 96–84 (the War Road), 61–49 (the Dawnway)
  const ring1a = arc(52, 140, 124, "HS3|ring1|a");
  const ring1b = arc(52, 112, 96, "HS3|ring1|b");
  const ring1c = arc(52, 84, 61, "HS3|ring1|c");
  const ring1d = arc(52, 49, 40, "HS3|ring1|d");
  // LAYER 2 — the White Terraces (middle terrace, r 30): gaps at az 131–119 / 97–83 / 64–52
  const ring2a = arc(30, 160, 131, "HS3|ring2|a");
  const ring2b = arc(30, 119, 97, "HS3|ring2|b");
  const ring2c = arc(30, 83, 64, "HS3|ring2|c");
  const ring2d = arc(30, 52, 20, "HS3|ring2|d");
  // LAYER 3 — the Sanctum Ring (summit precinct, r 12): three 12° processional doorways
  // (S = the Last Ascent, W = the Vesper door, E = the Dawn door)
  const ring3a = arc(12, 6, 84, "HS3|ring3|a");
  const ring3b = arc(12, 96, 174, "HS3|ring3|b");
  const ring3c = arc(12, 186, 354, "HS3|ring3|c");
  const gapPt = (az, r) => [+(S[0] + Math.cos((az * Math.PI) / 180) * r).toFixed(2), +(S[1] + Math.sin((az * Math.PI) / 180) * r).toFixed(2)];
  const RIDGES = [rimN, rimS, rimW1, rimW2, rimE, warA, warB,
    ring1a, ring1b, ring1c, ring1d, ring2a, ring2b, ring2c, ring2d, ring3a, ring3b, ring3c];
  const RIDGE_GAPS = [GATE, SALLY,
    gapPt(118, 52), gapPt(90, 52), gapPt(55, 52),
    gapPt(125, 30), gapPt(90, 30), gapPt(58, 30),
    gapPt(90, 12), gapPt(180, 12), gapPt(0, 12)];

  // ---- FROZEN WATER (owner addendum: minimal — one small still pool + two short melt channels) ----
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
  const MIRROR = [+(S[0] + 3.8).toFixed(2), +(S[1] + 4.2).toFixed(2)];   // inside the Sanctum Ring, SE of the palace
  const lakeMirror = pool(MIRROR[0], MIRROR[1], 1.3, "HS3|lake|mirror");
  const chWeeping = natural([[46.5, 33.5], [48, 40], [47, 47], [48.5, 53]], 0.3, 10, "HS3|ch|weeping", 8);
  const chDawnmelt = natural([[78, 34], [82, 40], [81.5, 46]], 0.25, 8, "HS3|ch|dawnmelt", 8);
  const RIVERS = [lakeMirror, chWeeping, chDawnmelt];

  // ---- THE PILGRIM WAYS (converging upward — five radials + the straight processional) -------------
  // RD1 the Way of Ascent: the Aeropolis Gate → the Pilgrims' Anchorage → up through the
  // Pilgrims' Ring (az 118) and the White Terraces (az 125), past Pilgrimwatch, to the
  // Processional Court below the Sanctum's south door.
  const roadAscent = natural(
    [[2.9, 92], [9.5, 95.5], [14.8, 88.5], [18.4, 78], [21.1, 66.5], [24.2, 55.5], [28.3, 45.2],
     [33, 39.2], [39, 35.4], [44.3, 33.8]],
    0.6, 30, "HS3|road|ascent");
  // the Last Ascent — the PROCESSIONAL (straight, clean radial geometry per §3b): the White
  // Terrace platform → the Sanctum Ring's south doorway → the palace forecourt.
  const roadProc = straight([[45.5, 36.8], [S[0], 29], [S[0], +(S[1] + 2.2).toFixed(2)]], 0.5);
  // RD2 the War Road: the Bastion Line sally gap → north through both ring gaps (az 90) → joins
  // the Processional Court (the defence runs DOWN the same axis the pilgrims climb).
  const roadWar = natural(
    [[57, 107.3], [54.5, 98], [50.5, 88], [47, 78.5], [45.6, 72.3], [45.8, 62], [45.5, 50.6],
     [47.5, 43], [50.6, 37.6], [47.8, 34.8], [46.2, 33.9]],
    0.5, 24, "HS3|road|war");
  // RD3 the Dawnway: the east rim quarter → the Pilgrims' Ring gap (az 55) → the White Terraces
  // gap (az 58) → past Dawnshield → the Sanctum Ring's east (Dawn) door.
  const roadDawn = natural(
    [[110.5, 60], [101, 62], [90, 63.5], [82, 63.8], [75.3, 63.2], [69, 55], [64.5, 49.5],
     [61.4, 46], [60.5, 40], [63.3, 35.5], [62.5, 29.5], [60, 25], [58.4, 21]],
    0.55, 26, "HS3|road|dawn");
  // RD4 the Vesper Way: the west rim's north reach → east along the summit shoulder → the
  // Sanctum Ring's west (Vesper) door.
  const roadVesper = natural([[3.8, 28], [11, 26.2], [19, 24.3], [27, 22.3], [33.4, 20.7]], 0.45, 18, "HS3|road|vesper", 8);
  // RD5 the Aurora Stair: the north-east rim quarter → past Aurora Keep → west along the summit
  // shoulder → the Dawn door (converging with the Dawnway at the east doorway).
  const roadAurora = natural(
    [[100.5, 10.5], [92, 12.5], [85, 16], [79.3, 20.3], [72, 20], [65, 20.3], [58.6, 20.6]],
    0.5, 22, "HS3|road|aurora");
  const HIGHWAYS = [roadAscent];
  const SECONDARIES_AUTHORED = [
    { id: "HS3-RD2", name: "The War Road", pts: roadWar },
    { id: "HS3-RD3", name: "The Dawnway", pts: roadDawn },
    { id: "HS3-RD4", name: "The Vesper Way", pts: roadVesper },
    { id: "HS3-RD5", name: "The Aurora Stair", pts: roadAurora },
    { id: "HS3-RD-PROC", name: "The Last Ascent", pts: roadProc },
  ];

  // ---- urban lanes (the summit precinct's clean radial platforms + keep-town crescents) -----------
  const urban = [];
  let utN = 0;
  const addLane = (name, pts, idOverride) => { utN++; urban.push({ id: idOverride || `HS3-UT${String(utN).padStart(2, "0")}`, name, tier: "local", pts }); };
  // the Sanctum Walk — the palace's inner ring lane (the Warden's-Walk pattern)
  const walk = [];
  for (let a = 0; a <= 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    walk.push([+(S[0] + Math.cos(t) * 6).toFixed(2), +(S[1] + Math.sin(t) * 6).toFixed(2)]);
  }
  addLane("The Sanctum Walk", round2(walk), "HS3-UT-WALK");
  // platform spokes — STRAIGHT radial lanes through the Vesper/Dawn doorways to the platforms
  const PLAT_DAWN = [+(S[0] + 16).toFixed(2), S[1]];
  const PLAT_VESPER = [+(S[0] - 16).toFixed(2), S[1]];
  const PLAT_WHITE = [S[0], +(S[1] + 16).toFixed(2)];               // the White Terrace, on the Last Ascent
  addLane("The Dawn Spoke", straight([[+(S[0] + 6).toFixed(2), S[1]], PLAT_DAWN], 0.5), "HS3-UT-DAWN");
  addLane("The Vesper Spoke", straight([[+(S[0] - 6).toFixed(2), S[1]], PLAT_VESPER], 0.5), "HS3-UT-VESPER");
  // the Anchorage Quay — the airship landing's platform lane
  addLane("The Anchorage Quay", straight([[7.2, 93.2], [11.6, 97.6]], 0.5), "HS3-UT-QUAY");
  const keepTowns = [
    { k: kPilgrim, at: castleAt(kPilgrim), name: "Pilgrimwatch" },
    { k: kShield, at: castleAt(kShield), name: "Shieldgate" },
    { k: kDawn, at: castleAt(kDawn), name: "Dawnshield" },
    { k: kAurora, at: castleAt(kAurora), name: "Aurora" },
  ];
  for (const t of keepTowns) {
    const T = t.at;
    addLane(`${t.name} Crescent`, natural([[T[0] - 2.1, T[1] - 1.2], [T[0], T[1] - 2.1], [T[0] + 2.1, T[1] - 1.0]], 0.2, 5, `HS3|town|${t.name}|cres`, 8));
  }

  // ---- castles (§3c ladder: EPIC=PALACE, LARGE=KEEP; pick rules in the header) --------------------
  const CASTLES = [
    { id: "HS3-SANCTUM", kind: "PALACE", at: castleAt(sanctum), townEstateId: sanctum.parcelId,
      name: "The Sanctum of Empyrea", ref: "the frozen summit palace of the sky — the white-gold divine city's heart above the weather line (SKY-ZONES-DESIGN: the Frozen Pinnacle; the Potala silhouette of CONTINUOUS-WORLD-TERRAIN §3b), ringed by the Sanctum Ring with three processional doors; every pilgrim way climbs to it" },
    { id: "HS3-KEEP-PILGRIMWATCH", kind: "KEEP", at: keepTowns[0].at.slice(), townEstateId: kPilgrim.parcelId,
      name: "Pilgrimwatch Keep", ref: "the gate-and-anchorage watch on the western terraces — the Way of Ascent passes beneath its walls; first hold above the Aeropolis Gate" },
    { id: "HS3-KEEP-SHIELDGATE", kind: "KEEP", at: keepTowns[1].at.slice(), townEstateId: kShield.parcelId,
      name: "Shieldgate Keep", ref: "the War Road's bastion keep — the strong place where the road up from the Bastion Line passes the White Terraces; Empyrea's shield toward the southern front" },
    { id: "HS3-KEEP-DAWNSHIELD", kind: "KEEP", at: keepTowns[2].at.slice(), townEstateId: kDawn.parcelId,
      name: "Dawnshield Keep", ref: "the second war bastion, on the Dawnway's eastern approach — the two shield-keeps command the only climbs an army from the south rim can take" },
    { id: "HS3-KEEP-AURORA", kind: "KEEP", at: keepTowns[3].at.slice(), townEstateId: kAurora.parcelId,
      name: "Aurora Keep", ref: "the north-east terrace keep on the Aurora Stair — the quiet quarter's hold, watching the sky's edge where the lights stand" },
  ];

  // ---- rural web (shrine-plot hamlets — the organic countryside style, sparse and sacred) ---------
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const s of SECONDARIES_AUTHORED) netIdx.addPolyline(s.pts);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const CITIES = [
    { c: S, r: 5 }, { c: [ANCH[0], ANCH[1]], r: 4 },
    ...keepTowns.map((t) => ({ c: t.k.center, r: 3.5 })),
  ];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "HS3|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(8, L * 0.35);
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 0.9, 26);
    if (crossings(poly, RIDGES) > 0) {                              // one reroute attempt via a ring gap
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.7, 26);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
      // else: accept — a terrace stair over a low ice lip
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
    secN++; secondaries.push({ id: `HS3-SEC${String(secN).padStart(3, "0")}`, name, pts });
    netIdx.addPolyline(pts);
  };
  const townName = (t) => `Shrine ${t.id}`;
  // pass 1 — neighbour pair ways with UNION-FIND component tracking (the HUB/BUS/ENT/UW2 pattern)
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
    addSecondary(poly, `${townName(t)} – ${townName(nb)} Way`);
    union(t.id, nb.id);
    for (const id of [t.id, nb.id]) { if (!pairPolys.has(id)) pairPolys.set(id, []); pairPolys.get(id).push(poly); }
  }
  // pass 2 — connect every shrine COMPONENT to the CONNECTED network
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
        const spur = natural([best.at, bpt], 0.3, 10, `HS3|road|spur|${best.id}`, 8);
        addSecondary(spur, `${townName(best)} Spur`);
        connIdx.addPolyline(spur);
      } else {
        addSecondary(poly, `${townName(best)} Link`);
        connIdx.addPolyline(poly);
      }
    }
    for (const t of members) for (const p of pairPolys.get(t.id) || []) connIdx.addPolyline(p);
  }

  // ---- local lanes: ~18 seeded SMALL shrine-plots → nearest network point --------------------------
  const locals = [];
  const pickR = rng32(fnv1a("HS3|locals|pick"));
  const shuffled = smalls.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 18) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.2 || d > 22) continue;
    const r = rng32(fnv1a("HS3|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(3.5, L * 0.4);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.5, 9, "HS3|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.75) continue;
    locN++;
    locals.push({ id: `HS3-LOC${String(locN).padStart(2, "0")}`, name: `Shrine ${m.id} Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- castle approaches: every castle sits ≤1u from the road network ------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.25, 8, "HS3|road|approach|" + c.id, 8);
    approaches.push({ id: `HS3-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- output ---------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "HS3 (Empyrea) macro feature network — the continuous-terrain field, the Frozen Pinnacle",
      author: "CF ParcelMap Design Agent (satellite field build), 2026-08-31 (regenerate with map-service/tools/world_terrain_hs3.mjs)",
      coords: "HS3 zone svg viewBox (0 0 114.69 117.2); y down. Same space as data/hexagon-city-source/l3/HS3.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords. FLOATING SKY ISLE: no coast, no sea, no horizontal neighbour — all four edges are sky-void rims (atlas §2.7 mapVoid); the zone's only doors are the Aeropolis Gate (SW rim, the HS1 branch) and the war front it faces south (HS2 — contested, no gate).",
      grounding: "The sky tier's cold pole and the highest place in the world (atlas §2.7: E 1.0 / M 0.35 / T 0.3; 464 L2 + 11,873 L3 over 114.69×117.2 — many small shrine-plots around one great sanctum). The single EPIC estate " + sanctum.parcelId + " at (" + S.map((n) => n.toFixed(1)) + ") is the summit — the Sanctum of Empyrea; the terraces and every LARGE estate lie on the northern heights around it, and the ground falls away south toward the war rim.",
      determinism: "generated by map-service/tools/world_terrain_hs3.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale; world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors). The Mirror of Heaven carries fill: true (a small still pool — its honest footprint windows into battle maps); the two melt channels stay band-clamped linear flows. NO navigable water anywhere on the isle (owner 2026-08-31: nothing deep or sailable in the sky).",
      rims: "SKY ISLE: ridges[] rim walls are the Sky's Edge — cliffs into the void on every edge parcel. The ONLY rim break is the Aeropolis Gate (W rim, southern reach). The SOUTH rim is the WAR RIM (faces Emberfall/HS2, the besieging enemy): doubled by the interior Bastion Line ridge whose single sally gap is the defenders' door — no friendly gate, no landing ground granted.",
      terraces: "THE THREE STACKED LAND LAYERS (owner 2026-08-31): exactly three strong banded glacial terrace rings climb to the summit — LAYER 1 the Pilgrims' Ring (r≈52), LAYER 2 the White Terraces (r≈30), LAYER 3 the Sanctum Ring (r≈12, the precinct wall with three processional doorways). Parcels windowed from the field inherit the 3-level terraced read; ring gaps exist only where the pilgrim ways pass.",
      water: "rivers[] = FROZEN water, minimal by design: the Mirror of Heaven (small still summit pool, fill: true — the SNOW palette renders all water as ice) + two short melt channels (the Weeping of the Ice below the south door, the Dawnmelt in the eastern terraces). They pool on the terraces — a sky isle has no sea mouth. No magma anywhere (owner rule: lava stays in the underworld).",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — the ice reads as terrain/visual continuity, not a hard blocker.",
      era: "Empyrea = the FROZEN PINNACLE (owner-locked 2026-08-31): a white-gold divine city above the weather line — glacial terraces, frozen serenity, pilgrim ways converging upward to the summit precinct; near the top the geometry turns PROCESSIONAL (straight radial ways + clean radial platforms — the White Terrace, the Dawn and Vesper Platforms). Urban = the precinct's radial spokes + the Sanctum Walk + keep-town crescents + the Anchorage Quay — never a grid; rural = the shrine-plot web (organic hamlet style, sparse and sacred).",
      hierarchy: "roads carry tier: highway (1 trunk — the Way of Ascent, gate → anchorage → summit: the pilgrim artery) / secondary (the War Road, the Dawnway, the Vesper Way, the Aurora Stair, the Last Ascent processional + the shrine web: shrines = the 60 LARGE+MEDIUM L2 estate anchors, ring-gap reroutes, ≤2 water crossings each, connect-don't-double dedup) / local (precinct spokes + the Sanctum Walk, keep crescents, the Anchorage Quay, ~18 seeded SMALL shrine lanes, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c (castles on ESTATES; importance→size; HS3 ladder: EPIC=PALACE, LARGE=KEEP, no GIANT): PALACE the Sanctum of Empyrea (EPIC " + sanctum.parcelId + ", the summit) / the 4 KEEPs on the playable LARGEs (" + [kPilgrim, kShield, kDawn, kAurora].map((p) => p.parcelId).join("/") + "): Pilgrimwatch (the gate watch), Shieldgate + Dawnshield (the two WAR BASTIONS commanding the southern climbs — data fact: the estate table put every LARGE in the northern terraces, so the war rim itself is held by the Bastion Line ridge and the bastion keeps anchor where the war approaches pass the rings), Aurora (the NE terrace keep). The EPIC is NOT L3-subdivided — the Sanctum battle map arrives with the pre-designed ESTATE maps (canon 4/5); keeps sit on playable L3 parcels and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META,
      continuity: "NO horizontal neighbours (floating isle). Vertical links only, all POIs: the AEROPOLIS GATE (SW rim, connects HS1↔HS3 — the sky branch: ALL surface airships land at Aeropolis FIRST and pick a side at the gateway; this is Empyrea's side of the way) + the PILGRIMS' ANCHORAGE just inside it (the airship landing receiving the Arcadia and Porthaven ways via HS1). The SOUTH rim faces Emberfall (HS2) — THE WAR FRONT (zoneLinks canon: the two sky powers are AT WAR and share no route; the front is geography, not a road): fortified, gateless, watched from the Bastion Line.",
      creatures: "Light/Wind pet affinity (zone-registry primaryElements; atlas §2.7 — thin high air); the pet layer reads data/zone-pet-population.json. Sacred-landmark density is highest here — the shrine web IS the countryside.",
    },
    zone: "HS3",
    rivers: [
      // fill: true = a TRUE still pool (worldfield.js FILL water): its honest small footprint
      // windows into battle maps. Kept SMALL on purpose — no deep/sailable water in the sky
      // (owner 2026-08-31). The two melt channels are band-clamped linear flows.
      { id: "HS3-LK-MIRROR", name: "The Mirror of Heaven", width: 2.6, fill: true, pts: lakeMirror },
      { id: "HS3-CH1", name: "The Weeping of the Ice", width: 1.0, pts: chWeeping },
      { id: "HS3-CH2", name: "The Dawnmelt", width: 0.9, pts: chDawnmelt },
    ],
    roads: [
      { id: "HS3-RD1", name: "The Way of Ascent", tier: "highway", width: 0.5, pts: roadAscent },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: u.tier, width: 0.22, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.32, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "HS3-RG-RIM-N", name: "The Sky's Edge (North)", width: 2.4, pts: rimN },
      { id: "HS3-RG-RIM-S", name: "The Sky's Edge (South) — the War Rim", width: 2.4, pts: rimS },
      { id: "HS3-RG-RIM-W1", name: "The Sky's Edge (West, north reach)", width: 2.4, pts: rimW1 },
      { id: "HS3-RG-RIM-W2", name: "The Sky's Edge (West, south reach)", width: 2.4, pts: rimW2 },
      { id: "HS3-RG-RIM-E", name: "The Sky's Edge (East)", width: 2.4, pts: rimE },
      { id: "HS3-RG-WAR-A", name: "The Bastion Line (west reach)", width: 1.8, pts: warA },
      { id: "HS3-RG-WAR-B", name: "The Bastion Line (east reach)", width: 1.8, pts: warB },
      { id: "HS3-RG-R1A", name: "The Pilgrims' Ring (west reach)", width: 1.7, pts: ring1a },
      { id: "HS3-RG-R1B", name: "The Pilgrims' Ring (south-west reach)", width: 1.7, pts: ring1b },
      { id: "HS3-RG-R1C", name: "The Pilgrims' Ring (south-east reach)", width: 1.7, pts: ring1c },
      { id: "HS3-RG-R1D", name: "The Pilgrims' Ring (east reach)", width: 1.7, pts: ring1d },
      { id: "HS3-RG-R2A", name: "The White Terraces (west reach)", width: 1.7, pts: ring2a },
      { id: "HS3-RG-R2B", name: "The White Terraces (south-west reach)", width: 1.7, pts: ring2b },
      { id: "HS3-RG-R2C", name: "The White Terraces (south-east reach)", width: 1.7, pts: ring2c },
      { id: "HS3-RG-R2D", name: "The White Terraces (east reach)", width: 1.7, pts: ring2d },
      { id: "HS3-RG-R3A", name: "The Sanctum Ring (east-to-south reach)", width: 1.4, pts: ring3a },
      { id: "HS3-RG-R3B", name: "The Sanctum Ring (south-to-west reach)", width: 1.4, pts: ring3b },
      { id: "HS3-RG-R3C", name: "The Sanctum Ring (west-to-east reach)", width: 1.4, pts: ring3c },
    ],
    castles: CASTLES,
    pois: [
      { id: "HS3-GATE-AEROPOLIS", kind: "GATE", at: GATE.slice(), connects: ["HS1", "HS3"], name: "The Aeropolis Gate",
        note: "the sky branch's Empyrea door on the south-west rim (zoneLinks canon: ALL surface airships land at Aeropolis/HS1 FIRST — the Gate to Heaven — then branch to ONE side of the war; you pick a side at the gateway). The only break in the Sky's Edge; the Way of Ascent begins here" },
      { id: "HS3-ANCHORAGE", kind: "AIRSHIP_PORT", at: ANCH.slice(), name: "The Pilgrims' Anchorage",
        note: "the airship landing just inside the Aeropolis Gate — the Arcadia and Porthaven ways reach Empyrea here (via HS1; surface anchors EDU-PORT-SKY + BUS-PORT-SKY/Skyreach Anchorage). Pilgrimwatch Keep holds the terraces above the quay" },
      { id: "HS3-WARFRONT", kind: "WAR_FRONT", at: WAR.slice(), warFront: true, name: "The Emberfall Front",
        note: "the SOUTH rim faces Emberfall (HS2) — the two sky powers are AT WAR (zoneLinks: no route joins them; the siege comes over the void). The forward ground between the Bastion Line and the Sky's Edge: fortified, gateless, no landing granted; the War Road issues from the sally gap behind it" },
      { id: "HS3-VAULTS", kind: "LANDMARK", at: [+(S[0] - 4.2).toFixed(2), +(S[1] - 3.6).toFixed(2)], sealed: true, name: "The Deep Vaults",
        note: "the sealed undercroft beneath the Sanctum ice — the oldest doors in Empyrea, and they are shut. The wardens keep them so; pilgrims do not ask" },
      { id: "HS3-MIRROR", kind: "LANDMARK", at: MIRROR.slice(), name: "The Mirror of Heaven",
        note: "the still summit pool inside the Sanctum Ring — frozen glass that holds the sky; the one water the pinnacle keeps" },
      { id: "HS3-TERRACE-WHITE", kind: "LANDMARK", at: PLAT_WHITE.slice(), name: "The White Terrace",
        note: "the great radial platform below the Sanctum's south door, where the Last Ascent begins — every pilgrim way gathers here before the final climb" },
      { id: "HS3-PLAT-DAWN", kind: "LANDMARK", at: PLAT_DAWN.slice(), name: "The Dawn Platform",
        note: "the eastern radial platform at the Dawn door — the Dawnway and the Aurora Stair converge on it; first light touches Empyrea here" },
      { id: "HS3-PLAT-VESPER", kind: "LANDMARK", at: PLAT_VESPER.slice(), name: "The Vesper Platform",
        note: "the western radial platform at the Vesper door, on the Vesper Way — last light leaves the world from this rail" },
    ],
  };
  // heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
  const heroStats = attachHeroParcels(out, hs3, l3.singles);
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
writeFileSync(path.join(ROOT, "data/world-terrain/HS3.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("wrote data/world-terrain/HS3.json sha256", h1.slice(0, 16),
  "| shrines", b1.stats.towns,
  "| urban lanes", b1.stats.urban,
  "| secondary ways", b1.stats.secondaries,
  "| locals", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
