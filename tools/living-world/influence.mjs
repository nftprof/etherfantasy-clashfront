#!/usr/bin/env node
// D11 — the two progression ladders (doc 06 §5), as pure functions over experience.json:
//   vessels(parcelsControlled)              → canon vessel classes (NAVAL-AIRSHIP brief §7: 5 / 10 / 25 / 100 parcels)
//   regionInfluence(held, regionTotal)      → living-world unlocks for holdable POIs held in ONE region + the next step
//   regionBanner(countsByHolder, regionTotal) → the region's banner holder (plurality, ≥ minHeld; ties → nobody)
// Using a vessel in a region needs BOTH: the class (parcels, world-wide) and the region right (POIs held there).
// CLI: writes per-region holdable-POI totals (castle POIs + estate Nodes + singles) → data/living-world/region-influence.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
export const EX = rd("data/living-world/experience.json");

export const vessels = (parcels) => EX.vesselAccess.tiers.filter((t) => parcels >= t.parcels).flatMap((t) => t.unlock.split("+"));
// Small regions: a threshold never exceeds a majority of the region's holdable POIs (KOL has 3), so every region can be dominated.
export function regionInfluence(held, regionTotal = Infinity) {
  const cap = Number.isFinite(regionTotal) ? Math.max(1, Math.floor(regionTotal / 2) + 1) : Infinity;
  const L = EX.influenceUnlocks.map((u) => ({ ...u, poisHeld: Math.min(u.poisHeld, cap) })), got = L.filter((u) => held >= u.poisHeld), next = L.find((u) => held < u.poisHeld);
  return { held, unlocks: got.map((u) => u.unlock), next: next ? { unlock: next.unlock, at: next.poisHeld, need: next.poisHeld - held } : null };
}
export function regionBanner(countsByHolder, regionTotal = Infinity) {
  const min = Math.min(EX.regionBanner.minHeld, Number.isFinite(regionTotal) ? Math.floor(regionTotal / 2) + 1 : Infinity);
  const rows = Object.entries(countsByHolder).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]);
  return rows.length && (rows.length === 1 || rows[0][1] > rows[1][1]) ? rows[0][0] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "data/living-world/region-influence.json");
  const H = new Set(EX.holdable), regions = {}, add = (z, k, n = 1) => { if (!H.has(k)) return; const r = (regions[z] ||= { holdable: 0, byKind: {} }); r.holdable += n; r.byKind[k] = (r.byKind[k] || 0) + n; };
  for (const c of rd("data/living-world/castle-pois.json").byCastle) for (const p of c.pois) add(c.zone, p.lwKind);
  for (const f of fs.readdirSync(path.join(ROOT, "data/living-world/estate-pois")).sort()) { const E = rd("data/living-world/estate-pois/" + f); for (const p of E.parcels) for (const n of p.nodes) add(E.zone, n.k); }
  for (const [z, s] of Object.entries(rd("data/living-world/singles.summary.json").byZone)) for (const [k, n] of Object.entries(s.byKind)) add(z, k, n);
  const sorted = Object.fromEntries(Object.keys(regions).sort().map((z) => [z, { holdable: regions[z].holdable, byKind: Object.fromEntries(Object.entries(regions[z].byKind).sort()) }]));
  const total = Object.values(sorted).reduce((n, r) => n + r.holdable, 0);
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/region-influence@1", holdable: EX.holdable, total, regions: sorted }, null, 1) + "\n");
  console.log(`region-influence: ${Object.keys(sorted).length} regions, ${total} holdable POIs; ${Object.entries(sorted).map(([z, r]) => z + " " + r.holdable).join(", ")}`);
}
