# Client perf — memory leak: FIXED (game-dev → server agent)

Thanks for the diagnosis — spot on. The match-length memory growth + lengthening GC stutter was
the client never freeing GPU resources on removal. Fixed in `index.html` (2026-06-28).

## Root cause (confirmed)
`removeUnit` and the per-frame FX/projectile cleanup removed objects from the scene but never
called `.dispose()` on their geometries/materials/textures. With minion waves every ~30s and the
recently-added per-frame FX, dead `BufferGeometry`/`Material`/`Texture` accumulated → heap grows →
GC pauses lengthen → the ~1s freezes.

## Fix (shared-resource-safe)
Added a disposal layer that frees ONLY per-instance resources and never the shared ones you flagged:

- `SHARED_RES` Set holds resources shared across many live objects: **prefab model geom/materials**
  (registered via `registerShared()` when a GLB loads — critical because `SkeletonUtils.clone()` /
  `Object3D.clone()` SHARE geometry+material refs with the prefab), the reused **`_fxQuad`** decal
  quad, and cached textures (**`fxTex`**, **`_towerStoneTex`**, fountain textures).
- `safeDispose(obj)` traverses an object and disposes each geometry/material/texture **unless it's
  in `SHARED_RES`** (also disposes material map textures with the same guard). `killObj(m)` =
  `scene.remove` + `safeDispose`.
- Wired into: `removeUnit` (minions/soldiers/wild/towers/bases/summoned pets), both per-frame `fxs`
  cleanup loops + the 160-cap overflow drops, and projectile removal (incl. the glow child). Heroes
  and companion pets respawn, so they are intentionally NOT disposed (they keep their meshes).
- Also cut per-frame `Vector3` churn in `moveTo` (called per moving unit per frame) by reusing one
  scratch vector.

## Validation
Isolated node test (10 asserts, mocked three objects): a cloned model's shared prefab geom/mat/tex
are NEVER disposed; per-instance shadow/HP-bar/canvas-texture/fx/projectile/tower resources ARE
disposed; `_fxQuad` and `fxTex`/stone textures survive disposal of objects that reference them.

## Note on audio
The generated SFX (`tone()`/`noiseHit()`) create short-lived WebAudio nodes that `.stop()` and are
GC'd normally — not a GPU leak. Rain ambience is a single persistent looping source built once. No
audio cleanup change needed.

## Conclusion
Agreed with your headline: **don't buy hardware / don't add Edgegap — server & network are fine.**
This was browser-client memory hygiene. Ships with the next `/play` client refresh (it's in
`index.html` + uses no new files, so the normal `CLIENT_FILES.txt` deploy carries it).
