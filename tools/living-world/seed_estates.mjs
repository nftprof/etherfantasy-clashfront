#!/usr/bin/env node
// Living World D5 — seed POI Nodes for every L2 estate (8,482), per doc 02 §4.
// Deterministic: per-parcel PRNG = mulberry32(fnv1a(`${parcelId}|${zone}|${ground}|lw1`)); a second pass enforces region
// guarantees in a fixed order. Output: data/living-world/estate-pois/<ZONE>.json + estate-pois.summary.json.
//   node tools/living-world/seed_estates.mjs [--world /path/to/overworld/data] [--out data/living-world]
import fs from "node:fs";
import { bandThreat } from "./threat.mjs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const WORLD = args.world || "/home/user/cf-overworld/data";
const OUTDIR = args.out || "data/living-world";
const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
const ARCH = Object.fromEntries(PA.archetypes.map((a) => [a.lwKind, a]));
const ZR = JSON.parse(fs.readFileSync(path.join(WORLD, "zone-registry.json"), "utf8"));
const STRENGTH = Object.fromEntries((ZR.zones || []).map((z) => [z.zoneId, z.strengthMultiplier || 1]));
const l2 = JSON.parse(fs.readFileSync(path.join(WORLD, "hexagon-city-source/parcels-l2.json"), "utf8"));
const ESTATES = (l2.parcels || l2.estates || Object.values(l2).find(Array.isArray) || []).slice().sort((a, b) => (a.parcelId < b.parcelId ? -1 : 1));

function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r2 = (n) => Math.round(n * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]); }
function lineDist(p, lines) { let d = Infinity; for (const l of lines) { const pts = l.pts || []; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i])); } return d; }
const LAYER = (z) => (/^HS/.test(z) ? "SKY" : /^UW/.test(z) ? "UNDER" : "SURFACE");

// doc 02 §4 budgets + ring weights (the template knobs; tuned here, never per map)
const COUNT = { EPIC: 3, GIANT: 2, LARGE: 2, MEDIUM: 1, SMALL: 1 };
const RING = (dC) => (dC <= 12 ? "CASTLE" : dC <= 40 ? "FRONTIER" : "WILD");
const WEIGHTS = {
  FRONTIER: { MERCENARY_POST: 3, CARAVAN_WAYPOINT: 3, AIRDROP_ZONE: 3, WAR_CAMP: 1, HARBOUR: 4, AIRSHIP_DOCK: 4, WILD_LAIR: 1, VENT: 2 },
  WILD: { WILD_LAIR: 4, BARBARIAN_CAMP: 3, SALVAGE_SITE: 3, VENT: 4, AIRDROP_ZONE: 1, AIRSHIP_DOCK: 2 },
};

const zones = {};
for (const f of fs.readdirSync(path.join(WORLD, "world-terrain")).filter((f) => /^[A-Z0-9]+\.json$/.test(f)).sort()) {
  const Z = JSON.parse(fs.readFileSync(path.join(WORLD, "world-terrain", f), "utf8"));
  zones[Z.zone] = { castles: Z.castles || [], coast: (Array.isArray(Z.coast) ? Z.coast : []).concat((Z.rivers || []).filter((r) => /-SEA$/.test(r.id))),
    rivers: (Z.rivers || []).filter((r) => !/-SEA$/.test(r.id)), ridges: Z.ridges || [], roads: Z.roads || [],
    skyPorts: (Z.pois || []).filter((p) => p.kind === "AIRSHIP_PORT"), seaPorts: (Z.pois || []).filter((p) => p.kind === "SEA_PORT") };
}

function eligible(k, ctx) {
  const A = ARCH[k]; if (!A || !A.layers.includes(ctx.layer)) return false;
  switch (k) {
    case "HARBOUR": return ctx.coastD <= A.affinity.coastMax;
    case "AIRSHIP_DOCK": return ctx.layer === "SKY" || ctx.skyPortD <= 25;
    case "MERCENARY_POST": case "CARAVAN_WAYPOINT": return ctx.roadD <= 2;
    case "AIRDROP_ZONE": return ctx.roadD <= A.affinity.roadMax;
    case "BARBARIAN_CAMP": return ctx.ridgeD <= A.affinity.ridgeMax || ctx.ring === "WILD";   // D5c: any wild estate may host one (ridges preferred via weight); 20-u spacing still applies
    case "SALVAGE_SITE": return ctx.coastD <= A.affinity.coastMax;
    case "VENT": return ctx.riverD <= A.affinity.riverMax || (A.affinity.anywhereInZones || []).includes(ctx.zone);
    default: return true;
  }
}
function groundOf(ctx, rng) { if (ctx.layer !== "SURFACE") return ctx.layer; if (ctx.coastD <= 10) return "WATER"; if (ctx.ridgeD <= 15) return "RIDGE"; return rng() < 0.6 ? "FOREST" : "PLAIN"; }

const byZone = {}, summary = { byZone: {}, byKind: {}, byRing: { CASTLE: 0, FRONTIER: 0, WILD: 0 }, parcels: 0, nodes: 0, droppedByGuarantee: 0 };
for (const e of ESTATES) {
  if (!e.center) continue;
  const terrainMissing = !zones[e.zone]; const Z = zones[e.zone] || { castles: [], coast: [], rivers: [], ridges: [], roads: [], skyPorts: [], seaPorts: [] };   // UW1 has no world-terrain file yet → untamed wild
  const at = e.center, layer = LAYER(e.zone);
  let dC = Infinity; for (const c of Z.castles) dC = Math.min(dC, dist(at, c.at));
  const ctx = { zone: e.zone, layer, coastD: Z.coast.length ? lineDist(at, Z.coast) : Infinity, riverD: lineDist(at, Z.rivers), ridgeD: lineDist(at, Z.ridges), roadD: lineDist(at, Z.roads),
    skyPortD: Z.skyPorts.reduce((m, p) => Math.min(m, dist(at, p.at)), Infinity) };
  const ring = RING(dC); ctx.ring = ring; summary.byRing[ring]++;
  const rng0 = mulberry32(fnv1a(`${e.parcelId}|${e.zone}|pre|lw1`)), ground = groundOf(ctx, rng0);
  const rng = mulberry32(fnv1a(`${e.parcelId}|${e.zone}|${ground}|lw1`));
  const nodes = [];
  if (ring !== "CASTLE") {
    // D5c weight tweaks: ridge camps full weight, open-wild camps ⅓; a vent that only qualifies via "anywhere in zone" × 0.4
    const W = { ...WEIGHTS[ring] };
    if (W.BARBARIAN_CAMP && !(ctx.ridgeD <= ARCH.BARBARIAN_CAMP.affinity.ridgeMax)) W.BARBARIAN_CAMP = W.BARBARIAN_CAMP / 3;
    if (W.VENT && !(ctx.riverD <= ARCH.VENT.affinity.riverMax)) W.VENT = W.VENT * 0.4;
    const cands = Object.keys(W).filter((k) => eligible(k, ctx)).sort();
    const n = Math.min(COUNT[e.sizeClass] || 1, PA.limits.perParcelMax);
    for (let i = 0; i < n && cands.length; i++) {
      const tot = cands.reduce((s, k) => s + W[k], 0); let x = rng() * tot, pick = cands[0];
      for (const k of cands) { x -= W[k]; if (x <= 0) { pick = k; break; } }
      const threat = bandThreat(PA, ring, STRENGTH[e.zone], rng(), null, ground);   // D6f banded curve (same single rng draw as the old jitter)
      const a = rng() * Math.PI * 2, rr = rng() * 0.4;
      const bw = e.bbox ? Math.min(e.bbox[2] - e.bbox[0], e.bbox[3] - e.bbox[1]) : 1;
      const node = { k: pick, at: [r2(at[0] + Math.cos(a) * rr * bw), r2(at[1] + Math.sin(a) * rr * bw)], threat };
      if (pick === "WILD_LAIR") node.monster = ARCH.WILD_LAIR.affinity.monsterByGround[ground === "SKY" ? "SKY" : ground === "UNDER" ? "UNDER" : ground];
      nodes.push(node);
      if (pick === "HARBOUR" || pick === "AIRSHIP_DOCK" || pick === "MERCENARY_POST" || pick === "WAR_CAMP") cands.splice(cands.indexOf(pick), 1);   // one per parcel
    }
  }
  (byZone[e.zone] ||= []).push({ id: e.parcelId, size: e.sizeClass, ring, ground, ...(terrainMissing ? { terrainMissing: true } : {}), nodes });
}

// pass 2 — region guarantees (fixed order): barbarian camps ≥ 20 u apart (later ones become wild lairs);
// war camps capped per zone (base + 1 per N estates) — extras become airdrop zones (frontier) or lairs (wild)
for (const z of Object.keys(byZone).sort()) {
  const wc = ARCH.WAR_CAMP.affinity.perZoneCap, cap = wc.base + Math.floor(byZone[z].length / wc.per); let nWar = 0;
  for (const p of byZone[z]) for (const n of p.nodes) {
    if (n.k !== "WAR_CAMP") continue;
    if (++nWar > cap) { if (p.ring === "FRONTIER") n.k = "AIRDROP_ZONE"; else { n.k = "WILD_LAIR"; n.monster = ARCH.WILD_LAIR.affinity.monsterByGround[p.ground] || "BANDIT"; } summary.droppedByGuarantee++; }
  }
  const camps = [];
  for (const p of byZone[z]) for (const n of p.nodes) {
    if (n.k !== "BARBARIAN_CAMP") continue;
    if (camps.some((c) => dist(c, n.at) < 20)) { n.k = "WILD_LAIR"; n.monster = ARCH.WILD_LAIR.affinity.monsterByGround[p.ground] || "BANDIT"; summary.droppedByGuarantee++; }
    else camps.push(n.at);
  }
}

fs.mkdirSync(path.join(OUTDIR, "estate-pois"), { recursive: true });
for (const z of Object.keys(byZone).sort()) {
  const parcels = byZone[z], zs = { parcels: parcels.length, nodes: 0, byKind: {} };
  for (const p of parcels) for (const n of p.nodes) { zs.nodes++; zs.byKind[n.k] = (zs.byKind[n.k] || 0) + 1; summary.byKind[n.k] = (summary.byKind[n.k] || 0) + 1; }
  zs.byKind = Object.fromEntries(Object.entries(zs.byKind).sort());
  summary.byZone[z] = zs; summary.parcels += zs.parcels; summary.nodes += zs.nodes;
  fs.writeFileSync(path.join(OUTDIR, "estate-pois", `${z}.json`), JSON.stringify({ schema: "cf-living-world/estate-pois@1", zone: z, seedSalt: "lw1", parcels }) + "\n");
}
summary.byKind = Object.fromEntries(Object.entries(summary.byKind).sort());
fs.writeFileSync(path.join(OUTDIR, "estate-pois.summary.json"), JSON.stringify({ schema: "cf-living-world/estate-pois-summary@1", ...summary }, null, 1) + "\n");
console.log(`estate-pois: ${summary.parcels} estates → ${summary.nodes} Nodes; rings ${JSON.stringify(summary.byRing)}; ${JSON.stringify(summary.byKind)}; guarantee swaps ${summary.droppedByGuarantee}`);
