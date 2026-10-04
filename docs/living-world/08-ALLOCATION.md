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

## 3. What comes back

The **result callback** (brief §2) needs nothing new.

- **Casualties per `UnitClass`:** feed the attacker's unit-loss price (doc 03, `reports/BALANCE-SHEET.md`).
- **`structures[].destroyed`:** decides the doc-03 spoils escrow.
- **Guardian:** a KO, unbind or tire is read from the officer/mob outcome and settles the doc-04 bounty.
- **The whole outcome** becomes a region-feed item (doc 05 §5).
