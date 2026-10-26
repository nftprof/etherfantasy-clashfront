#!/usr/bin/env node
// castle-inventory.mjs — regenerate docs/maps/CASTLE-INVENTORY.md from data/world-terrain/*.json.
//
// Every AUTHORED KEEP / CASTLE / PALACE across all zone fields, with its estate, the castle parcel
// (heroParcels[0] — the playable L3 the fort stands on, or `(no L3)` when the estate is un-subdivided
// and the fort rides the whole-estate map), its zone-space location and its hero-POI count.
// Deterministic, read-only on the data: run after any world_terrain_*.mjs change (guide item B-14).
//
// Usage: node map-service/scripts/castle-inventory.mjs [--stdout]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TERRAIN = path.join(ROOT, "data/world-terrain");
const OUT = path.join(ROOT, "docs/maps/CASTLE-INVENTORY.md");
const TIER_RANK = { PALACE: 0, CASTLE: 1, KEEP: 2 };

const registry = JSON.parse(readFileSync(path.join(ROOT, "data/zone-registry.json"), "utf8"));
const zoneName = Object.fromEntries(registry.zones.map((z) => [z.zoneId, z.name]));

const rows = [];
const files = readdirSync(TERRAIN).filter((f) => /^[A-Z0-9]+\.json$/.test(f)).sort();
for (const f of files) {
  const field = JSON.parse(readFileSync(path.join(TERRAIN, f), "utf8"));
  const zone = field.zone || f.replace(/\.json$/, "");
  for (const c of field.castles || []) {
    if (!(c.kind in TIER_RANK)) continue;
    rows.push({
      tier: c.kind, zone, zoneName: zoneName[zone] || zone, name: c.name || c.id, estate: c.townEstateId || "—",
      parcel: c.heroParcels && c.heroParcels.length ? c.heroParcels[0] : null,
      loc: `${Math.round(c.at[0])},${Math.round(c.at[1])}`, hero: c.heroParcels ? c.heroParcels.length : 0,
      ladder: !!c.ladder,
    });
  }
}
rows.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.zone.localeCompare(b.zone) || String(a.estate).localeCompare(String(b.estate)));

const totals = rows.reduce((acc, r) => ((acc[r.tier] = (acc[r.tier] || 0) + 1), acc), {});
const byZone = rows.reduce((acc, r) => ((acc[r.zone] = (acc[r.zone] || 0) + 1), acc), {});
const noL3 = rows.filter((r) => !r.parcel).length;
const stamp = new Date().toISOString().slice(0, 10);

const lines = [];
lines.push("# Castle inventory — every placed KEEP / CASTLE / PALACE (for EF Hunt warden casting)");
lines.push("");
lines.push(`*Generated from \`data/world-terrain/*.json\` by \`map-service/scripts/castle-inventory.mjs\` (${stamp}). Ring-tier = visible rank: KEEP 1-ring (outpost) · CASTLE 2-ring (stronghold) · PALACE 3-ring (realm seat). Totals: PALACE ${totals.PALACE || 0} · CASTLE ${totals.CASTLE || 0} · KEEP ${totals.KEEP || 0} (${rows.length} authored castles across ${Object.keys(byZone).length} zones: ${Object.entries(byZone).map(([z, n]) => `${z} ${n}`).join(" · ")}). Cast wardens onto these — their locations become story locations. View any: \`map.etherfantasy.com/designer/3d?parcel=<castle parcel>\`.*`);
lines.push("");
lines.push("| Tier | Zone | Castle | Estate | Castle parcel (view id) | Loc (zone x,y) | Hero POIs |");
lines.push("|---|---|---|---|---|---|---|");
for (const r of rows) {
  lines.push(`| ${r.tier} | ${r.zoneName} (${r.zone}) | ${r.name} | ${r.estate} | ${r.parcel ? `\`${r.parcel}\`` : "`(no L3)`"} | ${r.loc} | ${r.hero} |`);
}
lines.push("");
lines.push("## Notes");
lines.push("- **PALACE (3-ring)** = the top rank, on EPIC estates (plus story-designated palaces such as the Vault-Palace of Luxuria on a LARGE estate — EF Hunt EP7 finale).");
lines.push(`- **\`(no L3)\`** in the castle-parcel column (${noL3} castles) = the estate is not L3-subdivided; its battlefield is the **whole-estate map** — a committed flagship at \`data/cf-maps/parcels/<estate>.json\` where one exists, else the baked default (\`worldfield.estateParcel\`, the authored fort kept, stepping down a tier only if the sim gate refuses it).`);
lines.push("- **Ladder forts** (the un-authored EPIC/GIANT/LARGE estates' PALACE/CASTLE/KEEP defaults, `MAP-POPULATION-GUIDE.md` §1) are NOT listed here — they live only in the server registry and auto-name themselves; the §6 B-4 naming pass promotes them into the fields (and so into this inventory).");
lines.push("- Every castle grows real WALL/GATE/TOWER ring geometry in the map generator — the rings ARE the land (map-lane), warden-court interiors are engine-lane.");
lines.push("- CGI (Olympus) and KOL (Fortuna) fields are authored but uncharted (no parcel geometry yet) — their castles have no view id until the zones are charted.");
lines.push("");

const text = lines.join("\n");
if (process.argv.includes("--stdout")) process.stdout.write(text);
else { writeFileSync(OUT, text); console.log(`wrote ${path.relative(ROOT, OUT)}: ${rows.length} castles (PALACE ${totals.PALACE || 0} · CASTLE ${totals.CASTLE || 0} · KEEP ${totals.KEEP || 0}), ${noL3} on un-subdivided estates`); }
