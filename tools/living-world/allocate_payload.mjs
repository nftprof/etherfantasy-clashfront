#!/usr/bin/env node
// D21 — a living-world POI battle → the v1 allocate request (cf-overworld docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md §1).
// Pure function buildAllocate(input) → JSON; same input → same bytes. It fills the CANON fields from the living-world
// data (battlefield structures from the calibrated harness numbers in the canon ±161 frame, the WILD garrison as mobs,
// a held POI's garrison as DEFENDER units in canon UnitClass), and carries everything the canon schema has no field for
// in ONE additive, versioned block `livingWorld` (v:1): POI id/kind/threat, ground → canon HexTerrain + terrain mods,
// a seeded event deck (event, atSec), the Guardian (doc 04) and the defence rating (doc 03). An engine that does not
// read `livingWorld` still runs a correct canon battle; proposal for the brief, not yet in it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
import { resolveArrival } from "./arrivals.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const PA = rd("data/living-world/poi-archetypes.json"), GU = rd("data/living-world/guardians.json"), DF = rd("data/living-world/defences.json"), TM = rd("data/living-world/terrain-mods.json");
const ARCH = Object.fromEntries(PA.archetypes.map((a) => [a.lwKind, a]));
export const FRAME = { sizeM: 322, half: 161, spawn: 131.6, core: 114.8 };   // canon ±161 arena (brief §1, CLAUDE.md 4g)
export const UNIT_CLASS = ["INFANTRY", "ARCHER", "CAVALRY", "SPEAR", "SIEGE", "MARINE", "SHIP"];
// a held POI's garrison → DEFENDER units: 10 soldiers per garrison unit (⚙ SOLDIERS_PER_SIM_UNIT, D15); SHIP counts hulls (canon)
const GARRISON_CLASS = { MARINE: "MARINE", SHIP: "SHIP", SKIRMISHER: "ARCHER", AIRSHIP: "SHIP" };   // anything else → INFANTRY
const DEF_MUL = 3;   // the harness's structure-HP calibration (D6b): bare threat-50 castle breaches at ~9 min
const r1 = (x) => Math.round(x * 10) / 10;

function seedHex(battleId, worldSeed) { const a = fnv1a(`${worldSeed}|${battleId}|a`), b = fnv1a(`${worldSeed}|${battleId}|b`); return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0"); }

// The seeded event deck for THIS battle (doc 02 layer ③): up to `draws` weighted draws (no repeats) from the deck, at seeded
// times inside the 12-min floor; telegraph seconds from events{} so the engine can banner them.
export function drawDeck(poi, battleSeed, draws = 3, mapId = null) {
  // D25: events the map can't host (NAVAL_LANDING without deep water, AIRSHIP_DROP without a pad) leave the deck
  const left = ARCH[poi.lwKind].deck.filter(([e]) => !mapId || resolveArrival(mapId, e, battleSeed).eligible); if (!left.length) return [];
  const r = mulberry32(fnv1a(`${battleSeed}|deck|${poi.id}`)), out = [], n = Math.min(draws, left.length);
  for (let i = 0; i < n; i++) {   // without replacement: each event at most once per battle (a Guardian wakes once)
    const tot = left.reduce((m, [, w]) => m + w, 0); let x = r() * tot, k = 0;
    for (; k < left.length - 1; k++) { x -= left[k][1]; if (x <= 0) break; }
    const [ev] = left.splice(k, 1)[0];
    const atSec = 60 + Math.floor(((i + r()) / n) * 540);   // one per slice of 1:00–10:00
    const arr = mapId ? resolveArrival(mapId, ev, battleSeed) : { eligible: true }, arrival = arr.via ? { arrival: { via: arr.via, ...(arr.spawn ? { spawn: arr.spawn, target: arr.target } : {}) } } : {};
    out.push(ev === "GUARDIAN_WAKE" ? { event: ev, trigger: GU.rules.ascensionClockStarts, teleSec: PA.events[ev].teleSec } : { event: ev, atSec, teleSec: PA.events[ev].teleSec, ...arrival });   // doc 04: the Guardian wakes when struck
  }
  return out;
}

export function buildAllocate({ battleId, worldSeed, mode = "accelerated", poi, zone, parcelId, mapId = parcelId, held = null, attacker, guardian = null, defenceRating = 1, callbackUrl }) {
  const seed = seedHex(battleId, worldSeed), tm = 0.5 + poi.threat / 50, sm = tm * DEF_MUL * defenceRating, tier = poi.tier || 1;
  const K = { x: 0, z: FRAME.core }, structures = [];
  const S = (anchorId, kind, x, z, hp) => structures.push({ anchorId, kind, side: "DEFENDER", x: r1(x), z: r1(z), hp: Math.round(hp), hpMax: Math.round(hp) });
  S("anchor_core", "CORE", K.x, K.z, 2400 * tier * sm);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI * 1.25, gate = i === 0 || i === 5; S(`anchor_${gate ? "gate" : "wall"}_${i}`, gate ? "GATE" : "WALL", K.x + Math.cos(a) * 16, K.z + Math.sin(a) * 16, (gate ? 1150 : 1350) * sm); }
  for (const [i, [dx, dz]] of [[-15, -5], [-5, -15]].entries()) S(`anchor_tower_${i}`, "TOWER", K.x + dx, K.z + dz, 2350 * sm);
  const garrison = ARCH[poi.lwKind].garrison;
  const wild = !held;
  const hexTerrain = TM.groundToHexTerrain[poi.ground] || "PLAINS";
  const lw = {
    v: 1, poiId: poi.id, lwKind: poi.lwKind, threat: poi.threat, ground: poi.ground || null, hexTerrain, terrainMods: { attacker: TM.canon[hexTerrain][0], defender: TM.canon[hexTerrain][1] },
    garrisonStats: { hp: Math.round(700 * tm), dmg: Math.round(40 * Math.sqrt(tm)), leashed: true },
    mapId, eventDeck: drawDeck(poi, seed, 3, mapId),
    defence: { rating: defenceRating, ratingMax: DF.rating.max },
    floorSec: 720,
  };
  if (guardian) {
    const F = GU.forms[String(guardian.form)];
    lw.guardian = { form: guardian.form, name: F.name, nftId: guardian.nftId, owner: guardian.owner, battleHp: Math.round(F.battleHp * DEF_MUL), shieldsCore: true, bombard: F.bombard, aura: F.aura,
      ...(F.ascended ? { ascended: { ...F.ascended, clockStarts: GU.rules.ascensionClockStarts } } : {}), stationEndsTick: guardian.stationEndsTick };
  }
  return {
    v: 1, battleId, seed, mode, rates: { tickHz: 30, commandSnapshotHz: 3 }, ...(mode === "live" ? { joinWindowSec: 120 } : {}),
    parcel: { parcelId, zone, kind: wild ? "WILD" : "PLAYER" },
    battlefield: {
      arena: { shape: "polygon", sizeM: FRAME.sizeM, bounds: [[-FRAME.half, -FRAME.half], [FRAME.half, -FRAME.half], [FRAME.half, FRAME.half], [-FRAME.half, FRAME.half]] },
      laneCount: 1, obstacles: [],
      spawnZones: [{ id: "spawn_atk_s", side: "ATTACKER", edge: "S", x: 0, z: -FRAME.spawn }],
      structures,
      ...(wild ? { mobs: garrison.map(([kind, count], i) => ({ id: `mob_${i}`, kind, x: r1(Math.cos((i / garrison.length) * Math.PI * 2) * 9), z: r1(K.z - 9 + Math.sin((i / garrison.length) * Math.PI * 2) * 9), count })) } : {}),
    },
    sides: {
      ATTACKER: attacker,
      DEFENDER: wild ? { governorId: null, armies: [] } : { governorId: held.governorId, armies: [{ armyId: held.armyId, units: Object.entries(garrison.reduce((m, [k, c]) => ((m[GARRISON_CLASS[k] || "INFANTRY"] = (m[GARRISON_CLASS[k] || "INFANTRY"] || 0) + c * (k === "SHIP" || k === "AIRSHIP" ? 1 : 10)), m), {})).map(([cls, count]) => ({ cls, count })), officers: [], provisions: { food: 0, gold: 0, wood: 0 }, entryEdge: "N" }] },
    },
    callback: { url: callbackUrl, keyId: "cf-hmac-1" },
    livingWorld: lw,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "data/living-world/allocate.samples.json");
  const CP = rd("data/living-world/castle-pois.json"), E = rd("data/living-world/estate-pois/BUS.json");
  const ridge = E.parcels.find((p) => p.ground === "RIDGE" && p.nodes.some((n) => n.k === "WILD_LAIR")), lairI = ridge.nodes.findIndex((n) => n.k === "WILD_LAIR"), lair = ridge.nodes[lairI];
  const castle = CP.byCastle.find((c) => c.castleId === "BUS-CASTLE-CAPEMEET"), perchPoi = castle.pois.find((p) => p.lwKind === "GUARDIAN_PERCH"), harbour = castle.pois.find((p) => p.lwKind === "HARBOUR");
  const atk = { governorId: "gov_SAMPLE_ATTACKER", armies: [{ armyId: "army_SAMPLE_A", units: [{ cls: "INFANTRY", count: 400 }, { cls: "SIEGE", count: 60 }], officers: [{ masterId: "master_sample", name: "Sample", level: 10, revives: 2 }], provisions: { food: 4000, gold: 800, wood: 600 }, entryEdge: "S" }] };
  const cb = "https://cf.etherfantasy.com/internal/battle-result";
  const samples = {
    WILD_LAIR_ON_A_RIDGE: buildAllocate({ battleId: "battle_SAMPLE0000000000000000001", worldSeed: "cf-world-1", poi: { id: `${ridge.id}#${lairI}`, lwKind: "WILD_LAIR", threat: lair.threat, ground: "RIDGE" }, zone: "BUS", parcelId: ridge.id, attacker: atk, callbackUrl: cb }),
    HELD_HARBOUR_LIVE: buildAllocate({ battleId: "battle_SAMPLE0000000000000000002", worldSeed: "cf-world-1", mode: "live", poi: { id: harbour.id, lwKind: "HARBOUR", threat: harbour.threat, ground: "WATER", tier: castle.tier }, zone: "BUS", parcelId: castle.castleId, held: { governorId: "gov_SAMPLE_HOLDER", armyId: "army_SAMPLE_GARRISON" }, attacker: atk, defenceRating: 1.3, callbackUrl: cb }),
    HARBOUR_ON_A_BAKED_COAST_MAP: buildAllocate({ battleId: "battle_SAMPLE0000000000000000004", worldSeed: "cf-world-1", poi: { id: "1001178:HARBOUR:sample", lwKind: "HARBOUR", threat: 26, ground: "WATER" }, zone: "BUS", parcelId: "1001178", attacker: atk, callbackUrl: cb }),
    CASTLE_POI_WITH_ASCENDANT: buildAllocate({ battleId: "battle_SAMPLE0000000000000000003", worldSeed: "cf-world-1", poi: { id: perchPoi.id, lwKind: perchPoi.lwKind, threat: perchPoi.threat, ground: castle.layer, tier: castle.tier }, zone: "BUS", parcelId: castle.castleId, held: { governorId: "gov_SAMPLE_HOLDER", armyId: "army_SAMPLE_GARRISON" }, attacker: atk, guardian: { form: 3, nftId: "pet_SAMPLE_F3", owner: "gov_SAMPLE_HOLDER", stationEndsTick: 360 }, defenceRating: 1.6, callbackUrl: cb }),
  };
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/allocate-samples@1", contract: "cf-overworld docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md §1 (v1) + additive livingWorld@1", samples }, null, 1) + "\n");
  console.log(`allocate samples: ${Object.entries(samples).map(([k, s]) => `${k} (${s.parcel.kind}, ${s.battlefield.structures.length} structures, deck ${s.livingWorld.eventDeck.map((e) => e.event).join("/") || "—"}${s.livingWorld.guardian ? ", " + s.livingWorld.guardian.name : ""})`).join("; ")}`);
}
