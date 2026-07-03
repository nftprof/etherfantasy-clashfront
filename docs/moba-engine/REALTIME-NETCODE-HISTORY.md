# EF Moba — real-time netcode investigation: complete history & handoff

> **Audience:** a fresh session (e.g. Fable 5) tasked with **making real-time, server-authoritative
> PvP feel as good as single-player**. Read this cold — it's self-contained. It lists everything
> tried, what was ruled out (don't re-chase these), the current best diagnosis, and the untried
> levers. Goal: solve *live human-vs-human PvP sync* directly, OR confirm it can't be worth it and
> the client-authoritative+verify path (below) is the answer.

---

## 0. TL;DR

- **Single-player is smooth** ("smooth like butter"). **Net-mode (server-authoritative) felt broken**:
  "jumping back and forth", "arrow not shooting", "can't attack for ~5s", "minions come late then
  fast".
- We chased it for a long time. **Final diagnosis: it was NOT the network, the server box, TCP, or
  hosting location — it was a CLIENT-SIDE memory/GC leak** that froze the browser main thread ~1s at
  a time, worsening as the match ran. Proven by video: **ping ballooned to ~1000ms while snapshots
  kept arriving at a steady 30Hz** (impossible for a real network fault → the thread was frozen).
- **Two leak fixes were made and deployed but NOT yet verified by a playtest.** Verifying them is
  step 1 for any continuation.
- Strategic pivot (product decision): **client-authoritative + server-verified** (client runs the
  sim, server re-runs it headless to verify by hash) so we can launch WITHOUT solving real-time
  human-vs-human sync. That path is being built (deterministic sim + headless runner already done).
- **The open problem for this session:** is real-time server-authoritative PvP worth making feel
  native, and if so, how? The one big **untried** lever is **lag compensation**.

---

## 1. The architecture (facts)

- **Game client:** a single-file browser Three.js game (`index.html`, served at `/play`). It has
  **its own game logic** for local play, PLUS a "net/guest" path (`netGuestFrame`, `netApplyServerSnap`)
  that renders a server-driven world. It is NOT the same code as `server/sim/` (relevant later).
- **Authoritative server:** `server/` — Node, `net/gateway.js` (WSS), `net/matchmaker.js`,
  `net/match.js` (Match lifecycle: draft → live → end; a `setInterval` tick loop), `sim/` (pure
  deterministic sim: `makeWorld`, `step`, seeded `rng`), `snapshot.js` (`encodeSnapshot`).
- **Tick/broadcast:** 30 Hz sim tick, 30 Hz snapshots. `config.TICK_HZ=30`, `SNAPSHOT_HZ=30`.
- **Two EC2 boxes:** Singapore `13.250.39.41` (`moba.etherfantasy.com`), Montreal `3.98.68.96`
  (`ca.moba.etherfantasy.com`). User is in **Toronto** → Montreal is ~36ms, Singapore ~230ms.
  ⚠ **Picking a region in the lobby routes the LOBBY websocket too, not just the game server** — so
  "test on Montreal" means the whole session (lobby+game) is on the Montreal box.
- **Netcode already present in the client** (the guest path): **client-side prediction** (own hero
  moves instantly), **server reconciliation** (ack-gated: only correct once `u._ack >= seq`),
  **entity interpolation** (remote units rendered ~interp-delay ms in the past, lerped between
  buffered snapshots), **fixed tick**. **Lag compensation was never built** (see §5).

---

## 2. The symptoms (verbatim, they matter)

- Single-player / pure-local: **"smooth like butter."**
- Net-mode (grind-vs-AI and co-op-vs-AI on the server): "I am still jumping back and forth and my
  arrow is not shooting"; "I can barely attack NPC… it's as if we don't see each other for like 5
  seconds… I can see it on screen but my char is not attacking it"; "starting troops don't come out
  till 10 seconds later and then very fast."
- Note: the **12s first-minion-wave** is a *design timer* (`sim/state.js waveT:12`), identical on
  every client and on the server — NOT a bug. Don't chase it.

---

## 3. Everything we tried (chronological)

1. **Made single-player pure-local.** Grind/practice stopped using the server (`/play?solo=1`) →
   instantly smooth. This is why single-player is fine: zero round-trip.
2. **Built audit-gated grind loot** (local play → server audits the result → pays loot). Sidestepped
   net-mode for the money mode. Worked.
3. **Region routing.** Added a region picker (Singapore + Montreal) with ping display. Moved testing
   to Montreal (~36ms) to remove distance as a variable. Discovered region also routes the lobby.
4. **TCP_NODELAY (Nagle off).** `ws._socket.setNoDelay(true)` in `gateway.js` — confirmed **already
   deployed** (process started after the file was saved). Nagle was not the cause.
5. **Netgraph instrumentation** added to the client (press **N** in net mode; **[** / **]** tune
   interp). Shows: ping, jitter, snap Hz, interp ms, hardSnap (own-hero reconcile teleports),
   remoteTp (interp breaks), fps, gameT, sim drift (wall-clock − sim seconds). **This tool exists and
   is the right way to measure — use it.**
6. **Adaptive interpolation delay**, then **capped it to 130ms** (was ballooning to 250ms). Raising
   interp smooths remote motion but makes "attack what you see" worse (you see enemies further in the
   past); this is a real tradeoff, tuned but not the root cause.
7. **Ruled out the AWS box / "shared vs dedicated".** Box load average **0.01**, game server **0%
   CPU / ~68MB**, clean 30Hz ticks, zero server errors. Dedicated hardware would change nothing.
8. **Ruled out Edgegap.** It solves global server *distribution* + ops/autoscale, not netcode. The
   server was already ~36ms away and the fault was client-side, so Edgegap wouldn't help this.
9. **THE SMOKING GUN — video frame analysis.** From a 40s screen recording of a Montreal co-op match
   (extracted frames of the netgraph):

   | t | ping | jitter | snap | hardSnap | remoteTp | fps |
   |---|------|--------|------|----------|----------|-----|
   | 14s | 36ms | ±19 | 29.7Hz | 0 | 0 | 117 |
   | 30s | **1063ms** | ±1110 | 30.8Hz | 0 | 0 | 82 |
   | 36s | **1084ms** | ±1096 | 29.5Hz | 4 | 2 | 89 |

   **ping shot to ~1000ms while snap held a steady ~30Hz** — impossible for a network problem
   (snapshots kept arriving on time). The browser **main thread was freezing ~1s at a time**, so the
   `performance.now()`-measured ping only *looked* like 1s. And **it got worse as the match ran** =
   a leak/accumulation. `fps` stayed ~89 because it's a smoothed EMA that hides a 1s freeze + a burst
   of fast frames — which is why "fps looked fine" the whole time while the game felt terrible.

10. **Found the leak.** `removeUnit()` (in `index.html`) removed dead units from the scene but
    **never `.dispose()`d** their THREE geometries/materials/textures (the whole client had only **2**
    `.dispose()` calls). Plus `netApplyServerSnap` **re-created every gold-drop marker from scratch on
    every snapshot (30Hz)** and never freed the old ones. Minion waves + kills → unbounded GPU/JS
    growth → lengthening GC pauses → the 1s freezes.
11. **Fixed the leak (two complementary fixes, deployed to both boxes' `/play`):**
    - Drop-marker **pool** in `netApplyServerSnap` (reuse one geom/material, show/hide — no per-tick
      reallocation).
    - A **shared-resource-safe disposal layer** (`safeDispose`/`killObj`/`SHARED_RES`) wired into
      `removeUnit`, the FX loops, and projectiles; plus a `moveTo` Vector3 reuse. (`SHARED_RES` guards
      prefab models / cached textures so living units aren't corrupted.)
12. **Reverted, then re-added.** At various points we stripped net features back to pure single-player
    to isolate the problem, then re-introduced the server path. The leak was the constant; distance,
    Nagle, obfuscation, and interp tuning were all red herrings (each helped or hurt feel a little but
    none was the cause).
13. **Obfuscation note:** the obfuscated build's control-flow-flattening adds real per-frame CPU cost
    (raw client is smoothest). For launch: ship **rename+minify only** (no CFF, no string-array) —
    near-zero runtime cost. Not the root cause, but it compounds frame-budget pressure.

---

## 4. ⚠️ STILL UNVERIFIED — do this first

**The leak fixes (§3.11) are deployed but were never confirmed by a playtest.** Before building
anything new: play a **30–40s Co-op-vs-AI on Montreal with kills** (kills drop the loot markers that
used to leak) and read the netgraph. **Success = ping HOLDS ~36ms for the whole match** (instead of
climbing to 1000ms), hardSnap/remoteTp stay ~0. If it holds, the "lag" is essentially solved and the
only remaining item is combat *feel* (§5). If it still climbs, there's another leak source.

---

## 5. What was NEVER tried — the real levers left

1. **Lag compensation** (the big one). The server keeps a short history of unit positions; when your
   attack input arrives, it **rewinds targets to where they were on YOUR screen** (your view-time =
   now − interp − ½RTT), resolves the hit there, applies damage. This is what makes "I see it, I hit
   it" work in every latency-tolerant action game. It's the direct fix for "can't attack what I see,"
   and it **keeps the current snapshot architecture** (it's a hit-resolution change, not a rewrite).
   **Not built. This is the highest-value untried thing.**
2. **Client runs the shared `server/sim/`** (deterministic authority in the browser, render on top).
   Today the client has its own game logic, so it can't be bit-verified against the server and can't
   do true prediction of server logic. Unifying them enables both perfect prediction and the
   client-hosted-verify model. Large effort ("hero-client drop-in").
3. **Full determinism polish:** `Math.hypot` → `sqrt(dx*dx+dz*dz)` for cross-browser bit-identity
   (V8↔V8 is already fine). Minor.

**Do NOT re-try (ruled out):** blaming the network/route, buying a dedicated/bigger AWS box,
integrating Edgegap, "it's Nagle", "it's obfuscation", "it's the 12s minion timer". All investigated
and eliminated.

---

## 6. The strategic pivot (context for why headless exists)

Because real-time human-vs-human sync is hard and single-player is already great, the product decision
was: **client-authoritative + server-verified.** The client runs the game and relays its result +
input journal; the server **re-runs the same deterministic sim headless and verifies by hash** (a
doctored result won't reproduce). This lets us **launch without solving real-time PvP sync** — the
only thing given up is live human-vs-human battles (async/AI-vs-AI and verified client-hosted results
all work). This also feeds the 4th title, **Clash Front** ("one engine, two products").

**Already built for this (all tested, `npm test` in `server/`):**
- `server/headless.js`: `runBattle(context) → report` (headless fast-forward of `step()`),
  `worldChecksum` + `journalHash` (tamper-proof), `verifyResult` (rejects forged results).
- The sim was audited **deterministic** (seeded rng, only `sqrt`/`hypot`, Map insertion-order loops).
  **Fixed a real bug:** unit `uid` was a module-global counter → now per-world (`world._uidSeq`), so
  runs/replays are reproducible and uid-referencing inputs replay correctly.
- **Finding:** the seed is plumbed but **no system consumes `world.rng` yet** → battles are
  deterministic regardless of seed (fine for verification; add rng draws if you want variety).

---

## 7. Tooling & where to look

- **Netgraph** (measure, don't guess): press **N** in a net-mode match; **[** / **]** adjust interp.
- Client net path: `index.html` → `netGuestFrame` (prediction/reconciliation/interpolation),
  `netApplyServerSnap` / `netApplySnap` (snapshot → world), `netServerConnect` (WS + ping loop).
- Server: `server/net/match.js` (tick loop `setInterval` + snapshot broadcast), `server/sim/step.js`
  (the pure tick), `server/snapshot.js` (`encodeSnapshot`).
- Determinism/headless: `server/headless.js`, `server/test/{goldenmaster,headless.test}.js`.
- Deploy: `bash deploy_client.sh` ships the full `CLIENT_FILES.txt` manifest to **both** boxes via
  `~/.ssh/ef-moba-deploy`. Client-only changes need no restart (nginx serves `~/ef-moba-game/`).

---

## 8. Suggested plan for this session

1. **Verify the leak fix** (§4) — one playtest. Likely the "lag" is already largely gone.
2. If combat still feels off at low, steady ping → **build lag compensation** (§5.1). This is the
   real answer to "server PvP that feels native," and it's self-contained.
3. Only if 1–2 don't get there → consider the **shared-sim client** (§5.2) or accept the
   client-authoritative+verify path (§6) as the launch answer for anything real-time.
