# Map Visual Polish — recurring look-and-feel loop (dedicated map session)

> For the "overall map / all-continents" Claude Code session working on the SAME repo
> (branch `claude/clash-front-overworld-mkcyia`). Owner directive 2026-07-04: continuously
> raise the overworld's look & feel to top-tier war-strategy grade (Romance of the Three
> Kingdoms / Total War), on a recurring cadence, WITHOUT touching gameplay mechanics.

## Where this runs (not the CF hub session)

Run the loop in THIS map session — the CF overworld/canon session stays the gameplay+canon hub.
Visuals are your lane; gameplay is theirs. Both push to the same branch and deploy through the
same pipeline, so your work rolls into the live build automatically — no manual merge needed.

## The file LANE (touch ONLY these — this is what keeps you collision-free with gameplay)

- `apps/server/public/js/terrain.js` — terrain/landscape/biome rendering (your primary canvas).
- `apps/server/public/js/map.js` — **terrain-draw regions only** (heightfield, hillshade,
  water, forests, tiles). Do NOT edit its army/battle-marker, interaction, or selection logic —
  that's gameplay-owned and actively changing.
- `apps/server/public/app.css` — **visual/theme rules only** (colors, textures, map chrome).
  Avoid layout/structural rules for the rail/card/battle overlay (gameplay UI).
- `apps/server/public/textures/**` — tiles, sprites, atlases (add/replace freely).
- `docs/map-engine/**` — record visual design decisions here.

**NEVER touch:** `packages/sim-engine/**`, `apps/server/src/**` (server/game logic),
`apps/server/public/js/{game-state, store, net, battle, ui, econ, ftue}.js` mechanics. Zero
gameplay impact is the hard contract — you change how it LOOKS, never how it PLAYS.

## Coordination rules (multiple sessions, one branch)

1. `git pull --rebase origin claude/clash-front-overworld-mkcyia` BEFORE every push; retry with
   backoff on network errors.
2. Keep each diff surgical and inside the lane above — a small, self-contained visual commit
   rebases cleanly even when gameplay is pushing in parallel.
3. Deploy your own work: `git push origin claude/clash-front-overworld-mkcyia:deploy/cf-mvp`
   after pushing the branch — it auto-deploys to cf.etherfantasy.com. The CF hub reviews pushes
   but does NOT gate you; you own the visual lane end to end.
4. Keep the build green: `pnpm -r build && pnpm -r test` must pass before any push (visual JS is
   linted/typechecked with the rest). The client has no unit tests for pixels — verify visually
   with a Playwright screenshot to your scratchpad (chromium at /opt/pw-browsers).

## The recurring loop (every 20 min for 24h — one improvement per tick)

Use this session's scheduler — Claude Code desktop **Routines** or **Dispatch (Beta)**, or
`/loop 20m <the prompt below>`. Each firing makes ONE surgical, shippable improvement and
deploys it. Rotate focus so 72 iterations don't repeat the same thing:

> Make ONE surgical visual improvement to the Clash Front overworld's look & feel, targeting
> top-tier war-strategy grade (RoTK / Total War). Touch ONLY the visual lane in
> docs/briefs/MAP-VISUAL-POLISH.md (terrain.js, map.js terrain-draw regions, app.css visual
> rules, textures/). Rotate through this focus list, picking the next under-polished area each
> run: (1) terrain heightfield + hillshade realism; (2) biome palettes + transitions
> (grassland/desert/tundra/volcanic/underworld/floating-isle); (3) water — coastlines, rivers,
> depth shading, shimmer; (4) forests/mountains — natural, non-repeating placement + LOD;
> (5) parcel borders + ownership tint legibility at all zoom levels; (6) roads/rivers/regional
> seams; (7) atmosphere — fog, vignette, lighting, day feel; (8) the ocean + non-navigable wild
> + floating-island + underworld zone treatments; (9) UI-map chrome (labels, banners, icons)
> matching the war-room theme; (10) performance of the render at world scale. Before editing,
> git pull --rebase. After: pnpm -r build && pnpm -r test green, take a Playwright before/after
> screenshot to scratchpad, commit with a clear message, push the branch, and push to
> deploy/cf-mvp. Never touch sim-engine or server/game logic — looks only, zero mechanics.

## Provenance / reading each other's work

The CF hub session reads every push (`git fetch` + `git diff`) and will flag if a visual change
accidentally reaches gameplay. If you need a gameplay-side hook (e.g. terrain type per parcel to
drive biome coloring), request it from the hub rather than reaching into sim-engine — that data
flows through the world snapshot, not by editing the sim.
