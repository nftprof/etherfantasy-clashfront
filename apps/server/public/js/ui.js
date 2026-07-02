/**
 * DOM UI: home rail (assets + goto), tooltip, parcel card, march popover,
 * pillage/occupy modal, toasts, battle feed. All renders read the store;
 * re-render is scheduled (once per frame) on store change + a 1 Hz timer for
 * ETA countdowns.
 */
import {
  battleFoodNeed, bfsPath, ccTierFor, DEV, DEV_TRACKS, devCostCtUnits, esc, fmtBand, fmtCT,
  fmtDur, foodSteps, fmtProv, PRESETS, presetCostCt, PROV, provisionCostCtUnits, shortId,
  strengthEst, troopsEst,
} from './util.js';

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
  let modalChoiceId = null;
  let railQueued = false;
  let provDraft = null; // {armyId, food, gold, wood} — open provision form on the parcel card
  const raidBanner = $('raid-banner');
  const activeRaids = new Map(); // armyId → {parcelId, who} — wild raids on MY land (F3)

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

    html += sec(`Decisions${choices.length ? ` (${choices.length})` : ''}`, choices.map((c) => {
      const t = store.territories.get(c.territoryId);
      const left = fmtDur(store.ticksToMs(c.expiresTick - tf));
      const label = c.walkIn ? `Town of <b>${esc(t?.name ?? '?')}</b> awaits` : `Victory at <b>${esc(t?.name ?? '?')}</b>`;
      return row(`data-choice="${c.choiceId}"`, c.walkIn ? '#d9a441' : '#e2603f', label, `${left} ⚑`, true);
    }).join(''));

    html += sec(`Armies (${armies.length})`, armies.map((a) => {
      const here = store.terrByParcel.get(a.parcelId);
      const meta = a.state === 'MARCHING'
        ? `→ ${fmtDur(store.ticksToMs((a.etaTick ?? tf) - tf))}`
        : `${a.troops}⚔`;
      const label = a.state === 'MARCHING'
        ? `${esc(a.heroName ?? shortId(a.id))} marching`
        : `${esc(a.heroName ?? shortId(a.id))} @ ${esc(here?.name ?? a.parcelId)}`;
      const steps = foodSteps(a);
      const low = a.state === 'MARCHING' && a.path && steps < a.path.length; // starves before arrival
      return row(`data-army="${a.id}"`, store.color(a.governorId), label, meta) +
        `<div class="rail-sub${low ? ' low' : ''}" data-army="${a.id}">` +
        `${fmtProv(a.provisions)} · ${steps} step${steps === 1 ? '' : 's'} of food${low ? ' ⚠' : ''}</div>`;
    }).join(''));

    html += sec(`Territories (${my.length})`, my.map((t) =>
      row(`data-parcel="${t.parcelId}"`, store.color(t.governorId), esc(t.name),
        `✦${t.prosperity}${t.garrison ? ' ⛨' : ''}`),
    ).join(''));

    const officers = store.officers.map((o) => {
      const duty = store.officerDuty(o.id);
      const meta = duty === undefined ? 'free' : duty.kind === 'leads' ? 'leads army' : 'oversees';
      const target = duty?.kind === 'leads' ? `data-army="${duty.army.id}"`
        : duty?.kind === 'oversees' ? `data-parcel="${duty.territory.parcelId}"` : `data-officer="${o.id}"`;
      return row(target, duty ? '#7d8a99' : '#58b06b', esc(o.name), meta);
    }).join('');
    html += sec(`Officers (${free}/${store.officers.length} free)`, officers);

    html += sec('War report', feed.map((f, i) =>
      `<div class="feed-row" data-feed="${i}"><span class="${f.cls}">${f.text}</span></div>`,
    ).join(''));

    rail.innerHTML = html;
  }

  // Rail rows center AND select (PO 2026-07-02): territory -> card + map
  // highlight, army -> the same selection a map-marker click sets, officer ->
  // resolves to the entity they lead/oversee (idle officers just flash).
  // Double-click naturally repeats the same idempotent action.
  rail.addEventListener('click', (e) => {
    const el = e.target.closest('[data-parcel],[data-army],[data-choice],[data-feed],[data-officer]');
    if (!el) return;
    if (el.dataset.parcel) {
      map.gotoParcel(el.dataset.parcel);
      openCard(el.dataset.parcel); // openCard drives the map's selected-parcel outline
    } else if (el.dataset.army) {
      const a = store.armies.get(el.dataset.army);
      if (a) { map.gotoParcel(a.parcelId); if (a.state === 'GARRISON') selectArmy(a.id); }
    } else if (el.dataset.choice) {
      store.dismissedChoices.delete(el.dataset.choice); // explicit reopen un-dismisses
      openChoiceModal(el.dataset.choice);
    }
    else if (el.dataset.feed) {
      const f = feed[Number(el.dataset.feed)];
      if (f?.parcelId) { map.gotoParcel(f.parcelId); map.pulseAt(f.parcelId, '#d9a441'); }
    } else if (el.dataset.officer) { // free officer: nothing on the map to select
      el.classList.remove('row-flash');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('row-flash');
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
    const town = t.zoneType === 'TOWN' ? '🏘 Town · ' : '';
    // Fog (F1): ownership is always public; military contents render per intel grade.
    const grade = store.isMine(t.governorId) ? 'ACCURATE' : (t.intel ?? 'ACCURATE');
    // Armies present: a single garrison keeps the short line; co-located armies
    // (fanned-out markers on the map) are listed individually, friend/foe dotted.
    const here = store.armiesAt(parcelId);
    let garr;
    if (grade === 'UNKNOWN') {
      garr = `<div class="tt-sub tt-unknown">⛨ Garrison: <b>??</b> — beyond your intel</div>`;
    } else if (here.length > 1) {
      garr = here.map((a) =>
        `<div class="tt-sub"><span class="tt-dot ${store.isMine(a.governorId) ? 'friend' : 'foe'}"></span>` +
        `${esc(a.heroName ?? a.monsterName ?? shortId(a.id))} — ` +
        (a.strengthBand ? `${fmtBand(a.strengthBand)} str<b class="tt-fuzzy">?</b>` : `${a.troops}⚔`) +
        `${store.isMine(a.governorId) ? ' (yours)' : ''}</div>`).join('');
    } else if (t.garrison) {
      garr = `<div class="tt-sub">${t.garrison.monsterName ? `☠ ${esc(t.garrison.monsterName)}` : 'Garrisoned'} — ${t.garrison.troops} troops</div>`;
    } else if (t.garrisonBand) {
      garr = `<div class="tt-sub">${t.garrisonBand.monsterName ? `☠ ${esc(t.garrisonBand.monsterName)}` : 'Garrisoned'}` +
        ` — ${fmtBand(t.garrisonBand.band)} strength<b class="tt-fuzzy">?</b></div>`;
    } else {
      garr = '';
    }
    tooltip.innerHTML = `<div class="tt-name">${esc(t.name)}</div>` +
      `<div class="tt-sub">${town}${owner} · prosperity ${t.prosperity}</div>${garr}`;
    tooltip.hidden = false;
    const wrap = tooltip.parentElement.getBoundingClientRect();
    tooltip.style.left = Math.min(ev.clientX - wrap.left + 14, wrap.width - 240) + 'px';
    tooltip.style.top = Math.min(ev.clientY - wrap.top + 12, wrap.height - 80) + 'px';
  }

  // ── parcel card ────────────────────────────────────────────────────────────
  function openCard(parcelId) {
    cardParcelId = parcelId;
    map.setSelectedParcel(parcelId); // gold outline on the map mirrors the open card
    renderCard();
  }
  function closeCard() { cardParcelId = null; card.hidden = true; map.setSelectedParcel(null); }

  /** Compact officer select (D): Auto default + free officers; `sel` keeps the pick across re-renders. */
  function officerPickerHtml(id, sel) {
    const free = store.officers.filter((o) => store.officerDuty(o.id) === undefined);
    return `<div class="ov-pick"><span>Overseer</span><select id="${id}" data-ovpick>` +
      `<option value="">Auto (recommended)</option>` +
      free.map((o) => `<option value="${o.id}"${o.id === sel ? ' selected' : ''}>${esc(o.name)}</option>`).join('') +
      `</select></div>`;
  }
  let ovClaimSel = ''; // claim-picker draft (renderCard re-runs on every store change)

  const INTEL_CHIP = {
    ACCURATE: '<span class="ig ig-acc" title="Adjacent to your land or in an army’s sight">✓ accurate intel</span>',
    FUZZY: '<span class="ig ig-fuz" title="Strengths are estimates — get closer or scout for exact numbers">~ fuzzy intel</span>',
    UNKNOWN: '<span class="ig ig-unk" title="Beyond your intel — military contents hidden">?? unknown</span>',
  };

  function renderCard() {
    const t = cardParcelId && store.terrByParcel.get(cardParcelId);
    if (!t) { card.hidden = true; return; }
    const wild = t.governorKind === 'SYSTEM';
    const mine = store.isMine(t.governorId);
    const grade = mine ? 'ACCURATE' : (t.intel ?? 'ACCURATE'); // F1
    const color = store.color(t.governorId);
    const owner = wild ? 'Wild land — unclaimed' :
      `${esc(store.playerName(t.governorId))}${t.governorKind === 'NPC_KINGDOM' ? ' (NPC kingdom)' : mine ? ' (you)' : ''}`;
    const overseer = t.overseerId && mine ? store.officers.find((o) => o.id === t.overseerId) : null;
    const town = t.zoneType === 'TOWN' ? '🏘 ' : '';

    let html = `<button class="close" data-act="close">✕</button>` +
      `<h3><span class="dot" style="background:${color}"></span>${town}${esc(t.name)}</h3>` +
      `<div class="owner">${owner}${overseer ? ` · overseen by ${esc(overseer.name)}` : ''}` +
      `${mine ? '' : ` · ${INTEL_CHIP[grade]}`}</div>` +
      `<div class="stats"><span>Prosperity <b>${t.prosperity}</b></span><span>Morale <b>${t.morale}</b></span>` +
      `<span>Population <b>${t.population.toLocaleString()}</b></span></div>`;

    if (grade === 'UNKNOWN') {
      html += `<div class="garr unknown">⛨ Garrison: <b>??</b> — beyond your intel. Scouts (or closer land) reveal it.</div>`;
    } else if (t.garrison) {
      html += `<div class="garr">${t.garrison.monsterName
        ? `<span class="m">☠ ${esc(t.garrison.monsterName)}</span> — ${t.garrison.troops} wild defenders`
        : `⛨ Garrison of ${esc(store.playerName(t.garrison.governorId))} — ${t.garrison.troops} troops`}</div>`;
    } else if (t.garrisonBand) {
      html += `<div class="garr">${t.garrisonBand.monsterName
        ? `<span class="m">☠ ${esc(t.garrisonBand.monsterName)}</span>`
        : `⛨ Garrison of ${esc(store.playerName(t.garrisonBand.governorId))}`}` +
        ` — ${fmtBand(t.garrisonBand.band)} strength<b class="tt-fuzzy">?</b> <span class="est">(estimate)</span></div>`;
    }

    // My garrisoned armies here: provisions readout + Provision form (own army
    // in GARRISON at a friendly territory — docs/04 §7c.1).
    const myHere = store.armiesAt(cardParcelId).filter((a) => store.isMine(a.governorId));
    if (provDraft && !myHere.some((a) => a.id === provDraft.armyId && mine)) provDraft = null;
    for (const a of myHere) {
      html += `<div class="army-box"><div class="ab-head"><b>${esc(a.heroName ?? shortId(a.id))}</b>` +
        `<span>${a.troops}⚔ · str ${a.strength}</span></div>` +
        `<div class="ab-prov">${fmtProv(a.provisions)} · ${a.foodPerStep}🍞/step · ` +
        `${foodSteps(a)} steps of food</div>`;
      if (mine && provDraft?.armyId === a.id) html += provisionFormHtml();
      else if (mine) html += `<button data-act="prov-open" data-army="${a.id}">🛒 Provision army</button>`;
      html += `</div>`;
    }

    const actions = [];
    // Claim stays available on UNKNOWN wild land (no mandatory scouting) — the
    // server rejects monster-occupied parcels; known garrisons hide the button.
    if (wild && !t.garrison && !t.garrisonBand) {
      const canClaim = store.freeOfficerCount() > 0;
      if (canClaim) html += officerPickerHtml('ov-claim', ovClaimSel);
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
    if (mine) html += devSectionHtml(t); // F4 — Develop tracks
    else if (grade === 'ACCURATE' && t.development) {
      const lv = DEV_TRACKS.filter((d) => (t.development[d.track] ?? 0) > 0)
        .map((d) => `${d.icon}${t.development[d.track]}`).join(' ');
      if (lv) html += `<div class="hint">Development: ${lv}</div>`;
    }
    if (!wild && !mine) html += `<div class="hint">Select one of your armies, then click here to march on it.</div>`;
    card.innerHTML = html;
    card.hidden = false;
  }

  /** F4 Develop section: 4 tracks × level pips + next-level cost + effect line. */
  function devSectionHtml(t) {
    const rows = DEV_TRACKS.map((d) => {
      const lvl = t.development?.[d.track] ?? 0;
      const maxed = lvl >= DEV.maxLevel;
      const cost = maxed ? 0 : devCostCtUnits(d.track, lvl);
      const afford = !maxed && store.ctBalance >= cost;
      const pips = '●'.repeat(lvl) + '○'.repeat(DEV.maxLevel - lvl);
      return `<div class="dev-track"><div class="dt-mid">` +
        `<div class="dt-name">${d.icon} ${d.label} <span class="pips" title="level ${lvl}/${DEV.maxLevel}">${pips}</span></div>` +
        `<div class="dt-eff">${d.effect}</div></div>` +
        `<button data-dev="${d.track}" ${afford ? '' : 'disabled'} title="${maxed ? 'Max level' : `Level ${lvl + 1}`}">` +
        `${maxed ? 'MAX' : `▲ ${fmtCT(cost)}`}</button></div>`;
    }).join('');
    return `<div class="dev-sec"><h4>🏗 Develop</h4>${rows}</div>`;
  }

  /** Stepper + quick-pack provision form with live CT cost (server authoritative). */
  function provisionFormHtml() {
    const d = provDraft;
    const cost = provisionCostCtUnits(d);
    const short = cost > store.ctBalance;
    const stepper = (k, icon, step) =>
      `<div class="pf-row"><span>${icon} ${k}</span><button data-pf="${k}:-${step}">−</button>` +
      `<b>${d[k]}</b><button data-pf="${k}:${step}">+</button></div>`;
    return `<div class="prov-form">` +
      stepper('food', '🍞', 100) + stepper('gold', '🪙', 10) + stepper('wood', '🪵', 10) +
      `<div class="pf-quick"><button data-pf="food:500">+500🍞</button>` +
      `<button data-pf="gold:50">+50🪙</button><button data-pf="wood:50">+50🪵</button></div>` +
      `<div class="pf-cost">Cost <b>${fmtCT(cost)}</b>${short ? ' <span class="why">— not enough CT</span>' : ''}</div>` +
      `<div class="pf-btns"><button data-act="prov-cancel">Cancel</button>` +
      `<button class="primary" data-act="prov-buy" ${cost > 0 && !short ? '' : 'disabled'}>Buy</button></div></div>`;
  }

  card.addEventListener('change', (e) => {
    if (e.target.id === 'ov-claim') ovClaimSel = e.target.value; // survive re-renders
  });

  card.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const t = store.terrByParcel.get(cardParcelId);
    if (btn.dataset.act === 'close') closeCard();
    else if (btn.dataset.act === 'claim' && t) { orders.claim(t.id, ovClaimSel || undefined); ovClaimSel = ''; }
    else if (btn.dataset.act === 'raise' && t) orders.raise(t.id, btn.dataset.preset);
    else if (btn.dataset.dev && t) { btn.disabled = true; orders.develop(t.id, btn.dataset.dev); } // no double-buy before the re-render
    else if (btn.dataset.act === 'prov-open') { provDraft = { armyId: btn.dataset.army, food: 0, gold: 0, wood: 0 }; renderCard(); }
    else if (btn.dataset.act === 'prov-cancel') { provDraft = null; renderCard(); }
    else if (btn.dataset.pf) {
      const [k, dv] = btn.dataset.pf.split(':');
      provDraft[k] = Math.max(0, provDraft[k] + Number(dv));
      renderCard();
    } else if (btn.dataset.act === 'prov-buy' && provDraft) {
      const { armyId, food, gold, wood } = provDraft;
      if (await orders.provision(armyId, { food, gold, wood })) { provDraft = null; renderCard(); }
    }
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
      // Intel grade of the target (F1) — the march preview never hides the truth
      // about what you DON'T know. No mandatory scouting: March stays enabled.
      const grade = store.isMine(t.governorId) ? 'ACCURATE' : (t.intel ?? 'ACCURATE');
      html += `<div class="row"><span>Distance</span><b>${path.length} parcel${path.length > 1 ? 's' : ''}</b></div>` +
        `<div class="row"><span>March time</span><b>~${fmtDur(etaMs)}</b></div>` +
        `<div class="row"><span>Intel</span><b>${INTEL_CHIP[grade]}</b></div>`;
      const hostiles = store.hostilesAt(parcelId);
      const expectBattle = hostiles.length > 0 || grade === 'UNKNOWN';
      // Logistics preview (docs/04 §7c — approximate, server authoritative):
      // trip rations + expected battle need, and the CC tier gold+wood affords.
      const tripFood = a.foodPerStep * path.length;
      const needEst = tripFood + (expectBattle ? battleFoodNeed(a.troops) : 0);
      const cc = ccTierFor(a.troops, a.provisions.gold, a.provisions.wood);
      html += `<div class="row"><span>Food carried</span><b>🍞${a.provisions.food}</b></div>` +
        `<div class="row"><span>Est. need (trip${expectBattle ? ' + battle' : ''})</span><b>~🍞${needEst}</b></div>`;
      if (expectBattle) {
        html += `<div class="row"><span>Command center</span><b>${cc.name ?? 'None ⚠'}</b></div>`;
      }
      if (a.provisions.food < Math.max(2 * tripFood, needEst)) {
        html += `<div class="warn">⚠ Low food — provision before marching (estimate).</div>`;
      }
      if (grade === 'UNKNOWN') {
        html += `<div class="vs"><b>??</b> Strength unknown — scout first?` +
          `<div class="warn">You can't see what defends this land. The attack is allowed — but you march blind.</div></div>`;
      } else if (hostiles.length) {
        // FUZZY: band midpoints power the preview, clearly labeled "estimated".
        const fuzzy = grade === 'FUZZY' || hostiles.some((x) => x.strengthBand);
        const theirs = hostiles.reduce((n, x) => n + strengthEst(x), 0);
        const monster = hostiles.find((x) => x.monsterName);
        const pct = Math.round((a.strength / Math.max(1, a.strength + theirs)) * 100);
        html += `<div class="vs">${monster ? `☠ ${esc(monster.monsterName)}` : '⛨ Defenders'} — ` +
          `${fuzzy ? `~${theirs} strength <span class="est">(estimated)</span>` : `${theirs} strength`}` +
          `<div class="row"><span>You ${a.strength}</span><span>them ${fuzzy ? '~' : ''}${theirs}</span></div>` +
          `<div class="bar"><span style="width:${pct}%;background:#4f8fe8"></span><span style="flex:1;background:#a83a30"></span></div>` +
          (fuzzy ? `<div class="warn">~ Fuzzy intel — real strength may differ. Scouts sharpen the picture.</div>` : '') +
          (Math.abs(a.strength - theirs) / Math.max(a.strength, theirs, 1) < PROV.tieThreshold
            ? `<div class="warn">⚔ Evenly matched — likely stalemate (tied attackers withdraw).</div>`
            : '') +
          `</div>`;
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

  // ── pillage/occupy modal (battle victories + F2 town walk-ins) ─────────────
  function openChoiceModal(choiceId) {
    const c = store.pendingChoices.get(choiceId);
    if (!c) { modalChoiceId = null; modal.hidden = true; return; }
    modalChoiceId = choiceId;
    const t = store.territories.get(c.territoryId);
    const lootEst = t ? Math.round((t.population * 500) / 10_000) : 0;
    const free = store.freeOfficerCount();
    const overseen = store.myTerritories().filter((x) => x.overseerId).length;
    const canOccupy = free > 0 && overseen < 55;
    const why = free === 0 ? 'No free officer to govern it.' : overseen >= 55 ? 'Officer cap (55) reached.' : '';
    const left = fmtDur(store.ticksToMs(c.expiresTick - store.tickFloat()));
    const name = esc(t?.name ?? '?');
    // Town walk-ins are BLOODLESS — no battle framing (F2).
    const head = c.walkIn
      ? `<h2>🏘 The town of ${name} opens its gates</h2>` +
        `<p class="sub">No garrison bars the way — your army may do as it pleases.</p>`
      : `<h2>⚔ Victory at ${name}</h2>` +
        `<p class="sub">Your army has crushed the defenders. What is your command?</p>`;
    modal.innerHTML = `<div class="box">${head}` +
      `<div class="opts">` +
      `<button class="opt" data-action="PILLAGE"><h4>🔥 Pillage</h4>` +
      `<p>Loot ~${lootEst} CT + treasury share. The ${c.walkIn ? 'town' : 'land'} burns and degrades.</p></button>` +
      `<button class="opt" data-action="OCCUPY" ${canOccupy ? '' : 'disabled'}><h4>🏰 Occupy</h4>` +
      `<p>${canOccupy ? `The ${c.walkIn ? 'town' : 'territory'} joins your banner. An officer becomes its overseer.` : `<span class="why">${why}</span>`}</p></button>` +
      `</div>` +
      (canOccupy ? officerPickerHtml('ov-choice', '') : '') +
      (c.walkIn ? `<div class="leave"><button data-dismiss>🚶 Leave it for now</button></div>` : '') +
      `<div class="timer">Undecided in ${left} → defaults to pillage${c.walkIn ? ' · march the army away to cancel' : ''}</div></div>`;
    modal.hidden = false;
  }

  modal.addEventListener('click', async (e) => {
    if (e.target.closest('[data-dismiss]') && modalChoiceId) {
      // Walk away (F2): the decision stays in the rail; the server cancels it
      // silently if the army leaves, or defaults to pillage on timeout.
      store.dismissedChoices.add(modalChoiceId);
      modalChoiceId = null;
      modal.hidden = true;
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn || !modalChoiceId || btn.disabled) return;
    const overseerId = btn.dataset.action === 'OCCUPY' ? (document.getElementById('ov-choice')?.value || undefined) : undefined;
    const id = modalChoiceId;
    for (const b of modal.querySelectorAll('button')) b.disabled = true; // no double-send
    const ok = await orders.choice(id, btn.dataset.action, overseerId);
    if (ok || !store.pendingChoices.has(id)) {
      modalChoiceId = null;
      modal.hidden = true;
    } else {
      openChoiceModal(id); // failed (e.g. officer just got busy) — re-render fresh
    }
  });

  /** Refresh or dismiss the open modal after deltas (choice may have expired). */
  function syncModal() {
    if (modalChoiceId && !store.pendingChoices.has(modalChoiceId)) {
      modalChoiceId = null;
      modal.hidden = true;
    }
    if (modalChoiceId === null && !modal.hidden) modal.hidden = true;
    if (modalChoiceId === null) {
      const next = store.myPendingChoices().find((c) => !store.dismissedChoices.has(c.choiceId));
      if (next) openChoiceModal(next.choiceId);
    }
  }

  // ── wild-raid alert banner (F3 — raids on MY land, goal-chip style, urgent) ─
  function raidAlert(armyId, parcelId, who) {
    activeRaids.set(armyId, { parcelId, who });
    syncRaidBanner();
  }

  /** Clear raids whose army resolved (arrived/killed/out of sight); update the banner. */
  function syncRaidBanner() {
    for (const [armyId, r] of activeRaids) {
      const a = store.armies.get(armyId);
      const t = store.terrByParcel.get(r.parcelId);
      // resolved: raider gone/no longer marching, or the land isn't mine anymore
      if (!a || a.state !== 'MARCHING' || !t || !store.isMine(t.governorId)) activeRaids.delete(armyId);
    }
    const first = activeRaids.values().next().value;
    if (!first) { raidBanner.hidden = true; return; }
    const name = esc(store.terrByParcel.get(first.parcelId)?.name ?? first.parcelId);
    raidBanner.innerHTML = `<span class="rb-ico">🐺</span>${first.who} raiders marching on <b>${name}</b>` +
      `${activeRaids.size > 1 ? ` (+${activeRaids.size - 1} more)` : ''} — rally the defense!`;
    raidBanner.hidden = false;
    raidBanner.onclick = () => map.gotoParcel(first.parcelId);
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

  store.onChange(() => { scheduleRail(); renderCard(); syncModal(); syncRaidBanner(); });

  return {
    scheduleRail, showTooltip, openCard, closeCard, selectArmy, openMarchPopover, closePopover,
    openChoiceModal, toast, feedPush, raidAlert,
    setConn(status) {
      const pip = $('conn-pip');
      pip.className = `pip ${status}`;
      pip.title = { ok: 'live', connecting: 'connecting…', down: 'reconnecting…' }[status] ?? status;
    },
    setPlayerLabel(name) { $('rail-player').textContent = name; },
  };
}
