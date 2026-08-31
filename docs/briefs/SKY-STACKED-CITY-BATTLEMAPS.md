# SKY BATTLE MAPS — THE STACKED CITY (three layers of land) · planning brief 2026-08-31

**Owner directives (verbatim intent):** "Same rigor as the others or even MORE unique. Most of
these floating islands you can fly — there is probably NO river… but TUNNELS. The 3 layers
(air/land/sea) can probably change: 3 layers of THE CITY — you can travel by land ON EACH layer…
like the 5th Element where everything flies in 3D traffic — but not exactly 3D, just **3 layers
of land**. For the battle maps." (Owner is explicitly unsure how it changes gameplay and wants
the design pushed.)

## 1. The tier remap — one doctrine, re-based per world tier

The three-layer doctrine (NAVAL-AIRSHIP-THREE-LAYER-MAPS.md) doesn't disappear in the sky — its
**bottom layer changes meaning**:

| | bottom | middle | top | the "ocean" |
|---|---|---|---|---|
| **Surface/UW** | DEEP water (ships) | land + shallow | air (airships must land) | the sea |
| **SKY zones** | **DECK 0 — the under-city** (works, reactors, roots) | **DECK 1 — the mid city** | **DECK 2 — the crown** (+ air above) | **THE VOID** below the isle — nothing sails it; falling = death (the airship-over-land rule, generalized) |

No rivers, no sea layer in the sky: water on sky maps is decorative only (garden pools, frozen
channels — never DEEP/sailable; the naval grades simply don't occur). What connects the layers
is not a beach but a **TUNNEL / RAMP / LIFT** — the vertical city's gates.

## 2. Phase V1 — TERRACED decks (ships now, zero engine change)

"Not exactly 3D, just 3 layers of land" has a faithful flat-engine reading: the three decks as
**three strong terraced height bands** on the ONE walk plane — no overlap, pure elevation, cliffs
between bands, and the band transitions are the tunnels/ramps (carved gate-choke corridors
through the terrace cliff, exactly like castle gates through walls).

- The HS field generators (being built now) author **exactly three dominant contour bands** per
  city (HS1 garden terraces / HS2 works→city→crown / HS3 pilgrim base→white terraces→summit), so
  every parcel battle map windowed from the field inherits the 3-level read.
- Existing machinery carries all of it: ridges → `siege.elevationTiers` (the strictly-above-tier
  over-wall rule already works on any high ground), road carving makes the ramp chokepoints,
  R-REACH-ALL guarantees every band is honestly reachable.
- Airships land on pads; pads prefer the TOP band (crown pads) — a ⚙ preference, not a new rule.

**V1 = distinct look + real vertical tactics (hold the ramp mouths, archers on the upper band)
with today's engine.**

## 3. Phase V2 — TRUE stacked decks (the unique thing; engine milestone)

The real 5th-Element read: decks that **overlap in plan** — you stand on Deck 1 UNDER Deck 2's
streets. This is a genuine engine feature, and we already own its little brother: the
**wall-walk** (a second walkable plane at height, reached only by stairs-as-data, audited as a
separate layer in `traverse.js`). V2 generalizes exactly that contract:

- **Artifact:** `decks: [{ id: 0|1|2, h, walk: b64, palette? }]` — per-deck walk masks at
  declared heights; `terrain.walk` stays Deck 0 for back-compat.
- **Connectors as data (the stairs contract, grown up):** `connectors: [{ kind: "TUNNEL"|"RAMP"|
  "LIFT", from: {deck, x, z}, to: {deck, x, z}, w, len }]` — renderers draw them verbatim,
  engines path through them, NOTHING is renderer-derived (R-STD's rule).
- **Deck edges = the void:** rails with GAPS, exactly the vessel-deck physics we already have
  (`build/voyage/vessel.js` — rails solid, gaps honest, knockback near an edge is lethal drama).
  Falling off deck 2 lands you on deck 1 (damage); off deck 0 into the void = death.
- **Audit:** `runAudit`/`runNavalAudit` generalize from their current 2-layer model (ground +
  wall-walk) to N decks + connector graph — every deck one component, every connector marches.
- **Flyers** move between decks freely; **airships** dock only at top-deck pads; the "3D
  traffic" is visual dressing (flyer lanes between decks), never free 3D pathing for ground units.

## 4. Gameplay pushed (concrete mechanics for the owner to react to)

1. **Siege-in-depth, rotated vertical:** the concentric-castle doctrine turned 90° — deck 0 is
   the outer ward, the crown is the keep. Attackers who take the UNDER-CITY cut what it feeds.
2. **The under-city matters:** deck 0 holds the working guts (HS2: the crystal reactors — take
   them and the empire's floodlights die on the decks above; HS3: the sealed vaults; HS1: the
   roots/cisterns of the gardens). Capturing deck 0 applies a zone-wide debuff upward (⚙).
3. **Tunnels are the gates of the vertical city:** few, wide-enough, destructible-sealable —
   every gate rule we own (R-DOOR widths, portcullis, choke contestability) applies verbatim.
4. **Fall hazards as drama, not cheese:** rails along deck edges with honest gaps (vessel-deck
   reuse); knockbacks near edges are the sky city's signature kill.
5. **Reinforcement remap:** no beaches — sea arrival is replaced by **under-deck arrival**
   (tunnel mouths at the isle rim, deck 0) vs **air arrival** (top-deck pads). Two doors, top
   and bottom, squeezing the mid city from both sides.
6. **Estate board battles:** decks slot into decision 22 unchanged — a deck is a component of
   the board like any parcel-component; POI parcels can BE "the reactor ward, deck 0".

## 5. Open questions for the owner (⚙ — react, don't assume)

1. V2 scope: do all three decks fight in ONE live ±161 match (one arena, three walk planes), or
   is a live match one deck with the others as board-battle components? (Recommend: one match,
   three planes — that's the unique thing.)
2. Deck-0 capture debuff (the "cut the power" mechanic) — yes/no, and what it does.
3. Falling: deck-to-deck = damage, void = death — confirm.
4. Do sky SINGLE parcels get decks too, or only city/estate maps? (Recommend: estates + POI
   parcels only; countryside singles stay terraced V1.)

## 6. Work split + status

- **CF ParcelMap (me):** V1 terraced bands — IN the HS field builds happening now (agents
  briefed mid-flight); V2 data contract + generator + audit generalization — after owner
  answers §5.
- **MOBA BattleEngine RAW + EF Moba:** V2 is a real engine milestone (multi-plane collision +
  connector pathing + deck rendering/camera). Relay via MOBA-CF-COORD when V2 is greenlit —
  the wall-walk implementation is the template.

## 7. N-LAYER GENERALIZATION + THE SPIRE (owner 2026-08-31: "can the tech city have 7 layers?")

**The logic holds for any N** — the V2 contract is `decks[]` (a list, not a triple) and the audit
generalizes to N planes + a connector graph. The practical limits are not engineering:

- **Readability:** in command view, 4+ overlapping decks need a DECK SLIDER (show the active
  deck, ghost the one above) — solvable, but each extra full-city deck taxes the viewer.
- **Army mass:** an army split across 7 full decks fights 7 thin skirmishes. Broad decks want
  to stay few so battles stay THICK.

**The recommendation — both, in their right places:**

1. **City-wide = 3 broad decks** (the 5th-Element read, armies stay massed).
2. **THE SPIRE OF EMBERFALL = the 7-layer showpiece.** The imperial palace itself is a
   **seven-tier vertical estate**: each tier a compact fighting floor (throne at the summit,
   reactor root at the base), and the siege of it plays as the ESTATE BOARD BATTLE (decision 22)
   **rotated vertical** — each tier = one component; attackers fight UPWARD tier by tier (or cut
   the lifts and starve the top); a tier can open a live hero-mode match exactly like a POI
   parcel. Zero new doctrine: the component machinery we already have, stacked instead of
   spread. Lifts/stairs between tiers are the gates; tier edges drop to the tier below (fall
   damage), outer edges drop to the void.
   - Fits canon cleanly: the Ember Throne is already a PALACE estate map — the Spire becomes its
     pre-designed interior at V2.
   - Uniqueness: no other zone gets a Spire. Empyrea's Sanctum stays WIDE and serene (three
     radial platforms — the anti-Spire); Aeropolis stays terraced ruin. One vertical superweapon
     of a building, in the one city whose identity is "the war machine."

⚙ Owner call: 7 tiers for the Spire confirmed? And does the tier-by-tier climb allow SKIPPING
(air-drop a squad on tier 5 via flyers) or is it strictly bottom-up + lift-cutting?

## 8. DECK COMBAT DOCTRINE — ✅ OWNER-LOCKED 2026-08-31 (supersedes §5 Q3; engine rules)

Owner verbatim intent: "Layer by layer you can jump to with flash/dash, or even fall off / get
bumped off… mostly you CAN'T attack upwards (or nerf by 50% / missed); you CAN attack downwards
layer by layer; there is large enough distance to gap most attacks without walking the walls…
the 3rd layer can drop stuff to attack the lowest, and with gravity it hits with a bit of a
SPLASH. Falling happens — but usually catchable by a few layers below."

1. **The vertical gap is a real wall:** deck spacing is LARGE enough that ordinary attacks
   cannot span layers — you can't melee or poke across a deck boundary "without walking the
   walls" (taking the ramps/lifts/tunnels). The gap itself is the fortification.
2. **Attacking UP: blocked — or ⚙ nerfed −50% / high miss chance** for the few kits allowed to
   try. Height is defense.
3. **Attacking DOWN: works, layer by layer** — units at a deck edge can strike the deck below.
4. **DROP ATTACKS:** the TOP layer can drop objects/ordnance all the way to the LOWEST — gravity
   gives the impact **SPLASH (AoE)**. The top of the city is its artillery platform.
5. **Inter-layer mobility:** flash/dash-class skills can JUMP a layer (up or down — the spicy
   engage); knockbacks near edges BUMP units off (the vessel-deck rails/gaps physics).
6. **Falling is usually CAUGHT:** a fall lands a few layers below with damage — not death.
   Void death only exists off the LOWEST deck / the isle's outer rim. (Supersedes the earlier
   "deck-to-deck damage / void death" phrasing: multi-layer falls are survivable by default.)

Map-side implications (mine): deck edges need honest EDGE data (rail spans + gaps, catch-deck
below per edge segment); drop-attack lanes = vertical sightlines the generator must keep clear
of overhangs on the artillery rims; ramp/lift mouths remain the only walk-up paths (choke law).
Engine-side (EF Moba + BattleEngine RAW): the up/down asymmetry, drop-attack projectile arc +
splash, dash-jump validation, fall-catch resolution. Relayed via MOBA-CF-COORD.

## 9. CONNECTOR LANGUAGES PER ZONE — ✅ OWNER-LOCKED 2026-08-31 (+ the concept board)

How you move between levels is each zone's signature:

| Zone | Vertical form | Connectors |
|---|---|---|
| **HS1 Aeropolis** | overgrown terraces (solid ground steps) | **STAIRS + LONG RAMPS only** — ancient, no machines |
| **HS3 Empyrea** | **taller and taller WALLS** (masonry stays; classic castle language, escalated) | stairs on the walls + **ELEVATOR platforms** (moving up-down platforms — shared HS2/HS3 tech) |
| **HS2 Emberfall** | **NO standing walls** — the levels are **transparent FLOATING deck platforms** (wall-TOPS without the wall: the wall-walk with the wall deleted — crystal-tech holds them up) | **ELEVATOR platforms** (the common tech) + light-beam lifts; rails with honest gaps at deck edges |

- The Emberfall reading is the key unification: **a floating deck IS a wall-walk without a wall**
  — the exact existing wall-walk data contract (walkable band at height + connectors), so the
  engine's V2 work generalizes one thing, not three.
- The ELEVATOR is a **moving platform** connector (`kind:"LIFT"` with travel: a platform units
  ride between two decks — it can be held, contested, or cut; classic lift-camping counterplay ⚙).
- Concept board rendered for the owner (deckviz — Aeropolis terraces+ramp / Empyrea escalating
  walls+elevator / Emberfall floating transparent decks+elevator+drop-splash).
