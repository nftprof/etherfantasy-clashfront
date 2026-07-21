// bake-zone.mjs — mass-generate the DEFAULT (seed v0) battlefield for EVERY parcel in a zone,
// so a continent is a COMPLETE game map instead of lazy-on-first-visit. This is the "bake":
// it does exactly what the live lazy path does (worldParcel(snap) → reg.ensureDesign), only for
// all parcels up front, into MAPS_DIR. Deterministic + idempotent: an already-seeded parcel whose
// genVersion matches is left untouched, so re-runs are cheap and resumable.
//
// Usage:
//   MAPS_DIR=/path/to/registry node scripts/bake-zone.mjs EDU BUS [--limit=N] [--every=500] [--dry]
//   --dry    → count + window each parcel (build the generate() input) but DON'T write. Timing probe.
//   --limit  → only the first N parcels of each zone (validation runs).
//   --every  → progress cadence (default 500).
import { l3Zone, worldParcel } from "../maps/worldfield.js";
import * as reg from "../maps/registry.js";

const args = process.argv.slice(2);
const zones = args.filter((a) => !a.startsWith("--")).map((z) => z.toUpperCase());
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const limit = Number(opt("limit", Infinity));
const every = Number(opt("every", 500));
const dry = flag("dry");

if (!zones.length) { console.error("usage: node scripts/bake-zone.mjs <ZONE...> [--limit=N] [--dry]"); process.exit(1); }
console.log(`[bake] zones=${zones.join(",")} dry=${dry} limit=${limit} MAPS_DIR=${process.env.MAPS_DIR || "(default ~/ef-battlefields)"}`);

const grand = { done: 0, castles: 0, fails: 0 };
for (const zone of zones) {
  const singles = l3Zone(zone);
  const total = Math.min(singles.length, limit);
  const t0 = Date.now();
  const tally = { done: 0, castles: 0, byStatus: {}, approved: 0, modes: {}, fails: [] };
  for (let i = 0; i < total; i++) {
    const snap = singles[i];
    try {
      const parcel = worldParcel(snap);           // biome + windowed world field → generate() input
      if (dry) { tally.done++; }
      else {
        const { row, artifact } = reg.ensureDesign(parcel);
        tally.done++;
        tally.byStatus[row.status] = (tally.byStatus[row.status] || 0) + 1;
        if (row.approved) tally.approved++;
        if (artifact?.meta?.castleGeom) tally.castles++;
        for (const m of (row.sim?.modes || [])) tally.modes[m] = (tally.modes[m] || 0) + 1;
      }
    } catch (e) { tally.fails.push([snap.parcelId, e.message]); }
    if ((i + 1) % every === 0 || i + 1 === total) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r[${zone}] ${i + 1}/${total}  ${(el / (i + 1) * 1000).toFixed(1)} ms/parcel  ${(el).toFixed(0)}s  approved ${tally.approved}  forts ${tally.castles}   `);
    }
  }
  const el = (Date.now() - t0) / 1000;
  console.log(`\n[${zone}] DONE ${tally.done}/${total} in ${el.toFixed(0)}s (${(el / Math.max(1, total) * 1000).toFixed(1)} ms/parcel)`);
  if (!dry) {
    console.log(`         status=${JSON.stringify(tally.byStatus)}  approved=${tally.approved}/${tally.done}  forts=${tally.castles}`);
    console.log(`         modes=${JSON.stringify(tally.modes)}`);
  }
  if (tally.fails.length) { console.log(`         FAILS ${tally.fails.length}: ${tally.fails.slice(0, 5).map((f) => f.join(":")).join(" | ")}`); grand.fails += tally.fails.length; }
  grand.done += tally.done; grand.castles += tally.castles;
}
console.log(`[bake] TOTAL baked=${grand.done} forts=${grand.castles} fails=${grand.fails}`);
