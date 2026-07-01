# Model audit — clip health (pre-visual review)

> Generated 2026-06-23 by scanning every GLB's animation data. "Static / no clips"
> = the export has **zero animation channels**, so it will stand in a T-pose in-game
> and in the auditor. Those need a **re-export with animations** before use.
> Open the visual auditor at **http://localhost:8000/audit.html** to dial facing/size.

## Kai run — CONFIRMED FIXED
`hero/Kai_Set_Default.glb` = 43 clips incl. `01_Run`. Engine `run` state resolves to
`01_run` (not Dash). If still sliding in-game → browser cache; hard-refresh.

## Heroes (hero/) — all good ✓
Irene ×7 (Balance/Destroy/Fatal/Quick Mythic + Token 1/2/3) · Kai · Leah — all fully animated.

## Bosses (boss/) — 9 of 10 good
✓ Usable: Centaur_Warrior_Fire, Centaur_Warrior_Water, Raid_LeeKoon, Sunwon_Magician_Fire,
World_1, World_2, World_3, World_4, Zouwan_Warrior_Fire.
⚠ **Boss_Elemental — 0 clips (static).** Needs a re-export with animations.

## Mons (mons/) — only 2 fully usable
✓ Usable: **Mon_Goblin, Mon_Goblin_Gold** (7 clips each).
⚠ Partial (missing attack/die): Mon_Gnoll_01_Claw.
⚠ Static / barely-animated — **re-export needed**: Mon_Elemental_Magic (0), Mon_Golem (0),
Mon_Skell_Jodan (0), Mon_Skell_Magic (0), Mon_Skell_Robin (0), Mon_Elemental_Knight (2),
Mon_Skell_Base (2), Mon_Skell_Bluto (1), Mon_Skell_Kai (1).

## Masters (masters/) — ~17 usable, 13 static, 6 minimal
✓ Fully animated: Agena, Bellbird, Death_Jinook, Gwen, Joel, Joostar, Karen, Lucy, Maple, Purin.
◑ Good but **no death clip** (fine to use, just won't play a death anim): Baron, Blis, Cor,
Hongpa, Kuman, Maenak, Pavel.
⚠ **Static — 0 clips, re-export needed:** Amy, Camila, Dochi, Gato, Iskall, Jake, Jiyeon, Lu,
Mara, MrBen, Parma, Ruber, Shaiya.
⚠ Minimal (1–5 clips, missing run/idle/die): Chad, ChenChen, Choco, Doto, Kiki, Trisha.

## What to do
1. **Use now:** all heroes, the 9 animated bosses, Mon_Goblin/Gold, and the ~17 animated masters.
2. **Send back for re-export (need animation clips):** Boss_Elemental, the skeleton/elemental
   mons, and the 13 static masters. They load fine but won't move.
3. **In the auditor:** every model above is listed (tagged `[HERO]/[BOSS]/[MASTER]/[MON]`).
   Dial facing (R / ←→), size (+/−), range/melee (T), air/land (G); paste the report back to bake
   into `model_calibration.js`.
