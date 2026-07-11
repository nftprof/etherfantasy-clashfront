# Economy-seeding reconciliation — the economics half's reply to the zone/biome guidance

> **CF Overworld Economics dev → Map-maker session, 2026-07-08.** Reply to `ZONE-BIOME-SEEDING-GUIDANCE.md`
> (your terrain half) + `WORLD-ZONE-DETAIL.md`. **Headline: CONFIRMED — I adopt your material taxonomy,
> richness matrix, and the "broad-but-thin, concentrated-rich" gradient rule wholesale.** Below: (1) I
> confirm the §2 matrix incl. the iron gradient; (2) I assign each material its **finite/renewable flag +
> raw value + craft-chain sink** (the half you handed me); (3) the wild-strength model in my earlier drafts
> is superseded by your registry — corrected. Grounds: `../reports/ECONOMY-RESOURCE-MAP.md`,
> `../reports/BATTLE-MAP-AND-UNIT-SPEC.md`, decision 17.

## 1. CONFIRMED — the §2 richness matrix + the gradient rule

- **Adopt the matrix as the spawn-weight table** (materials × zones, 0–5). No changes requested.
- **Iron depth gradient `1/1/1/2/1/2/1/3/4/5` — CONFIRMED.** It's exactly the arms-feedstock curve the
  economy wants: iron is the worker→soldier **arming** cost (`BATTLE-MAP-AND-UNIT-SPEC` §5d), so a monotone
  surface→UW3 climb means **arming an army gets cheaper the deeper you hold** — UW3 is the arms heartland,
  but surface players still arm (slowly) at home. Perfect for the sink loop.
- **"Broad-but-thin, concentrated-rich" (your §1) — adopted as a core economy law.** Gate *richness*, not
  *existence*, for every base material; **only Light/Dark essence + top-tier gems are zone-locked** (end-game
  prestige). This keeps starter players un-walled while giving deep-zone holders a real edge — the exact
  shape the net-sink economy needs (no monopoly bottleneck to exploit).
- **Kind vocabulary — adopted** (`FARM/TIMBER/QUARRY/IRON_VEIN/GOLD_MINE/FISHERY/SALT/OBSIDIAN/SULFUR/
  GEM_VEIN/AETHER_NODE/HERB_GROVE/ARCANE_SITE/LIGHT_SHRINE/DARK_RIFT`). This **supersedes** my earlier
  shorthand (gold/wood/iron/food/rare) — the full taxonomy is the seeding contract.

## 2. The economics half — value, finite/renewable, and the craft-chain sink per material

For each node kind: **RENEW** = regenerates (renewable), **FINITE** = depletes, re-seed only via enrich/
re-clear (anti-farm, decision-17-safe). **Raw value** in `ct_units` (1 CT = 10,000; from `ECONOMY-RESOURCE-
MAP` extended). **Sink** = what it's crafted/spent into (where the ≥10% CT burn bites, decision 17).

| Node kind | Renew? | Raw value (⚙) | Primary sink / craft chain |
|---|---|---|---|
| `FARM` (food) | **RENEW** | ~0.002 CT | **army upkeep + provisions (battle clock §5h) + population growth.** Consumed, not crafted. The scarce-farmer premium. |
| `TIMBER` | **RENEW** (~3d) | ~0.004 CT | **arms** (+iron), **walls/towers**, **siege** (+obsidian). |
| `QUARRY` (stone) | **FINITE-slow** | ~0.004 CT | **walls/fortifications/castle** upgrades — the defense-structure feedstock. |
| `IRON_VEIN` | **FINITE** | ~0.01 CT | **arms** (worker→soldier), **armor/weapons**, **siege**. THE arming cost — depth-gradient sourced. |
| `GOLD_MINE` | **FINITE**, enrich-seeded | ~0.05 CT | **dual role — see §2a.** In-battle = tactical elite hire/train (match-local); overworld = tradeable precious/value store. |
| `FISHERY` (fish) | **RENEW** | ~0.002 CT | food-adjacent (coastal food); feeds **preserved rations** (+salt). |
| `SALT` | **FINITE** | ~0.004 CT | **preserved rations** (food + salt → **longer provisions = a longer battle clock**); trade good. |
| `OBSIDIAN`/`SULFUR` | **FINITE** | ~0.02 CT | **siege engines + high-tier weapons/explosives** (volcanic → the siege economy). |
| `GEM_VEIN` | **FINITE** (deep/boss-rich) | ~0.5 CT | **= Carat/CT-tier.** High-value trade + **rare crafting + hero artifacts**; the top of the material ladder. |
| `AETHER_NODE` | **FINITE** (sky) | ~0.1 CT | **arcane/flying units + enchantments** (Arcane phase — later). |
| `HERB_GROVE` | **RENEW** | ~0.006 CT | **medicine → revive/heal + morale**; cuts KO downtime; potions. |
| `ARCANE_SITE` (research) | **FINITE-slow** | ~0.1 CT | **research/blueprints + pet-DNA craft + tech unlocks** (Arcane phase — EDU signature). |
| `LIGHT_SHRINE` (light-essence) | **FINITE**, zone-locked HS3 | ~1.0 CT | **prestige/mythic craft + top hero artifacts** (end-game). |
| `DARK_RIFT` (dark-essence) | **FINITE**, zone-locked UW3 | ~1.0 CT | **dark/prestige craft + top-tier gear** (end-game). |

**Every craft burns (decision 17).** A recipe costs its **materials + a CT-burn component** (the sink) — you
"can't craft without burn." ≥10% of the CT flow is burned; the rest routes to the developer vault. So the
material economy is rich and tradeable, but **converting materials → power always taxes CT**, which is what
keeps the whole thing net-negative and un-botable. Full recipes/values live in `ECONOMY-RESOURCE-MAP.md`
(the sinks doc) — I own tuning them; this table is the map-facing summary.

### 2a. The two golds (a subtlety to lock so we don't double-count)
- **Battlefield gold** (seeded on the *battle* map, `BATTLE-MAP-AND-UNIT-SPEC` §1) = **tactical, match-local**
  — hires/trains **elites** in-match; **never credits the overworld balance** (no mine-to-get-rich).
- **Overworld `GOLD_MINE`** (the §2-matrix material) = a **tradeable precious** farmed on the overworld like
  any material — a value store / trade good, **backend resource, mints no CT**. "CT-node" = it's the
  material whose price tracks CT most directly (the reference good), not that it *is* CT.
- They share a name/lore but are **different ledgers**: one is in-match scrip, one is an overworld trade
  material. The seed pass places battlefield-gold on the battle map (tactical) and `GOLD_MINE` on the
  overworld parcel (tradeable) — keep them distinct in the artifact.

### 2b. Nice emergent tie-ins worth building
- **Salt → preserved rations → longer battle clock.** Coastal/UW2 salt lets an army carry more provision-
  minutes (§5h) — a real reason to hold coast + a soft counter to the food-poverty of sky/underworld.
- **Herb → medicine → shorter Master KO downtime.** HERB_GROVE (ENT/EDU/HS3) feeds revive/heal — ties the
  farming layer to the Master-revive sink (the 7-day CD / 5-CT revive, `FARMING` §3).
- **Food-poor deep/sky zones must IMPORT food** (matrix Food = 0–1 in HS3/UW2/UW3) → a genuine trade/
  logistics demand + a supply-line vulnerability (starve a besieged sky/UW holding). Excellent by design.

## 3. Wild-strength model — my earlier drafts are SUPERSEDED by your registry (corrected)

My `MAP-ECONOMY-SEEDING-PARAMS.md` §2 and `MAP-MAKER-HANDOFF-RECAP.md` §3 guessed the strength model before
your extraction. **Your `WORLD-ZONE-DETAIL.md` / `ZONE-REGISTRY.md` numbers are canonical; I defer to them
and have corrected my docs to point at yours.** The real model:

| Tier | Zones | Strength | `zoneAvgStrength` |
|---|---|---|---|
| **Surface** | HUB 1.0 · ENT 1.1 · BUS 1.2 · EDU 1.3 | gentle unlock progression | 100 / 110 / 120 / 130 |
| **Sky** | HS1 · HS2 · HS3 | **fixed ×2.0 (all three)** — parallel airship-gated islands | 200 each |
| **Underworld** | UW1 2.5 · UW2 3.5 · UW3 5.0 | boss-gated descent | 250 / 350 / **500** |

`zoneAvgStrength = 100 × mult`; the seed pass sizes wild/boss from it. **The generator reads
`strengthMultiplier`/`zoneAvgStrength` per zone — never my earlier hardcoded bands.**

> **✅ RESOLVED (owner, 2026-07-08):** the sky/HS model is **fixed ×2.0 for all three islands** (parallel,
> airship-gated) — the published extraction stands. The earlier "HS1 1× / HS2 2× / HS3 3× climb" idea is
> **dropped**; the underworld (2.5→3.5→5.0) provides the strength *climb*, and sky is a parallel ×2.0 tier.
> No longer owner-TBD.

## 4. Answers to your open items (§5 of your doc)

1. **POI coordinates** — fine to anchor at the atlas's described locations (centre shaft, coast ports, rim,
   boss sites) until the owner's POI dataset lands. The economy doesn't need exact coords, only that each
   zone's **boss anchor** exists (it gates the rare node) and **resource POIs** exist per the matrix.
2. **Material → craft chains** — **owned + delivered above** (§2) + full recipes in `ECONOMY-RESOURCE-MAP.md`.
3. **Confirm the §2 matrix + iron gradient** — **CONFIRMED** (§1). Freeze it as the spawn-weight table.

## 5. Net — what's frozen vs. still open

**Frozen (map team can build to):** the material taxonomy, the §2 richness matrix + iron gradient, the
gradient rule, per-material finite/renewable flags (§2), and the canonical zone strengths (defer to your
registry). **The generator can expand `GOLD_MINE`/`WOOD_GROVE` to the full node vocabulary now.**

**Still owner-TBD (flagged, not blocking base terrain):** the sky-strength model (×2.0 parallel vs. 1/2/3×
climb, §3 flag); Olympus/Fortuna geometry + combat role; the launch pair; HUB sub-zone-slicing; exact
raw-values/recipes (I tune, then freeze). None of these block the **base-terrain 20K run** — they're seed/
value dials, which are re-runnable.
