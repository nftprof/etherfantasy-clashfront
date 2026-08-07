#!/usr/bin/env node
// map-service client obfuscation — the MOBA repo's obfuse engine, ported (owner 2026-08-06:
// "take the same obfuse engine to cover the map as well").
// ---------------------------------------------------------------------------
// SOURCE (the repo) stays readable for development. This runs AT DEPLOY TIME,
// in place, over the deployed mirror (~/ef-map-service) — same model as the
// MOBA's build.mjs (javascript-obfuscator; string-array encryption, CFF,
// self-defending). The renderer module's canonical home (MOBA repo) already
// obfuscates its copy in every published build; this closes the last surface
// that served it readable.
//
//   node obfuscate.mjs --dir <deployed-map-service-root>
//
// Covered (everything a browser is served):
//   maps/ef_battlefield_renderer.js   (/ef_battlefield_renderer.js)
//   maps/ef_battlefield.js.bak        (/ef_battlefield.js legacy rollback)
//   maps/preview3d.html               (/designer/3d — inline <script>)
//   maps/designer.html                (/designer  — inline <script>)
// Left alone: vendor/ (public three.js), floors/ + data (art/data), all
// server-side JS (never served).
//
// GUARDS (deliberately redundant, per the MOBA brief): refuses to exit 0 on a
// stub build (obfuscator missing), and re-verifies every written file carries
// obfuscator output (_0x) after writing. A silent fallback to raw is the
// failure that matters.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";

const dirIx = process.argv.indexOf("--dir");
if (dirIx < 0 || !process.argv[dirIx + 1]) { console.error("usage: obfuscate.mjs --dir <map-service-root>"); process.exit(1); }
const ROOT = path.resolve(process.argv[dirIx + 1]);
if (!fs.existsSync(path.join(ROOT, "maps"))) { console.error(`✗ ${ROOT} does not look like a map-service root (no maps/)`); process.exit(1); }

const JS_FILES = ["maps/ef_battlefield_renderer.js", "maps/ef_battlefield.js.bak"];
const HTML_FILES = ["maps/preview3d.html", "maps/designer.html"];

// profile: the MOBA build.mjs settings, verbatim philosophy — renameGlobals off +
// reserved cross-file API names so EF_BATTLEFIELD/THREE keep working.
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
  stringArrayCallsTransform: process.env.STRCALLS !== "0",
  splitStrings: process.env.SPLIT !== "0",
  splitStringsChunkLength: 10,
  identifierNamesGenerator: "hexadecimal",
  numbersToExpressions: process.env.NUM !== "0",
  simplify: true,
  transformObjectKeys: process.env.OBJKEYS !== "0",
  selfDefending: process.env.SELFDEFEND !== "0",
  disableConsoleOutput: false,
  renameGlobals: false,
  reservedNames: ["^EF_BATTLEFIELD$", "^THREE$", "^buildBattlefield$", "^heightAt$", "^setFocus$"],
  target: "browser",
  domainLock: (process.env.DOMAIN_LOCK || "").split(",").map((s) => s.trim()).filter(Boolean),
  domainLockRedirectUrl: "about:blank",
};

let Obfuscator = null;
try { Obfuscator = (await import("javascript-obfuscator")).default; }
catch { console.error("✗ javascript-obfuscator not installed (npm install in map-service/build) — REFUSING stub build."); process.exit(2); }

let scripts = 0, bytesIn = 0, bytesOut = 0;
const obf = (code, label) => {
  bytesIn += code.length;
  if (!code.trim()) { bytesOut += code.length; return code; }
  const out = Obfuscator.obfuscate(code, OBF_OPTS).getObfuscatedCode();   // throws = job fails = deploy fails
  bytesOut += out.length; scripts++;
  if (!out.includes("_0x")) { console.error(`✗ ${label}: output lacks _0x — refusing`); process.exit(2); }
  return out;
};
const processHtml = (html, file) =>
  html.replace(/<script(\b[^>]*)?>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    attrs = attrs || "";
    if (/\bsrc\s*=/i.test(attrs)) return m;                                  // external (vendor three.js) — leave
    if (/type\s*=\s*["']?(application\/json|text\/)/i.test(attrs)) return m; // data/template — leave
    if (!body.trim()) return m;
    return `<script${attrs}>\n${obf(body, file + " (inline)")}\n</script>`;
  });

for (const rel of JS_FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.warn("skip (missing):", rel); continue; }
  fs.writeFileSync(p, obf(fs.readFileSync(p, "utf8"), rel));
  console.log("obf js   ", rel);
}
for (const rel of HTML_FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.warn("skip (missing):", rel); continue; }
  fs.writeFileSync(p, processHtml(fs.readFileSync(p, "utf8"), rel));
  console.log("obf html ", rel);
}

// post-write verification: every covered file on disk must carry obfuscator output
for (const rel of [...JS_FILES, ...HTML_FILES]) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  if (!fs.readFileSync(p, "utf8").includes("_0x")) { console.error(`✗ VERIFY FAILED: ${rel} is still readable`); process.exit(2); }
}
const pct = bytesIn ? Math.round((bytesOut / bytesIn) * 100) : 100;
console.log(`\nobfuscation done in ${ROOT} · scripts: ${scripts} · JS size ${bytesIn}→${bytesOut} (${pct}%)`);
console.log(`profile: CFF=${OBF_OPTS.controlFlowFlatteningThreshold} selfDefend=${OBF_OPTS.selfDefending} lock=[${OBF_OPTS.domainLock.join(",") || "none"}]`);
