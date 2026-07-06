# Map-Generator LLM Curriculum — how the LLM designs playable, novel maps (and is genuinely challenged)

> **Companion to** `MAP-MACRO-TERRAIN-AND-POSITION-CONSTRAINTS.md` (the world envelope the LLM designs
> inside) and `docs/maps/BATTLE-MAP-TEMPLATE-LIBRARY.md` + `CASTLE-TEMPLATE-LIBRARY.md` (the 48
> archetypes = the rubric + calibration set).
> **For:** the map-maker session (`map-service/maps/*`). Author: Clash Front Overworld design, 2026-07-06.

## 0. The thesis

Fill-in-a-template is **too simple** — it's retrieval + palette-picking, and it yields homogeneous
maps. Pure freeform is unsafe and unmeasurable. The right shape is a **scored
generate→validate→simulate→critique→repair loop** where:

- **Real-world cases are the BRIEFS** (an inexhaustible, non-repeating problem stream — the hundreds of
  battles/forts in the backend corpus + the position-constrained per-parcel envelope from the
  constraints brief).
- **The 48 templates are the RUBRIC + few-shot exemplars** (labeled known-good answers to calibrate
  and score against) — **NOT** the deliverable.
- **The LLM is a tactical translator** whose output is only `PARAM_SPACE` values + the feature DSL —
  **never raw geometry**. The deterministic generator bakes geometry; `clampParams` + the 5-invariant
  validator + `simulate.js` gate it. This is what lets the task be *hard and creative* while staying
  *safe*: an illegal or unbalanced map cannot ship.

The LLM's job each iteration: **climb a multi-term fitness function without failing the hard gate.**

---

## 1. What the LLM emits (the safe, still-hard output space)

Only parameters — the trust boundary is `clampParams` (`map-service/maps/schema.js`):
- **`PARAM_SPACE`**: `archetype, palette, landmark, laneCount 1–3, density, waterLevel, resourceNodes,
  resourceRichness, mobCamps, towers, barriers, roughness, mirrorFair`.
- **Feature DSL** (`FEATURE_SPECS`, normalized −1..1, ≤24 ops): `forestPatch, rockPatch, waterPool,
  clearing, riverBand{axis,at,width,fords}, ridge{…,passes}, road, landmarkAt, resourceAt, mobCampAt,
  towerAt` — plus the NEW primitives the template libraries call for: **`wall()`** (linked segments +
  parametric GATE gaps + TOWER anchors), **`bentApproach()`** (killzone routing), **`carve()`**
  (negative-space caverns/urban), a **HAZARD** terrain code (mud/thin-ice/lava — slow, not blocking).

The param→outcome mapping is **non-obvious** (more `density` helps a defender and can strangle an
attacker's lane; a river both blocks and funnels; a `wall` gap placement decides the whole siege), so
choosing params well is a real reasoning task — not a form to fill.

---

## 2. The LLM's goals per iteration (the fitness function)

"Legal" is table stakes; quality is the score. Split hard gate vs soft score:

### 2a. Hard gate (pass/fail — auto-rejected before scoring)
- The 5 playability invariants (spawn corridors, lanes pathable, nodes on walkable ground, base
  clear-radius, deterministic) — `map-service/maps/validate.js` + the CF validator.
- The **envelope** (constraints brief §6): bounds unchanged; spawns only on `land`/`river`/`pass`
  edges (never `sea`/`mapVoid`); a `through` river stays continuous + walkable/forded; tier/biome honored.

### 2b. Soft score (what the LLM optimizes — weighted sum, target ≥ T)
| Term | Metric (from `simulate.js` + a critic) | Weight |
|---|---|---|
| **Balance** | equal-army sim win-rate vs the *intended* target (50/50 PvP, or the deliberate attacker/defender skew a siege wants); score = 1 − \|winrate − target\| | ⭐⭐⭐ |
| **Tactical interest** | chokepoint count & severity, path diversity (≥2 meaningful routes), high-ground value, cover ratio, engagement-distance variety; penalize BOTH "empty field" and "unwinnable maze" | ⭐⭐⭐ |
| **Fidelity** | critic-LLM score: does the map reproduce the *tactical essence* of its brief (the defile forces frontage; the envelopment plain rewards flanking)? | ⭐⭐ |
| **Novelty** | distance from existing maps in param/feature/topology space — so 292k parcels don't collapse into 5 shapes | ⭐⭐ |
| **Readability** | legible at command-view scale; base areas clear; lanes findable | ⭐ |

The novelty term is the **difficulty crank**: "capture Cannae's double-envelopment, in a *swamp*
biome, tier 3, on a coastal parcel with a map-void west edge — and don't look like the other 40 open
maps." The constraints envelope guarantees each parcel is a *different* puzzle, so novelty is
achievable, not arbitrary.

---

## 3. The iteration loop (how a working variation emerges)

```
brief = real case (or abstract design goal) + the parcel's HARD envelope + "be novel"
  → LLM emits params + feature-DSL
  → generator bakes geometry (deterministic)
  → validator + envelope check ── FAIL → return the repair log / violation → LLM revises
  → simulate: balance win-rate + interest metrics + novelty distance
  → critic-LLM: fidelity + readability
  → score < T ?  → hand back CONCRETE METRICS (not vibes) → LLM revises
  → score ≥ T or N rounds reached → save the best-scoring version (bump designVersion)
```

**Feedback must be concrete metrics**, e.g.:
> `attacker win-rate 71% (target 50) · single dominant lane, path-diversity 0.2 · choke-severity 0.9
> (too tight) · novelty 0.85 (good) · fidelity 0.6 ("captures the defile but the goat-path shortcut
> is missing")`

Now the LLM has something to *reason* about; iteration is real optimization, not thrashing. Cap at N
rounds (⚙ ~4); keep the best if none hits T (the validator still guarantees it's *playable*).

---

## 4. The difficulty ladder (so it's never too simple — and it's your eval)

Grade the model by how far up this ladder it stays above the score threshold. This doubles as the
eval harness for the generator.

1. **Calibrate** — case **with** its template exemplar shown → LLM reproduces known-good params. Cheap
   to auto-grade against the 48 labels. (Teaches the param↔shape mapping.)
2. **Generalize** — case **without** the exemplar → LLM infers params from the tactical description
   alone.
3. **Invent** — abstract brief, no real case ("defender-favored 3-lane forest siege, tier 4, novel") →
   LLM designs from principles.
4. **Hard mode** — the genuinely hard ones, and the DEFAULT for real parcels:
   - the full **position envelope** (constraints brief §6): fixed pentagon bounds, a through-river,
     a sea edge + a map-void edge, highland elevation — all at once;
   - **asymmetric objectives** + **multi-mode** maps;
   - **estate castle components**: `wall()`/`bentApproach()`, ring→component decomposition, HAZARD
     terrain, the keep as the final component.
   These force tactical reasoning, not obstacle-scattering. A real coastal-highland-river frontier
   parcel is rung 4 by construction — which is exactly why the world envelope makes the everyday task
   hard enough to be interesting.

---

## 5. Using the corpus + the 48 templates

- **Corpus (100s of real cases) → brief stream.** Each case = a design problem (tactical concept +
  intended skew + biome/tier from where it lands). Never the same problem twice.
- **48 templates → labeled calibration set + few-shot exemplars + novelty reference.** Show them in
  rung 1; withhold in rung 2+; always use them as the novelty-distance baseline so new maps must
  differ from the known archetypes, not just from each other.
- **New archetypes** the templates flagged (14 battlefield + 20 castle, see the library appendices)
  expand the generator's vocabulary from 7 → ~41 named archetypes; the LLM picks among them or blends.

---

## 6. Build order (smallest first, each independently useful)

1. **Soft scoring + metrics** on top of `simulate.js` — the balance win-rate + interest metrics +
   novelty distance. *This is the whole game;* the validator + simulate skeleton already exist.
2. **The repair loop** — feed metrics back to the LLM (`llm.js`), N-round cap, keep-best.
3. **The envelope intake** — `generate()` + the brief consume the constraints-brief §6 envelope; hard
   violations auto-reject.
4. **The curriculum harness** — the 4-rung ladder as an eval (auto-grade rung 1 vs the 48 labels;
   track score-by-rung as the generator's quality metric).
5. **New primitives** — `wall()` first (unlocks ~15 castles), then `bentApproach()`, `carve()`, HAZARD.

Net: this turns "we have templates" into **"we have an engine that invents playable, balanced, novel
map variations on demand — and gets measurably better."**
