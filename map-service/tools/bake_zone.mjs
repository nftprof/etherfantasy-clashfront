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
// default data/cf-maps> | --limit <n> | --offset <n> (chunking) | --force (overwrite existing
// files; default skips them so hand-curated flagships are never clobbered) | --validate-only
// (the CENSUS mode: no file writes — generate + convert + validate EVERY parcel, catching thrown
// exceptions as a failure class too, and print a failure census grouped by error class + timing;
// exit 2 iff any parcel failed. This is the zero-failure proof gate for a zone).
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
const OFFSET = Number(opt("offset", 0));
const FORCE = args.includes("--force");
const VALIDATE_ONLY = args.includes("--validate-only");

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
if (OFFSET) singles = singles.slice(OFFSET);
if (LIMIT) singles = singles.slice(0, LIMIT);

let validateBattlefield = null;
const distPath = path.join(ROOT, "apps/server/dist/src/battlefield.js");
if (existsSync(distPath)) validateBattlefield = require(distPath).validateBattlefield;
else if (VALIDATE_ONLY) { console.error("--validate-only needs apps/server/dist (run pnpm -r build) — the invariant gate IS the census"); process.exit(1); }
else console.warn("⚠ apps/server dist missing — invariant gate skipped (run pnpm -r build)");

if (!VALIDATE_ONLY) {
  mkdirSync(path.join(OUT, "parcels"), { recursive: true });
  mkdirSync(path.join(OUT, "artifacts"), { recursive: true });
}

const bake = (snap) => {
  const parcel = worldParcel(snap, { investLevel: INVEST });
  const artifact = generate(parcel);
  const a1 = toBattlefieldA1(artifact);
  return { artifact, a1 };
};

// error string → failure CLASS (strip per-parcel ids/coords so the census groups by mechanism)
function errorClass(e) {
  if (e.startsWith("EXCEPTION")) return e.replace(/EXCEPTION: /, "EXCEPTION: ").split("\n")[0].replace(/\d+/g, "N");
  return e
    .replace(/ at \([^)]*\)/, "")                 // coords
    .replace(/between waypoint \d+ and \d+/, "between waypoints")
    .replace(/(spawnZone|lane|buildSpot|resource|structure|mob|CORE) \S+/, "$1 *")
    .replace(/of obstacle \S+/, "of obstacle *");
}

let written = 0, skipped = 0, ok = 0, failed = [];
const t0 = process.hrtime.bigint();
for (let i = 0; i < singles.length; i++) {
  const snap = singles[i];
  const pFile = path.join(OUT, "parcels", `${snap.parcelId}.json`);
  const aFile = path.join(OUT, "artifacts", `${snap.parcelId}.artifact.json`);
  if (!VALIDATE_ONLY && !FORCE && (existsSync(pFile) || existsSync(aFile))) { skipped++; continue; }
  let artifact, a1;
  try {
    ({ artifact, a1 } = bake(snap));
    if (i === 0) { // determinism sentinel
      const again = bake(snap);
      if (JSON.stringify(again.artifact) !== JSON.stringify(artifact)) { console.error("NON-DETERMINISTIC generation — aborting"); process.exit(1); }
    }
  } catch (err) { // a crash is a failure class too — never aborts the census
    failed.push({ id: snap.parcelId, errors: [`EXCEPTION: ${err?.message ?? err}`] });
    continue;
  }
  if (validateBattlefield) {
    const v = validateBattlefield(a1);
    if (!v.ok) { failed.push({ id: snap.parcelId, errors: v.errors }); continue; }
  }
  ok++;
  if (!VALIDATE_ONLY) {
    writeFileSync(aFile, JSON.stringify(artifact) + "\n");
    writeFileSync(pFile, JSON.stringify(a1, null, 2) + "\n");
    written++;
    if (written % 25 === 0) console.log(`  ${written}/${singles.length} written…`);
  } else if ((i + 1) % 500 === 0) {
    const el = Number(process.hrtime.bigint() - t0) / 1e9;
    console.log(`  ${i + 1}/${singles.length} validated, ${failed.length} failed, ${el.toFixed(0)}s (${(el * 1000 / (i + 1)).toFixed(1)} ms/parcel)`);
  }
}
const secs = Number(process.hrtime.bigint() - t0) / 1e9;
const done = ok + failed.length;
console.log(VALIDATE_ONLY
  ? `DONE ${zone} (validate-only): ${done} validated — ${ok} ok, ${failed.length} failed, ${secs.toFixed(1)}s (${done ? (secs * 1000 / done).toFixed(1) : "?"} ms/parcel)`
  : `DONE ${zone}: ${written} written, ${skipped} skipped (existing), ${failed.length} failed, ${secs.toFixed(1)}s`);
if (failed.length) {
  // census: failures grouped by error class (mechanism), with sample parcel ids
  const census = new Map();
  for (const f of failed) for (const e of f.errors) {
    const c = errorClass(e);
    const row = census.get(c) ?? { count: 0, parcels: new Set() };
    row.count++; row.parcels.add(f.id);
    census.set(c, row);
  }
  console.log("FAILURE CENSUS (by error class):");
  for (const [c, row] of [...census.entries()].sort((a, b) => b[1].parcels.size - a[1].parcels.size))
    console.log(`  ${row.parcels.size} parcels / ${row.count} errors — ${c}\n    e.g. ${[...row.parcels].slice(0, 8).join(", ")}`);
  console.log("FAILED:", JSON.stringify(failed.length <= 200 ? failed : failed.slice(0, 200), null, 1));
  if (failed.length > 200) console.log(`… ${failed.length - 200} more failures truncated`);
  process.exit(2);
}
