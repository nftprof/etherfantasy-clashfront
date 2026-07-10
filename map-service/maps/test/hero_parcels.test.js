// heroParcels[] designation tests — canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d.
// Asserts the committed data/world-terrain/*.json castles carry the LARGE 3 / GIANT 5 / EPIC 8
// ladder (castle parcel FIRST, all parcels belonging to the estate), the no-L3 deferral, that
// re-running the shared pick rule reproduces the committed picks, and that worldfield.js passes
// heroParcels through to the parcel window.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { computeHeroParcels, HERO_PARCEL_QUOTA } from "../../tools/world_hero_parcels.mjs";
import { loadWorldField, worldParcel, clearWorldFieldCache } from "../worldfield.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗ FAIL", name); } };

const l2 = JSON.parse(fs.readFileSync(path.join(ROOT, "data/hexagon-city-source/parcels-l2.json"), "utf8")).parcels;
const l2ById = new Map(l2.map((p) => [p.parcelId, p]));
const zoneCode = { BUS: "00", EDU: "02", ENT: "03", HUB: "07" };
const loadL3 = (z) => JSON.parse(fs.readFileSync(path.join(ROOT, `data/hexagon-city-source/l3/${z}.json`), "utf8")).singles;

console.log("— the ladder + ownership + castle-first (all three committed fields) —");
clearWorldFieldCache();
for (const zone of ["EDU", "HUB", "BUS", "ENT"]) {
  const field = loadWorldField(zone);
  ok(field && Array.isArray(field.castles) && field.castles.length > 0, `${zone}: field loads with castles[]`);
  const l3 = loadL3(zone);
  const l3ById = new Map(l3.map((s) => [s.parcelId, s]));
  const byParent = new Map();
  for (const s of l3) { if (!byParent.has(s.parentIndex)) byParent.set(s.parentIndex, []); byParent.get(s.parentIndex).push(s); }
  let allGood = true, deferGood = true, ruleGood = true;
  for (const c of field.castles) {
    const estate = l2ById.get(c.townEstateId);
    const kids = byParent.get(estate.sourceIndex) || [];
    const quota = HERO_PARCEL_QUOTA[estate.sizeClass];
    if (!kids.length) {
      if (!(Array.isArray(c.heroParcels) && c.heroParcels.length === 0 && typeof c.heroParcelsNote === "string" && /DEFERRED/i.test(c.heroParcelsNote))) deferGood = false;
    } else {
      const prefix = "6" + zoneCode[zone] + String(estate.sourceIndex).padStart(4, "0");
      if (c.heroParcels.length !== Math.min(quota, kids.length)) allGood = false;
      if (new Set(c.heroParcels).size !== c.heroParcels.length) allGood = false;
      if (!c.heroParcels.every((p) => p.startsWith(prefix))) allGood = false;
      const first = l3ById.get(c.heroParcels[0]);
      if (!(first && c.at[0] >= first.bbox[0] && c.at[0] <= first.bbox[2] && c.at[1] >= first.bbox[1] && c.at[1] <= first.bbox[3])) allGood = false;
      // the shared rule reproduces the committed picks (same features the generator used)
      const features = [];
      for (const list of ["roads", "rivers", "coast"]) for (const f of field[list] || []) if (Array.isArray(f.pts)) features.push(f.pts);
      const re = computeHeroParcels(estate, kids, c.at, features);
      if (JSON.stringify(re.heroParcels) !== JSON.stringify(c.heroParcels)) ruleGood = false;
    }
  }
  ok(allGood, `${zone}: every subdivided castle estate meets its quota, castle parcel first, no dupes, all parcels the estate's own`);
  ok(deferGood, `${zone}: every un-subdivided castle estate defers (heroParcels [] + DEFERRED note)`);
  ok(ruleGood, `${zone}: computeHeroParcels re-derives the committed picks (rule = data)`);
}

console.log("— the headline case: a GIANT castle estate in EDU has exactly 5, castle first —");
{
  const field = loadWorldField("EDU");
  const westgate = field.castles.find((c) => c.id === "EDU-CASTLE-WESTGATE");
  const estate = l2ById.get(westgate.townEstateId);
  ok(estate.sizeClass === "GIANT", "Westgate Castle sits on a GIANT estate (2020367)");
  ok(westgate.heroParcels.length === 5, "GIANT ladder: exactly 5 heroParcels");
  const prefix = "602" + String(estate.sourceIndex).padStart(4, "0");
  ok(westgate.heroParcels.every((p) => p.startsWith(prefix)), "all 5 belong to estate 2020367");
  const l3ById = new Map(loadL3("EDU").map((s) => [s.parcelId, s]));
  const first = l3ById.get(westgate.heroParcels[0]);
  ok(first.bbox[0] <= westgate.at[0] && westgate.at[0] <= first.bbox[2] &&
     first.bbox[1] <= westgate.at[1] && westgate.at[1] <= first.bbox[3], "first entry = the castle parcel (bbox contains the POI)");
  const epic = field.castles.find((c) => c.id === "EDU-PALACE-ACADEMY");
  ok(epic.heroParcels.length === 0 && /DEFERRED/i.test(epic.heroParcelsNote || ""), "EPIC 1020371 (no L3 subdivision) defers with a note");
  const keep = field.castles.find((c) => c.id === "EDU-KEEP-CLIFFWATCH");
  ok(keep.heroParcels.length === 3, "LARGE ladder: exactly 3 heroParcels");

  // worldfield passthrough: the castle parcel's window exposes the castle WITH heroParcels
  const snap = loadL3("EDU").find((s) => s.parcelId === westgate.heroParcels[0]);
  const parcel = worldParcel(snap);
  const winCastle = parcel.worldField?.castles?.find((c) => c.id === "EDU-CASTLE-WESTGATE");
  ok(!!winCastle, "featuresForParcel lands the castle POI on the castle parcel");
  ok(JSON.stringify(winCastle?.heroParcels) === JSON.stringify(westgate.heroParcels) && winCastle?.townEstateId === westgate.townEstateId,
     "featuresForParcel passes heroParcels + townEstateId through verbatim");
}

console.log(`\n${fail ? "❌" : "✅"} hero-parcels: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
