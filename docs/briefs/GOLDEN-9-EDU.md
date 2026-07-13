# Golden-9 EDU parcels — the map.etherfantasy.com showcase set (2026-07-11)

> Get these 9 GOLDEN on the live designer first, then expand. All 9 verified locally with the current
> code (commit 11653cb+): valid (5 invariants), polygon floor + borders, varied world-field features.
> Standalone viewers of all 9 sent to the owner — the ground-truth of what the live designer should show.

## The 9 (variety: castle / river / road / plain forest)

| # | parcelId | shows |
|---|---|---|
| 1 | `60203670103` | **Westgate Castle** — wall ring + gates + towers + a road |
| 2 | `60202790016` | **river/road window** — the flagship continuous-world reference |
| 3 | `60203370158` | river parcel (the currently-pinned one) |
| 4 | `60203370004` | river parcel, different shape |
| 5 | `60203370001` | plain forest (narrow parcel) |
| 6 | `60203370006` | plain forest |
| 7 | `60200030000` | road-crossed parcel |
| 8 | `60200060000` | plain forest |
| 9 | `60203680173` | road parcel, near Southreach |

All PASS `validateBattlefield`; all `arena.shape:"polygon"` with real OOB-clipped floor; features
window in (castle/road/river as noted). `data/hexagon-city-source/l3/EDU.json` is the source; the
map-service generates them via `parcelFacts → worldParcel` (the fix in 11653cb).

## Make map.etherfantasy.com serve exactly these 9 (box session, needs SSH)

Prereq: the box runs the **latest** commit (≥ 11653cb — the world-field fix). The deploy session
last shipped 1bea6bb (2 commits behind); pull first.

```bash
cd ~/ef-map-checkout
git pull                              # to 11653cb+ (world-field fix: zone+bbox from local l3)
pm2 restart ef-map-service --update-env

# bust + regenerate exactly the 9 (delete cached dirs AND their index.json rows, then curl to regen)
IDS="60203670103 60202790016 60203370158 60203370004 60203370001 60203370006 60200030000 60200060000 60203680173"
pm2 stop ef-map-service
for id in $IDS; do rm -rf "$HOME/ef-battlefields/$id"; done
# drop their rows from the registry index so the in-memory index rebuilds clean:
node -e 'const fs=require("fs");const p=process.env.HOME+"/ef-battlefields/index.json";if(fs.existsSync(p)){const j=JSON.parse(fs.readFileSync(p,"utf8"));const ids=new Set("'"$IDS"'".split(" "));const rows=Array.isArray(j)?j:j.rows||j.designs;const kept=(rows).filter(r=>!ids.has(String(r.parcelId||r.id)));fs.writeFileSync(p,JSON.stringify(Array.isArray(j)?kept:{...j,rows:kept}));console.log("index pruned",rows.length,"->",kept.length);}'
pm2 start ef-map-service --update-env

# force fresh regen + verify each is polygon (not square fallback)
for id in $IDS; do echo -n "$id "; curl -s "http://127.0.0.1:8150/internal/v1/designs/$id" | grep -o '"shape":"[a-z]*"' | head -1; done
```

Then load each at `https://map.etherfantasy.com/designer/3d?parcel=<id>` — green polygon floor,
borders, trees, and the noted feature (castle/road/river). Once all 9 are golden, expand with the
full bake: `node map-service/tools/bake_zone.mjs EDU --out ~/ef-battlefields --force`.

⚠ The designer's land-PICKER still lists only the 648 parcels `/api/world` exposes — these 9 are
reachable by pasting the id in the picker box (or the URL). Showing all EDU in the picker is a
separate CF-overworld change (feed the picker the l3 snapshot).

**UPGRADE 2026-07-13 — the 9 now show the FULL GAME RENDER.** With the nine-layer kit wired
(`map-service/DEPLOY.md` §nine-layer), the same URLs render via `EF_BATTLEFIELD` (the MOBA's own
scene builder): draped terrain, real floor texture, baked splotches, glow, fog, lane ribbons,
HSL-varied trees, ridge rocks, scatter, fountain pads. Same box steps (pull + restart) — the HUD
chip must read **“🎬 game render (9-layer)”**, not “⛰ heightfield”.
