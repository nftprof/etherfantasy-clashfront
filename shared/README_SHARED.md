# EF Shared Engine Layer (`shared/`)

This folder holds the **game-agnostic** pieces that must look & feel **identical**
across every EtherFantasy game mode — the MOBA (`index.html`) and EF Hunt PVE
(`pve.html`) today, and any future mode. Each game keeps its **own** level curve,
item/economy system, monster scaling, map, and win rules — but pulls heroes,
pets, skills, animation, voice, and sound from here so a champion plays the same
everywhere.

## Files

| File | What it is |
|------|-----------|
| `ef_core.js` | The shared engine module. Loads to `window.EF_CORE`. Calibration ref, animation canon + state policy, character voice, SFX/music synth, and the per-element skill KITS + ultimate "supers". |
| `ef_touch.js` | Shared **mobile/touch** control layer (`window.EF_TOUCH`). Auto-detects touch devices (override `?touch=1`/`?touch=0`), renders a left virtual joystick + a host-configured right-side button bank, and enforces landscape (rotate gate + one-tap fullscreen/orientation-lock). Generic UI only: the host page passes all game actions via `EF_TOUCH.init(cfg)` — `cfg.onMove(nx,nz)` fires each frame while the stick is held, `cfg.buttons[]`/`cfg.extra[]` wire taps to game fns, and `EF_TOUCH.aimDir()` returns a normalized cast direction for instant-cast games. Both index.html and pve.html load it after `ef_core.js` and call `init()` at the end of their script. |
| `../model_calibration.js` | Per-model facing/size/material fixes + `keyOf()`. Lives at repo root for now (legacy script paths); `EF_CORE.CAL` re-exports it. Load it **before** `ef_core.js`. |
| `../mon_lineage.json` | The monster/hero roster (shared data: forms, glb paths, element types, type chart). Both games already fetch this. |
| `../pets/*.glb`, `../hero/*.glb` | Shared model assets. `pets/` = monsters/pets; `hero/` = premium hero costumes (Irene). Roster `glb` field may carry a `hero/` prefix. |

## How a game adopts it

```html
<script src="https://.../three.min.js"></script>
<script src="https://.../GLTFLoader.js"></script>
<script src="https://.../SkeletonUtils.js"></script>
<script src="model_calibration.js"></script>     <!-- data: facing/size/opaque -->
<script src="shared/ef_core.js"></script>          <!-- window.EF_CORE -->
```

Then in the model loader and combat code:

```js
// --- model load (per glb) ---
EF_CORE.stripNonBoneTracks(gltf);                  // kill baked root-motion / tip-over
// size + facing from shared calibration:
const key = EF_CORE.CAL.keyOf(fileName);
const h   = baseHeight * (EF_CORE.CAL.SIZE_FIX[key] || 1);
unit.faceOffset = EF_CORE.CAL.FACE_FIX[key] ?? autoFaceOffset;
// material: BLEND->cutout, FORCE_OPAQUE[key] -> alphaTest 0 (see model_calibration.js header)

// --- animation (per glb) ---
unit.clips = {}; gltf.animations.forEach(c => unit.clips[c.name.toLowerCase()] = c);
EF_CORE.canonClips(unit.clips);                    // map studio names -> engine states, prefer moving+short
// each frame:
const state = EF_CORE.animName(unit);              // 'idle'|'walk'|'run'|'melee claw'|'win'|...
// when (re)playing an action, speed long takes to a beat:
const tgt = EF_CORE.ANIM_TARGET[state];
action.setEffectiveTimeScale(tgt && clip.duration > tgt*1.4 ? clip.duration/tgt : 1);

// --- skills (per hero, by element) ---
const P = { fxRing, aoe, dash, castAt, lineShot };  // YOUR game's effect primitives
const kit = EF_CORE.buildKit(monType, P, POWER);    // POWER = this game's damage scalar
//   kit.abs = [Q, W, E, R(super)]  each {n,d,num,cd,mp,prev,size,self,f(hero,pt)}
hero.abCd[3] = EF_CORE.superCd(gameTime);            // shared ultimate cooldown growth

// --- voice + sfx ---
EF_CORE.VOICE.speak(hero.monName, {part:'full', vol:1, rate:0.8}); // super cry, death='last', etc.
const sfx = EF_CORE.makeSfx(audioCtx, sfxGainNode);
sfx.attack(); sfx.cast(); sfx.super(); sfx.coin(); sfx.level(); sfx.death();
```

## The contract: shared vs per-game

**Shared (here — change once, both games get it):**
- Which element casts which Q/W/E + super, ability **names**, cooldowns, mana,
  range/size, and the **base** damage shape (`base + perLvl*level`).
- Animation clip→state mapping, action playback speed, root-motion stripping.
- Character voice behaviour (name-slice TTS, per-name voice identity) and the
  full SFX/music synth bank.
- Model facing/size/material calibration.

**Per-game (each mode owns — do NOT put in `shared/`):**
- **Power scalar** passed to `buildKit(type, P, power)` — this is exactly where
  the games diverge in damage. MOBA can pass 1.0; PVE can pass its `vetMult()`.
- Level/XP curve, respawn, item shop, gear, gold/CT earning, monster scaling,
  map/zones/spawns, netcode, AI, difficulty, win/lose.
- The combat **primitives** object `P` ({fxRing, aoe, dash, castAt, lineShot}) —
  each game implements these against its own scene/damage so impact feels native.

## Migration note (current state, 2026-06-13)

`index.html` and `pve.html` still contain **inline copies** of this logic (KITS,
ARCH, canonClips, voice, sfx) — that's how they shipped before this module
existed. `ef_core.js` is the consolidated source of truth going forward. Migrate
incrementally: replace each inline block with the `EF_CORE.*` equivalent and
delete the local copy, verifying in `audit.html` after each swap. Keep values in
sync until then — if you tweak a kit/voice/anim rule, change it in BOTH the inline
copy you touch AND `ef_core.js`, or finish the migration for that block.

`model_calibration.js` is the one piece already centralized (both games + audit
load it). New per-model fixes go **only** there.

### Adoption progress — pve.html (EF Hunt), 2026-06-13

`pve.html` now `<script src="shared/ef_core.js">`s the module and has adopted, with
graceful local fallback (so the file still runs if the module is absent):
- **Voice** — `EF_CORE.VOICE` is live: the hunter barks a slice of its own name on
  level-up (first syllable, bright), super/ultimate (full name, battle cry), and
  death (last syllable, fading); taming barks the *pet's* name (high pitch). Mute +
  volume are wired through the existing audio slider via `VOICE.setMute/setVol`.
  This was the headline familiarity win — EF Hunt had **no** character voice before.
- **Animation** — `animName()` and `canonClips()` prefer `EF_CORE.*` when present
  (the shared moving-clip + ANIM_TARGET selection), unifying clip choice with the MOBA.

**Not yet migrated in pve (deliberate):**
- **Kits** — pve still uses its own 4-ability kit (Blast / Shock Ring / Dash /
  CATACLYSM) rather than `EF_CORE.buildKit`. Reason: EF Hunt's **unique legendaries**
  (Emberfang hooks Blast, Stormstep hooks Dash) are wired into those specific inline
  ability fns; swapping to the per-element kit needs those hooks refactored onto the
  shared archetypes AND a live combat playtest. Tracked as the next migration step.
- **SFX** — pve keeps its inline bank (it has HUNT-only extras `EF_CORE.makeSfx` lacks:
  per-element cast timbres, portal, hurt-thud). Migrate by extending `makeSfx` first.
