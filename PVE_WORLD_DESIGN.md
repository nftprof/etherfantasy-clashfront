# EF HUNT — World, Factions, Zones & Main Quest (design blueprint)

> The narrative + content design for **EF HUNT** (`pve.html`). This is the plan the
> code implements: the overworld of elemental regions, the factions, the main quest
> arc that explains *why* we fight and *who for/against*, and the deeper side content
> that gives the grind meaning. Built on top of the existing systems (Emberhollow
> town, the Wilds, dungeons, CT economy, permadeath, daily heroes, skills, taming).
>
> Design pillars: **Diablo** (zones → wardens → loot), **Palworld** (taming, building),
> **Monster Hunter** (named boss hunts), now with a **spine of story** so each hunt is a
> step in reclaiming a broken world rather than an isolated grind.

---

## 1. Premise — why we fight

The world is **Etheria**. Its lifeblood is **ether**, the raw essence that gives monsters
their forms and elements. At the world's heart once spun the **Etherheart**, a great crystal
that kept ether balanced across the land.

Then came **the Sundering**: the Etherheart shattered. Its power scattered into seven
**Elemental Shards**, each crashing into a different region and *corrupting* it — twisting
its monsters feral, warping its terrain, and binding itself to a monstrous **Warden** that
hoards the Shard's power. Ether now drains from the world; the longer a Shard stays
corrupted, the more the region (and its creatures) unravels.

Crystallized ether is **💎 Carat (CT)** — the very currency hunters earn. This ties the grind
to the story: **every Carat you reclaim is a fragment of the world's lifeblood pulled back
from ruin.** Spending it on gear/revives is the Lodge re-forging that essence into the tools
to fight on.

**You** are a Hunter of the **Emberhollow Lodge**. Your charge: venture into the corrupted
regions, cleanse them, slay the Wardens, reclaim the Shards, and ultimately restore the
Etherheart — before the entity behind the Sundering claims all of Etheria's ether for itself.

**The permadeath is canon.** When a hunter falls without a revive, the Sundering's hunger
claims their gear and rank back to nothing — only their Carat (reclaimed ether, already
banked) and hard-won *Skills* and *lore* survive. The world is genuinely dangerous; the Lodge
sends many, and few endure to Hell difficulty.

---

## 2. Factions — who we fight for and against

| Faction | Element theme | Stance | Leader / Warden |
|---|---|---|---|
| **Emberhollow Lodge** (you) | Neutral | Ally — your guild | **Elder Varn** (the town Elder NPC) |
| **The Verdant Pact** | Leaf / Toxin | Corrupted ex-ally | Warden **Mossfang Alpha** |
| **The Cinder Host** | Fire / Rock | Hostile zealots | Warden **Pyrelord Ignus** |
| **The Drowned Choir** | Water / Ice | Risen, sorrowful | Warden **Tidemother Glace** |
| **The Stormbound** | Lightning / Flyer | Sky raiders | Warden **Voltaic Roc** |
| **The Deepwrought** | Earth / Iron | Subterranean smiths | Warden **Forgemaw** |
| **The Hollow Court** | Phantom / Mystic | The true enemy | **Vault Warden → the Hollow King** |

**The Lodge** is your home faction — pragmatic monster-tamers who hunt to keep the balance
(and to earn the ether the world needs). Elder Varn guides the main quest from Emberhollow.

**The Verdant Pact** were once the Lodge's allies — druids who tended the Wilds. The Leaf
Shard corrupted them into believing nature must devour all civilization. They are the *first*
warden hunt: a fallen friend, to set the tone.

**The Cinder Host, Drowned Choir, Stormbound, Deepwrought** each rose around a Shard with
their own broken logic (purify the world by fire; reclaim what the sea took; rule from the
storm; forge a new order underground). They are tragic antagonists, not cartoon villains —
each region's side quests reveal a faction divided between zealots and those who want to be
freed of the Shard.

**The Hollow Court** is the true enemy. The **Hollow King** *caused* the Sundering: he
shattered the Etherheart to seize its power and remake Etheria as a realm of hollow,
will-less servants. The **Vault Warden** is his lieutenant guarding the **Abyssal Vault**,
the final region. Defeating the King and restoring the Etherheart is the campaign's climax.

---

## 3. The Overworld — elemental regions

Emberhollow sits at the center. Seven corrupted regions ring it, each an **element**, each
with a Warden and a faction. The **World Map (M)** shows them as distinct territories with
faction colors and a "cleansed / corrupted / locked" state; cleansing a region lights its
Shard on the map.

Regions are unlocked in order by main-quest progress (and gated by difficulty so the curve
holds). Current dungeons map onto the first regions; new ones extend outward.

| # | Region | Element | Faction | Warden (end boss) | Maps to |
|---|---|---|---|---|---|
| 0 | **Emberhollow** | Neutral | Lodge (hub) | — | existing town |
| 1 | **Tanglewood Wilds** | Leaf | Verdant Pact | **Mossfang Alpha** | existing Wilds + Mossfang Hollow |
| 2 | **Cinderpeak Caldera** | Fire | Cinder Host | **Pyrelord Ignus** | new / reskinned dungeon |
| 3 | **Frostmere Deep** | Water/Ice | Drowned Choir | **Tidemother Glace** | Howling Crypt reframed |
| 4 | **Stormspire Heights** | Lightning | Stormbound | **Voltaic Roc** | new |
| 5 | **Ironroot Undervault** | Earth/Iron | Deepwrought | **Forgemaw** | new |
| 6 | **The Abyssal Vault** | Phantom | Hollow Court | **Vault Warden → Hollow King** | existing Abyssal Vault, finale |

Each region carries an **elemental affinity** that flavors combat: its monsters favor that
element's type, its Warden uses that element's mechanics, and the loot/gems skew toward it.
A hunter of an opposing element (type chart) gets the classic ×1.5 / ×0.7 swing — so players
are nudged to learn many heroes (which the daily rotation already encourages).

**Warden mechanics (distinct, beyond the shared telegraphed slam):**
- *Mossfang Alpha* — summons sapling adds + a root-snare ring (slow zone you must leave).
- *Pyrelord Ignus* — leaves burning ground (reuse the Emberfang `burns[]` system) + an enrage at 30% HP.
- *Tidemother Glace* — freezes the hero in place briefly (telegraphed); spawns ice-shard volleys.
- *Voltaic Roc* — dive-bomb dashes across the arena + chain-lightning between pets.
- *Forgemaw* — drops armor plates (temporary cover) + a ground-pound shockwave.
- *Vault Warden / Hollow King* — multi-phase: adds, then ground hazards, then a desperation nuke.

---

## 4. Main Quest — three acts

A persistent **Quest Log (J)**. The main quest (`SAVE.story` step index) survives death &
cooldowns like skills/CT. Steps advance on concrete actions (reach a zone, slay a Warden,
return to Varn). Each Warden kill grants a **Shard** = a small permanent account perk + a CT
reward + the next region unlock.

### Act I — *The Lodge's Call*  (onboarding + first Shard)
1. **Awakening** — Arrive in Emberhollow. Speak to Elder Varn (he explains the Sundering).
2. **First Blood** — Slay 10 corrupted beasts in the Wilds; tame your first pet from an egg.
3. **The Fallen Pact** — Enter Tanglewood, learn the Verdant Pact's corruption from field lore.
4. **Warden of Leaf** — Defeat **Mossfang Alpha**. Reclaim the **Leaf Shard**. Return to Varn.
   *Reward: Leaf Shard (permanent +HP regen perk), CT, unlock Act II regions.*

### Act II — *The Shattered Realms*  (the four wardens, any order)
For each of **Cinderpeak / Frostmere / Stormspire / Ironroot**:
- Travel to the region (unlocks its waypoint + map territory).
- A short faction conflict beat (a captive freed, a zealot's logic revealed) via lore drops &
  an NPC line — *who* you're really fighting for.
- Defeat the region's **Warden**, reclaim its **Shard** (each Shard a different permanent perk:
  Fire = +crit, Water = +slow resist, Lightning = +move speed, Earth = +armor).
- The deeper the region (and difficulty), the richer the loot & CT.
*Gate: all four Shards needed to open Act III.*

### Act III — *The Hollow Court*  (finale)
1. **The Vault Opens** — With four Shards, the Abyssal Vault unseals (ties into the existing
   `maybeFinalBoss` gate). Varn warns you of the Hollow King.
2. **The Lieutenant** — Defeat the **Vault Warden** (existing final-boss slot, phase 1).
3. **The Hollow King** — Multi-phase confrontation. On victory → **restore the Etherheart**:
   `runComplete()` flavored as cleansing the world; a large CT payout + an account title.
4. **New Game+ / Endless** — The Sundering's echoes remain: post-finale, regions can be
   re-corrupted at higher difficulty (feeds the existing diff +1 / Hell loop and a future
   Abyssal Rift endless mode).

---

## 5. Deeper / side content (gives the grind texture)

- **Faction Reputation** — each region tracks rep earned by clearing its packs & bounties;
  rep unlocks faction-flavored gear/gem rewards and lore. Hooks the existing bounty board.
- **Lore Codex** — killing a *new* monster/Warden first time unlocks a codex entry (who they
  were before the Sundering). Read in town (📖 guide overlay extended, or a new 📜 codex).
- **NPC questgivers in town** — Elder Varn (main quest), plus a Smith (forge/gear chains) and
  a Tamer (pet-evolution challenges) for repeatable side quests with CT/skill-XP rewards.
- **Region bounties** — the daily bounty board gains region-specific contracts (slay X in
  Frostmere, free a captive from the Cinder Host) that advance faction rep + story flavor.
- **World stakes meter** — a town display of "ether reclaimed" (total Shards + lifetime CT)
  visualizing the world healing as you progress; pure flavor tying grind → narrative.

---

## 6. How this maps to the existing code (implementation notes)

- **Zones**: extend `DUNGEONS[]` into an `REGIONS[]` model carrying `{name, element, faction,
  warden, shard, actGate, cx, cz, r, col, floor}`. `zoneOf()` already boxes dungeons far
  off-map — reuse that; add the new regions as further boxes. Keep town + wilds as-is
  (wilds = Tanglewood/Leaf region 1's open field).
- **World map**: `drawWmap()` already draws town/dungeon boxes + a hero dot — extend it to
  render each region as a faction-colored territory with name + cleansed/locked state, and
  the `WAYPOINTS[]`/`wpFound[]` discovery to gate fast-travel by act.
- **Quest state**: new `SAVE.story` (step int) + `SAVE.shards{}` + `SAVE.rep{}` + `SAVE.codex{}`,
  all preserved by `wipeSave()` exactly like `skills`/`bq` (survive death & cooldown).
- **Quest Log**: a `#quest` overlay toggled by **J** (mirror the `#guide`/`#wmap`/`#stash`
  overlay pattern), listing the current main-quest step + active side quests.
- **Wardens**: each region's boss uses `mkBoss()` with a `bossName` (already supported) +
  per-warden mechanic flags; the final region keeps `maybeFinalBoss`/`finalBoss` →
  `runComplete()`. Warden-kill hooks advance `SAVE.story`, grant the Shard, award CT.
- **Story intro**: a one-time modal on a fresh save (and recap from Varn) delivering the
  premise — short, skippable.
- **Shard perks**: applied in `applyEquipStats()` / the relevant systems behind a
  `shardBonus()` helper (mirrors `skillBonus()`), so they stack cleanly with gear/vet/runup.

> Build order in code: (1) story/faction/quest **data + save fields + Quest Log UI + intro**,
> (2) **overworld map** showing regions/factions, (3) **elemental regions + wardens** wired to
> quest progression, (4) polish (codex, rep, NPC side quests). Each step validated in isolation
> per the AGENTS_PVE dev workflow (node-check scratch extracts; browser feel-pass with `?fast=1`).
