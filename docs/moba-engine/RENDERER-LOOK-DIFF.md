# Original inline arena vs the shared renderer — why the new look is brighter (2026-07-18)

> Owner: "the original map was darker saturation and color than the new one — point out the
> difference; I don't mind the water color but I want to make sure it's a conscious decision."
> Verified constant-by-constant against the archived original
> (`archive/moba-inline-arena-2026-07-13.index.html`) and `ef_battlefield_renderer.js` V3.

## The headline: it is NOT the tints — it's the missing ATMOSPHERE layer

The static color constants are **identical** in both (verified): same near-neutral biome tints
(`_BIOMES` ≡ the converter PALETTE rows), same fog `0x0d1420`, same light rig, same vertex-bake
numbers, same floor textures. What did NOT come along in the extraction is the original's
**dynamic atmosphere state machine**, which kept the live game in a darker, moodier grade most of
the time:

| Original inline arena (index.html `weatherTick`) | Shared module V3 |
|---|---|
| **Weather rotation** every 50–120 s (sunny/cloudy/rain/storm moods — sun+hemi intensity per mood) | none — static clear |
| **Wet-ground tint lerp**: rain eases ground colour dry→wet (`0xc2ccb4`-class wet tints = darker, more saturated olive) | dry tint only, forever |
| **Day/night cycle**: sun ×0.5 (night) … ×1.12 (noon), sun colour lerps to dusk-orange, hemi dims to 0.62× at night | perpetual noon |
| **Night edge-vignette** (corners darken at night, heavier in storm) | none |
| clouds / puddles / rainbow / celestial sprites easing with weather×time | none |

Statistically the original spent **most of its time below "clear noon"** (half the day-cycle is
dimmer than 0.8×, weather is non-sunny more often than sunny, rain wets the ground colour) — so the
frames you remember are graded darker + more saturated. The module renders the ONE brightest state.

## Verdict per difference

- **Conscious:** the extraction scoped the module to the STATIC nine layers; atmosphere was always
  the game loop's job (`weatherTick` grades `sun`/`hemi`/`ground.material.color` at runtime), and
  COORD-007 explicitly KEEPS weather visuals as rotating flavor. So the split itself is by design.
- **⚠ Regression to fix (flag to MOBA session):** with the 2v2 cutover rendering through the
  module, `weatherTick` must be re-attached to the module's objects (the returned `group`'s ground
  material, and the module-created lights when `addLights:true`) — otherwise the live game LOSES
  day/night + weather grading entirely and stays at clear-noon. That is the brightness delta the
  owner noticed. Suggested seam: module exposes `{ groundMaterial, sun, hemi }` (or a
  `setAtmosphere({sunMul, hemiMul, groundTint})` method) so `weatherTick` grades through it —
  visuals only, per COORD-007.
- **Not involved:** biome tints, fog constants, vertex bake, floors (all byte-equal); the water
  colour is CF preview-side and separately owner-approved.

## Copies kept (owner request)

- `docs/moba-engine/archive/moba-inline-arena-2026-07-13.index.html` — the FULL original inline
  arena (render + atmosphere state machine), pre-cutover snapshot from MOBA main 2026-07-13.
- `map-service/maps/ef_battlefield.js.bak` — the pre-unification V1 module (`?legacyRenderer=1`
  still serves it in the designer).
- The MOBA session should additionally git-tag their pre-cutover commit (their one-file rollback
  protocol already implies it).
