// D5 loader tests — ref resolution, lazy v0, grid lookups agree with the artifact, lane
// waypoints land on open ground, clampToOpen snaps out of blockers.
import fs from "fs";
import os from "os";
import path from "path";

process.env.MAPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "efmaps-ld-"));
const { loadBattlefield } = await import("../loader.js");
const { generate } = await import("../generate.js");
const { T, BLOCKED } = await import("../schema.js");
const reg = await import("../registry.js");

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗ FAIL", n); } };

// inline artifact path
const art = generate({ parcelId: "LD1", biome: "verdant", zone: "W" },
  { archetype: "riverCrossing", palette: "verdant", landmark: "NONE", laneCount: 1, density: 0.6, waterLevel: 0.8, resourceRichness: 0.5, roughness: 0.5, mirrorFair: true });
const bf = loadBattlefield(art);
ok(bf.sizeM === 322 && bf.lanes.length === 1, "inline artifact loads");
ok(bf.lanes.every((l) => l.every(([x, z]) => !bf.blockedAt(x, z))), "every lane waypoint is on open ground");
{
  // find a WATER cell in the artifact and confirm blockedAt + terrainAt agree with it
  const G = art.terrain.w, cells = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
  let wi = -1; for (let i = 0; i < cells.length; i++) if (cells[i] === T.WATER) { wi = i; break; }
  ok(wi >= 0, "test map has water");
  const wx = ((wi % G) + 0.5) * 2 - 161, wz = ((Math.floor(wi / G)) + 0.5) * 2 - 161;
  ok(bf.blockedAt(wx, wz) === true && bf.terrainAt(wx, wz) === T.WATER, "blockedAt/terrainAt agree with the baked grid");
  const c = bf.clampToOpen(wx, wz);
  ok(!bf.blockedAt(c.x, c.z), "clampToOpen escapes a blocked cell");
  ok(BLOCKED.has(T.WATER), "schema sanity: water blocks");
}
// ref path: never-designed parcel lazily creates + persists v0, then re-resolves identically
const byRef = loadBattlefield({ ref: { parcelId: "LD-REF-9" } });
ok(byRef.artifact.meta.designVersion === 0 && reg.getRow("LD-REF-9")?.status === "SEED_V0", "ref to undesigned parcel lazily persists v0");
const again = loadBattlefield({ ref: { parcelId: "LD-REF-9" } });
ok(JSON.stringify(again.artifact) === JSON.stringify(byRef.artifact), "ref re-load returns the saved artifact byte-identically");
// pinned historical version
reg.regenerate({ parcelId: "LD-REF-9" }, { archetype: "forestMaze" }, {});
const pinned = loadBattlefield({ ref: { parcelId: "LD-REF-9", designVersion: 0 } });
ok(pinned.artifact.meta.designVersion === 0 && reg.getRow("LD-REF-9").designVersion === 1, "designVersion pin loads history while current advanced");

console.log(`\n${fail ? "❌" : "✅"} maps-loader: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
