#!/usr/bin/env node
// world_terrain_kol.mjs — REPRODUCIBLE generator for data/world-terrain/KOL.json (Fortuna).
//
// Fortuna = the KOL Influencers' Isle, the world's MODERN spectacle strip. Owner-locked era
// (CONTINUOUS-WORLD-TERRAIN §3b): **Las Vegas Strip + Monte Carlo waterfront** — ONE grand
// strip/promenade as the spine, plaza stages, casino waterfront spectacle; fortification:
// "showpiece citadel-casino at the strip's head". Canon: CONTINUOUS-WORLD-TERRAIN §3 (KOL row),
// §3b Fortuna row, §3c/§3d (castles + heroParcels), ZONE-REGISTRY (KOL = Fortuna, Influencers'
// Isle, zoneCode 08, SPECIAL family).
//
// ⚠ DATA FACT (checked 2026-07-10 against data/hexagon-city-source/ + data/zone-registry.json):
// KOL ships **ZERO parcels** — no L2 estates, no L3 singles, no source SVG viewBox, worldOffset
// null ("Ships NO extracted parcels yet — geometry + combat role owner-TBD"). Therefore:
//   • The isle geometry below is AUTHORED — a local viewBox "0 0 88 96" invented by this tool
//     (there is no source space to trace). When real Fortuna land ships, the field must be
//     re-registered onto the real geometry (documented in _meta.coords).
//   • Deterministic estate picks are N/A (nothing to pick from); every placement is authored.
//   • THE CITADEL-CASINO is emitted per canon (§3b: "showpiece citadel-casino at the strip's
//     head") but CANNOT be estate-anchored (§3c wants the biggest suitable estate; zero exist):
//     it ships WITHOUT townEstateId, and its heroParcels designation is DEFERRED. The shared
//     attachHeroParcels module is invoked exactly as in world_terrain_bus.mjs with the truthful
//     empty estate/L3 inputs; its generic no-quota note (written for SMALL/MEDIUM estates) is
//     then REPLACED with the accurate no-land-ships-yet deferral so downstream readers aren't
//     misled. When Fortuna land ships: re-run §3c — the biggest estate class present takes the
//     top role — then heroParcels re-derives from real L3 parcels.
//
// THE INFLUENCERS' ISLE (the "Vegas + Monte Carlo" of the world):
//   • THE GOLDEN STRIP — ONE grand highway spine, dead straight (the Las Vegas Boulevard move),
//     running from the casino waterfront on the south shore up to the citadel-casino on the
//     north head. The strip's head IS the citadel forecourt.
//   • THE FORTUNA GRAND (kind CASTLE) — the showpiece citadel-casino at the strip's head,
//     set against the Jackpot Bluff. The only fortification on the isle (§3b row).
//   • 3 PLAZA STAGES on the strip — the Stage of Mirrors / Star Plaza / the Fountain Circus —
//     each a ring road around the stage POI, with a cross street (a spectacle axis) tying the
//     two flanking boulevards through it.
//   • BOULEVARD OF FAME (west) + BOULEVARD OF FORTUNE (east) — the parallel service
//     boulevards; Mirage Row + Golden Row — the dense lower-strip casino block rows.
//   • MONTE CARLO WATERFRONT — the Promenade de Fortune along the south shore, Fortune Quay +
//     3 piers + the yacht ANCHORAGE water off it, the Wheel of Fortune landmark with its
//     circus ring, Harbour Steps down from the promenade.
//   • THE BACKLOTS ROAD — the scenic secondary looping the quiet west side from the promenade
//     up to the strip head (also the citadel's second approach — encirclement per decision 18);
//     a small organic hinterland web off it (2 seeded dead-end lanes — the established rural
//     style scaled way down; a spectacle isle has almost no countryside).
//   • RELIEF — the Jackpot Bluff behind the citadel; Lucky Run, one short stream west
//     (small isle: no major rivers).
//
// THE SEA (v1 representation, the BUS precedent): worldfield.js consumes rivers/roads/ridges
// only, so the surrounding ocean ships as ONE wide `rivers[]` band (id KOL-SEA) tracing the
// authored CLOSED coastline; the raw coastline is ALSO exported as top-level `coast[]`
// (additive; ignored by worldfield v1) for the future sea-fill kind. Island ⇒ sea on EVERY
// side; the piers + the Fortune Anchorage extend seaward of the coast by design.
//
// Deterministic: fnv1a-seeded mulberry32 only — NO Math.random / Date.now. Built TWICE and
// byte-compared (sha256) before the single atomic full-file write.
//
// Usage: node map-service/tools/world_terrain_kol.mjs
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
// a PLANNED straight street (the strip / boulevard / quay) — sampled, no meander
function straight(ctrl, step = 0.6) {
  const out = [ctrl[0].slice()];
  for (let i = 1; i < ctrl.length; i++) {
    const [ax, ay] = ctrl[i - 1], [bx, by] = ctrl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return round2(out);
}
// a spectacle RING (plaza stage / wheel circus) with a tiny seeded radial wobble
function ring(c, r, n, key, wobble = 0.03) {
  const rr = rng32(fnv1a(key));
  const ph = [rr() * 6.283, rr() * 6.283];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = 2 * Math.PI * t;
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
  // ---- THE COAST (authored CLOSED loop, clockwise from the west; y down; sea = OUTSIDE) ---------
  // N head = the citadel bluff headland; S shore = the Monte Carlo casino waterfront.
  const COAST_CTRL = [
    [18, 52], [20, 38], [25, 27], [32, 19], [40, 14], [48, 13], [56, 16], [63, 23],
    [67, 32], [68, 42], [67, 52], [64, 62], [58, 71], [50, 77], [42, 79], [33, 76],
    [25, 69], [20, 61], [18, 52],
  ];
  const coast = natural(COAST_CTRL, 0.45, 26, "KOL|coast", 8);

  // ---- THE GOLDEN STRIP + the citadel-casino at its head -----------------------------------------
  const CITADEL = [44, 22.7];                                      // the Fortuna Grand (on the head)
  const STRIP_FOOT = [44, 74.8];                                   // the waterfront end
  const STRIP_HEAD = [44, 22.95];                                  // the citadel forecourt
  const strip = straight([STRIP_FOOT, STRIP_HEAD], 0.5);
  const PLAZAS = [
    { id: "KOL-PLAZA-MIRRORS", name: "The Stage of Mirrors", at: [44, 33] },
    { id: "KOL-PLAZA-STAR", name: "Star Plaza", at: [44, 46] },
    { id: "KOL-PLAZA-FOUNTAIN", name: "The Fountain Circus", at: [44, 60] },
  ];
  const plazaRings = PLAZAS.map((p) => ring(p.at, 1.8, 24, `KOL|plaza|${p.id}`));
  const blvdFame = straight([[39.5, 30], [39.5, 66]], 0.55);
  const blvdFortune = straight([[48.5, 30], [48.5, 66]], 0.55);
  const crossStreets = PLAZAS.map((p) => straight([[39.5, p.at[1]], [48.5, p.at[1]]], 0.5));
  const rowMirage = straight([[41.75, 56], [41.75, 74.6]], 0.55);  // rows run down INTO the promenade
  const rowGolden = straight([[46.25, 56], [46.25, 74.2]], 0.55);

  // ---- MONTE CARLO WATERFRONT ---------------------------------------------------------------------
  const promenade = natural([[27, 67], [33, 72], [40, 74.5], [46, 75], [52, 73.5], [58, 69.5], [62, 65]],
    0.15, 14, "KOL|promenade", 8);
  const WHEEL = [52.5, 71.5];
  const wheelRing = ring(WHEEL, 1.2, 20, "KOL|wheel");
  const quay = straight([[40.5, 77.2], [47.5, 76.4]], 0.4);
  const piers = [
    straight([[42, 77.0], [42.2, 78.7]], 0.4),
    straight([[44, 76.8], [44.3, 78.5]], 0.4),
    straight([[46, 76.6], [46.4, 78.3]], 0.4),
  ];
  const harbourSteps = straight([[44, 75.0], [44, 76.8]], 0.4);
  const anchorage = natural([[37, 80.5], [44, 81], [51, 79.5]], 0.1, 10, "KOL|anchorage", 8); // yacht water

  // ---- THE BACKLOTS ROAD + the tiny organic hinterland (west side) --------------------------------
  const backlots = natural([[27, 67], [24, 58], [24, 48], [27, 38], [32, 30], [38, 25], [43.6, 23.4]],
    0.6, 24, "KOL|backlots");
  const lanes = [];
  const LANE_SPECS = [                                             // seeded dead-end hamlet lanes
    { name: "Hermit's Lane", from: [24, 48], dirTo: [20.8, 50.5] },
    { name: "Orchard Lane", from: [27, 38], dirTo: [31.5, 42] },
  ];
  for (const spec of LANE_SPECS) {
    const a = nearestOn([backlots], spec.from[0], spec.from[1]).pt;
    const r = rng32(fnv1a("KOL|lane|" + spec.name));
    const dx = spec.dirTo[0] - a[0], dy = spec.dirTo[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const len = L * (0.8 + r() * 0.35);
    const end = [a[0] + (dx / L) * len, a[1] + (dy / L) * len];
    const sway = (r() - 0.5) * 1.2;
    const mid = [(a[0] + end[0]) / 2 - (dy / L) * sway, (a[1] + end[1]) / 2 + (dx / L) * sway];
    lanes.push({ name: spec.name, pts: natural([a, mid, end], 0.2, 8, `KOL|lanepts|${spec.name}`, 8) });
  }

  // ---- relief + stream (small isle: one short stream, no major rivers) ----------------------------
  const bluff = natural([[37, 17.5], [44, 16], [51, 17.5]], 0.5, 12, "KOL|ridge|bluff");
  // the stream runs PAST the coastline into the sea band (a stream that dies on the beach reads wrong)
  const lucky = natural([[38, 40], [31, 44], [25, 47], [20.5, 49.3], [17.4, 51.2]], 0.35, 12, "KOL|stream|lucky");

  // ---- the castle (§3b Fortuna row: showpiece citadel-casino at the strip's head) ------------------
  // NO townEstateId — the zone ships zero estates (header note); anchoring DEFERRED per §3c.
  const CASTLES = [
    { id: "KOL-CASTLE-FORTUNA", kind: "CASTLE", at: CITADEL.slice(),
      name: "The Fortuna Grand", ref: "the showpiece citadel-casino at the Golden Strip's head (canon §3b: Las Vegas Strip + Monte Carlo) — a fortress of spectacle set against the Jackpot Bluff, its forecourt the strip's final stage; reachable by the strip (S) and the Backlots Road (W)" },
  ];

  // ---- POIs + approaches (every castle/POI reachable: ≤1u from the road network or approached) ----
  const POIS = [
    ...PLAZAS.map((p) => ({ id: p.id, kind: "PLAZA", at: p.at.slice(), note: `${p.name} — a plaza stage on the Golden Strip (ring road + spectacle cross-axis; the §3b "plaza stages")` })),
    { id: "KOL-HARBOUR", kind: "SEA_PORT", at: [44, 76.9], note: "Port de Fortune — the casino-waterfront harbour: Fortune Quay, 3 piers, the yacht Anchorage off the south shore; the isle's public sea entry (an island has no land gates)" },
    { id: "KOL-WHEEL", kind: "LANDMARK", at: WHEEL.slice(), note: "The Wheel of Fortune — the great observation wheel on the Promenade de Fortune (the Monte Carlo waterfront spectacle)" },
    { id: "KOL-SKYDOCK", kind: "AIRSHIP_PORT", at: [60, 47], note: "Fortuna Skydock — the influencers arrive by air; airship berth on the east rise, served by Skyline Avenue off Star Plaza" },
  ];
  const skyline = natural([[48.5, 46], [54, 46.2], [60, 47]], 0.2, 10, "KOL|skyline", 8); // Star Plaza → skydock
  const roadsAll = [strip, ...plazaRings, blvdFame, blvdFortune, ...crossStreets, rowMirage, rowGolden,
    promenade, wheelRing, quay, ...piers, harbourSteps, backlots, skyline, ...lanes.map((l) => l.pts)];
  const approaches = [];
  for (const t of [...CASTLES.map((c) => ({ id: c.id, at: c.at, name: c.name })), ...POIS.map((p) => ({ id: p.id, at: p.at, name: p.id.replace("KOL-", "").replace(/-/g, " ") }))]) {
    const { pt, d } = nearestOn(roadsAll, t.at[0], t.at[1]);
    if (!pt || d <= 1.0) continue;
    const poly = natural([t.at, pt], 0.12, 8, "KOL|approach|" + t.id, 8);
    approaches.push({ id: `KOL-AP${String(approaches.length + 1).padStart(2, "0")}`, name: `${t.name} Approach`, pts: poly });
    roadsAll.push(poly);
  }

  // ---- output --------------------------------------------------------------------------------------
  const out = {
    _meta: {
      title: "KOL (Fortuna) macro feature network — the continuous-terrain field, the Influencers' Isle",
      author: "Map-maker session, 2026-07-10 (regenerate with map-service/tools/world_terrain_kol.mjs)",
      coords: "AUTHORED local viewBox (0 0 88 96); y down. ⚠ KOL ships NO source geometry (data/hexagon-city-source has no KOL parcels/SVG; zone-registry: l2Estates 0, l3Singles 0, worldOffset null) — this space is invented by the generator at the atlas zone scale (1 future parcel ≈ 0.65 u across, the 10 extracted zones' density). When real Fortuna land ships, re-register the field onto the real viewBox before windowing real parcels.",
      grounding: "A small spectacle isle (~50×66 u, elongated N–S): the citadel-casino headland north (the Jackpot Bluff behind it), the Monte Carlo casino waterfront south, the Golden Strip running dead straight between them. Sea on every side (island).",
      determinism: "generated by map-service/tools/world_terrain_kol.mjs — authored control points; the only randomness is fnv1a-seeded meander/ring-wobble/lane jitter (mulberry32; no Math.random/Date.now); regenerating yields byte-identical output (the tool builds twice and sha-compares before writing). Estate picks: N/A — the zone ships zero estates (see coords note); every placement is authored.",
      widths: "zone-units at zone scale (1 future parcel ≈ 0.65 u across); world-units at battle scale are derived per-parcel by worldfield.js (tier caps + floors).",
      sea: "v1: the ocean ships as the wide rivers[] band KOL-SEA tracing the authored CLOSED coastline (worldfield.js consumes rivers/roads/ridges only) — shore parcels window it as their sea water. The raw coastline is also exported as coast[] (additive, ignored by worldfield v1) for a future sea-fill kind. ISLAND: sea = everything outside the loop; the piers + the Fortune Anchorage water extend seaward of the coast by design.",
      gameplay: "units can walk over water for now (owner 2026-07-10, phase 1) — sea/anchorage are terrain/visual continuity, not hard blockers; fords/bridges come with the real-water phase (CONTINUOUS-WORLD-TERRAIN §4b).",
      era: "Fortuna = MODERN spectacle strip (owner-locked §3b: Las Vegas / Monte Carlo) — ONE grand strip spine + plaza stages + waterfront promenade. The strip is dead straight and grand (the planned modern line IS correct here, the Vegas move); the spectacle plazas ring the strip; the only organic web is the tiny Backlots hinterland (the established rural style scaled way down — a spectacle isle has almost no countryside).",
      hierarchy: "roads carry tier: highway (ONE — the Golden Strip) / secondary (Boulevard of Fame, Boulevard of Fortune, the Promenade de Fortune, the Backlots Road, Skyline Avenue) / local (3 plaza rings + 3 spectacle cross streets, Mirage Row + Golden Row casino blocks, the Wheel Circus, Fortune Quay + 3 piers + Harbour Steps, 2 seeded hamlet lanes, POI approaches). Roads belong ONLY to this world layer — parcels play whatever overlaps them.",
      castles: "castles[] per the §3b Fortuna row: ONE showpiece CASTLE — the Fortuna Grand citadel-casino at the Golden Strip's head, against the Jackpot Bluff. ⚠ NOT estate-anchored: §3c anchors castles to L2 estates (biggest class present takes the top role) but KOL ships ZERO estates (zone-registry l2Estates 0) — townEstateId is omitted and the anchoring is DEFERRED until Fortuna land ships; re-run §3c over the real estate table then. The citadel ring (WALL/GATE/TOWER) still grows on its battle map via maps/generate.js castleLayout.",
      heroParcels: HERO_PARCELS_META + " — DEFERRED for KOL: the zone ships no estates/L3 parcels, so the citadel-casino carries heroParcels: [] with an explicit no-land-ships-yet deferral note (replacing the shared module's generic no-quota wording, which presumes a SMALL/MEDIUM estate).",
      continuity: "ISLAND — no land frontier, so no cross-zone road/river edge contract. Entries are by SEA (Port de Fortune) + AIR (Fortuna Skydock); no GATE pois exist. worldOffset is null in zone-layout/zone-registry — world placement is owner-TBD; nothing windows across a zone border.",
    },
    zone: "KOL",
    rivers: [
      { id: "KOL-SEA", name: "The Fortune Sea (shore band)", width: 3.0, pts: coast },
      { id: "KOL-ANCHORAGE", name: "The Fortune Anchorage", width: 1.8, pts: anchorage },
      { id: "KOL-ST1", name: "Lucky Run", width: 0.5, pts: lucky },
    ],
    coast: [
      { id: "KOL-COAST", name: "The Fortuna coastline", seaSide: "OUTSIDE (island — closed loop, clockwise)", pts: coast },
    ],
    roads: [
      { id: "KOL-RD-STRIP", name: "The Golden Strip", tier: "highway", width: 0.5, pts: strip },
      { id: "KOL-RD-FAME", name: "Boulevard of Fame", tier: "secondary", width: 0.32, pts: blvdFame },
      { id: "KOL-RD-FORTUNE", name: "Boulevard of Fortune", tier: "secondary", width: 0.32, pts: blvdFortune },
      { id: "KOL-RD-PROM", name: "The Promenade de Fortune", tier: "secondary", width: 0.34, pts: promenade },
      { id: "KOL-RD-BACKLOTS", name: "The Backlots Road", tier: "secondary", width: 0.3, pts: backlots },
      { id: "KOL-RD-SKYLINE", name: "Skyline Avenue", tier: "secondary", width: 0.3, pts: skyline },
      ...plazaRings.map((p, i) => ({ id: `KOL-RING${i + 1}`, name: `${PLAZAS[i].name} Ring`, tier: "local", width: 0.24, pts: p })),
      ...crossStreets.map((p, i) => ({ id: `KOL-X${i + 1}`, name: `${PLAZAS[i].name} Cross`, tier: "local", width: 0.22, pts: p })),
      { id: "KOL-RD-MIRAGE", name: "Mirage Row", tier: "local", width: 0.22, pts: rowMirage },
      { id: "KOL-RD-GOLDEN", name: "Golden Row", tier: "local", width: 0.22, pts: rowGolden },
      { id: "KOL-RD-WHEEL", name: "The Wheel Circus", tier: "local", width: 0.22, pts: wheelRing },
      { id: "KOL-RD-QUAY", name: "Fortune Quay", tier: "local", width: 0.22, pts: quay },
      ...piers.map((p, i) => ({ id: `KOL-PIER${i + 1}`, name: `Fortune Pier ${i + 1}`, tier: "local", width: 0.2, pts: p })),
      { id: "KOL-RD-STEPS", name: "Harbour Steps", tier: "local", width: 0.22, pts: harbourSteps },
      ...lanes.map((l, i) => ({ id: `KOL-LN${i + 1}`, name: l.name, tier: "local", width: 0.22, pts: l.pts })),
      ...approaches.map((a) => ({ id: a.id, name: a.name, tier: "local", width: 0.22, pts: a.pts })),
    ],
    ridges: [
      { id: "KOL-RG1", name: "The Jackpot Bluff", width: 1.6, pts: bluff },
    ],
    castles: CASTLES,
    pois: POIS,
  };
  // heroParcels designation (canon decision 18) — invoked exactly as in world_terrain_bus.mjs,
  // with the TRUTHFUL inputs: KOL ships zero L2 estates + zero L3 singles. The shared module's
  // generic note presumes a SMALL/MEDIUM estate; replace it with the accurate deferral (see the
  // header's ⚠ block).
  const heroStats = attachHeroParcels(out, [], []);
  for (const c of out.castles) {
    c.heroParcelsNote = "KOL ships NO L2 estates / L3 parcels yet (zone-registry: l2Estates 0, l3Singles 0; zoneCode 08 exists only in the token-encoding map) — estate anchoring (§3c: the biggest estate class present takes the top role) AND hero-parcel designation (§3d) are DEFERRED until Fortuna land ships; the citadel-casino battle map arrives with the pre-designed estate map (canon decisions 4/5)";
  }
  return { out, stats: { plazas: PLAZAS.length, lanes: lanes.length, approaches: approaches.length, heroStats } };
}

// ---- build twice, byte-compare, write once --------------------------------------------------------
const b1 = buildField();
const s1 = JSON.stringify(b1.out) + "\n";
const s2 = JSON.stringify(buildField().out) + "\n";
const h1 = createHash("sha256").update(s1).digest("hex");
const h2 = createHash("sha256").update(s2).digest("hex");
if (h1 !== h2) { console.error("NON-DETERMINISTIC BUILD:", h1, "≠", h2); process.exit(1); }
mkdirSync(path.join(ROOT, "data/world-terrain"), { recursive: true });
writeFileSync(path.join(ROOT, "data/world-terrain/KOL.json"), s1);
console.log("heroParcels:", b1.stats.heroStats.map((s) => `${s.id}=${s.count || "DEFERRED (no land ships)"}`).join(" "));
console.log("wrote data/world-terrain/KOL.json sha256", h1.slice(0, 16),
  "| plazas", b1.stats.plazas,
  "| hamlet lanes", b1.stats.lanes,
  "| approaches", b1.stats.approaches,
  "| total roads", b1.out.roads.length,
  "| rivers", b1.out.rivers.length,
  "| castles", b1.out.castles.map((c) => `${c.kind}:${c.name}@${c.at.map((n) => n.toFixed(1))}`).join(" "));
