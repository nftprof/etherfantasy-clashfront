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
import { svgPathToPolygon, dataRoot, zoneBiomeFamily, worldParcel, loadWorldField } from "./worldfield.js";
import { buildHeightfield, hillshadeBuf } from "./heightfield.js";
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
// WILDERNESS fill for the continuous DEFAULT LAND between parcels (owner 2026-08-27: the world is one
// continuous land parcelled out, not islands on black). Seeded coarse forest clumps over the biome
// open colour, so the unclaimed land reads as real wilderness — "clusters of trees, roads yet to build".
const darker = (c, f) => [(c[0] * f) | 0, (c[1] * f) | 0, (c[2] * f) | 0];
const _hash = (a, b) => (((a * 73856093) ^ (b * 19349663) ^ ((a * b) * 83492791)) >>> 0);
// ORGANIC wilderness (not an axis-aligned checker — owner dislikes visible patterns): SKEWED, multi-
// scale forest clumps in three subtle tones over the biome open colour, so unclaimed land reads as
// natural woods/meadow rather than a grid.
function wildernessFn(LC) {
  const FOREST = darker(LC, 0.74), MEADOW = darker(LC, 1.08);
  return (x, y) => {
    const sx = x + ((y * 0.5) | 0), sy = y - ((x * 0.4) | 0);            // shear → break the grid axis
    const big = _hash((sx / 27) | 0, (sy / 23) | 0) % 100;              // large clumps
    const sm = _hash((sx / 9) | 0, (sy / 11) | 0) % 100;               // finer mottling within
    const base = big < 30 ? FOREST : big < 44 ? (sm < 50 ? FOREST : LC) : big > 88 ? MEADOW : (sm < 22 ? FOREST : LC);
    return speckle(base, x, y);
  };
}

// ── AERIAL MACRO NETWORK (owner 2026-08-27: "look like an aerial map from a plane… a full real
// world at this stage"). The authored feature field (data/world-terrain/<ZONE>.json — rivers, roads
// tiered highway/secondary/local, castles, capital POIs) is BAKED INTO the aerial image so the
// continent reads as a settled world seen from above: rivers flow as real water, the road network
// threads city→city→river, and capitals/castles read as built-up settlement footprints. Previously
// these lived ONLY as a thin dashed client overlay (drawFeatures) that most viewers never turned on.
// Road topology is already a capital-hub network (measured: every castle/capital abuts a road
// endpoint — "all roads lead to Rome"); this step just makes it VISIBLE on the aerial surface.
const RIVER_RGB = [58, 96, 150], RIVER_BANK = [70, 112, 96], MAGMA_RGB = [214, 96, 34];
const ROAD_FILL = [176, 156, 116], ROAD_CASE = [96, 82, 60];      // pale path + dark casing = aerial road
const URBAN = [150, 140, 126];                                     // rooftops/streets, warm grey
// settlement footprint radius (zone-units) by fortification kind — a TOWN patch, never a whole board
// (canon 22: a castle is a POI marker on a terrain estate, not a 100-parcel sprawl).
const SETTLE_R = { PALACE: 3.6, GRAND_ACADEMY: 3.6, CASTLE: 2.6, KEEP: 1.7, MANOR: 1.4, GATE: 1.0, PORT: 2.8, TOWN: 2.2 };
// stamp a filled disc (radius px) at canvas (cx,cy) using colour-fn cf(x,y) → the aerial features draw
// as rounded continuous strokes (walk each polyline segment stamping discs at sub-pixel steps).
function discStamp(px, W, H, cx, cy, rad, cf, land) {
  const r = Math.max(0.5, rad), x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(W - 1, (cx + r + 1) | 0);
  const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(H - 1, (cy + r + 1) | 0), r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > r2) continue;
    const idx = y * W + x; if (land && !land[idx]) continue;      // never paint over open ocean
    const c = cf(x, y); if (!c) continue; const i = idx * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
}
function strokePoly(px, W, H, pts, toCanvas, radPx, cf, land) {
  if (!pts || pts.length < 2) return;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, ay] = toCanvas(pts[s][0], pts[s][1]), [bx, by] = toCanvas(pts[s + 1][0], pts[s + 1][1]);
    const len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len / Math.max(0.6, radPx * 0.5)));
    for (let k = 0; k <= steps; k++) { const t = k / steps; discStamp(px, W, H, ax + (bx - ax) * t, ay + (by - ay) * t, radPx, cf, land); }
  }
}
// Bake the macro network onto an already-painted terrain buffer. Order = settlements (under) →
// rivers (water, bridged by roads) → road casings → road fills (on top) so roads cross water/cities.
export function bakeFeatures(px, W, H, toCanvas, PPU, zone, land) {
  let field; try { field = loadWorldField(zone); } catch { return { rivers: 0, roads: 0, settles: 0 }; }
  if (!field) return { rivers: 0, roads: 0, settles: 0 };
  const solid = (c) => () => c;
  // 1) settlement footprints — a textured urban patch around each castle/capital/town POI. An ORGANIC
  // town from the air, NOT a checkerboard (owner dislikes visible patterns): irregular building blocks
  // in muted tile/thatch/slate cut by SCATTERED lanes & courtyards, block colour from a coarse hash so
  // block SIZES and tones vary. Deterministic per-pixel (no RNG in the bake).
  let settles = 0;
  const ROOF = [[140, 100, 84], [128, 114, 96], [122, 118, 116], [116, 104, 92], [146, 118, 92]]; // tile/thatch/slate/mud/clay
  const urbanFn = (bx, by) => (x, y) => {
    const sx = x + ((y * 0.35) | 0), sy = y - ((x * 0.28) | 0);                       // shear → break the grid axis
    const bxi = (sx / 6) | 0, byi = (sy / 7) | 0, hb = _hash(bxi, byi);               // ~6-7px blocks, jittered
    if ((hb % 100) < 15) return [100, 92, 80];                                        // scattered lanes / courtyards
    const roof = ROOF[hb % ROOF.length], j = ((_hash(x, y) % 11) - 5);
    return [Math.max(40, roof[0] + j), Math.max(40, roof[1] + j), Math.max(40, roof[2] + j)];
  };
  for (const place of [...(field.castles || []), ...(field.pois || [])]) {
    if (!Array.isArray(place.at)) continue;
    const R = (SETTLE_R[place.kind] || SETTLE_R.TOWN) * PPU, [cx, cy] = toCanvas(place.at[0], place.at[1]);
    discStamp(px, W, H, cx, cy, R, urbanFn(cx, cy), land); settles++;
  }
  // 2) rivers — real flowing water at honest width (naval-ready). Bank tint first, then water core.
  let rivers = 0;
  for (const r of field.rivers || []) {
    if (r.fill) continue;                                       // lakes/calderas are baked as parcel water, not a line
    const wu = Math.max(0.6, r.width || 1), wpx = wu * PPU * 0.5, water = r.magma ? MAGMA_RGB : RIVER_RGB;
    strokePoly(px, W, H, r.pts, toCanvas, wpx + PPU * 0.35, solid(r.magma ? [150, 66, 26] : RIVER_BANK), land);
    strokePoly(px, W, H, r.pts, toCanvas, wpx, solid(water), land); rivers++;
  }
  // 3) roads — tiered widths, dark casing under a pale fill (the classic aerial-road read). Radii in
  // zone-units (owner 2026-08-28: a highway was ~1u ≈ a whole SINGLE parcel — way too fat; a real road
  // is a fraction of a plot). Highway ≈ 0.18u wide-ish, secondary/local progressively thinner.
  const RAD = { highway: 0.18, secondary: 0.11, local: 0.07 };
  let roads = 0;
  for (const rd of field.roads || []) {
    const wpx = (RAD[rd.tier] || RAD.highway) * PPU; strokePoly(px, W, H, rd.pts, toCanvas, wpx + 1.0, solid(ROAD_CASE), land);
  }
  for (const rd of field.roads || []) {
    const wpx = (RAD[rd.tier] || RAD.highway) * PPU; strokePoly(px, W, H, rd.pts, toCanvas, wpx, solid(ROAD_FILL), land); roads++;
  }
  return { rivers, roads, settles };
}

const _thumbCache = new Map();
function loadThumb(id) {
  if (_thumbCache.has(id)) return _thumbCache.get(id);
  let t = null;
  try { const f = path.join(THUMBDIR(), `${id}.png`); if (existsSync(f)) t = decodePNG(readFileSync(f)); } catch { t = null; }
  if (t && !t.avg) t.avg = avgOpaque(t);   // cache the average opaque colour for margin-fill
  _thumbCache.set(id, t); return t;
}
// average colour of a thumb's OPAQUE pixels — used to fill the inscribed-arena margin so a parcel
// reads uniform to its polygon edge (owner 2026-08-27: no dark-forest bands between parcels).
function avgOpaque(t) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < t.rgba.length; i += 4) if (t.rgba[i + 3] >= 100) { r += t.rgba[i]; g += t.rgba[i + 1]; b += t.rgba[i + 2]; n++; }
  return n ? [(r / n) | 0, (g / n) | 0, (b / n) | 0] : [86, 110, 74];
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
export function loadLeaves(zone) {
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
export function bakeMosaic({ zone = "EDU", ppu = 20, maxdim = 4096, force = false, mode = "thumb", fillRadius = 3, hillshadeOn = true } = {}) {
  zone = String(zone).toUpperCase();
  mode = mode === "planner" ? "planner" : "thumb";
  const { n: nThumbs, fp } = thumbsStat();
  // No thumbs on this host (e.g. the live box) → serve the committed baked mosaic if we shipped one.
  if (!force && nThumbs === 0) { const c = committedMosaic(zone, mode); if (c) return { png: c.png, meta: c.meta, cached: true, committed: true }; }
  let fillN = 0;
  const cacheStem = path.join(CACHEDIR(), `${zone}.${mode}.p${ppu}.m${maxdim}.f${fillRadius}.aerial2${hillshadeOn ? ".hs1" : ""}.${fp}`);
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
  const mask = new Uint8Array(W * H);   // 1 where a parcel painted — the land-coverage mask for the fill
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
    // OVERSCAN the inscribed arena ~1.3× so its terrain reaches the parcel edges (no margin band); any
    // pixel STILL transparent (the polygon corners) fills with the parcel's own NATURAL generated
    // terrain — decorative, non-playable, and not a flat repeating wedge (owner 2026-08-27).
    if (th) { hasThumb++; const O = 1.3, gen = genSampler(s), marg = th.avg || LC; sample = (fx, fy, x, y) => { const sfx = 0.5 + (fx - 0.5) / O, sfy = 0.5 + (fy - 0.5) / O, tx = Math.min(th.w - 1, Math.max(0, (sfx * th.w) | 0)), ty = Math.min(th.h - 1, Math.max(0, (sfy * th.h) | 0)), i = (ty * th.w + tx) * 4; return th.rgba[i + 3] < 100 ? (gen ? gen(fx, fy) : speckle(marg, x, y)) : [th.rgba[i], th.rgba[i + 1], th.rgba[i + 2]]; }; }
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
        for (let x = xL; x <= xR; x++) { const c = sample((x - px0) / pw, (y - py0) / ph, x, y) || GREY; put(x, y, c[0], c[1], c[2]); mask[y * W + x] = 1; }
      }
    }
    // NO baked border stroke: a 1px raster line upscales into a thick black SEAM on zoom and makes
    // perfectly-tessellating parcels (measured polygon gap = 0) read as gaps / non-continuous land
    // (owner 2026-08-26). Parcel outlines, if wanted, belong on the client as a crisp vector overlay.
  }

  // CONTINUOUS DEFAULT LAND (owner 2026-08-27): the world is ONE continuous land, not islands on black.
  // Non-parcel space that the land ENCLOSES is intentional WILD area — decorative, NON-TRAVERSIBLE
  // backdrop (no battle ever plays off a parcel), so we fill it ourselves as wilderness to connect the
  // world; only the true OUTER SEA / beyond-the-frontier stays dark. Two O(W·H) passes:
  //   (a) flood the sea inward from every border BG pixel → the EXTERIOR set (open water + frontier);
  //       any uncovered pixel the sea can't reach is land-enclosed interior ⇒ fill it.
  //   (b) chamfer distance-to-parcel → also fill a thin coastal band (`fillRadius`) on the exterior
  //       side, so the coastline reads as land meeting water rather than a razor-jagged parcel edge.
  // (a) exterior flood fill (4-connected through mask==0), seeded from the image border → the open sea.
  const exterior = new Uint8Array(W * H), stack = new Int32Array(W * H);
  let sp = 0;
  { const seed = (i) => { if (!mask[i] && !exterior[i]) { exterior[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
    while (sp > 0) { const i = stack[--sp], x = i % W, y = (i / W) | 0;
      if (x > 0) seed(i - 1); if (x < W - 1) seed(i + 1); if (y > 0) seed(i - W); if (y < H - 1) seed(i + W); } }
  // (b) distance-to-parcel (chamfer) for the coastal band + the frontier rim.
  const D = Math.max(0, fillRadius) * PPU, INF = 1e9, dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = mask[i] ? 0 : INF;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (dist[i] === 0) continue; let d = dist[i];
    if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (y > 0) d = Math.min(d, dist[i - W] + 1);
    if (x > 0 && y > 0) d = Math.min(d, dist[i - W - 1] + 1.4142); if (x < W - 1 && y > 0) d = Math.min(d, dist[i - W + 1] + 1.4142); dist[i] = d; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let d = dist[i];
    if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (y < H - 1) d = Math.min(d, dist[i + W] + 1);
    if (x < W - 1 && y < H - 1) d = Math.min(d, dist[i + W + 1] + 1.4142); if (x > 0 && y < H - 1) d = Math.min(d, dist[i + W - 1] + 1.4142); dist[i] = d; }
  {
    const wild = wildernessFn(LC);
    // SHALLOWS (owner 2026-08-28): a lighter water band hugging the coast that fades to deep sea — reads
    // as real shoreline shallows/reef from the air. Exterior pixels just past the coastal land band.
    const SH_OUT = 5 * PPU, SHALLOW = [74, 116, 142], DEEP = [16, 22, 34];
    let filled = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, p4 = i * 4;
      if (mask[i]) continue;
      if (exterior[i] && dist[i] > D) {                        // OPEN OCEAN: shallows near shore → deep beyond
        if (dist[i] <= SH_OUT) { const t = Math.floor((dist[i] - D) / (SH_OUT - D) * 4) / 4; px[p4] = SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * t; px[p4 + 1] = SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * t; px[p4 + 2] = SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * t; }   // quantized to 4 bands (keeps PNG small)
        continue;
      }
      const c = wild(x, y); px[p4] = c[0]; px[p4 + 1] = c[1]; px[p4 + 2] = c[2]; filled++; }
    fillN = filled;
  }

  // LAND MASK — parcels + enclosed wild interior + the thin coastal band. Everything else is OPEN OCEAN.
  // Features (roads/rivers/towns) and mountains render ONLY on land: authored road/river polylines run to
  // the zone bbox, so WITHOUT this they'd draw dangling across open sea (owner 2026-08-28: "roads and
  // river over the ocean for no reason"). `landReach` lets a road/coast meet the very shore, no further.
  const landReach = Math.max(D, 2 * PPU);
  const land = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) land[i] = (!exterior[i] || dist[i] <= landReach) ? 1 : 0;

  // ELEVATION (owner 2026-08-28): a per-pixel elevation buffer, CLIPPED to the land, drives the hillshade
  // so the world reads as real 3D terrain — parcels near-flat, the non-playable wild land rising to peaks
  // / sinking to river valleys — while OPEN OCEAN stays flat sea (no mountain floats over water). Plus a
  // FRONTIER RIM: a rocky coastal highland just outside the shore that FRAMES the continent ("wall ridges
  // outside the map lands") instead of the land simply ending in water.
  let hf = null;
  if (hillshadeOn) {
    try {
      hf = buildHeightfield(zone, { su: 1 });
      const elev = new Float32Array(W * H);
      const RIM_OUTER = 6 * PPU, RIM_PEAK = 0.6;                 // coastal rim: reach (px) + rocky height (< snow)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (exterior[i] && dist[i] > RIM_OUTER) { elev[i] = 0; continue; }   // open ocean → flat sea
        const zx = minX + x / PPU, zy = minY + y / PPU, base = hf.sample(zx, zy);
        if (exterior[i]) {                                      // coastal frontier: rocky rim, highest at the shore, sloping into the sea
          elev[i] = RIM_PEAK * Math.max(0, 1 - dist[i] / RIM_OUTER);
        } else elev[i] = base;                                  // land (parcel / wild interior) rides the feature relief
      }
      hillshadeBuf(px, W, H, elev, Math.max(1, Math.round(PPU)));
    } catch { hf = null; }
  }

  // AERIAL MACRO NETWORK — bake rivers/roads/settlements on top (clipped to LAND). Last, so features sit
  // above terrain + wilderness fill (owner 2026-08-27).
  const feat = bakeFeatures(px, W, H, toCanvas, PPU, zone, land);

  // POSTERIZE (drop 2 low bits) — hillshade makes every pixel unique; this keeps the committed PNG small
  // (visually imperceptible on a map). Alpha untouched.
  for (let i = 0; i < px.length; i += 4) { px[i] &= 0xFC; px[i + 1] &= 0xFC; px[i + 2] &= 0xFC; }

  const png = encodePNG(W, H, Buffer.from(px));
  const meta = { zone, mode, world: { minX, minY, maxX, maxY }, flipY: false, pxPerUnit: PPU, w: W, h: H, leaves: ok, thumbed: hasThumb, estates: estateN, grey: greyN, fill: fillN, features: feat, fingerprint: fp };
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
