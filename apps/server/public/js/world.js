/**
 * 3D WORLD MAP + fog of war + cross-continent travel (docs/maps/WORLD-MAP-AND-SERVER-TRAVEL.md).
 *
 * A rotatable ("turn-table") pseudo-3D view of the whole world drawn from the REAL extracted
 * landmass outlines (data/zone-outlines.json, computed from the hexagon-city l2 SVGs — the exact
 * zone silhouettes). Layout rules (owner 2026-07-10):
 *   • continents NEVER overlap — surface + sky use their real worldOffsets at true scale;
 *   • the 3 sky isles float separately above; the 3 underworlds are stacked VERTICALLY,
 *     UW1 → UW2 → UW3 each directly below the previous (the boss-gated descent);
 *   • continent NAMES (+ host city/server) are ALWAYS visible — fog of war dims the landmass
 *     and hides interior detail, never the identity;
 *   • a FOG toggle (👁 HUD button, persisted; also ?fog=0) reveals every exact landmass shape;
 *   • clicking a continent shows its name + RESIDENCE POPULACE (estates/singles/total) + travel.
 *
 * Self-contained: pure Canvas2D, scoped CSS injected here. Zone constitution mirrors
 * data/zone-registry.json; outlines fetched from /data/zone-outlines.json (ellipse fallback).
 */

// The 12 continents — mirror of data/zone-registry.json (world constitution; changes rarely).
// off = real worldOffset [x,z]; vb = viewBox [w,h]; depth = vertical tier level (sky +1,
// surface 0, underworld −1/−1.9/−2.7 = the stacked descent). l2/l3 = residence populace.
const CONTINENTS = [
  { id:'HUB', name:'Tianxia',   city:'—',        server:'ca', tier:'surface', depth:0, tag:'the destination · all roads lead here', note:'Tianxia is NOT a starting zone — warlords advance here from their starting continents. (A future Europe/MENA server may start here directly.)', biome:'TEMPERATE_GRASS', off:[0,0],      vb:[358,231], str:100, l2:1744, l3:58745, sub:'Capital Heartland' },
  { id:'ENT', name:'Mythoria',  city:'US West (N) / Montréal (S)', server:'us/ca', tier:'surface', depth:0, tag:'N: US West · S: Montréal', note:'Mythoria is split into two server slices: the NORTH side starts US West players, the SOUTH side starts Montréal players — one continent, two onboarding shores.', biome:'TEMPERATE_GRASS', off:[-230,-10], vb:[290,526], str:110, l2:1492, l3:38284, sub:'Western Carnival Coast', start:true },
  { id:'BUS', name:'Porthaven', city:'Singapore',server:'sg', tier:'surface', depth:0, biome:'SWAMP',           off:[40,-250],  vb:[354,242], str:120, l2:1187, l3:70467, sub:'Northern Commercial Coast', start:true },
  { id:'EDU', name:'Arcadia',   city:'Tokyo',    server:'jp', tier:'surface', depth:0, biome:'TEMPERATE_FOREST',off:[110,265],  vb:[156,148], str:130, l2:372,  l3:13663, sub:'Academy Highlands', start:true },
  { id:'HS1', name:'Aeropolis', city:'Singapore',server:'sg', tier:'sky',     depth:1.05, biome:'TEMPERATE_GRASS', off:[620,-100], vb:[114,116], str:200, l2:346,  l3:14071, sub:'Cloud Gateway Isle' },
  { id:'HS2', name:'Emberfall', city:'Singapore',server:'sg', tier:'sky',     depth:1.0,  biome:'VOLCANIC',        off:[815,20],   vb:[118,116], str:200, l2:451,  l3:13694, sub:'Storm & Lava Isle' },
  { id:'HS3', name:'Empyrea',   city:'Singapore',server:'sg', tier:'sky',     depth:1.4,  biome:'SNOW',            off:[645,215],  vb:[115,117], str:200, l2:464,  l3:11873, sub:'High Sanctum Isle' },
  { id:'UW1', name:'Ironhold',  city:'Singapore',server:'sg', tier:'underworld', depth:-1.35, biome:'SWAMP',    off:[140,60],   vb:[151,151], str:250, l2:1233, l3:28915, sub:'Upper Caverns' },
  { id:'UW2', name:'Blackmere', city:'Singapore',server:'sg', tier:'underworld', depth:-2.0,  biome:'VOLCANIC', off:[140,60],   vb:[150,151], str:350, l2:1101, l3:29777, sub:'Deep Caverns' },
  { id:'UW3', name:'Luxuria',   city:'Singapore',server:'sg', tier:'underworld', depth:-2.6,  biome:'VOLCANIC', off:[184,103],  vb:[63,64],   str:500, l2:92,   l3:4825,  sub:'Inferno Vault' },
  { id:'CGI', name:'Olympus',   city:'—',        server:'ca', tier:'surface', depth:0, biome:'TEMPERATE_GRASS', off:[-38,240],  vb:[60,40],   str:100, l2:0, l3:0, sub:"Founders' Isle", special:true },
  { id:'KOL', name:'Fortuna',   city:'—',        server:'ca', tier:'surface', depth:0, biome:'TEMPERATE_GRASS', off:[8,310],    vb:[60,40],   str:100, l2:0, l3:0, sub:"Influencers' Isle", special:true },
];
// NB: sky offs nudged off their registry values only enough to guarantee visual separation at
// true scale; UW1/UW2 share one center and UW3 sits centered beneath them (the vertical stack).

// balance.json travel dials (defaults; canon lives in packages/shared/balance.json).
const FEES = { dockReserveFeeCt: 1, continentTravelFeeCt: 3, split: { landOwner: 0.35, occupier: 0.35, platformSink: 0.30 } };
const PORT_BY_TIER = { surface: { name: 'Sea Port', icon: '⚓' }, sky: { name: 'Airship Port', icon: '🎈' }, underworld: { name: 'Underworld Tunnel', icon: '⛏' } };

// The travel network — WHERE the ports are and WHERE THEY GO (atlas: HS1 = the airship gateway;
// the Underworld SHAFT sits at HUB's centre; UW descends boss-gated UW1→UW2→UW3).
// Port anchors resolve to the coast vertex of A nearest B (so sea lanes leave from the right shore).
const ROUTES = [
  { a: 'ENT', b: 'BUS', k: 'sea' }, { a: 'BUS', b: 'HUB', k: 'sea' },
  { a: 'HUB', b: 'EDU', k: 'sea' }, { a: 'EDU', b: 'ENT', k: 'sea' },
  { a: 'EDU', b: 'HS1', k: 'air' }, { a: 'HS1', b: 'HS2', k: 'air' }, { a: 'HS1', b: 'HS3', k: 'air' },
  { a: 'HUB', b: 'UW1', k: 'shaft' }, { a: 'UW1', b: 'UW2', k: 'gate' }, { a: 'UW2', b: 'UW3', k: 'gate' },
  // the Diminishing Stair: the carnival's own door — a direct portal Tianxia → Blackmere (single file,
  // souls only, no armies; lore: docs/lore/WORLD-CHRONICLE.md 'The Way Down')
  { a: 'HUB', b: 'UW2', k: 'portal' },
];
const ROUTE_STYLE = { sea: '#5b8fd6', air: '#9ac2ff', shaft: '#c8926a', gate: '#c8624e', portal: '#a678d1' };
const BIOME_COL = {
  TEMPERATE_GRASS: ['#6c9a52', '#42632f'], SWAMP: ['#5a6e46', '#37472b'],
  TEMPERATE_FOREST: ['#4f7a44', '#2f4c22'], VOLCANIC: ['#8a4838', '#54291d'], SNOW: ['#c6d2d6', '#7f929c'],
};

const CSS = `
#world{position:absolute;inset:0;z-index:60;background:radial-gradient(1200px 800px at 50% 30%,#141d2b,#080b12 70%);
  display:flex;flex-direction:column;overflow:hidden}
#world-canvas{flex:1;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#world-canvas.drag{cursor:grabbing}
#world .wm-hud{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:12px;padding:12px 18px;
  background:linear-gradient(#0b0f18cc,transparent);pointer-events:none;z-index:2}
#world .wm-hud h2{margin:0;font:650 16px/1.2 ui-sans-serif,system-ui;color:#e7e3d2;letter-spacing:.3px}
#world .wm-hud .sub{color:#9aa3b0;font:12.5px/1.4 ui-sans-serif,system-ui}
#world .wm-hud .sp{flex:1}
#world .wm-hud button{pointer-events:auto;cursor:pointer;border:1px solid #2a313c;background:#161a21cc;color:#e7e3d2;
  border-radius:8px;padding:6px 12px;font:13px ui-sans-serif;transition:.12s}
#world .wm-hud button:hover{border-color:#d9a441;color:#fff}
#world .wm-hud button.on{border-color:#d9a441;color:#e8b93c}
#world .wm-hint{position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#7f8794;font:12px ui-sans-serif;pointer-events:none;z-index:2}
#world .wm-panel{position:absolute;top:0;right:0;bottom:0;width:min(400px,92vw);z-index:3;overflow-y:auto;
  background:#0f141dF2;border-left:1px solid #2a313c;padding:20px 20px 32px;color:#e7e3d2;
  font:14px/1.55 ui-sans-serif,system-ui;box-shadow:-14px 0 40px #0008}
#world .wm-panel h3{margin:0 0 2px;font-size:17px}
#world .wm-panel .csub{color:#9aa3b0;font-size:12.5px;margin-bottom:12px}
#world .wm-panel .pop{border:1px solid #2a313c;border-radius:10px;overflow:hidden;margin-bottom:14px}
#world .wm-panel .pop .r{display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #20262f;font-size:13px}
#world .wm-panel .pop .r:last-child{border-bottom:0}
#world .wm-panel .pop .r.hd{background:#161c27;font-weight:700}
#world .wm-panel .pop .n{color:#e8b93c}
#world .wm-panel .port{display:flex;align-items:center;gap:8px;background:#161c27;border:1px solid #2a313c;
  border-radius:10px;padding:10px 12px;margin-bottom:14px;font-weight:600}
#world .wm-panel .rule{background:#17130e;border:1px solid #4a3a1e;border-radius:10px;padding:11px 13px;margin-bottom:12px;font-size:13px}
#world .wm-panel .rule b{color:#e8b93c}
#world .wm-panel .fees{border:1px solid #2a313c;border-radius:10px;overflow:hidden;margin-bottom:14px}
#world .wm-panel .fees .r{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #20262f;font-size:13px}
#world .wm-panel .fees .r:last-child{border-bottom:0}
#world .wm-panel .fees .r.tot{background:#161c27;font-weight:700}
#world .wm-panel .fees .r .ct{color:#e8b93c}
#world .wm-panel .split{font-size:12px;color:#9aa3b0;margin:-6px 0 14px}
#world .wm-panel .go{display:block;width:100%;text-align:center;border:1px solid #d9a441;background:#d9a44122;
  color:#e8b93c;border-radius:10px;padding:11px;font:600 14px ui-sans-serif;cursor:pointer;transition:.12s}
#world .wm-panel .go.dim{border-color:#3a4150;color:#7f8794;background:#161a21;cursor:default}
#world .wm-panel .pcls{position:absolute;top:12px;right:14px;cursor:pointer;color:#9aa3b0;font-size:18px}
#world .wm-panel .fogtag{color:#7f8794;font-style:italic}
`;

export function createWorld({ ui } = {}) {
  const root = document.getElementById('world');
  if (!root) return { open() {}, close() {}, toggle() {} };
  const canvas = document.getElementById('world-canvas');
  const ctx = canvas.getContext('2d');
  const hud = root.querySelector('.wm-hud');
  const panel = root.querySelector('.wm-panel');

  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  // fog flag: persisted; ?fog=0 forces reveal (owner/debug)
  let fogOn = localStorage.getItem('cf_world_fog') !== '0';
  if (new URLSearchParams(location.search).get('fog') === '0') fogOn = false;

  hud.innerHTML = `<h2>🌐 The World</h2><span class="sub">drag to orbit · click a continent</span>
    <span class="sp"></span>
    <button class="wm-fog"></button>
    <button class="wm-x">✕ Close</button>`;
  const fogBtn = hud.querySelector('.wm-fog');
  const syncFogBtn = () => { fogBtn.textContent = fogOn ? '👁 Fog of war: ON' : '👁 Fog of war: OFF'; fogBtn.classList.toggle('on', !fogOn); };
  syncFogBtn();
  fogBtn.onclick = () => { fogOn = !fogOn; localStorage.setItem('cf_world_fog', fogOn ? '1' : '0'); syncFogBtn(); };
  hud.querySelector('.wm-x').onclick = () => close();
  const hint = document.createElement('div'); hint.className = 'wm-hint';
  hint.textContent = 'Surface in the middle · sky isles above · the underworld descends below (UW1 → UW2 → UW3)';
  root.appendChild(hint);

  // real landmass outlines (exact zone silhouettes) — fetched once; ellipse fallback until loaded
  let OUTLINES = null;
  fetch('/data/zone-outlines.json').then(r => r.ok ? r.json() : null).then(j => { OUTLINES = j; }).catch(() => {});

  // Which continents the player has reached (fog lifts). Home defaults to Porthaven.
  let visited = new Set(['BUS']);
  let homeId = 'BUS';
  let open_ = false, rot = 0.35, autospin = true, hoverId = null, raf = 0;
  let drag = null;

  function setContext(state) {
    try {
      const pid = state?.homeParcelId || state?.you?.homeParcelId;
      if (pid) { const zc = String(pid).slice(1, 3); const c = CONTINENTS.find(k => zoneCode(k.id) === zc); if (c) { homeId = c.id; visited = new Set([c.id]); } }
    } catch { /* keep default */ }
  }
  function zoneCode(id){ return { BUS:'00',CGI:'01',EDU:'02',ENT:'03',HS1:'04',HS2:'05',HS3:'06',HUB:'07',KOL:'08',UW1:'09',UW2:'10',UW3:'11' }[id]; }

  function resize() {
    const r = root.getBoundingClientRect();
    canvas.width = Math.max(320, r.width | 0); canvas.height = Math.max(320, r.height | 0);
  }

  // world extent for framing/rotation pivot (surface+sky only; UW stack sits inside it)
  const PIVOT = { x: 280, z: 120 };
  const TILT = 0.5;

  /** outline (or ellipse fallback) → array of world [x,z] pts for a continent */
  function shapePts(c) {
    const o = OUTLINES && OUTLINES[c.id];
    if (o && o.outline && o.outline.length > 2) return o.outline.map(([x, y]) => [c.off[0] + x, c.off[1] + y]);
    const [w, h] = c.vb, cx = c.off[0] + w / 2, cz = c.off[1] + h / 2, n = 20, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * w / 2, cz + Math.sin(a) * h / 2]); }
    return pts;
  }

  function projectPt(wx, wz, depth, W, H, sc, tierGap) {
    const dx = wx - PIVOT.x, dz = wz - PIVOT.z;
    const rx = dx * Math.cos(rot) - dz * Math.sin(rot);
    const rz = dx * Math.sin(rot) + dz * Math.cos(rot);
    return { sx: W / 2 + rx * sc, sy: H / 2 + 4 + rz * sc * TILT - depth * tierGap, rz };
  }

  function contMeta(c, W, H) {
    const sc = Math.min(W / 1300, H / 840);
    const tierGap = Math.min(W, H) * 0.16;
    const pts = shapePts(c).map(([x, z]) => projectPt(x, z, c.depth, W, H, sc, tierGap));
    let sx = 0, sy = 0, rz = 0, minY = 1e9;
    for (const p of pts) { sx += p.sx; sy += p.sy; rz += p.rz; if (p.sy < minY) minY = p.sy; }
    const n = pts.length;
    const ground = projectPt(c.off[0] + c.vb[0] / 2, c.off[1] + c.vb[1] / 2, 0, W, H, sc, tierGap);
    return { pts, cx: sx / n, cy: sy / n, depthKey: rz / n - c.depth * 1000, topY: minY, groundY: ground.sy, sc };
  }

  function tracePoly(pts, dy = 0) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy + dy) : ctx.moveTo(p.sx, p.sy + dy)); ctx.closePath(); }

  /** the coast vertex of continent A nearest continent B's centroid → the port anchor (world XZ) */
  function portAnchor(a, b) {
    const pts = shapePts(a);
    const bc = { x: b.off[0] + b.vb[0] / 2, z: b.off[1] + b.vb[1] / 2 };
    let best = pts[0], bd = 1e18;
    for (const [x, z] of pts) { const d = (x - bc.x) ** 2 + (z - bc.z) ** 2; if (d < bd) { bd = d; best = [x, z]; } }
    return best;
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const sc = Math.min(W / 1300, H / 840);
    const tierGap = Math.min(W, H) * 0.16;
    const byId = new Map(CONTINENTS.map(c => [c.id, c]));
    const metas = new Map(CONTINENTS.map(c => [c.id, contMeta(c, W, H)]));
    const known = (c) => !fogOn || (visited.has(c.id) && !c.special);

    // ── ocean plane under the surface tier (so the surface reads as a real sea map) ──
    const surf = CONTINENTS.filter(c => c.depth === 0 && !c.special);
    let ocx = 0, ocz = 0; for (const c of surf) { ocx += c.off[0] + c.vb[0] / 2; ocz += c.off[1] + c.vb[1] / 2; }
    ocx /= surf.length; ocz /= surf.length;
    const oc = projectPt(ocx, ocz, 0, W, H, sc, tierGap);
    const og = ctx.createRadialGradient(oc.sx, oc.sy, 40, oc.sx, oc.sy, 520 * sc);
    og.addColorStop(0, 'rgba(38,70,105,0.55)'); og.addColorStop(0.8, 'rgba(24,44,68,0.35)'); og.addColorStop(1, 'rgba(24,44,68,0)');
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.ellipse(oc.sx, oc.sy, 660 * sc, 660 * sc * TILT, 0, 0, 7); ctx.fill();

    // route geometry (port anchors, projected at each side's depth)
    const routes = ROUTES.map(r => {
      const A = byId.get(r.a), B = byId.get(r.b);
      const vertical = r.k === 'shaft' || r.k === 'gate' || r.k === 'portal';
      const pa = vertical ? [A.off[0] + A.vb[0] / 2, A.off[1] + A.vb[1] / 2] : portAnchor(A, B);
      const pb = vertical ? [B.off[0] + B.vb[0] / 2, B.off[1] + B.vb[1] / 2] : portAnchor(B, A);
      return { ...r, A, B,
        a1: projectPt(pa[0], pa[1], A.depth, W, H, sc, tierGap),
        b1: projectPt(pb[0], pb[1], B.depth, W, H, sc, tierGap) };
    });

    // routes UNDER the landmasses (sea lanes), verticals drawn with their tier
    const drawRoute = (r) => {
      const dim = !(known(r.A) && known(r.B));
      ctx.globalAlpha = dim ? 0.35 : 0.8;
      ctx.strokeStyle = ROUTE_STYLE[r.k]; ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]);
      ctx.beginPath();
      if (r.k === 'air') { // arced airship line
        const mx = (r.a1.sx + r.b1.sx) / 2, my = Math.min(r.a1.sy, r.b1.sy) - 26;
        ctx.moveTo(r.a1.sx, r.a1.sy); ctx.quadraticCurveTo(mx, my, r.b1.sx, r.b1.sy);
      } else {
        ctx.moveTo(r.a1.sx, r.a1.sy); ctx.lineTo(r.b1.sx, r.b1.sy);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    };
    for (const r of routes) if (r.k === 'sea') drawRoute(r);

    const items = CONTINENTS.map(c => ({ c, m: metas.get(c.id) }))
      .sort((a, b) => (a.c.depth - b.c.depth) || (a.m.depthKey - b.m.depthKey)); // deep→high, back→front

    for (const { c, m } of items) {
      const kn = known(c);
      const [top, side] = BIOME_COL[c.biome] || BIOME_COL.TEMPERATE_GRASS;
      const thick = 7 + (c.tier === 'underworld' ? 3 : 0);

      // drop shadow
      ctx.fillStyle = '#00000044'; tracePoly(m.pts, thick + 6); ctx.fill();
      // extruded side skirt
      ctx.globalAlpha = kn ? 1 : 0.4;
      ctx.fillStyle = side; tracePoly(m.pts, thick); ctx.fill();
      // top face — the exact landmass shape, with a coastline stroke
      ctx.fillStyle = top; tracePoly(m.pts, 0); ctx.fill();
      ctx.strokeStyle = kn ? 'rgba(230,225,205,0.35)' : 'rgba(230,225,205,0.15)'; ctx.lineWidth = 1; ctx.stroke();
      if (c.id === hoverId) { ctx.strokeStyle = '#e8b93c'; ctx.lineWidth = 2.5; tracePoly(m.pts, 0); ctx.stroke(); }
      if (c.id === homeId) { ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2.5; tracePoly(m.pts, 0); ctx.stroke(); }
      ctx.globalAlpha = 1;
      // fog haze — dims features, never the shape or the name
      if (!kn) {
        ctx.save(); tracePoly(m.pts, 0); ctx.clip();
        ctx.fillStyle = 'rgba(140,155,175,0.26)'; ctx.fillRect(m.cx - 600, m.topY - 40, 1200, 900);
        ctx.restore();
      }
      // vertical routes leaving THIS continent (shaft/gates render with the stack)
      for (const r of routes) if ((r.k === 'shaft' || r.k === 'gate' || r.k === 'portal') && r.a === c.id) drawRoute(r);
      for (const r of routes) if (r.k === 'air' && (r.a === c.id)) drawRoute(r);

      // ── labels: the NAME is ALWAYS shown (fog never hides identity) ──
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const ly = m.topY - 10;
      ctx.fillStyle = kn ? '#f0ecdd' : '#c9c4b4'; ctx.font = '600 13.5px ui-sans-serif';
      ctx.fillText(c.name, m.cx, ly - 13);
      ctx.fillStyle = '#9aa3b0'; ctx.font = '11px ui-sans-serif';
      const tag = c.special ? '✦ prestige isle'
        : (c.tag || `${c.city} · ${c.server.toUpperCase()}${c.soon ? ' (soon)' : ''}`);
      ctx.fillText(tag, m.cx, ly);
      if (!kn && !c.special) { ctx.fillStyle = '#7f8794'; ctx.font = 'italic 10px ui-sans-serif'; ctx.fillText('unexplored', m.cx, ly + 12); }
    }

    // ── port markers ON TOP: exactly where each route leaves/lands ──
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const seen = new Set();
    for (const r of routes) {
      for (const [end, cont] of [[r.a1, r.A], [r.b1, r.B]]) {
        const key = `${cont.id}:${Math.round(end.sx)}:${Math.round(end.sy)}`;
        if (seen.has(key)) continue; seen.add(key);
        const kn = known(cont);
        ctx.globalAlpha = kn ? 1 : 0.4;
        ctx.fillStyle = '#0b0f18'; ctx.beginPath(); ctx.arc(end.sx, end.sy, 9, 0, 7); ctx.fill();
        ctx.strokeStyle = ROUTE_STYLE[r.k]; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = '10px serif';
        ctx.fillStyle = '#e7e3d2';
        ctx.fillText(PORT_BY_TIER[cont.tier].icon, end.sx, end.sy + 0.5);
        ctx.globalAlpha = 1;
      }
    }
    ctx.textBaseline = 'alphabetic';
  }

  function loop() {
    if (!open_) return;
    if (autospin && !drag) rot += 0.0012;
    draw();
    raf = requestAnimationFrame(loop);
  }

  function pick(mx, my) {
    const W = canvas.width, H = canvas.height;
    // front-most first: reverse draw order
    const items = CONTINENTS.map(c => ({ c, m: contMeta(c, W, H) }))
      .sort((a, b) => (b.c.depth - a.c.depth) || (b.m.depthKey - a.m.depthKey));
    for (const { c, m } of items) {
      tracePoly(m.pts, 0);
      if (ctx.isPointInPath(mx, my)) return c;
    }
    return null;
  }
  const relXY = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };

  canvas.addEventListener('pointerdown', (e) => { const [x] = relXY(e); drag = { x, rot0: rot }; autospin = false; canvas.classList.add('drag'); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = relXY(e);
    if (drag) { rot = drag.rot0 + (x - drag.x) * 0.005; return; }
    const c = pick(x, y); const id = c?.id || null; if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? 'pointer' : 'grab'; }
  });
  const endDrag = () => { drag = null; canvas.classList.remove('drag'); };
  canvas.addEventListener('pointerup', (e) => {
    const [x, y] = relXY(e);
    const wasClick = drag && Math.abs(rot - drag.rot0) < 0.02;
    endDrag();
    if (wasClick) { const c = pick(x, y); if (c) selectContinent(c); }
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (!drag) hoverId = null; });

  function popRows(c) {
    return `<div class="pop">
      <div class="r hd"><span>Residence populace</span><span></span></div>
      <div class="r"><span>Estates (L2)</span><span class="n">${c.l2.toLocaleString()}</span></div>
      <div class="r"><span>Single parcels (L3)</span><span class="n">${c.l3.toLocaleString()}</span></div>
      <div class="r"><span>Total lands</span><span class="n">${(c.l2 + c.l3).toLocaleString()}</span></div>
      <div class="r"><span>Avg wild strength</span><span class="n">×${(c.str / 100).toFixed(1)}</span></div>
    </div>`;
  }

  function selectContinent(c) {
    const known = visited.has(c.id) && !c.special;
    const isHome = c.id === homeId;
    const total = FEES.dockReserveFeeCt + FEES.continentTravelFeeCt;
    const port = PORT_BY_TIER[c.tier];
    const s = FEES.split;
    panel.hidden = false;
    if (c.special) {
      panel.innerHTML = `<span class="pcls">✕</span><h3>${c.name} <span class="fogtag">— ${c.sub}</span></h3>
        <div class="csub">A curated prestige isle — no open geometry yet.</div>
        <div class="rule">✦ <b>${c.name}</b> is <b>TELEPORT-only</b> — no sea route or port leads here; there is no direct path. Arrival is by teleport/invitation. (Combat role + geometry owner-TBD.)</div>`;
    } else if (isHome) {
      panel.innerHTML = `<span class="pcls">✕</span><h3>${c.name}</h3>
        <div class="csub">${c.sub} · ${c.city} · <b>${c.server.toUpperCase()}</b> server ${c.soon ? '(coming soon)' : ''}</div>
        ${popRows(c)}
        ${c.note ? `<div class="rule">ℹ ${c.note}</div>` : ''}
        <div class="rule">📍 This is <b>your home continent</b>. You're already here — sail out from a ${port.name.toLowerCase()} to reach another continent.</div>`;
    } else {
      panel.innerHTML = `<span class="pcls">✕</span>
        <h3>Travel to ${c.name}</h3>
        <div class="csub">${c.sub} · ${c.city} · <b>${c.server.toUpperCase()}</b> server ${c.soon ? '(coming soon)' : ''} ${known ? '' : '· <span class="fogtag">unexplored</span>'}</div>
        ${popRows(c)}
        ${c.note ? `<div class="rule">ℹ ${c.note}</div>` : ''}
        <div class="port">${port.icon} ${port.name} <span style="color:#9aa3b0;font-weight:400;font-size:12px">— units gather here for travel</span></div>
        <div class="rule">🚢 <b>Moving continent = moving server entirely.</b><br>
          • <b>All your units must be on the map</b>, and <b>all move together</b>.<br>
          • Your <b>Masters travel with you</b> — but <b>abandon every soldier</b> they command (left behind).<br>
          • A port only opens for business when <b>no battle is active</b> on the dock land.</div>
        <div class="fees">
          <div class="r"><span>⚓ Reserve a dock</span><span class="ct">${FEES.dockReserveFeeCt} CT</span></div>
          <div class="r"><span>${port.icon} Cross to ${c.name} (server move)</span><span class="ct">${FEES.continentTravelFeeCt} CT</span></div>
          <div class="r tot"><span>Total</span><span class="ct">${total} CT</span></div>
        </div>
        <div class="split">Fees split — land owner ${(s.landOwner*100)|0}% · occupying warlord ${(s.occupier*100)|0}% · platform sink ${(s.platformSink*100)|0}% (≥10% burns, decision 17).</div>
        <div class="go dim" title="lands with the multi-continent server rollout">⚓ Reserve dock & travel — coming with multi-server launch</div>
        <div class="csub" style="margin-top:10px">On a dock land the march menu gains a third option:
          <b>March</b> / <b>March &amp; Command</b> / <b>${port.icon} ${port.name}</b> (gather units to travel).</div>`;
    }
    panel.querySelector('.pcls').onclick = () => { panel.hidden = true; };
  }

  function open(state) {
    if (state) setContext(state);
    root.hidden = false; open_ = true; autospin = true; panel.hidden = true;
    resize(); cancelAnimationFrame(raf); loop();
  }
  function close() { open_ = false; root.hidden = true; cancelAnimationFrame(raf); }
  function toggle(state) { open_ ? close() : open(state); }
  window.addEventListener('resize', () => { if (open_) resize(); });
  document.addEventListener('keydown', (e) => { if (open_ && e.key === 'Escape') close(); });

  return { open, close, toggle };
}
