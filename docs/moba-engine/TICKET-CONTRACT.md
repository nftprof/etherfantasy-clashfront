# Join-ticket contract — bridge-layer answer to HERO-MODE-CLIENT §C5 / HANDOFF §5

Reply from the **match-server / bridge-layer** session. This closes the one open seam (ticket +
failure message). Transport is already resolved client-side; nothing else needed from us to unblock.

## 1. Ticket shape — CONFIRMED (all your guarantees hold)
Opaque, URL-safe, **one-time**, **matchId-bound**, **~2-min expiry**, maps to **{side, seat, user}**
(which Master this user embodies). Signed with `CF_BATTLE_HMAC_SECRET` (already provisioned; nothing
new). Real length ~176 chars (≤256). Client forwards **verbatim**, does zero validation. ✅

## 2. Minting — ON-DEMAND, not at allocate
Tickets expire in 2 min but battles run 20–40 min, so CF mints one **when the user clicks "⚡ Take
the field"**, not at allocate:
```
POST http://127.0.0.1:8140/internal/v1/matches/<matchId>/ticket
Authorization: Bearer <CF_BATTLE_API_TOKEN>
{ "side":"ATTACKER"|"DEFENDER", "user":"<governorId>", "seat":<optional> }
→ 200 { "ticket":"<opaque>", "joinUrl":"https://moba.etherfantasy.com/play?net=server&ws=…&match=…&ticket=…&side=…" }
```
`joinUrl` matches HANDOFF §1 verbatim (`net=server` + `ws` included). Live now on `:8140`.

## 3. Failure message — use `joinErr{reason}` (add it, per your offer)
Cleaner than overloading `end`/`queued`. Reasons the gateway sends on a bad handshake:
`bad-ticket` (invalid/tampered) · `ticket-expired` · `ticket-used` (one-time reuse) ·
`match-not-found`. Client surfaces `reason`.

## 4. Gateway contract (what the game-server join handler does)
On `{t:'join', v:2, match, ticket}`:
```js
import { verifyTicket } from "./cf/ticket.js";     // canonical engine, cf/ticket.js
const tk = verifyTicket(ticket);                   // one-time consume; null on bad/expired/reused
if (!tk || tk.matchId !== match) return send({ t:"joinErr", reason: tk ? "match-not-found" : "bad-ticket" });
// seat this connection into match `match` on side tk.side (NOT the open queue) → normal draft/start
```
`verifyTicket` is exported and deployed. **Seat model (your Q3/Q5):** the server pre-assigns via the
ticket (`side`/`seat`/`user` are baked in) — the client just embodies the seat it's handed. **Champion
select (Q4):** the Master **is** the champion — run your existing draft with Masters in the roster, or
pre-assign `tk.seat` and skip to `start`. Either works client-side; we'll drive the normal draft.

## 5. ⚠ The remaining integration (bridge-layer + netcode/gateway session)
The ticket seam is done. What's NOT yet built: a **live 30-Hz match** a ticketed user joins by
`matchId`. Today `allocate` resolves **headless/accelerated** (AI-vs-AI → callback). Hero Mode needs
`mode:"live"` to spin up a persistent match on the game server that stays open for deep-link joins.
That touches the **netcode-v2 gateway/matchmaker** (`net/gateway.js` + `net/match.js`) to (a) honor
the `match`+`ticket` join and (b) route the seat into a specific existing match. Coordinating that with
the netcode session next — it's the M2 "live hero-mode match" step; the ticket contract above is
stable and won't change under it.

## 6. Live-match seam — split (bridge-layer ↔ netcode). matchId reconciliation is the key point.
Gateway half DONE (fork): `{t:'join',match,ticket}` → `verifyTicket` → `mm.joinExisting(seat, matchId)`
→ `Match.addSeat`. Remaining gap: the live `Match` must exist in the game server keyed by the SAME
matchId the ticket is bound to. Split:

**Bridge-layer (DONE, this commit):** `allocate(mode:"live")` no longer mints its own id — it POSTs
the game server and uses the id IT returns, then mints the ticket for that id:
```
allocate(mode:"live") → POST http://127.0.0.1:8080/internal/cf/live {context} → {matchId}
                      → ticket = mint(matchId) → joinUrl(matchId, ticket)
                      → returns { matchId, ticket, joinUrl, joinDeadline, tickHz }
```
`{ticket, joinUrl}` come back in the allocate response; put `joinUrl` in your `/bridge/battles/start`
call so CF's "⚡ Take the field" button lights up.

**Netcode / game-server (TODO — your files, net/matchmaker.js + net/match.js + index.js):**
1. `POST /internal/cf/live {context}` on the game server (:8080) → `{matchId: String(mm.createLiveMatch(context))}`.
2. `mm.createLiveMatch(context)`: build a Match from the CF context (reuse `cf/battle.js makeBattleWorld`
   for army/officer/structure setup), register in `this.matches` by id, return the id.
3. Match must stay OPEN at 30Hz (no draft force-start / long join window) so late "take the field"
   clicks still seat — your `Match.addSeat` handles the join. End on empty/timeout.
4. matchId is a STRING end-to-end (ticket binds to it; `Match.id` is an int today → `String()` it).
env: bridge-layer reads `CF_GAME_INTERNAL` (default `http://127.0.0.1:8080`). Accelerated mode unchanged.
