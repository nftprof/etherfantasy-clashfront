# EF Moba Lobby — protocol & integration contract

The lobby is a **separate service** from the authoritative game server. It owns
landing → PG login → rooms/matchmaking, then hands a formed group to the game
server. It never simulates the game.

```
 browser ──(wss, JSON)──► LOBBY (8090)            GAME SERVER (8080)
   login, rooms, ready          │  on launch, each client is told to ──► connect with the
                                │  same `party` id; the game server groups them onto teams
                                ▼
                       authoritative match
```

## Client → Lobby (WebSocket, JSON)
First message MUST be `auth`. Everything else is rejected until authed.

| msg | fields | meaning |
|---|---|---|
| `auth` | `token` | PG access token (or `dev:Name` when `PG_DEV_FALLBACK=1`) |
| `quick` | `mode` | join/auto-create the best open public room of this mode |
| `create` | `mode`, `name?`, `isPublic?` | make a room, become host |
| `join` | `code` | join a room by its 4-char code |
| `rooms` | — | request the public room list |
| `ready` | `ready` (bool) | toggle your ready flag |
| `slot` | `slot` (int) | choose your hero/champion id |
| `mode` | `mode` | host-only: change the room mode |
| `start` | — | host-only: begin the start countdown |
| `leave` | — | leave the current room |
| `friends` | — | fetch your PG friends (for party invites) |
| `chat` | `text` | room chat |
| `ping` | `at` | latency probe |

`mode` ∈ `1v1` | `2v2` | `coop` (co-op vs AI).

## Lobby → Client
| msg | fields | meaning |
|---|---|---|
| `hello` | `needAuth` | sent on connect |
| `auth-ok` | `username`, `id`, `source` | identity verified (source: `pg`\|`jwt-dev`\|`dev`) |
| `auth-failed` | `reason` | token rejected |
| `joined` | `code`, `you` (your connId), `gameUrl` | you entered a room |
| `room` | `code,name,mode,state,hostId,cap,countdownEndsAt,players[]` | full room state (broadcast on every change) |
| `rooms` | `rooms[]` | public room list |
| `friends` | `friends[]` | `{id,username}` from PG |
| `chat` | `from`, `text` | room chat |
| `launch` | `gameUrl,party,mode,vsAI,team,slot,seats[]` | **go connect to the game server** |
| `error` | `reason` | last action failed |

`players[]` = `{connId,username,team,slot,ready,isHost}`.
`state` ∈ `waiting` | `countdown` | `launched`.

## Integration contract with the authoritative game server (8080)
On `launch`, every player in the room receives the **same `party` id** plus their
`team` and `slot`. The client then opens the game WS (`gameUrl`) and joins. For the
game server to group exactly this set together (instead of first-come pairing), its
`join` handler should honor an optional `party`:

```js
// net/gateway.js — in the `join` branch, carry party + team through to the seat:
const seat = { seatId, name, slot, team: Number.isInteger(msg.team)?msg.team:0, party: msg.party||null, ws };
mm.enqueue(seat);

// net/matchmaker.js — prefer grouping by party before falling back to FIFO:
tryForm(){
  const need = config.TEAM_SIZE*2;
  // 1) any complete party of `need` seats → start immediately
  const byParty = new Map();
  for (const s of this.queue) if (s.party){ (byParty.get(s.party)||byParty.set(s.party,[]).get(s.party)).push(s); }
  for (const [pid, group] of byParty) if (group.length>=need){
    const picked = group.slice(0,need);
    this.queue = this.queue.filter(s=>!picked.includes(s));
    picked.forEach(s=>{ /* keep s.team from the lobby */ });
    const match=new Match(picked); /* … */
  }
  // 2) existing FIFO fallback for solo/quick joins …
}
```

This is the **only** change needed in the authoritative server, and it's additive
(party is optional; solo quick-match still works). Until it lands, a launched group
still connects and is paired FIFO — fine for 1v1.

## Notes
- The lobby is stateless across restarts (in-memory rooms). For one box / 200 ccu
  that's fine; a Redis-backed room store is a later (P4) concern, same as the game
  server's queue.
- Identity is server-verified: the client's token is exchanged for the canonical PG
  username; clients cannot spoof a name.
