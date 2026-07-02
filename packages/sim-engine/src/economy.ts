/**
 * The circular war economy — Feature Set 3 E1/E5 (docs/briefs/FEATURESET-3-ECONOMY.md).
 *
 * ONE primitive routes every wallet→world spend: `spendCT`. The caller debits
 * the wallet (each order already does); spendCT decides where the debited CT
 * GOES — before this module it simply vanished. Buckets (⚙ balance.economy):
 *
 *   LOOT      → treasuries of towns/wild parcels within lootRadiusSteps of the
 *               spend parcel, inverse-distance weighted (warzone gold rushes);
 *               no eligible target ⇒ the share burns.
 *   LANDYIELD → enrichment pools (E3) of the spend parcel (landYieldSelfPct)
 *               + its ring-1 neighbors (remainder, equal split).
 *   LORDS     → lordsLandlordShare escrowed in unclaimedLordYield (no NFT
 *               landlords yet — future settlement) + lordsSeatShare to the
 *               richest TOWN treasury in radius (seat proxy; none ⇒ burn).
 *   BURN      → destroyed; world CT supply shrinks.
 *   TREASURY  → the system:treasury account (dev/protocol).
 *
 * INVARIANTS: buckets sum EXACTLY to the amount (integer math, remainder to
 * BURN); in-world actions never mint (only marked faucets mint — join grants,
 * NPC seed, genesis treasuries, raze salvage); every flow is journaled.
 *
 * SETTLEMENT JOURNAL (product-owner addition 2026-07-02): CT is a live Pentagon
 * Chain token and spends/rewards will settle through an on-chain game vault
 * (PlayEscrow pattern, backend as operator). The in-game splitter stays the
 * real-time simulation layer, but every flow appends to an append-only,
 * checksum-chained `settlementJournal` (monotonic seq, serialized in
 * snapshots) that the future chain-settlement worker replays:
 *   DEPOSIT — a mint (faucet) landing in a wallet or a territory treasury;
 *   SPEND   — a spendCT call, with its exact integer splits;
 *   REWARD  — a wallet credit (pillage loot, occupy seize, enrich/ECON yield,
 *             raze salvage). Recurring yields are BATCHED per governor every
 *             ⚙ journalYieldBatchTicks to avoid journal spam — the pending
 *             (accrued-but-unflushed) records live in economy.pendingYield and
 *             count toward journal completeness (see replayJournal).
 *   BURN    — a burn outside a SPEND split (raze destruction);
 *   WITHDRAW — reserved for the future chain worker (never emitted here).
 *
 * Determinism: pure integer math over sorted iteration; no randomness, no
 * wall clock (journal `tick` is world time).
 */
import { type Balance, loadBalance } from '@clashfront/shared';
import type { Territory } from '@clashfront/shared';
import { sortedIds, type WorldState } from './state';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SettlementKind = 'SPEND' | 'REWARD' | 'BURN' | 'DEPOSIT' | 'WITHDRAW';

/** Where a REWARD/BURN drew from — drives exact journal replay (E5). */
export type FlowSource = 'territory_treasury' | 'enrichment_pool' | 'mint';

/** Where a DEPOSIT (mint) landed. */
export type DepositDestination = 'wallet' | 'territory_treasury';

/** Exact integer split of one spendCT call — fields sum to amountCtUnits. */
export interface SpendSplits {
  /** Actually credited to town/wild-parcel treasuries (0 when none in range). */
  loot: number;
  /** Actually credited to enrichment pools. */
  landYield: number;
  /** Total lords flow = lordsEscrow + the seat share routed to a town treasury. */
  lords: number;
  /** Portion of `lords` escrowed in unclaimedLordYield (landlord settlement). */
  lordsEscrow: number;
  /** Burned, including no-eligible-target fallbacks. */
  burn: number;
  /** system:treasury. */
  treasury: number;
}

export interface SettlementRecord {
  seq: number;
  tick: number;
  kind: SettlementKind;
  governorId: string;
  amountCtUnits: number;
  reason: string;
  /** SPEND only. */
  splits?: SpendSplits;
  /** REWARD/BURN only. */
  source?: FlowSource;
  /** DEPOSIT only. */
  destination?: DepositDestination;
}

/** One credited LOOT flow (heatmap telemetry, pruned to ⚙ lootWindowTicks). */
export interface LootInflowRecord {
  tick: number;
  territoryId: string;
  amountCtUnits: number;
}

/** Accrued-but-unjournaled yield credit (already applied to state). */
export interface PendingYieldRecord {
  governorId: string;
  reason: string;
  source: FlowSource;
  amountCtUnits: number;
}

/** Economy container on WorldState — plain JSON (snapshot/serialization-safe). */
export interface EconomyState {
  /** Cumulative faucet volume, ct_units (genesis + join grants + NPC seed + salvage mints). */
  mintedTotal: number;
  /** Cumulative destroyed CT, ct_units. */
  burnedTotal: number;
  /** system:treasury balance, ct_units (dev/protocol account — accumulates). */
  treasuryTotal: number;
  /** LORDS landlord escrow, ct_units — held for future NFT-landlord settlement. */
  unclaimedLordYield: number;
  /** Cumulative flow per reason: spend reasons + `mint:<reason>` faucets. */
  flowsByReason: Record<string, number>;
  /** Append-only settlement journal (monotonic seq, checksum-chained). */
  settlementJournal: SettlementRecord[];
  /** Running FNV-1a chain over the journal (hex) — export integrity check. */
  journalChecksum: string;
  /** LOOT-bucket inflows within the last ⚙ lootWindowTicks (heatmap telemetry). */
  recentLoot: LootInflowRecord[];
  /** Yield credits applied to state but not yet flushed into the journal. */
  pendingYield: PendingYieldRecord[];
}

// ── Container plumbing ────────────────────────────────────────────────────────

export function ensureEconomy(state: WorldState): EconomyState {
  state.economy ??= {
    mintedTotal: 0,
    burnedTotal: 0,
    treasuryTotal: 0,
    unclaimedLordYield: 0,
    flowsByReason: {},
    settlementJournal: [],
    journalChecksum: fnv1a('genesis'),
    recentLoot: [],
    pendingYield: [],
  };
  return state.economy;
}

/** 32-bit FNV-1a over a string, hex — dependency-free deterministic checksum. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Append a journal record: assigns the next seq and advances the checksum chain. */
function appendJournal(eco: EconomyState, record: Omit<SettlementRecord, 'seq'>): SettlementRecord {
  const seq = (eco.settlementJournal[eco.settlementJournal.length - 1]?.seq ?? -1) + 1;
  const full: SettlementRecord = { seq, ...record };
  eco.settlementJournal.push(full);
  eco.journalChecksum = fnv1a(`${eco.journalChecksum}|${JSON.stringify(full)}`);
  return full;
}

function addFlow(eco: EconomyState, reason: string, amount: number): void {
  eco.flowsByReason[reason] = (eco.flowsByReason[reason] ?? 0) + amount;
}

// ── Faucets (E5: every mint is explicit + journaled) ──────────────────────────

/**
 * Record a mint. The caller applies the credit itself (wallet set / treasury
 * seeded); this books mintedTotal + the DEPOSIT journal entry. Reasons in use:
 * 'genesis_treasuries', 'join_grant', 'npc_seed', 'raze_salvage' (via burnCT/
 * creditWallet with source 'mint').
 */
export function recordMint(
  state: WorldState,
  governorId: string,
  amountCtUnits: number,
  reason: string,
  destination: DepositDestination,
): void {
  if (amountCtUnits <= 0) return;
  const eco = ensureEconomy(state);
  eco.mintedTotal += amountCtUnits;
  addFlow(eco, `mint:${reason}`, amountCtUnits);
  appendJournal(eco, { tick: state.world.tick, kind: 'DEPOSIT', governorId, amountCtUnits, reason, destination });
}

/**
 * Credit a governor wallet and journal the REWARD. `source` names the bucket
 * the CT left (exact-replay bookkeeping): 'territory_treasury' /
 * 'enrichment_pool' are pure redistribution (the caller debits that bucket);
 * 'mint' marks a faucet (mintedTotal is booked here).
 * `batch: true` defers the journal record into pendingYield (flushed every
 * ⚙ journalYieldBatchTicks — use for per-tick yields).
 */
export function creditWallet(
  state: WorldState,
  governorId: string,
  amountCtUnits: number,
  reason: string,
  source: FlowSource,
  opts: { batch?: boolean } = {},
): void {
  if (amountCtUnits <= 0) return;
  const eco = ensureEconomy(state);
  state.ctBalances ??= new Map();
  state.ctBalances.set(governorId, (state.ctBalances.get(governorId) ?? 0) + amountCtUnits);
  if (source === 'mint') {
    eco.mintedTotal += amountCtUnits;
    addFlow(eco, `mint:${reason}`, amountCtUnits);
  }
  if (opts.batch === true) {
    const pending = eco.pendingYield.find(
      (p) => p.governorId === governorId && p.reason === reason && p.source === source,
    );
    if (pending !== undefined) pending.amountCtUnits += amountCtUnits;
    else eco.pendingYield.push({ governorId, reason, source, amountCtUnits });
    return;
  }
  appendJournal(eco, { tick: state.world.tick, kind: 'REWARD', governorId, amountCtUnits, reason, source });
}

/** Burn CT outside a SPEND split (raze destruction). source 'mint' books the mint too (mint-and-burn). */
export function burnCT(
  state: WorldState,
  governorId: string,
  amountCtUnits: number,
  reason: string,
  source: FlowSource,
): void {
  if (amountCtUnits <= 0) return;
  const eco = ensureEconomy(state);
  eco.burnedTotal += amountCtUnits;
  if (source === 'mint') {
    eco.mintedTotal += amountCtUnits;
    addFlow(eco, `mint:${reason}`, amountCtUnits);
  }
  appendJournal(eco, { tick: state.world.tick, kind: 'BURN', governorId, amountCtUnits, reason, source });
}

/**
 * Flush batched yield credits into the journal (one REWARD per governor ×
 * reason × source, deterministic order). Called from the PRODUCTION phase
 * every ⚙ journalYieldBatchTicks.
 */
export function flushYieldJournal(state: WorldState, tick: number): void {
  const eco = state.economy;
  if (eco === undefined || eco.pendingYield.length === 0) return;
  const pending = [...eco.pendingYield].sort(
    (a, b) =>
      (a.governorId < b.governorId ? -1 : a.governorId > b.governorId ? 1 : 0) ||
      (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0) ||
      (a.source < b.source ? -1 : 1),
  );
  eco.pendingYield = [];
  for (const p of pending) {
    appendJournal(eco, {
      tick,
      kind: 'REWARD',
      governorId: p.governorId,
      amountCtUnits: p.amountCtUnits,
      reason: p.reason,
      source: p.source,
    });
  }
}

// ── The flow splitter (E1) ────────────────────────────────────────────────────

/** BFS steps from `fromHex` out to `radius` over the parcel graph (fromHex = 0). */
function stepsWithin(state: WorldState, fromHex: string, radius: number): Map<string, number> {
  const steps = new Map<string, number>([[fromHex, 0]]);
  let frontier = [fromHex];
  for (let d = 1; d <= radius && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const h of frontier) {
      for (const n of state.adjacency?.get(h) ?? []) {
        if (steps.has(n)) continue;
        steps.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return steps;
}

function territoryAt(state: WorldState, hexId: string): Territory | undefined {
  const terrId = state.hexes.get(hexId)?.territoryId;
  return terrId === undefined ? undefined : state.territories.get(terrId);
}

/** A LOOT-eligible target: neutral ground that armies fight over. */
function lootEligible(t: Territory): boolean {
  return t.zoneType === 'TOWN' || t.governorKind === 'SYSTEM';
}

/**
 * Route `amountCtUnits` of already-debited wallet CT into the world buckets
 * (see module header). The caller MUST have debited the governor's wallet for
 * exactly this amount. Returns the exact integer splits (sum === amount).
 *
 * @param spendHexId hex of the parcel the spend "happens on" (home territory
 *                   for raise/develop, the army's hex for provisioning, the
 *                   claimed parcel for claims).
 */
export function spendCT(
  state: WorldState,
  governorId: string,
  amountCtUnits: number,
  spendHexId: string,
  reason: string,
  balance: Balance = loadBalance(),
): SpendSplits {
  if (!Number.isInteger(amountCtUnits) || amountCtUnits < 0) {
    throw new Error(`spendCT: amount must be a non-negative integer (got ${String(amountCtUnits)})`);
  }
  const eco = ensureEconomy(state);
  const e = balance.economy;
  const tick = state.world.tick;

  // Integer bucket split — floors, remainder to BURN (invariant: sums exactly).
  const lootShare = Math.floor(amountCtUnits * e.lootShare);
  const landYieldShare = Math.floor(amountCtUnits * e.landYieldShare);
  const lordsLandlord = Math.floor(amountCtUnits * e.lordsLandlordShare);
  const lordsSeat = Math.floor(amountCtUnits * e.lordsSeatShare);
  const treasury = Math.floor(amountCtUnits * e.treasuryShare);
  let burn = amountCtUnits - lootShare - landYieldShare - lordsLandlord - lordsSeat - treasury;
  if (burn < 0) throw new Error(`spendCT: bucket shares exceed the amount (${amountCtUnits})`);

  const ring = stepsWithin(state, spendHexId, e.lootRadiusSteps);

  // LOOT — inverse-distance weighted across town/wild treasuries in radius.
  let loot = 0;
  if (lootShare > 0) {
    const candidates: { terr: Territory; steps: number }[] = [];
    const seen = new Set<string>();
    for (const hexId of [...ring.keys()].sort()) {
      const t = territoryAt(state, hexId);
      if (t === undefined || seen.has(t.id) || !lootEligible(t)) continue;
      seen.add(t.id);
      candidates.push({ terr: t, steps: ring.get(hexId)! });
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.steps - b.steps || (a.terr.id < b.terr.id ? -1 : 1));
      const weights = candidates.map((c) => 1 / (1 + c.steps));
      const totalW = weights.reduce((s, w) => s + w, 0);
      // Proportional floors; the CLOSEST candidate takes the exact remainder so
      // the credited total equals lootShare to the unit (integer-money invariant).
      const alloc = candidates.map((_, i) => Math.floor((lootShare * weights[i]!) / totalW));
      const leftover = lootShare - alloc.reduce((s, a) => s + a, 0);
      if (leftover < 0) throw new Error('spendCT: loot allocation overflow');
      alloc[0]! += leftover;
      for (let i = 0; i < candidates.length; i++) {
        const a = alloc[i]!;
        if (a === 0) continue;
        const terr = candidates[i]!.terr;
        terr.ctTreasury += a;
        terr.version += 1;
        eco.recentLoot.push({ tick, territoryId: terr.id, amountCtUnits: a });
      }
      loot = lootShare;
    } else {
      burn += lootShare; // no towns/wilds in blast radius — the gold rush fizzles
    }
    // prune the heatmap window
    const cutoff = tick - e.lootWindowTicks;
    if (eco.recentLoot.length > 0 && eco.recentLoot[0]!.tick < cutoff) {
      eco.recentLoot = eco.recentLoot.filter((r) => r.tick >= cutoff);
    }
  }

  // LANDYIELD — enrichment pools: spend parcel (⚙ landYieldSelfPct) + ring-1 rest.
  let landYield = 0;
  if (landYieldShare > 0) {
    const selfTerr = territoryAt(state, spendHexId);
    if (selfTerr === undefined) {
      burn += landYieldShare; // unassigned filler hex — nothing to enrich
    } else {
      state.enrichmentPools ??= new Map();
      const neighborTerrs: Territory[] = [];
      const seen = new Set<string>([selfTerr.id]);
      for (const n of state.adjacency?.get(spendHexId) ?? []) {
        const t = territoryAt(state, n);
        if (t === undefined || seen.has(t.id)) continue;
        seen.add(t.id);
        neighborTerrs.push(t);
      }
      neighborTerrs.sort((a, b) => (a.id < b.id ? -1 : 1));
      let selfAmt: number;
      if (neighborTerrs.length === 0) {
        selfAmt = landYieldShare;
      } else {
        selfAmt = Math.floor(landYieldShare * e.landYieldSelfPct);
        const rest = landYieldShare - selfAmt;
        const per = Math.floor(rest / neighborTerrs.length);
        const rem = rest - per * neighborTerrs.length;
        for (let i = 0; i < neighborTerrs.length; i++) {
          const amt = per + (i < rem ? 1 : 0);
          if (amt === 0) continue;
          const id = neighborTerrs[i]!.id;
          state.enrichmentPools.set(id, (state.enrichmentPools.get(id) ?? 0) + amt);
        }
      }
      if (selfAmt > 0) {
        state.enrichmentPools.set(selfTerr.id, (state.enrichmentPools.get(selfTerr.id) ?? 0) + selfAmt);
      }
      landYield = landYieldShare;
    }
  }

  // LORDS — landlord share escrows for future NFT-landlord settlement;
  // seat share goes to the richest TOWN treasury in radius (seat proxy).
  eco.unclaimedLordYield += lordsLandlord;
  let seatRouted = 0;
  if (lordsSeat > 0) {
    let seatTown: Territory | undefined;
    for (const hexId of [...ring.keys()].sort()) {
      const t = territoryAt(state, hexId);
      if (t === undefined || t.zoneType !== 'TOWN') continue;
      if (seatTown === undefined || t.ctTreasury > seatTown.ctTreasury || (t.ctTreasury === seatTown.ctTreasury && t.id < seatTown.id)) {
        seatTown = t;
      }
    }
    if (seatTown !== undefined) {
      seatTown.ctTreasury += lordsSeat;
      seatTown.version += 1;
      seatRouted = lordsSeat;
    } else {
      burn += lordsSeat; // no seat to pay — the share burns
    }
  }

  eco.treasuryTotal += treasury;
  eco.burnedTotal += burn;
  addFlow(eco, reason, amountCtUnits);

  const splits: SpendSplits = {
    loot,
    landYield,
    lords: lordsLandlord + seatRouted,
    lordsEscrow: lordsLandlord,
    burn,
    treasury,
  };
  appendJournal(eco, { tick, kind: 'SPEND', governorId, amountCtUnits, reason, splits });
  return splits;
}

// ── Enrichment (E3): money → contestable yield ────────────────────────────────

/**
 * E3 — enrich a territory YOU GOVERN: CT converts (through the splitter — yes,
 * enriching also leaks to loot/lords/burn; its LANDYIELD share is what seeds
 * the pools, ⚙ landYieldSelfPct on this parcel + the rest on ring-1) into
 * enrichment pools that pay ⚙ enrichYieldPctPerDay to the parcel's CURRENT
 * governor. The pool is attached to LAND, not the payer: conquer the parcel,
 * inherit the pool; PILLAGE loots ⚙ enrichLootPct of it. Whale money becomes
 * everyone's incentive to invade.
 *
 * Throws (without mutating) on wild land, bad amounts, or insufficient CT.
 * Governor-of-the-parcel authorization is enforced HERE (the payer is the
 * governor); the server maps the session to the governor.
 */
export function enrichTerritory(
  state: WorldState,
  territoryId: string,
  amountCtUnits: number,
  balance: Balance = loadBalance(),
): { splits: SpendSplits; poolCtUnits: number } {
  const t = state.territories.get(territoryId);
  if (t === undefined) throw new Error(`enrichTerritory: unknown territory ${territoryId}`);
  if (t.governorKind === 'SYSTEM') throw new Error(`enrichTerritory: ${t.name} is ungoverned wilds`);
  if (!Number.isInteger(amountCtUnits) || amountCtUnits <= 0) {
    throw new Error(`enrichTerritory: amount must be a positive integer (got ${String(amountCtUnits)})`);
  }
  const gov = t.governorId;
  const wallet = state.ctBalances?.get(gov);
  if (wallet === undefined) throw new Error(`enrichTerritory: governor ${gov} has no CT wallet`);
  if (wallet < amountCtUnits) {
    throw new Error(`enrichTerritory: insufficient CT (${wallet} < ${amountCtUnits} ct_units)`);
  }
  state.ctBalances!.set(gov, wallet - amountCtUnits);
  const splits = spendCT(state, gov, amountCtUnits, t.hexIds[0]!, 'enrich', balance);
  t.version += 1;
  return { splits, poolCtUnits: state.enrichmentPools?.get(territoryId) ?? 0 };
}

// ── Journal replay (E5: settlement completeness) ──────────────────────────────

/** Aggregate supply components — the conservation identity's left-hand side. */
export interface SupplyComponents {
  wallets: number;
  territoryTreasuries: number;
  enrichmentPools: number;
  burnedTotal: number;
  treasuryTotal: number;
  unclaimedLordYield: number;
  mintedTotal: number;
}

/** Read the CURRENT supply components straight off the world state. */
export function supplyComponents(state: WorldState): SupplyComponents {
  const eco = ensureEconomy(state);
  let wallets = 0;
  for (const v of (state.ctBalances ?? new Map<string, number>()).values()) wallets += v;
  let territoryTreasuries = 0;
  for (const t of state.territories.values()) territoryTreasuries += t.ctTreasury;
  let enrichmentPools = 0;
  for (const v of (state.enrichmentPools ?? new Map<string, number>()).values()) enrichmentPools += v;
  return {
    wallets,
    territoryTreasuries,
    enrichmentPools,
    burnedTotal: eco.burnedTotal,
    treasuryTotal: eco.treasuryTotal,
    unclaimedLordYield: eco.unclaimedLordYield,
    mintedTotal: eco.mintedTotal,
  };
}

/**
 * Replay the settlement journal (plus the pending unflushed yield accruals)
 * from genesis into aggregate supply components. Journal completeness IS the
 * settlement guarantee: the result must equal supplyComponents(state) exactly
 * (the E5 conservation suite asserts this).
 */
export function replayJournal(
  journal: readonly SettlementRecord[],
  pendingYield: readonly PendingYieldRecord[] = [],
): SupplyComponents {
  const c: SupplyComponents = {
    wallets: 0,
    territoryTreasuries: 0,
    enrichmentPools: 0,
    burnedTotal: 0,
    treasuryTotal: 0,
    unclaimedLordYield: 0,
    mintedTotal: 0,
  };
  const applyReward = (amount: number, source: FlowSource | undefined): void => {
    c.wallets += amount;
    if (source === 'territory_treasury') c.territoryTreasuries -= amount;
    else if (source === 'enrichment_pool') c.enrichmentPools -= amount;
    else if (source === 'mint') c.mintedTotal += amount;
    else throw new Error('replayJournal: REWARD without a source');
  };
  for (const r of journal) {
    switch (r.kind) {
      case 'DEPOSIT':
        c.mintedTotal += r.amountCtUnits;
        if (r.destination === 'territory_treasury') c.territoryTreasuries += r.amountCtUnits;
        else c.wallets += r.amountCtUnits;
        break;
      case 'SPEND': {
        const s = r.splits;
        if (s === undefined) throw new Error(`replayJournal: SPEND ${r.seq} without splits`);
        c.wallets -= r.amountCtUnits;
        c.territoryTreasuries += s.loot + (s.lords - s.lordsEscrow);
        c.enrichmentPools += s.landYield;
        c.unclaimedLordYield += s.lordsEscrow;
        c.burnedTotal += s.burn;
        c.treasuryTotal += s.treasury;
        break;
      }
      case 'REWARD':
        applyReward(r.amountCtUnits, r.source);
        break;
      case 'BURN':
        c.burnedTotal += r.amountCtUnits;
        if (r.source === 'mint') c.mintedTotal += r.amountCtUnits;
        break;
      case 'WITHDRAW':
        c.wallets -= r.amountCtUnits;
        break;
    }
  }
  for (const p of pendingYield) applyReward(p.amountCtUnits, p.source);
  return c;
}
