# 08 — From a living-world POI to a battle (the allocate wire)

A living-world fight is an ordinary battle on the wire. `tools/living-world/allocate_payload.mjs` builds the **v1
allocate request** from cf-overworld `docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md` §1 (the contract this engine
implements) for any POI. The function is pure: the same input gives the same bytes. Samples are in
`data/living-world/allocate.samples.json`:

- a wild lair on a ridge;
- a held harbour (live);
- a castle perch with a Form 3 Ascendant.

## 1. Canon fields, filled from living-world data

| Field | From |
|---|---|
| `seed` | 16 hex from `fnv1a(worldSeed, battleId)`, never a clock |
| `parcel.kind` | `WILD` (an unheld POI) or `PLAYER` (held) |
| `battlefield.structures` | The calibrated harness castle (`sim_harness.mjs`: keep 2,400 × tier, 8 walls, 2 gates, 2 towers; HP × threat × defence rating × the D6b calibration) placed in the canon **±161** frame: core at z = 114.8, attacker spawn at z = −131.6 |
| `battlefield.mobs` | WILD only: the archetype garrison (`ALPHA` + 4 `PACK`, …) |
| `sides.DEFENDER` | Held POIs only: the garrison as canon `UnitClass` units. 10 soldiers per garrison unit (the ⚙ D15 ratio); `SHIP` counts hulls |

## 2. One additive block: `livingWorld@1`

The canon schema has no field for these, so they ride in one versioned block. An engine that ignores it still runs a
correct canon battle.

- `poiId`, `lwKind`, `threat`
- `ground` → canon `hexTerrain` + `terrainMods` (`terrain-mods.json`, doc 02 §7c)
- `garrisonStats` (HP / damage from threat, leashed)
- `eventDeck`: up to 3 seeded draws from the archetype deck, **no repeats**, timed inside 1:00–10:00.
  `GUARDIAN_WAKE` uses `trigger: FIRST_CONTACT` (doc 04 §2b).
- `defence` (rating, cap 1.6), `floorSec` 720
- `guardian` (when stationed): form, NFT, owner, battle HP, `shieldsCore`, bombard, aura, Ascension window, Ward
  Stones, and when the stationing ends

**Proposal for the brief:** add `livingWorld` (optional, versioned) to §1. Until it's accepted, the engine reads it
opportunistically and CF can send it harmlessly.

## 3. What comes back: the result resolver (D36)

`tools/living-world/resolve_result.mjs` `resolveResult(world, alloc, callback)` turns the v1 result callback
(brief §2) into world updates. It's a pure function.

- **Idempotent on `battleId`.** A re-delivery changes nothing. A second result with a different `matchId` is a
  **409** (results are never silently overwritten).
- **Attacker wins:**
  - a holdable POI changes holder;
  - the defence spoils escrow pays the attacker (doc 03);
  - the Guardian escrow pays by outcome: KO or UNBOUND → all, OUTLASTED → half, the rest home (doc 04 §3);
  - a related attacker's share **burns** (doc 05 §3);
  - a barbarian camp clear starts the 48 h lull.
- **Defender wins:** holder and escrows stay; they settle on expiry.
- **HERO_IMPACT_MAX:** each officer's raw impact is clamped to **0.20** before it scales the clear reward (+0–20 %),
  per canon invariant 4.
- **Attacker losses** are priced at canon **`balance.json` v2** re-training cost (INFANTRY 0.02 CT, SIEGE 0.1 CT).
  This is informational; that CT was spent when the troops were trained.
- **Stories:** a feed item (if newsworthy) and a journal line for each side.
- **One proposed callback addition:** `livingWorld: { guardianOutcome: KO | UNBOUND | OUTLASTED | HELD }`. It's
  additive, like the request block in §2.

> ✅ **Scale finding (D36), fixed by D40:** canon `balance.json` was **re-scaled ÷100** (a line soldier is 0.02 CT; WALL module
> 0.4 CT). The living-world CT prices were (defences 6–15 CT, Guardian fees 20 / 120 CT, the D15 sheet's 2 CT/soldier from
> the stale doc-03 table) are on the **old scale**. D40 re-scaled them: defences anchored on the canon module costs, everything else ÷20, every ratio and split kept.

## 4. The event contract (D44)

`data/living-world/event-contract.json` tells an engine what each of the 22 events means. Every event has one **shape**:

| Shape | Meaning | Required fields |
|---|---|---|
| `SPAWN_WAVE` | A hostile band | `units` |
| `BOSS` | A champion appears, or a unit is empowered | one of `hpMul` / `dmgMul` / `hpBase` |
| `HAZARD` | An area effect on both sides | one of `moveMul` / `rangedMul` / `airMul` / `dmg` / `dps` / `slowSec` |
| `CONTEST` | Hold a spot to win it | `holdToClaimSec` |
| `ESCAPE` | Catch a runner | `escapeU` |
| `ESCORT` | A caravan crosses the map | none |
| `TRIGGER` | A state change, e.g. a Guardian wakes | none |
| `MARKET` | An overworld transaction | none |

Every event also has a **scope**: `BATTLE`, `OVERWORLD` or `BOTH`.

`tools/living-world/validate_events.mjs` checks every event against its shape:
- common fields;
- `who` in the enum;
- required and typed fields;
- no unknown fields, so typos are caught.

It also checks scope: battle decks and allocate payloads never carry an `OVERWORLD` event, and the world calendar never
carries a `BATTLE` one.

**Two fixes it forced:**
- `MERC_BIDDING` (an auction) could have been drawn into a mercenary post's battle deck. Decks now skip `OVERWORLD`
  events.
- `KRAKEN_SIGHTING` had no effect parameter, so an engine wouldn't have known what it does. It's now a telegraphed
  300-damage strike on each ship (⚙).

