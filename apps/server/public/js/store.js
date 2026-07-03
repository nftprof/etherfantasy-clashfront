/**
 * Client world store. Seeded once from GET /api/world + /api/state, then kept
 * current EXCLUSIVELY from WS tick deltas (never re-polled except on reconnect).
 * Everything derived (my territories/armies, free officers, pending choices)
 * is computed from the delta-maintained maps; the only imperative private
 * value is ctBalance, updated from POST responses + loot events (deduped).
 */

import { ECON, innerPoint, MUSTER_PENALTY } from './util.js';

export function createStore() {
  const listeners = new Set();
  const store = {
    // static geometry
    meta: { tickMs: 5000, travelTicksPerStep: 12 },
    parcels: new Map(),        // parcelId → {id, territoryId, center, polygon, neighbors}
    parcelByTerritory: new Map(),

    // dynamic (delta-maintained)
    tick: 0,
    tickWallMs: performance.now(), // when `tick` was received (interpolation anchor)
    players: new Map(),        // governorId → {name, color, kind}
    territories: new Map(),    // territoryId → TerritoryView
    terrByParcel: new Map(),   // parcelId → TerritoryView
    armies: new Map(),         // armyId → ArmyView (live only)
    battles: new Map(),        // battleId → BattleView
    liveBattles: new Map(),    // battleId → {id, parcelId, attacker/defenderGovernorIds, monsterName?, mine}

    // economy telemetry (FS3): latest GET /api/economy payload (boot + dashboard refresh)
    econ: null,

    // me
    me: null,                  // {governorId, name}
    ctBalance: 0,
    officers: [],              // DemoOfficer[] (roster is static per player)
    selfResolvedBattles: new Set(), // loot already applied via POST /api/choice response
    // My pending PILLAGE/OCCUPY decisions (FS2): choiceId → {choiceId, battleId?,
    // walkIn, armyId?, territoryId, parcelId, expiresTick, zoneType?}. Seeded from
    // /api/state my.pendingChoices, then maintained from WS events + POST responses.
    pendingChoices: new Map(),
    dismissedChoices: new Set(), // walk-in modals the player closed ("leave it")

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { for (const fn of listeners) fn(); },

    /** Fractional current tick for march interpolation / countdowns. */
    tickFloat() {
      const dt = (performance.now() - this.tickWallMs) / (this.meta.tickMs || 5000);
      return this.tick + Math.min(1, Math.max(0, dt));
    },
    ticksToMs(dTicks) { return dTicks * (this.meta.tickMs || 5000); },

    loadWorld(world) {
      this.meta = { ...this.meta, ...world.meta };
      for (const p of world.parcels) {
        // Client-local: snap the anchor point inside concave polygons so dots,
        // fires and clicks land on the parcel itself (visual only).
        p.center = innerPoint(p.polygon, p.center);
        this.parcels.set(p.id, p);
        this.parcelByTerritory.set(p.territoryId, p.id);
      }
    },

    /** Full snapshot (join / reconnect). Resets dynamic maps. */
    loadState(state) {
      this.tick = state.tick;
      this.tickWallMs = performance.now();
      this.players.clear();
      for (const p of state.players) this.players.set(p.governorId, p);
      this.territories.clear();
      this.terrByParcel.clear();
      for (const t of state.territories) this.putTerritory(t);
      this.armies.clear();
      for (const a of state.armies) this.putArmy(a);
      this.battles.clear();
      for (const b of state.battles) this.battles.set(b.id, b);
      this.liveBattles.clear();
      for (const b of state.liveBattles ?? []) this.putLiveBattle(b);
      if (state.my) {
        this.ctBalance = state.my.ctBalance;
        this.officers = state.my.officers;
        this.pendingChoices.clear();
        for (const c of state.my.pendingChoices ?? []) this.pendingChoices.set(c.choiceId, c);
      }
      this.emit();
    },

    // Fog note (F1): views are server-filtered per viewer — always REPLACE
    // wholesale so a parcel degrading to FUZZY/UNKNOWN drops stale ACCURATE
    // fields (garrison/development) with the latest delta.
    putTerritory(t) {
      this.territories.set(t.id, t);
      this.terrByParcel.set(t.parcelId, t);
    },
    putArmy(a) {
      // {id, hidden:true} = fog tombstone (army left my intel) — drop the marker.
      if (a.hidden || a.state === 'DISBANDED') this.armies.delete(a.id);
      else this.armies.set(a.id, a);
    },
    /** RUNNING wild battle (docs/04 §7b) — map badge + viewer entry point. */
    putLiveBattle(b) {
      this.liveBattles.set(b.id, {
        ...b,
        mine: (b.attackerGovernorIds ?? []).includes(this.me?.governorId),
      });
    },

    /** WS {t:'tick'} message → apply deltas. Events are handled by the caller. */
    applyTick(msg) {
      this.tick = msg.tick;
      this.tickWallMs = performance.now();
      for (const t of msg.deltas.territories) this.putTerritory(t);
      for (const a of msg.deltas.armies) this.putArmy(a);
      for (const b of msg.deltas.battles) this.battles.set(b.id, b);
      for (const ev of msg.events) {
        if (ev.type === 'battle_started') {
          this.putLiveBattle({
            id: ev.battleId, parcelId: ev.parcelId, monsterName: ev.monsterName,
            attackerGovernorIds: ev.attackerGovernorIds, defenderGovernorIds: ev.defenderGovernorIds,
            // bridge exhibitions (relayed MOBA matches) carry display labels
            exhibition: ev.exhibition, attackerLabel: ev.armyLabel, defenderLabel: ev.defenderLabel,
            // ENGINE battles (external match): no watch feed — parcel-card doorway only
            engine: ev.engine,
          });
        }
        // Hero-mode doorway (private to me): the live match granted MY join link.
        if (ev.type === 'battle_joinable') {
          const lb = this.liveBattles.get(ev.battleId);
          if (lb) lb.joinUrl = ev.joinUrl;
          else this.putLiveBattle({
            id: ev.battleId, parcelId: ev.parcelId, engine: true, joinUrl: ev.joinUrl,
            attackerGovernorIds: [ev.governorId], defenderGovernorIds: [],
          });
        }
        if (ev.type === 'battle_resolved') this.liveBattles.delete(ev.battleId); // settled — badge off
        if (ev.type === 'player_joined') {
          this.players.set(ev.governorId, { governorId: ev.governorId, name: ev.name, color: ev.color, kind: 'PLAYER' });
        }
        // pending decisions (FS2): battle victories + bloodless town walk-ins
        if (ev.type === 'choice_pending' && ev.governorId === this.me?.governorId) {
          this.pendingChoices.set(ev.battleId, {
            choiceId: ev.battleId, battleId: ev.battleId, walkIn: false,
            territoryId: ev.territoryId, parcelId: ev.parcelId, expiresTick: ev.expiresTick,
          });
        }
        if (ev.type === 'town_entered' && ev.governorId === this.me?.governorId) {
          this.pendingChoices.set(ev.choiceId, {
            choiceId: ev.choiceId, walkIn: true, armyId: ev.armyId, zoneType: ev.zoneType,
            territoryId: ev.territoryId, parcelId: ev.parcelId, expiresTick: ev.expiresTick,
          });
        }
        if (ev.type === 'territory_pillaged' || ev.type === 'territory_occupied') {
          this.pendingChoices.delete(ev.battleId); // battleId doubles as choiceId for walk-ins
          // loot from choices resolved server-side (timeouts / instant NPC picks)
          if (ev.governorId === this.me?.governorId && !this.selfResolvedBattles.has(ev.battleId)) {
            this.selfResolvedBattles.add(ev.battleId);
            this.ctBalance += ev.lootCt;
          }
        }
      }
      this.prunePendingChoices();
      this.emit();
    },

    /**
     * Drop pending choices the server will no longer honor: expired (server
     * default already fired) or walk-ins whose army left the parcel (the
     * server cancels those silently).
     */
    prunePendingChoices() {
      for (const [id, c] of this.pendingChoices) {
        if (this.tick >= c.expiresTick) { this.pendingChoices.delete(id); continue; }
        if (c.walkIn && c.armyId) {
          const a = this.armies.get(c.armyId);
          if (!a || a.parcelId !== c.parcelId || a.state === 'MARCHING') this.pendingChoices.delete(id);
        }
      }
    },

    // ── derived ──────────────────────────────────────────────────────────────
    /** ⚙ splitter shares — live from /api/economy, balance-mirror fallback (FS3). */
    shares() { return this.econ?.shares ?? ECON; },
    /** ⚙ training.musterPenalty — live from /api/economy, mirror fallback (E2). */
    musterPenalty() { return this.econ?.musterPenalty ?? MUSTER_PENALTY; },
    /** Full roster size of a mustering army (trained so far + still queued). */
    musterTotal(a) { return (a.troops ?? 0) + (a.mustering?.remainingTroops ?? 0); },
    /** E2: is this parcel's training queue busy (⚙ one per territory)? */
    queueBusyAt(parcelId) {
      return [...this.armies.values()].some(
        (a) => a.parcelId === parcelId && a.state === 'GARRISON' && a.mustering,
      );
    },

    color(governorId) { return this.players.get(governorId)?.color ?? '#6b7280'; },
    playerName(governorId) { return this.players.get(governorId)?.name ?? 'Unknown'; },
    isMine(governorId) { return governorId === this.me?.governorId; },

    myTerritories() {
      return [...this.territories.values()].filter((t) => this.isMine(t.governorId));
    },
    myArmies() {
      return [...this.armies.values()].filter((a) => this.isMine(a.governorId));
    },
    /** Officer engagement: overseeing a territory or leading a live army. */
    officerDuty(officerId) {
      for (const t of this.territories.values()) {
        if (t.overseerId === officerId && this.isMine(t.governorId)) return { kind: 'oversees', territory: t };
      }
      for (const a of this.armies.values()) {
        if (a.heroId === officerId) return { kind: 'leads', army: a };
      }
      return undefined;
    },
    freeOfficerCount() {
      return this.officers.filter((o) => this.officerDuty(o.id) === undefined).length;
    },
    /** My live PILLAGE/OCCUPY decisions (battle victories + town walk-ins), soonest-expiry first. */
    myPendingChoices() {
      this.prunePendingChoices();
      return [...this.pendingChoices.values()].sort((x, y) => x.expiresTick - y.expiresTick);
    },
    /** Hostile GARRISON armies on a parcel (defenders you would fight). */
    hostilesAt(parcelId) {
      return [...this.armies.values()].filter(
        (a) => a.parcelId === parcelId && a.state === 'GARRISON' && !this.isMine(a.governorId),
      );
    },
    armiesAt(parcelId) {
      return [...this.armies.values()].filter((a) => a.parcelId === parcelId && a.state === 'GARRISON');
    },

    /** World-space position of an army (interpolated along its march). */
    armyPos(a) {
      const cur = this.parcels.get(a.parcelId)?.center;
      if (!cur) return [0, 0];
      if (a.state !== 'MARCHING' || !a.path?.length || a.nextArrivalTick === undefined) return cur;
      const next = this.parcels.get(a.path[0])?.center ?? cur;
      const step = Math.max(1, this.meta.travelTicksPerStep || 1);
      const p = Math.min(1, Math.max(0, 1 - (a.nextArrivalTick - this.tickFloat()) / step));
      return [cur[0] + (next[0] - cur[0]) * p, cur[1] + (next[1] - cur[1]) * p];
    },
  };
  return store;
}
