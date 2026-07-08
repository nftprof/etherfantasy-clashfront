# One Map, Many Modes — anchors, labels & mode legend

> **Map-maker session, 2026-07-07.** Answers: *"the 2 blue + 1 red circles — is that 2 waves?"*, *"can the
> same map be used for versus / defender / capture-the-center?"*, and *"add labels + a mode toggle."* Short
> answer: **the circles are spawn/entry ANCHORS, not waves — and ONE artifact already carries every mode's
> anchors; a MODE just lights up a subset.** This doc is the spec the command-view + designer renderers use
> to label them and toggle modes.

## 1. The circles are anchors, not waves

Every parcel artifact emits a fixed **anchor set** in `spawnZones` (see `generate.js`) — these are *possible*
start/hold points, **not** enemy waves. A single battle uses only the ones its mode + approach direction
activate. What you saw (2 "blue" + 1 "red") = the **attacker spawn + an edge-entry + the defender base** —
one enemy force, plus the *other* edges it *could* have come from.

| Anchor (`spawnZones[].id`) | side | where | what it is |
|---|---|---|---|
| `atk_S` | ATTACKER | S edge (−z) | the attacker's DUEL/assault spawn |
| `def_base` | DEFENDER | N edge (+z) | the defender's base / hold point |
| `entry_e0…eN` | ANY | one per **real parcel edge** (S/E/N/W…) | arrival points — the attacker enters at the edge matching its **overworld approach direction** |
| `center` | OBJECTIVE | middle (C) | the hold-point for capture/siege/domination modes |

Plus `buildSpots` (defensive placements) and `structures` (towers; CORE synthesized from `atk_S`/`def_base`).

## 2. Attacker entry follows the approach direction; defender holds the middle

There is **no single fixed enemy spawn** (that's the old MOBA). Because an overworld army can march in from
any side, the artifact gives **one entry per edge** (`entry_e*`); the **active** entry is whichever edge the
attacker actually approached from (canon decision 11 — Masters enter at the hexagon edge matching the
approach). The **defender holds the interior/base** (`def_base` near center for siege/hold modes, or the
opposite pole for versus). So a map is designed as **defender-interior + attacker-enters-from-a-chosen-edge**,
not attacker-fixed-south.

## 3. ONE map, MANY modes (yes — it already works)

The artifact is **mode-agnostic**: it ships the *superset* of anchors, and a **MODE** is a lens that (a)
activates a subset of anchors and (b) sets the win condition. The same parcel plays every mode with **zero
regeneration** — you pick the mode at battle start.

| Mode | Active anchors | Who holds middle | Win condition |
|---|---|---|---|
| **VERSUS / PvP** | `atk_S` (or approach edge) + `def_base` at the opposite pole | neither (two bases) | destroy the enemy CORE |
| **SIEGE / DEFENDER** | approach `entry_*` + `def_base` at `center` | **defender** | attacker breaches the CORE / defender survives the clock |
| **DOMINION / CAPTURE-CENTER** | both sides' approach `entry_*` + `center` OBJECTIVE | **whoever seizes it** | hold `center` for N ticks |
| **GUARD / RAID** | several `entry_*` (raiders) + interior defenders/pets | **defender** | repel all raider waves / raiders down the defense |
| **DUEL** | `atk_S` + `def_base` only | — | 1v1 core resolve |
| **CLASH** | two opposite `entry_*` | — | armies collide; last force standing |

**So:** the *same* map is a versus arena, a siege you defend, and a king-of-the-hill — the mode just
re-labels which circles are live and where the win-point is.

## 4. Renderer spec — labels + a mode toggle (for the command view + designer)

The 2D command view (`battle.js drawBattlefieldMap`) and the designer preview should:
1. **Label every anchor** it draws — `ATK SPAWN`, `DEF BASE`, `ENTRY ▸N/E/S/W`, `◎ OBJECTIVE`, `⚒ build`,
   `♜ tower`, `⛏ gold`, `🌲 wood`, `☠ wild` — so no circle is ambiguous (kills the "is that a wave?" read).
2. **Offer a MODE selector** (Versus / Siege / Dominion / Guard / Duel / Clash). Selecting a mode **greys
   the inactive anchors, highlights the active spawns for each side, and marks the win-point** (enemy CORE,
   or the `center` objective). A small **legend** shows the colour key + the current mode's rule.
3. **Colour by side** consistently — ATTACKER one hue, DEFENDER another, OBJECTIVE a third — and **not** by
   count, so multiple same-side circles read as "possible entries," never "waves."

This is a pure *presentation* layer over the existing anchors — no artifact/schema change. (Command view =
CF-overworld's `battle.js`; the designer preview = map-service's — Map-maker owns the latter.)

## 5. Fixed alongside this — biome drives the ground colour

Bug: the ground palette was chosen by a **region hash that ignored biome**, so a DESERT parcel could render
**green**. Fixed in `generate.js` (`biomePalette`): the palette now derives from the declared **biome**
(DESERT→sandy, VOLCANIC→volcanic/ash, SNOW→tundra, SWAMP→swamp, TEMPERATE→verdant), with a seeded variant
for regional variety. An explicit LLM/owner `palette` still wins. The A1 command JSON now also carries
`meta.palette` so the command view can match the 3D colour exactly. Samples + CF-* references regenerated.

## Open (owner)
- **Mode set to ship first** — Versus + Siege are the core; Dominion/Guard/Duel/Clash are the wider menu we
  discussed. Which are in the MVP mode selector?
- **Per-mode defender position** — always `center` for Siege/Dominion (recommended), or map-authored?
