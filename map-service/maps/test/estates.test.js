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
  const kinds = (p) => p.fallbacks.map((f) => (f.worldField.castles[0] ? f.worldField.castles[0].kind : "none") + (f.bareField ? "*" : "")).join(" ");
  ok(Array.isArray(epic.fallbacks) && kinds(epic) === "CASTLE KEEP none PALACE* CASTLE* KEEP* none*",
     `fallback chain PALACE → CASTLE → KEEP → none, then the same ladder bare (${kinds(epic)})`);
  ok(epic.fallbacks.every((f) => f.fieldSha === epic.fieldSha) && !epic.fallbacks[2].bareField && epic.fallbacks[3].bareField && !epic.fallbacks[3].worldField.roads.length,
     "bare variants drop the world-field window but keep the self-heal fieldSha");
  const small = estateParcel(l2Zone("BUS").find((e) => e.sizeClass === "SMALL"));
  ok(kinds(small) === "none*", "a fortless estate still gets its bare last-resort variant");
  const palace = estateParcel(l2Row("1071732"));                  // HUB EPIC with the authored Vermilion Palace
  ok(palace.worldField.castles.length === 1 && !palace.worldField.castles[0].ladder && palace.worldField.castles[0].authored &&
     palace.worldField.castles[0].kind === "PALACE" && /Vermilion/.test(palace.worldField.castles[0].name) &&
     palace.worldField.castles[0].at[0] === 0 && palace.worldField.castles[0].at[1] === 0,
     "an authored castle is kept (kind + name), no ladder fort, pinned to the arena centre");
  ok(palace.fallbacks && kinds(palace) === "CASTLE KEEP none PALACE* CASTLE* KEEP* none*" && palace.fallbacks[0].worldField.castles[0].steppedFrom === "PALACE",
     "authored fort gets the same step-down chain (PALACE → CASTLE → KEEP → none, then bare)");
  // UW1 Lampsend Bastion: authored CASTLE on an un-subdivided GIANT whose field `at` falls off-centre in the window
  const lamp = estateParcel(l2Row("2091230"));
  ok(lamp.worldField.castles.length === 1 && lamp.worldField.castles[0].kind === "CASTLE" && /Lampsend/.test(lamp.worldField.castles[0].name) &&
     lamp.worldField.castles[0].at[0] === 0 && lamp.worldField.castles[0].at[1] === 0, "UW1 Lampsend Bastion: authored CASTLE centred on its estate map");
  ok([lamp, ...lamp.fallbacks].some((v) => simulate(generate(v)).pass), "Lampsend chain has a sim-approved variant");
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
  ok(!giant.row.sim.checks && Array.isArray(giant.artifact.meta.sim.checks) && giant.artifact.meta.sim.checks.length >= 6 && JSON.stringify(giant.row).length < 700,
     `index row is SLIM (${JSON.stringify(giant.row).length} B, no checks); the full verdict lives in artifact.meta.sim`);
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
  ok(again.row.chainV === reg.CHAIN_V, `row records the fallback-chain version it settled under (chainV ${again.row.chainV})`);
  // CHAIN RETRY: an unapproved row settled under an older chain gets exactly one more pass
  const idxNow = JSON.parse(fs.readFileSync(IDX, "utf8"));
  idxNow["1001175"].approved = false; idxNow["1001175"].chainV = 1;
  fs.writeFileSync(IDX, JSON.stringify(idxNow));
  reg._resetForTest();                                             // drop the in-memory index so the edited file is read
  const retried = reg.ensureDesign(estateParcel(l2Row("1001175")));
  ok(retried.row.designVersion === 1 && retried.row.approved && retried.row.chainV === reg.CHAIN_V, "unapproved row under an older chain is re-settled (v1, approved)");
  const settled = reg.ensureDesign(estateParcel(l2Row("1001175")));
  ok(settled.row.designVersion === 1, "…and only once (approved rows are never re-rolled)");
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
  // OLD-ID ALIAS (CONTINENT-1-EDU): CF's `602…` token ids resolve to the current registry key
  const { l3Row, canonicalParcelId } = await import("../worldfield.js");
  ok(l3Row("60203670103")?.parcelId === "20203670103" && canonicalParcelId("60203670103") === "20203670103" && canonicalParcelId("20203670103") === "20203670103",
     "l3Row/canonicalParcelId: old token id 60203670103 → current 20203670103 (Westgate Castle parcel)");
  const old = await j("/internal/v1/designs/60203670103");
  ok(old.ok && old.row.parcelId === "20203670103" && old.artifact.meta.castleGeom, "GET by OLD id lazily seeds + returns the CURRENT row (castle parcel, castleGeom)");
  const same = await j("/internal/v1/designs/20203670103");
  ok(same.ok && same.row.designVersion === old.row.designVersion && same.row.seed === old.row.seed, "old and current id hit the same registry row");
  const ot = await fetch(B + "/internal/v1/designs/60203670103/thumb.png");
  ok(ot.status === 200, "thumbnail served under the old id too");
  srv.close();
}

console.log(`\n${fail ? "❌" : "✅"} estates: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
