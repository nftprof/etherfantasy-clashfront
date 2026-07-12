// WORLD-ELEMENTS OVERLAY tests — docs/briefs/WORLD-ELEMENTS-OVERLAY.md.
// Loader merge + validation/id-collision skips + parcel windowing + battle-map décor
// materialization (deterministic, RUIN-class passive, invariants hold) + the CRITICAL no-op
// guarantee: a zone/parcel with no overlay elements generates byte-identically with the overlay
// machinery on vs off (empty WORLD_ELEMENTS_DIR = the pre-overlay code path).
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { loadWorldField, featuresForParcel, worldParcel, allPlaces, clearWorldFieldCache } from "../worldfield.js";
import { generate } from "../generate.js";
import { toBattlefieldA1 } from "../command_converter.js";
import { T, gIdx, cellOf } from "../schema.js";
import { erode } from "../validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗ FAIL", name); } };

const decode = (s) => new Uint8Array(Buffer.from(s, "base64"));
// independent invariant re-check (same as maps.test.js): BFS on the eroded walk grid — every
// arena edge must reach the defender base.
function edgesReachBase(art) {
  const G = art.terrain.w, g = decode(art.terrain.cells);
  const e = erode(g, G);
  const base = art.spawnZones.find((s) => s.id === "def_base");
  const bi = gIdx(G, cellOf(G, base.x), cellOf(G, base.z));
  const par = new Int32Array(G * G).fill(-2); const q = [];
  const seed = e[bi] ? bi : (() => { for (let r = 1; r < 10; r++) for (let d = -r; d <= r; d++) { for (const i of [bi + d, bi + d * G]) if (i >= 0 && i < G * G && e[i]) return i; } return bi; })();
  par[seed] = -1; q.push(seed);
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
      const ni = nz * G + nx;
      if (par[ni] === -2 && e[ni]) { par[ni] = i; q.push(ni); }
    }
  }
  const hit = (cells) => cells.some((i) => par[i] !== -2);
  return hit([...Array(G)].map((_, t) => t)) && hit([...Array(G)].map((_, t) => (G - 1) * G + t)) &&
         hit([...Array(G)].map((_, t) => t * G)) && hit([...Array(G)].map((_, t) => t * G + G - 1));
}

const MIDWAY_BBOX = [16.53, 446.23, 25.9, 455.69];    // ENT estate 4031326 — the carnival midway
const UW2_STAIR_BBOX = [14.27, 45.13, 17.67, 49.48];  // UW2 estate 5100488 — the Stair-foot terrace
const withElementsDir = (dir, fn) => {
  const prev = process.env.WORLD_ELEMENTS_DIR;
  if (dir === undefined) delete process.env.WORLD_ELEMENTS_DIR; else process.env.WORLD_ELEMENTS_DIR = dir;
  clearWorldFieldCache();
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.WORLD_ELEMENTS_DIR; else process.env.WORLD_ELEMENTS_DIR = prev;
    clearWorldFieldCache();
  }
};
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-elements-empty-"));

console.log("— loader merge (the committed hunt starter sets) —");
{
  clearWorldFieldCache();
  const ent = loadWorldField("ENT");
  const els = ent.overlayElements || [];
  ok(els.length === 5 && els.every((e) => e.layer === "hunt"), "ENT: 5 hunt elements merged, all tagged layer 'hunt'");
  ok(els.every((e) => e.id && e.kind && Array.isArray(e.at)), "ENT: every element carries id/kind/at");
  ok(!(ent.pois || []).some((p) => String(p.id).includes("HUNT")), "ENT: overlay never mixed into field pois[] (field stays frozen canon)");
  const places = allPlaces(ent);
  ok(places.length === (ent.pois?.length || 0) + (ent.castles?.length || 0) + 5, "allPlaces = pois + castles + overlay");
  ok(places.filter((p) => p.layer === "field").length === (ent.pois?.length || 0) + (ent.castles?.length || 0), "allPlaces tags pois+castles layer 'field'");
  const uw2 = loadWorldField("UW2");
  ok((uw2.overlayElements || []).length === 5, "UW2: 5 hunt elements merged (stair camp, bowl shrine, banquet door, undertow, sluice)");
  const edu = loadWorldField("EDU");
  ok(edu.overlayElements === undefined, "EDU (no overlay files): field.overlayElements absent");
  ok(allPlaces(edu).every((p) => p.layer === "field"), "EDU allPlaces: only field-layer places");
}

console.log("— loader validation: id collision / geometry ban / off-field / missing keys —");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-elements-val-"));
  fs.writeFileSync(path.join(dir, "ENT.aaa.json"), JSON.stringify({
    _meta: { layer: "aaa", zone: "ENT" },
    elements: [
      { id: "ENT-TEST-OK1", kind: "QUEST_SITE", at: [21.2, 449.4] },
      { id: "ENT-CITY", kind: "NPC", at: [18, 451] },                              // collides with a field poi
      { id: "ENT-TEST-GEOM", kind: "CAMP", at: [21, 449], pts: [[0, 0], [1, 1]] }, // geometry ban
      { id: "ENT-TEST-WIDE", kind: "CAMP", at: [21, 449], width: 0.2 },            // geometry ban (width)
      { id: "ENT-TEST-FAR", kind: "SHRINE", at: [99999, 99999] },                  // off the field bbox
      { kind: "CAMP", at: [21, 449] },                                             // missing id
      { id: "ENT-TEST-NOAT", kind: "CAMP" },                                       // missing at
    ],
  }));
  fs.writeFileSync(path.join(dir, "ENT.bbb.json"), JSON.stringify({
    _meta: { layer: "bbb", zone: "ENT" },
    elements: [
      { id: "ENT-TEST-OK1", kind: "MARKET", at: [22, 450] },                       // collides with ENT.aaa (filename order wins)
      { id: "ENT-TEST-OK2", kind: "STAGE", at: [21.5, 449.5], parcelId: "4031326" },
    ],
  }));
  withElementsDir(dir, () => {
    const f = loadWorldField("ENT");
    const els = f.overlayElements || [];
    ok(els.length === 2, "only the 2 valid, non-colliding elements load");
    ok(els[0].id === "ENT-TEST-OK1" && els[0].layer === "aaa" && els[0].kind === "QUEST_SITE",
      "duplicate id: the earlier filename wins (ENT.aaa before ENT.bbb)");
    ok(els[1].id === "ENT-TEST-OK2" && els[1].parcelId === "4031326", "explicit parcelId carried through");
    // explicit-parcelId pinning at windowing time
    const pinnedIn = featuresForParcel(f, { bbox: MIDWAY_BBOX, sizeM: 322, parcelId: "4031326" });
    const pinnedOut = featuresForParcel(f, { bbox: MIDWAY_BBOX, sizeM: 322, parcelId: "9999999" });
    ok(pinnedIn.overlayElements.some((e) => e.id === "ENT-TEST-OK2"), "pinned element windows into its parcel");
    ok(!pinnedOut.overlayElements.some((e) => e.id === "ENT-TEST-OK2"), "pinned element excluded from any other parcel");
  });
}

console.log("— windowing (bbox test, arena transform) —");
{
  clearWorldFieldCache();
  const ent = loadWorldField("ENT");
  const wf = featuresForParcel(ent, { bbox: MIDWAY_BBOX, sizeM: 322, parcelId: "4031326" });
  const ids = wf.overlayElements.map((e) => e.id).sort();
  ok(JSON.stringify(ids) === JSON.stringify(["ENT-HUNT-DESCENDERS-REST", "ENT-HUNT-MIDWAY", "ENT-HUNT-MIDWAY-TENT", "ENT-HUNT-SAMBADROME-STAGE"]),
    "midway estate windows exactly its 4 elements (mask-seller stays in Velaria)");
  ok(wf.overlayElements.every((e) => Math.abs(e.at[0]) <= 161 && Math.abs(e.at[1]) <= 161 && e.layer === "hunt"),
    "windowed elements are in the ±161 battle frame, layer-tagged");
  const far = featuresForParcel(ent, { bbox: [200, 200, 210, 210], sizeM: 322 });
  ok(far.overlayElements.length === 0, "a distant parcel windows none");
  const uw2 = loadWorldField("UW2");
  const stairWf = featuresForParcel(uw2, { bbox: UW2_STAIR_BBOX, sizeM: 322, parcelId: "5100488" });
  ok(JSON.stringify(stairWf.overlayElements.map((e) => e.id).sort()) === JSON.stringify(["UW2-HUNT-BOWLKEEPER-SHRINE", "UW2-HUNT-STAIRFOOT-CAMP"]),
    "UW2 Stair-foot estate windows camp + shrine");
}

console.log("— battle-map materialization (RUIN-class décor; deterministic; invariants hold) —");
{
  clearWorldFieldCache();
  const parcel = { parcelId: "4031326", biome: "TEMPERATE_GRASS", zone: "ENT", bbox: MIDWAY_BBOX };
  const a = generate(parcel), b = generate(parcel);
  ok(JSON.stringify(a) === JSON.stringify(b), "double-run byte-identical (rng-free décor pass)");
  const decor = a.obstacles.filter((o) => o.layer === "hunt");
  ok(decor.length === 4 && a.meta.overlay?.placed === 4, "all 4 windowed elements placed as décor (+ meta.overlay.placed)");
  ok(decor.every((o) => o.name && o.kind && typeof o.x === "number"), "décor keeps kind/name");
  const G = a.terrain.w, cells = decode(a.terrain.cells);
  ok(decor.every((o) => cells[gIdx(G, cellOf(G, o.x), cellOf(G, o.z))] === T.OPEN), "every décor anchor snapped onto an OPEN cell");
  ok(edgesReachBase(a), "playability invariant holds on the overlaid parcel (edges reach base)");
  // the overlay touches ONLY obstacles + meta: same parcel with an empty elements dir differs nowhere else
  const bare = withElementsDir(emptyDir, () => generate(parcel));
  ok(JSON.stringify(bare.terrain) === JSON.stringify(a.terrain), "terrain grid + walk mask byte-identical with/without overlay");
  for (const k of ["arena", "resources", "buildSpots", "spawnZones", "lanes", "routes", "barriers", "mobs", "structures", "laneCount"])
    if (JSON.stringify(bare[k]) !== JSON.stringify(a[k])) { ok(false, `overlay must not touch ${k}`); }
  ok(JSON.stringify(a.obstacles.filter((o) => !o.layer)) === JSON.stringify(bare.obstacles), "non-overlay obstacles identical (décor only prepended)");
  // A1 conversion carries the layer through as passable décor
  const a1 = toBattlefieldA1(a), a1bare = toBattlefieldA1(bare);
  const a1decor = a1.obstacles.filter((o) => o.layer === "hunt");
  ok(a1decor.length === 4 && a1decor.every((o) => o.passable === true && o.name), "A1: overlay décor passable:true with layer+name");
  ok(JSON.stringify(a1.obstacles.filter((o) => !o.layer)) === JSON.stringify(a1bare.obstacles), "A1: everything but the décor identical");
  // UW2 parcel too
  const uw2Art = generate({ parcelId: "5100488", biome: "SWAMP", zone: "UW2", bbox: UW2_STAIR_BBOX });
  ok(uw2Art.obstacles.filter((o) => o.layer === "hunt").length === 2 && edgesReachBase(uw2Art),
    "UW2 Stair-foot parcel gains camp + shrine décor and stays valid");
}

console.log("— per-parcel cap (6) with deterministic drop order —");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-elements-cap-"));
  const elements = "ABCDEFGH".split("").map((c) => ({ id: `ENT-CAP-${c}`, kind: "CAMP", at: [21 + 0.1 * c.charCodeAt(0) / 100, 449.4] }));
  fs.writeFileSync(path.join(dir, "ENT.cap.json"), JSON.stringify({ _meta: { layer: "cap", zone: "ENT" }, elements }));
  withElementsDir(dir, () => {
    const art = generate({ parcelId: "4031326", biome: "TEMPERATE_GRASS", zone: "ENT", bbox: MIDWAY_BBOX });
    const placed = art.obstacles.filter((o) => o.layer === "cap").map((o) => o.id);
    ok(placed.length === 6, "cap: exactly 6 placed");
    ok(JSON.stringify(art.meta.overlay.dropped) === JSON.stringify([{ id: "ENT-CAP-G", why: "cap" }, { id: "ENT-CAP-H", why: "cap" }]),
      "cap: the id-order tail dropped + logged in meta.overlay.dropped");
  });
}

console.log("— CRITICAL no-op: zones/parcels without overlay elements are byte-identical —");
{
  // real-world samples across the no-overlay zones (EDU/HUB/BUS) + a field zone with no overlay
  // file (UW3) + an ENT parcel far from every hunt element (a zone WITH overlays).
  const samples = [];
  for (const [zone, pid] of [["EDU", "60203670103"], ["HUB", "60716650182"], ["BUS", "60011440099"]]) {
    const snap = JSON.parse(fs.readFileSync(path.join(ROOT, `data/hexagon-city-source/l3/${zone}.json`), "utf8"))
      .singles.find((s) => s.parcelId === pid);
    samples.push({ zone, snap });
  }
  let allSame = true, decorLeak = false;
  for (const { zone, snap } of samples) {
    clearWorldFieldCache();
    const withO = generate(worldParcel(snap, {}));
    const without = withElementsDir(emptyDir, () => generate(worldParcel(snap, {})));
    if (JSON.stringify(withO) !== JSON.stringify(without)) allSame = false;
    if (withO.obstacles.some((o) => o.layer)) decorLeak = true;
  }
  ok(allSame, "EDU/HUB/BUS committed-sample parcels: overlay machinery on vs off ⇒ byte-identical");
  ok(!decorLeak, "no overlay décor leaks into no-overlay zones");
  clearWorldFieldCache();
  const uw3Snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/UW3.json"), "utf8")).singles[0];
  const uw3a = generate(worldParcel(uw3Snap, {}));
  const uw3b = withElementsDir(emptyDir, () => generate(worldParcel(uw3Snap, {})));
  ok(JSON.stringify(uw3a) === JSON.stringify(uw3b), "UW3 (field, no overlay file): byte-identical");
  // ENT parcel far from every element: the zone HAS overlays but this parcel windows none
  clearWorldFieldCache();
  const farParcel = { parcelId: "FAR-ENT", biome: "TEMPERATE_GRASS", zone: "ENT", bbox: [200, 200, 208, 208] };
  const farA = generate(farParcel);
  const farB = withElementsDir(emptyDir, () => generate(farParcel));
  ok(JSON.stringify(farA) === JSON.stringify(farB), "ENT parcel outside every element bbox: byte-identical");
}

clearWorldFieldCache();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
