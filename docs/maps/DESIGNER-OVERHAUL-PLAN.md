# MAP DESIGNER OVERHAUL — 24h improvement loop (owner 2026-10-19)

> Owner: "revisit map designer entirely so it is professional looking and owner OR admin = nftprof can
> use all features right now. Include FTUE / a landing page — what this is, why users should use it,
> the benefit, why get land, how to get land; video preview of the complete land; flow diagrams;
> guide new users through the journey; explain why land is important + what it does. A full landing
> page for users not logged in. I'm not getting what this is vs the full world map."
> Cadence: 1-minute ticks for 24h → **loop ends 2026-10-20T14:38Z** (CronDelete the job then).

## The product, in one line each (the IA every page must teach)

| Page | URL | Who | Job |
|---|---|---|---|
| **Landing** | `/` (and `/designer` for signed-out first visits) | everyone | what this is · why own land · how to get land · journey |
| **World Atlas** | `/designer/world` | everyone | the WHOLE world at a glance — 12 continents in their real arrangement; click → open a continent in the Designer |
| **Designer (Studio)** | `/designer` | signed in / guest | pick YOUR parcel → describe its battlefield → AI builds + validates it → 3D preview → freeze |
| **3D view** | `/designer/3d?parcel=` | everyone | one parcel's battlefield exactly as the game renders it |
| **Sky Cities** | `/designer/decks` | everyone | stacked-city concept maps |

**The confusion to kill:** the Atlas is the *map of the world* (where is everything); the Designer is
the *workshop for one parcel* (what does MY land look like when it's fought over). Every page carries
the same top nav so this is obvious: `Home · World Atlas · Designer · Get Land · Sky Cities · Sign in`.

## Principles
- **One design system** (tokens, header, footer, buttons, cards) shared by every page — `/ui/theme.css` + `/ui/shell.js`.
- **Honest copy.** Live features are stated as live; planned ones say "coming". **No financial-return
  claims** (canon decision 17: the CT economy is house-edged — never promise earnings). Land's value =
  ownership, a real battlefield, design rights, home-turf, a name in the World Chronicle.
- **Facts from canon/data**, not invented: land contracts + claim flow from `data/land-contracts.json`
  / `LAND-CONTRACTS-AND-SALE.md`; continents from `data/zone-registry.json`; counts from live endpoints.
- **Admin (nftprof) = everything**: server already treats `nftprof` as admin (`MAPS_ADMIN_USERS`);
  the client must not hide or cap anything for admin.
- Every change: boot the server, headless-screenshot the affected page, run the map-service suite,
  then ship (`origin claude/clash-front-overworld-mkcyia` + `bsh deploy/map`).

## Loop protocol (each 1-minute tick)
1. If now ≥ **2026-10-20T14:38Z** → CronDelete the loop job, write the final report, stop.
2. Pick the FIRST unchecked `[ ]` item below (skip `[~]` blocked ones). Big items may span ticks — leave
   a `(wip: …)` note and continue next tick.
3. Implement → verify (server boot + headless screenshot + `node --test --test-concurrency=1 maps/test/*.test.js`).
4. Commit (attribution trailer) → push origin mkcyia + `bsh HEAD:deploy/map` → tick `[x]` with a one-line result.
5. One short visible status line. Never re-ask the owner things already decided here.

## Backlog (ordered)

### A — Fix + foundations
- [x] A1 **World Atlas stacking bug**: deploy never ships `data/hexagon-city-source/zone-layout.json` → every continent at offset (0,0). Add it to `map-deploy.yml`; guard: worldmap.js warns + falls back to a grid layout when the file is missing. → DONE: workflow ships it; fallback row verified (10/10 distinct positions with + without the file).
- [x] A2 **Design system**: `/ui/theme.css` (tokens, type scale, buttons, cards, nav, footer, light+dark) + `/ui/shell.js` (injects header nav w/ active state, sign-in pill w/ admin badge, footer). Serve `/ui/*` statically. → DONE: tokens/type/buttons/cards/pills/nav/footer/toasts/forms/responsive; `window.EFShell`; `/ui/*` + `/media/*` routes (utf-8).
- [x] A3 **Routing**: `/` → landing; signed-out first visit to `/designer` → landing (deep links `?parcel=` and "Continue as guest" bypass via sessionStorage).
- [x] A4 **Admin = all features**: admin designs get the max budget tier; admin badge in shell; audit + remove client gates/"coming soon" blocks for admin; `/whoami` drives it. — DONE 2026-10-19: admin tier control (0–5, Golden = max) in Current design → server `invest` action; admin copy replaces "coming soon"; shell shows 👑 Admin. Admin = the VERIFIED PG login (nftprof) or ops key. The admin *wallet* stays view-only on purpose: `x-wallet` is an unsigned header, so it cannot grant write access.

### B — Landing page (`maps/landing.html`)
- [x] B1 Hero: headline + subhead + CTAs (Explore the world · Design your land · Get land) over the video.
- [ ] B2 **Video**: `tools/record_showcase.mjs` — frame-stepped orbit of real castle/palace maps (PNG frames → bundled ffmpeg VP8 webm + poster), committed under `map-service/media/`, served `/media/*`.
- [x] B3 "What is this" + **Atlas vs Designer** explainer (two cards, screenshots).
- [x] B4 **Journey flow diagram** (inline SVG): Get land → Design its battlefield → Fight in Clash Front → Leave your mark.
- [x] B5 Why land matters — honest benefit grid (real battlefield, design rights, home turf, castles/estates, World Chronicle, cross-game).
- [x] B6 **How to get land** — paths with live/soon status + claim flow diagram (size token → approve → claim → design); contract facts.
- [~] B7 Continents gallery (wip: tiers + cards + /internal/v1/landing-stats live; needs /media/continents/<ZONE>.webp thumbnails) — 12 continents, mosaic thumbs, identity line, parcel counts, "open in Atlas".
- [x] B8 Live stats strip (parcels, estates, castles, designed maps) from endpoints.
- [x] B9 FAQ + footer.

### C — Designer studio, professional pass
- [x] C1 Adopt shell + theme; studio layout (left: land picker / right: design panel); remove ad-hoc inline styles. — DONE 2026-10-19: studio hero, full-width land map, Describe | sticky Current design columns, AI engine + ops key collapsed, castle/claim as slide-over drawers, #signin/#mint/#estates deep links; all element IDs kept (old tokens aliased to the theme).
- [x] C2 FTUE coach-mark tour (first visit, replay from Help). — DONE: welcome card → 5-step spotlight tour (land, describe, result, account, claim/castles); "Take the tour" replays; Esc/arrow keys; phone-friendly.
- [x] C3 Parcel inspector: zone, size, owner, minted, design status, open 3D, copy link. — DONE: decoded from the token id (estate size / parent estate / chain), ownership (yours · minted · unminted→"Claim this land"), design status; Copy link.
- [ ] C4 Continent picker as image cards (mosaic thumb + identity) instead of text tiles.
- [ ] C5 Toasts, loading skeletons, empty + error states.

### D — World Atlas, reframed
- [x] D1 Public framing: title/legend/intro say what it is; coverage % → admin-only. — DONE: "World Atlas" hero + Atlas-vs-Designer cards; coverage strip + overlay only for admins.
- [x] D2 Real arrangement + non-overlapping labels; continents drawn with their baked mosaics. — DONE: "Layers" (default, area ∝ parcels, wraps on phones) and "Overworld positions" with an animated switch; draws /media/continents/<ZONE>.webp (cell-dot fallback until B7 stills ship); owner-locked travel routes drawn (airship ways, the Shaft, the Diminishing Stair).
- [x] D3 Click a continent → Designer at that continent; hover cards. — DONE: /designer?zone=XX + hover card (layer, parcels, castles). Also fixed a pre-existing bug: every ?parcel=/?zone= deep link loaded 0 parcels (TDZ on pgTok).
- [x] D4 Depth tiers (sky isles above · surface · underworld below) explained in a legend. — DONE: tinted bands + legend + "All continents" list grouped by layer (keyboard path).

### E — Polish
- [ ] E1 Mobile/responsive pass on every page.
- [ ] E2 SEO + OpenGraph/Twitter cards + social image.
- [ ] E3 Accessibility: contrast, focus rings, alt text, reduced-motion (pause video).
- [ ] E4 3D viewer + Sky Cities chrome on the shared shell.
- [ ] E5 Performance: lazy-load mosaics/video, cache headers.
- [ ] E6 Final consistency review + screenshot set to the owner.

## Log
- 2026-10-19 14:38Z — plan written; loop armed (1-minute cron job 174a9fd9).
- A1 shipped — continents no longer stacked on the live Atlas.
- A3 + landing (B1,B3–B6,B8,B9) shipped — `/` = landing; cold signed-out /designer → landing once.
- A2 shipped — shared shell + theme (header nav Home · World Atlas · Designer · Sky Cities · Get Land; admin badge; footer).
- C1 + A4 shipped — Designer studio layout; admin land-tier control.
- D1–D4 shipped — World Atlas reframed for the public; deep-link 0-parcels bug fixed.
