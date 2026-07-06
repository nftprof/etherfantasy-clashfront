# Pet Aptitude → Economy Mapping (aligning the live populace stats with Clash Front)

> The live PentaPet populace (pets.etherfantasy.com/populace) already defines each species by **5
> summoning aptitudes** + a **rank multiplier** + a power formula. This maps them onto the Clash Front
> economy, confirms **nothing in our design needs to change** (it's enriched), and phases which stats are
> used **now vs later**. Grounds the unit model in `BATTLE-MAP-AND-UNIT-SPEC.md` §5 and the dual-role
> lore (workers/soldiers).

## 1. The 5 aptitudes ARE the 5 economy activities (a clean 1:1)

| Aptitude (example species) | Economy role | Activity (the "summon it for" list) | Phase |
|---|---|---|---|
| **Industry** (100) | **CRAFTER** | 🔨 blacksmithing, smelting, glass, metal refining, **weapon crafting** → the ore→iron→gear production chain | **SOON** (gear economy) |
| **Agriculture** (18) | **FARMER** | gather food + renewable resources (timber) | **NOW (MVP)** |
| **Military** (100) | **SOLDIER (elite)** | ⚔ siege engineers, assault units, artillery → combat units | **NOW (MVP)** |
| **Logistics** (48) | **HAULER** | transport / supply (the auto-caravan; we keep this *light* — market-order model) | **LATER** |
| **Arcane** (42) | **ADEPT** | deep-mine/gems, blueprints, pet-DNA craft, magical combat | **LATER (expansion)** |

So the pet's own stat sheet tells you what it's for. **Every aptitude has a home in the economy** — none
is wasted; Logistics + Arcane simply activate in later phases. **No change needed to the pet website
stats — we phase their *use*.**

## 2. The power formula = adopt as THE unified stat engine

> **Effectiveness = Base Skill (the aptitude) × Experience × Species Affinity × Morale × Equipment**,
> scaled by the **Rank multiplier** (common → mythic, e.g. **×2.20**).

Every factor already exists in our design — so we adopt this one formula for **all** pet activity:

| Formula factor | Our concept |
|---|---|
| Base Skill | the aptitude value (Industry/Agri/Military/Logistics/Arcane) |
| Experience | use-based leveling (grows with work/battles) |
| **Species Affinity** | the **Addendum-E element × biome wheel** (a forest mon farms/fights better in forest) |
| **Morale** | our existing morale stat |
| **Equipment** | soldier gear / hero gear (`BATTLE-MAP-AND-UNIT-SPEC` §5, §12 of the master summary) |
| **Rank multiplier** | **NFT rarity tier** — the scarce-asset value + the whale/rental lever |

One formula drives **farm output, craft speed, combat strength, (later) haul capacity** — unified across
layers. It also means **rarity (rank) is real power** (×2.20 mythic), which feeds the NFT store-of-value +
rental economy (decision 17 / master-summary §6).

## 3. Species specialize → the collection & role economy

The example (Industry 100, Military 100, Agri 18, Logistics 48, Arcane 42) is a **warrior-smith, poor
farmer.** So species carry an **aptitude profile**, and you **deploy each pet where it's strong**:

- **Military-heavy** pet → **elite soldier** (its combat strength = the formula).
- **Agriculture-heavy** pet → **farmer** (top gather rate).
- **Industry-heavy** pet → **crafter** (fast/quality forging).
- A pet *can* do any role, but is **best at its high aptitude** (a Military-100 pet farming at Agri-18 is a poor farmer).

This **enriches "own the pet NFT to pick your class"** (`BATTLE-MAP-AND-UNIT-SPEC` §5a): the pet's aptitude
**is** its class *and* its quality. It creates a real **collection economy** — you want a *mix* (farmers +
warriors + crafters), and you **trade/rent** for the aptitudes you lack. Scarcity of each role = the
distribution of aptitudes across the species roster.

## 4. Reconciling with the unit model (refines BATTLE-MAP-AND-UNIT-SPEC §5)

| Our term | With aptitudes |
|---|---|
| **LINE soldier (worker)** | generic / unspecialized drafted mons — mass, cheap (CT); low or mixed aptitude |
| **ELITE soldier** | a **high-Military pet** (owned NFT or hired specialist); strength = the formula × rank |
| **Farmer / Crafter / Hauler / Adept** | pets assigned to Agriculture / Industry / Logistics / Arcane work |

So our "line vs elite" binary is just the **low-end (generic) vs high-Military (specialist)** of one axis —
a refinement, not a conflict. Workers ↔ line, specialists ↔ elite, exactly as the dual-role lore says.

## 5. Do we need to change anything? — No, but two notes + one ask

- **No core change** — the design aligns and gets *richer* (5 roles instead of 2, one unified power formula).
- **Note 1:** Logistics + Arcane are **defined now, dormant until their phase** (transport light/later, arcane/deep-mine expansion) — future-proofed, nothing to build yet.
- **Note 2:** **Rank multiplier = NFT rarity = real power** — confirm rarity should scale combat/work power (×2.20 mythic). It makes rare pets genuinely stronger (good for the NFT/rental economy; watch the P2W ceiling — the decision-17 per-user cap keeps it from breaking the token, and F2P still fields armies with common mons).
- **The ask — YES, please grab the full mon list.** With every species' aptitude profile + rank I can finalize:
  1. **Biome → species pools** (which mons the command center hires per biome — `BATTLE-MAP-AND-UNIT-SPEC` §2),
  2. **Aptitude distribution** (how many farmers vs warriors vs crafters exist → the *supply/scarcity* of each role, which sets prices), and
  3. **Rank distribution** (how rare mythic is → the power ceiling + NFT value).
  The framework is locked now; the full list **tunes the numbers**.

## TL;DR

The live pets' **5 aptitudes = our 5 economy roles** (Industry→craft, Agriculture→farm, Military→elite
soldier, Logistics→haul[later], Arcane→deep/magic[later]) — a perfect fit, no redesign. Adopt the pet
**power formula** (Base × Exp × **Affinity** × **Morale** × **Equipment** × **Rank**) as the unified engine
for every activity; **rank/rarity = real power** (feeds the NFT + rental economy under the decision-17
cap). Species **specialize**, so aptitude = class + quality, which deepens "own the NFT to pick your
class" into a collection economy. **Use Military + Agriculture now, Industry soon, Logistics + Arcane
later** — every stat has a home. Send the full mon list and I'll finalize biome pools + role scarcity +
rank ceiling.
