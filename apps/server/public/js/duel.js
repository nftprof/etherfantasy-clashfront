/**
 * HERO-vs-HERO CARD DUEL overlay (docs/briefs/HERO-DUEL-SPEC.md, decision 14).
 *
 * v1 is a CARD game, NOT a skill fight. A best-of-3 rock-paper-scissors
 * (AGGRESSIVE > TRICK > DEFENSIVE) that the SERVER resolves deterministically —
 * a Master's rating dominates (via per-round initiative) and Named artifacts are
 * the wildcard. This overlay is the interactive skin: it opens OVER command mode
 * (so a challenge mid-battle never tears down the command view), lets an online
 * player PICK a card each round within the pick window (timeout ⇒ the server's
 * NPC auto-pick), and re-reveals every round beat-by-beat.
 *
 * WS protocol (server-authoritative — this client only sends picks):
 *   ← duel_open {duelId, A, D, shareA, pickWindowSec, yourSide, parcelId}
 *   ← duel_round_prompt {duelId, round}          → show the card buttons + timer
 *   → duel_pick {duelId, round, card}            → your choice this round
 *   ← duel_round {duelId, round, cA, cD, by, reason, proc, winsA, winsD}
 *   ← duel_end {duelId, winner, winnerName, rounds}
 *   ← duel_err {code, message}
 */
import { esc } from './util.js';

const CARDS = [
  { key: 'AGGRESSIVE', icon: '⚔', label: 'Aggressive', beats: 'Trick', tip: 'All-out attack — blows through a Trick.' },
  { key: 'TRICK', icon: '🎭', label: 'Trick', beats: 'Defensive', tip: 'A feint — bypasses a Defensive guard.' },
  { key: 'DEFENSIVE', icon: '🛡', label: 'Defensive', beats: 'Aggressive', tip: 'Turtle up — turns an Aggressive charge.' },
];
const CARD_BY_KEY = Object.fromEntries(CARDS.map((c) => [c.key, c]));

export function createDuel({ ui, send }) {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'duel-overlay';
  root.hidden = true;
  document.body.appendChild(root);

  let session = null;        // { duelId, A, D, shareA, yourSide, winsA, winsD, round, pickWindowSec, ended }
  let timer = null;          // client-side countdown rAF/interval id
  let picked = false;        // did we pick this round yet

  const foeSide = () => (session.yourSide === 'A' ? 'D' : 'A');
  const meName = () => (session.yourSide === 'A' ? session.A : session.D).name;
  const foeName = () => (session.yourSide === 'A' ? session.D : session.A).name;

  function onMsg(msg) {
    switch (msg.t) {
      case 'duel_open': return open(msg);
      case 'duel_round_prompt': return prompt(msg);
      case 'duel_round': return reveal(msg);
      case 'duel_end': return end(msg);
      case 'duel_err':
        ui?.toast?.('⚔ Duel', esc(msg.message ?? 'the duel could not start'), 'bad');
        return close();
      default: return undefined;
    }
  }

  function open(msg) {
    session = {
      duelId: msg.duelId,
      A: msg.A, D: msg.D,
      shareA: msg.shareA ?? 0.5,
      yourSide: msg.yourSide ?? 'A',
      pickWindowSec: msg.pickWindowSec ?? 10,
      parcelId: msg.parcelId,
      winsA: 0, winsD: 0, round: 0, ended: false,
    };
    picked = false;
    root.hidden = false;
    renderShell('The champions square off…');
  }

  function prompt(msg) {
    if (!session || msg.duelId !== session.duelId) return;
    session.round = msg.round;
    picked = false;
    renderShell();
    startCountdown();
  }

  function reveal(msg) {
    if (!session || msg.duelId !== session.duelId) return;
    stopCountdown();
    session.winsA = msg.winsA;
    session.winsD = msg.winsD;
    session.lastRound = msg; // {round, cA, cD, by, reason, proc}
    picked = false;
    renderShell();
  }

  function end(msg) {
    if (!session || msg.duelId !== session.duelId) return;
    stopCountdown();
    session.ended = true;
    session.winner = msg.winner;
    session.winnerName = msg.winnerName;
    renderShell();
    const iWon = msg.winner === session.yourSide;
    ui?.toast?.('⚔ Duel', iWon ? `${esc(meName())} wins the duel!` : `${esc(foeName())} takes the duel.`, iWon ? 'good' : 'bad', session.parcelId);
  }

  function pick(card) {
    if (!session || session.ended || picked) return;
    picked = true;
    stopCountdown();
    send({ t: 'duel_pick', duelId: session.duelId, round: session.round, card });
    renderShell();
  }

  function close() {
    stopCountdown();
    session = null;
    root.hidden = true;
    root.innerHTML = '';
  }

  // ── countdown (cosmetic — the server is authoritative on timing) ─────────────
  function startCountdown() {
    stopCountdown();
    const total = session.pickWindowSec * 1000;
    const start = performance.now();
    const tick = () => {
      if (!session || session.ended) return;
      const left = Math.max(0, total - (performance.now() - start));
      const bar = root.querySelector('.duel-timer-fill');
      if (bar) bar.style.width = `${Math.round((left / total) * 100)}%`;
      const num = root.querySelector('.duel-timer-num');
      if (num) num.textContent = `${Math.ceil(left / 1000)}s`;
      if (left <= 0) { stopCountdown(); return; } // server will auto-pick + send duel_round
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  }
  function stopCountdown() { if (timer) { cancelAnimationFrame(timer); timer = null; } }

  // ── render ───────────────────────────────────────────────────────────────────
  function pips(wins) {
    return `<span class="duel-pips">${'●'.repeat(wins)}${'○'.repeat(Math.max(0, 2 - wins))}</span>`;
  }

  function masterCard(side) {
    const s = side === 'A' ? session.A : session.D;
    const wins = side === 'A' ? session.winsA : session.winsD;
    const me = side === session.yourSide;
    const cls = side === 'A' ? 'atk' : 'def';
    return `<div class="duel-master ${cls}${me ? ' me' : ''}">` +
      `<div class="duel-mname">${esc(s.name)}${me ? ' <em>(you)</em>' : ''}</div>` +
      (s.artifact ? `<div class="duel-art" title="Named artifact — the wildcard">✦ ${esc(s.artifact)}</div>` : '') +
      `<div class="duel-wins">${pips(wins)}</div></div>`;
  }

  function centre() {
    if (session.ended) {
      const iWon = session.winner === session.yourSide;
      return `<div class="duel-result ${iWon ? 'win' : 'lose'}">` +
        `<div class="duel-result-big">${iWon ? '🏆 Victory' : '☠ Defeated'}</div>` +
        `<div class="duel-result-sub">${esc(session.winnerName)} wins the duel — the loser is carried from the field. Troops were spared.</div>` +
        `<button class="duel-close" data-duel="close">Close</button></div>`;
    }
    const r = session.lastRound;
    const revealBit = r
      ? `<div class="duel-reveal">${roundReveal(r)}</div>`
      : '';
    // Card buttons appear when a round is in progress and we haven't picked.
    const canPick = session.round > 0 && !picked;
    const buttons = session.round > 0
      ? `<div class="duel-round-label">Round ${session.round} — play your card</div>` +
        `<div class="duel-timer"><span class="duel-timer-fill"></span><b class="duel-timer-num">${session.pickWindowSec}s</b></div>` +
        `<div class="duel-cards">` +
        CARDS.map((c) => `<button class="duel-card" data-card="${c.key}"${canPick ? '' : ' disabled'} title="${esc(c.tip)}">` +
          `<span class="duel-card-icon">${c.icon}</span><span class="duel-card-name">${c.label}</span>` +
          `<span class="duel-card-beats">beats ${c.beats}</span></button>`).join('') +
        `</div>` +
        (picked ? `<div class="duel-wait">✓ Card locked — awaiting your foe…</div>` : `<div class="duel-hint">Aggressive → Trick → Defensive → Aggressive. If you don't pick, your Master decides.</div>`)
      : `<div class="duel-round-label">Get ready…</div>`;
    return revealBit + buttons;
  }

  function roundReveal(r) {
    const cA = CARD_BY_KEY[r.cA], cD = CARD_BY_KEY[r.cD];
    const mineKey = session.yourSide === 'A' ? r.cA : r.cD;
    const foeKey = session.yourSide === 'A' ? r.cD : r.cA;
    const iTook = r.by === session.yourSide;
    const reason = r.reason === 'PROC' ? `✦ ${esc(r.proc?.label ?? 'artifact')} flared`
      : r.reason === 'INITIATIVE' ? 'seized the initiative'
        : r.reason === 'RATING' ? 'won on the tie (rating)'
          : 'won the exchange';
    const card = (k) => `<span class="duel-rc"><span class="ic">${CARD_BY_KEY[k].icon}</span>${CARD_BY_KEY[k].label}</span>`;
    return `<div class="duel-rev-row"><b>Round ${r.round}:</b> you ${card(mineKey)} vs ${card(foeKey)} — ` +
      `<span class="${iTook ? 'good' : 'bad'}">${iTook ? 'you' : 'foe'} ${reason}</span></div>`;
  }

  function renderShell(subtitle) {
    if (!session) return;
    const ctx = session.parcelId ? ` · ${esc(session.parcelId)}` : '';
    root.innerHTML =
      `<div class="duel-panel">` +
        `<div class="duel-head"><b>⚔ Hero Duel</b><span class="duel-ctx">best of 3${ctx}</span>` +
          (session.ended ? `<button class="duel-x" data-duel="close" title="Close">✕</button>` : '') + `</div>` +
        `<div class="duel-body">` +
          masterCard('A') +
          `<div class="duel-centre">${subtitle ? `<div class="duel-sub">${esc(subtitle)}</div>` : ''}${centre()}</div>` +
          masterCard('D') +
        `</div>` +
      `</div>`;
  }

  root.addEventListener('click', (e) => {
    const cardBtn = e.target.closest('button.duel-card');
    if (cardBtn && !cardBtn.disabled) { pick(cardBtn.dataset.card); return; }
    const closeBtn = e.target.closest('[data-duel="close"]');
    if (closeBtn) close();
  });

  return { onMsg, close, get open() { return session !== null && !root.hidden; } };
}

function injectStyles() {
  if (document.getElementById('duel-styles')) return;
  const s = document.createElement('style');
  s.id = 'duel-styles';
  s.textContent =
    `.duel-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;` +
    `background:rgba(4,7,11,0.66);backdrop-filter:blur(2px);font:14px "Segoe UI",system-ui,sans-serif;}` +
    `.duel-panel{width:min(760px,94vw);background:linear-gradient(180deg,#141b24,#0e141b);border:1px solid #2a3644;` +
    `border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden;}` +
    `.duel-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #212c39;}` +
    `.duel-head b{font-size:16px;color:#eaf0f6;}` +
    `.duel-ctx{color:#7d8da0;font-size:12px;}` +
    `.duel-x{margin-left:auto;background:none;border:none;color:#8ea1b5;font-size:16px;cursor:pointer;}` +
    `.duel-body{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:12px;padding:18px 16px 22px;align-items:start;}` +
    `.duel-master{text-align:center;padding:12px 8px;border-radius:10px;border:1px solid #24303e;background:#0f1620;}` +
    `.duel-master.atk{border-color:#2c4a68;} .duel-master.def{border-color:#5a2f2a;}` +
    `.duel-master.me{box-shadow:0 0 0 1px #ffd76a inset;}` +
    `.duel-mname{font-weight:600;color:#eaf0f6;font-size:15px;} .duel-mname em{color:#ffd76a;font-style:normal;font-size:11px;}` +
    `.duel-art{margin-top:5px;color:#ffce8a;font-size:12px;}` +
    `.duel-wins{margin-top:8px;} .duel-pips{letter-spacing:4px;color:#ffd76a;font-size:15px;}` +
    `.duel-centre{text-align:center;min-height:180px;}` +
    `.duel-sub{color:#9fb0c2;margin-bottom:10px;}` +
    `.duel-round-label{color:#cdd7e2;font-weight:600;margin-bottom:8px;}` +
    `.duel-timer{position:relative;height:6px;background:#1a232e;border-radius:4px;margin:0 auto 12px;max-width:260px;overflow:hidden;}` +
    `.duel-timer-fill{position:absolute;left:0;top:0;bottom:0;width:100%;background:linear-gradient(90deg,#ffd76a,#ff9a3c);transition:width .1s linear;}` +
    `.duel-timer-num{position:absolute;right:-30px;top:-6px;color:#9fb0c2;font-size:11px;}` +
    `.duel-cards{display:flex;gap:10px;justify-content:center;}` +
    `.duel-card{flex:1;max-width:140px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:14px 8px;` +
    `background:#121a24;border:1px solid #2a3644;border-radius:10px;color:#cdd7e2;cursor:pointer;transition:.12s;}` +
    `.duel-card:hover:not(:disabled){border-color:#ffd76a;transform:translateY(-2px);background:#17212d;}` +
    `.duel-card:disabled{opacity:.45;cursor:default;}` +
    `.duel-card-icon{font-size:26px;} .duel-card-name{font-weight:600;color:#eaf0f6;} .duel-card-beats{font-size:10px;color:#6b7f93;}` +
    `.duel-hint{margin-top:12px;color:#6b7f93;font-size:11px;}` +
    `.duel-wait{margin-top:12px;color:#8fd39a;font-size:12px;}` +
    `.duel-reveal{margin-bottom:14px;padding:8px 10px;background:#0c1219;border:1px solid #212c39;border-radius:8px;}` +
    `.duel-rev-row{color:#b8c4d0;font-size:12px;} .duel-rc{display:inline-flex;align-items:center;gap:3px;color:#eaf0f6;}` +
    `.duel-rc .ic{font-size:14px;}` +
    `.duel-result{padding:14px;} .duel-result-big{font-size:26px;font-weight:700;margin-bottom:8px;}` +
    `.duel-result.win .duel-result-big{color:#ffd76a;} .duel-result.lose .duel-result-big{color:#e0483c;}` +
    `.duel-result-sub{color:#9fb0c2;font-size:13px;margin-bottom:16px;}` +
    `.duel-close,.duel-x{cursor:pointer;} .duel-close{background:#1c2733;border:1px solid #2a3644;color:#eaf0f6;` +
    `border-radius:8px;padding:8px 22px;font-size:14px;}` +
    `.duel-close:hover{border-color:#ffd76a;color:#ffd76a;}` +
    `.good{color:#8fd39a;} .bad{color:#e0483c;}`;
  document.head.appendChild(s);
}
