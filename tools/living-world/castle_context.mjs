#!/usr/bin/env node
// Living World D1 — per-castle CONTEXT: what surrounds each of the 67 world castles (water, ports, ridges,
// roads, nearby estates, world layer). Pure function of the overworld data → byte-identical output on every
// run (no clock, no RNG). Input: the overworld branch's data/ dir (world-terrain/*.json + hexagon-city-source).
//   node tools/living-world/castle_context.mjs --world /path/to/overworld/data [--out data/living-world/castle-context.json]
// Coordinates/distances are in each zone's SVG units (same space as the parcel centers).
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const WORLD = args.world || "/home/user/cf-overworld/data";
const OUT = args.out || "data/living-world/castle-context.json";

const LAYER = (z) => (/^HS/.test(z) ? "SKY" : /^UW/.test(z) ? "UNDER" : "SURFACE");
const r2 = (n) => Math.round(n * 100) / 100;

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
  return Math.sqrt(x * x + y * y);
}
function polyDist(p, pts) { let d = Infinity; for (let i = 1; i < (pts || []).length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i])); return d; }
function nearestLine(p, lines, filter = () => true) {
  let best = null;
  for (const l of lines || []) { if (!filter(l)) continue; const d = polyDist(p, l.pts); if (!best || d < best.d) best = { id: l.id, d }; }
  return best;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const zoneFiles = fs.readdirSync(path.join(WORLD, "world-terrain")).filter((f) => /^[A-Z0-9]+\.json$/.test(f)).sort();
const l2 = JSON.parse(fs.readFileSync(path.join(WORLD, "hexagon-city-source/parcels-l2.json"), "utf8"));
const estates = (l2.parcels || l2.estates || Object.values(l2).find(Array.isArray) || []);
const estatesByZone = {};
for (const e of estates) (estatesByZone[e.zone] ||= []).push(e);

const ESTATE_R = 12; // radius (zone units) for the "estates around the castle" census
const castles = [];
for (const f of zoneFiles) {
  const Z = JSON.parse(fs.readFileSync(path.join(WORLD, "world-terrain", f), "utf8"));
  const zone = Z.zone;
  const seaLines = (Z.rivers || []).filter((r) => /-SEA$/.test(r.id));
  const rivers = (Z.rivers || []).filter((r) => !/-SEA$/.test(r.id));
  const coastLines = Array.isArray(Z.coast) ? Z.coast : [];
  const ports = (Z.pois || []).filter((p) => p.kind === "SEA_PORT" || p.kind === "AIRSHIP_PORT");
  for (const c of Z.castles || []) {
    const at = c.at;
    const coast = nearestLine(at, coastLines.concat(seaLines));
    const river = nearestLine(at, rivers);
    const ridge = nearestLine(at, Z.ridges);
    const road = nearestLine(at, Z.roads);
    const near = (kind) => { let b = null; for (const p of ports.filter((p) => p.kind === kind)) { const d = dist(at, p.at); if (!b || d < b.d) b = { id: p.id, d }; } return b ? { id: b.id, d: r2(b.d) } : null; };
    const census = { SMALL: 0, MEDIUM: 0, LARGE: 0, GIANT: 0, EPIC: 0 };
    for (const e of estatesByZone[zone] || []) if (e.center && dist(at, e.center) <= ESTATE_R) census[e.sizeClass] = (census[e.sizeClass] || 0) + 1;
    castles.push({
      id: c.id, zone, layer: LAYER(zone), kind: c.kind, name: c.name || null, at: [r2(at[0]), r2(at[1])],
      townEstateId: c.townEstateId || null, heroParcels: (c.heroParcels || []).length,
      water: {
        coast: coast ? { id: coast.id, d: r2(coast.d) } : null,
        river: river ? { id: river.id, d: r2(river.d) } : null,
      },
      ridge: ridge ? { id: ridge.id, d: r2(ridge.d) } : null,
      road: road ? { id: road.id, d: r2(road.d) } : null,
      seaPort: near("SEA_PORT"), airshipPort: near("AIRSHIP_PORT"),
      estatesWithin12: census,
    });
  }
}
castles.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const byKind = castles.reduce((m, c) => ((m[c.kind] = (m[c.kind] || 0) + 1), m), {});
const out = { schema: "cf-living-world/castle-context@1", source: "overworld data/world-terrain + hexagon-city-source/parcels-l2.json", units: "zone SVG units", estateRadius: ESTATE_R, count: castles.length, byKind, castles };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`castle-context: ${castles.length} castles ${JSON.stringify(byKind)} → ${OUT}`);
