#!/usr/bin/env node
// D41 — "say go" packs: each owner call's recommended option as ONE scripted change (data edits + regeneration + doc
// edits), so a decision becomes one command. Packs never touch other branches.
//   node tools/living-world/apply_decision.mjs <pack> [--root DIR]   apply in DIR (default: this repo)
//   node tools/living-world/apply_decision.mjs --pretest              apply each pack to a scratch copy and run the full
//                                                                     test suite there; writes handoff/DECISION-PACKS.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (r, f) => JSON.parse(fs.readFileSync(path.join(r, f), "utf8")), wr = (r, f, d) => fs.writeFileSync(path.join(r, f), JSON.stringify(d, null, 1) + "\n");
function edit(r, f, from, to) { const p = path.join(r, f), s = fs.readFileSync(p, "utf8"); if (!s.includes(from)) throw new Error(`pack edit: "${from.slice(0, 50)}" not in ${f}`); fs.writeFileSync(p, s.replace(from, to)); }
const node = (r, script, ...a) => execFileSync("node", [path.join(r, "tools/living-world", script), ...a], { cwd: r, stdio: "ignore" });
const RESEED = ["seed_castle_pois.mjs", "seed_estates.mjs", "seed_singles.mjs", "export_cf_overlay.mjs", "influence.mjs", "region_feed.mjs", "world_calendar.mjs", "event_board.mjs", "stationings.mjs", "allocate_payload.mjs"];
const REPORTS = ["sim_sample.mjs", "sim_matrix.mjs", "balance_sheet.mjs", "first_week.mjs", "ct_flow_sim.mjs", "abuse_sim.mjs", "merc_market.mjs"];

export const PACKS = {
  "warden-fee-x3": { call: "§5 What is a Guardian hunt for?", option: "A", apply(r) {
    const g = rd(r, "data/living-world/guardians.json"); g.forms["2"].feeCT = 3 * g.forms["2"].feeCT; wr(r, "data/living-world/guardians.json", g);
    edit(r, "docs/living-world/04-GUARDIANS.md", "| 1 CT × kind multiplier |", `| ${g.forms["2"].feeCT} CT × kind multiplier |`);
    for (const s of ["stationings.mjs", "event_board.mjs", "region_feed.mjs", "allocate_payload.mjs", "balance_sheet.mjs", "ct_flow_sim.mjs", "abuse_sim.mjs"]) node(r, s);
  } },
  "sky-under-terrain": { call: "Proposal: SKY / UNDER terrain rows", option: "apply", apply(r) {
    const t = rd(r, "data/living-world/terrain-mods.json"); Object.assign(t.groundToHexTerrain, t.proposed.groundToHexTerrain); t.appliedFromProposal = "D41 sky-under-terrain"; wr(r, "data/living-world/terrain-mods.json", t);
    const p = rd(r, "data/living-world/poi-archetypes.json"); Object.assign(p.threatBands.groundShift, t.proposed.groundShift); wr(r, "data/living-world/poi-archetypes.json", p);
    for (const s of RESEED) node(r, s); for (const s of REPORTS) node(r, s);
    node(r, "sim_matrix.mjs", "--terrain", "proposed", "--out", "docs/living-world/reports/SIM-MATRIX-PROPOSED.md");
    execFileSync("bash", [path.join(r, "tools/living-world/pr1_refresh.sh")], { cwd: r, stdio: "ignore" });   // the overlay threats changed: rebuild the PR #1 patch
  } },
  "guardian-20min-cap": { call: "§3 Guardians vs the 12-minute floor", option: "A", apply(r) {
    edit(r, "docs/living-world/03-DEFEND-ATTACK-ECONOMY.md", "## 3. Diminishing returns: no impregnable fortress", "> **Decided (owner, §3 option A):** Guardians sit outside the 12-min floor for bought defences: they're time-bound and pay a bounty when beaten. They're capped at **20 min**; the tests assert every Guardian castle breaks by then.\n\n## 3. Diminishing returns: no impregnable fortress");
    edit(r, "tools/living-world/test_living_world.mjs", "console.log(fails ?", 'ok(JSON.parse(fs.readFileSync("docs/living-world/reports/SIM-SAMPLE.json", "utf8")).scenarios.filter((x) => x.scen === "F2" || x.scen === "F3").every((x) => x.breached && x.sec <= 1200), "decided §3: every Guardian castle breaks within 20 min");\n\nconsole.log(fails ?');
  } },
};

if (process.argv[1] && process.argv[1].endsWith("apply_decision.mjs")) {
  const a = process.argv.slice(2);
  if (a[0] === "--pretest") {
    const out = {}, only = a[1];
    for (const id of Object.keys(PACKS).filter((k) => !only || k === only)) {
      const tmp = fs.mkdtempSync("/tmp/lw-pack-");
      for (const d of ["tools", "data", "docs", "server"]) fs.cpSync(path.join(HERE, d), path.join(tmp, d), { recursive: true });
      let applied = true, testsOk = false, failing = [];
      try { PACKS[id].apply(tmp); } catch (e) { applied = false; failing = [String(e.message).slice(0, 200)]; }
      if (applied) { try { execFileSync("node", ["tools/living-world/test_living_world.mjs"], { cwd: tmp, stdio: "pipe" }); testsOk = true; } catch (e) { failing = String(e.stdout).split("\n").filter((l) => l.includes("✗")).map((l) => l.trim()); } }
      out[id] = { call: PACKS[id].call, option: PACKS[id].option, applied, testsOk, failing };
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log(`${id}: applied ${applied}, tests ${testsOk ? "pass" : "FAIL"} ${failing.join(" | ")}`);
    }
    fs.writeFileSync(path.join(HERE, "docs/living-world/handoff/DECISION-PACKS.json"), JSON.stringify(out, null, 1) + "\n");
  } else {
    const id = a[0], i = a.indexOf("--root"), root = i > 0 ? a[i + 1] : HERE;
    if (!PACKS[id]) { console.error("packs: " + Object.keys(PACKS).join(", ")); process.exit(2); }
    PACKS[id].apply(root); console.log(`applied ${id} in ${root}: now run the tests, then commit`);
  }
}
