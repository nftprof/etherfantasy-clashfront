# EF Moba — Project Handoff (for the next agent)

> Last updated: 2026-06-19. Author: Opus 4.8 session (continuing work originally
> started by "Fable"). Read this top to bottom before touching code. Companion
> docs: `AGENTS.md` (MOBA), `AGENTS_PVE.md` (EF Hunt), `SERVER_PLAN.md`,
> `AUTOBUILD_QUEUE.md`, `POLISH_LOG.md`.

---

## 1. What this project is

`C:\Users\ADMIN\Desktop\EF Moba` is a **browser game project** with **two games**
that share assets and code modules. No build step — vanilla JS + Three.js r128
from CDN, single-file HTML games. Served locally by `serve.py` (python
`http.server` on **port 8000**) launched by `start_game.bat`.

- **`index.html`** — **the MOBA.** 3-lane MOBA fused with a Warcraft-3-style RTS
  economy (workers gather gold/wood, build town halls + towers, train units,
  evolve them). Heroes + pets + line minions + a boss + wild camps + recruitable
  "Master" helpers.
- **`pve.html`** — **EF Hunt.** A Diablo × Palworld ARPG grind (corruption/scent
  hunt loop, dungeons, Blood Moon events, story episodes/cutscenes).

Owner/dev: **`nftprof@pentagon.games`** (web3/games developer, drives rapid
feature requests and live playtests).

Multiplayer = **PeerJS P2P, host-authoritative** (lazy-loaded). CT currency lives
in `localStorage` (honor system today). A **server-authoritative AWS backend** is
planned — see `SERVER_PLAN.md` (handed to a separate Claude Code session to build).

---

## 2. File map

| File | Role |
|---|---|
| `index.html` | The MOBA game (~2900 lines, most-edited file). |
| `pve.html` | EF Hunt ARPG. |
| `audit.html` | Model QA tool — `http://localhost:8000/audit.html`. Cycle every model, dial facing/size/range/melee/air, then it prints a report to paste back. |
| `shared/ef_core.js` | `window.EF_CORE`: VOICE, makeSfx, canonClips/animName, KITS/ARCH, buildKit/buildSuper/superCd. Shared combat-kit source. |
| `shared/ef_touch.js` | `window.EF_TOUCH`: AoV-style mobile control layer (diamond Q/W/E/R + ATK + utilities). |
| `model_calibration.js` | **Single source of truth for per-model fixes.** `window.MODEL_CAL` = FACE_FIX, SIZE_FIX, FORCE_OPAQUE, **AIR**, CANON, ANIM_FORCE, forceClips(), keyOf(). |
| `mon_lineage.json` | Roster: upgradeChains (have Form-2 = can be PETS), baseOnly (= line minions/workers), typeChart, allMons. |
| `serve.py` | Static server. `/listpets` (pets/ + hero/ + npc/), `/listvrm` + `/vrmfile/` bridge to `A:\EF Models\VRM_Pipeline\out`, `/` serves launcher.html. |
| `start_game.bat` | Launches serve.py on port 8000. |
| `pets/`, `hero/`, `npc/` | GLB model folders. |
| `SERVER_PLAN.md` | Full AWS server-authoritative backend plan (for the CC session). |
| `AUTOBUILD_QUEUE.md` | Drives the `efmoba-autobuild` scheduled task (Phase 4 features). |
| `POLISH_LOG.md` | Drives the `efmoba-polish` scheduled task (balance/QoL). |
| `AGENTS.md` / `AGENTS_PVE.md` | Per-game agent guides. |

---

## 3. CRITICAL: the stale-mount gotcha (read this twice)

The Linux/bash mount serves **STALE / TRUNCATED** copies of `index.html`,
`pve.html`, and `model_calibration.js` **after you edit them this session**.

- The **Read / Write / Edit file tools see the TRUE file.** `bash` (cat, wc,
  `node --check` on the whole HTML) does NOT — it will report a bogus
  "Unexpected end of input" because the mounted copy is truncated mid-statement.
- **Never** validate an edited game file by running `node --check` on the whole
  file in bash. **Never** write to game files via bash `>>` / redirects.
- **Validation pattern that works:** copy the edited function(s) — with small
  stubs for `THREE` / `document` / `window` — into a **uniquely-named** scratch
  `.js` in the outputs dir, then `node --check` + runtime assertions there.
- Edit game files only through the Edit/Write tools.

---

## 4. Path mapping (file tools ↔ bash)

| File-tool path (Windows) | bash path (Linux mount) |
|---|---|
| `C:\Users\ADMIN\Desktop\EF Moba\` | `/sessions/<id>/mnt/EF Moba/` |
| `A:\EF Models\VRM_Pipeline\out` | `/sessions/<id>/mnt/out/` |
| outputs (scratchpad) | `/sessions/<id>/mnt/outputs/` |

The session id segment changes per session — list the mount to confirm.

---

## 5. model_calibration.js — how model fixes work

Keyed by `keyOf(glbName)` = filename minus path, minus `.glb/.vrm`, minus a
leading `<id>_` prefix (e.g. `26_Omnom.glb` → `Omnom`; `hero/Kai_Set_Default.glb`
→ `Kai_Set_Default`).

- **FACE_FIX[key]** — replaces the auto head-bone facing offset (radians), applied
  as `visual.rotation.y = moveAngle + offset`. **Default for un-listed models is
  `Math.PI`** (most Ethermon rigs face −X at 0). This was the root of the old
  "everyone walks backward" bug. `H = Math.PI/2`, `P = Math.PI`.
- **SIZE_FIX[key]** — multiplies normalized height.
- **FORCE_OPAQUE[key]** — render ignoring texture alpha (for models whose alpha
  is ~0 everywhere).
- **AIR[key]** — flyer override set (1 = air, 0 = force grounded). See §8.
- **CANON** — `[engineState, regex]` clip-name aliases.
- **ANIM_FORCE** — per-model clip overrides (prefix-matched on key). Kai still has
  **no Run clip** so `kai:{run:['dash','run'],…}` maps run→Dash.
- `keyOf()` and `forceClips()` are exported helpers — both games + audit use them.

Both games and `audit.html` consume this file, so it is the one place to bake in
audit results.

---

## 6. The MOBA (index.html) — systems built this session

- **Map exploit sealed.** `clampMap` clamps to `±115*MAPK`, ring `R=90*MAPK`,
  fountain pockets `<256*MAPK*MAPK` allow spawn/recall but seal the corner backdoor.
- **EF_CORE wired.** `buildKit`/`superCd`/`speakName` route through `EF_CORE`
  (with inline fallback). PeerJS lazy-loaded via `ensurePeer(cb)`.
- **Heroes restricted to Irene / Kai / Leah.** `heroCandidates` filtered to
  `hero/` glbs; unit/worker pools exclude heroes; workers/minions draw from
  `baseOnly` (no Form-2). **PETS** draw from `upgradeChains` (have Form-2).
- **HERO_PROFILE** = per-hero hp/dmg/range/ms/atkSpd/proj. Irene = arrow (range 11),
  Leah = orb (range 10), Kai = melee (range 3, no proj).
- **Visible projectiles.** `shoot(src,tgt,col,dmg,style)` — bright glowing bolt +
  halo; arrow=cone, else sphere.
- **Pet system** (Phase 2 done): roster split, gold-gated Summon Pet (nerfed
  auto-cast kit ~0.4×), per-pet tier upgrades (T1 Q / T2 Q-W-E + retaliate /
  T3 +R super + auto-aggro), pet auto-cast AI, **permadeath** (no respawn).
- **RTS depth** (Phase 1 done): tower/building repair by workers (**costs wood**,
  `REPAIR_RATE={g:0,w:0.07}`), tower upgrade tiers (cap 3), town-hall upgrade
  tiers, store unit Form-2 evolve, smarter symmetric red-side economy AI.
- **Soldier auto-evolve.** After ~45s in combat, `evolveUnit(u,true)` (free path).
  The manual "Evolve Soldiers" button was removed — base menu now reads "Soldiers
  auto-evolve; build at the glowing pads."
- **Build pads (reverted from flexible build).** Fixed friendly build pads via
  `mkSlot(...)`. The flexible buildMode/buildGhost code is still present but
  **dormant** (its menu buttons were removed). `T` key = town hall hotkey
  (centers camera + opens train menu).
- **Summon Pets consolidated.** "Train Worker" + "Summon Pet" merged into one
  "✨ Summon Pets". `COST.summonPet={g:180,w:0}`.
- **Boss + wild + Masters** (npc/ models):
  - Boss = `npc/Boss_Centaur_Warrior_Fire` (slot `boss`, 1.6× scale, SIZE_FIX 1.7).
  - Wild = `npc/Mon_Goblin_Gold` (slot `wild`).
  - Masters 0/1/2 = `npc/Mas_Bellbird` / `Mas_Lucy` / `Mas_Maple`.
  - **Master recruit system:** `masters[]`, `spawnMaster()` spawns a beacon
    (invuln while `recruitable`), `recruitMaster(m,h)` on hero contact (<5) turns
    it into a follow-and-fight helper (`sub='master'`, `followHero`). `soldierAI`
    has a master-helper branch (attack nearby foe, else follow hero if d>7).
    `nearestEnemy`/`dmgUnit` skip `recruitable` units.
  - **Boss auto-heal:** `dmgUnit` stamps `cbtT`; `wildAI` heals boss +4%/s when out
    of combat >6s.
- **Minimap aligned to camera** (camera looks −Z = top of screen): `mmX/mmY` map
  world→minimap, inverse on click.
- **Map scale `MAPK=1.4`** — single constant; HILLS/ground/LANES/WALLS/obstacles/
  FOUNTAINS/cores/towers/spawns all ×MAPK. Base-to-base walk ~12.7s → ~17.8s.
  Bump MAPK (1.8 / 2.2) for longer traversal — one-line change.
- **Quick-cast toggle.** `QUICKCAST` (localStorage `efm_quickcast`), default ON.
  `startAim(ai,shift)`: self-cast = instant; `qc = shift ? !QUICKCAST : QUICKCAST`.
  `.qcBtn` in #top and the select screen; **`N` key** toggles; `updQCbtns()`.
- **Anti-stuck pathing.** `moveTo` tracks `_lastX/_lastZ`, accumulates `_stuckT`
  when barely moving, and blends a perpendicular steer so NPCs slide along walls.
- **Air/Land combat** — see §8.
- **Mobile:** `efTouchMatch(on)` shows/hides controls on match vs menu; `#help`
  collapsible (`#helpTgl` ❔), HUD hidden on `.ef-touch`.

---

## 7. EF Hunt (pve.html) — systems built this session

- **Frozen-idle fix (important).** The main units loop iterated ALL units incl.
  the hero, resetting `_moving=false` and re-animating AFTER the hero's own block,
  clobbering run→idle every frame. Fixed by guarding the hero out:
  `if(u!==hero){u._moving=false;u._atk=false;}` and
  `if(u.mixer&&u!==hero)updateAnim(u,dt);`.
- **applyModel faceOffset default `:Math.PI`** (was `:0`) — same backward fix.
- Brightened ranged bolt; AoV mobile layout (EF_TOUCH.init); heroes restricted to
  Irene/Kai/Leah; Centaur boss + Goblin wilds wired (done by the autobuild cron).
- **NOT yet wired in pve.html: air/land combat** (offered as a follow-up).
- The polish cron has been adding story/QoL/balance items (threat legend, Overlook
  aim-mode exit, Blood Moon swarm speed, cutscene canon fixes). See `POLISH_LOG.md`.

---

## 8. Air / Land combat (MOBA — wired; EF Hunt — pending)

Rule: **melee can't hit flyers; ranged (archers/mages), other air units, and
structures can. Air units hit everything.**

- `model_calibration.js` → `AIR:{Vivorin,Windora,Gremin,Inkami,Tebeno,Clothom,
  Roichirp,Sully,Batflare,Eriegle,Deefyn,Finray,Moonara}` (all `1`).
- `index.html`:
  - `canHitAir(u){return !!u.air||u.range>4||u.kind==='tower'||u.kind==='core'||u.kind==='base';}`
  - `nearestEnemy`: `const noAir=!canHitAir(u);` + `if(v.air&&noAir)continue;`
  - `tryAttack`: `if(t.air&&!canHitAir(u)){u.target=null;return false;}`
  - `applyModel`: `u.air=(u.kind!=='hero')&&(AIR override else Flyer-type);
    u.visual.position.y=u.air?3.2:0;` (flyers float).
- **audit.html:** `G` key toggles AIR per model; report prints an "AIR SET" line;
  selName shows 🕊AIR / 🦶LAND. `T` key toggles RANGED/MELEE (🏹/⚔).
- **Pending:** wire the same `canHitAir` rules into `pve.html`.

---

## 9. Heroes / models status

- **Kai** (`hero/Kai_Set_Default.glb`): 36 anims, **NO Run clip** (only `01_Dash`),
  has weapon prop bones. Uses Dash for locomotion via ANIM_FORCE. **Needs a
  re-export with a Run/Walk clip** for a true run. FACE_FIX `Kai_Set_Default:0`.
- **Leah** (`hero/Leah_Set_Default.glb`): 33 anims, HAS `01_Run`. SIZE_FIX 1.2.
- **Irene:** archer; ANIM_FORCE maps basic/skills to BOW shots, never the melee kick.
- npc/ models (Boss_Centaur_Warrior_Fire, Mon_Goblin_Gold, Mas_Bellbird/Lucy/Maple)
  all map cleanly to engine states, no ANIM_FORCE needed, geometry healthy.

---

## 10. Autonomous scheduled tasks (currently running)

- **`efmoba-autobuild`** — hourly; works `AUTOBUILD_QUEUE.md` top-to-bottom, one
  validated slice per run. Phases 1–3 done; Phase 4 = invent balance-safe features
  (counter toward 10). When done it appends "QUEUE COMPLETE" and asks to be deleted.
- **`efmoba-polish`** — every 20 min (had an end date ~2026-06-17 13:07 UTC; check
  `list_scheduled_tasks` for current state); balance + QoL + model-size consistency,
  logs to `POLISH_LOG.md`.

**These crons edit game files autonomously with revert-on-failure.** They can
conflict with manual edits — on a "modified since read" error, **re-read and
retry**. If you don't want them touching files while you work, pause/delete them
via `mcp__scheduled-tasks__*`.

---

## 11. Server backend (planned, not built here)

`SERVER_PLAN.md` is the spec for a separate Claude Code session: move the host
from the browser into a headless Node sim (reuse existing guest/snapshot netcode),
server validates all inputs (HP/damage/economy server-only; movement/teleport/
cooldown checks). AWS: **c7g.large / c6i.large**, AL2023/Ubuntu ARM64, Node 20,
30GB gp3, ALB with WebSocket + stickiness (idle ≥300s), RDS Postgres db.t3.small,
optional ElastiCache Redis t4g.micro, S3 + CloudFront front end (~$110/mo). 200 ccu
≈ 50–100 matches ≈ one box. Same binary runs on LAN via `EF_SERVER_URL`.

---

## 12. Open / pending work

1. **EF Hunt air/land** — wire `canHitAir` rules into `pve.html` (only MOBA done).
2. **Map redesign** (deferred after the 1.4× scale): a river across the map; boss
   moved to a **corner behind a tree-line you cut through, with a bend before it**;
   regular wild monsters near the bases instead of the boss. (Optionally bump
   `MAPK` to 1.8/2.2 first.)
3. **Kai re-export** with a Run/Walk clip (current asset only has 01_Dash).
4. **Auditor pass** — owner will dial AIR (G), facing, range/melee in audit.html and
   paste the report back; bake results into `model_calibration.js`.
5. **Server backend** — built by the separate CC session per `SERVER_PLAN.md`.

---

## 13. Working conventions

- Validate every JS change in an isolated scratch `.js` (`node --check` + runtime
  assertions) — never on the whole stale-mounted HTML (§3).
- Keep changes small and style-consistent; one coherent slice at a time.
- PvP must stay symmetric; new gold sinks meaningful but not snowbally.
- Launch: run `start_game.bat`, open `http://localhost:8000/` (launcher),
  `…/index.html` (MOBA), `…/pve.html` (EF Hunt), `…/audit.html` (model QA).
