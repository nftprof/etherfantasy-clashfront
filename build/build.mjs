// EF Moba — production client build: bundle/minify + obfuscate into RELEASE/.
// ---------------------------------------------------------------------------
// SOURCE (the repo) stays readable for development. RELEASE/ is the hardened,
// deployable mirror: every line of *your* JS is run through javascript-obfuscator
// (string-array encryption, control-flow flattening, self-defending, optional
// domain-lock) so nobody can just download the page and rebuild your game.
//
//   npm install            # once (installs javascript-obfuscator)
//   npm run build          # -> RELEASE/   (dev-strength, no domain lock)
//   npm run build:prod     # -> RELEASE/   (stronger CFF + lock to *.etherfantasy.com)
//   npm run build:max      # -> RELEASE/   (max settings; slowest runtime)
//
// Assets (.glb/.png) and data are copied verbatim — by design; the art is yours.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, process.env.OUT_DIR || "RELEASE");

// ---- what's in the deployable client -------------------------------------
const CONFIG = {
  // local JS referenced via <script src> / fetched — obfuscated, same paths
  jsFiles: ["model_calibration.js", "shared/ef_core.js", "shared/ef_touch.js"],
  // HTML entry points — inline <script> blocks obfuscated; <script src> left as-is
  htmlFiles: ["index.html", "pve.html", "launcher.html", "home.html", "audit.html", "wiki.html", "hotkeys.html"],
  // copied byte-for-byte (assets + data + local server helper)
  copyDirs: ["hero", "pets", "boss", "masters", "mons", "vrm", "wiki_img", "fx"],
  copyFiles: ["mon_lineage.json", "serve.py", "start_game.bat"],
};

// ---- obfuscator profile (tuned for a realtime Three.js game) --------------
// Notes:
//  • renameGlobals:false + reservedNames keep the cross-file API (window.EF_CORE,
//    EF_TOUCH, MODEL_CAL …) intact — renaming them would break the game.
//  • controlFlowFlattening is the big protection knob but also the big runtime
//    cost; default 0.5 keeps 60fps headroom. Raise via CFF=… for more armor.
//  • deadCodeInjection OFF by default (bloats + slows the game loop); DEAD=1 to add.
const f = (v, d) => (v === undefined ? d : parseFloat(v));
const OBF_OPTS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: f(process.env.CFF, 0.5),
  deadCodeInjection: process.env.DEAD === "1",
  deadCodeInjectionThreshold: 0.2,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: f(process.env.STR, 0.8),
  stringArrayCallsTransform: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  identifierNamesGenerator: "hexadecimal",
  numbersToExpressions: true,
  simplify: true,
  transformObjectKeys: true,
  selfDefending: process.env.SELFDEFEND !== "0",
  disableConsoleOutput: process.env.STRIP_CONSOLE === "1",
  renameGlobals: false,
  reservedNames: ["^EF_CORE$", "^EF_TOUCH$", "^MODEL_CAL$", "^THREE$"],
  target: "browser",
  domainLock: (process.env.DOMAIN_LOCK || "").split(",").map((s) => s.trim()).filter(Boolean),
  domainLockRedirectUrl: "about:blank",
};

// ---- load the obfuscator (graceful if not installed) ----------------------
let Obfuscator = null, stub = false;
try { Obfuscator = (await import("javascript-obfuscator")).default; }
catch { stub = true; console.warn("⚠  javascript-obfuscator not installed — run `npm install`. Emitting a STUB build (NOT obfuscated)."); }

let _files = 0, _scripts = 0, _bytesIn = 0, _bytesOut = 0;
function obfuscate(code, label) {
  _bytesIn += code.length;
  if (stub || !code.trim()) { _bytesOut += code.length; return code; }
  try {
    const out = Obfuscator.obfuscate(code, OBF_OPTS).getObfuscatedCode();
    _bytesOut += out.length; _scripts++;
    return out;
  } catch (e) {
    console.error(`✗ obfuscation failed for ${label}: ${e.message}\n  → kept readable so the build still works; investigate this chunk.`);
    _bytesOut += code.length;
    return code;
  }
}

// ---- fs helpers -----------------------------------------------------------
const ensureDir = (p) => fs.mkdirSync(path.dirname(p), { recursive: true });
function copyTree(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src)) copyTree(path.join(src, e), path.join(dst, e)); }
  else { ensureDir(dst); fs.copyFileSync(src, dst); }
}

// ---- HTML: obfuscate inline <script> blocks, leave <script src> + JSON -----
function processHtml(html, file) {
  return html.replace(/<script(\b[^>]*)?>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    attrs = attrs || "";
    if (/\bsrc\s*=/i.test(attrs)) return m;                                  // external — leave (incl. CDN three.js)
    if (/type\s*=\s*["']?(application\/json|text\/)/i.test(attrs)) return m; // data/template — leave
    if (!body.trim()) return m;
    return `<script${attrs}>\n${obfuscate(body, file + " (inline)")}\n</script>`;
  });
}

// ---- run ------------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const rel of CONFIG.jsFiles) {
  const src = path.join(ROOT, rel); if (!fs.existsSync(src)) { console.warn("skip (missing):", rel); continue; }
  const out = path.join(OUT, rel); ensureDir(out);
  fs.writeFileSync(out, obfuscate(fs.readFileSync(src, "utf8"), rel)); _files++;
  console.log("obf js   ", rel);
}
for (const rel of CONFIG.htmlFiles) {
  const src = path.join(ROOT, rel); if (!fs.existsSync(src)) { console.warn("skip (missing):", rel); continue; }
  const out = path.join(OUT, rel); ensureDir(out);
  fs.writeFileSync(out, processHtml(fs.readFileSync(src, "utf8"), rel)); _files++;
  console.log("obf html ", rel);
}
for (const d of CONFIG.copyDirs) { const src = path.join(ROOT, d); if (fs.existsSync(src)) { copyTree(src, path.join(OUT, d)); console.log("copy dir ", d); } }
for (const fl of CONFIG.copyFiles) { const src = path.join(ROOT, fl); if (fs.existsSync(src)) { const out = path.join(OUT, fl); ensureDir(out); fs.copyFileSync(src, out); console.log("copy     ", fl); } }

const pct = _bytesIn ? Math.round((_bytesOut / _bytesIn) * 100) : 100;
console.log(`\n${stub ? "STUB " : ""}build done → ${path.relative(ROOT, OUT)}/`);
console.log(`  files: ${_files}  · inline scripts obfuscated: ${_scripts}  · JS size: ${_bytesIn}→${_bytesOut} (${pct}%)`);
console.log(`  profile: CFF=${OBF_OPTS.controlFlowFlatteningThreshold} dead=${OBF_OPTS.deadCodeInjection} selfDefend=${OBF_OPTS.selfDefending} lock=[${OBF_OPTS.domainLock.join(",") || "none"}]`);
if (stub) { console.error("\n⚠  This was a STUB build — install deps and re-run before shipping."); process.exit(2); }
