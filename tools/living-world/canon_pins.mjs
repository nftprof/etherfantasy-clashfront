#!/usr/bin/env node
// D61 — canon drift guard. Every canon input the living world reads (cf-overworld data + docs, the MOBA lineage) is
// pinned by content hash in data/living-world/canon-pins.json. check() re-hashes them: a mismatch names the input
// and the tools to re-run, so a canon update can never silently invalidate seeds, reports or tests.
//   node tools/living-world/canon_pins.mjs --record   (after re-running the listed tools on new canon)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const CFO = "/home/user/cf-overworld", MOBA = "/home/user/etherfantasy-browser-moba-game", FILE = "data/living-world/canon-pins.json";
export const INPUTS = [
  { id: "zone-registry", p: `${CFO}/data/zone-registry.json`, rerun: "every seeder + influence + world_calendar + threat_bosses" },
  { id: "world-terrain", p: `${CFO}/data/world-terrain`, rerun: "castle_context, seed_*, export_cf_overlay, hero_parcels" },
  { id: "parcels-l2", p: `${CFO}/data/hexagon-city-source/parcels-l2.json`, rerun: "seed_estates, hero_parcels" },
  { id: "parcels-l3", p: `${CFO}/data/hexagon-city-source/l3`, rerun: "seed_singles, hero_parcels" },
  { id: "battle-maps", p: `${CFO}/data/cf-maps/artifacts`, rerun: "derive_approaches, derive_map_frames" },
  { id: "pets-roster", p: `${CFO}/data/PETS_ROSTER.csv`, rerun: "guardian_eligibility" },
  { id: "character-roster", p: `${CFO}/data/CHARACTER_ROSTER.csv`, rerun: "threat_bosses" },
  { id: "balance", p: `${CFO}/packages/shared/balance.json`, rerun: "balance_sheet, resolve_result (train costs), D40 scale check" },
  { id: "data-models", p: `${CFO}/docs/08-data-models.md`, rerun: "PR #2 refresh patch; canon enum tests" },
  { id: "battle-system", p: `${CFO}/docs/04-battle-system.md`, rerun: "terrain-mods.json (canon terrain table)" },
  { id: "military", p: `${CFO}/docs/03-military.md`, rerun: "(reference only; costs come from balance.json)" },
  { id: "allocate-brief", p: `${CFO}/docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md`, rerun: "allocate_payload, resolve_result" },
  { id: "naval-brief", p: `${CFO}/docs/briefs/NAVAL-AIRSHIP-THREE-LAYER-MAPS.md`, rerun: "experience.json vesselAccess" },
  { id: "moba-lineage", p: `${MOBA}/mon_lineage.json`, rerun: "guardian_eligibility" },
];
const h = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
export const hashOf = (p) => fs.statSync(p).isDirectory() ? h(fs.readdirSync(p).sort().map((f) => f + ":" + hashOf(path.join(p, f))).join("\n")) : h(fs.readFileSync(p));
export function check() { const P = JSON.parse(fs.readFileSync(FILE, "utf8")).pins; return INPUTS.map((i) => ({ id: i.id, rerun: i.rerun, pinned: P[i.id], now: hashOf(i.p) })).map((x) => ({ ...x, ok: x.pinned === x.now })); }
if (process.argv[1] && process.argv[1].endsWith("canon_pins.mjs")) {
  if (process.argv.includes("--record")) { fs.writeFileSync(FILE, JSON.stringify({ schema: "cf-living-world/canon-pins@1", note: "content hashes of every canon input; on a mismatch re-run the named tools, then --record", pins: Object.fromEntries(INPUTS.map((i) => [i.id, hashOf(i.p)])) }, null, 1) + "\n"); console.log("canon pins recorded"); }
  else { const c = check(); for (const x of c) console.log(`${x.ok ? "✓" : "✗ DRIFT"} ${x.id.padEnd(17)} ${x.ok ? "" : "re-run: " + x.rerun}`); process.exit(c.every((x) => x.ok) ? 0 : 1); }
}
