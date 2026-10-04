#!/usr/bin/env node
// Living World D3/D4 — seed POIs (living-world Nodes) around every world castle.
// Deterministic: a pure function of castle-context.json + poi-archetypes.json + the overworld zone registry,
// with a per-castle PRNG seeded from fnv1a(castleId|"lw1"). No clock, no Math.random → byte-identical rebuilds.
//   node tools/living-world/seed_castle_pois.mjs [--world /path/to/overworld/data] [--out data/living-world/castle-pois.json]
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const WORLD = args.world || "/home/user/cf-overworld/data";
const OUT = args.out || "data/living-world/castle-pois.json";
const CC = JSON.parse(fs.readFileSync("data/living-world/castle-context.json", "utf8"));
const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
const ZR = JSON.parse(fs.readFileSync(path.join(WORLD, "zone-registry.json"), "utf8"));
const STRENGTH = Object.fromEntries((ZR.zones || []).map((z) => [z.zoneId, z.strengthMultiplier || 1]));
const ARCH = Object.fromEntries(PA.archetypes.map((a) => [a.lwKind, a]));

// existing world POIs (ports) — anchor harbours/docks on the authored ones
const PORTS = {};
for (const f of fs.readdirSync(path.join(WORLD, "world-terrain")).filter((f) => /^[A-Z0-9]+\.json$/.test(f)).sort()) {
  const Z = JSON.parse(fs.readFileSync(path.join(WORLD, "world-terrain", f), "utf8"));
  for (const p of Z.pois || []) PORTS[p.id] = p;
}

function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r2 = (n) => Math.round(n * 100) / 100;
const TIER = { PALACE: 3, CASTLE: 2, KEEP: 1 };

function around(rng, at, minR, maxR) { const a = rng() * Math.PI * 2, d = minR + rng() * (maxR - minR); return [r2(at[0] + Math.cos(a) * d), r2(at[1] + Math.sin(a) * d)]; }
const lerp = (a, b, t) => [r2(a[0] + (b[0] - a[0]) * t), r2(a[1] + (b[1] - a[1]) * t)];

function groundOf(c, rng) {
  if (c.layer === "SKY") return "SKY";
  if (c.layer === "UNDER") return "UNDER";
  if (c.water.coast && c.water.coast.d <= 10) return "WATER";
  if (c.ridge && c.ridge.d <= 15) return "RIDGE";
  return rng() < 0.6 ? "FOREST" : "PLAIN";
}

function seedCastle(c) {
  const rng = mulberry32(fnv1a(c.id + "|lw1"));
  const budget = PA.budgetByCastleKind[c.kind];
  const tier = TIER[c.kind], strength = STRENGTH[c.zone] || 1;
  const port = (c.seaPort && c.seaPort.d <= 25 && PORTS[c.seaPort.id]) || null;
  const sky = (c.airshipPort && c.airshipPort.d <= 25 && PORTS[c.airshipPort.id]) || null;
  const pois = [];
  const add = (lwKind, at, extra = {}) => {
    const A = ARCH[lwKind]; const n = pois.filter((p) => p.lwKind === lwKind).length + 1;
    pois.push({ id: `${c.id}:${lwKind}:${n}`, lwKind, at, ...extra,
      garrison: A.garrison.map(([unit, count]) => ({ unit, count })), threat: Math.min(100, Math.round(10 * tier * strength)),
      deckSeed: fnv1a(`${c.id}|${lwKind}|${n}`) });
  };
  // 1) the always-list
  for (const k of budget.always) {
    if (k === "GUARDIAN_PERCH") add(k, c.at, { inCastle: true });
    else if (k === "WAR_CAMP") add(k, around(rng, c.at, ...ARCH.WAR_CAMP.affinity.flankU));
    else if (k === "MERCENARY_POST") add(k, port || sky ? lerp(c.at, (port || sky).at, 0.33) : around(rng, c.at, 4, 8), { onRoad: c.road ? c.road.id : null });
  }
  // 2) terrain candidates, best-fit first
  const cand = [];
  if (c.layer === "SURFACE" && c.water.coast && c.water.coast.d <= ARCH.HARBOUR.affinity.coastMax) cand.push(["HARBOUR", 10]);
  if (c.layer === "SKY" || sky) cand.push(["AIRSHIP_DOCK", 9]);
  if (c.layer === "UNDER" && c.water.river && c.water.river.d <= ARCH.VENT.affinity.riverMax) cand.push(["VENT", 8]);
  if ((c.layer === "SURFACE" || c.layer === "UNDER") && c.ridge && c.ridge.d <= ARCH.BARBARIAN_CAMP.affinity.ridgeMax) cand.push(["BARBARIAN_CAMP", 7]);
  if (c.water.coast && c.water.coast.d <= ARCH.SALVAGE_SITE.affinity.coastMax) cand.push(["SALVAGE_SITE", 6]);
  cand.push(["WILD_LAIR", 5]);
  const events = [["CARAVAN_WAYPOINT", port || sky ? 4 : 2], ["AIRDROP_ZONE", 3], ["MERCENARY_POST", 1]];
  const order = cand.concat(events).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0]);
  for (const k of order) {
    if (pois.length >= budget.total) break;
    if (k === "MERCENARY_POST" && pois.some((p) => p.lwKind === k)) continue;
    if (c.kind === "KEEP" && ["HARBOUR", "AIRSHIP_DOCK", "VENT", "BARBARIAN_CAMP", "SALVAGE_SITE", "WILD_LAIR"].includes(k) && pois.some((p) => ["HARBOUR", "AIRSHIP_DOCK", "VENT", "BARBARIAN_CAMP", "SALVAGE_SITE", "WILD_LAIR"].includes(p.lwKind))) continue;   // keeps: ONE terrain POI
    if (!ARCH[k].layers.includes(c.layer)) continue;
    if (k === "HARBOUR") add(k, port ? port.at.map(r2) : around(rng, c.at, 6, 12), { anchorPoi: port ? port.id : null, ships: 1 + (tier > 1 ? 1 : 0) });
    else if (k === "AIRSHIP_DOCK") add(k, sky ? sky.at.map(r2) : around(rng, c.at, 5, 10), { anchorPoi: sky ? sky.id : null, airships: tier });
    else if (k === "WILD_LAIR") { const g = groundOf(c, rng); add(k, around(rng, c.at, 12, 24), { ground: g, monster: ARCH.WILD_LAIR.affinity.monsterByGround[g] }); }
    else if (k === "BARBARIAN_CAMP") add(k, around(rng, c.at, 25, 35), { ridge: c.ridge.id });
    else if (k === "CARAVAN_WAYPOINT") add(k, port || sky ? lerp(c.at, (port || sky).at, 0.6) : around(rng, c.at, 8, 16), { route: [c.id, port ? port.id : sky ? sky.id : null] });
    else if (k === "AIRDROP_ZONE") add(k, around(rng, c.at, 10, 18));
    else if (k === "SALVAGE_SITE") add(k, around(rng, c.at, 8, 14));
    else if (k === "VENT") add(k, around(rng, c.at, 6, 14), { flow: c.water.river.id });
    else if (k === "MERCENARY_POST") add(k, around(rng, c.at, 4, 8), { onRoad: c.road ? c.road.id : null });
  }
  // 3) landing spots ride along with harbours/docks (they don't count toward the budget)
  for (const parent of pois.filter((p) => p.lwKind === "HARBOUR" || p.lwKind === "AIRSHIP_DOCK")) {
    const nSpots = parent.lwKind === "HARBOUR" ? 1 : 2;
    for (let i = 0; i < nSpots; i++) add("LANDING_SPOT", around(rng, parent.at, ...ARCH.LANDING_SPOT.affinity.offsetU), { parent: parent.id, arrives: parent.lwKind === "HARBOUR" ? "NAVAL_LANDING" : "AIRSHIP_DROP" });
  }
  return { castleId: c.id, zone: c.zone, layer: c.layer, kind: c.kind, tier, strength, pois };
}

const castles = CC.castles.map(seedCastle);
const byKind = {}; for (const c of castles) for (const p of c.pois) byKind[p.lwKind] = (byKind[p.lwKind] || 0) + 1;
const total = castles.reduce((n, c) => n + c.pois.length, 0);
const out = { schema: "cf-living-world/castle-pois@1", seedSalt: "lw1", units: CC.units, castles: castles.length, pois: total, byKind: Object.fromEntries(Object.entries(byKind).sort()), byCastle: castles };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`castle-pois: ${castles.length} castles → ${total} POIs ${JSON.stringify(out.byKind)} → ${OUT}`);
