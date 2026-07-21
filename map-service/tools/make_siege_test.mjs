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
const { ensureDesign, _resetForTest } = await import("../maps/registry.js");
const { toBattlefieldA1 } = await import("../maps/command_converter.js");
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

const { row, artifact } = ensureDesign(parcel);
const cg = artifact.meta?.castleGeom;
if (!cg) { console.error("FATAL: no castleGeom emitted — castle didn't build"); process.exit(1); }

// ---- A1 + siege annotations -------------------------------------------------------------------
const a1 = toBattlefieldA1(artifact);
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
a1._siegeTest = {
  spec: "docs/briefs/SIEGE-MECHANICS-SPEC.md",
  elevationTiers: {                                  // machine-readable tier zones for the engine
    comment: "tier 0 = ground; ranged bonus/penalty per tier delta (spec §3). Zones are discs/rings in map coords.",
    tier1: [
      { kind: "MOUND", at: cg.keep?.at || CASTLE_AT, r: 34, note: "castle earthwork courtyard" },
      { kind: "RIDGE_TOP", poly: worldField.ridges[0].pts, w: worldField.ridges[0].width, note: "outside high ground — attacker elevation station" },
    ],
    tier2: [
      { kind: "WALL_WALK", ring: cg.rings?.[0]?.pts || [], note: "parapet — reachable ONLY via stairs/towers (spec R4)" },
    ],
  },
  wallRing: { pts: cg.rings?.[0]?.pts || [], h: cg.rings?.[0]?.h, gates: (cg.rings?.[0]?.gates || []).map((g) => g.at || g) },
  gates: gates.map((g) => ({ id: g.anchorId, at: [g.x, g.z], hp: g.hpMax, note: "destructible DOOR (spec R3): breach opens the passage" })),
  drawbridge: { at: bridgeAt, note: "moat causeway (spec R5): defender toggle UP(water)/DOWN(road); v1 bridge indestructible, breach the gate instead" },
  stations: [
    { id: "T1", test: "ground↔ground fire ACROSS the wall must be blocked (R1)", at: [CASTLE_AT[0] - 40, CASTLE_AT[1]] },
    { id: "T2", test: "ground → wall-top engagement allowed both directions (R1)", at: cg.rings?.[0]?.pts?.[0] || CASTLE_AT },
    { id: "T3", test: "gate breach: kill castle_gate_* → passage opens (R3)", at: gates[0] ? [gates[0].x, gates[0].z] : CASTLE_AT },
    { id: "T4", test: "stairs: courtyard→parapet pathing only via stair/tower cells (R4)", at: CASTLE_AT },
    { id: "T5", test: "drawbridge toggle: DOWN=cross, UP=blocked water (R5)", at: bridgeAt },
    { id: "T6", test: "FLYER crosses wall + moat freely (R2)", at: [CASTLE_AT[0] - 60, CASTLE_AT[1] - 60] },
    { id: "T7", test: "ridge-top ranged unit outranges/outdamages courtyard defender (R6 tiers)", at: [116, 40] },
    { id: "T8", test: "CLIMBER unit scales wall cell at crawl speed (R7, optional)", at: cg.rings?.[0]?.pts?.[4] || CASTLE_AT },
  ],
};

const outDir = path.join(repo, "data/moba-maps");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "siege-test.json"), JSON.stringify(a1));
fs.writeFileSync(path.join(outDir, "siege-test.artifact.json"), JSON.stringify(artifact));
console.log(`[siege-test] built: sim=${row.sim?.pass} score=${row.sim?.score} modes=${(row.sim?.modes || []).join(",")}`);
console.log(`[siege-test] castle tier=${cg.tier} wallPts=${cg.rings?.[0]?.pts?.length} gates=${gates.length} bridge@${bridgeAt}`);
console.log(`[siege-test] wrote data/moba-maps/siege-test.json + siege-test.artifact.json (registry: ${process.env.MAPS_DIR})`);
