// TRAVERSABILITY AUDIT tests (owner 2026-08-01: headless walk sims — "NPC and player can walk
// over these paths; every stair to the walls; through gates, not through walls").
// Asserts over a mixed population (single-parcel castles + committed estate maps):
//   • deterministic: same artifact ⇒ byte-identical audit
//   • the audit grid actually BLOCKS walls (a straight wall crossing away from gates is blocked)
//   • every gate walk (outside apron → courtyard) succeeds — arches are the way in
//   • every stair foot is reachable from the courtyard (stairsOk === stairs)
//   • ~100 walks run; the overwhelming majority succeed (roam pairs may hit isolated pockets)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { worldParcel, l3Row, clearWorldFieldCache } from "../worldfield.js";
import { generate } from "../generate.js";
import { runAudit, buildAuditGrid } from "../traverse.js";
import { gIdx, cellOf } from "../schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log("  ✗ FAIL", name); } };

clearWorldFieldCache();
const PARCELS = ["20716710172", "21010920077", "30010350134", "20203680154"];
const ESTATES = ["1071729", "1101100"];
const arts = [];
for (const pid of PARCELS) arts.push([pid, generate(worldParcel(l3Row(pid), {}))]);
for (const id of ESTATES) arts.push([`ESTATE ${id}`, JSON.parse(fs.readFileSync(path.join(ROOT, `data/cf-maps/artifacts/${id}.artifact.json`), "utf8"))]);

for (const [label, art] of arts) {
  const au = runAudit(art);
  const au2 = runAudit(art);
  ok(JSON.stringify(au) === JSON.stringify(au2), `${label}: audit is deterministic`);
  ok(au.stats.walks >= 90, `${label}: ~100 walks ran (${au.stats.walks})`);
  ok(au.stats.reached >= au.stats.walks * 0.9, `${label}: ≥90% walks traverse (${au.stats.reached}/${au.stats.walks})`);
  const gateWalks = au.trails.filter((t) => t.kind === "gate");
  ok(gateWalks.length >= 1 && gateWalks.every((t) => t.ok),
    `${label}: every gate walk enters through the arch (${gateWalks.filter((t) => t.ok).length}/${gateWalks.length})`);
  ok(au.stats.stairs >= 1 && au.stats.stairsOk === au.stats.stairs,
    `${label}: every stair foot reachable from the courtyard (${au.stats.stairsOk}/${au.stats.stairs})`);
  // the wall actually blocks: a mid-segment wall point (≥8u from every gate) must be a blocked cell
  const cg = art.meta.castleGeom;
  const { G, blocked } = buildAuditGrid(art);
  const gates = (cg.rings[0].gates || []).map((g) => g.at || g);
  let checked = false, blockedOk = true;
  const pts = cg.rings[0].pts;
  for (let i = 0; i < pts.length && !checked; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length];
    const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
    if (Math.min(...gates.map((g) => Math.hypot(g[0] - mx, g[1] - mz))) < 9) continue;
    checked = true;
    blockedOk = !!blocked[gIdx(G, cellOf(G, mx), cellOf(G, mz))];
  }
  ok(!checked || blockedOk, `${label}: wall bodies are solid in the audit grid (no through-wall walks)`);
}

console.log(`\ntraverse audit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
