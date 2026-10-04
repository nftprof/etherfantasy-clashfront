# 09 — Live ops: what to watch after launch

The pre-launch tools measured what "healthy" means. After launch, the same numbers come from live events.
`data/living-world/liveops-watch.json` lists 13 metrics. For each one it gives:
- how to compute it from live events;
- its pre-launch baseline (a pointer into a committed report);
- a healthy band and alert thresholds;
- the lever to pull, which is always a template key (doc 02 §5), never a per-map patch.

`tools/living-world/liveops_baseline.mjs` evaluates every baseline, and the tests fail if one leaves its band.

| Metric | Baseline | Healthy | Alert | Lever |
|---|---|---|---|---|
| Out-of-band POI fights | 0 % | ≤ 5 % | > 10 % | `threatBands` (lo/hi, ground/kind shift) |
| Burn ratio | 28.2 % | 10–40 % | < 10 % (**hard**, Decision 17) or > 45 % | `stakeSplit.burn`, `feeSplit.burn` |
| Banner churn (per region per week) | 1.7 | 0.5–5 | < 0.25 (stagnant) / > 7 (chaos) | defence `rating.max`, `regionBanner.minHeld` |
| Whale share of all holdings | 1.6 % | ≤ 5 % | > 8 % | anti-farm curve, overgrowth window |
| Regions bannered by one player | 1 | ≤ 2 | ≥ 3 (North Star) | `regionBanner`, influence thresholds |
| Holdings Gini | 0.30 | 0.15–0.55 | > 0.65 | influence ladder, region rights |
| Idle sessions | 0 % | ≤ 2 % | > 5 % | world-calendar rates |
| Fresh journal stories per session (p10) | 1 | ≥ 1 | < 1 | calendar rates, board horizon |
| Explore ÷ grind reward per win | 5.4× | ≥ 3× | < 2× | `antiFarm.multipliers` |
| Feed headlines per region per day | 4.9 | 2–8 | < 1 | feed `rules` |
| Guardian damage share (max) | 19.9 % | ≤ 20 % | > 20 % (**hard**: a bug, doc 04 §4) | none, fix the clamp |
| Best coalition self-farm (net CT) | −1.2 | < 0 | ≥ 0 (**hard**) | `burnRakeMin`, relation lookback |
| Board latency p50 | 0.09 ms | ≤ 1 ms | > 5 ms | memoisation, horizon |

**Hard** rows are invariants: an alert there is a bug, not a tuning call. Every other band is a proposal to tune with
real data. Re-run the matching tool, check the baseline is still healthy, and record the new numbers in `CYCLE-LOG.md`.
