# Castle structure + siege attack rules — ACK REQUEST (owner-directed, 2026-07-21)

**To: EF Moba (Network + Obfuse deploy)** — authoritative-sim rules — **and MOBA BattleEngine RAW**
— client rendering/UX. Please ACK each numbered item in §4 (or flag what your side can't honor) in
`docs/coord/MOBA-CF-COORD.md`. Companion docs: `SIEGE-MECHANICS-SPEC.md` (rules R1–R7 + the
SIEGE-TEST-1 map + T1–T8 test matrix), `CASTLE-RENDER-BRIEF.md` (visual kit).

## §1 What changed this iteration (context)

- Castle parcels now bake a full fortress: curtain-wall ring (walk-wide top, outer-edge merlons),
  gates with an OPEN arch passage, two-part walk-through towers (walk passes THROUGH them), stairs
  to the parapet (parallel-preferred / perpendicular by ring size), earthwork mound + courtyard.
- Free defense towers (`tw*` anchors) relocate OUTWARD off the wall band — the courtyard holds
  only the keep/CC and player builds; baked defaults are field pickets on the approaches.
- **In-battle building is FREE-FORM (locked):** players build CCs/towers anywhere whose footprint
  doesn't overlap existing structures, standing trees, undepleted resource nodes, or blocked tiles
  (ROCK/WATER/CLIFF/OOB). Depleted trees/gold FREE their cells. `buildSpots[]` = prepared-pad perk
  only: cheaper + faster there; free-form = full price + longer build (⚙ multipliers).

## §2 The castle taxonomy — what is destructible (OWNER RULING: defaults are NOT)

| Piece | Anchors | Destructible? | Function |
|---|---|---|---|
| Curtain WALLS (ring) | `castle_wall_*` | **NO — indestructible** | permanent geometry; blocks ground movement + engagement (§3); its top is the walkable parapet (tier 2) |
| Ring/drum TOWERS + KEEP building + mound | `castle_tower_*`, keep geom | **NO — indestructible** | architecture, not HP targets; the walk runs through towers; keep is the CC's housing |
| **GATES** | `castle_gate_*` (HP ~1100+) | **YES — the breach point** | the DOOR: batter it to 0 → passage cells open; the ONLY ground way in |
| CORE / command center (inside the keep) | core anchor | **YES — the objective** | kill target once inside; existing engine rule holds (core invulnerable while its side's towers stand) |
| Player-built CCs/towers (free-form) | runtime | **YES** | full HP lifecycle; a tower-wall is legal fortification — pathless units ATTACK THE BLOCKER (CoC model) |
| Default field-picket towers (`tw*`) | baked | **YES** | normal destructible defense structures |

Consequence: **indestructible walls + destructible gate = the siege has exactly three doors** —
breach the gate, take the wall-top (stairs/towers; crawlers if enabled), or fly over. No tunneling
through curtain walls. The match still always ends: gate HP is finite and the core is the win.

## §3 Attack rules the sim must implement (ACK the exact semantics)

Elevation tiers: **0** ground · **1** mound/ridge-top · **2** wall-walk (parapet). Per tier of
advantage (attacker − target, clamped ±2): ranged **±12% damage, ±10% range** (⚙, tune on the
test map). Melee unaffected by tiers.

**R-IN/OUT — the wall blocks engagement across it.** For any attack whose line crosses an
indestructible WALL: ILLEGAL if both attacker and target are ground-side units on opposite sides.
LEGAL engagements: ground ↔ wall-top (both directions, both sides), wall-top ↔ wall-top, melee vs
the GATE, and anything vs a FLYER (a flyer is always in open LOS).

**R-ELEV-OVER — shooting over a wall requires being STRICTLY ABOVE it.** A ranged unit may arc
fire across a wall ONLY if its elevation tier is strictly greater than the wall-walk tier (2).
Nothing on today's maps reaches tier 3 ⇒ **in practice nobody shoots over the curtain into the
courtyard — not even from the outside ridge.** The ridge (tier 1) engages defenders ON the
wall-walk (shooting uphill, tier penalty applies), never units behind it. This closes the
T7-vs-R1 ambiguity: **T7 is re-scoped to ridge-archer vs WALL-WALK defender** (not courtyard).
If a future map bakes tier-3 high ground overlooking a castle, over-wall fire turns on there by
this same rule — no code change.

**Wall-top exposure:** units on the parapet are attackable from BOTH sides (that's the trade for
their tier-2 advantage) and by every legal ground engagement above.

### §3b How the STAIRS and the wall-walk work (movement semantics)

- **Stairs are the ONLY ground↔parapet transition** (plus tower interiors if the client wants
  ladder-in-tower flavor later — same access-point semantics). Every gate has a flight on each
  side, on the COURTYARD side only — attackers never get free stairs; they take the gate, fly,
  or crawl (R7).
- **Placement (locked size ladder):** walls with a straight stretch ≥ one flight → the flight
  runs PARALLEL, hugging the inner face; smaller rings → PERPENDICULAR into the courtyard (may
  stretch past the ring radius, never past the diameter — treads compress on tiny rings). Top
  tread always lands flush at parapet height.
- **On the stairs:** narrow = SINGLE-FILE (a natural choke — defending the stairhead is a real
  tactic); units mid-flight count as elevation tier 1 (between ground 0 and parapet 2) and are
  exposed (attackable under the normal rules); ⚙ optional climb-speed factor.
- **On the wall-walk:** the parapet is ONE CONTINUOUS walkable ring — it passes THROUGH every
  tower (the two-part towers have open doorways at walk level) and crosses each gate over the
  gatehouse arch (the lintel is a bridge segment; breaching the gate below does NOT cut the
  walk). Width ≈ one unit file (the 4.2u curtain top); merlons are the outer guard rail —
  cosmetic cover flavor only in v1, no cover mechanic yet (⚙ future).

**Flyers (R2):** movement ignores walls/moat; always targetable; may attack down on either side.
**Crawlers (R7, flagged/optional):** traverse WALL cells at ⚙ crawl speed, exposed while climbing.
**Drawbridge (R5):** defender toggle; UP = water gap, DOWN = road; v1 bridge indestructible —
the gate is the breach.

## §4 ACK checklist

**EF Moba (server sim):**
1. Walls/ring-towers/keep = indestructible: rejected as attack targets, permanent blockers.
2. Gate = destructible; at 0 HP its cells flip walkable (and the client is told).
3. R-IN/OUT engagement legality exactly as §3.
4. R-ELEV-OVER: strictly-above-tier rule for over-wall fire; tier deltas ±12%/±10%.
5. Wall-walk pathing: parapet cells walkable only via stairs/tower access points.
6. Free-form build: overlap-only placement check; depleted resource cells flip OPEN; dynamic
   obstacles at 30 Hz; pathless → attack-the-blocker.
7. Pad perk: cheaper+faster on `buildSpots[]`, full price + longer free-form (⚙ hooks).

**MOBA BattleEngine RAW (client):**
8. Render walls/keep with no HP bars/hit feedback (indestructible affordance); gates show damage
   states + breach; drawbridge up/down.
9. Two-part towers (walk-through) + stairs per the kit reference (preview3d @52ddb47).
10. Tier-bonus feedback on hit numbers; illegal-target feedback when clicking a wall.

**Both (stairs/wall-walk movement, §3b):**
11. Stairs = the only ground↔parapet transition; courtyard side only; single-file choke;
    mid-flight units = tier 1, exposed.
12. The parapet is one continuous walkable ring — through towers, over gatehouse arches
    (a breached gate does not cut the walk).
13. Merlons = visual guard rail in v1 (no cover mechanic; ⚙ future option).

Reply per-item in the coord log: **ACK** / **ACK-with-change** (say what) / **CANNOT** (why).
The headless T1–T8 run on SIEGE-TEST-1 (`data/moba-maps/siege-test.json`, `_siegeTest.stations`)
is the acceptance test once implemented.
