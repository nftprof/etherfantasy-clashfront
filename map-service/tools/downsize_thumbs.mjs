// downsize_thumbs.mjs — the LOD thumb subset (owner 2026-08-25: "ship downsized thumb subset" for
// crisp zoom-in). The full 512px thumbs are 286 MB / box-side-gitignored; the baked mosaic softens
// on deep zoom. This bakes a SMALL (default 128px) thumb per GENERATED SINGLE parcel, keyed by its
// CURRENT parcelId, committed to data/cf-maps/thumbs3d-lod/ (~10–30 KB each). The /designer map fetches
// these per-parcel when you zoom in and draws them crisp, clipped to the parcel polygon.
//
// Usage: node map-service/tools/downsize_thumbs.mjs [ZONE] [size]   (default EDU 128)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePNG } from "../maps/png-decode.js";
import { encodePNG } from "../maps/png.js";
import { dataRoot } from "../maps/worldfield.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = dataRoot();
const ZONE = (process.argv[2] || "EDU").toUpperCase();
const SIZE = Number(process.argv[3] || 128);
const SRC = path.join(DATA, "cf-maps/thumbs3d");
const OUT = path.join(DATA, "cf-maps/thumbs3d-lod");

function loadLeaves(zone) {
  const l3Path = path.join(DATA, `hexagon-city-source/l3/${zone}.json`);
  let leaves = JSON.parse(readFileSync(l3Path, "utf8")).singles.slice();
  const l2Path = path.join(DATA, "hexagon-city-source/parcels-l2.json");
  if (existsSync(l2Path)) {
    const raw = JSON.parse(readFileSync(l2Path, "utf8"));
    const l2 = Array.isArray(raw) ? raw : (raw.parcels || raw.estates || Object.values(raw)[0] || []);
    leaves = leaves.concat(l2.filter((s) => s.zone === zone && s.l3Enabled === false && s.svgPath));
  }
  return leaves;
}
const thumbFile = (s) => { for (const id of [s.tokenIdOld, s.parcelId]) if (id != null && existsSync(path.join(SRC, `${id}.png`))) return path.join(SRC, `${id}.png`); return null; };

// box-filter downscale src rgba (sw×sh) → SIZE×SIZE, alpha-weighted so transparent edges stay clean.
function downscale(src, sw, sh) {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const y0 = (y * sh / SIZE) | 0, y1 = Math.max(y0 + 1, ((y + 1) * sh / SIZE) | 0);
    for (let x = 0; x < SIZE; x++) {
      const x0 = (x * sw / SIZE) | 0, x1 = Math.max(x0 + 1, ((x + 1) * sw / SIZE) | 0);
      let r = 0, g = 0, b = 0, a = 0, aw = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const i = (sy * sw + sx) * 4, al = src[i + 3];
        r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al; aw += al; n++;
      }
      const o = (y * SIZE + x) * 4;
      out[o] = aw ? (r / aw) | 0 : 0; out[o + 1] = aw ? (g / aw) | 0 : 0; out[o + 2] = aw ? (b / aw) | 0 : 0; out[o + 3] = n ? (a / n) | 0 : 0;
    }
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
const leaves = loadLeaves(ZONE);
// SINGLES only — estates render as terrain (no per-parcel thumb). Key the LOD file by current parcelId.
const singles = leaves.filter((s) => (!s.sizeClass || s.sizeClass === "SINGLE"));
let ok = 0, miss = 0, bytes = 0;
for (const s of singles) {
  const f = thumbFile(s); if (!f) { miss++; continue; }
  try {
    const { w, h, rgba } = decodePNG(readFileSync(f));
    const small = downscale(rgba, w, h);
    const png = encodePNG(SIZE, SIZE, Buffer.from(small));
    writeFileSync(path.join(OUT, `${s.parcelId}.png`), png); ok++; bytes += png.length;
  } catch (e) { miss++; }
}
console.log(`${ZONE}: ${ok} LOD thumbs @ ${SIZE}px (${(bytes / 1048576).toFixed(2)} MB total, avg ${ok ? (bytes / ok / 1024 | 0) : 0} KB) → data/cf-maps/thumbs3d-lod/  (${miss} singles had no source thumb)`);
