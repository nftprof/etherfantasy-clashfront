/**
 * DOM UI: home rail (assets + goto), tooltip, parcel card, march popover,
 * pillage/occupy modal, toasts, battle feed. All renders read the store;
 * re-render is scheduled (once per frame) on store change + a 1 Hz timer for
 * ETA countdowns.
 */
import { bfsPath, esc, fmtCT, fmtDur, PRESETS, presetCostCt, shortId } from './util.js';

const MAX_FEED = 10;

export function createUI({ store, map, orders }) {
  const $ = (id) => document.getElementById(id);
  const rail = $('rail-body');
  const tooltip = $('tooltip');
  const card = $('card');
  const popover = $('march-popover');
  const banner = $('select-banner');
  const modal = $('modal');
  const toasts = $('toasts');

  const feed = []; // {text, cls, parcelId} newest first
  let cardParcelId = null;
  let modalBattleId = null;
  let railQueued = false;

  // ── rail ───────────────────────────────────────────────────────────────────
  function scheduleRail() {
    if (railQueued) return;
    railQueued = true;
    requestAnimationFrame(() => { railQueued = false; renderRail(); });
  }

  function renderRail() {
    if (!store.me) return;
    const tf = store.tickFloat();
    const my = store.myTerritories();
    const armies = store.myArmies();
    const choices = store.myPendingChoices();
    const free = store.freeOfficerCount();

    const sec = (title, rows) =>
      `<div class="rail-sec"><h3>${title}</h3>${rows || '<div class="rail-empty">none</div>'}</div>`;
    const row = (attrs, dotColor, label, meta, alert = false) =>
      `<div class="rail-row${alert ? ' alert' : ''}" ${attrs}>` +
      (dotColor ? `<span class="dot" style="background:${dotColor}"></span>` : '') +
      `<span class="grow">${label}</span><span class="meta">${meta ?? ''}</span></div>`;

    let html = `<div class="rail-sec"><h3>Treasury</h3><div class="rail-ct">${fmtCT(store.ctBalance)}</div></div>`;

    html += sec(`Battle choices${choices.length ? ` (${choices.length})` : ''}`, choices.map((b) => {
      const t = store.territories.get(b.pendingChoice.territoryId);
      const left = fmtDur(store.ticksToMs(b.pendingChoice.expiresTick - tf));
      return row(`data-choice="${b.id}"`, '#e2603f', `Victory at <b>${esc(t?.name ?? '?')}</b>`, `${left} ⚑`, true);
    }).join(''));

    html += sec(`Armies (${armies.length})`, armies.map((a) => {
      const here = store.terrByParcel.get(a.parcelId);
      const meta = a.state === 'MARCHING'
        ? `→ ${fmtDur(store.ticksToMs((a.etaTick ?? tf) - tf))}`
        : `${a.troops}⚔`;
      const label = a.state === 'MARCHING'
        ? `${esc(a.heroName ?? shortId(a.id))} marching`
        : `${esc(a.heroName ?? shortId(a.id))} @ ${esc(here?.name ?? a.parcelId)}`;
      return row(`data-army="${a.id}"`, store.color(a.governorId), label, meta);
    }).join(''));

    html += sec(`Territories (${my.length})`, my.map((t) =>
      row(`data-parcel="${t.parcelId}"`, store.color(t.governorId), esc(t.name),
        `✦${t.prosperity}${t.garrison ? ' ⛨' : ''}`),
    ).join(''));

    const officers = store.officers.map((o) => {
      const duty = store.officerDuty(o.id);
      const meta = duty === undefined ? 'free' : duty.kind === 'leads' ? 'leads army' : 'oversees';
      const target = duty?.kind === 'leads' ? `data-army="${duty.army.id}"`
        : duty?.kind === 'oversees' ? `data-parcel="${duty.territory.parcelId}"` : '';
      return row(target, duty ? '#7d8a99' : '#58b06b', esc(o.name), meta);
    }).join('');
    html += sec(`Officers (${free}/${store.officers.length} free)`, officers);

    html += sec('War report', feed.map((f, i) =>
      `<div class="feed-row" data-feed="${i}"><span class="${f.cls}">${f.text}</span></div>`,
    ).join(''));

    rail.innerHTML = html;
  }

  rail.addEventListener('click', (e) => {
    const el = e.target.closest('[data-parcel],[data-army],[data-choice],[data-feed]');
    if (!el) return;
    if (el.dataset.parcel) { map.gotoParcel(el.dataset.parcel); openCard(el.dataset.parcel); }
    else if (el.dataset.army) {
      const a = store.armies.get(el.dataset.army);
      if (a) { map.gotoParcel(a.parcelId); if (a.state === 'GARRISON') selectArmy(a.id); }
    } else if (el.dataset.choice) openChoiceModal(el.dataset.choice);
    else if (el.dataset.feed) {
      const f = feed[Number(el.dataset.feed)];
      if (f?.parcelId) map.gotoParcel(f.parcelId);
    }
  });

  setInterval(() => { // ETA countdowns + choice timers
    if (store.myArmies().some((a) => a.state === 'MARCHING') || store.myPendingChoices().length) scheduleRail();
  }, 1000);

  // ── tooltip ────────────────────────────────────────────────────────────────
  function showTooltip(parcelId, ev) {
    if (!parcelId) { tooltip.hidden = true; return; }
    const t = store.terrByParcel.get(parcelId);
    if (!t) { tooltip.hidden = true; return; }
    const wild = t.governorKind === 'SYSTEM';
    const owner = wild ? 'Wild land' : `${esc(store.playerName(t.governorId))}${t.governorKind === 'NPC_KINGDOM' ? ' (NPC)' : ''}`;
    const garr = t.garrison
      ? `<div class="tt-sub">${t.garrison.monsterName ? `☠ ${esc(t.garrison.monsterName)}` : 'Garrisoned'} — ${t.garrison.troops} troops</div>`
      : '';
    tooltip.innerHTML = `<div class="tt-name">${esc(t.name)}</div>` +
      `<div class="tt-sub">${owner} · prosperity ${t.prosperity}</div>${garr}`;
    tooltip.hidden = false;
    const wrap = tooltip.parentElement.getBoundingClientRect();
    tooltip.style.left = Math.min(ev.clientX - wrap.left + 14, wrap.width - 240) + 'px';
    tooltip.style.top = Math.min(ev.clientY - wrap.top + 12, wrap.height - 80) + 'px';
  }

  // ── parcel card ────────────────────────────────────────────────────────────
  function openCard(parcelId) {
    cardParcelId = parcelId;
    renderCard();
  }
  function closeCard() { cardParcelId = null; card.hidden = true; }

  function renderCard() {
    const t = cardParcelId && store.terrByParcel.get(cardParcelId);
    if (!t) { card.hidden = true; return; }
    const wild = t.governorKind === 'SYSTEM';
    const mine = store.isMine(t.governorId);
    const color = store.color(t.governorId);
    const owner = wild ? 'Wild land — unclaimed' :
      `${esc(store.playerName(t.governorId))}${t.governorKind === 'NPC_KINGDOM' ? ' (NPC kingdom)' : mine ? ' (you)' : ''}`;
    const overseer = t.overseerId && mine ? store.officers.find((o) => o.id === t.overseerId) : null;

    let html = `<button class="close" data-act="close">✕</button>` +
      `<h3><span class="dot" style="background:${color}"></span>${esc(t.name)}</h3>` +
      `<div class="owner">${owner}${overseer ? ` · overseen by ${esc(overseer.name)}` : ''}</div>` +
      `<div class="stats"><span>Prosperity <b>${t.prosperity}</b></span><span>Morale <b>${t.morale}</b></span>` +
      `<span>Population <b>${t.population.toLocaleString()}</b></span></div>`;

    if (t.garrison) {
      html += `<div class="garr">${t.garrison.monsterName
        ? `<span class="m">☠ ${esc(t.garrison.monsterName)}</span> — ${t.garrison.troops} wild defenders`
        : `⛨ Garrison of ${esc(store.playerName(t.garrison.governorId))} — ${t.garrison.troops} troops`}</div>`;
    }

    const actions = [];
    if (wild && !t.garrison) {
      const canClaim = store.freeOfficerCount() > 0;
      actions.push(`<button class="primary" data-act="claim" ${canClaim ? '' : 'disabled'}>` +
        `<span>🏳 Claim this land</span><span class="cost">${canClaim ? 'free officer' : 'no officer'}</span></button>`);
    }
    if (mine) {
      for (const p of Object.keys(PRESETS)) {
        const cost = presetCostCt(p);
        const afford = store.ctBalance / 10_000 >= cost;
        actions.push(`<button data-act="raise" data-preset="${p}" ${afford ? '' : 'disabled'}>` +
          `<span>⚔ Raise ${PRESETS[p].label}</span><span class="cost">${cost} CT</span></button>`);
      }
    }
    if (actions.length) html += `<div class="actions">${actions.join('')}</div>`;
    if (!wild && !mine) html += `<div class="hint">Select one of your armies, then click here to march on it.</div>`;
    card.innerHTML = html;
    card.hidden = false;
  }

  card.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const t = store.terrByParcel.get(cardParcelId);
    if (btn.dataset.act === 'close') closeCard();
    else if (btn.dataset.act === 'claim' && t) orders.claim(t.id);
    else if (btn.dataset.act === 'raise' && t) orders.raise(t.id, btn.dataset.preset);
  });

  // ── army selection + march popover ─────────────────────────────────────────
  function selectArmy(armyId) {
    map.setSelectedArmy(armyId);
    const a = store.armies.get(armyId);
    banner.hidden = !a;
    if (a) {
      banner.innerHTML = `Ordering <b>${esc(a.heroName ?? shortId(a.id))}</b> (${a.troops}⚔, str ${a.strength})` +
        ` — click a destination parcel <button data-cancel>cancel</button>`;
    }
    closePopover();
  }
  banner.addEventListener('click', (e) => { if (e.target.closest('[data-cancel]')) selectArmy(null); });

  function openMarchPopover(parcelId, ev) {
    const a = store.armies.get(map.selectedArmyId);
    const t = store.terrByParcel.get(parcelId);
    if (!a || !t) return;
    if (a.parcelId === parcelId) { toast('Already there', 'That army already holds this parcel.', 'info'); return; }
    const path = bfsPath((id) => store.parcels.get(id)?.neighbors, a.parcelId, parcelId);
    let html = `<h4>March on ${esc(t.name)}</h4>`;
    if (!path) {
      html += `<div class="warn">Unreachable — no land route.</div>` +
        `<div class="btns"><button data-close>Close</button></div>`;
    } else {
      const etaMs = store.ticksToMs(path.length * (store.meta.travelTicksPerStep || 1));
      html += `<div class="row"><span>Distance</span><b>${path.length} parcel${path.length > 1 ? 's' : ''}</b></div>` +
        `<div class="row"><span>March time</span><b>~${fmtDur(etaMs)}</b></div>`;
      const hostiles = store.hostilesAt(parcelId);
      if (hostiles.length) {
        const theirs = hostiles.reduce((n, x) => n + x.strength, 0);
        const monster = hostiles.find((x) => x.monsterName);
        const pct = Math.round((a.strength / Math.max(1, a.strength + theirs)) * 100);
        html += `<div class="vs">${monster ? `☠ ${esc(monster.monsterName)}` : '⛨ Defenders'} — ${theirs} strength` +
          `<div class="row"><span>You ${a.strength}</span><span>them ${theirs}</span></div>` +
          `<div class="bar"><span style="width:${pct}%;background:#4f8fe8"></span><span style="flex:1;background:#a83a30"></span></div>` +
          `<div class="warn">Ties favor the defender.</div></div>`;
      }
      html += `<div class="btns"><button data-close>Cancel</button>` +
        `<button class="primary" data-march="${t.id}">March</button></div>`;
    }
    popover.innerHTML = html;
    popover.hidden = false;
    const wrap = popover.parentElement.getBoundingClientRect();
    popover.style.left = Math.max(8, Math.min(ev.clientX - wrap.left + 10, wrap.width - 258)) + 'px';
    popover.style.top = Math.max(8, Math.min(ev.clientY - wrap.top - 20, wrap.height - 230)) + 'px';
  }
  function closePopover() { popover.hidden = true; }

  popover.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.close !== undefined) closePopover();
    else if (btn.dataset.march) {
      orders.march(map.selectedArmyId, btn.dataset.march);
      selectArmy(null);
    }
  });

  // ── pillage/occupy modal ───────────────────────────────────────────────────
  function openChoiceModal(battleId) {
    const b = store.battles.get(battleId);
    if (!b?.pendingChoice) { modalBattleId = null; modal.hidden = true; return; }
    modalBattleId = battleId;
    const t = store.territories.get(b.pendingChoice.territoryId);
    const lootEst = t ? Math.round((t.population * 500) / 10_000) : 0;
    const free = store.freeOfficerCount();
    const overseen = store.myTerritories().filter((x) => x.overseerId).length;
    const canOccupy = free > 0 && overseen < 55;
    const why = free === 0 ? 'No free officer to govern it.' : overseen >= 55 ? 'Officer cap (55) reached.' : '';
    const left = fmtDur(store.ticksToMs(b.pendingChoice.expiresTick - store.tickFloat()));
    modal.innerHTML = `<div class="box"><h2>⚔ Victory at ${esc(t?.name ?? '?')}</h2>` +
      `<p class="sub">Your army has crushed the defenders. What is your command?</p>` +
      `<div class="opts">` +
      `<button class="opt" data-action="PILLAGE"><h4>🔥 Pillage</h4>` +
      `<p>Loot ~${lootEst} CT + treasury share. The land burns and degrades.</p></button>` +
      `<button class="opt" data-action="OCCUPY" ${canOccupy ? '' : 'disabled'}><h4>🏰 Occupy</h4>` +
      `<p>${canOccupy ? 'The territory joins your banner. Assigns a free officer as overseer.' : `<span class="why">${why}</span>`}</p></button>` +
      `</div><div class="timer">Undecided in ${left} → defaults to pillage</div></div>`;
    modal.hidden = false;
  }

  modal.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn && modalBattleId) {
      orders.choice(modalBattleId, btn.dataset.action);
      modalBattleId = null;
      modal.hidden = true;
    }
  });

  /** Refresh or dismiss the open modal after deltas (choice may have expired). */
  function syncModal() {
    if (modalBattleId && !store.battles.get(modalBattleId)?.pendingChoice) {
      modalBattleId = null;
      modal.hidden = true;
    }
    if (modalBattleId === null && !modal.hidden) modal.hidden = true;
    if (modalBattleId === null) {
      const next = store.myPendingChoices()[0];
      if (next) openChoiceModal(next.id);
    }
  }

  // ── toasts + feed ──────────────────────────────────────────────────────────
  function toast(title, sub, cls = 'info', parcelId = null, ms = 5000) {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.innerHTML = `<b>${title}</b>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    if (parcelId) el.addEventListener('click', () => map.gotoParcel(parcelId));
    toasts.prepend(el);
    while (toasts.children.length > 5) toasts.lastChild.remove();
    setTimeout(() => { el.classList.add('fading'); setTimeout(() => el.remove(), 700); }, ms);
  }

  function feedPush(text, cls, parcelId) {
    feed.unshift({ text, cls, parcelId });
    if (feed.length > MAX_FEED) feed.pop();
    scheduleRail();
  }

  store.onChange(() => { scheduleRail(); renderCard(); syncModal(); });

  return {
    scheduleRail, showTooltip, openCard, closeCard, selectArmy, openMarchPopover, closePopover,
    openChoiceModal, toast, feedPush,
    setConn(status) {
      const pip = $('conn-pip');
      pip.className = `pip ${status}`;
      pip.title = { ok: 'live', connecting: 'connecting…', down: 'reconnecting…' }[status] ?? status;
    },
    setPlayerLabel(name) { $('rail-player').textContent = name; },
  };
}
