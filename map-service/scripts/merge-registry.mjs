#!/usr/bin/env node
// merge-registry.mjs — fold a bake SHARD registry into the LIVE one. The bake writes into its own
// MAPS_DIR while the service keeps running (zero downtime during the hours-long generation); the
// merge is the only step that needs the service stopped, and it takes seconds: parcel dirs are
// MOVED (same filesystem = rename), the index is unioned once.
//
// Conflict rule: a LIVE row that carries owner work (AI_ITERATED / OWNER_FROZEN) or a newer
// designVersion always wins — the shard only ever supplies DEFAULTS. Idempotent.
//
//   node scripts/merge-registry.mjs <shardDir> <liveDir> [--dry]
import fs from "fs";
import path from "path";

const [shard, live] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
if (!shard || !live) { console.error("usage: merge-registry.mjs <shardDir> <liveDir> [--dry]"); process.exit(1); }
const read = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, "index.json"), "utf8")); } catch { return {}; } };
const sIdx = read(shard), lIdx = read(live);
const OWNER = new Set(["AI_ITERATED", "OWNER_FROZEN"]);
// SLIM rows on the way in: rows written before 2026-10-26 carry the full sim `checks` array (~1.2 KB
// each — the index-size/heap problem that OOM-killed the first BUS bake). The full verdict lives in
// the artifact (meta.sim) for new rows; for old rows it is recomputable (simulate is deterministic).
let slimmed = 0;
const slim = (r) => { if (r && r.sim && r.sim.checks) { const { checks, ...s } = r.sim; slimmed++; return { ...r, sim: s }; } return r; };
for (const id of Object.keys(lIdx)) lIdx[id] = slim(lIdx[id]);
let moved = 0, kept = 0, replaced = 0, missing = 0;
fs.mkdirSync(live, { recursive: true });
for (const [id, row] of Object.entries(sIdx)) {
  const cur = lIdx[id];
  if (cur && (OWNER.has(cur.status) || (cur.designVersion | 0) > (row.designVersion | 0))) { kept++; continue; }
  const src = path.join(shard, id), dst = path.join(live, id);
  if (!fs.existsSync(src)) { missing++; continue; }
  if (!dry) {
    if (fs.existsSync(dst)) {
      // live already has files (a lazy seed) — overlay the shard's versions, never delete live history
      for (const f of fs.readdirSync(src)) fs.renameSync(path.join(src, f), path.join(dst, f));
      fs.rmSync(src, { recursive: true, force: true });
      replaced++;
    } else { fs.renameSync(src, dst); moved++; }
    lIdx[id] = slim(row);
  } else { if (fs.existsSync(dst)) replaced++; else moved++; }
}
if (!dry) {
  const tmp = path.join(live, "index.json.tmp");
  fs.writeFileSync(tmp, JSON.stringify(lIdx)); fs.renameSync(tmp, path.join(live, "index.json"));   // atomic swap
  // PRUNE the shard index: rows whose dirs were moved (or were already gone) no longer belong to the shard —
  // leaving them made every later bake report them as "missing-dirs" and carried a growing stale index into
  // the next run (2026-10-28: 4,513 stale estate rows rode along with the EDU bake). Rows the live side kept
  // (owner work / newer version) are dropped too: the shard only ever supplies defaults.
  const sTmp = path.join(shard, "index.json.tmp");
  fs.writeFileSync(sTmp, JSON.stringify({})); fs.renameSync(sTmp, path.join(shard, "index.json"));
}
console.log(`[merge] ${dry ? "DRY " : ""}shard ${Object.keys(sIdx).length} rows → live now ${Object.keys(lIdx).length} rows · moved ${moved} · overlaid ${replaced} · kept-live ${kept} · missing-dirs ${missing} · slimmed ${slimmed}${dry ? "" : " · shard index cleared"}`);
