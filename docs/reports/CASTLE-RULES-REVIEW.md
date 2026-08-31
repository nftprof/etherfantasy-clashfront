# CASTLE RULES — post-generation review (2026-08-31)

Careful, fully independent re-measurement of **every castle** against the consolidated rulebook
`docs/maps/CASTLE-RULES.md` (GEN_VERSION 27). Nothing was trusted from the CI sweep — every number
below was re-measured by a standalone script (scratchpad, not committed) that loads the artifacts
and measures the geometry directly.

**Population (49 castles, all `meta.genVersion = 27`):**
- 37 live-generated L3 castle parcels: every `castles[]` entry with a `heroParcels[0]` across
  zones EDU / HUB / BUS / ENT / UW2 / UW3, via `loadWorldField → l3Row → worldParcel → generate`
  (`map-service/maps/worldfield.js` + `generate.js`).
- 11 committed estate maps: `data/cf-maps/artifacts/{1101100, 1031491, 1020371, 1071732, 1001178,
  3110087, 1071729, 1071728, 1071738, 1071733, 3071605}.artifact.json`.
- 1 committed `data/moba-maps/siege-test.artifact.json`.

Tiers: 7 PALACE · 18 CASTLE · 24 KEEP.

**Measurement thresholds used** (from the rulebook + the review brief): R-GAP segment-level ≥ 12u
(rulebook number, NOT the CI's 7.5u); R-ST1 ≥ 3.3u (CI uses 3.2); R-ROAD gate ≤ 6u from the
crossing centroid (CI allows 16u); road-gate arch `r ≥ min(13, max(5.5, 0.75 × measured road
width))`; R-GATE-TOWER ≥ 15.5u (16 − 0.5 rounding slack); R-SPACE ≥ 20u; R-PAD ≥ 8.8u wall /
≥ 13.8u structure. Where my stricter reading and the CI's looser one disagree, both results are
reported.

---

## (a) Compliance matrix

Columns in rulebook order. `✓` measured pass · `✗` measured violation · `–` not applicable
(single-ring castle for R-GAP / gate-spacing; no road crossing for R-ROAD).

- **ST2 = ✓†** — the brief's literal "top within ~2u of the ring polyline" fails on **all 49**
  castles; the mode-aware reading (top flush at the walk edge: PERPENDICULAR ≤ 2.8u, PARALLEL
  ≤ 3.55u — the rulebook's own R-TYPES "off 3.45") passes on all 49. See finding V5.
- **GRADE = ✓‡** — R-GRADE sets no hard limit ("tight geometry compresses but stays STEPPED"), so
  no castle can mechanically fail it; the measured stats contradict the rulebook's stated world
  median. See finding V6.
- **PAD = ✗§** — violation against **inner** ring walls only; the outer wall band (what the
  generator enforces) is green on all 49. See finding V1.

| Castle | Tier | FLAT | EN | RING | HGT | KEEP | GAP | GATE | SPACE | DOOR | ROAD | G-TWR | TURRET | WALK | ST1 | ST2 | ST3 | STD | GRADE | STEP | TREE | PAD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDU EDU-CASTLE-WESTGATE<br>(20203670103) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| EDU EDU-KEEP-CLIFFWATCH<br>(30203520121) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| EDU EDU-KEEP-LANTERNHILL<br>(30203510131) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| EDU EDU-CASTLE-SOUTHREACH<br>(20203680154) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| HUB HUB-CASTLE-TIEDU<br>(20716710172) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| HUB HUB-CASTLE-DONGGUAN<br>(20717190260) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| HUB HUB-KEEP-SOUTHGATE<br>(30716650182) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| HUB HUB-KEEP-SOUTHSLOPE<br>(30716190171) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| HUB HUB-KEEP-DRAGONTAIL<br>(30716210150) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| BUS BUS-FORT-TIDEGATE<br>(20011440099) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| BUS BUS-CASTLE-MIDDLEQUAY<br>(20011730078) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| BUS BUS-CASTLE-CAPEMEET<br>(20011170044) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| BUS BUS-CASTLE-EASTREACH<br>(20011500104) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| BUS BUS-KEEP-DELTALIGHT<br>(30009950121) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| BUS BUS-KEEP-GULLSHOAL<br>(30009860125) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| BUS BUS-KEEP-DUNEWATCH<br>(30010350134) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| BUS BUS-KEEP-MARSHGATE<br>(30010650198) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ENT ENT-CASTLE-RIVERGATE<br>(20314880213) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| ENT ENT-CASTLE-FESTGATE<br>(20314850240) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ENT ENT-KEEP-TIDEWATCH<br>(30314530132) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ENT ENT-KEEP-CAMPANILE<br>(30314610147) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ENT ENT-KEEP-PETALPORT<br>(30314590117) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ENT ENT-KEEP-LANTERNSHORE<br>(30314500098) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ENT ENT-KEEP-SUNSTRAND<br>(30314600114) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW2 UW2-CASTLE-MOURNGATE<br>(21010900135) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW2 UW2-CASTLE-DEEPGATE<br>(21010830174) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW2 UW2-CASTLE-PALEWATER<br>(21010920077) | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| UW2 UW2-KEEP-VIGILWATCH<br>(31010750155) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW2 UW2-KEEP-FERRYWATCH<br>(31010670023) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW2 UW2-KEEP-DROWNMEADOW<br>(31010570121) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW2 UW2-KEEP-SUNKENCOURT<br>(31010720149) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW2 UW2-KEEP-PALELANTERN<br>(31010780195) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW3 UW3-PALACE-VAULTPALACE<br>(31100870136) | P | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| UW3 UW3-KEEP-MIRRORS<br>(31100890117) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW3 UW3-KEEP-SILK<br>(31100880181) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW3 UW3-KEEP-HUNGER<br>(31100840037) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| UW3 UW3-KEEP-COIN<br>(31100860055) | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ESTATE 1101100 | P | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| ESTATE 1031491 | P | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| ESTATE 1020371 | P | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| ESTATE 1071732 | P | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| ESTATE 1001178 | P | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| ESTATE 3110087 | P | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ESTATE 1071729 | C | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ESTATE 1071728 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ESTATE 1071738 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✗§ |
| ESTATE 1071733 | C | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| ESTATE 3071605 | K | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |
| siege-test | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓‡ | ✓ | ✓ | ✓ |

(Some CASTLE-tier castles show R-GAP "–": the v19 adaptive R-RING correctly built them ONE ring on
cramped land — ESTATE 1071729, 1071733, 3071605 and all single-ring rows. siege-test additionally
carries the reproducibility caveat of finding V7.)

### Measured global numbers behind the green columns

| Rule | World-wide measurement (49 castles) | Limit |
|---|---|---|
| R-FLAT | moundSteps = 0 and no MOUND tier on 49/49 | 0 |
| R-EN | min anchors/ring = **14** (max 18); worst angular-gap ratio **1.87×** nominal | ≥12 · ≤2.4× |
| R-RING | ring count == `min(tierN, floor((R0−14)/12)+1)` on 49/49 | exact |
| R-HEIGHT | min ring h = **14** (all 24 KEEPs sit exactly on the 14u floor — by design); CASTLE ≥16, PALACE ≥18, inner rings climb | tier floor |
| R-KEEP | worst ratio R0/(0.72·keep.w): KEEP **2.42** (≥1.2), CASTLE **2.15** (≥1.5), PALACE **2.58** (≥2) | tier min |
| R-GATE | outer doors ∈ [min(4,N+1)..5] and each inner ward = max(2, N+1−ri) on 49/49 | ladder |
| R-SPACE | min gate↔gate on any single ring = **20.3u** (siege-test) | ≥20 |
| R-DOOR (width/typing) | `wallRing.gateOpenWidth = 13` on 49/49; every `gates[].door` ∈ {PORTCULLIS, DOUBLE_LEAF}; exactly **one** PORTCULLIS per castle | 13 · typed |
| R-ROAD (centroid) | 118 real road-through-wall crossings across 47 castles; **every one has a gate ≤ 5.78u** from the crossing centroid (world max) | ≤~6 |
| R-PATH | **0** road cells hug the wall line >8u from a door (sampled every 2u on all 49 outer polylines) | 0 |
| R-GATE-TOWER | min gate↔tower over ALL `castle_tower_*` + `tw*` = **16.01u** (EDU-KEEP-LANTERNHILL) | ≥15.5 |
| R-TURRET | 196/196 `castle_tower_*` drums: form DRUM_TURRET, wallWalkThrough, passageW 3.2, archerPorts 3; `wallRing.towers{…, gateClearance:16}` on 49/49 | contract |
| R-WALK | `wallWalk{walkable, surfaceY, walkWidth, merlons.edge:"BOTH"}` on wallRing AND every castleGeom ring, 49/49 | contract |
| R-ST1 | 393 flights: min centerline↔wall clearance (outside the 4.5u top-contact) = **3.32u** | ≥3.3 |
| R-ST2 | top↔polyline: PERPENDICULAR 1.45–**2.77u**, PARALLEL 1.43–**3.51u** (modes land at their design offsets 2.7 / 3.45) | see V5 |
| R-ST3 | 393/393 stair feet inside their ward polygon | 0 outside |
| R-STD | every ring carries ≥1 stair (0 stairless); `siege.stairs === rings[0].stairs` on 49/49 | data |
| R-STEP | 393/393 flights carry full `steps(5–12)/riser/tread/rise/grade/width 3.4/material STONE/render STEPS/walkable/rampAlt{WOOD,40}` | contract |
| R-TREE | **0** TREE/ROCK inside any outer ring (even at depth >0, stricter than the CI's 2.5u tolerance); **0** within 10u of a gate | 0 |
| R-PAD (outer band + structs) | min buildSpot↔OUTER-wall = **11.05u** (≥8.8 ✓); min buildSpot↔castle-structure anchor = **13.95u** (≥13.8 ✓) | 8.8 / 13.8 |

---

## (b) Violations — measured vs rule number

### V1 · R-PAD vs INNER rings — 16 castles (worst offender class)

The generator's pad filter (`generate.js` ≈ line 1956: `distRing` built from
`castleParts.geom.pts`) measures distance to the **outer ring only**. On every multi-ring castle,
baked build pads sit inside the wards **on or inside the inner curtain walls** — down to 0.22u
from the wall centerline, i.e. inside the 4.2u wall body itself. Outer band + structure anchors
are green on all 49 (min 11.05u / 13.95u); this class is invisible to both G and CI.

| Castle | pads <8.8u of an inner ring | min pad↔inner-wall (u) | rule |
|---|---|---|---|
| ESTATE 1020371 (Grand Academy) | 1 of 2 | **0.23** | ≥8.8 |
| HUB HUB-CASTLE-DONGGUAN (20717190260) | 5 of 6 | **0.22** | ≥8.8 |
| ESTATE 1101100 (Bastion of Dominus) | 5 of 6 | 0.72 | ≥8.8 |
| ESTATE 1001178 (Grand Exchange) | 6 of 6 | 1.06 | ≥8.8 |
| EDU EDU-CASTLE-SOUTHREACH (20203680154) | 3 of 7 | 1.22 | ≥8.8 |
| ESTATE 1071738 (Xichuan Round City) | 1 of 2 | 1.28 | ≥8.8 |
| BUS BUS-CASTLE-CAPEMEET (20011170044) | 5 of 6 | 1.32 | ≥8.8 |
| ENT ENT-CASTLE-RIVERGATE (20314880213) | 6 of 7 | 1.37 | ≥8.8 |
| BUS BUS-CASTLE-EASTREACH (20011500104) | 1 of 4 | 2.00 | ≥8.8 |
| HUB HUB-CASTLE-TIEDU (20716710172) | 6 of 7 | 2.10 | ≥8.8 |
| BUS BUS-CASTLE-MIDDLEQUAY (20011730078) | 1 of 7 | 2.31 | ≥8.8 |
| ESTATE 1071732 (Vermilion Palace) | **7 of 7** | 2.53 | ≥8.8 |
| UW3 UW3-PALACE-VAULTPALACE (31100870136) | 3 of 7 | 3.96 | ≥8.8 |
| ESTATE 1031491 (Palace of Masks) | 2 of 7 | 4.74 | ≥8.8 |
| BUS BUS-FORT-TIDEGATE (20011440099) | 1 of 7 | 5.25 | ≥8.8 |
| UW2 UW2-CASTLE-PALEWATER (21010920077) | 1 of 7 | 8.28 | ≥8.8 |

### V2 · R-ROAD arch width — 18 road gates on 13 castles undersized vs the post-bake road

The centroid half of R-ROAD is 100% green (every crossing's gate ≤5.78u). But at 18 of the 118
crossings the gate's arch half-width `r` is below `min(13, max(5.5, 0.75 × measured road width))`
(width = ROAD-cell extent along the wall tangent at the crossing, post-bake). Causes visible in
code: `gateR` is sized from the road width **at gate-planning time** (`generate.js:900`) but the
v21/v24 re-carve widens/reroutes roads afterwards; repair-road doors get a **fixed r = 5.5**
regardless of width (`generate.js:1803`).

| Castle | gate | r (u) | road w (u) | required r | short by |
|---|---|---|---|---|---|
| BUS BUS-KEEP-DUNEWATCH (30010350134) | castle_gate_0 | 5.5 | 41.5* | 13.0 | **7.5** |
| UW2 UW2-KEEP-PALELANTERN (31010780195) | castle_gate_2 | 5.5 | 22.5* | 13.0 | **7.5** |
| BUS BUS-KEEP-MARSHGATE (30010650198) | castle_gate_1 | 5.5 | 11.5 | 8.6 | 3.1 |
| UW2 UW2-KEEP-PALELANTERN (31010780195) | castle_gate_1 | 5.5 | 10.5 | 7.9 | 2.4 |
| UW3 UW3-PALACE-VAULTPALACE (31100870136) | castle_gate_0 | 5.5 | 10.5 | 7.9 | 2.4 |
| UW3 UW3-KEEP-MIRRORS (31100890117) | castle_gate_1 | 5.5 | 10.5 | 7.9 | 2.4 |
| BUS BUS-KEEP-MARSHGATE (30010650198) | castle_gate_2 | 8.3 | 13.0 | 9.8 | 1.4 |
| ESTATE 3110087 (Vault-Palace) | castle_gate_0 | 5.5 | 9.0 | 6.8 | 1.3 |
| HUB HUB-KEEP-SOUTHGATE (30716650182) | castle_gate_3 | 6.0 | 9.5 | 7.1 | 1.1 |
| UW3 UW3-KEEP-HUNGER (31100840037) | castle_gate_1 | 5.5 | 8.5 | 6.4 | 0.9 |
| ESTATE 1071729 (Jinjiang Citadel) | castle_gate_0 | 5.5 | 8.5 | 6.4 | 0.9 |
| ESTATE 3110087 (Vault-Palace) | castle_gate_2 | 5.5 | 8.0 | 6.0 | 0.5 |
| siege-test | castle_gate_1 | 5.5 | 8.0 | 6.0 | 0.5 |
| BUS BUS-KEEP-GULLSHOAL (30009860125) | castle_gate_1 | 6.0 | 8.5 | 6.4 | 0.4 |
| ESTATE 1020371 (Grand Academy) | castle_gate_1 | 6.0 | 8.5 | 6.4 | 0.4 |
| ESTATE 1001178 (Grand Exchange) | castle_gate_1 | 7.5 | 10.5 | 7.9 | 0.4 |
| ESTATE 1071729 (Jinjiang Citadel) | castle_gate_3 | 7.5 | 10.5 | 7.9 | 0.4 |
| UW3 UW3-KEEP-HUNGER (31100840037) | castle_gate_0 | 5.5 | 7.5 | 5.6 | 0.1 |

\* the two 22.5u/41.5u widths are oblique/along-wall road junctions — the along-wall extent
overstates the road's cross-section there, but even a conservative reading leaves the 5.5u arch
under the 0.75× requirement.

### V3 · R-GAP < 12u — 6 castles (rulebook number; ALL pass the CI's 7.5u floor)

Segment-level min distance from inner-ring anchors + midpoints to the next outer polyline. The
rulebook says "**≥12u wall-centerline gap absolute** … segment-level"; the CI only asserts 7.5u.

| Castle | min gap (u) | vs 12u | note |
|---|---|---|---|
| ESTATE 1001178 (Grand Exchange) | **9.54** | −2.46 | keep-foot dent (rIn 14.0u); excluding dents: 12.01 ✓ |
| ESTATE 1071732 (Vermilion Palace) | **10.90** | −1.10 | keep-foot dent (rIn 13.9u); excluding dents: 11.99 (−0.01) |
| UW3 UW3-PALACE-VAULTPALACE (31100870136) | **11.50** | −0.50 | rings 1–2, mid-ward (rIn 30.8u) — not a dent |
| ESTATE 1101100 (Bastion of Dominus) | **11.54** | −0.46 | rings 1–2 (rIn 19.4u) — not a dent |
| ESTATE 1020371 (Grand Academy) | **11.62** | −0.38 | rings 1–2 (rIn 22.8u) — not a dent |
| BUS BUS-CASTLE-CAPEMEET (20011170044) | **11.71** | −0.29 | rings 0–1 (rIn 19.6u) — not a dent |

### V4 · R-DOOR — PORTCULLIS not on the road gate, 3 castles

Rulebook: "main/road gate = PORTCULLIS". In `generate.js` (≈2052) `mainId` is picked as the gate
nearest the **drawbridge** when one exists, else `castleGates[0]` — road gates are never consulted.
On 3 castles with a road gate but no drawbridge, the PORTCULLIS landed on the default first gate
while a different gate carries the road:

| Castle | PORTCULLIS on | road gate |
|---|---|---|
| EDU EDU-CASTLE-WESTGATE (20203670103) | castle_gate_0 | castle_gate_2 |
| EDU EDU-CASTLE-SOUTHREACH (20203680154) | castle_gate_0 | castle_gate_1 |
| UW2 UW2-CASTLE-PALEWATER (21010920077) | castle_gate_0 | castle_gate_1 |

(Width 13 and door typing are green on all 49; every castle has exactly one PORTCULLIS.)

### V5 · R-ST2 as briefed ("top within ~2u") — fails 49/49; the data model is self-consistent

Measured stair-top ↔ ring-polyline distance over all 393 flights: PERPENDICULAR tops cluster at
**2.69–2.77u**, PARALLEL at **3.44–3.51u** — exactly the R-TYPES design offsets (PARALLEL "off
3.45"; wall t/2 = 2.1 + landing inset). No flight exceeds 3.51u, every top lands on its walk
(the CI's 6.5u tower-drum guard also passes 49/49). Verdict: **not a geometry defect — a rulebook
wording defect**. "~2u" (and any reading of "flush ON the walk" as ≤ t/2) matches no castle the
generator has ever produced; the numbers 2.7/3.45 should be written into R-ST2.

### V6 · R-GRADE — the rulebook's "Median across the world: 39.9°" is contradicted by measurement

R-GRADE sets no hard ceiling (compression is allowed), so no castle "fails" — but the stated world
median is wrong at GEN 27 over this population:

- All 393 flights: min **39.7°** · p25 39.9° · **median 47.5°** · p75 53.5° · max **76.1°**
  (ESTATE 3110087, Vault-Palace of Luxuria — all 10 of its flights are 57.6–76.1°).
- **218/393 flights (55.5%) exceed 40.5°** ⇒ for those, the `rampAlt{WOOD, ≤40°}` substitution is
  unusable without extending the run.
- Per ring: ring 0 median 42.3° (135/268 over) · ring 1 median 48.2° (61/103 over) · ring 2
  median **52.8°** with **22/22 (100%)** over 40.5°.
- 10 castles have **100%** of their flights >40.5° (ESTATE 3110087 median 66.3°; ESTATE 1071733
  median 62.3°; ESTATE 1071729 median 64.1°; HUB-DONGGUAN median 57.7°; …).

The v27 "walkable grade" objective is achieved on roomy outer rings only; inner wards compress
almost every flight past it. Either the doc claim should be re-measured/rewritten, or the
R-SWITCH switchback (designed, not built) is the actual fix for rings 1–2.

### V7 · siege-test is not clean-rebuild reproducible (committed-vs-live divergence)

Rebuilding `make_siege_test.mjs`'s artifact from a **clean** registry (same inputs, GEN 27) gives a
**different** file: fresh designVersion **22** vs committed **115**, differing ring geometry,
structures (20 vs 18), obstacles, lanes, buildSpots. The tool's registry dir
`.siege-test-registry/` persists in the repo, and `regenerate()` history feeds the seed — so the
committed bytes depend on accumulated regeneration history, violating the §VIII.3 "deterministic,
byte-stable" re-bake contract in spirit (byte-stable only WITH the checked-in registry state). The
committed artifact itself is genVersion 27 and passes every measured rule at the same rate as the
live population. By contrast, **all 11 committed estates are byte-identical** to a fresh
regeneration (verified: `worldParcel(row,{investLevel:3,biome}) → generate`, exact match on all 11).

---

## (c) Near-miss table (measured within 10% of a limit)

| Rule | Castle | measured | limit | margin |
|---|---|---|---|---|
| R-GAP | ESTATE 1031491 (Palace of Masks) | 12.01u | ≥12 | **+0.1%** |
| R-GAP | BUS-CASTLE-MIDDLEQUAY | 12.96u | ≥12 | +8.0% |
| R-GAP | HUB-CASTLE-DONGGUAN | 13.01u | ≥12 | +8.4% |
| R-ROAD centroid | BUS-KEEP-GULLSHOAL | 5.78u | ≤6 | +3.7% |
| R-SPACE | siege-test | 20.3u | ≥20 | +1.5% |
| R-SPACE | ENT-CASTLE-RIVERGATE | 20.6u | ≥20 | +3.0% |
| R-GATE-TOWER | EDU-KEEP-LANTERNHILL | 16.01u | ≥15.5 | +3.3% |
| R-GATE-TOWER | UW3-KEEP-SILK 16.24 · UW2-PALEWATER 16.31 · EST 1031491 16.47 · siege-test 16.48 · UW3-VAULTPALACE 16.49 · BUS-MARSHGATE 16.51 · EST 1071738 16.51 · EST 1071728 16.75 · EST 1001178 16.87 · BUS-DELTALIGHT 16.94 | 16.0–16.9u | ≥15.5 | +5–9% |
| R-ST1 | ENT-KEEP-CAMPANILE and ESTATE 1071729 | 3.32u | ≥3.3 | **+0.6%** |
| R-ST1 | 32 further castles | 3.39–3.47u | ≥3.3 | +3–5% |
| R-PAD structs | world min (several) | 13.95u | ≥13.8 | +1.1% |
| R-HEIGHT | all 24 KEEPs | h = 14u exactly | ≥14 | 0% (by design: tier floor = tier wallH) |

R-ST1 note: PARALLEL flights are *designed* at offset 3.45u from the wall centerline, so the whole
population lives 3–5% above the 3.3u limit by construction — the limit and the design have ~0.15u
of real slack between them. Any future widening of walls (t > 4.5) or stairs would break R-ST1
world-wide; treat these two constants as coupled.

---

## (d) Prioritized fix list

1. **[P1 — visual overlap, 16 castles] R-PAD inner rings**: extend the pad filter's `distRing`
   (`map-service/maps/generate.js` ≈1956) to test **every** ring polyline from `concentricRings`,
   not just `castleParts.geom.pts`; re-bake the 6 affected committed estates. Pads at 0.22–2.5u
   are physically inside/against inner curtain walls on every big castle including all five
   flagship palaces. Add the inner-ring case to `castle_geometry.test.js`.
2. **[P2 — playability at doors, 13 castles] R-ROAD arch widths**: re-measure road width AFTER the
   v21/v24 re-carve and resize `gateR` then (or clamp the re-carved road to the arch); size
   repair-road doors (`generate.js:1803`, fixed r=5.5) by the same 0.75× law. Worst: DUNEWATCH +
   PALELANTERN (arch 5.5 vs required 13).
3. **[P3 — rule/CI mismatch, 6 castles] R-GAP 12u**: either raise the CI segment floor from 7.5u
   to the rulebook's 12u (with the keep-foot-dent exemption made explicit in the rulebook) and fix
   the 4 genuine mid-ward cases (max short 0.5u — a small nudge in `concentricRings` wardMin), or
   amend the rulebook to state the enforced number. Today the doc promises 12, the code guarantees ~7.5.
4. **[P4 — 3 castles] R-DOOR portcullis**: in `generate.js` main-gate selection (≈2052), fall back
   to the nearest **road gate** (`ring[i].roadGate` / `castle_gate_*r`) before `castleGates[0]`
   when no drawbridge exists.
5. **[P5 — doc truth] Rulebook text fixes**: R-ST2 → state the real top offsets (PERP ≈2.7u,
   PARA ≈3.45u, never >3.6u); R-GRADE → re-state the honest world median (47.5°, 55% of flights
   >40.5°) or prioritize R-SWITCH for rings 1–2; R-GAP → state the enforcement number (see P3).
6. **[P6 — process] siege-test reproducibility**: commit to one story — either check the
   registry-state dependence into the re-bake contract explicitly, or make `make_siege_test.mjs`
   rebuild from a clean registry (then re-bake once so committed bytes match a clean build).

## (e) Verdict

Of the 21 mechanically-checkable rules, **17 are 100% green across all 49 castles with real
margin**: R-FLAT, R-EN, R-RING, R-HEIGHT, R-KEEP, R-GATE, R-SPACE, R-DOOR width+typing, the
R-ROAD gate-at-centroid half (118/118 crossings ≤5.78u), R-PATH, R-GATE-TOWER (min 16.01u),
R-TURRET (196/196 drums), R-WALK, R-ST1, R-ST3, R-STD, R-STEP, and R-TREE (a perfect zero —
stricter than CI). Violations concentrate in four clusters: build pads against **inner** ring
walls (16 castles — the largest and only player-visible-overlap class, an enforcement blind spot,
not a regression), 18 undersized road-gate arches (13 castles, mostly 0.1–2.4u short, two capped
cases 7.5u short), six R-GAP shortfalls against the rulebook's 12u (all ≥9.5u, all pass the CI's
7.5u — a doc-vs-CI number mismatch as much as a geometry issue), and three misplaced portcullises.
Two rulebook claims are contradicted by measurement and need text fixes rather than geometry
fixes: R-ST2's "top flush on the walk" (~2u) versus the real 2.7/3.45u design offsets, and
R-GRADE's "median 39.9°" versus the measured 47.5° (55% of flights exceed 40.5°). On
committed-vs-live: **all 11 committed estate artifacts are byte-identical to fresh GEN-27
regeneration** — no forgotten re-bake anywhere; only `siege-test` diverges from a clean rebuild
(designVersion 115 vs 22) because its bake depends on the checked-in `.siege-test-registry`
history — reproducible only with that state, a process caveat rather than a stale map. No castle
anywhere in the world ships a mound, a stairless ring, a blocked walk, an untyped door, a tree in
the ward, or a road into blank masonry.
