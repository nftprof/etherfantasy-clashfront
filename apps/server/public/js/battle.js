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
  let raf = 0;
  let blotches = null;    // painterly ground stains (visual only, per battle)
  let flashes = [];       // death/hit effects {x, y, t0, kind}
  let dpr = 1, w = 0, h = 0;

  // ── open/close ─────────────────────────────────────────────────────────────
  function open(battleId) {
    if (openId === battleId) return;
    if (openId) close(true);
    openId = battleId;
    field = null;
    prev = cur = null;
    ended = null;
    flashes = [];
    steer = false;
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
    finishCoach(true); // never leak a coach card across views
  }

  // ── WS frames ──────────────────────────────────────────────────────────────
  function onMsg(msg) {
    if (msg.battleId !== openId) return;
    if (msg.t === 'battle_hello') {
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
  const toScr = (x, y) => [ox() + x * scale(), oy() + y * scale()];
  const toWorld = (sx, sy) => [(sx - ox()) / scale(), (sy - oy()) / scale()];

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
      ctx.fillText('Connecting to the battle…', w / 2, h / 2);
      ctx.textAlign = 'start';
      return;
    }
    const s = scale();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0e13';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox(), dpr * oy());
    const lw = (px) => px / s;

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

    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
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

    // rally flag
    const rally = cur.snap.rally;
    if (rally) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = lw(1.6);
      ctx.beginPath();
      ctx.moveTo(rally.x, rally.y);
      ctx.lineTo(rally.x, rally.y - 7);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(rally.x, rally.y - 7);
      ctx.lineTo(rally.x + 5.5, rally.y - 5.2);
      ctx.lineTo(rally.x, rally.y - 3.4);
      ctx.closePath();
      ctx.fill();
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
    const waves = snap ? `<span class="bt-stat" title="Wave budget — squads still to spawn">🌊 <b>${snap.waves.stock}</b><em>/${snap.waves.stockStart} squads</em></span>` : '';
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
      `<div class="bt-stats">${masterBit}${waves}${mobs}${towers}` +
      `<span class="bt-stat" title="Battle clock — expiry means the attack guttered out">⏱ <b>${clock}</b></span>` +
      `<span class="bt-prog" title="Lair broken at 100%"><span style="width:${prog}%"></span></span></div>` +
      `<div class="bt-btns">` +
      (canSteer && !ended
        ? `<button class="bt-steer${steer ? ' on' : ''}" data-bt="steer">${steer ? '🎮 Steering' : '🎮 Steer'}</button>` +
          `<button class="bt-hero" disabled title="Hero Mode — drop into this battle as your Master (full MOBA combat). Coming soon.">⚡ Take the field<span class="soon">SOON</span></button>`
        : '') +
      `<button data-bt="leave">✕ Leave</button></div>`;
    foot.innerHTML = ended
      ? `<span>The armies disperse — outcome lands on the war map…</span>`
      : stale
        ? `<span class="bad">⚠ Signal lost — awaiting the battle relay…</span>`
        : steer
          ? `<span><b>Click</b>: move Master · <b>click an enemy</b>: focus fire · <b>right-click</b>: rally the waves</span>`
          : canSteer
            ? `<span>Watching. Press <b>🎮 Steer</b> to command your Master and waves.</span>`
            : `<span>Watching a battle for ${esc(terr?.name ?? 'wild land')} — spectator only.</span>`;
  }

  hud.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.bt === 'leave') close();
    else if (btn.dataset.bt === 'steer') { steer = !steer; renderHud(); }
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
    } else {
      const [x, y] = toWorld(sx, sy);
      send({ t: 'battle_cmd', battleId: openId, cmd: { kind: 'move', x, y } });
      flashes.push({ x, y, t0: performance.now(), kind: 'hit' });
    }
    if (coach?.beat === 1) coachAdvance(); // beat 2 advances on a REAL move/focus
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!steer || !openId || ended) return;
    const r = canvas.getBoundingClientRect();
    const [x, y] = toWorld(e.clientX - r.left, e.clientY - r.top);
    send({ t: 'battle_cmd', battleId: openId, cmd: { kind: 'rally', x, y } });
    if (coach?.beat === 2) coachAdvance(); // beat 3 advances on the rally order (or its 6 s timer)
  });

  store.onChange(() => { if (openId) renderHud(); });

  return {
    open,
    close,
    onMsg,
    onWorldEvents,
    /** 📖 library replay: re-run the Command-Mode coach now (or on the next steerable view). */
    startCoach,
    get openId() { return openId; },
    /** Debug/verification hooks (Playwright walkthrough reads these). */
    get field() { return field; },
    get snap() { return cur?.snap ?? null; },
    get steering() { return steer; },
    /** Screen position of a battlefield point (harness aims clicks with this). */
    toScreen(x, y) { return toScr(x, y); },
  };
}
