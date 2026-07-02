/**
 * Canvas2D overworld renderer (docs/map-engine/01 §2b/§3/§4, MVP v0: one zone,
 * no tiling). Camera pan/zoom/goto-fly, HiDPI, and a rAF gate: frames are drawn
 * only when state/camera changed or an animation (march, fire, flight) runs.
 *
 * Ambient viz: battles = fire+smoke burst (~30s fade), stalemates = gray smoke
 * only (docs/04 §7c TIE — nothing burned, nobody won), retreats = fading dashed
 * line + sliding chevron, pillage = smoldering tint (~60s), occupation = color
 * pulse; wild parcels get bush speckle; monster garrisons a red-eye dot.
 */
import { easeInOut, pointInPoly, rgba, shade } from './util.js';

const FIRE_MS = 30_000;
const SMOKE_MS = 18_000;
const SMOLDER_MS = 60_000;
const PULSE_MS = 1500;
const RETREAT_MS = 4200;
const WILD_FILL = '#1d2420';
const NEUTRAL_STROKE = 'rgba(160,180,200,0.10)';

export function createMap(canvas, store, handlers) {
  const ctx = canvas.getContext('2d');
  let dpr = 1, w = 0, h = 0;
  const cam = { cx: 0, cy: 0, s: 20 };
  let fitScale = 20;
  let flight = null;               // {t0,dur,from:{cx,cy,s},to:{cx,cy,s}}
  let dirty = true;
  let hoverParcel = null;
  let selectedArmyId = null;

  const fires = [];                // {x,y,t0,seed}
  const smokes = [];               // {x,y,t0,seed} — stalemate: smoke only, no fire
  const smolders = new Map();      // parcelId → t0
  const pulses = [];               // {parcelId,t0,color}
  const retreats = [];             // {fx,fy,tx,ty,t0,color} — retreat path flash

  // per-parcel precomputed geometry
  const paths = new Map();         // parcelId → Path2D (world coords)
  const bboxes = new Map();        // parcelId → [minx,miny,maxx,maxy]
  const bushDots = new Map();      // parcelId → [[x,y,r],…] wild speckle

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
      // deterministic speckle from parcelId hash (bush/wild texture feel)
      let hsh = 2166136261;
      for (const c of p.id) hsh = (hsh ^ c.charCodeAt(0)) * 16777619 >>> 0;
      const dots = [];
      for (let i = 0; i < 4; i++) {
        hsh = (hsh * 1664525 + 1013904223) >>> 0;
        const fx = ax + ((hsh >>> 8) % 1000) / 1000 * (bx - ax);
        hsh = (hsh * 1664525 + 1013904223) >>> 0;
        const fy = ay + ((hsh >>> 8) % 1000) / 1000 * (by - ay);
        if (pointInPoly(p.polygon, fx, fy)) dots.push([fx, fy, 0.03 + (hsh % 5) * 0.008]);
      }
      bushDots.set(p.id, dots);
    }
    worldBBox = [mnx, mny, mxx, mxy];
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

  /** Nearest own army dot within `px` screen pixels (marching armies picked over garrisons). */
  function pickArmy(sx, sy, px = 13) {
    let best = null, bestD = px;
    for (const a of store.armies.values()) {
      if (!store.isMine(a.governorId)) continue;
      const [x, y] = store.armyPos(a);
      const [ax, ay] = toScreen(x, y);
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
  /** Brief flash of an army's retreat line (fromParcel → toParcel). */
  function retreatFlash(fromParcelId, toParcelId, color) {
    const f = store.parcels.get(fromParcelId)?.center;
    const t = store.parcels.get(toParcelId)?.center;
    if (f && t) { retreats.push({ fx: f[0], fy: f[1], tx: t[0], ty: t[1], t0: performance.now(), color }); dirty = true; }
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

    // parcels
    for (const p of store.parcels.values()) {
      const t = store.terrByParcel.get(p.id);
      const path = paths.get(p.id);
      const wild = !t || t.governorKind === 'SYSTEM';
      const mine = t && t.governorId === me;
      let fill = wild ? WILD_FILL : shade(store.color(t.governorId), mine ? -0.28 : -0.5);
      ctx.fillStyle = fill;
      ctx.fill(path);
      const sm = smolders.get(p.id);
      if (sm !== undefined) {
        const k = 1 - (now - sm) / SMOLDER_MS;
        if (k <= 0) smolders.delete(p.id);
        else { ctx.fillStyle = `rgba(12,6,4,${0.62 * k})`; ctx.fill(path); }
      }
      ctx.strokeStyle = mine ? rgba(store.color(t.governorId), 0.95) : wild ? NEUTRAL_STROKE : rgba(store.color(t.governorId), 0.4);
      ctx.lineWidth = lw(mine ? 1.6 : 0.7);
      ctx.stroke(path);
      if (wild) {
        ctx.fillStyle = 'rgba(96,128,88,0.26)'; // bush speckle
        for (const [x, y, r] of bushDots.get(p.id) ?? []) {
          ctx.beginPath(); ctx.arc(x, y, cap(r, 3.5), 0, 7); ctx.fill();
        }
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
    if (hoverParcel) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = lw(1.4);
      ctx.stroke(paths.get(hoverParcel));
    }

    // garrison presence dots
    for (const t of store.terrByParcel.values()) {
      const c = store.parcels.get(t.parcelId)?.center;
      if (!c || !t.garrison) continue;
      if (t.garrison.monsterName) { // wild monster: dark maw + red eye
        dot(c[0], c[1], cap(0.16, 9), '#26161a', '#5c1f1f', lw(0.8));
        ctx.fillStyle = '#e0483c';
        ctx.beginPath(); ctx.arc(c[0], c[1], cap(0.055, 3.5), 0, 7); ctx.fill();
      } else {
        dot(c[0], c[1], cap(0.14, 8), store.color(t.garrison.governorId), 'rgba(0,0,0,0.55)', lw(0.8));
      }
    }
    // extra own garrisons stacked on a parcel (beyond the territory garrison slot)
    for (const a of store.armies.values()) {
      if (a.state !== 'GARRISON') continue;
      const t = store.terrByParcel.get(a.parcelId);
      if (t?.garrison?.armyId === a.id) continue;
      const c = store.parcels.get(a.parcelId)?.center;
      if (c) dot(c[0] + cap(0.22, 12), c[1] - cap(0.18, 10), cap(0.11, 6.5), store.color(a.governorId), 'rgba(0,0,0,0.55)', lw(0.8));
    }

    // marching armies: dotted remaining path (mine) + chevron
    for (const a of store.armies.values()) {
      if (a.state !== 'MARCHING' || !a.path?.length) continue;
      const [x, y] = store.armyPos(a);
      const next = store.parcels.get(a.path[0])?.center ?? [x, y];
      if (a.governorId === me || a.id === selectedArmyId) {
        ctx.setLineDash([lw(4), lw(5)]);
        ctx.strokeStyle = rgba(store.color(a.governorId), 0.5);
        ctx.lineWidth = lw(1.2);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (const pid of a.path) { const c = store.parcels.get(pid)?.center; if (c) ctx.lineTo(c[0], c[1]); }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      chevron(x, y, Math.atan2(next[1] - y, next[0] - x), store.color(a.governorId), a.governorId === me, lw,
        Math.min(1, 55 / cam.s));
    }

    // selected army ring
    if (selectedArmyId) {
      const a = store.armies.get(selectedArmyId);
      if (a) {
        const [x, y] = store.armyPos(a);
        ctx.strokeStyle = '#6fd6e8';
        ctx.lineWidth = lw(1.6);
        ctx.beginPath(); ctx.arc(x, y, cap(0.3, 17) + 0.04 * Math.sin(now / 180), 0, 7); ctx.stroke();
      }
    }

    // retreat path flashes (dashed fading line + sliding chevron)
    for (let i = retreats.length - 1; i >= 0; i--) {
      const r = retreats[i];
      const k = (now - r.t0) / RETREAT_MS;
      if (k >= 1) { retreats.splice(i, 1); continue; }
      ctx.setLineDash([lw(3), lw(4)]);
      ctx.strokeStyle = rgba(r.color, 0.85 * (1 - k));
      ctx.lineWidth = lw(1.6);
      ctx.beginPath(); ctx.moveTo(r.fx, r.fy); ctx.lineTo(r.tx, r.ty); ctx.stroke();
      ctx.setLineDash([]);
      const p = Math.min(1, k * 1.6); // chevron reaches the refuge early, then the line fades
      chevron(r.fx + (r.tx - r.fx) * p, r.fy + (r.ty - r.fy) * p,
        Math.atan2(r.ty - r.fy, r.tx - r.fx), r.color, false, lw, Math.min(1, 55 / cam.s));
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
  }

  function dot(x, y, r, fill, ring, ringW) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = ring; ctx.lineWidth = ringW;
    ctx.stroke();
  }

  function chevron(x, y, ang, color, mine, lw, k = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(k, k);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0.26, 0); ctx.lineTo(-0.16, 0.15); ctx.lineTo(-0.07, 0); ctx.lineTo(-0.16, -0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = mine ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)';
    ctx.lineWidth = lw(mine ? 1.1 : 0.7);
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

  store.onChange(() => { dirty = true; });
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return {
    prepare, resize, gotoParcel, flyTo, fireAt, smokeAt, smolderAt, pulseAt, retreatFlash,
    setSelectedArmy(id) { selectedArmyId = id; canvas.classList.toggle('targeting', id !== null); dirty = true; },
    get selectedArmyId() { return selectedArmyId; },
    toScreenOf(parcelId) {
      const c = store.parcels.get(parcelId)?.center;
      return c ? toScreen(c[0], c[1]) : [w / 2, h / 2];
    },
  };
}
