# Map themes — the visuals-only skin contract (v24 pilot: 🍭 CANDY LAND)

**Owner (2026-08-05): custom map themes — "chocolate factory, candy instead of trees" — user-AI
themes as a paid ENABLE for non-standard looks; standard themes free.**

## The contract (one rule)

**A theme changes the LOOK, never the WAR.** `meta.theme` is a string key that rides the
artifact → A1 (`meta.theme`) → render manifest (`theme`). Renderers map the key to a skin
(palette, prop models, castle materials, water style). Everything gameplay — the typed terrain
grid, walk mask, anchors, lanes, the 10 engine terrain rules, every validator — is byte-for-byte
the standard pipeline. A themed map passes the identical gates; an engine without the asset pack
falls back to the biome look and loses nothing but flavour.

## What exists now (the pilot)

- `parcel.theme` → `generate()` stamps `meta.theme`; `candyland` also selects castle
  `styleKey:"candy"`. Both converters pass the key through.
- **CF designer skin for `candyland`** (the reference implementation, legacy render path):
  pink sugar meadows + pastel sky, SODA water mode, caramel roads, lollipop groves + candy-cane
  hooks for TREE, glossy gumdrops for ROCK, gingerbread walls with icing-pink roofs.
- **Authored theme floors (v24.3/v24.4):** a theme may ship its OWN floor texture instead of
  re-tinting a biome one. Both are deterministic zero-dep generators in `map-service/tools/`,
  served at `/floors/<name>.png`; `THEME_BIOME` sets `dry:0xffffff` (neutral tint — the art reads
  true) and **`biome.bake:"none"`** — an OPTIONAL manifest field telling the render module to skip
  the dirt/meadow/rock vertex-colour splotches (they would muddy a designed floor); absent =
  classic bake, fully backward-compatible.
  - `candy_dream.png` (`make_candy_floor.mjs`) — frosting cream marbled with pastel-rainbow taffy
    swirls, rainbow sprinkles, sugar sparkle; designed FOR the module's 23×25 tiling (zero straight
    lines — cannot read as a grid). Live it reads as SNOW-WHITE dream land — owner kept it as the
    **`snowdream`** theme ("interesting keeper for later"): dream-lavender fog `0x8f6fa5`, designer
    chip ❄️ Snow dream.
  - `veil_masquerade.png` (`make_veil_floor.mjs`) — harlequin purple diamonds + gold seams +
    orchid veils. At arena tiling it reads as a glowing digital lattice — the owner kept it as
    the **`cyber`** theme ("a cool cyber tron floor"): deep indigo fog `0x261b3a`, the
    digital-world skin. Designer chip 🕹 Cyber grid.
  - **v25 FULL CANDY-LAND BUILD (owner 2026-08-06, reference art):** supersedes the v24.5
    green-grass revert. `cotton_candy.png` (`make_cotton_floor.mjs`) — cream-rose cotton with
    pastel drifts + candy flowers — is candyland's ground at `floorRepeat:[7,8]` (meadow-scale
    features). New OPTIONAL manifest fields the render module honors: **`biome.sky`** (full-strength
    day-lit sky/fog + warm light rig + soft glow — the classic dusk rig is byte-identical when
    absent) and **`biome.floorRepeat`** ([rx,rz] texture tiling override). Designer candy kit:
    pastel dream castle (cream-pink walls, rotating pink/mint/lavender/peach cone roofs, gold star
    finials, icing courtyard), soft-serve swirl trees, saturated lollipop/gumdrop palette, floating
    cotton-candy clouds + a rainbow arc (themed maps only). Exposure rule learned: bright pastel
    textures/materials must be pre-divided ~÷1.4 for the light rig or they clamp to white.
- **The demo world:** `data/cf-maps/artifacts/CANDYLAND.artifact.json` — authored soda river +
  licorice road + The Gingerbread Keep (CASTLE tier), built by
  `map-service/tools/make_candyland_demo.mjs` (deterministic, 5/5 invariants, rule-compliant).
  View: `/designer/3d?parcel=CANDYLAND`.
- **Designer idea chips:** "🏰 go standard" (biome directives) + "✨ go creative — FREE for now"
  (🍭 Candy land, 🍫 Chocolate, 🎃 Haunted, 🍦 Glacier) fill the prompt box.

## What's owed (in order)

1. **Engine asset packs** (MOBA BattleEngine RAW): map `manifest.theme` → model/material set
   (TREE→lollipop set, ROCK→gumdrop set, castle materials, water tint). Unknown key = biome
   fallback — ship packs at your own pace.
2. **LLM prompt path**: whitelist `theme` in the translated params (clamped to the shipped skin
   list) so "make it candy land" on an owned parcel just works.
3. **ENABLE / pay gate** (CF Overworld eco): non-standard themes become a CT purchase per parcel
   (economy-seam Hook-2 pattern; owner prices it); standard biome themes stay free. Until then
   everything is FREE (owner 2026-08-05).
4. **User-AI custom themes**: a user's AI generates a palette + picks from the shipped prop-skin
   library within clamped bounds — never arbitrary geometry; the parcel's land shape is NFT-fixed.
