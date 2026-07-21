/**
 * Transport & delivery — WORLD-BUILD-OUT-PLAN wave 3
 * (docs/briefs/TRANSPORT-DELIVERY-LAYER.md, owner 2026-07-17: "our own uber
 * eats and rides"). Caravans = Army kind:'CARAVAN' (reuse the movement phase);
 * delivery orders = escrowed contracts with deadlines + penalties; transit
 * through occupied land costs a pass fee (warlords) or a bribe (wilds).
 *
 * Coherence (§C WORLD-BUILD-OUT-PLAN): no new movement system — caravans ride
 * phaseMovement; escrow follows the command-queue fee pattern; pass fees
 * route through territory treasuries; raiding uses auto-surrender + the
 * existing loot flow.
 */
import { type Balance, newId, type Rng } from '@clashfront/shared';
import type { Army } from '@clashfront/shared';
import { sortedIds, type WorldState } from './state';
import { stockpileOf } from './workers';

// ── Delivery orders ──────────────────────────────────────────────────────────

export type DeliveryOrderState = 'OPEN' | 'ACCEPTED' | 'DELIVERED' | 'EXPIRED' | 'CANCELLED';

export interface DeliveryOrder {
  id: string;                   // contract_…
  createdTick: number;
  requesterGovernorId: string;
  destinationTerritoryId: string;
  /** What must arrive: resource → units (stockpile keys + 'food'). */
  wants: Partial<Record<string, number>>;
  /** Reward escrowed from the requester at posting (ct_units). */
  rewardCt: number;
  deadlineTick: number;
  /** Reward fraction lost per ⚙ graceWindowTicks past the deadline. */
  penaltyPct: number;
  acceptedByGovernorId?: string;
  acceptedTick?: number;
  state: DeliveryOrderState;
}

/** Post a delivery order — escrows the reward + burns the posting fee. */
export function postDeliveryOrder(
  state: WorldState,
  requesterGovernorId: string,
  destinationTerritoryId: string,
  wants: Partial<Record<string, number>>,
  rewardCt: number,
  deadlineTick: number,
  rng: Rng,
  balance: Balance,
): DeliveryOrder {
  const t = balance.transport;
  if (!state.territories.has(destinationTerritoryId)) throw new Error('postDeliveryOrder: no such territory');
  const wantEntries = Object.entries(wants).filter(([, n]) => typeof n === 'number' && n > 0);
  if (wantEntries.length === 0) throw new Error('postDeliveryOrder: empty wants');
  if (!Number.isInteger(rewardCt) || rewardCt <= 0) throw new Error('postDeliveryOrder: reward must be a positive integer');
  if (deadlineTick <= state.world.tick) throw new Error('postDeliveryOrder: deadline in the past');
  const total = rewardCt + t.postingFeeCt;
  const wallet = state.ctBalances?.get(requesterGovernorId) ?? 0;
  if (wallet < total) throw new Error('postDeliveryOrder: insufficient CT for reward + posting fee');
  state.ctBalances!.set(requesterGovernorId, wallet - total); // fee burns; reward escrows

  const order: DeliveryOrder = {
    id: newId('contract', { time: state.world.tick, random: () => rng.next() }),
    createdTick: state.world.tick,
    requesterGovernorId,
    destinationTerritoryId,
    wants: Object.fromEntries(wantEntries),
    rewardCt,
    deadlineTick,
    penaltyPct: t.latePenaltyPctPerWindow,
    state: 'OPEN',
  };
  state.deliveryOrders ??= new Map();
  state.deliveryOrders.set(order.id, order);
  return order;
}

/** Accept an open order (one courier at a time). */
export function acceptDeliveryOrder(state: WorldState, courierGovernorId: string, orderId: string): DeliveryOrder {
  const order = state.deliveryOrders?.get(orderId);
  if (order === undefined) throw new Error('acceptDeliveryOrder: no such order');
  if (order.state !== 'OPEN') throw new Error('acceptDeliveryOrder: order not open');
  if (order.requesterGovernorId === courierGovernorId) throw new Error('acceptDeliveryOrder: cannot accept your own order');
  order.acceptedByGovernorId = courierGovernorId;
  order.acceptedTick = state.world.tick;
  order.state = 'ACCEPTED';
  return order;
}

/** Cancel an OPEN order (requester only) — escrow refunds in full. */
export function cancelDeliveryOrder(state: WorldState, requesterGovernorId: string, orderId: string): void {
  const order = state.deliveryOrders?.get(orderId);
  if (order === undefined) throw new Error('cancelDeliveryOrder: no such order');
  if (order.requesterGovernorId !== requesterGovernorId) throw new Error('cancelDeliveryOrder: not your order');
  if (order.state !== 'OPEN') throw new Error('cancelDeliveryOrder: only OPEN orders cancel');
  order.state = 'CANCELLED';
  state.ctBalances!.set(
    requesterGovernorId,
    (state.ctBalances!.get(requesterGovernorId) ?? 0) + order.rewardCt,
  );
}

// ── Caravans ─────────────────────────────────────────────────────────────────

/**
 * Raise a caravan at a governed territory, loading cargo from its stockpile
 * (+ foodStock for 'food', + treasury gold for 'gold'). Provisions.food is
 * the gas tank — loaded separately from cargo.
 */
export function raiseCaravan(
  state: WorldState,
  governorId: string,
  territoryId: string,
  cargo: Partial<Record<string, number>>,
  provisionFood: number,
  rng: Rng,
  balance: Balance,
): Army {
  const terr = state.territories.get(territoryId);
  if (terr === undefined) throw new Error('raiseCaravan: no such territory');
  if (terr.governorId !== governorId) throw new Error('raiseCaravan: not your territory');
  const t = balance.transport;
  const stock = stockpileOf(state, territoryId);
  const entries = Object.entries(cargo).filter(([, n]) => typeof n === 'number' && n > 0) as [string, number][];
  const totalUnits = entries.reduce((n, [, c]) => n + c, 0) + provisionFood;
  if (totalUnits === 0) throw new Error('raiseCaravan: empty caravan');
  if (totalUnits > t.cargoCapBase) throw new Error('raiseCaravan: over cargo capacity');

  // Validate + deduct from source.
  for (const [res, count] of entries) {
    if (res === 'food') {
      if (terr.foodStock < count) throw new Error('raiseCaravan: not enough food');
    } else if (res === 'gold') {
      if (terr.ctTreasury < count) throw new Error('raiseCaravan: not enough treasury gold');
    } else if (res === 'wood' || res === 'iron' || res === 'stone' || res === 'rareMetal' || res === 'fur') {
      if (stock[res] < count) throw new Error(`raiseCaravan: not enough ${res}`);
    } else {
      throw new Error(`raiseCaravan: unknown cargo ${res}`);
    }
  }
  if (terr.foodStock < provisionFood + (cargo['food'] ?? 0)) throw new Error('raiseCaravan: not enough food for provisions');
  for (const [res, count] of entries) {
    if (res === 'food') terr.foodStock -= count;
    else if (res === 'gold') terr.ctTreasury -= count;
    else stock[res as 'wood' | 'iron' | 'stone' | 'rareMetal' | 'fur'] -= count;
  }
  terr.foodStock -= provisionFood;

  const caravan: Army = {
    id: newId('army', { time: state.world.tick, random: () => rng.next() }),
    worldId: state.world.id,
    ownerGovernorId: governorId,
    state: 'GARRISON',
    hexId: terr.hexIds[0]!,
    units: [], // civilians — zero combat value
    provisions: { food: provisionFood, gold: 0, wood: 0 },
    supply: 100,
    supplyMax: 100,
    morale: 100,
    supplyTrainIds: [],
    kind: 'CARAVAN',
    cargo: Object.fromEntries(entries),
    cargoCapMax: t.cargoCapBase,
    autoPayTolls: true,
    version: 1,
  };
  state.armies.set(caravan.id, caravan);
  return caravan;
}

/**
 * Transit toll for a caravan ENTERING hexId. Returns the toll or null when
 * passage is free. Warlord land = pass fee (% of cargo value, ⚙ capped) paid
 * in carried gold to the occupier treasury; wild-garrisoned land = food bribe.
 */
export function transitToll(
  state: WorldState,
  caravan: Army,
  hexId: string,
  balance: Balance,
): { kind: 'PASS_FEE'; gold: number; territoryId: string } | { kind: 'BRIBE'; food: number } | null {
  const terrId = state.hexes.get(hexId)?.territoryId;
  const terr = terrId === undefined ? undefined : state.territories.get(terrId);
  const t = balance.transport;
  if (terr === undefined) return null;
  if (terr.governorId === caravan.ownerGovernorId) return null;
  if (terr.governorKind !== 'SYSTEM') {
    // Warlord-occupied: flat % of cargo value (rough: unit count × avg price ⚙).
    const cargoUnits = Object.values(caravan.cargo ?? {}).reduce((n: number, c) => n + (c ?? 0), 0);
    const gold = Math.min(t.passFeeCapGold, Math.max(1, Math.ceil(cargoUnits * t.passFeePerCargoUnit)));
    return { kind: 'PASS_FEE', gold, territoryId: terr.id };
  }
  // SYSTEM ground: only garrisoned wilds demand a bribe.
  const garrison = terr.garrisonArmyId === undefined ? undefined : state.armies.get(terr.garrisonArmyId);
  if (garrison !== undefined && garrison.state !== 'DISBANDED') {
    const food = Math.max(1, Math.ceil(caravan.provisions.food * t.bribeFoodPct));
    return { kind: 'BRIBE', food };
  }
  return null;
}

/**
 * Pay a toll (called by phaseMovement before the caravan enters). Returns
 * true when paid (or free); false when the caravan cannot pay — it halts.
 */
export function payTransitToll(state: WorldState, caravan: Army, hexId: string, balance: Balance): boolean {
  const toll = transitToll(state, caravan, hexId, balance);
  if (toll === null) return true;
  if (caravan.autoPayTolls !== true) return false;
  if (toll.kind === 'PASS_FEE') {
    const goldHeld = caravan.cargo?.['gold'] ?? 0;
    if (goldHeld < toll.gold) return false;
    caravan.cargo!['gold'] = goldHeld - toll.gold;
    const terr = state.territories.get(toll.territoryId);
    if (terr !== undefined) terr.ctTreasury += toll.gold; // occupier's cut (landlord split later)
    return true;
  }
  // BRIBE — consumed by the wild (pure sink).
  if (caravan.provisions.food < toll.food) return false;
  caravan.provisions.food -= toll.food;
  return true;
}

/**
 * Caravan raiding: a caravan standing on a hex with hostile MILITARY armies
 * auto-surrenders (civilians don't fight). The strongest hostile's governor
 * takes the cargo into the hex's stockpile if they govern it, else the loot
 * lands in their nearest... (MVP: the cargo transfers to the raider's own
 * `cargo` if raider is a caravan, else to the territory they govern at the
 * raid hex, else it is scattered/lost). Caravan disbands; order fails.
 */
export function raidCaravans(state: WorldState, balance: Balance): void {
  for (const id of sortedIds(state.armies)) {
    const c = state.armies.get(id)!;
    if (c.kind !== 'CARAVAN' || c.state === 'DISBANDED') continue;
    const hostiles = [...state.armies.values()].filter(
      (a) =>
        a.state !== 'DISBANDED' &&
        a.kind !== 'CARAVAN' &&
        a.hexId === c.hexId &&
        a.ownerGovernorId !== c.ownerGovernorId &&
        state.governorKinds?.get(a.ownerGovernorId) !== undefined,
    );
    if (hostiles.length === 0) continue;
    // Deterministic raider: lex-first hostile army id.
    const raider = hostiles.sort((a, b) => a.id.localeCompare(b.id))[0]!;
    const terrId = state.hexes.get(c.hexId)?.territoryId;
    const terr = terrId === undefined ? undefined : state.territories.get(terrId);
    const lootPct = balance.transport.caravanLootPct;
    for (const [res, count] of Object.entries(c.cargo ?? {})) {
      const looted = Math.floor((count ?? 0) * lootPct);
      if (looted <= 0) continue;
      if (terr !== undefined && terr.governorId === raider.ownerGovernorId) {
        // Raider governs this ground — loot to the local stockpile/treasury.
        if (res === 'gold') terr.ctTreasury += looted;
        else if (res === 'food') terr.foodStock += looted;
        else stockpileOf(state, terr.id)[res as 'wood' | 'iron' | 'stone' | 'rareMetal' | 'fur'] += looted;
      } else if (res === 'gold') {
        // Gold always spendable: to the raider governor's wallet.
        state.ctBalances?.set(
          raider.ownerGovernorId,
          (state.ctBalances.get(raider.ownerGovernorId) ?? 0) + looted,
        );
      }
      // Non-gold loot on foreign ground scatters (lost) — v2 carries it on the raider.
    }
    c.state = 'DISBANDED';
    delete c.path;
    delete c.arrivalTick;
    // Fail any accepted order this courier was running to that destination.
    for (const order of state.deliveryOrders?.values() ?? []) {
      if (order.state === 'ACCEPTED' && order.acceptedByGovernorId === c.ownerGovernorId) {
        order.state = 'OPEN'; // re-opens for another courier
        delete order.acceptedByGovernorId;
        delete order.acceptedTick;
      }
    }
  }
}

/**
 * Delivery settlement — runs each tick: a courier's caravan standing on the
 * destination territory with the wanted goods DELIVERS (cargo transfers,
 * reward pays out minus platform fee + late penalty). Expired orders refund.
 */
export function settleDeliveries(state: WorldState, tick: number, balance: Balance): void {
  if (state.deliveryOrders === undefined) return;
  const t = balance.transport;
  for (const orderId of sortedIds(state.deliveryOrders)) {
    const order = state.deliveryOrders.get(orderId)!;
    if (order.state === 'OPEN' && tick > order.deadlineTick + t.hardExpiryTicks) {
      order.state = 'EXPIRED';
      state.ctBalances?.set(
        order.requesterGovernorId,
        (state.ctBalances.get(order.requesterGovernorId) ?? 0) + order.rewardCt,
      );
      continue;
    }
    if (order.state !== 'ACCEPTED') continue;
    const courier = order.acceptedByGovernorId!;
    const destTerr = state.territories.get(order.destinationTerritoryId);
    if (destTerr === undefined) continue;
    const destHexes = new Set(destTerr.hexIds);
    // Find the courier's caravan standing on the destination with the goods.
    for (const aid of sortedIds(state.armies)) {
      const c = state.armies.get(aid)!;
      if (c.kind !== 'CARAVAN' || c.state === 'DISBANDED') continue;
      if (c.ownerGovernorId !== courier || !destHexes.has(c.hexId)) continue;
      const cargo = c.cargo ?? {};
      const canFill = Object.entries(order.wants).every(([res, n]) => (cargo[res] ?? 0) >= (n ?? 0));
      if (!canFill) continue;
      // Transfer goods to the destination.
      const stock = stockpileOf(state, destTerr.id);
      for (const [res, n] of Object.entries(order.wants)) {
        const count = n ?? 0;
        cargo[res] = (cargo[res] ?? 0) - count;
        if (res === 'food') destTerr.foodStock += count;
        else if (res === 'gold') destTerr.ctTreasury += count;
        else stock[res as 'wood' | 'iron' | 'stone' | 'rareMetal' | 'fur'] += count;
      }
      // Reward: minus platform fee, minus late decay.
      let reward = order.rewardCt;
      if (tick > order.deadlineTick) {
        const windows = Math.ceil((tick - order.deadlineTick) / t.graceWindowTicks);
        const decay = Math.min(1, windows * order.penaltyPct);
        const returned = Math.floor(order.rewardCt * decay);
        reward -= returned;
        // Late slice returns to the requester (compensation).
        state.ctBalances?.set(
          order.requesterGovernorId,
          (state.ctBalances.get(order.requesterGovernorId) ?? 0) + returned,
        );
      }
      const fee = Math.ceil(reward * t.platformFeePct); // burns
      state.ctBalances?.set(courier, (state.ctBalances.get(courier) ?? 0) + Math.max(0, reward - fee));
      order.state = 'DELIVERED';
      break;
    }
  }
}
