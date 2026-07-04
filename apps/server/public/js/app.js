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
import { createBattle } from './battle.js';
import { esc, fmtCT, fmtDur, fmtProv, initAvatarMissTracking, preloadHeroAvatars } from './util.js';

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
  /** POST /api/abandon — release an owned territory; the overseer + garrison are freed, everything built stays with the land. */
  async abandon(territoryId) {
    try {
      const res = await api('/api/abandon', { token, body: { territoryId } });
      store.putTerritory(res.territory);
      store.ctBalance = res.ctUnits;
      store.emit();
      ui.toast('🏳 Land abandoned', `${esc(res.territory.name)} reverts to the wilds — your officer and garrison are free to serve elsewhere; what you built stays with the land.`, 'info', res.territory.parcelId);
      return true;
    } catch (e) {
      ui.toast('Abandon refused', e.code === 'BATTLE_RAGING'
        ? 'A battle rages on that land — you cannot walk away from contested ground.'
        : esc(e.message), 'bad');
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
  /** Open the LIVE battle viewer (parcel-card "Watch"/"Command" buttons). */
  watchBattle(battleId) { battle.open(battleId); },
  /** POST /api/buy-ct — dev-phase E5 purchase (amount in whole CT). */
  async buyCt(amountCt) {
    try {
      const res = await api('/api/buy-ct', { token, body: { amountCtUnits: amountCt * 10_000 } });
      store.ctBalance = res.ctUnits;
      store.emit();
      ui.toast('💰 CT purchased', `+${fmtCT(res.boughtCtUnits)} — ${fmtCT(res.remainingCapCtUnits)} of purchase cap left this epoch.`, 'gold');
    } catch (e) {
      ui.toast('Purchase refused', e.code === 'PURCHASE_CAP'
        ? 'Purchase cap reached for this epoch — earn the rest on the battlefield.'
        : esc(e.message), 'bad');
    }
  },
  /** POST /api/exhibition — stage a self-serve demo battle on a parcel (M1.5 relay). */
  async exhibition(parcelId) {
    try {
      await api('/api/exhibition', { token, body: { parcelId } });
      ui.toast('⚔ Exhibition staged', 'A demo battle is forming on this parcel — the LIVE badge appears in a few seconds. Open it to watch and steer. No ground changes hands.', 'good', parcelId);
    } catch (e) {
      ui.toast('Exhibition unavailable', e.code === 'EXHIBITION_RUNNING'
        ? 'Your previous exhibition is still running — let it finish first.'
        : esc(e.message), 'bad');
    }
  },
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
// LIVE wild-battle viewer (docs/04 §7b) — WS battle channel through the live socket.
const battle = createBattle({ store, ui, send: (m) => ws?.send(m), ftue });
ftue.registerBattleCoach(() => battle.startCoach(true)); // 📖 library replay hook
initAvatarMissTracking(); // officer avatars: 404s degrade to medallions, once, silently
preloadHeroAvatars();

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
      case 'battle_started': {
        // LIVE wild battle (docs/04 §7b) or a bridge-relayed MOBA match:
        // the parcel is a running fight now.
        const mine = ev.attackerGovernorIds.includes(store.me?.governorId);
        if (ev.engine) {
          // ENGINE battle (external MOBA match): no command feed to open — the
          // parcel card carries the ⚡ Hero-Mode doorway once the join link lands.
          const foe = ev.monsterName ? `☠ ${esc(ev.monsterName)}`
            : ev.defenderGovernorIds?.length ? esc(store.playerName(ev.defenderGovernorIds[0])) : 'defenders';
          const openParcel = () => ui.openCard(ev.parcelId);
          ui.toast(`⚔ Battle joined at ${parcelName(ev.parcelId)}!`,
            `${mine ? 'Your army' : esc(store.playerName(ev.attackerGovernorIds[0]))} engages ${foe} ` +
            `(${ev.attackerTroops}⚔ vs ${ev.defenderTroops}) — fought as a full match on the battle engine`,
            'battle', ev.parcelId, 10_000, openParcel);
          ui.feedPush(`<span class="t-battle">⚔</span> Field battle at ${parcelName(ev.parcelId)}${mine ? ' — yours' : ''}`, 't-battle', ev.parcelId);
          if (mine) openParcel(); // the ⚡ Take-the-field doorway lives on the card
          break;
        }
        const who = ev.monsterName ? `☠ ${esc(ev.monsterName)}`
          : ev.defenderLabel ? esc(ev.defenderLabel) : 'wild defenders';
        const atkName = mine ? 'Your army'
          : ev.armyLabel ? esc(ev.armyLabel) : esc(store.playerName(ev.attackerGovernorIds[0]));
        const openViewer = () => battle.open(ev.battleId);
        ui.toast(`⚔ Battle joined at ${parcelName(ev.parcelId)}!`,
          `${atkName} engages ${who} ` +
          `(${ev.attackerTroops}⚔ vs ${ev.defenderTroops}) — <b>click to ${mine || ev.open ? 'command' : 'watch'} LIVE</b>`,
          'battle', ev.parcelId, 10_000, openViewer);
        ui.feedPush(`<span class="t-battle">⚔</span> LIVE battle at ${parcelName(ev.parcelId)}${mine ? ' — yours' : ''}`, 't-battle', ev.parcelId);
        if (mine) {
          // Your assault: jump straight into the fight — the in-overlay Command-
          // Mode mini-coach teaches there. During the tutorial the toast invites
          // instead (its coach-marks would fight the overlay) and the one-shot
          // battle_live tip carries the lesson.
          if (ftue.running) ftue.tip('battle_live');
          else openViewer();
        }
        break;
      }
      case 'battle_joinable': {
        // PRIVATE to me (server-filtered): my live match minted my hero-mode
        // deep link — the ⚡ doorway on the parcel card is armed now.
        const openParcel = () => ui.openCard(ev.parcelId);
        ui.toast(`⚡ The field is open at ${parcelName(ev.parcelId)}`,
          `Your Master can take the field — <b>click</b> for the ⚡ doorway (one hero at a time).`,
          'battle', ev.parcelId, 12_000, openParcel);
        break;
      }
      case 'battle_resolved': {
        // DRAW battles never show a winner — battle_tied (same tick) carries the stalemate story.
        if (ev.winner === 'DRAW' || ev.outcome === 'TIE') break;
        map.fireAt(ev.parcelId);
        const winners = ev.winner === 'ATTACKER' ? ev.attackerGovernorIds : ev.defenderGovernorIds;
        const losers = ev.winner === 'ATTACKER' ? ev.defenderGovernorIds : ev.attackerGovernorIds;
        // Bridge exhibitions have labels instead of governors (display-only outcome).
        const wLbl = ev.winner === 'ATTACKER' ? ev.attackerLabel : ev.defenderLabel;
        const lLbl = ev.winner === 'ATTACKER' ? ev.defenderLabel : ev.attackerLabel;
        const ccTier = store.battles.get(ev.battleId)?.logistics?.commandCenterTier ?? 0;
        const txt = `${winners.length ? nameOf(winners) : esc(wLbl ?? 'Attackers')} crushed ` +
          `${losers.length ? nameOf(losers) : esc(lLbl ?? 'Defenders')} (${ev.attackerScore}–${ev.defenderScore})` +
          (ccTier > 0 ? ` — ${CC_NAMES[ccTier]} raised` : '') +
          (ev.exhibition ? ' — exhibition, no ground changes hands' : '');
        ui.toast(`⚔ Battle at ${parcelName(ev.parcelId)}!`, txt, 'battle', ev.parcelId, 7000);
        ui.feedPush(`<span class="t-battle">⚔</span> ${parcelName(ev.parcelId)}: ${txt}`, 't-battle', ev.parcelId);
        break;
      }
      case 'battle_tied': {
        map.smokeAt(ev.parcelId); // gray smoke — the battle guttered out, nothing burned down
        const aName = ev.attackerGovernorIds.length ? nameOf(ev.attackerGovernorIds) : esc(ev.attackerLabel ?? 'Attackers');
        const dName = ev.defenderGovernorIds.length ? nameOf(ev.defenderGovernorIds) : esc(ev.defenderLabel ?? 'Defenders');
        const txt = `${aName} vs ${dName} — no ground changed hands`;
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
      case 'territory_abandoned': { // public — abandoned land is free to claim; own abandon already toasted by the POST
        ui.feedPush(`🏳 ${esc(store.playerName(ev.governorId))} abandoned ${parcelName(ev.parcelId)} — the land lies unclaimed`, 't-tie', ev.parcelId);
        if (!store.isMine(ev.governorId)) {
          ui.toast(`🏳 ${parcelName(ev.parcelId)} abandoned`, `${esc(store.playerName(ev.governorId))} released this land — free to claim, improvements included.`, 'info', ev.parcelId);
        }
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
      if (typeof msg.t === 'string' && msg.t.startsWith('battle_')) { battle.onMsg(msg); return; }
      if (msg.t !== 'tick') return;
      store.applyTick(msg);   // deltas first, so event rendering sees fresh views
      handleEvents(msg.events);
      battle.onWorldEvents(msg.events); // close the viewer if its battle settled
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
    // Retry resume through transient failures (server restarting mid-deploy, flaky
    // network). ONLY a definitive 401 UNAUTHORIZED discards the stored identity —
    // anything else must never log the player out into a fresh governor.
    for (let attempt = 0; ; attempt++) {
      try {
        const state = await refreshState();
        store.me = { governorId: state.my.governorId, name: store.playerName(state.my.governorId) };
        enterWorld();
        return;
      } catch (e) {
        if (e?.code === 'UNAUTHORIZED') { localStorage.removeItem(TOKEN_KEY); token = null; break; }
        if (attempt >= 5) break; // keep the token; land on join, a reload resumes
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
      }
    }
  }
  showJoin();
}

/**
 * Join overlay in one of two modes (docs/briefs/PG-IDENTITY.md):
 *   pgEnabled  → Pentagon Games sign-in (identifier + password, embedded form —
 *                no redirects): browser POSTs {pgApiUrl}/user/login with the
 *                publishable X-PG-App-Key, then hands result.access_token to our
 *                /api/login-pg which verifies server-side and mints a cf token.
 *   !pgEnabled → dev name-only banner login (/api/join), unchanged.
 * The ⇄ switch button just clears cf_token + reloads — it lands here in both modes.
 */
function showJoin() {
  const pg = !!store.meta.pgEnabled;
  document.getElementById('join-sub').textContent = pg
    ? 'The overworld is at war. Sign in with your Pentagon Games account to take your banner.'
    : 'The overworld is at war. Name your banner — an existing name resumes that governor.';
  const nameEl = document.getElementById('join-name');
  nameEl.hidden = pg; nameEl.required = !pg;
  for (const id of ['join-pg-id', 'join-pg-pass']) {
    const el = document.getElementById(id);
    el.hidden = !pg; el.required = pg;
  }
  document.getElementById('join-btn').textContent = pg ? 'Sign in with Pentagon' : 'Enter the war';
  document.getElementById('join').hidden = false;
  (pg ? document.getElementById('join-pg-id') : nameEl).focus();
}

/**
 * PG sign-in — PROXIED through our server (2026-07-03): the browser's direct POST
 * to the PG origin dies on CORS, so /api/login-pg now takes identifier+password
 * and does the PG round-trip server-side. bind_token = the PREVIOUS session's cf
 * token (stashed by the ⇄ switch): proves control of that governor so the PG
 * account claims it even when names differ (PG "nftprof" → the "Idon" empire).
 */
async function pgLogin() {
  const identifier = document.getElementById('join-pg-id').value.trim();
  const password = document.getElementById('join-pg-pass').value;
  const bindToken = localStorage.getItem('cf_prev') ?? undefined;
  const res = await api('/api/login-pg', {
    body: { identifier, password, ...(bindToken ? { bind_token: bindToken } : {}) },
  });
  localStorage.removeItem('cf_prev'); // one-shot bind hint
  return res;
}

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('join-err');
  try {
    const res = store.meta.pgEnabled
      ? await pgLogin()
      : await api('/api/join', { body: { name: document.getElementById('join-name').value.trim() } });
    token = res.token;
    localStorage.setItem(TOKEN_KEY, token);
    store.me = { governorId: res.governorId, name: store.playerName(res.governorId) };
    await refreshState();
    store.me = { governorId: res.governorId, name: store.playerName(res.governorId) };
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
window.CF = { store, map, orders, ftue, ui, econ, battle };

boot().catch((e) => {
  console.error('[client] boot failed:', e);
  document.getElementById('join-err').textContent = 'Server unreachable — retry shortly.';
  showJoin();
});
