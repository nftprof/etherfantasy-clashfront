#!/usr/bin/env node
// Living World — sea lanes (every SEA_PORT pair, canon "any port pair") + airship lanes (surface AIRSHIP_PORTs → Aeropolis
// gateway → Emberfall / Empyrea). Deterministic; lane risk per doc 07 §3. Lengths: in-zone = straight distance in zone units;
// cross-zone = a fixed voyage length (different zone coordinate spaces) by zone-link class.
import fs from "node:fs";
import path from "node:path";
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const WORLD = args.world || "/home/user/cf-overworld/data", OUT = args.out || "data/living-world/sea-air-lanes.json";
const r2 = (n) => Math.round(n * 100) / 100;
const ports = [];
for (const f of fs.readdirSync(path.join(WORLD, "world-terrain")).filter((f) => /^[A-Z0-9]+\.json$/.test(f)).sort()) {
  const Z = JSON.parse(fs.readFileSync(path.join(WORLD, "world-terrain", f), "utf8"));
  for (const p of Z.pois || []) if (["SEA_PORT", "AIRSHIP_PORT"].includes(p.kind) || p.id === "HS1-DOCK-GATEWAY") ports.push({ id: p.id, zone: Z.zone, kind: p.id === "HS1-DOCK-GATEWAY" ? "AIRSHIP_PORT" : p.kind, at: p.at, name: p.name || null });
}
ports.sort((a, b) => (a.id < b.id ? -1 : 1));
const CROSS_ZONE_U = 400;   // a cross-continent voyage counts as 400 u for risk (inter-shard; coordinates don't share a space)
const risk = (len) => r2(Math.min(0.25, 0.02 + 0.004 * len) * 1000) / 1000;
const sea = ports.filter((p) => p.kind === "SEA_PORT"), lanes = [];
for (let i = 0; i < sea.length; i++) for (let j = i + 1; j < sea.length; j++) {
  const a = sea[i], b = sea[j], same = a.zone === b.zone;
  const len = same ? r2(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1])) : CROSS_ZONE_U;
  lanes.push({ id: `SEA:${a.id}~${b.id}`, mode: "SEA", from: a.id, to: b.id, crossZone: !same, lengthU: len, krakenRisk: risk(len), stormCloses: true });
}
const sky = ports.filter((p) => p.kind === "AIRSHIP_PORT"), gate = "HS1-DOCK-GATEWAY";
for (const p of sky.filter((p) => !/^HS/.test(p.zone))) lanes.push({ id: `AIR:${p.id}~${gate}`, mode: "AIR", from: p.id, to: gate, crossZone: true, lengthU: CROSS_ZONE_U, gated: "AEROPOLIS" });
for (const up of ["HS2-GATE-AEROPOLIS", "HS3-GATE-AEROPOLIS"]) lanes.push({ id: `AIR:${gate}~${up}`, mode: "AIR", from: gate, to: up, crossZone: true, lengthU: CROSS_ZONE_U, gated: "AEROPOLIS" });
const out = { schema: "cf-living-world/sea-air-lanes@1", note: "doc 07 — ambient traffic + voyages ride these lanes; krakenRisk per crossing ×1.5 in storm season", ports, counts: { sea: lanes.filter((l) => l.mode === "SEA").length, air: lanes.filter((l) => l.mode === "AIR").length }, lanes };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`lanes: ${out.counts.sea} sea (${sea.length} ports) + ${out.counts.air} air → ${OUT}`);
