#!/usr/bin/env node
// Living World D5b — L3 singles (284,314 parcels): LAZY seeding. `seedSingle(parcel, zoneCtx)` is a pure function the map
// service can call on first visit (doc 02 layer ②). This CLI runs it over every single in memory and commits only a
// distribution summary + a deterministic 1 % sample (no bulk per-parcel data).
//   node tools/living-world/seed_singles.mjs [--world …/data] [--out data/living-world] [--only ZONE]
import fs from "node:fs";
import { bandThreat } from "./threat.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r2 = (n) => Math.round(n * 100) / 100, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]); }
function lineDist(p, lines, cap = Infinity) { let d = cap; for (const l of lines) { const pts = l.pts || []; for (let i = 1; i < pts.length; i++) { const s = segDist(p, pts[i - 1], pts[i]); if (s < d) d = s; } } return d; }
const LAYER = (z) => (/^HS/.test(z) ? "SKY" : /^UW/.test(z) ? "UNDER" : "SURFACE");

// doc 02 §4 for singles: 0–1 Node, density roll by ring; a lighter kind set (harbours/docks/war camps belong to estates)
export const SINGLES = {
  density: { CASTLE: 0, FRONTIER: 0.12, WILD: 0.08 },
  weights: { FRONTIER: { AIRDROP_ZONE: 3, CARAVAN_WAYPOINT: 3, WILD_LAIR: 2, VENT: 2 }, WILD: { WILD_LAIR: 5, SALVAGE_SITE: 2, VENT: 3, AIRDROP_ZONE: 1 } },
};

export function zoneContext(WORLD, zone, PA) {
  const f = path.join(WORLD, "world-terrain", `${zone}.json`);
  const Z = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  const ARCH = Object.fromEntries(PA.archetypes.map((a) => [a.lwKind, a]));
  const ZR = JSON.parse(fs.readFileSync(path.join(WORLD, "zone-registry.json"), "utf8")), zr = (ZR.zones || []).find((z) => z.zoneId === zone);
  return { zone, layer: LAYER(zone), terrainMissing: !Z, ARCH, threatBands: PA.threatBands, strength: (zr && zr.strengthMultiplier) || 1, castles: Z ? Z.castles || [] : [],
    coast: Z ? (Array.isArray(Z.coast) ? Z.coast : []).concat((Z.rivers || []).filter((r) => /-SEA$/.test(r.id))) : [],
    rivers: Z ? (Z.rivers || []).filter((r) => !/-SEA$/.test(r.id)) : [], roads: Z ? Z.roads || [] : [] };
}

export function seedSingle(p, zc) {
  const at = p.center; let dC = Infinity; for (const c of zc.castles) dC = Math.min(dC, dist(at, c.at));
  const ring = dC <= 12 ? "CASTLE" : dC <= 40 ? "FRONTIER" : "WILD";
  const rng = mulberry32(fnv1a(`${p.parcelId}|${zc.zone}|single|lw1`));
  if (rng() >= SINGLES.density[ring]) return { id: p.parcelId, ring, node: null };
  const ctx = { coastD: zc.coast.length ? lineDist(at, zc.coast, 40) : Infinity, riverD: lineDist(at, zc.rivers, 40), roadD: lineDist(at, zc.roads, 10) };
  const ok = (k) => {
    const A = zc.ARCH[k]; if (!A.layers.includes(zc.layer)) return false;
    if (k === "CARAVAN_WAYPOINT") return ctx.roadD <= 2;
    if (k === "AIRDROP_ZONE") return ctx.roadD <= A.affinity.roadMax;
    if (k === "SALVAGE_SITE") return ctx.coastD <= A.affinity.coastMax;
    if (k === "VENT") return ctx.riverD <= A.affinity.riverMax || (A.affinity.anywhereInZones || []).includes(zc.zone);
    return true;
  };
  const W = SINGLES.weights[ring], cands = Object.keys(W).filter(ok).sort();
  if (!cands.length) return { id: p.parcelId, ring, node: null };
  const tot = cands.reduce((s, k) => s + W[k], 0); let x = rng() * tot, k = cands[0];
  for (const c of cands) { x -= W[c]; if (x <= 0) { k = c; break; } }
  const ground = zc.layer !== "SURFACE" ? zc.layer : ctx.coastD <= 10 ? "WATER" : rng() < 0.6 ? "FOREST" : "PLAIN";
  const node = { k, at: [r2(at[0]), r2(at[1])], threat: bandThreat({ threatBands: zc.threatBands }, ring, zc.strength, rng()) };
  if (k === "WILD_LAIR") node.monster = zc.ARCH.WILD_LAIR.affinity.monsterByGround[ground] || "BANDIT";
  return { id: p.parcelId, ring, node };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
  const WORLD = args.world || "/home/user/cf-overworld/data", OUT = args.out || "data/living-world";
  const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
  const zones = fs.readdirSync(path.join(WORLD, "hexagon-city-source/l3")).filter((f) => /^[A-Z0-9]+\.json$/.test(f)).map((f) => f.replace(".json", "")).sort().filter((z) => !args.only || z === args.only);
  const summary = { parcels: 0, nodes: 0, byRing: { CASTLE: 0, FRONTIER: 0, WILD: 0 }, byKind: {}, byZone: {} }, sample = [];
  for (const z of zones) {
    const zc = zoneContext(WORLD, z, { archetypes: PA.archetypes, threatBands: PA.threatBands }), L3 = JSON.parse(fs.readFileSync(path.join(WORLD, "hexagon-city-source/l3", `${z}.json`), "utf8")).singles;
    const zs = { parcels: 0, nodes: 0, byKind: {}, terrainMissing: zc.terrainMissing || undefined };
    for (const p of L3.slice().sort((a, b) => (a.parcelId < b.parcelId ? -1 : 1))) {
      if (!p.center) continue; const r = seedSingle(p, zc);
      zs.parcels++; summary.byRing[r.ring]++;
      if (r.node) { zs.nodes++; zs.byKind[r.node.k] = (zs.byKind[r.node.k] || 0) + 1; summary.byKind[r.node.k] = (summary.byKind[r.node.k] || 0) + 1; }
      if (fnv1a(p.parcelId + "|sample") % 100 === 0) sample.push({ zone: z, ...r });
    }
    zs.byKind = Object.fromEntries(Object.entries(zs.byKind).sort());
    summary.byZone[z] = zs; summary.parcels += zs.parcels; summary.nodes += zs.nodes;
  }
  summary.byKind = Object.fromEntries(Object.entries(summary.byKind).sort());
  const suffix = args.only ? "." + args.only : "";
  fs.writeFileSync(path.join(OUT, `singles.summary${suffix}.json`), JSON.stringify({ schema: "cf-living-world/singles-summary@1", lazy: "seedSingle(parcel, zoneContext) — tools/living-world/seed_singles.mjs", ...summary }, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, `singles.sample${suffix}.json`), JSON.stringify({ schema: "cf-living-world/singles-sample@1", rule: "fnv1a(parcelId|sample) % 100 === 0 (≈1 %)", count: sample.length, parcels: sample }) + "\n");
  console.log(`singles: ${summary.parcels} parcels → ${summary.nodes} Nodes; rings ${JSON.stringify(summary.byRing)}; ${JSON.stringify(summary.byKind)}; sample ${sample.length}`);
}
