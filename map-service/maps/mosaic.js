// mosaic.js — SERVER-SIDE aerial thumbnail mosaic (owner 2026-08-25: "this should replace Arcadia
// [the flat grey select-map]… run it on the server in a pipeline, one time, redo on regenerate").
//
// Bakes ONE continent-wide PNG by compositing every LEAF parcel's real 3D top-down thumbnail at its
// TRUE overworld position (castle→castle, candy→candy); UNGENERATED land fills grey. Because each
// parcel's roads seed from the shared overworld network, tiling at true bboxes makes roads run
// continuous across seams for free, and out-of-polygon pixels stay as the dark ground so the composite
// takes the continent's real silhouette.
//
// This is the render CORE of tools/world_mosaic.mjs, lifted into a reusable + cacheable function so
// the /designer select-map can use it as its base layer (the interactive dots draw on top). The
// select-map aligns it via the returned `world` bbox + `flipY` note (source is y-DOWN, like the SVG).
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { svgPathToPolygon, dataRoot, zoneBiomeFamily, worldParcel } from "./worldfield.js";
import { encodePNG } from "./png.js";
import { decodePNG } from "./png-decode.js";
import { generate } from "./generate.js";
import { T } from "./schema.js";

// per-palette cell colours [OPEN, FOREST, ROCK, WATER, CLIFF, ROAD] — mirrors thumb.js so the planner
// reads identically to a parcel's own 2D terrain thumbnail.
const PALETTE_RGB = {
  verdant: [[86, 118, 72], [38, 72, 40], [110, 106, 98], [52, 86, 120], [90, 82, 74], [150, 132, 96]],
  autumn: [[122, 102, 58], [122, 74, 34], [110, 100, 92], [60, 84, 110], [96, 84, 70], [152, 128, 92]],
  volcanic: [[60, 52, 50], [70, 44, 36], [88, 80, 78], [190, 74, 30], [50, 44, 44], [110, 96, 84]],
  tundra: [[168, 178, 182], [96, 116, 110], [140, 146, 150], [110, 140, 160], [120, 126, 132], [180, 172, 158]],
  desert: [[188, 162, 110], [120, 124, 62], [150, 128, 96], [70, 120, 140], [140, 116, 84], [204, 182, 136]],
  swamp: [[74, 88, 58], [44, 60, 38], [96, 98, 86], [46, 78, 92], [80, 84, 66], [128, 116, 84]],
  ashen: [[96, 94, 92], [64, 66, 62], [118, 114, 110], [70, 80, 92], [84, 80, 78], [140, 132, 120]],
  sakura: [[120, 140, 96], [172, 120, 140], [130, 124, 128], [96, 130, 160], [110, 102, 106], [168, 150, 130]],
};
// build a per-parcel 2D-terrain sampler from a fresh generate() — the DETAILED planner (forest/rock/
// water/road per cell), same as the parcel's own natural terrain. Returns null if generation fails.
function genSampler(s) {
  try {
    const art = generate(worldParcel(s, { investLevel: 1 }));
    const G = art.terrain.w, cells = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
    const pal = PALETTE_RGB[art.meta?.params?.palette] || PALETTE_RGB.verdant;
    const counts = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k < cells.length; k++) { const c = cells[k]; if (c !== T.OOB) counts[Math.min(c, 5)]++; }
    let dom = 0; for (let c = 1; c < 6; c++) if (counts[c] > counts[dom]) dom = c;
    const domRGB = pal[dom];
    return (fx, fy) => { const cxi = Math.min(G - 1, Math.max(0, (fx * G) | 0)), czi = Math.min(G - 1, Math.max(0, (fy * G) | 0)), cell = cells[czi * G + cxi]; return cell === T.OOB ? domRGB : pal[Math.min(cell, 5)]; };
  } catch { return null; }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve data via worldfield's dataRoot() — it probes ../../data THEN ../data, so it lands on the
// right dir in BOTH the repo layout (…/map-service/maps → repo/data) and the deployed box layout
// (~/ef-map-service/maps → ~/ef-map-service/data). A naive path.resolve(__dirname,"../../data")
// walks ABOVE ~/ef-map-service on the box (→ ~/data, which is empty) — that was the mosaic-blank bug.
const DATA = () => (process.env.MAPS_DATA_DIR ? path.resolve(process.env.MAPS_DATA_DIR) : dataRoot());
const THUMBDIR = () => (process.env.CF_THUMBS_DIR ? path.resolve(process.env.CF_THUMBS_DIR) : path.join(DATA(), "cf-maps/thumbs3d"));
const CACHEDIR = () => path.join(DATA(), "cf-maps/mosaic-cache");

const BG = [14, 18, 26];                            // dark ground behind the continent
const BORDER = [24, 30, 42];                        // clear parcel outline ("show borders")
const GREY = [72, 78, 88], GREY2 = [82, 88, 98];    // ungenerated fill (slight checker so shapes read)
// biomeFamily → open-land colour, so ESTATES + the planner layer read as terrain at CONSISTENT scale
// (owner 2026-08-25: an estate must NOT be one castle stretched across 100s of parcels — canon 22 =
// terrain board + POI markers). A little seeded speckle keeps big fills from looking dead-flat.
const LAND = {
  TEMPERATE_FOREST: [70, 96, 62], TEMPERATE_GRASS: [96, 120, 72], SWAMP: [74, 88, 58],
  VOLCANIC: [78, 62, 56], SNOW: [172, 180, 186], DESERT: [186, 162, 110], TUNDRA: [150, 160, 164],
};
export const landColor = (zone) => LAND[zoneBiomeFamily(zone)] || [86, 110, 74];
const speckle = (base, x, y) => { const h = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 17 - 8; return [Math.max(0, base[0] + h), Math.max(0, base[1] + h), Math.max(0, base[2] + h)]; };

const _thumbCache = new Map();
function loadThumb(id) {
  if (_thumbCache.has(id)) return _thumbCache.get(id);
  let t = null;
  try { const f = path.join(THUMBDIR(), `${id}.png`); if (existsSync(f)) t = decodePNG(readFileSync(f)); } catch { t = null; }
  _thumbCache.set(id, t); return t;
}
// current parcelId → thumb file id. Committed thumbs are keyed by the OLD token id (`tokenIdOld`,
// 6020… before the on-chain id correction to 5020…); fall back to the current parcelId.
function thumbFileId(s) {
  const dir = THUMBDIR();
  for (const id of [s.tokenIdOld, s.parcelId]) if (id != null && existsSync(path.join(dir, `${id}.png`))) return String(id);
  return null;
}

// ⚠ RENDER ALL *LEAF* PARCELS — the recurring gap bug (owner 2026-08-23, "not the first time"): a
// leaf is an L3 single OR an L2 parcel never subdivided (`l3Enabled === false`). L3-only omits the
// un-subdivided L2 leaves, which then read as black CHANNELS ("gaps"). Leaves TESSELLATE.
function loadLeaves(zone) {
  const l3Path = path.join(DATA(), `hexagon-city-source/l3/${zone}.json`);
  if (!existsSync(l3Path)) throw new Error(`no L3 data for zone ${zone}`);
  let leaves = JSON.parse(readFileSync(l3Path, "utf8")).singles.slice();
  const l2Path = path.join(DATA(), "hexagon-city-source/parcels-l2.json");
  if (existsSync(l2Path)) {
    const raw = JSON.parse(readFileSync(l2Path, "utf8"));
    const l2 = Array.isArray(raw) ? raw : (raw.parcels || raw.estates || Object.values(raw)[0] || []);
    leaves = leaves.concat(l2.filter((s) => s.zone === zone && s.l3Enabled === false && s.svgPath));
  }
  return leaves;
}

// newest thumb mtime + count for the zone's parcels → cache key (a re-shot thumb invalidates the
// mosaic) + a "does the box even have thumbs?" signal.
function thumbsStat() {
  const dir = THUMBDIR();
  let latest = 0, n = 0;
  try { for (const f of readdirSync(dir)) { if (!f.endsWith(".png")) continue; n++; const m = statSync(path.join(dir, f)).mtimeMs; if (m > latest) latest = m; } } catch { /* none */ }
  return { n, fp: `${n}-${Math.round(latest)}` };
}
// COMMITTED baked mosaic (data/cf-maps/world-mosaic/<zone>.png + .json) — I bake it locally where the
// full thumb set lives and commit the ~0.3 MB PNG (the raw thumbs are box-side/gitignored). The live
// box, which has NO thumbs, serves this so /designer shows real 3D thumbs immediately after deploy;
// once the box's own capture pipeline populates thumbs, a fresh richer bake overrides it.
function committedMosaic(zone, mode = "thumb") {
  const stem = mode === "planner" ? `${zone}.planner` : zone;   // <zone>.png (thumb) / <zone>.planner.png
  const base = path.join(DATA(), "cf-maps/world-mosaic", stem);
  try { if (existsSync(`${base}.png`) && existsSync(`${base}.json`)) return { png: readFileSync(`${base}.png`), meta: JSON.parse(readFileSync(`${base}.json`, "utf8")) }; } catch { /* none */ }
  return null;
}

// Bake (or read cache). opts: { zone, ppu, maxdim, force, mode }.
//   mode "thumb"  (default) = singles show their 3D thumb, ESTATES show terrain (POI via overlay),
//                             ungenerated = grey. The scale-consistent land map.
//   mode "planner"          = EVERY parcel shows terrain colour (the 2D reference "planner" layer).
// Higher default res than the first pass (owner 2026-08-25 "res too low") — bigger PNG, sharper.
export function bakeMosaic({ zone = "EDU", ppu = 20, maxdim = 4096, force = false, mode = "thumb" } = {}) {
  zone = String(zone).toUpperCase();
  mode = mode === "planner" ? "planner" : "thumb";
  const { n: nThumbs, fp } = thumbsStat();
  // No thumbs on this host (e.g. the live box) → serve the committed baked mosaic if we shipped one.
  if (!force && nThumbs === 0) { const c = committedMosaic(zone, mode); if (c) return { png: c.png, meta: c.meta, cached: true, committed: true }; }
  const cacheStem = path.join(CACHEDIR(), `${zone}.${mode}.p${ppu}.m${maxdim}.${fp}`);
  if (!force && existsSync(`${cacheStem}.png`) && existsSync(`${cacheStem}.json`)) {
    return { png: readFileSync(`${cacheStem}.png`), meta: JSON.parse(readFileSync(`${cacheStem}.json`, "utf8")), cached: true };
  }
  const LC = landColor(zone);

  const leaves = loadLeaves(zone);
  const singles = leaves.filter((s) => s.svgPath && s.bbox);
  if (!singles.length) throw new Error(`no parcels for zone ${zone}`);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of singles) { const [x0, y0, x1, y1] = s.bbox; if (x0 < minX) minX = x0; if (y0 < minY) minY = y0; if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1; }
  const spanX = maxX - minX, spanY = maxY - minY;
  const PPU = Math.min(ppu, maxdim / Math.max(spanX, spanY));
  const W = Math.max(1, Math.round(spanX * PPU)), H = Math.max(1, Math.round(spanY * PPU));

  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { px[i * 4] = BG[0]; px[i * 4 + 1] = BG[1]; px[i * 4 + 2] = BG[2]; px[i * 4 + 3] = 255; }
  const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  const line = (x0, y0, x1, y1, c) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { put(x0, y0, c[0], c[1], c[2]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  const toCanvas = (zx, zy) => [(zx - minX) * PPU, (zy - minY) * PPU];  // y-DOWN, matches the SVG source

  let ok = 0, hasThumb = 0, greyN = 0, estateN = 0;
  for (const s of singles) {
    const zpoly = svgPathToPolygon(s.svgPath);
    if (!zpoly || zpoly.length < 3) continue;
    const cpoly = zpoly.map(([zx, zy]) => toCanvas(zx, zy));
    let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
    for (const [x, y] of cpoly) { if (x < px0) px0 = x; if (y < py0) py0 = y; if (x > px1) px1 = x; if (y > py1) py1 = y; }
    const pw = Math.max(1, px1 - px0), ph = Math.max(1, py1 - py0);

    // An ESTATE (any non-SINGLE leaf) is a whole board, not one battle map — never stretch a single
    // ±161 thumb across it (that's the "castle spans 100s of parcels" bug). It reads as TERRAIN at the
    // same scale as everything else; its castle/gates come from the feature overlay POIs (canon 22).
    const isEstate = s.sizeClass && s.sizeClass !== "SINGLE";
    const tfid = mode === "thumb" && !isEstate ? thumbFileId(s) : null;
    const th = tfid ? loadThumb(tfid) : null;
    let sample;
    // ⚠ Arena-in-a-box (WORLD-MAP-RENDERING.md trap #1): the ±161 thumb has TRANSPARENT margins, so a
    // transparent pixel must fall back to TERRAIN — never leave the parcel's own area as background, or
    // parcels read as rounded blobs with gaps instead of tessellating. Fill the WHOLE polygon.
    if (th) { hasThumb++; sample = (fx, fy, x, y) => { const tx = Math.min(th.w - 1, Math.max(0, (fx * th.w) | 0)), ty = Math.min(th.h - 1, Math.max(0, (fy * th.h) | 0)), i = (ty * th.w + tx) * 4; return th.rgba[i + 3] < 100 ? speckle(LC, x, y) : [th.rgba[i], th.rgba[i + 1], th.rgba[i + 2]]; }; }
    else if (mode === "planner" || isEstate) { if (isEstate) estateN++; const g = genSampler(s); sample = g || ((fx, fy, x, y) => speckle(LC, x, y)); }  // DETAILED generated terrain (forest/rock/water/road)
    else { greyN++; sample = (fx, fy, x, y) => (((x + y) & 3) ? GREY : GREY2); }
    ok++;

    const yA = Math.max(0, Math.floor(py0)), yB = Math.min(H - 1, Math.ceil(py1));
    for (let y = yA; y <= yB; y++) {
      const xs = [];
      for (let e = 0; e < cpoly.length; e++) {
        const a = cpoly[e], b = cpoly[(e + 1) % cpoly.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xL = Math.max(0, Math.ceil(xs[k])), xR = Math.min(W - 1, Math.floor(xs[k + 1]));
        for (let x = xL; x <= xR; x++) { const c = sample((x - px0) / pw, (y - py0) / ph, x, y) || GREY; put(x, y, c[0], c[1], c[2]); }
      }
    }
    // NO baked border stroke: a 1px raster line upscales into a thick black SEAM on zoom and makes
    // perfectly-tessellating parcels (measured polygon gap = 0) read as gaps / non-continuous land
    // (owner 2026-08-26). Parcel outlines, if wanted, belong on the client as a crisp vector overlay.
  }

  const png = encodePNG(W, H, Buffer.from(px));
  const meta = { zone, mode, world: { minX, minY, maxX, maxY }, flipY: false, pxPerUnit: PPU, w: W, h: H, leaves: ok, thumbed: hasThumb, estates: estateN, grey: greyN, fingerprint: fp };
  try { mkdirSync(CACHEDIR(), { recursive: true }); writeFileSync(`${cacheStem}.png`, png); writeFileSync(`${cacheStem}.json`, JSON.stringify(meta)); } catch { /* cache best-effort */ }
  return { png, meta, cached: false };
}

// CLI: bake + COMMIT a zone's mosaic layers (run where the full thumb set lives) →
//   node map-service/maps/mosaic.js EDU            → EDU.png (thumb) + EDU.planner.png + .json each
// Re-run after regenerating a zone's maps + re-capturing its thumbs; commit the PNGs (~0.3–1 MB).
if (import.meta.url === `file://${process.argv[1]}`) {
  const zone = (process.argv[2] || "EDU").toUpperCase();
  const outDir = path.join(DATA(), "cf-maps/world-mosaic");
  mkdirSync(outDir, { recursive: true });
  for (const mode of ["thumb", "planner"]) {
    const { png, meta } = bakeMosaic({ zone, force: true, mode });
    const stem = mode === "planner" ? `${zone}.planner` : zone;
    writeFileSync(path.join(outDir, `${stem}.png`), png);
    writeFileSync(path.join(outDir, `${stem}.json`), JSON.stringify(meta));
    console.log(`committed ${zone} [${mode}]: ${meta.w}x${meta.h}, ${meta.thumbed} thumbed / ${meta.estates} estates / ${meta.leaves} leaves → ${stem}.png (${(png.length / 1048576).toFixed(2)} MB)`);
  }
}
