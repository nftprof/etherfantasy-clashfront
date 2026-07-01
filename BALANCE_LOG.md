# EF MOBA / EF Hunt — Balance & QA Log

Automated static audit by the EtherFantasy balance-and-QA bot. Read-only: no game files are edited.
Areas each run: MAP exploits · CHARACTER balance · AI/NPC difficulty · DURATION/QoL · LOADING/PERF.

---

## 2026-06-14 15:48 — balance check
- MAP: ⚠ HIGH: border is not sealed at the corners. `clampMap` allows units out to ±115, but the ridge walls only cover the mid-sections (x=±86 over z∈[-56,40]; z=±86 over x∈[-56,40]) plus axis corridor stubs. The four corners — exactly where the cores sit (±82,±82) — are wide open, leaving a ~29-unit unsealed ring around the whole map. A hero (esp. with dash/blink) can run the perimeter to the enemy corner and hit the core (2400 hp) without passing a single tower; the fountain laser (r10 around ±94) doesn't reach the core (~17 away). Classic backdoor / lane-skip.
- BALANCE: ok. Kits internally consistent and no peer exceeds ~2×: nova 75+14/lvl (cd6), line 65+11/lvl (cd6), ring 38+8/lvl +2.5s slow (cd10), all supers cd110. index.html inline KITS/ARCH/superCd values match shared/ef_core.js (no drift). Shop gold-per-stat even (Long Sword 12 atk/300g ≈ War Axe line; Tower Plate 420hp/750g). Boss legendaries strong but gated behind 2400-hp bosses (🔥 Inferno Edge +40 atk/+20% as; 💠 Aegis +520 hp/15% DR). Hero base 660 hp / 46 dmg / .9 as.
- AI: ok. Enemy hero AI has retreat hysteresis (flee <30% hp, re-engage >92%), potion + Flash escape, pet heal, periodic boss-zone contesting, and casts Q/W + super when in range. Not passive, not oppressive. Creep/wild/boss + PVE diffMult (1.38^(diff-1) · time · tier) curves look reasonable; elite Colossal tops at ~4.3× base hp.
- DURATION/QoL: ok. MOBA: waves +8%/min (cap +120%), overtime at 15:00 (+35% structure dmg), respawns lengthen with game age, anti-camp fountain laser — pacing fits the 10–20 min band. EF Hunt: final boss unseals ~238 min (~4 h), CT at 1h/2.5h/clear. Note: the recurring "30-min" event is implemented as the Blood Moon swarm (every 30 game-min), not a discrete mini-boss — fine, just naming.
- LOADING: ok, minor wins available. Models lazy-load per active slot via autoLoad (not all 129 glbs); mon_lineage.json only 56K; no large inline base64. Suggestions: (1) add `defer` to the four render-blocking CDN <script> tags (three r128, GLTFLoader, SkeletonUtils, PeerJS); (2) load PeerJS only when entering multiplayer — it's fetched on every first load even for solo play.
- ACTION ITEMS:
  - ⚠ Seal the map corners: extend the four border ridges to the clamp edge (or tighten `clampMap` to ~±90 outside the fountain pads) so heroes can't perimeter-run to the enemy core/base past all towers.
  - Defer/async the CDN script tags; gate PeerJS load behind multiplayer entry.
  - (baseline run — no prior entry to diff against; treat the above as the reference state.)

## 2026-06-14 15:54 — balance check
- MAP: ⚠ HIGH: corner exploit still open (no regression, but unfixed). Ridges (index.html L469–470) still cover only mid-sections; `clampMap` (L1061) still ±115, so the ~29-unit corner ring around each core (±82,±82) remains walkable past all lane towers. Note: cores do carry an innate cannon (mkCore L1140: defDmg 35 / defRange 20), which contests a backdooring hero — partial mitigation, but a tanky/lifesteal hero can still out-trade the 2400-hp core. Recommend the ridge/clamp fix from baseline.
- BALANCE: ok. No drift — index.html unchanged since last run; KIT/super values still match shared/ef_core.js. No new outliers.
- AI: ok. Hero AI (retreat hysteresis, potion+Flash, pet heal, boss contest) and PVE diffMult curve unchanged.
- DURATION/QoL: ok. MOBA wave growth/15:00 overtime/respawn scaling and EF Hunt 4-h arc + 30-min Blood Moon unchanged; pacing in band.
- LOADING: ok. Same minor wins outstanding: defer/async the 4 CDN script tags; gate PeerJS behind multiplayer entry.
- ACTION ITEMS:
  - ⚠ Still open: seal map corners (extend border ridges to clamp edge OR tighten clampMap to ~±90 outside fountain pads).
  - Still open: defer/async CDN scripts; lazy-load PeerJS.
  - No new issues this run — all game files unchanged vs 15:48 baseline.

## 2026-06-14 16:04 — balance check
- MAP: ⚠ HIGH: corner exploit still open (no regression). index.html unchanged (mtime 06-13 01:20) — ridges still cover only mid-sections, clampMap still ±115, so the ~29-unit corner ring past the cores (±82,±82) stays walkable around all lane towers. Core cannon (defDmg 35/range 20) only partially contests. Fix from baseline still recommended.
- BALANCE: ok. No drift — KIT/super values still match shared/ef_core.js; no new outliers.
- AI: ok. Hero AI + PVE diffMult curves unchanged.
- DURATION/QoL: ok. MOBA wave growth/15:00 overtime/respawn + EF Hunt 4-h arc/30-min Blood Moon unchanged; pacing in band.
- LOADING: ok. Same minor wins outstanding: defer/async the 4 CDN script tags; gate PeerJS behind multiplayer entry.
- ACTION ITEMS:
  - ⚠ Still open: seal map corners (extend ridges to clamp edge OR tighten clampMap to ~±90 outside fountain pads).
  - Still open: defer/async CDN scripts; lazy-load PeerJS.
  - No new issues — all game files unchanged vs 15:48 baseline (latest mtime 06-13 17:12).
