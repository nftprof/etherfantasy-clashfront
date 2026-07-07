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
   MOBA stays a clean collision — the only in-match economy is **gold to train elites at the command
   center**, and that gold is **match-local / tactical** (it never touches your overworld balance).
   Farming, mining, and crafting happen **only on the overworld map**. This is the clean seam between the
   two games.
2. **Worker ⇄ soldier = ARM / disarm the SAME mon (three-tier progression).** Units climb a tech-tree:
   **WORKER** (unarmed, farms, cheap, *accumulates*) → **ARM it** (craft arms) → **LINE SOLDIER** (armed,
   ~equal strength, consumable) → **train in-battle with gold** → **ELITE** (persists + levels). A worker
   and a line soldier are the *same mon* — no armor vs armed. Idle/unarmed → farms; armed → fights.
   ("When soldiers aren't fighting they farm" = they **disarm back to workers**.) Full model:
   `BATTLE-MAP-AND-UNIT-SPEC.md` §5.
3. **Yes — a three-tier reserve, and workers are the persistent core.** Owner **roster pool** (your
   mons, incl. the worker reserve that survives battles) → **assigned** to land → the **wild reserve**
   (unowned species that spawn on biome maps) → bounded by **world capacity** (14,175). **Pets don't KO**
   — only **Master heroes** KO (7-day CD or pay to revive). A beaten pet just returns to the wild/your
   reserve; you never lose the mon (decision 14).
4. **Rare pets — NFT = a training RIGHT for that class; else catch it wild.** Own the pet **NFT** → you
   can **train that species directly** (in battle or outside), full access. Don't own it → it **spawns on
   maps whose biome hosts it**, and you **recruit the wild version by training it on the map** with gold —
   **richer land can spawn stronger units**. Elites collected this way are hard-won (few per battle);
   **workers you reliably accumulate**. A **swift, decisive win** gives a **chance a wild elite joins free**.
5. **Masterless land defends like wild — AUTO only.** Land worked without a Master is a **passive
   homestead**; when attacked it is **never eligible for command/live mode on defense** — it always
   **AUTO-resolves** (PvE), the unarmed/lightly-armed labor mons fighting weakly. They usually lose, get
   **dispersed back to the wild/reserve** (not destroyed — pets don't KO), and the attacker takes the
   **land + a pillage %** (not the mons). Structures/towers are the only way an uncommanded homestead gets
   real teeth.

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

## 2. The worker ⇄ soldier lifecycle — ARM / disarm the same mon

The roster has **three types**, but the **fielded army is the two-tier LINE / ELITE**
(`BATTLE-MAP-AND-UNIT-SPEC` §5). The worker↔soldier question is only tiers **1 ⇄ 2** — the **same mon,
unarmed vs armed**. **ELITE (tier 3) is always armed** and never disarms to labor:

| Tier | State | Army role | What it does | Cost to enter |
|---|---|---|---|---|
| **1 WORKER** | **unarmed** | — (labor) | **farms / gathers / crafts**; is your **persistent manpower** | cheap + fast to recruit (CT) |
| **2 LINE SOLDIER** | **armed** | **LINE** | fights the front line — **~same strength as a worker**, just combat-ready | **craft arms** (a resource sink) to arm a worker |
| **3 ELITE** | **always armed** | **ELITE** | evolved from a line soldier by **in-battle training** (gold); stays military | expensive + slow; persists + levels |

Rules:

- **"When soldiers aren't fighting they farm" = they DISARM to workers.** There is no separate transform:
  you **arm** a worker to field it as a soldier, and **disarm** it back to farm. So idle soldiers become
  farmers automatically — an unarmed mon on land labors.
- **Arming costs crafted arms (the gate).** Going worker→soldier requires **arms you craft from resources**
  — so a large armed army is a **materials sink**, and you can't instantly arm your whole labor force the
  moment a raid appears (the craft/time is the natural cooldown, and pre-commitment at march time,
  decision 16, still holds on defense).
- **Workers are the reserve that survives.** A battle **ends** holding mostly **workers** (rear/labor role),
  while **line soldiers mostly die** — so your accumulated workers are **re-armed for the next fight**.
  Workers = your standing population; soldiers = the armed, consumable state of it.
- **Aptitude still sets quality.** A mon farms at its **Agriculture** score and fights at its **Military**
  score (`PET-APTITUDE-ECONOMY-MAP` §3) — a Military-heavy mon is a poor farmer, a farmer-type is a poor
  soldier — so you still want a **mix**, and this is why scarce farmers (capacity 1,945) are premium.
- **Upkeep hits standing ELITES**, not workers idling as labor (`BATTLE-MAP-AND-UNIT-SPEC` §5b): elites cost
  food + a little gold/day, so you can't hoard a huge elite army free. Workers feed themselves + produce.
- **This is the land's "population."** A held parcel's assigned mons = its workforce (unarmed) + garrison
  (armed); the land-improvement tier (`LAND-VALUE-AND-IMPROVEMENT.md`) sets how many can work it.

---

## 3. The reserve — three nested pools; workers are the persistent core; pets don't KO

"Is there a reserve?" — **yes, three nested pools**, plus the hard capacity ceiling:

| Tier | What it is | Role |
|---|---|---|
| **① Roster pool** (barracks) | your recruited mons currently **unallocated** — incl. the **worker reserve that survives battles** | your bench — draw from here to arm as soldiers, assign to labor, or march |
| **② Assigned** | mons placed on a parcel (unarmed labor + armed garrison) | the working/defending force on each land |
| **③ Wild reserve** | species **not owned by anyone**, spawning on their biome maps | the source of **wild-recruited** units (§4) and of **enrichment migration** ("a general arrives", decision 13) |

Bounding + safety rules:

- **Workers accumulate; they are the reserve's backbone.** Because they mostly survive battles (§2), your
  roster pool trends **worker-heavy** over time — which you re-arm each fight. Elites are the scarce,
  kept-on-purpose exception.
- **World capacity cap** (14,175 total; per-species caps from `role-scarcity-summary.md`) bounds
  **owned + wild ≤ capacity** for each species. Mythic species cap at ~2 each → the power ceiling is
  structural, not just economic (pairs with decision 17).
- **Pets do NOT KO — only Master heroes do (decision 14, clarified 2026-07-06).** A **Master hero** (the
  hero NFT) that falls is **KO'd** and needs a **7-day cooldown or a paid revive (⚙ ~5 CT)**. **Pet
  units** are population: a beaten pet is **not destroyed** — it **disperses back to the wild or your
  reserve pool**. You lose the **battle / the land / a pillage cut**, never the mon. This is what lets
  masterless land "get slaughtered" (§5) without the owner losing assets.
- **Rented pets** return to the lessor when the rental ends; while rented they occupy the renter's roster
  pool and count against the renter's caps (rental economy, master-summary §6).

### 3a. Land population & the draft cap (ROTK model, owner-decided 2026-07-06)

Each parcel has a **population** — the mons living/working there (this is the same number that gates army
size, farm output, and pet-populace capacity: **one stat**). You **recruit from it, but never drain it**:

- **Draft cap = 50% of current population** (base). A land of **10,000 pop → you may draft 5,000** at once;
  the other half stays home to keep the land alive. (Prevents scorched-earth over-drafting; keeps land a
  renewable source, not a one-shot.)
- **Population regrows over time**, from the post-draft level **back toward its max** (⚙ `popRegrowRate`).
  So draft, wait, draft again — a natural pacing/cooldown on how fast you can field fresh armies.
- **Landowner upgrade raises the ceiling** (the `INVEST_TIERS` land-improvement tier, `LAND-VALUE-AND-
  IMPROVEMENT.md`): a higher tier lifts both the **max population** and the **draftable fraction** (50% →
  up toward 100% at top tiers) — so improved land fields **bigger armies**.
- **Warlord enrichment speeds replenishment.** A warlord **investing (enriching) CT into land** raises
  `popRegrowRate` — so contested/valuable land **refills faster**, letting the holder sustain more battles
  (an enrich sink that buys tempo, decision 13). Owner upgrade = the ceiling; warlord enrich = the speed.
- **The ≥100-pet floor (`minGarrison`, `BATTLE-MAP-AND-UNIT-SPEC` §5c)** is the *minimum* to hold/defend a
  land; the **draft cap** is the *maximum* you can pull for an army — a land operates between the two.

### 3b. Food — produced by farmers, taxed from population, spent as provisions (ROTK model, 2026-07-06)

Food is the resource that ties **farming → war**: it is the army's **upkeep** and its **battle clock**
(`BATTLE-MAP-AND-UNIT-SPEC` §5h). The production → tax → spend loop:

- **PRODUCED** by mons in **worker/LABOR** role on the land, at their **Agriculture** aptitude
  (`PET-APTITUDE-ECONOMY-MAP`) × the land's **food-yield** (biome-set — plains/leaf biomes yield more; §2 of
  the battle-map spec). More farmers (the scarce premium role, capacity 1,945) + better land = more food.
- **TAXED into the land's granary.** As in ROTK, the **landowner sets a tax rate** on population output; the
  taxed share flows to the **granary** (the land's food/gold store). The existing **30% landlord tax**
  (canon decision 6) is the default cut an owner takes from the population/occupiers; ⚙ `foodTaxRate` is the
  owner-tunable dial. **Higher tax = more granary income now, but lower population morale/growth** (the ROTK
  tension — over-tax and the population sickens/stalls, `popRegrowRate` drops).
- **SPENT** three ways: (1) **provisions** loaded onto a marching army = its **battle clock** (§5h; army
  size × march distance sets the load); (2) **upkeep** for standing **elites** (food + a little gold/day,
  `BATTLE-MAP-AND-UNIT-SPEC` §5b); (3) **population growth** — a fed population regrows toward its cap,
  a starved one shrinks. So food is a **throughput**, not a hoard: you farm it, tax it, and burn it on war.
- **Net-sink safe:** food is a **backend resource** (no CT minted); it is produced from land + labor and
  consumed by armies. It makes **farmers valuable** (food gates army projection) without ever paying out CT
  — the on-chain cap (decision 17) is untouched by the food economy.

**⚙ open dials:** `foodTaxRate` (default ~30%), food-yield per biome, provision-load per unit-km, the
morale↔food curve (down to the 10% floor), and the over-tax → morale/growth penalty curve.

---

## 4. Getting units — NFT = a training right for the class; else catch/recruit it wild

Two acquisition paths (the pet **NFT is the class, not an individual unit** — clarified 2026-07-06):

**Path A — own the pet NFT → train that class directly.** Holding (or renting) a species' pet NFT is a
**training right**: you can **recruit/train that species deliberately** — in a battle *or* outside on the
overworld — instead of waiting for it to spawn. It buys **guaranteed access + composition control**, not
per-unit power. This is the premium path (skip the RNG hunt).

**Path B — catch/recruit it in the wild (the F2P grind).** A species you don't own **spawns on maps whose
biome hosts it** (§2 biome pools); you recruit the **wild version by training/recruiting it on that map**
(gold — "they're wild here; you have gold, so they come work for you"). Bounds + flavor:

- **Gold-capped supply, richer land = stronger spawns.** Each map's **finite gold** caps how many wild
  units you can train per battle (the same finite-gold rule as §1). And **more expensive / higher-tier
  land has a chance to spawn STRONGER units** — so rich land is also the better **hunting ground**.
- **Post-battle, per trained unit — inventory it OR release it for its gold.** At battle end you either
  **add the trained unit to your roster** (continuity — it persists) **or release it** and **strip the gold
  it carries**, booting it back to the wild (`BATTLE-MAP-AND-UNIT-SPEC` §5b). So a battle is **not** a free
  unit factory — keeping a unit is a real cost/roster decision, not automatic.
- **Elites are hard-won; workers accumulate.** You'll usually collect **few elites** per battle (they're
  expensive + slow to train), but your **workers reliably survive and pile up** — the manpower loop.
- **Swift-win bonus (⚙).** Win **quickly and decisively** (not stalling to farm the map) → a **chance a
  wild version of an elite on that map joins you for free**. Rewards clean wins over grind-stalling.
- **Outside recruiting = the overworld alternative** (`BATTLE-MAP-AND-UNIT-SPEC` §5b): **worker** fast+cheap
  (then arm it), **pre-armed soldier** fast but expensive, **elite** slow but cheaper than in-game training —
  so you can pre-build an elite core to bring to battle.
- **DNA-fragment path stays.** Separately, battle-kill enrichment can drop **pet-DNA fragments** (decision
  13) → craft toward a **rarer** pet NFT (the path to *rank*, master-summary §8).

**Net:** own the NFT to **train the class on demand**; grind its biome to **catch the wild version** (few
elites, steady workers, gold-bounded); land tier raises spawn strength; DNA-craft earns **rank**. Every
path is gold/capacity-bounded, so none prints free power (decision 17 holds).

---

## 5. Masterless farming-land — "defends like wild", and how the battle ends

Owner's case: land can be **held and farmed without a Master** (mons in unarmed **worker/labor** state, no
commander present). "These lands can be attacked but they defend like wild does… no-master player can't
command it, it just gets slaughtered." Resolution:

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
  resources (decision 17-bounded). The defending **mons are dispersed back to the wild / the owner's
  reserve pool** — **pets don't KO** (§3), so **the owner loses the land and a resource cut, never the
  mons.** This is precisely the "passive homestead / walk-on take-over returns the pet home" rule of
  decision 14, now generalized to a labor force.
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
| Worker ⇄ soldier | **ARM / disarm the same mon** (three-tier: worker→arm→soldier→train→elite); unarmed farms, armed fights; arming = a craft/arms sink | this doc §2; `BATTLE-MAP-AND-UNIT-SPEC` §5 |
| Reserve | **Roster pool (worker-heavy) → assigned → wild reserve**, capped by world capacity; **pets don't KO** (only Master heroes do) | this doc §3; decision 14; `role-scarcity-summary.md` |
| Getting units / rare pets | **Own NFT = train the CLASS on demand**; else **catch it wild** (biome spawn, richer land = stronger, gold-bounded, inventory-or-release, swift-win bonus); DNA-craft earns **rank** | this doc §4; `BATTLE-MAP-AND-UNIT-SPEC` §5a/§5b; decision 13 |
| Masterless land | **AUTO/PvE only, no command/live on defense**; ends by standard settlement; land+pillage lost, mons **disperse home (never KO'd)**; harden with structures/Master | this doc §5; decisions 14, 15 |

**Open ⚙ dials to tune later:** the **arms cost** to convert worker→soldier, per-battle **wild-recruit cap**
and its gold curve, the **swift-win elite-join chance**, elite **upkeep**, and the homestead structure-HP
that makes an uncommanded defense viable. All are numbers, not new mechanics.
