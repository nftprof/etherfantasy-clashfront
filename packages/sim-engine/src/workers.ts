/**
 * Worker pets + stockpile production — WORLD-BUILD-OUT-PLAN wave 1
 * (owner 2026-07-17). Pets are commodity BODIES deployed on parcels with a
 * role (MINE / FARM / CRAFT / GUARD); production accrues per tick with
 * integer carries (same pattern as food). Materials are MAP-based
 * (territory stockpile); gold mines pay the territory treasury in ct_units.
 *
 * Coherence: reuses the DemoOfficer assignment pattern; production runs
 * inside phaseProduction (canonical phase order untouched); fur classes come
 * from docs/populace-pet-spec/pets-aptitudes.csv species data.
 */
import { type Balance, TICKS_PER_DAY, newId, type Rng } from '@clashfront/shared';
import type { HexTerrain } from '@clashfront/shared';
import { emptyStockpile, sortedIds, type Stockpile, type WorkerPet, type WorkerRole, type WorldState } from './state';

/** Get (or lazily create) a territory's stockpile. */
export function stockpileOf(state: WorldState, territoryId: string): Stockpile {
  state.stockpiles ??= new Map();
  let s = state.stockpiles.get(territoryId);
  if (s === undefined) {
    s = emptyStockpile();
    state.stockpiles.set(territoryId, s);
  }
  return s;
}

/**
 * Species element → biome-affinity check. A worker on matching ground
 * produces × (1 + ⚙ affinityBonus). Mapping follows the Stone/Tide/Ember/
 * Wild domain feel (data/pet-domains.json).
 */
export function biomeMatches(element: string, terrain: HexTerrain): boolean {
  switch (element) {
    case 'Fire': case 'Dragon': return terrain === 'MOUNTAIN'; // volcanic proxy (MVP terrain set)
    case 'Water': case 'Ice': return terrain === 'COAST' || terrain === 'RIVER' || terrain === 'OCEAN';
    case 'Leaf': case 'Insect': return terrain === 'FOREST';
    case 'Earth': case 'Iron': case 'Rock': return terrain === 'MOUNTAIN' || terrain === 'HILLS';
    default: return false; // Neutral/Combat/Phantom/etc: no terrain affinity (MVP)
  }
}

/** Fur shed per day for a species fur class (⚙ workers.fur*PerDay). */
export function furPerDay(furClass: string, balance: Balance): number {
  switch (furClass) {
    case 'WARM': return balance.workers.furWarmPerDay;
    case 'LEAF': return balance.workers.furLeafPerDay;
    case 'PHANTOM': return balance.workers.furPhantomPerDay;
    default: return 0;
  }
}

/**
 * Assign (deploy) a worker pet to a territory. Governor must govern the
 * territory; per-territory worker cap ⚙ enforced. Returns the new worker.
 */
export function assignWorkerPet(
  state: WorldState,
  governorId: string,
  territoryId: string,
  species: string,
  element: string,
  furClass: string,
  role: WorkerRole,
  rng: Rng,
  balance: Balance,
): WorkerPet {
  const terr = state.territories.get(territoryId);
  if (terr === undefined) throw new Error(`assignWorkerPet: no such territory ${territoryId}`);
  if (terr.governorId !== governorId) throw new Error('assignWorkerPet: not your territory');
  const existing = [...(state.workerPets?.values() ?? [])].filter((w) => w.assignedTerritoryId === territoryId);
  if (existing.length >= balance.workers.maxWorkersPerTerritory) {
    throw new Error('assignWorkerPet: territory worker cap reached');
  }
  const pet: WorkerPet = {
    id: newId('pet', { time: state.world.tick, random: () => rng.next() }),
    ownerGovernorId: governorId,
    species,
    element,
    furClass,
    assignedTerritoryId: territoryId,
    role,
    assignedTick: state.world.tick,
  };
  state.workerPets ??= new Map();
  state.workerPets.set(pet.id, pet);
  return pet;
}

/** Recall (undeploy) a worker pet — it walks home (never lost, decision 7). */
export function recallWorkerPet(state: WorldState, governorId: string, petId: string): void {
  const pet = state.workerPets?.get(petId);
  if (pet === undefined) throw new Error(`recallWorkerPet: no such worker ${petId}`);
  if (pet.ownerGovernorId !== governorId) throw new Error('recallWorkerPet: not your pet');
  state.workerPets!.delete(petId);
}

/** All workers on a territory (deterministic order). */
export function workersAt(state: WorldState, territoryId: string): WorkerPet[] {
  const out: WorkerPet[] = [];
  for (const id of sortedIds(state.workerPets ?? new Map())) {
    const w = state.workerPets!.get(id)!;
    if (w.assignedTerritoryId === territoryId) out.push(w);
  }
  return out;
}

/** Total GUARD strength on a territory (raid defense contribution). */
export function guardStrengthAt(state: WorldState, territoryId: string, balance: Balance): number {
  return workersAt(state, territoryId).filter((w) => w.role === 'GUARD').length * balance.workers.guardStrength;
}

/** Add to a fractional per-day carry; returns whole units to bank this tick. */
function accrue(
  state: WorldState,
  territoryId: string,
  key: string,
  perDayTimes100: number,
): number {
  state.stockpileCarry ??= new Map();
  let carries = state.stockpileCarry.get(territoryId);
  if (carries === undefined) {
    carries = {};
    state.stockpileCarry.set(territoryId, carries);
  }
  // Carry is in per-day units × 100 (two decimal places of precision, integer math).
  const carry = (carries[key] ?? 0) + perDayTimes100;
  const perTickDen = TICKS_PER_DAY * 100;
  const whole = Math.floor(carry / perTickDen);
  carries[key] = carry % perTickDen;
  return whole;
}

/**
 * Worker production — runs once per tick inside phaseProduction (after the
 * territory loops). Deterministic: workers iterate in sorted-id order;
 * all accrual is integer math with carries.
 */
export function runWorkerProduction(state: WorldState, balance: Balance): void {
  if (state.workerPets === undefined || state.workerPets.size === 0) return;
  const w = balance.workers;
  for (const id of sortedIds(state.workerPets)) {
    const pet = state.workerPets.get(id)!;
    const terr = state.territories.get(pet.assignedTerritoryId);
    if (terr === undefined) continue;
    // Territory changed hands → pet walks home (canonical: never lost, auto-return).
    if (terr.governorId !== pet.ownerGovernorId) {
      state.workerPets.delete(id);
      continue;
    }
    const hex = state.hexes.get(terr.hexIds[0] ?? '');
    const affinity = hex !== undefined && biomeMatches(pet.element, hex.terrain) ? 1 + w.affinityBonus : 1;
    const stock = stockpileOf(state, terr.id);
    const tid = terr.id;

    // Fur sheds regardless of role.
    stock.fur += accrue(state, tid, `fur:${id}`, Math.round(furPerDay(pet.furClass, balance) * affinity * 100));

    switch (pet.role) {
      case 'MINE': {
        // Gold pays the territory treasury (ct_units — redistribution target for the ECON trickle).
        terr.ctTreasury += accrue(state, tid, `gold:${id}`, Math.round(w.mineGoldPerDay * affinity * 100));
        stock.wood += accrue(state, tid, `wood:${id}`, Math.round(w.mineWoodPerDay * affinity * 100));
        stock.iron += accrue(state, tid, `iron:${id}`, Math.round(w.mineIronPerDay * affinity * 100));
        stock.stone += accrue(state, tid, `stone:${id}`, Math.round(w.mineStonePerDay * affinity * 100));
        stock.rareMetal += accrue(state, tid, `rareMetal:${id}`, Math.round(w.mineRareMetalPerDay * affinity * 100));
        break;
      }
      case 'FARM': {
        terr.foodStock += accrue(state, tid, `farmFood:${id}`, Math.round(w.farmFoodPerDay * affinity * 100));
        break;
      }
      case 'CRAFT': {
        // Workshop gate: MILITARY development ≥ ⚙ workshopMinMil.
        if (terr.development.MILITARY < w.workshopMinMil) break;
        const armsWhole = accrue(state, tid, `arms:${id}`, Math.round(w.craftArmsPerDay * affinity * 100));
        if (armsWhole > 0) {
          // Each arm consumes materials: 2 iron + 1 wood + 1 fur (⚙ simple v1 recipe).
          let made = 0;
          for (let i = 0; i < armsWhole; i++) {
            if (stock.iron >= 2 && stock.wood >= 1 && stock.fur >= 1) {
              stock.iron -= 2; stock.wood -= 1; stock.fur -= 1;
              made += 1;
            } else break;
          }
          if (made > 0) stock.arms['ELITE'] = (stock.arms['ELITE'] ?? 0) + made;
        }
        break;
      }
      case 'GUARD':
        break; // passive — guardStrengthAt() reads it at raid time
    }
  }
}
