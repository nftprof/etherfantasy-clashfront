#!/usr/bin/env node
// registry-census.mjs — READ-ONLY census of a map registry (MAPS_DIR/index.json) against the
// world: how many of the 284,284 L3 parcels and 4,518 un-subdivided estates have a DEFAULT map,
// how many are sim-approved, which modes they host, which generator version they carry. This is
// the "how many maps are complete?" number (docs/maps/MAP-POPULATION-GUIDE.md §2). Never writes.
//
//   MAPS_DIR=~/ef-battlefields node scripts/registry-census.mjs [--json] [--zone=BUS]
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { l3Zone, l2Zone, zoneList } from "../maps/worldfield.js";
import { GEN_VERSION } from "../maps/generate.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = (args.find((a) => a.startsWith("--zone=")) || "").split("=")[1];
const DIR = process.env.MAPS_DIR || path.join(process.env.HOME || ".", "ef-battlefields");
let idx = {};
try { idx = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8")); } catch { /* empty registry */ }
const rows = Object.values(idx);

const SIZES = ["EPIC", "GIANT", "LARGE", "MEDIUM", "SMALL"];
const zones = zoneList().filter((z) => !only || z.zoneId === only.toUpperCase()).sort((a, b) => b.count - a.count);
const out = { registry: DIR, genVersion: GEN_VERSION, rows: rows.length, zones: [], totals: { l3: 0, l3Seeded: 0, l3Approved: 0, estates: 0, estatesSeeded: 0 } };
const byGen = {}, byStatus = {}, modes = {};
for (const r of rows) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  byGen[r.genVersion ?? "?"] = (byGen[r.genVersion ?? "?"] || 0) + 1;
  for (const m of r.sim?.modes || []) modes[m] = (modes[m] || 0) + 1;
}
for (const z of zones) {
  const l3 = l3Zone(z.zoneId), est = l2Zone(z.zoneId);
  const zr = { zoneId: z.zoneId, name: z.name, l3: l3.length, l3Seeded: 0, l3Approved: 0, l3Stale: 0, estates: est.length, estatesSeeded: 0, bySize: {} };
  // stale = a SEED_V0 row from an older generator (self-heals on first view; a re-bake refreshes it).
  // Rows older than 2026-10-26 carry no genVersion → counted as "unknown", not stale.
  for (const p of l3) { const r = idx[String(p.parcelId)]; if (!r) continue; zr.l3Seeded++; if (r.approved) zr.l3Approved++; if (r.genVersion != null && r.genVersion !== GEN_VERSION && r.status === "SEED_V0") zr.l3Stale++; }
  for (const s of SIZES) zr.bySize[s] = { total: 0, seeded: 0 };
  for (const e of est) { const b = zr.bySize[e.sizeClass] || (zr.bySize[e.sizeClass] = { total: 0, seeded: 0 }); b.total++; if (idx[String(e.parcelId)]) { b.seeded++; zr.estatesSeeded++; } }
  out.zones.push(zr);
  out.totals.l3 += zr.l3; out.totals.l3Seeded += zr.l3Seeded; out.totals.l3Approved += zr.l3Approved;
  out.totals.estates += zr.estates; out.totals.estatesSeeded += zr.estatesSeeded;
}
out.byStatus = byStatus; out.byGenVersion = byGen; out.modes = modes;
try { out.disk = execSync(`du -sh "${DIR}" 2>/dev/null | cut -f1`, { encoding: "utf8" }).trim(); } catch { out.disk = "?"; }
try { out.diskFree = execSync(`df -h "${DIR}" 2>/dev/null | tail -1 | awk '{print $4" free of "$2}'`, { encoding: "utf8" }).trim(); } catch { out.diskFree = "?"; }

if (asJson) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "—");
console.log(`registry ${DIR} · ${rows.length.toLocaleString()} rows · GEN_VERSION ${GEN_VERSION} · disk ${out.disk} (${out.diskFree})`);
console.log(`status ${JSON.stringify(byStatus)} · genVersion ${JSON.stringify(byGen)}`);
console.log(`modes hosted ${JSON.stringify(modes)}`);
console.log("");
console.log("zone  name        L3 total   seeded   approved   stale |  estates(un-sub)  seeded  EPIC    GIANT   LARGE   MEDIUM  SMALL");
for (const z of out.zones) {
  const s = (k) => `${z.bySize[k]?.seeded ?? 0}/${z.bySize[k]?.total ?? 0}`.padEnd(7);
  console.log(`${z.zoneId.padEnd(5)} ${z.name.padEnd(10)} ${String(z.l3).padStart(8)} ${String(z.l3Seeded).padStart(8)} ${pct(z.l3Approved, z.l3).padStart(10)} ${String(z.l3Stale).padStart(6)} | ${String(z.estates).padStart(16)} ${String(z.estatesSeeded).padStart(7)}  ${s("EPIC")} ${s("GIANT")} ${s("LARGE")} ${s("MEDIUM")} ${s("SMALL")}`);
}
const t = out.totals;
console.log(`TOTAL  L3 ${t.l3Seeded.toLocaleString()} / ${t.l3.toLocaleString()} seeded (${pct(t.l3Seeded, t.l3)}), ${t.l3Approved.toLocaleString()} approved · estates ${t.estatesSeeded} / ${t.estates} (${pct(t.estatesSeeded, t.estates)})`);
