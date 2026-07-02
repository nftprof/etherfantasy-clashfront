/**
 * Client world store. Seeded once from GET /api/world + /api/state, then kept
 * current EXCLUSIVELY from WS tick deltas (never re-polled except on reconnect).
 * Everything derived (my territories/armies, free officers, pending choices)
 * is computed from the delta-maintained maps; the only imperative private
 * value is ctBalance, updated from POST responses + loot events (deduped).
 */

import { innerPoint } from './util.js';

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

    // me
    me: null,                  // {governorId, name}
    ctBalance: 0,
    officers: [],              // DemoOfficer[] (roster is static per player)
    selfResolvedBattles: new Set(), // loot already applied via POST /api/choice response

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
      if (state.my) {
        this.ctBalance = state.my.ctBalance;
        this.officers = state.my.officers;
      }
      this.emit();
    },

    putTerritory(t) {
      this.territories.set(t.id, t);
      this.terrByParcel.set(t.parcelId, t);
    },
    putArmy(a) {
      if (a.state === 'DISBANDED') this.armies.delete(a.id);
      else this.armies.set(a.id, a);
    },

    /** WS {t:'tick'} message → apply deltas. Events are handled by the caller. */
    applyTick(msg) {
      this.tick = msg.tick;
      this.tickWallMs = performance.now();
      for (const t of msg.deltas.territories) this.putTerritory(t);
      for (const a of msg.deltas.armies) this.putArmy(a);
      for (const b of msg.deltas.battles) this.battles.set(b.id, b);
      for (const ev of msg.events) {
        if (ev.type === 'player_joined') {
          this.players.set(ev.governorId, { governorId: ev.governorId, name: ev.name, color: ev.color, kind: 'PLAYER' });
        }
        // loot from choices resolved server-side (timeouts / instant NPC picks)
        if ((ev.type === 'territory_pillaged' || ev.type === 'territory_occupied') &&
            ev.governorId === this.me?.governorId && !this.selfResolvedBattles.has(ev.battleId)) {
          this.selfResolvedBattles.add(ev.battleId);
          this.ctBalance += ev.lootCt;
        }
      }
      this.emit();
    },

    // ── derived ──────────────────────────────────────────────────────────────
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
    myPendingChoices() {
      const out = [];
      for (const b of this.battles.values()) {
        if (b.pendingChoice && this.isMine(b.pendingChoice.governorId)) out.push(b);
      }
      return out.sort((x, y) => x.pendingChoice.expiresTick - y.pendingChoice.expiresTick);
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
