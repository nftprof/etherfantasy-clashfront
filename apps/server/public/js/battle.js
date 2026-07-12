/**
 * LIVE wild-battle viewer + steering overlay (docs/04 §7b wild row).
 *
 * A near-fullscreen panel over the map: Canvas2D top-down battlefield in the
 * parcel's own shape (painterly terrain: tree lobes, boulders, pond), the one
 * lane subtly indicated, towers with range rings + HP bars, mob camps, attacker
 * waves pushing from the map edge, the Master distinct (gold ring + banner).
 *
 * Data flow: WS battle channel — {t:'battle_sub'} → battle_hello (static field
 * + first snapshot) → battle_tick frames at 4 Hz → battle_end. Rendering
 * interpolates between the last two snapshots for smooth motion.
 *
 * Steering (attacking owner only): click = move Master, click an enemy =
 * focus fire, right-click = rally point for the waves. Mouse-only.
 */
import { avatarHtml, esc } from './util.js';

const ATK = '#4da3ff';
const ATK_RING = 'rgba(255,255,255,0.75)';
const FOE = '#e0483c';
const GOLD = '#ffd76a';

export function createBattle({ store, ui, send, ftue }) {
  const root = document.getElementById('battle');
  const hud = root.querySelector('.bt-hud');
  const stage = root.querySelector('.bt-stage');
  const canvas = document.getElementById('battle-canvas');
  const foot = root.querySelector('.bt-foot');
  const ctx = canvas.getContext('2d');

  // ── first-time Command-Mode mini-coach (docs/04 §7b "two control surfaces") ──
  // 3 beats spotlighting INSIDE the overlay, advancing on REAL actions; once
  // per player (`tip:<pid>:cmdmode`), replayable from the 📖 library.
  const COACH_BEATS = [
    { title: '⚔ Command Mode', next: true,
      text: 'This battle is <b>live</b>. Your <b>waves</b>, your Master\u2019s <b>runs</b> and the <b>clock</b> are up here.' },
    { title: '🎮 Your Master',
      text: '<b>Click the ground</b> to move your Master. <b>Click an enemy</b> to focus fire.', hint: 'try it —' },
    { title: '🚩 Rally the waves',
      text: '<b>Right-click</b> sets the rally point for your waves. Win: <b>destroy the towers</b> or <b>clear every mob</b>.', hint: 'right-click —' },
  ];
  let coach = null;        // {beat} while the mini-coach runs
  let coachTimer = null;
  let coachPending = false; // library replay requested with no steerable view open
  const coachEl = document.createElement('div');
  coachEl.className = 'bt-coach';
  coachEl.hidden = true;
  stage.appendChild(coachEl);

  // ── Recently-resolved review panel (docs/04 §7b) ────────────────────────────
  // A post-resolution result/replay surface reusing the #battle overlay chrome.
  // Its markup lives in this .review-panel; its scoped CSS is injected once here
  // (deliberately NOT in app.css — the visual session owns that file).
  const reviewEl = document.createElement('div');
  reviewEl.className = 'review-panel';
  reviewEl.hidden = true;
  root.appendChild(reviewEl);
  injectReviewStyles();

  // ── ⓘ Map legend (command-mode sprint #1) ──────────────────────────────────
  // Owner: "not sure what the grey dots on the screen are". Collapsible panel
  // explaining every mark the renderer draws; swatches use the renderer's own
  // palette constants so they can't drift. Scoped CSS injected here (app.css
  // untouched — the visual session owns that file).
  let legendOpen = false;
  const legendEl = document.createElement('div');
  legendEl.className = 'bt-legend';
  legendEl.hidden = true;
  legendEl.innerHTML =
    `<b>Map legend</b>` +
    `<div class="lg-row"><span class="lg-dot" style="background:#5a5f66"></span> Rocks / boulders — block movement</div>` +
    `<div class="lg-row"><span class="lg-dot" style="background:#25421c"></span> Forest — blocks movement</div>` +
    `<div class="lg-row"><span class="lg-dot" style="background:#27506b"></span> Water</div>` +
    `<div class="lg-row"><span class="lg-line" style="background:${ATK}"></span> Your side (blue): units · towers · core</div>` +
    `<div class="lg-row"><span class="lg-line" style="background:${FOE}"></span> Enemy side (red): units · towers · core</div>` +
    `<div class="lg-row"><span class="lg-ring" style="border-color:${GOLD}"></span> Gold ring = your Master</div>` +
    `<div class="lg-row"><span class="lg-flag" style="background:${GOLD}"></span> Gold flag = rally point (right-click while steering)</div>` +
    `<div class="lg-row"><span class="lg-line lg-dash"></span> Dashed corridors = lanes the soldier waves march</div>` +
    `<div class="lg-row"><span class="lg-dot" style="background:rgba(240,200,80,0.9)"></span> ◆ Gold mine · ▲ wood grove (resources)</div>` +
    `<div class="lg-row">🧭 Map faces the HERO view: <b>East is up, North is right</b> — same as in 3D</div>` +
    `<div class="lg-hint">Toggle with the ⓘ button.</div>`;
  stage.appendChild(legendEl);
  // always-on compass chip — the command map is oriented to MATCH hero mode (east up, north right)
  const compassEl = document.createElement('div');
  compassEl.className = 'bt-compass';
  compassEl.title = 'Command map matches the 3D hero view: East up, North right';
  compassEl.textContent = '🧭 E↑ N→';
  stage.appendChild(compassEl);
  (() => {
    const s = document.createElement('style');
    s.textContent =
      `.bt-legend{position:absolute;right:12px;top:52px;z-index:6;background:rgba(10,14,19,0.93);border:1px solid #26313f;` +
      `border-radius:8px;padding:10px 12px;max-width:270px;color:#cdd7e2;font:12px/1.55 "Segoe UI",system-ui,sans-serif;pointer-events:none;}` +
      `.bt-legend b{display:block;margin-bottom:6px;color:#eaf0f6;font-size:12px;}` +
      `.bt-legend .lg-row{display:flex;align-items:center;gap:7px;margin:2px 0;}` +
      `.bt-legend .lg-dot{width:10px;height:10px;border-radius:50%;flex:none;}` +
      `.bt-legend .lg-line{width:14px;height:3px;border-radius:2px;flex:none;}` +
      `.bt-legend .lg-dash{background:repeating-linear-gradient(90deg,#9aa7b5 0 3px,transparent 3px 6px);height:2px;}` +
      `.bt-legend .lg-ring{width:10px;height:10px;border-radius:50%;border:2px solid;flex:none;}` +
      `.bt-legend .lg-flag{width:9px;height:7px;clip-path:polygon(0 0,100% 35%,0 70%);flex:none;}` +
      `.bt-legend .lg-hint{margin-top:6px;color:#6b7f93;font-size:11px;}` +
      `.bt-stances{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;}` +
      `.bt-stances button{background:#141c26;border:1px solid #2a3644;border-radius:6px;color:#cdd7e2;` +
      `font:12px "Segoe UI",system-ui,sans-serif;padding:4px 9px;cursor:pointer;}` +
      `.bt-stances button:hover{border-color:#4da3ff;}` +
      `.bt-stances button.on{border-color:#ffd76a;color:#ffd76a;background:#1c1a12;}` +
      `.bt-compass{position:absolute;left:12px;bottom:12px;z-index:6;background:rgba(10,14,19,0.85);` +
      `border:1px solid #26313f;border-radius:6px;padding:3px 8px;color:#8ea1b5;` +
      `font:11px "Segoe UI",system-ui,sans-serif;pointer-events:none;}` +
      `.bt-duel{border-color:#7a3b2e!important;color:#ffceba!important;background:linear-gradient(180deg,#2a1712,#1c0f0b)!important;}` +
      `.bt-duel:hover:not(:disabled){border-color:#ffd76a!important;color:#ffd76a!important;}`;
    document.head.appendChild(s);
  })();

  const tipKey = (k) => `tip:${store.me?.governorId}:${k}`;
  const tipSeen = (k) => { try { return localStorage.getItem(tipKey(k)) === '1'; } catch { return true; } };
  const tipMark = (k) => { try { localStorage.setItem(tipKey(k), '1'); } catch { /* private mode */ } };

  /**
   * May the local player steer this view? Own assaults always; BRIDGE
   * exhibition battles may open commands to any viewer (field.openCommands).
   */
  const steerable = () =>
    !!(openId && (store.liveBattles.get(openId)?.mine || field?.openCommands));

  /** Begin (or queue) the coach. `force` = library replay (bypasses seen). */
  function startCoach(force = false) {
    if (!force && (tipSeen('cmdmode') || ftue?.running)) return;
    if (!steerable() || ended) { coachPending = true; return; } // next steerable open runs it
    coachPending = false;
    tipMark('cmdmode');
    coach = { beat: 0 };
    renderCoach();
  }

  function coachAdvance() {
    if (!coach) return;
    clearTimeout(coachTimer);
    coachTimer = null;
    if (coach.beat >= COACH_BEATS.length - 1) { finishCoach(); return; }
    coach = { beat: coach.beat + 1 };
    if (coach.beat === 2) coachTimer = setTimeout(() => finishCoach(), 6000);
    renderCoach();
  }

  /** Coach done (finished or skipped) → the Hero-Mode promise tip follows. */
  function finishCoach(quiet = false) {
    if (!coach) return;
    coach = null;
    clearTimeout(coachTimer);
    coachTimer = null;
    renderCoach();
    if (!quiet) {
      // The Hero-Mode promise follows the coach (never simultaneously). Retry
      // once in case another one-shot tip momentarily holds the slot.
      ftue?.tip('heromode');
      setTimeout(() => ftue?.tip('heromode'), 1500);
    }
  }

  function renderCoach() {
    hud.classList.toggle('bc-glow', coach?.beat === 0);
    if (!coach) { coachEl.hidden = true; return; }
    const b = COACH_BEATS[coach.beat];
    const dots = COACH_BEATS.map((_, i) => `<span class="${i === coach.beat ? 'on' : ''}">●</span>`).join('');
    coachEl.innerHTML = `<div class="bc-dots">${dots}</div><h5>${b.title}</h5><p>${b.text}</p>` +
      `<div class="bc-btns"><a href="#" data-coach="skip">skip ›</a>` +
      (b.next ? `<button class="primary" data-coach="next">Next</button>` : `<span class="bc-hint">${b.hint ?? ''} ▶</span>`) +
      `</div>`;
    coachEl.classList.toggle('top', coach.beat === 0); // beat 1 sits under the ringed HUD
    coachEl.hidden = false;
  }
  coachEl.addEventListener('click', (e) => {
    const el = e.target.closest('[data-coach]');
    if (!el) return;
    e.preventDefault();
    if (el.dataset.coach === 'skip') finishCoach(); // skipping still surfaces the Hero-Mode promise
    else coachAdvance();
  });

  let openId = null;      // battleId currently displayed
  let field = null;       // battle_hello static payload
  let prev = null, cur = null; // {snap, at} — last two snapshots (lerp pair)
  let steer = false;      // participation mode (attacking owner only)
  let ended = null;       // outcome once decided
  let closeTimer = null;
  let subRetryTimer = null; // engine battles: re-sub until the bridge binds the relay
  let subRetries = 0;
  const SUB_RETRY_MS = 1200, SUB_RETRY_MAX = 110; // ~2.2 min — covers the join window
  let raf = 0;
  let blotches = null;    // painterly ground stains (visual only, per battle)
  let flashes = [];       // death/hit effects {x, y, t0, kind}
  // Order acknowledgment (sprint #2): steer clicks get instant feedback, and the rally flag is
  // drawn HOLLOW while the order is still in flight (~1.5s command poll + apply) — the bridge
  // echoes the flag position immediately, which used to read as "done" before the engine heard it.
  let orders = [];        // "order sent" fx {x, y, t0, label}
  let rallyPendingUntil = 0;
  let rallyQueue = [];     // local echo of shift+right-click waypoints (engine chains them)
  let dpr = 1, w = 0, h = 0;

  // ── open/close ─────────────────────────────────────────────────────────────
  function open(battleId) {
    if (review) closeReview(); // a live battle supersedes any open review
    if (openId === battleId) return;
    if (openId) close(true);
    openId = battleId;
    field = null;
    prev = cur = null;
    ended = null;
    flashes = [];
    orders = [];
    rallyPendingUntil = 0;
    rallyQueue = [];
    steer = false;
    subRetries = 0;
    if (subRetryTimer) { clearTimeout(subRetryTimer); subRetryTimer = null; }
    root.hidden = false;
    resize();
    send({ t: 'battle_sub', battleId });
    renderHud();
    loop();
  }

  function close(silent = false) {
    if (!openId) return;
    if (!silent) send({ t: 'battle_unsub', battleId: openId });
    openId = null;
    root.hidden = true;
    cancelAnimationFrame(raf);
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (subRetryTimer) { clearTimeout(subRetryTimer); subRetryTimer = null; }
    finishCoach(true); // never leak a coach card across views
  }

  // ── WS frames ──────────────────────────────────────────────────────────────
  function onMsg(msg) {
    if (msg.battleId !== openId) return;
    if (msg.t === 'battle_hello') {
      subRetries = 0; // relay bound — stop any pending re-sub
      if (subRetryTimer) { clearTimeout(subRetryTimer); subRetryTimer = null; }
      field = msg;
      cur = { snap: msg.snap, at: performance.now() };
      prev = cur;
      blotches = makeBlotches(msg);
      if (steerable()) steer = true; // your assault (or open exhibition) — command it by default
      renderHud();
      if (steerable()) startCoach(coachPending); // first steerable view → 3-beat mini-coach
      else ftue?.tip('spectate');                // watch-only open → one-shot spectate tip
      return;
    }
    if (msg.t === 'battle_tick') {
      if (cur) spawnEffects(cur.snap, msg);
      prev = cur ?? { snap: msg, at: performance.now() - 250 };
      cur = { snap: msg, at: performance.now() };
      if (msg.outcome && !ended) endBanner(msg.outcome);
      renderHud();
      return;
    }
    if (msg.t === 'battle_end') {
      if (!ended) endBanner(msg.outcome);
      return;
    }
    if (msg.t === 'battle_err') {
      // Engine/live battles: allocate → bridge-relay-bind is async, so a command
      // view opened a beat early gets NO_BATTLE before the feed exists. Don't tear
      // the view down — hold the "relay connecting…" state and re-sub until the
      // bridge binds (hello arrives → the ±161 map renders), bounded by the join
      // window. Wild/instant battles that truly don't exist still close.
      const lb = openId ? store.liveBattles?.get(openId) : null;
      if (msg.code === 'NO_BATTLE' && lb?.engine && subRetries < SUB_RETRY_MAX) {
        subRetries++;
        if (subRetryTimer) clearTimeout(subRetryTimer);
        subRetryTimer = setTimeout(() => {
          subRetryTimer = null;
          if (openId === msg.battleId) send({ t: 'battle_sub', battleId: openId });
        }, SUB_RETRY_MS);
        return;
      }
      ui.toast('Battle', esc(msg.message ?? msg.code), 'bad');
      if (msg.code === 'NO_BATTLE' || msg.code === 'FORBIDDEN') close(true);
    }
  }

  /** World events from the overworld tick (battle settled while we watch). */
  function onWorldEvents(events) {
    if (!openId) return;
    for (const ev of events) {
      if (ev.type === 'battle_resolved' && ev.battleId === openId && !ended) {
        close(); // resolved without a battle_end (e.g. accelerated before our sub landed)
        return;
      }
    }
  }

  function endBanner(outcome) {
    ended = outcome;
    steer = false;
    finishCoach(true); // the fight is over — the lesson yields to the outcome
    renderHud();
    // Leave the field visible for a beat; the pillage modal / toasts take over.
    closeTimer = setTimeout(() => close(), 3500);
  }

  // ── geometry ───────────────────────────────────────────────────────────────
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = stage.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  window.addEventListener('resize', () => { if (openId) resize(); });

  const scale = () => Math.min(w, h) * 0.92 / (field?.size ?? 240);
  const ox = () => (w - (field?.size ?? 240) * scale()) / 2;
  const oy = () => (h - (field?.size ?? 240) * scale()) / 2;
  // HERO-VIEW ORIENTATION (owner bug 2026-07-11: "3D bottom-right showed as command top-left").
  // The 3D follow camera sits WEST of the hero looking EAST (index.html cTgt x-30), so the hero
  // screen renders EAST=up / NORTH=right, while this view rendered north-up — the two screens
  // disagreed by a rotation and positions read "flipped". Fix: orient the command view to MATCH
  // hero mode. orient() maps viewer coords → hero-screen coords: [size-vy, size-vx]. It is an
  // INVOLUTION (its own inverse), so applying it in toScr AND on incoming clicks keeps steering
  // exact. Every draw goes through the oriented canvas transform or toScr; picks go through toScr.
  const orient = (vx, vy) => { const S = field?.size ?? 240; return [S - vy, S - vx]; };
  const toScr = (x, y) => { const [rx, ry] = orient(x, y); return [ox() + rx * scale(), oy() + ry * scale()]; };
  const toWorld = (sx, sy) => orient((sx - ox()) / scale(), (sy - oy()) / scale());

  /** Ground stains inside the bounds — cheap painterly variation, per battle. */
  function makeBlotches(f) {
    if (f.mode === 'square') return []; // bridge arena: flat backdrop, no stains
    const out = [];
    let sd = 0;
    for (const c of f.battleId) sd = (sd * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 46; i++) {
      out.push({ x: rnd() * f.size, y: rnd() * f.size, r: 8 + rnd() * 22, k: rnd() });
    }
    return out;
  }

  // ── Battlefield-JSON renderer (docs/briefs/BATTLEFIELD-SCHEMA.md) ────────────
  // A fully data-driven top-down map: it draws ANY conformant Battlefield object
  // (bounds polygon, terrain, lanes, structure anchors, spawns, resources,
  // buildSpots). The live UNIT snapshot layer renders ON TOP of this in draw().
  // When the MOBA team's real exported map replaces the stand-in JSON, this
  // renderer consumes it unchanged.
  const BIOMES = {
    TEMPERATE_GRASS: { g0: '#33502c', g1: '#25401d', dirt: '190,168,116' },
    TEMPERATE_FOREST: { g0: '#2c4626', g1: '#1f3618', dirt: '176,150,102' },
    DESERT: { g0: '#8a7a4a', g1: '#6f6036', dirt: '210,190,140' },
    SNOW: { g0: '#8fa3b0', g1: '#6d818f', dirt: '200,210,220' },
    VOLCANIC: { g0: '#4a3630', g1: '#33231f', dirt: '150,110,90' },
  };
  const biomePalette = (b) => BIOMES[b] ?? BIOMES.TEMPERATE_GRASS;
  const sideColor = (side) => (side === 'ATTACKER' ? ATK : side === 'DEFENDER' ? FOE : '#9fb0c4');

  /** Schema (x east, z north, centre origin, ±sizeM/2) → viewer world space [0,size]². */
  function bfProject(x, z) {
    const bf = field.battlefield;
    const S = field.size || 240;
    const M = bf?.arena?.sizeM || bf?.meta?.sizeM || S;
    return [(x / M + 0.5) * S, (0.5 - z / M) * S];
  }

  /** Draw the whole static Battlefield JSON (everything below the live units). */
  function drawBattlefieldMap(now, s, lw, pulse) {
    const bf = field.battlefield;
    const S = field.size || 240;
    const pal = biomePalette(bf.meta?.biome);
    const P = bfProject;

    // bounds polygon = the arena outline
    const bpath = new Path2D();
    (bf.arena?.bounds ?? [[-S / 2, -S / 2], [S / 2, -S / 2], [S / 2, S / 2], [-S / 2, S / 2]]).forEach(
      ([x, z], i) => { const [vx, vy] = P(x, z); i === 0 ? bpath.moveTo(vx, vy) : bpath.lineTo(vx, vy); },
    );
    bpath.closePath();
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, pal.g0);
    grad.addColorStop(1, pal.g1);
    ctx.fillStyle = grad;
    ctx.fill(bpath);

    ctx.save();
    ctx.clip(bpath);

    // LANES — translucent worn corridors (drawn first, under terrain/structures)
    for (const lane of bf.lanes ?? []) {
      const wp = (lane.waypoints ?? []).map(([x, z]) => P(x, z));
      if (wp.length < 2) continue;
      ctx.strokeStyle = `rgba(${pal.dirt},0.20)`;
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      wp.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.strokeStyle = `rgba(${pal.dirt},0.30)`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      wp.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // TERRAIN — water footprints + forest/rock obstacles
    for (const o of bf.obstacles ?? []) {
      const kind = String(o.kind ?? '').toUpperCase();
      if (Array.isArray(o.footprint) && o.footprint.length >= 3) {
        const pts = o.footprint.map(([x, z]) => P(x, z));
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        const water = kind === 'WATER' || kind === 'RIVER';
        ctx.fillStyle = water ? 'rgba(39,80,107,0.7)' : 'rgba(70,60,54,0.6)';
        ctx.fill();
        ctx.strokeStyle = water ? 'rgba(140,190,220,0.35)' : 'rgba(150,140,130,0.3)';
        ctx.lineWidth = lw(1.2);
        ctx.stroke();
        continue;
      }
      const [cx, cy] = P(o.x ?? 0, o.z ?? 0);
      const r = o.r ?? 5;
      if (kind === 'WATER' || kind === 'POND' || kind === 'RIVER') {
        ctx.fillStyle = '#27506b';
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.8, 0.4, 0, 7);
        ctx.fill();
      } else if (kind === 'TREE' || kind === 'TREES' || kind === 'FOREST') {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + cx;
          const rr = r * (0.5 + 0.22 * ((i * 37) % 10) / 10);
          ctx.fillStyle = i % 2 ? '#1e3618' : '#25421c';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r * 0.38, cy + Math.sin(a) * r * 0.34, rr, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = '#2c4c22';
        ctx.beginPath();
        ctx.arc(cx - r * 0.15, cy - r * 0.2, r * 0.45, 0, 7);
        ctx.fill();
      } else {
        // BOULDER / ROCK / CLIFF
        ctx.fillStyle = '#5a5f66';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#71767d';
        ctx.beginPath();
        ctx.arc(cx - r * 0.25, cy - r * 0.3, r * 0.55, 0, 7);
        ctx.fill();
      }
    }

    // RESOURCE NODES — gold mines / wood groves
    for (const r of bf.resources ?? []) {
      const [cx, cy] = P(r.x, r.z);
      const kind = String(r.kind ?? '').toUpperCase();
      const gold = kind.includes('GOLD') || kind.includes('ORE') || kind.includes('MINE');
      ctx.fillStyle = gold ? 'rgba(240,200,80,0.9)' : 'rgba(120,180,90,0.9)';
      ctx.strokeStyle = 'rgba(20,24,16,0.7)';
      ctx.lineWidth = lw(1);
      if (gold) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 3.4);
        ctx.lineTo(cx + 3.2, cy);
        ctx.lineTo(cx, cy + 3.4);
        ctx.lineTo(cx - 3.2, cy);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 3.6);
        ctx.lineTo(cx + 3.2, cy + 2.8);
        ctx.lineTo(cx - 3.2, cy + 2.8);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    }

    // BUILD SPOTS — faint anchor pips
    for (const bs of bf.buildSpots ?? []) {
      const [cx, cy] = P(bs.x, bs.z);
      ctx.strokeStyle = bs.side ? `${sideColor(bs.side)}66` : 'rgba(200,200,200,0.28)';
      ctx.lineWidth = lw(1);
      ctx.setLineDash([lw(2), lw(2)]);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // bounds outline (over the clipped fill)
    ctx.strokeStyle = 'rgba(226,222,200,0.4)';
    ctx.lineWidth = lw(1.6);
    ctx.stroke(bpath);

    // STRUCTURE ANCHORS — CORE / TOWER / GATE / WALL, coloured by side
    for (const st of bf.structures ?? []) {
      const [cx, cy] = P(st.x, st.z);
      const col = sideColor(st.side);
      const kind = String(st.kind ?? '').toUpperCase();
      if (kind === 'CORE') {
        ctx.fillStyle = `${col}33`;
        ctx.beginPath();
        ctx.arc(cx, cy, 9 + pulse * 1.5, 0, 7);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 5.5);
        ctx.lineTo(cx + 5.5, cy);
        ctx.lineTo(cx, cy + 5.5);
        ctx.lineTo(cx - 5.5, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = lw(1.6);
        ctx.stroke();
      } else if (kind === 'TOWER') {
        ctx.fillStyle = `${col}12`;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#2a2620';
        ctx.strokeStyle = col;
        ctx.lineWidth = lw(1.4);
        ctx.fillRect(cx - 3.2, cy - 3.2, 6.4, 6.4);
        ctx.strokeRect(cx - 3.2, cy - 3.2, 6.4, 6.4);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, 1.8, 0, 7);
        ctx.fill();
      } else if (kind === 'GATE') {
        ctx.fillStyle = '#3a3128';
        ctx.strokeStyle = col;
        ctx.lineWidth = lw(1.2);
        ctx.fillRect(cx - 4.5, cy - 2.2, 9, 4.4);
        ctx.strokeRect(cx - 4.5, cy - 2.2, 9, 4.4);
      } else {
        // WALL / other furniture — small stud
        ctx.fillStyle = `${col}aa`;
        ctx.strokeStyle = 'rgba(20,20,20,0.5)';
        ctx.lineWidth = lw(0.8);
        ctx.fillRect(cx - 2.4, cy - 2.4, 4.8, 4.8);
        ctx.strokeRect(cx - 2.4, cy - 2.4, 4.8, 4.8);
      }
    }

    // SPAWN ZONES — pulsing edge markers per side
    for (const sp of bf.spawnZones ?? []) {
      const [cx, cy] = P(sp.x, sp.z);
      const col = sideColor(sp.side);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35 + 0.4 * pulse;
      ctx.lineWidth = lw(2);
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + pulse * 1.6, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([lw(3), lw(3)]);
      ctx.lineWidth = lw(1);
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    void now;
    void s;
  }

  /** Compare consecutive snapshots: deaths → puffs, hp drops → hit sparks. */
  function spawnEffects(prevSnap, curSnap) {
    const now = performance.now();
    const curIds = new Map(curSnap.units.map((u) => [u.id, u]));
    for (const u of prevSnap.units) {
      const c = curIds.get(u.id);
      if (!c) flashes.push({ x: u.x, y: u.y, t0: now, kind: u.s === 'A' ? 'dieA' : 'dieD' });
      else if (c.hp < u.hp) flashes.push({ x: c.x, y: c.y, t0: now, kind: 'hit' });
    }
    const curTw = new Map(curSnap.towers.map((t) => [t.id, t]));
    for (const t of prevSnap.towers) {
      const c = curTw.get(t.id);
      if (c && c.hp <= 0 && t.hp > 0) flashes.push({ x: t.x, y: t.y, t0: now, kind: 'boom' });
    }
    if (flashes.length > 120) flashes = flashes.slice(-120);
  }

  // ── render loop ────────────────────────────────────────────────────────────
  function loop() {
    cancelAnimationFrame(raf);
    const frame = (now) => {
      if (!openId) return;
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function lerpUnits(now) {
    if (!cur) return [];
    if (!prev || prev === cur) return cur.snap.units;
    const t = Math.min(1, Math.max(0, (now - cur.at) / Math.max(60, cur.at - prev.at)));
    const prevById = new Map(prev.snap.units.map((u) => [u.id, u]));
    return cur.snap.units.map((u) => {
      const p = prevById.get(u.id);
      if (!p) return u;
      return { ...u, x: p.x + (u.x - p.x) * t, y: p.y + (u.y - p.y) * t };
    });
  }

  function draw(now) {
    if (!field || !cur) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0e13';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9fb0c4';
      ctx.font = '13px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      // Engine battles stream from the match server's relay — it can lag a beat.
      // Say so plainly (not a dead "connecting"), and if the hero-mode link has
      // already landed, invite the player to take the field while they wait.
      const lb = openId ? store.liveBattles?.get(openId) : null;
      if (lb?.engine) {
        ctx.fillText('Battle running on the engine — command relay connecting…', w / 2, h / 2 - 10);
        if (lb.joinUrl) {
          ctx.fillStyle = '#e8b93c';
          ctx.fillText('⚡ Take the field now from this parcel’s card', w / 2, h / 2 + 14);
        }
      } else {
        ctx.fillText('Connecting to the battle…', w / 2, h / 2);
      }
      ctx.textAlign = 'start';
      return;
    }
    const s = scale();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0e13';
    ctx.fillRect(0, 0, w, h);
    // oriented world transform (see orient()): viewer (vx,vy) → screen (ox + s·(S−vy), oy + s·(S−vx))
    // — the whole scene (map, units, markers) renders in HERO-VIEW orientation. det<0 mirrors TEXT,
    // so any world-space text must reset to the screen transform and place via toScr (order labels do).
    const S0 = field?.size ?? 240;
    ctx.setTransform(0, -dpr * s, -dpr * s, 0, dpr * (ox() + s * S0), dpr * (oy() + s * S0));
    const lw = (px) => px / s;
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);

    if (field.battlefield) {
      // Real Battlefield-JSON map (docs/briefs/BATTLEFIELD-SCHEMA.md) — the
      // command view renders exactly the layout the 3D match plays on. The live
      // unit snapshot layer (below) draws on top of it.
      drawBattlefieldMap(now, s, lw, pulse);
    } else {

    // bounds = the parcel's own shape ('square' = the bridge's legacy MOBA arena)
    const square = field.mode === 'square';
    const bpath = new Path2D();
    field.bounds.forEach(([x, y], i) => (i === 0 ? bpath.moveTo(x, y) : bpath.lineTo(x, y)));
    bpath.closePath();
    if (square) {
      // Ghost of the real parcel behind the arena — the square battlefield
      // sits fitted inside the land being fought over.
      const poly = store.parcels.get(store.liveBattles.get(openId)?.parcelId)?.polygon;
      if (poly && poly.length > 2) {
        let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
        for (const [x, y] of poly) {
          if (x < mnx) mnx = x; if (y < mny) mny = y;
          if (x > mxx) mxx = x; if (y > mxy) mxy = y;
        }
        const k = (field.size * 1.08) / Math.max(mxx - mnx, mxy - mny, 1e-9);
        const gx = (field.size - (mxx - mnx) * k) / 2, gy = (field.size - (mxy - mny) * k) / 2;
        ctx.beginPath();
        poly.forEach(([x, y], i) => {
          const px = gx + (x - mnx) * k, py = gy + (y - mny) * k;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(28,40,26,0.6)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(226,222,200,0.14)';
        ctx.lineWidth = lw(1.2);
        ctx.stroke();
      }
      ctx.fillStyle = '#2e4426'; // flat arena ground — bridge terrain comes later
      ctx.fill(bpath);
    } else {
      const grad = ctx.createLinearGradient(0, 0, field.size, field.size);
      grad.addColorStop(0, '#33502c');
      grad.addColorStop(1, '#28401f');
      ctx.fillStyle = grad;
      ctx.fill(bpath);
    }
    ctx.save();
    ctx.clip(bpath);
    for (const b of blotches ?? []) {
      ctx.fillStyle = b.k > 0.5 ? 'rgba(66,92,50,0.35)' : 'rgba(30,44,24,0.30)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r, b.r * 0.7, b.k * 3, 0, 7);
      ctx.fill();
    }
    if (!square) {
      // the ONE lane: worn dirt from spawn to heart
      ctx.strokeStyle = 'rgba(168,146,96,0.20)';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(field.spawn.x, field.spawn.y);
      ctx.lineTo(field.heart.x, field.heart.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(190,168,116,0.22)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(field.spawn.x, field.spawn.y);
      ctx.lineTo(field.heart.x, field.heart.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // terrain
    for (const o of field.obstacles) {
      if (o.kind === 'POND') {
        ctx.fillStyle = '#27506b';
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, o.r, o.r * 0.8, 0.4, 0, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(140,190,220,0.35)';
        ctx.lineWidth = lw(1.4);
        ctx.stroke();
      } else if (o.kind === 'TREES') {
        // painterly canopy: a few overlapping lobes
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + o.x;
          const rr = o.r * (0.45 + 0.2 * ((i * 37) % 10) / 10);
          ctx.fillStyle = i % 2 ? '#1e3618' : '#25421c';
          ctx.beginPath();
          ctx.arc(o.x + Math.cos(a) * o.r * 0.38, o.y + Math.sin(a) * o.r * 0.34, rr, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = '#2c4c22';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.15, o.y - o.r * 0.2, o.r * 0.45, 0, 7);
        ctx.fill();
      } else {
        ctx.fillStyle = '#5a5f66';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#71767d';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.3, o.r * 0.55, 0, 7);
        ctx.fill();
      }
    }
    ctx.restore();
    if (square) {
      // subtle double frame around the arena square
      ctx.strokeStyle = 'rgba(226,222,200,0.14)';
      ctx.lineWidth = lw(6);
      ctx.stroke(bpath);
      ctx.strokeStyle = 'rgba(226,222,200,0.5)';
      ctx.lineWidth = lw(1.6);
      ctx.stroke(bpath);
    } else {
      ctx.strokeStyle = 'rgba(226,222,200,0.4)';
      ctx.lineWidth = lw(1.6);
      ctx.stroke(bpath);
    }

    if (!square) {
      // spawn edge marker (attacker entry) + heart
      ctx.strokeStyle = `rgba(77,163,255,${0.35 + 0.4 * pulse})`;
      ctx.lineWidth = lw(2);
      ctx.beginPath();
      ctx.arc(field.spawn.x, field.spawn.y, 6 + pulse * 1.5, 0, 7);
      ctx.stroke();
      ctx.fillStyle = 'rgba(224,72,60,0.25)';
      ctx.beginPath();
      ctx.arc(field.heart.x, field.heart.y, 5, 0, 7);
      ctx.fill();
    }

    } // end legacy (non-battlefield) map

    // wave spawn points / arrival lanes (bridge battles; reinforcements open new fronts)
    for (const sp of cur.snap.spawns ?? []) {
      const a = 0.3 + 0.35 * pulse;
      ctx.strokeStyle = sp.s === 'A' ? `rgba(77,163,255,${a})` : `rgba(224,72,60,${a})`;
      ctx.lineWidth = lw(2);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6 + pulse * 1.5, 0, 7);
      ctx.stroke();
      ctx.setLineDash([lw(3), lw(3)]);
      ctx.lineWidth = lw(1);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 10, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // rally flag — HOLLOW + dashed while the order is still in flight to the engine
    // (the bridge echoes the position instantly; solid used to falsely read as "executing")
    const rally = cur.snap.rally;
    if (rally) {
      const pending = now < rallyPendingUntil;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = lw(1.6);
      if (pending) ctx.setLineDash([lw(2), lw(2)]);
      ctx.beginPath();
      ctx.moveTo(rally.x, rally.y);
      ctx.lineTo(rally.x, rally.y - 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rally.x, rally.y - 7);
      ctx.lineTo(rally.x + 5.5, rally.y - 5.2);
      ctx.lineTo(rally.x, rally.y - 3.4);
      ctx.closePath();
      if (pending) { ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.fillStyle = GOLD; ctx.fill(); }
      // queued waypoints (shift+right-click): smaller hollow pennants, numbered in screen space
      for (let qi = 0; qi < rallyQueue.length; qi++) {
        const q = rallyQueue[qi];
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = lw(1.2);
        ctx.setLineDash([lw(1.5), lw(1.5)]);
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(q.x, q.y - 5); ctx.lineTo(q.x + 4, q.y - 3.8); ctx.lineTo(q.x, q.y - 2.6); ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
        const [qx, qy] = toScr(q.x, q.y);
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgba(255,215,106,0.9)'; ctx.font = '10px "Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(String(qi + 2), qx + 8, qy - 6);
        ctx.restore();
      }
    }

    // towers: range ring + body + hp bar (rubble once dead)
    for (const t of cur.snap.towers) {
      if (t.hp > 0) {
        ctx.fillStyle = 'rgba(224,72,60,0.05)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 30, 0, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(224,72,60,0.22)';
        ctx.lineWidth = lw(1);
        ctx.stroke();
        ctx.fillStyle = '#3a2f28';
        ctx.fillRect(t.x - 3.4, t.y - 3.4, 6.8, 6.8);
        ctx.strokeStyle = '#191411';
        ctx.lineWidth = lw(1.2);
        ctx.strokeRect(t.x - 3.4, t.y - 3.4, 6.8, 6.8);
        ctx.fillStyle = '#c9524a';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 2.1, 0, 7);
        ctx.fill();
        hpBar(t.x, t.y - 5.6, 9, t.hp / t.mh, lw);
      } else {
        ctx.fillStyle = 'rgba(40,36,32,0.85)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3.6, 0, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,110,100,0.5)';
        ctx.lineWidth = lw(1);
        ctx.beginPath();
        ctx.moveTo(t.x - 2.6, t.y - 2.6);
        ctx.lineTo(t.x + 2.6, t.y + 2.6);
        ctx.moveTo(t.x + 2.6, t.y - 2.6);
        ctx.lineTo(t.x - 2.6, t.y + 2.6);
        ctx.stroke();
      }
      if (cur.snap.focus === t.id) focusMark(t.x, t.y, 5.4, now, lw);
    }

    // entities (interpolated)
    const units = lerpUnits(now);
    for (const u of units) {
      const r = u.k === 'M' ? 2.9 : u.c === 'CAVALRY' ? 2.0 : 1.7;
      if (u.s === 'A') {
        if (u.k === 'M') {
          // Coach beat 2: spotlight ring around the Master marker
          if (coach?.beat === 1) {
            ctx.strokeStyle = `rgba(255,215,106,${0.55 + 0.4 * pulse})`;
            ctx.lineWidth = lw(2.2);
            ctx.setLineDash([lw(5), lw(4)]);
            ctx.beginPath();
            ctx.arc(u.x, u.y, 7.5 + pulse * 1.6, 0, 7);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          // The Master: gold-ringed, banner pennant, glow
          ctx.fillStyle = `rgba(255,215,106,${0.16 + 0.1 * pulse})`;
          ctx.beginPath();
          ctx.arc(u.x, u.y, r * 2.4, 0, 7);
          ctx.fill();
          ctx.fillStyle = ATK;
          ctx.beginPath();
          ctx.arc(u.x, u.y, r, 0, 7);
          ctx.fill();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = lw(2);
          ctx.stroke();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = lw(1.2);
          ctx.beginPath();
          ctx.moveTo(u.x, u.y - r);
          ctx.lineTo(u.x, u.y - r - 5);
          ctx.stroke();
          ctx.fillStyle = GOLD;
          ctx.beginPath();
          ctx.moveTo(u.x, u.y - r - 5);
          ctx.lineTo(u.x + 4, u.y - r - 3.8);
          ctx.lineTo(u.x, u.y - r - 2.6);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = u.c === 'ARCHER' ? '#79bdf7' : ATK;
          ctx.beginPath();
          ctx.arc(u.x, u.y, r, 0, 7);
          ctx.fill();
          ctx.strokeStyle = ATK_RING;
          ctx.lineWidth = lw(1);
          ctx.stroke();
        }
      } else {
        // wild mob: dark maw + red eye (map style)
        ctx.fillStyle = '#26161a';
        ctx.beginPath();
        ctx.arc(u.x, u.y, r, 0, 7);
        ctx.fill();
        ctx.strokeStyle = '#5c1f1f';
        ctx.lineWidth = lw(1);
        ctx.stroke();
        ctx.fillStyle = FOE;
        ctx.beginPath();
        ctx.arc(u.x, u.y, r * 0.4, 0, 7);
        ctx.fill();
      }
      if (u.hp < u.mh) hpBar(u.x, u.y - r - 1.6, r * 2.4, u.hp / u.mh, lw);
      if (cur.snap.focus === u.id) focusMark(u.x, u.y, r + 2.2, now, lw);
    }

    // hit/death effects
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const k = (now - f.t0) / (f.kind === 'boom' ? 900 : 450);
      if (k >= 1) { flashes.splice(i, 1); continue; }
      if (f.kind === 'hit') {
        ctx.fillStyle = `rgba(255,240,200,${0.5 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 0.8 + k * 1.6, 0, 7);
        ctx.fill();
      } else if (f.kind === 'boom') {
        ctx.strokeStyle = `rgba(255,160,60,${0.8 * (1 - k)})`;
        ctx.lineWidth = lw(2.5);
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2 + k * 14, 0, 7);
        ctx.stroke();
      } else {
        ctx.fillStyle = f.kind === 'dieA' ? `rgba(120,170,255,${0.55 * (1 - k)})` : `rgba(220,90,70,${0.55 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y - k * 3, 1.6 * (1 - k * 0.5), 0, 7);
        ctx.fill();
      }
    }

    // order acknowledgment (sprint #2): expanding gold ring + fading label at the click point —
    // instant feedback that the order left the console (execution follows in ~1.5s via the relay)
    for (let i = orders.length - 1; i >= 0; i--) {
      const o = orders[i];
      const k = (now - o.t0) / 2200;
      if (k >= 1) { orders.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255,215,106,${0.7 * (1 - k)})`;
      ctx.lineWidth = lw(1.6);
      ctx.beginPath();
      ctx.arc(o.x, o.y, 2 + k * 10, 0, 7);
      ctx.stroke();
      if (k < 0.8) {
        // text in SCREEN space (the oriented world transform mirrors glyphs) — place via toScr
        const [px2, py2] = toScr(o.x, o.y);
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = `rgba(255,225,150,${0.9 * (1 - k / 0.8)})`;
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(o.label, px2, py2 - 14 - k * 6);
        ctx.restore();
      }
    }

    // outcome stamp
    if (ended) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(8,10,14,0.55)';
      ctx.fillRect(0, h / 2 - 44, w, 88);
      ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mine = store.liveBattles.get(openId)?.mine ?? false;
      const txt = field?.bridge
        ? (ended === 'ATTACKER'
          ? `⚔ VICTORY — ${field.attackerLabel ?? 'the attackers'} take the field`
          : ended === 'DEFENDER'
            ? `🛡 DEFEAT — ${field.defenderLabel ?? 'the defenders'} hold`
            : '🏳 STALEMATE — the clock ran out')
        : ended === 'ATTACKER'
          ? (mine ? '⚔ VICTORY — the lair is broken' : '⚔ The attackers take the field')
          : ended === 'DEFENDER'
            ? (mine ? '💀 DEFEAT — the wilds hold' : '💀 The wilds hold their ground')
            : '🏳 STALEMATE — the clock ran out';
      ctx.fillStyle = ended === 'ATTACKER' ? '#ffd76a' : ended === 'DEFENDER' ? '#e0483c' : '#9fb0c4';
      ctx.fillText(txt, w / 2, h / 2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  function hpBar(x, y, wWu, frac, lw) {
    ctx.fillStyle = 'rgba(10,12,16,0.75)';
    ctx.fillRect(x - wWu / 2, y, wWu, 1.1);
    ctx.fillStyle = frac > 0.5 ? '#6fce6f' : frac > 0.25 ? '#e0b23c' : '#e0483c';
    ctx.fillRect(x - wWu / 2, y, wWu * Math.max(0, frac), 1.1);
    void lw;
  }

  function focusMark(x, y, r, now, lw) {
    const k = 0.6 + 0.4 * Math.sin(now / 160);
    ctx.strokeStyle = `rgba(255,215,106,${k})`;
    ctx.lineWidth = lw(1.6);
    ctx.setLineDash([lw(4), lw(3)]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function renderHud() {
    if (!openId) return;
    const lb = store.liveBattles.get(openId);
    const terr = lb ? store.terrByParcel.get(lb.parcelId) : null;
    const snap = cur?.snap;
    const mine = lb?.mine ?? false;
    const monster = field?.monsterName ?? lb?.monsterName;
    const tickHz = field?.tickHz ?? 4;
    const clockS = snap ? Math.round(snap.clockLeft / tickHz) : 0;
    const clock = `${Math.floor(clockS / 60)}:${String(clockS % 60).padStart(2, '0')}`;
    const master = snap?.master;
    const masterBit = master
      ? `<span class="bt-stat" title="Your Master — limited runs">${avatarHtml({ name: master.name ?? field?.masterName ?? 'Master' }, 30)}` +
        `<span>${master.alive ? `<b>${esc(master.name ?? 'Master')}</b>` : master.revives > 0 ? `respawn ${Math.ceil(master.respawnIn / tickHz)}s` : '<b class="bad">down</b>'}` +
        `<em>${'♥'.repeat(Math.max(0, master.revives) + (master.alive ? 1 : 0)) || '—'} runs</em></span></span>`
      : '';
    // soldiers remaining (sprint #3): your reserve via waves (engine cfpump now sends the
    // waves:{stock,stockStart} shape), enemy reserve via the per-side reserves slot (-1 = ∞)
    const waves = snap ? `<span class="bt-stat" title="Your reserve — line soldiers still to spawn">🌊 <b>${snap.waves.stock}</b><em>/${snap.waves.stockStart} soldiers</em></span>` : '';
    const foeRes = snap?.reserves && snap.reserves.d >= 0
      ? `<span class="bt-stat" title="Enemy reserve — their line soldiers still to spawn">🛡 <b>${snap.reserves.d}</b><em> enemy</em></span>` : '';
    const mobs = snap ? `<span class="bt-stat" title="Wild defenders remaining">☠ <b>${snap.mobs}</b><em>/${snap.mobsStart}</em></span>` : '';
    const towers = snap ? `<span class="bt-stat" title="Defender towers standing">🗼 <b>${snap.towersAlive}</b><em>/${snap.towersStart}</em></span>` : '';
    const prog = snap && snap.mobsStart > 0 ? Math.round((1 - snap.mobs / snap.mobsStart) * 100) : 0;
    const canSteer = mine || !!field?.openCommands; // exhibition bridges may open commands to any viewer
    const stale = !!snap?.stale && !ended;          // relay went quiet (bridge battles)
    const name = esc(terr?.name ?? lb?.parcelId ?? '…');
    const title = field?.bridge
      ? `<b>⚔ ${esc(field.attackerLabel ?? 'Attackers')} at ${name}</b>` +
        `<span class="bt-vs">vs ${esc(field.defenderLabel ?? 'Defenders')}</span>` +
        (field.exhibition ? `<span class="bt-exh" title="Exhibition — display only, no ground changes hands">EXHIBITION</span>` : '')
      : `<b>⚔ ${mine ? 'Your assault on' : 'Assault on'} ${name}</b>` +
        (monster ? `<span class="bt-vs">vs ☠ ${esc(monster)}</span>` : '');
    hud.innerHTML =
      `<div class="bt-title"><span class="bt-live${ended ? ' done' : stale ? ' stale' : ''}">●</span>` +
      title + `</div>` +
      `<div class="bt-stats">${masterBit}${waves}${foeRes}${mobs}${towers}` +
      `<span class="bt-stat" title="Battle clock — expiry means the attack guttered out">⏱ <b>${clock}</b></span>` +
      `<span class="bt-prog" title="Lair broken at 100%"><span style="width:${prog}%"></span></span></div>` +
      `<div class="bt-btns">` +
      (canSteer && !ended
        ? `<button class="bt-steer${steer ? ' on' : ''}" data-bt="steer">${steer ? '🎮 Steering' : '🎮 Steer'}</button>` +
          // HERO MODE doorway: live when the match relay provides a joinUrl
          // (real MOBA client match); ONE-HERO rule — commanding pauses there.
          (field.joinUrl
            ? `<button class="bt-hero live" data-bt="hero" title="Hero Mode — drop into this battle as your Master in the full MOBA client. While embodied you cannot issue commands here (one-hero rule).">⚡ Take the field</button>`
            : `<button class="bt-hero" disabled title="Hero Mode — drop into this battle as your Master (full MOBA combat). Coming soon.">⚡ Take the field<span class="soon">SOON</span></button>`) +
          // HERO DUEL (decision 14 / HERO-DUEL-SPEC.md): challenge the enemy
          // commander to a best-of-3 card duel — champions settle it, troops are
          // spared. Opens the duel overlay OVER command mode when the server
          // replies with duel_open.
          `<button class="bt-duel" data-bt="duel" title="Challenge the enemy commander to a HERO DUEL — champions settle it, troops are spared (best-of-3 cards; your Master's rating + any Named artifact decide it).">⚔ Duel</button>`
        : '') +
      `<button data-bt="legend" title="Map legend — what every mark on this map means">ⓘ</button>` +
      `<button data-bt="leave">✕ Leave</button></div>` +
      // army STANCES (sprint #4/#6): posture orders for your soldier waves — engine consumes as
      // deterministic biases. 🚩 Regroup = right-click rally (no button); ✋ also clears the rally.
      (canSteer && !ended && steer
        ? `<div class="bt-stances">` +
          `<button data-st="ALL_IN"${snap?.stance === 'ALL_IN' ? ' class="on"' : ''} title="Everything converges on the enemy core">⚔ All-in</button>` +
          `<button data-st="DEFEND"${snap?.stance === 'DEFEND' ? ' class="on"' : ''} title="Hold a ring at your own core — engage what comes">🛡 Defend</button>` +
          `<button data-st="FOLLOW"${snap?.stance === 'FOLLOW' ? ' class="on"' : ''} title="Soldiers escort your Master as a warband">🎯 Follow Master</button>` +
          `<button data-st="CLEAR" title="Resume default — clears stance AND rally flag">✋ Clear</button>` +
          `</div>`
        : '');
    legendEl.hidden = !legendOpen;
    foot.innerHTML = ended
      ? `<span>The armies disperse — outcome lands on the war map…</span>`
      : stale
        ? `<span class="bad">⚠ Signal lost — awaiting the battle relay…</span>`
        : steer
          ? `<span><b>Click</b>: move Master · <b>click an enemy</b>: focus fire · <b>right-click</b>: rally · <b>shift+right-click</b>: queue waypoints</span>`
          : canSteer
            ? `<span>Watching. Press <b>🎮 Steer</b> to command your Master and waves.</span>`
            : `<span>Watching a battle for ${esc(terr?.name ?? 'wild land')} — spectator only.</span>`;
  }

  hud.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.bt === 'leave') close();
    else if (btn.dataset.bt === 'legend') { legendOpen = !legendOpen; legendEl.hidden = !legendOpen; }
    else if (btn.dataset.st) {
      // army stance order (sprint #4/#6) — same command channel as steering clicks
      send({ t: 'battle_cmd', battleId: openId, cmd: { kind: 'stance', stance: btn.dataset.st } });
      btn.classList.add('on');                       // optimistic; snapshot echo confirms
      if (btn.dataset.st === 'CLEAR') { rallyPendingUntil = 0; rallyQueue = []; }
    }
    else if (btn.dataset.bt === 'duel') {
      // Challenge the enemy commander to a hero duel (server derives the target
      // from this battle). The duel overlay opens over command mode on duel_open.
      send({ t: 'duel_challenge', battleId: openId });
      btn.disabled = true;
      ui?.toast?.('⚔ Duel', 'Challenge sent — the champions square off…', 'info');
    }
    else if (btn.dataset.bt === 'steer') { steer = !steer; renderHud(); }
    else if (btn.dataset.bt === 'hero' && field?.joinUrl) {
      // ONE-HERO rule: taking the field surrenders the command channel here.
      steer = false;
      renderHud();
      window.open(field.joinUrl, '_blank', 'noopener');
    }
  });

  // ── steering input ─────────────────────────────────────────────────────────
  /** Enemy (mob or live tower) within `px` screen pixels of the click. */
  function pickEnemy(sx, sy, px = 16) {
    if (!cur) return null;
    let best = null, bestD = px;
    const test = (id, x, y) => {
      const [ex, ey] = toScr(x, y);
      const d = Math.hypot(ex - sx, ey - sy);
      if (d < bestD) { bestD = d; best = id; }
    };
    for (const u of cur.snap.units) if (u.s === 'D') test(u.id, u.x, u.y);
    for (const t of cur.snap.towers) if (t.hp > 0) test(t.id, t.x, t.y);
    return best;
  }

  canvas.addEventListener('click', (e) => {
    if (!steer || !openId || ended) return;
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const enemy = pickEnemy(sx, sy);
    if (enemy) {
      send({ t: 'battle_cmd', battleId: openId, cmd: { kind: 'focus', targetId: enemy } });
      const [x, y] = toWorld(sx, sy);
      orders.push({ x, y, t0: performance.now(), label: '⚔ focus order sent' });
    } else {
      const [x, y] = toWorld(sx, sy);
      send({ t: 'battle_cmd', battleId: openId, cmd: { kind: 'move', x, y } });
      orders.push({ x, y, t0: performance.now(), label: '➤ move order sent' });
    }
    if (coach?.beat === 1) coachAdvance(); // beat 2 advances on a REAL move/focus
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!steer || !openId || ended) return;
    const r = canvas.getBoundingClientRect();
    const [x, y] = toWorld(e.clientX - r.left, e.clientY - r.top);
    if (e.shiftKey && cur?.snap?.rally) {
      // shift+right-click = APPEND a waypoint (owner 2026-07-11) — troops march flag→flag
      send({ t: 'battle_cmd', battleId: openId, cmd: { kind: 'rally', x, y, queue: 1 } });
      rallyQueue.push({ x, y });
      orders.push({ x, y, t0: performance.now(), label: '🚩 waypoint ' + (rallyQueue.length + 1) + ' queued' });
    } else {
      send({ t: 'battle_cmd', battleId: openId, cmd: { kind: 'rally', x, y } });
      rallyQueue = [];                              // plain rally replaces flag + queue
      orders.push({ x, y, t0: performance.now(), label: '🚩 rally order sent' });
      rallyPendingUntil = performance.now() + 3500; // ~2 command polls — flag draws hollow until then
    }
    if (coach?.beat === 2) coachAdvance(); // beat 3 advances on the rally order (or its 6 s timer)
  });

  // ── Recently-resolved review (docs/04 §7b) ─────────────────────────────────
  // Post-resolution result/replay. AUTO/accelerated battles never had live
  // telemetry, so this shows an HONEST RESULT CARD + a compact SYNTHESIZED
  // strength-progression scrub (from the server's recentBattles record) — never
  // fabricated unit positions. A `wasLive` fight notes that real telemetry ran.
  let review = null; // { list, i, playing, paused, scrubbing, frac, at, holdUntil }
  let reviewRaf = 0;
  const reviewTimerSec = () => Math.max(2, store.meta?.review?.timerSec ?? 7);

  function openReview(list, index = 0) {
    if (!Array.isArray(list) || list.length === 0) return;
    if (openId) close(true); // a review supersedes any live viewer
    review = {
      list, i: Math.max(0, Math.min(index | 0, list.length - 1)),
      playing: list.length > 1, paused: false, scrubbing: false,
      frac: 0, at: performance.now(), holdUntil: 0,
    };
    root.hidden = false;
    root.classList.add('review-mode');
    renderReviewShell();
    reviewLoop();
  }

  function closeReview() {
    if (!review) return;
    review = null;
    cancelAnimationFrame(reviewRaf);
    reviewRaf = 0;
    reviewEl.hidden = true;
    root.classList.remove('review-mode');
    root.hidden = true;
  }

  function reviewGoto(i) {
    if (!review) return;
    review.i = (i + review.list.length) % review.list.length;
    review.frac = 0;
    review.at = performance.now();
    review.holdUntil = 0;
    review.scrubbing = false;
    renderReviewShell();
  }

  /** Interpolated troop count for side `key` at scrub fraction `frac`. */
  function valueAt(tl, key, frac) {
    if (!tl || !tl.length) return 0;
    for (let k = 1; k < tl.length; k++) {
      if (frac <= tl[k].t) {
        const p = tl[k - 1], q = tl[k];
        const span = Math.max(1e-6, q.t - p.t);
        const u = Math.min(1, Math.max(0, (frac - p.t) / span));
        return Math.round(p[key] + (q[key] - p[key]) * u);
      }
    }
    return tl[tl.length - 1][key];
  }

  function renderReviewShell() {
    if (!review) return;
    const rec = review.list[review.i];
    const tl = rec.timeline ?? [];
    const maxV = Math.max(1, rec.startStrength?.attacker ?? 0, rec.startStrength?.defender ?? 0);
    const px = (t) => (t * 100).toFixed(2);
    const py = (v) => (6 + (1 - v / maxV) * 88).toFixed(2);
    const poly = (key) => tl.map((f) => `${px(f.t)},${py(f[key])}`).join(' ');
    const winTxt = rec.winner === 'ATTACKER' ? `⚔ ${esc(rec.attackerLabel)} won the field`
      : rec.winner === 'DEFENDER' ? `🛡 ${esc(rec.defenderLabel)} held the ground`
        : '🏳 Stalemate — no ground changed hands';
    const winCls = rec.winner === 'ATTACKER' ? 'atk' : rec.winner === 'DEFENDER' ? 'def' : 'tie';
    const durTicks = Math.max(0, (rec.resolvedTick ?? 0) - (rec.startedTick ?? 0));
    const mode = rec.wasLive ? 'live telemetry' : 'auto-resolved · reconstructed';
    const opts = review.list.map((r, k) =>
      `<option value="${k}"${k === review.i ? ' selected' : ''}>${esc(r.attackerLabel)} vs ${esc(r.defenderLabel)} — ${esc(r.parcelName)} (${r.winner})</option>`).join('');
    const many = review.list.length > 1;
    reviewEl.innerHTML =
      `<div class="review-head">` +
        `<div class="review-title"><b>🎬 ${esc(rec.parcelName)}</b>` +
          `<span class="review-sub"><span class="atk">${esc(rec.attackerLabel)}</span> <em>vs</em> <span class="def">${esc(rec.defenderLabel)}</span></span></div>` +
        `<div class="review-pick">` +
          (many ? `<select class="review-jump">${opts}</select>` : '') +
          `<button class="review-x" data-rv="close" title="Close">✕</button></div>` +
      `</div>` +
      `<div class="review-body">` +
        `<div class="review-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none">` +
          `<line class="rv-grid" x1="0" y1="94" x2="100" y2="94"></line>` +
          `<polyline class="rv-line def" points="${poly('b')}"></polyline>` +
          `<polyline class="rv-line atk" points="${poly('a')}"></polyline>` +
          `<line class="rv-head-line" x1="0" y1="0" x2="0" y2="100"></line>` +
        `</svg>` +
        `<div class="rv-legend"><span class="atk">⚔ ${esc(rec.attackerLabel)} <b class="rv-a">${rec.startStrength?.attacker ?? 0}</b></span>` +
          `<span class="def">🛡 ${esc(rec.defenderLabel)} <b class="rv-b">${rec.startStrength?.defender ?? 0}</b></span></div></div>` +
        `<div class="review-card">` +
          `<div class="review-win ${winCls}">${winTxt}</div>` +
          `<div class="review-rows">` +
            `<div><span>losses (⚔/🛡)</span><b>${rec.casualties?.attacker ?? 0} / ${rec.casualties?.defender ?? 0}</b></div>` +
            `<div><span>survivors (⚔/🛡)</span><b>${rec.survivors?.attacker ?? 0} / ${rec.survivors?.defender ?? 0}</b></div>` +
            `<div><span>outcome</span><b>${esc(rec.reason ?? '')}</b></div>` +
            `<div><span>fight</span><b>${durTicks} ticks · ${mode}</b></div>` +
          `</div>` +
          (rec.wasLive ? '' : `<div class="review-note">Auto-resolved — this is a reconstructed summary, not a live replay.</div>`) +
        `</div>` +
      `</div>` +
      `<div class="review-foot">` +
        `<div class="rv-timer"><span class="rv-timer-fill"></span></div>` +
        `<div class="rv-ctrls">` +
          (many ? `<button data-rv="prev" title="Previous battle">◀</button>` : '') +
          (many ? `<button class="rv-play" data-rv="play">${review.playing && !review.paused ? '⏸ Pause' : '▶ Review all'}</button>` : '') +
          (many ? `<button data-rv="next" title="Next battle">▶</button>` : '') +
          `<input class="rv-scrub" type="range" min="0" max="1000" value="0" title="Scrub the fight" />` +
          `<span class="rv-count">${review.i + 1}/${review.list.length}</span>` +
        `</div>` +
      `</div>`;
    reviewEl.hidden = false;
    updateReviewDynamic();
  }

  function updateReviewDynamic() {
    if (!review) return;
    const rec = review.list[review.i];
    const tl = rec.timeline ?? [];
    const f = review.frac;
    const head = reviewEl.querySelector('.rv-head-line');
    if (head) { head.setAttribute('x1', (f * 100).toFixed(2)); head.setAttribute('x2', (f * 100).toFixed(2)); }
    const a = reviewEl.querySelector('.rv-a'); if (a) a.textContent = valueAt(tl, 'a', f);
    const b = reviewEl.querySelector('.rv-b'); if (b) b.textContent = valueAt(tl, 'b', f);
    const fill = reviewEl.querySelector('.rv-timer-fill'); if (fill) fill.style.width = `${Math.round(f * 100)}%`;
    const scrub = reviewEl.querySelector('.rv-scrub');
    if (scrub && !review.scrubbing) scrub.value = String(Math.round(f * 1000));
  }

  function reviewLoop() {
    cancelAnimationFrame(reviewRaf);
    const frame = (now) => {
      if (!review) return;
      if (!review.paused && !review.scrubbing) {
        const dur = reviewTimerSec() * 1000;
        review.frac = Math.min(1, (now - review.at) / dur);
        if (review.frac >= 1) {
          if (review.holdUntil === 0) {
            review.holdUntil = now + 800; // hold on the settled result a beat
          } else if (now >= review.holdUntil) {
            if (review.playing && review.i < review.list.length - 1) {
              reviewGoto(review.i + 1);
            } else {
              review.paused = true; // rest at the end (single battle, or "Review all" done)
              renderReviewShell();
            }
          }
        }
      }
      updateReviewDynamic();
      reviewRaf = requestAnimationFrame(frame);
    };
    reviewRaf = requestAnimationFrame(frame);
  }

  reviewEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rv]');
    if (!btn || !review) return;
    const act = btn.dataset.rv;
    if (act === 'close') { closeReview(); return; }
    if (act === 'prev') { review.playing = false; review.paused = false; reviewGoto(review.i - 1); }
    else if (act === 'next') { review.playing = false; review.paused = false; reviewGoto(review.i + 1); }
    else if (act === 'play') {
      if (review.playing && !review.paused) {
        review.paused = true;
      } else {
        review.playing = true;
        review.paused = false;
        if (review.frac >= 1) reviewGoto(review.i);
        else review.at = performance.now() - review.frac * reviewTimerSec() * 1000;
      }
      renderReviewShell();
    }
  });
  reviewEl.addEventListener('change', (e) => {
    const sel = e.target.closest('.review-jump');
    if (sel && review) { review.playing = false; review.paused = false; reviewGoto(Number(sel.value)); }
  });
  reviewEl.addEventListener('input', (e) => {
    const sc = e.target.closest('.rv-scrub');
    if (!sc || !review) return;
    review.scrubbing = true;
    review.paused = true;
    review.frac = Math.min(1, Math.max(0, Number(sc.value) / 1000));
    updateReviewDynamic();
  });
  const endScrub = (e) => { if (review && e.target.closest('.rv-scrub')) review.scrubbing = false; };
  reviewEl.addEventListener('pointerup', endScrub);
  reviewEl.addEventListener('change', endScrub);

  /** Scoped review CSS — injected once (app.css is off-limits; visual session owns it). */
  function injectReviewStyles() {
    if (document.getElementById('review-styles')) return;
    const s = document.createElement('style');
    s.id = 'review-styles';
    s.textContent = `
#battle.review-mode .bt-hud,#battle.review-mode .bt-foot,#battle.review-mode .bt-stage{display:none;}
.review-panel{position:absolute;inset:0;display:flex;flex-direction:column;background:#0b0f14;color:#cdd7e2;font:13px "Segoe UI",system-ui,sans-serif;z-index:5;}
.review-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #1c2632;background:#0e141b;}
.review-title b{font-size:16px;color:#eaf0f6;}
.review-title .review-sub{display:block;margin-top:3px;color:#8ea1b5;}
.review-title .review-sub em{color:#6b7f93;font-style:normal;margin:0 4px;}
.review-panel .atk{color:#4da3ff;}
.review-panel .def{color:#e0483c;}
.review-pick{display:flex;align-items:center;gap:8px;}
.review-jump{max-width:340px;background:#0b1118;color:#cdd7e2;border:1px solid #24313f;border-radius:6px;padding:5px 8px;font:12px inherit;}
.review-x{background:#182230;color:#cdd7e2;border:1px solid #2a3746;border-radius:6px;padding:5px 9px;cursor:pointer;}
.review-x:hover{background:#233242;}
.review-body{flex:1;display:flex;gap:16px;padding:16px;min-height:0;}
.review-chart{flex:1;display:flex;flex-direction:column;min-width:0;background:#0e141b;border:1px solid #1c2632;border-radius:8px;padding:10px;}
.review-chart svg{flex:1;width:100%;height:100%;min-height:120px;}
.review-chart .rv-line{fill:none;stroke-width:1.6;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round;}
.review-chart .rv-line.atk{stroke:#4da3ff;}
.review-chart .rv-line.def{stroke:#e0483c;}
.review-chart .rv-grid{stroke:#22303e;stroke-width:1;vector-effect:non-scaling-stroke;}
.review-chart .rv-head-line{stroke:#ffd76a;stroke-width:1.4;vector-effect:non-scaling-stroke;opacity:.85;}
.rv-legend{display:flex;justify-content:space-between;gap:12px;margin-top:8px;font-size:12px;}
.rv-legend b{margin-left:5px;font-variant-numeric:tabular-nums;}
.review-card{width:240px;flex:none;background:#0e141b;border:1px solid #1c2632;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:10px;}
.review-win{font-size:14px;font-weight:700;padding:8px 10px;border-radius:6px;background:#131c26;}
.review-win.atk{color:#ffd76a;border-left:3px solid #4da3ff;}
.review-win.def{color:#ffb4ab;border-left:3px solid #e0483c;}
.review-win.tie{color:#9fb0c4;border-left:3px solid #5a6b7d;}
.review-rows{display:flex;flex-direction:column;gap:6px;}
.review-rows>div{display:flex;justify-content:space-between;gap:10px;font-size:12px;border-bottom:1px solid #17212c;padding-bottom:5px;}
.review-rows span{color:#8ea1b5;}
.review-rows b{color:#e6edf4;font-variant-numeric:tabular-nums;text-align:right;}
.review-note{font-size:11px;color:#7f93a6;font-style:italic;}
.review-foot{border-top:1px solid #1c2632;background:#0e141b;padding:10px 16px;}
.rv-timer{height:4px;background:#17212c;border-radius:3px;overflow:hidden;margin-bottom:10px;}
.rv-timer-fill{display:block;height:100%;width:0;background:linear-gradient(90deg,#4da3ff,#ffd76a);transition:width .08s linear;}
.rv-ctrls{display:flex;align-items:center;gap:8px;}
.rv-ctrls button{background:#182230;color:#cdd7e2;border:1px solid #2a3746;border-radius:6px;padding:6px 10px;cursor:pointer;font:12px inherit;}
.rv-ctrls button:hover{background:#233242;}
.rv-ctrls .rv-play{font-weight:700;color:#ffd76a;}
.rv-scrub{flex:1;accent-color:#4da3ff;cursor:pointer;}
.rv-count{color:#8ea1b5;font-variant-numeric:tabular-nums;min-width:34px;text-align:right;}
.review-open{margin-left:8px;background:#182230;color:#ffd76a;border:1px solid #2a3746;border-radius:6px;padding:2px 8px;cursor:pointer;font:11px inherit;}
.review-open:hover{background:#233242;}
.feed-review{cursor:pointer;}
.feed-review .feed-play{float:right;opacity:.55;margin-left:6px;}
.feed-review:hover .feed-play{opacity:1;}
`;
    document.head.appendChild(s);
  }

  store.onChange(() => { if (openId) renderHud(); });

  return {
    open,
    close,
    onMsg,
    onWorldEvents,
    /** 🎬 Recently-resolved review (docs/04 §7b): open a result/replay panel over `list` at `index`. */
    openReview,
    closeReview,
    /** 📖 library replay: re-run the Command-Mode coach now (or on the next steerable view). */
    startCoach,
    get openId() { return openId; },
    get reviewing() { return review !== null; },
    /** Debug/verification hooks (Playwright walkthrough reads these). */
    get field() { return field; },
    get snap() { return cur?.snap ?? null; },
    get steering() { return steer; },
    /** Screen position of a battlefield point (harness aims clicks with this). */
    toScreen(x, y) { return toScr(x, y); },
  };
}
