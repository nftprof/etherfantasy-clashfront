#!/usr/bin/env node
// build_ar_terrains.mjs — 🕹→📱 CLASH LANDS AR TERRAIN EXPORT (owner 2026-08-07: "the AR pet game
// reuses the maps we build — castle, lava, regular water, flat field, candy").
// ---------------------------------------------------------------------------
// Per terrain we emit the Clash-Lands contract (their message):
//   <id>.glb        — env mesh (exported separately, headless, by export_ar_glb.mjs)
//   <id>.height.png — grayscale collision heightfield (floorY = groundY + gray/255*heightScale)
//   <id>.json       — descriptor: bounds, groundY/heightScale, liquid, walls, spawnBounds, lighting, landmarks
//   manifest.json   — {version, terrains:[...]}
// This tool builds the SOURCE render-manifests + the height.png + descriptor + manifest.json into
// data/cf-maps/ar-terrains/. The GLB is produced by the headless pass (needs a running map-service).
//
// Terrains (their priority: castle, lava first; then water, flat; + candy bonus):
//   castle → the siege-test castle (real curtain walls, gates, keep)
//   lava   → volcanic field with a lava lake (liquid=lava)
//   water  → riverCrossing meadow with a real river/pond (liquid=water)
//   flat   → open MOBA-style field, gentle roughness, no liquid
//   candy  → CANDYLAND (the pastel candy world)
// Deterministic. Usage: node tools/build_ar_terrains.mjs
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { generate } from "../maps/generate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const convert = require("../maps/battlefield_converter.cjs").convert;
const OUT = path.join(ROOT, "data/cf-maps/ar-terrains");
mkdirSync(OUT, { recursive: true });

const b64ToU8 = (s) => new Uint8Array(Buffer.from(String(s || ""), "base64"));

// minimal grayscale PNG encoder (8-bit, single channel)
function grayPng(w, h, data) {
  const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, d) => { const o = Buffer.alloc(8 + d.length + 4); o.writeUInt32BE(d.length, 0); o.write(type, 4); d.copy(o, 8); o.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), d])), 8 + d.length); return o; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; // 8-bit grayscale
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = data[y * w + x]; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// build a descriptor + height.png from a render manifest. WORLD-UNITS = meters (canon: 1 unit = 1 m);
// the AR game may scale uniformly. Origin-centered, Y-up.
function describe(id, man) {
  const half = man.arena.half, gw = man.height.w, gh = man.height.h;
  const hMin = man.height.hMin, hMax = man.height.hMax, hData = b64ToU8(man.height.data);
  const water = b64ToU8((man.masks && man.masks.water) || "");
  const oob = b64ToU8((man.masks && man.masks.oob) || "");
  const cell = man.grid.cellM;
  // height.png: gray = (h - hMin)/(hMax-hMin) * 255. floorY(gray) = hMin + gray/255*(hMax-hMin).
  writeFileSync(path.join(OUT, id + ".height.png"), grayPng(gw, gh, hData));
  // liquid surface: the waterline = min ground height over water cells minus a hair (a shallow crust
  // per their rule) with the deepest pocket at hMin. Absent if no water cells.
  let hasLiquid = false, minWaterGround = Infinity, deepest = Infinity;
  for (let k = 0; k < gw * gh; k++) if (water[k] === 1) {
    hasLiquid = true; const y = hMin + (hData[k] / 255) * (hMax - hMin);
    if (y < minWaterGround) minWaterGround = y; if (y < deepest) deepest = y;
  }
  const liquidType = man.biome.water === "lava" ? "lava" : man.biome.water === "ice" ? "ice" : "water";
  const desc = {
    id, schema: "clash-lands-terrain/1", source: man.parcelId, designVersion: man.designVersion,
    units: "meters", upAxis: "Y", originCentered: true,
    bounds: { min: [-half, hMin, -half], max: [half, hMax, half], sizeM: half * 2 },
    groundY: hMin, heightScale: hMax - hMin,           // floorY = groundY + gray/255 * heightScale
    height: { file: id + ".height.png", w: gw, h: gh, cellM: cell,
      note: "grayscale 0..255 → floorY = groundY + g/255*heightScale" },
    liquid: hasLiquid ? {
      type: liquidType,
      surfaceY: +(minWaterGround + 0.15).toFixed(2),   // shallow crust sits just above the bank floor
      deepY: +deepest.toFixed(2),                        // small deep/hot pockets bottom out here
      crust: "mostly shallow; only small deep pockets — safe to walk the crust (their rule)",
    } : null,
    walls: [],                                          // filled below for castle
    spawnBounds: null,                                  // filled below (safe inner rect)
    lighting: {
      sky: man.biome.sky != null ? "#" + (man.biome.sky >>> 0).toString(16).padStart(6, "0") : "#bfd4ff",
      fog: "#" + ((man.biome.fog >>> 0) || 0).toString(16).padStart(6, "0"),
      sun: { dir: [0.5, -0.8, 0.33], color: man.biome.sky != null ? "#ffe4c0" : "#fff2dd", intensity: 0.85 },
      ambient: 0.9,
    },
    landmarks: [],
  };
  // spawnBounds: an inner square inset from the edge, avoiding OOB/liquid where possible
  const inset = half * 0.55;
  desc.spawnBounds = { min: [-inset, -inset], max: [inset, inset], note: "flat inner play area" };
  // walls + castle landmark from castleGeom (real curtain rings)
  const cg = man.castleGeom;
  if (cg && cg.rings) {
    let cx = 0, cz = 0, n = 0;
    for (const ring of cg.rings) for (const p of ring.pts) { cx += p[0]; cz += p[1]; n++; }
    if (n) { cx /= n; cz /= n; }
    desc.landmarks.push({ kind: "castle", tier: cg.tier, at: [+cx.toFixed(1), +cz.toFixed(1)], rings: cg.rings.length });
    // GATE_R (5.5) = half the passage the wall MESH is clipped open at each gate ⇒ full opening ≈ 11 m.
    // The wooden leaves are drawn swung OPEN (the archway physically stands open in the GLB). For a
    // collision wall built from `polyline`, LEAVE A GAP of `openWidthM` centred on each gate `at` so
    // pets can walk in/out (that is exactly where the mesh has no wall).
    const GATE_R = 5.5;
    for (let ri = 0; ri < cg.rings.length; ri++) {
      const ring = cg.rings[ri];
      desc.walls.push({
        ring: ri, height: ring.h || 12, outer: ri === 0,
        polyline: ring.pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]),
        gates: (ring.gates || []).map((g) => ({ at: (g.at || g).map((v) => +v.toFixed(1)), openWidthM: +(GATE_R * 2).toFixed(1), state: "OPEN" })),
      });
    }
    desc.gatesNote = "Gates are OPEN passages (the wall mesh is clipped and the wooden leaves are swung open). Build wall collision from walls[].polyline but subtract an openWidthM gap centred on each gates[].at so pets pass freely.";
  }
  writeFileSync(path.join(OUT, id + ".json"), JSON.stringify(desc, null, 1) + "\n");
  return { hasLiquid, liquidType, walls: desc.walls.length };
}

// --- terrain source builds ---
const S = 322;
const terrains = {
  castle: null,      // special: siege-test committed manifest (real castle)
  lava: { parcel: { parcelId: "AR-LAVA", zone: "UW2", biomeFamily: "VOLCANIC", sizeM: S, investLevel: 2, biome: "volcanic",
    worldField: { castles: [], rivers: [{ pts: [[-120, 40], [-30, 10], [50, -20], [130, -30]], width: 26 }], roads: [], ridges: [], overlayElements: [], edgeCrossings: [] } },
    params: { archetype: "riverCrossing", palette: "volcanic", landmark: "NONE", laneCount: 1, density: 0.15, waterLevel: 0.62, resourceNodes: 2, resourceRichness: 0.4, mobCamps: 1, towers: 0, barriers: 1, roughness: 0.5, mirrorFair: false } },
  water: { parcel: { parcelId: "AR-WATER", zone: "ENT", biomeFamily: "TEMPERATE_FOREST", sizeM: S, investLevel: 2, biome: "verdant",
    worldField: { castles: [], rivers: [{ pts: [[-130, 50], [-40, 20], [40, -20], [130, -40]], width: 20 }], roads: [{ pts: [[-120, -110], [-40, -40], [40, 20], [120, 90]], width: 6 }], ridges: [], overlayElements: [], edgeCrossings: [] } },
    params: { archetype: "riverCrossing", palette: "verdant", landmark: "NONE", laneCount: 1, density: 0.35, waterLevel: 0.5, resourceNodes: 3, resourceRichness: 0.5, mobCamps: 1, towers: 0, barriers: 1, roughness: 0.3, mirrorFair: false } },
  flat: { parcel: { parcelId: "AR-FLAT", zone: "EDU", biomeFamily: "TEMPERATE_GRASS", sizeM: S, investLevel: 1, biome: "verdant",
    worldField: { castles: [], rivers: [], roads: [{ pts: [[-140, 0], [0, 0], [140, 0]], width: 7 }], ridges: [], overlayElements: [], edgeCrossings: [] } },
    params: { archetype: "openSteppe", palette: "verdant", landmark: "NONE", laneCount: 3, density: 0.25, waterLevel: 0, resourceNodes: 4, resourceRichness: 0.5, mobCamps: 2, towers: 0, barriers: 0, roughness: 0.15, mirrorFair: true } },
};

const built = [];
// castle: reuse the committed siege-test manifest (has the real curtain walls/gates/keep)
{
  const p = path.join(ROOT, "data/moba-maps/siege-test.manifest.json");
  const pa = path.join(ROOT, "data/moba-maps/siege-test.artifact.json");
  if (existsSync(p)) {
    const man = JSON.parse(readFileSync(p, "utf8"));
    // mirror into cf-maps as AR-CASTLE so /designer/3d?parcel=AR-CASTLE renders it for the GLB pass
    mkdirSync(path.join(ROOT, "data/cf-maps/manifests"), { recursive: true });
    mkdirSync(path.join(ROOT, "data/cf-maps/artifacts"), { recursive: true });
    writeFileSync(path.join(ROOT, "data/cf-maps/manifests/AR-CASTLE.manifest.json"), JSON.stringify(man));
    if (existsSync(pa)) writeFileSync(path.join(ROOT, "data/cf-maps/artifacts/AR-CASTLE.artifact.json"), readFileSync(pa, "utf8"));
    const info = describe("castle", man);
    built.push("castle"); console.log(`castle ← siege-test (AR-CASTLE) | walls ${info.walls} | liquid ${info.hasLiquid ? info.liquidType : "none"}`);
  } else console.warn("skip castle: siege-test.manifest.json missing (run the siege bake)");
}
// candy: reuse CANDYLAND
{
  const p = path.join(ROOT, "data/cf-maps/manifests/CANDYLAND.manifest.json");
  if (existsSync(p)) {
    const man = JSON.parse(readFileSync(p, "utf8"));
    const info = describe("candy", man);
    built.push("candy"); console.log(`candy ← CANDYLAND | walls ${info.walls} | liquid ${info.hasLiquid ? info.liquidType : "none"}`);
  }
}
// generated terrains
for (const [id, t] of Object.entries(terrains)) {
  if (!t) continue;
  const art = generate(t.parcel, t.params);
  const man = convert(art, { parcelId: t.parcel.parcelId, designVersion: art.meta.designVersion });
  if (man.designVersion == null) man.designVersion = art.meta.designVersion;
  // committed so the GLB pass + AR loader can fetch it as a render manifest too
  mkdirSync(path.join(ROOT, "data/cf-maps/manifests"), { recursive: true });
  writeFileSync(path.join(ROOT, "data/cf-maps/manifests/" + t.parcel.parcelId + ".manifest.json"), JSON.stringify(man));
  const artDir = path.join(ROOT, "data/cf-maps/artifacts"); mkdirSync(artDir, { recursive: true });
  writeFileSync(path.join(artDir, t.parcel.parcelId + ".artifact.json"), JSON.stringify(art) + "\n");
  const info = describe(id, man);
  built.push(id);
  console.log(`${id} ← ${t.parcel.parcelId} | walls ${info.walls} | liquid ${info.hasLiquid ? info.liquidType : "none"}`);
}

writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ version: "v1", schema: "clash-lands-terrains/1", terrains: built }, null, 1) + "\n");
console.log("\nAR terrains built:", built.join(", "), "→", path.relative(ROOT, OUT));
console.log("Next: run the GLB pass (map-service running) → node tools/export_ar_glb.mjs");
