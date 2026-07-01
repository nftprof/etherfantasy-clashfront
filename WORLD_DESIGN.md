# WORLD_DESIGN.md — Authoritative World & Progression Spec
*(This file is the SOURCE OF TRUTH for the layered worlds, the map structure, and how the world
opens up. The autonomous jobs — tv-story-review, tv-worldmap-build, tv-game-review — must build
toward THIS. When in doubt, this doc wins.)*

> ## ⭐ CURRENT PRIORITY (tv-worldmap-build, read FIRST) ⭐
> **Build the 3-tier ELEVATION BACKBONE before adding any more surface features (see §3b).**
> The map must be re-grounded into three distinct height levels — LOW (valleys/rivers/lakes/coast),
> MID (plateaus/forest flats/the hub shelf), HIGH (crags/cliffs/Overlooks) — with natural,
> walkable transitions (cliffs/ramps/stairs) BEFORE more props/zones/secrets get layered on. Until
> the backbone exists, every run should advance it: define the tier boundaries off the heightfield,
> carve the slopes/cliffs between them, and RECONCILE existing features so they sit on the correct
> tier (waterfalls pour from HIGH over a cliff to LOW or sit at the edge — never floating; rivers
> flow downhill; the town/hub on the MID shelf; the Overlooks on HIGH). Do small, validated steps;
> never break the playable build. Once the 3 tiers are solid and existing features are re-grounded
> onto them, resume the normal feature backlog. This priority supersedes the feature rotation.

## 0. NAME & CORE THEME (read first — do not get this wrong)
- **The GAME is named "EF Hunt."** That is the product/brand name (title screen `<h1>EF HUNT</h1>`,
  tab title, guide). Always refer to the game as **EF Hunt**.
- **"Beyond the Twilight Veil" is the STORY / world name** — the narrative & lore only. It is NOT
  the game's name. Use it only for in-fiction story/lore text.
- **THE CORE THEME — the "Hunt" is REVERSED.** In the human world you are safe and free. But once
  you cross into the **Underworld, YOU are the HUNTED — the prey, not the hunter.** The dark hunts
  *you*. You are stalked, you must flee/hide, and the only respite is the scent-mask/human-food
  mechanic (eat to quiet your scent so the hunt loses you for a breath). Do NOT frame the underworld
  as the player going monster-hunting; frame it as the player being hunted and surviving. The name
  "EF **Hunt**" refers to the player being the quarry. Every underworld script line, system, and
  zone should reinforce *you are being hunted.*

Target feel: **Genshin Impact × Diablo, with Palworld pets** — but with a **classic-RPG, gated,
linear-then-opening world structure** (Final Fantasy I/II, Chrono Trigger, Secret of Mana, Zelda).
NOT an open sandbox from minute one.

---

## 0c. DISTINCT GAME MODES (the Humanity bar is Underworld-only)
The game has **distinct modes that activate by location in the world stack** — the human world and
the underworld play differently, and the UI reflects that:
- **HUMAN WORLD mode (start, Ep1–2):** carefree. NO Humanity bar at all (the `#corrW` HUD bar is
  hidden), no scent/hunt, no food-survival pressure. Pets, wonder, dusk. The player should NOT see
  the Humanity gauge here — it does not exist yet.
- **UNDERWORLD / HUNTED mode (Ep3+, after crossing the Rift):** the survival layer switches ON. The
  **Humanity bar appears** the moment you cross over, with a one-time "you are now the hunted —
  eat/cook human food to stay human" tutorial beat (`onHumanityActivate()` / `humanityActive()`
  gate, selEp>=3). Humanity erodes as you linger and as you spend shadow power; eating human food
  restores it and masks your scent; hitting 0 = consumed. This is the core "the Hunt is reversed"
  loop (§0 theme). Cooking food is a desired extension of "find food" — same Humanity-restore role.
- **Implementation rule:** never show the Humanity bar or run its erosion outside the Underworld.
  The mode boundary is the Rift crossing (Ep3). Make the activation OBVIOUS (a clear beat + the bar
  visibly appearing), so the player understands a new survival mode just began.

## 1. THE GOLDEN RULE: the world opens INCREMENTALLY, never all at once
The single biggest current problem: the starting map looks like a big open field and every zone is
the same recolored arena. Fix the **feel of a guided early game that gradually widens**, à la
Final Fantasy II — *you do not get free world-map access at the start.*

- **Early game = linear & contained.** Limited paths. A starting region with a clear route — a
  **forest road / wooded valley / town outskirts**, hemmed by trees, cliffs, water — funneling the
  player forward. Landmarks and a sense of place, not an empty plane. Study how FF/Chrono Trigger
  open: a town, a single path out, a contained first area, then slowly more.
- **World-map access is EARNED, not given.** The overworld map / fast-travel unlocks in stages as
  the story advances (a bridge repaired, a pass opened, a vessel/mount found). Until then the player
  is on a guided track. Mirror FFII: the wider map and travel come later.
- Use the existing fog-of-war + waypoint systems as the backbone for this staged reveal.

## 2. THE THREE LAYERS (worlds)
A vertical stack the player traverses over the campaign. Travel between layers is **gated and
directional** (see §4), not free.

1. **REAL / HUMAN WORLD (start).** Warm, safe, **dusk/sunset**. A carnival hub + contained early
   regions (forest, road, town). **No monsters here — only friendly pets** (Barkindle et al.).
   Wonder, character establishment, the calm before. Early linear chapters live here.
2. **THE RIFT (threshold).** The seam between worlds — dramatic, liminal. Home of the **BLOOD
   SCIMITAR**: a special story beat/mode where the hero discovers/claims it (a pact, a price, a
   branding — tie to the Corruption gauge; "every gift of the dark hollows you"). Crossing the rift
   is the point of no return into the dark (for a while — see §4).
3. **THE MIDDLE REALM ("Middle-earth"-like overworld).** A reachable middle layer — a broader
   overworld the player can travel much as they reach the underworld. The connective tissue between
   the human world above and the underworld below; this is where the *real* wide world-map
   eventually lives once it's unlocked.
4. **THE UNDERWORLD.** The dark descent — organized as **3 REALMS** (consolidate/re-theme the
   current 7 elemental zones into 3 overarching realms of Desire; keep them playable). The deepest
   layer; the throne and the betrayal wait at the bottom.

## 3. ZONES = A "TOWER OF CHALLENGE" (ascending difficulty, gated entrances)
- The elemental zones are **NOT** seven identical recolored arenas. Each is reached from a
  **different part of the main map**, and they form an **ascending challenge ladder** — climb
  higher / go deeper to face harder zones. Think a tower you ascend floor by floor, or peaks you
  scale in order.
- Each zone must be **structurally + visually distinct**: its own layout/silhouette, floor pattern,
  props, terrain, hazard, and Warden — not just a color swap. (tv-worldmap-build owns this.)
- Entry to each higher zone is **gated** — by story progress, a Warden-key (already built), or a
  **traversal ability/item** (Zelda-style: a charged jump across a gap, a swim ability to reach an
  island, a grapple to a cliff). Gating creates "come back later" pull.

## 3b. ELEVATION — THE MAP HAS 3 DISTINCT HEIGHT LEVELS (natural landscape logic)
The map must read as a believable 3D landscape with **three distinct elevation tiers**, not a flat
plane with props dropped on it. Reference: Diablo III's stepped two-height areas, AFK Arena's
discrete level tiers, Genshin's free 3D verticality. We already have a heightfield (heightAt); build
ON it deliberately.

- **THREE LEVELS:** LOW (valleys, rivers, lakes, the coast), MID (plateaus, forest flats, the town/
  hub shelf), HIGH (crags, cliffs, the Overlooks, mountain approaches). Each level is a readable
  shelf of terrain separated from the next by **cliffs/slopes/stairs/ramps**.
- **TRAVEL UP/DOWN is real and gated:** you ascend between levels via ramps, switchback paths,
  stairs, or a traversal ability (climb/charged-jump/grapple) — AFK-Arena-style distinct tiers
  reached within a Genshin-style 3D world. Higher tier ≈ harder content (ties to the §3
  tower-of-challenge: climb higher → tougher zones).
- **NATURAL PLACEMENT LOGIC (no floating nonsense):**
  - **Waterfalls** must pour from a HIGHER level over a cliff/plateau edge down to a LOWER level,
    OR sit at the map's edge — NEVER a free-standing waterfall "from the sky" on flat ground. A
    waterfall implies a cliff above it and a pool/river below it.
  - **Rivers** flow DOWNHILL from high to low and end in a lake or the sea; **lakes** pool at low
    points; **forests/meadows** sit on flats; **cliffs/mountains** wall off the high tier and the
    map edges.
  - Watershed sanity: water always goes down; terrain transitions between the 3 levels are visible
    and walkable (or ability-gated), never an invisible wall.
- **Implementation:** drive zone/feature placement off the heightfield — query the local elevation
  tier before placing water/forest/cliff/secret so every feature sits where it physically belongs.
  Build the 3 tiers as the backbone the regions, the rift seam, and the tower-of-challenge hang on.

## 4. WORLD-TRAVEL RULES (one-way → two-way → OVA)
The campaign's spatial arc:
1. **Descent is ONE-WAY (for a while).** Once the player crosses the Rift into the Underworld, they
   **cannot go back** to the real world. They're trapped in the dark, hunted (the scent/food
   mechanic), pushing forward/down. This is the mid-game pressure.
2. **Find the way back.** Mid/late, the player discovers a means to return to the real world (a
   relic, a rite, a reopened rift).
3. **Then: free two-way travel.** After that, the player may move **between the real world and the
   underworld** (and the middle realm) at will — this is when the world finally feels open. This
   two-way period is the lead-in.
4. **Then the OVA.** The OVAs unlock at a **difficulty-6 clear**; the **Holy Grail** true ending
   (Yui redeemed) at **difficulty-9**. The two-way-travel openness happens **before** the OVA.

## 5. CANON GUARDRAILS (do not contradict)
- Player names their own hero (Kai/Jiro), the only playable character.
- **AYUME** (model "Leah") = the secret true antagonist/architect; betrayal in Episode 7.
- **YUI** (model "Irene") = the tragic one, redeemed only at the diff-9 Holy Grail ending.
- 9 difficulties → an ending ladder. Barkindle the pet from the start. CT = real on-chain token
  (whole numbers, min 1). Hidden "Hollow Blight" shadowban punishes cheating.

## 6. BUILD ORDER / WHO OWNS WHAT
- **tv-story-review** — restructure the script to be **linear early**, then open up; write the
  human-world chapters as safe/contained, the Rift/blood-scimitar beat, the one-way descent, the
  return, the two-way travel, then the OVA. Reconcile 7 zones → 3 realms in the narrative. Maintain
  STORY_BIBLE.md against this doc.
- **tv-worldmap-build** — make the **early map contained** (forest/limited paths, real biomes, no
  empty field, diegetic edges), build the **incremental world-map unlock**, give each zone **distinct
  geography**, wire the **tower-of-challenge** gated entrances and **Zelda-style traversal gates**,
  and the **layer-to-layer** travel points (real ↔ rift ↔ middle ↔ underworld) honoring §4's
  one-way→two-way rule. Maintain WORLD_MAP.md against this doc.
- **tv-game-review** — balance the ascending difficulty ladder, the traversal abilities, and the
  progression pacing so the staged unlock feels fair and rewarding.

*Each job: read THIS file first every run; make ONE small validated change toward it; never break
the playable build; log it.*
