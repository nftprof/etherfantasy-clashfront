#!/usr/bin/env node
// D25 — where the S2-style arrival events land on a real battle map (doc 07 step 2). Pure functions over approaches.json:
//   resolveArrival(mapId, event, battleSeed) → { eligible, spawn, target, via } for NAVAL_LANDING (a fleet at a
//     NAVAL_APPROACH, unloading at its PIER or beaching 24 u inland) and AIRSHIP_DROP (an airship entering at an
//     AIR_APPROACH, landing on its LANDING_PAD); other events → { eligible: true } (no arrival).
//   A map that IS baked but has no deep water / no pad can't host the event (eligible:false, the deck skips it); a map
//   not baked yet (not in approaches.json) gets { eligible: true, via: "EDGE" }: the engine's edge-arrival fallback.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a } from "./seed_singles.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const AP = JSON.parse(fs.readFileSync(path.join(ROOT, "data/living-world/approaches.json"), "utf8"));
export const ARRIVAL_EVENTS = { NAVAL_LANDING: "naval", AIRSHIP_DROP: "air" };
const r1 = (x) => Math.round(x * 10) / 10;

export function resolveArrival(mapId, event, battleSeed) {
  const lane = ARRIVAL_EVENTS[event]; if (!lane) return { eligible: true };
  const M = AP.maps[mapId]; if (!M) return { eligible: true, via: "EDGE" };   // not baked yet → engine edge fallback
  const opts = M[lane]; if (!opts.length) return { eligible: false, reason: lane === "naval" ? "NO_DEEP_WATER" : "NO_LANDING_PAD" };
  const a = opts[fnv1a(`${battleSeed}|${event}|${mapId}`) % opts.length], spawn = { approachId: a.id, x: a.x, z: a.z };
  if (lane === "air") { const p = M.anchors[a.landAt]; return { eligible: true, via: "AIR_APPROACH", spawn, target: { anchorId: a.landAt, x: p[0], z: p[1] } }; }
  if (a.unloadAt !== "BEACH") { const p = M.anchors[a.unloadAt]; return { eligible: true, via: "NAVAL_APPROACH", spawn, target: { anchorId: a.unloadAt, x: p[0], z: p[1] } }; }
  const L = Math.hypot(a.x, a.z) || 1;   // beach: 24 u from the approach toward the arena centre
  return { eligible: true, via: "NAVAL_APPROACH", spawn, target: { anchorId: "BEACH", x: r1(a.x - (a.x / L) * 24), z: r1(a.z - (a.z / L) * 24) } };
}
