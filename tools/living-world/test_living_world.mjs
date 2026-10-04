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

console.log(fails ? `❌ living-world: ${fails} failed` : "✅ living-world: all passed"); process.exit(fails ? 1 : 0);
