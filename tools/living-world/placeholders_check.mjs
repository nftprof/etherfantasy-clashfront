#!/usr/bin/env node
// D59 — resolves every entry of data/living-world/placeholders.json to its live value and compares it with the register.
import fs from "node:fs";
const R = JSON.parse(fs.readFileSync("data/living-world/placeholders.json", "utf8"));
const dig = (o, p) => p.split(".").reduce((v, k) => (v == null ? v : v[k]), o);
export function check() {
  return R.entries.map((e) => {
    let live;
    if (e.at.json) { const v = e.at.path.includes(":") ? dig(JSON.parse(fs.readFileSync(e.at.json, "utf8")), e.at.path.split(".").slice(0, -1).join("."))[e.at.path.split(".").pop()] : dig(JSON.parse(fs.readFileSync(e.at.json, "utf8")), e.at.path); live = e.at.pick ? e.at.pick.map((k) => v[k]) : v; }
    else { const m = fs.readFileSync(e.at.code, "utf8").match(new RegExp(e.at.re)); live = m ? +m[1] : undefined; }
    return { id: e.id, value: e.value, live, ok: JSON.stringify(live) === JSON.stringify(e.value) };
  });
}
if (process.argv[1] && process.argv[1].endsWith("placeholders_check.mjs")) { const c = check(); for (const x of c) console.log(`${x.ok ? "✓" : "✗"} ${x.id.padEnd(24)} register ${JSON.stringify(x.value)}  live ${JSON.stringify(x.live)}`); process.exit(c.every((x) => x.ok) ? 0 : 1); }
