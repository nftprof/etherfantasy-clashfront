# PVP Netcode v2 — modern MOBA net layer (up to 5v5)

> Fable-5 redesign pass, 2026-07-02. Read `../REALTIME-NETCODE-HISTORY.md` first for what was
> already tried/ruled out. **Verdict: the architecture (server-authoritative 30Hz + prediction +
> interpolation) is the same model League/AoV/Dota use — it stays. What gets rebuilt from scratch
> is the WIRE LAYER, which was the actual legacy sin.**

## Measured baseline (why v2 exists)

Benchmarked headless 5v5, 180 sim-seconds, 57 live units (steady state):

| Metric | Value | Meaning |
|---|---|---|
| `step()` cost | **6.9 µs/tick** | ~4,800 concurrent 5v5 matches per core. Sim is a non-issue. |
| Snapshot (JSON) | **7,011 bytes/tick** | 1.68 Mbps **per client**; 16.8 Mbps per 5v5 match |
| Client GC load | ~210 KB/s of `JSON.parse` garbage | Feeds the exact GC-freeze disease from the history doc |
| Tick-to-tick identical units | **56 / 57** | Delta encoding collapses the payload ~40–70× |

The 2026-06-28 investigation proved the "lag" was client main-thread freezes (GC), not the
network. v1's protocol *manufactures* garbage at 30Hz. v2 makes the steady-state wire cost
~100–200 bytes/tick and the decode zero-allocation.

## What stays (deliberately)

- **Server-authoritative fixed 30Hz sim** (`sim/` — pure, deterministic, headless-proven).
- **Client-side prediction + ack-gated reconciliation** (`_ack >= seq`) for own hero.
- **Entity interpolation** for remote units (buffer unchanged, but see clock sync).
- **WebSocket transport.** TCP = reliable+ordered, which v2 *exploits*: delta-vs-previous-tick can
  never desync, so no ack/baseline machinery. HOL blocking is a theoretical cost; at 36ms wired it
  did not appear in any measurement. Phase-3 option (only if real player data shows loss-induced
  stalls in the netgraph): WebRTC DataChannel (geckos.io-style) or WebTransport behind the same
  codec. **Edgegap: still a distribution/ops tool, not a netcode fix — revisit at global launch.**

## The v2 wire protocol (binary, delta, versioned)

Negotiation: client sends `v:2` in its `join`. Old clients keep getting v1 JSON — both paths
coexist; normal MOBA unaffected until the client ships.

All packets little-endian, first byte = type:

```
0x01 SNAP_FULL   header + every unit (join keyframe + every 150 ticks belt-and-braces)
0x02 SNAP_DELTA  header + changed units only + removals + hero-rich deltas
```

**Header (13B):** type u8 · tick u32 · serverTimeMs u32 (low 32 bits) · winner i8 · flags u8 ·
unitCount u16.

**Unit (full, 16B):** uid u16 · kind u8 (shared enum `hero,minion,tower,core,pet,wild,soldier,base`)
· team u8 · slot u8 · owner i16 (seatId, −1 none) · x i16 (÷100 m) · z i16 · hp u16 · maxHp u16 ·
state u8 (`idle,move,attack,dead`) · pad u8.

**Unit (delta):** uid u16 · mask u8 — bit0 pos (x i16, z i16) · bit1 hp (u16) · bit2 state (u8) ·
bit3 maxHp (u16). Typical mover = 7B. New units appear as full records (mask 0xFF sentinel);
removals = uid list.

**Hero-rich (delta, per changed hero):** uid u16 · mask u8 — mp u16 · lvl u8 · gold u32 · dead/rt
u8+u8 · ack u16 · kills/deaths u8 u8 · cs u16.

Expected steady-state: **~150–400 B/tick ≈ 6–12 KB/s per client** (~40–70× less than v1), and the
client decodes straight off the `ArrayBuffer` into preallocated typed stores — **zero garbage per
tick**.

## Clock sync (fixes interpolation the right way)

v1 interpolated by *arrival time* (`performance.now()` at receive) — so transport jitter and
main-thread stalls directly wobbled remote units. v2: every packet carries `serverTimeMs`; the
client keeps an EWMA estimate of `offset = serverTime − localNow` (min-filtered over the ping
samples), and renders remote units at `estimatedServerTime − interpDelay`. Interp delay stays
adaptive (capped 130ms, from the earlier tuning). Result: smoothness is decoupled from arrival
jitter; a late packet no longer time-warps the world.

## Lag compensation (the never-built lever)

Server keeps a **position ring buffer**: per unit, 32 ticks (~1.07s) of `{x,z}`. Every input the
client sends now carries `vt` = the server tick the player was *looking at* (their render tick,
known thanks to clock sync). `validate.js` clamps it (≤ 800ms rewind, never future).

Applied where it changes feel:
- **`atk` (click-to-attack):** acquisition uses the target's rewound position for the range check —
  "I clicked him where I saw him" always acquires; the chase logic then proceeds live.
- **`cast` (skillshots/AoE):** ability hit-tests resolve against enemy positions rewound to `vt` —
  the spell lands where the player aimed on *their* screen.

Rewind only affects hit RESOLUTION, never movement/state, so determinism and the headless
verifier are unaffected (inputs including `vt` are journaled; replay reproduces identical rewinds).

## 5v5 enablement (small, config-level)

- `lobby/rooms.js` MODES += `3v3`, `5v5` (perTeam 3/5, teams 2).
- `makeWorld`: fan heroes around the spawn point (offset ring) instead of stacking 5 on one spot.
- `config.TEAM_SIZE` already parameterized; matchmaker party-size flow (`ps`) already handles N.

## Rollout

1. Server: `net/proto.js` codec + `sim` position history + rewind hooks + `vt` validation.
   v1 JSON path untouched (protocol chosen per-connection).
2. Client (guest path only): `v:2` join, ArrayBuffer decode, clock-sync render time, netgraph
   gains `kbps` + `clkOfs` rows. Prediction/reconciliation code unchanged.
3. Tests: codec round-trip, delta-chain integrity, rewind determinism, goldenmaster green.
4. Deploy Montreal → playtest (netgraph: ping steady, kbps ~6–12, no freezes) → Singapore.
