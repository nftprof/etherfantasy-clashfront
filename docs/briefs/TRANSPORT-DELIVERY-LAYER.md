# Transport & delivery layer — the in-world logistics economy

> Owner directive 2026-07-17: "our own uber eats and rides system in game."
> Real-time delivery + transport: move goods between cities, fulfill market
> orders with deadlines + penalties, carry passengers, run bulk pet deliveries.
> Merchants pay their own food (gas), risk being attacked, and pay pass fees
> through occupied land — or fight through.
> Coherence contract: §C of `WORLD-BUILD-OUT-PLAN.md` — caravans REUSE the
> Army entity + movement phase; no parallel movement system.

## 1. The caravan — the vehicle

A caravan is an `Army` with `kind: 'CARAVAN'`:

```
Army {
  kind: 'CARAVAN',          // vs default 'MILITARY'
  units: [],                 // NO combat units — it's porters + wagons
  cargo: {                   // NEW field (engine container)
    food?: n, wood?: n, iron?: n, stone?: n, rareMetal?: n, fur?: n,
    gold?: n, arms?: {class: n}, pets?: {species: n},
  },
  cargoCapMax: n,            // wagons ⚙ (base 500 units of goods, upgradeable)
  provisions: { food },      // the "gas tank" — merchants pay their own food
  escortArmyId?: string,     // optional hired/own military escort travelling same path
}
```

- Moves on the existing parcel graph via phaseMovement (same code path as armies)
- Burns march rations per step (existing marchFoodPerStep — the "gas")
- Runs out of food mid-route → halts, cargo sits vulnerable, morale n/a (civilians)
- Speed: 1.25× military march (light wagons) on ROAD hexes, 1.0× otherwise
- **Zero combat value** — a caravan attacked without escort auto-surrenders

## 2. Transit rules — pass fees, bribes, or fight

phaseMovement extension: when a caravan's next hop enters occupied land —

| Ground | Rule |
|---|---|
| Own / allied land | Free passage |
| Unowned / SYSTEM wild, no garrison | Free passage |
| **Warlord-occupied** (another governor) | **PASS FEE** ⚙ — flat per-caravan toll set by the occupier (default 2% of cargo value, cap ⚙). Auto-paid from caravan gold if `autoPay` set; else caravan HALTS at border and owner is prompted. Fee routes through the landlord-tax splitter (occupier + landowner + burn share). |
| **Wild-occupied** (monster garrison) | **BRIBE** ⚙ — food/meat tribute (default 5% of carried food). Wild takes the bribe deterministically; no bribe = the lair's raid logic treats the caravan as prey. |
| **WAR-declared hostile** | No pass offered — caravan must route around or bring an escort and fight through. |

This REVERSES the military blockade rule deliberately: armies can never transit
foreign land; CARAVANS CAN — for a price. That's what makes them caravans.

## 3. The delivery order board — "uber eats"

A per-parcel ORDER BOARD (visible at any parcel with a market, browsable globally):

```
DeliveryOrder {
  id, createdTick,
  requesterGovernorId,
  destinationTerritoryId,
  wants: cargo-spec,            // e.g. { food: 5000 } or { pets: {Chulember: 5000} }
  rewardCt: n,                  // the delivery premium, escrowed at posting
  deadlineTick: n,
  penaltyPct: n,                // ⚙ slice of reward lost per grace window past deadline
  acceptedByGovernorId?,        // open until accepted; one courier at a time
  state: OPEN | ACCEPTED | IN_TRANSIT | DELIVERED | EXPIRED | FAILED
}
```

**Flow:**
1. Requester posts order → `rewardCt` escrowed (command-queue escrow pattern).
2. Any governor accepts → gets ⚙ `acceptWindowTicks` to get a loaded caravan moving toward the destination.
3. Caravan arrives with the goods before deadline → goods transfer to destination stockpile, courier receives reward minus ⚙ platform fee (burn share — net-sink).
4. **Late** → reward decays by `penaltyPct` per grace window; requester may cancel after ⚙ `hardExpiryTicks` (full refund minus posting fee).
5. **Courier fails** (caravan raided / abandoned) → order re-opens, courier loses a ⚙ reliability score notch (visible on their courier profile).

**Advanced orders (same schema, bigger numbers):**
- "Deliver 5,000 Chulember to Porthaven for 500 CT" — bulk pet livestock run (pets ride as cargo; they're commodity bodies, not NFTs)
- "Standing order: 1,000 food weekly" — recurring template (v2)

## 4. Rides — passenger transport

Same caravan chassis, passenger manifest instead of cargo:

```
RideOrder = DeliveryOrder but wants: { passengers: [officerId | petId] }
```

- Move a Master between cities without raising an army (EXILE'd Masters redeploying, or repositioning an overseer)
- Passenger rides inside; if the caravan is raided, the passenger is treated per lone-Master encounter rules (decision 14: OVERWHELM / DUEL / FLEE standing orders apply!)
- This makes unescorted VIP rides genuinely risky and escort contracts genuinely valuable

## 5. Raiding — caravans are prey

- A caravan on a hex with hostile military = auto-surrender (no battle): attacker takes ⚙ `caravanLootPct` (default 100%) of cargo, caravan disbands, courier fails the order
- With an ESCORT: normal battle spawns (escort army defends); cargo transfers only if escort loses
- Wild raids (F3) target caravans preferentially (rich prey heuristic in the raid AI)
- Raided cargo enters the raider's stockpile/army loot via the existing PILLAGE path
- **Insurance** (v2 ⚙): optional premium at posting; platform refunds cargo value on verified raid — funded from platform fees

## 6. Real-time delivery on the server

- Caravan positions tick with the world (same cadence as armies — no separate scheduler)
- Delivery board = new WS events: `order_posted`, `order_accepted`, `order_delivered`, `order_late`, `caravan_raided` (fog rules: order board is public; caravan positions are fogged like armies)
- Client: ORDERS panel (browse/post/accept), caravan markers on the overworld (wagon icon), delivery countdown chips

## 7. Fees + sinks (net-sink doctrine compliance)

| Flow | Split |
|---|---|
| Delivery reward | courier gets ⚙ 90%, platform fee 10% (burn ⚙ half, vault half) |
| Pass fee | occupier 60% / landowner 30% (landlord tax analogue) / burn 10% |
| Bribe | consumed by the wild (removed from economy — pure sink) |
| Posting fee | flat ⚙ 0.1 CT — burn (spam guard) |
| Late penalty | returns to requester (compensation, not a sink) |

## 8. Build order (wave 3 of WORLD-BUILD-OUT-PLAN)

1. `Army.kind + cargo` fields + serialization + caravan raise API
2. Transit fee gate in phaseMovement (pass/bribe/halt)
3. DeliveryOrder state + board API (post/accept/cancel) + escrow
4. Delivery settlement in the tick (arrival detection → transfer + payout)
5. Auto-surrender raiding + escort battles
6. Rides (passenger manifest) + lone-Master encounter integration
7. WS events + client ORDERS panel + caravan markers
8. v2: recurring orders, insurance, courier reliability score
