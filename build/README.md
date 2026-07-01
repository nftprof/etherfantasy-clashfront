# EF Moba — production client build (SOURCE → RELEASE)

Two-tier shipping, like the other project:

- **SOURCE** = this repo. Readable, what you develop on. Never deployed directly.
- **RELEASE/** = generated, hardened mirror. Every line of *your* JavaScript — the
  inline `<script>` game code in `index.html` / `pve.html` and the `shared/*.js` +
  `model_calibration.js` modules — is run through **javascript-obfuscator** (string-
  array + base64 encryption, control-flow flattening, object-key transforms, number-
  to-expression, self-defending, optional domain-lock). The result is unreadable and
  can't be casually downloaded-and-rebuilt. This is what you deploy / zip / ship.

Assets (`.glb`, `.png`, `wiki_img/`) and data (`mon_lineage.json`) are copied **as-is** —
by design; the art is your IP and you're happy for it to travel.

## Use
```bash
npm install            # once — pulls javascript-obfuscator (+ cross-env)
npm run build          # → RELEASE/   dev strength, no domain lock (works on file://)
npm run build:prod     # → RELEASE/   CFF 0.3 (frame-loop friendly) + locked to *.etherfantasy.com  ← USE THIS for /play
npm run build:heavy    # → RELEASE/   CFF 0.75 (harder to read, noticeably slower 60fps loop)
npm run build:max      # → RELEASE/   max armor (slowest runtime); console stripped — menus/landing only
```
> **Testing = no obfuscation.** While iterating, serve the raw `index.html` (or `npm run build`)
> for full FPS. Only `build:prod` for production. We deliberately set production to **CFF 0.3**:
> `0.75` measurably dropped the realtime frame rate, which read as "the game is slow" — 0.3 keeps
> the obfuscation meaningful while staying smooth.
Then deploy `RELEASE/` exactly where you'd have put SOURCE (e.g. the `/play` static root
in `server/DEPLOY_MOBA_SUBDOMAIN.md`). Nothing else changes.

## Knobs (env vars)
| var | default | effect |
|---|---|---|
| `CFF` | `0.5` | control-flow-flattening threshold 0–1. Higher = harder to read, **slower at runtime**. |
| `DEAD` | `0` | `1` = inject dead code (more confusing, bigger, slower — off for the game loop). |
| `STR` | `0.8` | fraction of strings moved into the encrypted string-array. |
| `DOMAIN_LOCK` | _(none)_ | e.g. `.etherfantasy.com` — obfuscated code refuses to run on any other domain. Leave empty for local testing. |
| `STRIP_CONSOLE` | `0` | `1` = neuter `console.*` in the release. |
| `SELFDEFEND` | `1` | self-defending code (breaks if someone re-formats/beautifies it). `0` to disable. |
| `OUT_DIR` | `RELEASE` | output folder name. |

## Why obfuscator-only (not esbuild/rollup bundling… yet)
Bundlers (esbuild/rollup) shine when code is **ES modules** with `import`/`export`. This
game is intentionally classic single-file HTML: the inline scripts talk to each other
through **globals** (`window.EF_CORE`, `EF_TOUCH`, `MODEL_CAL`, CDN `THREE`). Running a
bundler over that today risks renaming/breaking those globals for no protection gain —
the protection you want comes from the **obfuscator**, which is what this build applies.
The obfuscator is configured with `renameGlobals:false` + `reservedNames` so the cross-
file API stays intact. If/when the client is refactored to real ES modules, add an
esbuild bundle step *before* the obfuscate step here — the pipeline is structured for it.

## Realtime caveat (read this)
Control-flow flattening and dead-code injection genuinely slow JS down. For a 60fps
Three.js game that matters. Defaults (`CFF=0.5`, `DEAD=0`) are tuned to keep the frame
loop healthy. **Test `RELEASE/` in a browser and watch the FPS** before shipping; if it
dips, lower `CFF` (e.g. `CFF=0.3`). `build:max` is for menus/landing-type pages, not
necessarily the hot game loop.

## What this does and doesn't protect
- ✅ Stops "view source → understand → rebuild": the logic is mangled + encrypted.
- ✅ `DOMAIN_LOCK` stops a lifted copy from running on a random domain.
- ❌ Nothing client-side is *uncopyable* — a determined reverser can still trace it.
  Your real moat is the **server-authoritative backend** (accounts, economy, matchmaking):
  a ripped client is a demo, not a competitor. Obfuscation just raises the floor.

## Files
```
build/build.mjs     the builder (config at the top: which html/js/assets)
build/README.md     this file
package.json        npm scripts + devDependencies
.gitignore          ignores RELEASE/ and node_modules/
```
To add/remove entry files or asset folders, edit `CONFIG` at the top of `build.mjs`.
