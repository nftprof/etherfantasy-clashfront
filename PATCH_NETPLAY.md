# EF Moba — Netplay patch / changelog (server-authoritative multiplayer)

**Audience:** the mobile/client build team and anyone whose pipeline rebuilds `/play`.
**Why this doc exists:** the live `/play` client and the game servers were extended this
cycle to support real server-authoritative multiplayer. If your build pipeline rebuilds
`index.html` from a checkout that does **not** contain these edits, it will **overwrite the
live bridge** and movement/multiplayer will break. Please pull these changes (or port the
diffs below) before your next `/play` deploy.

---

## 0. Source of truth & deploy paths (READ FIRST)

- **Canonical source:** `C:\Users\ADMIN\Desktop\EF Moba\` — `index.html` (client) + `server/` (Node).
- **Client build:** `cd build && npm run build:prod` → `RELEASE/` (obfuscated, domain-locked
  to `.etherfantasy.com`). Deploy `RELEASE/` to the `/play` static root on each game box.
- **There are two ways `/play` gets updated** — mine (build:prod → scp) and (possibly) your
  pipeline / the hourly auto-builder. **Coordinate** so we don't clobber each other. The live
  client must always contain the `netServer*` bridge below.
- **Live boxes:** `ca.moba.etherfantasy.com` (Montreal, 3.98.68.96) and
  `sg.moba.etherfantasy.com` (Singapore, 13.250.39.41). Landing: `moba.etherfantasy.com`.

---

## 1. Client (`index.html`) changes

### 1a. Lobby → server handoff bridge (the `?net=server` path) — **the critical one**
New functions (search for them): `netServerConnect`, `netServerOnMsg`, `netServerDraft`,
`netServerPick`, `netServerPicks`, `netServerLoadPick`, `netServerEnter`,
`netApplyServerSnap`, `netServerDropped`, and a boot IIFE that reads
`?net=server&ws=<wss>&party&team&slot&name`.
- Connects to the authoritative game server (`wss://<region>/game`), `join`s with the
  party/team from the lobby, sends inputs via `netSendInput`, and renders the server's
  snapshots through the existing **guest** render path (`NET.mode='guest'`).
- Without this block, a lobby-launched client has nowhere to send input and nothing to
  render — i.e. "no movement / just a map". **This is built and live now.**

### 1b. Champion-select DRAFT phase
On `{t:'draft'}` the client shows champion select with a 60s countdown; a card click calls
`netServerPick(i)` → sends `{t:'pick',slot}`, loads that hero's GLB (`srvHero<slot>`), then
sends `{t:'ready'}`. The match starts only when all players picked + ready (server gates it).
- Card onclick has a new branch: `if(window.mpMode==='server'){netServerPick(i);return;}`.

### 1c. Mobile joystick in server matches (BUGFIX)
`EF_TOUCH.init({onMove,onMoveEnd})`: in `NET.mode==='guest'` the stick now streams
`netSendInput({a:'move',x,z})` (throttled ~80ms) and `{a:'stop'}` on release. Previously it
only set a **local** target (`pHero.mvT`) which the server/guest path ignores → stick did
nothing online. (Desktop click-to-move already sent inputs.)

### 1d. Client-side prediction (latency hiding)
- `netSendInput`: captures movement intent into `NET.pred={on,x,z}` in **client coords**
  (before the red-side mirror).
- `netGuestFrame`: for `pHero` while predicting, moves the local hero toward `NET.pred` at
  hero speed (`HS=30`, must match `sim/state.js`) for instant feel; **snaps to the server
  position only on a >14u divergence** (flash/stun/death/desync). Converges to server pos
  when movement stops. Other units keep normal interpolation.

### 1d-2. Entity interpolation (smooth NPCs / other players)
`netApplySnap` records a timed history buffer per unit (`u.buf=[{t,x,z}]`, last 8).
`netGuestFrame` renders every unit EXCEPT the local hero ~110ms "in the past", lerping
between the two buffered snapshots bracketing that time → smooth motion for minions/towers/
enemies/allies at 15Hz (no stutter). Prediction is for the hero you control; interpolation is
for everything you don't. The idle local hero still tracks the latest snapshot snappily.

### 1e. "Play Again" for server matches (BUGFIX)
`netServerEnter` overrides the end-screen button to `location.href = location.origin + '/'`
(re-queue at the lobby) instead of `location.reload()`, which reloaded `/play` with the stale
`?party=` of the finished match (→ stuck on an empty map). Also resets `NET.pred=null`.

---

## 2. Server (`server/`) changes

- **Champion-select draft phase** (`net/match.js`): match starts in `phase:'draft'`, emits
  `{t:'draft',pickSec:60,seats}`, accepts `{t:'pick'}`/`{t:'ready'}` via `match.control()`
  (routed by `net/gateway.js` + `net/matchmaker.js`), goes live on all-picked+ready or a
  countdown `forceStart()`. `config.PICK_SEC=60`.
- **AI bots + NPCs** (`sim/systems/ai.js`, new): bot heroes fill empty team slots
  (co-op-vs-AI), minion waves (3/team/30s), tower targeting, neutral jungle aggro/leash.
  Wired in `sim/step.js` (AI → combat → movement). `sim/state.js` `makeWorld` bot-fills +
  spawns towers/jungle; helpers `coreOf`/`nearest`.
- **Tower-gating** (`sim/systems/combat.js`): a core is invulnerable while its team still has
  a standing tower (sets `core.shielded`). Stops lone-hero core rushes; makes towers/minions
  matter.
- **Matchmaker** (`net/matchmaker.js`): party groups keep lobby team assignment verbatim
  (co-op = all one team; bot-fill makes the opponents). Forms on the **expected party size**
  `ps` (lobby → URL `ps` → client `join` → `seat.ps`), so **solo-vs-AI (`ps=1`) starts
  instantly**; a `MATCH_GRACE_MS` (12s) timer forms with whoever's present so a party never
  hangs on a missing seat.
- **Snapshot rate** (`config.js`): `SNAPSHOT_HZ` 10 → 15 (smoother).
- **Region ping** (`lobby/index.js`): new CORS `GET /ping` returns `ok` for the landing's
  latency probe.

## 3. Lobby landing region picker (`lobby/public/index.html` + `config.js`)
`EF_REGIONS` (ca/sg) — the landing pings each region's `/ping`, auto-selects lowest,
colour-codes (green<80 / yellow<160 / red≥160), and gates a high-ping region behind an
"I understand" checkbox before Continue. Connecting to a region routes lobby + match to that
box (each box's lobby `EF_GAME_WS` = its own regional host).

---

## 4. How to smoke-test
1. Two browsers → `https://moba.etherfantasy.com` → pick Montreal (green) → Dev login (two
   names) → **1v1** → Quick Match.
2. Champion select + 60s countdown → both lock → match starts together; you see each other.
3. Move (desktop click **and** mobile stick) — should feel responsive (prediction).
4. You can't kill the enemy core until you down its towers; minions push lanes; co-op spawns
   AI bots.
5. After a match, "Play Again" returns you to the lobby to re-queue.

## 5. Hero abilities — PORTED (server-authoritative)
`sim/abilities.js` mirrors `shared/ef_core.js` kits (element → archetypes nova/line/ring/buff/
dash/blink + super) bound to pure-data combat primitives. `step.js` resolves `{a:'cast',i,x,z}`:
checks mana + cooldown, deducts, runs the archetype effect (damage/slow/dash/heal/haste).
Mana regen + cd + haste/slow timers tick in `step.js`; combat honors haste (2× atk spd),
movement+combat honor slow (0.5×). Client passes the champion **element** in `{t:'pick',el}` →
match → `makeWorld` → `buildKit`. AI bots get a deterministic element + kit too.
⚠ `sim/abilities.js` numbers must stay in sync with `shared/ef_core.js`.

## 6. Economy — PORTED (Phase C, server-authoritative)
- **XP/levels** (`state.js giveXp`): kills grant XP (hero 120 / tower 90 / wild 40 / minion 20),
  level at `level*100` XP, +60 maxHp +3 dmg per level (ability dmg also scales via `hero.level`).
- **Gold**: kills (hero 150 / tower 100 / other 50) + passive +1/s; held server-side.
- **Respawn** (`step.js`): dead heroes respawn at base after `6+lvl*2+min(10,t/90)`s — no permadeath.
- **Shop/items** (`sim/items.js`, mirrors client ITEMS): `{a:'buy',i}` → gold-gated, near-base-only,
  build-path upgrades (component consumed at discount), 6-slot cap; stat mods applied to the hero.
- **Snapshot** now carries `hr` (hero rich: hp/mp/lvl/gold/dead/respawn) so the client HUD + shop +
  death/respawn visibility work. `killUnit` centralizes kill rewards for both auto-attacks + abilities.
  ⚠ keep `sim/items.js` in sync with the client ITEMS list.

## 7. Paid play (PlayEscrow) — client wallet scaffolding shipped (INERT)
`index.html` now has `window.EF_CHAIN` (chainId 3344 / CT / `playEscrow:""` / rpc / explorer) and a
self-contained `window.efWallet` (lazy-loads ethers from CDN only when paid mode is used):
`connect()`, `ensureChain()` (add/switch Pentagon Chain), `ctBalance()`, `stakeMatch(matchId)`
(approve+`stake`), `payEntry()`, `ready()` (true once `EF_CHAIN.playEscrow` is set). Currently
**inert** (`ready()===false`) — ships safely before deploy; does nothing until the address is set.
**To flip ON once PlayEscrow is deployed:** set `EF_CHAIN.playEscrow` (+ confirm `ct`), relabel the
in-game "🏆 Tournament (1 💎CT)" button (`#tourOn`, currently fake local-storage CT via
`ctSpend/ctGet`) to "Paid Match · 10 CT", and wire the net=server paid flow: lobby `createGame` →
both clients `efWallet.stakeMatch(matchId)` → server polls `allStaked` → start → `settle` on win.
Spec: `fe-website/docs/PLAYESCROW_SPEC.md`. STILL NEEDED: server-side payments module (operator
wallet calling createGame/settle/refund/creditLoot) + the lobby orchestration.

## 8. Still pending (final phase)
- **D — Pets** (summon + pet kit), **evolution** (form upgrades), **jungle buffs**, **bot ability
  casting** (bots auto-attack only today), and **ability FX events** so non-casters see enemy
  spell visuals (damage already authoritative + visible via HP bars). Balance pass.
- **Ability FX for non-casters:** the caster sees their own FX (client plays it on cast); other
  players don't see enemy ability visuals yet (would need FX events in the snapshot). Damage is
  already authoritative + visible via health bars.
