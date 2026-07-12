// FILL water tests (owner fix-it 2026-07-11): a rivers[] entry with `fill: true` (lake/caldera)
// BYPASSES the worldfield zoneCap width clamp — its full authored width windows into the parcel
// honestly — and generate.js paints its true footprint (paintFill). Playability on water-dominant
// parcels is guaranteed by the carve + validateAndRepair causeway machinery (WATER→ROAD): on a
// 100%-submerged Mere-of-Dominus parcel the repair carve IS the causeway across the mere.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadWorldField, featuresForParcel, fitToArena, svgPathToPolygon, worldParcel, clearWorldFieldCache } from "../worldfield.js";
import { generate } from "../generate.js";
import { T, gIdx, cellOf } from "../schema.js";
import { erode } from "../validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗ FAIL", name); } };
const decode = (s) => new Uint8Array(Buffer.from(s, "base64"));

// a REAL Mere-of-Dominus interior parcel: UW2 L3 single 61007840000 sits 8.6 zone-units from the
// Bastion island center — deep inside the Mere ring band (centerline r=9, honest half-width 2.25).
const uw2l3 = JSON.parse(fs.readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/UW2.json"), "utf8"));
const MERE_SNAP = uw2l3.singles.find((s) => s.parcelId === "61007840000");

console.log("— fill bypasses the width cap (honest lake width) —");
{
  clearWorldFieldCache();
  const field = loadWorldField("UW2");
  ok(field && field.rivers.some((r) => r.fill === true && r.id === "UW2-LK-MERE"), "UW2 field authors the Mere with fill: true");
  ok(field.rivers.every((r) => !(r.magma && r.fill) || r.id === "UW3-THRONE"), "UW2 magma veins stay linear (no fill)");
  const zonePoly = svgPathToPolygon(MERE_SNAP.svgPath);
  const wf = featuresForParcel(field, { bbox: MERE_SNAP.bbox, polygonZone: zonePoly, sizeM: 322 });
  const mere = wf.rivers.find((r) => String(r.id).startsWith("UW2-LK-MERE"));
  ok(!!mere, "the Mere windows into a Mere-interior parcel");
  ok(mere && mere.fill === true, "the windowed entry carries fill: true through to the generator");
  // the old zoneCap (0.26) would cap the band at 0.26 × fit.s world-units — the honest width is
  // an order of magnitude wider than that on a single parcel
  const genPoly = zonePoly.map(([x, y]) => [x, -y]);
  const fit = fitToArena(genPoly, 322);
  const oldCapW = 0.26 * fit.s;
  ok(mere && mere.width > oldCapW * 2, `fill lake paints far wider than the old cap (${mere && mere.width} > 2×${oldCapW.toFixed(1)})`);
  // control: the same field with fill stripped clamps back to the cap (the band behavior)
  const stripped = JSON.parse(JSON.stringify(field));
  for (const r of stripped.rivers) delete r.fill;
  const wf2 = featuresForParcel(stripped, { bbox: MERE_SNAP.bbox, polygonZone: zonePoly, sizeM: 322 });
  const mere2 = wf2.rivers.find((r) => String(r.id).startsWith("UW2-LK-MERE"));
  ok(!mere2 || mere2.width <= oldCapW + 4.01, "without fill the same lake clamps to the zoneCap band (mechanism additive)");
}

console.log("— a 100%-submerged parcel still ends valid: the repair carve IS the causeway —");
{
  clearWorldFieldCache();
  const art = generate(worldParcel(MERE_SNAP, { investLevel: 0, biome: "SWAMP" }));
  const art2 = generate(worldParcel(MERE_SNAP, { investLevel: 0, biome: "SWAMP" }));
  ok(JSON.stringify(art) === JSON.stringify(art2), "deterministic: same Mere parcel twice ⇒ byte-identical");
  const G = art.terrain.w, g = decode(art.terrain.cells);
  let water = 0, road = 0, inb = 0;
  for (const c of g) { if (c !== T.OOB) { inb++; if (c === T.WATER) water++; if (c === T.ROAD) road++; } }
  ok(water / inb > 0.3, `the parcel is honestly wet (${((100 * water) / inb).toFixed(1)}% WATER in-bounds)`);
  ok(road > 0, `causeways exist across the mere (${road} ROAD cells — carve/repair WATER→ROAD)`);
  // independent connectivity check (the maps.test.js edgesReachBase pattern): every entry spawn
  // reaches the defender base over the eroded walk grid — the causeway network is real
  const e = erode(g, G);
  const base = art.spawnZones.find((s) => s.id === "def_base");
  const bi = gIdx(G, cellOf(G, base.x), cellOf(G, base.z));
  const par = new Int32Array(G * G).fill(-2);
  const q = [];
  const seed = e[bi] ? bi : (() => { for (let r = 1; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const i = bi + dz * G + dx; if (i >= 0 && i < G * G && e[i]) return i; } return bi; })();
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
  const entries = art.spawnZones.filter((s) => s.id.startsWith("entry_e"));
  const reached = entries.filter((s) => {
    for (let r = 0; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const i = gIdx(G, cellOf(G, s.x) + dx, cellOf(G, s.z) + dz);
      if (i >= 0 && i < G * G && par[i] !== -2) return true;
    }
    return false;
  });
  ok(reached.length === entries.length, `every edge entry reaches the base across the water (${reached.length}/${entries.length})`);
  ok(art.routes.length >= entries.length, "routesToCenter emits a guaranteed path per arrival entry");
}

console.log("— UW3: the Magma Throne caldera is a fill lava lake —");
{
  clearWorldFieldCache();
  const field = loadWorldField("UW3");
  const throne = field.rivers.find((r) => r.id === "UW3-THRONE");
  ok(throne && throne.fill === true && throne.magma === true, "the Throne carries fill + magma");
  ok(field.rivers.filter((r) => r.fill).length === 1, "only the caldera fills — the four flows + vein stay linear bands");
  // a synthetic window at the throne center: the lake must cover the arena center (solid disc,
  // not a ring stripe) — the centerline circle is r≈2.2, honest half-width 2.5 > 2.2
  const C = [31.645, 32.02];
  const box = { bbox: [C[0] - 0.3, C[1] - 0.3, C[0] + 0.3, C[1] + 0.3], sizeM: 322 };
  const wf = featuresForParcel(field, box);
  const lake = wf.rivers.find((r) => String(r.id).startsWith("UW3-THRONE"));
  ok(!!lake && lake.fill === true, "the throne lake windows into a caldera-center parcel");
  // distance from arena center (0,0) to the windowed centerline minus half-width ⇒ submerged
  let dmin = Infinity;
  for (const [x, z] of lake ? lake.pts : []) dmin = Math.min(dmin, Math.hypot(x, z));
  ok(lake && dmin < lake.width / 2, "the arena center is INSIDE the lava lake (solid disc, not a stripe)");
}

console.log(`\nfill.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
