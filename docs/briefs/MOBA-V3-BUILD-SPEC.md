# MOBA v3 build spec — unit expansion + mythic reinforcement

> **Owners:** MOBA BattleEngine RAW (3D client) + EF Moba (netcode) build this;
> CF Overworld eco (this brief's author) provides context per side via
> `effectiveStrength` allocate field (COORD-007 lock).
> **Prereqs:** COORD-007 (one-number battle contract, immutable), COORD-004
> (weather × element affinity, ±35% cap), decision 14 (Masters element-free).
> **CF integration cost: ZERO** — all class mechanics fold into
> `effectiveStrength` on CF side; MOBA gets one number per side + a mythic
> spawn signal (see §5).

## 1. What's being added

Current MOBA units: Footman + Archer.

Adding (in phase order):

| Phase | New | Effort | Notes |
|---|---|---|---|
| **v3.1** | Spear, Cavalry (visual variants) | Art asks | No new mechanics — reskin footman/archer stats |
| **v3.2** | Cavalry CHARGE, Spear BRACE mechanics | Real feature | Deploy after v3.1 art lands |
| **v3.3** | Siege two-form transform | Real feature | Highest complexity — the StarCraft-tank fantasy |
| **v3.4** | Flyer tag (immunity to basic melee) | System | Adds an axis to targeting logic |
| **v3.5** | Mythic reinforcement spawn | Special | NFT-gated, rare, memorable |
| **v4** *(later)* | Marine + Ship (naval), Anti-air specialist | Naval scope | Separate spec |

## 2. Unit class specs — final stats

Screen-scale rule (owner ruling): max unit range ≤ 150 world units (fits inside half-screen so player-visible). Arena = ±161 world units (322 wide).

| Class | HP | DMG | Range | Attack rate | Move speed | Special |
|---|---|---|---|---|---|---|
| **Footman** *(exists)* | 100 | 10 | melee (10 u) | 1.0/s | 4 u/s | Jack-of-all-trades, tank front line |
| **Archer** *(exists)* | 60 | 12 | 40 u | 1.0/s | 4 u/s | Fires past frontline |
| **Spear** *(new)* | 90 | 8 | extended melee (18 u) | 1.0/s | 4 u/s | **BRACE** vs charge (see §3) |
| **Cavalry** *(new)* | 80 | 15 | melee (12 u) | 0.8/s | **8 u/s** | **CHARGE** (see §3) |
| **Siege Form 1** *(new)* | 120 | 15 splash (10 u AoE) | 50 u | 0.5/s | 2 u/s | Transform 3s → Form 2 |
| **Siege Form 2** *(new)* | 120 | 45 splash (25 u AoE) | **150 u** | 0.4/s | **0** (rooted) | Min range 35 u; can't target flyers; transform 3s vulnerable |

**Elite tier stats** = ~1.5× line stats (150 HP / 15 DMG for Elite Footman etc.).
CF hires elites at cost = 10-40g + 1-2 fur + iron/wood + a crafted arm. **Requires
Form 2 pet species with a 3D model.** See §6.

## 3. Special mechanics — spec

### 3a. Cavalry CHARGE

```
State: cavalry moves in a straight line for ≥ 3.0 s
       (no target-swaps, no strafing, no > 30° turns)
Visual telegraph: hooves kick up dust cloud
Effect on next attack:
  damage = 25 (vs normal 15)
  AoE = 10 u radius (hits crowd)
  knocks back small units 5 u

Charge canceled by:
  attacking any target (charge spent)
  turning > 30° from movement direction
  being STOPPED by a spear brace
  entering combat range of any enemy that hits back
```

### 3b. Spear BRACE

```
State: spear unit is IDLE + facing a target
Visual telegraph: spear lowered to receive
Passive activation — always on

If a charging cavalry hits a braced spear:
  cavalry's charge is CANCELED (no AoE, no knockback)
  spear deals 2× damage on the counter-attack (16 dmg vs 8)
  cavalry is stunned for 0.5 s
```

### 3c. Siege Form 2 — the StarCraft-tank fantasy

```
Transform (Form 1 → Form 2):
  3.0 s TRANSFORM animation
  Unit stationary + cannot attack + vulnerable
  Visual: legs extend, stabilizers deploy, cannon rises to angle

Untransform (Form 2 → Form 1):
  3.0 s UNTRANSFORM animation
  Same vulnerability window
  CANNOT be canceled mid-transform (commit or die)

Form 2 combat:
  Range: 150 world units (fits half-screen)
  Min range: 35 u — cannot fire on anything closer (dead zone)
  Damage: 45 splash per hit, 25 u AoE radius
  Fire rate: 0.4/s (1 shot per 2.5 s)
  Trajectory: arcing shell — visible arc, 1.5 s flight time (player-readable)
  Can target: ground units, structures
  Cannot target: FLYERS
  Friendly fire: YES — splash hits your own units

Balance guardrails:
  - Cost: 3-4× a footman (rare + valuable)
  - Pop cap in army: max 20% siege composition (⚙, prevents pure-siege)
  - Poor vision (~80 u) — needs a spotter for max value
```

### 3d. FLYER TAG (new axis)

```
FLYER TAG applies to species that fly.

Rules:
  - Basic melee attacks CANNOT hit them ("swing misses")
  - Special / skill attacks CAN hit them (AoE, ranged skills, artillery arcs)
  - Baseline HP is LOWER (~70-80% of ground-equivalent stats)
  - Siege Form 2 CANNOT target flyers (must use dedicated anti-air, v4)
  - CAVALRY CHARGE is ground-only — flying "cavalry-like" species use a
    dive-attack mechanic (SEPARATE, v4 spec)

Example: Kai (Master) — sword swing misses flyers.
         His AoE skill or ranged skill hits flyers.

FLYERS ARE LINE-ONLY (owner ruling 2026-07-17):
  No elite path for pure-Flyer species even if their aptitude form ≥ 2.
```

## 4. Line vs Elite — the evolution rule

**Owner ruling 2026-07-17:** whether a pet can serve as an ELITE unit depends
on whether that species can EVOLVE (has a Form 2 in `docs/populace-pet-spec/pets-aptitudes.csv`).

```
Line unit:  Any Form 1 pet, cheap, populace-drafted from biome-native pool
Elite unit: Requires Form 2+ pet species with a 3D model
             + workshop-crafted arm + gold + fur ± iron/wood
Pets with only Form 1 → line-only forever, no shortcut, no matter your CT
Mythic pets: NEITHER line nor elite — see §5
```

**Data source (LOCKED):** `docs/populace-pet-spec/pets-aptitudes.csv` is the
authoritative species data. Column `form` (1/2/3/4) drives the elite gate.
War-duty text is FLAVOR — do not use for class assignment.

**Class assignment via anatomy heuristic** (owner ruling): body form determines
class eligibility. War-duty text is flavor for tooltips only. Rock/Iron/Earth
= tank-eligible. 4-leg ground = cavalry. Water = marine. Flying = flyer tag.
Dragon = siege (heavy artillery frame). Insect = spear (spike/stinger swarm).
Combat / Neutral = footman default.

## 5. Mythic reinforcement — the NEW special mechanic

**Owner ruling 2026-07-17:** mythic-rarity pets are NEITHER line nor elite.
They spawn as **special reinforcements** in MOBA battles — analogous to a
Master answering a call.

### 5a. Trigger

```
Prerequisite: Player owns a Mythic-rarity Pet NFT of species X

Deterministic slot: 1 guaranteed spawn per 10 battles for that owner
                    (NOT random — planable, feels rewarding for NFT holders)

Applies to: any battle where the NFT-owner is a participant
            (attacker OR defender)

Multiple mythics: each owned mythic NFT has its own independent 10-game
                  cooldown, so a whale with 3 mythic NFTs may see up to 3
                  mythic spawns in the same 10-game window (different species)

Spawn timing: at the START of an eligible battle
              Arrives visibly on the map with a shaft-of-light VFX at
              the owner's side spawn zone
```

### 5b. Stats — v0.1 balance (⚙ dials, tunable from playtest)

```
HP:            1000      (~2× hero baseline, ~7× elite footman)
Damage:        80        (~1.6× hero, ~5× elite)
Attack range:  matches base class (siege 150 u, archer 40 u, cavalry 12 u)
Move speed:    matches base class
Splash/AoE:    matches base class (siege-mythic keeps splash)
Skills:        NONE — pure stat threat, owner ruling
Duration:      until KO'd or battle end
Element:       applies normally (weather × terrain × ±15%, ±35% cap)
Artifact aura: N/A (mythic is not a hero, cannot equip)
Master rules:  does NOT count against per-user hero cap
```

**Rationale for HP > Damage bias:** feels rewarding to see a mythic tank
forever (memorable presence), even at "only" 1.6× hero damage. A pure 2×
damage mythic risks one-shotting soldiers — oppressive. HP-tank profile
feels EPIC without breaking the fight. Owner may retune 800/100 if scarier
mythic is preferred.

### 5c. Behavior

- Uses default AI stance — no player micro
- Follows owner's Master if present, else nearest lane
- CANNOT be recalled, boxed, or micro-managed
- KO'd = goes to a 10-game cooldown pool (recovery)

### 5d. Announcement banners

At mythic spawn, TWO simultaneous banners fire per-viewer (existing
`bigBanner()` system):

**OWNER'S side** (green tint, gold shaft-of-light VFX):
Randomly picked from:
- "⭐ The Gods have answered — {Name} arrives!"
- "⭐ {Name} descends. The tide turns."
- "⭐ Your bond calls a legend forth — {Name} takes the field."
- "⭐ The sky opens. {Name} steps through."

**OPPONENT'S side** (red tint, ominous audio sting):
Randomly picked from:
- "⚠ The Gods have favored the opponent with a Mythic. Steel yourself."
- "⚠ The sky darkens — something is powering the enemy. Be prudent."
- "⚠ A Mythic answers the enemy's call. {Name} enters the field."
- "⚠ Old power stirs on the wrong side of the line."
- "⚠ They walk with a legend today. Trust your line."

Random selection is DETERMINISTIC: `hash(battleId + tick) % pool.length`
so replays match. Advisor toast follows 1 s later ("focus fire" / "hold ground").

### 5e. KO reward (owner ruling: NO DNA fragments in MOBA)

DNA fragments live on the CF main map only — not in MOBA. Instead:

```
When enemy Mythic is KO'd:
  A BONUS LOOT DROP appears at the KO location.
  Behaves like a boss loot drop — first player to pick up gets it.
  Contains: rare-metal + gold + a chance at Singular/artifact tokens
            (details TBD by MOBA — treat as a boss-tier drop)
  Any player on any side can grab it (whoever gets there first)

World Chronicle inscription (public, permanent):
  "{killer name} felled the Mythic {mythic name} at the {battle name}"
  First-time bonus: extra Chronicle emphasis for the first player ever to
  slay THAT species of mythic.
```

### 5f. 3D-ready mythic pool (5 species)

| Species | Element | Class fit | Notes |
|---|---|---|---|
| **Zedakazm** | Dragon/Phantom (Flyer) | SIEGE-flyer | Long-range artillery, immune to melee, terrifying |
| **Quadrossal** | Telepath/Mystic | ARCHER | Long-range magic bolts |
| **Vernirox** | Earth/Rock | FOOTMAN-tank | Immovable frontline wall |
| **Mytier** | Fire/Mystic | SIEGE | Fire-cannon mythic |
| **Vaudequin** | Fire/Mystic | SIEGE | Fire-cannon mythic |

## 6. Pet species → class roster (LOCKED for v3)

All species below have 3D models + battle-ready status.
Source: `data/PETS_ROSTER.csv` ∩ `docs/populace-pet-spec/pets-aptitudes.csv`.

**Legend:** `[F1]` = line only · `[F2+]` = elite-capable · `[FLYER]` = flyer tag · `[MYTHIC]` = special spawn (§5) · `[LEG]` = legendary rarity

### 6a. FOOTMAN — melee frontline (26 line + 6 elite + 1 mythic)

| Rank | Species | Element | Notes |
|---|---|---|---|
| Line F1 | Blockid, Lollipunch, Redhandit, Wallopop | Combat | Vanguard duelists |
| Line F1 | Berrball | Mystic | ⚠ Flyer-tagged footman |
| Line F1 | Cesstoid, Krakowee, Mirrie, Sonectid, Spoulder | mixed | Auxiliary / support |
| Line F1 | Mizumi, Ekopi, Tygloo | mixed | Reserves |
| Line F1 (tank) | Armadigoal, Fauneek, Helichrome, Keradon, Matara, Mindallion, Morinori, Pigperus, Sully | Earth/Iron/Rock | Stone-domain heavy tanks (owner ruling: rock/iron = tank) |
| Line F1 (aux) | Dorentu, Fuirrel, Geenee, Quillster | Neutral | Baseline support |
| Elite F2 | Blockall, Mawverize | Combat | Elite frontline |
| Elite F2 | Coronoid, Geerex, Squake, Watadzumi | Neutral | Elite reserves |
| Mythic | Vernirox | Earth/Rock | Immovable wall (§5) |

### 6b. ARCHER — ranged, elemental variants (22 line + 6 elite + 1 mythic)

Elemental projectile flavor; mechanics uniform per class (§2).

| Rank | Species | Element | Projectile flavor |
|---|---|---|---|
| Line F1 | Dynamouse | Fire | fire ball |
| Line F1 | Diloom | Toxin | poison spit |
| Line F1 | Eekape | Phantom/Toxin | dark bolt |
| Line F1 | Endorr | Leaf/Rock | seed shot |
| Line F1 | Omnom | Water/Mystic | water/magic — FLYER |
| Line F1 | Cryptise | Phantom/Earth | phantom bolt — FLYER |
| Line F1 | Clothom | Phantom/Flyer | shadow — FLYER |
| Line F1 | Vibe | Phantom | vibrational — FLYER |
| Line F1 | Elekitt, Mianari, Lectrobe | Lightning | lightning bolt |
| Line F1 | Berrball, Dusprite, Intelix, Kyberra, Moonara | Mystic | magic bolt |
| Line F1 | Geckno, Kikapole, Swifty | Telepath | psi shot |
| Line F1 | Cannubis, Greipawn, Lemeeni, Pangrass | Leaf | seed/thorn |
| Elite F2 | Florost, Dillow, Occlusk | Leaf | Elite green-archers |
| Elite F2 | Silvyx (FLYER), Moldec | Mystic/Phantom | Elite spectral archers |
| Elite F2 | Oculid, Wrektric, Surinari, Geckelic | Toxin/Lightning/Telepath | Elite ranged specialists |
| Mythic | Quadrossal | Telepath/Mystic | Magic bolt mythic |

### 6c. CAVALRY — 4-legged ground, CHARGE mechanic (5 line + 1 elite)

Owner ruling: **any 4-legged ground pet is cavalry-eligible.**

| Rank | Species | Element | Notes |
|---|---|---|---|
| Line F1 | Chulember | Fire | 4-leg fire mount |
| Line F1 | Kyberra | Mystic/Leaf | 4-leg |
| Line F1 | Felistar | Phantom/Lightning | Feline |
| Line F1 | Swifty | Telepath | Speed |
| Line F1 | Flaraton | Fire/Earth | 4-leg fire mount |
| Elite F2 | Fuenago | Fire | 4-leg fire mount (elite) |

**Extended cavalry pool (Fire-typed, cavalry-or-siege — owner may re-split):**
Barkindle, Hambrisk (default: cavalry). See §6d for the siege alternative.

### 6d. SIEGE — heavy artillery, two-form transform (5 line + 2 elite + 2 mythic)

Rock throwers, heat cannons, dragon-frame artillery.

| Rank | Species | Element | Notes |
|---|---|---|---|
| Line F1 | Baulder | Dragon | Rock-throwing dragon (per owner: NOT air) |
| Line F1 | Thermolophus | Rock/Earth | Heat-cannon dinosaur (bulwark stance) |
| Line F1 | Iquander | Dragon/Fire | Fire dragon |
| Line F1 | Vexigon | Dragon/Neutral | Base dragon |
| Line F1 | Zedakazm | Dragon/Phantom | FLYER-siege — but classified as MYTHIC (see §5) |
| Elite F2 | Dredrock | Dragon/Rock | LEGENDARY elite siege — direct upgrade path from Baulder |
| Elite F2 | Dracobra | Dragon | FLYER-siege elite |
| Elite F2 (fire) | Candeliria (Fire/Telepath), Pyrode (Fire) | Fire | Fire-cannon elites |
| Mythic | Mytier | Fire/Mystic | Fire-cannon mythic |
| Mythic | Vaudequin | Fire/Mystic | Fire-cannon mythic |

### 6e. SPEAR — spike / venom / long stab (12 line + 1 elite)

| Rank | Species | Element | Notes |
|---|---|---|---|
| Line F1 (base) | Quillster | Neutral | Natural quills |
| Line F1 (base) | Palytid, Spoxin, Grubgas | Toxin | Poison spear |
| Line F1 (ice) | Foxeez, Kelpony, Mintol, Ruffski | Ice | Icicle spear |
| Line F1 (swarm) | Inchapp, Pistaccoul, Tipsillar | Insect | Swarm tactics |
| Line F1 (swarm) | Vivorin | Insect/Flyer | FLYER-swarm |
| Elite F2 | Mechloo | Ice/Neutral | Elite ice-spear |

### 6f. MARINE — naval landing / coastal (11 line + 3 elite + 1 legendary)

*v4 later spec, but roster ready.*

| Rank | Species | Element | Notes |
|---|---|---|---|
| Line F1 | Nageel, Vermillios, Pudde, Mushmite | Water | Base marines |
| Line F1 | Omnom | Water/Mystic | FLYER marine |
| Line F1 | Krubble, Onchor, Watuber, Piggicius | Water dual | Line marines |
| Line F1 | Snobbit | Ice/Water | Ice-water hybrid |
| Line F1 (LEG) | Windora | Water/Flyer | Legendary flying marine |
| Elite F2 | Moranagi, Yumee, Aquary | Water | Elite marines |

### 6g. FLYER — pure Flyer element, LINE ONLY (4 species)

Owner ruling: **flyers are LINE only, no elite path ever.**

| Species | Element | Notes |
|---|---|---|
| Eriegle, Gremin, Inkami, Roichirp | Flyer | Aerial reconnaissance / dive-attack (v4 mechanic) |

## 7. Coord entry (COORD-009)

Add to `docs/coord/MOBA-CF-COORD.md`:

```
COORD-009 — MOBA v3 unit expansion + mythic reinforcement (2026-07-17)

Full spec: docs/briefs/MOBA-V3-BUILD-SPEC.md

CF → MOBA: no change to the effectiveStrength contract (COORD-007 stands).
           Mythic spawn signal = a boolean flag + species id in the allocate
           context per side (see §5a trigger). CF computes deterministically
           from NFT ownership + 10-game slot; MOBA renders + runs the mythic
           unit.

MOBA scope:
  v3.1  Cavalry + Spear visual models
  v3.2  Cavalry CHARGE + Spear BRACE mechanics
  v3.3  Siege two-form transform (Form 1 mobile / Form 2 stationary)
  v3.4  Flyer tag (immunity to basic melee, lower HP)
  v3.5  Mythic reinforcement spawn (NFT-gated, 1 per 10 games, boss-drop KO)

Sample pet species per class in §6 (locked).
```

## 8. Implementation checklist

- [ ] v3.1: Import 12 cavalry + 12 spear pet 3D models (per §6c/§6e roster)
- [ ] v3.1: Reskin footman stats onto cavalry visual, archer stats onto spear visual (before mechanics)
- [ ] v3.2: Cavalry CHARGE — straight-line 3s accumulator + AoE next hit
- [ ] v3.2: Spear BRACE — passive receive stance vs charging cavalry
- [ ] v3.3: Siege Form 1 (mobile 50u splash)
- [ ] v3.3: Siege Form 2 (stationary 150u long-range) + transform 3s animation
- [ ] v3.3: Siege min-range dead zone (35u) + friendly-fire splash + no-flyer targeting
- [ ] v3.4: Flyer tag — basic melee whiff logic + reduced HP baseline
- [ ] v3.5: Mythic spawn event handler (reads allocate context flag)
- [ ] v3.5: Announcement banner pool (owner-side + opponent-side)
- [ ] v3.5: Mythic AI — line-soldier behavior, no skills
- [ ] v3.5: Mythic KO → boss-style bonus loot drop at KO location
- [ ] Elite tier rendering: 1.5× stats visual differentiation (armor gilding, size bump)
- [ ] Anti-air unit — deferred to v4

## 9. Open items to owner (still needed)

- **Fire species Cavalry-vs-Siege split** — 8 pets in the Fire pool (Barkindle, Batflare, Candeliria, Hambrisk, Mytier, Polynimo, Pyrode, Vaudequin). Current default: cavalry/siege split proposed above; owner may override individual species.
- **Mythic stat tuning** — v0.1 = HP 1000 / DMG 80 (tanky-legend). Alternative HP 800 / DMG 100 (scarier). Both are ⚙ dials the MOBA agent will tune from playtest.

## 10. What CF ships in parallel

- Elite hire flow (workshop crafting arms + evolved-form pet gate)
- Mythic NFT ownership check (Pentagon Chain / Masters API)
- Mythic 10-game cooldown tracker per NFT per governor
- Chronicle inscription on mythic KO
- Allocate-context extension: `mythicSpawn: { species, side }` when triggered

**All CF-side work is bookkeeping only — no impact on the one-number contract.**
