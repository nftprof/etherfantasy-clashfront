#!/usr/bin/env node
// export_ar_glb.mjs — headless GLB pass for the Clash Lands AR terrains. Loads each terrain's
// preview3d scene in EXPORT mode (scatter/props/markers stripped, ground LOD), then GLTFExports the
// built THREE scene to a binary .glb in data/cf-maps/ar-terrains/<id>.glb.
// Requires: a running map-service (MAPS_PORT, default 8150) + playwright-core + three (scratch deps).
// Usage: MAPS_BASE=http://127.0.0.1:8150 PW_DEPS=/path/to/node_modules node tools/export_ar_glb.mjs
import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "data/cf-maps/ar-terrains");
const BASE = process.env.MAPS_BASE || "http://127.0.0.1:8150";
const PW_DEPS = process.env.PW_DEPS || path.join(process.env.SCRATCH || "", "node_modules");
const CHROME = process.env.PW_CHROME || "/opt/pw-browsers/chromium";
const STRIDE = process.env.AR_STRIDE || "3";

// id → servable parcel (castle mirrored to AR-CASTLE by build_ar_terrains.mjs)
const MAP = { castle: "AR-CASTLE", candy: "CANDYLAND", lava: "AR-LAVA", water: "AR-WATER", flat: "AR-FLAT" };
const terrains = existsSync(path.join(OUT, "manifest.json"))
  ? JSON.parse(readFileSync(path.join(OUT, "manifest.json"), "utf8")).terrains : Object.keys(MAP);

const exporterPath = path.join(PW_DEPS, "three/examples/js/exporters/GLTFExporter.js");
if (!existsSync(exporterPath)) { console.error("GLTFExporter not found at " + exporterPath + " — set PW_DEPS to a node_modules with three installed."); process.exit(1); }
const exporterSrc = readFileSync(exporterPath, "utf8");

const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
let ok = 0;
for (const id of terrains) {
  const parcel = MAP[id]; if (!parcel) { console.warn("no parcel mapping for", id); continue; }
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on("pageerror", (e) => console.log(`  [${id}] pageerr:`, e.message));
  try {
    await page.goto(`${BASE}/designer/3d?parcel=${encodeURIComponent(parcel)}&export=1&stride=${STRIDE}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForFunction("window.__CF_EXPORT && window.__CF_EXPORT.ready", { timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.evaluate(exporterSrc);
    const r = await page.evaluate(async () => {
      const { scene, THREE } = window.__CF_EXPORT;
      let tris = 0; scene.traverse((o) => { if (o.isMesh && o.visible !== false && o.geometry) { const g = o.geometry; tris += (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3; } });
      const glb = await new Promise((res) => new THREE.GLTFExporter().parse(scene, res, { binary: true, onlyVisible: true }));
      const bin = new Uint8Array(glb); let s = ""; const CH = 0x8000;
      for (let i = 0; i < bin.length; i += CH) s += String.fromCharCode.apply(null, bin.subarray(i, i + CH));
      return { b64: btoa(s), tris: Math.round(tris), bytes: bin.length };
    });
    writeFileSync(path.join(OUT, id + ".glb"), Buffer.from(r.b64, "base64"));
    const warn = r.tris > 60000 ? "  ⚠ OVER 60k" : "";
    console.log(`${id} (${parcel}): ${r.tris} tris, ${(r.bytes / 1048576).toFixed(2)} MB → ${id}.glb${warn}`);
    ok++;
  } catch (e) { console.error(`${id}: FAILED — ${e.message}`); }
  await page.close();
}
await browser.close();
console.log(`\nGLB pass: ${ok}/${terrains.length} exported → ${path.relative(ROOT, OUT)}`);
