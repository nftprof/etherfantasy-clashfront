#!/usr/bin/env node
// registry-purge-orphans.mjs — delete ORPHAN rows from a registry: rows whose id no current parcel table
// addresses (the July-2026 EDU bake was written under the OLD token-id scheme `6xx…`; today's ids are
// size-encoded — those 13,66x rows are unreachable by any parcel and cost ~1.3 GB for nothing).
// Owner approval 2026-10-29 ("review and purge if it's no longer needed").
//
// SAFETY RULES (what is NEVER purged):
//   • any id a current table addresses (L3 singles of every charted zone + every L2 estate)
//   • non-numeric ids — the reference maps (SIEGE-TEST-1, CANDYLAND, …) adopted at boot
//   • rows with owner work (status AI_ITERATED / OWNER_FROZEN) — even if orphaned, a human touched them
// DRY-RUN by default: prints what would go. `--apply` deletes the parcel dirs + the index rows (index
// rewritten atomically). Idempotent. Must run with the service STOPPED (single-writer rule for index.json);
// map-bake.yml runs it inside its stop/merge/restart window.
//
//   MAPS_DIR=~/ef-battlefields node scripts/registry-purge-orphans.mjs [--apply]
import fs from "fs";
import path from "path";
import { l3Zone, l2Zone, zoneList } from "../maps/worldfield.js";

const DIR = process.env.MAPS_DIR || path.join(process.env.HOME || ".", "ef-battlefields");
const apply = process.argv.includes("--apply");
const IDX = path.join(DIR, "index.json");
let idx = {};
try { idx = JSON.parse(fs.readFileSync(IDX, "utf8")); } catch { console.log("[purge] no index at", IDX); process.exit(0); }

const charted = new Set();
for (const z of zoneList()) {
  for (const p of l3Zone(z.zoneId)) charted.add(String(p.parcelId));
  for (const e of l2Zone(z.zoneId, { unsubdividedOnly: false })) charted.add(String(e.parcelId));
}
const OWNER = new Set(["AI_ITERATED", "OWNER_FROZEN"]);
const victims = [], keptRef = [], keptOwner = [];
for (const [id, row] of Object.entries(idx)) {
  if (charted.has(String(id))) continue;
  if (!/^\d+$/.test(String(id))) { keptRef.push(id); continue; }
  if (OWNER.has(row?.status)) { keptOwner.push(id); continue; }
  victims.push(id);
}
let bytes = 0, dirs = 0;
for (const id of victims) {
  const d = path.join(DIR, String(id));
  try { for (const f of fs.readdirSync(d)) bytes += fs.statSync(path.join(d, f)).size; dirs++; } catch { /* no dir */ }
}
console.log(`[purge] registry ${DIR} · ${Object.keys(idx).length.toLocaleString()} rows · orphans ${victims.length.toLocaleString()} (${dirs} dirs, ${(bytes / 1048576).toFixed(0)} MB) · kept reference maps ${keptRef.length} (${keptRef.slice(0, 6).join(", ")}) · kept owner-touched orphans ${keptOwner.length}`);
if (victims.length) console.log(`[purge] sample: ${victims.slice(0, 8).join(", ")}`);
if (!apply) { console.log("[purge] DRY RUN — pass --apply to delete"); process.exit(0); }
let removed = 0;
for (const id of victims) {
  try { fs.rmSync(path.join(DIR, String(id)), { recursive: true, force: true }); removed++; } catch (e) { console.error("[purge] rm failed", id, e.message); }
  delete idx[id];
}
const tmp = IDX + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(idx)); fs.renameSync(tmp, IDX);
console.log(`[purge] APPLIED — removed ${removed.toLocaleString()} parcel dirs, index now ${Object.keys(idx).length.toLocaleString()} rows`);
