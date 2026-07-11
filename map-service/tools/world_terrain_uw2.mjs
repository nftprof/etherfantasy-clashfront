#!/usr/bin/env node
// world_terrain_uw2.mjs — REPRODUCIBLE generator for data/world-terrain/UW2.json (Blackmere).
//
// Blackmere = UW2, the Deep Caverns — the middle depth of the underworld descent, the drowned
// and molten-veined heart of it. Owner-locked era (CONTINUOUS-WORLD-TERRAIN §3b): **DARK-GOTHIC
// drowned keep** (cenote/flooded-karst causeways, Minas-Morgul mood) — causeways between black
// lakes, half-sunken quarters; fortification = the Keep on its own island + causeway gates.
// Canon: CONTINUOUS-WORLD-TERRAIN §3 (UW2 row = flooded cave network / cenote field), §3c
// (castles on ESTATES: PALACE→EPIC, CASTLE→GIANT, KEEP→LARGE), §3d (heroParcels via the SHARED
// world_hero_parcels.mjs rule), §3e (the Diminishing Stair's LOWER mouth is here);
// CONTINENT-TERRAIN-ATLAS §2.9 (swamp black-water caverns grading to volcanic veins, E 0.3 /
// M 0.8 the wettest UW level / T 0.65 warming toward the inferno; all four edges = mapVoid rock;
// vertical links only). Lore (docs/lore/WORLD-CHRONICLE.md, hub mirror + data/singulars.json):
//   • THE BASTION OF DOMINUS (`bastion_dominus`) — "Seat of the Shadow Warden; its throne is
//     still warm." The dead keep ON ITS OWN ISLAND in a black lake: the PALACE-tier castle on
//     the EPIC estate at the lake-heart, ringed by the Mere of Dominus.
//   • THE DROWNED BANQUET (`drowned_banquet`) — "Five flooded halls still set for a feast no
//     one finished." The drowned-palace EPIC beside the Mere; its five hall channels flood off
//     the lake (rivers UW2-HALL1..5).
//   • THE DIMINISHING STAIR, LOWER MOUTH (`diminishing_stair_foot`) — the fixed site
//     "somewhere in Blackmere". PLACEMENT RULE (authored here, deterministic): the cliff-foot
//     terrace under the Stairfoot Crag in the WEST GALLERY — the vault's remotest habitable
//     corner, above the north-west shore of the Lantern-dark, WEST of the First Curtain, off
//     every causeway (a single dead-end local path reaches it — reachable but remote; the
//     upper mouth is ENT-STAIR-DIMINISHING on Carnavale's midway). At its foot the Cut happens
//     (the Blood Scimitar rite). Single file — one soul at a time, never an army.
//   • BOSS-GATES = LOCKS OF THE BINDING: Blackmere's Gate (W wall, connects UW1↔UW2 — the
//     SECOND lock, warden "the Lake That Watches", the black lake at its very threshold) and
//     the Vault Gate (E wall, connects UW2↔UW3 — the door down to Luxuria's Inferno Vault).
//     Armies descend by these gates (the Shaft chain); the Stair is the solo/lore route.
//   • Phantom-kin drift the lantern-dark (field-meta note; the pet layer reads
//     data/zone-pet-population.json).
//
// THE VAULT (all four edges = rock — no coast, no sky, no horizontal neighbour):
//   • RIM WALLS: four `ridges[]` walls just inside the viewBox edges; the only breaks are the
//     two boss-gate doorways (W + E walls).
//   • GALLERY CHAMBERS: interior stone CURTAINS (heavy `ridges[]` — the world has a ceiling;
//     chambers, not plains) divide the vault into the gallery-chamber chain the descent
//     follows: West Gallery → the Pale Cenote field (N) → the Mere chamber (center) →
//     the Deep Gallery (E) + the South Galleries. Causeways pass the authored curtain gaps.
//   • BLACK LAKES = `rivers[]` (v1: worldfield.js consumes rivers/roads/ridges only, the
//     BUS/ENT sea-band precedent): wide still bands — the Lake That Watches (at the W gate),
//     the Lantern-dark (W gallery), the MERE OF DOMINUS (a RING band: the Bastion island sits
//     dry inside it), the Pale Cenotes (a field of six round pools), the Ferry Dark (E), the
//     Sunken Court + the Drowned Meadows (S), flooded channels between them, and the five
//     Banquet hall channels. Battle-scale width clamps (worldfield zoneCap) apply per-parcel.
//   • MAGMA VEINS: two thin SE fissure rivers flagged `magma: true` (additive — ignored by
//     worldfield v1, palette guidance = the registry VOLCANIC family; UW3's fire creeping up).
//   • CAUSEWAYS = `roads[]`: the Wardens' Causeway (highway, W gate → N of the Mere →
//     Mourngate → E gate — the army descent trunk), secondary causeways to the chambers, the
//     Bastion Causeway crossing the Mere ring to the island, drowned-town shore lanes, sparse
//     cavern-hamlet feeders (the organic web, scaled down), castle approaches.
//
// DETERMINISTIC PICK RULES (all over data/hexagon-city-source/parcels-l2.json, zone==="UW2";
// ties broken by parcelId ascending; SEP = 15 zone-units between fortification picks;
// "playable" = the estate has L3 subdivision — citadels/keeps constrained to playable estates
// so their castle POIs land on PLAYABLE parcels today, the HUB/BUS/ENT precedent):
//   BASTION   = the EPIC estate nearest the zone center (the lake-heart).      → 1101100
//   MOURNGATE = the playable GIANT nearest the Bastion (the causeway gate).    → 2101090
//   DEEPGATE  = the playable GIANT (excl. prior) nearest the E boss-gate.      → 2101083
//   PALEWATER = the playable GIANT (excl. prior) nearest the cenote heart
//               NC=(75,25).                                                    → 2101092
//   5 KEEPs   = playable LARGEs, each the nearest to its authored shore point
//               (W gate / E gate / Drowned Meadows / Sunken Court / Lantern-dark), excluding
//               prior picks, first candidate ≥SEP from every previous pick.
//               → 3101075 Vigilwatch · 3101067 Ferrywatch · 3101057 Drownmeadow ·
//                 3101072 Sunken Court · 3101078 Palelantern
//   CASTLE POI POINT (subdivided estates) = the estate's L3 child center nearest the estate
//               center (ties by parcelId) — an estate's bbox center can fall in a coverage gap,
//               and the world-layer invariant is that a castle POI sits ON its castle parcel.
//   NOTE data fact: NO UW2 EPIC estate is L3-subdivided (0/5, checked 2026-07-11 — the atlas'
//   "richest EPIC pool" is real but un-subdivided) — the Bastion of Dominus battle map arrives
//   with the pre-designed ESTATE maps (canon decisions 4/5) and its heroParcels DEFER; the
//   citadels + keeps sit on playable L3 parcels and grow WALL/GATE/TOWER rings via
//   maps/generate.js castleLayout.
//   STAIRFOOT = authored fixed point SF=(16.5,45.5) (the placement rule in the lore block
//               above); its note names the nearest playable L3 single (computed
//               deterministically) as the Hunt arrival parcel.
//
// HERO PARCELS (castles[].heroParcels — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d,
// shared rule in world_hero_parcels.mjs, identical across all world_terrain_*.mjs tools):
// castle parcel FIRST, LARGE 3 / GIANT 5 / EPIC 8; the un-subdivided Bastion EPIC defers.
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_uw2.mjs
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachHeroParcels, HERO_PARCELS_META } from "./world_hero_parcels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ---- deterministic rng (same family as the EDU/HUB/BUS/ENT generators) --------------------------
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const rng32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- Catmull-Rom spline + seeded meander (verbatim: the EDU/HUB/BUS/ENT tools) -------------------
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
// a short PLANNED straight lane (jetties, causeway landings) — sampled, no meander
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
function nearestOn(set, x, y) {
  let best = null, bd = Infinity;
  for (const line of set) for (const p of line) {
    const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
    if (d < bd) { bd = d; best = p; }
  }
  return { pt: best, d: Math.sqrt(bd) };
}
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

// grid index over network VERTICES (verbatim: the HUB/BUS/ENT tools)
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
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/UW2.json"), "utf8"));
  const l3Parents = new Set(l3.singles.map((s) => s.parentIndex));  // estates with playable L3 parcels
  const uw2 = l2.parcels.filter((p) => p.zone === "UW2");
  const byId = (a, b) => (a.parcelId < b.parcelId ? -1 : 1);
  const epics = uw2.filter((p) => p.sizeClass === "EPIC").sort(byId);
  const giants = uw2.filter((p) => p.sizeClass === "GIANT").sort(byId);
  const larges = uw2.filter((p) => p.sizeClass === "LARGE").sort(byId);
  const towns = uw2.filter((p) => p.sizeClass === "GIANT" || p.sizeClass === "LARGE")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const mediums = uw2.filter((p) => p.sizeClass === "MEDIUM")
    .map((p) => ({ id: p.parcelId, at: [p.center[0], p.center[1]] })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- deterministic picks (rules in the header) ---------------------------------------------------
  const C = [150.48 / 2, 150.52 / 2];                               // the zone center (lake-heart)
  const WGATE = [2, 75.5];                                          // Blackmere's Gate (W wall doorway)
  const EGATE = [148.5, 76];                                        // the Vault Gate (E wall doorway)
  const NC = [75, 25];                                              // the cenote heart
  const SF = [16.5, 45.5];                                          // the Stairfoot terrace (authored)
  const SEP = 15;
  const bastion = epics.slice().sort((a, b) => (dist(a.center, C) - dist(b.center, C)) || byId(a, b))[0];
  const BAST = bastion.center.slice();
  const banquet = epics.filter((p) => p !== bastion)
    .sort((a, b) => (dist(a.center, BAST) - dist(b.center, BAST)) || byId(a, b))[0];
  const giantsPlay = giants.filter((p) => l3Parents.has(p.sourceIndex));
  const largesPlay = larges.filter((p) => l3Parents.has(p.sourceIndex));
  const picked = [{ center: BAST }];
  const pickNearest = (pool, pt) => {
    for (const cand of pool.slice().sort((a, b) => (dist(a.center, pt) - dist(b.center, pt)) || byId(a, b)))
      if (!picked.includes(cand) && picked.every((q) => dist(q.center, cand.center) >= SEP)) { picked.push(cand); return cand; }
    return null;
  };
  const mourngate = pickNearest(giantsPlay, BAST);
  const deepgate = pickNearest(giantsPlay, EGATE);
  const palewater = pickNearest(giantsPlay, NC);
  const LK_MEADOW_C = [64, 127], LK_COURT_C = [97, 111], LK_LANTERN_C = [26, 57];
  const kVigil = pickNearest(largesPlay, WGATE);
  const kFerry = pickNearest(largesPlay, EGATE);
  const kMeadow = pickNearest(largesPlay, LK_MEADOW_C);
  const kCourt = pickNearest(largesPlay, LK_COURT_C);
  const kLantern = pickNearest(largesPlay, LK_LANTERN_C);
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

  // ---- RIM WALLS + GALLERY CURTAINS (heavy ridges — the vault is carved, not open) ----------------
  const rimN = natural([[1.5, 2], [30, 1.8], [60, 2.2], [90, 1.9], [120, 2.1], [149, 2]], 0.5, 26, "UW2|rim|N");
  const rimS = natural([[1.5, 148.6], [30, 148.4], [60, 148.7], [90, 148.3], [120, 148.6], [149, 148.5]], 0.5, 26, "UW2|rim|S");
  const rimW1 = natural([[2, 2], [1.8, 20], [2.2, 40], [1.9, 58], [2.1, 70.5]], 0.4, 22, "UW2|rim|W1");
  const rimW2 = natural([[2.1, 80.5], [1.8, 100], [2.2, 120], [1.9, 135], [2, 148.5]], 0.4, 22, "UW2|rim|W2");
  const rimE1 = natural([[148.6, 2], [148.3, 20], [148.7, 40], [148.4, 58], [148.5, 71]], 0.4, 22, "UW2|rim|E1");
  const rimE2 = natural([[148.5, 81], [148.7, 100], [148.3, 120], [148.6, 135], [148.5, 148.5]], 0.4, 22, "UW2|rim|E2");
  // the First Curtain (west): West Gallery ↔ the Mere chamber; gaps at y 30–42 + 70–82
  const curtA1 = natural([[34, 6], [34.6, 18], [35, 30]], 0.6, 16, "UW2|curt|A1", 8);
  const curtA2 = natural([[36, 42], [35.4, 56], [35, 70]], 0.6, 16, "UW2|curt|A2", 8);
  const curtA3 = natural([[36, 82], [35, 102], [34.4, 122], [34, 144]], 0.7, 20, "UW2|curt|A3", 8);
  // the Gallery Curtain (north): the Pale Cenote field ↔ the Mere chamber; gaps at x 55–61 + 87–93
  const curtB1 = natural([[45, 44], [50, 43], [55, 42]], 0.5, 12, "UW2|curt|B1", 8);
  const curtB2 = natural([[61, 41], [70, 40.4], [79, 40], [87, 40]], 0.6, 16, "UW2|curt|B2", 8);
  const curtB3 = natural([[93, 40], [102, 40.8], [112, 42]], 0.5, 12, "UW2|curt|B3", 8);
  // the Deep Curtain (east): the Mere chamber ↔ the Deep Gallery; gaps at y 70–78 + 108–116
  const curtC1 = natural([[116, 6], [115.4, 30], [115, 50], [115, 70]], 0.7, 20, "UW2|curt|C1", 8);
  const curtC2 = natural([[117, 78], [116.4, 92], [116, 108]], 0.6, 14, "UW2|curt|C2", 8);
  const curtC3 = natural([[115, 116], [115.6, 132], [116, 146]], 0.6, 14, "UW2|curt|C3", 8);
  // the South Curtain: the Mere chamber ↔ the South Galleries; gaps at x 58–66 + 91–99
  const curtD1 = natural([[8, 114], [25, 113.6], [42, 113.2], [58, 113]], 0.6, 18, "UW2|curt|D1", 8);
  const curtD2 = natural([[66, 114], [78, 114.6], [91, 115]], 0.5, 14, "UW2|curt|D2", 8);
  const curtD3 = natural([[99, 114], [122, 114.6], [146, 115]], 0.6, 18, "UW2|curt|D3", 8);
  // the Stairfoot Crag — the cliff spur the Diminishing Stair descends (West Gallery, NW)
  const crag = natural([[11.5, 37.5], [14, 41.5], [14.5, 46.5], [13, 51]], 0.4, 8, "UW2|crag", 8);
  // free-standing gallery pillars (cavern reefs) — kept clear of the authored causeways
  const pillar1 = natural([[52, 87], [55, 90], [57, 93]], 0.3, 6, "UW2|pillar|1", 8);
  const pillar2 = natural([[100, 94], [103, 97], [105, 100]], 0.3, 6, "UW2|pillar|2", 8);
  const pillar3 = natural([[78, 132], [82, 135], [86, 137]], 0.3, 6, "UW2|pillar|3", 8);
  const RIDGES = [rimN, rimS, rimW1, rimW2, rimE1, rimE2, curtA1, curtA2, curtA3,
    curtB1, curtB2, curtB3, curtC1, curtC2, curtC3, curtD1, curtD2, curtD3, crag, pillar1, pillar2, pillar3];
  const RIDGE_GAPS = [WGATE, EGATE, [35.5, 36], [35.5, 76], [58, 43], [90, 40], [116, 74], [116, 112], [62, 113.5], [95, 114.5]];

  // ---- BLACK LAKES + CHANNELS (rivers[] — see THE VAULT in the header) -----------------------------
  // the Mere of Dominus: a RING band around the Bastion island (the island stays dry inside)
  const mereR = 9, mereCtrl = [];
  for (let a = 0; a <= 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    mereCtrl.push([+(BAST[0] + Math.cos(t) * mereR).toFixed(2), +(BAST[1] + Math.sin(t) * mereR).toFixed(2)]);
  }
  const lakeMere = natural(mereCtrl, 0.35, 12, "UW2|lake|mere", 6);
  // a round still pool: a small seeded-wobble circle centerline + a wide band = a cenote disc
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
  const lakeVigil = pool(8.5, 76.5, 1.6, "UW2|lake|vigil");
  const lakeLantern = natural([[22, 51], [26.5, 56], [30, 61], [29, 66]], 0.4, 10, "UW2|lake|lantern", 8);
  const lakeFerry = natural([[124, 64], [128, 72], [127, 82], [123, 90]], 0.4, 12, "UW2|lake|ferry", 8);
  const lakeCourt = natural([[93, 106], [97, 111], [100, 117]], 0.35, 8, "UW2|lake|court", 8);
  const lakeMeadow = natural([[58, 122], [64, 127], [70, 131]], 0.35, 8, "UW2|lake|meadow", 8);
  const CENOTE_AT = [[50, 16], [60, 26], [72, 12], [84, 27], [96, 15], [104, 28]];
  const cenotes = CENOTE_AT.map((c, i) => pool(c[0], c[1], 1.1, `UW2|cenote|${i}`));
  // flooded channels between the lakes
  const chLongdark = natural([[29, 64], [33, 69], [38, 72.5], [46, 74], [54, 74.6], [61.5, 74.9]], 0.5, 16, "UW2|ch|longdark");
  const chWeeping = natural([[76, 82.5], [82, 90], [88, 98], [93, 106]], 0.5, 14, "UW2|ch|weeping");
  const chBier = natural([[70, 131], [80, 127], [88, 121], [94, 117]], 0.4, 12, "UW2|ch|bier");
  // the Drowned Banquet — five flooded hall channels off the Mere's south band (EPIC `banquet`)
  const halls = [0, 1, 2, 3, 4].map((i) => {
    const hx = 64 + i * 3.5;
    return natural([[hx, 85], [hx + 0.5, 89], [hx, 93]], 0.15, 4, `UW2|hall|${i}`, 8);
  });
  const HALL_NAMES = ["The Welcoming Hall", "The Wine Hall", "The Meat Hall", "The Masque Hall", "The Sleeping Hall"];
  // magma veins (UW3's fire creeping up — SE floor)
  const veinEmber = natural([[132, 120], [138, 128], [141, 137]], 0.3, 8, "UW2|vein|ember", 8);
  const veinFirst = natural([[120, 132], [127, 138], [136, 143]], 0.3, 8, "UW2|vein|first", 8);
  const RIVERS = [lakeMere, lakeVigil, lakeLantern, lakeFerry, lakeCourt, lakeMeadow, ...cenotes,
    chLongdark, chWeeping, chBier, ...halls, veinEmber, veinFirst];

  // ---- CAUSEWAYS (trunk + chamber causeways) -------------------------------------------------------
  // RD1 the Wardens' Causeway: W gate → the Vigil crossing → the First Curtain gap → N shore of
  // the Mere → Mourngate junction → the Deep Curtain gap → the Ferry crossing → E gate.
  const roadWardens = natural(
    [[2, 75.5], [10, 75.8], [18, 76.3], [27.5, 76], [35.5, 76], [42, 74], [50, 70], [58, 66.5],
     [66, 63.8], [74, 63.5], [80, 65.5], [85.7, 69.5], [92, 71], [100, 72.5], [108, 73.5],
     [116, 74], [123, 74.8], [131, 75.4], [140, 75.8], [148.5, 76]],
    0.7, 34, "UW2|road|wardens");
  // RD2 the Bastion Causeway: the trunk junction by Mourngate → across the Mere ring → the island
  const roadBastion = natural([[80, 65.8], [76, 68.5], [72.8, 71.5], [69.9, 75]], 0.25, 10, "UW2|road|bastion", 8);
  // RD3 the Cenote Causeway: the trunk → the Gallery Curtain gap → Palewater Citadel + the field
  const roadCenote = natural([[58, 66.5], [57.5, 58], [58.5, 50], [59.5, 44], [61.5, 36], [65.5, 28], [70.2, 21]], 0.6, 22, "UW2|road|cenote");
  // RD4 the Meadows Causeway: the trunk → the South Curtain west gap → the Drowned Meadows
  const roadMeadows = natural([[42, 74], [44, 84], [47, 95], [52, 104], [58, 110], [62, 114.5], [66.6, 124.8]], 0.6, 22, "UW2|road|meadows");
  // RD5 the Court Causeway: Mourngate → the South Curtain east gap → the Sunken Court
  const roadCourt = natural([[92, 71], [90, 80], [90, 90], [92, 100], [94.5, 108], [96.5, 114.8]], 0.6, 20, "UW2|road|court");
  const HIGHWAYS = [roadWardens];
  const SECONDARIES_AUTHORED = [
    { id: "UW2-RD2", name: "The Bastion Causeway", pts: roadBastion },
    { id: "UW2-RD3", name: "The Cenote Causeway", pts: roadCenote },
    { id: "UW2-RD4", name: "The Meadows Causeway", pts: roadMeadows },
    { id: "UW2-RD5", name: "The Court Causeway", pts: roadCourt },
  ];
  // RD7 the Stairfoot Path (local, TERMINUS — the lore door's only approach, deliberately a
  // dead-end lane off the Lantern-dark's shore, never a causeway)
  const roadStair = natural([[41.1, 65.8], [34, 63], [27, 60.5], [21, 56], [17.5, 50], [16.5, 45.5]], 0.4, 14, "UW2|road|stair", 8);

  // ---- drowned-town shore lanes (the half-sunken quarters — small, never a grid) -------------------
  const urban = [];
  let dtN = 0;
  const addLane = (name, tier, pts, idOverride) => { dtN++; urban.push({ id: idOverride || `UW2-DT${String(dtN).padStart(2, "0")}`, name, tier, pts }); };
  // the Warden's Walk — the dead keep's island ring inside the Mere
  const walk = [];
  for (let a = 0; a <= 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    walk.push([+(BAST[0] + Math.cos(t) * 3.2).toFixed(2), +(BAST[1] + Math.sin(t) * 3.2).toFixed(2)]);
  }
  addLane("The Warden's Walk", "local", round2(walk), "UW2-DT-WALK");
  const keepTowns = [
    { k: kVigil, at: castleAt(kVigil), name: "Vigilwatch", lake: lakeVigil },
    { k: kFerry, at: castleAt(kFerry), name: "Ferrywatch", lake: lakeFerry },
    { k: kMeadow, at: castleAt(kMeadow), name: "Drownmeadow", lake: lakeMeadow },
    { k: kCourt, at: castleAt(kCourt), name: "Sunken Court", lake: lakeCourt },
    { k: kLantern, at: castleAt(kLantern), name: "Palelantern", lake: lakeLantern },
  ];
  for (const t of keepTowns) {
    const T = t.at;
    addLane(`${t.name} Crescent`, "local", natural([[T[0] - 2.1, T[1] - 1.2], [T[0], T[1] - 2.1], [T[0] + 2.1, T[1] - 1.0]], 0.2, 5, `UW2|town|${t.name}|cres`, 8));
    const { pt } = nearestOn([t.lake], T[0], T[1]);
    addLane(`${t.name} Landing`, "local", straight([[T[0], T[1]], [pt[0] + (T[0] - pt[0]) * 0.15, pt[1] + (T[1] - pt[1]) * 0.15]], 0.5));
  }

  // ---- castles (§3c + the header's pick rules) -----------------------------------------------------
  const CASTLES = [
    { id: "UW2-BASTION-DOMINUS", kind: "PALACE", at: BAST.slice(), townEstateId: bastion.parcelId,
      name: "The Bastion of Dominus", ref: "the dead keep on its own island in the Mere of Dominus — seat of the Shadow Warden, the biggest castle of Blackmere (WORLD-CHRONICLE: its throne is still warm); reached only by the Bastion Causeway" },
    { id: "UW2-CASTLE-MOURNGATE", kind: "CASTLE", at: castleAt(mourngate), townEstateId: mourngate.parcelId,
      name: "Mourngate Citadel", ref: "the causeway-gate citadel on the Wardens' Causeway at the Bastion Causeway junction — the drowned keep's outer gate (the Minas-Morgul mood)" },
    { id: "UW2-CASTLE-DEEPGATE", kind: "CASTLE", at: castleAt(deepgate), townEstateId: deepgate.parcelId,
      name: "Deepgate Citadel", ref: "the Deep Gallery citadel watching the Vault Gate — Blackmere's boss guards the final descent to Luxuria" },
    { id: "UW2-CASTLE-PALEWATER", kind: "CASTLE", at: castleAt(palewater), townEstateId: palewater.parcelId,
      name: "Palewater Citadel", ref: "the cenote-field citadel of the north galleries, on the Cenote Causeway among the Pale Cenotes" },
    { id: "UW2-KEEP-VIGILWATCH", kind: "KEEP", at: keepTowns[0].at.slice(), townEstateId: kVigil.parcelId,
      name: "Vigilwatch Keep", ref: "drowned-town keep over the Lake That Watches, first hold inside Blackmere's Gate" },
    { id: "UW2-KEEP-FERRYWATCH", kind: "KEEP", at: keepTowns[1].at.slice(), townEstateId: kFerry.parcelId,
      name: "Ferrywatch Keep", ref: "drowned-town keep at the Ferry Dark crossing before the Vault Gate" },
    { id: "UW2-KEEP-DROWNMEADOW", kind: "KEEP", at: keepTowns[2].at.slice(), townEstateId: kMeadow.parcelId,
      name: "Drownmeadow Keep", ref: "drowned-town keep on the Drowned Meadows shore, the South Galleries' market hold" },
    { id: "UW2-KEEP-SUNKENCOURT", kind: "KEEP", at: keepTowns[3].at.slice(), townEstateId: kCourt.parcelId,
      name: "Sunken Court Keep", ref: "drowned-town keep above the Sunken Court, where the Weeping Channel drains the Mere" },
    { id: "UW2-KEEP-PALELANTERN", kind: "KEEP", at: keepTowns[4].at.slice(), townEstateId: kLantern.parcelId,
      name: "Palelantern Keep", ref: "drowned-town keep on the Lantern-dark's shore — the last lamplight before the Stairfoot terrace" },
  ];

  // ---- rural web (sparse cavern hamlets — the organic countryside style, scaled down) --------------
  const netIdx = makeIndex();
  for (const h of HIGHWAYS) netIdx.addPolyline(h);
  for (const s of SECONDARIES_AUTHORED) netIdx.addPolyline(s.pts);
  netIdx.addPolyline(roadStair);
  for (const u of urban) netIdx.addPolyline(u.pts);
  const CITIES = [
    { c: BAST, r: 5 }, { c: mourngate.center, r: 4 }, { c: deepgate.center, r: 4 }, { c: palewater.center, r: 4 },
    ...keepTowns.map((t) => ({ c: t.k.center, r: 3.5 })),
  ];
  const inCity = (p) => CITIES.findIndex((ct) => dist(p, ct.c) < ct.r);
  function routeRoad(a, b, key) {
    const r = rng32(fnv1a("route|" + key));
    const build = (ctrl, amp, wl) => natural(ctrl, amp, wl, "UW2|road|" + key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(8, L * 0.35);
    let poly = build([a, [mx - (dy / L) * sway, my + (dx / L) * sway], b], 0.9, 26);
    if (crossings(poly, RIDGES) > 0) {                              // one reroute attempt via a curtain gap
      let gap = RIDGE_GAPS[0], gd = Infinity;
      for (const gpt of RIDGE_GAPS) { const d = Math.hypot(gpt[0] - mx, gpt[1] - my); if (d < gd) { gd = d; gap = gpt; } }
      const via = build([a, gap, b], 0.7, 26);
      if (crossings(via, RIDGES) < crossings(poly, RIDGES) && pathLen(via) < L * 2.2) poly = via;
      // else: accept — a gallery stair over a low stone lip
    }
    if (crossings(poly, RIVERS) > 2) {                              // causeway budget: ≤ 2 water crossings
      const flat = build([a, b], 0.4, 20);
      if (crossings(flat, RIVERS) <= crossings(poly, RIVERS)) poly = flat;
    }
    return poly;
  }
  const secondaries = SECONDARIES_AUTHORED.slice();
  let secN = 0;
  const addSecondary = (pts, name) => {
    secN++; secondaries.push({ id: `UW2-SEC${String(secN).padStart(3, "0")}`, name, pts });
    netIdx.addPolyline(pts);
  };
  const townName = (t) => `Hamlet ${t.id}`;
  // pass 1 — neighbour pair causeways with UNION-FIND component tracking (the HUB/BUS/ENT pattern)
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
    addSecondary(poly, `${townName(t)} – ${townName(nb)} Causeway`);
    union(t.id, nb.id);
    for (const id of [t.id, nb.id]) { if (!pairPolys.has(id)) pairPolys.set(id, []); pairPolys.get(id).push(poly); }
  }
  // pass 2 — connect every hamlet COMPONENT to the CONNECTED network
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
        const spur = natural([best.at, bpt], 0.3, 10, `UW2|road|spur|${best.id}`, 8);
        addSecondary(spur, `${townName(best)} Spur`);
        connIdx.addPolyline(spur);
      } else {
        addSecondary(poly, `${townName(best)} Link`);
        connIdx.addPolyline(poly);
      }
    }
    for (const t of members) for (const p of pairPolys.get(t.id) || []) connIdx.addPolyline(p);
  }

  // ---- local lanes: ~24 seeded MEDIUM hamlets → nearest network point (sparse cavern hamlets) ------
  const locals = [{ id: "UW2-RD7", name: "The Stairfoot Path", pts: roadStair }];
  const pickR = rng32(fnv1a("UW2|locals|pick"));
  const shuffled = mediums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(pickR() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  let locN = 0;
  for (const m of shuffled) {
    if (locN >= 24) break;
    const { pt, d } = netIdx.nearest(m.at[0], m.at[1]);
    if (!pt || d < 1.2 || d > 22) continue;
    const r = rng32(fnv1a("UW2|local|" + m.id));
    const mx = (m.at[0] + pt[0]) / 2, my = (m.at[1] + pt[1]) / 2;
    const dx = pt[0] - m.at[0], dy = pt[1] - m.at[1], L = Math.hypot(dx, dy) || 1;
    const sway = (r() - 0.5) * Math.min(3.5, L * 0.4);
    const poly = natural([m.at, [mx - (dy / L) * sway, my + (dx / L) * sway], pt], 0.5, 9, "UW2|road|loc|" + m.id, 8);
    if (nearFractionIdx(poly, netIdx, 2.0) > 0.75) continue;
    locN++;
    locals.push({ id: `UW2-LOC${String(locN).padStart(2, "0")}`, name: `Hamlet ${m.id} Lane`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- castle approaches: every castle sits ≤1u from the road network -------------------------------
  const approaches = [];
  for (const c of CASTLES) {
    const { pt, d } = netIdx.nearest(c.at[0], c.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([c.at, pt], 0.25, 8, "UW2|road|approach|" + c.id, 8);
    approaches.push({ id: `UW2-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${c.name} Approach`, pts: poly });
    netIdx.addPolyline(poly);
  }

  // ---- the Stairfoot's Hunt arrival parcel (deterministic; documented in the POI note) --------------
  const sfNearest = l3.singles.slice().sort((a, b) =>
    (dist(a.center, SF) - dist(b.center, SF)) || (a.parcelId < b.parcelId ? -1 : 1))[0];

  // ---- output ---------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "UW2 (Blackmere) macro feature network — the continuous-terrain field, dark-gothic drowned deep",
      author: "CF ParcelMap Design Agent (Agent D build), 2026-07-11 (regenerate with map-service/tools/world_terrain_uw2.mjs)",
      coords: "UW2 zone svg viewBox (0 0 150.48 150.52); y down. Same space as data/hexagon-city-source/l3/UW2.json parcel centers/bboxes — clip features to a parcel bbox/polygon directly in these coords. SEALED VAULT: no coast, no sky, no horizontal neighbour — all four edges are rock (atlas §2.9 mapVoid), so there is NO cross-zone geometric continuity contract; the zone's only doors are the two boss-gate POIs (W: UW1, E: UW3) and the secret Stairfoot (ENT).",
      grounding: "The world's densest zone (1,101 L2 + 29,777 L3 over a 150.5 square) and the wettest underworld level (atlas §2.9: E 0.3 / M 0.8 / T 0.65). Estate land fills the vault wall-to-wall; the 5 EPIC drowned-palace estates cluster at the lake-heart around the zone center — the Bastion island EPIC " + bastion.parcelId + " at (" + BAST.map((n) => n.toFixed(1)) + ") inside the Mere of Dominus ring, the Drowned Banquet EPIC " + banquet.parcelId + " on its south shore.",
      determinism: "generated by map-service/tools/world_terrain_uw2.mjs — deterministic estate picks (rules in the tool header) + authored control points, curvature = Catmull-Rom + seeded meander (fnv1a keys); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing).",
      widths: "zone-units at zone scale (1 parcel ≈ 0.65 u across); world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors). Lakes are honest zone-scale bands; the per-parcel river zoneCap clamp keeps battle maps playable.",
      vault: "CAVERN ZONE: ridges[] are cavern walls — the four RIM WALLS seal the vault edges (rock on every edge parcel; the only ridge breaks are the two boss-gate doorways) and the four interior CURTAINS (First/Gallery/Deep/South) carve the gallery-chamber chain the descent follows: West Gallery → Pale Cenote field (N) → the Mere chamber (center) → Deep Gallery (E) / South Galleries. Causeways pass the authored curtain gaps.",
      water: "rivers[] = BLACK LAKES + flooded channels (v1 band representation, the BUS/ENT sea precedent): the Lake That Watches (Blackmere's Gate threshold), the Lantern-dark, the MERE OF DOMINUS (a RING band — the Bastion island is the dry inside), the six Pale Cenotes, the Ferry Dark, the Sunken Court, the Drowned Meadows, the Longdark/Weeping/Bier channels, and the five Drowned-Banquet hall channels. Causeway crossings (roads over the bands) are the chokepoints. Two SE fissures carry `magma: true` (additive; ignored by worldfield v1; palette = the registry VOLCANIC family — UW3's fire creeping up).",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — lakes/channels are terrain/visual continuity, not hard blockers; fords/causeway-bridges come with the real-water phase (CONTINUOUS-WORLD-TERRAIN §4b).",
      era: "Blackmere = DARK-GOTHIC DROWNED KEEP (owner-locked §3b: cenote/flooded-karst causeways, Minas-Morgul mood) — causeways between black lakes, half-sunken quarters, the Keep on its own island, causeway gates. Urban = drowned-town shore lanes only (crescent + landing per keep town, the Warden's Walk on the Bastion island) — never a grid; rural = the organic hamlet web scaled DOWN (sparse cavern hamlets).",
      hierarchy: "roads carry tier: highway (1 trunk — the Wardens' Causeway, W boss-gate → E boss-gate: the army descent route) / secondary (the Bastion/Cenote/Meadows/Court causeways + the hamlet web: hamlets = the 43 GIANT+LARGE L2 estate anchors, curtain-gap reroutes, ≤2 water crossings each, connect-don't-double dedup) / local (drowned-town lanes, the Warden's Walk, the Stairfoot Path TERMINUS, ~24 seeded MEDIUM feeders, castle approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per CONTINUOUS-WORLD-TERRAIN §3c (castles on ESTATES; importance→size): PALACE the Bastion of Dominus (EPIC " + bastion.parcelId + ", the island keep) / CASTLE Mourngate (L3-subdivided GIANT " + mourngate.parcelId + ", the causeway gate) + Deepgate (" + deepgate.parcelId + ", the Vault Gate watch) + Palewater (" + palewater.parcelId + ", the cenote field) / the 5 drowned-town KEEPs (" + [kVigil, kFerry, kMeadow, kCourt, kLantern].map((p) => p.parcelId).join("/") + "). NO UW2 EPIC is L3-subdivided (0/5) — the Bastion battle map arrives with the pre-designed ESTATE maps (canon 4/5); citadels+keeps sit on playable L3 parcels and grow WALL/GATE/TOWER rings via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META,
      continuity: "NO horizontal neighbours (sealed vault). Vertical links only, all POIs: UP = Blackmere's Gate (W wall, connects UW1↔UW2 — the SECOND lock of the Binding, warden `the Lake That Watches`, the black lake at its threshold); DOWN = the Vault Gate (E wall, connects UW2↔UW3 — the door to Luxuria's Inferno Vault). Armies descend by these gates (the Shaft chain from Tianxia). The DIMINISHING STAIR's lower mouth (SECRET_ENTRANCE, connects ENT↔UW2, single file — never an army) is the solo/lore route; upper mouth = ENT-STAIR-DIMINISHING on Carnavale's midway.",
      creatures: "Phantom-kin drift Blackmere's lantern-dark (WORLD-CHRONICLE) — heaviest over the Lantern-dark and the Pale Cenote field; the pet layer reads data/zone-pet-population.json (Water/Dark affinity, atlas §2.9). Bosses at the lake-heart: the descent-guardian holds the Vault Gate approach.",
    },
    zone: "UW2",
    rivers: [
      { id: "UW2-LK-MERE", name: "The Mere of Dominus", width: 4.5, pts: lakeMere },
      { id: "UW2-LK-VIGIL", name: "The Lake That Watches", width: 5.0, pts: lakeVigil },
      { id: "UW2-LK-LANTERN", name: "The Lantern-dark", width: 5.5, pts: lakeLantern },
      { id: "UW2-LK-FERRY", name: "The Ferry Dark", width: 5.0, pts: lakeFerry },
      { id: "UW2-LK-COURT", name: "The Sunken Court", width: 5.0, pts: lakeCourt },
      { id: "UW2-LK-MEADOW", name: "The Drowned Meadows", width: 5.5, pts: lakeMeadow },
      ...cenotes.map((c, i) => ({ id: `UW2-LK-CENOTE${i + 1}`, name: `The Pale Cenotes (${i + 1})`, width: 2.8, pts: c })),
      { id: "UW2-CH1", name: "The Longdark Channel", width: 1.3, joins: "UW2-LK-MERE", pts: chLongdark },
      { id: "UW2-CH2", name: "The Weeping Channel", width: 1.4, joins: "UW2-LK-COURT", pts: chWeeping },
      { id: "UW2-CH3", name: "The Bier Channel", width: 1.3, joins: "UW2-LK-COURT", pts: chBier },
      ...halls.map((h, i) => ({ id: `UW2-HALL${i + 1}`, name: HALL_NAMES[i], width: 1.1, joins: "UW2-LK-MERE", pts: h })),
      { id: "UW2-MG1", name: "The Ember Seam", width: 0.7, magma: true, pts: veinEmber },
      { id: "UW2-MG2", name: "The First Vein", width: 0.6, magma: true, pts: veinFirst },
    ],
    roads: [
      { id: "UW2-RD1", name: "The Wardens' Causeway", tier: "highway", width: 0.5, pts: roadWardens },
      ...urban.map((u) => ({ id: u.id, name: u.name, tier: u.tier, width: 0.22, pts: u.pts })),
      ...secondaries.map((s) => ({ id: s.id, name: s.name, tier: "secondary", width: 0.32, pts: s.pts })),
      ...locals.map((l) => ({ id: l.id, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "UW2-RG-RIM-N", name: "The Vault Wall (North)", width: 2.4, pts: rimN },
      { id: "UW2-RG-RIM-S", name: "The Vault Wall (South)", width: 2.4, pts: rimS },
      { id: "UW2-RG-RIM-W1", name: "The Vault Wall (West, north reach)", width: 2.4, pts: rimW1 },
      { id: "UW2-RG-RIM-W2", name: "The Vault Wall (West, south reach)", width: 2.4, pts: rimW2 },
      { id: "UW2-RG-RIM-E1", name: "The Vault Wall (East, north reach)", width: 2.4, pts: rimE1 },
      { id: "UW2-RG-RIM-E2", name: "The Vault Wall (East, south reach)", width: 2.4, pts: rimE2 },
      { id: "UW2-RG-A1", name: "The First Curtain (north reach)", width: 1.8, pts: curtA1 },
      { id: "UW2-RG-A2", name: "The First Curtain (mid reach)", width: 1.8, pts: curtA2 },
      { id: "UW2-RG-A3", name: "The First Curtain (south reach)", width: 1.8, pts: curtA3 },
      { id: "UW2-RG-B1", name: "The Gallery Curtain (west reach)", width: 1.6, pts: curtB1 },
      { id: "UW2-RG-B2", name: "The Gallery Curtain (mid reach)", width: 1.6, pts: curtB2 },
      { id: "UW2-RG-B3", name: "The Gallery Curtain (east reach)", width: 1.6, pts: curtB3 },
      { id: "UW2-RG-C1", name: "The Deep Curtain (north reach)", width: 1.8, pts: curtC1 },
      { id: "UW2-RG-C2", name: "The Deep Curtain (mid reach)", width: 1.8, pts: curtC2 },
      { id: "UW2-RG-C3", name: "The Deep Curtain (south reach)", width: 1.8, pts: curtC3 },
      { id: "UW2-RG-D1", name: "The South Curtain (west reach)", width: 1.6, pts: curtD1 },
      { id: "UW2-RG-D2", name: "The South Curtain (mid reach)", width: 1.6, pts: curtD2 },
      { id: "UW2-RG-D3", name: "The South Curtain (east reach)", width: 1.6, pts: curtD3 },
      { id: "UW2-RG-CRAG", name: "The Stairfoot Crag", width: 1.2, pts: crag },
      { id: "UW2-RG-P1", name: "The Grey Sister", width: 1.2, pts: pillar1 },
      { id: "UW2-RG-P2", name: "The Pale Sister", width: 1.2, pts: pillar2 },
      { id: "UW2-RG-P3", name: "The Drowned Sister", width: 1.2, pts: pillar3 },
    ],
    castles: CASTLES,
    pois: [
      // SINGULAR PLACES (depth-layer 2, data/singulars.json on the hub): bastion_dominus,
      // drowned_banquet, and the Diminishing Stair's LOWER mouth (diminishing_stair_foot).
      { id: "UW2-BASTION", kind: "LANDMARK", at: BAST.slice(), singularId: "bastion_dominus", name: "The Bastion of Dominus",
        legend: "Seat of the Shadow Warden; its throne is still warm.",
        note: "the dead keep on its own island in the Mere of Dominus — EPIC estate " + bastion.parcelId + "; the Warden's Walk rings it, the Bastion Causeway is its only bridge" },
      { id: "UW2-BANQUET", kind: "LANDMARK", at: [71.5, 89], singularId: "drowned_banquet", name: "The Drowned Banquet",
        legend: "Five flooded halls still set for a feast no one finished.",
        note: "the drowned-palace EPIC " + banquet.parcelId + " on the Mere's south shore — its five hall channels (UW2-HALL1..5: Welcoming/Wine/Meat/Masque/Sleeping) flood off the lake; no one has cleared the table" },
      { id: "UW2-STAIR-FOOT", kind: "SECRET_ENTRANCE", at: SF.slice(), connects: ["ENT", "UW2"], secret: true,
        singularId: "diminishing_stair_foot", name: "The Foot of the Diminishing Stair",
        note: "the Diminishing Stair's LOWER mouth (docs/lore/WORLD-CHRONICLE.md — a fixed site somewhere in Blackmere; upper mouth = ENT-STAIR-DIMINISHING on Carnavale's carnival midway). PLACEMENT RULE (deterministic, authored): the cliff-foot terrace under the Stairfoot Crag in the West Gallery — the vault's remotest habitable corner, above the Lantern-dark's north-west shore, west of the First Curtain, reached only by the dead-end Stairfoot Path. At its foot the Cut happens — the Blood Scimitar rite of the descent. SINGLE FILE: one soul at a time, never an army (armies take the Shaft chain and break the sealed boss-gates). Hunt arrival parcel (nearest playable L3 single, computed): " + sfNearest.parcelId },
      { id: "UW2-CENOTES", kind: "LANDMARK", at: [78, 20.5], name: "The Pale Cenotes",
        note: "the six-pool cenote field of the north galleries — still black water under a stone sky; Palewater Citadel keeps its causeway" },
      { id: "UW2-GATE-UW1", kind: "GATE", at: WGATE.slice(), connects: ["UW1", "UW2"], boss: true, name: "Blackmere's Gate",
        note: "the SECOND lock of the Binding (WORLD-CHRONICLE) — the boss-gate up to Ironhold (UW1); warden: THE LAKE THAT WATCHES, the black lake at its very threshold (UW2-LK-VIGIL — the Wardens' Causeway crosses it under the warden's gaze). The army descent route (the Shaft chain); the Stair is the only other way in" },
      { id: "UW2-GATE-UW3", kind: "GATE", at: EGATE.slice(), connects: ["UW2", "UW3"], boss: true, name: "The Vault Gate",
        note: "the boss-gate down to Luxuria's Inferno Vault (UW3) — Blackmere's boss guards the final descent (atlas §2.9); Deepgate Citadel and Ferrywatch Keep watch its approach across the Ferry Dark" },
    ],
  };
  // heroParcels[] designation (canon decision 18 — rule in the header + world_hero_parcels.mjs)
  const heroStats = attachHeroParcels(out, uw2, l3.singles);
  return { out, stats: { towns: towns.length, urban: urban.length, secondaries: secondaries.length, locals: locals.length, approaches: approaches.length, heroStats, sfParcel: sfNearest.parcelId } };
}

// ---- build twice, byte-compare, write once ---------------------------------------------------------
const b1 = buildField();
const s1 = JSON.stringify(b1.out) + "\n";
const s2 = JSON.stringify(buildField().out) + "\n";
const h1 = createHash("sha256").update(s1).digest("hex");
const h2 = createHash("sha256").update(s2).digest("hex");
if (h1 !== h2) { console.error("NON-DETERMINISTIC BUILD:", h1, "≠", h2); process.exit(1); }
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/UW2.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}[${s.sizeClass}]=${s.deferred ? "DEFERRED" : s.count}`).join(" "));
console.log("stairfoot Hunt arrival parcel:", b1.stats.sfParcel);
console.log("wrote data/world-terrain/UW2.json sha256", h1.slice(0, 16),
  "| hamlets", b1.stats.towns,
  "| urban lanes", b1.stats.urban,
  "| secondary causeways", b1.stats.secondaries,
  "| locals", b1.stats.locals,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
