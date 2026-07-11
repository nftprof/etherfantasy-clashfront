# THE DIMINUTION — character-scale spec (owner-locked 2026-07-10)

> **For: MOBA BattleEngine RAW (render/camera/kinematics) + EF Moba (server-authoritative speeds/ranges)
> + CF (passes the zone's charScale in the allocate context).** Lore: `docs/lore/WORLD-CHRONICLE.md`
> ("with every step you grow smaller and the steps grow vaster" — the Stair is literal). Data:
> `data/zone-registry.json _meta.charScale`.

## The principle — a brilliant implementation shortcut (owner)

**We do not scale the world. We scale the character.** Same small ±161 arena, zero extra geometry:
at 1/1.5 character scale the world *reads* 1.5× bigger; at 1/6 it reads 6× bigger — structures become
massive, the land only *seems* vast ("you are being deceived"). Enormous perceived world for free.

## The two knobs (do not conflate them)

| Knob | What it scales | Who sets it |
|---|---|---|
| **visual** | character model size **+ camera height/zoom proportionally** (the camera following down is what SELLS it — structures tower into the frame) | **LORE-LOCKED** (below) |
| **kinematic** | move speed, attack/aggro/collision ranges, projectile ranges | **⚙ tunable** — full visual-matched speed at 1/6 = a 40s rotation becomes 4 min (unplayable); √6 ≈ 1/2.45 reads vast but plays |

**Unchanged, explicitly:** arena bounds (±161), terrain/structure geometry, unit counts, HP/damage/stats
(the Diminution is perception + traverse, never combat power), the command-view map (CF renders the same
battlefield JSON; unit dots may shrink slightly for flavor, optional).

## The ladder (visual = canon; kinematic = starting ⚙)

| Zone tier | visual | kinematic | Feel |
|---|---|---|---|
| surface / sky / UW1 | 1.0 | 1.0 | normal (UW1 stays 1.0 — the cramped-but-normal warren is the contrast anchor for the descent) |
| **UW2 Blackmere** | **1/1.5 (0.667)** | 0.667 | the **uncanny** step — big enough to feel wrong, small enough you can't name it: *"something is definitely weird"* |
| **UW3 Luxuria** | **1/6 (0.167)** | **0.4 (≈1/2.5, √6)** ⚙ | the **deception** — you seem tiny, the land seems massive. The number is **6** on purpose. |

Progression logic: 1 → 1.5 → 6 means the jump *ratios* are ×1.5 then ×4 — Blackmere unsettles quietly,
Luxuria lands like a hammer.

## Implementation notes

1. **Camera is half the effect.** Scale camera height/FOV-distance with the character; a 1/6 character
   under a full-height camera is just a small dot — a 1/6 character under a 1/6-height camera is a soul
   at the foot of a colossus.
2. **Kinematic tuning is free** — playtest UW3 between 0.3–0.5; the visual 1/6 never changes.
3. **CF hook:** the allocate context gains `charScale: {visual, kinematic}` from the registry by the
   battle parcel's zone (CF adds when the engine is ready to consume — say the word).
4. **Mixed-scale edge case:** all combatants in a battle share the zone's scale (it's the *realm*
   diminishing you, not a buff) — no per-unit variance, no scale mismatches to net-code.
5. **Sky is 1.0** — the heavens do not diminish you; deliberately untouched (the mirror is strictness,
   not scale).
