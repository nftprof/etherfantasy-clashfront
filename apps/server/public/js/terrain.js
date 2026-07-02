/**
 * Terrain base layer for the overworld map (graphics pass; docs/map-engine/01
 * §2b ambient ground reads, §4 rendering).
 *
 * Deterministic per-parcel floors (seeded by parcelId hash — same parcel, same
 * look, every session):
 *   wild              → grass_01/02; the outer ~35% frontier (same
 *                       distance-from-slice-center metric that scales monster
 *                       strength) blends desert_01–05 badlands in
 *   monster garrison  → grave_01 (the red-eye dot stays on top, drawn live)
 *   owned             → stone_01–04 plaza + owner color tint on top — COLOR IS
 *                       THE INFORMATION, texture is flavor: the tint is stronger
 *                       on the zoomed-out bucket so empires read from orbit
 *   prestige          → lobby_01 (prosperity ≥ 70, or the NPC kingdom's
 *                       strongest holding — its shining capital)
 *
 * Non-parcel space (canon: two non-ownable area types):
 *   OCEAN      → procedural seamless deep-water tile, drawn live as ONE
 *                world-anchored pattern fillRect under everything (infinite,
 *                no bucket bounds). Static — no shimmer, keeps the rAF gate idle.
 *   WILD BARRENS → impassable wilderness plate between ocean and parcels: a
 *                blobbed/noised hull around the cluster (organic coast, not a
 *                bbox), filled with heavily darkened scrub (grass+desert mix,
 *                hatched). No strokes, no hover — reads as "you cannot go here".
 *                Interior no-parcel gaps show it too (it underlies the parcels).
 *
 * Perf: textures load async — flat colors render FIRST (no blank map, ever).
 * The full static base (barrens plate + pattern fills + tints + strokes) bakes
 * into offscreen canvases in WORLD space at 3 resolution buckets (two
 * whole-world + one viewport-follow for high zoom, each ≤ 4096 px long side);
 * a frame is then ONE drawImage. Buckets re-render only when ownership/
 * prestige/garrison state changes (small diffs are patched in place), when
 * textures arrive, or when zoom crosses a bucket. Patterns tile in WORLD
 * coordinates (~3 repeats per parcel) so textures never swim while panning.
 */
import { rgba, shade } from './util.js';

const VARIANTS = {
  grass: ['grass_01', 'grass_02'],
  desert: ['desert_01', 'desert_02', 'desert_03', 'desert_04', 'desert_05'],
  stone: ['stone_01', 'stone_02', 'stone_03', 'stone_04'],
};
const ALL_TEXTURES = [...VARIANTS.grass, ...VARIANTS.desert, ...VARIANTS.stone, 'grave_01', 'lobby_01'];

/** Night-grade wash (page-bg colored) baked into each tile — keeps the dark map aesthetic. */
const DARKEN = { grass: 0.52, desert: 0.5, grave: 0.4, stone: 0.32, lobby: 0.24 };

/** Flat fallbacks so the map renders before textures arrive (progressive enhancement). */
const FLAT = { grass: '#232f1d', desert: '#38301f', grave: '#251f2b', barrens: '#131a12', ocean: '#0b1420' };

const TILE_WU = 0.24;             // world units per floor-texture repeat (~3 per parcel)
const BARRENS_TILE_WU = 0.4;      // scrub repeats calmer than parcel floors
const OCEAN_TILE_WU = 9;          // ocean noise is a large, low-contrast tile
const PLATE_PAD = 2.6;            // world buckets extend past the bbox so the coast never clips
const MAX_SIDE = 4096;            // long-side budget per offscreen bucket
const W0_SIDE = 1536;             // zoomed-out whole-world bucket side
const PRESTIGE_PROSPERITY = 70;   // docs: high-prosperity plaza accent
const FRONTIER = 0.65;            // dist/maxDist ≥ this → badlands (blend band below)
const PATCH_MAX = 48;             // bigger ownership diffs → full bucket rebuild

function fnv(id) {
  let h = 2166136261;
  for (const c of id) h = (h ^ c.charCodeAt(0)) * 16777619 >>> 0;
  return h;
}
/** Tiny seeded PRNG (LCG) for procedural tiles / coast noise — deterministic. */
function lcg(seed) {
  let s = fnv(seed);
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216;
}
const pick = (arr, h) => arr[(h >>> 10) % arr.length];

export function createTerrain(store) {
  const patterns = new Map();     // texture name → world-anchored CanvasPattern
  let oceanPattern = null;
  let barrensPattern = null;
  let texReady = false;

  let paths = null, bboxes = null, worldBBox = null, longSideWu = 1;
  const wildTex = new Map();      // parcelId → grass/desert variant (static, seeded)
  const stoneTex = new Map();     // parcelId → stone variant (static, seeded)
  let platePath = null;           // wild-barrens landmass silhouette (Path2D, world)
  let lastSig = null;             // parcelId → ownership signature
  let npcCapitals = new Set();    // strongest holding per NPC kingdom → lobby accent
  let stateDirty = false;
  let w0 = null, w1 = null, vb = null; // buckets {canvas,ctx,ppu,x0,y0,x1,y1,wWu,hWu}

  const w0ppu = () => W0_SIDE / longSideWu;
  const w1ppu = () => MAX_SIDE / longSideWu;
  function invalidateAll() { w0 = w1 = vb = null; }

  // ── texture loading (async; one repaint when done) ─────────────────────────
  function loadTextures(onReady) {
    const jobs = ALL_TEXTURES.map((name) => new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ name, img });
      img.onerror = () => res(null); // missing texture → that class stays flat
      img.src = `textures/floors/${name}.png`;
    }));
    Promise.all(jobs).then((loaded) => {
      const pctx = document.createElement('canvas').getContext('2d');
      const anchor = (pat, wu, px) => {
        pat.setTransform(new DOMMatrix([wu / px, 0, 0, wu / px, 0, 0]));
        return pat;
      };
      const imgs = new Map();
      for (const it of loaded) {
        if (!it) continue;
        imgs.set(it.name, it.img);
        const tile = document.createElement('canvas');
        tile.width = tile.height = it.img.width;
        const tc = tile.getContext('2d');
        tc.drawImage(it.img, 0, 0);
        tc.fillStyle = `rgba(10,14,19,${DARKEN[it.name.slice(0, it.name.indexOf('_'))]})`;
        tc.fillRect(0, 0, tile.width, tile.height);
        patterns.set(it.name, anchor(pctx.createPattern(tile, 'repeat'), TILE_WU, tile.width));
      }
      barrensPattern = anchor(pctx.createPattern(buildBarrensTile(imgs), 'repeat'), BARRENS_TILE_WU, 256);
      oceanPattern = anchor(pctx.createPattern(buildOceanTile(), 'repeat'), OCEAN_TILE_WU, 256);
      texReady = true;
      invalidateAll();
      // idle-prebuild the whole-world buckets so bucket crossings never hitch mid-flight
      setTimeout(() => { if (paths) { w0 ??= makeWorldBucket(w0ppu()); w1 ??= makeWorldBucket(w1ppu()); } }, 250);
      onReady?.();
    });
  }

  /** Impassable-scrub tile: dark grass+desert mix with a faint hatch (seamless). */
  function buildBarrensTile(imgs) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const t = c.getContext('2d');
    t.fillStyle = FLAT.barrens;
    t.fillRect(0, 0, 256, 256);
    const g = imgs.get('grass_02') ?? imgs.get('grass_01');
    if (g) t.drawImage(g, 0, 0, 256, 256);
    const d = imgs.get('desert_01');
    if (d) { t.globalAlpha = 0.3; t.drawImage(d, 0, 0, 256, 256); t.globalAlpha = 1; }
    t.fillStyle = 'rgba(8,12,10,0.72)'; // heavy darkening — clearly not claimable land
    t.fillRect(0, 0, 256, 256);
    t.strokeStyle = 'rgba(0,0,0,0.16)'; // diagonal hatch, spacing divides 256 → seamless
    t.lineWidth = 3;
    t.beginPath();
    for (let i = -256; i < 256; i += 32) { t.moveTo(i, 0); t.lineTo(i + 256, 256); }
    t.stroke();
    return c;
  }

  /** Procedural seamless deep-water tile: layered blues + wave banding (seeded). */
  function buildOceanTile() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const t = c.getContext('2d');
    const rnd = lcg('cf-ocean');
    t.fillStyle = '#0c1826';
    t.fillRect(0, 0, S, S);
    const wrap = (draw) => { // 3×3 stamp so every primitive tiles seamlessly
      for (let dx = -S; dx <= S; dx += S) for (let dy = -S; dy <= S; dy += S) draw(dx, dy);
    };
    for (let i = 0; i < 6; i++) { // soft depth blobs — big and faint so tiling never reads
      const x = rnd() * S, y = rnd() * S, r = 70 + rnd() * 90, deep = rnd() < 0.5;
      wrap((dx, dy) => {
        const g = t.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, deep ? 'rgba(6,14,24,0.22)' : 'rgba(28,58,88,0.14)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        t.fillStyle = g;
        t.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      });
    }
    t.lineCap = 'round';
    for (let i = 0; i < 90; i++) { // wave dashes: subtle light banding
      const x = rnd() * S, y = rnd() * S, len = 8 + rnd() * 22, bow = 2 + rnd() * 3;
      t.strokeStyle = `rgba(120,170,210,${0.03 + rnd() * 0.04})`;
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
    for (const p of store.parcels.values()) {
      const h = fnv(p.id);
      const dn = Math.hypot(p.center[0] - cx, p.center[1] - cy) / maxD;
      const badlands = (h % 997) / 997 < (dn - (FRONTIER - 0.15)) / 0.15; // outer ring → desert
      wildTex.set(p.id, badlands ? pick(VARIANTS.desert, h) : pick(VARIANTS.grass, h));
      stoneTex.set(p.id, pick(VARIANTS.stone, h));
    }
    platePath = buildPlate(cx, cy);
    lastSig = null;
    invalidateAll();
  }

  /** Wild-barrens landmass silhouette: noised convex hull of all parcel vertices. */
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
      const off = 0.9 + 0.5 * Math.sin(i * 2.39) + rnd() * 0.7; // 0.4–2.1 wu of barrens
      q.push([x + ((x - ccx) / nl) * off, y + ((y - ccy) / nl) * off]);
    }
    const path = new Path2D();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    path.moveTo(...mid(q[M - 1], q[0]));
    for (let i = 0; i < M; i++) path.quadraticCurveTo(q[i][0], q[i][1], ...mid(q[i], q[(i + 1) % M]));
    path.closePath();
    return path;
  }

  // ── per-parcel style (state → texture/tint mapping) ─────────────────────────
  function styleOf(id) {
    const t = store.terrByParcel.get(id);
    if (t?.garrison?.monsterName) return { tex: 'grave_01', flat: FLAT.grave };
    if (!t || t.governorKind === 'SYSTEM') {
      const tex = wildTex.get(id) ?? 'grass_01';
      return { tex, flat: tex[0] === 'd' ? FLAT.desert : FLAT.grass };
    }
    const prestige = t.prosperity >= PRESTIGE_PROSPERITY || npcCapitals.has(id);
    return { tex: prestige ? 'lobby_01' : stoneTex.get(id), tint: store.color(t.governorId) };
  }

  function fillParcel(ctx, id, ppu) {
    const path = paths.get(id);
    const st = styleOf(id);
    const pat = texReady ? patterns.get(st.tex) : null;
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fill(path);
      if (st.tint) {
        // ownership readability first: the further out the bucket, the stronger
        // the tint (color is information); up close the plaza flavor shows more
        const a = ppu <= w0ppu() + 0.01 ? 0.48 : ppu <= w1ppu() + 0.01 ? 0.36 : 0.28;
        ctx.fillStyle = rgba(st.tint, a);
        ctx.fill(path);
      }
    } else {
      ctx.fillStyle = st.tint ? shade(st.tint, -0.45) : st.flat;
      ctx.fill(path);
    }
  }

  function strokeParcel(ctx, id, ppu) {
    const st = styleOf(id);
    ctx.strokeStyle = st.tint ? rgba(st.tint, 0.5) : 'rgba(160,180,200,0.10)';
    ctx.lineWidth = 0.9 / ppu; // ~1 bucket px; the bright own-parcel rim is drawn live
    ctx.stroke(paths.get(id));
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
    for (const id of vis) fillParcel(b.ctx, id, b.ppu);
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
    if (platePath) { // landmass under the parcels: shallow-water rim, scrub plate, coast line
      ctx.strokeStyle = 'rgba(110,160,200,0.13)';
      ctx.lineWidth = 0.55;
      ctx.stroke(platePath);
      ctx.fillStyle = (texReady && barrensPattern) || FLAT.barrens;
      ctx.fill(platePath);
      ctx.strokeStyle = 'rgba(4,8,12,0.5)';
      ctx.lineWidth = 0.07;
      ctx.stroke(platePath);
    }
    for (const p of store.parcels.values()) if (intersects(b, p.id)) fillParcel(ctx, p.id, ppu);
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
  };
}
