# map-explorer-reference — original hexagon-city land-map client (READ-ONLY reference)

This is a **verbatim copy** of the original interactive map explorer from
`blockchainsuperheroes/_archive-cryptoverse-frontend`. The live deployment
(`map.hexagon.city`) is **decommissioned** (returns 404; land API `api.hexagon.city/land/*`
also 404s), so this code + the extracted SVGs in the parent folder are the surviving copy.

It is committed **for reference only** — it will NOT build as-is here (it depends on the old
Next.js 12 app: auth, SWR, `@vendors` path alias, and `api.cryptoverse.vip`/`api.hexagon.city`).
Use it to understand the rendering/interaction, then reuse the assets + approach in a fresh viewer
(see MAP-EXTRACTION-REPORT.md §7).

## What it does
Three.js + `SVGLoader` WebGL explorer that loads all L1/L2/L3 SVGs and supports:
zone select → drill into parcels → drill into L3 singles, zoom/pan (`TrackballControls`),
zoom-to-parcel, search-by-token, and live "sold" tinting from the land API.

## Files
| path | role |
|---|---|
| `vendors/LandMap/LandMap.js` | **core engine** — scene, load SVGs, raycast select, `goToTokenId`, `goToChild`, L3 drill-in, sold coloring |
| `vendors/LandMap/CreateScene.js` | Three.js scene/camera/renderer/controls setup |
| `vendors/LandMap/Defaults/Defaults.js` | `sizeMapper`, `tokenMapper`, `landHexColors` (also in ../zone-layout.json) |
| `vendors/LandMap/Helpers.js` | token-id encode/decode (`padTokenId`, `padTokenIdL3`) |
| `vendors/LandMap/Gui.js`, `Experiences/` | dat.GUI toggles / experience hooks |
| `components/ui/landMap/WebGL.tsx` | React wrapper (view-only map); `ActiveToken.tsx` info panel |
| `components/ui/landSelector/*` | mint/selector UI variant: `SearchForToken`, `Help`, `TokenLegend`, `ResetMap`, `MapVisibility`, `SelectedTokenList`, etc. |
| `pages/land-map.tsx` | entry page mounting the view-only explorer |
| `pages/land-selector.tsx` | entry page mounting the selector/mint explorer (auth-gated) |

## Original dependencies
`three@^0.140`, `next@12.2.5`, `react@18`, `swr@^1.2`, `@heroicons/react@^1`.
SVG assets are loaded from `/svg/{l1,l2,l3}/<ZONE>.svg` → here they are `../svg/` (L1+L2) and
`../l3/*.json` (L3 geometry embedded as `svgPath`).

## Rebuild note
To make a runnable no-backend viewer: keep `LandMap.js` + `CreateScene.js` + `Defaults.js` +
`Helpers.js`, point the SVG loads at the committed assets, and drop the SWR/auth/mint layers and the
`/land/minted/*` polling (or replace with a static owners list). Everything else is app coupling.
