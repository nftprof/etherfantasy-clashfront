/**
 * Terrain base layer v3 — continuous procedural landscape (docs/map-engine/01
 * §2b–2d; RTK14 benchmark: ONE lit landscape, the parcel grid is a thin overlay
 * that terrain ignores; the per-parcel texture "quilt" of v1 is gone).
 *
 * Ground (deterministic, seeded, world-coords):
 *   heightfield  — masks (landmass plate / parcel cluster) → chamfer distance
 *                  transforms → multi-octave value noise. Three bands:
 *                  SEA (outside the plate, smooth coast falloff), LOWLAND (the
 *                  habitable parcel zone — mild relief only), MOUNTAINS (the
 *                  non-parcel barrens are STRUCTURED RANGES, not texture —
 *                  impassability reads as geography).
 *   ranges (v3)  — the barren strips carry medial-spine mountain chains: the
 *                  parcel distance field is blurred and its gradient collapses
 *                  on the strip centerline (|∇sd|→0 = the medial axis), which
 *                  becomes a continuous CRESTLINE; massif height scales with
 *                  strip width (sd), low-freq noise modulates summits vs
 *                  passes along the chain, and contour-parallel foothill ranks
 *                  ripple the flanks (triangle wave of sd). Crests climb into
 *                  a bare-rock → snow-dust band well above the old hills;
 *                  the transition into parcel lowland stays smooth.
 *   hypsometry   — muted palette: deep water → shallow → sand shore → olive
 *                  plains (moisture-varied) → tan foothills → brown rock →
 *                  bare gray → pale snow-dust crests. Forests darken the
 *                  ground as mottled density patches (baked into the raster).
 *   hillshading  — per-cell lambert from the height gradient, light from NW,
 *                  computed on a fixed 1280-long-side world grid and
 *                  smooth-scaled into the buckets (slopes MUST read).
 *   props        — LOD'd trees + rocks in seeded organic groves (forest
 *                  density field drives both the baked ground tint and the
 *                  scatter). Far zoom: NO sprites — density patches only.
 *                  Mid zoom (w1): soft canopy-mass splats. Close zoom (vb):
 *                  full sprites — multi-lobe broadleaf canopies with hue
 *                  jitter, layered conifer fronds, soft base-hugging ellipse
 *                  shadows. Wild parcels keep a few trees (vanish when
 *                  settled), same LOD rules.
 *
 * Parcel overlay (the grid feel): thin translucent borders everywhere;
 * ownership = translucent color wash (strongest on the zoomed-out bucket —
 * empires must read from orbit) + owner-colored border; prestige (prosperity
 * ≥ 70 / NPC capital) = gold border glow; monster garrisons = dark corrupted
 * ground stain (the red eye stays on top, drawn live). Floor textures survive
 * ONLY as faint low-alpha accents (grass on wild, desert toward the frontier,
 * stone on owned plazas). grave_01/lobby_01 are sprite atlases — never floors.
 *
 * Perf: flat band colors render FIRST; the heightfield generates in idle
 * chunks (~9 ms budget), then buckets rebuild once. Same bucket/blit contract
 * as v1: the static base bakes into ≤3 offscreen world-space canvases, a frame
 * is ONE drawImage; ownership diffs are patched in place (terrain re-blit
 * clipped to the parcel + wash/border). Nothing terrain-related runs per frame.
 */
import { pointInPoly, rgba } from './util.js';

const VARIANTS = {
  grass: ['grass_01', 'grass_02'],
  desert: ['desert_01', 'desert_02', 'desert_03', 'desert_04', 'desert_05'],
  stone: ['stone_01', 'stone_02', 'stone_03', 'stone_04'],
};
const ALL_TEXTURES = [...VARIANTS.grass, ...VARIANTS.desert, ...VARIANTS.stone];

/** Flat fallbacks so the map renders before the heightfield/textures arrive. */
const FLAT = { land: '#3d4832', ocean: '#0d1e2c' };

const TILE_WU = 0.24;             // world units per accent-texture repeat
const OCEAN_TILE_WU = 9;          // ocean noise is a large, low-contrast tile
const PLATE_PAD = 2.6;            // world buckets/field extend past the bbox (sea room)
const MAX_SIDE = 4096;            // long-side budget per offscreen bucket
const W0_SIDE = 1536;             // zoomed-out whole-world bucket side
const FIELD_SIDE = 1536;          // heightfield grid long side (smooth-scaled up)
const PRESTIGE_PROSPERITY = 70;   // docs: high-prosperity gold accent
const FRONTIER = 0.65;            // dist/maxDist ≥ this → desert accent band
const PATCH_MAX = 48;             // bigger ownership diffs → full bucket rebuild

// ── heightfield tuning (world units / e-units) ──────────────────────────────
const COAST_FALL = 1.15;          // shore → deep water over this distance
const HILL_START = 0.14;          // relief starts this far from any parcel
const HILL_FULL = 0.90;           // …and reaches full range amplitude here
const SPINE_BLUR = 0.45;          // parcelD blur radius (wu) — medial-axis detector
const RANGE_REF = 0.85;           // strip half-width (wu) reaching full massif height
const E_MAX = 1.25;               // elevation clamp (snow-dust crest ceiling)
const Z_SCALE = 1.1;              // e-gradient → slope steepness for shading
const LX = -0.551, LY = -0.551, LZ = 0.627; // light from NW (normalized)
const PROP_SPACING = 0.19;        // scatter-grid cell (wu)
const SPLAT_PPU = 80;             // below: forests are baked density tint only
const SPRITE_PPU = 200;           // below: canopy-mass splats; above: full sprites

function fnv(id) {
  let h = 2166136261;
  for (const c of id) h = (h ^ c.charCodeAt(0)) * 16777619 >>> 0;
  return h;
}
/** Tiny seeded PRNG (LCG) — parcel trees / ocean tile. Deterministic. */
function lcg(seed) {
  let s = fnv(seed);
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216;
}
const pick = (arr, h) => arr[(h >>> 10) % arr.length];

/** Integer-lattice hash → [0,1). Deterministic, no state. */
function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise on the unit lattice. */
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, seed, oct) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x * f, y * f, seed + o);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}
/** Ridged fbm — sharp crests for the hill band. */
function ridged(x, y, seed, oct) {
  let s = 0, amp = 0.55, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const r = 1 - Math.abs(2 * vnoise(x * f, y * f, seed + o) - 1);
    s += amp * r * r;
    norm += amp; amp *= 0.5; f *= 2.1;
  }
  return s / norm;
}
function sstep(v, a, b) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const clamp255 = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
const frac = (v) => v - Math.floor(v);

/**
 * Forest density [0,1] at a world point — ONE field drives both the baked
 * ground mottling and the grove scatter, so patches and sprites always agree.
 * Grove archipelago (low-freq blobs) × internal clearings (high-freq gaps),
 * fading in off the beach and thinning out on high slopes; city zone clean.
 */
function forestDensity(wx, wy, ev, pd) {
  if (ev < 0.055 || ev > 0.72 || pd < 0.05) return 0;
  const grove = fbm(wx * 0.85, wy * 0.85, 57, 2);
  const gaps = fbm(wx * 3.0, wy * 3.0, 61, 2);
  return sstep(grove, 0.46, 0.68) * (0.40 + 0.60 * sstep(gaps, 0.30, 0.60))
    * sstep(ev, 0.055, 0.10) * (1 - sstep(ev, 0.50, 0.72)); // conifers climb the flanks
}

export function createTerrain(store, onUpdate) {
  const patterns = new Map();     // texture name → world-anchored CanvasPattern
  let oceanPattern = null;
  let texReady = false;

  let paths = null, bboxes = null, worldBBox = null, longSideWu = 1;
  const wildTex = new Map();      // parcelId → grass/desert accent variant (seeded)
  const stoneTex = new Map();     // parcelId → stone accent variant (seeded)
  const parcelTrees = new Map();  // parcelId → props (drawn only while WILD)
  let platePath = null;           // landmass silhouette (Path2D, world coords)
  let allParcelsPath = null;      // union of parcel outlines (mask rasterization)
  let lastSig = null;             // parcelId → ownership signature
  let npcCapitals = new Set();    // strongest holding per NPC kingdom → gold accent
  let stateDirty = false;
  let w0 = null, w1 = null, vb = null; // buckets {canvas,ctx,ppu,x0,y0,x1,y1,wWu,hWu}

  // heightfield state (built async in idle chunks after prepare())
  let field = null;               // {canvas, x0, y0, w, h} — world-extent RGBA raster
  let fieldReady = false;
  let props = [];                 // global scatter (trees/rocks OUTSIDE parcels)
  let gen = 0;                    // generation token — abandons stale builds

  const w0ppu = () => W0_SIDE / longSideWu;
  const w1ppu = () => MAX_SIDE / longSideWu;
  function invalidateAll() { w0 = w1 = vb = null; }

  // ── texture loading (async; accents only — one repaint when done) ──────────
  function loadTextures(onReady) {
    const jobs = ALL_TEXTURES.map((name) => new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ name, img });
      img.onerror = () => res(null); // missing texture → that accent is skipped
      img.src = `textures/floors/${name}.png`;
    }));
    Promise.all(jobs).then((loaded) => {
      const pctx = document.createElement('canvas').getContext('2d');
      const anchor = (pat, wu, px) => {
        pat.setTransform(new DOMMatrix([wu / px, 0, 0, wu / px, 0, 0]));
        return pat;
      };
      for (const it of loaded) {
        if (!it) continue;
        patterns.set(it.name, anchor(pctx.createPattern(it.img, 'repeat'), TILE_WU, it.img.width));
      }
      oceanPattern = anchor(pctx.createPattern(buildOceanTile(), 'repeat'), OCEAN_TILE_WU, 256);
      texReady = true;
      invalidateAll();
      onReady?.();
    });
  }

  /** Procedural seamless deep-water tile, palette-matched to the hypsometric sea. */
  function buildOceanTile() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const t = c.getContext('2d');
    const rnd = lcg('cf-ocean');
    t.fillStyle = '#0d1e2c';
    t.fillRect(0, 0, S, S);
    const wrap = (draw) => { // 3×3 stamp so every primitive tiles seamlessly
      for (let dx = -S; dx <= S; dx += S) for (let dy = -S; dy <= S; dy += S) draw(dx, dy);
    };
    for (let i = 0; i < 6; i++) { // soft depth blobs — big and faint so tiling never reads
      const x = rnd() * S, y = rnd() * S, r = 70 + rnd() * 90, deep = rnd() < 0.5;
      wrap((dx, dy) => {
        const g = t.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, deep ? 'rgba(7,15,24,0.24)' : 'rgba(36,74,98,0.13)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        t.fillStyle = g;
        t.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      });
    }
    t.lineCap = 'round';
    for (let i = 0; i < 90; i++) { // wave dashes: subtle light banding
      const x = rnd() * S, y = rnd() * S, len = 8 + rnd() * 22, bow = 2 + rnd() * 3;
      t.strokeStyle = `rgba(126,174,206,${0.03 + rnd() * 0.04})`;
      t.lineWidth = 1 + rnd();
      wrap((dx, dy) => {
        t.beginPath();
        t.moveTo(x + dx, y + dy);
        t.quadraticCurveTo(x + len / 2 + dx, y - bow + dy, x + len + dx, y + dy);
        t.stroke();
      });
    }
    return c;
  }

  // ── geometry prep (once per world) ──────────────────────────────────────────
  function prepare(geo) {
    paths = geo.paths;
    bboxes = geo.bboxes;
    const b = geo.worldBBox;
    worldBBox = [b[0] - PLATE_PAD, b[1] - PLATE_PAD, b[2] + PLATE_PAD, b[3] + PLATE_PAD];
    longSideWu = Math.max(worldBBox[2] - worldBBox[0], worldBBox[3] - worldBBox[1], 1e-6);
    let cx = 0, cy = 0, n = 0;
    for (const p of store.parcels.values()) { cx += p.center[0]; cy += p.center[1]; n++; }
    cx /= Math.max(1, n); cy /= Math.max(1, n);
    let maxD = 1e-9;
    for (const p of store.parcels.values()) maxD = Math.max(maxD, Math.hypot(p.center[0] - cx, p.center[1] - cy));
    allParcelsPath = new Path2D();
    for (const p of store.parcels.values()) {
      const h = fnv(p.id);
      const dn = Math.hypot(p.center[0] - cx, p.center[1] - cy) / maxD;
      const badlands = (h % 997) / 997 < (dn - (FRONTIER - 0.15)) / 0.15; // outer ring → desert accent
      wildTex.set(p.id, badlands ? pick(VARIANTS.desert, h) : pick(VARIANTS.grass, h));
      stoneTex.set(p.id, pick(VARIANTS.stone, h));
      allParcelsPath.addPath(paths.get(p.id));
      parcelTrees.set(p.id, makeParcelTrees(p));
    }
    platePath = buildPlate(cx, cy);
    lastSig = null;
    fieldReady = false;
    field = null;
    props = [];
    invalidateAll();
    buildField();
  }

  /** 2–4 small seeded trees per parcel — drawn only while the parcel is wild. */
  function makeParcelTrees(p) {
    const rnd = lcg(p.id + ':trees');
    const [ax, ay, bx, by] = [
      Math.min(...p.polygon.map((v) => v[0])), Math.min(...p.polygon.map((v) => v[1])),
      Math.max(...p.polygon.map((v) => v[0])), Math.max(...p.polygon.map((v) => v[1])),
    ];
    const out = [];
    const want = 2 + Math.floor(rnd() * 3);
    for (let tries = 0; tries < 24 && out.length < want; tries++) {
      const x = ax + rnd() * (bx - ax), y = ay + rnd() * (by - ay);
      if (!pointInPoly(p.polygon, x, y)) continue;
      const h = rnd();
      out.push({ x, y, r: 0.026 + rnd() * 0.020, k: h < 0.55 ? 0 : h < 0.85 ? 2 : 1, h: rnd() });
    }
    return out;
  }

  /** Landmass silhouette: noised convex hull of all parcel vertices. */
  function buildPlate(ccx, ccy) {
    const pts = [];
    for (const p of store.parcels.values()) for (const v of p.polygon) pts.push(v);
    if (pts.length < 3) return null;
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
    // resample the hull perimeter evenly, push outward with organic seeded noise
    const per = [];
    let total = 0;
    for (let i = 0; i < hull.length; i++) {
      per.push(total);
      const a = hull[i], b = hull[(i + 1) % hull.length];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const rnd = lcg('cf-barrens');
    const M = 56, q = [];
    for (let i = 0; i < M; i++) {
      const d = (i / M) * total;
      let j = hull.length - 1;
      while (j > 0 && per[j] > d) j--;
      const a = hull[j], b = hull[(j + 1) % hull.length];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const k = (d - per[j]) / seg;
      const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
      const nl = Math.hypot(x - ccx, y - ccy) || 1;
      const off = 0.9 + 0.5 * Math.sin(i * 2.39) + rnd() * 0.7; // 0.4–2.1 wu of hill country
      q.push([x + ((x - ccx) / nl) * off, y + ((y - ccy) / nl) * off]);
    }
    const path = new Path2D();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    path.moveTo(...mid(q[M - 1], q[0]));
    for (let i = 0; i < M; i++) path.quadraticCurveTo(q[i][0], q[i][1], ...mid(q[i], q[(i + 1) % M]));
    path.closePath();
    return path;
  }

  // ── heightfield build (idle-chunked; flat colors render until done) ─────────
  function buildField() {
    if (!platePath) return;
    const myGen = ++gen;
    const x0 = worldBBox[0], y0 = worldBBox[1];
    const wuW = worldBBox[2] - x0, wuH = worldBBox[3] - y0;
    const gw = wuW >= wuH ? FIELD_SIDE : Math.round(FIELD_SIDE * wuW / wuH);
    const cell = wuW / gw;                       // square cells
    const gh = Math.ceil(wuH / cell);
    const N = gw * gh;

    // masks via canvas rasterization (GPU) — landmass plate + parcel cluster
    const mc = document.createElement('canvas');
    mc.width = gw; mc.height = gh;
    const mx = mc.getContext('2d', { willReadFrequently: true });
    const rasterize = (path) => {
      mx.setTransform(1, 0, 0, 1, 0, 0);
      mx.clearRect(0, 0, gw, gh);
      mx.setTransform(1 / cell, 0, 0, 1 / cell, -x0 / cell, -y0 / cell);
      mx.fillStyle = '#fff';
      mx.fill(path);
      const px = mx.getImageData(0, 0, gw, gh).data;
      const m = new Uint8Array(N);
      for (let i = 0; i < N; i++) m[i] = px[i * 4 + 3] > 127 ? 1 : 0;
      return m;
    };
    const land = rasterize(platePath);
    const parcelM = rasterize(allParcelsPath);

    // chamfer distance transforms (two-pass 3/4, result in cell units)
    const chamfer = (isSeed) => {
      const d = new Float32Array(N).fill(1e9);
      for (let i = 0; i < N; i++) if (isSeed(i)) d[i] = 0;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        let v = d[i];
        if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
        if (y > 0) {
          if (d[i - gw] + 3 < v) v = d[i - gw] + 3;
          if (x > 0 && d[i - gw - 1] + 4 < v) v = d[i - gw - 1] + 4;
          if (x < gw - 1 && d[i - gw + 1] + 4 < v) v = d[i - gw + 1] + 4;
        }
        d[i] = v;
      }
      for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) {
        const i = y * gw + x;
        let v = d[i];
        if (x < gw - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
        if (y < gh - 1) {
          if (d[i + gw] + 3 < v) v = d[i + gw] + 3;
          if (x < gw - 1 && d[i + gw + 1] + 4 < v) v = d[i + gw + 1] + 4;
          if (x > 0 && d[i + gw - 1] + 4 < v) v = d[i + gw - 1] + 4;
        }
        d[i] = v;
      }
      for (let i = 0; i < N; i++) d[i] = (d[i] / 3) * cell; // → world units
      return d;
    };
    const seaD = chamfer((i) => land[i] === 1);     // sea cells: distance to coast
    const landIn = chamfer((i) => land[i] === 0);   // land cells: distance inland
    const parcelD = chamfer((i) => parcelM[i] === 1); // distance to the city zone

    const e = new Float32Array(N);
    const moist = new Uint8Array(N);
    const shadeA = new Float32Array(N).fill(1);
    const img = new ImageData(gw, gh);

    // blurred parcel distance — the range "massif body" field. Its gradient
    // magnitude collapses to ~0 on the strip centerline (medial axis) → that
    // locus becomes the continuous crestline of each mountain chain.
    const R = Math.max(2, Math.round(SPINE_BLUR / cell));
    const tmp = new Float32Array(N);
    const sd = new Float32Array(N);
    const blurHRows = (r0, r1) => {
      for (let y = r0; y < r1; y++) {
        const yR = y * gw;
        for (let x = 0; x < gw; x++) {
          let s = 0;
          for (let k = -R; k <= R; k++) s += parcelD[yR + Math.min(gw - 1, Math.max(0, x + k))];
          tmp[yR + x] = s / (2 * R + 1);
        }
      }
    };
    const blurVRows = (r0, r1) => {
      for (let y = r0; y < r1; y++) {
        const wy = y0 + (y + 0.5) * cell;
        for (let x = 0; x < gw; x++) {
          let s = 0;
          for (let k = -R; k <= R; k++) s += tmp[Math.min(gh - 1, Math.max(0, y + k)) * gw + x];
          const wx = x0 + (x + 0.5) * cell;
          // low-freq warp wobbles the medial axis → crests meander like real ranges
          sd[y * gw + x] = s / (2 * R + 1) + (fbm(wx * 0.7, wy * 0.7, 91, 2) - 0.5) * 0.22;
        }
      }
    };

    const heightRows = (r0, r1) => {
      for (let y = r0; y < r1; y++) {
        const wy = y0 + (y + 0.5) * cell;
        const yR = y * gw, yU = Math.max(0, y - 1) * gw, yD = Math.min(gh - 1, y + 1) * gw;
        for (let x = 0; x < gw; x++) {
          const i = yR + x;
          const wx = x0 + (x + 0.5) * cell;
          if (!land[i]) {
            e[i] = -sstep(seaD[i], 0, COAST_FALL);
            continue;
          }
          const pn = fbm(wx * 0.55, wy * 0.55, 11, 3);            // gentle lowland undulation
          const low = Math.max(0.02, 0.09 + 0.10 * (pn - 0.5) * 2);
          const hm = sstep(parcelD[i], HILL_START, HILL_FULL);
          let range = 0;
          if (hm > 0.004) {
            // medial-spine range model (see header): crest = where |∇sd| dies
            const gx = (sd[yR + Math.min(gw - 1, x + 1)] - sd[yR + Math.max(0, x - 1)]) / (2 * cell);
            const gy = (sd[yD + x] - sd[yU + x]) / (2 * cell);
            const gm = Math.hypot(gx, gy);
            const spine = sstep(1 - gm, 0.30, 0.70);
            const mass = sstep(sd[i], 0.05, RANGE_REF);           // wider strip → taller massif
            const pk = 0.25 + 0.75 * sstep(fbm(wx * 0.5, wy * 0.5, 71, 2), 0.35, 0.72); // massif envelope
            const rg = ridged(wx * 0.7, wy * 0.7, 23, 3);         // rocky detail
            const serr = ridged(wx * 0.75, wy * 0.75, 83, 2);     // crest serration → summits, not a ribbon
            range = 0.10 + 0.30 * mass + rg * (0.14 + 0.26 * mass)
              + spine * pk * (0.30 + 0.70 * serr) * (0.12 + 0.42 * mass);
          }
          e[i] = Math.min(E_MAX,
            sstep(landIn[i], 0, 0.30) * low + sstep(landIn[i], 0.15, 0.90) * hm * range);
          moist[i] = 255 * (0.6 * fbm(wx * 0.28, wy * 0.28, 37, 2) + 0.4 * fbm(wx * 1.5, wy * 1.5, 41, 2));
        }
      }
    };
    const shadeRows = (r0, r1) => { // lambert hillshade from the height gradient
      for (let y = r0; y < r1; y++) {
        const yU = Math.max(0, y - 1) * gw, yD = Math.min(gh - 1, y + 1) * gw, yR = y * gw;
        for (let x = 0; x < gw; x++) {
          const i = yR + x;
          if (e[i] <= 0) continue; // sea stays unshaded
          const gx = (e[yR + Math.min(gw - 1, x + 1)] - e[yR + Math.max(0, x - 1)]) / (2 * cell) * Z_SCALE;
          const gy = (e[yD + x] - e[yU + x]) / (2 * cell) * Z_SCALE;
          const lam = (-gx * LX - gy * LY + LZ) / Math.sqrt(gx * gx + gy * gy + 1);
          const amp = 0.60 + 0.28 * sstep(e[i], 0.42, 0.88); // crest flanks shade harder
          shadeA[i] = Math.min(1.5, Math.max(0.42, (1 - amp) + amp * (lam / LZ)));
        }
      }
    };
    const composeRows = (r0, r1) => { // hypsometric palette × shade → RGBA raster
      const d = img.data;
      for (let y = r0; y < r1; y++) {
        for (let x = 0; x < gw; x++) {
          const i = y * gw + x, o = i * 4;
          const ev = e[i];
          let r, g, b, a = 255;
          if (ev <= 0) { // water: shallow band fades out over the live ocean pattern
            const t = Math.min(1, Math.max(0, (ev + 0.6) / 0.6));
            r = 13 + (38 - 13) * t; g = 30 + (79 - 30) * t; b = 44 + (94 - 44) * t;
            a = 255 * t * t;
            const f = Math.max(0, 1 + ev / 0.055); // soft foam line at the coast
            if (f > 0) {
              const k = f * f * 0.42;
              r += (168 - r) * k; g += (192 - g) * k; b += (198 - b) * k;
              a = Math.max(a, 255 * f * 0.7);
            }
          } else {
            const m = moist[i] / 255;
            const pr = 101 + (72 - 101) * m, pg = 101 + (94 - 101) * m, pb = 63 + (55 - 63) * m; // dry↔lush plains
            if (ev < 0.05) { const t = ev / 0.05; r = 121 + (pr - 121) * t; g = 106 + (pg - 106) * t; b = 78 + (pb - 78) * t; } // sand shore
            else if (ev < 0.30) { const t = (ev - 0.05) / 0.25 * 0.35; r = pr + (96 - pr) * t; g = pg + (97 - pg) * t; b = pb + (62 - pb) * t; }
            else if (ev < 0.52) { const t = (ev - 0.30) / 0.22; r = 96 + (126 - 96) * t; g = 97 + (110 - 97) * t; b = 62 + (76 - 62) * t; }   // → tan foothills
            else if (ev < 0.74) { const t = (ev - 0.52) / 0.22; r = 126 + (141 - 126) * t; g = 110 + (128 - 110) * t; b = 76 + (105 - 76) * t; } // → brown rock
            else if (ev < 0.94) { const t = (ev - 0.74) / 0.20; r = 141 + (164 - 141) * t; g = 128 + (159 - 128) * t; b = 105 + (149 - 105) * t; } // → bare gray
            else { const t = Math.min(1, (ev - 0.94) / 0.22); r = 164 + (218 - 164) * t; g = 159 + (220 - 159) * t; b = 149 + (218 - 149) * t; } // → snow-dust crest
            if (ev < 0.74) { // forest density patches — mottled dark green baked into the ground
              const wx = x0 + (x + 0.5) * cell, wy = y0 + (y + 0.5) * cell;
              const fd = forestDensity(wx, wy, ev, parcelD[i]);
              if (fd > 0) {
                const k = 0.45 * fd;
                r += (34 - r) * k; g += (56 - g) * k; b += (30 - b) * k;
              }
            }
            const s = shadeA[i], dth = (hash2(x, y, 7) - 0.5) * 8;
            r = r * s + dth; g = g * s + dth; b = b * s + dth;
          }
          d[o] = clamp255(r); d[o + 1] = clamp255(g); d[o + 2] = clamp255(b); d[o + 3] = clamp255(a);
        }
      }
    };

    // run the passes in idle chunks (~9 ms budget), then finalize once
    const stages = [blurHRows, blurVRows, heightRows, shadeRows, composeRows];
    let si = 0, row = 0;
    const step = () => {
      if (myGen !== gen) return; // superseded by a new prepare()
      const t0 = performance.now();
      while (si < stages.length) {
        while (row < gh) {
          const end = Math.min(gh, row + 8);
          stages[si](row, end);
          row = end;
          if (performance.now() - t0 > 9) { setTimeout(step, 0); return; }
        }
        si++; row = 0;
      }
      const canvas = document.createElement('canvas');
      canvas.width = gw; canvas.height = gh;
      canvas.getContext('2d').putImageData(img, 0, 0);
      field = { canvas, x0, y0, w: gw * cell, h: gh * cell };
      buildProps(gw, gh, cell, e, parcelD);
      fieldReady = true;
      invalidateAll();
      onUpdate?.();
      // idle-prebuild the whole-world buckets so bucket crossings never hitch
      setTimeout(() => { if (paths && myGen === gen) { w0 ??= makeWorldBucket(w0ppu()); w1 ??= makeWorldBucket(w1ppu()); } }, 200);
    };
    step();
  }

  /** Grove-driven scatter OUTSIDE parcels: the forestDensity field places trees
   *  into organic woods with clearings; sparse lone trees between; boulders on
   *  the high bare-rock band. Fewer, better — density patches carry far zooms. */
  function buildProps(gw, gh, cell, e, parcelD) {
    props = [];
    const x0 = worldBBox[0], y0 = worldBBox[1];
    const cols = Math.floor((gw * cell) / PROP_SPACING), rows = Math.floor((gh * cell) / PROP_SPACING);
    const sample = (arr, wx, wy) => { // bilinear field sample at a world point
      const fx = Math.min(gw - 1.001, Math.max(0, (wx - x0) / cell - 0.5));
      const fy = Math.min(gh - 1.001, Math.max(0, (wy - y0) / cell - 0.5));
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const i = iy * gw + ix;
      return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + gw] * (1 - tx) + arr[i + gw + 1] * tx) * ty;
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const wx = x0 + (i + 0.10 + 0.80 * hash2(i, j, 101)) * PROP_SPACING;
        const wy = y0 + (j + 0.10 + 0.80 * hash2(i, j, 103)) * PROP_SPACING;
        const ev = sample(e, wx, wy);
        if (ev < 0.055) continue;                       // sea/shore: nothing
        const pd = sample(parcelD, wx, wy);
        if (pd < 0.07) continue;                        // keep out of the city zone
        const h = hash2(i, j, 107);
        if (ev > 0.74) {                                // bare-rock band: sparse boulders only
          if (hash2(i, j, 109) > 0.07) continue;
          props.push({ x: wx, y: wy, r: 0.028 + 0.026 * hash2(i, j, 113), k: 3, h });
          continue;
        }
        const fd = forestDensity(wx, wy, ev, pd);
        const p = fd + 0.015;                           // groves + rare lone trees
        if (hash2(i, j, 109) > p) continue;
        if (h < 0.05 && ev > 0.35) {                    // occasional hillside boulder
          props.push({ x: wx, y: wy, r: 0.026 + 0.022 * hash2(i, j, 113), k: 3, h });
          continue;
        }
        const r = (0.027 + 0.022 * hash2(i, j, 113)) * (0.9 + 0.4 * fd); // ±40% size variety
        const conifer = h < 0.12 + 0.72 * sstep(ev, 0.20, 0.50);
        const k = conifer ? 1 : hash2(i, j, 127) < 0.15 && ev < 0.25 ? 2 : 0;
        props.push({ x: wx, y: wy, r, k, h: hash2(i, j, 131) });
      }
    }
  }

  /**
   * LOD prop: k = 0 broadleaf, 1 conifer, 2 bush, 3 rock. Light from NW.
   *   ppu < SPLAT_PPU   — nothing (baked density patches carry the forest)
   *   ppu < SPRITE_PPU  — soft canopy-mass splat (forest texture, no lollipops)
   *   else              — full sprite: irregular multi-lobe canopy / layered
   *                       fronds + soft base-hugging ellipse shadow
   */
  function drawProp(ctx, p, ppu) {
    const { x, y, r, k, h } = p;
    if (ppu < SPLAT_PPU) return;
    if (ppu < SPRITE_PPU) {
      if (k === 3) return; // rocks only read at close zoom
      const g = 42 + h * 14 | 0;
      ctx.fillStyle = k === 1 ? 'rgba(26,44,34,0.30)' : `rgba(${g - 14},${g + 12},${g - 16},0.30)`;
      ctx.beginPath(); // 3 overlapping soft blobs — canopy mass, not a tree
      ctx.arc(x, y, r * 1.25, 0, 7);
      ctx.arc(x + r * (0.6 + h * 0.6), y - r * 0.35, r * 0.9, 0, 7);
      ctx.arc(x - r * (0.5 + h * 0.6), y + r * 0.3, r * 0.8, 0, 7);
      ctx.fill();
      return;
    }
    if (k === 3) { // rock: gray slab, darker SE facet
      ctx.fillStyle = 'rgba(10,14,10,0.16)';
      ctx.beginPath();
      ctx.ellipse(x + r * 0.2, y + r * 0.28, r * 0.95, r * 0.4, 0, 0, 7);
      ctx.fill();
      const v = 92 + h * 26 | 0;
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.4);
      ctx.lineTo(x - r * 0.55, y - r * (0.6 + 0.35 * h));
      ctx.lineTo(x + r * 0.45, y - r * 0.75);
      ctx.lineTo(x + r, y + r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(30,28,26,0.40)';
      ctx.beginPath();
      ctx.moveTo(x + r, y + r * 0.35); ctx.lineTo(x + r * 0.45, y - r * 0.75); ctx.lineTo(x + r * 0.2, y + r * 0.4);
      ctx.closePath();
      ctx.fill();
      return;
    }
    // soft ellipse ground shadow hugging the base (no hard offset stamp)
    ctx.fillStyle = 'rgba(10,14,10,0.16)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.15, y + r * 0.18, r * 0.95, r * 0.38, 0, 0, 7);
    ctx.fill();
    if (k === 1) { // conifer: 3 layered fronds with drooping curved skirts, lit NW edge
      for (let L = 0; L < 3; L++) {
        const wl = r * (1.05 - L * 0.27), yy = y + r * 0.22 - L * r * 0.58;
        const apex = yy - r * (1.05 - L * 0.14);
        const v = 22 + L * 9 + h * 10;
        ctx.fillStyle = `rgb(${v | 0},${v + 20 + L * 4 | 0},${v + 10 | 0})`;
        ctx.beginPath();
        ctx.moveTo(x - wl, yy);
        ctx.quadraticCurveTo(x, yy + r * 0.26, x + wl, yy); // drooping skirt
        ctx.lineTo(x, apex);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(${86 + h * 20 | 0},${112 + h * 16 | 0},70,0.35)`; // NW-lit edge
        ctx.beginPath();
        ctx.moveTo(x, apex);
        ctx.lineTo(x - wl * 0.72, yy - r * 0.03);
        ctx.lineTo(x - wl * 0.2, yy - r * 0.06);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    // broadleaf / bush: 3–5 irregular offset lobes, 3 green shades, hue jitter
    const s = k === 2 ? 0.72 : 1;
    const j = (h - 0.5) * 20;
    const lobes = k === 2 ? 3 : 3 + ((h * 997) | 0) % 3;
    ctx.fillStyle = `rgb(${30 + j * 0.5 | 0},${50 + j | 0},${29 + j * 0.3 | 0})`; // under-canopy
    ctx.beginPath();
    ctx.arc(x, y - r * 0.32 * s, r * 0.9 * s, 0, 7);
    ctx.fill();
    for (let L = 0; L < lobes; L++) { // irregular offset lobes, two alternating greens
      const a = h * 7 + L * (6.283 / lobes);
      const d = r * s * (0.34 + 0.30 * frac(h * 13 + L * 0.61));
      const rr = r * s * (0.36 + 0.28 * frac(h * 29 + L * 0.37));
      const dk = L % 2 ? 9 : 0;
      ctx.fillStyle = `rgb(${58 + j * 0.6 - dk | 0},${84 + j - dk | 0},${44 + j * 0.4 - dk * 0.6 | 0})`;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y - r * 0.36 * s + Math.sin(a) * d * 0.75, rr, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(${96 + j | 0},${124 + j | 0},${62 + j * 0.5 | 0},0.85)`; // NW light
    ctx.beginPath();
    ctx.arc(x - r * 0.28 * s, y - r * 0.6 * s, r * 0.38 * s, 0, 7);
    ctx.arc(x - r * 0.02 * s, y - r * (0.5 + 0.14 * frac(h * 5)) * s, r * 0.26 * s, 0, 7);
    ctx.fill();
  }

  // ── per-parcel overlay (state → wash/stain/accent mapping) ──────────────────
  function styleOf(id) {
    const t = store.terrByParcel.get(id);
    if (t?.garrison?.monsterName) return { kind: 'monster' };
    if (!t || t.governorKind === 'SYSTEM') return { kind: 'wild' };
    return {
      kind: 'owned',
      tint: store.color(t.governorId),
      prestige: t.prosperity >= PRESTIGE_PROSPERITY || npcCapitals.has(id),
    };
  }

  /** Overlay ON TOP of the continuous terrain: accents, washes, stains, wild trees. */
  function fillOverlay(ctx, id, ppu) {
    const path = paths.get(id);
    const st = styleOf(id);
    if (st.kind === 'monster') { // corrupted ground stain (red eye drawn live on top)
      const [ax, ay, bx, by] = bboxes.get(id);
      const c = store.parcels.get(id).center;
      const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], Math.max(bx - ax, by - ay) * 0.62);
      g.addColorStop(0, 'rgba(24,8,20,0.5)');
      g.addColorStop(0.65, 'rgba(28,12,24,0.26)');
      g.addColorStop(1, 'rgba(28,12,24,0)');
      ctx.fillStyle = g;
      ctx.fill(path);
      return;
    }
    if (st.kind === 'wild') {
      const pat = texReady ? patterns.get(wildTex.get(id)) : null;
      if (pat) { // faint accent only — desert toward the frontier, grass elsewhere
        ctx.save();
        ctx.globalAlpha = wildTex.get(id)[0] === 'd' ? 0.10 : 0.06;
        ctx.fillStyle = pat;
        ctx.fill(path);
        ctx.restore();
      }
      if (fieldReady) for (const t of parcelTrees.get(id) ?? []) drawProp(ctx, t, ppu);
      return;
    }
    const pat = texReady ? patterns.get(stoneTex.get(id)) : null; // settled plaza accent
    if (pat) {
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = pat;
      ctx.fill(path);
      ctx.restore();
    }
    // ownership wash — COLOR IS THE INFORMATION: strongest on the zoomed-out bucket
    const a = ppu <= w0ppu() + 0.01 ? 0.46 : ppu <= w1ppu() + 0.01 ? 0.34 : 0.26;
    ctx.fillStyle = rgba(st.tint, a);
    ctx.fill(path);
  }

  function strokeParcel(ctx, id, ppu) {
    const st = styleOf(id);
    const path = paths.get(id);
    if (st.kind === 'owned') {
      ctx.strokeStyle = rgba(st.tint, 0.55);
      ctx.lineWidth = 1.1 / ppu;
      ctx.stroke(path);
      if (st.prestige) { // gold border glow instead of any special floor
        ctx.strokeStyle = 'rgba(255,206,110,0.22)';
        ctx.lineWidth = 2.8 / ppu;
        ctx.stroke(path);
        ctx.strokeStyle = 'rgba(255,214,128,0.85)';
        ctx.lineWidth = 1.1 / ppu;
        ctx.stroke(path);
      }
      return;
    }
    ctx.strokeStyle = st.kind === 'monster' ? 'rgba(150,60,60,0.30)' : 'rgba(205,220,235,0.13)';
    ctx.lineWidth = 0.8 / ppu; // thin grid overlay the terrain ignores
    ctx.stroke(path);
  }

  /** Re-blit the continuous terrain inside one parcel, then its overlay (patching). */
  function repaintParcel(ctx, id, ppu) {
    const path = paths.get(id);
    ctx.save();
    ctx.clip(path);
    if (fieldReady) ctx.drawImage(field.canvas, field.x0, field.y0, field.w, field.h);
    else { ctx.fillStyle = FLAT.land; ctx.fill(path); }
    ctx.restore();
    fillOverlay(ctx, id, ppu);
  }

  // ── ownership signature → patch or rebuild ──────────────────────────────────
  function computeSig() {
    const best = new Map(); // NPC kingdom governorId → strongest holding
    for (const t of store.terrByParcel.values()) {
      if (store.players.get(t.governorId)?.kind !== 'NPC_KINGDOM') continue;
      const b = best.get(t.governorId);
      if (!b || t.prosperity > b.prosperity ||
          (t.prosperity === b.prosperity && t.parcelId < b.parcelId)) best.set(t.governorId, t);
    }
    npcCapitals = new Set([...best.values()].map((t) => t.parcelId));
    const sig = new Map();
    for (const id of store.parcels.keys()) {
      const t = store.terrByParcel.get(id);
      if (!t || t.governorKind === 'SYSTEM') sig.set(id, t?.garrison?.monsterName ? 'wm' : 'w');
      else sig.set(id, t.governorId + (t.prosperity >= PRESTIGE_PROSPERITY || npcCapitals.has(id) ? 'P' : ''));
    }
    return sig;
  }

  function applyStateChange() {
    if (!paths) return;
    const sig = computeSig();
    if (!lastSig) { lastSig = sig; invalidateAll(); return; }
    const changed = [];
    for (const [id, s] of sig) if (lastSig.get(id) !== s) changed.push(id);
    lastSig = sig;
    if (changed.length === 0) return;
    if (changed.length > PATCH_MAX) { invalidateAll(); return; }
    for (const b of [w0, w1, vb]) if (b) patchBucket(b, changed);
  }

  function intersects(b, id) {
    const x = bboxes.get(id);
    return x && x[0] <= b.x1 && x[2] >= b.x0 && x[1] <= b.y1 && x[3] >= b.y0;
  }

  function patchBucket(b, changed) {
    const ids = new Set();
    for (const id of changed) {
      ids.add(id);
      for (const nb of store.parcels.get(id)?.neighbors ?? []) ids.add(nb); // restore shared-edge strokes
    }
    const vis = [...ids].filter((id) => intersects(b, id));
    if (vis.length === 0) return;
    b.ctx.setTransform(b.ppu, 0, 0, b.ppu, -b.x0 * b.ppu, -b.y0 * b.ppu);
    for (const id of vis) repaintParcel(b.ctx, id, b.ppu);
    for (const id of vis) strokeParcel(b.ctx, id, b.ppu);
  }

  // ── bucket construction ──────────────────────────────────────────────────────
  function makeBucket(ppu, x0, y0, x1, y1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil((x1 - x0) * ppu));
    canvas.height = Math.max(1, Math.ceil((y1 - y0) * ppu));
    const ctx = canvas.getContext('2d');
    const b = { canvas, ctx, ppu, x0, y0, x1, y1, wWu: canvas.width / ppu, hWu: canvas.height / ppu };
    ctx.setTransform(ppu, 0, 0, ppu, -x0 * ppu, -y0 * ppu);
    if (fieldReady) { // continuous landscape, smooth-scaled from the field grid
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(field.canvas, field.x0, field.y0, field.w, field.h);
    } else if (platePath) { // progressive enhancement: flat landmass until the field lands
      ctx.fillStyle = FLAT.land;
      ctx.fill(platePath);
    }
    if (texReady && platePath) { // faint grass tooth over the whole landmass
      const g = patterns.get('grass_01');
      if (g) {
        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = g;
        ctx.fill(platePath);
        ctx.restore();
      }
    }
    if (fieldReady && ppu >= SPLAT_PPU) for (const p of props) { // far zoom: density patches only
      if (p.x >= b.x0 - 0.3 && p.x <= b.x1 + 0.3 && p.y >= b.y0 - 0.3 && p.y <= b.y1 + 0.3) drawProp(ctx, p, ppu);
    }
    for (const p of store.parcels.values()) if (intersects(b, p.id)) fillOverlay(ctx, p.id, ppu);
    for (const p of store.parcels.values()) if (intersects(b, p.id)) strokeParcel(ctx, p.id, ppu);
    return b;
  }

  const makeWorldBucket = (ppu) => makeBucket(ppu, worldBBox[0], worldBBox[1], worldBBox[2], worldBBox[3]);

  /**
   * Return the base layer for this camera (building/patching if needed).
   * `view` = {w,h,cx,cy}: CSS-px viewport + world-space camera center.
   */
  function ensure(camS, dpr, view) {
    if (!paths || paths.size === 0) return null;
    if (stateDirty) { stateDirty = false; applyStateChange(); }
    const need = camS * dpr;
    if (need <= w0ppu()) return (w0 ??= makeWorldBucket(w0ppu()));
    if (need <= w1ppu()) return (w1 ??= makeWorldBucket(w1ppu()));
    let step = w1ppu() * 2; // viewport-follow bucket: ×2 zoom steps above the world bucket
    while (step < need && step < w1ppu() * 8) step *= 2;
    const hw = view.w / camS / 2, hh = view.h / camS / 2;
    if (vb && vb.step === step) { // still covering the viewport (12% slack when capped)?
      const rx = (vb.x1 - vb.x0) / 2, ry = (vb.y1 - vb.y0) / 2;
      const sx = Math.max(rx - hw, rx * 0.12), sy = Math.max(ry - hh, ry * 0.12);
      if (Math.abs(view.cx - (vb.x0 + rx)) <= sx && Math.abs(view.cy - (vb.y0 + ry)) <= sy) return vb;
    }
    const mx = Math.min(hw * 1.9, MAX_SIDE / step / 2), my = Math.min(hh * 1.9, MAX_SIDE / step / 2);
    vb = makeBucket(step, view.cx - mx, view.cy - my, view.cx + mx, view.cy + my);
    vb.step = step;
    return vb;
  }

  return {
    loadTextures,
    prepare,
    onStateChange() { stateDirty = true; },
    ensure,
    /** Ocean background fill (world-anchored pattern once loaded, flat before). */
    oceanFill() { return oceanPattern ?? FLAT.ocean; },
    get texturesReady() { return texReady; },
    get fieldReady() { return fieldReady; },
  };
}
