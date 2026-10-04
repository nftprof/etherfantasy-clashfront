#!/usr/bin/env node
// D35 — performance budgets for the living-world hot paths. These are TOOLS, so wall-clock timing is fine here; the sim
// itself never reads a clock. Each probe runs best-of-3 (noise-tolerant); a budget is 2× the recorded baseline.
//   node tools/living-world/perf_budget.mjs --record   → writes data/living-world/perf-budget.json (baselines + budgets)
//   node tools/living-world/perf_budget.mjs            → re-measures, prints, exits 1 if any probe exceeds its budget
// Heavy batch jobs (full 284 K singles seed, the matrix) are recorded for reference, but only the per-call probes gate.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { seedSingle, zoneContext } from "./seed_singles.mjs";
import { boardAt } from "./event_board.mjs";
import { shipsAt } from "./ambient_traffic.mjs";
import { calendar } from "./world_calendar.mjs";
import { buildAllocate } from "./allocate_payload.mjs";
const FILE = "data/living-world/perf-budget.json", WORLD = "/home/user/cf-overworld/data";
const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
const best3 = (fn) => Math.min(...[0, 1, 2].map(() => { const t = performance.now(); fn(); return performance.now() - t; }));
const zc = zoneContext(WORLD, "BUS", PA), L3 = JSON.parse(fs.readFileSync(`${WORLD}/hexagon-city-source/l3/BUS.json`, "utf8")).singles.filter((p) => p.center).slice(0, 20000);
const atk = { governorId: "g", armies: [{ armyId: "a", units: [{ cls: "INFANTRY", count: 100 }], officers: [], provisions: { food: 0, gold: 0, wood: 0 }, entryEdge: "S" }] };
export const PROBES = {
  seedSingle_us: () => best3(() => { for (const p of L3) seedSingle(p, zc); }) * 1000 / L3.length,                      // µs per lazy parcel seed
  boardAt_ms: () => best3(() => { for (let t = 0; t < 10; t++) boardAt("cf-world-1", "BUS", 720 + t * 97, {}); }) / 10,  // ms per board view
  shipsAt_ms: () => best3(() => { for (let t = 0; t < 100; t++) shipsAt("cf-world-1", t * 61); }) / 100,                  // ms per world-traffic frame (166 hulls)
  calendar_ms: () => best3(() => { for (let d = 0; d < 28; d++) calendar("cf-world-1", "BUS", d); }) / 28,                 // ms per region-day
  buildAllocate_ms: () => best3(() => { for (let i = 0; i < 200; i++) buildAllocate({ battleId: "battle_" + i, worldSeed: "w", poi: { id: "p" + i, lwKind: "HARBOUR", threat: 30, ground: "WATER" }, zone: "BUS", parcelId: "1001178", attacker: atk, callbackUrl: "x" }); }) / 200,
};
const BATCH = {
  seedSinglesAll_s: () => { const t = performance.now(); execFileSync("node", ["tools/living-world/seed_singles.mjs", "--out", "/tmp"], { stdio: "ignore" }); return (performance.now() - t) / 1000; },
  simMatrix_s: () => { const t = performance.now(); execFileSync("node", ["tools/living-world/sim_matrix.mjs", "--out", "/tmp/perf_mx.md"], { stdio: "ignore" }); return (performance.now() - t) / 1000; },
};
const r3 = (x) => Math.round(x * 1000) / 1000;
export function measure() { return Object.fromEntries(Object.entries(PROBES).map(([k, f]) => [k, r3(f())])); }

if (process.argv[1] && process.argv[1].endsWith("perf_budget.mjs")) {
  if (process.argv.includes("--record")) {
    const m = measure(), b = Object.fromEntries(Object.entries(BATCH).map(([k, f]) => [k, Math.round(f() * 10) / 10]));
    fs.writeFileSync(FILE, JSON.stringify({ schema: "cf-living-world/perf-budget@1", note: "baselines (best of 3) on the dev container; budget = max(2× baseline, baseline + 0.05); per-call probes gate in the test suite, batch jobs are reference only", baseline: m, budget: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, r3(Math.max(v * 2, v + 0.05))])), batchReference: b }, null, 1) + "\n");
    console.log("recorded", JSON.stringify(m), JSON.stringify(b));
  } else {
    const B = JSON.parse(fs.readFileSync(FILE, "utf8")), m = measure(), over = Object.entries(m).filter(([k, v]) => v > B.budget[k]);
    for (const [k, v] of Object.entries(m)) console.log(`${k.padEnd(18)} ${String(v).padStart(8)}  budget ${B.budget[k]}${v > B.budget[k] ? "  ❌ OVER" : ""}`);
    process.exit(over.length ? 1 : 0);
  }
}
