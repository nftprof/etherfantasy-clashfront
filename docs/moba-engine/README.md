# MOBA engine & bridge-layer docs (human-readable mirror)

These are the **EtherFantasy MOBA engine + netcode + CF bridge-layer** docs, mirrored here so the
Clash Front / overworld side has the complete picture in one repo. They describe the engine that
resolves every CF battle.

> **Source of truth = the canonical MOBA repo `blockchainsuperheroes/etherfantasy-browser-moba-game`.**
> These are a human-readable snapshot. Edit the originals THERE (canonical-first); this folder is a
> mirror, not the working copy. Contracts authored on the CF side (`docs/briefs/ALLOCATE-CALLBACK-SCHEMA`,
> `TELEMETRY-RELAY`, `HERO-MODE-CLIENT`, `M1-HEADLESS-BATTLES`, `PVP-SERVER-REQUIREMENTS`) stay in
> `docs/briefs/` — this folder adds the ENGINE-side docs that live in the MOBA repo.

## Start here
- **`AGENT-GUIDE.md`** — the full onboarding bible for the whole project (3 products, 5 sessions, all
  GitHub locations, live infra, where to start reading, the component map, and **the 6 seams/handoffs**
  with the contract doc + code on each side). Read this first.

## The rest
| Doc | What |
|---|---|
| **`CF-INTEGRATION-PASSDOWN.md`** | **The whole CF↔engine seam in one page** — the L1 overworld > L2 command map > L3 hero-3D stack, per-seam status matrix (works/unverified/pending), coordinate contract that keeps L2 and L3 on the same map, the remaining callback + battlefield-from-JSON queue, and new-agent onboarding. Read after `AGENT-GUIDE.md`. |
| `BRIDGE-LAYER.md` | The bridge-layer / match-server component reference — what it owns (R1/R2/R10/R11/R12/R13 + ticket + relay), every endpoint, secrets, ops, and seam status. |
| `TICKET-CONTRACT.md` | Hero-mode join-ticket contract (mint/verify, joinUrl, `joinErr` failure enum) + the live-match seam split (§6). |
| `REALTIME-NETCODE-HISTORY.md` | The full net-mode lag investigation — root cause was a **client GC leak, not the network/AWS/Edgegap**. Lists everything ruled out so nobody re-chases it. |
| `PVP-NETCODE-V2.md` | The netcode v2 design: binary delta wire protocol, zero-GC decode, tick-domain render clock, lag compensation. |
| `PARITY-SCRUB.md` | Single-player ↔ server-sim parity audit (unit stats, waves, speeds) — grep before touching either side. |
| `CLIENT_PERF_FINDINGS.md` | The game-dev reply on the GPU-resource-disposal fix for the client GC leak. |
| `SERVER-README.md` | The MOBA authoritative-server README (`server/` overview). |

## The seams at a glance (full detail in `AGENT-GUIDE.md §5`)
- **A** CF ↔ bridge: `allocate` + HMAC callback (battle resolution) — `ALLOCATE-CALLBACK-SCHEMA.md`.
- **B** bridge ↔ CF: telemetry relay (command mode) — `TELEMETRY-RELAY.md`.
- **C** bridge ↔ MOBA client/gateway: hero-mode join ticket — `TICKET-CONTRACT.md`.
- **D** bridge ↔ netcode: live-match creation — the one open critical-path item (`TICKET-CONTRACT.md §6`).
- **E** maps ↔ bridge: Battlefield JSON — `MAP-GENERATOR.md`.
- **F** netcode ↔ client: the v2 binary protocol — `PVP-NETCODE-V2.md`.
