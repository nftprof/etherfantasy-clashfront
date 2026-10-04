#!/usr/bin/env node
// D12 — doc 06 §3–§4 as pure functions over experience.json (no clock: the caller passes world ticks; TICK = 60 s).
//   repeatMultiplier(history, account, poiId, tick) → ×1 / 0.6 / 0.3 / 0.1 for the 1st / 2nd / 3rd / 4th+ clear of the
//                                                     SAME POI by the SAME account in the trailing 24 h; any other POI is ×1
//   resolveClear(history, clear)                    → { nth, mult, reward } (reward = base × mult, rounded down; never 0
//                                                     while base > 0: the floor is 1, so nothing *feels* confiscated)
//   lullUntil(campClears, zone)                     → the tick barbarian raids may resume in a region (48 h after the
//                                                     LATEST camp clear; lulls do not stack)
//   raidsAllowed(campClears, zone, tick)            → false inside a lull
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const EX = JSON.parse(fs.readFileSync(path.join(ROOT, "data/living-world/experience.json"), "utf8"));
const TICKS_PER_H = 60;

export function repeatMultiplier(history, account, poiId, tick) {
  const from = tick - EX.antiFarm.windowHours * TICKS_PER_H, M = EX.antiFarm.multipliers;
  const prior = history.filter((h) => h.account === account && h.poiId === poiId && h.tick > from && h.tick <= tick).length;
  return { nth: prior + 1, mult: M[Math.min(prior, M.length - 1)] };
}
export function resolveClear(history, clear) {
  const { nth, mult } = repeatMultiplier(history, clear.account, clear.poiId, clear.tick);
  return { nth, mult, reward: clear.base > 0 ? Math.max(1, Math.floor(clear.base * mult)) : 0 };
}
export function lullUntil(campClears, zone) {
  const t = campClears.filter((c) => c.zone === zone).reduce((m, c) => Math.max(m, c.tick), -Infinity);
  return t === -Infinity ? null : t + EX.lullHours.BARBARIAN_CAMP * TICKS_PER_H;
}
export function raidsAllowed(campClears, zone, tick) {
  const u = lullUntil(campClears.filter((c) => c.tick <= tick), zone);
  return u == null || tick >= u;
}
