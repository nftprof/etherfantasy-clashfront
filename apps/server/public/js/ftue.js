/**
 * FTUE — guided first-time tutorial (product-owner brief 2026-07-02: "after i
 * login… not sure what to do where to click"). A spotlight/coach-mark overlay
 * (4-panel dim + gold ring + positioned callout card) plus a goal-tracker chip.
 *
 * Steps advance off REAL game progress, not off "Next": store diffs (claim /
 * raise / march applied by POST responses) OR the matching WS events — either
 * path fires, both are idempotent. Info-only steps use Next. Per-player
 * persistence in localStorage `ftue:<governorId>`; skippable at every step;
 * replayable via the 🎓 header button. Map targets are re-projected every frame
 * so the spotlight follows camera pans/zooms/flights; callouts clamp on-screen.
 *
 * Z-order contract: pillage modal (90) < goal chip (96 — always readable) and
 * ftue overlay (95) < join overlay (100). Dim panels are pointer-events:none —
 * the tutorial guides, it never traps: every real control stays clickable.
 */
import { fmtDur, PRESETS, presetCostCt, PROV, strengthOf } from './util.js';

const GOLD = '#d9a441';
const RING_PAD = 7;      // px of breathing room around the spotlit rect
const BATTLE_DWELL_MS = 2600; // how long the "Battle!" beat holds before the choice step
const TIP_HIDE_MS = 15_000;   // contextual tips auto-dismiss after this
const presetStrength = (p) => strengthOf(PRESETS[p].units.map(([c, k]) => ({ unitClass: c, count: k })));
const STANDARD_STRENGTH = presetStrength('STANDARD');

/** Scouts tip copy derived from the ACTUAL preset numbers (stays true if balance shifts). */
function scoutsTipText() {
  const n = PRESETS.SCOUTS.units.reduce((s, [, k]) => s + k, 0);
  const frac = Math.max(2, Math.round(STANDARD_STRENGTH / Math.max(1, presetStrength('SCOUTS'))));
  return `${n} cavalry for ${presetCostCt('SCOUTS')} CT — cheap and expendable, about 1/${frac} of a ` +
    'Standard army’s strength. For grabbing ground and screening borders, not for fighting.';
}

export function createFTUE({ store, map, ui }) {
  const $ = (id) => document.getElementById(id);
  const root = $('ftue');
  const chip = $('goal-chip');
  const canvas = $('map');
  const card = root.querySelector('.ftue-card');
  const ring = root.querySelector('.ftue-ring');
  const dims = {};
  for (const d of root.querySelectorAll('.ftue-dim')) dims[d.dataset.d] = d;

  let active = false;
  let stepIx = 0;
  let rafId = 0;
  let checkQueued = false;
  let pulseTimer = null;
  let dwellToken = 0;      // invalidates stale battle-dwell timeouts
  let chipToken = 0;       // invalidates stale ✓-flash timeouts
  let lastCardKey = null;  // re-render the callout only when its content changes
  let lastChipAt = 0;

  // tutorial-run working state (not persisted — reconcile() rebuilds it on resume)
  let suggestedClaim = null;   // parcelId the heuristic picked for step CLAIM
  let suggestedTarget = null;  // weak monster parcelId for step MARCH
  let marchPhase = null;       // march step: null | 'select' (click your army) | 'target' (pick a destination)
  let marchCandidates = [];    // marchable parcelIds within 1–2 steps — phase-B click-space
  let lastClaimedParcelId = null;
  let battleParcel = null;
  let battlePhase = 'wait';    // battle step: 'wait' (marching) | 'fired' (resolved beat)
  let battleOutcome = null;    // 'win' | 'loss' | 'tie'
  let flags = null;

  const freshFlags = () => ({ claimed: false, raised: false, marched: false, battled: false, choiceSeen: false, choiceDone: false });
  const storageKey = () => `ftue:${store.me?.governorId ?? 'anon'}`;

  // ── persistence ─────────────────────────────────────────────────────────────
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(storageKey()) ?? 'null'); } catch { return null; }
  }
  function persist(done) {
    try { localStorage.setItem(storageKey(), JSON.stringify({ v: 1, step: stepIx, done: !!done })); } catch { /* private mode */ }
  }

  // ── target rects (viewport coords) ──────────────────────────────────────────
  function elRect(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  }
  /** Parcel bbox → viewport rect, clamped into the map area so offscreen targets pin to the edge. */
  function parcelRect(parcelId) {
    if (!parcelId) return null;
    const r = map.parcelRectOf(parcelId);
    if (!r) return null;
    const c = canvas.getBoundingClientRect();
    let x0 = c.left + r.x, y0 = c.top + r.y, x1 = x0 + r.w, y1 = y0 + r.h;
    x0 = Math.max(x0, c.left + 4); y0 = Math.max(y0, c.top + 4);
    x1 = Math.min(x1, c.right - 4); y1 = Math.min(y1, c.bottom - 4);
    return { x: x0, y: y0, w: Math.max(26, x1 - x0), h: Math.max(26, y1 - y0) };
  }
  /** Small box around my (marching-first) army's interpolated map position. */
  function armyRect() {
    const a = store.myArmies().find((x) => x.state === 'MARCHING') ?? store.myArmies()[0];
    if (!a) return null;
    const [wx, wy] = store.armyPos(a);
    const [sx, sy] = map.worldToScreen(wx, wy);
    const c = canvas.getBoundingClientRect();
    return { x: c.left + sx - 34, y: c.top + sy - 34, w: 68, h: 68 };
  }
  /** Rail from its top through the Officers section (war-council spotlight). */
  function councilRect() {
    const rail = elRect('#rail');
    if (!rail) return null;
    const h3 = [...document.querySelectorAll('#rail-body .rail-sec h3')]
      .find((h) => h.textContent.startsWith('Officers'));
    const sec = h3?.parentElement?.getBoundingClientRect();
    return sec ? { x: rail.x, y: rail.y, w: rail.w, h: Math.max(140, sec.bottom - rail.y + 4) } : rail;
  }
  function fullRect() { return { x: 0, y: 0, w: innerWidth, h: innerHeight }; }

  // ── suggestion heuristics ───────────────────────────────────────────────────
  const isClaimable = (t) => t !== undefined && t !== null && t.governorKind === 'SYSTEM' && !t.garrison;

  /** BFS over the parcel graph: distance from `from` to the nearest id in `targets` (≤ maxDepth). */
  function bfsNearest(from, targets, maxDepth) {
    if (targets.has(from)) return 0;
    const seen = new Set([from]);
    let frontier = [from];
    for (let d = 1; d <= maxDepth; d++) {
      const next = [];
      for (const pid of frontier) {
        for (const n of store.parcels.get(pid)?.neighbors ?? []) {
          if (seen.has(n)) continue;
          seen.add(n);
          if (targets.has(n)) return d;
          next.push(n);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return Infinity;
  }

  /** All-parcels distance map from `from`, capped at maxDepth. */
  function bfsDistances(from, maxDepth) {
    const dist = new Map([[from, 0]]);
    let frontier = [from];
    for (let d = 1; d <= maxDepth; d++) {
      const next = [];
      for (const pid of frontier) {
        for (const n of store.parcels.get(pid)?.neighbors ?? []) {
          if (dist.has(n)) continue;
          dist.set(n, d);
          next.push(n);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return dist;
  }

  function monsterStrengthAt(parcelId) {
    return store.hostilesAt(parcelId)
      .filter((a) => a.monsterName)
      .reduce((n, a) => n + a.strength, 0);
  }

  /**
   * Suggested starting parcel: claimable (SYSTEM + no garrison), prefer 2+
   * claimable neighbors (room to grow), a WEAK monster 2–3 steps away (step-5
   * action nearby) but not adjacent, and never beside the NPC kingdom.
   */
  function pickClaim() {
    const weakMonsters = new Set();
    const anyMonsters = new Set();
    for (const t of store.terrByParcel.values()) {
      if (!t.garrison?.monsterName) continue;
      anyMonsters.add(t.parcelId);
      const s = monsterStrengthAt(t.parcelId);
      if (s > 0 && s <= 0.65 * STANDARD_STRENGTH) weakMonsters.add(t.parcelId);
    }
    let best = null, bestScore = -Infinity;
    for (const t of store.terrByParcel.values()) {
      if (!isClaimable(t)) continue;
      const p = store.parcels.get(t.parcelId);
      if (!p) continue;
      let claimNbrs = 0, npcAdj = false, monAdj = false;
      for (const n of p.neighbors) {
        const nt = store.terrByParcel.get(n);
        if (isClaimable(nt)) claimNbrs++;
        if (nt?.governorKind === 'NPC_KINGDOM') npcAdj = true;
        if (anyMonsters.has(n)) monAdj = true;
      }
      const dWeak = bfsNearest(t.parcelId, weakMonsters, 4);
      let score = Math.min(claimNbrs, 4) * 8 + (claimNbrs >= 2 ? 14 : 0);
      if (npcAdj) score -= 100;             // never beside the NPC kingdom
      if (monAdj) score -= 10;              // near the action, not IN it
      if (dWeak === 2 || dWeak === 3) score += 22 - dWeak * 3;
      else if (dWeak === 1) score += 5;
      else if (!Number.isFinite(dWeak)) score -= 8;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    suggestedClaim = best?.parcelId ?? null;
  }

  /** Nearest weak monster parcel my army safely beats (clear of the tie band, never a losing fight). */
  function pickTarget() {
    const army = store.myArmies().find((a) => a.state === 'GARRISON') ?? store.myArmies()[0];
    suggestedTarget = null;
    if (!army) return;
    const dist = bfsDistances(army.parcelId, 14);
    let best = null, bestKey = Infinity;
    for (const t of store.terrByParcel.values()) {
      if (!t.garrison?.monsterName) continue;
      const d = dist.get(t.parcelId);
      if (d === undefined || d === 0) continue;
      const hs = store.hostilesAt(t.parcelId).reduce((n, a) => n + a.strength, 0);
      if (hs <= 0 || hs >= army.strength) continue;                                   // never suggest a loss
      if ((army.strength - hs) / army.strength <= PROV.tieThreshold + 0.05) continue; // clear of stalemate band
      const key = (hs <= 0.65 * army.strength ? 0 : 1000) + d * 10 + hs / 10_000;     // clearly-weak first, then near
      if (key < bestKey) { bestKey = key; best = t; }
    }
    suggestedTarget = best?.parcelId ?? null;
  }

  /** Phase-B click-space: every marchable parcel within 1–2 steps of the army. */
  function pickCandidates() {
    marchCandidates = [];
    const army = store.myArmies().find((a) => a.state === 'GARRISON') ?? store.myArmies()[0];
    if (!army) return;
    for (const [pid, d] of bfsDistances(army.parcelId, 2)) {
      if (d > 0 && pid !== suggestedTarget) marchCandidates.push(pid);
    }
  }

  const myGarrisonArmy = () => store.myArmies().find((a) => a.state === 'GARRISON') ?? store.myArmies()[0];

  /**
   * March step guide sync (runs every frame while on the step): phase A rings
   * the army marker on the map (+ its rail row), phase B outlines the candidate
   * destinations and burns the recommended one. World-anchored via map.setGuide.
   */
  function syncMarchGuide() {
    const phase = map.selectedArmyId ? 'target' : 'select';
    const army = myGarrisonArmy();
    if (phase !== marchPhase) {
      marchPhase = phase;
      if (phase === 'select') {
        map.setGuide(army ? { armyId: army.id } : null);
      } else {
        const parcels = marchCandidates.map((id) => ({ id, kind: 'candidate' }));
        if (suggestedTarget) parcels.push({ id: suggestedTarget, kind: 'recommended' });
        map.setGuide({
          parcels,
          ...(suggestedTarget ? { tag: { parcelId: suggestedTarget, text: '⚔ recommended' } } : {}),
        });
        clearRailMark();
      }
    }
    // rail re-renders wipe classes — re-mark the army row each frame in phase A
    if (phase === 'select' && army) {
      document.querySelector(`#rail-body .rail-row[data-army="${army.id}"]`)?.classList.add('ftue-mark');
    }
  }
  function clearRailMark() {
    for (const el of document.querySelectorAll('.ftue-mark')) el.classList.remove('ftue-mark');
  }

  function homeParcel() {
    if (lastClaimedParcelId && store.isMine(store.terrByParcel.get(lastClaimedParcelId)?.governorId)) {
      return lastClaimedParcelId;
    }
    return store.myTerritories()[0]?.parcelId ?? null;
  }

  // ── pulse highlight (re-fires so the mark stays alive) ──────────────────────
  function startPulse(getParcelId, color) {
    stopPulse();
    const fire = () => { const pid = getParcelId(); if (pid) map.pulseAt(pid, color); };
    fire();
    pulseTimer = setInterval(fire, 1700);
  }
  function stopPulse() { if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; } }

  // ── the script ──────────────────────────────────────────────────────────────
  const steps = [
    {
      id: 'welcome', goal: 'Survey the world',
      title: '⚔ Welcome to Clash Front', next: 'Next',
      body: 'This is a persistent war. Everything you see is real land other players fight over — and the world moves even while you sleep.',
      target: () => elRect('#map-wrap') ?? fullRect(),
    },
    {
      id: 'council', goal: 'Meet your war council',
      title: 'Your war council', next: 'Next',
      body: 'The <b>treasury</b> is your CT — every soldier and sack of grain costs it. The <b>officers</b> below are your Hero (you) and your Masters: generals who govern land and lead armies — right now they are idle, waiting for orders.',
      target: () => councilRect() ?? fullRect(),
    },
    {
      id: 'claim', goal: 'Claim your first land',
      title: 'Claim your first land', action: 'Claim the marked parcel',
      body: () => suggestedClaim
        ? 'This will be your home. Click the marked parcel, then press <b>🏳 Claim this land</b>.'
        : 'Click any dark wild parcel without a red monster eye, then press <b>🏳 Claim this land</b>.',
      target: () => elRect('#card [data-act="claim"]') ?? parcelRect(suggestedClaim) ?? elRect('#map-wrap'),
      onEnter() {
        pickClaim();
        if (suggestedClaim) {
          map.gotoParcel(suggestedClaim);
          startPulse(() => suggestedClaim, GOLD);
        }
      },
      onExit() { stopPulse(); },
      done: () => flags.claimed || store.myTerritories().length > 0,
    },
    {
      id: 'claimed', goal: 'Land claimed ⚑',
      title: '⚑ Yours!', next: 'Next',
      body: 'An officer now oversees it — see <b>Territories</b> and <b>Officers</b> in the rail. Officers are your expansion limit: one governs each territory, one leads each army.',
      target: () => elRect('#rail') ?? fullRect(),
      onEnter() { ui.closeCard(); },
    },
    {
      id: 'raise', goal: 'Raise your army',
      title: 'Raise your army', action: 'Press Raise',
      body: () => elRect('#card [data-act="raise"]')
        ? 'Troops + provisions: <b>food</b> is your battle clock, <b>gold + wood</b> build your camp. Press <b>⚔ Raise Standard army</b>.'
        : 'Click your glowing parcel to open its card, then press <b>⚔ Raise Standard army</b>.',
      target: () => elRect('#card [data-act="raise"]') ?? parcelRect(homeParcel()) ?? elRect('#map-wrap'),
      onEnter() {
        const p = homeParcel();
        if (p) { map.gotoParcel(p); ui.openCard(p); startPulse(() => homeParcel(), GOLD); }
      },
      onExit() { stopPulse(); },
      done: () => flags.raised || store.myArmies().length > 0,
    },
    {
      // Two-phase beat (PO feedback 2026-07-02: "doesn't show who to click"):
      // A) ring the army until it's selected, B) outline the whole click-space.
      id: 'march',
      goal: () => (map.selectedArmyId ? 'March to war' : 'Select your army'),
      title: () => (map.selectedArmyId ? 'March to war' : 'Select your army'),
      action: () => (map.selectedArmyId ? 'Order the march' : 'Click the ringed army'),
      body: () => !map.selectedArmyId
        ? 'First, click your army — the <b>gold-ringed banner</b> on your parcel (or its glowing row in the rail).'
        : suggestedTarget
          ? 'March somewhere — the outlined parcels are in reach, and the <b>⚔ marked one is a fight you can win</b>. Click it, then press March.'
          : 'March somewhere — click an outlined parcel and check the odds preview. <b>Never attack even odds.</b>',
      target: () => elRect('#march-popover [data-march]')
        ?? (map.selectedArmyId ? (parcelRect(suggestedTarget) ?? armyRect()) : armyRect())
        ?? elRect('#map-wrap'),
      onEnter() {
        ui.closeCard();
        pickTarget();
        pickCandidates();
        marchPhase = null; // syncMarchGuide (per-frame) installs the phase-A/B marks
      },
      onExit() { marchPhase = null; map.setGuide(null); clearRailMark(); },
      done: () => flags.marched || store.myArmies().some((a) => a.state === 'MARCHING'),
    },
    {
      id: 'battle',
      goal: () => {
        if (battlePhase === 'fired') return 'Battle!';
        const a = store.myArmies().find((x) => x.state === 'MARCHING');
        return a?.etaTick !== undefined
          ? `Army marching — ETA ${fmtDur(store.ticksToMs(a.etaTick - store.tickFloat()))}`
          : 'March underway';
      },
      title: () => battlePhase !== 'fired' ? 'Your army marches'
        : battleOutcome === 'tie' ? '🏳 Stalemate'
          : battleOutcome === 'loss' ? '💀 Defeat' : '⚔ Battle!',
      body: () => battlePhase !== 'fired'
        ? 'Real time — distance is a weapon. The battle resolves on contact, and everyone can see you coming.'
        : battleOutcome === 'tie'
          ? 'Evenly matched — the clock ran out and your attackers withdrew. Bring 1.5× strength next time.'
          : battleOutcome === 'loss'
            ? 'The defenders held. Rebuild, provision, and pick weaker prey next time.'
            : 'The land burns where armies clash. Strength, food and morale decide it — your officer helps, capped at 20%.',
      // Fired beat: if the victory modal already opened (same tick), frame IT —
      // a hole punched to the parcel behind it reads as visual noise.
      target: () => battlePhase === 'fired'
        ? (elRect('#modal .box') ?? parcelRect(battleParcel) ?? elRect('#toasts') ?? fullRect())
        : (armyRect() ?? elRect('#map-wrap')),
      onEnter() {
        if (flags.battled) battleBeat(battleOutcome, battleParcel); // battle already happened (e.g. interception mid-march)
        else battlePhase = 'wait';
      },
    },
    {
      id: 'choice', goal: 'Pillage or occupy',
      title: 'Victory — your command?', action: 'Choose',
      body: '<b>🔥 Pillage</b> = loot now, ruin the land. <b>🏰 Occupy</b> = the parcel joins your banner — needs a free officer.',
      target: () => elRect('#modal .opts') ?? elRect('#modal') ?? fullRect(),
      onEnter() { if (store.myPendingChoices().length > 0) flags.choiceSeen = true; },
      done: () => flags.choiceDone || (flags.choiceSeen && store.myPendingChoices().length === 0),
    },
    {
      id: 'finale', goal: 'You know war now',
      title: 'You know war now', next: 'To war ⚔',
      body: 'Expand, provision, watch your borders — the world does not stop when you leave. The <b>?</b> button holds the full war guide.',
      target: () => elRect('#goal-chip') ?? elRect('#rail-head') ?? fullRect(),
    },
  ];
  const stepIndex = (id) => steps.findIndex((s) => s.id === id);

  // ── goal chip ───────────────────────────────────────────────────────────────
  const txt = (v) => (typeof v === 'function' ? v() : v);
  function renderChip() {
    if (chip.classList.contains('gc-done')) return; // ✓ flash owns the chip briefly
    chip.innerHTML = `<span class="gc-ico">⚑</span>${txt(steps[stepIx].goal)}`;
  }
  function flashChip(goalText) {
    const token = ++chipToken;
    chip.classList.add('gc-done');
    chip.innerHTML = `<span class="gc-ico">✓</span>${goalText}`;
    setTimeout(() => {
      if (token !== chipToken) return;
      chip.classList.remove('gc-done');
      if (active) renderChip(); else chip.hidden = true;
    }, 1400);
  }

  // ── callout card ────────────────────────────────────────────────────────────
  function renderCard() {
    const s = steps[stepIx];
    const dots = steps.map((_, i) =>
      `<span class="fd${i === stepIx ? ' on' : i < stepIx ? ' past' : ''}"></span>`).join('');
    card.innerHTML =
      `<div class="ftue-dots">${dots}<span class="ftue-n">${stepIx + 1}/${steps.length}</span></div>` +
      `<h4>${txt(s.title)}</h4><p>${txt(s.body)}</p>` +
      `<div class="ftue-btns"><a href="#" class="ftue-skip" data-ftue="skip">Skip tutorial</a>` +
      (s.next
        ? `<button class="primary" data-ftue="next">${s.next}</button>`
        : `<span class="ftue-hint">${txt(s.action) ?? 'Do it on the map'}<a href="#" data-ftue="step-skip" title="Skip this step">skip ›</a></span>`) +
      `</div>`;
  }

  card.addEventListener('click', (e) => {
    const el = e.target.closest('[data-ftue]');
    if (!el) return;
    e.preventDefault();
    if (el.dataset.ftue === 'skip') skip();
    else if (stepIx === steps.length - 1) finish();
    else advance({ flash: false }); // Next (info steps) or "skip ›" (action steps)
  });

  // ── spotlight layout (runs every frame while active) ────────────────────────
  function layout(target) {
    const W = innerWidth, H = innerHeight;
    const x = Math.round(target.x - RING_PAD), y = Math.round(target.y - RING_PAD);
    const w = Math.round(target.w + 2 * RING_PAD), h = Math.round(target.h + 2 * RING_PAD);
    const set = (el, l, t, ww, hh) => {
      el.style.left = l + 'px'; el.style.top = t + 'px';
      el.style.width = Math.max(0, ww) + 'px'; el.style.height = Math.max(0, hh) + 'px';
    };
    set(dims.t, 0, 0, W, y);
    set(dims.b, 0, y + h, W, H - y - h);
    set(dims.l, 0, y, x, h);
    set(dims.r, x + w, y, W - x - w, h);
    set(ring, x, y, w, h);
    placeCard(x, y, w, h, W, H);
  }

  function placeCard(x, y, w, h, W, H) {
    const cw = card.offsetWidth || 280, ch = card.offsetHeight || 150, m = 14;
    let cx, cy;
    if (w * h > 0.55 * W * H) { cx = (W - cw) / 2; cy = Math.min(H - ch - 18, y + h * 0.6); } // huge target: settle inside it
    else if (x + w + m + cw <= W - 8) { cx = x + w + m; cy = y + h / 2 - ch / 2; }
    else if (x - m - cw >= 8) { cx = x - m - cw; cy = y + h / 2 - ch / 2; }
    else if (y + h + m + ch <= H - 8) { cx = x + w / 2 - cw / 2; cy = y + h + m; }
    else { cx = x + w / 2 - cw / 2; cy = y - m - ch; }
    card.style.left = Math.max(8, Math.min(cx, W - cw - 8)) + 'px';
    card.style.top = Math.max(8, Math.min(cy, H - ch - 8)) + 'px';
  }

  function follow() {
    if (!active) return;
    const s = steps[stepIx];
    if (s.id === 'march') syncMarchGuide(); // phase A/B marks track selection + camera
    const key = `${stepIx}|${txt(s.title)}|${txt(s.body)}`;
    if (key !== lastCardKey) { lastCardKey = key; renderCard(); }
    layout(s.target() ?? fullRect());
    const now = performance.now();
    if (now - lastChipAt > 500) { lastChipAt = now; renderChip(); } // live ETA countdowns
    rafId = requestAnimationFrame(follow);
  }

  // ── step flow ───────────────────────────────────────────────────────────────
  function queueCheck() {
    if (checkQueued || !active) return;
    checkQueued = true;
    // rAF-deferred so WS events (handled right after store deltas) set their
    // flags BEFORE state-based conditions run — no bounce on battle ticks.
    requestAnimationFrame(() => { checkQueued = false; check(); });
  }

  function check() {
    if (!active) return;
    const s = steps[stepIx];
    if (s.done?.()) { advance({ flash: true }); return; }
    // March ended with no battle (empty destination): re-aim and re-brief.
    if (s.id === 'battle' && battlePhase === 'wait' && !flags.battled &&
        !store.myArmies().some((a) => a.state === 'MARCHING')) {
      gotoStep(stepIndex('march'));
    }
  }

  function advance({ flash = false } = {}) {
    if (flash) flashChip(txt(steps[stepIx].goal));
    gotoStep(stepIx + 1);
  }

  function gotoStep(i) {
    dwellToken++; // cancel pending battle-dwell hops
    steps[stepIx]?.onExit?.();
    stepIx = Math.max(0, Math.min(i, steps.length - 1));
    persist(false);
    lastCardKey = null;
    steps[stepIx].onEnter?.();
    renderChip();
    queueCheck(); // fast-forward if the new step is already satisfied
  }

  /** The "Battle!" beat: fly to the fire, hold the moment, then move on. */
  function battleBeat(outcome, parcelId) {
    battlePhase = 'fired';
    battleOutcome = outcome;
    battleParcel = parcelId;
    lastCardKey = null;
    if (parcelId) map.gotoParcel(parcelId);
    const token = ++dwellToken;
    setTimeout(() => {
      if (!active || token !== dwellToken || steps[stepIx].id !== 'battle') return;
      const won = outcome === 'win' || store.myPendingChoices().length > 0;
      gotoStep(stepIndex(won ? 'choice' : 'finale'));
    }, BATTLE_DWELL_MS);
  }

  // ── one-shot contextual tips ─────────────────────────────────────────────────
  // Just-in-time explainers, independent of the main tutorial: small anchored
  // callout (no dim/spotlight), each fires ONCE per player (localStorage
  // `tip:<playerId>:<key>`), dismissible, auto-hides. Data-driven registry —
  // adding a tip is one entry: presence tips fire when their anchor first
  // appears in the DOM (optionally gated by `when`); event tips are fired via
  // ftue.tip(key) / onEvents. `group` + `summary` feed the 📖 library (F5).
  const TIPS = [
    { key: 'scouts', presence: true, group: 'Armies & Provisions', summary: 'Cheap, fast, fragile — a moving reveal brush',
      anchor: () => document.querySelector('#card [data-act="raise"][data-preset="SCOUTS"]'),
      title: '🐎 Scout riders', text: scoutsTipText },
    { key: 'provision', presence: true, group: 'Armies & Provisions', summary: 'Food is the battle clock; gold + wood build the camp',
      anchor: () => document.querySelector('#card .prov-form'),
      title: '🛒 Provisions',
      text: 'Food = how long your army can fight (and march). Gold + wood = the command center it builds on the battlefield.' },
    { key: 'low-food', presence: true, group: 'Armies & Provisions', summary: 'Underfed armies fight weak and starve mid-march',
      anchor: () => [...document.querySelectorAll('#march-popover .warn')].find((el) => el.textContent.includes('Low food')),
      title: '🍞 Low food',
      text: 'An underfed army fights weak and can starve mid-march. Provision before long campaigns — food is the battle clock.' },
    { key: 'stalemate', group: 'Combat & Intel', summary: 'Even odds end in a draw — bring 1.5× strength',
      anchor: () => document.querySelector('#toasts .toast') ?? document.getElementById('toasts'),
      title: '🏳 Stalemate',
      text: 'Evenly matched battles end in stalemate — the attackers withdraw. Bring 1.5× strength or don’t march.' },
    { key: 'interception', group: 'Combat & Intel', summary: 'Hostile parcels stop a march dead',
      anchor: () => document.querySelector('#toasts .toast') ?? document.getElementById('toasts'),
      title: '⚠ Intercepted',
      text: 'Hostile parcels stop a march — an enemy can be your destination, never your shortcut. Route around threats or clear them first.' },
    { key: 'fog', presence: true, group: 'Combat & Intel', summary: 'Why distant parcels show ??',
      anchor: () => document.querySelector('#tooltip:not([hidden]) .tt-unknown'),
      title: '🌫 Fog of war',
      text: 'You can’t see what defends distant land — scouts reveal it. Adjacent land and your armies grant accurate intel; one ring out is fuzzy; beyond is ??.' },
    { key: 'develop', presence: true, group: 'Towns & Development', summary: 'Spend CT on your parcels — defense, economy, food, cheaper armies',
      anchor: () => document.querySelector('#card .dev-sec'),
      when: () => store.ctBalance >= 800 * 10_000, // only pitch investing when there is CT to invest
      title: '🏗 Develop your land',
      text: 'Invest CT in your land — DEF makes it defensible, ECON pays you back. AGRI feeds garrisons, MIL trains armies cheaper.' },
  ];
  const tipEl = document.createElement('div');
  tipEl.id = 'tip-card';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  let tipShown = null;   // key currently on screen
  let tipFollow = null;  // re-anchor interval while shown
  let tipHide = null;

  function tipSeen(key) {
    try { return localStorage.getItem(`tip:${store.me?.governorId}:${key}`) === '1'; } catch { return true; }
  }
  /**
   * Fire a one-shot tip (no-op while the main tutorial runs, or if already
   * seen). `force` = library replay: bypasses seen/shown gates and falls back
   * to a map-center anchor when the tip's natural anchor isn't on screen.
   */
  function fireTip(key, force = false) {
    if (!store.me) return;
    if (!force && (active || tipShown)) return;
    const t = TIPS.find((x) => x.key === key);
    if (!t) return;
    if (!force && (tipSeen(key) || t.when?.() === false)) return;
    const fallback = () => (force ? document.getElementById('btn-library') : null);
    const anchor = t.anchor() ?? fallback();
    if (!anchor) return;
    try { localStorage.setItem(`tip:${store.me.governorId}:${key}`, '1'); } catch { /* private mode */ }
    if (tipShown) hideTip();
    tipShown = key;
    tipEl.innerHTML = `<button class="tclose" title="Dismiss">✕</button><h5>${t.title}</h5><p>${txt(t.text)}</p>`;
    tipEl.hidden = false;
    placeTip(anchor);
    tipFollow = setInterval(() => { const a = t.anchor() ?? fallback(); if (a) placeTip(a); }, 300);
    tipHide = setTimeout(hideTip, TIP_HIDE_MS);
  }
  function placeTip(anchor) {
    const r = anchor.getBoundingClientRect();
    const cw = tipEl.offsetWidth || 252, ch = tipEl.offsetHeight || 92, m = 10;
    let x, y = r.top + r.height / 2 - ch / 2;
    if (r.left - cw - m >= 8) x = r.left - cw - m;              // prefer left (cards live at the right edge)
    else if (r.right + m + cw <= innerWidth - 8) x = r.right + m;
    else {                                                       // no side room: below, else above
      x = r.left;
      y = r.bottom + m + ch <= innerHeight - 8 ? r.bottom + m : r.top - ch - m;
    }
    tipEl.style.left = Math.max(8, Math.min(x, innerWidth - cw - 8)) + 'px';
    tipEl.style.top = Math.max(8, Math.min(y, innerHeight - ch - 8)) + 'px';
  }
  function hideTip() {
    tipShown = null;
    tipEl.hidden = true;
    clearInterval(tipFollow); tipFollow = null;
    clearTimeout(tipHide); tipHide = null;
  }
  tipEl.addEventListener('click', (e) => { if (e.target.closest('.tclose')) hideTip(); });
  setInterval(() => { // presence-triggered tips: anchor just appeared in the DOM
    if (active || !store.me || tipShown) return;
    for (const t of TIPS) {
      if (t.presence && !tipSeen(t.key) && t.when?.() !== false && t.anchor()) { fireTip(t.key); break; }
    }
  }, 800);

  // ── 📖 tutorial library (F5) ─────────────────────────────────────────────────
  // Browsable, replayable index of EVERYTHING teachable: the guided-tutorial
  // steps + every contextual tip, grouped by system, seen/unseen badged.
  // Data-driven off the `steps` script and the TIPS registry above.
  const STEP_LIB = { // step id → library row metadata
    welcome: { group: 'Basics', title: '⚔ Welcome to Clash Front', summary: 'A persistent war over real land — it moves while you sleep' },
    council: { group: 'Basics', title: '🏛 Your war council', summary: 'Treasury, officers, and why they limit your empire' },
    claim: { group: 'Claiming & Land', title: '🏳 Claim your first land', summary: 'Pick a home parcel and plant the flag' },
    claimed: { group: 'Claiming & Land', title: '⚑ Officers govern land', summary: 'One officer per territory, one per army' },
    raise: { group: 'Armies & Provisions', title: '⚔ Raise your army', summary: 'Troops plus the food, gold and wood that keep them fighting' },
    march: { group: 'Armies & Provisions', title: '🥾 March to war', summary: 'Select an army, pick a destination, read the odds preview' },
    battle: { group: 'Combat & Intel', title: '🔥 Battle resolution', summary: 'Strength, food and morale decide it — distance is a weapon' },
    choice: { group: 'Combat & Intel', title: '🏰 Pillage or occupy', summary: 'Loot now and burn it, or govern it forever' },
    finale: { group: 'Basics', title: '🗺 The war goes on', summary: 'Expand, provision, watch your borders' },
  };
  const LIB_GROUPS = ['Basics', 'Claiming & Land', 'Armies & Provisions', 'Combat & Intel', 'Towns & Development'];

  const libEl = document.createElement('div');
  libEl.id = 'library';
  libEl.hidden = true;
  document.body.appendChild(libEl);

  /** A tutorial step counts as seen once the player has moved past it (or finished/skipped the run). */
  function stepSeen(ix) {
    const saved = loadSaved();
    if (saved?.done) return true;
    return ix < (active ? stepIx : (saved?.step ?? 0));
  }

  function openLibrary() {
    const byGroup = new Map(LIB_GROUPS.map((g) => [g, []]));
    steps.forEach((s, ix) => {
      const m = STEP_LIB[s.id];
      if (m) byGroup.get(m.group)?.push({ act: `step:${ix}`, title: m.title, summary: m.summary, seen: stepSeen(ix) });
    });
    for (const t of TIPS) {
      byGroup.get(t.group ?? 'Basics')?.push({
        act: `tip:${t.key}`, title: `${t.title} <span class="lib-kind">tip</span>`,
        summary: typeof t.summary === 'string' ? t.summary : '', seen: tipSeen(t.key),
      });
    }
    let html = `<div class="lib-box"><button class="close" data-lib="close">✕</button>` +
      `<h2>📖 Tutorial library</h2>` +
      `<p class="sub">Every lesson and tip, replayable any time. ` +
      `<button class="lib-all" data-lib="tutorial">▶ Replay full tutorial</button></p><div class="lib-scroll">`;
    for (const g of LIB_GROUPS) {
      const items = byGroup.get(g);
      if (!items?.length) continue;
      html += `<h3>${g}</h3>` + items.map((it) =>
        `<div class="lib-row"><span class="lib-badge ${it.seen ? 'seen' : 'unseen'}" title="${it.seen ? 'seen' : 'not seen yet'}">${it.seen ? '✓' : '●'}</span>` +
        `<div class="lib-mid"><div class="lib-title">${it.title}</div><div class="lib-sum">${it.summary}</div></div>` +
        `<button data-lib="${it.act}">Replay</button></div>`).join('');
    }
    libEl.innerHTML = html + `</div></div>`;
    libEl.hidden = false;
  }
  function closeLibrary() { libEl.hidden = true; }

  libEl.addEventListener('click', (e) => {
    if (e.target === libEl) { closeLibrary(); return; } // backdrop click
    const btn = e.target.closest('[data-lib]');
    if (!btn) return;
    const v = btn.dataset.lib;
    if (v === 'close') closeLibrary();
    else if (v === 'tutorial') { closeLibrary(); restart(); }
    else if (v.startsWith('step:')) { closeLibrary(); start(Number(v.slice(5)), false); }
    else if (v.startsWith('tip:')) { closeLibrary(); fireTip(v.slice(4), true); }
  });

  // ── WS event hook (called from app.js handleEvents) ─────────────────────────
  function onEvents(events) {
    const meAlways = store.me?.governorId;
    for (const ev of events) { // contextual tips fire with or without the tutorial
      const tied = ev.type === 'battle_tied' ||
        (ev.type === 'battle_resolved' && (ev.winner === 'DRAW' || ev.outcome === 'TIE'));
      if (tied && ev.attackerGovernorIds?.includes(meAlways)) fireTip('stalemate');
    }
    if (!active) return;
    const me = store.me?.governorId;
    for (const ev of events) {
      switch (ev.type) {
        case 'territory_claimed':
          if (ev.governorId === me) { flags.claimed = true; lastClaimedParcelId = ev.parcelId; }
          break;
        case 'army_raised':
          if (ev.governorId === me) flags.raised = true;
          break;
        case 'march_ordered':
          if (ev.governorId === me) flags.marched = true;
          break;
        case 'battle_resolved': {
          if (!ev.attackerGovernorIds?.includes(me)) break; // my ATTACK only — home defense is not this lesson
          flags.battled = true;
          const outcome = ev.winner === 'ATTACKER' ? 'win' : ev.winner === 'DRAW' || ev.outcome === 'TIE' ? 'tie' : 'loss';
          if (steps[stepIx].id === 'battle') battleBeat(outcome, ev.parcelId);
          else { battleOutcome = outcome; battleParcel = ev.parcelId; }
          break;
        }
        case 'battle_tied':
          if (!ev.attackerGovernorIds?.includes(me)) break;
          flags.battled = true;
          if (steps[stepIx].id === 'battle') battleBeat('tie', ev.parcelId);
          else { battleOutcome = 'tie'; battleParcel = ev.parcelId; }
          break;
        case 'choice_pending':
          if (ev.governorId === me) flags.choiceSeen = true;
          break;
        case 'territory_occupied':
        case 'territory_pillaged':
          if (ev.governorId === me && flags.choiceSeen) flags.choiceDone = true;
          break;
      }
    }
    queueCheck();
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────
  /** Resume support: bump past action steps whose real-world outcome already exists. */
  function reconcile(i) {
    if (i === stepIndex('claim') && store.myTerritories().length > 0) i = stepIndex('claimed');
    if (i === stepIndex('raise') && store.myArmies().length > 0) i = stepIndex('march');
    if (i === stepIndex('march') && store.myArmies().some((a) => a.state === 'MARCHING')) i = stepIndex('battle');
    if ((i === stepIndex('march') || i === stepIndex('battle')) && store.myPendingChoices().length > 0) {
      flags.choiceSeen = true;
      i = stepIndex('choice');
    }
    return i;
  }

  function start(atStep = 0, resume = false) {
    stop(false);
    active = true;
    flags = freshFlags();
    battlePhase = 'wait';
    battleOutcome = null;
    stepIx = Math.max(0, Math.min(atStep | 0, steps.length - 1));
    if (resume) stepIx = reconcile(stepIx);
    persist(false);
    root.hidden = false;
    chip.hidden = false;
    lastCardKey = null;
    steps[stepIx].onEnter?.();
    renderChip();
    rafId = requestAnimationFrame(follow);
    queueCheck();
  }

  function stop(hideChip = true) {
    active = false;
    dwellToken++;
    stopPulse();
    map.setGuide(null);
    clearRailMark();
    marchPhase = null;
    cancelAnimationFrame(rafId);
    root.hidden = true;
    if (hideChip) chip.hidden = true;
  }

  function finish() {
    persist(true);
    stop(false);
    flashChip('Tutorial complete');
    setTimeout(() => { if (!active) chip.hidden = true; }, 1500);
  }

  function skip() {
    persist(true);
    stop(true);
    ui.toast('Tutorial skipped', 'Replay it anytime with the 🎓 button. ? opens the full guide.', 'info');
  }

  /** Auto-start on first login only; returning players (land already held) never see it. */
  function maybeStart() {
    if (!store.me) return;
    const saved = loadSaved();
    if (saved?.done) return;
    if (saved) { start(saved.step ?? 0, true); return; } // resume an interrupted run
    if (store.myTerritories().length > 0) { // pre-FTUE veteran: mark done, never auto-play
      stepIx = steps.length - 1;
      persist(true);
      return;
    }
    start(0, false);
  }

  function restart() {
    if (!store.me) return;
    start(0, false);
  }

  store.onChange(queueCheck);
  window.addEventListener('resize', () => { if (active) lastChipAt = 0; });

  return {
    maybeStart, restart, skip, onEvents, openLibrary,
    tip: fireTip, // one-shot contextual tips (app.js fires event-driven ones)
    get active() { return active; },
    get step() { return steps[stepIx]?.id; },
    get stepIndex() { return stepIx; },
    get suggestedClaim() { return suggestedClaim; },
    get suggestedTarget() { return suggestedTarget; },
  };
}
