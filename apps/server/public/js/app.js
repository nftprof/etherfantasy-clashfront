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
import { esc, fmtCT, fmtProv } from './util.js';

const TOKEN_KEY = 'cf_token';
const store = createStore();
let token = localStorage.getItem(TOKEN_KEY);
let ws = null;
const marchDest = new Map(); // armyId → ordered destination parcelId (interception detection)

// ── orders (POST responses are authoritative — applied to the store directly) ──
const orders = {
  async claim(territoryId) {
    try {
      const { territory } = await api('/api/claim', { token, body: { territoryId } });
      store.putTerritory(territory);
      store.emit();
      ui.toast('Land claimed', `${esc(territory.name)} flies your banner.`, 'good', territory.parcelId);
    } catch (e) { ui.toast('Claim failed', esc(e.message), 'bad'); }
  },
  async raise(territoryId, preset) {
    try {
      const { army, ctUnits } = await api('/api/raise', { token, body: { territoryId, preset } });
      store.putArmy(army);
      store.ctBalance = ctUnits;
      store.emit();
      ui.toast('Army raised', `${esc(army.heroName ?? 'A commander')} leads ${army.troops} troops.`, 'good', army.parcelId);
    } catch (e) { ui.toast('Cannot raise army', esc(e.message), 'bad'); }
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
  async choice(battleId, action) {
    try {
      const { battle, ctUnits } = await api('/api/choice', { token, body: { battleId, action } });
      store.selfResolvedBattles.add(battleId);
      store.battles.set(battle.id, battle);
      store.ctBalance = ctUnits;
      store.emit();
      if (action === 'PILLAGE') ui.toast('Pillaged!', `Looted ${fmtCT(battle.lootCt ?? 0)}. The land smolders.`, 'gold', battle.parcelId);
    } catch (e) { ui.toast('Choice failed', esc(e.message), 'bad'); }
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

document.getElementById('btn-tutorial').addEventListener('click', (e) => {
  e.preventDefault();
  ftue.restart();
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
        map.retreatFlash(ev.fromParcelId, ev.toParcelId, store.color(ev.governorId));
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
window.CF = { store, map, orders, ftue };

boot().catch((e) => {
  console.error('[client] boot failed:', e);
  document.getElementById('join-err').textContent = 'Server unreachable — retry shortly.';
  showJoin();
});
