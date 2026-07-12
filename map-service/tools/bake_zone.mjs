#!/usr/bin/env node
// bake_zone.mjs — the ZONE BAKE: generate REAL battle maps (A artifact + A1/B command form) for
// every L3 parcel of a zone, or a radius around a focus parcel (owner 2026-07-11: "real map full
// game play going, no more fake moba maps").
//
// TWO USES, ONE TOOL:
//   1. FOCUS-AREA batch into git:   node map-service/tools/bake_zone.mjs EDU --center 60203370158 --radius 8
//      → writes into data/cf-maps/{parcels,artifacts}/ (CF's battleStatic serves them on next deploy).
//   2. FULL-ZONE bake ON THE BOX:   node map-service/tools/bake_zone.mjs EDU --out /path/to/dir
//      → writes <out>/parcels/<id>.json + <out>/artifacts/<id>.artifact.json for ALL L3 singles of
//      the zone. Point CF at it: CF_PARCEL_MAPS_DIR=<out>/parcels. Gigabytes never travel through
//      git — the box generates its own maps from this repo checkout (determinism: same commit ⇒
//      byte-identical maps everywhere, forever).
//
// Options: --center <parcelId> --radius <zoneUnits> | --invest <0..5, default 1> | --out <dir,
// default data/cf-maps> | --limit <n> | --force (overwrite existing files; default skips them so
// hand-curated flagships are never clobbered).
//
// Deterministic: the generator's seeded rng only — NO Math.random / Date.now. The first parcel is
// generated TWICE and byte-compared as a determinism sentinel for the run. Every A1 is validated
// against the 5 CF playability invariants (apps/server/dist/src/battlefield.js) when the dist
// build exists; a parcel failing validation is NOT written and is listed at the end (expect none).
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { worldParcel } from "../maps/worldfield.js";
import { generate } from "../maps/generate.js";
import { toBattlefieldA1 } from "../maps/command_converter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const zone = args[0];
if (!zone || zone.startsWith("--")) { console.error("usage: bake_zone.mjs <ZONE> [--center id --radius u] [--invest n] [--out dir] [--limit n] [--force]"); process.exit(1); }
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const CENTER = opt("center", null);
const RADIUS = Number(opt("radius", 0));
const INVEST = Number(opt("invest", 1));
const OUT = path.resolve(ROOT, opt("out", "data/cf-maps"));
const LIMIT = Number(opt("limit", 0));
const FORCE = args.includes("--force");

const l3Path = path.join(ROOT, `data/hexagon-city-source/l3/${zone}.json`);
if (!existsSync(l3Path)) { console.error(`no L3 data for zone ${zone}`); process.exit(1); }
let singles = JSON.parse(readFileSync(l3Path, "utf8")).singles;
console.log(`${zone}: ${singles.length} L3 singles`);

if (CENTER) {
  const c = singles.find((s) => s.parcelId === CENTER);
  if (!c) { console.error(`center ${CENTER} not found in ${zone}`); process.exit(1); }
  const [cx, cy] = c.center;
  singles = singles.filter((s) => Math.hypot(s.center[0] - cx, s.center[1] - cy) <= RADIUS);
  console.log(`focus ${CENTER} (${cx},${cy}) radius ${RADIUS} → ${singles.length} parcels`);
}
singles = singles.slice().sort((a, b) => (a.parcelId < b.parcelId ? -1 : 1));
if (LIMIT) singles = singles.slice(0, LIMIT);

let validateBattlefield = null;
const distPath = path.join(ROOT, "apps/server/dist/src/battlefield.js");
if (existsSync(distPath)) validateBattlefield = require(distPath).validateBattlefield;
else console.warn("⚠ apps/server dist missing — invariant gate skipped (run pnpm -r build)");

mkdirSync(path.join(OUT, "parcels"), { recursive: true });
mkdirSync(path.join(OUT, "artifacts"), { recursive: true });

const bake = (snap) => {
  const parcel = worldParcel(snap, { investLevel: INVEST });
  const artifact = generate(parcel);
  const a1 = toBattlefieldA1(artifact);
  return { artifact, a1 };
};

let written = 0, skipped = 0, failed = [];
const t0 = process.hrtime.bigint();
for (let i = 0; i < singles.length; i++) {
  const snap = singles[i];
  const pFile = path.join(OUT, "parcels", `${snap.parcelId}.json`);
  const aFile = path.join(OUT, "artifacts", `${snap.parcelId}.artifact.json`);
  if (!FORCE && (existsSync(pFile) || existsSync(aFile))) { skipped++; continue; }
  const { artifact, a1 } = bake(snap);
  if (i === 0) { // determinism sentinel
    const again = bake(snap);
    if (JSON.stringify(again.artifact) !== JSON.stringify(artifact)) { console.error("NON-DETERMINISTIC generation — aborting"); process.exit(1); }
  }
  if (validateBattlefield) {
    const v = validateBattlefield(a1);
    if (!v.ok) { failed.push({ id: snap.parcelId, errors: v.errors }); continue; }
  }
  writeFileSync(aFile, JSON.stringify(artifact) + "\n");
  writeFileSync(pFile, JSON.stringify(a1, null, 2) + "\n");
  written++;
  if (written % 25 === 0) console.log(`  ${written}/${singles.length} written…`);
}
const secs = Number(process.hrtime.bigint() - t0) / 1e9;
console.log(`DONE ${zone}: ${written} written, ${skipped} skipped (existing), ${failed.length} failed, ${secs.toFixed(1)}s`);
if (failed.length) { console.log("FAILED:", JSON.stringify(failed, null, 1)); process.exit(2); }
