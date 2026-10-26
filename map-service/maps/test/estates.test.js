// Whole-estate default maps (docs/maps/MAP-POPULATION-GUIDE.md): an un-subdivided L2 estate gets
// ONE ±161 map windowed over its own polygon, the ladder fortification by size, a sim-approved
// default via the fallback chain, lazily through the API and in bulk through the bake — and the
// registry batch mode defers index writes. Real world data (parcels-l2 + world fields).
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";

process.env.MAPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "efmaps-est-"));
process.env.MAPS_WORLD_URL = "http://127.0.0.1:9";
process.env.MAPS_API_TOKEN = "test-admin-key";

const { l2Row, l2Zone, estateParcel } = await import("../worldfield.js");
const { generate } = await import("../generate.js");
const { simulate } = await import("../simulate.js");
const reg = await import("../registry.js");
const { mapsApi } = await import("../api.js");

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗ FAIL", n); } };
const IDX = path.join(process.env.MAPS_DIR, "index.json");

console.log("— estate rows + bake order —");
{
  const bus = l2Zone("BUS");
  ok(bus.length === 577 && bus.every((e) => !e.l3Enabled), `BUS has 577 un-subdivided estates (${bus.length})`);
  ok(bus[0].sizeClass === "EPIC" && bus[bus.length - 1].sizeClass === "SMALL", "ordered biggest first (EPIC … SMALL)");
  const all = l2Zone("BUS", { unsubdividedOnly: false });
  ok(all.length === 1187, `whole BUS estate table available (${all.length})`);
  ok(l2Row("1071732")?.sizeClass === "EPIC" && l2Row("60203370158") === null, "l2Row finds estates, not L3 ids");
}

console.log("— ladder fortification —");
{
  const epic = estateParcel(l2Row("1001175"));                    // BUS EPIC, no authored castle
  const c = epic.worldField.castles[0];
  ok(c && c.kind === "PALACE" && c.ladder && c.autoNamed && /Palace of Porthaven/.test(c.name), `EPIC without an authored castle grows a ladder PALACE (${c && c.name})`);
  ok(epic.investLevel === 3 && epic.sizeClass === "EPIC", "EPIC = invest tier 3 + sizeClass carried");
  ok(Array.isArray(epic.fallbacks) && epic.fallbacks.length === 3 &&
     epic.fallbacks[0].worldField.castles[0].kind === "CASTLE" && epic.fallbacks[1].worldField.castles[0].kind === "KEEP" && !epic.fallbacks[2].worldField.castles.length,
     "fallback chain PALACE → CASTLE → KEEP → none");
  const palace = estateParcel(l2Row("1071732"));                  // HUB EPIC with the authored Vermilion Palace
  ok(palace.worldField.castles.length === 1 && !palace.worldField.castles[0].ladder && !palace.fallbacks, "an authored castle is kept, no ladder fort, no fallbacks");
  const medium = estateParcel(l2Zone("BUS").find((e) => e.sizeClass === "MEDIUM"));
  ok(!(medium.worldField && medium.worldField.castles.some((x) => x.ladder)) && medium.investLevel === 1, "MEDIUM/SMALL: nothing baked (ladder), tier 1");
  const a1 = generate(epic), a2 = generate(estateParcel(l2Row("1001175")));
  ok(JSON.stringify(a1) === JSON.stringify(a2), "estate map is byte-identical across runs");
  ok(a1.meta.castleGeom && a1.meta.sizeClass === "EPIC", "generated artifact carries castleGeom + sizeClass");
  ok(simulate(a1).pass, "ladder-palace EPIC passes the sim gate");
}

console.log("— registry: fallback chain + batch mode —");
{
  reg.beginBatch();
  const giant = reg.ensureDesign(estateParcel(l2Row("2001107")));   // measured: ladder CASTLE fails flow check here
  ok(giant.row.approved && giant.row.sim.modes.length >= 3, `fallback chain yields an APPROVED default (${giant.row.sim.modes.join("/")})`);
  console.log(`    (2001107 settled on: ${giant.artifact.meta.castleGeom ? "a smaller fort" : "no fort"} — the chain keeps the grandest variant that passes)`);
  ok(giant.row.estateSize === "GIANT" && giant.row.genVersion > 0, "index row records estate size + generator version");
  ok(!fs.existsSync(IDX), "batch mode: index.json not written per design");
  reg.flushIdx();
  ok(fs.existsSync(IDX) && JSON.parse(fs.readFileSync(IDX, "utf8"))["2001107"], "flushIdx writes the index on demand");
  reg.ensureDesign(estateParcel(l2Row("1001175")));
  const before = fs.statSync(IDX).mtimeMs;
  ok(!JSON.parse(fs.readFileSync(IDX, "utf8"))["1001175"], "still batched: new row not on disk yet");
  reg.endBatch();
  ok(JSON.parse(fs.readFileSync(IDX, "utf8"))["1001175"] && fs.statSync(IDX).mtimeMs >= before, "endBatch flushes");
  const again = reg.ensureDesign(estateParcel(l2Row("1001175")));
  ok(again.row.designVersion === 0 && again.row.status === "SEED_V0", "idempotent: re-bake leaves the seeded row untouched");
}

console.log("— API: lazy estate default + committed palace precedence —");
{
  const srv = http.createServer((req, res) => { if (!mapsApi(req, res)) { res.writeHead(404); res.end("lobby"); } });
  await new Promise((r) => srv.listen(0, r));
  const B = `http://127.0.0.1:${srv.address().port}`;
  const j = (p) => fetch(B + p).then((r) => r.json());
  const d = await j("/internal/v1/designs/1001176");                 // BUS EPIC, un-mapped until now
  ok(d.ok && d.row.status === "SEED_V0" && d.artifact.meta.sizeClass === "EPIC" && d.artifact.meta.castleGeom, "GET lazily seeds a whole-estate map with its ladder palace");
  ok(d.budget && d.budget.level === 3, "estate budget = tier 3");
  const p = await j("/internal/v1/designs/1071732");
  ok(p.ok && p.row.status === "ESTATE_MAP" && p.row.frozen, "a committed flagship palace still wins (read-only ESTATE_MAP)");
  const t = await fetch(B + "/internal/v1/designs/1001176/thumb.png");
  ok(t.status === 200, "estate thumbnail served");
  srv.close();
}

console.log(`\n${fail ? "❌" : "✅"} estates: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
