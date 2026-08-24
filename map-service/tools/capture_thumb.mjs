// capture_thumb.mjs — the 3D MAP THUMBNAIL pipeline (owner 2026-08-23: "run it on the server in a
// pipeline, one time, and re-do it whenever a map is regenerated"). Headless top-down capture of a
// parcel's 3D designer scene → a transparent PNG cached by parcelId+designVersion. The world overview
// pastes these (castle→castle, candy→candy); grey where none exists yet.
//
// Usage: MAPS_BASE=http://127.0.0.1:8150 PW_DEPS=<node_modules with playwright-core> \
//        node map-service/tools/capture_thumb.mjs <parcelId> [<parcelId> …] [--size 320] [--out DIR]
// The cache lives at data/cf-maps/thumbs3d/<id>.v<designVersion>.png (+ a stable <id>.png alias to
// the current version, so the compositor can fetch without knowing the version).
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.MAPS_BASE || "http://127.0.0.1:8150";
const CHROME = process.env.PW_CHROME || "/opt/pw-browsers/chromium";
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SIZE = Number(opt("size", 320));
const OUT = path.resolve(ROOT, opt("out", "data/cf-maps/thumbs3d"));
const FORCE = args.includes("--force");
const parcels = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--size" && args[i - 1] !== "--out");

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
let ok = 0, skip = 0, fail = 0;
for (const id of parcels) {
  // designVersion for the cache key (so a regenerate makes a new file; the alias points at current)
  let dv = 0;
  try { const j = await fetch(`${BASE}/internal/v1/designs/${encodeURIComponent(id)}`).then((r) => r.json()); dv = j?.artifact?.meta?.designVersion ?? j?.row?.designVersion ?? 0; }
  catch { /* leave 0 */ }
  const verFile = path.join(OUT, `${id}.v${dv}.png`);
  const aliasFile = path.join(OUT, `${id}.png`);
  if (!FORCE && existsSync(verFile)) { copyFileSync(verFile, aliasFile); skip++; console.log(`skip ${id} (v${dv} cached)`); continue; }
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log(`  [${id}] pageerr:`, e.message));
  try {
    await page.goto(`${BASE}/designer/3d?parcel=${encodeURIComponent(id)}&thumb=1`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForFunction("window.__CF_THUMB && window.__CF_THUMB.ready", { timeout: 30000 });
    await page.waitForTimeout(2500);                     // let floor/water textures settle
    const buf = await page.screenshot({ omitBackground: true });  // transparent outside the terrain
    writeFileSync(verFile, buf); copyFileSync(verFile, aliasFile);
    console.log(`ok   ${id} → ${path.relative(ROOT, verFile)} (${(buf.length / 1024).toFixed(0)} KB)`);
    ok++;
  } catch (e) { console.error(`FAIL ${id}: ${e.message}`); fail++; }
  await page.close();
}
await browser.close();
console.log(`\n3D thumbs: ${ok} captured, ${skip} cached, ${fail} failed → ${path.relative(ROOT, OUT)}`);
