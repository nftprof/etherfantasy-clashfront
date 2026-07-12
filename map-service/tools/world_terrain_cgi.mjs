#!/usr/bin/env node
// world_terrain_cgi.mjs — REPRODUCIBLE generator for data/world-terrain/CGI.json (Olympus).
//
// Olympus = the CGI Founders' Isle, the world's ULTRAMODERN luxury enclave. Owner-locked era
// (CONTINUOUS-WORLD-TERRAIN §3b): **Dubai Palm Jumeirah + Monaco** — sculpted marina fingers,
// gated estate drives, ONE grand corniche; fortification row (§3b, quoted verbatim in _meta):
// "no war-castles — the estates ARE the monuments (private citadel-villas)". Canon:
// CONTINUOUS-WORLD-TERRAIN §3 (CGI row = Dubai Palm / Monaco aerial reference), §3b Olympus row,
// ZONE-REGISTRY (CGI = Olympus, Founders' Isle, zoneCode 01, SPECIAL family).
//
// ⚠ DATA FACT (checked 2026-07-10 against data/hexagon-city-source/ + data/zone-registry.json):
// CGI ships **ZERO parcels** — no L2 estates, no L3 singles, no source SVG viewBox, worldOffset
// null ("Ships NO extracted parcels yet — geometry + combat role owner-TBD"). Therefore:
//   • The isle geometry below is AUTHORED — a local viewBox "0 0 96 84" invented by this tool
//     (there is no source space to trace). When real CGI land ships, the field must be
//     re-registered onto the real geometry (documented in _meta.coords).
//   • Deterministic estate picks are N/A (nothing to pick from). All placements are authored
//     control points; the only randomness is fnv1a-seeded meander/wobble/drive-length jitter.
//   • CASTLES: per the §3b Olympus row there are NO war-castles, and there is no headland LARGE
//     estate to anchor even a watchtower KEEP to (zero estates exist) — so castles: [] with the
//     canon row quoted in _meta.castles. heroParcels (§3d) therefore does not apply; the shared
//     module (attachHeroParcels) is still invoked exactly as in world_terrain_bus.mjs with the
//     truthful empty estate/L3 inputs — a no-op over an empty castles[].
//
// THE FOUNDERS' ISLE (the "Palm + Monaco" of the world):
//   • ONE GRAND CORNICHE — "The Grand Corniche", the isle's single highway loop hugging the
//     shore (the Monaco corniche move). Everything attaches to it.
//   • PALM OLYMPIA — the sculpted marina-finger peninsula off the SOUTH shore (the Palm
//     Jumeirah silhouette in road+quay form): the Palm Causeway trunk, 10 finger-quay fronds
//     (5 per side, founders' names), the Crescent of Olympus breakwater arc wrapping it, the
//     Crown ring at the trunk tip + the Crown Tunnel out to the crescent. The water is REAL:
//     sculpted lagoon channels flank every frond (rivers[]) + the Palm Lagoon arc between the
//     frond tips and the crescent — a frond battle map gets water on both sides.
//   • PORT OLYMPUS — the yacht harbour in the sculpted east bay (Monaco's Port Hercule):
//     harbour basin water, quay, 3 finger piers, harbour street off the corniche.
//   • GATED ESTATE DRIVES — 10 private drives off the corniche, curving inland to the villa
//     terraces and DEAD-ENDING there (gated exclusivity is the aerial signature; §3b allows
//     dead-ends here). No through-traffic web: the corniche IS the network.
//   • RELIEF — the Founders' Rock (the Monaco rock, east headland) + Olympus Rise (the central
//     hill); two short nectar streams off the Rise (small isle: no major rivers).
//
// THE SEA (v1 representation, the BUS precedent): worldfield.js consumes rivers/roads/ridges
// only, so the surrounding ocean ships as ONE wide `rivers[]` band (id CGI-SEA) tracing the
// authored CLOSED coastline; the raw coastline is ALSO exported as top-level `coast[]`
// (additive; ignored by worldfield v1) for the future sea-fill kind. Island ⇒ sea on EVERY
// side; the palm + crescent + piers extend seaward of the coast by design.
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_cgi.mjs
import { writeFileSync, mkdirSync } from "node:fs";
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
// a PLANNED straight quay/drive — sampled, no meander (the sculpted ultramodern line)
function straight(ctrl, step = 0.6) {
  const out = [ctrl[0].slice()];
  for (let i = 1; i < ctrl.length; i++) {
    const [ax, ay] = ctrl[i - 1], [bx, by] = ctrl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return round2(out);
}
// a sculpted ARC (crescent / lagoon / crown ring) with a tiny seeded radial wobble
function arc(c, r, a0, a1, n, key, wobble = 0.04) {
  const rr = rng32(fnv1a(key));
  const ph = [rr() * 6.283, rr() * 6.283];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const w = wobble * (Math.sin(2 * Math.PI * 3 * t + ph[0]) * 0.7 + Math.sin(2 * Math.PI * 7 * t + ph[1]) * 0.3);
    out.push([+(c[0] + Math.cos(a) * (r + w)).toFixed(2), +(c[1] + Math.sin(a) * (r + w)).toFixed(2)]);
  }
  return out;
}
const nearestOn = (set, x, y) => {
  let best = null, bd = Infinity;
  for (const line of set) for (const p of line) {
    const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
    if (d < bd) { bd = d; best = p; }
  }
  return { pt: best, d: Math.sqrt(bd) };
};

// =================================================================================================
function buildField() {
  const C = [45, 40];                                              // isle centroid (authored)
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- THE COAST (authored CLOSED loop, clockwise from the west; y down; sea = OUTSIDE) ---------
  // Sculpted-isle shore: the Founders' Rock headland east, the Port Olympus bay notch on the
  // east shore, the Palm root flat on the south shore. Seam on the plain west shore.
  const COAST_CTRL = [
    [16, 40], [18, 32], [22, 25], [28, 18], [35, 13], [43, 10.5], [52, 11], [60, 14],
    [67, 19], [72, 26], [74.5, 33], [74, 39],
    [70, 42], [66.5, 44.5], [70, 48], [71, 53],                    // the Port Olympus bay notch
    [67, 58], [61, 62.5], [54, 65], [48.5, 66], [43, 66], [36, 64],
    [29, 60], [23, 54], [18.5, 47], [16, 40],
  ];
  const coast = natural(COAST_CTRL, 0.45, 26, "CGI|coast", 8);

  // ---- PALM OLYMPIA — the sculpted marina-finger peninsula (south shore, seaward) ----------------
  const ROOT = [45.5, 62.5];                                       // trunk head on the corniche
  const TIP = [45.5, 74.5];                                        // trunk tip (the Crown)
  const PALM_C = [45.5, 70.5];                                     // crescent/lagoon center
  const FROND_ANG = (38 * Math.PI) / 180;                          // frond droop off horizontal
  const FROND_Y = [66.8, 68.0, 69.2, 70.4, 71.6];                  // spine attach points (trunk x)
  const FROND_LEN = [6.0, 5.6, 5.0, 4.2, 3.2];                     // outer→inner reach
  const FROND_NAMES = ["Genesis", "Vision", "Charter", "Covenant", "Legacy",
    "Beacon", "Halcyon", "Zenith", "Aurora", "Meridian"];          // founders' virtues, E side first
  const fronds = [];                                               // { name, side, pts, spine, dir, len }
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? 1 : -1;                                // 0 = east fronds, 1 = west
    for (let i = 0; i < FROND_Y.length; i++) {
      const spine = [45.5, FROND_Y[i]];
      const dir = [sx * Math.cos(FROND_ANG), Math.sin(FROND_ANG)];
      const len = FROND_LEN[i];
      const mid = [spine[0] + dir[0] * len * 0.55, spine[1] + dir[1] * len * 0.55];
      const end = [spine[0] + dir[0] * len, spine[1] + dir[1] * len];
      const name = `${FROND_NAMES[side * 5 + i]} Frond`;
      fronds.push({ name, side: sx, spine, dir, len,
        pts: natural([spine, [mid[0], mid[1] + 0.25], end], 0.12, 6, `CGI|frond|${name}`, 8) });
    }
  }
  // sculpted lagoon channels FLANKING each frond (real water for the finger-quay battle maps).
  // Offset 0.30 u: a frond parcel is ~0.65–0.7 u across, so at ±0.30 the painted channel band
  // (zone cap 0.26 ⇒ ±0.13) lands INSIDE the parcel polygon — water on both sides of the quay.
  const channels = [];
  for (const f of fronds) {
    const perp = [-f.dir[1], f.dir[0]];                            // one normal; both offsets used
    for (const s of [0.3, -0.3]) {
      const a = [f.spine[0] + f.dir[0] * 0.6 + perp[0] * s, f.spine[1] + f.dir[1] * 0.6 + perp[1] * s];
      const b = [f.spine[0] + f.dir[0] * (f.len + 0.8) + perp[0] * s, f.spine[1] + f.dir[1] * (f.len + 0.8) + perp[1] * s];
      channels.push({ name: `${f.name} Channel ${s > 0 ? "S" : "N"}`, pts: straight([round2([a])[0], round2([b])[0]], 0.5) });
    }
  }
  const crescent = arc(PALM_C, 9.2, (150 * Math.PI) / 180, (30 * Math.PI) / 180, 40, "CGI|crescent", 0.06);
  const lagoonArc = arc(PALM_C, 7.6, (150 * Math.PI) / 180, (30 * Math.PI) / 180, 36, "CGI|lagoon", 0.05);
  const trunk = straight([ROOT, TIP], 0.5);
  const crownRing = arc(TIP, 1.2, 0, 2 * Math.PI, 20, "CGI|crown", 0.02);
  const crownTunnel = straight([[45.5, 74.5], [45.5, 79.6]], 0.5); // tip → crescent (the Palm-tunnel move)

  // ---- THE GRAND CORNICHE — the ONE highway, an inner loop hugging the shore ---------------------
  const CORNICHE_CTRL = [
    [22, 40], [24, 31], [29, 24], [36, 18.5], [44, 16], [52, 16.5], [59, 19.5], [65, 25],
    [68, 31], [68.5, 37], [63.5, 43], [64, 49], [61, 55], [55, 59.5], [49, 62.3],
    ROOT.slice(), [41, 62], [34, 59.5], [27.5, 54], [23.5, 47], [22, 40],
  ];
  const corniche = natural(CORNICHE_CTRL, 0.35, 22, "CGI|corniche", 8);

  // ---- PORT OLYMPUS — the yacht harbour in the east bay ------------------------------------------
  const basin = natural([[71.5, 42.3], [67.3, 44.5], [71.5, 47.5]], 0.1, 8, "CGI|basin", 8); // harbour water
  const quay = straight([[68.2, 42.9], [66.9, 44.5], [68.2, 46.6]], 0.4);                    // the quay walk
  const piers = [
    straight([[67.7, 43.4], [69.6, 43.9]], 0.4),
    straight([[67.2, 44.5], [69.3, 44.9]], 0.4),
    straight([[67.7, 45.9], [69.6, 45.6]], 0.4),
  ];
  const harbourSt = natural([[64, 45.3], [65.6, 44.9], [66.9, 44.6]], 0.08, 6, "CGI|harbourst", 8);

  // ---- GATED ESTATE DRIVES — 10 private dead-end drives off the corniche -------------------------
  // Anchors are AUTHORED corniche-vertex picks (clear of the palm root + the bay); the drive
  // curves inland toward the villa terraces with seeded sway + length and DEAD-ENDS (gated).
  const DRIVE_NAMES = ["Pantheon Drive", "Ambrosia Drive", "Elysian Drive", "Aegis Drive", "Argent Drive",
    "Solstice Drive", "Titan's Drive", "Laurel Drive", "Oracle Drive", "Helios Drive"];
  const DRIVE_ANCHORS = [[24, 31], [29, 24], [36, 18.5], [52, 16.5], [59, 19.5],
    [68, 31], [61, 55], [34, 59.5], [27.5, 54], [23.5, 47]];
  const drives = [];
  const courts = [];                                               // the gated villa compound at each drive's end
  DRIVE_ANCHORS.forEach((anchor, i) => {
    const a = nearestOn([corniche], anchor[0], anchor[1]).pt;      // snap to the built corniche
    const r = rng32(fnv1a("CGI|drive|" + DRIVE_NAMES[i]));
    const len = 2.5 + r() * 2.0;
    const dx = C[0] - a[0], dy = C[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const end = [a[0] + (dx / L) * len, a[1] + (dy / L) * len];
    const sway = (r() - 0.5) * 1.6;
    const mid = [(a[0] + end[0]) / 2 - (dy / L) * sway, (a[1] + end[1]) / 2 + (dx / L) * sway];
    drives.push({ name: DRIVE_NAMES[i], pts: natural([a, mid, end], 0.18, 8, `CGI|drivepts|${DRIVE_NAMES[i]}`, 8) });
    // the villa COURT ring — the walled compound the drive gates into (exclusivity from the air)
    const cc = [end[0] + (dx / L) * 0.55, end[1] + (dy / L) * 0.55];
    courts.push({ name: DRIVE_NAMES[i].replace(/ Drive$/, "").replace(/'s$/, "") + " Court",
      pts: arc(round2([cc])[0], 0.55, 0, 2 * Math.PI, 14, `CGI|court|${DRIVE_NAMES[i]}`, 0.015) });
  });

  // ---- relief + streams (small isle: short nectar streams, no major rivers) ----------------------
  const rock = natural([[68.8, 26.5], [70.8, 29.5], [72, 32.8]], 0.5, 10, "CGI|ridge|rock"); // seaward of the corniche, the Monaco rock

  const rise = natural([[38, 33], [44, 36], [50, 38]], 0.7, 12, "CGI|ridge|rise");
  // streams run PAST the coastline into the sea band (a stream that dies on the beach reads wrong)
  const nectar = natural([[47, 36], [41, 31], [34, 26], [28, 22], [24.8, 18.6]], 0.35, 12, "CGI|stream|nectar");
  const ambrosia = natural([[44, 40], [38, 46], [32, 52], [27, 57], [23.2, 60.8]], 0.35, 12, "CGI|stream|ambrosia");

  // ---- POIs + approach drives (every POI reachable: ≤1u from the road network or approached) -----
  const POIS = [
    { id: "CGI-PORT-OLYMPUS", kind: "SEA_PORT", at: [67.3, 44.8], note: "Port Olympus — the yacht harbour in the sculpted east bay (Monaco's Port Hercule): basin, quay, 3 finger piers off the Grand Corniche" },
    { id: "CGI-CROWN", kind: "LANDMARK", at: [45.5, 74.5], note: "The Crown of Olympus — the palm-tip ring at the end of the Palm Causeway; the Crown Tunnel runs on to the Crescent breakwater" },
    { id: "CGI-SKYDOCK", kind: "AIRSHIP_PORT", at: [52, 20], note: "Olympus Skydock — the founders arrive by air; private airship berth on the north slope above the Grand Corniche" },
    { id: "CGI-LANDING", kind: "SEA_PORT", at: [19.5, 42], note: "Genesis Landing — the west-shore ferry quay, the isle's public sea entry (an island has no land gates)" },
  ];
  const roadsAll = [corniche, trunk, crownRing, crownTunnel, crescent, quay, ...piers, harbourSt,
    ...fronds.map((f) => f.pts), ...drives.map((d) => d.pts), ...courts.map((c) => c.pts)];
  const approaches = [];
  for (const p of POIS) {
    const { pt, d } = nearestOn(roadsAll, p.at[0], p.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([p.at, pt], 0.15, 8, "CGI|approach|" + p.id, 8);
    approaches.push({ id: `CGI-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${p.id.replace("CGI-", "").replace(/-/g, " ")} Approach`, pts: poly });
    roadsAll.push(poly);
  }

  // ---- output --------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "CGI (Olympus) macro feature network — the continuous-terrain field, the Founders' Isle",
      author: "Map-maker session, 2026-07-10 (regenerate with map-service/tools/world_terrain_cgi.mjs)",
      coords: "AUTHORED local viewBox (0 0 96 84); y down. ⚠ CGI ships NO source geometry (data/hexagon-city-source has no CGI parcels/SVG; zone-registry: l2Estates 0, l3Singles 0, worldOffset null) — this space is invented by the generator at the atlas zone scale (1 future parcel ≈ 0.65 u across, the 10 extracted zones' density). When real Olympus land ships, re-register the field onto the real viewBox before windowing real parcels.",
      grounding: "A small sculpted luxury isle (~58×56 u ≈ 1/6 the BUS linear span): centroid (45,40); the Founders' Rock headland east, the Port Olympus bay notch on the east shore, PALM OLYMPIA — the marina-finger peninsula — seaward off the south shore, the Crescent breakwater wrapping it. Sea on every side (island).",
      determinism: "generated by map-service/tools/world_terrain_cgi.mjs — authored control points; the only randomness is fnv1a-seeded meander/arc-wobble/drive jitter (mulberry32; no Math.random/Date.now); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing). Estate picks: N/A — the zone ships zero estates (see coords note); every placement is authored.",
      widths: "zone-units at zone scale (1 future parcel ≈ 0.65 u across); world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors).",
      sea: "v1: the ocean ships as the wide rivers[] band CGI-SEA tracing the authored CLOSED coastline (worldfield.js consumes rivers/roads/ridges only) — shore parcels window it as their sea water. The raw coastline is also exported as coast[] (additive, ignored by worldfield v1) for a future sea-fill kind. ISLAND: sea = everything outside the loop; the palm, crescent, piers and the Crown extend seaward of the coast by design, and the sculpted lagoon channels + Port Olympus basin ship as additional rivers[] so marina-finger battle maps get REAL water on both sides of the quay.",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — sea/lagoon are terrain/visual continuity, not hard blockers; fords/bridges come with the real-water phase (CONTINUOUS-WORLD-TERRAIN §4b).",
      era: "Olympus = ULTRAMODERN luxury enclave (owner-locked §3b: Dubai Palm / Monaco) — sculpted marina fingers, gated estate drives, ONE grand corniche. Exclusivity is the aerial signature: private drives DEAD-END at villa terraces (no through web); the corniche is the only trunk. Straight/sculpted lines are correct here (the planned-resort analog of the BUS modern-grid rule).",
      hierarchy: "roads carry tier: highway (ONE — the Grand Corniche loop) / secondary (the Palm Causeway trunk, the Crescent of Olympus, Port Olympus Harbour Street) / local (10 finger-quay fronds, the Crown ring + tunnel, harbour quay + 3 piers, 10 gated estate drives each dead-ending into its walled villa COURT ring, POI approaches; the 20 flanking lagoon channels are WATER — rivers[], not roads). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles: [] — CANON (CONTINUOUS-WORLD-TERRAIN §3b, Olympus row, quoted): fortification = \"no war-castles — the estates ARE the monuments (private citadel-villas)\". Additionally the zone ships ZERO estates today (zone-registry l2Estates 0), so there is no headland LARGE estate that could anchor even a lighthouse KEEP under §3c; none is emitted. Defense on Olympus is the player-built CoC layer (canon decision 9).",
      heroParcels: HERO_PARCELS_META + " — N/A for CGI: castles[] is empty by canon (no war-castles) and the zone ships no estates/L3 parcels; the shared attachHeroParcels module runs as a no-op.",
      continuity: "ISLAND — no land frontier, so no cross-zone road/river edge contract. Entries are by SEA (Genesis Landing ferry quay, Port Olympus) + AIR (Olympus Skydock); no GATE pois exist. worldOffset is null in zone-layout/zone-registry — world placement is owner-TBD; nothing windows across a zone border.",
    },
    zone: "CGI",
    rivers: [
      { id: "CGI-SEA", name: "The Founders' Sea (shore band)", width: 3.0, pts: coast },
      { id: "CGI-LAGOON", name: "The Palm Lagoon", width: 1.3, pts: lagoonArc },
      { id: "CGI-BASIN", name: "Port Olympus Basin", width: 1.6, pts: basin },
      ...channels.map((ch, i) => ({ id: `CGI-CH${String(i + 1).padStart(2, "0")}`, name: ch.name, width: 0.9, pts: ch.pts })),
      { id: "CGI-ST1", name: "Nectar Brook", width: 0.5, pts: nectar },
      { id: "CGI-ST2", name: "Ambrosia Run", width: 0.5, pts: ambrosia },
    ],
    coast: [
      { id: "CGI-COAST", name: "The Olympus coastline", seaSide: "OUTSIDE (island — closed loop, clockwise)", pts: coast },
    ],
    roads: [
      { id: "CGI-RD-CORNICHE", name: "The Grand Corniche", tier: "highway", width: 0.5, pts: corniche },
      { id: "CGI-RD-CAUSEWAY", name: "The Palm Causeway", tier: "secondary", width: 0.32, pts: trunk },
      { id: "CGI-RD-CRESCENT", name: "The Crescent of Olympus", tier: "secondary", width: 0.3, pts: crescent },
      { id: "CGI-RD-CROWN", name: "The Crown Ring", tier: "local", width: 0.22, pts: crownRing },
      { id: "CGI-RD-TUNNEL", name: "The Crown Tunnel", tier: "local", width: 0.22, pts: crownTunnel },
      ...fronds.map((f, i) => ({ id: `CGI-FR${String(i + 1).padStart(2, "0")}`, name: f.name, tier: "local", width: 0.24, pts: f.pts })),
      { id: "CGI-RD-HARBOUR", name: "Port Olympus Harbour Street", tier: "secondary", width: 0.3, pts: harbourSt },
      { id: "CGI-RD-QUAY", name: "Port Olympus Quay", tier: "local", width: 0.22, pts: quay },
      ...piers.map((p, i) => ({ id: `CGI-PIER${i + 1}`, name: `Port Olympus Pier ${i + 1}`, tier: "local", width: 0.2, pts: p })),
      ...drives.map((d, i) => ({ id: `CGI-DR${String(i + 1).padStart(2, "0")}`, name: d.name, tier: "local", width: 0.22, pts: d.pts })),
      ...courts.map((c, i) => ({ id: `CGI-CT${String(i + 1).padStart(2, "0")}`, name: c.name, tier: "local", width: 0.2, pts: c.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "CGI-RG1", name: "The Founders' Rock", width: 1.4, pts: rock },
      { id: "CGI-RG2", name: "Olympus Rise", width: 1.6, pts: rise },
    ],
    castles: [],
    pois: POIS,
  };
  // heroParcels designation (canon decision 18) — invoked exactly as in world_terrain_bus.mjs,
  // with the TRUTHFUL inputs: CGI ships zero L2 estates + zero L3 singles, and castles[] is
  // empty by canon (§3b Olympus row) ⇒ a documented no-op.
  const heroStats = attachHeroParcels(out, [], []);
  return { out, stats: { fronds: fronds.length, channels: channels.length, drives: drives.length, courts: courts.length, approaches: approaches.length, heroStats } };
}

// ---- build twice, byte-compare, write once --------------------------------------------------------
const b1 = buildField();
const s1 = JSON.stringify(b1.out) + "\n";
const s2 = JSON.stringify(buildField().out) + "\n";
const h1 = createHash("sha256").update(s1).digest("hex");
const h2 = createHash("sha256").update(s2).digest("hex");
if (h1 !== h2) { console.error("NON-DETERMINISTIC BUILD:", h1, "≠", h2); process.exit(1); }
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/CGI.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.length ? b1.stats.heroStats.map((s) => `${s.id}=${s.count}`).join(" ") : "N/A (castles[] empty by canon — no war-castles on Olympus; zone ships no estates)");
console.log("wrote data/world-terrain/CGI.json sha256", h1.slice(0, 16),
  "| fronds", b1.stats.fronds,
  "| lagoon channels", b1.stats.channels,
  "| estate drives", b1.stats.drives,
  "| villa courts", b1.stats.courts,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| rivers", b1.out.rivers.length,
  "| castles", b1.out.castles.length);
