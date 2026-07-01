# EF Moba — Agent & Developer Handoff Guide

> Read this top-to-bottom before touching the project. It explains what the game is,
> how the single source file is organized, how the 3D model pipeline works, how the
> monster/type/evolution data drives everything, the full development history, and
> recipes for the most common changes. A brand-new agent should be able to continue
> from here with no other context.

---

## 0. TL;DR (the 60-second version)

- **The game is one file:** `index.html`. Vanilla **Three.js r128** + **GLTFLoader** + **SkeletonUtils**, loaded from CDN. **No build step.**
- **Data file:** `mon_lineage.json` (monster roster: lineage forms, elemental types, type chart). Generated from the spreadsheet.
- **Assets:** `pets/*.glb` — ~129 rigged monster models named `<classId>_<Name>.glb` (e.g. `1_Diloom.glb`).
- **Run it:** double-click `start_game.bat` → open `http://localhost:8000/`. It MUST be served over HTTP (not `file://`) so the game can `fetch()` the glb models and `mon_lineage.json`.
- **Genre:** a 3-lane MOBA (from "Lane Clash") fused with Warcraft-style RTS: peons gather wood/gold, build expansion bases & towers, train units, evolve creatures, hero with elemental skills, Pokémon-style type effectiveness.
- **Biggest gotcha for THIS dev environment:** the Linux sandbox mount that mirrors `index.html` froze mid-development, so automated JS syntax checks could not be run against the live file for many builds. **Validate changes by loading in a browser and watching the F12 console.** (The `pets/` and `.json` files read fine; only `index.html` was stale on the mount.)

---

## 1. What the project is

EF Moba is a browser game built on top of a user-provided MOBA prototype ("Lane Clash 1v1"). It keeps the 3-lane MOBA core (lanes, lane towers, two diagonal cores, minion waves, a controllable hero with Q/W/E skills) and layers a Warcraft-style RTS economy and an Ethermon-style monster system on top:

- **Economy:** peons (pets) gather **wood** from trees and **gold** from minerals; spend on buildings/units/evolutions.
- **Base building:** build **towers** and up to **3 bases** (town hall core + 2 expansions) on map slots; clear **wild camps** to unlock expansions.
- **Monsters:** every hero/unit is a real monster from the Ethermon roster, each with **elemental type(s)** and an **evolution chain** (Form 1 → Form 2 → Form 3).
- **Type combat:** attacks do ×1.5 vs types they're strong against, ×0.7 when resisted.
- **Win/lose:** destroy the enemy core to win; you only lose when **all** your bases fall (hero death just respawns).

---

## 2. Folder & file layout

```
EF Moba/
  index.html          <- THE GAME (everything is here)
  mon_lineage.json    <- monster roster data the game fetches at runtime
  MON_RESEARCH.md     <- human-readable research report (lineages, types, coverage)
  AGENTS.md           <- this file
  start_game.bat      <- launches a local web server (python http.server 8000)
  pets/               <- ~129 .glb monster models, named <classId>_<Name>.glb
  hero/  boss/        <- ORIGINAL source art (3ds Max .max, FBX, PSD). NOT used by the game.
  _synctest.txt       <- leftover scratch file from debugging; safe to delete
```

- The `hero/` and `boss/` folders are the **original 3D source files** (`.max`, `.FBX`, `.psd`). `.max` is proprietary 3ds Max and cannot be converted without 3ds Max; the game does **not** use them. The game only uses `pets/*.glb`.
- Uploaded source spreadsheet: `Public_Main_Mon_Sheet_v11.xlsx` (in the chat uploads, not the game folder). It is the source of `mon_lineage.json`.

---

## 3. How to run / test

1. `start_game.bat` runs `py -m http.server 8000` (falls back to `python`, then suggests `npx http-server`).
2. Open `http://localhost:8000/`.
3. The champion-select screen loads `mon_lineage.json`, builds hero cards, and shows the type chart.
4. Pick a champion → the match starts and models stream in from `pets/`.

**If opened as `file://`** (double-clicking index.html), `fetch()` of glb/json is blocked by the browser, so: no roster (falls back to a single generic champion + the legacy `PET_POOL`), and models must be loaded by hand via the in-game **Asset Manager** (📦 button). Always test via the server.

**Validation:** there is no test suite. Validate by running in the browser and reading the **console (F12)**. A JS syntax error shows as a blank screen + a red console error on line N of the inline `<script>`.

---

## 4. How `index.html` is organized (in order)

It's `<head>` CSS, then `<body>` HUD/overlay markup, then three `<script src>` tags (three.min r128, GLTFLoader, SkeletonUtils), then one big inline `<script>` containing the whole game. The inline script, top to bottom:

1. **Renderer / scene / camera** + RTS camera rig (`camFocus`, `followHero`, `camZoom`).
2. **Map**: procedural grass/dirt canvas textures, ground, 3 lanes (`LANES` mid/top/bot), decorative cones pushed into `obstacles[]`.
3. **Units core**: `T` (teams), `units[]`, `bar()/drawBar()`, `mkUnit()`, `placeholder()` (low-poly stand-ins per kind).
4. **MODEL PIPELINE** (see §6): `prefabs`, `slotMon`, `FACE_FIX`, `modelBox`, `normalizeInPlace`, `computeFaceOffset`, `applyModel`, `setAnim/animName/updateAnim`, `loadGLBData`, plus the legacy `parseGLB/normalize` fallback and the Asset Manager file inputs.
5. **Effects**: `fxRing`, `fxBeam`, `feed` (toast log).
6. **Economy globals**: `bank{gold,wood}`, `ROSTER`, `slotMon`, `COST`, caps (`MAXPETS`,`MAXUNITS`), `nodes`, `slots`, `eggs`, `wildCamps`, `playerBases`, `obstacles`.
7. **Resources & building**: `mkNode`, `nearestNode`, `mkSlot`, `nearestBase`, eggs.
8. **Combat**: `dmgUnit`, `nearestEnemy`, `shoot`, `tryAttack`, `moveTo`, `faceTo`, collision (`avoidTrees`, `avoidStructures`, `separate`).
9. **Abilities & kits**: ability archetypes (`abNova/abLine/abRing/abBuff/abDash/abBlink`), `ARCH`, `KITS`, `buildKit`; primitives `aoe/dash/castAt/lineShot/clampMap/petHeal`.
10. **Spawning**: `mkHero`, `mkPet`, `spawnPeon`, `mkMinion`, `mkTower`, `mkCore`, `mkBase`, `spawnWildCamp`, `checkCamp`, `mkSoldier`.
11. **AI**: `soldierAI`, `wildAI`, `baseAI`, `petAI`, `aiHero`, `petAIenemy`, `minionAI`, `towerAI`.
12. **Selection/commands/FOV**: `inspect`, selection rings, `cmdStop/cmdHold`, `buildUnitPanel`, `boxSelect`, `leftClickAt`, `rightClickCommand`, `showNodePanel/showInfoPanel/modelInfo`.
13. **Build menus**: `openSlotMenu`, `openBaseMenu` (incl. evolve buttons), `peonBtn`.
14. **Input**: raycasting (`groundPt/pickUnit/pickNode/pickSlot`), skill aim system (`aimIdx`, `startAim/castSkill/updateAim/cancelAim`), pointer handlers (drag-select), camera pan, keydown.
15. **Roster + evolution**: `loadRoster`, `typeMult`, `loadAllModels`/`loadAllModelsLegacy` (legacy), `evolveUnit`.
16. **Game flow**: `startGame(idx)`, `assignModels`, champion select (`initSelect/renderHeroCards/renderTypeChart`), `popDamage`, `initRTS`, `endGame`.
17. **HUD/minimap**: `updHUD`, `drawMM`.
18. **Main loop**: `loop(now)` + `initSelect()` call at the very end.

---

## 5. Core data model

- **Coordinate system:** XZ is the ground plane, **Y is up**. Map is ~220 units; positions are clamped to ±115 (`clampMap`). Blue core at `(-82,-82)`, red core at `(82,82)`. Lanes are in `LANES` (mid/top/bot).
- **`units[]`** holds every combat entity. A unit `u` has roughly:
  - identity: `kind`, `team` (`T.B`=0 you, `T.R`=1 enemy, `T.N`=2 wild), `slot` (model slot key), `mon` (roster entry), `types[]`, `formLevel`.
  - transform: `grp` (THREE.Group, world position), `visual` (child group that holds the model + is scaled/rotated), `h` (logical size used for bars/collision/FOV).
  - combat: `hp/maxHp/dmg/range/ms(moveSpeed)/atkSpd/cd/aggro/fov/slowT/hasteT/target/mvT/state`.
  - rendering: `bar` (sprite health bar), `mixer/clips/curAnim` (animation), `faceOffset`, `modelName`, `_moving/_atk` (per-frame anim flags).
- **kinds:** `hero`, `pet` (peon/companion), `soldier` (`sub`=`melee`/`archer`), `minion` (+`big`), `wild`, `tower`, `base`, `core`.
- **Globals you'll use constantly:** `pHero/eHero` (heroes), `pPet/ePet`, `bCore/rCore`, `playerBases[]`, `bank`, `ROSTER`, `slotMon`, `prefabs`, `slotH`, `selUnits[]`, `aimIdx`.

---

## 6. THE MODEL PIPELINE (most important section)

### 6.1 Slots & prefabs
Models are loaded into named **slots**, cached in `prefabs[slot] = {scene, animations, height, faceOffset, name}`.
Fixed slots: `pHero, eHero, pPet, ePet, minion, bigminion, melee, archer`. Evolution adds dynamic slots keyed `f2_<glbBaseName>`.
`slotMon[slot]` maps a slot to its roster mon (so units get `types`/`mon`). `slotH[slot]` is the target on-ground height for that slot.

### 6.2 Loading: `loadGLBData(buf, slot, h, nm, ok, err)`
- Uses **`THREE.GLTFLoader.parse`** (real loader → correct skinning, embedded textures, animations).
- Stores `prefabs[slot]` incl. `faceOffset = computeFaceOffset(scene)` and `name = nm`.
- Re-applies to any existing units whose `.slot === slot`.
- **Fallback:** if `THREE.GLTFLoader` failed to load (CDN down), it uses the bundled minimal `parseGLB` (static mesh, no animation). `gltfLoader` is null-guarded.
- `autoLoad(slot,name,h)` = fetch `./pets/<name>.glb` then `loadGLBData`. `name` is the filename without extension.

### 6.3 Applying: `applyModel(u, slot)`
1. Clones the prefab scene with **`THREE.SkeletonUtils.clone`** (per-instance skeleton so each unit animates independently; geometry/materials shared).
2. **Sizes it** with `normalizeInPlace(root, height)` which calls **`modelBox`**. `modelBox` measures the model from **skeleton bone world-positions** (not geometry bbox) — these glbs have tiny geometry coords blown up by the rig, so `Box3.setFromObject` would mis-size them into skyscrapers. Bone bbox + 14% pad gives correct size.
3. **Hides collider meshes**: any mesh whose name matches `/collider|collision|_ucx|bound(ing)?box/i` is set invisible (some glbs ship a `Cube_Collider` box — Moranagi, Oculid, Coronoid, Ekopi). The game has its own collision; these are just art proxies.
4. **Materials**: forces `metalness = 0` (no env map → metallic renders black), bumps low roughness, sets `map.encoding = sRGB`, `side = DoubleSide`.
5. **Facing**: `u.faceOffset = FACE_FIX[name] ?? prefab.faceOffset`. `computeFaceOffset` infers forward from the **head bone** (name matches `head|skull|jaw|snout|nose|beak|mouth`) vs the bone centroid. Models with no head bone or a weird rig may face wrong — override via `FACE_FIX` (e.g. `{Lectrobe: Math.PI}`).
6. **Animation**: builds an `AnimationMixer` + `clips{}` keyed by lowercased clip name, plays `idle`.
7. Sets `u.modelName`, and (if `slotMon[slot]`) `u.mon` + `u.types`.

### 6.4 Animation state machine
`animName(u)` chooses a clip each frame: `_atk` → `melee claw`/`spell cast`; pet gathering → `dig`/`eat`; `_moving` → `run`/`walk`; else `idle`. `_moving`/`_atk` are reset at the **start** of the loop frame and set by `moveTo`/`tryAttack` — note heroes move *before* the units loop, so the reset is done once up front so hero walk flags survive (historical bug).

### 6.5 Sizing & forms
`slotH` heights: heroes 5, pets ~2.8, minion 3.2, bigminion 4.8, soldiers 3.2–3.6. Evolution scales `u.visual.scale`: **Form 2 = 1.5×**, **hero Form 3 = 2.0×**. Big minions get their own `bigminion` slot/model (not a scaled small minion).

### 6.6 Adding / replacing a model — recipe
1. Drop `pets/<classId>_<Name>.glb` in the folder. Name format matters (number prefix = class id used by the roster).
2. The model should have **idle, walk, run, melee claw** clips and a normal rig. Audit a glb's animations by reading its JSON chunk (see §9).
3. If it's a **Form-1** that should be selectable, it must appear in `mon_lineage.json` (re-extract — §9) or be added to the legacy `PET_POOL` list.
4. If it **faces the wrong way**, add `FACE_FIX[<Name>] = Math.PI`.
5. If it shows as a **box**, its collider mesh name probably isn't matched — widen the regex in `applyModel`, or the model failed to load (check console / `modelInfo` panel which prints the model name & slot).

---

## 7. Monster roster, types, forms, evolution

### 7.1 `mon_lineage.json` shape
```jsonc
{
  "typeChart": { "strong": { "Fire": ["Leaf","Insect","Ice","Iron"], ... } },
  "upgradeChains": [   // 23 mons with Form1+Form2 both present & fully rigged
    { "name":"Dilloom", "types":["Leaf","Toxin"],
      "forms":[ {"name":"Dilloom","cls":1,"glb":"1_Diloom.glb","animated":true},
                {"name":"Dillow","cls":38,"glb":"38_Dillow.glb","animated":true},
                {"name":"Dillossus","cls":64,"glb":null,"animated":false} ] }, ...
  ],
  "baseOnly": [ {"name":"Keradon","glb":"14_Keradon.glb","types":["Earth"]}, ... ], // 59 Form1-only
  "allMons": [ ... ]
}
```
- **Heroes & "featured" slots** (hero, bigminion, melee) are drawn from `upgradeChains` so they can evolve. Other slots come from any mon.
- There are **0 usable Form-3 glbs** (those class ids aren't in `pets/`). Hero "Form 3" therefore reuses the **Form-2 model at 2.0×** as a stand-in. To add real Form-3: drop the glbs in `pets/` and re-extract.

### 7.2 Type effectiveness — `typeMult(atkTypes, defTypes)`
Returns 1.5 if any attacker type is strong vs any defender type, 0.7 if resisted, else 1. Applied in `tryAttack` (melee) and the projectile hit (ranged). Structures/wild have no types → ×1. Chart is in `mon_lineage.json` and printed on the select screen by `renderTypeChart`.

### 7.3 Evolution — `evolveUnit(u)`
- Units/heroes whose `mon` has a Form-2 glb can evolve. Cost from `COST.evolve` (units) / `COST.evoHero` (hero).
- Loads the Form-2 glb into a `f2_<glb>` slot, `applyModel`s it, scales `u.visual` (1.5× / hero 2.0×), boosts hp/dmg/range, sets `u.formLevel`.
- UI: **⬆ Evolve** button appears in the unit panel (`buildUnitPanel`) for player pets/soldiers with a Form-2; **⭐ Evolve Hero** in the town-hall menu (`openBaseMenu`).

### 7.4 Hero kits — `KITS` / `buildKit(type)`
Each of the 17 elements maps to `[color, description, [Qname,arch], [Wname,arch], [Ename,arch]]`. Archetypes (`ARCH`): `nova` (point AOE), `line` (piercing line), `ring` (self AOE slow), `buff` (haste), `dash`, `blink`. `buildKit(type)` returns `{color, type, desc, abs:[Q,W,E]}`. Each ability object: `{n,d(desc),cd,mp,f(cast),...}` plus aim hints (`self` OR `prev:'ring'|'line'` + `size`).

### 7.5 Champion select & start
`initSelect()` (called at load) → `loadRoster` → builds `heroCandidates` (one per chain) → `renderHeroCards` + `renderTypeChart`. Clicking a card calls `startGame(idx)`, which picks player + a different enemy candidate, builds heroes via `mkHero(team, kit, x, z)`, sets `slotMon` for heroes, then `assignModels(pMon, eMon)` loads every slot's glb from the roster.

---

## 8. Gameplay systems quick reference

- **Skills (aim-then-cast):** press Q/W/E → if `self`, casts instantly; else enters aim mode showing a preview (`aimRing` for point, `aimLine` for direction); left-click casts at the point; clicking near the enemy hero snaps onto them; right-click/Esc cancels. State in `aimIdx`, drawn by `updateAim`.
- **Selection/commands:** left-drag = box select your pets/soldiers; left-click = select one / open base or build menu / inspect; right-click = command selected unit(s), else move the hero. One command returns control to the hero. Hotkeys on a selection: **C** chop, **V** mine, **F** follow, **H** hold, **S** stop, **Esc** cancel. Selection rings via `selRings`.
- **Peon gathering:** select a pet → right-click a tree/gold tile (StarCraft-style). Hauls to nearest base, auto-continues adjacent same-type nodes. Trees are **solid blockades** until chopped (`avoidTrees`).
- **Collision:** `avoidStructures` (hard: towers/bases/cores + `obstacles`), `separate` (soft unit spacing), `avoidTrees` (hard). Attack reach accounts for structure size.
- **Building:** glowing `slots[]` — expansions (build a base or tower) and defensive (towers). `spawnWildCamp` places a gold tile guarded by wild monsters; clear them (`checkCamp`) to unlock the expansion slot. `COST` table gates everything via `buy()` (clamps bank ≥ 0, re-checks affordability).
- **Caps:** `MAXPETS=32`, `MAXUNITS=32` (soldiers); shown in `#stats`.
- **Camera:** LOL-style — follows hero (`followHero`), arrows/screen-edges/minimap-click pan, **Space** recenters, wheel zooms.
- **Damage numbers:** `popDamage(u,amt,mult)` floats DOM nodes in `#dmgLayer`. mult>1.2 = big orange-red `-N!`; mult<0.9 = small grey; else white. Gated to meaningful hits (hero/structure/super-effective) to avoid spam.
- **Eggs:** killing enemy/wild NPCs can drop an egg; walking a hero/pet over it hatches a peon (cap-limited).
- **Win/lose:** enemy core down = victory; all `playerBases` down = defeat; hero death = respawn (countdown shown on the portrait).

---

## 9. Spreadsheet source & data extraction

Source: `Public_Main_Mon_Sheet_v11.xlsx`, tab **"Mons Ancestry"** (per-mon rows from ~row 13). Key columns: D=Name, F=Rarity, G=Form, **M/N = Type 1/Type 2 names** (this is the "column MN" the user referred to), R/S/T = Form 1/2/3 names, U/V/W = Form 1/2/3 class ids. glb files are `<classId>_<Name>.glb`, so forms map straight to files.

To re-extract after the sheet or `pets/` changes (Python + openpyxl in the sandbox):
1. Read Mons Ancestry rows where G=`Form1` and class id < 1000 (skip "(GR)" golden variants). Capture name, rarity, types (M/N), and Form2/Form3 names + class ids (S/T/V/W).
2. List `pets/*.glb`, map `int(prefix) -> filename`.
3. For each form class id, check the glb exists; audit its animations by parsing the GLB header (read the JSON chunk, list `animations[].name`, require idle/walk/run/melee claw with non-empty channels).
4. Emit `mon_lineage.json` with `upgradeChains` (Form1+Form2 both rigged), `baseOnly` (Form1 rigged only), `typeChart`, `allMons`. Copy it into the game folder.

Current coverage: **23** upgrade chains, **59** base-only, **0** Form-3 glbs. The type effectiveness chart is **designed** (not in the sheet) — Pokémon-style, editable in `mon_lineage.json`.

---

## 10. Known constraints, gotchas & risks

- **Frozen sandbox mount (dev-environment issue):** during development the Linux mount mirroring `index.html` got stuck on a stale copy, so `node` syntax checks on the live file returned empty/false. This is NOT a code problem — it's an infra quirk. New agents in a fresh environment should be able to lint normally; otherwise validate in a browser. (`pets/` and `.json` read fine.)
- **Must be served over HTTP**, not `file://`, or models/roster won't fetch (falls back to Asset Manager + legacy pool).
- **No Form-3 art.** Hero top form is Form-2 @ 2.0×.
- **Excluded models:** `30_Cobrus` (no run/attack anims) and `186_Sully` (root bone literally named `glb`, breaks its walk) are excluded from the auto pool. Re-add by fixing the rig or removing them from the exclusion list/`PET_POOL`.
- **Collider boxes** ship inside Moranagi/Oculid/Coronoid/Ekopi (and possibly others) — hidden by name match in `applyModel`.
- **Spelling drift:** glb `1_Diloom.glb` (one L) vs sheet `Dilloom` (two L). Map by class id, not name.
- **Custom `parseGLB` fallback** is retained for offline/CDN-failure; it's static (no animation) and less robust.
- **`_synctest.txt`** is debugging litter — delete it.
- **CDN dependency:** GLTFLoader/SkeletonUtils come from `cdn.jsdelivr.net/npm/three@0.128.0/examples/js/...`. If you bump the three version, update both and re-test (examples/js global build only exists up to ~r137).

---

## 11. Development history (chronological)

1. **Origin.** User supplied `moba-1v1.html` ("Lane Clash") — a 1v1 MOBA with 3 lanes, towers, cores, minion waves, 3 fixed hero classes, a hand-written minimal GLB parser, and an Asset Manager. Goal: turn the `pets/` monster glbs + Max/FBX source into a MOBA with resource gathering and unit control (Warcraft + LoL).
2. **RTS layer.** Kept the original 3-lane map; added peon gathering (wood/gold), buildable slots, expansion bases (up to 3), wild camps guarding gold, base upgrades, eggs from kills, and "lose only when all bases fall."
3. **Camera & control.** Reworked to LoL-style follow + edge/arrow/minimap pan + Space recenter. Added StarCraft-style peon commands, drag box-select, group hotkeys (C/V/F/S/H), soft + hard collision, trees as blockades.
4. **Units.** Trainable Footman/Archer ("special units"), heavy lane minions with a distinct model, per-unit FOV (click any unit to see it), unit caps 32/32, resource reserves on click, hero respawn timer on the portrait.
5. **Skills.** Reworked from instant-cast to **aim-then-cast** with previews and directional/jump-to-hero targeting.
6. **Real model pipeline.** Replaced the custom parser with **GLTFLoader + SkeletonUtils** → correct textures, skinning, and animations. Fixed: skyscraper sizing (bone-based `modelBox`), black models (`metalness=0`), box artifacts (collider-mesh hiding), wrong facing (head-bone `computeFaceOffset` + `FACE_FIX`), backwards/idle heroes (anim flag ordering), and added the animation state machine.
7. **Spreadsheet study.** Parsed `Public_Main_Mon_Sheet_v11.xlsx`, mapped lineage forms to glb files by class id, audited animations, designed the type chart, and produced `mon_lineage.json` + `MON_RESEARCH.md`. Findings: 23 chains, 59 base-only, 0 Form-3 art.
8. **Form/type system.** Roster-driven model assignment, type-effectiveness combat (×1.5/×0.7), Form-1→Form-2 evolve (1.5×), hero Form-3 stand-in (2.0× from the Form-2 model), evolve buttons.
9. **Champion picker & polish.** Rebuilt the opening screen into a monster-based hero picker (one card per chain) with type-themed skill kits and an on-screen type chart; added floating damage numbers (crit = big orange-red); per-model facing fix for Lectrobe; hero scale 2.5×→2.0×.

> A recurring caveat across builds: because of the frozen mount, many changes were verified by reading the code back rather than executing it. Treat any "verified" claim from history as "structurally reviewed, not run."

---

## 12. Common task recipes

- **Replace what a slot uses / add a champion:** edit `mon_lineage.json` (or re-extract). Heroes come from `upgradeChains`; base units from `baseOnly`.
- **Fix a model facing the wrong way:** `FACE_FIX[<ModelName>] = Math.PI` (or other radians). ModelName = filename minus the `<num>_` prefix.
- **A unit is a box:** click it — `modelInfo` shows `model: Name [slot]` (loaded) or `⚠ box — model not loaded [slot]`. If loaded-but-box, extend the collider name regex in `applyModel`. If not loaded, check console/CDN/path.
- **Tune type chart:** edit `mon_lineage.json` → `typeChart.strong`.
- **Tune combat feel:** multipliers in `typeMult`; evolve scales/stats in `evolveUnit`; ability numbers in the `abX` archetypes; costs in `COST`.
- **Add a hero ability archetype:** add an `abX(n,col)` factory and reference it from `KITS`.
- **Change form scaling:** `evolveUnit` (1.5 / 2.0) and `slotH` heights.
- **Re-extract roster after asset/sheet changes:** see §9.

---

## 13. Roadmap / open items

- Real **Form-3** models (need glbs for class ids ~52–90, 158+), then wire true Form-3 in `evolveUnit` instead of the 2.0× stand-in.
- Fix and re-include **Cobrus** (add run/attack) and **Sully** (rename `glb` root bone).
- Per-mon **stat differentiation** (currently heroes share a base statline; types only affect abilities + effectiveness).
- Enemy AI that **expands/evolves** (currently single enemy core, no enemy economy).
- Optional **sprite-impostor** rendering (bake 3D → 2D animated sprites) if many skinned units hurt frame rate — discussed as a fallback.
- Balance pass on evolve costs, type multipliers, and unit caps.
```
