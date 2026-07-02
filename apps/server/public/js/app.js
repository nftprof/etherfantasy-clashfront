/**
 * Clash Front MVP client bootstrap: join flow (token in localStorage), store +
 * map + UI wiring, WS event routing (toasts, fire/smolder/pulse effects,
 * interception detection), and the order API glue.
 */
import { api, connectWS } from './net.js';
import { createStore } from './store.js';
import { createMap } from './map.js';
import { createUI } from './ui.js';
import { createFTUE } from './ftue.js';
import { createEcon } from './econ.js';
import { esc, fmtCT, fmtDur, fmtProv } from './util.js';

const TOKEN_KEY = 'cf_token';
const store = createStore();
let token = localStorage.getItem(TOKEN_KEY);
let ws = null;
const marchDest = new Map(); // armyId → ordered destination parcelId (interception detection)

// ── orders (POST responses are authoritative — applied to the store directly) ──
/** BAD_OFFICER/OFFICER_BUSY come from an explicit overseer pick — say so plainly. */
function officerErrText(e) {
  if (e.code === 'BAD_OFFICER' || e.code === 'OFFICER_BUSY') {
    return `${esc(e.message)} — pick another officer or use Auto.`;
  }
  return esc(e.message);
}

const orders = {
  async claim(territoryId, overseerId) {
    try {
      const body = { territoryId, ...(overseerId ? { overseerId } : {}) };
      const { territory } = await api('/api/claim', { token, body });
      store.putTerritory(territory);
      store.emit();
      ui.toast('Land claimed', `${esc(territory.name)} flies your banner.`, 'good', territory.parcelId);
    } catch (e) { ui.toast('Claim failed', officerErrText(e), 'bad'); }
  },
  /** POST /api/develop — raise one development track on an owned parcel (F4). */
  async develop(territoryId, track) {
    try {
      const res = await api('/api/develop', { token, body: { territoryId, track } });
      store.putTerritory(res.territory);
      store.ctBalance = res.ctUnits;
      store.emit();
      ui.toast('🏗 Developed', `${esc(res.territory.name)} — ${res.track.toLowerCase()} level ${res.level} (${fmtCT(res.costCtUnits)}).`, 'good', res.territory.parcelId);
    } catch (e) { ui.toast('Develop failed', esc(e.message), 'bad'); }
  },
  async raise(territoryId, preset) {
    try {
      const { army, ctUnits } = await api('/api/raise', { token, body: { territoryId, preset } });
      store.putArmy(army);
      store.ctBalance = ctUnits;
      store.emit();
      // E2 — armies muster over time: the shell exists now, soldiers trickle in.
      if (army.mustering) {
        const total = store.musterTotal(army);
        ui.toast('⏳ Mustering', `${esc(army.heroName ?? 'A commander')} drills ${total} recruits — ready in ~${fmtDur(store.ticksToMs(army.mustering.readyTick - store.tickFloat()))}.`, 'good', army.parcelId);
        ftue.tip('training'); // one-shot: plan ahead, mid-muster attacks hurt
      } else {
        ui.toast('Army raised', `${esc(army.heroName ?? 'A commander')} leads ${army.troops} troops.`, 'good', army.parcelId);
      }
    } catch (e) {
      ui.toast('Cannot raise army', e.code === 'QUEUE_BUSY'
        ? 'The training queue is busy — one muster per territory. Wait for the current army to finish.'
        : esc(e.message), 'bad');
    }
  },
  /** POST /api/enrich — pour wallet CT into the parcel's yield pool (E3). Returns true on success. */
  async enrich(territoryId, amountCt) {
    try {
      const res = await api('/api/enrich', { token, body: { territoryId, amountCt } });
      store.putTerritory(res.territory);
      store.ctBalance = res.ctUnits;
      store.emit();
      ui.toast('✨ Land enriched', `${fmtCT(res.toPoolCtUnits)} of your ${fmtCT(res.amountCtUnits)} reached the pools — the rest fed the region, lords and the burn.`, 'gold', res.territory.parcelId);
      return true;
    } catch (e) { ui.toast('Enrich failed', esc(e.message), 'bad'); return false; }
  },
  /** POST /api/raze — strip one development level for salvage (E4). Returns true on success. */
  async raze(territoryId, track) {
    try {
      const res = await api('/api/raze', { token, body: { territoryId, track } });
      store.putTerritory(res.territory);
      store.ctBalance = res.ctUnits;
      store.emit();
      map.smolderAt(res.territory.parcelId, 0.5); // raze scorch — lighter than a pillage
      ui.toast('🔥 Razed', `${res.track.toLowerCase()} → level ${res.level} — salvaged ${fmtCT(res.salvageCtUnits)}, ${fmtCT(res.burnedCtUnits)} burned forever.`, 'gold', res.territory.parcelId);
      return true;
    } catch (e) {
      ui.toast('Raze failed', e.code === 'NOTHING_TO_RAZE' ? 'Nothing left to raze on that track.' : esc(e.message), 'bad');
      return false;
    }
  },
  async march(armyId, toTerritoryId) {
    try {
      const { army } = await api('/api/march', { token, body: { armyId, toTerritoryId } });
      store.putArmy(army);
      store.emit();
      if (army.path?.length) marchDest.set(army.id, army.path[army.path.length - 1]);
      ui.toast('March ordered', `${army.troops} troops on the move.`, 'info', army.parcelId);
    } catch (e) { ui.toast('March refused', esc(e.message), 'bad'); }
  },
  /** POST /api/provision — buy food/gold/wood with CT (docs/04 §7c.1). Returns true on success. */
  async provision(armyId, order) {
    try {
      const { army, ctUnits, costCtUnits } = await api('/api/provision', { token, body: { armyId, ...order } });
      store.putArmy(army);
      store.ctBalance = ctUnits;
      store.emit();
      ui.toast('Provisions loaded', `${fmtProv(order)} for ${fmtCT(costCtUnits)}.`, 'good', army.parcelId);
      return true;
    } catch (e) { ui.toast('Provisioning failed', esc(e.message), 'bad'); return false; }
  },
  /**
   * Resolve a pending PILLAGE/OCCUPY decision. `choiceId` = battle id for
   * post-victory choices, walk-in choiceId for bloodless town entries (F2).
   * Returns true on success (the modal closes only then).
   */
  async choice(choiceId, action, overseerId) {
    const pc = store.pendingChoices.get(choiceId);
    try {
      const body = { battleId: choiceId, action, ...(overseerId ? { overseerId } : {}) };
      const res = await api('/api/choice', { token, body });
      store.selfResolvedBattles.add(choiceId);
      store.pendingChoices.delete(choiceId);
      if (res.battle) store.battles.set(res.battle.id, res.battle);
      if (res.territory) store.putTerritory(res.territory);
      store.ctBalance = res.ctUnits;
      store.emit();
      const parcelId = res.battle?.parcelId ?? res.territory?.parcelId;
      const name = esc(res.territory?.name ?? store.territories.get(pc?.territoryId)?.name ?? 'the land');
      if (res.action === 'CANCELLED') {
        ui.toast('Nothing to decide', 'Your army had already moved on.', 'info');
      } else if (action === 'PILLAGE') {
        const loot = res.lootCt ?? res.battle?.lootCt ?? 0;
        ui.toast('🔥 Pillaged!', `Looted ${fmtCT(loot)}. ${pc?.walkIn ? `The town of ${name} burns.` : 'The land smolders.'}`, 'gold', parcelId);
      } else if (pc?.walkIn) {
        ui.toast(`🏘 ${name} is yours`, 'The town opened its gates — bloodless conquest.', 'good', parcelId);
      }
      return true;
    } catch (e) { ui.toast('Choice failed', officerErrText(e), 'bad'); return false; }
  },
};

// ── map + ui ──────────────────────────────────────────────────────────────────
const map = createMap(document.getElementById('map'), store, {
  onHover: (parcelId, ev) => ui.showTooltip(parcelId, ev),
  onClickParcel: (parcelId, ev) => {
    ui.closePopover();
    if (map.selectedArmyId) ui.openMarchPopover(parcelId, ev);
    else ui.openCard(parcelId);
  },
  onClickArmy: (armyId) => {
    const a = store.armies.get(armyId);
    if (a?.state === 'GARRISON') ui.selectArmy(armyId);
  },
  onClickVoid: () => { ui.closePopover(); ui.closeCard(); },
});
const ui = createUI({ store, map, orders });
const ftue = createFTUE({ store, map, ui });
const econ = createEcon({ store, map, ui }); // FS3 — 💰 economy dashboard

document.getElementById('btn-tutorial').addEventListener('click', (e) => {
  e.preventDefault();
  ftue.restart();
});
document.getElementById('btn-library').addEventListener('click', (e) => {
  e.preventDefault();
  ftue.openLibrary(); // F5 — browsable tutorial/tip library
});
document.getElementById('btn-economy').addEventListener('click', (e) => {
  e.preventDefault();
  econ.toggle();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { ui.selectArmy(null); ui.closePopover(); ui.closeCard(); }
});

// ── WS event routing ──────────────────────────────────────────────────────────
function nameOf(governorIds) {
  return governorIds.map((g) => esc(store.playerName(g))).join(', ') || 'Unknown';
}
function parcelName(parcelId) {
  return esc(store.terrByParcel.get(parcelId)?.name ?? parcelId);
}

const CC_NAMES = ['', 'camp', 'palisade', 'fortified camp'];

function handleEvents(events) {
  ftue.onEvents(events); // tutorial steps advance off the same real events
  const battleParcelsThisTick = new Set(
    events.filter((e) => e.type === 'battle_resolved').map((e) => e.parcelId),
  );
  // Armies moved by battle resolution this tick — their army_arrived toast is
  // superseded by the retreat/scatter surfacing below.
  const movedByBattle = new Set(
    events.filter((e) => e.type === 'army_retreated' || e.type === 'army_scattered').map((e) => e.armyId),
  );
  for (const ev of events) {
    switch (ev.type) {
      case 'battle_resolved': {
        // DRAW battles never show a winner — battle_tied (same tick) carries the stalemate story.
        if (ev.winner === 'DRAW' || ev.outcome === 'TIE') break;
        map.fireAt(ev.parcelId);
        const winners = ev.winner === 'ATTACKER' ? ev.attackerGovernorIds : ev.defenderGovernorIds;
        const losers = ev.winner === 'ATTACKER' ? ev.defenderGovernorIds : ev.attackerGovernorIds;
        const ccTier = store.battles.get(ev.battleId)?.logistics?.commandCenterTier ?? 0;
        const txt = `${nameOf(winners)} crushed ${nameOf(losers)} (${ev.attackerScore}–${ev.defenderScore})` +
          (ccTier > 0 ? ` — ${CC_NAMES[ccTier]} raised` : '');
        ui.toast(`⚔ Battle at ${parcelName(ev.parcelId)}!`, txt, 'battle', ev.parcelId, 7000);
        ui.feedPush(`<span class="t-battle">⚔</span> ${parcelName(ev.parcelId)}: ${txt}`, 't-battle', ev.parcelId);
        break;
      }
      case 'battle_tied': {
        map.smokeAt(ev.parcelId); // gray smoke — the battle guttered out, nothing burned down
        const txt = `${nameOf(ev.attackerGovernorIds)} vs ${nameOf(ev.defenderGovernorIds)} — no ground changed hands`;
        ui.toast(`⚔️ Stalemate at ${parcelName(ev.parcelId)}`, 'The clock ran out — attackers withdraw.', 'tie', ev.parcelId, 8000);
        ui.feedPush(`<span class="t-tie">🏳</span> Stalemate at ${parcelName(ev.parcelId)}: ${txt}`, 't-tie', ev.parcelId);
        break;
      }
      case 'army_retreated': {
        map.retreatFlash(ev.fromParcelId, ev.toParcelId, ev.governorId); // friend/foe colored in map.js
        const who = store.isMine(ev.governorId) ? 'Your army' : `${esc(store.playerName(ev.governorId))}'s army`;
        if (store.isMine(ev.governorId)) {
          ui.toast('↩ Retreat!', `Your army falls back to ${parcelName(ev.toParcelId)}.`, 'bad', ev.toParcelId, 8000);
        }
        ui.feedPush(`↩ ${who} retreated ${parcelName(ev.fromParcelId)} → ${parcelName(ev.toParcelId)}`, 't-tie', ev.toParcelId);
        break;
      }
      case 'army_scattered': {
        const who = store.isMine(ev.governorId) ? 'Your army' : `${esc(store.playerName(ev.governorId))}'s army`;
        ui.toast(`💀 ${who} scattered!`, ev.disbanded
          ? 'No line of retreat — the survivors threw down their arms and disbanded.'
          : 'No line of retreat — heavy losses, morale collapses.', 'bad', ev.parcelId, 9000);
        ui.feedPush(`💀 ${who} scattered at ${parcelName(ev.parcelId)}`, 't-battle', ev.parcelId);
        break;
      }
      case 'territory_pillaged':
        map.smolderAt(ev.parcelId);
        ui.feedPush(`🔥 ${esc(store.playerName(ev.governorId))} pillaged ${parcelName(ev.parcelId)}`, 't-gold', ev.parcelId);
        if (!store.isMine(ev.governorId)) {
          ui.toast(`🔥 ${parcelName(ev.parcelId)} pillaged`, `by ${esc(store.playerName(ev.governorId))}`, 'gold', ev.parcelId);
        }
        break;
      case 'territory_occupied':
        map.pulseAt(ev.parcelId, store.color(ev.governorId));
        ui.feedPush(`🏰 ${esc(store.playerName(ev.governorId))} occupied ${parcelName(ev.parcelId)}`, 't-good', ev.parcelId);
        ui.toast(`🏰 ${parcelName(ev.parcelId)} ${store.isMine(ev.governorId) ? 'is yours!' : 'occupied'}`,
          store.isMine(ev.governorId) ? '' : `by ${esc(store.playerName(ev.governorId))}`,
          store.isMine(ev.governorId) ? 'good' : 'info', ev.parcelId);
        break;
      case 'choice_pending':
        if (store.isMine(ev.governorId)) ui.openChoiceModal(ev.battleId);
        break;
      case 'town_entered': // private — only the arriving governor receives it (F2)
        if (store.isMine(ev.governorId)) {
          ui.feedPush(`🏘 Your army enters the town of ${parcelName(ev.parcelId)}`, 't-gold', ev.parcelId);
          ui.openChoiceModal(ev.choiceId);
        }
        break;
      case 'territory_developed': { // F4 — visible per fog; own upgrades already toasted by the POST
        const trackName = ev.track.charAt(0) + ev.track.slice(1).toLowerCase();
        ui.feedPush(`🏗 ${esc(store.playerName(ev.governorId))} developed ${parcelName(ev.parcelId)} — ${trackName} ${ev.level}`, 't-good', ev.parcelId);
        break;
      }
      case 'army_mustered': // E2 — the training queue emptied; the army may march
        if (store.isMine(ev.governorId)) {
          ui.toast('⚔ Army ready', `${ev.troops} troops stand at ${parcelName(ev.parcelId)} — free to march.`, 'good', ev.parcelId);
          ui.flashGoal(`Army ready at ${parcelName(ev.parcelId)}`);
          ui.feedPush(`⚔ Your army mustered at ${parcelName(ev.parcelId)} (${ev.troops}⚔)`, 't-good', ev.parcelId);
        }
        break;
      case 'territory_enriched': // E3 — visible per fog; own enrich already toasted by the POST
        ui.feedPush(`✨ ${esc(store.playerName(ev.governorId))} enriched ${parcelName(ev.parcelId)} (+${fmtCT(ev.toPoolCtUnits)} to the land)`, 't-gold', ev.parcelId);
        break;
      case 'territory_razed': { // E4 — smolder-lite scorch; own raze already toasted by the POST
        map.smolderAt(ev.parcelId, 0.5);
        const razeTrack = ev.track.charAt(0) + ev.track.slice(1).toLowerCase();
        ui.feedPush(`🔥 ${esc(store.playerName(ev.governorId))} razed ${razeTrack} at ${parcelName(ev.parcelId)} (salvaged ${fmtCT(ev.salvageCtUnits)})`, 't-battle', ev.parcelId);
        break;
      }
      case 'wild_raid': { // F3 — the frontier bites back
        const target = store.terrByParcel.get(ev.toParcelId);
        const mine = target && store.isMine(target.governorId);
        const who = esc(ev.monsterName ?? 'Wild');
        ui.toast(`🐺 ${who} raiders sighted!`, `Marching on ${parcelName(ev.toParcelId)}${mine ? ' — YOUR land!' : ''}`,
          mine ? 'raid urgent' : 'raid', ev.toParcelId, mine ? 12_000 : 8000);
        ui.feedPush(`🐺 ${who} raiders march on ${parcelName(ev.toParcelId)}${mine ? ' ⚠' : ''}`, 't-battle', ev.toParcelId);
        if (mine) ui.raidAlert(ev.armyId, ev.toParcelId, who);
        break;
      }
      case 'army_arrived': {
        if (movedByBattle.has(ev.armyId)) { marchDest.delete(ev.armyId); break; } // retreat/scatter toast covers it
        const dest = marchDest.get(ev.armyId);
        if (store.isMine(ev.governorId) && dest !== undefined) {
          if (ev.parcelId !== dest) {
            const battle = battleParcelsThisTick.has(ev.parcelId);
            ui.toast(battle ? '⚠ Intercepted!' : '⚠ March halted',
              `Your army stopped at ${parcelName(ev.parcelId)}${battle ? ' — battle joined!' : ''}`,
              'bad', ev.parcelId, 8000);
            if (battle) ui.feedPush(`⚠ Your army was intercepted at ${parcelName(ev.parcelId)}`, 't-battle', ev.parcelId);
            ftue.tip('interception'); // one-shot just-in-time explainer
          } else if (!battleParcelsThisTick.has(ev.parcelId)) {
            ui.toast('Army arrived', `Holding ${parcelName(ev.parcelId)}.`, 'info', ev.parcelId);
          }
          marchDest.delete(ev.armyId);
        }
        break;
      }
      case 'player_joined':
        if (!store.isMine(ev.governorId)) ui.toast('A new warlord', `${esc(ev.name)} enters the world.`, 'info');
        break;
      case 'npc_expand':
        ui.feedPush(`👹 ${esc(store.playerName(ev.governorId))} marches on ${parcelName(ev.toParcelId)}`, 't-gold', ev.toParcelId);
        break;
    }
  }
}

// ── join / boot ───────────────────────────────────────────────────────────────
async function refreshState() {
  const state = await api('/api/state', { token });
  if (!state.my) throw Object.assign(new Error('session expired'), { code: 'UNAUTHORIZED' });
  store.loadState(state);
  return state;
}

function openWS() {
  ws?.close();
  ws = connectWS(token, {
    onStatus: (s) => ui.setConn(s),
    onMessage: (msg) => {
      if (msg.t !== 'tick') return;
      store.applyTick(msg);   // deltas first, so event rendering sees fresh views
      handleEvents(msg.events);
    },
    onReconnect: () => { refreshState().catch(() => showJoin()); },
  });
}

async function boot() {
  const world = await api('/api/world');
  store.loadWorld(world);
  map.prepare();
  // FS3: live ⚙ splitter shares for the enrich/raze previews (non-blocking —
  // the balance mirrors in util.js cover a failed fetch).
  api('/api/economy').then((eco) => { store.econ = eco; store.emit(); }).catch(() => {});

  if (token) {
    try {
      const state = await refreshState();
      store.me = { governorId: state.my.governorId, name: store.playerName(state.my.governorId) };
      enterWorld();
      return;
    } catch { localStorage.removeItem(TOKEN_KEY); token = null; }
  }
  showJoin();
}

function showJoin() {
  const overlay = document.getElementById('join');
  overlay.hidden = false;
  document.getElementById('join-name').focus();
}

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('join-name').value.trim();
  const errEl = document.getElementById('join-err');
  try {
    const res = await api('/api/join', { body: { name } });
    token = res.token;
    localStorage.setItem(TOKEN_KEY, token);
    store.me = { governorId: res.governorId, name };
    await refreshState();
    document.getElementById('join').hidden = true;
    enterWorld();
  } catch (err) { errEl.textContent = err.message; }
});

function enterWorld() {
  ui.setPlayerLabel(store.me.name);
  ui.scheduleRail();
  openWS();
  // fly to my land (or a claimable frontier spot) so the player lands somewhere meaningful
  const mine = store.myTerritories()[0];
  if (mine) map.gotoParcel(mine.parcelId);
  ftue.maybeStart(); // first login → guided tutorial (per-player, resumable, skippable)
}

// Debug/demo hook (also used by the scripted Playwright walkthrough).
window.CF = { store, map, orders, ftue, ui, econ };

boot().catch((e) => {
  console.error('[client] boot failed:', e);
  document.getElementById('join-err').textContent = 'Server unreachable — retry shortly.';
  showJoin();
});
