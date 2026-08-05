#!/usr/bin/env node
// make_candyland_demo.mjs — 🍭 CANDY LAND, the THEME PILOT world (owner 2026-08-05: "create me a
// candy land like world example"). Proves the theme contract end to end: a theme is VISUALS ONLY
// (meta.theme → renderer/asset-pack skin) layered over a fully standard, rule-compliant map — the
// same generator, the same 10 engine gates, the same validators. Swap the skin, keep the war.
//
// The authored field: pink sugar meadows (sakura palette base), a SODA RIVER arcing across the
// south with the licorice road crossing it (candy bridge site), lollipop groves (FOREST),
// gumdrop boulders (ROCK), and THE GINGERBREAD KEEP (CASTLE tier) on the north rise.
//
// Outputs (git-committed, served read-only by the designs API like the estate maps):
//   data/cf-maps/artifacts/CANDYLAND.artifact.json   — view at /designer/3d?parcel=CANDYLAND
//   data/cf-maps/parcels/CANDYLAND.json              — Battlefield A1 (meta.theme = "candyland")
// Deterministic: built twice + byte-compared. Usage: node map-service/tools/make_candyland_demo.mjs
import { writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { generate } from "../maps/generate.js";
import { toBattlefieldA1 } from "../maps/command_converter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const worldField = {
  castles: [{ id: "CANDY-GINGERBREAD-KEEP", kind: "CASTLE", name: "The Gingerbread Keep", at: [38, 52] }],
  // the SODA RIVER: a lazy arc across the southern half — the road punches the candy-bridge site
  rivers: [{ pts: [[-140, 60], [-90, -10], [-20, -50], [60, -70], [140, -55]], width: 10 }],
  // the LICORICE ROAD: SW spawn → over the soda river → up to the keep's gate
  roads: [{ pts: [[-120, -120], [-60, -70], [5, -20], [38, 52]], width: 6 }],
  ridges: [], overlayElements: [], edgeCrossings: [],
};
const parcel = {
  parcelId: "CANDYLAND", zone: "ENT", biomeFamily: "TEMPERATE_FOREST",
  sizeM: 322, investLevel: 3, biome: "sakura", theme: "candyland", worldField,
};

// optional CF 5-invariant validation (same gate as the estate maps)
let validateBattlefield = null;
const distPath = path.join(ROOT, "apps/server/dist/src/battlefield.js");
if (existsSync(distPath)) ({ validateBattlefield } = require(distPath));
else console.warn("WARN: apps/server dist not built — 5-invariant validation skipped (run pnpm -r build)");

const build = () => {
  const art = generate(parcel);
  return { art, a1: toBattlefieldA1(art) };
};
const b1 = build(), b2 = build();
const sArt = JSON.stringify(b1.art) + "\n", sA1 = JSON.stringify(b1.a1, null, 2) + "\n";
if (JSON.stringify(b2.art) + "\n" !== sArt || JSON.stringify(b2.a1, null, 2) + "\n" !== sA1) {
  console.error("NON-DETERMINISTIC BUILD"); process.exit(1);
}
if (b1.art.meta.theme !== "candyland" || b1.a1.meta.theme !== "candyland") {
  console.error("theme did not ride through artifact/A1"); process.exit(1);
}
const cg = b1.art.meta.castleGeom;
if (!cg || cg.styleKey !== "candy") { console.error("gingerbread castle missing (styleKey " + (cg && cg.styleKey) + ")"); process.exit(1); }
let inv = "not-validated";
if (validateBattlefield) { const v = validateBattlefield(b1.a1); inv = v.ok ? "5/5 OK" : `INVALID: ${v.errors.join("; ")}`; if (!v.ok) process.exit(1); }
writeFileSync(path.join(ROOT, "data/cf-maps/artifacts/CANDYLAND.artifact.json"), sArt);
writeFileSync(path.join(ROOT, "data/cf-maps/parcels/CANDYLAND.json"), sA1);
console.log("wrote CANDYLAND 🍭 sha256", createHash("sha256").update(sA1).digest("hex").slice(0, 16),
  `| castle ${cg.tier}/${cg.styleKey} rings ${cg.rings.length} gates ${(b1.art.siege.gates || []).length}`,
  `| invariants ${inv} | view /designer/3d?parcel=CANDYLAND`);
