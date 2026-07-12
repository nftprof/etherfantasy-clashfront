/**
 * HERO-vs-HERO DUEL overlay — the animated HP fight (docs/briefs/HERO-DUEL-SPEC.md,
 * decision 14; v2, owner 2026-07-12).
 *
 * Two hero "models" face off with HP bars, ATK stats and a named-artifact spell.
 * They trade blows across exchanges (server-authoritative, deterministic): each
 * blow LUNGES the attacker, SHAKES + flashes the struck hero, pops a floating
 * damage number (crits bigger/gold, artifact SPELLS flare their name), and drops
 * the HP bar — ending on a K.O. A stance CARD each exchange (aggressive/trick/
 * defensive) is the player's tactical swing; timeout ⇒ the server's NPC pick.
 * Opens OVER command mode so a mid-battle challenge never tears it down.
 *
 * WS: ← duel_open {A,D,maxExchanges,pickWindowSec,yourSide,parcelId}
 *     ← duel_round_prompt {round}   → stance buttons + timer
 *     → duel_pick {duelId,round,card}
 *     ← duel_round {round,cA,cD,blows[],hpA,hpD,maxHpA,maxHpD,koA,koD}
 *     ← duel_end {winner,winnerName,hpA,hpD}   ← duel_err {code,message}
 */
import { avatarHtml, esc, nameHue } from './util.js';

/**
 * Master head-shot portrait. Prefers the champion-slug art
 * (public/avatars/<slug>.png — the EF Masters slug, e.g. "choco.png"); the <img>
 * removes itself on 404 so the name-hued initials medallion underneath shows.
 * Falls back to the name-based avatar when no slug is known.
 */
function portraitHtml(d, px = 96) {
  if (!d.slug) return avatarHtml({ name: d.name }, px);
  const name = d.name ?? '?';
  const slug = String(d.slug).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const initials = esc((name.match(/[A-Za-z0-9]+/g) ?? []).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?');
  const url = `/avatars/${encodeURIComponent(slug)}.png`;
  return `<span class="avatar av-master" style="--av:${px}px;--avh:${nameHue(name)}" title="${esc(name)}">` +
    `<i>${initials}</i><img src="${url}" alt="" loading="lazy" onerror="this.remove()"></span>`;
}

const CARDS = [
  { key: 'AGGRESSIVE', icon: '⚔', label: 'Aggressive', tip: 'All-out — more damage, but you take more. Beats Trick.' },
  { key: 'TRICK', icon: '🎭', label: 'Trick', tip: 'A feint — wins the exchange against a Defensive guard.' },
  { key: 'DEFENSIVE', icon: '🛡', label: 'Defensive', tip: 'Turtle — take far less, deal less. Beats Aggressive.' },
];

export function createDuel({ ui, send }) {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'duel-overlay';
  root.hidden = true;
  document.body.appendChild(root);

  let s = null;        // session
  let timer = null;    // pick countdown rAF
  let anim = null;     // blow-animation timeout chain

  const meName = () => (s.yourSide === 'A' ? s.A : s.D).name;
  const foeName = () => (s.yourSide === 'A' ? s.D : s.A).name;

  function onMsg(msg) {
    switch (msg.t) {
      case 'duel_open': return open(msg);
      case 'duel_round_prompt': return prompt(msg);
      case 'duel_round': return playExchange(msg);
      case 'duel_end': return end(msg);
      case 'duel_err':
        ui?.toast?.('⚔ Duel', esc(msg.message ?? 'the duel could not start'), 'bad');
        return close();
      default: return undefined;
    }
  }

  function open(msg) {
    s = {
      duelId: msg.duelId, A: msg.A, D: msg.D, yourSide: msg.yourSide ?? 'A',
      pickWindowSec: msg.pickWindowSec ?? 10, maxExchanges: msg.maxExchanges ?? 12,
      parcelId: msg.parcelId, hpA: msg.A.maxHp, hpD: msg.D.maxHp,
      round: 0, picked: false, ended: false,
    };
    root.hidden = false;
    renderStage();
  }

  function prompt(msg) {
    if (!s || msg.duelId !== s.duelId) return;
    s.round = msg.round;
    s.picked = false;
    showStance(true);
    startCountdown();
  }

  function pick(card) {
    if (!s || s.ended || s.picked) return;
    s.picked = true;
    stopCountdown();
    send({ t: 'duel_pick', duelId: s.duelId, round: s.round, card });
    showStance(false);
    setStatus(`You chose ${card.toLowerCase()} — clash!`);
  }

  function playExchange(msg) {
    if (!s || msg.duelId !== s.duelId) return;
    stopCountdown();
    showStance(false);
    setRoundLabel(`Exchange ${msg.round}`);
    // Animate blows in order, then settle HP to the authoritative values.
    const blows = msg.blows ?? [];
    let i = 0;
    const step = () => {
      if (!s) return;
      if (i >= blows.length) {
        // settle to authoritative HP (covers any rounding)
        setHp('A', msg.hpA, msg.maxHpA);
        setHp('D', msg.hpD, msg.maxHpD);
        if (msg.koA) knockout('A');
        if (msg.koD) knockout('D');
        return;
      }
      animBlow(blows[i]);
      i++;
      anim = setTimeout(step, 780);
    };
    step();
  }

  function end(msg) {
    if (!s || msg.duelId !== s.duelId) return;
    stopCountdown();
    const finish = () => {
      if (!s) return;
      s.ended = true;
      s.winner = msg.winner;
      s.winnerName = msg.winnerName;
      renderResult();
      const iWon = msg.winner === s.yourSide;
      ui?.toast?.('⚔ Duel', iWon ? `${esc(meName())} wins the duel!` : `${esc(foeName())} takes the duel.`, iWon ? 'good' : 'bad', s.parcelId);
    };
    // let the last exchange's blow animation land first
    setTimeout(finish, 900);
  }

  function close() {
    stopCountdown();
    if (anim) { clearTimeout(anim); anim = null; }
    s = null;
    root.hidden = true;
    root.innerHTML = '';
  }

  // ── animation primitives ─────────────────────────────────────────────────────
  function heroEl(side) { return root.querySelector(`.duel-hero.${side === 'A' ? 'atk' : 'def'}`); }

  function animBlow(b) {
    const atk = heroEl(b.by);
    const defSide = b.by === 'A' ? 'D' : 'A';
    const def = heroEl(defSide);
    if (!atk || !def) return;
    atk.classList.remove('lunge-a', 'lunge-d');
    void atk.offsetWidth; // reflow to restart the animation
    atk.classList.add(b.by === 'A' ? 'lunge-a' : 'lunge-d');
    if (b.spell) atk.classList.add('cast');
    setTimeout(() => {
      def.classList.remove('hit'); void def.offsetWidth; def.classList.add('hit');
      if (b.crit || b.spell) { root.querySelector('.duel-stage')?.classList.add('flash'); setTimeout(() => root.querySelector('.duel-stage')?.classList.remove('flash'), 160); }
      floatDamage(defSide, b);
      // deplete the struck side's HP progressively as blows land
      const key = defSide;
      const cur = key === 'A' ? (s.hpA -= b.dmg) : (s.hpD -= b.dmg);
      setHp(key, Math.max(0, cur), key === 'A' ? s.A.maxHp : s.D.maxHp);
      atk.classList.remove('cast');
    }, 230);
  }

  function floatDamage(side, b) {
    const host = heroEl(side);
    if (!host) return;
    const el = document.createElement('div');
    el.className = `duel-dmg${b.crit ? ' crit' : ''}${b.spell ? ' spell' : ''}`;
    el.innerHTML = (b.spell ? `<span class="duel-spellname">✦ ${esc(b.spell.label)}</span>` : '') +
      `<span class="duel-dmgn">-${b.dmg}${b.crit ? ' CRIT!' : ''}</span>`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function knockout(side) {
    heroEl(side)?.classList.add('ko');
  }

  function setHp(side, hp, maxHp) {
    if (!s) return;
    if (side === 'A') s.hpA = hp; else s.hpD = hp;
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const bar = root.querySelector(`.duel-hpfill.${side === 'A' ? 'atk' : 'def'}`);
    if (bar) { bar.style.width = `${pct}%`; bar.classList.toggle('low', pct < 30); }
    const num = root.querySelector(`.duel-hpnum.${side === 'A' ? 'atk' : 'def'}`);
    if (num) num.textContent = `${Math.max(0, Math.round(hp))}`;
  }

  // ── render ───────────────────────────────────────────────────────────────────
  function hero(side) {
    const d = side === 'A' ? s.A : s.D;
    const me = side === s.yourSide;
    const cls = side === 'A' ? 'atk' : 'def';
    return `<div class="duel-hero ${cls}${me ? ' me' : ''}">` +
      `<div class="duel-portrait">${portraitHtml(d, 92)}</div>` +
      `<div class="duel-hname">${esc(d.name)}${me ? ' <em>(you)</em>' : ''}</div>` +
      `<div class="duel-stats">⚔ ${d.atk}${d.artifact ? ` · <span class="duel-art">✦ ${esc(d.artifact)}</span>` : ''}</div>` +
      `</div>`;
  }

  function hpBar(side) {
    const d = side === 'A' ? s.A : s.D;
    const cls = side === 'A' ? 'atk' : 'def';
    return `<div class="duel-hprow ${cls}">` +
      `<span class="duel-hpname">${esc(d.name)}</span>` +
      `<div class="duel-hpbar"><span class="duel-hpfill ${cls}" style="width:100%"></span></div>` +
      `<span class="duel-hpnum ${cls}">${d.maxHp}</span></div>`;
  }

  function renderStage() {
    const ctx = s.parcelId ? ` · ${esc(s.parcelId)}` : '';
    root.innerHTML =
      `<div class="duel-panel">` +
        `<div class="duel-head"><b>⚔ Hero Duel</b><span class="duel-ctx">a fight to the K.O.${ctx}</span></div>` +
        `<div class="duel-hpbars">${hpBar('A')}${hpBar('D')}</div>` +
        `<div class="duel-stage">${hero('A')}<div class="duel-vs"><span class="duel-round-label">Ready…</span><div class="duel-clash">VS</div></div>${hero('D')}</div>` +
        `<div class="duel-foot"><div class="duel-status">The champions square off…</div>` +
          `<div class="duel-stance" hidden>` +
            `<div class="duel-timer"><span class="duel-timer-fill"></span><b class="duel-timer-num">${s.pickWindowSec}s</b></div>` +
            `<div class="duel-cards">` +
            CARDS.map((c) => `<button class="duel-card" data-card="${c.key}" title="${esc(c.tip)}">` +
              `<span class="duel-card-icon">${c.icon}</span><span class="duel-card-name">${c.label}</span></button>`).join('') +
            `</div></div>` +
        `</div>` +
      `</div>`;
  }

  function renderResult() {
    const iWon = s.winner === s.yourSide;
    const foot = root.querySelector('.duel-foot');
    if (foot) {
      foot.innerHTML =
        `<div class="duel-result ${iWon ? 'win' : 'lose'}">` +
          `<div class="duel-result-big">${iWon ? '🏆 Victory' : '☠ Defeated'}</div>` +
          `<div class="duel-result-sub">${esc(s.winnerName)} wins the duel — the loser is carried from the field. Troops were spared.</div>` +
          `<button class="duel-close" data-duel="close">Close</button></div>`;
    }
    setRoundLabel('K.O.');
  }

  function showStance(on) {
    const box = root.querySelector('.duel-stance');
    if (box) box.hidden = !on;
    root.querySelectorAll('.duel-card').forEach((b) => { b.disabled = !on; });
    if (on) setStatus(`Exchange ${s.round} — choose your stance!`);
  }
  function setStatus(t) { const el = root.querySelector('.duel-status'); if (el) el.textContent = t; }
  function setRoundLabel(t) { const el = root.querySelector('.duel-round-label'); if (el) el.textContent = t; }

  function startCountdown() {
    stopCountdown();
    const total = s.pickWindowSec * 1000;
    const start = performance.now();
    const tick = (now) => {
      if (!s || s.ended) return;
      const left = Math.max(0, total - (now - start));
      const fill = root.querySelector('.duel-timer-fill');
      if (fill) fill.style.width = `${Math.round((left / total) * 100)}%`;
      const num = root.querySelector('.duel-timer-num');
      if (num) num.textContent = `${Math.ceil(left / 1000)}s`;
      if (left <= 0) { stopCountdown(); setStatus('Your Master reads the moment…'); return; }
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  }
  function stopCountdown() { if (timer) { cancelAnimationFrame(timer); timer = null; } }

  root.addEventListener('click', (e) => {
    const card = e.target.closest('button.duel-card');
    if (card && !card.disabled) { pick(card.dataset.card); return; }
    if (e.target.closest('[data-duel="close"]')) close();
  });

  return { onMsg, close, get open() { return s !== null && !root.hidden; } };
}

function injectStyles() {
  if (document.getElementById('duel-styles')) return;
  const el = document.createElement('style');
  el.id = 'duel-styles';
  el.textContent = `
.duel-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(3,6,10,0.72);backdrop-filter:blur(2px);font:14px "Segoe UI",system-ui,sans-serif;}
.duel-panel{width:min(820px,96vw);background:linear-gradient(180deg,#151d27,#0d131b);border:1px solid #2a3644;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,0.65);overflow:hidden;}
.duel-head{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid #202b38;}
.duel-head b{font-size:16px;color:#eaf0f6;} .duel-ctx{color:#7d8da0;font-size:12px;}
.duel-hpbars{display:flex;gap:16px;padding:14px 18px 4px;}
.duel-hprow{flex:1;display:flex;align-items:center;gap:8px;}
.duel-hprow.def{flex-direction:row-reverse;text-align:right;}
.duel-hpname{font-size:12px;color:#cdd7e2;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;}
.duel-hpbar{flex:1;height:14px;background:#0b1119;border:1px solid #263140;border-radius:8px;overflow:hidden;}
.duel-hpfill{display:block;height:100%;border-radius:7px;transition:width .35s ease;}
.duel-hpfill.atk{background:linear-gradient(90deg,#2f77c4,#4da3ff);}
.duel-hprow.def .duel-hpbar{transform:scaleX(-1);}
.duel-hpfill.def{background:linear-gradient(90deg,#c43f34,#ff6a5c);}
.duel-hpfill.low{background:linear-gradient(90deg,#c43f34,#ffb020)!important;}
.duel-hpnum{font-size:12px;color:#9fb0c2;min-width:34px;font-variant-numeric:tabular-nums;}
.duel-stage{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:22px 18px;min-height:210px;background:radial-gradient(ellipse at center,#16202c,#0c1119);}
.duel-stage.flash::after{content:"";position:absolute;inset:0;background:rgba(255,240,190,0.22);pointer-events:none;}
.duel-hero{display:flex;flex-direction:column;align-items:center;gap:6px;transition:transform .18s ease;}
.duel-hero.atk{justify-self:start;} .duel-hero.def{justify-self:end;}
.duel-portrait{width:96px;height:96px;border-radius:50%;overflow:hidden;border:3px solid #2c4a68;box-shadow:0 6px 18px rgba(0,0,0,0.5);background:#0e1620;}
.duel-hero.def .duel-portrait{border-color:#5a2f2a;}
.duel-hero.me .duel-portrait{border-color:#ffd76a;}
.duel-portrait img,.duel-portrait .avatar{width:100%;height:100%;object-fit:cover;}
.duel-hname{font-weight:600;color:#eaf0f6;} .duel-hname em{color:#ffd76a;font-style:normal;font-size:11px;}
.duel-stats{font-size:12px;color:#9fb0c2;} .duel-art{color:#ffce8a;}
.duel-vs{display:flex;flex-direction:column;align-items:center;gap:6px;color:#6b7f93;}
.duel-round-label{font-size:12px;color:#9fb0c2;} .duel-clash{font-size:22px;font-weight:800;color:#3a4756;}
.duel-foot{padding:14px 18px 20px;text-align:center;border-top:1px solid #202b38;}
.duel-status{color:#9fb0c2;margin-bottom:10px;min-height:18px;}
.duel-timer{position:relative;height:6px;background:#1a232e;border-radius:4px;margin:0 auto 12px;max-width:280px;overflow:hidden;}
.duel-timer-fill{position:absolute;inset:0;width:100%;background:linear-gradient(90deg,#ffd76a,#ff9a3c);}
.duel-timer-num{position:absolute;right:-30px;top:-6px;color:#9fb0c2;font-size:11px;}
.duel-cards{display:flex;gap:10px;justify-content:center;}
.duel-card{flex:1;max-width:150px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:12px 8px;background:#121a24;border:1px solid #2a3644;border-radius:10px;color:#cdd7e2;cursor:pointer;transition:.12s;}
.duel-card:hover:not(:disabled){border-color:#ffd76a;transform:translateY(-2px);background:#17212d;}
.duel-card:disabled{opacity:.4;cursor:default;}
.duel-card-icon{font-size:24px;} .duel-card-name{font-weight:600;color:#eaf0f6;}
.duel-dmg{position:absolute;top:-6px;left:50%;transform:translateX(-50%);pointer-events:none;animation:duelfloat 1.1s ease-out forwards;text-align:center;white-space:nowrap;}
.duel-dmgn{font-weight:800;font-size:20px;color:#ff8a7a;text-shadow:0 2px 4px rgba(0,0,0,0.7);}
.duel-dmg.crit .duel-dmgn{font-size:26px;color:#ffd76a;}
.duel-spellname{display:block;font-size:12px;color:#c9a6ff;font-weight:700;}
@keyframes duelfloat{0%{opacity:0;transform:translate(-50%,6px);}15%{opacity:1;}100%{opacity:0;transform:translate(-50%,-46px);}}
.duel-hero.lunge-a{animation:lungeA .34s ease;} .duel-hero.lunge-d{animation:lungeD .34s ease;}
@keyframes lungeA{40%{transform:translateX(46px) scale(1.05);}100%{transform:translateX(0);}}
@keyframes lungeD{40%{transform:translateX(-46px) scale(1.05);}100%{transform:translateX(0);}}
.duel-hero.hit{animation:duelshake .3s ease;} @keyframes duelshake{0%,100%{transform:translateX(0);}20%{transform:translateX(-7px);}40%{transform:translateX(7px);}60%{transform:translateX(-5px);}80%{transform:translateX(5px);}}
.duel-hero.hit .duel-portrait{box-shadow:0 0 0 4px rgba(255,80,60,0.55),0 6px 18px rgba(0,0,0,0.5);}
.duel-hero.cast .duel-portrait{box-shadow:0 0 22px 6px rgba(180,120,255,0.7);border-color:#c9a6ff!important;}
.duel-hero.ko{animation:duelko .7s ease forwards;} @keyframes duelko{100%{transform:rotate(-14deg) translateY(16px);opacity:.35;filter:grayscale(1);}}
.duel-result{padding:6px;} .duel-result-big{font-size:26px;font-weight:800;margin-bottom:8px;}
.duel-result.win .duel-result-big{color:#ffd76a;} .duel-result.lose .duel-result-big{color:#e0483c;}
.duel-result-sub{color:#9fb0c2;font-size:13px;margin-bottom:16px;}
.duel-close{cursor:pointer;background:#1c2733;border:1px solid #2a3644;color:#eaf0f6;border-radius:8px;padding:8px 24px;font-size:14px;}
.duel-close:hover{border-color:#ffd76a;color:#ffd76a;}
`;
  document.head.appendChild(el);
}
