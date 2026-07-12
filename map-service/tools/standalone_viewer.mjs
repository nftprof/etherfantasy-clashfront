#!/usr/bin/env node
// standalone_viewer.mjs — emit a SELF-CONTAINED 3D viewer HTML for any parcel, at the designer's
// exact in-game fidelity (grass floor + polygon border + trees + game lighting), openable OFFLINE.
//
// Reuses map-service/maps/preview3d.html VERBATIM (any viewer improvement flows through), swapping
// its two server fetches for the parcel's artifact inlined into the page. Only external dep is the
// THREE.js CDN (needs internet in the browser; the map render itself is fully local).
//
//   node map-service/tools/standalone_viewer.mjs <parcelId> [--invest n] [--out file.html]
//   → open the .html in any browser: orbit/zoom the real parcel map, no server, no deploy.
//
// Deterministic: same parcel ⇒ same artifact ⇒ same view.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { worldParcel } from "../maps/worldfield.js";
import { generate } from "../maps/generate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const pid = args[0];
if (!pid || pid.startsWith("--")) { console.error("usage: standalone_viewer.mjs <parcelId> [--invest n] [--out file]"); process.exit(1); }
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const INVEST = Number(opt("invest", 1));
const zone = { "00": "BUS", "02": "EDU", "03": "ENT", "07": "HUB", "10": "UW2", "11": "UW3", "01": "CGI", "08": "KOL", "04": "HS1", "05": "HS2", "06": "HS3", "09": "UW1" }[pid.slice(1, 3)];

let snap = null;
try {
  const singles = JSON.parse(readFileSync(path.join(ROOT, `data/hexagon-city-source/l3/${zone}.json`), "utf8")).singles;
  snap = singles.find((s) => s.parcelId === pid);
} catch {}
if (!snap) { console.error(`parcel ${pid} not found (zone ${zone})`); process.exit(1); }

const artifact = generate(worldParcel(snap, { investLevel: INVEST }));
const design = { ok: true, artifact };

// reuse the real viewer verbatim; inline the design + null the render.json (flat-textured fallback —
// identical to what the deployed designer shows for a parcel with no heightfield converter output).
let html = readFileSync(path.join(ROOT, "map-service/maps/preview3d.html"), "utf8");
// hardcode pid (so the file works with NO ?parcel= in the URL — it's baked in), inline the design,
// and null the render.json fetch (flat-textured fallback — as the deployed designer shows without a
// heightfield converter). The `if(!pid) missing` guard then never trips.
html = html.replace(
  /const q=new URLSearchParams\(location\.search\)[^\n]*\n/,
  `const q=new URLSearchParams(location.search), pid=${JSON.stringify(pid)}, vv=null;\n`
);
html = html.replace(
  /let d; try\{ d=await fetch\(`\/internal\/v1\/designs\/\$\{pid\}[^\n]*\n/,
  `let d=${JSON.stringify(design)};\n`
);
html = html.replace(
  /let man=null; try\{ man=await fetch\(`\/internal\/v1\/designs\/\$\{pid\}\/render\.json[^\n]*\n/,
  `let man=null;\n`
);

const out = opt("out", path.join(ROOT, `parcel-${pid}.html`));
writeFileSync(out, html);
console.log(`wrote ${out} — open in a browser (${(html.length / 1024).toFixed(0)} KB, parcel ${pid} / zone ${zone} / invest ${INVEST})`);
