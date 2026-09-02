// Design registry (MAP-GENERATOR.md D1) — JSON-per-parcel store with version history + manifest.
// Layout: <MAPS_DIR>/<parcelId>/design.v{N}.json + row in <MAPS_DIR>/index.json.
// LAZY: nothing exists until first request (never pre-generate 292k). Artifacts are immutable —
// a new generation writes v{N+1}; `current` moves. Owner freeze stops the AI gardener.
// Statuses: UNDESIGNED (no row) → SEED_V0 → AI_ITERATED → OWNER_FROZEN.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { generate, seedFor, GEN_VERSION } from "./generate.js";
import { simulate } from "./simulate.js";
import { renderThumb } from "./thumb.js";

// Render-manifest converter (engine-team's tools/battlefield_converter.cjs — CJS, dependency-free).
// Loaded lazily + defensively so the server runs even if the file isn't present (manifests just
// disabled). Deployed alongside the maps modules on the box, so ./ resolves there; ../../tools/ in
// local dev. The converter derives the ~8 render layers (heightfield, biome, trees/rocks/scatter)
// the raw artifact lacks — this is what makes a generated parcel look like the real game.
const _require = createRequire(import.meta.url);
let _convert;
function converter() {
  if (_convert !== undefined) return _convert;
  for (const p of ["./battlefield_converter.cjs", "../../tools/battlefield_converter.cjs", "../tools/battlefield_converter.cjs"]) {
    try { _convert = _require(p).convert; return _convert; } catch {}
  }
  _convert = null; return _convert;
}

const DIR = () => process.env.MAPS_DIR || path.join(process.env.HOME || ".", "ef-battlefields");
const IDX = () => path.join(DIR(), "index.json");

let _idx = null;
const loadIdx = () => { if (_idx) return _idx; try { _idx = JSON.parse(fs.readFileSync(IDX(), "utf8")); } catch { _idx = {}; } return _idx; };
const saveIdx = () => { fs.mkdirSync(DIR(), { recursive: true }); fs.writeFileSync(IDX(), JSON.stringify(_idx)); };
const pDir = (id) => path.join(DIR(), String(id));
const artPath = (id, v) => path.join(pDir(id), `design.v${v}.json`);

export function getRow(parcelId) { return loadIdx()[String(parcelId)] || null; }
export function list(status = null) {
  const rows = Object.values(loadIdx());
  return status ? rows.filter((r) => r.status === status) : rows;
}

export function readArtifact(parcelId, version = null) {
  const row = getRow(parcelId);
  if (!row) return null;
  const v = version ?? row.designVersion;
  try { return JSON.parse(fs.readFileSync(artPath(parcelId, v), "utf8")); } catch { return null; }
}

// engine-ready render manifest, lazily built + cached next to the artifact (render.v{N}.c{R}.json).
// Immutable per designVersion+CONV_REV → compute once. CONV_REV bumps when the converter's
// palette/biome tables change (r2: ember row + tundra frost floor, 2026-09-02) so stale caches
// on deployed boxes regenerate without touching designVersion.
const CONV_REV = 2;

// artifact → engine-ready manifest via the vendored converter, with the contract hardening
// (MOBA fixes 1+3: designVersion + siege block attached HERE so the engine-team's vendored
// converter stays untouched). Shared by the registry cache path and the pre-designed-estate
// route in api.js (committed cf-maps artifacts that never enter the registry).
export function convertArtifact(art, parcelId, v = art?.meta?.designVersion ?? 0) {
  const convert = converter();
  if (!convert) return { error: "converter_unavailable" };
  let m;
  try { m = convert(art, { parcelId: String(parcelId), designVersion: v }); }
  catch (e) { console.error("[maps] convert:", e.message); return { error: "convert_failed", detail: e.message }; }
  if (m && !m.error) {
    if (m.designVersion == null) m.designVersion = v;
    if (art.siege && !m.siege) m.siege = art.siege;
  }
  return m;
}

export function readManifest(parcelId, version = null) {
  const row = getRow(parcelId);
  if (!row) return null;
  const v = version ?? row.designVersion;
  const mp = path.join(pDir(parcelId), `render.v${v}.c${CONV_REV}.json`);
  try { return JSON.parse(fs.readFileSync(mp, "utf8")); } catch {}     // cache hit
  const art = readArtifact(parcelId, v);
  if (!art) return null;
  const m = convertArtifact(art, parcelId, v);
  if (m && !m.error) {
    try { fs.writeFileSync(mp, JSON.stringify(m)); } catch (e) { console.error("[maps] manifest write:", e.message); }
  }
  return m;
}

function save(parcel, artifact, status, extra = {}) {
  const id = String(parcel.parcelId);
  const prior = loadIdx()[id];
  extra.investLevel = parcel.investLevel ?? prior?.investLevel ?? 0;   // investment tier survives regens
  // SIM GATE (D5): run the unwritten-rules battle simulation. The artifact carries the modes it
  // is approved to host; the row records the full verdict. A map that fails the hard checks is
  // stored but NOT deploy-approved (freeze() refuses it) — this is the paid-upgrade approval queue.
  let sim;
  try { sim = simulate(artifact); } catch (e) { console.error("[maps] sim:", e.message); sim = { pass: false, score: 0, modes: [], checks: [], summary: "sim_error" }; }
  artifact.meta.modes = sim.modes;
  artifact.meta.sim = { pass: sim.pass, score: sim.score, summary: sim.summary };
  extra.sim = sim; extra.approved = sim.pass;
  fs.mkdirSync(pDir(id), { recursive: true });
  fs.writeFileSync(artPath(id, artifact.meta.designVersion), JSON.stringify(artifact));
  // D7 thumbnail alongside the artifact (best-effort — a thumb failure never blocks a design)
  try {
    fs.writeFileSync(path.join(pDir(id), `thumb.v${artifact.meta.designVersion}.png`), renderThumb(artifact));
    extra.thumbnailPath = path.join(String(id), `thumb.v${artifact.meta.designVersion}.png`);
  } catch (e) { console.error("[maps] thumb:", e.message); }
  const idx = loadIdx();
  idx[id] = {
    parcelId: id, designVersion: artifact.meta.designVersion, status,
    seed: seedFor(id, parcel.biome || "", parcel.zone || ""),
    biome: parcel.biome || "", zone: parcel.zone || "", sizeClass: artifact.arena.sizeM,
    laneCount: artifact.laneCount, archetype: artifact.meta.params.archetype, palette: artifact.meta.params.palette,
    fieldSha: parcel.fieldSha || null,   // world-field provenance (SEED_V0 self-heal key)
    lastGeneratedAt: Date.now(), thumbnailPath: extra.thumbnailPath || null, ...extra,
  };
  saveIdx();
  return idx[id];
}

// the lazy entry point: first request generates + persists v0; later calls read the saved artifact
export function ensureDesign(parcel) {
  const row = getRow(parcel.parcelId);
  if (row) {
    const artifact = readArtifact(parcel.parcelId);
    // SELF-HEAL stale seeds: a SEED_V0 map is a pure function of seed+generator+world-field,
    // carries no owner work — when the generator version moved (GEN_VERSION) OR the zone's world
    // field changed since the row was seeded (fieldSha — e.g. the HS1/HS2/HS3 fields landing
    // AFTER a box lazily seeded those parcels flat), regenerate as the next version so a cached
    // registry picks up fixes on first view. Owner-touched rows (AI_ITERATED / OWNER_FROZEN) are
    // never reseeded. Old versions stay on disk (immutable).
    const fieldStale = parcel.fieldSha ? row.fieldSha !== parcel.fieldSha : false;
    if (row.status === "SEED_V0" && artifact && (artifact.meta?.genVersion !== GEN_VERSION || fieldStale)) {
      const fresh = generate(parcel, null, (row.designVersion | 0) + 1);
      return { row: save(parcel, fresh, "SEED_V0"), artifact: fresh };
    }
    return { row, artifact };
  }
  const artifact = generate(parcel, null, 0);
  return { row: save(parcel, artifact, "SEED_V0"), artifact };
}

// Adopt a PRE-BUILT artifact into the registry (e.g. the committed SIEGE-TEST-1 siege map, seeded
// at server boot so the live 3D/command viewers can serve it). Rows adopt as OWNER_FROZEN — a
// hand-authored map must never be self-heal reseeded (parcelFacts cannot rebuild its injected
// worldField; a reseed would silently replace the siege arena with a default square). Idempotent:
// an existing row at >= the artifact's version wins.
export function adoptArtifact(parcelId, artifact) {
  const id = String(parcelId), v = artifact?.meta?.designVersion ?? 0;
  const gv = artifact?.meta?.genVersion ?? 0;
  const prior = getRow(id);
  // Keep the prior ONLY if it is at least as new by BOTH designVersion AND generator version.
  // A GENERATOR bump (genVersion) must always supersede: a clean rebuild can legitimately reset
  // designVersion to a LOWER number (an accumulated box copy at v246 vs a fresh bake at v20), and
  // the old designVersion-only guard silently stranded the box on the pre-bump geometry (owner
  // 2026-08-22: "the map is still the non-walkable version"). Old rows carry no genVersion ⇒ 0 ⇒
  // any bumped artifact wins.
  if (prior && prior.designVersion >= v && (prior.genVersion ?? 0) >= gv) return prior;
  fs.mkdirSync(pDir(id), { recursive: true });
  fs.writeFileSync(artPath(id, v), JSON.stringify(artifact));
  const idx = loadIdx();
  const row = (idx[id] = {
    parcelId: id, designVersion: v, genVersion: gv, status: "OWNER_FROZEN",
    seed: artifact.meta?.seed ?? 0, biome: "", zone: artifact.meta?.zone || "",
    sizeClass: artifact.arena?.sizeM, laneCount: artifact.laneCount,
    archetype: artifact.meta?.params?.archetype, palette: artifact.meta?.params?.palette,
    lastGeneratedAt: 0, thumbnailPath: null, adopted: true,
    sim: artifact.meta?.sim || null, approved: artifact.meta?.sim?.pass !== false,
  });
  try {
    fs.writeFileSync(path.join(pDir(id), `thumb.v${v}.png`), renderThumb(artifact));
    row.thumbnailPath = path.join(id, `thumb.v${v}.png`);
  } catch (e) { console.error("[maps] adopt thumb:", e.message); }
  saveIdx();
  return row;
}

// landowner CT re-investment (driven by the overworld economy; admin-set during testing).
// Raises the parcel's content budget — takes effect on the NEXT regenerate (next battle loads it).
export function setInvest(parcelId, level) {
  const idx = loadIdx(), row = idx[String(parcelId)];
  if (!row) return null;
  row.investLevel = Math.max(0, Math.min(5, level | 0));
  saveIdx();
  return row;
}

// a new version from explicit params (owner prompt / gardener). Refuses frozen unless byOwner.
export function regenerate(parcel, params, { byOwner = false, directive = null, by = null } = {}) {
  const row = getRow(parcel.parcelId);
  if (row && row.status === "OWNER_FROZEN" && !byOwner) return { error: "frozen" };
  if (row && parcel.investLevel == null) parcel = { ...parcel, investLevel: row.investLevel ?? 0 };
  const v = row ? row.designVersion + 1 : 0;
  const artifact = generate(parcel, params, v);
  // audit trail: (directive → params) pairs are exactly the POCA fine-tuning dataset later
  if (directive) { try { fs.appendFileSync(path.join(DIR(), "prompts.log"), JSON.stringify({ parcelId: parcel.parcelId, v, directive, params, by, ts: Date.now() }) + "\n"); } catch {} }
  return { row: save(parcel, artifact, byOwner ? "OWNER_FROZEN" : "AI_ITERATED", by ? { lastEditedBy: by } : {}), artifact };
}

export function freeze(parcelId, on = true) {
  const idx = loadIdx(), row = idx[String(parcelId)];
  if (!row) return null;
  // deploy gate: you cannot freeze/publish a map that failed the simulation queue
  if (on && row.approved === false) return { error: "not_approved", sim: row.sim };
  row.status = on ? "OWNER_FROZEN" : (row.designVersion > 0 ? "AI_ITERATED" : "SEED_V0");
  saveIdx();
  return row;
}

export const _resetForTest = (dir) => { _idx = null; if (dir) process.env.MAPS_DIR = dir; };
