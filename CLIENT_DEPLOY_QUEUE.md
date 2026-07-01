# EF Moba — CLIENT deploy queue (for the server/deploy agent)

## ⏩ PERMANENT FIX — auto-deploy must ship the WHOLE manifest, not just index.html

**Root cause of "graphics update but the character/run fix doesn't":** the map/graphics edits
live in `index.html`, but the run-timing fix lives in **`model_calibration.js`** and the models
in **`hero/`**. An auto-deploy that only re-tars `index.html` will never ship those.

**Do this once and the problem is gone for good:** point the auto-deploy at the canonical file
list **`CLIENT_FILES.txt`** (repo root) instead of a hard-coded `index.html`. Easiest: just call
the repo's **`deploy_client.sh`** (it tars exactly the manifest, uploads, unpacks into
`~/ef-moba-game/`, and verifies). Equivalent inline:

```bash
cd <repo root: EF Moba/>
tar czf /tmp/ef-game.tgz $(grep -v '^\s*#' CLIENT_FILES.txt | xargs)
scp -i ~/.ssh/doctor_key /tmp/ef-game.tgz ubuntu@13.250.39.41:~/
ssh -i ~/.ssh/doctor_key ubuntu@13.250.39.41 'tar xzf ~/ef-game.tgz -C ~/ef-moba-game'
```

`CLIENT_FILES.txt` is the single source of truth — when new client files are added (e.g.
`hotkeys.html`), they go in that list and every deploy picks them up automatically. nginx serves
`~/ef-moba-game/` statically, so no service restart is needed for client-only changes.

---

The live game client at **`https://moba.etherfantasy.com/play/`** is the static tarball
built in **`server/DEPLOY_MOBA_SUBDOMAIN.md` step 1b** and unpacked into `~/ef-moba-game/`
on the game box (`13.250.39.41`). That tarball already lists every client file below —
**so a client refresh that re-runs step 1b ships all of these at once.**

> ⚠️ If your auto-deploy only re-tars `index.html`, the **`model_calibration.js`** and
> **`hero/`** changes below will NOT reach players. The run-speed + model fixes live in
> `model_calibration.js` and the `hero/*.glb` assets, NOT in `index.html`. Re-tar the full
> step-1b file list (it already includes them):
>
> ```bash
> tar czf /tmp/ef-game.tgz index.html pve.html launcher.html hotkeys.html model_calibration.js \
>         shared hero pets boss masters mons vrm wiki.html wiki_img audit.html
> scp -i ~/.ssh/doctor_key /tmp/ef-game.tgz ubuntu@13.250.39.41:~/
> ssh -i ~/.ssh/doctor_key ubuntu@13.250.39.41 'tar xzf ~/ef-game.tgz -C ~/ef-moba-game'
> ```
> nginx serves `~/ef-moba-game/` statically — no service restart needed for client-only changes.

## Pending client changes (raw client; obfuscation optional, see build/README.md)

Updated 2026-06-28 — all validated in isolation; testing uses the raw (non-obfuscated) client.

- **`model_calibration.js`** — `ANIM_RATE` per-hero run playback speed (fixes "legs cycle faster
  than the hero travels / foot-sliding"): `kai.run 0.6`, `leah.run 0.6`, **`irene.run 0.45`**
  (Irene's clip is authored fastest). Tunable single numbers if any still slides.
- **`index.html`** — hero/unit HP bars raised to clear the head (`u.h*1.6+0.8`); Kai Q = 180°
  frontal cleave + arc indicator; Master helpers (non-attackable until recruited, team-colour
  rings, commandable); guaranteed death-removal (no more 0-HP "won't die" units); First Blood
  banner + generated battle SFX + rain ambience; sprite VFX; **Shift+right-click order queue**
  (StarCraft-style) for hero/soldiers/workers; diagonal screen-edge camera pan.
- **`hotkeys.html`** (NEW) — standalone keyboard/mouse shortcuts guide, game-styled dark theme.
  Linked from `index.html` (login overlay + in-game ❔ help panel) and `launcher.html`. No inline
  JS; static page reachable at `/hotkeys.html`. Added to `build/build.mjs` htmlFiles.
- **`hero/Kai_Set_Default.glb`, `hero/Leah_Set_Default.glb`** — current model files; ensure the
  deploy pulls the latest copies from this repo (the run-speed fix is code-side in
  `model_calibration.js`, but the models themselves must be the up-to-date `hero/` assets).

If/when you want the hardened client, run `npm run build:prod` (CFF 0.3) and deploy `RELEASE/`
to `~/ef-moba-game/` instead of the raw files — same destination, see `build/README.md`.
