#!/usr/bin/env node
// standalone_viewer.mjs — emit a SELF-CONTAINED 3D viewer HTML for any parcel, at the designer's
// exact in-game fidelity, openable OFFLINE.
//
// Reuses map-service/maps/preview3d.html VERBATIM (any viewer improvement flows through), swapping
// its server fetches for inlined data. When the render converter is present, the artifact is run
// through battlefield_converter.cjs and the page carries the MANIFEST + the EF_BATTLEFIELD module
// + the biome floor texture (data-URI) — i.e. the full NINE-LAYER GAME RENDER, offline. Only
// external dep is the THREE.js CDN (needs internet in the browser; the map render itself is local).
//
//   node map-service/tools/standalone_viewer.mjs <parcelId> [--invest n] [--out file.html]
//   → open the .html in any browser: orbit/zoom the real parcel map, no server, no deploy.
//
// Deterministic: same parcel ⇒ same artifact ⇒ same manifest ⇒ same view.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
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

// the nine-layer kit (vendored from the MOBA repo): converter → manifest, module + floor → inline
let manifest = null, moduleSrc = null, floorTag = "";
try {
  const req = createRequire(import.meta.url);
  const { convert } = req("../maps/battlefield_converter.cjs");
  manifest = convert(artifact, { parcelId: pid, designVersion: artifact.meta?.designVersion ?? 0 });
  // the module's header comment shows usage with literal </script> tags — escape them or they
  // terminate the inline <script> block early when the source is embedded in the page
  moduleSrc = readFileSync(path.join(ROOT, "map-service/maps/ef_battlefield.js"), "utf8").replace(/<\/script/gi, "<\\/script");
  const floorPng = path.join(ROOT, `map-service/floors/${manifest.biome.floor}.png`);
  if (existsSync(floorPng)) {
    const b64 = readFileSync(floorPng).toString("base64");
    // the module fetches floorsBase+<floor>.png ("/floors/<floor>.png") — shim TextureLoader to the data-URI
    floorTag = `<script>(function(){var F=${JSON.stringify({ [`/floors/${manifest.biome.floor}.png`]: `data:image/png;base64,${b64}` })};` +
      `var L=THREE.TextureLoader.prototype.load;THREE.TextureLoader.prototype.load=function(u){arguments[0]=F[u]||u;return L.apply(this,arguments);};})();</script>`;
  } else { console.warn(`floor ${manifest.biome.floor}.png missing — page will fetch /floors/ (online only)`); }
} catch (e) { console.warn(`nine-layer kit unavailable (${e.message}) — emitting legacy fallback render`); }

// reuse the real viewer verbatim; bake in pid + design (+ manifest & module when available)
let html = readFileSync(path.join(ROOT, "map-service/maps/preview3d.html"), "utf8");
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
  `let man=${manifest ? JSON.stringify(manifest) : "null"};\n`
);
if (moduleSrc) {
  // inline the game's scene builder (defines window.EF_BATTLEFIELD → the preview skips loadScript)
  // + the floor-texture data-URI shim, right after the THREE.js CDN tags.
  // function replacement — the module source contains `$`-sequences that a string replacement
  // would corrupt (String.replace $-pattern expansion)
  html = html.replace(
    /(<script src="https:[^"]*OrbitControls\.js"><\/script>)/,
    (m) => `${m}\n<script>${moduleSrc}</script>\n${floorTag}`
  );
}

const out = opt("out", path.join(ROOT, `parcel-${pid}.html`));
writeFileSync(out, html);
console.log(`wrote ${out} — open in a browser (${(html.length / 1024).toFixed(0)} KB, parcel ${pid} / zone ${zone} / invest ${INVEST}${manifest ? " / 9-LAYER GAME RENDER (" + manifest.biome.key + "/" + manifest.biome.floor + ")" : " / legacy fallback"})`);
