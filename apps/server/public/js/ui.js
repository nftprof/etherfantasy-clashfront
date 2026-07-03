/**
 * DOM UI: home rail (assets + goto), tooltip, parcel card, march popover,
 * pillage/occupy modal, toasts, battle feed. All renders read the store;
 * re-render is scheduled (once per frame) on store change + a 1 Hz timer for
 * ETA countdowns.
 */
import {
  avatarHtml, battleFoodNeed, bfsPath, ccTierFor, DEV, DEV_TRACKS, devCostCtUnits, esc, fmtBand,
  fmtCT, fmtDur, foodSteps, fmtProv, PRESETS, presetCostCt, PROV, provisionCostCtUnits, shortId,
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
  let enrichDraft = null; // {territoryId, amount(CT)} — open enrich form on the parcel card (E3)
  let razeDraft = null;   // {territoryId, track} — raze confirm expanded on the parcel card (E4)
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
      const must = a.mustering; // E2: training queue still filling this army
      const meta = must
        ? `${a.troops}/${store.musterTotal(a)}⚔`
        : a.state === 'MARCHING'
          ? `→ ${fmtDur(store.ticksToMs((a.etaTick ?? tf) - tf))}`
          : `${a.troops}⚔`;
      const av = a.heroName ? avatarHtml({ name: a.heroName }, 16) : '';
      const label = a.state === 'MARCHING'
        ? `${av}${esc(a.heroName ?? shortId(a.id))} marching`
        : `${av}${esc(a.heroName ?? shortId(a.id))} @ ${esc(here?.name ?? a.parcelId)}`;
      if (must) {
        return row(`data-army="${a.id}"`, store.color(a.governorId), label, meta) +
          `<div class="rail-sub muster" data-army="${a.id}">` +
          `⏳ Mustering ${a.troops}/${store.musterTotal(a)} · ready ~${fmtDur(store.ticksToMs(must.readyTick - tf))}</div>`;
      }
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
      return row(target, duty ? null : '#58b06b', `${avatarHtml(o, 18)}${esc(o.name)}`, meta);
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

  setInterval(() => { // ETA countdowns + choice/muster timers
    if (store.myArmies().some((a) => a.state === 'MARCHING' || a.mustering) || store.myPendingChoices().length) scheduleRail();
    // live "ready ~m:ss" on the open card while a muster runs there
    if (cardParcelId && store.armiesAt(cardParcelId).some((a) => a.mustering)) renderCard();
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
        `${a.mustering ? ' ⏳ mustering' : ''}${store.isMine(a.governorId) ? ' (yours)' : ''}</div>`).join('');
    } else if (t.garrison) {
      const mustering = store.armies.get(t.garrison.armyId)?.mustering; // E2 — visible own/ACCURATE
      garr = `<div class="tt-sub">${t.garrison.monsterName ? `☠ ${esc(t.garrison.monsterName)}` : 'Garrisoned'} — ${t.garrison.troops} troops${mustering ? ' · ⏳ mustering' : ''}</div>`;
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
    // Don't steal focus (or wipe a half-typed amount) while the player types
    // in the enrich input — the next store change after blur repaints.
    if (document.activeElement?.id === 'enrich-amt' && card.contains(document.activeElement)) return;
    const wild = t.governorKind === 'SYSTEM';
    const mine = store.isMine(t.governorId);
    if (enrichDraft && (enrichDraft.territoryId !== t.id || !mine)) enrichDraft = null;
    if (razeDraft && (razeDraft.territoryId !== t.id || !mine)) razeDraft = null;
    const grade = mine ? 'ACCURATE' : (t.intel ?? 'ACCURATE'); // F1
    const color = store.color(t.governorId);
    const owner = wild ? 'Wild land — unclaimed' :
      `${esc(store.playerName(t.governorId))}${t.governorKind === 'NPC_KINGDOM' ? ' (NPC kingdom)' : mine ? ' (you)' : ''}`;
    const overseer = t.overseerId && mine ? store.officers.find((o) => o.id === t.overseerId) : null;
    const town = t.zoneType === 'TOWN' ? '🏘 ' : '';

    let html = `<button class="close" data-act="close">✕</button>` +
      `<h3><span class="dot" style="background:${color}"></span>${town}${esc(t.name)}</h3>` +
      `<div class="owner">${owner}${overseer ? ` · overseen by ${avatarHtml(overseer, 15)} ${esc(overseer.name)}` : ''}` +
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

    // LIVE battle raging here (docs/04 §7b): watch anyone's, command your own.
    const lb = [...store.liveBattles.values()].find((x) => x.parcelId === cardParcelId);
    if (lb) {
      html += `<div class="live-battle">🔥 <b>Battle raging</b> — ` +
        (lb.mine ? 'your assault is underway.'
          : `${esc(store.playerName(lb.attackerGovernorIds?.[0]))} assaults ${lb.monsterName ? `☠ ${esc(lb.monsterName)}` : 'this land'}.`) +
        `<button class="primary" data-act="watch-battle" data-battle="${lb.id}">` +
        `${lb.mine ? '🎮 Command the battle' : '👁 Watch live'}</button></div>`;
    }

    // My garrisoned armies here: provisions readout + Provision form (own army
    // in GARRISON at a friendly territory — docs/04 §7c.1). Mustering armies
    // (E2) show training progress + the ready countdown instead of strength.
    const myHere = store.armiesAt(cardParcelId).filter((a) => store.isMine(a.governorId));
    if (provDraft && !myHere.some((a) => a.id === provDraft.armyId && mine)) provDraft = null;
    for (const a of myHere) {
      const must = a.mustering;
      const total = store.musterTotal(a);
      html += `<div class="army-box"><div class="ab-head"><b>${a.heroName ? avatarHtml({ name: a.heroName }, 17) : ''}${esc(a.heroName ?? shortId(a.id))}</b>` +
        `<span>${must ? `${a.troops}/${total}⚔` : `${a.troops}⚔ · str ${a.strength}`}</span></div>`;
      if (must) {
        const pct = total > 0 ? Math.round(((a.troops ?? 0) / total) * 100) : 0;
        html += `<div class="muster-prog"><div class="mp-bar"><span style="width:${pct}%"></span></div>` +
          `<div class="mp-txt">⏳ Mustering: ${a.troops}/${total} · ready ~${fmtDur(store.ticksToMs(must.readyTick - store.tickFloat()))}</div>` +
          `<div class="mp-warn">Attacked mid-muster it fights at ${Math.round(store.musterPenalty() * 100)}% — it cannot march yet.</div></div>`;
      }
      html += `<div class="ab-prov">${fmtProv(a.provisions)} · ${a.foodPerStep}🍞/step · ` +
        `${foodSteps(a)} steps of food</div>`;
      if (mine && provDraft?.armyId === a.id) html += provisionFormHtml();
      else if (mine) html += `<button data-act="prov-open" data-army="${a.id}">🛒 Provision army</button>`;
      html += `</div>`;
    }

    // E3: an enriched pool is attached to the LAND — visible to anyone with
    // ACCURATE intel; the yield warning is the invasion incentive by design.
    if (grade === 'ACCURATE' && (t.enrichmentPool ?? 0) > 0) {
      const sh = store.shares();
      const perDay = Math.floor(t.enrichmentPool * sh.enrichYieldPctPerDay);
      html += `<div class="enrich-pool">✨ Enriched soil — pool <b>${fmtCT(t.enrichmentPool)}</b>` +
        `<div class="ep-sub">pays ~${fmtCT(perDay)}/day to <b>whoever holds this land</b>${mine ? '' : ' — take it, inherit the pool'}</div></div>`;
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
      // E2: ⚙ one training queue per territory — a running muster blocks the next levy.
      const busy = store.queueBusyAt(cardParcelId);
      for (const p of Object.keys(PRESETS)) {
        const cost = presetCostCt(p);
        const afford = store.ctBalance / 10_000 >= cost;
        actions.push(`<button data-act="raise" data-preset="${p}" ${afford && !busy ? '' : 'disabled'}` +
          `${busy ? ' title="Training queue busy — one muster per territory; wait for it to finish"' : ''}>` +
          `<span>⚔ Raise ${PRESETS[p].label}</span><span class="cost">${busy ? 'queue busy ⏳' : `${cost} CT`}</span></button>`);
      }
    }
    if (actions.length) html += `<div class="actions">${actions.join('')}</div>`;
    if (mine) html += devSectionHtml(t); // F4 — Develop tracks (+ E4 raze)
    if (mine) html += enrichSectionHtml(t); // E3 — Enrich
    else if (grade === 'ACCURATE' && t.development) {
      const lv = DEV_TRACKS.filter((d) => (t.development[d.track] ?? 0) > 0)
        .map((d) => `${d.icon}${t.development[d.track]}`).join(' ');
      if (lv) html += `<div class="hint">Development: ${lv}</div>`;
    }
    if (!wild && !mine) html += `<div class="hint">Select one of your armies, then click here to march on it.</div>`;
    card.innerHTML = html;
    card.hidden = false;
  }

  /**
   * F4 Develop section: 4 tracks × level pips + next-level cost + effect line.
   * E4: developed tracks grow a small 🔻 Raze affordance — exact salvage from
   * the server's razeSalvage preview, destructive confirm expanded inline.
   */
  function devSectionHtml(t) {
    const rows = DEV_TRACKS.map((d) => {
      const lvl = t.development?.[d.track] ?? 0;
      const maxed = lvl >= DEV.maxLevel;
      const cost = maxed ? 0 : devCostCtUnits(d.track, lvl);
      const afford = !maxed && store.ctBalance >= cost;
      const pips = '●'.repeat(lvl) + '○'.repeat(DEV.maxLevel - lvl);
      const salvage = t.razeSalvage?.[d.track] ?? 0;
      let row = `<div class="dev-track"><div class="dt-mid">` +
        `<div class="dt-name">${d.icon} ${d.label} <span class="pips" title="level ${lvl}/${DEV.maxLevel}">${pips}</span></div>` +
        `<div class="dt-eff">${d.effect}</div></div>` +
        (lvl > 0
          ? `<button class="raze-btn" data-raze="${d.track}" title="Raze one ${d.label} level — salvage ${fmtCT(salvage)}, the rest burns">🔥</button>`
          : '') +
        `<button data-dev="${d.track}" ${afford ? '' : 'disabled'} title="${maxed ? 'Max level' : `Level ${lvl + 1}`}">` +
        `${maxed ? 'MAX' : `▲ ${fmtCT(cost)}`}</button></div>`;
      if (razeDraft?.track === d.track && lvl > 0) {
        row += `<div class="raze-confirm">Raze <b>${d.label} L${lvl}</b> → salvage <b>${fmtCT(salvage)}</b>` +
          ` — the rest of the invested CT <b>burns forever</b>.` +
          `<div class="pf-btns"><button data-act="raze-cancel">Keep it</button>` +
          `<button class="danger" data-act="raze-confirm" data-track="${d.track}">🔥 Raze it</button></div></div>`;
      }
      return row;
    }).join('');
    return `<div class="dev-sec"><h4>🏗 Develop</h4>${rows}</div>`;
  }

  /**
   * E3 Enrich section (own parcels): pour wallet CT into the land's yield pool.
   * The leakage preview is HONEST — shares come from /api/economy (⚙ balance),
   * only ~landYield% of the spend reaches pools (self + ring-1), the rest
   * flows to nearby treasuries, lords and the burn. Server stays authoritative.
   */
  function enrichSectionHtml(t) {
    const sh = store.shares();
    if (enrichDraft?.territoryId !== t.id) {
      return `<div class="enrich-sec"><button data-act="enrich-open">✨ Enrich this land</button></div>`;
    }
    const amt = Math.max(0, Math.floor(enrichDraft.amount));
    const pct = (x) => Math.round(x * 100);
    const toSelf = Math.floor(amt * sh.landYield * sh.landYieldSelfPct);
    const toRing = Math.floor(amt * sh.landYield) - toSelf;
    const short = amt * 10_000 > store.ctBalance;
    return `<div class="enrich-sec open"><h4>✨ Enrich</h4>` +
      `<div class="en-row"><span>Amount</span><input id="enrich-amt" type="number" inputmode="numeric" min="1" step="1" value="${amt}"><span>CT</span>` +
      `<button data-en="100">+100</button><button data-en="500">+500</button></div>` +
      `<div class="en-note">~${pct(sh.landYield)}% reaches the land's pools: <b>${toSelf} CT</b> here + ${toRing} CT to neighbors — ` +
      `the rest flows to the region's treasuries (${pct(sh.loot)}%), the lords (${pct(sh.lordsLandlord + sh.lordsSeat)}%) and the burn (${pct(sh.burn)}%).</div>` +
      `<div class="en-note gold">The pool pays ${pct(sh.enrichYieldPctPerDay)}%/day — to <b>whoever holds this land</b>. Lose the parcel, lose the pool.</div>` +
      (short ? `<div class="en-note why">Not enough CT (${fmtCT(store.ctBalance)} in the treasury).</div>` : '') +
      `<div class="pf-btns"><button data-act="enrich-cancel">Cancel</button>` +
      `<button class="primary" data-act="enrich-buy" ${amt > 0 && !short ? '' : 'disabled'}>Enrich ${amt.toLocaleString('en-US')} CT</button></div></div>`;
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

  // Enrich amount typing: keep the draft current without re-rendering (the
  // focus guard in renderCard() protects the input; blur repaints the preview).
  card.addEventListener('input', (e) => {
    if (e.target.id === 'enrich-amt' && enrichDraft) {
      enrichDraft.amount = Math.max(0, Math.floor(Number(e.target.value) || 0));
    }
  });
  card.addEventListener('focusout', (e) => {
    if (e.target.id === 'enrich-amt') renderCard(); // repaint the leakage preview
  });

  card.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const t = store.terrByParcel.get(cardParcelId);
    if (btn.dataset.act === 'close') closeCard();
    else if (btn.dataset.act === 'watch-battle') orders.watchBattle(btn.dataset.battle);
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
    // E3 — enrich form
    else if (btn.dataset.act === 'enrich-open' && t) { enrichDraft = { territoryId: t.id, amount: 100 }; renderCard(); }
    else if (btn.dataset.act === 'enrich-cancel') { enrichDraft = null; renderCard(); }
    else if (btn.dataset.en && enrichDraft) {
      enrichDraft.amount = Math.max(0, Math.floor(enrichDraft.amount)) + Number(btn.dataset.en);
      renderCard();
    } else if (btn.dataset.act === 'enrich-buy' && enrichDraft && t) {
      const amt = Math.max(0, Math.floor(Number(document.getElementById('enrich-amt')?.value) || enrichDraft.amount));
      btn.disabled = true; // no double-spend before the response lands
      if (await orders.enrich(t.id, amt)) { enrichDraft = null; }
      renderCard();
    }
    // E4 — raze confirm (destructive: always a two-step)
    else if (btn.dataset.raze && t) {
      razeDraft = razeDraft?.track === btn.dataset.raze ? null : { territoryId: t.id, track: btn.dataset.raze };
      renderCard();
    } else if (btn.dataset.act === 'raze-cancel') { razeDraft = null; renderCard(); }
    else if (btn.dataset.act === 'raze-confirm' && t) {
      const track = btn.dataset.track;
      razeDraft = null;
      btn.disabled = true;
      orders.raze(t.id, track);
    }
  });

  // ── army selection + march popover ─────────────────────────────────────────
  function selectArmy(armyId) {
    map.setSelectedArmy(armyId);
    const a = store.armies.get(armyId);
    banner.hidden = !a;
    if (a) {
      banner.innerHTML = `Ordering <b>${esc(a.heroName ?? shortId(a.id))}</b> (${a.troops}⚔, str ${a.strength})` +
        `${a.mustering ? ' — <b>⏳ still mustering</b>' : ''}` +
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
      // E2: a mustering army holds its ground — March is blocked with the reason
      // (the server would refuse with MUSTERING anyway).
      const must = a.mustering;
      if (must) {
        html += `<div class="warn">⏳ Still mustering (${a.troops}/${store.musterTotal(a)}) — this army can march ` +
          `in ~${fmtDur(store.ticksToMs(must.readyTick - store.tickFloat()))}.</div>`;
      }
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
          // E2: mustering intel is ACCURATE-only — when you can see a half-empty
          // camp, say so: rushing a muster is valid strategy.
          (hostiles.some((x) => x.mustering)
            ? `<div class="warn muster">⏳ Defenders still mustering — they fight at ${Math.round(store.musterPenalty() * 100)}% strength. Strike now.</div>`
            : '') +
          `</div>`;
      }
      html += `<div class="btns"><button data-close>Cancel</button>` +
        `<button class="primary" data-march="${t.id}" ${a.mustering ? 'disabled title="Still mustering — armies march when training completes"' : ''}>March</button></div>`;
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
  function toast(title, sub, cls = 'info', parcelId = null, ms = 5000, onClick = null) {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.innerHTML = `<b>${title}</b>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    if (onClick) el.addEventListener('click', onClick);
    else if (parcelId) el.addEventListener('click', () => map.gotoParcel(parcelId));
    toasts.prepend(el);
    while (toasts.children.length > 5) toasts.lastChild.remove();
    setTimeout(() => { el.classList.add('fading'); setTimeout(() => el.remove(), 700); }, ms);
  }

  function feedPush(text, cls, parcelId) {
    feed.unshift({ text, cls, parcelId });
    if (feed.length > MAX_FEED) feed.pop();
    scheduleRail();
  }

  /**
   * Brief ✓ flash on the goal chip (E2 "army ready" etc.) — only when the FTUE
   * doesn't own the chip (tutorial inactive ⇒ the chip is hidden).
   */
  let goalFlashToken = 0;
  function flashGoal(text) {
    const chip = $('goal-chip');
    if (!chip.hidden) return; // chip visible ⇒ the FTUE owns it — its chip, its story
    const token = ++goalFlashToken;
    chip.hidden = false;
    chip.classList.add('gc-done');
    chip.innerHTML = `<span class="gc-ico">✓</span>${text}`;
    setTimeout(() => {
      if (token !== goalFlashToken) return;
      chip.classList.remove('gc-done');
      chip.hidden = true;
    }, 1600);
  }

  store.onChange(() => { scheduleRail(); renderCard(); syncModal(); syncRaidBanner(); });

  return {
    scheduleRail, showTooltip, openCard, closeCard, selectArmy, openMarchPopover, closePopover,
    openChoiceModal, toast, feedPush, raidAlert, flashGoal,
    setConn(status) {
      const pip = $('conn-pip');
      pip.className = `pip ${status}`;
      pip.title = { ok: 'live', connecting: 'connecting…', down: 'reconnecting…' }[status] ?? status;
    },
    setPlayerLabel(name) {
      // The player's identity anchor: their Hero's portrait beside the banner name.
      const hero = store.officers[0];
      const plate = $('rail-player');
      plate.innerHTML = `${hero ? avatarHtml(hero, 30) : ''}<span>${esc(name)}</span>`;
      plate.hidden = false;
    },
  };
}
