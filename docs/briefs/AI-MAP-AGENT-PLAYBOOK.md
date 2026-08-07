# AI Map-Agent Playbook — what the agent can do, how to prompt it, how to max-delegate

**TLDR internal doc (owner 2026-08-07).** Everything below is not speculative — it is the loop
that BUILT candy land this week, written down so any agent (ours or a user's) can run it.

## 0. The one loop that powers everything

```
INPUT (prompt | params | reference image)
  → generate(parcel, params)          all 10 engine terrain rules gate EVERY path
  → validate                          5 playability invariants + castle sweep checks
  → traverse audit                    ~100 seeded BFS walks: collision + path overlays
  → render + SCREENSHOT               headless Chromium against the real game renderer
  → self-critique vs goal/reference   the agent LOOKS at its own output
  → iterate (≤N passes) → PENDING design → owner/landowner approves → publish
```
Proven end-to-end in this repo: local map-service + headless Chromium + vendored three.js
(`/vendor/` — no CDN). The v25 candy build took 13 screenshot-judged passes with zero owner
round-trips until review.

## 1. Capability matrix — what an agent can already be delegated

| Ask (owner's words) | What the agent actually does | Surface |
|---|---|---|
| **"path finding of map works"** | runs the traverse audit: 100 seeded walks, every stair/gate/arch reachability, largest-component roam, collision map; reads `traverse.json`, fixes the map, re-audits until clean | `GET /internal/v1/designs/:id/traverse.json`, `maps/traverse.js` |
| **"determine color layout"** | picks/authors the full look as DATA: floor texture (parametric generators), `dry/wet/fog/sky` tints, `bake`, `floorRepeat`, castle style palette, prop palette, water style — exposure-compensated (÷1.4 rule) | `THEME_BIOME`, `tools/make_*_floor.mjs`, designer STYLES |
| **"new polygons for map specific"** | two lanes: (a) USER-AI lane — compose from the SHIPPED prop kit (lollipops, canes, gumdrops, soft-serve trees, clouds, bridges, castle kits) via theme data, zero code; (b) DEV-AGENT lane — author NEW prop meshes in the designer kit, gated by tests + its own screenshots | preview3d prop kit / theme contract |
| **"everything we went through recently"** | terrain params (archetype/density/water/roughness…), castle tiers + ring/gate/stair laws, road doors, bridges at crossings, tower seed-markers, world dressing (clouds/rainbow), water shorelines | `generate()` params + the v18–v25 rule set |
| **"image reference → new world"** (VIP3) | vision pass extracts palette + motif list + mood from the photo → maps to theme data + prop selection + floor-generator params → iterates screenshots AGAINST the reference until it matches | the candy-land flow, verbatim |
| bulk work | re-bake all estates, run the 1000+-check sweeps, regenerate zones | `tools/estate_palace_maps.mjs` etc. |

## 2. The safety line (why delegation is safe at all)

**A theme changes the LOOK, never the WAR.** User-facing agents output only clamped DATA (theme
entry, params, texture-generator inputs) — never code, never geometry outside the parcel's NFT
shape, never gameplay. Every candidate passes the same 10 rules + 5 invariants + traverse audit as
a hand-built map. Worst case from a hostile prompt: an ugly skin.

Three autonomy rings:
- **Ring 1 — user's AI (self-serve):** data-only loop above, auto-gated, needs no human review to
  RENDER; landowner approves before PUBLISH. Tiers: non-VIP = BYO key, VIP = hosted models
  (the AR box), VIP3 = + image upload.
- **Ring 2 — our dev agents:** may write code (new props, renderer features, generator passes) but
  must ship tests + verify with their own screenshots; owner eyeballs results live.
- **Ring 3 — owner only:** canon, economy, gameplay rules, engine contracts.

## 3. Prompt templates (what to actually type)

- **Standard build:** "riverCrossing archetype, sakura palette, gentle density, castle north,
  road from SW spawn over the river — verify traverse clean."
- **Themed build:** "apply theme <X>; land stays normal, the theme lives in objects + floor +
  sky. Author a floor texture if the kit lacks one (seamless, low-contrast, tiling-safe)."
- **Reference build (VIP3):** "match this image: extract its palette + 5 signature motifs; map
  motifs to the prop kit; author the floor; iterate screenshots until a side-by-side reads as the
  same world. ≤10 passes."
- **Fix pass:** "here is a screenshot + the complaint '<owner words>'. Diagnose the actual
  renderer/data cause first, then fix; re-screenshot to prove it."
- Always end with: **"run the gates; deliver as PENDING; list what you changed as data vs code."**

## 4. Verification status (honest)

| Piece | Status |
|---|---|
| the loop itself (generate→gates→audit→screenshot→critique) | ✅ proven in-repo, 13-pass live build |
| obfuscated client still renders | ✅ proven (pixel-identical screenshot) |
| AR box `claude -p` auth | ✅ live-tested (owner relay, CLAUDE-TOKEN-SETUP.md on the box) |
| worker ON the AR box driving map.etherfantasy.com | ⏳ needs owner OK (lockdown rule) — it is a
  standing process; no new tech, the map service is public HTTPS |
| VIP-level lookup API + reference-image storage | ⏳ owner to designate |

## 5. Max-delegation rule of thumb

Delegate anything whose failure is VISIBLE IN A SCREENSHOT or CAUGHT BY A GATE — the agent can see
and fix those itself. Keep for humans anything whose failure is a WRONG DECISION (canon, economy,
what "good" looks like) — agents propose, the owner rules, and each ruling becomes a new gate or
a new line in this playbook so the next run needs no human at all.
