# Unit spec expansion — 5-class MOBA roster + naval later

> **Owner ruling 2026-07-17:** current MOBA has footman + archer only. Add
> SPEAR / CAVALRY / SIEGE (with two-form transform mode). MARINE + SHIP land
> later (naval spec). Siege Form 2 = the StarCraft-siege-tank fantasy:
> long-range stationary artillery with splash + minimum range.
>
> **CF integration cost = zero** — all classes fold into `effectiveStrength`
> per COORD-007. MOBA integration is unit visuals + mechanics only.
>
> **Screen-scale rule (owner):** unit range must fit inside "half screen wide"
> so the player can visually connect attacker → target. Arena is ±161 world
> units (322 total wide) — half screen = 161 units, capped at 150.

## The five classes (v3 target)

| Class | Role | HP | DMG | Range | Speed | Move | Special |
|---|---|---|---|---|---|---|---|
| **Footman** *(exists)* | Tank / frontline | 100 | 10 | melee (10) | 1.0/s | 4 u/s | Jack-of-all-trades; solid but unspecialized |
| **Archer** *(exists)* | Ranged damage | 60 | 12 | 40 u | 1.0/s | 4 u/s | Fires past frontline; poor vs cavalry rush |
| **Spear** *(new)* | Anti-cavalry / long melee | 90 | 8 | extended melee (18) | 1.0/s | 4 u/s | **BRACE** — vs charging cavalry, halts charge + 2× damage on impact |
| **Cavalry** *(new)* | Flanker / breaker | 80 | 15 | melee (12) | 0.8/s | **8 u/s** (2×) | **CHARGE** — after 3s straight-line, next hit is 25 AoE (10 u radius); countered by spear brace |
| **Siege Form 1** *(new)* | Mobile artillery | 120 | 15 splash (10 u AoE) | 50 u | 0.5/s | 2 u/s | Slow, medium range; can transform (3s) → Form 2 |
| **Siege Form 2** *(new)* | Stationary artillery | 120 | 45 splash (25 u AoE) | **150 u** | 0.4/s | **0** (rooted) | **MIN range 35 u** — cannot hit close; cannot target fliers; transform 3s (undeploy vulnerable) |

**Ranged categories:**
- Melee (≤ 20 u): Footman, Spear, Cavalry
- Short range (40 u): Archer
- Medium range (50 u): Siege Form 1
- Long range (150 u — half-screen): Siege Form 2

## Rock-paper-scissors triangle

```
Siege Form 2  →  wrecks massed footman + structures + immobile targets
              →  helpless during transform (3s)
              →  cannot hit anything inside min range (35 u)
              →  destroyed by cavalry that closes the gap

Cavalry       →  charges siege/archer, breaks lines
              →  vulnerable to SPEAR brace (charge canceled + 2× damage taken)

Spear         →  counters cavalry, holds line
              →  vulnerable to ARCHER/SIEGE range

Archer        →  outranges melee, chip damage
              →  vulnerable to CAVALRY charge

Footman       →  tanks front, protects archer/siege
              →  outclassed 1v1 by everything specialized
```

Clean triangle. Every unit has a hard counter + a hard soft-target.

## Siege Form 2 — detailed spec

### Transform behavior

```
Form 1 (mobile) → Form 2 (siege):
   3.0 s TRANSFORM animation
   Unit stationary + cannot attack + vulnerable
   Visual: legs extend, stabilizers deploy, cannon rises to angle

Form 2 (siege) → Form 1 (mobile):
   3.0 s UNTRANSFORM animation
   Same vulnerability window
   CANNOT be canceled mid-transform (commit or die)
```

### Combat behavior — Form 2

| Property | Value |
|---|---|
| Range | 150 world units (fits within half-screen budget) |
| Min range | 35 world units — dead zone, cannot fire on anything closer |
| Damage | 45 splash per hit, 25 u AoE radius |
| Fire rate | 0.4/s (1 shot per 2.5 s) |
| Trajectory | Arcing shell — visible arc, 1.5 s flight time (player-readable) |
| Can target | Ground units, structures |
| Cannot target | Fliers (must be countered by dedicated anti-air unit — future) |
| Friendly fire | YES — splash hits your own units in the AoE |

### Balance guardrails for the MOBA agent

- **Cost:** 3–4× a footman (rare + valuable, gates the fantasy behind investment)
- **Population cap in one army:** max 20% of army composition ⚙ (prevents pure-siege comps)
- **Vision:** Form 2 has POOR vision (150 u range, ~80 u vision — needs a spotter unit for max value)
- **Deploy commitment:** the 3s transform windows are the anti-abuse (no poke-and-run)

## Cavalry CHARGE mechanic (detail)

```
While cavalry moves in a straight line for ≥ 3.0 s (no target-swaps, no strafing):
   accumulates a "charge" state
   visible: hooves kick up dust cloud (visual telegraph)

On next attack:
   damage = 25 (vs normal 15)
   AoE = 10 u radius (hits crowd)
   knocks back small units 5 u

Charge state CANCELED by:
   attacking any target (charge spent)
   turning > 30° from movement direction
   being STOPPED by a spear brace
   entering combat range of any enemy that hits back
```

## Spear BRACE mechanic (detail)

```
When a spear unit is IDLE + facing a target:
   passively enters BRACE stance (visible: spear lowered to receive)

If a charging cavalry hits a braced spear:
   cavalry's charge is CANCELED (no AoE, no knockback)
   spear deals 2× damage on the counter-attack (16 dmg vs 8)
   cavalry is stunned for 0.5 s

Untrained tip: put spears in the FRONT LINE for anti-cavalry duty
Trained counterplay: send cavalry AROUND the spears at the archer line
```

## Pet species → unit class mapping

Every unit class has a natural species pool. This is the CF main-map "who can I draft here" logic — biome-native drafts pull from the appropriate species set. NFT-blueprint owners can summon ANY species anywhere at a premium (existing rule).

| Class | Best-fit species types | Reasoning | Example creatures |
|---|---|---|---|
| **Footman** | Combat, Iron, Rock, Neutral, sturdy mammals | Durable frontline, no special role | Bear-warrior, Iron-golem, Boar-line, Ape-fighter |
| **Archer** | Flyer, Leaf, Water (fisher), Mystic | Precision + range + agility | Kestrel, Deer-archer, Owl-archer, Otter-marksman |
| **Spear** | Insect (mantis-arm/wasp-sting), Fire (horn/lance), Toxin (venom-tip), Ice (icicle-spear) | Natural pointy protrusions or formation-fighters | Mantis-guard, Rhino-charger, Bee-lancer, Ice-spinelord |
| **Cavalry** | Fast warm-blooded, Flyer (aerial cavalry), Dragon (dragoon) | Speed defines the class | Cheetah-rider, Wolf-rider, Griffin, Fire-drake, Pegasus |
| **Siege** | Rock, Iron, Dragon (heavy breather), Ancient/Mythic | Heavy frame with destructive power; Form 2 = fixed emplacement | Rock-golem, Iron-titan, Ancient-dragon (Form 2 breathes from anchored stance) |
| **Marine** *(later)* | Water, amphibious | Coastal + naval landing | Otter-warrior, Turtle-marine, Crab-warrior |
| **Ship** *(later)* | Ship species, sea-titans | Naval line | Whale-ship, Sea-serpent, Naval-drake |

### Biome-native draft options

| Biome | Native class options |
|---|---|
| Plains / steppe | Footman, Cavalry, Archer |
| Forest | Archer, Spear, Footman |
| Mountain | Footman, Siege, Spear |
| Volcanic (UW2) | Cavalry (fire-drake), Siege (rock/dragon) |
| Frozen | Spear (icicle), Footman (ice-bear) |
| Coast / river | Archer (water), Marine |
| Underworld (UW1-3) | Phantom-archer, Wraith-spear |
| Sky (HS1-3) | Flyer-archer, Aerial cavalry |

NFT summon premium (see NPC trade / summon table): +50% cost for non-native summon; unlocks any class on any land.

## Master's artifact aura interaction

From the earlier locked design (COORD-004 in coord doc), Masters with equipped signature artifact grant **+10% elemental aura** to matching-element unit stacks. Extends naturally to all new classes:

- Fire-artifact Master with siege pets → Fire-siege units at +10% while she lives
- Ice-artifact Master with spear pets → Ice-spear at +10%
- Etc.

No new mechanic — existing rule generalizes.

## Rollout phases

| Phase | Scope | MOBA effort |
|---|---|---|
| **v1 (now)** | Footman + archer visual models render ALL CF classes. Everything folds into effectiveStrength (COORD-007). | Zero |
| **v2** | Cavalry + Spear visual models added. Same combat mechanics as footman/archer. Better field readability. | Art only |
| **v3** | Cavalry CHARGE, Spear BRACE, Siege two-form transform. Full mechanics as spec'd here. | Real MOBA feature build |
| **v4** | Marine + Ship (naval). Separate spec. | Naval-scope work |

## Coord entry

`docs/coord/MOBA-CF-COORD.md` COORD-009 — MOBA v3 unit expansion + siege mode.
