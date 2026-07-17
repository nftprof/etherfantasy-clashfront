# apps/website — Clash Front public site

Static site. No build framework, no runtime, no external requests. Just HTML +
one CSS + a tiny JS. Deploy any way you'd deploy a static folder.

## What ships to the CDN

Everything in this folder EXCEPT `pages/`, `_shared.js`, `build.mjs`, and
`package.json`. Concretely:

```
apps/website/
├── index.html                  ← the home page
├── world.html · battles.html · masters.html · pets.html · army.html
├── maps.html · weather.html · nft.html · servers.html · economy.html
├── world-remembers.html · getting-started.html · roadmap.html
└── assets/
    ├── site.css                ← the theme
    ├── site.js                 ← nav toggle + active-link marker
    └── img/                    ← portraits copied from apps/server/public/avatars
```

Root path = `index.html`. All internal links are absolute paths (`/battles.html`, etc.) so a static server that serves this folder from the domain root Just Works.

## Editing content

Every page is one module in `pages/*.js`. Edit the module, run:

```
cd apps/website
node build.mjs
```

Generated `.html` files are committed alongside sources so the deploy agent has zero-tooling output (no `npm install`, no `node` on the deploy box).

## Design language

Dark diablo-inspired (deep blacks, thin rust-gold accents, blood on victory).
Inherits the war-room palette from `apps/server/public/app.css` but pushed
darker. No external fonts. Responsive (breakpoint at 780 px). CSS variables in
`assets/site.css` `:root` — edit there to retune the whole site.

## What NOT to put on this site

- Anti-cheat / security-invariant details (public marketing surface only)
- Live game state (that's the demo at `clashfront.etherfantasy.com`)
- Internal API tokens, contract addresses, dev URLs
- Anything from `docs/coord/` or `docs/reports/` (internal coord)
