# AGENTS_PVE.md — EF HUNT (PVE mode) Agent Handoff Guide

> Start here if you are continuing development of **EF HUNT**, the single-player/co-op PVE
> grind mode. It lives in `pve.html` in this folder — a SEPARATE standalone game from the
> MOBA (`index.html`), sharing only the assets (`pets/*.glb`, `mon_lineage.json`), the local
> server (`serve.py` / `start_game.bat`, http://localhost:8000/pve.html) and the **CT currency**.
> For the MOBA, the model pipeline reference, and the dev-environment gotchas, read `AGENTS.md`.

## 0. DEFINITION OF DONE — every feature updates code + game guide + dev docs (READ FIRST)

A feature is NOT done when the code runs. It is done when all three layers are in sync. Do this
in the SAME turn as the code change — never defer it to "later" or a separate pass (context is
freshest now, and a scheduled job can't reverse-engineer intent reliably). Before considering any
feature complete, update:

1. **The code** (`pve.html` etc.) — the change itself.
2. **The in-game player guide** — the 📖 HUNTER'S GUIDE overlay (`#guide` in `pve.html`) AND
   `wiki.html`. If a player can DO a new thing (a control, a zone, a system), the in-game guide
   must say how. New controls especially (e.g. aim-then-cast, J journal, zone select) go here.
3. **The dev handoff** — append a dated bullet to this file's most recent `## 5x` session section
   (what changed, where, gotchas), and tick/append the relevant line in `CHECKLIST.md`.

Quick self-check before declaring done: "If a brand-new player opened the 📖 guide, and a brand-new
agent opened this file, would either be missing this feature?" If yes, it's not done.

Backstop only (optional): a scheduled weekly "docs-vs-code drift audit" task may flag anything that
slipped — but it is a safety net, not the mechanism. The mechanism is this checklist, every time.

> Sync status (2026-06-14): the in-game 📖 guide HAS been brought current — GOAL (7 zones + story),
> CONTROLS (aim-then-cast + J journal), READING THE ENEMY (threat markers + monster moods), and the
> new layered DEATH rules are all covered. Still pending: `wiki.html` refresh, and a "faction rep /
> codex / town questgivers" pass. Keep applying item 2 for each new player-facing feature.

## 1. What EF HUNT is (design intent from the user)

A Diablo-III-feeling ARPG grind loop whose purpose is to EARN 💎 CT (Carat), the cross-mode
currency also staked in MOBA tournaments. Core fantasy: Diablo II/III (town + wilds + dungeons
+ loot rarities) × Palworld (tame monsters from eggs, farm resources, build defenses) ×
Monster Hunter (boss fights). Single player now; co-op is a planned follow-up (reuse the
MOBA's PeerJS room pattern from index.html if you build it).

**The grind contract (do not break):**
- One run every **2 hours** (`COOLDOWN_H`), bypassed by `?fast=1` test mode (also 30× time).
- A full map clear is ~**4 game-hours**: CT checkpoints at 1h (20%) / 2.5h (30%) / clear (50%).
- Payout by difficulty 1..9: `CT_BY_DIFF=[3,4,6,8,11,15,20,26,34]` — stingy early, rich at hell (post-OVA endgame diff7/8/9 convex-bumped 19/24/30→20/26/34 so the top rungs' reward step-ratio rejoins the mid-game band instead of decaying below the constant ×1.38 effort climb; diff1-6 unchanged).
- **Permadeath**: dying without a revive potion wipes gear + difficulty (back to 1). CT balance
  is NEVER touched. Revive potions cost 2 CT (max 3).
- **Permanent gear** (6 lines × 3 tiers, costs 2/5/12 CT) carries over BUT raises monster
  scaling (+12% per tier) — power has a price.
- Map clear → difficulty +1 (cap 9). Difficulty multiplies monsters ~1.45^(diff-1).
- **Daily hero rotation**: only 3 chains playable per day (seeded by date) so players learn
  many heroes.
- Death/cooldown/diff/gear live in localStorage `efm_pve`; CT in `efm_ct` (shared with MOBA;
  honor system — a real wallet needs a backend, noted as future work).

## 2. World layout (in pve.html)

- **Emberhollow (town)**: circle r=30 at origin. Safe (monsters refuse to enter; AI checks
  `zoneOf(prey)!=='town'`). Props: healing well, **forge** at `FORGE_POS` (gold sink: B near it
  → +12% weapon, cost ×1.5 each time), houses, portal plaza.
- **The Wilds**: ring out to `WILD_R=150`. Camped packs (`populateWilds`, leash to `home`),
  roaming trickle packs (`wildTrickle` — only while the hero is in the wilds), resource nodes,
  base-building allowed (B → tower/wall/heal totem).
- **Terrain (Diablo-style, wilds only)**: `MESAS[]` + `heightAt(x,z)` — flat-top plateaus with
  cosine ramp skirts: Highcrag h7/h3.5 (NW), Emberwood h3.5/h7 (E), Gloomfen basin h−3 (S);
  town & dungeons flat. Displaced 96×96 ground plane + biome-painted canvas texture
  (`makeWildTexture`). Units ride terrain (y set in units loop); `moveTo` slows climbs
  (clamp ×0.55); fxRing/mkDrop/mkEgg/mkNode/camera are terrain-aware — ANYTHING new placed in
  the wilds must set y via `heightAt`. Biome scatter via `deco`/`mkTree`/`mkRock`/`mkShroom`
  (visual only, never in `obstacles[]`). Minimap tints mesas/basin.
- **Hunter's Overlooks (aim mode)**: `PERCHES[]` pads on both h7 crags. Standing on a pad →
  `aimMode` (per-frame `setAimMode(onPerch())`): over-the-shoulder camera, ⊕ crosshair (#xh),
  pulsing weak-spot orbs (`u.wsM`) on enemies <90; left-click → `aimShot()` camera-ray pick —
  head hit (within 1.0 of h·0.95) = ×3 damage, body = ×1, 0.45s cd, free; bolt rides `projs`
  (which now pass `sp`/`src` through — src gives lifesteal/crit). Auto-attack/auto-acquire is
  disabled while aiming; right-click move walks off the pad and exits.
- **3 Dungeons** (`DUNGEONS`): boxed rooms FAR off-map (centers 520,0 / 0,520 / 520,520) so
  they never collide with the wilds. Tier 1/2/3 (+45% power per tier), rock-wall perimeters +
  divider walls (`obstacles[]`), darker fog (zone switch in `updHUD`), populate on first entry
  (`populateDungeon`), each has a named boss; the **final boss** spawns in dungeon 3 at game-min
  ≥238 (`maybeFinalBoss`) and killing it = `runComplete()`.
- **Portals** (`portals[]`): town plaza → each dungeon entrance; each dungeon → town. Walk into
  the ring; 2s cooldown stops ping-pong. **T = town portal** (3s stand-still channel, `tpT`).
- `zoneOf(pos)` returns `{t:'town'|'wild'|'dungeon',i,d}` — use it for all zone gating.
- `clampZone(u)` clamps to the current zone box; `avoidObstacles(u)` slides around walls.

## 3. Systems map (all in pve.html's single script)

- **Models**: trimmed copy of the MOBA pipeline (`prefabs`, `modelBox` bone-bbox sizing,
  `normalizeInPlace`, `applyModel`, `setAnim/animName/updateAnim`, `autoLoad(slot,file,h)`).
  Hero = picked mon's glb (slot `heroM`); monsters/pets/bosses random from 6 daily `mob0..5`
  slots (from `ROSTER.baseOnly`). Primitive `look()` shapes are the loading/offline fallback.
  Bosses/elites reuse mob models scaled via `u.eliteScale`.
- **Loot**: `genItem()` → rarity rolls (`rollRarity`: 2% legendary / 10% rare / 28% magic,
  elites & bosses add bonus), affixes atk/hp/ls(lifesteal)/ms/aoe/pet, item power
  `(1+diff*0.5)*(1+min/240)` × rarity mult. `EQUIP{}` by base slot; auto-equip if
  `score` better else salvage to gold. Beams on rare+. Gold piles vacuum (<6 units),
  health globes heal 25% + pets 30%. All handled in `updateDrops`.
- **Elites**: 10%+3%/tier chance — Frenzied/Colossal/Vampiric/Storming (`ELITES`), 2.4× hp,
  purple `eliteRing`, guaranteed-ish drops. Crits: hero hits 12% × 1.8.
- **Stats**: hero has `baseHp/baseDmg/baseMs`; `applyEquipStats()` recomputes from EQUIP —
  call it after ANY stat change (level-ups call it).
- **Skills**: 4 per kit (`buildKit` by element of the daily hero): Blast / Shock Ring / Dash /
  CATACLYSM. QWER + clickable HUD buttons. `aoe` damage scales with the `aoe` affix.
- **Pets**: eggs from kills (`charm` gear raises rate & cap 4+tier). Pets auto-fight (16 aggro)
  else follow; flee to hero below 30% hp. Pet damage scales with `banner` gear and `pet` affix.
  **Survivability (anti-attrition, from the 23:20 playtest)**: pets stamp `u.cbtT` in hit();
  out-of-combat (>7s) they regen 1.2% maxHp/s, in town 6%/s regardless of combat; hatch hp
  includes `+12*(hero.lvl-1)` and every hero level-up grants living pets +12×vet×tierMult hp.
- **Economy in-run**: gold (drops + gather), wood (gather) → builds & forge. `gatherTick` =
  stand next to a node. Idle pets within 14 of a node work it automatically (Palworld-style,
  half hero rate, leashes back to the hero at >30; `u.workNode` in the pet AI branch).
- **Persistent skills (RuneScape-style)**: `SAVE.skills{slay,wood,mine,tame}` XP — survives
  death AND cooldowns (wipeSave preserves it, like CT). `skLvl` = sqrt(xp/60) capped 50;
  `skillBonus()`: slay +0.6% hero dmg/lvl, wood/mine +2% yield/lvl, tame +0.4% egg & +1% pet
  dmg/lvl. XP: kills 2/6/25 (mon/elite/boss), gather ticks, taming 15. Shown on title +
  in-run #res panel (`updSkillUI`). Save throttled (`skSaveT` 12s) + on level-up.
- **Run boons (Vampire-Survivors-style)**: every hero level-up pauses the game (`paused`) and
  offers 3 of 8 `UPGRADES` cards (click or 1/2/3): atk/hp/atk-spd/lifesteal/skill-dmg/pet-dmg/
  ms/regen, applied via `RUNUP{}` multipliers consumed in `applyEquipStats`, `sk()`, pet
  hatching, and the hit() lifesteal path. Run-scoped, reset in startRun.
- **Waypoint world map (Diablo-style)**: M key (or 🗺 top-bar button) toggles `#wmap` overlay —
  `drawWmap()` on the `#wmapC` 380px canvas (whole world: town/wilds/dungeon boxes, hero dot).
  `WAYPOINTS[]` = town plaza + 3 dungeon entrances; `wpFound[]` (run-scoped, reset in startRun)
  discovers a dungeon's waypoint on first entry (hook in updHUD's zone check). Clicking a lit
  waypoint teleports — but ONLY from town (wilds/dungeon clicks feed a refusal), so first visits
  stay on foot and the T-portal remains the way home. Closed by M/backdrop-click/level-up pause.
- **Town stash (Diablo-style)**: 📦 chest at `STASH_POS` (-14,8) in town; click it (infoSpot
  `stash:true`) within 9 units → `#stash` panel. `STASH[]` holds 3 items, RUN-scoped (reset in
  startRun — permadeath gear wipe unaffected). `stashPut(k)` unequips into the first free slot
  (freeing the EQUIP slot lets lower-score drops auto-equip past the salvage rule);
  `stashTake(i)` equips, swapping with any same-base equipped item. Panel auto-closes >10 from
  the chest (updHUD) and on boon pause.
- **Gem sockets (Diablo-style)**: rare+ items roll `socks` in genItem (rare 40%→1; legendary
  1, 35%→2) + `gems:[]`. 4 gem types (`GEMS`: Ruby atk / Sapphire hp / Emerald aoe / Amethyst
  ls); `genGem()` value scales with itemPower(). Gems drop ONLY in dungeons (lootDrop: 4%
  trash / 18% elite / boss always) → `GEM_BAG` (run-scoped, max 6, overflow auto-sold 15g,
  reset in startRun). Click a gem in the EQUIPMENT panel (delegated #invList listener) →
  `socketGem` fills the first equipped item with a free socket, pushing the gem as a real
  affix (statTotal sees it) and bumping item score. Socket marks via `sockHtml` in invUI +
  stash itHtml.
- **Unique legendaries (Diablo-style)**: `UNIQUES{}` by base slot — legendary rolls on wpn/boots/
  plate/charm have a 30% chance to become a named ★ unique (score ×1.15): Emberfang (Blast leaves
  a 4s burning patch via `burns[]`/`mkBurn`/`updateBurns`, dps=30% of blast dmg), Stormstep Treads
  (Dash capsule-hits everything within 3 of its path + 1s slow), Heart of the Colossus (health
  globes heal 50%/pets 60% instead of 25/30), Broodmother Idol (egg chance ×2). `uniqOn(tag)`
  scans EQUIP; burns are run-scoped (cleared in startRun). Uniques wipe with gear on death.
- **Bounty board (RuneScape-style dailies)**: 📜 board prop at `BOUNTY_POS` (16,2) in town,
  clickable infoSpot (`bounty:true`) → `openBounty()` (≤9 units). `bountyQuests()` = 3 contracts
  date-seeded from `Math.floor(Date.now()/864e5)`: slay 4–7 elites (150g + 90 slay XP), defeat a
  specific dungeon boss by `bossName` (220g + 140 slay XP), gather 80–160 wood (120g + 110 wood
  XP). Progress in run-scoped `BPROG{elite,wood,boss{}}` (reset in startRun; hooks: kill branch
  of hit(), gatherTick tree path, pet auto-gather tree path — hero AND pet wood both count).
  Claims in `SAVE.bq={d:day,done[]}` — lazy-init on day change, persisted, and preserved by
  wipeSave like skills (no refarm-after-death; gold is run-scoped anyway, skill XP is not).
  Claiming = click the board with the quest complete; pays gold + skXP, never CT.
- **Blood Moon (Vampire-Survivors-style)**: every 30 game-min while in the wilds (`bloodMoon`,
  `bloodNext/bloodT`), 22s real-time swarm — waves of 5 weak fast aggro mons every 1.5s, sky
  tints red; ends with a bonus item (genItem 0.25), gold pile, +30 slay XP.

## 4. Tuning knobs (balance work happens here)

- `diffMult(zoneTier)` = `1.38^(diff-1) * (1+0.03*gearScore()) * (1+min/240*1.2) * (1+tier*0.45)`
- `vetMult()` = `1+0.35*(diff-1)` — **veteran bonus**: multiplies hero base hp/dmg (incl. gear
  lines), level-up gains, skill damage (via `sk()` in buildKit), and pet hp/dmg. This is what
  makes diff 5+ survivable: monster power grows exponentially, hero start power grows with it.
- Monster base: melee 110hp/13dmg, ranged 60hp/9dmg ×M (dmg further ×0.5 vs players).
- Boss: 900hp ×M (final ×3). Bosses telegraph AoE slams (`bossTelegraph`/`updateTelegraphs`,
  `telegraphs[]`): red ring at hero pos, 1.5s channel, 2.2×boss-dmg to hero+pets inside r=6
  (final boss r=8), every 4.5–7s within range 20. Dodge by moving out.
- `CT_BY_DIFF`, `GEAR_COST=[2,5,12]`, potion 2 CT, forge base 120g ×1.5.
- Knobs were tuned 2026-06-12 by Monte-Carlo sim (outputs scratchpad `sim_pve_vet_0612c.js`,
  400 runs/config, full 4h-run model: packs/elites/loot/levels/pets/forge/bosses).
  Old 1.45 base + 0.12 tax: 100% death at diff 5+, gear was a net NERF (tax +116% vs the
  flat +36atk/+450hp it buys). New 1.38/0.03/vet 0.35 curve: diff1 ungeared ~81% clear,
  diff5 ~86%, diff7 ~70%, diff9 ~42% at gear cap (vs 34% half-geared — gear is net-positive).
  Hellish but possible. Browser feel-pass still pending (sim ≠ feel).

## 5. Dev environment — CRITICAL gotchas (same as AGENTS.md §10)

- Serve over HTTP (`start_game.bat`); `file://` breaks fetch of glbs/roster.
- **The Linux sandbox mount of this folder serves STALE/TRUNCATED file content** after a file
  has been read once — file sizes freeze and tails get cut. NEVER trust bash reads of files
  you've edited. Validation workflow that works:
  1. Write your changed JS (with stubs) to a **uniquely-named, never-before-read** `.js` file
     in the outputs scratchpad, `node --check` + run assertions on it via bash.
  2. Or reconstruct head (from mount) + tail (from your own authored content) and check the
     concatenation — see the review log in CHECKLIST.md for examples.
  - The Read/Write/Edit file tools always see the TRUE current file — only bash is stale.
- No headless browser and no npm/CDN access in the sandbox — real runtime testing happens in
  the user's Chrome (ask them, or use the Claude-in-Chrome extension if connected).
- A scheduled review bot edits files in this folder every 20 min (until 18:15 on 2026-06-12) —
  re-read CHECKLIST.md's "Review log" before editing shared files; for pve.html work after
  that window it's all yours.

## 5d. 2026-06-17 — BUGFIX: Underworld food scatter location (corruption counterplay)

- `scatterFood()` (the N21 "Anchors of Humanity" — human food that eases Corruption + masks scent,
  the ONLY in-world counterplay to the gauge, gated to the Underworld via `episode>=3`) used to
  scatter its 3–5 morsels in a 44..130 ring around the ORIGIN (the wilds) and was called BEFORE the
  Ep3+ zone-jump in `startRun`. But Ep3+ teleport the hero into a far off-map realm (`DUNGEONS` cx/cz
  at ±520, r60), so every morsel landed ~470u away and unreachable — the gauge became a pure
  death-timer. **Fix:** `scatterFood` now reads `startZone` and, when it's a realm, scatters INSIDE
  that room (`≤r-14` of centre, clear of the walls); else the wilds ring as before. The call was
  MOVED from ~2995 (before the jump) to ~3018 (after the `startZone`-unlock validation + jump) so a
  sealed-realm pick — which `startRun` resets to `-1` — can't strand food in a dungeon the player
  never enters. No new systems/save fields; the guide/wiki already promise this behaviour (the fix
  just makes it true in the Underworld). Validated: node 134437/134437 logic test (`foodfix_0617.js`:
  wilds ring unchanged; all 7 realms — inside the room, off the walls, reachable <2r from the start
  corner; regression old≈473u vs new≤117u; oob/undefined `startZone` → wilds fallback) + verbatim
  `scatterFood` node --check. Browser F12 still the gate. pve.html only.

## 5e. 2026-06-17 — BALANCE: W8 Coffer Wraith speed (broken treasure-goblin chase)

- The W8 fleeing treasure-goblin (`spawnCarrier`, ~2326) was spawned with a FLAT `ms:9.6` whose
  comment claimed "just above the hero" — but the real gameplay hero is created with
  `ms:14+SAVE.gear.boots*1.5` (~2984), i.e. **14–18.5+ before affixes/boons**. So the wraith was
  ~30–40% SLOWER than the hero and could be walked straight down on foot, nullifying its entire
  design (the in-game 📖 guide + wiki ALREADY promised "a touch faster than you… you can't simply
  walk it down — dash (Charge) or ranged bolts/skills are the catch"). **Fix:** carrier ms is now
  hero-relative — `cms=Math.max(15,((hero&&hero.ms)?hero.ms:14)+2)` — always +2 over the hero's
  CURRENT (boots-scaled) move speed, floored at 15, with a 16 fallback if `hero` is somehow unset.
  This makes the docs finally TRUE (no guide/wiki edit needed — they were correct; the code was the
  bug). A heavy speed-stacked hero (ms affixes + Swift Paws boons applied AFTER spawn / mid-run) can
  still earn the on-foot catch, which is on-theme. moveTo (~2592) applies `u.ms` uniformly to hero
  and carrier (same climb clamp), so the ms comparison is apples-to-apples. No new systems/save
  fields; one self-contained line in the bash-frozen tail. Validated: node 15/15 logic test
  (`carrier_ms_0617.js`: carrier > hero base at every boot tier 0–3; exactly +2 above the floor;
  regression old-9.6 < hero base at every tier; min-15 floor; null/undefined → 16 fallback;
  speed-build still scales) + stubbed `spawnCarrier` reconstruction `node --check` OK (returns ms 18
  for a hero at ms 16). Browser F12 still the gate. pve.html only.

## 5f. 2026-06-17 — STORY: OVA2 voice/pronoun coherence (one cutscene line)

- The campaign's narrative is written in second person ("you"/`[NAME]`) throughout (ENDINGS, OVA1/2,
  EPILOGUE, EP_STORY), per the MASTERPLAN §6 rule "the player IS Kai, scenes address them directly,"
  and the hero is player-named (`SAVE.heroName`, any name/gender). ONE line broke both: OVA2's closing
  narrator beat (`OVA2[]` ~814, shown at the diff-6 OVA unlock) read "Darkness consumes **the hero**,
  trapping **him** in her web." — third person AND male-gendered. Rewrote to "Darkness consumes **you**,
  trapping **you** in her web." ("her web" still = Ayume/Leah). Dialogue text only; no system/save/guide
  change (the wiki + 📖 guide don't quote OVA lines — grep-confirmed). Validated: node 5/5
  (`ova2_check_0617.js`: no "the hero"/"trapping him" in the reel, edited line second-person + "her web"
  + "end of reel" intact) + `node --check` OK. Edit in the bash-visible head; browser F12 still the gate.

## 5g. 2026-06-17 — QoL/CLARITY: P6 part 2 — persistent on-screen THREAT legend

- P6 (live-playtest fix) had two halves: (a) a one-time "now LEFT-CLICK the ground to cast" hint when a
  ground-target skill is first armed — ALREADY shipped (`_armTipShown`/`startAim` ~2520/2535, touch-aware);
  and (b) "a tiny legend by the threat markers." Half (b) was missing — the threat colour scale lived ONLY
  in the 📖 guide (READING THE ENEMY) + a transient run-start toast, so mid-hunt you had nothing on screen.
  **Added** a small always-visible `#tlg` legend pinned just above the minimap (`right:8px;bottom:166px`,
  width 150 to match `#mm`), reading "⚠ THREAT — green easy · white even · orange ! tough · red ☠ deadly ·
  ??? flee". Swatch colours are copied verbatim from the `THREAT[]` con table (~2643: #5fd06a/#e8e8e8/
  #ffb347/#ff5555/#cf63ff) and the grouping matches the guide's. It is `pointer-events:none`, `display:none`
  by default, and mirrors `#mm`'s lifecycle EXACTLY — added to the startRun show array (~2981, shown as
  `block`; also added an `if(!e)return` null-guard) and the startCartRide hide array (~658). No new save
  fields/systems/timers; pure cosmetic HUD. 📖 guide READING-THE-ENEMY line + wiki.html got a matching
  note/bullet. Validated: node 14/14 (`/tmp/p6_tlg.js`, which DEFINES+EXECUTES the two edited array lines
  verbatim = parse + runtime check: tlg→block on show / none on hide, mm/res block, hud/top/sndW flex,
  missing-#tlg null-guard no-throw on both paths, every legend swatch ∈ THREAT[], flee=violet/deadly=red).
  Both array edits + the guide line are in the bash-visible head; the `#tlg` div is static HTML. Browser
  F12 still the gate (visual placement/overlap).

## 5h. 2026-06-17 — BALANCE: rare CT shard unreachable in the Underworld (same bug class as §5d food)

- `scatterCT()` (~2158) — the ~12%-per-hunt on-chain teal-diamond CT shard, the currency the whole game
  exists to EARN — scattered at an ORIGIN-relative ring (R=72..140) and was called (~3007) BEFORE the
  Ep3+/chapter-select/zone-select jump that teleports the hero into a far off-map realm (`DUNGEONS` cx/cz
  ±520, r60). So on EVERY Underworld start the shard landed ~400–730u from the hero/entry-pad — unreachable.
  This is the identical failure mode the N21 food anchors had (fixed §5d that morning), but on the single
  highest-value drop in the game. **Fix (mirrors `scatterFood` 1:1):** `scatterCT` now reads `startZone` and,
  for a realm start, hides the shard INSIDE that room (`≤r-14` of centre via `(dz.r-14)*sqrt(rand)`, off the
  walls, reachable from `safeSpotFor` entry pad); else the wilds ring as before (town-reject kept on the
  wilds path). The CALL was MOVED from ~3007 to ~3027 (beside `scatterFood`, AFTER the startZone-unlock
  validation + jump) so a sealed-realm pick — `startRun` resets `startZone` to `-1` at ~3021 — can't strand
  it in a dungeon the player never enters. `maybeCTfromKill` already drops at the kill site (in-realm) so it
  needed no change; the wilds-only W3 caches / W4 Veil-isles are intended exploration content and were left
  as-is. No new systems/save fields; the guide+wiki already promise "rare teal-diamond CT drops in the world"
  — the fix just makes them collectable in the Underworld (no doc change, same reasoning as §5d). Validated:
  node 474/474 (`ctfix_0617.js`: wilds ring 72..140 unchanged; all 7 realms inside-room/off-walls/reachable-
  from-pad <120u; regression old≈396–730u-from-pad vs new <120u; oob/undef `startZone` → wilds fallback) +
  verbatim `scatterCT` `node --check` OK + runtime smoke (realm shard 4.6u from centre, whole-CT amount).
  Edits via the file tools (bash mount froze the tail, per §5); browser F12 still the gate. pve.html only.

## 5i. 2026-06-17 — BALANCE: the +60% shadow-power payoff was unreachable (off-by-one on the gauge top)

- `shadowDmgMult()` (~1247) scaled `1 + min(0.6, (corruption - CORR_POWER)/100)`, i.e. it hit the documented
  **+60%** skill-damage cap only at `corruption = CORR_POWER+60 = 100`. But `CORR_MAX = 100` is the
  **Consumed-by-the-Veil instant death**, and the **Critical Limit / "brink" is `CORR_CRIT = 92`** — so a living
  hunter could never collect more than `+min(0.6,(92-40)/100)= +52%`. The whole Corruption bargain (ride near the
  brink for power) under-paid by 8pp, and the in-game 📖 guide + `wiki.html` both promise "scaling up to **+60%**
  skill damage **as you near the brink**" — a claim the code made impossible. Even the old `kitPow` comment said
  "1.6× at corr 100", revealing the intent was a top the player can't reach alive. **Fix:** retie the ramp to the
  *reachable* band — `1 + min(0.6, (corruption - CORR_POWER)/(CORR_CRIT - CORR_POWER) * 0.6)`. Now 1.0× at the
  Power Threshold (40), a smooth climb, and exactly **1.60× at the Critical Limit (92)** — the +60% lands precisely
  at the brink the guide describes, only for players taking the most risk; still hard-capped at 1.6 above 92.
  Math: span 92−40 = 52, so mult(c) = 1 + (c−40)/52·0.6 → mult(40)=1.00, mult(66)=1.30, mult(92)=1.60. Strictly
  ≥ the old curve in the live band (old gave 1.52 at 92), monotonic, bounded [1.0, 1.6]. Uses the threshold
  CONSTANTS (not a magic 100) so it stays correct if either threshold is retuned. **No doc change needed** — the
  guide/wiki "+60% as you near the brink" is now *true*; the `kitPow` comment was corrected (corr 100 → corr 92).
  Validated: node 9/9 (`sdm_test.js`: human=1.0, threshold=1.0, mid=1.30, brink 92=1.60, capped at 100, monotonic,
  bounded, strictly > old 1.52 at the brink) + `node --check` clean on both edited lines. Chose BALANCE — a
  different area from the last 3 runs (model 05:21, story 06:48, QoL 08:48). Edits via file tools. pve.html only.

## 5j. 2026-06-17 — STORY: Holy Grail EPILOGUE now plays at the LIVE diff-9 clear (not just the menu)

- `playEnding(diff)` (~831) played only `ENDINGS[tier]` (+ the N24 alignment line). For tier 9 that reel
  summarises the redemption, but the dedicated `EPILOGUE` const (~817) — "the only true ending", Yui
  choosing the light, Ayume thanking you by name, "Three shadows leave the Veil ✨" — was wired ONLY into
  the ▶ Memories viewer (`playOVA`, gated `SAVE.bestEnding>=9`). So the §2/N13 headline payoff for grinding
  to a difficulty-9 clear only appeared if the player later opened a title-screen menu; the moment they
  earned it showed the shorter reel. The code's own comment (~791) already promised "the Holy-Grail epilogue
  plays once a diff-9 clear is achieved" and N13 specifies the clear, not the menu — so this was a real
  under-delivery, not a design choice. **Fix:** a one-token append — `…concat(tier>=9?EPILOGUE:[])` — so a
  LIVE diff-9 clear now plays `ENDINGS[9]` → alignment line → the full EPILOGUE as the final coda, before
  `showEndScreen(9)`. EPILOGUE is appended LAST so "Three shadows leave the Veil ✨" stays the closing image
  and the N24 alignment reflection keeps its slot right after the tier cutscene; tiers 1–8 append `[]` (exact
  no-op — verified no epilogue leak). The ▶ Memories viewer is untouched and still replays it. No new
  systems/save fields. 📖 guide YOUR ENDING line + `wiki.html` endings bullet now note the epilogue plays at
  the clear (and replays from ▶ Memories). Validated: node 19/19 (`epilogue_diff9_0617.js`: diff9 has tier
  reel + epilogue, epilogue is the FINAL beat, order tier→alignment→epilogue with & without N16 choices, no
  epilogue at diff 1/2/6/8, fallback tier clean, onDone→showEndScreen(9), diff>9 clamps & plays) + verbatim
  `playEnding` node --check OK. Edits via file tools; browser F12 still the gate. pve.html only.

## 5k. 2026-06-17 — STORY: hero-gender pronoun coherence (3 pivotal cutscene lines)

- Canon: "the player names their own hero" (`SAVE.heroName`, any name/gender); the campaign is written
  in second person ("you"/`[NAME]`). The §5f OVA2 fix already corrected one third-person/male slip. Three
  more lines referred to the player-hero with MALE pronouns — and they sit on the campaign's SPINE, not a
  side reel: `EP_STORY[2].outro` (~897, Yui to Ayume while the hero eavesdrops: "He followed. Of course he
  did.") and the Ep7 Ayume=Leah betrayal reveal (`EP_STORY[7]` ~1036 Yui "Then you're done with **him**. Let
  **him** go, Leah … Me, for **him**." and ~1037 Ayume "the moment **he** learned to love the dark…"). A
  player who named a non-male hero hit a gender mismatch at the foreshadow AND the reveal. **Fix:** swapped
  the hero-pronouns to the `[NAME]` token (live-substituted to `heroName()` at line 505) + singular *they*,
  which keeps the third-person "they discuss the prey, unnoticed" device and Yui's taunt-cadence intact:
  897 → "[NAME] followed. Of course they did. They always follow."; 1036 → "…done with [NAME]. Let them go,
  Leah … Me, for them."; 1037 → "…the moment [NAME] learned to love the dark…". The Kage-referring
  he/him/his (1022/1024 "he's telling you the rule"/"shade on his wall", 1104 "wound him") are CORRECT — Kage
  is a male antagonist — and the male carnival vendor (1074) is fine; all left untouched. No new systems/save
  fields; speaker tags (`yui`/`ayume`) intact so DLG_VOICE/portraits still resolve. No guide/wiki edit — they
  don't quote these cutscene lines (grep 0 hits) and this adds no player capability. Validated: node 22/22
  (`herogender_0617.js`: no he/him/his survives in any edited line; `[NAME]` present + fully substitutes for a
  FEMALE name "Mira" AND default "Kai" with zero male-pronoun leak; prey-cadence/bargain/reveal phrasings
  landed; yui/ayume tags intact) + `node --check` clean. Edits via the file tools (head region 897–1037).
  Browser F12 still the gate. pve.html only.

## 5l. 2026-06-17 — PLAYTEST FIX (FEEL): P7(b) clear EXIT from the Hunter's Overlook aim mode

- Live feedback on the Overlook (P7) was "right-click accidentally walks off, no clear exit." Aim mode is
  forced on PER FRAME by `setAimMode(onPerch())` (~3370), so it's purely a function of standing on a
  `PERCHES[]` pad — there was no way to leave except physically stepping off, and right-click (the move
  command) yeeted you off the pad as an *accident*, not a choice. **Fix (P7 sub-item b only — small,
  reversible):** new run-state `aimExited` (declared beside `aimMode` ~1710). The per-frame gate is now
  `if(!onPerch())aimExited=false; setAimMode(onPerch()&&!aimExited)` — so an explicit exit suppresses
  re-entry *while you stay on the pad*, and **stepping off the pad re-arms it** (you can always re-enter by
  stepping off and back on). New `exitAim(){aimExited=true;setAimMode(false);}` is wired to THREE intents:
  **Esc** (keydown ~3105: `if(aimMode){exitAim()}` else the old `cancelAim()`), **right-click** (pointerdown
  button===2 ~3085: `if(aimMode){exitAim();return;}` *before* the move logic, so right-click no longer walks
  you off — it's now the intentional leave), and a new on-screen **✕ Exit Overlook (Esc)** button (`#aimExit`,
  static HTML ~235, `onclick="exitAim()"`, shown/hidden in `setAimMode` alongside `#xh`, centered just below
  the ⊕ reticle). Added `#aimExit` to the pointerdown overlay-exclusion selector (~3070) so clicking the
  button doesn't also fire `aimShot`. `setAimMode(false)` already clears the weak-spot orbs (`u.wsM`), so exit
  is clean. NO new save fields, NO new systems — run-scoped flag + one helper + one static button. The other
  P7 parts (a free-360° rotation, c crosshair/hit feedback, d click-path audit) remain OPEN. 📖 guide THE LAY
  OF THE LAND line + both Overlook infoSpot tooltips + the AIM-MODE feed now state the Esc/right-click/✕ exit
  (wiki.html has no Overlook section — grep 0 hits — so no wiki edit). Validated: node 15/15
  (`/tmp/p7b_exit.js` reproduces the gate+handlers verbatim: off-pad off, on-pad on, Esc/right-click exit &
  set the flag, staying on the pad does NOT re-enter, stepping off clears the flag, re-enter on re-step,
  off-pad right-click = normal move, off-pad Esc = cancelAim, exit clears the weak-spot orb) + verbatim
  reconstruction `node --check` of `setAimMode`/`exitAim`/gate/Esc/right-click (`SYNTAX OK`). Edits via the
  file tools (bash mount serves the frozen tail per §5); browser F12 still the visual gate (button placement,
  the right-click-no-longer-walks feel). pve.html only.

## 5m. 2026-06-17 — STORY+BALANCE: Ep7 Kage "too human to harm me" gate was only half-real

- The Episode-7 design (pivot §4, the in-game 📖 guide CHAPTERS line, `wiki.html`, AND Yui's in-fight tutorial
  `EP_STORY[7]` ~1023 "Stay too human and your blade will barely scratch him") is that the **Corruption gauge IS
  the fight**: below the Power Threshold (`CORR_POWER=40`) your blade barely marks **Kage no Mamoru**, so you must
  let the shadow rise to wound him. Kage's own `bossSpecial` taunt (~2727 "Too human to harm me, [NAME]") asserts
  the same. But the only pure-hearted penalty actually coded was a **6%-maxHp mend every ~7–10s** (`bossSpecial`
  ~2726) — `hit()` applied the hero's **full** damage to Kage at any corruption. A well-geared / high-difficulty
  hero out-DPSes a 6%/~8s heal trivially, so they could **fell Kage while staying fully human**, nullifying the
  "you MUST embrace the shadow" gate (the entire point of the fight) and contradicting four player-facing surfaces.
- **Fix:** one self-contained line in `hit()` (~2575, immediately after the crit multiply, before the Tide-Shard DR):
  `if(u.kage&&src===hero&&typeof corruption!=='undefined'&&corruption<CORR_POWER)amt*=0.15;`. A pure-hearted blade
  now lands at **15%** (a literal "scratch"); full damage (×`shadowDmgMult`) resumes the instant corruption crosses
  `CORR_POWER` (40). **Skills route through `hit()` too** (pAoe/pDash path/pLineShot all call `hit`), so the gate
  covers melee AND casts uniformly. The intended path (corr≥40) is **untouched** — only the stay-human anti-pattern
  is punished — and 0.15 DPS now reliably loses to the 6%/8s mend at boss-scale HP, so the two halves finally
  cooperate (you can't grind him down while human, exactly as written). Only `u.kage` is gated; Wardens, the Hollow
  King, Ayume's boss form, and trash are unaffected (Ayume's fight is post-betrayal and not a corruption puzzle).
  Guarded with `typeof corruption!=='undefined'` per the existing defensive style (~2723). **No new systems/save
  fields; NO guide/wiki edit** — the docs already promised this behaviour; the fix makes them TRUE (same reasoning
  as §5e/§5h/§5i). Chose an Ep7 boss-integrity fix, distinct from the last runs (feel/aim §5l, balance §5h/§5i,
  story §5j/§5k). Validated: node 13/13 (`kage_humangate_0617.js`: corr 0/20/39 → 0.15×; corr 40/70/92 → full;
  Wardens/mobs/non-hero `src` never gated; undefined-corruption → full, no throw; crit ×1.8 then gate = 27; gate
  ≤20% of normal; gated DPS < boss mend at scale) + `node --check` SYNTAX OK on the wrapped edited line. Edit via
  the file tools (the bash mount serves a TRUNCATED tail — it reported the file at 3220 lines while the true loop /
  `hit()` live beyond it; confirmed the real `hit()`/`bossSpecial`/`loop` via the Grep/Read tools per §5). Browser
  F12 still the gate (feel of the human-blocked phase). pve.html only.

## 5n. 2026-06-17 — PROGRESSION/PACING: Underworld corruption pressure now keys off the CHAPTER PLAYED, not lifetime unlock

- The passive Corruption erosion (`corruptionTick` ~1296, `+0.25/s` outside town/safe-pads) and its in-world
  counterplay, the 🍞 Anchors of Humanity (`scatterFood` ~2141), were BOTH gated on `(SAVE.episode||1)>=3` —
  the highest chapter a player has EVER unlocked (a permanent save flag). But `SAVE.episode` is lifetime
  progress, not "am I in the Underworld this run." So once a player unlocked Ep3+, EVERY later run drained
  them — including selecting **Ep1 (the Carnival) or Ep2 (Masquerade)** from the chapter-select to replay the
  canon-gentle opening ("start at a carnival, real world, **easy/passive**" — MASTERPLAN §1 / PIVOT). The
  `scatterFood` comment even literally claims "the **Carnival is already safe**" — which the gate made false on
  any replay, and it littered those gentle runs with Underworld Anchors. **Fix:** re-gate BOTH on `selEp` (the
  chapter being PLAYED this run) via `(typeof selEp!=='undefined'?selEp:(SAVE.episode||1))` — defensive
  fallback to the old flag if `selEp` were somehow unset (it's a module-level `let selEp=1`, always defined).
  This matches the codebase's OWN established convention: **Kage/boss identity already keys off `selEp`** (`b.kage`
  ~2688, the descent feed ~2773) — so the corruption erosion + food were the inconsistent outliers, now aligned.
- Invariant that makes this safe: `selEp <= SAVE.episode` ALWAYS (you can only click an UNLOCKED chapter;
  `epUnlocked()=min(7,SAVE.episode)`, and `selEp` defaults to 1 / is set to a clickable id ≤ that). So
  erosion-ON (`selEp>=3`) ⟹ `SAVE.episode>=3` ⟹ food still scatters — **no stranding** (a run that erodes you
  always also strews the Anchors that counter it). The only behavioural change: a `selEp<3` run (Carnival/
  Masquerade, incl. the default `selEp=1` Wilds start) no longer erodes or scatters food — exactly the canon
  gentle early game. Real Ep3+ runs are byte-for-byte unchanged (new==old verified). **No new systems/save
  fields. No guide/wiki edit** — the 📖 guide already says erosion/Anchors apply "deep in the **Underworld**
  (Episode 3+)"; the fix makes that literally true (you're PLAYING an Ep3+ chapter), same reasoning as
  §5e/§5h/§5i/§5m. Chose PROGRESSION/PACING — a fresh area vs the last runs (feel/aim 10:55, story+balance Kage
  11:06, story epilogue/pronouns). Validated: node 29/29 (`corr_selep_0617.js`: selEp 1/2 gentle [no erosion/no
  food] even at lifetime ep7, selEp 3..7 erode+food, undefined-selEp → SAVE.episode fallback, the
  `selEp<=SAVE.episode` invariant + erosion⟹food implication across all selectable picks, regression old-gate
  eroded the Ep1 replay vs new does not, and new==old for every real Ep3+ run) + `node --check` SYNTAX OK on the
  two edited lines wrapped verbatim. Edits via the file tools (bash mount stale per §5); browser F12 still the
  gate. pve.html only.

## 5o. 2026-06-17 — QoL/CLARITY: sealed-realm pick now names the exact Warden/realm that gates the next unlock

- The startRun guard (~3025) refuses to drop the hero into a locked realm — `if(startZone>=0&&!zoneUnlocked(startZone))`
  reset `startZone=-1` and fed a GENERIC "🔒 That realm is still sealed — starting in the Wilds. Defeat the Wardens in
  order to open it." The realms unlock incrementally by Warden-key (`unlockRealm(i)` opens `i+1`; `zoneUnlocked(i)=i<=SAVE.zonesUnlocked`),
  and crucially the `EPISODES[].zone` map increments +1 per chapter EXCEPT **Ep6(zone4)→Ep7(zone6), which SKIPS zone5
  (Enamora, tier-6 Seraphel)**. Because `SAVE.episode` (chapter) advances on ANY map-clear (`runComplete` ~2917) while
  `zonesUnlocked` advances only on Warden kills (`onWardenKill`→`unlockRealm` ~359), a player can reach the **Ep7
  chapter-select with the Abyssal Vault (idx6) still sealed** — and picking the campaign finale silently bounced them to
  the Wilds with no clue WHICH realm/Warden to clear. A real dead-end at the most important narrative beat.
- **Fix (message + docs ONLY — the unlock math is byte-identical, NO gating/balance/perf change):** the guard now reads
  `SAVE.zonesUnlocked`, takes the highest open realm `_gate=DUNGEONS[_oi]` (`_oi=zonesUnlocked`), its `_w=WARDEN_BY_TIER[_gate.tier]`,
  and the next realm `_nx=DUNGEONS[_oi+1]`, and feeds: "🔒 `<picked>` is still sealed. Realms open ONE at a time — fell
  `<_w>` in `<_gate.name>` (pick it on the 🗺 zone map) to unseal `<_nx.name>`. Starting in the Wilds for now." (Ep7 pick
  → "fell Seraphel, the Beguiling Rose in Enamora … to unseal The Abyssal Vault".) Kept `startZone=-1`, the `try/catch`,
  and the original generic line as a data-missing `else` fallback. Bounds-safe: a sealed pick ⟹ `startZone>zonesUnlocked`
  ⟹ `_oi+1≤DUNGEONS.length-1`. Works for both chapter-select and the 🗺 zone-select (both set `startZone`).
- **Definition of Done:** the unlock RULE was never surfaced to the player — the 📖 guide CHOOSE-YOUR-ZONE intro (~175)
  and `wiki.html` Sin-Realms bullet (~79) listed the realms/Realm-lords but not "fell a Warden to open the next." Added a
  sentence to both. Chose QoL/CLARITY (last QoL run 08:48; the 11:30 run was progression-MECHANICS — this touches none).
  Validated: node 19/19 (`sealedguard_0617.js`: Ep6→Ep7 names Abyssal Vault/Seraphel/Enamora + the ONE-at-a-time rule +
  zone-map hint; fresh save → Mossfang Alpha/Mossfang Hollow→Howling Crypt; upper-bound no-undefined; unlocked pick → no
  message + startZone preserved; Wilds(-1) untouched; missing-Warden → "the next Warden" default; beyond-data → generic
  fallback, no throw) + `node --check` SYNTAX OK on the verbatim multi-line guard wrapped in a function. Edits via the file
  tools (bash mount serves a truncated tail per §5 — guard confirmed via Read/Grep). Browser F12 still the gate. pve.html only.

## 5p. 2026-06-17 — BALANCE: pets one-shot by every boss/Warden slam (anti-attrition contradiction)

- The boss/Warden telegraphed slam (`bossTelegraph`/`updateTelegraphs` ~2698/2706, every 4.5–7s within range 20) deals
  `dmg*2.2` (`tg.dmg`) to EVERYTHING inside the red ring — `updateTelegraphs` (~2709) iterated `[...units]`, skipped
  non-hero/non-pet, and called `hit(v,tg.dmg)` with the SAME damage for hero and pets. The hero can read the 1.5s
  telegraph and walk out (dodge-or-die, intended). **Pets cannot** — their AI (assist within 16 aggro / follow / flee
  <30% hp) holds melee range and never steps out of a hero-centred slam. So every slam wiped the whole pack.
- Math (why it's a one-shot): a pet hatches with `(170+diff*20+12*(lvl-1))*vetMult()` HP (mkEgg ~2826) × tier mult.
  A final-boss slam = `26*diffMult(7)*0.55 * 2.2`. At diff5/lvl15/min240 ungeared ≈ **1041** vs a ~**1051**-HP pet
  (99% — effectively lethal); a STRICT one-shot at diff7 (≈?>petHp) and diff9, and at diff5 too once `gearScore`
  raises `diffMult` (up to +54% at full gear). The pet army — a core Palworld pillar (§1) and the very system the
  anti-attrition work (§3: OOC regen, level-up HP grants, P2 Barkindle revive) exists to keep alive — was therefore
  deleted wholesale in EVERY boss/Warden fight, the place pets matter most.
- **Fix:** one self-contained factor on the existing call — `hit(v,tg.dmg*(v.kind==='pet'?0.5:1))`. Pets take HALF a
  slam (survive a hit or two); the HERO still eats the full `2.2×` (dodge-or-die intact, the boss's threat to the
  player is byte-identical). Conservative & non-trivializing: hazards/snares/ranged still hit pets in full, a left-in
  pet still dies to repeated slams, and at diff9 even a half-slam lands real damage — pets just aren't auto-wiped every
  cast. No new systems/save fields; the only change is the one factor in the bash-frozen tail (edited via the file
  tools per §5). **Definition of Done:** player-facing (pets visibly survive a boss fight now), so the 📖 guide WARDENS
  line (~111) + `wiki.html` Barkindle/pet bullet (~76) gained a clause: pets can't read the slam telegraph but take only
  half the blast. Chose BALANCE/anti-attrition — distinct code & concern from the last runs (QoL sealed-realm §5o,
  progression corruption-onset §5n, story+balance Kage-gate §5m, feel/aim §5l). Validated: node 15/15
  (`/tmp/tg_pet_0617.js`: pet factor 0.5 / hero+non-pet 1.0, set-guard still hero|pet only, diff7/9 full slam one-shots
  petHp, diff5 full = 99% of petHp + one-shot with 9 gear tiers, half<full real reduction, diff9 half still lands
  damage so the boss isn't trivialized, diff5 pet now survives a single slam, low-end Warden no immortality) + verbatim
  stubbed `updateTelegraphs` reconstruction `node --check` SYNTAX OK + grep-confirmed the live edit + both doc clauses.
  Browser F12 still the gate (the feel of pets weathering a boss fight). pve.html only.

## 5q. 2026-06-17 — STORY: the Fortune Teller's hidden THIRD CARD now pays off (unfired Chekhov's gun)

- The Episode-1 prophecy (`FORTUNE_PROPHECY` ~538) turns three cards but COVERS the third: "The last one is
  not yet yours to read. Come back when you have walked far enough to understand it." That payoff was never
  built — `onTalkFortune`'s else-branch (~566) only ever rotated 5 generic `FORTUNE_OMENS` forever, so the
  promised third card was a dangling thread sitting at the very SEED of the Ayume=Leah foreshadow (the
  prophecy's whole job per N14 is to "seed the Ayume betrayal").
- **Fix:** new one-time `FORTUNE_THIRD` reel (~564, 6 lines) + a middle branch in `onTalkFortune` (~580):
  `else if((SAVE.bestEnding||0)>=1 && !SAVE.epStorySeen.fortune3){ SAVE.epStorySeen.fortune3=true; …; playDialogue(FORTUNE_THIRD); }`.
  So once the player has WITNESSED the betrayal at the throne — `SAVE.bestEnding` is set by `playEnding` (~829)
  on ANY final-boss clear (the betrayal scene `EP_STORY[7].betrayal` plays before it) — the next tent visit
  finally turns the card, exactly once, then reverts to the omen rotation. **Spoiler-safe by gate:** it fires
  only AFTER the player already knows Ayume=Leah, so it recontextualises, never spoils. Content names both
  identities ("Leah, she signed the book. Ayume, she signed your heart."), pays off the prophecy's THE BELOVED
  card ("not every hand that leads you means to lead you home"), and seeds the diff-9 Holy-Grail / all-three-
  saved path ("a fox… who may yet choose otherwise — and one road narrow enough to carry all three of you back
  into the light… refuses it at the very brink"). Speakers `fortune`/`narrator`/`hero` all resolve (fortune
  portrait ~462).
- **Persistence:** seen-once via `SAVE.epStorySeen.fortune3` (`epStorySeen` survives `wipeSave`, ~295) and the
  trigger `SAVE.bestEnding` (survives `wipeSave`, ~288) — so the reveal is permanent across death/cooldown.
  Only ONE new boolean save flag; no new systems/timers. **Definition of Done:** player-facing (a new thing
  you can DO at the tent), so the 📖 guide THE FORTUNE TELLER line (~114) gained a clause that the third card
  is turned once you've witnessed the betrayal; `wiki.html` has NO Fortune-Teller section (grep 0 hits) so no
  wiki edit. Chose STORY/canon — a fresh thread vs the last runs (balance/pets §5p, QoL sealed-realm §5o,
  progression corruption-onset §5n, story+balance Kage-gate §5m). Validated: node 18/18 (`fortune3_v2_0617.js`,
  verbatim const+routing: first→prophecy+sets .fortune; pre-betrayal return→omen never the card; post-betrayal
  →THE THIRD CARD once, sets fortune3, then omens with index advancing exactly once; bestEnding 9 also triggers;
  fortune3-already-seen→omen no replay; undefined bestEnding→omen no throw; content names Leah+Ayume+THE
  ARCHITECT + brink/all-three foreshadow; all speakers valid) + `node --check` SYNTAX OK on the verbatim live
  region (557–588) wrapped. Edits via the file tools (the bash mount served a truncated tail mid-run per §5 —
  re-validated with a fresh single-write file). Browser F12 still the gate. pve.html only.

## 5t. 2026-06-17 — BALANCE: Blood Moon swarm trivially outrun (flat speed slower than the hero — §5e bug class)
- The Vampire-Survivors Blood Moon (`bloodMoon` ~2814, a 22s swarm every 30 game-min in the wilds, ends with a bonus
  item/gold/30 slay XP) spawned its `moonMob`s with a FLAT `m.ms=8.5+Math.random()` (~8.5–9.5). But the real gameplay
  hero runs `ms:14+SAVE.gear.boots*1.5` (~14–18.5+ before affixes/boons, ~3027) — i.e. the swarm was **40–50% SLOWER**
  than the player, and got MORE trivial as you geared boots. So you could simply WALK in a straight line away from the
  entire horde and collect the bonus loot at the end — the "survive it" beat (📖 guide ~110 "a swarm converges. Survive
  it") never actually triggered. This is the **identical failure mode as §5e** (the Coffer Wraith carrier was spawned
  flat-slower than the boots-scaled hero) — a flat enemy speed that the hero's scaling silently outgrows.
- **Fix:** make the swarm speed HERO-RELATIVE — `m.ms=Math.max(9,(((typeof hero!=='undefined')&&hero&&hero.ms)?hero.ms:14)*0.85)+Math.random();`
  Now ~**0.85× the hero's CURRENT boots-scaled ms** at every gear level: real kiting pressure (you can't simply outrun it,
  you must keep moving + use AoE) while staying **strictly slower than the hero** (0.85× + ≤1.0 jitter < hero.ms at every
  boot tier) so it's always kitable, never a hard-lock — distinct from the §5e carrier (which is +2 FASTER because it
  FLEES and you chase; the swarm chases YOU, so a touch slower is correct). Floored at 9; null/undef `hero` → 14 baseline.
  `moveTo` (~2592) applies `u.ms` uniformly to hero and mobs (same climb clamp), so the comparison is apples-to-apples.
  The mobs stay weak (0.3× hp / 0.4× dmg) — only their reach changed. One self-contained line; no new systems/save fields.
- **Definition of Done:** player-facing (the swarm now keeps pace), so the 📖 guide BLOOD MOON line gained "weak but nearly
  as fast as you — keep moving and thin it with area skills," and `wiki.html` (which had NO Blood Moon entry — grep 0) got a
  new Blood Moon systems bullet beside the Coffer Wraith one. Chose BALANCE — distinct from the last runs (story §5q/§5r,
  feel/aim §5s). Validated: node 26/26 (`bloodmoon_ms_0617.js`: strictly < heroMs at boot tiers 0–3 = kitable; ratio 0.85
  fresh; strictly > old 8.5–9.5 at every hero ms = more pressure; scales with the hero where the old value was flat; old
  ratio worsens with boots while new is constant; floor ≥9 at low/crippled ms; null/undef hero → 14 baseline no-throw;
  regression old-9.5 < hero-14 confirms the trivial-outrun bug) + verbatim `node --check` on the edited line wrapped with
  stubs (returns ms ≈14 for a hero at ms 16). Edit via the file tools (bash mount serves a frozen tail per §5). Browser
  F12 still the gate (the feel of a swarm that keeps pace). pve.html only.

## 5r. 2026-06-17 — STORY: betrayal foreshadow seeded in the cold-open cart ride (opening bookend)

- **Problem.** The cart-ride cold-open (`startCartRide` ~697), the FIRST scene a brand-new player sees, had
  NO foreshadow of the Ayume=Leah twist — warm banter (narrator → Ayume "you'll fall off the cart!" → hero
  "pass me an apple" → the aim instruction) straight into gameplay. Every other foreshadow surface lives later
  (the Fortune Ep1 prophecy + the §5q post-betrayal third card; Ep4/5 "she reached down and took them"), so the
  arc's OPENING carried none of the dread its ending pays off.
- **Fix (one additive dialogue line).** Inserted between the hero's apple line and the gameplay-instruction
  line (so the instruction stays last): `{who:'ayume',text:'(a soft laugh) Always so fearless — it’s why I
  chose you, [NAME]. You’ll follow this road wherever it leads, and never once think to ask who laid it.'}`.
  Innocent teasing on first play; on replay it's the architect in miniature — "I chose you" (the fated pure-heart
  offering — betrayal: "you were never the rescuer… you were the offering"), "follow this road wherever it leads"
  (THE BELOVED card: "you would follow anywhere… not every hand that leads you means to lead you home"), "who
  laid it" (betrayal: "Every turn I drew, you took"). Routed through the existing `playDialogue`/`[NAME]`
  substitution (~506) + the `ayume` `DLG_VOICE`/`CHARS` profile. **NO** new systems, save fields, controls, or
  balance.
- **Definition of Done.** Adds nothing the player can DO (pure narrative text), so per the DoD self-check no 📖
  guide / `wiki.html` change is needed. Complements, does not collide with, §5q: that fired the Fortune third
  card AFTER the betrayal (endgame/returning-player surface); this seeds the same thread at the cold-open
  (new-player surface) so the foreshadow now BOOKENDS the arc. Story is ~33% of the last 6 runs (under the §6
  50% target). Validated: `node` PARSE OK on the verbatim extracted `startCartRide` fn (stubbed globals via
  `new Function`) + 4 assertions (foreshadow present, ordered BEFORE the LEFT-CLICK instruction, dialogue line
  count 4→5, `[NAME]` token intact). Edit via the file tools (the bash mount again served a stale tail this run —
  an early `tail` of POLISH_LOG showed only through 10:55 while the file tool read through 12:25). pve.html only.

## 5s. 2026-06-17 — PLAYTEST FIX (FEEL): P7(c) visible crosshair + on-reticle hit/miss feedback (+ P7d audit)

- P7 (Hunter's Overlook aim-mode UX overhaul) had three open halves after §5l shipped (b) the clear exit.
  This run did **(c)** — "crosshair unclear, left-click did nothing" — and audited **(d)**. The Overlook `#xh`
  reticle was a small **28px ⊕** and a landed shot gave NO on-reticle confirmation: a weak hit only pushed a
  text feed line, a body hit nothing, a miss only a faint ground `fxRing`. So the shot never "read as
  responsive" (the literal P7c ask) — you couldn't tell a hit from a miss while looking down the sights.
- **Fix (self-contained, run-scoped, no save fields/systems).**
  (1) `#xh` enlarged **28→42px** with a layered amber glow (`text-shadow 0 0 6px #000, 0 0 16px #ffb347,
  0 0 26px #ff8c2a`) — big, centered, obvious.
  (2) New `#aimHM` marker `<div>` (centered like `#xh`, z 26, pointer-events:none) + run-scoped `aimHMt`/`aimHMk`
  + `aimMark(kind)` and `tickAimMark(dt)` declared next to `setAimMode`. `aimMark`: 2 = weak-spot crit (**red ✕**,
  0.32s), 1 = body hit (**amber ✕**, 0.32s), 0 = miss (**soft grey ·**, 0.16s). `tickAimMark`: fades opacity 1→0
  and pops scale **1.0→1.55** over the window (impact read), hides at 0; called once in the loop beside the
  existing `aimCd=Math.max(0,aimCd-dt)` (~3405). Cleared in `setAimMode(false)` so it never lingers off the pad.
  (3) Wired into `aimShot` (~1764): a confirmed `best` → `aimMark(weak?2:1)`; a miss → `aimMark(0)` alongside the
  ground ring. The bolt HOMES to `best` (`projs.push({tgt:best})`), so a lock at fire-time = a guaranteed connect —
  flashing the marker on fire is correct, not optimistic.
- **P7d audit (no code change needed):** the left-click→`aimShot()` path fires cleanly — pointerdown (~3098)
  routes `e.button===0 && aimMode` straight to `aimShot();return;`, and the overlay-exclusion (~3095, which
  includes `#aimExit`) only early-returns on clicks that land ON a panel — it never intercepts a canvas click.
  The `#aimExit` entry is exactly what stops the ✕ button from ALSO firing a shot. Nothing swallows the click.
- **Definition of Done:** player-facing, so the 📖 guide THE-LAY-OF-THE-LAND line now describes the big ⊕ reticle
  and the red-✕ / amber-✕ / · feedback. `wiki.html` has NO Overlook/aim section (grep 0) → no wiki edit. The
  AIM-MODE feed + Overlook tooltips already cover the controls (§5l) and stay accurate. Chose FEEL/aim — the last
  feel run was 10:55 (P7b); the runs since were balance/QoL/story, so feel was due. **P7(a) free-360° rotation is
  the only remaining P7 sub-item.** Validated: node **19/19** (`p7c_hitmarker_0617.js`: weak/body/miss set the
  right ✕/· glyph + colour + timer; decay fades opacity 1→0 + scale pops >1 then hides at expiry; clamp at 0 no
  negative; fresh scale ≈1.0; null-`#aimHM` guard no-throw; idle tick is a no-op) + verbatim `node --check`
  SYNTAX OK on `setAimMode`/`aimMark`/`tickAimMark`/`exitAim`/`aimShot` tail. Edits via the file tools. Browser
  F12 still the gate (reticle size/glow, the ✕ pop feel). pve.html only.

## 5b. 2026-06-14 session — CORE skills + aim-cast + STORY/FACTIONS (NEW, needs browser pass)

Big changes this session (all validated by isolated node syntax/logic checks; the live
pve.html could NOT be full-node-checked because the sandbox mount froze its tail — browser
F12 pass pending). See `PVE_WORLD_DESIGN.md` for the full world/faction/quest blueprint.

- **Skills now use the SHARED CORE kit + aim-then-cast** (was: pve's own 4-ability instant-cast).
  `buildKit(ty)` → `EF_CORE.buildKit(ty, SKILL_P, 1)` (per-element Q/W/E/R + R-super, identical to
  the MOBA). `SKILL_P` = pve combat primitives `{fxRing, aoe:pAoe, dash:pDash, castAt:pCastAt,
  lineShot:pLineShot}` (added `fxBeam`, `pCastAt`, `pLineShot`; projectile loop now handles
  point-travel `{pt,fn}` casts, not just homing `{tgt}`). **Power scalar is passed as 1 and
  `kitPow()` (=`(1+aoe%/100)*vetMult()*RUNUP.aoe`) is applied INSIDE pAoe/pLineShot** so gear/
  boon skill scaling stays live (don't pass kitPow() into buildKit — it would snapshot).
  CORE abilities read `h.level` → aliased to `hero.lvl` (set in startRun/giveXP/castSkill/efCast).
  Unique hooks preserved: Emberfang burn in pAoe, Stormstep path-damage in pDash.
  Aim system mirrors the MOBA: `aimIdx`, `aimRing`/`aimLine`, `startAim(i)` (Q/W/E/R + HUD
  buttons arm; self-target fires now), `castSkill(i,pt)` (left-click ground fires), `cancelAim`
  (right-click/Esc/S), `updateAim()` called each loop. Touch (`efCast`) stays instant-cast
  toward the joystick aim. hasteT (CORE buff/Avatar super) now decays + doubles attack speed in tryAtk.
- **Combat facing fix**: tryAtk now faces the target (`atan2(fdx,fdz)+faceOffset`) so units no
  longer keep stale movement facing during combat. (NOTE: the model FACE_FIX?? 0 convention in
  applyModel already matches the MOBA/audit exactly — that part was NOT the bug. Un-audited
  models still default to 0 → fix via audit.html → model_calibration.js, never inline.)
- **STORY / FACTIONS / MAIN QUEST** (`SAVE.story`/`shards`/`rep`/`codex`, v4 save migration,
  ALL preserved by wipeSave like skills/CT). Data: `FACTIONS{}` (7), `REGIONS[]` (3 mapped to
  the existing dungeons by `di`: Tanglewood/Leaf, Howling Crypt/Phantom, Abyssal Vault/finale),
  `SHARDS{}`, `QUESTS[]` (3-act chain). Logic: `questCur/storyAdvance/grantShard/onWardenKill/
  onTalkElder/onKillProgress/onRegionEnter`, `shardBonus()` (Leaf=+regen, Phantom=+lifesteal,
  hooked into the hero regen line + hit() lifesteal). UI: `#quest` Journal overlay (J key / 📜
  top-bar / Elder Varn click), one-time `#intro` Sundering modal (shown in init when story===0).
  Hooks: warden kill in hit() → grantShard + advance; kills→onKillProgress; dungeon entry→
  onRegionEnter; Elder click→onTalkElder. World map (`drawWmap`) now labels each region's
  element + faction + cleansed state + current quest.
## 5c. 2026-06-14 (cont.) — heroes/models/wilds + 7 zones + death overhaul + anti-cheat

- **P2 (2026-06-16) — Barkindle revive at the Kennel.** The signature starter pet is no longer
  lost on death. New run-scoped `barkindleDown` flag (declared near the pet helpers ~2566, reset
  in startRun next to the Barkindle spawn). The pet death branch in `hit()` (~2324) sets it when
  the dying pet is `slot==='barkindle'`. New `KENNEL_POS={x:-7,z:5}` town prop (doghouse + bowl,
  ~1358) + an infoSpot. `reviveCost()=50+diff*15`; `reviveBarkindle()` (~2568) mirrors the egg-pet
  mid-run spawn formula (diff/level/Taming-tier scaled, full HP) and re-applies the barkindle GLB.
  `openBuild()` gains a town **Kennel branch** (press B near the doghouse) showing a forge-style
  "🐾 Revive Barkindle" button, gated on `barkindleDown && gold>=cost`. Reuses mkUnit/applyModel/
  petTier — no new systems/save fields (run-scoped, like the fresh per-run spawn).

- **P3 (2026-06-16) — MOBA-style pet command (Barkindle).** Ported from `index.html`'s
  pet select+command pattern. New run-scoped `petSel`/`petSelRing` + `makePetRing()`/`selectPet(u)`/
  `clearPetSel()`/`commandPet(pt,foe)` inserted just before the `pointerdown` handler (~2768).
  Left-click a team-0 pet (within 2.6u) selects it (a blue `RingGeometry` follows it via an update
  in the pet-AI block); the next right-click routes to `commandPet` (intercept added before the
  hero right-click logic) — enemy → `cmdTarget`, ground → `cmdMove` — and `clearPetSel()` hands
  control back to the hero (the right-click `return`s so the hero never also moves). `S`/`H` in the
  keydown handler stop / hold the selected pet then deselect. The pet AI block (~2990) gained a
  command chain *wrapped around* the existing autonomous AI in an `else{}` (NOT a `continue`, so
  the shared `updateAnim`/threat code at the loop tail still runs): `cmdHold` defends in place,
  `cmdTarget` chases+attacks until the target dies (then auto-clears), `cmdMove` walks to the point
  then clears — when no order is set the original flee/assist/node-gather AI runs unchanged. Stale
  selection cleared in startRun (Barkindle spawn) and on the pet's death branch in `hit()`. No new
  systems, no new save fields (run-scoped). Validated: 21-assert node logic test + verbatim source
  parse check (the bash mount freezes the tail, so tail edits are validated via Read-tool brace
  checks + isolated node --check per the §5 gotcha).

- **P4 (2026-06-16) — Ayume companion wears Leah's GLB (Yui wears Irene's).** The N5 companions
  rendered as tinted placeholder humanoids (`look(u,'hero',col)`), with the GLB swap flagged "later
  polish" — and the live concern was that the Ayume slot must use **Leah's** model, never Irene's.
  Fixed: new `const COMP_GLB={ayume:'hero/Leah_Set_Default.glb',yui:'hero/Irene_Token_000001.glb'}`
  after `COMP_PARTY` (~968). `spawnCompanion()` tail (~981) now sets `u.slot='comp_'+who` and, for a
  mapped companion, `applyModel` if the prefab is already loaded else `autoLoad(slot,glb,5)` with the
  tinted humanoid shown as a one-frame fallback while the GLB streams in. The actual hero GLB
  filenames are `hero/Kai_Set_Default.glb`, `hero/Leah_Set_Default.glb`, `hero/Irene_Token_000001.glb`
  (NOTE Irene's is `_Token_000001`, not `_Set_Default`). The Ayume→Leah model carries straight through
  `beginBetrayal`/`ascendAyumeBoss` (her slot stays `comp_ayume`), so the architect's reveal is
  literally Leah's face — on-theme. Reuses `autoLoad`/`applyModel`/`prefabs` — no new systems/save
  fields; companion slots (`comp_ayume`/`comp_yui`) don't collide with the `barkindle`/`mobN`/`boss`
  slots. Validated: 12-assert node logic test (Ayume loads Leah & NEVER Irene, Yui loads Irene & NEVER
  Leah, loaded-prefab reuse applies without reload/placeholder, unknown companion → placeholder only)
  + verbatim `spawnCompanion` node --check. Bash mount served the usual stale tail (0 grep hits) so the
  edits were confirmed via Read-tool on the true file (lines 965–985, head region).

- **Heroes = Irene/Kai/Leah only** (init: `HERO_NAMES` filtered from roster upgradeChains;
  Flyer/Combat/Mystic). Title text updated (no daily rotation). **Model pool 6→18** distinct
  pets (coprime stride); bosses + starter pet now pick a RANDOM slot (were hardcoded mob0).
- **Wild landmarks** (after the scatter IIFE): `hamlet()` (ruined houses, solid), `briarMaze()`
  (hedge walls via wallLine + center prize), `waterfall()`×2 (animated scrolling CanvasTexture,
  `WATERFALLS[]` + `updateWaterfalls(dt)` in loop). All terrain-aware + clickable infoSpots.
- **7 ELEMENTAL ZONES**: `DUNGEONS` now Mossfang(Leaf)/Howling Crypt(Phantom)/Cinderpeak(Fire)/
  Frostmere(Ice)/Stormspire(Lightning)/Ironroot(Earth)/Abyssal Vault(Mystic), tiers 1..7 (tier
  drives `diffMult` so high zones are "intense right away"). `WARDEN_BY_TIER` names bosses (no
  more tier[-1] array); `FINAL_ZONE=last`; `dungeonState`/`wpFound` derive from DUNGEONS.length;
  portals spaced on an arc. **REGIONS** expanded to 7 (di 0..6, vault now di 6). **Zone-select
  map** (`#zonemap`, 🗺 title button → `openZoneMap`/`renderZoneGrid`, sets `startZone`); startRun
  JUMPS the hero+pet to `safeSpotFor(zone)` and populates it. **Safe-start pads**: `SAFE_R=16`,
  `inSafeStart(pos)` (town + entry pad + wilds-near-town) — monster aggro + boss telegraph skip it;
  populateDungeon keeps the pad clear. New shards Fire/Water/Lightning/Earth → `shardBonus()`
  (crit/dr/ms/hp) hooked in hit()/applyEquipStats.
- **Layered permadeath** (heroDown rewrite): potion = instant revive, no injury; else if within
  the 24h injured grace → `permaDeath()` (wipeSave, full loss, CT kept); else `openDeath()` modal
  → pay `RESPAWN_COST=3` CT → 60s (`FAST?5`) countdown → revive at `heroSafeSpot()` + set
  `SAVE.injuredUntil=now+24h`. `injuredFactor()` (0.8) multiplies hero hp/dmg/ms in applyEquipStats.
  `SAVE.injuredUntil` NOT preserved by wipeSave (permadeath = clean slate). `#death` modal blocks
  game input (pointerdown guard). Loop keeps running during the choice (gameOver=false, hero.dead).
- **Anti-cheat → Hollow Blight** (disguised shadow-ban). Hidden flag `localStorage['efm_int']`
  (separate key, survives everything). `setInterval(acWatch,1000)`: trips on gold teleport
  (>200k/10s), HP over cap (>1.35×maxHp or >300k), CT injection (>60 unexpected — `acExpectCT()`
  is called by ctAdd/ctSpend, `acReset()` baselines in startRun), `acHit()` caps single hits
  (>100k). On trip `applyCurse()` → `isCursed()` true forever: hit() deals 0 from hero, lootDrop/
  giveXP/ctAdd no-op, hero desaturated, framed as an incurable in-world sickness (NEVER labelled
  anti-cheat). Thresholds are generous to avoid false positives. NOTE: client-side only (raises
  the bar; a real wallet/anti-cheat still needs a backend — see §6).
- **Threat "con" markers + monster personality** (2026-06-14): `pickPersona(tier,elite)` rolls each
  spawn's temperament (`u.persona`): ~5% `passive` (won't aggro until `u.provoked`, set in hit()),
  styles territorial/normal/smart/relentless → `aggroR`/`chaseTime`/`leashR`/`braveAt`. Higher tier =
  bigger aggroR + chaseTime. AI branch rewritten: smart mobs flee home below `braveAt` HP; relentless
  chase until you hit `inSafeStart` (town/pad); others leash by range/time. `threatTier(u)` (0..5,
  power ratio vs hero, +1 elite, ≥4 boss, 5 final) drives a floating `THREAT` pip+glyph sprite via
  `updThreat(u)` (throttled 0.5s in the unit loop, redraws only on tier change). Guide + run-start
  feed teach the legend. NOTE: per-spawn personality means packs vary — don't assume uniform behaviour.
- **Per-Warden boss mechanics** (2026-06-14): `bossSpecial(b)` dispatches on `b.tier` (1..6) / `b.finalBoss`
  (helpers `bossAdds`/`bossAoeDmg`/`snareRing`): Mossfang snare+saplings, Crypt Howler life-drain+adds,
  Pyrelord burning ground + enrage <30% (`b.enraged`, atkSpd×1.8), Tidemother freeze (hero.slowT 2.6) +
  ice-shard projs, Voltaic dive (teleport to hero) + chain-lightning to pets, Forgemaw quake + spawns a
  rubble obstacle; Hollow King = HP-phase (adds → blight burns → desperation slam+adds). Hooked in the
  boss-AI block via `u.spCd` (every ~7s, final ~5s, when hero <22 & exposed), alongside `bossTelegraph`.
  Reuses mkMon/mkBurn/fxRing/fxBeam/projs/obstacles. Guide WARDENS line + docs updated.
- **Faction reputation + Warden bestiary** (2026-06-14): `addRep(fac,n)`/`repTier(fac)` (REP_TIERS
  Neutral→Exalted), `SAVE.rep` (persisted, cursed earns none). Kills in a dungeon grant rep to that
  zone's faction (hit() kill branch: elite 6 / mob 1; warden 120 via onWardenKill, which also sets
  `SAVE.codex[warden]` for the bestiary). Journal (`questUI`) now shows a 📖 WARDENS bestiary
  (lit on first kill) + each faction's standing. Rep is flavour/progression for now — no perk yet
  (hook a reward at Honoured/Exalted later). Guide J-line updated.
- **UI polish** (2026-06-14): persistent top-bar status indicator (`#statusInd`: 🩸 INJURED Nh / 🦠
  BLIGHTED) in updHUD; a boss health bar (`#bossBar`/`#bossBarName`/`#bossBarFill`) that shows the
  nearest engaged Warden's name+HP when within 60u; a disguised "🦠 AFFLICTED — Hollow Blight / seek
  the Wellspring cure" panel atop the Journal when cursed (reinforces the sickness framing — the cure
  is intentionally unattainable; it's a shadow-ban, not a real quest).
- **PIVOT → "Beyond the Twilight Veil"** (2026-06-15/16): see `PIVOT_TWILIGHT_VEIL.md` + `MASTERPLAN_24H.md`.
  Shipped Phase-A foundation: player **naming** (`SAVE.heroName`, `#nameAsk`, `heroName()`); **dialogue
  system** (`#dlg`, `CHARS`, `playDialogue/dlgNext`, typewriter, input-blocked while active); first-launch
  **carnival intro** (`playIntro`); **Kai-only** (`dayHeroes=[Kai]`); **Barkindle** forced starter pet.
  Plus the **difficulty→ending ladder**: `playEnding(diff)`/`ENDINGS`/`ENDING_TITLE`/`showEndScreen`,
  `runComplete` now calls `playEnding(cleared)`; OVAs (`OVA1/OVA2/EPILOGUE/playOVA`) unlock at a diff-6
  clear (`SAVE.ovaUnlocked`, title "▶ Memories" link), Holy-Grail epilogue at diff-9 (`SAVE.bestEnding`).
  Save fields `heroName/endingsSeen/bestEnding/ovaUnlocked` added + preserved by wipeSave. Guide updated.
- **AUTONOMOUS BUILDER**: scheduled task `twilight-veil-cron` runs every 20 min for ~24h (until ~2026-06-17
  03:30 UTC), shipping ONE validated feature per run from `MASTERPLAN_24H.md` §7 backlog (60% narrative),
  logging to `BUILD_LOG.md`. Each run node-validates the head region + new blocks. If editing pve.html
  manually during this window, re-Read before editing (expect edit-conflicts with the cron).
- **COLD OPEN (FF-style prologue)** (2026-06-16, manual; cron paused): first launch now goes name →
  `startColdOpen()` → a short POWERED endgame showcase (Kai at lvl33, 5000hp/520dmg, all skills,
  `corrReset(70)` shadow-on, spawned in DUNGEONS[FINAL_ZONE]=Castle of Shadows with a 9-mob tier-7
  wave) → on wave-clear or 34s → `coldOpenEnd()` clears the arena, `hero=null`, and flashes back via
  `playIntro()` (carnival) → title. Reusable powered-scene scaffold. GUARDS so nothing leaks: `var
  prologue` flag → `addCorruption`/`corruptionTick`/`acWatch` early-return, `heroDown` heals+returns
  (unkillable), `dungeonState[FINAL_ZONE].pop` toggled so the loop doesn't double-populate, NO startRun
  (so no SAVE.last cooldown / CT / loot leak). `#skipCold` "Skip prologue ▶" button → coldOpenEnd.
  **Test hook: `pve.html?cold=1` replays it.** When P5 (cart-ride intro) lands, point the flashback at
  the cart-ride instead of the text `playIntro`. Validated: val_coldopen_0616 standalone + head node-check clean.
- **Validation**: every inserted block node-checked in isolation; head region (script→1313)
  node-clean (caught + fixed one dangling-else from the boss-model edit). Tail (death/anti-cheat/
  zone fns/loop) couldn't be full-node-checked (mount froze the tail) — **browser F12 is the gate.**

- **AoV mobile layout** (2026-06-15, item 3a): pve.html's `EF_TOUCH.init` now builds the same
  Arena-of-Valor CLUSTER as the MOBA (buttons carry `pos`/`size` → ef_touch.js cluster mode):
  corner ⚔ ATK (xl, efAttack), Q/W/E/R skill diamond (efCast toward joystick aim), small B/T/S
  trio. Cooldown probes `_pkCd(i)` (hero.kit.abs[i].cd vs hero.abCd[i]; off on dead/low-mana) +
  a T-button tpT channel probe drive ef_touch.js's grey-out + radial sweep + seconds. `⋯` extras
  drawer = collapsible help (📖/🗺/📜). `efTouchMatch(on)`→`EF_TOUCH.show(on)`: hidden at init,
  shown at startRun, hidden in runComplete/permaDeath. Desktop #hud ability buttons hidden on
  touch (bars kept). Guide CONTROLS got a 📱 mobile paragraph. Validated node 44/44 + a live
  Chrome run (`?touch=1&fast=1`): cluster renders, Q cast drained mana + showed the cd sweep,
  zero console errors. This closes backlog item (1)'s browser-pass for the touch layer.
- **Per-hero ranged profile** (2026-06-16, item 3b): the three champions now auto-attack differently.
  Module-level `RANGED_HEROES={Irene:1,Leah:1}` + `HERO_RNG_RANGE=12`/`HERO_MELEE_RANGE=3` + `heroIsRanged(name)`
  (just below the `dayHeroes` decl). `startRun` sets `hero.range` from the picked hero's name (Irene/Leah=12
  bolts via tryAtk's existing range>5 projectile branch, sp 60; Kai=3 melee) and stamps `hero.ranged`. The
  loop's hero auto-acquire is now `nearestFoe(hero, hero.range>5?hero.range+1:11)` (was flat 11) so ranged
  heroes engage at bolt reach. Hero-select cards show a 🏹/⚔ badge; the 📖 guide gained a HUNTERS line.
  Balance: base dmg identical across profiles (reach is the only difference), ranged 12 < monster-ranged 13,
  and daily heroes are mutually exclusive — pure identity, not a PvP lever. Validated node 23/23 + a live
  Chrome run (`?fast=1`): cards render the badges, Irene boots ranged (range 12), a direct tryAtk call
  confirmed ranged→1 bolt/no-hit and melee→instant dmg/no-proj, zero console errors. pve.html only.
- **Episode framework (N1)** (2026-06-16, cron run): the 7-chapter campaign scaffold. New save field
  `SAVE.episode` (1..7, highest unlocked chapter; preserved by wipeSave like story/endings). `EPISODES[]`
  data table (id/name/setting/zone/stance/obj) maps each chapter to a start zone (`zone`: -1=Wilds/Carnival
  hub, else DUNGEONS index): Ep1→Wilds, Ep2→0, Ep3→1, Ep4→2, Ep5→3, Ep6→4, Ep7→6 (Abyssal Vault=castle).
  Helpers `epUnlocked()` (clamped 1..7), `episodeOf(id)`, `chapBtnLabel()`. New **chapter-select overlay**
  `#chapsel` (fronts the zone map) + title `#chapBtn` "📖 Chapters — Ep N · Name"; `renderChapters()` lists
  all 7 (locked ones show 🔒 + greyed, clear-prev-to-unlock), `openChapters()` shows it. Selecting an
  unlocked chapter sets `startZone=e.zone` and syncs the zone-button label. `renderTitle` calls
  `chapBtnLabel()`; `runComplete` now bumps `SAVE.episode` (cap 7) on a clear so chapters unlock as you
  progress. Guide gained a CHAPTERS paragraph. Validated: isolated node logic test (n1_episodes_0616.js,
  all asserts pass) + head-region node-check clean (only the frozen-tail EOF artifact). pve.html only.
- **Episode 2 "Masquerade" story scenes (N2)** (2026-06-16, cron run): per-chapter intro/outro cutscenes
  reusing `playDialogue`. New `EP_STORY{}` table keyed by episode id (each `{intro:[],outro:[]}`), with
  Episode 2 authored: the masquerade-grove intro (puppet stall → crowd-surge separates Ayume → grove
  dancers close in → **fox-masked Yui's first appearance/introduction** → handoff to combat) and the
  Ep2 outro (the altar/portal cliffhanger — Ayume kneeling before Yui, "Forgive me, [NAME]"). New save
  field `SAVE.epStorySeen{}` (seen-once keys `i<id>`/`o<id>`; added to DEF_SAVE + preserved by wipeSave
  like story/episode). `maybeEpisodeScene(onDone)` (just below `openChapters`) plays the PRIOR chapter's
  outro (if unseen) then the CURRENT chapter's intro (if unseen) and is called once at the end of
  `startRun` (guarded `typeof` call). Episode 1's opener stays the first-launch `playIntro`. The
  "mask-hunt-as-battle" is realized by the existing zone-0 (Mossfang/grove) pack you drop into after the
  cutscene (reuse, not rebuild) — a dedicated walk-over mask-counter remains a possible polish item.
  Guide CHAPTERS paragraph extended (story cutscenes + Yui intro). Validated: isolated node logic test
  (n2_epscenes_0616.js — 14 asserts incl. seen-once gating, outro-on-next-chapter, onDone fires with no
  scene) + head-region node-check clean (only the frozen-tail EOF artifact at the final line). pve.html only.
- **Humanity ⇄ Corruption gauge (N3)** (2026-06-16, cron run): the spine system from pivot §4, added as a
  NEW layer over the existing death flow (working systems untouched). Run-scoped globals `corruption`
  (0..100), `corrShadow`, `corrConsumed` + consts `CORR_POWER=40`/`CORR_CRIT=92`/`CORR_MAX=100` and
  functions `corrReset(seed)`/`addCorruption(n)`/`corruptionConsume()`/`corruptionTick(dt)`/`shadowDmgMult()`
  (just below `maybeEpisodeScene`, in the bash-visible head). **Rises**: each skill cast (`castSkill` hook:
  +2.5, ultimate +7, +9 when already shadow) and lingering in the Underworld (`corruptionTick`: +0.25/s at
  episode 3+). **Falls**: Emberhollow/carnival (−6/s) and entry safe-pads (−2/s) via `corruptionTick`,
  called once in the loop's hero block. **Power Threshold** crossing sets `corrShadow` → the ultimate now
  ignites a shadow-frenzy (`hero.hasteT=4`, doubled attack speed via the existing hasteT pa

- **The Sundered Ledge — Flash/Charge traversal gate (W4)** (2026-06-16, cron run): WIRED the previously
  orphaned W4 scaffold (`VEIL_ISLES`/`mkVeilIsle`/`spawnVeilIsles`/`blockGaps` at ~1724–1746 were defined
  but never called). Added `spawnVeilIsles()` in `startRun` (right after `spawnCaches()`, ~2306) and
  `blockGaps(hero)` in the hero update block (after `avoidObstacles(hero)`, ~2497). The ledge is a flat
  disc at the far SE corner (115,-115; islandR 13) ringed by a black **void moat** annulus (13→20) with a
  violet rim; its own rare cache (`mkCache`) is sealed on it. `blockGaps` snaps any WALKING hero that
  enters the annulus back to the nearer rim, so you can never walk across — only a **dash** (Kai's `Charge`
  E = `pDash` range 15, or a Mystic/Lightning Blink) lands past the gap at d<islandR, which `blockGaps`
  leaves untouched. Egress: walk to the ledge rim and dash back out. **Gotcha:** the in-place island/loop
  code lives in the bash-frozen tail, so this was validated by (a) a 9-assert gap-math logic test
  (`w4_gap.js`: incremental 0.3 & 0.5/frame walkers never cross; Charge from d20/d27 lands; 5-range hop is
  gated; egress clears) and (b) a verbatim stubbed-THREE reconstruction of the three functions
  (`w4_recon.js`: spawns the isle, places the cache, snaps a d=16 walker to 13, null-safe). Guide 🌑 THE
  SUNDERED LEDGE line + wiki bullet added. FIRST traversal-gated secret — movement skills as keys.th) + a one-time
  awaken feed/bark; `shadowDmgMult()` rises with corruption (Equivalent Desire, available for future skill
  scaling). **Critical Limit + max** → `corruptionConsume()` zeroes HP and calls the EXISTING `heroDown()`
  ("Consumed by the Veil" — reuse, not a rebuild), guarded once by `corrConsumed`. `reviveHeroAt` eases the
  gauge back to ≤60 so the run stays playable. HUD: new `#corrW` bar under HP/MP/XP (fill `#corrf` shifts
  green→purple→red, `#corrt` shows remaining Humanity %), driven in `updHUD`. Guide gained a HUMANITY ⇄
  CORRUPTION paragraph; wiki.html EF HUNT section got a matching bullet. Validated: isolated node logic test
  (n3_corruption_0616.js — 13 asserts incl. threshold awaken/drop, critical warning, consume-once/no-double,
  town/pad/underworld tick rates) + snippet parse-check (n3_snippets_0616.js) of every inline hook. NOTE:
  bash mount served a fully stale pre-edit snapshot this run, so the in-file head node-check was not possible
  — browser F12 remains the gate. pve.html + wiki.html.
- **Episode 3 "The Rite of Blades" + sigil-brand (N4)** (2026-06-16, cron run): the blood-pact chapter.
  `EP_STORY[3]` authored — intro (the altar of black glass, Yui named, Ayume's confession about *The
  Scimitar's Secrets*, the "Two may pass / one cannot pass unmarked" pact, taking up the living scimitar,
  the sigil-brand, the plague-guardian gate → hand off to combat) + outro (the last guardian falls →
  stepping through the portal, the Carnival gone, the Underworld closing over you). The **guardian
  mini-boss** is the existing **zone-1 (Howling Crypt) warden/pack** you drop into (reuse, not rebuild),
  matching the N2 convention. **The brand awakens the first shadow skill via the N3 gauge** (no new
  mechanic): `maybeEpisodeScene` now flags `rite` when Ep3's intro is freshly queued and wraps `onDone`
  with **`riteBrand()`** (just below `maybeEpisodeScene`) — on first rite it pushes `corruption` to the
  Power Threshold (CORR_POWER 40) so `corrShadow` awakens inside `addCorruption`, shows the brand feed,
  and sets `SAVE.epStorySeen.rite`. Thereafter `startRun`'s `corrReset` seeds a **faint residue of 8**
  (well below the threshold) for branded characters — realizing pivot §6's "unlock the first shadow skill
  AND start the Corruption gauge at a low value." `SAVE.epStorySeen.rite` rides the existing
  `epStorySeen` object (already preserved by wipeSave). Guide CHAPTERS line + wiki.html updated.
  Validated: isolated node logic test (`n4_rite_0616.js` — 18 asserts: Ep3 queue = Ep2 outro + Ep3 intro,
  brand pushes to threshold + awakens shadow, onDone fires once, no replay/no double-brand, residue-8 vs
  fully-human run start, Ep2 unaffected) + head-region node-check clean (only the frozen-tail EOF artifact;
  new code confirmed present in the head snapshot). pve.html + wiki.html.
- **Companion party (N5)** (2026-06-16, cron run): Ayume & Yui as story party members built on the
  existing ally/enemy AI (no rebuild). A companion is a `kind:'ally'` unit with a `companion:<who>`
  tag (`spawnCompanion(who,team)` → mkUnit, hp = 70% of the hero's maxHp, ranged bolts range 11,
  dmg scaled by diff×vetMult, tinted placeholder humanoid via `look(u,'hero',col)` from `CHARS[who].col`).
  `COMP_PARTY{}` is the per-episode roster (Ep1 Ayume; Ep4/5/6 Yui; Ep7 both) — `partyForEpisode()`
  reads `selEp` and spawns them at the hero's side; it's called once near the end of `startRun` (after
  the zone-jump sets the hero's final position) guarded by `typeof`. A NEW AI branch
  `else if(u.kind==='ally')` (placed between the pet and tower branches in the unit loop) is
  **team-driven so the SAME unit can flip**: team 0 → assist+escort (gentle OOC regen like pets,
  `nearestFoe(u,20)` to fight, follow the hero past 6u); team 1 → hunt the hero relentlessly
  (`nearestFoe(u,999)`, ignores safe pads). The betrayal hooks for N7/N10: `flipCompanion(who)` (sets
  team 1 + aggroNow + a persona + a 💔 feed/bark; `drawBar` recolours the bar red), `setCompanionTeam(who,team)`,
  `companionUnit(who)`/`companionsList()`. Companions are `kind:'ally'` so every `kind==='pet'` loop
  (petCap, pet boons, pet UI count) correctly skips them; threat markers + aim weak-spots key on
  `team===1` so a flipped companion gains both automatically. Guide CHAPTERS line + wiki.html Companions
  bullet updated. Validated: isolated node logic test (`n5_companions_0616.js`, 16 asserts: per-episode
  spawn, 70% hp, ranged, idempotent no-double-spawn, flip to enemy, allied-targets-mob vs flipped-targets-hero,
  Ep2/3 spawn none, Ep7 spawns both) + inline-fragment parse-check (`n5_snippets_0616.js`). NOTE: bash
  mount served a stale frozen-tail snapshot this run so no in-file head node-check — browser F12 is the gate.
  Next (N6): Episode 4 "Garden of Whispers" — shrink stage + river-of-visions betrayal-foreshadow cutscene.
- **Episode 4 "Garden of Whispers" story scenes (N6)** (2026-06-16, cron run): `EP_STORY[4]` authored
  (intro + outro), reusing the existing `playDialogue`/`maybeEpisodeScene` pipeline — no new mechanic.
  Intro: the **shrink stage** (you step from the portal made small — toadstool cathedrals, a dewdrop
  moon), **Yui** as the present companion (Ayume absent in person; she appears ONLY inside the vision),
  Barkindle shrunk too, then the crystal glade and the **river of visions** — the signature beat — which
  shows the player a first-person **vision of the betrayal to come**: alone on a field of ash, shadow-fire
  in your own hands, every loved face accusing you, an Ayume "crowned in dark" telling you "I only had to
  wait for you to want it," and Yui kneeling/fading ("…you let her…"). The vision shatters; the
  desire-spirit guardians uncoil → hand off to the existing **zone-2** pack (Ep4 maps to DUNGEONS[2] via
  `EPISODES`, reuse not rebuild, per the N2/N4 convention). Outro bridges to Ep5: the dancers' clearing,
  and a glimpse of Ayume **walking willingly** into the dark (seeding Ep5's staged-"capture" secret). No
  new save fields — rides the existing `epStorySeen` (i4/o4, preserved by wipeSave). Guide CHAPTERS line +
  wiki.html updated. Validated: isolated node logic test (`n6_ep4_0616.js` — 36 asserts: well-formed
  lines, river-of-visions + vision marker present, betrayal foreshadow seeded, shrink stage present,
  Ayume absent-in-person, Ep4 entry plays Ep3 outro + Ep4 intro, seen-once gating, Ep5 entry plays Ep4
  outro) + head-region node-check clean (only the frozen-tail EOF artifact). pve.html + wiki.html.
  Next (N7): Episode 5 "Dance Macabre" — bloom puzzle + creature-swarm battle; Ayume "captured".
- **Episode 5 "Dance Macabre" story scenes (N7)** (2026-06-16, cron run): `EP_STORY[5]` authored
  (intro + outro), reusing the existing `playDialogue`/`maybeEpisodeScene` pipeline — no new mechanic,
  matching the N2/N4/N6 convention. Intro: the garden opens into the **Dance Macabre** — a wall-less
  ballroom of black mirror where faceless dancers turn; **Yui** is the present companion (Ayume is NOT
  in COMP_PARTY[5] — she's the one taken), Barkindle drags you off the hypnotic beat, then the music
  bleeds red and the room turns predatory. The signature **colour-hungry bloom** beat is framed as a
  solve-while-fighting gauntlet (wake the crystals in each bloom's colour to open a path) and hands off
  to the existing **zone-3** pack (Ep5 → DUNGEONS[3] via `EPISODES`, reuse not rebuild) for the
  creature-swarm. Mid-intro, **Ayume is dragged down into the throne-dark** ("…don't follow me down—")
  → the rescue goal. Outro: shelter in a ruin, the **relationship beat** (Kai blames Yui for holding
  him at the blooms while Ayume was taken), and the **staged-capture secret seeded** — Yui: "the hands
  didn't seize her. She reached down and took them," setting up Ep5's "she went willingly" payoff. No
  new save fields — rides the existing `epStorySeen` (i5/o5, preserved by wipeSave). `COMP_PARTY[5]`
  (Yui team 0) and the `EPISODES[5]` row already existed from N5/N1. Guide CHAPTERS line + wiki.html
  updated. Validated: isolated node logic test (`n7_ep5_0616.js` — 63 asserts: valid speakers,
  Dance-Macabre named, bloom-puzzle + swarm-handoff present, Ayume-captured beat, staged-capture secret
  seeded, shelter/blame beats, Ep5 entry plays Ep4 outro + Ep5 intro, seen-once gating, Ep4 entry never
  pulls Ep5 content) + head-region node-check clean (only the frozen-tail EOF artifact at the snapshot's
  final line). pve.html + wiki.html. Next (N8): Episode 6 "Shadows of Self" — Yume NPC, anchor/food
  items, compass objective marker.
- **Episode 6 "Shadows of the Self" story scenes (N8)** (2026-06-16, cron run): `EP_STORY[6]` authored
  (intro + outro), reusing the existing `playDialogue`/`maybeEpisodeScene` pipeline — no new mechanic,
  matching the N2/N4/N6/N7 convention. Intro: the **Corrupted Wastes** — a quake rifts the ground and
  **separates you from Yui** (whose outline warps/doubles — "it wears my face": Yui distorted), the
  **shadow-sigils spread into black tendrils up your arm** (corruption made literal) and the Whisper
  taunts (routed through `narrator`, the only available voice — there is no `whisper` CHARS entry). You
  **meet Yume** (🌸, the `yume` CHARS speaker, already defined), the one human-warm figure down here, who
  gives the **enchanted compass** (needle points to the Castle of Shadows / Yomi no Tō) and **human bread**
  (anchor), and teaches the **Human-Essence Balancing** of pivot §4/§11.3 diegetically: eat human food to
  pull Corruption back toward Humanity + mask your scent, but a steadying human draws the hunt to you
  ("power, or peace, never both") and "watch the line between your humanity and the dark" (points the
  player at the N3 `#corrW` HUD bar). Yume's **double-edged warning** about the rescue/Ayume ("the ones
  who are taken and the ones who do the taking wear the same chains") seeds the staged-capture payoff.
  Hands off to the existing **zone-4** pack (Ep6 → DUNGEONS[4] via `EPISODES`, reuse not rebuild). Outro
  bridges to Ep7: the bridge to the **Castle of Shadows**, the compass needle gone dead-steady, a more
  distorted Yui ("some locks are on the inside"), and the throne seeded for the finale. No new save
  fields — rides the existing `epStorySeen` (i6/o6, preserved by wipeSave); `COMP_PARTY[6]` (Yui) and the
  `EPISODES[6]` row already existed from N5/N1. The literal **food-item + compass objective-marker as real
  in-engine props remain a polish-open item** (taught narratively this run, like N7's literal bloom
  minigame). Guide CHAPTERS line + wiki.html updated. Validated: isolated node logic test
  (`n8_ep6_0616.js` — 88 asserts: real EP_STORY literal eval-extracted from pve.html, valid speakers,
  Yume/compass/needle/bread/scent/Humanity/tendrils/Wastes/Yui-distorted/Castle/double-edged-warning all
  present, Ep6 entry plays Ep5 outro + Ep6 intro, seen-once gating, Ep7 entry plays Ep6 outro only, Ep5
  never pulls Ep6 content) + head-region node-check clean (only the frozen-tail EOF artifact at the final
  line; the new block sits inside the head and parsed). pve.html + wiki.html. Next (N9): Episode 7 "Kage
  no Mamoru" — castle gauntlet + boss; Power Threshold / Critical Limit on the gauge.
- **Episode 7 "Kage no Mamoru" — castle gauntlet + gauge-gated final boss (N9)** (2026-06-16, cron run):
  the campaign's penultimate beat. `EP_STORY[7]` authored — **intro only** (the betrayal/throne stays for
  N10): the bridge → the gates of **Yomi no Tō (Castle of Shadows)** open on their own, Yui as the present
  companion (her shadow "falling the wrong way"), the shades peel off the walls, and **Kage no Mamoru
  descends** (the `kage` CHARS speaker, already defined) as "the last door before the throne." The **Power
  Threshold + Critical Limit are taught diegetically as the rule of the fight** (Yui: stay too human and
  your blade barely scratches him — reach the Power Threshold by letting the shadow rise — but cross the
  Critical Limit and the Veil takes you), and the throne is seeded one door above for N10. Rides the
  existing `epStorySeen` (o6 already played on Ep7 entry from N8 + new i7); no new save fields.
  **Boss re-theme (no rebuild):** the existing **final boss** (spawned by `maybeFinalBoss` in
  `FINAL_ZONE`, which is Ep7's zone) becomes **Kage no Mamoru when `selEp===7`** — `mkBoss` sets
  `b.kage=!!(final&&selEp===7)` and `b.bossName` switches Kage/Hollow King accordingly; `maybeFinalBoss`'s
  awaken feed is Ep7-aware. `b.finalBoss` stays true, so the boss bar + larger telegraph + per-frame
  `bossSpecial` cadence are unchanged. **Gauge-gated fight:** a new `if(b.kage)` branch at the TOP of
  `bossSpecial` (before the Hollow-King `if(b.finalBoss)` block) makes the N3 gauge the whole fight —
  **below `CORR_POWER` (40)** Kage **mends +6% maxHp/tick and shrugs off your blade** (pure-hearted Kai is
  too weak, pivot §4) with a once-only taunt (`b.kw1`); **at/above it** he fights in phases (>50% hp →
  `bossAdds` shade-summon; ≤50% → `bossTelegraph`+`mkBurn`), and **past `CORR_CRIT` (92)** a once-only
  Critical-Limit warning fires (`b.kw2`). Reuses `bossAdds`/`bossTelegraph`/`mkBurn`/`drawBar`/`heroName`
  + the N3 globals — zero new systems. Guide CHAPTERS line + wiki.html updated. Validated: isolated node
  logic test (`n9_ep7_0616.js` — 15 asserts: below-threshold mends + once-taunt, at-threshold no-mend +
  adds phase, low-hp tele+burn, critical warning once, non-kage returns false [Hollow King path intact],
  EP_STORY[7] well-formed/14 lines/kage speaks/Power-Threshold + Critical-Limit taught) + head-region
  node-check clean (only the frozen-tail EOF artifact; the EP_STORY[7] edit sits in the head and parsed).
  The bossSpecial/mkBoss/maybeFinalBoss edits live in the frozen tail — verified present via the Read-tool
  grep, browser F12 remains the gate. Polish open: a literal multi-floor castle layout + Kage's own GLB;
  optionally fold `shadowDmgMult()` into the below-threshold penalty for outgoing hero damage too.
  pve.html + wiki.html. Next (N10): the betrayal — Ayume final-boss fight (companions flip via
  `flipCompanion`); Yui absorbed → the ending ladder.
- **The Betrayal — Ayume as the true final boss (N10)** (2026-06-16, cron run): the campaign's climax,
  built on the N5 companions + the existing boss AI/specials + `playDialogue` (no new systems). In
  Episode 7, felling **Kage no Mamoru no longer ends the run** — the kill branch of `hit()` now checks
  `if(u.kage&&!u.ayumeBoss&&!betrayalStarted)` and calls **`beginBetrayal()`** instead of `runComplete()`
  (the non-Ep7 Hollow King path is untouched — it still runs the ending directly). `EP_STORY[7]` gained a
  third key **`betrayal:[]`** (15 lines): the throne opens, Ayume is revealed as the architect (her name
  was **Leah**; she found *The Scimitar's Secrets* and needed a fated partner — "you were the offering"),
  **Kage's shade bows to her**, **Yui is absorbed into the onyx throne**, and Ayume steps down to fight.
  `beginBetrayal()` sets a run-scoped `betrayalStarted`, **pauses** the gauntlet (`paused=true` — the
  dialogue's own click-advance handler is unaffected by `paused`), plays the cutscene, and on done calls
  **`ascendAyumeBoss()`** then unpauses. `ascendAyumeBoss()` removes the Yui companion (absorbed feed +
  fxRing), then promotes the live Ayume companion (or `spawnCompanion('ayume',1)` if she died in the
  gauntlet) into the **true final boss**: `kind='mon'` (so the boss-AI branch — telegraph + `bossSpecial`
  — drives her, not the companion branch), `team=1`, `boss/finalBoss/ayumeBoss=true`, boss-tier hp
  (`900*diffMult(7)*3`), `bossName='Ayume'`, relentless persona, `eliteScale 1.7`, `eliteRing`. A new
  **`if(b.ayumeBoss)` branch at the top of `bossSpecial`** (before the `b.finalBoss`/Hollow-King block)
  gives her a 3-phase dark-Mystic moveset reusing `bossAdds`/`snareRing` (blood-binding + throne shades
  >60% hp), `bossTelegraph`+`mkBurn` (onyx fire 30–60%), and telegraph+adds+snare (the binding tightens
  <30%). Because she carries `finalBoss=true` (and **not** `kage`), her death falls through to
  `runComplete()` → **`playEnding(cleared)`** — the existing N11 difficulty→ending ladder (1=Consumed …
  9=Holy Grail). `betrayalStarted=false` resets in `startRun`. The campaign is now **playable end-to-end**:
  name → carnival intro → Ep1–7 cutscenes+beats → fell Kage → betrayal → Ayume → the ending ladder/OVA.
  Guide CHAPTERS line + wiki.html (new betrayal/true-final-boss bullet) updated. Validated: isolated node
  logic test (`n10_betrayal_0616.js` — 20 asserts: Kage death starts the betrayal & does NOT runComplete,
  cutscene plays + paused resets, Yui absorbed, Ayume promoted to kind=mon/team1/boss flags/boss-tier hp,
  killing Ayume runs the ending ladder, beginBetrayal idempotent, all 3 ayume-special phases fire, Hollow
  King non-Ep7 path still ends the run) + betrayal literal parse/eval (15 lines, speakers
  narrator/hero/ayume/yui, reveal seeded) + head-region node-check clean (frozen-tail EOF only; the
  bossSpecial/kill-intercept edits live in the frozen tail — validated verbatim in the logic test, applied
  via exact-match Edit on the true file). Browser F12 remains the gate. Polish open: companions visibly
  flipping (red tint) before the boss promotion; Ayume's own GLB/dark-form silhouette; a bespoke
  throne-room arena. pve.html + wiki.html. Next (N14): Carnival hub re-skin + Fortune Teller oracle (all
  N-items N1–N13 now ticked — the campaign plays start to finish).
- **Fortune Teller oracle (N14, first slice)** (2026-06-16, cron run): the carnival hub gains its
  Episode-1 prophecy NPC, reusing `playDialogue` + the existing `fortune` CHARS persona + the `infoSpots`
  click system (no new systems). A striped **fortune tent** prop (`prop(15,8,…)` — cone tent + gold trim
  + pink flag + dark door + glowing purple orb) sits in town just east of the portal plaza, beside the
  Elder prop. New `infoSpots` entry `{x:15,z:8,r:4,fortune:true,n:'🔯 Fortune Teller'}`; the town
  left-click handler (the `for(const s of infoSpots)` loop) gained `else if(s.fortune){onTalkFortune();}`
  before the generic `showInfo` fallback. `onTalkFortune()` (just after `playIntro`, in the bash-visible
  head): **first talk** plays `FORTUNE_PROPHECY` (11 lines — three-card reading that teaches the Corruption
  gauge via "beware the allure of power… traded sliver by sliver for the self" and seeds the Ayume betrayal
  via THE BELOVED card + the **third card she covers before you can see it**), sets `SAVE.epStorySeen.fortune`
  (rides the wipeSave-preserved `epStorySeen`, so seen-once survives death); **return talks** rotate
  `FORTUNE_OMENS[ _fortuneIdx++ % 5 ]` — single-line hints into the live systems (rest-in-light heals
  Corruption, the fox at the masquerade, the branding scimitar, human bread masks scent in the deep, the
  throne someone you trust knows the way to). Guarded by `dlgActive()` so a click during an active scene
  can't re-trigger. `[NAME]` tokens resolve through the existing `dlgNext` replace. Guide gained a
  🔯 THE FORTUNE TELLER paragraph; wiki.html EF HUNT section got a matching bullet. Validated: isolated
  node logic test (`n14_fortune_0616.js` — 16 asserts: first-talk→prophecy + flag set, no replay while
  dialogue active, return talks rotate omens & never replay the prophecy, omen index wraps, all lines use
  known personas, [NAME]/allure-of-power lines present) + in-file head node-check **fully clean** (bash
  served the live file this run; all 813 script lines parsed, only the expected final-line EOF from the
  trailing HTML). The tent prop + click-handler edits live in the frozen-tail region — applied via
  exact-match Edit on the true file and validated verbatim in the logic test; browser F12 remains the gate.
  Polish open: the rest of N14 (stall/masquerade-grove/altar re-skin props, a carnival re-tint of the hub)
  and a card-flip portrait flourish. pve.html + wiki.html.
- **Sin-Realm re-skin + Realm-lord renames (N15)** (2026-06-16, cron run): the four named Sin-Realms of
  pivot §5 re-skinned to the Twilight Veil, pure data/string edits (no system rebuild). Per pivot §5's
  slot mapping, `DUNGEONS[2..5].name` + `REGIONS[cinder/frost/storm/iron].n` + lore (`REGIONS[].d`) +
  `WARDEN_BY_TIER[3..6]` + `FACTIONS[cinder/choir/storm/deep].{n,lead,d}` were renamed in lockstep:
  **Cinderpeak→Valley of Midas (Greed)** / Pyrelord Ignus→**Aurelian, the Gilded King**;
  **Frostmere→Feastfall (Gluttony)** / Tidemother Glace→**Throngullet, the Endless Maw**;
  **Stormspire→Isle of Dominus (Power)** / Voltaic Roc→**Vael, the Crowned Tyrant**;
  **Ironroot→Enamora (Lust)** / Forgemaw→**Seraphel, the Beguiling Rose**. Each `REGIONS[].d` rewritten
  as Twilight-Veil sin lore (surfaces on the 🗺 Choose-Zone grid via `zoneList()` z.n+z.d, and the
  zone name on the dungeon-entry HUD). The four `bossSpecial` feed strings (frozen-tail, cases 3–6) were
  updated to the new names verbatim. **Linking invariant preserved** (the reason this is safe): for each
  sin tier, `WARDEN_BY_TIER[tier] === REGIONS[di].warden` and `FACTIONS[r.fac].lead === r.warden`, so
  `regionByWarden`/`onWardenKill` shard-grants + faction rep keep working; element (`el`) + colours left
  intact (mechanics untouched, per the no-rebuild guardrail — Greed stays the Fire slot, etc.). The three
  QUEST-referenced wardens (Mossfang Alpha / Crypt Howler / Vault Warden) were **deliberately NOT touched**
  so the legacy Sundering questline keeps resolving. 📖 in-game guide (THE GOAL realm list + WARDENS line)
  + wiki.html (new "four Sin-Realms & their Realm-lords" bullet) updated. Validated: isolated node logic
  test (`n15_test.js` — 30 asserts: real DUNGEONS/REGIONS/WARDEN_BY_TIER/FACTIONS eval-extracted from
  pve.html, all four new names present, the warden↔region↔faction-lead invariant holds for tiers 3–6,
  lore mentions the Veil, legacy wardens intact, no stale sin-warden names left in QUESTS) + head-region
  node-check clean (only the frozen-tail EOF artifact on the final truncated line; the data-table edits sit
  in the head and parsed). The bossSpecial feed edits live in the frozen tail — applied via exact-match
  Edit on the true file + confirmed by full-file Grep (zero old names remain anywhere). Browser F12 remains
  the gate. Polish open: real gold/feast/spire/garden props + a per-realm colour re-tint (currently the
  underlying element palette); optionally re-theme the Mossfang/Crypt dream-stage names (N-items beyond
  N15). pve.html + wiki.html. Next: N16 — dark/light choice moments nudging Corruption + dialogue flavour.
- **Dark/light CHOICE MOMENTS (N16)** (2026-06-16, cron run): the dialogue system gains a **choice variant**
  and the campaign gains a per-run moral nudge — built entirely on `playDialogue` + the N3 gauge (no new
  systems). A queued dialogue line can now carry `choices:[{label,corr,reply,feed}]`. New head-region state
  `_dlgChoosing`/`_dlgPendChoices`; when a choice prompt finishes typing (or is click-completed),
  `_showChoices(choices)` renders the option buttons into a new `#dlgChoices` div inside `#dlgBox` (dark
  options tinted purple, light green) and the `#dlg` backdrop click is **suppressed** while choosing
  (`if(_dlgChoosing)return;` at the top of `dlgNext`). `_dlgChoose(ch)` applies `addCorruption(ch.corr)`,
  fires the flavour `feed`, **unshifts `ch.reply` onto `_dlgQ`** (so the chosen reply line plays next), then
  `dlgNext()` continues — draining the reply fires the scene's `onDone` as usual. `playDialogue` resets the
  choice state + hides `#dlgChoices`/shows `#dlgHint` on every call (no leakage between scenes). **Content:**
  `CHOICE_MOMENTS{}` (just after `riteBrand`) authors one dark/light decision per episode **1–7** — DARK = the
  power fantasy at +Corruption (+6 carnival … +14 at Kage's castle) with a shadow-leaning reply; LIGHT =
  holding to humanity at −Corruption with a grounded reply (negative clamps at 0 via `addCorruption`). Each
  prompt is spoken by a fitting persona (narrator/ayume/yui/yume) and `[NAME]` tokens resolve through the
  existing `dlgNext` replace. `maybeChoiceMoment(onDone)` looks up `CHOICE_MOMENTS[selEp]` and plays it as a
  single choice line; it is **chained after `maybeEpisodeScene`** in `startRun` (the episode cutscene's
  onDone now calls it), so the choice fires **once per run, every run** (NOT seen-once → real replay weight:
  each descent re-negotiates the gauge). Ep3's choice stacks on the riteBrand push (e.g. 40→50 dark), Ep3
  dark crossing CORR_POWER awakens `corrShadow` through `addCorruption`'s existing threshold logic. 📖 in-game
  guide (HUMANITY ⇄ CORRUPTION paragraph gained a CHOICE MOMENTS sentence) + wiki.html (Corruption bullet
  extended) updated. Validated: isolated node logic test (`n16b_choices_0616.js` — 33 asserts: prompt→pending→
  buttons flow, backdrop-click suppressed while choosing, dark +corr & reply queued & onDone-after-drain,
  light −corr clamps at 0, Ep3 dark awakens corrShadow, Ep7 dark +14, no-moment episode still fires onDone &
  opens no dialogue, every defined moment well-formed) + head-region node-check clean (only the frozen-tail
  EOF artifact; all N16 head code — `_dlgChoosing`/`_showChoices`/`_dlgChoose`/`CHOICE_MOMENTS`/
  `maybeChoiceMoment` — confirmed present & parsed in the snapshot). The `#dlgChoices` HTML + the startRun
  chain edit sit in the frozen tail — applied via exact-match Edit on the true file; browser F12 remains the
  gate. NOTE: the scratch `.js` mount froze its tail after two in-place Edits (the documented gotcha hit a
  *scratch* file too) — re-validated by writing a fresh-named copy. Polish open: track a per-run dark/light
  tally feeding an "alignment" flavour or a small ending nudge; SFX sting on the pick. pve.html + wiki.html.
- **Memory-shard collectibles → lore codex + OVA fragments (N17)** (2026-06-16, cron run): story
  collectibles that fill a lore CODEX and recover the two OVA fragments — distinct from the elemental
  `SHARDS` (those buff combat; these are pure lore, no combat effect). New head-region table `MEM_SHARDS[]`
  (9 entries: 7 chapter memories `carnival/fox/blade/river/scream/compass/throne` each `{id,ep,ico,n,lore}`,
  plus 2 `frag:true` OVA fragments `bookshop` [OVA1/Ayume's origin] & `firstpage` [OVA2/the truth]) +
  `MEM_BY_EP{1..7}`, with `memCount()`, `grantMemory(id)` (idempotent; feeds "📜 Memory reclaimed —", and a
  "✦ The record is complete" feed at 9/9) and `grantEpMemory()` (placed just after `shardBonus`, in the
  bash-visible head). **Grants:** `maybeEpisodeScene` now calls `grantEpMemory()` at the top (reaching/
  playing a chapter reclaims its memory); `beginBetrayal` grants `bookshop` (the throne opens); `playEnding`
  grants `firstpage` inside the `tier>=6` branch (same gate as the ▶ Memories OVA unlock — braces added
  around the previously brace-less `if(tier>=6)`). **Persistence:** `SAVE.mem{}` added to `DEF_SAVE`,
  defaulted in `loadSave` (`if(!s.mem)s.mem={}` — no v-bump, like later story fields), and preserved in
  `wipeSave` (PERMANENT, survives death like story/shards/codex). **UI:** `questUI` (📜 Journal) gained a
  "📜 MEMORIES OF THE VEIL — n/9" section after the WARDENS bestiary — found memories show ico + name +
  lore, locked show "🔒 ??? — a memory not yet reclaimed", and 9/9 prints a "replay ▶ Memories (OVA)"
  pointer. 📖 in-game guide (J-journal line + a new MEMORIES OF THE VEIL paragraph in the ending block) +
  wiki.html (new codex bullet) updated. Validated: isolated node logic test (`n17_mem_0616.js` — 11 asserts:
  9 shards, empty start, 7 ep-shards after playing 1–7, idempotent re-play, both frags, completion feed at
  9/9, unknown-id no-op, MEM_BY_EP matches all ep-tagged ids, exactly 2 frags) + head-region node-check
  clean (exit 0; all N17 symbols present in head; betrayal/playEnding hooks within the visible window).
  Browser F12 remains the final gate. Polish open: scatter physical memory-shard pickups in the world
  (ties into the W-items) and an SFX sting on reclaim. pve.html + wiki.html. **N1–N17 done; N18 next.**
  All N-items N1–N16 done bar N17/N18 (memory-shard collectibles; per-line voice/SFX polish).
- **Dialogue voice & scene-turn stings (N18)** (2026-06-16, cron run): the last N-item — feel polish on the
  dialogue system, built entirely on the existing audio engine (`tone`/`noiseHit`/`bark`→`EF.VOICE`) with
  zero new infrastructure. New head/tail-of-audio block (just after `sfxPortal`): `DLG_VOICE{}` per-character
  voice profiles (each speaker = a tonal accent freq/type/slide + a `pitch` for the name-bark; `barkindle`
  gets `woof:true` = `noiseHit`+square thud; `kage` low sawtooth, `yume` high sine, etc.), `dlgVoice(who)`
  (plays the accent + — for any non-narrator speaker — a subtle `bark(name,{part:'auto',pitch,rate:1.1,vol:.5})`
  name-syllable utterance via the shared champion-voice synth; gated 70ms via `_gate('dlgv')` so click-spam
  can't machine-gun it; hero uses `heroName()`), `DLG_STING{open,close,dark,light}` + `dlgSting(kind)` (open =
  rising two-tone chime, close = soft fall, dark = low sawtooth+noise, light = bright triad). **Wiring (4 call
  sites in the head dialogue funcs):** `dlgNext` calls `dlgVoice(ln.who)` right after `_typeOut` (only on a
  genuinely new line — the typewriter-skip path returns earlier, so no double-bark), and `dlgSting('close')`
  in the queue-empty branch; `playDialogue` fires `dlgSting('open')` before the first `dlgNext`; `_dlgChoose`
  fires `dlgSting((ch.corr||0)>0?'dark':'light')` on the N16 pick (closes the "SFX sting on the pick" polish
  note N16 left open). All calls `try/catch`-wrapped and guarded by the existing `if(!AC||S_MUTE)` so the 🔊
  mute toggle silences everything and a missing `EF_CORE.VOICE` is a no-op. 📖 in-game guide (CHAPTERS block
  gained a "every speaker has their own voice + stings, 🔊 mutes" sentence) + wiki.html (cutscenes bullet
  extended) updated. Validated: isolated node logic test (`n18_voice_0616.js` — 12 asserts: narrator = accent
  only / no name-bark, hero barks as `heroName`, ayume/named barks, bark vol .5, barkindle woof = noise+tone,
  70ms gate suppresses the 2nd call, unknown speaker falls back + still barks, open sting = 2 tones, dark =
  tone+noise, bogus sting kind = no-op) + `node --check` clean. The `DLG_VOICE`/`DLG_STING` definitions sit
  in the frozen-tail audio region (bash head-check sees only the EOF artifact, as always) — applied via
  exact-match Edit on the true file + confirmed by Read-tool Grep (defs at ~1035–1057, 4 call sites at
  ~444/453/462/467). Browser F12 remains the final gate. **ALL N-items N1–N18 now done — the campaign is
  playable end-to-end AND voiced; the cron may begin the W (exploration) items next.** Polish open: distinct
  per-speaker `EF.VOICE` `part` choices (first/mid) for more vocal variety; a louder "reveal" sting for the
  betrayal/boss lines. pve.html + wiki.html.
- **Fog-of-war minimap + world map (W1)** (2026-06-16, cron run — FIRST W/exploration item; all N1–N18 done):
  the `#mm` minimap and the `M` world map (`drawWmap`) now start shrouded each run and reveal only where you
  walk. New **run-scoped** fog module just after `wmapXY` (bash-visible head, ~1332): `FOG_CELL=14`/`FOG_FILL`,
  `let fogSeen` (cell-key `"gx,gz"` → 1), `fogResetW()`, `fogReveal(x,z,rad)` (marks a circular cell bubble,
  default rad 3 ≈ 42u — wider than mob aggro so threats still surface before they reach you), `fogSeenAt(x,z)`,
  and `fogPaint(ctx,toPx,scale,cx,cz,half)` (fills every unexplored cell over the visible world box with the
  fog colour; `toPx` is the caller's world→px mapper so it works for BOTH the minimap's centred `P` and the
  wmap's `wmapXY`, and for overworld AND dungeon-interior views via distinct off-map cell keys). **Wiring:**
  `updHUD` calls `fogReveal(hero…,3)` each frame (top, right after the `if(!hero)return;` guard); `startRun`
  calls `fogResetW()` (each hunt re-fogs); `drawMM` paints fog after the terrain block (before the marker
  loops) and **gates nodes/drops/eggs + non-hero units by `fogSeenAt`** so resource nodes, loot and lurking
  enemies stay hidden until their corner is explored (hero + portals stay always-visible for navigation);
  `drawWmap` paints fog after the dungeon boxes so labels/waypoints/quest text/hero dot draw on top. Chose
  **run-scoped** (not SAVE-persisted) per the §4 "reveal cells as you visit" framing — keeps the edit small,
  reversible, and avoids a save migration; the masterplan allowed either. No systems rebuilt; pure overlay +
  marker gating. 📖 in-game guide gained an EXPLORING (FOG OF WAR) paragraph (after THE LAY OF THE LAND);
  wiki.html EF HUNT story-systems list got a matching "Fog of war" bullet. Validated: isolated node logic
  test (`w1_fog_0616.js` — 16 asserts: unseen-at-start, radial reveal in/out of radius, walk-trail leaves
  gaps, painter returns only unexplored cells & never a seen cell, reset wipes the grid, dungeon cells are
  distinct keys from the wilds) + a verbatim reconstruction node-check of the edited `fogPaint`/`drawWmap`/
  `drawMM` with stubs (`w1_recon_0616.js`, parses + runs, all three defined). NOTE: the bash mount served a
  fully stale pre-edit snapshot this run (0 grep hits for the new symbols), so the in-file head node-check
  was not possible — validated via the Read-tool reconstruction instead; browser F12 remains the gate.
  Polish open: optional SAVE-persisted exploration %, a soft reveal fade, and a faint "edge glint" hinting
  unexplored corners (feeds W2/W3). pve.html + wiki.html. Next (W2): generous world pickups + glint markers.
- **Generous world pickups + glint markers + vacuum (W2)** (2026-06-16, cron run — 2nd W/exploration item):
  each hunt now strews the Wilds with collectible **finds** — gold piles, wood (mats) and dropped gear — built
  entirely on the existing `mkDrop`/`updateDrops` loot loop (no new systems). New **`mat` drop type** added to
  `mkDrop` (a brown cylinder log mesh) and a matching pickup branch in `updateDrops`
  (`else if(d.type==='mat')` → `+18..46 wood`, also feeds `BPROG.wood`, with a "🪵 Salvaged" feed). New
  `scatterDrop(type,x,z,item)` wraps `mkDrop`, flags the drop `d.scatter=true`, and attaches a **faint golden
  glint** (`d.glint`: a small additive-looking translucent sphere at y≈2.6, child-of-`d.g`, so it's removed with
  the drop on pickup and `d.g.children[0]` stays the spinnable item mesh). `scatterWorldPickups()` (just after
  `dropsLast`) strews **18–22** finds per run — **40% out on the far ring (R 118–148)** where gold pays **double**
  and gear rolls a higher floor (`genItem(0.18)`), the rest in the mid-wilds; **isCursed gates it** (the Blight
  yields no loot, matching `lootDrop`). Called once in `startRun` right after `populateWilds()`
  (`try{scatterWorldPickups();}catch(e){}`). **Vacuum-on-approach generalized:** `updateDrops`'s gold-only magnet
  (`if(d.type==='gold'&&dist<6)`) now also pulls any `d.scatter` drop within `dist<7` toward the hero (mats/gear
  drift in, no clicking); the glint pulses opacity/height per-frame (`if(d.glint){…Math.sin…}`). 📖 in-game guide
  gained a "FINDS ON THE ROAD" line inside EXPLORING; wiki.html got a matching "World pickups" bullet. Validated:
  isolated node logic test (`w2_pickups_0616.js` / `/tmp/w2b.js` — **14 asserts**: 18–22 scattered, all flagged +
  glint at y2.6, only gold/mat/item types, gold piles positive, glint is the last child so the mesh stays at [0],
  isCursed blocks scatter, scattered mat vacuums toward hero, a distant non-scatter gem does NOT vacuum, mat
  pickup grants 18–46 wood + tracks BPROG.wood + removes the drop, glint opacity stays in [0,1] over time, gold
  pickup regression intact) + `node --check` clean. All edits sit in the **frozen-tail** loot region (~1646–1695)
  + `startRun` — applied via exact-match Edit on the true file, confirmed by Read-tool Grep; the bash mount again
  served a stale snapshot so no in-file head node-check (documented gotcha). Browser F12 remains the gate. Polish
  open: W3 rare weapon/armor caches in gated corners; a soft reclaim SFX; persisting collected finds. pve.html +
  wiki.html. Next (W3): rare weapon/armor caches in far/hard-to-reach corners.
- **Rare gear caches in gated corners (W3)** (2026-06-16, cron run — 3rd W/exploration item): the payoff for
  roaming the edges — each hunt seals **3 treasure caches** in the hardest-to-reach spots, built on the existing
  `mkDrop`/`updateDrops` loot loop (no new systems). New trio just after `updateDrops`: `genCacheItem()` (loops
  `genItem(0.34)` up to 14× until `rar>=2` → a **guaranteed Rare-or-better** weapon/armor; ~62% legendary at that
  bonus, never null — proven over 20k trials, fail rate ~0.0002), `mkCache(x,z)` (a chest+lid group with a tall
  amber **light-pillar `beam`** as a far marker; the beam is added **first** so `updateDrops`'s `d.g.children[0]`
  spin lands on the invisible vertical cylinder, not the chest), and `spawnCaches()` (places caches on the two
  **h7 mesa crowns** `(-85,-60)`/`(60,105)` — the slow terrain climb is the gate — plus one on a **far map edge**
  `R=138`; `isCursed`-gated like all loot). Called once in `startRun` after `scatterWorldPickups()`
  (`try{spawnCaches();}catch(e){}`). **Pickup:** a new `else if(d.type==='cache')` branch in `updateDrops` (before
  the generic-item `else`) rolls `genCacheItem()`, equips-or-salvages vs the current slot, then grants **bonus gold
  (25+6·diff)** and a **gem** (if the bag has room) with a 🗝️/💰/💎 feed + `fxRing`. **Gating:** a cache is NOT in
  the `d.type==='gold'||d.scatter` vacuum set, so it is **never pulled to you** — you must climb/trek all the way to
  it (`dist<2.2`). The beam also pulses (`if(d.beam){…Math.sin(d.t*3)…}`) next to the glint block. 📖 in-game guide
  gained a "🗝️ HIDDEN CACHES" line inside EXPLORING; wiki.html got a matching "Hidden caches (gated corners)"
  bullet. Validated: isolated node logic test (`w3_cache_0616.js` — 10 asserts: never-null + strong rare+ guarantee
  over 20k rolls, empty-slot equips, huge-score salvages, bonus gold by diff, gem added when bag<6 / skipped at 6,
  beam-is-child[0]) + a verbatim reconstruction of the edited `updateDrops`+cache funcs with THREE/scene stubs
  (`w3_recon3.js`, `node --check` clean + runs: 3 caches spawn all `type:'cache'`, all picked up, gold/gems
  granted). NOTE: the bash mount again served a stale pre-edit snapshot (the new symbols `node --check`'d clean but
  weren't in the mount's copy), so the in-file head node-check wasn't possible — validated via the Read-tool
  reconstruction; browser F12 remains the gate. Polish open: W4 Flash/Blink traversal to reach island caches, a
  reclaim SFX sting, persisting opened caches. pve.html + wiki.html. Next (W4): map edges + gaps/ledges + Flash jump.
- **The Lantern Altar — colour-lock vault puzzle (W5)** (2026-06-16, cron run): the first AFK-Arena-style
  realm traversal puzzle. New tail block (~1748, just after `blockGaps`): `VEIL_PUZZLE` state + `PZ_COLS`
  palette + `mkLantern(x,z,col)` (post + dark emissive orb), `pzReset()`, `spawnRealmPuzzle()` and
  `updatePuzzle(dt)`. `spawnRealmPuzzle()` (called in `startRun` after `spawnVeilIsles`) plants an altar at
  a far NW corner (-122,70; R≈140<150, on-foot reachable — NOT gap-gated) ringed by 3 lanterns ~120° apart
  (so only one is ever within the 3.6 light-range), and Fisher–Yates-shuffles a 3-colour solve `order` each
  run. `updatePuzzle(dt)` (called in the hero loop after `blockGaps`): within 22u of the altar it feeds the
  rune sequence ONCE (`clued`); walking within 3.6 of the next-in-order lantern lights it (emissive on, sfx,
  fxRing, progress++); a wrong lantern feeds "gutter out" + `pzReset()` (all unlit, progress 0); the final
  correct light sets `solved`, fxRings the altar and `mkCache(altar)` drops a guaranteed Rare+ vault hoard
  (the W3 cache — NOT vacuumed, walk to it). `isCursed` (Blight) gates the whole thing like all loot; reuses
  mkCache/genCacheItem/feed/fxRing/sfxEquip — no new systems. Run-scoped (re-spawned each `startRun`).
  Guide 🏮 THE LANTERN ALTAR line + wiki bullet added. Validated: 13-assert node logic test (`w5_puzzle_0616.js`,
  run as `w5_clean.js` after `tr -d '\\000'` stripped mount-injected NUL bytes) — spawn/permutation, clue-once,
  full-sequence solve→vault, solved-inert, wrong-order reset, Blight-gate all pass; bash serves a stale
  pre-edit pve.html/AGENTS snapshot so edits confirmed via Read-tool Grep (3 sites landed at 1753/1768/2344/2536),
  head-region node-check clean (frozen-tail EOF only). SECOND W-item after the Sundered Ledge. Polish open:
  one signature puzzle per realm, a minimap marker for the altar, a reclaim/solve sting, persisting solved vaults.
- **Waypoint/vista unlocks (W6)** (2026-06-16, cron run): first-visit waypoint reward + map reveal, built on
  the existing `wpFound`/`fogReveal`/`bank.gold`/`skXP` systems (no new state). New `discoverWaypoint(idx,d)`
  helper (just after the world-map click handler, ~1391): idempotent guard on `wpFound[idx]`, sets it found,
  then `fogReveal`s the waypoint corner (`WAYPOINTS[idx]`, r6) AND the whole dungeon room
  (`fogReveal(d.cx,d.cz,Math.ceil((d.r||30)/FOG_CELL)+2)`) so the realm's local map opens up; `sfxEquip()` +
  a "🗺 Waypoint discovered … map revealed" feed; then an `isCursed()`-gated finder's reward (mirrors
  giveXP/lootDrop's Blight gate) — `bank.gold += 40+tier*20` and `skXP('slay',10+tier*6)` with a "✦ Vista
  bonus" feed, tier = `d.tier`. The in-`updHUD` dungeon-entry discovery hook (~2525) now calls
  `discoverWaypoint(z.i+1,z.d)` instead of the bare `wpFound[z.i+1]=true;sfxEquip();feed(...)`. **Deliberately
  NOT routed through the startRun spawn-zone set (~2349 `wpFound[startZone+1]=true`)** — that stays a plain
  assignment so spawning directly into a zone is not a free per-run reward; the reward only fires when you
  actually travel into a new realm on foot (the intended Genshin-vista exploration loop; run-scoped like
  W2/W3 finds). Guide 🗺 WAYPOINTS & VISTAS line in EXPLORING + wiki "Waypoints & vistas" bullet added.
  Validated: 19-assert node logic test (`w6_waypoint_0616.js`: first-discover reward/sfx/feed, fog at corner+centre,
  idempotent no-double, tier-scaled reward, cursed=reveal-but-no-reward, null-safe) + verbatim reconstruction
  node --check + run (`w6_recon_0616.js`). Bash served a stale pre-edit snapshot (934 lines, 0 hits for
  discoverWaypoint) so no in-file head node-check; both edit sites confirmed at 1391/2525 via Read-tool Grep.
  THIRD W-item. Polish open: a per-waypoint reveal animation, a "vistas discovered N/8" tally, persisting found waypoints.
- **The Hidden Vault — pressure-plate sequence puzzle (W7)** (2026-06-16, cron run): the second realm puzzle,
  modelled on W5 but deliberately distinct. New `SEPULCHER` state + `mkPlate`/`sepReset`/`spawnHiddenVault`/
  `updateSepulcher` inserted right after the W5 `updatePuzzle` block (in the bash-visible head). A far **NE
  corner (100,104; R≈144<150, on foot, clear of W5's NW altar -122,70 and W4's SE ledge 115,-115)** holds a
  vault **buried flush with the ground** — a dark slab that reads as terrain, **no prize visible** — ringed by
  4 rune-**plates** (`PZ_COLS.slice(0,4)`, ~90° apart so only one is ever underfoot). `spawnHiddenVault()` is
  called in `startRun` after `spawnRealmPuzzle()` (~2365) and Fisher–Yates-shuffles the 4-plate `order` each
  run; `updateSepulcher(dt)` is called in the hero loop after `updatePuzzle(dt)` (~2557): within 24u it reveals
  the rune sequence once, you must **STAND on** the next-in-order plate (`d<2.2` — stepping, vs W5's `d<3.6`
  walk-near), a **wrong** plate guts the whole sequence (`sepReset`), and completing it sets `solved`, **raises
  the slab out of the earth** (`slab.position.y=sy+1.0`) and `mkCache`s a **guaranteed Rare+** cache at
  `S.x+2.2,S.z` (offset so the chest sits beside the risen slab; a W3 cache → not vacuumed, you walk to it).
  Key differences from W5: you STEP ON plates (not walk near lanterns) and the vault is **HIDDEN until solved**
  (W7's backlog ask: "hidden vaults behind puzzles"). `isCursed()`-gated like all loot; reuses
  `mkCache`/`genCacheItem`/`feed`/`fxRing`/`PZ_COLS` — no new systems, no new save fields (run-scoped like the
  other W puzzles). Guide **🔒 THE HIDDEN VAULT** line in EXPLORING (after the 🏮 lantern line) + wiki.html
  "The Hidden Vault" bullet. Validated: 23-assert node logic test (`w7_vault_0616.js`: 4-plate permutation,
  hidden-until-solve [0 caches pre-solve], slab buried→risen, wrong-order reset, in-order solve spawns exactly
  one cache, no re-trigger after solve, cursed=no-spawn, corner clear of W4/W5 + inside WILD_R) + verbatim
  real-block reconstruction node --check + run (`w7_real_0616.js`, the `P.g.position` path). Bash mount served
  a stale pre-edit snapshot (924 lines, 0 hits for spawnHiddenVault, frozen-tail EOF) so no in-file head
  node-check; edits applied via Read/Edit tools. FOURTH W-item. Polish open: one vault per realm, a minimap
  marker, persisting solved vaults, a solve sting.
- **The Coffer Wraith — fleeing treasure-goblin (W8)** (2026-06-16, cron run): a Diablo-goblin that drops a
  guaranteed cache ONLY if you catch it. New `CARRIER` global + `spawnCarrier()`/`carrierFlee(u,dt)` inserted
  right after the W7 `updateSepulcher` block (bash-visible head). `spawnCarrier()` (called in `startRun` after
  `spawnHiddenVault()`) spawns ONE `kind:'mon'`, `team:1`, **`carrier:true`** unit out in the Wilds (R 64–110),
  `dmg:0` (it NEVER fights — only runs), `ms:9.6` (a touch above the hero so a plain walk-chase can't land it),
  `hp≈140·diffMult(0)`; a gold coin-sack + a gold light-beam mark it, `escapeT:0`/`escapeMax:28`. A NEW
  `else if(u.carrier)` AI branch (placed before the `tower` branch, so it pre-empts the generic `team===1`
  hunt branch) calls `carrierFlee`: each frame it steps directly **away** from the hero (target = pos + away·14),
  is clamped inside **R≤144** so it runs the perimeter instead of fleeing off-map, and once `escapeT≥escapeMax`
  it **slips through a rift** — `removeUnit` + a "cache is lost" feed, NO reward. Catching it routes through the
  existing `hit()` `team===1` kill path: a one-liner before `removeUnit(u)` checks `u.carrier` → `mkCache` at its
  position (a W3 cache → guaranteed Rare+, not vacuumed, open it where it fell) + clears `CARRIER`. Because it's
  `kind:'mon'` it correctly gets threat markers + aim weak-spots + `separate`/`avoidObstacles`/terrain-ride for
  free; because `dmg:0` it's pure chase, no danger. `isCursed()`-gated (the Blight: nothing flees to reward
  you). Reuses `mkUnit`/`moveTo`/`mkCache` + the kill path — no new systems, no new save fields (run-scoped).
  Guide **💰 THE COFFER WRAITH** line in EXPLORING (after 🔒 HIDDEN VAULT) + wiki.html "The Coffer Wraith" bullet.
  Validated: 19-assert node logic test (`w8_carrier_0616.js`: spawn shape [carrier/dmg0/ms>8], flees-away
  [distance grows], R≤144 clamp, escape→despawn+no-cache+CARRIER-null, catch→exactly-one-cache-at-pos+CARRIER-null,
  cursed=no-spawn) + 3-skeleton brace-balance reconstruction node --check (`w8_recon_0616.js`: loop branch, kill
  one-liner, startRun call). Bash mount served a stale pre-edit snapshot (924 lines, 0 hits for spawnCarrier,
  frozen-tail EOF) so no in-file head node-check; edits applied via Read/Edit tools, confirmed present by
  Read-tool Grep (10 hits). FIFTH W-item. Polish open: a minimap blip, a per-realm variant, persisting a missed
  wraith, a reclaim/escape sting.
- **Per-realm environmental hazards (W9)** (2026-06-16, cron run): the four **Sin-Realms** now each carry
  their own field hazard, the land itself fighting you. New `REALM_HZ{}` config (keyed by DUNGEONS index
  2..5, each `{name,min,max,col}`) + run-scoped `HZ{zone,t,px,pz,warned}` + `hazardReset()`/`hzDmg(tier)`/
  `updateHazards(dt)`, inserted right after the W8 `carrierFlee` block (bash-visible head). `hazardReset()`
  is called in `startRun` (after `spawnCarrier()`); `updateHazards(dt)` runs in the hero loop right after
  `updateSepulcher(dt)`. `updateHazards` no-ops unless the hero is **inside a Sin-Realm dungeon (zone 2..5)**
  and **off the safe entry pad** (`inSafeStart` guard — matches the aggro/boss-telegraph convention); on
  realm entry it warns once and arms a per-realm timer (`HZ.t=min·0.6`), then each fire re-arms to a random
  `[min,max]`. Four mechanically distinct hazards, each reusing an existing primitive: **Greed** (Valley of
  Midas) → `snareRing` + `hero.slowT` + a `hit(hero,hzDmg)` bite (gilded snare); **Gluttony** (Feastfall) →
  an AoE bite to hero+nearby pets (`hit`), **mitigated by recent movement** (`mit=max(.35,1-min(1,moved/14))`
  using the distance moved since the last gust — "feeds on the still"); **Power** (Isle of Dominus) → pushes
  a **dodgeable lightning telegraph** onto the existing `telegraphs[]` (1.1s window, r5, ×1.8 dmg) so it
  deals NO instant damage — `updateTelegraphs` resolves it and moving out dodges it; **Lust** (Enamora) → a
  **beguiling charm pull** that nudges the hero 2.2u toward a random rose-light point (cancels `hero.mvT`) +
  a thorn `hit(hero,·0.7)`. `hzDmg=round((6+tier·3)·min(2.2,diffMult(0)))` → ~15–24 base by realm tier,
  diff-scaled but capped (chip danger between fights, not an instakill). Hazards are **danger, not loot**, so
  they are NOT `isCursed`-gated (the Blighted suffer the realm too — damage to the hero is unaffected by the
  curse). Reuses `telegraphs[]`/`snareRing`/`slowT`/`fxRing`/`hit`/`feed` — no new combat primitives, no new
  save fields (all run-scoped). Guide **☠ THE REALM ITSELF FIGHTS YOU** line in EXPLORING (after 💰 COFFER
  WRAITH) + wiki.html "Realm hazards" bullet. Validated: 23-assert node logic test (`w9_hazards_0616.js`,
  stubbed-THREE, verbatim block: no-hazard in town/wilds/non-sin-dungeon/safe-pad, greed slow+bite+single
  warn, gluttony still>moving + pet caught, power telegraph queued with 0 instant damage, lust tug+mvT-null+
  bite, hzDmg tier scaling, re-arm within [min,max] for all 4 realms) + `node --check` clean on the verbatim
  block. Bash mount served a stale pre-edit snapshot (918 lines, 0 hits for updateHazards; head-extract even
  showed a multibyte-mangled `⇄` artifact at the old N3 comment) so no reliable in-file head node-check;
  edits applied via Read/Edit tools. SIXTH W-item. Polish open: visible ground-VFX per hazard, a minimap
  hazard tint, a hazard-warning sting, realm-1/2 (non-sin) ambient hazards.
- **The Atlas — map/progress screen (W10)** (2026-06-16, cron run): the FINAL W-item, completing the
  exploration layer. A four-stat **Atlas** panel rendered beneath the 🗺 world map (M): `#atlasStats` div
  added inside the `#wmap` overlay (after `wmapC`); `renderAtlas()` is called from `toggleWmap` whenever
  the map opens (alongside `drawWmap`). Stats, all derived from existing systems — no new save fields:
  **Explored %** via new `atlasExplored()` (counts `fogSeen` (W1) cells whose centre lies within the
  `WILD_R` disc, seen/total → %; cell key `i+','+j` matches the `fogReveal`/`fogSeenAt` convention so it
  reads the same grid the map paints); **Memories** `memCount()/MEM_SHARDS.length` (N17 collectibles,
  permanent); **Waypoints** `wpFound.filter(Boolean).length / WAYPOINTS.length` (W6); **Caches** a
  run-scoped `cacheStats.open` tally (incremented in the `d.type==='cache'` pickup branch of
  `updateDrops`) plus the live count of sealed cache drops (`drops.filter(d=>d.type==='cache').length`
  across W3/W4/W5/W7/W8). `cacheStats` resets each run in `startRun` (next to `fogResetW()`).
  `atlasRow(ic,lab,val,frac)` renders each stat with a violet→teal progress bar; the renderAtlas call is
  try/catch-guarded. Reuses fog/memory/waypoint/cache systems — no rebuild. Guide gained a 📑 THE ATLAS
  paragraph (under EXPLORING); wiki.html got an Atlas bullet. Validated: isolated node logic test
  (`w10_atlas_0616.js` — 14 asserts: empty fog=0%, full-disc reveal=100%, partial reveal strictly 0<p<100
  & monotone, cell-key↔fogSeenAt consistency, waypoint/memory counts, cache sealed-vs-opened tally) +
  verbatim reconstruction node-check+run (`w10_recon_0616.js`: block parses, renderAtlas executes against
  a stubbed DOM). Bash mount served a stale pre-edit snapshot (0 grep hits for the new symbols, frozen-tail
  EOF) so no in-file head node-check — edits applied via Read/Edit tools, confirmed by Read-tool Grep.
  SEVENTH & FINAL W-item — ALL N1–N18 and W1–W10 ticked; the campaign is playable end-to-end and the
  exploration layer is complete. Browser F12 remains the gate. pve.html + wiki.html.
- **The Veil's Tally — per-run dark/light alignment (N19, new on-theme item)** (2026-06-16, cron run —
  all N1–N18 & W1–W10 were already ticked, so per the §7 close-out clause the cron adds one small,
  validated, on-theme item; this is the explicit N16 "polish open" payoff). The N16 CHOICE_MOMENTS dark/
  light picks now sum into a run-scoped **alignment** read in the 📜 Journal. New head-region block after
  `maybeChoiceMoment`: `let darkPicks, lightPicks`; `tallyReset()`; `recordChoice(corr)` (corr>0 → dark++,
  corr<0 → light++, corr===0 ignored); `ALIGN_TIERS[]` (5 tiers keyed by `net = darkPicks-lightPicks`:
  net≥3 Veil-Bound, ≥1 Shadow-Touched, ≥0 On the Knife's Edge, ≥-2 Tempted-but-Holding, else Pure of
  Heart) + `alignment()` (first-match scan, returns {label,col,d}). Wired at THREE existing sites only —
  `recordChoice(ch.corr)` in `_dlgChoose` (right after the addCorruption call), `tallyReset()` in
  `startRun` (next to `fogResetW`/`cacheStats`), and a "🌗 YOUR PATH THIS DESCENT" section in `questUI`
  (before FACTIONS) showing `🌑 n shadowed · 🕯 m held → <label>`. NO new save fields (run-scoped, like
  the gauge), NO new systems — rides N16 + addCorruption. Guide CHOICE-MOMENTS paragraph gained a 🌗 YOUR
  PATH sentence; wiki.html choice bullet too. Validated: isolated node logic test (15 asserts via /tmp
  heredoc to dodge the bash-mount truncation: reset, fresh net0→Knife-Edge, 3 dark→Veil-Bound, every
  net step 2→-3 maps to the right tier, zero-corr ignored) + head-region node-check clean (frozen-tail
  EOF only, no earlier error) + Grep-tool confirmation of all 4 edit sites (the startRun reset sits past
  the bash frozen-tail at line ~2512, so it's verified via the Read/Edit tools, not bash). Browser F12
  remains the gate. pve.html + wiki.html.
- **Backlog opened by this work**: (1) browser F12 pass — the validation gate; (2) per-warden boss
  mechanics (design §3: Pyrelord burning ground, Tidemother freeze, Voltaic dive, Forgemaw quake);
  (3) faction rep + lore codex + town questgivers; (4) a real "cure" path or keep the Blight terminal;
  (5) server-side CT wallet + anti-cheat (the client checks are a deterrent, not airtight);
  (6) N19 follow-ups: persist a lifetime alignment / let the final-run alignment nudge the ending tier or
  flavour text, and surface the current 🌗 Path label as a tiny HUD glyph.
- **The Whisper — dark-voice taunts as Corruption rises (N20, new on-theme close-out item)** (2026-06-16,
  cron run — all N1–N19 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small,
  validated, on-theme item; realizes pivot §2's "disembodied dark voice that taunts as your gauge rises,"
  long referenced but only ever routed through `narrator`). pve.html, all in the bash-visible head:
  a new `whisper` CHARS entry (🕷, centred, #9b3fd6 — fills the gap N8 flagged); `WHISPER_BANDS[]`
  (4 ascending Corruption thresholds 20/50/70/85, each with 1-of-2 taunt lines) + run-scoped `whisperSeen`
  + `whisperReset()` + `maybeWhisper()` (placed right after `addCorruption`). `maybeWhisper` walks from
  the last-spoken band up, firing ONE 🕷-feed taunt per newly-reached band (catch-up on a big jump),
  advancing `whisperSeen` so a band never re-fires within a run; a soft low Whisper `bark('')` accompanies
  it, all try/catch + mute-safe. Wired at 2 existing sites only: a `if(corruption>before)maybeWhisper();`
  tail in `addCorruption` (so it fires ONLY on a rise — `corruptionTick`'s negative purify calls never
  trigger it), and `whisperReset()` inside `corrReset` (so it resets every descent like the N16/N19 tally —
  replay value, no new save fields). NO new systems — rides N3's gauge + the existing `feed`/`bark`. Guide
  HUMANITY ⇄ CORRUPTION paragraph + wiki.html corruption bullet updated. Validated: 19-assert isolated
  node logic test (`whisper_close_0616.js`: silent below band1, one taunt per band, no re-fire same band,
  no fire on drop, no re-fire on re-cross, catch-up across skipped bands, reset re-arms) + verbatim
  block parse/run reconstruction (`whisper_recon_0616.js`). Bash mount served a stale frozen-tail snapshot
  again (898 lines, 1/3 markers visible) so no in-file head node-check — validated via Read/Edit-tool edits
  + isolated/reconstruction node checks. Browser F12 remains the gate.
- **Anchors of Humanity — human food pickup (N21, new on-theme close-out item)** (2026-06-16, cron run —
  all N1–N20 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated,
  on-theme item; realizes pivot §4 "Anchors of Humanity" / §11.3 / Yume's Ep6 teaching, which until now
  existed only as **dialogue** — there was no real human-food item, just `corruptionTick`'s passive
  hub/pad purify). Built entirely on the existing `mkDrop`/`updateDrops` loot loop + `addCorruption`
  (no new systems, no new save fields, run-scoped). **New `'food'` drop type** in `mkDrop` (a squat warm
  bread-loaf sphere); **`scatterFood()`** (just after `scatterWorldPickups`) scatters **3–5** loaves
  across the Wilds (R 44–130) each run, each with a soft warm glow (`d.glint`), **only when in the
  Underworld** (`SAVE.episode>=3` — the Carnival already purifies) and **`isCursed`-gated** (Consumed by
  the Veil = no relief). Called in `startRun` right after `scatterWorldPickups()`
  (`try{scatterFood();}catch(e){}`). **Pickup branch** `else if(d.type==='food')` in `updateDrops` (between
  the `mat` and `cache` branches): eats it for **−(12..20) Corruption** via `addCorruption(-ease)` (clamped
  at 0; a DECREASE so it never trips the N20 rise-only Whisper), with a 🍞 feed. Crucially food carries
  **no `d.scatter` flag**, so it is **NOT vacuumed** — you must walk to it (anchors are sought, not handed
  to you), distinct from W2's auto-pulled gold/mats. Guide HUMANITY ⇄ CORRUPTION paragraph gained a
  🍞 ANCHORS OF HUMANITY sentence; wiki.html got a matching bullet. Validated: 11-assert isolated node
  logic test (`n21_food.js`: 3–5 food spawned all flagged+glint, never `.scatter`/never vacuumed, gated
  off before Ep3, gated off when cursed, ease 12–20, corruption drops by ease, clamps at 0, decrease=no
  Whisper) + verbatim snippet parse-check (`n21_recon.js`, `node --check` clean). Bash mount served a
  stale frozen-tail snapshot (895 lines, 0 grep hits) so no in-file head node-check — edits via Read/Edit
  tools; head-region extract reported only the expected final-line EOF, no earlier error. Browser F12
  remains the gate. Polish open: a reclaim SFX, the scent-mask actually pausing the §11.3 hunt-AI (food
  currently flavours the mask but the global aggro-override isn't built), per-food-type effects
  (meat/sweets/veg), persisting uneaten loaves. pve.html + wiki.html.
- **Scent-mask — human food pauses the hunt (N22, new on-theme close-out item)** (2026-06-16, cron run —
  all N1–N21 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated,
  on-theme item; pays off N21's explicit polish-open "the scent-mask actually pausing the §11.3 hunt-AI"
  — eating food already *said* "the dark loses your scent" but did nothing). Built on the existing
  monster-AI acquire branch + `corruptionTick`/`startRun` (no new systems, no new save fields,
  run-scoped). **New global `let scentMaskedT=0;`** declared just above `corruptionTick`. **Set on eating**:
  the `d.type==='food'` pickup branch now adds `scentMaskedT=Math.max(scentMaskedT,9)` (a ~9s breath; never
  shortens a longer active mask). **Decremented** at the top of `corruptionTick(dt)` (called every frame) —
  on reaching 0 it fires one `👁 The dark finds your scent again.` feed. **Consumed in the AI acquire
  branch** (`else{` block, the `range=` line): a new `const masked=(scentMaskedT>0 && !u.boss && !u.provoked)`
  forces acquire `range` to **0** while masked, so non-boss, un-struck hunters lose you and break off /
  return home — but **bosses ignore the mask** (they don't track by scent) and any mob you've **already
  struck** (`provoked`) keeps coming. Reset to 0 in `startRun` (beside `corrReset`) so every descent starts
  with the hunt fully on. Guide 🍞 ANCHORS sentence + wiki Anchors bullet rewritten from the old "blood in
  the water" flavour to the now-real mechanic (mask breaks the chase; boss & struck-mobs exempt; hunt
  resumes when scent returns). Validated: 17-assert isolated node logic test (`n22_scentmask.js`: fresh run
  unmasked, food→9, masked aggroNow/normal mobs →range 0, boss & provoked still 999, re-eat never reduces,
  tick decrements + one re-arm feed at expiry, no further decrement once expired, startRun clears). Bash
  mount served a stale truncated snapshot (888 lines, 0 grep hits) so no in-file head node-check — edits via
  Read/Edit tools; head-region extract on the stale snapshot reported only the expected final-line EOF, no
  earlier error. Browser F12 remains the gate. Polish open: a HUD timer/icon for the active mask, a reclaim
  SFX, masked mobs visibly losing aggro-marker tint. pve.html + wiki.html.
- **Scent-mask HUD timer (N23, new on-theme close-out item)** (2026-06-16, cron run — all N1–N22 &
  W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated, on-theme item;
  pays off N22's explicit polish-open "a HUD timer/icon for the active mask" — the mask worked but was
  invisible). Built entirely on the **existing `#statusInd` top-bar indicator** in `updHUD` (no new
  element, no new save fields, no new systems). The cursed/injured block was rewritten to build text/colour
  in locals (`_st`/`_sc`) instead of writing `si.textContent` inline: `🦠 BLIGHTED` (cursed, green) /
  `🩸 INJURED Nh` (injured, red) as before, then **if `scentMaskedT>0` it appends `🍞 MASKED Ns`**
  (`Math.ceil(scentMaskedT)`) — standalone it shows warm-gold `#ffd9a0` (matching the food-loaf glow);
  when injured/cursed is also active their label+colour lead and the mask is appended after two spaces
  (cursed+mask can't co-occur in play since food is gated to non-cursed, but the code is safe either way).
  So the player can now SEE how many seconds the N22 scent-mask window has left and spend it. Guide
  🍞 ANCHORS sentence + wiki Anchors bullet got a line about the top-bar `🍞 MASKED` countdown. Validated:
  8-assert isolated node logic test (`n23_hud.js`: empty when nothing active, mask-only text+gold colour,
  injured+mask both shown with injured-red kept, cursed wins label/colour, expired mask not shown) +
  `node --check` clean. Bash mount served a stale pre-edit snapshot (883 lines) so the in-file head
  node-check couldn't see the tail edit — the change is a surgical brace-balanced exact-match Edit in the
  `updHUD` tail region, validated by the isolated test. Browser F12 remains the gate. pve.html + wiki.html.
- **Alignment colours the ending (N24, new on-theme close-out item)** (2026-06-16, cron run — all N1–N23 &
  W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated, on-theme item;
  pays off N19's explicit polish-open "let the final-run alignment nudge the ending tier/flavour" — the
  N16/N19 dark/light choices were tracked and read in the Journal but never echoed by the story itself).
  Built entirely on the **existing N19 run-tally** (`darkPicks`/`lightPicks`/`alignment()`) + `playDialogue`
  (no new save fields, no new systems). After `alignment()` a new `const ALIGN_END{}` maps each of the 5
  alignment labels (Veil-Bound / Shadow-Touched / On the Knife's Edge / Tempted, but Holding / Pure of Heart)
  to ONE first-person narrator line ("…the Veil knew your name before you did, [NAME]" … "You gave the Veil
  nothing it asked for, [NAME]"); `endAlignmentReel()` returns `[]` if no choices were made this run
  (`darkPicks+lightPicks<=0`) else `[{who:'narrator',text:<line>}]`, all try/caught. `playEnding` now plays
  `(ENDINGS[tier]||ENDINGS[2]).concat(endAlignmentReel())` so the alignment line closes the ending reel
  after the tier cutscene, before `showEndScreen`. It's **flavour only** — it does NOT change the ending
  tier (the ladder still keys off difficulty, per §2), it acknowledges how you carried yourself. Run-scoped
  (tallyReset in startRun). Guide YOUR ENDING paragraph + wiki choice bullet got the "the ending speaks to
  your path" note. Validated: 14-assert isolated node logic test (`n24_endalign.js`: no-picks→empty reel,
  each alignment band→its mapped line, net-0 split still fires, corr-0 ignored, concat appends exactly one
  line & preserves the original ending, every ALIGN_TIERS label has a mapped ALIGN_END line) + `node --check`
  clean on the verbatim block. Bash mount served a stale/byte-mangled snapshot (head node-check tripped on a
  pre-existing em-dash in the EP_STORY comment region at line ~617, NOT the edit) so the in-file head check
  couldn't validate the tail — both edits confirmed landed via Read/Edit-tool Grep (lines 570/868/875).
  Browser F12 remains the gate. pve.html + wiki.html.
- **Endings Witnessed gallery (N25, new on-theme close-out item)** (2026-06-16, cron run — all N1–N24 &
  W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated, on-theme item).
  A **read-only §2 ending-ladder gallery** in the 📜 Journal (`questUI`), mirroring the N17 memories codex
  and the W10 atlas. New block inserted between the "📜 MEMORIES OF THE VEIL" and "🌗 YOUR PATH" sections:
  reads the existing permanent `SAVE.endingsSeen{}` / `SAVE.bestEnding` / `SAVE.ovaUnlocked` (NO new save
  fields, NO new systems) and renders a "🎭 ENDINGS WITNESSED — n / 9" header + one row per difficulty 1–9
  (`ENDING_TITLE[t]` shown once that tier's ending is seen, else 🔒 + "???"); the `bestEnding` tier is tagged
  "◆ furthest", and a footnote reminds the player the truth/OVA unlocks at diff 6 and the Holy Grail at diff 9
  (+ a "▶ Memories unlocked" note once `ovaUnlocked`). Pure progress display — encourages climbing the ladder
  to fill the roll. Guide YOUR ENDING paragraph + wiki ending bullet got the "📜 Journal tracks an Endings
  Witnessed roll" note. Validated: 18-assert isolated node logic test (`n25_endings.js`: fresh = 0/9 + 9 locked
  + titles hidden, one-seen = 1/9 + title shown + exactly one ◆ furthest, diff-6 = OVA note shown + non-best
  rows unmarked, all-nine = 9/9 + 0 locked) + head-region node-check parsed cleanly through to the frozen-tail
  truncation (edit at line ~408, error only at the truncated final extract line). The bash mount was CURRENT
  this run (grep found the edit) but the tail still truncates the head extract. pve.html + wiki.html.
- **Reclaim stings — distinct audio for rare finds (N26, new on-theme close-out item)** (2026-06-16, cron
  run — all N1–N25 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated,
  on-theme item; pays off the "reclaim SFX" polish-open noted across N17/W2/W3/W8/N21 — those finds were
  either silent or shared the generic coin/equip blip). Built entirely on the existing audio engine
  (`tone`/`noiseHit` + the `_gate` throttle), no new systems, no new save fields. New block right after
  `dlgSting` (in the bash-visible audio region, ~1142): `const RECLAIM_STING={cache,anchor,memory}` — **cache**
  = a rising 523/784/1047 triangle arpeggio + a soft noise tail (triumphant crack), **anchor** = two warm
  392→523 sines (humanity steadies), **memory** = a detuned 660/663 + 990 sine shimmer (ethereal recall) —
  and `reclaimSting(kind)` (mute-guarded by `if(!AC||S_MUTE)`, `_gate('rcl_'+kind,120)` so rapid same-kind
  pickups can't machine-gun, per-kind keys so distinct finds aren't gated against each other, `try/catch` on
  dispatch). Wired at 3 existing sites: the `d.type==='cache'` pickup branch (`reclaimSting('cache')`,
  falling back to `sfxEquip()` on error), the `d.type==='food'` branch (`reclaimSting('anchor')`, fallback
  `sfxCoin()`), and `grantMemory` (a `reclaimSting('memory')` after the "📜 Memory reclaimed" feed — memory
  reclaim was previously silent). All 🔊-muted with the rest of the audio. Guide FINDS ON THE ROAD line +
  wiki.html caches bullet got a "rare reclaims now sound distinct" sentence. Validated: 7-assert isolated
  node logic test (`n26_reclaim.js`: anchor fires 1 immediate tone @392, memory 2 detuned sines, cache all
  setTimeout-scheduled, `_gate` blocks a rapid repeat of the same kind, distinct kinds both fire, `S_MUTE`
  suppresses all, bogus kind no-ops) + `node --check` clean. The `RECLAIM_STING`/`reclaimSting` defs sit in
  the Edit-visible audio region (Read/Grep confirm them at ~1142–1146 + the 3 call sites at 378/1837/1841);
  the bash mount served its usual stale frozen-tail snapshot (864 lines) so the in-file head node-check saw
  only the expected final-line EOF, no earlier error. Browser F12 remains the gate. Polish open: a per-realm
  reclaim variant, a subtle haptic/flash to pair with each sting. pve.html + wiki.html.
- **Reveal sting — a dread-stab for pivotal narrative beats (N27, new on-theme close-out item)** (2026-06-16,
  cron run — all N1–N26 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small,
  validated, on-theme item; pays off the "louder reveal sting" polish-open noted across N18 [betrayal/boss
  lines], N20 [the Whisper], and N24 [the alignment line] — those three turning points landed silently or on
  the generic soft scene-turn sting). Built entirely on the existing N18 `DLG_STING`/`dlgSting` audio infra
  (`tone`/`noiseHit`), no new systems, no new save fields. New `reveal` entry added to `DLG_STING` (~1136, in
  the Edit-visible audio region): a sub boom (68Hz sawtooth slide + 112Hz sine) then a deferred dissonant high
  clash (880/932 sawtooth) + a noise tail — louder and lower than open/close, a true dread-stab. New general
  hook in `dlgNext`: any queued line may carry `sting:'<kind>'` and it fires `dlgSting(ln.sting)` right after
  the N18 `dlgVoice` call (so it's reusable, not hard-wired). Wired at 3 narrative beats: `maybeWhisper` now
  fires `dlgSting('reveal')` as the Whisper crosses each new Corruption band (N20); the central betrayal line
  (`EP_STORY[7].betrayal`, "…my name was Leah…") carries `sting:'reveal'` (N10/N18); and `endAlignmentReel`'s
  returned narrator line carries `sting:'reveal'` so your ending's alignment line lands on the stab (N24). All
  `try/catch`-wrapped + mute-guarded by the existing `if(!AC||S_MUTE)` so 🔊 silences it. Guide CHAPTERS
  voice/stings sentence + wiki.html cutscenes bullet got a "pivotal beats land on a deeper reveal sting" note.
  Validated: 11-assert isolated node logic test (`n27_reveal.js`: reveal emits the immediate low boom, defers
  the high clash, S_MUTE & no-AC both suppress, the per-line hook fires only when `ln.sting` is present, bogus
  kind no-ops, existing `dark` sting unchanged, the deferred clash+noise fire) + `node --check` clean + a
  verbatim stubbed reconstruction of all 5 edited blocks (`n27_recon.js`: parses + runs, confirms both
  `sting:'reveal'` markers landed). Bash mount served its usual stale frozen-tail snapshot (864 lines, 0 grep
  hits for the new strings) so the in-file head node-check saw only the expected final-line EOF — edits
  applied via Read/Edit on the true file, validated via the reconstruction. Browser F12 remains the gate.
  Polish open: a distinct reveal variant per beat (Whisper vs betrayal vs ending), a brief screen-flash/shake
  paired with the stab. pve.html + wiki.html.
- **Reveal flash — the visual half of the reveal beat (N28, new on-theme close-out item)** (2026-06-16,
  cron run — all N1–N27 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small,
  validated, on-theme item; pays off the explicit N27 polish-open "a brief screen-flash/shake paired with
  the stab"). pve.html: a new `revealFlash()` (audio region just after `dlgSting`, ~1153) lazily builds a
  pointer-through `#revealFx` full-screen overlay (`z-index:80`, BELOW the `#dlg` box at 88 so the cutscene
  text stays crisp) and pulses a blood-dread radial vignette (transparent centre → `rgba(95,0,26,.6)` at the
  edges) up to opacity 1 then fades it (`.07s` in, `.55s` out), and adds a `.revShaking` class to `#dlgBox`
  for a ~0.42s shake (one `@keyframes revShake` injected ONCE via a guarded `_revealFxKf` flag). Crucially it
  is purely cosmetic and **NOT** audio-gated — unlike `dlgSting` (which early-returns on `!AC||S_MUTE`),
  `revealFlash` runs even when 🔊 is muted, so the pivotal moment still lands with sound off. Wired at the SAME
  two reveal sites as N27 (covers all three beats): `dlgNext` per-line hook — when a line carries `sting:'reveal'`
  (the Ayume=Leah betrayal line + the alignment-ending narrator line) it now also calls `revealFlash()`; and
  `maybeWhisper` fires it beside `dlgSting('reveal')` as the Whisper crosses a Corruption band. Reuses the
  existing dialogue DOM; no new save fields, no new systems, run-agnostic (no state to reset). 📖 guide
  CHAPTERS voice/stings sentence + wiki.html cutscenes bullet updated to note the paired blood-red flash +
  box shudder (and that the picture lands even with sound off). Validated: 16-assert isolated node logic test
  with a mocked DOM (`n28_revealflash.js`: keyframe injected once / not re-injected, overlay created with
  pointer-events:none + z-index 80, flashes to opacity 1 then the scheduled timer fades it to 0, dlgBox gets
  then loses the shake class, overlay reused not duplicated on a second call, and no throw + still flashes when
  `#dlgBox` is absent — e.g. the Whisper feed with no open cutscene) + `node --check` clean. Bash mount served
  its usual stale frozen-tail snapshot (859 lines, edits land past it) so the in-file head node-check saw the
  visible region parse clean with no earlier error — edits applied + confirmed via Read/Edit/Grep on the true
  file (defs at 1153–1167, hooks at 488 & 1007). Browser F12 remains the gate. Polish open: a per-beat flash
  colour/intensity (softer for the Whisper, harshest for the betrayal), an optional camera shake on the 3D view.
  pve.html + wiki.html.
- **Skip-scene affordance for dialogue (N29, new on-theme close-out item)** (2026-06-16, cron run — all
  N1–N28 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated, on-theme
  item; a replay-QoL win for the now-complete 7-episode campaign — long cutscenes [the 15-line betrayal,
  the Ep-3 pact] are tedious to re-watch). pve.html, all in the bash-visible head dialogue region: a new
  **`⏭ skip`** tab (`#dlgSkip` span) added inside `#dlgBox` (which gained `position:relative`) at top-right,
  and a new **`dlgSkip()`** function right after `dlgActive()`. `dlgSkip` ends the current dialogue scene
  early **by the normal finish path** — it empties `_dlgQ` and calls `dlgNext()`, so the queue-empty branch
  fires the N18 close sting AND the scene's `onDone` exactly as a natural finish would (episode/gameplay
  state, e.g. the `maybeChoiceMoment` chain or a beat hand-off, stays correct). Crucially it **never skips
  past an N16/N19 moral choice**: if a `choices:` line is still queued, skip slices `_dlgQ` to start AT that
  choice and presents it (preserving the alignment input); if a choice is already on screen (`_dlgChoosing`)
  or pending (`_dlgPendChoices`), skip is inert / presents it rather than bypassing it. The skip handler
  (`_dlgSkipEl.onclick`, wired next to `_dlgEl.onclick=dlgNext` at ~559) calls `ev.stopPropagation()` so the
  tap doesn't also bubble to the `#dlg` backdrop's advance-on-click. Reuses the dialogue DOM + `dlgNext`/
  `_showChoices` — no new systems, no new save fields. 📖 guide CHAPTERS block + wiki.html cutscenes bullet
  got a "⏭ skip a chapter you've already seen (it stops at any choice)" note. Validated: 15-assert isolated
  node logic test (`n29_skip.js`, mirrored dlgNext/_showChoices/playDialogue shapes: plain scene skip closes
  + fires onDone once + takes the close path, skip inert while a choice is shown, skip STOPS at a queued
  choice and presents the right one then ends after it resolves, a pending-but-unshown choice is presented
  not skipped, no-op when the dialog is closed) + `node --check` clean + head-region node-check clean (593
  visible script lines parsed, only the expected frozen-tail EOF artifact at the truncation; the new
  `#dlgSkip` span [201], `dlgSkip` [499] and the click wiring [559] all sit in the head and parsed). The
  scratch `.js` mount froze its tail after an in-place Edit (the documented gotcha hit a scratch file again)
  — re-validated by writing the full test via a `/tmp` heredoc. Browser F12 remains the gate. Polish open: a
  keyboard shortcut (e.g. hold-to-skip), a "skip all seen cutscenes" toggle, fading the tab in only after the
  first line. pve.html + wiki.html.
- **Cutscene keyboard controls (N30, new on-theme close-out item)** (2026-06-16, cron run — all N1–N29 &
  W1–W10 already ticked, so per §7's close-out clause the cron adds one small validated on-theme item;
  pays off N29's explicit "a keyboard shortcut" polish-open and serves the campaign-replay goal directly).
  pve.html, two surgical edits: (1) a NEW `keydown` listener wired right after `_dlgSkipEl.onclick` (~560,
  bash-visible head) that only acts when `dlgActive()` — **Space/Enter → `dlgNext()`** (advance, mirrors the
  backdrop click), **Esc → `dlgSkip()`** (the N29 skip path), and when a moral choice is on screen
  (`_dlgChoosing`) **1/2 click the dark/light choice buttons** (`document.querySelectorAll('#dlgChoices
  button')[0|1].click()`); it `preventDefault()`s Space so the page never scrolls, and while `_dlgChoosing`
  it NEVER advances/skips (so an N16/N19 choice is never bypassed — same guarantee as the ⏭ tab). (2) a one-
  line guard at the TOP of the in-run hotkey handler (the `addEventListener('keydown',…)` at ~2717):
  `if(typeof dlgActive==='function'&&dlgActive())return;` so game hotkeys (b/t/m/j/q…) no longer LEAK into a
  cutscene (a latent issue — episode scenes play with `running=true`, so pre-N30 a stray `b`/`m` during a
  scene could pop the build/map overlay). The dialogue listener is registered before the hotkey handler, so
  it runs first; both targets are `window`. Reuses `dlgNext`/`dlgSkip`/the choice buttons — NO new systems,
  NO new save fields. 📖 guide CHAPTERS block (Space/Enter advance · Esc skip · 1/2 choose) + wiki.html
  cutscenes bullet updated. Validated: 12-assert isolated node logic test (`n30_cutscene_keys.js`, mocked DOM
  + dialogue state: Space/Enter/Spacebar→next, Esc→skip, Space preventDefault, unrelated key ignored,
  inactive-dialogue no-op, choosing→Esc/Space never act, 1→first/2→second choice, 3 with no third button
  no-op) + `node --check` clean; the listener block (head) passed the head-region node-check (598 visible
  script lines, only the expected frozen-tail EOF at the truncation); the hotkey-guard edit sits in the
  frozen tail and was applied verbatim via exact-match Edit on the true file. Browser F12 remains the gate.
  Polish open: a HUD hint ("Space ▸ / Esc ⏭") on the box, a "skip all seen" toggle. pve.html + wiki.html.
- **2026-06-16 — N31 Controls hint on the dialogue box (discoverability)** — NEW on-theme close-out item:
  all N1–N30 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated,
  on-theme item — the EXPLICIT N30 polish-open "a HUD hint ('Space ▸ / Esc ⏭') on the box". The N29 skip
  tab + N30 keyboard controls existed but were invisible unless you read the guide; this surfaces them on
  the box itself. Two surgical, purely-cosmetic edits to pve.html: (1) the persistent `#dlgHint` footer (the
  HTML element at ~205 that was the static "▶ click to continue", hidden during a moral choice and restored
  after — its display is only toggled, never its text) now reads **"▶ click / Space  ·  Esc ⏭"**, spelling
  out advance + skip on every line; (2) `_showChoices` (~456) builds its buttons with `forEach((ch,ci)=>…)`
  and prefixes each label `(ci+1)+'.  '+ch.label` so the dark/light options render **"1.  …" / "2.  …"**,
  matching the N30 `1`/`2` choice hotkeys (key→`#dlgChoices button[ci]`). NO new elements/save fields/
  systems — reuses the existing dialogue DOM; both edits are in the bash-visible head. 📖 guide CHAPTERS
  block (numbered choices + the hint-line note) + wiki.html cutscenes bullet updated. Validated: 9-assert
  node logic test (`n31_hint.js`: choice labels numbered 1./2., the prefix index equals the N30 key→button
  map, a lone choice is still "1.", the hint string contains click/Space/Esc/⏭) + `node --check` clean +
  head-region node-check clean (596 visible script lines parse; only the expected frozen-tail EOF at the
  truncation — both edits sit in the head and were applied via exact-match Edit on the true file). Browser
  F12 remains the gate. Polish open: fade the hint in after the first line; a "skip all seen" toggle.
- **2026-06-16 — N32 Alignment HUD path glyph** — NEW on-theme close-out item: all N1–N31 & W1–W10
  already ticked, so per §7's close-out clause the cron adds one small, validated, on-theme item — the
  EXPLICIT N19 polish-open "a tiny HUD path glyph". The run's dark/light alignment (N16 choices → N19
  tally) was visible ONLY in the 📜 Journal's 🌗 YOUR PATH section; now it's surfaced live in the
  top-bar, exactly as N23 surfaced the scent-mask timer. One surgical edit to pve.html: a single line
  appended in `updHUD`'s `#statusInd` block (right after the N23 scent-mask append, ~2827) —
  `if((darkPicks+lightPicks)>0){try{const _al=alignment();const _g=darkPicks>lightPicks?'🌑':lightPicks>darkPicks?'🕯':'☯';const _p=_g+' '+_al.label;_st=_st?_st+'  '+_p:_p;if(!_sc)_sc=_al.col;}catch(e){}}`.
  Only shows once a choice has been made this run (`darkPicks+lightPicks>0`); 🌑 shadow-leaning / 🕯
  light-leaning / ☯ balanced + the alignment tier label, coloured by `alignment().col`; appends after
  any injured/cursed/masked status with the same two-space separator and NEVER overwrites their colour
  (`if(!_sc)`). Run-scoped — rides the existing `tallyReset()` in startRun + `alignment()`/`darkPicks`/
  `lightPicks` (N19). NO new elements/save fields/systems, try/caught so a missing `alignment` can't
  break the HUD. 📖 guide CHOICE MOMENTS sentence (top-bar glyph note) + wiki.html choice bullet updated.
  Validated: 13-assert node logic test (`n32_alignglyph.js`: no-choice→empty/untouched, pure-dark→🌑
  Veil-Bound + tier colour, light-lean→🕯 Tempted-but-Holding, equal→☯ Knife's Edge, append-after-status
  keeps prior text first + prior colour) + `node --check` clean + head-region node-check clean (595-line
  head parses; only the frozen-tail EOF at line 596). Edit confirmed at line 2827 via Read-tool Grep
  (bash mount served the usual stale pre-edit tail, 856 lines — the edit sits in the frozen tail).
  Browser F12 remains the gate. Polish open: a persisted lifetime alignment; a tiny path-glyph icon
  instead of text; the N20 Whisper's latest taunt also surfaced in the indicator.
- **2026-06-16 — N33 The Whisper's record in the Journal** — NEW on-theme close-out item: all N1–N32 &
  W1–W10 already ticked, so per §7's close-out clause the cron adds one small, validated, on-theme item —
  the EXPLICIT N20/N32 polish-open "surface the Whisper's taunts" (the N20 Whisper fired only a transient
  feed line + bark; once it scrolled past you had no record of how deep the dark had spoken or what it
  said). Three surgical edits to pve.html, all run-scoped — NO new save fields, NO new systems, rides the
  N20 `whisperSeen`/`WHISPER_BANDS` gauge-driven Whisper: (1) a new `let whisperLast='';` beside
  `whisperSeen` (~1023) + `whisperReset()` now clears it too (so it resets each descent like the band
  counter); (2) `maybeWhisper` stores `whisperLast=ln;` right after it picks the taunt line (so the most
  recent words are remembered); (3) a new "🕷 THE WHISPER — n / 4 heard" section in `questUI` (~419,
  between the N19 🌗 YOUR PATH and ⚔ FACTIONS sections, shown only when `whisperSeen>0`) reading
  `whisperSeen`/`WHISPER_BANDS.length` and italicising `whisperLast` as the dark's last words this descent
  (singular/plural "time/times" handled). Mirrors how N25 surfaced the endings ladder and N19 the alignment
  tally — pure progress/lore display, no combat effect. 📖 guide HUMANITY ⇄ CORRUPTION paragraph (Whisper
  sentence) + wiki.html corruption bullet got a "📜 Journal keeps a 🕷 The Whisper record" note. Validated:
  14-assert isolated node logic test (`/tmp/n33_whisper.js`: fresh run empty + record hidden, band1 cross →
  1/4 + singular "time" + last words shown, big jump catches up all 4 + plural "times" + highest line kept,
  one feed per band/no spam, no re-fire within a band, whisperReset clears the record) + `node --check`
  clean + head-region node-check clean (589 visible script lines parse; only the expected frozen-tail EOF;
  the `questUI` edit at ~419 sits in the head and parsed, the `whisperLast`/`maybeWhisper` edits at ~1023/1035
  sit in the frozen tail and were applied via exact-match Edit on the true file, confirmed by Read-tool Grep).
  Browser F12 remains the gate. Polish open: surface `whisperLast` live in the top-bar indicator too; a
  click-to-replay-as-portrait of the Whisper's lines. pve.html + wiki.html.
- **2026-06-16 — N34 Per-ending first-person teaser in the Endings Witnessed gallery** — NEW on-theme
  close-out item: all N1–N33 & W1–W10 already ticked, so per §7's close-out clause the cron adds one
  small, validated, on-theme item — the EXPLICIT N25 polish-open "a per-ending one-line teaser". (Also
  reconciled N33 this run: it was shipped in pve.html/wiki.html/AGENTS but was missing from BUILD_LOG.md
  + the §7 backlog — both now ticked.) The N25 gallery listed each ending by TITLE only; this gives each
  ending you've **witnessed** a one-line first-person echo of how it ended for you. Two surgical edits to
  pve.html, both in the bash-visible head: (1) a new `const ENDING_TEASER={1..9}` right after
  `ENDING_TITLE` (~583) — 9 first-person lines matching the §2 ladder beats (1 Consumed "I cannot even
  remember my own name" … 9 Holy Grail "Yui is redeemed … the three of us walk out of the Veil
  together"); (2) the `questUI` ENDINGS-WITNESSED row builder (~412) appends an italic teaser sub-line
  `(got&&ENDING_TEASER[t]? '<br><i>'+…+'</i>' : '')` — ONLY for endings already seen, so **locked rows
  stay spoiler-free** (they still show 🔒 + "???"). Pure narrative display, no combat effect; reads the
  same permanent `SAVE.endingsSeen` the N25 roll already uses — NO new save fields, NO new systems. 📖
  guide YOUR ENDING paragraph + wiki.html ending bullet got the "each witnessed ending remembers itself
  with a one-line echo; sealed rungs stay spoiler-free" note. Validated: 21-assert isolated node logic
  test (`n34_teaser.js`: all 9 teasers present + first-person, exactly 9, Holy-Grail mentions redemption,
  Two-Saved names the Critical Limit; fresh save = no teaser text leaks + 9 locked; one-seen = its teaser
  shown + others hidden + exactly one ◆ furthest; all-seen = 9 teasers + 0 locked) + head-region
  node-check clean (591 visible script lines parse; only the expected frozen-tail EOF at line 592 — both
  edits sit in the head and parsed). Browser F12 remains the gate. Polish open: click a row to replay
  that ending's cutscene; a louder reveal sting when a new top-tier ending fills the roll. pve.html +
  wiki.html.
- **2026-06-16 — N35 "The Story So Far" in-run chapter recap (📜 Journal)** — NEW on-theme close-out item:
  all N1–N34 & W1–W10 already ticked, so per §7's close-out clause the cron adds one small validated
  on-theme item. The campaign objective lived ONLY on the title's chapter-select (`renderChapters` shows
  `e.obj`); once you started a hunt nothing reminded you which episode you were in or what it wanted.
  Single surgical edit to pve.html, in the bash-visible head: a new section at the TOP of `questUI`'s
  body (inserted between the ACT box `h+='</div>'` and the 🔆 ELEMENTAL SHARDS header, ~397) — guarded
  `if(typeof EPISODES!=='undefined')`, reads `selEp`→`episodeOf(cur)` for the current chapter and
  `epUnlocked()` for the frontier, then renders **"📖 THE STORY SO FAR — Episode N: Name"** + the
  chapter's `setting`/`stance` + a 🎯 `obj` objective line + a 7-row ladder marking cleared (✔,
  `e.id<unl`), here (▸, `e.id===cur`, gold + "← you are here"), the frontier (◆) and locked
  (🔒 + "???" name hidden + dimmed, `e.id>unl`). Pure read-only display over existing EPISODES data —
  NO new save fields, NO new systems, reuses `episodeOf`/`epUnlocked`/`selEp`. 📖 in-game guide gained a
  "📖 THE STORY SO FAR" paragraph (before the MEMORIES block); wiki.html got a matching "in-run chapter
  recap" bullet. Validated: isolated node logic test (`n35_storysofar.js` — 20 asserts: fresh save
  frontier=1 playing Ep1 → header+objective+setting+▸here+Ep2 locked/??? + exactly one you-are-here +
  6 locked; mid-campaign frontier=5 replaying Ep3 → header=replayed chapter + Ep1/2/4 cleared ✔ + Ep3 ▸
  + Ep5 ◆ frontier + Ep6/7 🔒; endgame frontier=7 → finale header + 0 locked + Ep6 ✔) + `node --check`
  clean + the complete edited `questUI` function extracted from the true file and node-checked in
  isolation (parses clean; the edit is in the bash-visible head this run — grep confirmed the new string
  present). Browser F12 remains the gate. Polish open: a minimap objective marker / compass needle toward
  the chapter goal (the N8 compass polish-open); click a ladder row to view that chapter's recap. pve.html +
  wiki.html.
- **2026-06-16 — N36 In-run objective banner** — NEW on-theme close-out item (all N1–N35 & W1–W10 ticked;
  pays off the N35/N8 polish-open "surface the objective in-run"). N35 put the chapter goal in the 📜 Journal,
  but it only shows if the player opens the Journal — so the goal flashes nowhere on its own at run start.
  Two surgical edits to pve.html: (1) a new head helper `showObjective()` after `chapBtnLabel` (~653,
  bash-visible) — `feed('🎯 Episode '+e.id+' — '+e.name+': '+e.obj, 0xffd9a0)` for the current chapter
  (`selEp`→`episodeOf`, falls back to `epUnlocked()`), all try/caught, warm-gold to match the objective
  theme; (2) the startRun cutscene tail (~2718) now passes an onDone into `maybeChoiceMoment` so the banner
  fires AFTER the intro/outro cutscene AND the N16 dark/light choice resolve — `maybeChoiceMoment(function(){
  showObjective();})`, with an `else showObjective()` when the choice system is absent so the banner always
  lands. Reuses the `feed()` toast + EPISODES data — NO new save fields, NO new systems, NO new DOM. Guide
  "📖 THE STORY SO FAR" paragraph + wiki.html "in-run chapter recap" bullet extended to note the on-screen
  banner. Validated: node logic test PASS (9 asserts, `n36_objective.js`: selEp→that chapter's name+obj+warm
  colour, selEp-undefined→epUnlocked fallback, Ep7 finale, bogus selEp→Ep1 fallback no-throw) + `node --check`
  clean + head-region node-check clean (577-line head extract parses to the frozen-tail EOF only; helper edit
  at line 653 is in the head, the startRun-tail wiring confirmed via Read-tool Grep at ~2718). Browser F12 the
  gate. Polish open: a persistent on-screen objective ticker / minimap compass needle (the N8 compass goal).
  pve.html + wiki.html.
- **2026-06-16 — N37 Objective compass needle on the minimap** — NEW on-theme close-out item (all N1–N36 &
  W1–W10 ticked; pays off the EXPLICIT N8/N35/N36 polish-open "a minimap objective marker / compass needle
  toward the chapter goal" — until now the compass was diegetic flavour [Yume's Ep6 gift] with no actual
  navigation aid). Two surgical edits to pve.html: (1) a new head helper `objectiveDest()` after
  `showObjective` (~654, bash-visible) — reads `selEp`→`episodeOf` (falls back to `epUnlocked()`) and returns
  the current chapter's destination zone centre `{x,z,r,name}`: Ep1/Carnival (`zone<0`) → the town hub
  `{TOWN.x,TOWN.z,TOWN.r}`, every other episode → its `DUNGEONS[e.zone]` centre+radius; all try/caught,
  read-only over EPISODES/DUNGEONS/TOWN. (2) at the END of `drawMM` (frozen-tail, ~2839, after the units
  loop) a try/caught block draws a **gold compass needle** (`#ffd96a` line + arrowhead) from the hero's
  minimap point `P(hx,hz)` toward `objectiveDest()` — `ang=atan2(od.z-hz,od.x-hx)`, length 12px — and
  **rests** (draws nothing) once `hypot(dest-hero) <= od.r` (you're inside the destination zone). Works in
  both the wild (`cx=0`) and dungeon (`cx=zone centre`) minimap projections since it anchors on the hero's
  own `P()` point. NO new save fields, NO new systems — reuses `objectiveDest`/`P`/`mmc`/EPISODES/DUNGEONS.
  📖 guide gained a "🧭 THE OBJECTIVE COMPASS" line in EXPLORING; wiki.html got an "Objective compass" bullet.
  Validated: 13-assert node logic test (`/tmp/n37.js`, mirrors the code verbatim: Ep1→town hub, Ep2→DUNGEONS[0],
  Ep7→Abyssal Vault [the Castle/Yomi-no-Tō spire], arrived gating at the zone radius [50<60 rests, 70>60
  shows], angle correctness origin→(520,520)=π/4 & →(0,520)=π/2 & →(520,0)=0, selEp=0 falls back to
  epUnlocked, Ep1 rests in town/shows in the wilds) + a verbatim stubbed-`mmc`/THREE reconstruction of the
  drawMM tail block (`/tmp/n37recon.js`: parses + runs) + head-region node-check clean (571-line head extract
  parses; only the expected frozen-tail EOF at line 572 — the `objectiveDest` helper sits in the head and
  parsed; the drawMM needle sits in the frozen tail, applied via exact-match Edit on the true file and
  confirmed at lines 2839–2847 via Read-tool Grep). NOTE: the outputs-dir scratch mount froze the tail of the
  edited test file, so the test was re-run via a `/tmp` heredoc per the documented dodge. Browser F12 remains
  the gate. Polish open: a needle on the 🗺 world map too; a 3D in-world floating waypoint arrow; the needle
  could pulse/colour-shift as you near the goal. pve.html + wiki.html.

## 6. Current state & backlog

Working (validated by node parse + logic tests, NOT yet playtested in browser):
town/wilds/dungeons/portals, GLB models, loot+rarities+affixes, elites, crits, health globes,
gold vacuum, forge, town portal, XP bar, taming, base building, CT checkpoints, permadeath,
2h cooldown (v2 save migration resets old timers once), daily heroes, ?fast=1,
veteran bonus + retuned difficulty curve (see §4), boss telegraphed AoE slams,
persistent skills (v3 save), level-up boon cards, Blood Moon swarms, pet auto-gathering,
WebAudio SFX + zone-reactive music (ported from MOBA; shares efm_vol/efm_mute), dual-view
minimap (#mm canvas, overworld ↔ dungeon interior), clickable world (left-click = inspect
buildings/nodes/portals via infoSpots[] + #info panel; right-click node = walk-to-gather),
🧙 Elder NPC + 📖 HUNTER'S GUIDE overlay (#guide; title link + top-bar 📖 + Elder click),
waypoint world map (M / 🗺 — discovered waypoints, town-only fast travel; see §3),
town stash (📦 chest, 3 run-scoped slots, deposit/withdraw/swap; see §3),
gem sockets (rare+ gear rolls ◇, dungeon-only gem drops, click-to-socket; see §3),
unique legendaries (★ named items w/ special powers incl. Emberfang burning ground; see §3),
pet evolution (Taming 10/25/40 → Juvenile/Veteran/Primal tiers) + pet sustain (OOC regen,
town heal, hatch/level-up hp scaling), bounty board (📜 3 daily contracts → gold + skill XP; see §3).

A scheduled task "ef-hunt-feature-cron" (every 10 min until 2026-06-13 19:15) ships one
small validated feature per run and logs to CHECKLIST.md's Review log — read that log
before editing pve.html, and expect edit conflicts (re-read + retry on failure).

Backlog (rough priority):
1. BROWSER playtest with ?fast=1 — numeric curve is tuned (see §4) but pacing/loot FEEL and
   the new boss slams need a real run; also verify telegraph rings render correctly.
2. ~~Waypoint/map UI; minimap~~ — DONE (minimap 19:50, waypoint map 22:40).
3. Co-op via PeerJS rooms (mirror the MOBA's host-authoritative pattern in index.html).
4. ~~Stash in town~~ (DONE 22:46); ~~gem sockets~~ (DONE 22:58); more dungeon room variety; weather/ambience.
5. Server-side CT wallet (anti-cheat) — needs a real backend, big lift.
6. Use Form-2 evolution glbs for bosses (bigger, distinct silhouettes).

## 7. How to run/test as the user

- `start_game.bat` → http://localhost:8000/pve.html (`?fast=1` for 30× time + no cooldown).
- F12 console for errors. The title screen should show CT balance, difficulty, 3 daily hunters,
  gear shop. In-run: right-click move, QWER skills, B build/forge, T town portal, S stop.

## 8. SHARED MODEL CALIBRATION (cross-session handshake — read this, MOBA session wrote it)

`model_calibration.js` in this folder is the SINGLE SOURCE OF TRUTH for per-model fixes,
audited model-by-model with the user on 2026-06-12/13 via http://localhost:8000/audit.html
(129 pets + 7 hero glbs). It exposes `window.MODEL_CAL = {FACE_FIX, SIZE_FIX, FORCE_OPAQUE,
CANON, keyOf}`. pve.html ALREADY loads it (script tag) and applies:
- `applyModel`: `normalizeInPlace(root, pf.height * SIZE_FIX[keyOf(pf.name)])` +
  `u.faceOffset = FACE_FIX[keyOf(pf.name)] ?? 0`
- `moveTo`: `u.visual.rotation.y = atan2(...) + (u.faceOffset||0)` ← 58 models were walking
  backwards/sideways in PVE before this.
DO NOT hand-edit FACE_FIX/SIZE_FIX values inside pve.html or index.html — change
model_calibration.js so both games stay in sync. New per-model fixes follow the audit
workflow (user reports via audit.html → values land in model_calibration.js).
Also active in pve's loader (keep when refactoring):
- corrupted-bone guards (|pos|>1e5 ignored in sizing; garbage meshes hidden — Inchapp case)
- collider hiding (/collider|collision/ + bare /^cube(\.\d+)?$/i non-skinned — Coronoid case)
- BLEND→cutout materials (transparent=false, alphaTest .5 — fixes see-through z-fighting)
- root-motion strip: animation tracks resolving to NON-bone nodes are dropped via
  THREE.PropertyBinding.parseTrackName/findNode (r128 track names are UUID-based — do NOT
  match by node name; that mistake froze all animations once already)
- canonClips aliases ('01_Run'/'Battleidle'/'Fly'/'Angry'/'Social_02' → engine states)
Hero glbs live in `hero/` (Irene costumes, roster glb field carries the "hero/" prefix;
autoLoad in both games is folder-aware, .vrm fallback in MOBA only).

✅ HANDSHAKE ACK (PVE session, 2026-06-13 ~01:55): verified live in Chrome on pve.html —
MODEL_CAL loads (58 FACE_FIX / 108 SIZE_FIX), keyOf('pets/26_Omnom.glb')→'Omnom', 47 in-run
units carried GLB models with 17 active facing fixes (day roster: Geenee/Juphant/Tebeno/
Polynimo/Vivorin/Eriegle/Endorr), zero console errors. CLOSED two PVE-side consumption gaps
the wiring missed: (1) FORCE_OPAQUE was unused — pve's BLEND→cutout now sets alphaTest 0 for
FORCE_OPAQUE[keyOf] models (Inchapp would have been invisible in HUNT only); (2) canonClips
had a hardcoded copy of the alias table — now reads MODEL_CAL.CANON first (literal copy kept
only as offline fallback). Single-source rule honored: no fix values live in either HTML.

## 9. SHARED ENGINE MODULE (shared/ef_core.js) — adoption state

The MOBA session built `shared/ef_core.js` (`window.EF_CORE`): shared voice, SFX/music synth,
animation canon, and the per-element skill KITS + ultimates. Contract in `shared/README_SHARED.md`.
pve.html loads it (`<script src="shared/ef_core.js">` after model_calibration.js) and has ADOPTED
(all with local fallback so the page still runs if the module fails to load):
- `EF_CORE.VOICE` character barks — `bark(name,opts)` wrapper; hunter speaks its own name on
  level-up (first syll), super (full cry), death (last syll); taming barks the pet's name.
  Mute/vol synced to the audio slider in applyVol(). EF Hunt had no voice before this.
- `EF_CORE.canonClips` / `EF_CORE.animName` preferred when present (shared clip selection).
NOT adopted yet (reason): EF_CORE.buildKit (pve's uniques hook the inline Blast/Dash fns — needs
refactor + live playtest) and EF_CORE.makeSfx (pve's sfx has per-element cast/portal/hurt extras).
RULE: when changing a shared behaviour (voice/anim/kit/sfx), change it in ef_core.js, not just here.
Validated node-side against the real module (val_ef_core_adopt_0210a.js, 21 assertions); LIVE
browser re-check still pending a server restart (was down during this pass).
