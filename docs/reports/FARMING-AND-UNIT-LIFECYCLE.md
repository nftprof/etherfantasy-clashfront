# Farming, the Worker↔Soldier Lifecycle, and Masterless Land (design answers)

> Owner asked (2026-07-06) five interlocking questions: (a) how do soldiers ↔ farmers convert; (b) is there
> a **pet reserve/pool**; (c) how do you get **rare pets** — summon the NFT vs. battle-train wild footmen;
> (d) do players **farm inside the MOBA match** or only outside; (e) how does **masterless farming-land**
> that "defends like wild" get attacked and how does such a **commanderless battle end**. Decisions below
> are ⚙ starting rules, grounded in the unit model (`BATTLE-MAP-AND-UNIT-SPEC.md` §5), the pet aptitude
> engine (`PET-APTITUDE-ECONOMY-MAP.md`), and canon decisions 9 (2-class cap / one-hero), 14 (lone
> occupations / passive homesteads / pets-never-lost), and 17 (net-sink security invariant).

---

## 0. TL;DR

1. **No farming inside battle.** Confirmed: units come **pre-provisioned** (they carry their food). The
   MOBA stays a clean collision — the only in-match economy is **gold to hire elites at the command
   center**, and that gold is **match-local / tactical** (it never touches your overworld balance).
   Farming, mining, and crafting happen **only on the overworld map**. This is the clean seam between the
   two games.
2. **Soldiers ↔ farmers = a STANCE, not a transform.** A pet is one entity with an aptitude vector; on land
   it holds a **stance** — `GARRISON` (soldier: defend/train) or `LABOR` (farm/craft/gather). Idle armies
   default to `LABOR`, so they aren't wasted — but a Military-heavy pet farms at its low Agriculture score.
   The incentive to hold a **mix** falls straight out of the aptitude sheet. Flipping stance has a
   **cooldown** so you can't dodge a raid by instantly re-tasking.
3. **Yes — a three-tier pet reserve.** Owner **roster pool** (owned/rented, unallocated) → assigned to land
   → the **wild reserve** (unowned species living in biomes; the enlist + migration source) → bounded by
   **world capacity** (the ecological cap, 14,175). Pets are **never lost**: KO'd pets auto-return to the
   roster pool to recover (decision 14).
4. **Rare pets — two paths.** Own the **NFT** → summon it directly at full rank power (premium). OR
   **battle-enlist**: grind maps in that species' biome, train a **bounded, gold-capped** few wild
   footmen/archers of that species into your roster — but enlisted wild units are **common-rank** (no
   rarity multiplier). NFT keeps its value (rank = real power); F2P gets a slow collection grind.
5. **Masterless land defends like wild — AUTO only.** Land worked without a Master is a **passive
   homestead**; when attacked it is **never eligible for command/live mode on defense** — it always
   **AUTO-resolves** (PvE), the labor-pets fighting at their weak Military aptitude. They usually lose,
   **KO → auto-return home** (never destroyed), the attacker takes the **land + a pillage %** (not the
   pets). Structures/towers are the only way an uncommanded homestead gets real teeth.

---

## 1. No in-battle farming — units carry their food (the clean MOBA seam)

Owner's ruling, adopted: **a battle unit comes with its food; you do not build a farm on the spot like
StarCraft.** So:

- **Provisioning is paid at MARCH time, on the overworld.** When you raise/march an army you spend the
  overworld resources (CT for line, gold for elites, food as upkeep). The army "carries" that — the match
  never asks you to gather it again.
- **The only in-match resource is GOLD, and it is match-local.** Battlefield gold tiles + the command
  center exist so you can **hire elites mid-match** (`BATTLE-MAP-AND-UNIT-SPEC` §5). This gold is
  **tactical scrip**: it is spent inside the match and **does not add to your overworld gold/CT balance.**
  You don't "mine to get rich" during a fight — you mine to **out-produce the enemy in this fight.**
- **Overworld resource rewards come from the OUTCOME, not from harvesting mid-match.** Win → you gain the
  **land** and a **pillage %** of the loser's stored materials (decision 17-bounded); the land then yields
  on the overworld over time. Mining/farming/crafting for your balance is **100% an overworld activity.**
- **Why this is correct:** it keeps the MOBA a pure battle engine (no economy minigame bolted into a
  10-minute fight), keeps the two-layer money model honest (CT/gold sinks live on the overworld where the
  security invariant can account them), and still lets the in-match command-center economy matter
  tactically. The layers combine through **line soldiers** (drafted outside, fielded inside), not through
  in-match farming.

> Supersedes the earlier exploratory "you can mine resource while you play the 3D hero map" note — mining
> for your balance is overworld-only; in-match gold is tactical and non-persistent.

---

## 2. The worker ↔ soldier lifecycle — STANCE on one pet (not a conversion)

A pet is **one entity** with a fixed aptitude vector; it can perform any role but **excels at its dominant
one** (`PET-APTITUDE-ECONOMY-MAP` §3). So there is **no "convert a soldier into a farmer"** transform — you
**re-task the same pet** by setting its **stance** on the land it's assigned to:

| Stance | What the pet does | Rate driver |
|---|---|---|
| **GARRISON** | stands as a **soldier** — defends the land, trains (gains Experience), can be marched | its **Military** aptitude × rank × formula |
| **LABOR** | **farms / gathers / crafts** — produces overworld resources | its **Agriculture / Industry / Logistics / Arcane** aptitude × rank × formula |

Rules:

- **Idle → LABOR by default.** "When soldiers aren't fighting, are they farming?" — **yes.** An army sitting
  on owned land with nothing to do auto-drops to `LABOR` so it produces instead of idling. But a
  Military-heavy pet farms at its **low** Agriculture score (e.g. Military-100 / Agri-18 → a poor farmer),
  so idle soldiers are **weak farmers** — the game nudges you to hold a **mix** (real farmers + real
  soldiers) rather than one uber-army that also feeds itself for free.
- **Stance flip has a cooldown (⚙ `stanceSwitchCooldown` ≈ ½–1 world-day).** You cannot see a raid inbound
  and instantly flip your whole labor force to soldiers (or vice-versa to dodge losses). Commit ahead of
  time — this is what makes garrisoning a **real defensive choice** and keeps the march-time
  pre-commitment (decision 16) meaningful on defense too.
- **Upkeep applies to GARRISON, not idle LABOR.** Standing soldiers cost **food upkeep** (`BATTLE-MAP-AND-
  UNIT-SPEC` §5b) — so a large standing army is a **food sink**, which is exactly why scarce farmers
  (capacity 1,945, the premium role) matter. Labor pets **feed themselves** and produce surplus.
- **This is the "population" of the land.** A held parcel's assigned pets = its garrison + workforce; the
  land-improvement tier (`LAND-VALUE-AND-IMPROVEMENT.md`) sets how many can work it and how much they yield.

---

## 3. The pet reserve — three tiers + the never-lost rule

"Is there a reserve of pets?" — **yes, three nested pools**, plus the hard capacity ceiling:

| Tier | What it is | Role |
|---|---|---|
| **① Roster pool** (barracks) | pets you **own or rent**, currently **unallocated** | your bench — draw from here to assign GARRISON/LABOR or to march. KO'd pets return **here** to recover. |
| **② Assigned** | pets placed on a specific parcel with a stance | the working/defending force on each land |
| **③ Wild reserve** | species **not owned by anyone**, living in their biomes | the source of **battle-enlistable** units (§4) and of **enrichment migration** ("a general arrives", decision 13) |

Bounding + safety rules:

- **World capacity cap** (14,175 total; per-species caps from `role-scarcity-summary.md`) bounds
  **owned + wild ≤ capacity** for each species. Mythic species cap at ~2 each → the power ceiling is
  structural, not just economic (pairs with decision 17).
- **Pets are NEVER destroyed (decision 14).** A pet KO'd in any battle — as a marched soldier, a homestead
  defender, or a lost duel — **auto-returns to your roster pool (①) and recovers** on a cooldown. You lose
  the **battle / the land / a pillage cut**, never the NFT. This is what lets masterless land "get
  slaughtered" (§5) without the owner losing assets.
- **Rented pets** return to the lessor when the rental ends; while rented they occupy the renter's roster
  pool and count against the renter's caps (rental economy, master-summary §6).

---

## 4. Getting rare pets — own the NFT (summon) vs. battle-enlist (train-to-collect)

Two acquisition paths, adopting the owner's idea and resolving the "disperse-all vs keep" fork:

**Path A — own the NFT → summon directly.** If you hold (or rent) the species NFT, you can **field it at
will** up to your cap, at its **full rank** (×1.0–×2.2). This is the premium, instant, full-power path —
and the reason NFTs hold value.

**Path B — battle-enlist (the F2P grind).** On a battle map whose **biome hosts a species** (§2 biome
pools), wild **footmen/archers of that species spawn as neutral/enlistable units**. By fighting **and
training** them during the match you can **enlist a bounded few into your post-battle roster** — an
alternative to buying the NFT. Bounds that keep this from breaking the economy:

- **Gold-capped supply.** Each map's **finite gold** caps how many wild units exist and how many you can
  train/enlist per battle (the same finite-gold rule as §1 / `BATTLE-MAP-AND-UNIT-SPEC` §1). Grind a rich
  biome map repeatedly and its enlistable pool **depletes until re-seeded** — no infinite unit printer.
- **Enlisted = COMMON rank, no multiplier.** A battle-trained wild unit joins at **common (×1.0)** — it is
  *a* member of that species, but **not** the rank/rarity power the NFT carries. Rank (real power, ×2.2
  mythic) stays **exclusive to owned/minted NFTs**, so the collection economy is preserved.
- **Most trained units disperse; a bounded few stick (the resolved fork).** Owner raised "vs. at end of
  battle all trained units are dispersed." Ruling: **HYBRID.** The bulk of what you train is **tactical and
  disperses at battle end** (they were this-fight mercenaries). But a **small, gold-bounded number can be
  permanently enlisted** if they **survive** and you have **roster/cap space** — routed through the existing
  **post-battle survivor fate** (`BATTLE-MAP-AND-UNIT-SPEC` §5b: release / put-to-work / retain, under the
  2-class cap). So a battle is **not** a free unit factory (that would violate the net-sink), but it **is** a
  slow, honest grind toward owning a species without paying — which is exactly the F2P on-ramp we want.
- **DNA-fragment path stays.** Separately, battle-kill enrichment can drop **pet-DNA fragments** (decision
  13) → craft toward an actual **rarer** pet NFT. Battle-enlist gets you the **species at common rank**;
  DNA-craft is the path to **rank**. Two grinds, two payoffs.

**Net:** own the NFT for **instant + full rank**; grind the biome to **slowly collect the species at common
rank**; grind + DNA-craft to **earn rank**. Every path is gold/capacity-bounded, so none of them prints
free power (decision 17 holds).

---

## 5. Masterless farming-land — "defends like wild", and how the battle ends

Owner's case: land can be **held and farmed without a Master** (soldiers set to `LABOR`, no commander
present). "These lands can be attacked but they defend like wild does… no-master player can't command it,
it just gets slaughtered." Resolution:

- **A masterless homestead is never eligible for COMMAND or LIVE mode on defense.** Command/live is a
  Master embodying a hero (decisions 9, 15, 16); with **no Master on the land there is nobody to embody**,
  so the defense is **always AUTO / accelerated** — a PvE resolution, exactly like attacking wild land.
  (The **attacker** may still have elected command for *their* side; the fight is live for them and
  watch-only/auto for the undefended land.)
- **The labor force fights at its weak Military aptitude.** Farmers/crafters standing on the land defend at
  their **low** Military score → an undefended homestead **usually loses** ("gets slaughtered") unless it's
  been hardened. The AUTO battle runs the normal sim: troops collide, casualties apply, it **ends by the
  standard settlement** — one side eliminated or the core/objective taken — and settles on the usual battle
  callback. No commander is required for the sim to terminate; **AUTO resolution IS the terminal state.**
- **On loss:** the **land flips** to the attacker and the attacker takes a **pillage %** of stored
  resources (decision 17-bounded). The defending **pets KO → auto-return to the owner's roster pool to
  recover** (§3, decision 14) — **the owner loses the land and a resource cut, never the pets.** This is
  precisely the "passive homestead / walk-on take-over returns the pet home" rule of decision 14, now
  generalized to a labor force.
- **How an uncommanded homestead gets real teeth (the counterplay):**
  1. **Assign a Master** → it becomes a defended holding (garrison + optional command/live/standing-orders
     DUEL/STAND/FLEE per decision 14).
  2. **Build structures** (walls/towers/traps, `INVEST_TIERS`) → the AUTO defense fights *with* fortress
     HP/damage, so even commanderless land can repel a weak raider (structures are the homestead's
     substitute for a commander).
  3. **Keep a stronger LABOR mix** → higher-Military pets in LABOR still defend better than pure farmers.
- **Both sides masterless / AI-only** (e.g. an auto-march hitting wild land) → fully **AI-vs-AI
  accelerated**, same sim, no live option, settles on the callback. This is already how pure-AI battles
  resolve today (decision 15).

**So "defends like wild" is literal:** masterless land uses the **exact wild/PvE AUTO path** — no command,
no live, no hero doorway on defense; it settles by elimination/objective like any AUTO battle; the owner
risks the land + a pillage cut but **never the pets.**

---

## 6. Where these decisions land in the model

| Question | Decision | Home doc |
|---|---|---|
| Farm inside the match? | **No** — units pre-provisioned; in-match gold is tactical/non-persistent; farming is overworld-only | this doc §1; `BATTLE-MAP-AND-UNIT-SPEC` §1/§5 |
| Soldier ↔ farmer | **Stance** (GARRISON/LABOR) on one pet, cooldown-gated; idle → LABOR at weak aptitude | this doc §2; `PET-APTITUDE-ECONOMY-MAP` §3 |
| Pet reserve | **Roster pool → assigned → wild reserve**, capped by world capacity; pets never lost | this doc §3; decision 14; `role-scarcity-summary.md` |
| Rare-pet acquisition | **NFT summon (full rank)** or **battle-enlist (common rank, gold-bounded, mostly disperses)** or **DNA-craft (earns rank)** | this doc §4; `BATTLE-MAP-AND-UNIT-SPEC` §5a/§5b; decision 13 |
| Masterless land | **AUTO/PvE only, no command/live on defense**; ends by standard settlement; land+pillage lost, pets KO→home; harden with structures/Master | this doc §5; decisions 14, 15 |

**Open ⚙ dials to tune later:** `stanceSwitchCooldown`, per-battle **enlist cap** and its gold cost curve,
the **retain fraction** of trained wild units, and the homestead structure-HP that makes an uncommanded
defense viable. All are numbers, not new mechanics.
