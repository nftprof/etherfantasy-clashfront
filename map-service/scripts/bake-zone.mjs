// bake-zone.mjs — mass-generate the DEFAULT (seed v0) battlefield for EVERY parcel in a zone,
// so a continent is a COMPLETE game map instead of lazy-on-first-visit. This is the "bake":
// it does exactly what the live lazy path does (worldParcel(snap) → reg.ensureDesign), only for
// all parcels up front, into MAPS_DIR. Deterministic + idempotent: an already-seeded parcel whose
// genVersion matches is left untouched, so re-runs are cheap and resumable.
//
// 2026-10-26 (docs/maps/MAP-POPULATION-GUIDE.md): BIGGEST FIRST + ESTATES + BATCHED INDEX.
//   • `ALL` = every charted zone, ordered by parcel count (BUS → HUB → ENT → UW2 → UW1 → HS1 →
//     HS2 → EDU → HS3 → UW3), so the largest areas populate first.
//   • `--estates` also bakes every UN-SUBDIVIDED L2 estate of those zones as ONE whole-estate map
//     (EPIC → GIANT → LARGE → MEDIUM → SMALL, the ladder fort grown by size — worldfield.js
//     estateParcel). `--estates-only` skips the L3 pass. Estates run FIRST (they are the biggest maps).
//   • The registry index is written every --flush=N parcels (default 500) instead of per parcel —
//     the O(n²) hot spot of the original bake — and at the end (crash-safe cadence; a resume only
//     redoes the parcels after the last flush).
//
// Usage:
//   MAPS_DIR=/path/to/registry node scripts/bake-zone.mjs ALL --estates [--limit=N] [--every=500] [--flush=500] [--dry]
//   MAPS_DIR=/path/to/registry node scripts/bake-zone.mjs EDU BUS [--limit=N] [--every=500] [--dry]
//   --dry    → count + window each parcel (build the generate() input) but DON'T write. Timing probe.
//   --limit  → only the first N parcels (and N estates) of each zone (validation runs).
//   --every  → progress cadence (default 500).
import { l3Zone, l2Zone, zoneList, worldParcel, estateParcel } from "../maps/worldfield.js";
import * as reg from "../maps/registry.js";

const args = process.argv.slice(2);
let zones = args.filter((a) => !a.startsWith("--")).map((z) => z.toUpperCase());
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const limit = Number(opt("limit", Infinity));
const every = Number(opt("every", 500));
const flushEvery = Math.max(1, Number(opt("flush", 500)));
const dry = flag("dry");
const estates = flag("estates") || flag("estates-only");
const estatesOnly = flag("estates-only");

if (zones.includes("ALL")) zones = zoneList().filter((z) => z.count > 0).sort((a, b) => b.count - a.count).map((z) => z.zoneId);
if (!zones.length) { console.error("usage: node scripts/bake-zone.mjs <ZONE...|ALL> [--estates|--estates-only] [--limit=N] [--flush=N] [--dry]"); process.exit(1); }
console.log(`[bake] zones=${zones.join(",")} estates=${estates} estatesOnly=${estatesOnly} dry=${dry} limit=${limit} flush=${flushEvery} MAPS_DIR=${process.env.MAPS_DIR || "(default ~/ef-battlefields)"}`);

const grand = { done: 0, castles: 0, fails: 0, estates: 0 };
let sinceFlush = 0;
const tick = () => { if (dry) return; if (++sinceFlush >= flushEvery) { reg.flushIdx(); sinceFlush = 0; } };

// one pass over a list of generate()-ready parcels; `label` = what we're counting (parcels / estates)
function runPass(zone, items, build, label) {
  const total = Math.min(items.length, limit);
  if (!total) return null;
  const t0 = Date.now();
  const tally = { done: 0, castles: 0, byStatus: {}, bySize: {}, approved: 0, modes: {}, fails: [] };
  for (let i = 0; i < total; i++) {
    const snap = items[i];
    try {
      const parcel = build(snap);
      if (dry) { tally.done++; }
      else {
        const { row, artifact } = reg.ensureDesign(parcel);
        tally.done++;
        tally.byStatus[row.status] = (tally.byStatus[row.status] || 0) + 1;
        if (snap.sizeClass) { const b = (tally.bySize[snap.sizeClass] = tally.bySize[snap.sizeClass] || { n: 0, approved: 0 }); b.n++; if (row.approved) b.approved++; }
        if (row.approved) tally.approved++;
        if (artifact?.meta?.castleGeom) tally.castles++;
        for (const m of (row.sim?.modes || [])) tally.modes[m] = (tally.modes[m] || 0) + 1;
        tick();
      }
    } catch (e) { tally.fails.push([snap.parcelId, e.message]); }
    if ((i + 1) % every === 0 || i + 1 === total) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r[${zone} ${label}] ${i + 1}/${total}  ${(el / (i + 1) * 1000).toFixed(1)} ms/${label.slice(0, -1)}  ${(el).toFixed(0)}s  approved ${tally.approved}  forts ${tally.castles}   `);
    }
  }
  const el = (Date.now() - t0) / 1000;
  console.log(`\n[${zone} ${label}] DONE ${tally.done}/${total} in ${el.toFixed(0)}s (${(el / Math.max(1, total) * 1000).toFixed(1)} ms each)`);
  if (!dry) {
    console.log(`         status=${JSON.stringify(tally.byStatus)}  approved=${tally.approved}/${tally.done}  forts=${tally.castles}`);
    if (Object.keys(tally.bySize).length) console.log(`         bySize=${JSON.stringify(tally.bySize)}`);
    console.log(`         modes=${JSON.stringify(tally.modes)}`);
  }
  if (tally.fails.length) { console.log(`         FAILS ${tally.fails.length}: ${tally.fails.slice(0, 5).map((f) => f.join(":")).join(" | ")}`); grand.fails += tally.fails.length; }
  grand.done += tally.done; grand.castles += tally.castles;
  return tally;
}

if (!dry) reg.beginBatch();
try {
  for (const zone of zones) {
    if (estates) {
      const t = runPass(zone, l2Zone(zone), (row) => estateParcel(row), "estates");   // biggest first (EPIC → SMALL)
      if (t) grand.estates += t.done;
    }
    if (!estatesOnly) runPass(zone, l3Zone(zone), (snap) => worldParcel(snap), "parcels");
    if (!dry) reg.flushIdx();
  }
} finally { if (!dry) reg.endBatch(); }
console.log(`[bake] TOTAL baked=${grand.done} (estates ${grand.estates}) forts=${grand.castles} fails=${grand.fails}`);
