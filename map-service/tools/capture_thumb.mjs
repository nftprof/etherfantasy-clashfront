// capture_thumb.mjs — the 3D MAP THUMBNAIL pipeline (owner 2026-08-23: "run it on the server in a
// pipeline, one time, and re-do it whenever a map is regenerated"). Headless top-down capture of a
// parcel's 3D designer scene → a transparent PNG cached by parcelId+designVersion. The world overview
// pastes these (castle→castle, candy→candy); grey where none exists yet.
//
// Usage:
//   MAPS_BASE=http://127.0.0.1:8150 node map-service/tools/capture_thumb.mjs <id> [<id> …]
//   MAPS_BASE=… node …/capture_thumb.mjs --dir data/cf-maps/artifacts        # all generated parcels
//   flags: --size 256 --concurrency 6 --out DIR --force
// Cache: data/cf-maps/thumbs3d/<id>.v<designVersion>.png (+ a stable <id>.png alias to the current
// version, so the compositor fetches without knowing the version). Re-shoots only when the version
// changes (idempotent) unless --force.
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.MAPS_BASE || "http://127.0.0.1:8150";
const CHROME = process.env.PW_CHROME || "/opt/pw-browsers/chromium";
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SIZE = Number(opt("size", 256));
const CONC = Math.max(1, Number(opt("concurrency", 6)));
const SETTLE = Number(opt("settle", 1800));
const OUT = path.resolve(ROOT, opt("out", "data/cf-maps/thumbs3d"));
const FORCE = args.includes("--force");
const flagVals = new Set(["--size", "--out", "--concurrency", "--settle", "--dir"].map((f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; }).filter(Boolean));
let parcels = args.filter((a) => !a.startsWith("--") && !flagVals.has(a));
const dir = opt("dir", null);
if (dir) {                                             // collect ids from an artifacts directory
  const d = path.resolve(ROOT, dir);
  parcels = parcels.concat(readdirSync(d).filter((f) => f.endsWith(".artifact.json")).map((f) => f.replace(".artifact.json", "")));
}
parcels = [...new Set(parcels)];
if (!parcels.length) { console.error("no parcels — pass ids or --dir <artifacts>"); process.exit(1); }
console.log(`capturing ${parcels.length} thumbs @ ${SIZE}px, concurrency ${CONC} → ${path.relative(ROOT, OUT)}`);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
let ok = 0, skip = 0, fail = 0, next = 0;
const t0 = Date.now();
async function shoot(id) {
  let dv = 0;
  try { const j = await fetch(`${BASE}/internal/v1/designs/${encodeURIComponent(id)}`).then((r) => r.json()); dv = j?.artifact?.meta?.designVersion ?? j?.row?.designVersion ?? 0; }
  catch { /* leave 0 */ }
  const verFile = path.join(OUT, `${id}.v${dv}.png`), aliasFile = path.join(OUT, `${id}.png`);
  if (!FORCE && existsSync(verFile)) { copyFileSync(verFile, aliasFile); skip++; return; }
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 });
  try {
    await page.goto(`${BASE}/designer/3d?parcel=${encodeURIComponent(id)}&thumb=1`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForFunction("window.__CF_THUMB && window.__CF_THUMB.ready", { timeout: 30000 });
    await page.waitForTimeout(SETTLE);
    const buf = await page.screenshot({ omitBackground: true });
    writeFileSync(verFile, buf); copyFileSync(verFile, aliasFile); ok++;
  } catch (e) { console.error(`FAIL ${id}: ${e.message}`); fail++; }
  await page.close();
}
async function worker() { while (next < parcels.length) { const i = next++; await shoot(parcels[i]); if ((ok + skip + fail) % 25 === 0) console.log(`  …${ok + skip + fail}/${parcels.length} (${ok} shot, ${skip} cached, ${fail} fail)`); } }
await Promise.all(Array.from({ length: Math.min(CONC, parcels.length) }, worker));
await browser.close();
console.log(`\n3D thumbs: ${ok} captured, ${skip} cached, ${fail} failed in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.relative(ROOT, OUT)}`);
