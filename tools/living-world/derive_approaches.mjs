#!/usr/bin/env node
// Living World D8b — NAVAL_APPROACH / AIR_APPROACH spawn zones (NAVAL-AIRSHIP-THREE-LAYER-MAPS.md §3b, planned there),
// DERIVED from the existing battle-map artifacts instead of changing the generator (which would rebake every committed map):
//   NAVAL_APPROACH — each contiguous run of DEEP water cells (terrain.water ≥ 2) that touches the out-of-bounds frame
//                    (grid border or a T.OOB cell): where an arriving fleet materialises. One zone per run ≥ 3 cells,
//                    at the run's middle cell, with the nearest PIER as its unload target.
//   AIR_APPROACH   — maps with LANDING_PADs: one zone per pad on the frame point nearest to it (airships enter at the edge,
//                    then fly to the pad; the overworld bearing can pick among them at runtime).
// Pure function of the artifacts → byte-identical output. Engines read data/living-world/approaches.json beside the artifact.
import fs from "node:fs";
import path from "node:path";
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const DIR = args.artifacts || "/home/user/cf-overworld/data/cf-maps/artifacts", OUT = args.out || "data/living-world/approaches.json";
const OOB = 6, CELL_M = 2, r1 = (n) => Math.round(n * 10) / 10;
const worldOf = (G, c) => (c + 0.5) * CELL_M - (G * CELL_M) / 2;
const b64 = (s) => Uint8Array.from(Buffer.from(s, "base64"));
const out = { schema: "cf-living-world/approaches@1", rule: "derived from artifact terrain.water / cells + LANDING_PAD / PIER anchors (see tool header)", maps: {} };
let nNaval = 0, nAir = 0;
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".artifact.json")).sort()) {
  const A = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")), t = A.terrain || {}, id = f.replace(".artifact.json", "");
  const pads = (A.structures || []).filter((s) => s.kind === "LANDING_PAD"), piers = (A.structures || []).filter((s) => s.kind === "PIER");
  if (!t.water && !pads.length) continue;
  const G = t.w, cells = t.cells ? b64(t.cells) : null, water = t.water ? b64(t.water) : null;
  const isFrame = (x, z) => x <= 0 || z <= 0 || x >= G - 1 || z >= G - 1 || (cells && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => cells[(z + dz) * G + (x + dx)] === OOB));
  const naval = [];
  if (water) {
    const seen = new Uint8Array(G * G);
    for (let i = 0; i < G * G; i++) {
      const x0 = i % G, z0 = (i / G) | 0;
      if (seen[i] || water[i] < 2 || !isFrame(x0, z0)) continue;
      const run = [], q = [i]; seen[i] = 1;          // frame-touching deep cells, 8-connected → one approach run
      for (let h = 0; h < q.length; h++) {
        const c = q[h], x = c % G, z = (c / G) | 0; run.push(c);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
          const ni = nz * G + nx; if (!seen[ni] && water[ni] >= 2 && isFrame(nx, nz)) { seen[ni] = 1; q.push(ni); }
        }
      }
      if (run.length < 3) continue;
      run.sort((a, b) => a - b); const m = run[(run.length - 1) >> 1], X = worldOf(G, m % G), Z = worldOf(G, (m / G) | 0);
      let pier = null; for (const p of piers) { const d = Math.hypot(p.x - X, p.z - Z); if (!pier || d < pier.d) pier = { id: p.anchorId, d }; }
      naval.push({ id: `naval_${naval.length}`, side: "ATTACKER", spawnClass: "NAVAL_APPROACH", x: r1(X), z: r1(Z), deepCells: run.length, unloadAt: pier ? pier.id : "BEACH" });
    }
  }
  const air = pads.map((p, k) => {
    let best = null;
    for (let i = 0; i < G * G; i++) { const x = i % G, z = (i / G) | 0; if (!(x === 0 || z === 0 || x === G - 1 || z === G - 1) && !(cells && cells[i] === OOB)) continue;
      const X = worldOf(G, x), Z = worldOf(G, z), d = Math.hypot(X - p.x, Z - p.z); if (!best || d < best.d) best = { X, Z, d }; }
    return { id: `air_${k}`, side: "ATTACKER", spawnClass: "AIR_APPROACH", x: r1(best.X), z: r1(best.Z), landAt: p.anchorId };
  });
  nNaval += naval.length; nAir += air.length;
  out.maps[id] = { naval, air, piers: piers.map((p) => p.anchorId), pads: pads.map((p) => p.anchorId) };
}
out.counts = { maps: Object.keys(out.maps).length, naval: nNaval, air: nAir };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`approaches: ${out.counts.maps} maps → ${nNaval} NAVAL_APPROACH + ${nAir} AIR_APPROACH → ${OUT}`);
