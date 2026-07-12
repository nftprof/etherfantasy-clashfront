# Master head-shot portraits — drop folder

This is where character **head shots** live. They're served statically at
`/avatars/<file>` and used by the officer avatars, the war room, and the **hero
duel** overlay (the two fighter portraits).

## Naming convention (IMPORTANT)

**One file per Master, named by its champion `slug`, PNG:**

```
apps/server/public/avatars/<slug>.png
```

- `<slug>` = the EF **Masters API `slug`** (docs/09 §7 — `GET /api/gameplay/masters/active/{wallet}`
  returns e.g. `{ "masterId": 3001, "name": "Choco", "slug": "choco" }`), **lowercase**, so:
  - Choco → `choco.png`
  - if a name has spaces/punctuation, lowercase and replace non `[a-z0-9_]` runs with `_`
    (e.g. "Death Jinook" → `death_jinook.png`).
- The client requests `/avatars/<slug>.png`; a missing file simply falls back to a
  name-hued **initials medallion** (no error, no console spam) — so partial coverage is fine,
  add head shots incrementally.

## Art spec

- **Format:** PNG (the existing `irene/kai/leah` heroes ship as `.jpg`; new Masters = `.png`).
- **Size:** ~256×256 (square). They render in circular frames (officer chips ~18–30px, the duel
  portraits ~92px), so a **head-and-shoulders** crop centered on the face reads best.
- **Background:** transparent or a neutral flat fill — the circle mask crops the corners.
- Keep them lean (256px, optimized) — they're loaded live in the browser.

## Currently present

- `irene.jpg`, `kai.jpg`, `leah.jpg` — the 3 MOBA hero portraits (+ their `FACE_*.jpg` sources).
- **Wanted:** one `<slug>.png` per Master in `data/CHARACTER_ROSTER.csv` (the 52 Masters). Drop them
  here and they light up everywhere automatically — no code change needed.
