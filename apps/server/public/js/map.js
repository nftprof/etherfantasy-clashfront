/**
 * Canvas2D overworld renderer (docs/map-engine/01 §2b/§3/§4, MVP v0: one zone,
 * no tiling). Camera pan/zoom/goto-fly, HiDPI, and a rAF gate: frames are drawn
 * only when state/camera changed or an animation (march, fire, flight) runs.
 *
 * Ground: terrain.js bakes ONE continuous procedural landscape (heightfield +
 * hillshade + props, docs/map-engine/01 §2d) with the parcel grid/ownership
 * washes as a thin overlay into offscreen world-space buckets — a frame draws
 * the ocean pattern + ONE base blit, then the dynamic overlays live: bright
 * own-parcel rims, battles = fire+smoke burst (~30s fade), stalemates = gray
 * smoke only (docs/04 §7c TIE — nothing burned, nobody won), retreats = fading
 * dashed line + sliding chevron, pillage = smoldering tint (~60s), occupation =
 * color pulse; monster garrisons keep the red-eye dot on top of their stain.
 * Unit markers read friend/foe (viewer's = blue, everyone else = red with an
 * owner-color ring), scale with troop count, fan out when co-located (×N badge,
 * collapsing at far zoom), and shared march destinations get a ⚔ convergence
 * badge with incoming count + soonest ETA.
 */
import { createTerrain } from './terrain.js';
import { easeInOut, pointInPoly, rgba } from './util.js';

const FIRE_MS = 30_000;
const SMOKE_MS = 18_000;
const SMOLDER_MS = 60_000;
const PULSE_MS = 1500;
const RETREAT_MS = 4200;

// Friend/foe unit colors (PO 2026-07-02 "blue vs red"): the VIEWER's units are
// always blue, everyone else's (players, NPC kingdoms, monsters) are red.
// Territory ownership keeps per-player colors; an owner-color ring on red
// markers keeps empires identifiable.
const MY_UNIT = '#4da3ff';
const FOE_UNIT = '#e0483c';

export function createMap(canvas, store, handlers) {
  const ctx = canvas.getContext('2d');
  const terrain = createTerrain(store, () => { dirty = true; }); // heightfield lands async
  terrain.loadTextures(() => { dirty = true; }); // flat colors render until then
  let dpr = 1, w = 0, h = 0;
  const cam = { cx: 0, cy: 0, s: 20 };
  let fitScale = 20;
  let flight = null;               // {t0,dur,from:{cx,cy,s},to:{cx,cy,s}}
  let dirty = true;
  let hoverParcel = null;
  let selectedArmyId = null;
  let selectedParcelId = null; // mirrors the open parcel card (ui.openCard/closeCard)

  const fires = [];                // {x,y,t0,seed}
  const smokes = [];               // {x,y,t0,seed} — stalemate: smoke only, no fire
  const smolders = new Map();      // parcelId → t0
  const pulses = [];               // {parcelId,t0,color}
  const retreats = [];             // {fx,fy,tx,ty,t0,color} — retreat path flash
  // FTUE guide marks (world-anchored, animated, drawn every frame while set):
  // {armyId?, parcels?: [{id, kind: 'candidate'|'recommended'}], tag?: {parcelId, text}}
  // or null. Purely visual — never intercepts input.
  let guide = null;

  // per-parcel precomputed geometry
  const paths = new Map();         // parcelId → Path2D (world coords)
  const bboxes = new Map();        // parcelId → [minx,miny,maxx,maxy]

  // friend/foe + army-size marker helpers (see MY_UNIT/FOE_UNIT above)
  const unitColor = (gid) => (store.isMine(gid) ? MY_UNIT : FOE_UNIT);
  const unitRing = (gid) => (store.isMine(gid) ? 'rgba(255,255,255,0.65)' : rgba(store.color(gid), 0.95));
  /** Marker scale by troop count: sqrt ramp, ~0.8× at 30 troops → 1.6× at 600+ (still px-clamped at zoom). */
  const sizeK = (troops) => 0.6 + Math.min(1, Math.sqrt((troops || 0) / 600));

  // ── geometry prep ───────────────────────────────────────────────────────────
  let worldBBox = null; // [mnx,mny,mxx,mxy]
  function prepare() {
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const p of store.parcels.values()) {
      const path = new Path2D();
      p.polygon.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
      path.closePath();
      paths.set(p.id, path);
      let ax = 1e9, ay = 1e9, bx = -1e9, by = -1e9;
      for (const [x, y] of p.polygon) {
        if (x < ax) ax = x; if (y < ay) ay = y; if (x > bx) bx = x; if (y > by) by = y;
      }
      bboxes.set(p.id, [ax, ay, bx, by]);
      mnx = Math.min(mnx, ax); mny = Math.min(mny, ay); mxx = Math.max(mxx, bx); mxy = Math.max(mxy, by);
    }
    worldBBox = [mnx, mny, mxx, mxy];
    terrain.prepare({ paths, bboxes, worldBBox }); // bakes the ground buckets lazily
    refit();
    cam.cx = (mnx + mxx) / 2; cam.cy = (mny + mxy) / 2; cam.s = fitScale;
    dirty = true;
  }

  function refit() {
    if (!worldBBox) return;
    const bw = worldBBox[2] - worldBBox[0], bh = worldBBox[3] - worldBBox[1];
    fitScale = Math.min(w / Math.max(1e-6, bw), h / Math.max(1e-6, bh)) * 0.92;
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = canvas.parentElement.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    refit();
    dirty = true;
  }

  // ── coordinate mapping ─────────────────────────────────────────────────────
  const toScreen = (x, y) => [(x - cam.cx) * cam.s + w / 2, (y - cam.cy) * cam.s + h / 2];
  const toWorld = (sx, sy) => [(sx - w / 2) / cam.s + cam.cx, (sy - h / 2) / cam.s + cam.cy];

  function pickParcel(sx, sy) {
    const [x, y] = toWorld(sx, sy);
    for (const p of store.parcels.values()) {
      const b = bboxes.get(p.id);
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pointInPoly(p.polygon, x, y)) return p.id;
    }
    return null;
  }

  /**
   * Fan-out layout for garrison markers: N co-located armies never stack — they
   * spread on a small ring around the parcel anchor (deterministic id order).
   * At far zoom (ring would be sub-pixel) a parcel collapses to its largest
   * marker + a ×N badge. Returns {groups: parcelId→Army[], pos: armyId→[x,y],
   * collapsed: Set<parcelId>}.
   */
  function garrisonLayout() {
    const groups = new Map();
    for (const a of store.armies.values()) {
      if (a.state !== 'GARRISON') continue;
      let g = groups.get(a.parcelId);
      if (g === undefined) groups.set(a.parcelId, g = []);
      g.push(a);
    }
    const pos = new Map();
    const collapsed = new Set();
    for (const [pid, g] of groups) {
      const c = store.parcels.get(pid)?.center;
      if (!c) { groups.delete(pid); continue; }
      g.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      if (g.length === 1) { pos.set(g[0].id, c); continue; }
      const R = Math.min(0.34, 18 / cam.s); // ring radius, px-clamped like markers
      if (R * cam.s < 9) {                  // far zoom: badge + largest marker only
        collapsed.add(pid);
        let big = g[0];
        for (const a of g) if (a.troops > big.troops) big = a;
        pos.set(big.id, c);
        continue;
      }
      g.forEach((a, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / g.length;
        pos.set(a.id, [c[0] + R * Math.cos(ang), c[1] + R * Math.sin(ang)]);
      });
    }
    return { groups, pos, collapsed };
  }

  /** Nearest own army marker within `px` screen pixels (fan-out aware; marching picked over garrisons). */
  function pickArmy(sx, sy, px = 13) {
    const gl = garrisonLayout();
    let best = null, bestD = px;
    for (const a of store.armies.values()) {
      if (!store.isMine(a.governorId)) continue;
      const wp = a.state === 'GARRISON' ? gl.pos.get(a.id) : store.armyPos(a);
      if (!wp) continue; // hidden sibling of a collapsed far-zoom group → parcel click resolves it
      const [ax, ay] = toScreen(wp[0], wp[1]);
      const d = Math.hypot(ax - sx, ay - sy) - (a.state === 'MARCHING' ? 3 : 0);
      if (d < bestD) { bestD = d; best = a.id; }
    }
    return best;
  }

  // ── camera ─────────────────────────────────────────────────────────────────
  function clampScale(s) { return Math.min(fitScale * 45, Math.max(fitScale * 0.65, s)); }

  function flyTo(x, y, targetScale, dur = 420) {
    const s = clampScale(targetScale ?? Math.max(cam.s, fitScale * 5));
    flight = { t0: performance.now(), dur, from: { ...cam }, to: { cx: x, cy: y, s } };
    dirty = true;
  }

  function gotoParcel(parcelId) {
    const c = store.parcels.get(parcelId)?.center;
    if (c) flyTo(c[0], c[1]);
  }

  function zoomAt(sx, sy, factor) {
    const [wx, wy] = toWorld(sx, sy);
    cam.s = clampScale(cam.s * factor);
    cam.cx = wx - (sx - w / 2) / cam.s;
    cam.cy = wy - (sy - h / 2) / cam.s;
    flight = null;
    dirty = true;
  }

  // ── input ──────────────────────────────────────────────────────────────────
  let drag = null; // {sx,sy,cx,cy,moved}
  const pointers = new Map();
  let pinchDist = 0;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pointers.size === 1) drag = { sx: e.offsetX, sy: e.offsetY, cx: cam.cx, cy: cam.cy, moved: false };
    else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchDist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      drag = null;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      if (pinchDist > 0) zoomAt((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, d / pinchDist);
      pinchDist = d;
      return;
    }
    if (drag && e.buttons) {
      const dx = e.offsetX - drag.sx, dy = e.offsetY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        cam.cx = drag.cx - dx / cam.s;
        cam.cy = drag.cy - dy / cam.s;
        flight = null;
        canvas.classList.add('dragging');
        dirty = true;
      }
      return;
    }
    const pid = pickParcel(e.offsetX, e.offsetY);
    if (pid !== hoverParcel) { hoverParcel = pid; dirty = true; }
    handlers.onHover(pid, e);
  });
  canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    const wasDrag = drag?.moved;
    drag = null;
    if (wasDrag || pointers.size > 0) return;
    const armyId = pickArmy(e.offsetX, e.offsetY);
    if (armyId && !selectedArmyId) { handlers.onClickArmy(armyId, e); return; }
    const pid = pickParcel(e.offsetX, e.offsetY);
    if (pid) handlers.onClickParcel(pid, e);
    else handlers.onClickVoid();
  });
  canvas.addEventListener('pointerleave', () => {
    if (hoverParcel) { hoverParcel = null; dirty = true; handlers.onHover(null); }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });

  // ── effects ────────────────────────────────────────────────────────────────
  function fireAt(parcelId) {
    const c = store.parcels.get(parcelId)?.center;
    if (c) { fires.push({ x: c[0], y: c[1], t0: performance.now(), seed: Math.random() * 7 }); dirty = true; }
  }
  function smolderAt(parcelId) { smolders.set(parcelId, performance.now()); dirty = true; }
  function pulseAt(parcelId, color) { pulses.push({ parcelId, t0: performance.now(), color }); dirty = true; }
  /** Stalemate marker: gray smoke plume, no flames (docs/04 §7c.4 TIE). */
  function smokeAt(parcelId) {
    const c = store.parcels.get(parcelId)?.center;
    if (c) { smokes.push({ x: c[0], y: c[1], t0: performance.now(), seed: Math.random() * 7 }); dirty = true; }
  }
  /** Brief flash of an army's retreat line (fromParcel → toParcel), friend/foe colored. */
  function retreatFlash(fromParcelId, toParcelId, governorId) {
    const f = store.parcels.get(fromParcelId)?.center;
    const t = store.parcels.get(toParcelId)?.center;
    if (f && t) {
      retreats.push({ fx: f[0], fy: f[1], tx: t[0], ty: t[1], t0: performance.now(), governorId });
      dirty = true;
    }
  }

  // ── draw ───────────────────────────────────────────────────────────────────
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0e13';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (w / 2 - cam.cx * cam.s), dpr * (h / 2 - cam.cy * cam.s));
    const lw = (px) => px / cam.s;
    const cap = (worldR, px) => Math.min(worldR, px / cam.s); // clamp marker world-size to a px budget at high zoom
    const me = store.me?.governorId;

    // ocean background (world-anchored pattern, non-interactive, infinite)
    const [ox0, oy0] = toWorld(0, 0), [ox1, oy1] = toWorld(w, h);
    ctx.fillStyle = terrain.oceanFill();
    ctx.fillRect(ox0, oy0, ox1 - ox0, oy1 - oy0);

    // ground: barrens plate + parcel floors + tints + strokes — ONE baked blit
    const base = terrain.ensure(cam.s, dpr, { w, h, cx: cam.cx, cy: cam.cy });
    if (base) ctx.drawImage(base.canvas, base.x0, base.y0, base.wWu, base.hWu);

    // pillage smolder (animated fade — kept live on top of the baked ground)
    for (const [pid, sm] of smolders) {
      const k = 1 - (now - sm) / SMOLDER_MS;
      if (k <= 0) { smolders.delete(pid); continue; }
      const path = paths.get(pid);
      if (path) { ctx.fillStyle = `rgba(12,6,4,${0.62 * k})`; ctx.fill(path); }
    }

    // bright rims on my parcels (screen-constant width — ownership must pop)
    if (me) {
      for (const t of store.terrByParcel.values()) {
        if (t.governorId !== me) continue;
        const path = paths.get(t.parcelId);
        if (!path) continue;
        ctx.strokeStyle = rgba(store.color(t.governorId), 0.95);
        ctx.lineWidth = lw(1.6);
        ctx.stroke(path);
      }
    }

    // occupation pulses (expanding rim in the new owner's color)
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pu = pulses[i];
      const k = (now - pu.t0) / PULSE_MS;
      if (k >= 1) { pulses.splice(i, 1); continue; }
      const path = paths.get(pu.parcelId);
      if (!path) continue;
      ctx.strokeStyle = rgba(pu.color, 0.9 * (1 - k));
      ctx.lineWidth = lw(1.5 + 7 * k);
      ctx.stroke(path);
    }

    // hover / selection outlines
    if (selectedParcelId) { // gold: the parcel whose card is open (rail or map click)
      const sp = paths.get(selectedParcelId);
      if (sp) {
        ctx.strokeStyle = 'rgba(217,164,65,0.95)';
        ctx.lineWidth = lw(2);
        ctx.stroke(sp);
      }
    }
    if (hoverParcel && hoverParcel !== selectedParcelId) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = lw(1.4);
      ctx.stroke(paths.get(hoverParcel));
    }

    // garrison markers: friend/foe colored, sized by troop count, co-located
    // armies fanned on a ring (never stacked); ×N badge when 3+ share a parcel
    // (or 2+ collapsed at far zoom). Badges render screen-space after the pass.
    const gl = garrisonLayout();
    const badges = []; // {sx, sy, text, color, alpha}
    for (const [pid, g] of gl.groups) {
      for (const a of g) {
        const p = gl.pos.get(a.id);
        if (!p) continue; // hidden sibling of a collapsed group
        const k = sizeK(a.troops);
        if (a.monsterName) { // wild monster: dark maw + red eye
          dot(p[0], p[1], cap(0.16 * k, 9 * k), '#26161a', '#5c1f1f', lw(0.8));
          ctx.fillStyle = FOE_UNIT;
          ctx.beginPath(); ctx.arc(p[0], p[1], cap(0.055 * k, 3.5 * k), 0, 7); ctx.fill();
        } else {
          dot(p[0], p[1], cap(0.14 * k, 8 * k), unitColor(a.governorId), unitRing(a.governorId), lw(1));
        }
      }
      if (g.length >= (gl.collapsed.has(pid) ? 2 : 3)) {
        const c = store.parcels.get(pid).center;
        const [sx, sy] = toScreen(c[0], c[1]);
        badges.push({ sx: sx + 13, sy: sy - 14, text: `×${g.length}`, color: '#9fb0c4', alpha: 1 });
      }
    }

    // marching armies: dotted remaining path (mine, offset per shared target so
    // parallel/crossing paths stay distinguishable) + chevron; destinations with
    // 2+ incoming armies get a pulsing ⚔ convergence badge (screen-space below).
    const converge = new Map(); // destPid → {n, eta, hostile}
    for (const a of store.armies.values()) {
      if (a.state !== 'MARCHING' || !a.path?.length) continue;
      const dest = a.path[a.path.length - 1];
      let g = converge.get(dest);
      if (g === undefined) converge.set(dest, g = { n: 0, eta: Infinity, hostile: false });
      g.n++;
      if (a.etaTick !== undefined) g.eta = Math.min(g.eta, a.etaTick);
      if (a.governorId !== me) g.hostile = true;
    }
    const pathSeq = new Map(); // destPid → how many path hints already drawn
    for (const a of store.armies.values()) {
      if (a.state !== 'MARCHING' || !a.path?.length) continue;
      const [x, y] = store.armyPos(a);
      const next = store.parcels.get(a.path[0])?.center ?? [x, y];
      if (a.governorId === me || a.id === selectedArmyId) {
        const dest = a.path[a.path.length - 1];
        const i = pathSeq.get(dest) ?? 0;
        pathSeq.set(dest, i + 1);
        const off = Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1); // 0, +1, -1, +2, …
        ctx.save();
        ctx.translate(off * lw(2.6), off * lw(1.8));
        ctx.setLineDash([lw(4), lw(5)]);
        ctx.strokeStyle = rgba(unitColor(a.governorId), 0.55);
        ctx.lineWidth = lw(1.2);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (const pid of a.path) { const c = store.parcels.get(pid)?.center; if (c) ctx.lineTo(c[0], c[1]); }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      chevron(x, y, Math.atan2(next[1] - y, next[0] - x), unitColor(a.governorId), unitRing(a.governorId),
        a.governorId === me, lw, Math.min(1, 55 / cam.s) * sizeK(a.troops));
    }
    for (const [pid, g] of converge) {
      if (g.n < 2) continue;
      const c = store.parcels.get(pid)?.center;
      if (!c) continue;
      const [sx, sy] = toScreen(c[0], c[1]);
      if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) continue;
      const ms = Number.isFinite(g.eta) ? Math.max(0, store.ticksToMs(g.eta - store.tickFloat())) : null;
      const clock = ms === null ? '' : ` · ${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
      badges.push({
        sx, sy: sy - 26,
        text: `⚔ ${g.n} incoming${clock}`,
        color: g.hostile ? FOE_UNIT : MY_UNIT, // red if ANY incoming is hostile to the viewer
        alpha: 0.72 + 0.28 * Math.sin(now / 260),
      });
    }

    // selected army ring (fan-out aware)
    if (selectedArmyId) {
      const a = store.armies.get(selectedArmyId);
      if (a) {
        const wp = (a.state === 'GARRISON' ? gl.pos.get(a.id) : null) ?? store.armyPos(a);
        ctx.strokeStyle = '#6fd6e8';
        ctx.lineWidth = lw(1.6);
        ctx.beginPath(); ctx.arc(wp[0], wp[1], cap(0.3, 17) + 0.04 * Math.sin(now / 180), 0, 7); ctx.stroke();
      }
    }

    // FTUE guide marks: dashed boxes on candidate parcels, pulsing gold+fire on
    // the recommended one, big pulsing ring on the army the player must select
    if (guide) {
      const k = 0.5 + 0.5 * Math.sin(now / 280);
      for (const g of guide.parcels ?? []) {
        const path = paths.get(g.id);
        if (!path) continue;
        if (g.kind === 'recommended') {
          ctx.strokeStyle = `rgba(226,96,63,${0.45 * (1 - k)})`; // fire halo breathing out
          ctx.lineWidth = lw(4 + 6 * k);
          ctx.stroke(path);
          ctx.strokeStyle = `rgba(217,164,65,${0.6 + 0.35 * k})`; // solid gold core
          ctx.lineWidth = lw(2 + 1.4 * k);
          ctx.stroke(path);
        } else {
          ctx.setLineDash([lw(5), lw(4)]);
          ctx.strokeStyle = 'rgba(190,212,238,0.55)';
          ctx.lineWidth = lw(1.3);
          ctx.stroke(path);
          ctx.setLineDash([]);
        }
      }
      if (guide.armyId) {
        const a = store.armies.get(guide.armyId);
        if (a) {
          const [x, y] = store.armyPos(a);
          const r = cap(0.6, 36) * (1 + 0.14 * k);
          ctx.strokeStyle = `rgba(217,164,65,${0.95 - 0.35 * k})`;
          ctx.lineWidth = lw(2.4);
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = lw(1);
          ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, 7); ctx.stroke();
        }
      }
    }

    // retreat path flashes (dashed fading line + sliding chevron)
    for (let i = retreats.length - 1; i >= 0; i--) {
      const r = retreats[i];
      const k = (now - r.t0) / RETREAT_MS;
      if (k >= 1) { retreats.splice(i, 1); continue; }
      const rc = unitColor(r.governorId);
      ctx.setLineDash([lw(3), lw(4)]);
      ctx.strokeStyle = rgba(rc, 0.85 * (1 - k));
      ctx.lineWidth = lw(1.6);
      ctx.beginPath(); ctx.moveTo(r.fx, r.fy); ctx.lineTo(r.tx, r.ty); ctx.stroke();
      ctx.setLineDash([]);
      const p = Math.min(1, k * 1.6); // chevron reaches the refuge early, then the line fades
      chevron(r.fx + (r.tx - r.fx) * p, r.fy + (r.ty - r.fy) * p,
        Math.atan2(r.ty - r.fy, r.tx - r.fx), rc, unitRing(r.governorId),
        store.isMine(r.governorId), lw, Math.min(1, 55 / cam.s));
    }

    // fire + smoke (battle bursts, ~30 s fade)
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i];
      const age = now - f.t0;
      if (age > FIRE_MS) { fires.splice(i, 1); continue; }
      drawFire(f, age / FIRE_MS, now);
    }
    // stalemate gray smoke (no flames — nothing burned, nobody won)
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      const age = now - s.t0;
      if (age > SMOKE_MS) { smokes.splice(i, 1); continue; }
      drawSmoke(s, age / SMOKE_MS, now);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // marker badges (×N stacks, ⚔ convergence) — screen-space pills, crisp at any zoom
    for (const b of badges) {
      ctx.font = '600 10.5px "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(b.text).width;
      const bw = tw + 12, bh = 16;
      const bx = b.sx - bw / 2, by = b.sy - bh / 2;
      ctx.globalAlpha = b.alpha;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 8);
      ctx.fillStyle = 'rgba(13,17,23,0.92)';
      ctx.fill();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e8eef6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, b.sx, by + bh / 2 + 0.5);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // FTUE tag chip ("⚔ recommended") — screen-space so it stays crisp at any zoom
    if (guide?.tag) {
      const c = store.parcels.get(guide.tag.parcelId)?.center;
      if (c) {
        const [sx, sy] = toScreen(c[0], c[1]);
        ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
        const tw = ctx.measureText(guide.tag.text).width;
        const bw = tw + 16, bh = 19;
        const bx = Math.max(4, Math.min(sx - bw / 2, w - bw - 4));
        const by = Math.max(4, sy - 36);
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 9);
        ctx.fillStyle = 'rgba(17,22,29,0.95)';
        ctx.fill();
        ctx.strokeStyle = '#d9a441';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#f0d9a8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(guide.tag.text, bx + bw / 2, by + bh / 2 + 0.5);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  function dot(x, y, r, fill, ring, ringW) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = ring; ctx.lineWidth = ringW;
    ctx.stroke();
  }

  function chevron(x, y, ang, color, ring, mine, lw, k = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(k, k);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0.26, 0); ctx.lineTo(-0.16, 0.15); ctx.lineTo(-0.07, 0); ctx.lineTo(-0.16, -0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ring; // white for mine, owner color for foes (empire identity)
    ctx.lineWidth = lw(mine ? 1.1 : 0.8);
    ctx.stroke();
    ctx.restore();
  }

  function drawFire(f, k, now) {
    const fade = k < 0.08 ? k / 0.08 : 1 - (k - 0.08) / 0.92; // quick flare-up, long die-down
    const m = Math.min(1, 90 / cam.s); // keep the plume parcel-sized at high zoom
    // smoke plume
    for (let i = 0; i < 4; i++) {
      const ph = ((now / 2600 + f.seed + i * 0.29) % 1);
      const sx = f.x + Math.sin((ph + i) * 9 + f.seed) * 0.12 * m;
      const sy = f.y - (0.15 + ph * 0.9) * m;
      ctx.fillStyle = `rgba(120,116,112,${0.20 * fade * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(sx, sy, (0.10 + ph * 0.26) * m, 0, 7); ctx.fill();
    }
    // flames
    for (let i = 0; i < 6; i++) {
      const ph = ((now / 420 + f.seed * 3 + i * 0.37) % 1);
      const fx = f.x + Math.sin(i * 2.4 + f.seed * 5) * 0.11 * m;
      const fy = f.y - ph * 0.22 * m;
      const r = (0.14 - ph * 0.09) * (0.7 + 0.3 * Math.sin(now / 90 + i)) * m;
      ctx.fillStyle = `rgba(${230 - i * 8},${120 - ph * 70 | 0},40,${0.75 * fade * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(fx, fy, Math.max(0.02 * m, r), 0, 7); ctx.fill();
    }
    // ember glow on the ground
    ctx.fillStyle = `rgba(226,96,63,${0.16 * fade})`;
    ctx.beginPath(); ctx.arc(f.x, f.y, 0.42 * m, 0, 7); ctx.fill();
  }

  /** Gray-smoke-only variant of drawFire (stalemate — reuses the plume look). */
  function drawSmoke(s, k, now) {
    const fade = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
    const m = Math.min(1, 90 / cam.s);
    for (let i = 0; i < 5; i++) {
      const ph = ((now / 3100 + s.seed + i * 0.23) % 1);
      const sx = s.x + Math.sin((ph + i) * 8 + s.seed) * 0.14 * m;
      const sy = s.y - (0.08 + ph * 0.8) * m;
      ctx.fillStyle = `rgba(128,132,138,${0.26 * fade * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(sx, sy, (0.12 + ph * 0.24) * m, 0, 7); ctx.fill();
    }
    ctx.fillStyle = `rgba(120,124,130,${0.12 * fade})`; // ash pall on the ground
    ctx.beginPath(); ctx.arc(s.x, s.y, 0.4 * m, 0, 7); ctx.fill();
  }

  // ── frame loop (draw only when needed) ─────────────────────────────────────
  function animating() {
    if (guide) return true; // FTUE marks pulse continuously while set
    if (flight || fires.length || smokes.length || retreats.length || pulses.length || smolders.size) return true;
    for (const a of store.armies.values()) if (a.state === 'MARCHING') return true;
    return false;
  }

  function frame(now) {
    if (flight) {
      const k = Math.min(1, (now - flight.t0) / flight.dur);
      const e = easeInOut(k);
      cam.cx = flight.from.cx + (flight.to.cx - flight.from.cx) * e;
      cam.cy = flight.from.cy + (flight.to.cy - flight.from.cy) * e;
      cam.s = flight.from.s + (flight.to.s - flight.from.s) * e;
      if (k >= 1) flight = null;
      dirty = true;
    }
    if (dirty || animating()) { draw(now); dirty = false; }
    requestAnimationFrame(frame);
  }

  store.onChange(() => { terrain.onStateChange(); dirty = true; });
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return {
    prepare, resize, gotoParcel, flyTo, fireAt, smokeAt, smolderAt, pulseAt, retreatFlash,
    setSelectedArmy(id) { selectedArmyId = id; canvas.classList.toggle('targeting', id !== null); dirty = true; },
    get selectedArmyId() { return selectedArmyId; },
    /** Gold outline mirroring the open parcel card (rail/map selection share it). */
    setSelectedParcel(id) { selectedParcelId = id; dirty = true; },
    get selectedParcelId() { return selectedParcelId; },
    toScreenOf(parcelId) {
      const c = store.parcels.get(parcelId)?.center;
      return c ? toScreen(c[0], c[1]) : [w / 2, h / 2];
    },
    /** World → canvas-local screen px (FTUE coach-marks track map targets with this). */
    worldToScreen(x, y) { return toScreen(x, y); },
    /** Canvas-local screen bbox of a parcel ({x,y,w,h}), or null. */
    parcelRectOf(parcelId) {
      const b = bboxes.get(parcelId);
      if (!b) return null;
      const [x0, y0] = toScreen(b[0], b[1]);
      const [x1, y1] = toScreen(b[2], b[3]);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    get flying() { return flight !== null; },
    /** FTUE guide marks (see `guide` above); pass null to clear. */
    setGuide(g) { guide = g; dirty = true; },
    get texturesReady() { return terrain.texturesReady; },
    get terrainReady() { return terrain.fieldReady; },
    /** Debug/perf hook: average full-frame draw cost in ms over n frames (blit path). */
    profileDraw(n = 60) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) draw(performance.now());
      return (performance.now() - t0) / n;
    },
  };
}
