# AI Map Build — user-facing "AI designs my parcel" service (owner 2026-08-06)

**The proven loop, productized.** The v25 candy-land build was produced by an AI running:
generate → validate (10 engine rules + 5 invariants) → render locally → **screenshot** →
self-critique → iterate. Everything in that loop is already server-side tech in this repo
(map-service + headless Chromium + the vendored three.js at `/vendor/` — no CDN). The service
exposes that loop to landowners.

## Access tiers (owner 2026-08-06, locked)

| Tier | What they get |
|---|---|
| non-VIP | **BYO AI key** — user supplies their own Anthropic (or compatible) API key; we run the loop with it, key never stored beyond the job |
| VIP (any) | access to **our hosted AI models** (the platform's key, quota-metered) |
| VIP3 | **image-reference upload** — a photo/artwork reference drives the build (the candy-land flow) |

## Architecture (CF side)

```
POST /internal/v1/designs/:parcelId/ai-build     (auth: PG identity + parcel owner check + tier gate)
  body: { prompt?, referenceImageId?, passes?: 1..15 }
→ job queue (1 concurrent per user, N global) → worker process:
   1. assemble context: parcel artifact + params + MAP-THEMES contract + (VIP3) the reference image
   2. run the agent (backend-pluggable, env-selected):
        AI_BUILD_BACKEND=anthropic   → Anthropic API (vision + tool use), our key or the BYO key
        AI_BUILD_BACKEND=claude-code → the existing AWS agent box's claude-code API endpoint
                                       (AI_BUILD_ENDPOINT + AI_BUILD_TOKEN)
   3. the agent may ONLY call whitelisted tools: setTheme(themeData), setParams(clamped),
      makeFloorTexture(parametric generator inputs), render+screenshot, validate.
      It NEVER writes code or files — output is DATA (theme entry, params, texture params).
   4. every candidate passes the same gates as any map (10 rules, 5 invariants, traverse audit)
   5. result saved as a PENDING design version; the owner approves in the designer before publish
```

**Safety rails:** structurally identical to the theme contract — a theme changes the LOOK, never
the WAR. The agent output is clamped data, so a hostile prompt/reference can at worst make an ugly
skin, never break gameplay, geometry, or the server. Pass caps + token budget per job; BYO keys
used in-memory only.

## Hosted-model tier — DELIVERED auth (owner relay, 2026-08-07)

The AR / etherfantasy-BE box (**13.213.205.145**) now carries working Claude Code auth — full
operator doc lives ON THAT BOX at `/home/ubuntu/CLAUDE-TOKEN-SETUP.md` (read it before wiring
anything). Summary of what it provides:
- long-lived OAuth token at `~/.config/cf/claude_oauth_token` (mode 600), used as the env var
  `CLAUDE_CODE_OAUTH_TOKEN` — a bare token string, NOT a `~/.claude/.credentials.json` blob
  (moving it there breaks refresh → 401). Verified live.
- `claude` CLI at `~/.npm-global/bin/claude` (v2.1.197).
- token admin page: systemd `claude-token-manager`, **127.0.0.1:8091 only** (SSH tunnel to reach;
  key at `~/.config/cf/tm_key`). View/live-test/paste-refresh. Token refresh is manual: mint on a
  browser machine (`claude setup-token`) → paste into the admin page.
- HARD RULES from the box doc: never expose :8091 publicly, never paste the token into chat, and
  **check with the owner before creating any standing service config** (box is under lockdown).

**Recommended topology given the token lives on the AR box:** run the AI-build WORKER on the AR
box (where `claude` + token are) and have it drive the map service over HTTPS
(map.etherfantasy.com designs/validate/render APIs + its own headless Chromium for screenshots) —
the token never leaves its box. The map-service endpoint then just enqueues jobs the AR worker
pulls. The alternative (an HTTP runner wrapper on the AR box that map-service calls) needs the
owner's explicit OK per the lockdown rule.

## Still needed to finish wiring

1. Owner OK on the worker topology above (it is a standing process on the locked-down AR box).
2. VIP tier lookup: which API tells us a PG user's VIP level (games-etherfantasy-backend?).
3. Reference-image storage decision (S3 bucket vs local disk).

Until those land, the endpoint ships as a stub (501 + this contract). The CF sandbox agent cannot
reach the AWS boxes directly — box-side steps run at deploy time or by an operator session.
