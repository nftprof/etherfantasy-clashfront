// make_siege_test.mjs — build the SIEGE MECHANICS TEST MAP (owner 2026-07-21: "we need to build
// the map for us to test properly, then give the spec along to MOBA game engine to build test").
//
// A purpose-built battlefield exercising every siege rule in docs/briefs/SIEGE-MECHANICS-SPEC.md:
// a CASTLE (full wall ring + gates + stairs + mound) in the NE, a MOAT arc across the southern
// approach with the road crossing it (= the causeway/DRAWBRIDGE test site), and an outside
// high-ground RIDGE east of the wall (= attacker-elevation test). Built through the REAL
// generator pipeline (hand-authored worldField injection, deterministic seed), so the artifact,
// the A1 Battlefield JSON, the thumb, and the 3D/command views all fall out of one build.
//
// Outputs (git-committed):
//   data/moba-maps/siege-test.json           — Battlefield A1 (+ _siegeTest annotations) for the engine
//   data/moba-maps/siege-test.artifact.json  — the raw artifact (castleGeom, grid) for renderers
// Usage: node map-service/tools/make_siege_test.mjs [--registry=/dir]   (--registry also seeds a
// local MAPS_DIR so /designer/3d?parcel=SIEGE-TEST-1 renders it for screenshots/manual checks)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "../..");

const regDirArg = process.argv.find((a) => a.startsWith("--registry="));
process.env.MAPS_DIR = regDirArg ? regDirArg.split("=")[1] : path.join(repo, ".siege-test-registry");
const { ensureDesign, regenerate, _resetForTest } = await import("../maps/registry.js");
const { toBattlefieldA1 } = await import("../maps/command_converter.js");
const { GEN_VERSION } = await import("../maps/generate.js");
_resetForTest(process.env.MAPS_DIR);

// ---- the authored siege field (ARENA frame, ±161, +z north; widths in world units) ------------
const CASTLE_AT = [52, 52];                       // defender castle, NE quadrant
const worldField = {
  castles: [{ id: "siege_castle", kind: "CASTLE", name: "Siege Test Castle", at: CASTLE_AT }],
  // outside HIGH GROUND: a rock plateau band east of the wall, gap-separated — the attacker-
  // elevation station (T7): ranged units on the plateau edge overlook the courtyard.
  ridges: [{ pts: [[126, -10], [122, 60], [100, 118]], width: 22 }],
  // MOAT: an arc crossing the whole southern/western approach; the road punches the causeway.
  rivers: [{ pts: [[-60, 118], [-52, 42], [-30, -20], [24, -52], [104, -64]], width: 9 }],
  // approach ROAD: attacker spawn (SW) → gate; crosses the moat = the DRAWBRIDGE/causeway site.
  roads: [{ pts: [[-118, -118], [-52, -48], [8, -6], [52, 52]], width: 6 }],
  overlayElements: [], edgeCrossings: [],
};
const parcel = {
  parcelId: "SIEGE-TEST-1", zone: "EDU", biomeFamily: "TEMPERATE_FOREST",
  sizeM: 322, investLevel: 3, worldField,
};

// designVersion tracks GEN_VERSION-5 so a generator bump supersedes the box's adopted copy
// (adoptArtifact is idempotent by version: same/older = keep, newer = replace).
let built = ensureDesign(parcel);                       // v0 baseline
const targetV = Math.max(0, GEN_VERSION - 5);
for (let v = 1; v <= targetV; v++) built = regenerate(parcel, null, { byOwner: true });
const { row, artifact } = built;
const cg = artifact.meta?.castleGeom;
if (!cg) { console.error("FATAL: no castleGeom emitted — castle didn't build"); process.exit(1); }

// ---- A1 + siege annotations -------------------------------------------------------------------
const a1 = toBattlefieldA1(artifact);
// stamp the build version onto the A1 so a stale deployed copy is DETECTABLE (the raw A1 carried no
// genVersion — you couldn't tell old from new). Renderers/loaders can assert meta.genVersion.
a1.meta = { ...(a1.meta || {}), genVersion: artifact.meta?.genVersion, designVersion: artifact.meta?.designVersion, builtFrom: "make_siege_test.mjs" };
const gates = (artifact.structures || []).filter((s) => s.kind === "GATE");
const bridgeAt = (() => {           // where the road polyline crosses the moat centerline
  // nearest road point to the moat polyline — good enough as the causeway/drawbridge anchor
  let best = null, bd = Infinity;
  for (const rp of worldField.roads[0].pts) for (const mp of worldField.rivers[0].pts) {
    const d = Math.hypot(rp[0] - mp[0], rp[1] - mp[1]);
    if (d < bd) { bd = d; best = [(rp[0] + mp[0]) / 2, (rp[1] + mp[1]) / 2]; }
  }
  return best;
})();
if (!a1.siege) { console.error("FATAL: artifact carries no standard `siege` block (GEN_VERSION >= 8 required)"); process.exit(1); }
// structural siege data now rides the STANDARD `siege` block (artifact → A1 passthrough, MOBA
// contract fix 1). _siegeTest keeps ONLY what is test-map-specific: the spec pointer + stations.
a1._siegeTest = {
  spec: "docs/briefs/SIEGE-MECHANICS-SPEC.md",
  stations: [
    { id: "T1", test: "ground↔ground fire ACROSS the wall must be blocked (R1)", at: [CASTLE_AT[0] - 40, CASTLE_AT[1]] },
    { id: "T2", test: "ground → wall-top engagement allowed both directions (R1)", at: cg.rings?.[0]?.pts?.[0] || CASTLE_AT },
    { id: "T3", test: "gate breach: kill castle_gate_* → passage opens (R3)", at: gates[0] ? [gates[0].x, gates[0].z] : CASTLE_AT },
    { id: "T4", test: "stairs: courtyard→parapet pathing only via stair/tower cells (R4)", at: CASTLE_AT },
    { id: "T5", test: "drawbridge toggle: DOWN=cross, UP=blocked water (R5)", at: bridgeAt },
    { id: "T6", test: "FLYER crosses wall + moat freely (R2)", at: [CASTLE_AT[0] - 60, CASTLE_AT[1] - 60] },
    { id: "T7", test: "ridge-top (tier1) archer vs WALL-WALK (tier2) defender: uphill penalty applies; NO fire into the courtyard (R6 + R-ELEV-OVER)", at: [116, 40] },
    { id: "T8", test: "CLIMBER unit scales wall cell at crawl speed (R7, optional)", at: cg.rings?.[0]?.pts?.[4] || CASTLE_AT },
  ],
};

const outDir = path.join(repo, "data/moba-maps");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "siege-test.json"), JSON.stringify(a1));
fs.writeFileSync(path.join(outDir, "siege-test.artifact.json"), JSON.stringify(artifact));
// render manifest too (same converter the registry uses; siege + designVersion attached the same way)
try {
  const { createRequire } = await import("node:module");
  const conv = createRequire(import.meta.url)("../maps/battlefield_converter.cjs").convert;
  const man = conv(artifact, { parcelId: parcel.parcelId, designVersion: artifact.meta.designVersion });
  if (man.designVersion == null) man.designVersion = artifact.meta.designVersion;
  if (artifact.siege && !man.siege) man.siege = artifact.siege;
  fs.writeFileSync(path.join(outDir, "siege-test.manifest.json"), JSON.stringify(man));
} catch (e) { console.error("[siege-test] manifest skipped:", e.message); }
console.log(`[siege-test] built: sim=${row.sim?.pass} score=${row.sim?.score} modes=${(row.sim?.modes || []).join(",")}`);
console.log(`[siege-test] castle tier=${cg.tier} wallPts=${cg.rings?.[0]?.pts?.length} gates=${gates.length} bridge@${bridgeAt}`);
console.log(`[siege-test] wrote data/moba-maps/siege-test.json + siege-test.artifact.json (registry: ${process.env.MAPS_DIR})`);
