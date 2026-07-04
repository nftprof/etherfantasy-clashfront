# 12 — Environment: Day/Night & Weather (Canon)

> A living sky and drifting weather over the whole world — **deterministic, feather-light, and
> later a battle input** (fire spreads downwind, shorelines flood in a storm). This is not a
> bolt-on particle toy: it is one pure function `env(seed, tick, x, y)` that the **sim**, the
> **client**, and the **battle engine** all read. Zero state, zero per-frame simulation, O(1) per
> query — a browser game must stay light, so lightness is the first requirement, not an afterthought.

Owner: Sim (authoritative field) · Client (visuals) · Battle (inputs). Cross-refs:
[`01`](./01-world-simulation.md) (tick), [`04`](./04-battle-system.md) (battle inputs),
[`08`](./08-data-models.md) (schemas/constants), `AGENTS.md` (determinism).

## 0. Four principles

1. **Deterministic — no wall-clock in the sim.** `AGENTS.md` prime directive 6 forbids `Date.now()`
   inside simulation. The environment is a pure function of `(world.seed, tick, position)`. Same
   world + tick ⇒ identical sky and weather, everywhere, on replay. **Nothing is stored.**
2. **Server-timezone 24h clock, *without* reading the clock.** The world advances one tick per
   real minute ([`01`], `TICK_SECONDS=60`, `TICKS_PER_DAY=1440`). So `tick → time-of-day` already
   tracks reality; a fixed `SERVER_TZ_OFFSET` anchors tick 0 to a wall-clock hour **for display
   only**. The sim reads `tick`; the player sees a real 24h day/night that matches the server's
   timezone. Both true at once — that is the elegant part.
3. **Feather-light.** The entire engine is a handful of arithmetic ops and 2–4 value-noise samples
   per query. No allocation, no per-frame sim, no per-parcel particles. The client adds **one tint**
   and, optionally, **one scrolling overlay** — it degrades to just the tint on weak hardware.
4. **One source, three consumers.** The same `env()` runs in the sim (authoritative), the client
   (visuals), and the battle engine (inputs). No divergence, no sync protocol.

## 1. Time of day (day/night)

```
dayFrac      = (tick % TICKS_PER_DAY) / TICKS_PER_DAY        // 0..1, midnight→midnight
clock24      = ((dayFrac*24 + SERVER_TZ_HOURS) % 24)          // display only
sunElevation = sin(2π · (dayFrac − 0.25))                     // −1 midnight … +1 noon
```

- **Phases** from `sunElevation`: `NIGHT < −0.2 ≤ DAWN/DUSK ≤ 0.2 < DAY` (dawn vs dusk by the sign
  of the slope). Drives ambient light + tint.
- **Client tint (free):** one translucent full-map rectangle whose colour/alpha come from
  `sunElevation` — indigo night → gold dawn → clear day → amber dusk. Recomputed **once per
  sim-minute** (a CSS variable / a single fill), not per frame. Cost ≈ 0.

## 2. Weather: wind + rain (coherent, drifting, stored nowhere)

Sample a low-frequency value-noise field in space **and slow time** `t = tick · WEATHER_RATE`:

```
wind   = ∇⊥ fbm(x·Ws, y·Ws, t)        // curl of a scalar field → smooth, divergence-free wind
                                        // windDir = atan2, windSpeed = |·|·gustEnvelope
front  = fbm(x·Ps − wind.x·drift, y·Ps − wind.y·drift, t + 100)   // advected along the wind
precip = smoothstep(front, PRECIP_ONSET, 1)                       // 0..1 rain intensity
moist  = clamp(BASE_MOIST + PRECIP_WEIGHT·fbm(x·Ps, y·Ps, t·0.3)) // slow dryness field, for fire
```

- Rain fronts **drift downwind** because the precip field is advected by the wind sample — storms
  sweep across the map instead of flickering in place. The wind itself slowly turns as `t` advances.
- **Cost:** ~4 noise evals per query. A whole world's weather for a tick = a few hundred flops;
  the client only ever samples the visible view's centre.

## 3. Client rendering (browser-first, capped)

- **Day/night:** the one tint of §1. Free.
- **Rain:** *optional*, hard-capped. **Not** per-drop particles — a single seamless streak texture
  tiled over the viewport, **angle = windDir**, **scroll speed ∝ windSpeed**, **alpha ∝ precip**.
  One `drawImage` (or a CSS `background-position` animation) per frame; disabled below a quality
  flag. Wind can also bias the terrain's existing tree canopy jitter — no new geometry.
- **Everything degrades to the tint alone.** No new large assets; the streak tile is procedural.

## 4. Battle integration (FUTURE — Sim/Battle owned; this is the contract, not built here)

At battle start and each battle tick, sample `env` at the battle hex + tick → `EnvSample`:

- **Fire** spreads **downwind**, rate `∝ windSpeed · (1 − moist)`; **rain suppresses** it
  (`precip` cuts spread, extinguishes at high intensity). Dry + windy = a real firestorm.
- **Flood:** hexes within `COAST_BAND` of a shoreline under heavy `precip` gain a rising-water
  hazard; **onshore wind amplifies** it. Ties weather to the coastline geography ([`11` §3 ports]).
- **Wind** nudges projectiles / arrows / smoke drift — cosmetic-to-minor, always **within existing
  balance and the `HERO_IMPACT_MAX` firewall; never a pay-to-win lever.**
- **Determinism preserved:** every input is `tick`-derived, so battles stay replayable. Battle reads
  `env` as an **input**; it introduces no wall-clock coupling.

> Built by the sim/battle owners against this contract — request the hook, don't reach into
> `sim-engine` from the visual lane (`AGENTS.md`, brief coordination rules).

## 5. Data model (proposed — add to [`08`](./08-data-models.md) when adopted)

```ts
interface EnvSample {          // pure output of env(seed, tick, x, y); never stored
  dayFrac: number;             // 0..1
  sunElevation: number;        // −1..1
  phase: 'NIGHT' | 'DAWN' | 'DAY' | 'DUSK';
  windDir: number;             // radians
  windSpeed: number;           // 0..1 normalized
  precip: number;              // 0..1
  moisture: number;            // 0..1 (fire dryness = 1 − moisture)
}
```
Proposed constants (⚙ balance, `❓ OPEN` until the hub adopts): `SERVER_TZ_HOURS`, `WEATHER_RATE`
(day-scale drift), `PRECIP_ONSET`, `COAST_BAND`, `BASE_MOIST`, `PRECIP_WEIGHT`.

## 6. Reference implementation (drop-in, pure, allocation-free)

```js
// env.js — shared verbatim by sim, client, and battle. ~30 lines, no deps, no state.
const TICKS_PER_DAY = 1440, TAU = 6.28318530718;
function h2(x, y, s){ let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,2246822519))|0;
  h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296; }
function vn(x, y, s){ const ix=Math.floor(x),iy=Math.floor(y); let fx=x-ix,fy=y-iy;
  fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy);
  const a=h2(ix,iy,s),b=h2(ix+1,iy,s),c=h2(ix,iy+1,s),d=h2(ix+1,iy+1,s);
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy; }
function fbm(x, y, s){ return 0.5*vn(x,y,s)+0.3*vn(x*2,y*2,s+1)+0.2*vn(x*4,y*4,s+2); }
export function env(seed, tick, x, y, cfg = {}){
  const Ws=cfg.Ws??0.12, Ps=cfg.Ps??0.18, RATE=cfg.rate??0.0008, TZ=cfg.tzHours??0, e=0.6;
  const t=tick*RATE, s=(seed|0);
  const dayFrac=(tick%TICKS_PER_DAY)/TICKS_PER_DAY;
  const sun=Math.sin(TAU*(dayFrac-0.25));
  // curl of a scalar potential → smooth, swirl-free wind
  const p=(xx,yy)=>fbm(xx*Ws,yy*Ws,s+7)+0.5*t;
  const wx=(p(x,y+e)-p(x,y-e))/(2*e), wy=-(p(x+e,y)-p(x-e,y))/(2*e);
  const windSpeed=Math.min(1,Math.hypot(wx,wy)*3.2), windDir=Math.atan2(wy,wx);
  const drift=6;
  const front=fbm((x-wx*drift)*Ps,(y-wy*drift)*Ps,s+11)+0.4*t;
  const precip=Math.max(0,Math.min(1,(front-(cfg.onset??0.62))/0.18));
  const moisture=Math.max(0,Math.min(1,0.35+0.5*fbm(x*Ps,y*Ps,s+13)+0.4*precip));
  const slope=Math.cos(TAU*(dayFrac-0.25));
  const phase=sun<-0.2?'NIGHT':sun>0.2?'DAY':slope>0?'DAWN':'DUSK';
  return { dayFrac, clock24:((dayFrac*24+TZ)%24), sunElevation:sun, phase, windDir, windSpeed, precip, moisture };
}
```

## 7. Cost & determinism guarantees

- **No `Date.now()` / `Math.random()` in the sim.** The client may read the real clock **only** to
  decide which tick to display when idle — purely cosmetic, never fed back into state.
- **O(1) per query, no allocation, no per-frame sim.** Client adds ≤1 tint fill + ≤1 overlay draw.
  Mobile/low-end safe by construction; the overlay is behind a quality flag.

## 8. Rollout (each phase cheap and independently shippable)

- **Phase A — client-only atmosphere (visual lane):** day/night tint + optional rain overlay driven
  by `env()` reading the world `tick` from the snapshot (or the real clock while idle). No gameplay,
  no sim change. Needs **one** bootstrap hook to mount the overlay — request from the hub.
- **Phase B — sim exposes `EnvSample`** in the world snapshot (authoritative); client switches from
  local `env()` to the served value. Sim work.
- **Phase C — battle inputs** (§4): fire/flood/wind. Battle work, against the §4 contract.

## 9. Open questions (product owner)

- Day length: real 24h (`1440` ticks, matches the server clock) or compressed for pacing?
- `SERVER_TZ_HOURS` anchor (Montreal vs Singapore shards — one global clock, or per-shard local time?).
- Weather granularity: one global system, or per-region climate bias (desert frontier drier, coasts wetter)?
- Fire/flood balance + whether weather is ever *decisive* (North Star: it must not decide a war alone).
