#!/usr/bin/env node
// D9 — ambient ship + airship traffic (doc 07 step 1: ships you can SEE, no combat).
// Pure function of (world.seed, tick) over data/living-world/sea-air-lanes.json: no clock, no unseeded randomness.
// Each lane carries a few hulls that shuttle port ↔ port with a mooring pause at each end; in storm season a seeded
// daily storm can close a `stormCloses` sea lane, and its hulls ride it out moored at the nearer port.
// CLI: writes a sampled snapshot report (default data/living-world/ambient-traffic.sample.json).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const LANES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/living-world/sea-air-lanes.json"), "utf8"));

export const TRAFFIC = {
  TICK_SECONDS: 60,                                 // canon world tick (docs/08 TICK_SECONDS)
  speedUPerTick: { SEA: 6, AIR: 10 },               // a 135 u crossing ≈ 23 min; a 400 u sky lane ≈ 40 min
  mooredTicks: { SEA: 8, AIR: 5 },                  // pause at each end (loading / unloading)
  uPerHull: { SEA: 120, AIR: 200 },                 // hulls per lane = clamp(ceil(lengthU / uPerHull), 1, maxHulls)
  maxHulls: 3,
  stormCycleDays: 28, stormSeasonDays: 7,           // last week of every 28-day cycle is storm season (proposal)
  stormDayChance: 0.35,                             // per stormCloses lane per storm-season day
};

const portAt = Object.fromEntries(LANES.ports.map((p) => [p.id, p]));
const day = (tick) => Math.floor((tick * TRAFFIC.TICK_SECONDS) / 86400);
export const inStormSeason = (tick) => day(tick) % TRAFFIC.stormCycleDays >= TRAFFIC.stormCycleDays - TRAFFIC.stormSeasonDays;
export function laneClosed(seed, tick, lane) {
  if (lane.mode !== "SEA" || !lane.stormCloses || !inStormSeason(tick)) return false;
  return mulberry32(fnv1a(`${seed}|storm|${day(tick)}|${lane.id}`))() < TRAFFIC.stormDayChance;
}
export const hullsOn = (lane) => Math.min(TRAFFIC.maxHulls, Math.max(1, Math.ceil(lane.lengthU / TRAFFIC.uPerHull[lane.mode])));

// One hull's state at a tick: a round trip is moor(from) → sail → moor(to) → sail back; phase is seeded per hull.
export function hullAt(seed, tick, lane, i) {
  const m = lane.mode, sail = Math.max(1, Math.ceil(lane.lengthU / TRAFFIC.speedUPerTick[m])), moor = TRAFFIC.mooredTicks[m];
  const period = 2 * (sail + moor), phase = fnv1a(`${seed}|hull|${lane.id}|${i}`) % period;
  const id = `${lane.id}#${i}`, kind = m === "SEA" ? "SEA_SHIP" : "AIRSHIP";
  const f = ((tick + phase) % period + period) % period;
  let t, status, heading;
  if (f < moor) { t = 0; status = "MOORED"; heading = lane.to; }
  else if (f < moor + sail) { t = (f - moor) / sail; status = "SAILING"; heading = lane.to; }
  else if (f < 2 * moor + sail) { t = 1; status = "MOORED"; heading = lane.from; }
  else { t = 1 - (f - 2 * moor - sail) / sail; status = "SAILING"; heading = lane.from; }
  if (laneClosed(seed, tick, lane)) { t = t < 0.5 ? 0 : 1; status = "STORM_BOUND"; }
  const a = portAt[lane.from], b = portAt[lane.to];
  // Cross-zone lanes (and sky lanes) live in two zone frames: the renderer interpolates by t; same-zone lanes get x,z.
  const at = !lane.crossZone && a.zone === b.zone ? [+(a.at[0] + (b.at[0] - a.at[0]) * t).toFixed(1), +(a.at[1] + (b.at[1] - a.at[1]) * t).toFixed(1)] : null;
  return { id, kind, lane: lane.id, status, t: +t.toFixed(3), heading, ...(at ? { zone: a.zone, at } : {}) };
}

export function shipsAt(seed, tick) {
  const out = [];
  for (const lane of LANES.lanes) for (let i = 0; i < hullsOn(lane); i++) out.push(hullAt(seed, tick, lane, i));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const out = arg("--out", path.join(ROOT, "data/living-world/ambient-traffic.sample.json")), seed = arg("--seed", "cf-world-1");
  const ticksPerDay = 86400 / TRAFFIC.TICK_SECONDS;
  // Sample: noon of day 0 (calm) and noon of every storm-season day of cycle 0 (full ship lists for day 0 + the first storm day).
  const days = [0, ...Array.from({ length: TRAFFIC.stormSeasonDays }, (_, k) => TRAFFIC.stormCycleDays - TRAFFIC.stormSeasonDays + k)];
  const snapshots = days.map((d) => {
    const tick = d * ticksPerDay + ticksPerDay / 2, ships = shipsAt(seed, tick), by = {};
    for (const s of ships) by[s.status] = (by[s.status] || 0) + 1;
    return { day: d, tick, stormSeason: inStormSeason(tick), closedLanes: LANES.lanes.filter((l) => laneClosed(seed, tick, l)).length, byStatus: by, ...(d <= TRAFFIC.stormCycleDays - TRAFFIC.stormSeasonDays ? { ships } : {}) };
  });
  const hulls = LANES.lanes.reduce((n, l) => n + hullsOn(l), 0);
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/ambient-traffic-sample@1", seed, params: TRAFFIC, hulls, snapshots }) + "\n");
  console.log(`ambient-traffic: ${LANES.lanes.length} lanes → ${hulls} hulls; storm-season closures per day ${snapshots.slice(1).map((s) => s.closedLanes).join("/")}`);
}
