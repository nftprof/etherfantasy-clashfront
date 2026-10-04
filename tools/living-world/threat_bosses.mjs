#!/usr/bin/env node
// D51 — a named boss for every region's THREAT_PEAK (season beats, D29), from the canon roster (cf-overworld
// data/CHARACTER_ROSTER.csv, Category = Boss) and the zone registry's primaryElements. Deterministic assignment:
//   1. bosses with no animation clips can't fight (ExportStatus "STATIC"): excluded
//   2. the RAID boss anchors the strongest region (zone strengthMultiplier)
//   3. element bosses (name suffix _Fire / _Water) go to regions whose primaryElements include that element, best match
//      first (fewest candidates), each boss at most twice
//   4. the generic WORLD_n bosses fill the rest in zone order
// Display names are i18n keys (boss.<asset>), English placeholders until the lore team names them.
import fs from "node:fs";
const ROSTER = "/home/user/cf-overworld/data/CHARACTER_ROSTER.csv", ZR = JSON.parse(fs.readFileSync("/home/user/cf-overworld/data/zone-registry.json", "utf8")).zones;
const OUT = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : "data/living-world/threat-bosses.json"; })();
const REGIONS = Object.keys(JSON.parse(fs.readFileSync("data/living-world/region-influence.json", "utf8")).regions).sort();
export function assign() {
  const bosses = fs.readFileSync(ROSTER, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).filter((c) => c[0] === "Boss").map((c) => ({ asset: c[1], status: c[2] }));
  const usable = bosses.filter((b) => !/STATIC/.test(b.status)), excluded = bosses.filter((b) => /STATIC/.test(b.status)).map((b) => b.asset);
  const Z = Object.fromEntries(ZR.map((z) => [z.zoneId, z])), out = {}, uses = {};
  const raid = usable.find((b) => /^Raid_/.test(b.asset));
  const strongest = REGIONS.slice().sort((a, b) => (Z[b].strengthMultiplier || 1) - (Z[a].strengthMultiplier || 1) || (a < b ? -1 : 1))[0];
  if (raid) { out[strongest] = { boss: raid.asset, why: `RAID boss → strongest region (×${Z[strongest].strengthMultiplier})` }; uses[raid.asset] = 1; }
  const elementBosses = usable.filter((b) => /_(Fire|Water)$/.test(b.asset)).map((b) => ({ ...b, element: b.asset.match(/_(Fire|Water)$/)[1] }));
  const open = REGIONS.filter((z) => !out[z]).map((z) => ({ z, cands: elementBosses.filter((b) => (Z[z].primaryElements || []).includes(b.element)) })).sort((a, b) => a.cands.length - b.cands.length || (a.z < b.z ? -1 : 1));
  for (const { z, cands } of open) { const pick = cands.filter((b) => (uses[b.asset] || 0) < 2).sort((a, b) => (uses[a.asset] || 0) - (uses[b.asset] || 0) || (a.asset < b.asset ? -1 : 1))[0]; if (pick && cands.length) { out[z] = { boss: pick.asset, why: `${pick.element} boss ↔ ${z} primaryElements ${JSON.stringify(Z[z].primaryElements)}` }; uses[pick.asset] = (uses[pick.asset] || 0) + 1; } }
  const worlds = usable.filter((b) => /^World_\d+$/.test(b.asset)); let w = 0;
  for (const z of REGIONS) if (!out[z]) { out[z] = { boss: worlds[w % worlds.length].asset, why: "generic world boss (no element match)" }; w++; }
  const unused = usable.map((b) => b.asset).filter((a) => !Object.values(out).some((r) => r.boss === a));
  return { excluded, unused, regions: Object.fromEntries(REGIONS.map((z) => [z, out[z]])) };
}
if (process.argv[1] && process.argv[1].endsWith("threat_bosses.mjs")) {
  const A = assign();
  fs.writeFileSync(OUT, JSON.stringify({ schema: "cf-living-world/threat-bosses@1", source: "cf-overworld data/CHARACTER_ROSTER.csv (Boss) + zone-registry primaryElements", ...A }, null, 1) + "\n");
  for (const [z, r] of Object.entries(A.regions)) console.log(z.padEnd(4), r.boss.padEnd(22), r.why); console.log("excluded:", A.excluded.join(", "), "| spare:", A.unused.join(", "));
}
