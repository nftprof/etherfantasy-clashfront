/**
 * 3D WORLD MAP + fog of war + cross-continent travel (docs/maps/WORLD-MAP-AND-SERVER-TRAVEL.md).
 *
 * A rotatable ("turn-table") pseudo-3D view of the whole world: the 12 continents float on THREE
 * vertical tiers — surface (mid), sky/floating islands (above), underworld (below) — positioned by
 * their real worldOffset. Continents you haven't visited are under FOG OF WAR (dimmed + clouded).
 * Each continent shows its name + host city + server. Clicking one opens the TRAVEL panel: moving
 * continent = moving server entirely (all units move, Masters abandon their soldiers), gated by a
 * dock-reserve fee + a continent-travel fee (split land-owner / occupying-warlord / platform-sink).
 *
 * Self-contained: pure Canvas2D (no external 3D lib), embedded zone constitution (source of truth =
 * data/zone-registry.json; this is the rarely-changing world constitution), scoped CSS injected here.
 * The cross-server handoff itself lands with the multi-continent / Tokyo-JP server rollout; this ships
 * the map, the fog, and the travel UX + fee model (wired to balance.json travel dials).
 */

// The 12 continents — mirror of data/zone-registry.json (world constitution; changes rarely).
// worldOffset [x,z]; tier drives vertical stacking; server + city label the shard.
const CONTINENTS = [
  { id:'HUB', name:'Tianxia',   city:'—',        server:'ca', tier:'surface',    biome:'TEMPERATE_GRASS', off:[0,0],      str:100, parcels:60489, sub:'Capital Heartland' },
  { id:'ENT', name:'Mythoria',  city:'Montréal', server:'ca', tier:'surface',    biome:'TEMPERATE_GRASS', off:[-190,-10], str:110, parcels:39776, sub:'Western Carnival Coast', start:true },
  { id:'BUS', name:'Porthaven', city:'Singapore',server:'sg', tier:'surface',    biome:'SWAMP',           off:[40,-200],  str:120, parcels:71654, sub:'Northern Commercial Coast', start:true },
  { id:'EDU', name:'Arcadia',   city:'Tokyo',    server:'jp', tier:'surface',    biome:'TEMPERATE_FOREST',off:[100,150],  str:130, parcels:14035, sub:'Academy Highlands', start:true, soon:true },
  { id:'HS1', name:'Aeropolis', city:'Singapore',server:'sg', tier:'sky',        biome:'TEMPERATE_GRASS', off:[300,100],  str:200, parcels:14417, sub:'Cloud Gateway Isle' },
  { id:'HS2', name:'Emberfall', city:'Singapore',server:'sg', tier:'sky',        biome:'VOLCANIC',        off:[425,175],  str:200, parcels:14145, sub:'Storm & Lava Isle' },
  { id:'HS3', name:'Empyrea',   city:'Singapore',server:'sg', tier:'sky',        biome:'SNOW',            off:[300,245],  str:200, parcels:12337, sub:'High Sanctum Isle' },
  { id:'UW1', name:'Ironhold',  city:'Singapore',server:'sg', tier:'underworld', biome:'SWAMP',           off:[310,-210], str:250, parcels:30148, sub:'Upper Caverns' },
  { id:'UW2', name:'Blackmere', city:'Singapore',server:'sg', tier:'underworld', biome:'VOLCANIC',        off:[475,-210], str:350, parcels:30878, sub:'Deep Caverns' },
  { id:'UW3', name:'Luxuria',   city:'Singapore',server:'sg', tier:'underworld', biome:'VOLCANIC',        off:[600,-210], str:500, parcels:4917,  sub:'Inferno Vault' },
  { id:'CGI', name:'Olympus',   city:'—',        server:'ca', tier:'surface',    biome:'TEMPERATE_GRASS', off:[-120,180], str:100, parcels:0, sub:"Founders' Isle", special:true },
  { id:'KOL', name:'Fortuna',   city:'—',        server:'ca', tier:'surface',    biome:'TEMPERATE_GRASS', off:[-60,220],  str:100, parcels:0, sub:"Influencers' Isle", special:true },
];

// balance.json travel dials (defaults; canon lives in packages/shared/balance.json).
const FEES = { dockReserveFeeCt: 1, continentTravelFeeCt: 3, split: { landOwner: 0.35, occupier: 0.35, platformSink: 0.30 } };
const PORT_BY_TIER = { surface: { name: 'Sea Port', icon: '⚓' }, sky: { name: 'Airship Port', icon: '🎈' }, underworld: { name: 'Underworld Tunnel', icon: '⛏' } };
const TIER_Y = { sky: 1, surface: 0, underworld: -1 };
const BIOME_COL = {
  TEMPERATE_GRASS: ['#6c9a52', '#4d7038'], SWAMP: ['#5a6e46', '#3a4d30'],
  TEMPERATE_FOREST: ['#4f7a44', '#345226'], VOLCANIC: ['#8a4838', '#5a2c22'], SNOW: ['#c6d2d6', '#8fa2ab'],
};

const CSS = `
#world{position:absolute;inset:0;z-index:60;background:radial-gradient(1200px 800px at 50% 30%,#141d2b,#080b12 70%);
  display:flex;flex-direction:column;overflow:hidden}
#world-canvas{flex:1;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#world-canvas.drag{cursor:grabbing}
#world .wm-hud{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:14px;padding:12px 18px;
  background:linear-gradient(#0b0f18cc,transparent);pointer-events:none;z-index:2}
#world .wm-hud h2{margin:0;font:650 16px/1.2 ui-sans-serif,system-ui;color:#e7e3d2;letter-spacing:.3px}
#world .wm-hud .sub{color:#9aa3b0;font:12.5px/1.4 ui-sans-serif,system-ui}
#world .wm-hud .sp{flex:1}
#world .wm-x{pointer-events:auto;cursor:pointer;border:1px solid #2a313c;background:#161a21cc;color:#e7e3d2;
  border-radius:8px;padding:6px 12px;font:13px ui-sans-serif;transition:.12s}
#world .wm-x:hover{border-color:#d9a441;color:#fff}
#world .wm-hint{position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#7f8794;font:12px ui-sans-serif;pointer-events:none;z-index:2}
#world .wm-panel{position:absolute;top:0;right:0;bottom:0;width:min(400px,92vw);z-index:3;overflow-y:auto;
  background:#0f141dF2;border-left:1px solid #2a313c;padding:20px 20px 32px;color:#e7e3d2;
  font:14px/1.55 ui-sans-serif,system-ui;box-shadow:-14px 0 40px #0008}
#world .wm-panel h3{margin:0 0 2px;font-size:17px}
#world .wm-panel .csub{color:#9aa3b0;font-size:12.5px;margin-bottom:14px}
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
#world .wm-panel .go:hover{background:#d9a44133}
#world .wm-panel .go.dim{border-color:#3a4150;color:#7f8794;background:#161a21;cursor:default}
#world .wm-panel .pcls{position:absolute;top:12px;right:14px;cursor:pointer;color:#9aa3b0;font-size:18px}
#world .wm-panel .fog{color:#7f8794;font-style:italic}
`;

export function createWorld({ ui } = {}) {
  const root = document.getElementById('world');
  if (!root) return { open() {}, close() {}, toggle() {} };
  const canvas = document.getElementById('world-canvas');
  const ctx = canvas.getContext('2d');
  const hud = root.querySelector('.wm-hud');
  const panel = root.querySelector('.wm-panel');

  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  hud.innerHTML = `<h2>🌐 The World</h2><span class="sub">drag to orbit · click a continent to travel</span>
    <span class="sp"></span><button class="wm-x">✕ Close</button>`;
  hud.querySelector('.wm-x').style.pointerEvents = 'auto';
  hud.querySelector('.wm-x').onclick = () => close();
  const hint = document.createElement('div'); hint.className = 'wm-hint';
  hint.textContent = 'Surface in the middle · floating islands above · underworld below — fog hides lands you haven’t reached';
  root.appendChild(hint);

  // Which continents the player has reached (fog lifts here). MVP: the player's home continent is
  // known; the rest are fogged until real multi-continent travel exists. Home defaults to Porthaven.
  let visited = new Set(['BUS']);
  let homeId = 'BUS';
  let open_ = false, rot = 0.5, autospin = true, hoverId = null, raf = 0;
  let drag = null; // {x, rot0}

  function setContext(state) {
    // derive the player's home/visited continent from live state if available (parcel zoneCode).
    try {
      const pid = state?.homeParcelId || state?.you?.homeParcelId || state?.armies?.[0]?.parcelId;
      if (pid) { const zc = String(pid).slice(1, 3); const c = CONTINENTS.find(k => zoneCode(k.id) === zc); if (c) { homeId = c.id; visited = new Set([c.id]); } }
    } catch { /* keep default */ }
  }
  function zoneCode(id){ return { BUS:'00',CGI:'01',EDU:'02',ENT:'03',HS1:'04',HS2:'05',HS3:'06',HUB:'07',KOL:'08',UW1:'09',UW2:'10',UW3:'11' }[id]; }

  function resize() {
    const r = root.getBoundingClientRect();
    canvas.width = Math.max(320, r.width | 0); canvas.height = Math.max(320, r.height | 0);
  }

  // pseudo-3D projection: rotate about Y, tilt for iso, stack tiers on Y.
  function project(c, W, H) {
    const sc = Math.min(W, H) / 900;           // world→screen scale
    const tilt = 0.52, tierGap = Math.min(W, H) * 0.17;
    const wx = c.off[0], wz = c.off[1];
    const rx = wx * Math.cos(rot) - wz * Math.sin(rot);
    const rz = wx * Math.sin(rot) + wz * Math.cos(rot);
    const sx = W / 2 + rx * sc;
    const groundY = H / 2 + 60 + rz * sc * tilt;         // where its post meets the surface plane
    const sy = groundY - TIER_Y[c.tier] * tierGap;
    const r = 20 + Math.sqrt(c.parcels || 1) * 0.11 * sc * 8;   // disc radius by parcel count
    return { sx, sy, groundY, r: Math.max(16, r), depth: rz };
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const items = CONTINENTS.map(c => ({ c, p: project(c, W, H) })).sort((a, b) => a.p.depth - b.p.depth);
    // faint surface plane grid line
    ctx.strokeStyle = '#1b2430'; ctx.lineWidth = 1;
    for (const { c, p } of items) {
      const known = visited.has(c.id) && !c.special;
      // tier post (down/up to the surface plane) so the vertical stacking reads
      if (c.tier !== 'surface') {
        ctx.strokeStyle = c.tier === 'sky' ? '#3a527a55' : '#5a2c3a55'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx, p.groundY); ctx.stroke();
        ctx.fillStyle = '#0d1420'; ctx.beginPath(); ctx.ellipse(p.sx, p.groundY, p.r * 0.5, p.r * 0.5 * 0.4, 0, 0, 7); ctx.fill();
      }
      // shadow
      ctx.fillStyle = '#00000055'; ctx.beginPath(); ctx.ellipse(p.sx, p.sy + p.r * 0.42, p.r, p.r * 0.42, 0, 0, 7); ctx.fill();
      // the continent disc (iso ellipse), biome-coloured
      const [top, side] = BIOME_COL[c.biome] || BIOME_COL.TEMPERATE_GRASS;
      const a = known ? 1 : 0.32;
      ctx.globalAlpha = a;
      // side/thickness
      ctx.fillStyle = side; ctx.beginPath(); ctx.ellipse(p.sx, p.sy + p.r * 0.16, p.r, p.r * 0.42, 0, 0, 7); ctx.fill();
      // top face
      ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, p.r, p.r * 0.42, 0, 0, 7); ctx.fill();
      if (c.id === hoverId) { ctx.strokeStyle = '#e8b93c'; ctx.lineWidth = 2.5; ctx.stroke(); }
      if (c.id === homeId) { ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.globalAlpha = 1;
      // fog cloud on unknown lands
      if (!known) {
        ctx.fillStyle = 'rgba(150,165,185,0.20)';
        for (let i = 0; i < 5; i++) { const ang = i / 5 * 6.28; ctx.beginPath(); ctx.ellipse(p.sx + Math.cos(ang) * p.r * 0.5, p.sy - 4 + Math.sin(ang) * p.r * 0.18, p.r * 0.5, p.r * 0.3, 0, 0, 7); ctx.fill(); }
      }
      // port marker (a small icon on visited lands)
      if (known) {
        const port = PORT_BY_TIER[c.tier];
        ctx.font = `${Math.round(p.r * 0.5)}px serif`; ctx.textAlign = 'center';
        ctx.fillText(port.icon, p.sx + p.r * 0.7, p.sy);
      }
      // label
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      if (known) {
        ctx.fillStyle = '#f0ecdd'; ctx.font = '600 13px ui-sans-serif';
        ctx.fillText(c.name, p.sx, p.sy - p.r * 0.42 - 8);
        ctx.fillStyle = '#9aa3b0'; ctx.font = '11px ui-sans-serif';
        ctx.fillText(`${c.city} · ${c.server.toUpperCase()}${c.soon ? ' (soon)' : ''}`, p.sx, p.sy - p.r * 0.42 + 5);
      } else {
        ctx.fillStyle = '#7f8794'; ctx.font = 'italic 11px ui-sans-serif';
        ctx.fillText(c.special ? '✦ prestige isle' : 'beyond the frontier', p.sx, p.sy - p.r * 0.42 - 6);
      }
    }
  }

  function loop() {
    if (!open_) return;
    if (autospin && !drag) rot += 0.0016;
    draw();
    raf = requestAnimationFrame(loop);
  }

  // hit-test: nearest disc under the cursor
  function pick(mx, my) {
    const W = canvas.width, H = canvas.height; let best = null, bd = 1e9;
    for (const c of CONTINENTS) { const p = project(c, W, H); const d = Math.hypot(mx - p.sx, (my - p.sy) / 0.42); if (d < p.r && d < bd) { bd = d; best = c; } }
    return best;
  }
  const relXY = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };

  canvas.addEventListener('pointerdown', (e) => { const [x] = relXY(e); drag = { x, rot0: rot }; autospin = false; canvas.classList.add('drag'); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = relXY(e);
    if (drag) { rot = drag.rot0 + (x - drag.x) * 0.005; return; }
    const c = pick(x, y); const id = c?.id || null; if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? 'pointer' : 'grab'; }
  });
  const endDrag = () => { if (drag && Math.abs(rot - drag.rot0) < 0.01) { /* treat as click handled on up */ } drag = null; canvas.classList.remove('drag'); };
  canvas.addEventListener('pointerup', (e) => {
    const [x, y] = relXY(e);
    const wasClick = drag && Math.abs(rot - drag.rot0) < 0.02;
    endDrag();
    if (wasClick) { const c = pick(x, y); if (c) selectContinent(c); }
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (!drag) { hoverId = null; } });

  function selectContinent(c) {
    const known = visited.has(c.id) && !c.special;
    const isHome = c.id === homeId;
    const total = FEES.dockReserveFeeCt + FEES.continentTravelFeeCt;
    const port = PORT_BY_TIER[c.tier];
    const s = FEES.split;
    panel.hidden = false;
    if (c.special) {
      panel.innerHTML = `<span class="pcls">✕</span><h3>${c.name} <span class="fog">— ${c.sub}</span></h3>
        <div class="csub">A curated prestige isle — no open geometry yet.</div>
        <div class="rule">✦ <b>${c.name}</b> ships no travellable land yet. Its combat role + geometry are owner-TBD.</div>`;
    } else if (isHome) {
      panel.innerHTML = `<span class="pcls">✕</span><h3>${c.name}</h3>
        <div class="csub">${c.sub} · ${c.city} · <b>${c.server.toUpperCase()}</b> server ${c.soon ? '(coming soon)' : ''}</div>
        <div class="rule">📍 This is <b>your home continent</b>. You're already here — sail out from a ${port.name.toLowerCase()} to reach another continent.</div>
        <div class="csub">Avg strength ×${(c.str / 100).toFixed(1)} · ${c.parcels.toLocaleString()} parcels</div>`;
    } else {
      panel.innerHTML = `<span class="pcls">✕</span>
        <h3>Travel to ${c.name}</h3>
        <div class="csub">${c.sub} · ${c.city} · <b>${c.server.toUpperCase()}</b> server ${c.soon ? '(coming soon)' : ''} ${known ? '' : '· <span class="fog">under fog</span>'}</div>
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
    const cls = () => { panel.hidden = true; };
    panel.querySelector('.pcls').onclick = cls;
    const go = panel.querySelector('.go:not(.dim)');
    if (go) go.onclick = cls;
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
