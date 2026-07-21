/**
 * AMM local markets — WORLD-BUILD-OUT-PLAN wave 2 (owner 2026-07-17).
 * Every parcel with a market is its own constant-product AMM (x·y=k) per
 * (resource, gold) pair — buy raises the price, sell lowers it, real supply/
 * demand discovery. Fees (the vendor spread) tighten with enrichment tier;
 * fee revenue burns (net-sink doctrine, decision 13/17).
 *
 * Depth (k) scales with parcel enrichment; pools seed from the biome at
 * first touch. The system BALANCER (an invisible capped NPC arbitrageur)
 * moves goods between pools ONLY when price gaps are egregious (≥ ⚙ 30%),
 * leaving normal 10-25% gaps to player traders. Gold in pools is ct_units
 * (1 gold = 1 ct_unit at the fixed 1 CT = 100 g declaration — display-level).
 *
 * Coherence (§C WORLD-BUILD-OUT-PLAN): trades draw/credit the governor's
 * ctBalances wallet + territory stockpile; fees burn via the economy journal
 * pattern; no new movement or entity systems.
 */
import { type Balance, TICKS_PER_DAY } from '@clashfront/shared';
import { sortedIds, type Stockpile, type WorldState } from './state';
import { stockpileOf } from './workers';

/** Tradeable stockpile resources (arms trade as a flat-price special case later). */
export type MarketResource = 'wood' | 'iron' | 'stone' | 'rareMetal' | 'fur' | 'food';

export const MARKET_RESOURCES: readonly MarketResource[] = ['wood', 'iron', 'stone', 'rareMetal', 'fur', 'food'];

/** One constant-product pool: resource units vs gold (ct_units). */
export interface MarketPool {
  resource: number;
  gold: number;
}

/** territoryId → resource → pool. Engine container (snapshot-safe plain JSON). */
export type TerritoryMarkets = Partial<Record<MarketResource, MarketPool>>;

/**
 * Baseline gold price per unit (the "if perfectly balanced" reference —
 * NPC-TRADE-RATIOS): food/wood 2, stone 3, iron 5, fur 10, rareMetal 50.
 */
export function baselinePrice(resource: MarketResource, balance: Balance): number {
  const b = balance.market;
  switch (resource) {
    case 'food': return b.priceFood;
    case 'wood': return b.priceWood;
    case 'stone': return b.priceStone;
    case 'iron': return b.priceIron;
    case 'fur': return b.priceFur;
    case 'rareMetal': return b.priceRareMetal;
  }
}

/**
 * Enrichment tier 0..5 from the parcel's cumulative enrichment pool
 * (⚙ market.tierThresholdsCt — SINGLE-parcel ladder; estate scaling later).
 */
export function enrichmentTier(state: WorldState, territoryId: string, balance: Balance): number {
  const pool = state.enrichmentPools?.get(territoryId) ?? 0;
  const ladder = balance.market.tierThresholdsCt;
  let tier = 0;
  for (let i = 0; i < ladder.length; i++) {
    if (pool >= ladder[i]!) tier = i + 1;
  }
  return tier;
}

/** Per-side fee fraction by tier (T0 0.25 … T5 0.05) — ⚙ market.feeByTier. */
export function marketFee(tier: number, balance: Balance): number {
  const fees = balance.market.feeByTier;
  return fees[Math.min(tier, fees.length - 1)]!;
}

/** Lazily seed a parcel's pool for a resource (depth scales with tier). */
export function poolOf(state: WorldState, territoryId: string, resource: MarketResource, balance: Balance): MarketPool {
  state.markets ??= new Map();
  let markets = state.markets.get(territoryId);
  if (markets === undefined) {
    markets = {};
    state.markets.set(territoryId, markets);
  }
  let pool = markets[resource];
  if (pool === undefined) {
    const tier = enrichmentTier(state, territoryId, balance);
    const depthMult = 1 + tier * balance.market.depthPerTier;
    const units = Math.round(balance.market.seedUnits * depthMult);
    pool = { resource: units, gold: units * baselinePrice(resource, balance) };
    markets[resource] = pool;
  }
  return pool;
}

/** Spot price (gold per unit) of a pool — marginal, before fees. */
export function spotPrice(pool: MarketPool): number {
  return pool.resource > 0 ? pool.gold / pool.resource : Number.POSITIVE_INFINITY;
}

export interface TradeResult {
  /** Units of resource moved (bought or sold). */
  units: number;
  /** Gold (ct_units) paid (buy) or received (sell), fee included. */
  gold: number;
  /** Fee burned (ct_units). */
  feeBurned: number;
  /** New spot price after the trade. */
  price: number;
}

/**
 * BUY `units` of a resource from a parcel's pool. Buyer pays gold from their
 * ctBalances wallet; resource lands in the buyer's chosen stockpile (usually
 * a caravan later; wave 2 = the same parcel's stockpile). Fee burns.
 */
export function marketBuy(
  state: WorldState,
  governorId: string,
  territoryId: string,
  resource: MarketResource,
  units: number,
  balance: Balance,
): TradeResult {
  if (!Number.isInteger(units) || units <= 0) throw new Error('marketBuy: units must be a positive integer');
  const pool = poolOf(state, territoryId, resource, balance);
  if (units >= pool.resource) throw new Error('marketBuy: not enough liquidity');
  const k = pool.resource * pool.gold;
  const newResource = pool.resource - units;
  const newGold = k / newResource;
  const rawCost = Math.ceil(newGold - pool.gold);
  const tier = enrichmentTier(state, territoryId, balance);
  const fee = Math.ceil(rawCost * marketFee(tier, balance));
  const totalCost = rawCost + fee;

  const wallet = state.ctBalances?.get(governorId) ?? 0;
  if (wallet < totalCost) throw new Error('marketBuy: insufficient CT');
  state.ctBalances!.set(governorId, wallet - totalCost);

  pool.resource = newResource;
  pool.gold = Math.round(newGold);

  const stock = stockpileOf(state, territoryId);
  if (resource === 'food') {
    const terr = state.territories.get(territoryId);
    if (terr !== undefined) terr.foodStock += units;
  } else {
    stock[resource] += units;
  }
  return { units, gold: totalCost, feeBurned: fee, price: spotPrice(pool) };
}

/**
 * SELL `units` of a resource into a parcel's pool from that parcel's
 * stockpile (owner-governed). Seller receives gold minus fee; fee burns.
 */
export function marketSell(
  state: WorldState,
  governorId: string,
  territoryId: string,
  resource: MarketResource,
  units: number,
  balance: Balance,
): TradeResult {
  if (!Number.isInteger(units) || units <= 0) throw new Error('marketSell: units must be a positive integer');
  const terr = state.territories.get(territoryId);
  if (terr === undefined) throw new Error(`marketSell: no such territory ${territoryId}`);
  if (terr.governorId !== governorId) throw new Error('marketSell: not your territory');
  const stock = stockpileOf(state, territoryId);
  const held = resource === 'food' ? terr.foodStock : stock[resource];
  if (held < units) throw new Error('marketSell: not enough stock');

  const pool = poolOf(state, territoryId, resource, balance);
  const k = pool.resource * pool.gold;
  const newResource = pool.resource + units;
  const newGold = k / newResource;
  const rawProceeds = Math.floor(pool.gold - newGold);
  const tier = enrichmentTier(state, territoryId, balance);
  const fee = Math.ceil(rawProceeds * marketFee(tier, balance));
  const net = Math.max(0, rawProceeds - fee);

  if (resource === 'food') terr.foodStock -= units;
  else stock[resource] -= units;
  pool.resource = newResource;
  pool.gold = Math.round(newGold);

  state.ctBalances ??= new Map();
  state.ctBalances.set(governorId, (state.ctBalances.get(governorId) ?? 0) + net);
  return { units, gold: net, feeBurned: fee, price: spotPrice(pool) };
}

/**
 * The SYSTEM BALANCER — invisible capped NPC arbitrageur (owner spec:
 * blanket cover for egregious gaps only). Runs once per game-day inside the
 * tick (deterministic): finds the widest spot-price gap per resource across
 * all seeded pools; if gap ≥ ⚙ minGapPct, moves goods surplus→shortage,
 * bounded by ⚙ maxGoldPerDay + ⚙ maxTradesPerDay. Consumed gold margin is
 * burned (the balancer never profits — pure sink).
 */
export function runMarketBalancer(state: WorldState, balance: Balance): void {
  if (state.markets === undefined || state.markets.size < 2) return;
  const b = balance.market;
  let goldBudget = b.balancerMaxGoldPerDay;
  let trades = 0;

  for (const resource of MARKET_RESOURCES) {
    if (goldBudget <= 0 || trades >= b.balancerMaxTradesPerDay) break;
    // Collect seeded pools for this resource (deterministic order).
    const entries: { territoryId: string; pool: MarketPool }[] = [];
    for (const tid of sortedIds(state.markets)) {
      const pool = state.markets.get(tid)![resource];
      if (pool !== undefined && pool.resource > 0) entries.push({ territoryId: tid, pool });
    }
    if (entries.length < 2) continue;
    // Cheapest (surplus) and dearest (shortage).
    let lo = entries[0]!; let hi = entries[0]!;
    for (const e of entries) {
      if (spotPrice(e.pool) < spotPrice(lo.pool)) lo = e;
      if (spotPrice(e.pool) > spotPrice(hi.pool)) hi = e;
    }
    const pLo = spotPrice(lo.pool);
    const pHi = spotPrice(hi.pool);
    if (pLo <= 0 || pHi / pLo - 1 < b.balancerMinGapPct) continue;

    // Move up to balancerLotUnits per trade until the gap narrows below the floor.
    while (goldBudget > 0 && trades < b.balancerMaxTradesPerDay) {
      const lot = Math.min(b.balancerLotUnits, Math.floor(lo.pool.resource * 0.1));
      if (lot < 1) break;
      // Buy from LO pool (removes resource, adds gold), sell into HI pool.
      const kLo = lo.pool.resource * lo.pool.gold;
      const costGold = Math.ceil(kLo / (lo.pool.resource - lot) - lo.pool.gold);
      if (costGold > goldBudget) break;
      lo.pool.resource -= lot;
      lo.pool.gold += costGold;
      const kHi = hi.pool.resource * hi.pool.gold;
      hi.pool.resource += lot;
      hi.pool.gold = Math.round(kHi / hi.pool.resource);
      goldBudget -= costGold;
      trades += 1;
      if (spotPrice(hi.pool) / spotPrice(lo.pool) - 1 < b.balancerMinGapPct) break;
    }
  }
}
