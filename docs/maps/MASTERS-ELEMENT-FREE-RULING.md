# Masters are ELEMENT-FREE — owner ruling (2026-07-10)

> **CF Overworld design → Map-maker session** (re `PET-AND-MASTER-HOMES.md` §3) **+ all sessions.**
> Owner ruling that settles the "Master vs element" question — and **dissolves your §3 blocker**.

## The ruling (owner, verbatim intent)

- **Masters have NO element and NO type advantage of their own.** Think **LoL / AoV**: champions have no
  elemental wheel between them. **Hero-vs-hero (Master-vs-Master) combat is element-free** — decided by
  kit/skill/level, never by an element matchup.
- **All elemental type-advantage lives in the PETS.** Pets keep their fixed elements (Addendum-E wheel,
  pet-vs-pet); the player plays the element game through **pet selection** — which fixed-element beasts
  they bring to the fight.
- **A Master commands whichever type of beast you give it.** Command is fully unrestricted — no
  element-locked rosters, no per-element command scopes.

## What this changes, per doc

| Doc / concept | Before | Now |
|---|---|---|
| **`PET-AND-MASTER-HOMES.md` §3** — `masterHome = primaryZoneOf(master.element)` | blocked on a 47-Master element list | **blocker DISSOLVED — Masters have no element.** Master homes can't be element-derived; they become **lore/owner-assigned** (or simply unset until the owner names hometowns). **§1–§2 (pet element→zone ladder + populations + rarity gates) stand unchanged** — they're pet-side and correct. |
| The "Master **buffs its matching element**" gameplay note | one-bloodline buff | **dropped** — no element buff exists on Masters |
| `BATTLE-MAP-AND-UNIT-SPEC.md` §5c alignment synergy | Master↔element↔land pairing bonus | re-scoped to **UNITS ↔ LAND only** (pets fight/farm/recruit better on their element's biome — the Species-Affinity factor already in the pet power formula). The Master contributes **leadership**, not element. |
| Canon **decision 14** lone-Master **DUEL** odds ("rating × Addendum-E element wheel × ⚙ chance") | element wheel factored into duels | **element-wheel factor dropped** — duels are **rating-based** (hero-vs-hero is element-free) |
| The 47-row `Master → element` data ask | needed from owner/backend | **no longer needed** for gameplay. (If the character NFTs carry a cosmetic element in metadata, it's flavor only.) |

## Why (the design logic)

Keeping Masters element-free keeps **hero battles pure MOBA** (the EF client's existing hero-vs-hero feel —
no rock-paper-scissors between champions) and pushes **all strategic element play into the army-building
layer** (pet selection vs. the defender's pets + the land's biome), where the collection/NFT economy lives.
One element system, one home for it: the pets.

## Net asks

1. **Map-maker:** keep §1–§2 of `PET-AND-MASTER-HOMES.md` as-is (pet ladder + populations + rarity gates =
   adopted); strike/revise §3's element-derived Master homes — Master hometowns become an **owner lore
   pass** later, nothing blocks on it.
2. **MOBA/engine:** no element modifiers in Master-vs-Master interactions; pet-vs-pet keeps the wheel.
3. **CF (this session):** §5c updated; decision-14 duel factor superseded (noted in canon).

## ✅ CLOSED — the lore pass is DONE (2026-07-10, live at etherfantasy.com/world)

> **Count correction (owner):** there are **52 Masters** (the spread below sums to 52) — the 47-row
> `CHARACTER_ROSTER.csv` is stale by 5. SoT for the roster = the live site / `masterHomes.json`.

The website session delivered the **final Master-homes pass** (their commit `e1e5872`) — homes are
**lore/story-assigned**, exactly per this ruling. **Source of truth: `src/data/masterHomes.json` in the
fe-website repo** (one-line edits to move anyone). Highlights:

- **Final spread (52 Masters):** Tianxia 7 · Mythoria 7 · Porthaven 5 · Arcadia 5 · Aeropolis 3 ·
  Emberfall 7 · Empyrea 4 · Ironhold 4 · Blackmere 4 · Luxuria 5 · Fortuna 1 — **every battle realm
  populated, no zone empty or bloated.**
- **Story calls:** Blis→Luxuria (the sin of pleasure) · Dragon Cho→Emberfall (roosts the volcanic sky
  isle) · Choco→Mythoria · Agena→Empyrea (a star for the sky apex) · **Eldora→Fortuna** (El Dorado on
  Fortune's isle — the prestige isle's **first resident**). Kept: Kuman = Luxuria's greatest treasure
  (#1 Mythic in the deepest vault); **two dragon courts** (Cho above/Emberfall, Cor below/Luxuria);
  Waldo in Tianxia's biggest crowd.
- **Olympus stays MASTERLESS by design** — the founders' isle; *founders are people, not masters.*
- The world model is coherent: **pets carry the elements, masters carry the stories, every land has both.**
