#!/usr/bin/env node
// Living World data tests: rebuild every generated file twice → byte-identical; schema + coverage invariants.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const run = (script, out) => { execFileSync("node", [script, "--out", out], { stdio: "ignore" }); return fs.readFileSync(out); };

// D1 castle context
const a = run("tools/living-world/castle_context.mjs", "/tmp/lw_cc_a.json"), b = run("tools/living-world/castle_context.mjs", "/tmp/lw_cc_b.json");
ok(a.equals(b), "castle-context rebuild is byte-identical");
ok(a.equals(fs.readFileSync("data/living-world/castle-context.json")), "committed castle-context.json is up to date");
const cc = JSON.parse(a);
ok(cc.count === 67 && cc.castles.length === 67, "all 67 world castles present");
ok(cc.byKind.PALACE === 9 && cc.byKind.CASTLE === 21 && cc.byKind.KEEP === 37, "kinds 9 PALACE / 21 CASTLE / 37 KEEP");
ok(cc.castles.every((c) => c.zone && ["SURFACE", "SKY", "UNDER"].includes(c.layer) && Array.isArray(c.at)), "every castle has zone, layer, position");

// D2 archetypes (hand-authored data)
const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
const kinds = PA.archetypes.map((x) => x.lwKind);
ok(kinds.length === 12 && new Set(kinds).size === 12, "12 unique POI archetypes");
const docKinds = [...fs.readFileSync("docs/living-world/01-POI-CATALOGUE.md", "utf8").matchAll(/^\| \*\*([A-Z_]+)\*\* \|/gm)].map((m) => m[1]);
ok(docKinds.length === 12 && docKinds.every((k) => kinds.includes(k)), "doc 01 table and poi-archetypes.json list the same archetypes");
ok(PA.archetypes.every((x) => x.deck.every(([e]) => PA.events[e])), "every deck event is defined in events{}");
ok(PA.archetypes.every((x) => x.garrison.reduce((n, [, c]) => n + c, 0) <= PA.limits.garrisonMax), "garrisons stay ≤ garrisonMax (few, named units)");
ok(Object.values(PA.events).every((e) => typeof e.teleSec === "number"), "every event has a telegraph time");

// D3/D4 castle POIs (seeded)
const sa = run("tools/living-world/seed_castle_pois.mjs", "/tmp/lw_cp_a.json"), sb = run("tools/living-world/seed_castle_pois.mjs", "/tmp/lw_cp_b.json");
ok(sa.equals(sb), "castle-pois rebuild is byte-identical (seeded PRNG, no clock)");
ok(sa.equals(fs.readFileSync("data/living-world/castle-pois.json")), "committed castle-pois.json is up to date");
const CP = JSON.parse(sa), all = CP.byCastle.flatMap((c) => c.pois.map((p) => ({ ...p, c })));
ok(CP.byCastle.length === 67, "every one of the 67 castles is seeded");
ok(CP.byCastle.every((c) => c.pois.filter((p) => p.lwKind !== "LANDING_SPOT").length === PA.budgetByCastleKind[c.kind].total), "each castle gets exactly its kind's POI budget (landing spots ride along)");
ok(new Set(all.map((p) => p.id)).size === all.length, "POI ids are unique");
ok(all.every((p) => kinds.includes(p.lwKind) && PA.archetypes.find((a) => a.lwKind === p.lwKind).layers.includes(p.c.layer)), "every POI is a known archetype on a layer it allows");
ok(all.filter((p) => p.lwKind === "HARBOUR").every((p) => p.c.layer === "SURFACE"), "harbours only on the surface (coast)");
ok(CP.byCastle.filter((c) => c.layer === "SKY").every((c) => c.pois.some((p) => p.lwKind === "AIRSHIP_DOCK")), "every sky castle has an airship dock");
ok(all.filter((p) => p.lwKind === "LANDING_SPOT").every((p) => all.some((q) => q.id === p.parent)), "every landing spot hangs off a harbour or dock");
ok(all.every((p) => p.garrison.reduce((n, g) => n + g.count, 0) <= PA.limits.garrisonMax && p.threat >= 0 && p.threat <= 100), "garrisons ≤ 6 units, threat 0–100");

console.log(fails ? `❌ living-world: ${fails} failed` : "✅ living-world: all passed"); process.exit(fails ? 1 : 0);
