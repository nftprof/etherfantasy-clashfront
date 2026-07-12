<!-- SOURCE OF TRUTH: the EF Hunt session's local doc (EF Moba\TRAVEL_SYSTEM.md).
     Owner: the Hunt team. Mirrored into the hub so CF sessions (overworld, Agent D) can read
     the travel canon — esp. §4b THE ROUTE CANON + §5b THE DRAG ARC (kraken links). Ask the
     Hunt×Map sync session for updates; do not edit here. Mirrored 2026-07-12. -->

# EF HUNT — THE VOYAGE SYSTEM
*The cart game, generalised. **Every crossing is dealt, never scripted.***

> **The rule:** *"Every travel shouldn't be a canned experience."*
> Late-FF summon fights are canned because the **encounter is authored**. Ours isn't — we author the
> **decks**, and the crossing is the **hand**. Same code, never the same voyage.

---
## 1. THE VESSEL — you stand ON it, you can fall OFF it
The cart was a rail. **A vessel is a moving floor with edges.**

| Vessel | Deck | Walk? | Medium | Falling off means |
|---|---|---|---|---|
| **Cart** | 2×3 | shuffle only | LAND | tumble, damage — **the cart rolls on.** Chase it or lose the cargo. |
| **Gondola** | narrow | rock, careful | WATER (canal) | soaked, embarrassing, fish it back |
| **Bone-cart** | 3×4 | yes | LAND (UW2) | the shades are *right there* |
| **Punt** | flat, no rail | yes | BLACK WATER | **something is under it** |
| **SHIP** | **large, multi-level** — deck, rail, mast, hold | **fully** | SEA | **OVERBOARD** → §5 |
| **AIRSHIP** | large, open gunwales | **fully** | SKY | over sea → water · **over land → you die** |

**The deck is a real physics floor.** It **pitches and rolls** with the sea state. It has **friction**
that rain lowers. Loose things — barrels, cargo, *you* — **slide downhill.** Nothing about this is a
cutscene; it's just a moving platform with honest physics, which is why it never feels canned.

---
## 2. THE DECKS (what gets dealt every crossing)

**1 · HOUR** — dawn / day / dusk / **night**
**2 · WEATHER** — clear · **rain** · **storm** · fog · ash-fall · **lightning**
**3 · STATE** — calm · choppy · **rough** · **violent**
**4 · ENCOUNTERS** — draw 1–3 from the medium's table (§4)
**5 · TWIST** — ~25%: **one rule changes** (§6)

### How they bite (this is the whole design)
| Card | It changes the *mechanics*, not the scenery |
|---|---|
| **NIGHT** | you throw at what you can't see. Only silhouettes and sound. |
| **LIGHTNING** | the world is **black, then white**. Each flash **freezes the monster's position for one instant** — you must throw *from memory*, in the dark, at where it was. |
| **RAIN** | **deck friction drops.** You slide. Your throws are shorter. |
| **STORM / WIND** | ⚡ **the ballistic arc bends.** The landing circle drifts. You must lead the wind. *This is the single best use of the grenade system we built.* |
| **FOG** | you **hear** it before you see it. Audio-led targeting. |
| **ROUGH / VIOLENT SEAS** | the **deck pitches and rolls** — your landing circle swings with the horizon. Throw on the *upswing*. Loose cargo becomes a hazard. **You can be thrown off.** |

> **The combinations are the content.** *Night + fog + rough seas* is a horror scene.
> *Lightning + violent + Kraken* is the best fight in the game. We wrote neither of them.

---
## 3. WIND — the mechanic that makes the throw deeper instead of repeated
A live wind vector (direction + strength), visible in rain-streaks, smoke, flags, and the sea.
It **bends the arc** and **drags the landing circle**. Crosswind on a pitching deck at night is a
genuinely different skill from lobbing an apple at a lamp-post — **using the same code we already have.**

---
## 4. ENCOUNTER TABLES (draw 1–3; some rare; **many are not fights**)

### 🌊 SEA
- 🐙 **THE KRAKEN** — stat-matched. **Harpoons instead of apples.** Kill or survive the timer.
  ✅ **TWO KRAKENS, KEYED TO THE WATER (confirmed, hub `da0526e`):** the **regular Kraken** haunts the
  blue surface seas (any SEA_PORT leg); the **🌋 LAVA KRAKEN** — molten/obsidian, rising from lava-lit
  black water — guards the **Vault-Gate crossing** into Luxuria (UW2→UW3, the mist-sea behind the gate).
  One archetype, two biome skins. *Blue seas above, lava seas below — the mirror again.*
- A **wreck** — loot it… or it's bait.
- **Becalmed** — no wind, no sound. Something circles. *Nothing happens.* (Let it. Not every hand is a fight.)
- **A whale-pet** — enormous, peaceful, **catchable**. The rarest catch in the game.
- **Pirates** — they board. Now it's a fight **on your deck**, and the deck is pitching.
- A **floating market** — buy, sell, gossip. A safe hand.
- **A drifting banquet table**, still laid. (Blackmere is leaking.)
- **A passenger** in the water, begging. *(Twist material.)*

### ☁️ SKY (under the clouds)
- **Flying pets** attack — **and you catch them mid-air.** Travel is a hunting ground.
- **A storm cell** — go around (slow, costly) or through (violent + lightning).
- **Sky-serpent** — coils the hull.
- **A falling airship** — someone else's. Rescue them, or scavenge.
- **A flock** fouls the propellers — you must **go out on the hull** to clear them. Fall = land = death.
- **A break in the cloud** — an island no map shows. Land on it?

### 🛞 LAND
- **Bandits** race alongside — throw at *them*, or at their wheels.
- A **collapsed bridge** — the cart doesn't stop.
- A **pet herd** crossing — catch on the move.
- A **rival cart** — an actual race.
- A **wayshrine** — a free blessing, if you can hit the bowl from a moving cart.

---
## 4b. 🗺 THE ROUTE CANON (confirmed contract — hub `HUNT-MAP-INTEGRATION-ANSWERS.md`)
Where the dealer may deal. The map data is the law; the crossings are ours:

- **SEA:** **any SEA_PORT pair is a legal voyage leg** — no rigid lane list; the featured lanes in the
  overworld spec are just the marked ones. Regular Kraken water.
- **AIR:** **surface → HS1 Aeropolis (the Gate to Heaven) → HS2 Emberfall → HS3 Empyrea. ONLY.**
  No surface→HS2/HS3 shortcut exists. HS2↔HS3 is the **War of the Sky Throne** (contested — expansion
  content, see `SKY_EXPANSION.md`).
- **LAND:** the three starter zones river-gate into **Tianxia (HUB)** only — never each other. A land
  journey between starters passes through Tianxia or goes by sea.
- **DOWN (story):** the **Diminishing Stair** (ENT→UW2) — single file, one soul, never a vehicle.
- **DOWN (cycle 2+):** **the freight platform down THE SHAFT** (`HUB-SHAFT`, Dragonmaw caldera) —
  **Tianxia → Ironhold (UW1) → Blackmere → Luxuria.** It lands in UW1 FIRST. Boss-gated per tier
  (the Shaft-Guardian). This is a travel leg like any other: dealt weather, dealt encounters, a
  descending platform instead of a deck.
- **DOWN (taken):** **THE KRAKEN DRAG** — sea Kraken → dragged to UW2; lava Kraken → dragged to UW3.
  Involuntary, unmarked, and the only door that opens from the middle of the ocean. See §5 OVERBOARD.
- **UW2→UW3:** **through the Vault Gate by SHIP** — the gate opens onto water; the mist-sea crossing
  behind it is ours. Lava-Kraken water.
- **The catch tool is the NET** — Ether Nets, thrown on the same ballistic arc. Travel legs are hunting
  grounds (§4 sky/sea pets); **the throw is the catch** — one system everywhere.

---
## 5. ⚓ OVERBOARD — failure branches the world instead of reloading
**This is the anti-canned centrepiece.** Falling off is not a game-over screen.

- **SEA →** you go under. The current takes you. **You wash up on a random coastal parcel** — alive,
  soaked, **without your ship**, possibly without your cargo. Now **travel overland.**
  *The fail-state of travel is more travel.* The world is real enough to be lost in.
- **SEA, during a KRAKEN encounter → 🐙 THE DRAG (author canon, 2026-07-12).** The Kraken does not
  sink you — **it takes you.** Go under in its fight and you do not wash up on a beach: **you wake in
  BLACKMERE (UW2)**, shipless, in the drowned deep. The **lava Kraken** at the Vault-Gate crossing
  drags you through to **LUXURIA (UW3)**. This is the deep's THIRD door — *chosen* (the Stair),
  *industrial* (the Shaft), **taken (the Kraken)**. The overworld map draws these as the kraken links.
  It is not a death; it counts nothing on the ladder — **it is a place.** Getting home is the problem.
  **→ The full designed arc is §5b. The first drag is AUTHORED, not random.**

---
## 5b. 🐙 THE DRAG ARC — the bait, the taking, and the expensive way home (author, binding)
> ⏱ **TIMING (author ruling, 2026-07-12): the Drag Arc is ACT IV content — post-return, after the
> player has escaped the Underworld entirely.** It must NOT occur pre-Crossing: up to EP4 there is no
> open-sea travel at all (the only water is the EP2 gondola), and EP4 via the Stair must remain the
> player's true first entry into UW2. Pre-Crossing, the deep appears only as **THE DREAM** (below).

**0 · THE DREAM (pre-Crossing foreshadow — EP2, the gondola).** On the story's one water leg, the
player drifts off: black water, something vast beneath the hull, a half-second at a mist-shrouded
camp among queued souls — then wakes on the gondola, Ayume laughing at them for dozing. Zero economy,
one canned scene. It plants the kraken in the player's head before it exists in the world, and makes
EP4's real arrival land as *"I have seen this place."*

**1 · THE BAIT — repeatable sea contracts, intentionally over-rewarded (Act IV).** When the world
opens, port-to-port quests (courier, trade, escort) appear with **visibly above-average CT/gold
rewards** — generous enough that sailing becomes the obvious way to get ahead. The player should
*feel clever* for grinding them. The income and the sink arrive together — the faucet and the drain.

**2 · THE TAKING — never the first crossing.** The first voyages are business as usual — the sea
pays, the routine settles in. The story is over; the deep is a closed chapter. **Around the THIRD
sea crossing** (seeded window, ~3rd–5th leg; a scripted event, not a random card), the Kraken comes —
and this hand is not survivable in the usual way. **The player is dragged back to UW2** — shipless,
in a place they thought they were done with. **Complacency is the trigger: it fires exactly when
travel has become routine and the underworld feels like history.** They know the rules down there —
that is what makes it dreadful rather than confusing.

**2b · THE LANDING — not by the exits. An EPISODE to get out (author, 2026-07-12).**
The kraken does not deposit you anywhere near the Stair-foot or the gates. You surface in a part of
UW2 **the story never showed you — far more dangerous than you ever imagined it could be.**
- **The enemies are tuned like a loop-5 deep met on loop 1-2.** Unwinnable by design, and *readably*
  unwinnable — the player's correct move is the one the game taught in the first fog: **RUN.** You
  can barely get away; any direction you push, the world pushes back harder.
- Every direction kills — **except one: a dark tunnel mouth, wind moaning out of it, sloping down
  into black.** The game asks, plainly: *"It's dark. It's windy. It slides down. — Will you go
  down?"* (The Cut's question, again — in this world the way out is always consent, and always
  down first.)
- **The chute is ONE-WAY.** You slide — no climbing back, no second thoughts — and it spits you out
  near the known exits (the Stair-foot side). From there the toll home (§3) applies as normal.
  The whole sequence — surfacing, the flight, the tunnel, the slide, the toll — is **an authored
  escape episode**, not a fast-travel back.
- **On later cycles it inverts:** the landing region persists as real geography, and a stronger
  player can return and **fight through it** — the place that once only spat you out becomes
  endgame hunting ground. *(Proposed overlay names, pending Agent D: `hunt.undertow` — the drowned
  shelf where the kraken leaves its catch, somewhere in UW2's far east beyond the story's reach —
  and `hunt.sluice` — the one-way chute. Exact anchors to be picked from the UW2 field.)*

**3 · THE WAY HOME — an intentional CT sink. Two doors, both expensive:**
| Route | What it costs |
|---|---|
| **Up the Stair (at the Stair-foot)** | collect X items/artifacts (a dangerous fetch, deeper into Blackmere) **or pay CT** to be let up — single file, the toll of the one-soul door |
| **The official gates ("the double gate")** | **Blackmere's Gate** (UW2→UW1) then **up the Shaft** (UW1→Tianxia) — a toll at EACH gate, freight class, past the wardens |

**⚖ THE CALIBRATION LAW (binding):** *whichever door they take, the total cost of getting home is
MORE than the accumulated profit of the sea contracts that baited them there.* The sink eats the
bait plus a margin. This is deliberate — it is the Golden Rule (never net more than you spend)
taught as a lived event: **the deep is not a place you visit for free.** (The rice they must eat
while stranded adds to the bill — the pressure that makes them pay QUICKLY rather than grind out.)

**4 · AFTER —** they got out. Poorer, rattled — and now they know the sea remembers them. The
contracts remain (still generous, still repeatable); later drags are rare random cards, real but
uncommon. **The ocean never becomes safe again — that's the point.** The deep was never done with
them; it keeps everyone who has ever been down on retainer.
- **SKY over sea →** the long fall, then water. Same.
- **SKY over land →** **you die.** Real. It counts on the death ladder. *(This is why the airship is
  frightening and the ship is not.)*
- **CART →** you tumble, take damage — **and the cart keeps rolling.** Sprint after it, or lose what's on it.
- **RESCUE:** a rope, a hand, a rail caught at the last frame. Always *possible*, never *given*.

---
## 6. 🎲 THE TWIST (~25% — one rule changes, and only one)
- The **lantern goes out.** (Now it's a night crossing.)
- **A pet has stowed away.** It's been eating the cargo.
- **A passenger is not what they seem.** They've been aboard a while.
- **The wind reverses** mid-crossing. Every throw you've learned is wrong.
- **A second ship** is following. It has been for a day.
- **The cargo is alive.**
- **Someone is already at the wheel.**

---
## 7. BUILD PLAN
1. **`VESSEL`** — walkable deck platform: bounds, rails, friction, **pitch/roll from sea state**, slide.
2. **`VOYAGE`** — the dealer: draw hour/weather/state/encounters/twist; seeded per leg so a crossing is
   *reproducible* but never *repeated*.
3. **`WIND`** — vector → bend the existing ballistic arc + drift the landing circle.
4. **Weather FX** — **port the MOBA's rain / dark / lightning-flicker** (already written, just move it).
5. **`overboard()`** — the branch: swim, current, **wash up on a real parcel**.
6. **Encounter tables** per medium; the **Kraken as the first sea card.**
7. **Mid-air / at-sea pet catching** — the throw is *already* the catch. One line.

> **Everything here reuses the grenade arc, the landing circle, and the moving platform.**
> We are not building a travel system. We are **spending the one we already paid for.**
