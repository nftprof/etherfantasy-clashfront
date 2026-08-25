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
import { svgPathToPolygon } from "./worldfield.js";
import { encodePNG } from "./png.js";
import { decodePNG } from "./png-decode.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DATA = () => (process.env.MAPS_DATA_DIR ? path.resolve(process.env.MAPS_DATA_DIR) : path.join(ROOT, "data"));
const THUMBDIR = () => (process.env.CF_THUMBS_DIR ? path.resolve(process.env.CF_THUMBS_DIR) : path.join(DATA(), "cf-maps/thumbs3d"));
const CACHEDIR = () => path.join(DATA(), "cf-maps/mosaic-cache");

const BG = [14, 18, 26];                            // dark ground behind the continent
const BORDER = [24, 30, 42];                        // clear parcel outline ("show borders")
const GREY = [72, 78, 88], GREY2 = [82, 88, 98];    // ungenerated fill (slight checker so shapes read)

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

// newest thumb mtime for the zone's parcels → cache key (so a re-shot thumb invalidates the mosaic).
function thumbsFingerprint() {
  const dir = THUMBDIR();
  let latest = 0, n = 0;
  try { for (const f of readdirSync(dir)) { if (!f.endsWith(".png")) continue; n++; const m = statSync(path.join(dir, f)).mtimeMs; if (m > latest) latest = m; } } catch { /* none */ }
  return `${n}-${Math.round(latest)}`;
}

// Bake (or read cache). opts: { zone, ppu, maxdim, force }. Returns { png:Buffer, meta }.
export function bakeMosaic({ zone = "EDU", ppu = 12, maxdim = 2200, force = false } = {}) {
  zone = String(zone).toUpperCase();
  const fp = thumbsFingerprint();
  const cacheStem = path.join(CACHEDIR(), `${zone}.p${ppu}.m${maxdim}.${fp}`);
  if (!force && existsSync(`${cacheStem}.png`) && existsSync(`${cacheStem}.json`)) {
    return { png: readFileSync(`${cacheStem}.png`), meta: JSON.parse(readFileSync(`${cacheStem}.json`, "utf8")), cached: true };
  }

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

  let ok = 0, hasThumb = 0, greyN = 0;
  for (const s of singles) {
    const zpoly = svgPathToPolygon(s.svgPath);
    if (!zpoly || zpoly.length < 3) continue;
    const cpoly = zpoly.map(([zx, zy]) => toCanvas(zx, zy));
    let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
    for (const [x, y] of cpoly) { if (x < px0) px0 = x; if (y < py0) py0 = y; if (x > px1) px1 = x; if (y > py1) py1 = y; }
    const pw = Math.max(1, px1 - px0), ph = Math.max(1, py1 - py0);

    const tfid = thumbFileId(s); const th = tfid ? loadThumb(tfid) : null;
    let sample;
    if (th) { hasThumb++; sample = (fx, fy) => { const tx = Math.min(th.w - 1, Math.max(0, (fx * th.w) | 0)), ty = Math.min(th.h - 1, Math.max(0, (fy * th.h) | 0)), i = (ty * th.w + tx) * 4; return th.rgba[i + 3] < 100 ? null : [th.rgba[i], th.rgba[i + 1], th.rgba[i + 2]]; }; }
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
    for (let e = 0; e < cpoly.length; e++) { const a = cpoly[e], b = cpoly[(e + 1) % cpoly.length]; line(a[0], a[1], b[0], b[1], BORDER); }
  }

  const png = encodePNG(W, H, Buffer.from(px));
  const meta = { zone, world: { minX, minY, maxX, maxY }, flipY: false, pxPerUnit: PPU, w: W, h: H, leaves: ok, thumbed: hasThumb, grey: greyN, fingerprint: fp };
  try { mkdirSync(CACHEDIR(), { recursive: true }); writeFileSync(`${cacheStem}.png`, png); writeFileSync(`${cacheStem}.json`, JSON.stringify(meta)); } catch { /* cache best-effort */ }
  return { png, meta, cached: false };
}
