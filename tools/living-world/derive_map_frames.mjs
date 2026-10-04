#!/usr/bin/env node
// D50 — the frame of every baked battle map (cf-overworld data/cf-maps/artifacts, read-only): its bounds polygon (canon
// decision 5b: the parcel's own shape, NOT a fixed square or regular hexagon), its defender base and its attacker spawn,
// so living-world layouts can be anchored on the real map. Output: data/living-world/map-frames.json.
import fs from "node:fs";
const DIR = "/home/user/cf-overworld/data/cf-maps/artifacts", OUT = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : "data/living-world/map-frames.json"; })();
const maps = {};
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".artifact.json")).sort()) {
  const A = JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")), id = f.replace(".artifact.json", "");
  const core = (A.structures || []).find((s) => s.kind === "CORE"), def = (A.spawnZones || []).find((z) => z.side === "DEFENDER"), atk = (A.spawnZones || []).find((z) => z.side === "ATTACKER");
  const base = core || def || { x: 0, z: 0 };
  maps[id] = { bounds: A.arena.bounds, defBase: [base.x, base.z], atkSpawn: atk ? [atk.x, atk.z] : null };
}
fs.writeFileSync(OUT, JSON.stringify({ schema: "cf-living-world/map-frames@1", source: "cf-overworld data/cf-maps/artifacts (arena.bounds, CORE or DEFENDER spawn, ATTACKER spawn)", count: Object.keys(maps).length, maps }) + "\n");
console.log(`map frames: ${Object.keys(maps).length} baked maps`);
