#!/usr/bin/env node
// estate_palace_maps.mjs — REPRODUCIBLE generator for the PALACE ESTATE battle maps
// (canon decisions 4/5/18 — palaces get PRE-DESIGNED ESTATE maps; owner fix-it 2026-07-11).
//
// WHY: no EPIC estate anywhere has L3 subdivision (0/48 surface + 0/5 UW2), so every PALACE
// castle's heroParcels DEFER — including the two EF-Hunt STORY locations (the Palace of Masks =
// the story START, the Bastion of Dominus = the main-story keep). Canon always promised palaces
// pre-designed estate maps; this tool generates them: the ±161 arena windowed over the ESTATE's
// OWN L2 polygon (parcels-l2.json svgPath/bbox — the same coordinate space as the zone world
// field), through the SAME continuous world field and generator pipeline as every L3 parcel map
// (worldParcel → generate → command_converter). The palace POI sits on its own estate, so
// generate.js castleLayout grows the castle ring around it automatically.
//
// KEY-BY-ESTATE-ID CONVENTION: output filename = the ESTATE parcelId (e.g. 1101100.json) —
// CF's loadParcelBattlefield and the map service key by id STRING, so estate ids work verbatim.
// The world fields mark each PALACE castles[] entry with `estateMapId: "<estateId>"` (the shared
// world_hero_parcels.mjs rule) so consumers know the key. L3 subdivision arriving later does NOT
// invalidate these maps: the world field is frozen, and parcel maps + the estate map derive from
// the same geometry.
//
// THE DETERMINISTIC GENERATION SNAP (same inputs ⇒ byte-identical output, forever):
//   • estate row  = data/hexagon-city-source/parcels-l2.json, parcelId ∈ PALACES below
//   • worldParcel(row, { investLevel: 3, biome })  — investLevel 3 "Prosperous": the palace
//     estates are the grandest developed land of their zones (the L3 flagship castle parcels use
//     tier 2; palaces sit one tier above). biome follows the committed per-zone flagship
//     precedent (README): UW2→SWAMP · ENT→sakura (Carnavale's festival palette) ·
//     EDU→TEMPERATE_FOREST · HUB→TEMPERATE_GRASS · BUS→SWAMP.
//   • artifact.meta.sizeClass = the estate's sizeClass (EPIC) — additive, set post-generate.
//   • artifact  → data/cf-maps/artifacts/<estateId>.artifact.json  (compact JSON + \n)
//   • A1 vector → data/cf-maps/parcels/<estateId>.json             (toBattlefieldA1, 2-space + \n)
// Built TWICE and byte-compared before writing; every A1 is validated against the 5 CF
// playability invariants when the apps/server dist build is present (apps/server/dist/src/
// battlefield.js — run `pnpm -r build` first for the gate; missing dist ⇒ warning, not skip-write).
//
// Deterministic: the generator's seeded rng only — NO Math.random / Date.now.
// Usage: node map-service/tools/estate_palace_maps.mjs
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { worldParcel, clearWorldFieldCache } from "../maps/worldfield.js";
import { generate } from "../maps/generate.js";
import { toBattlefieldA1 } from "../maps/command_converter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

// the five palaces (every PALACE castles[] entry across all authored world fields, 2026-07-11)
const PALACES = [
  { id: "1101100", zone: "UW2", biome: "SWAMP", castleId: "UW2-BASTION-DOMINUS", name: "The Bastion of Dominus" },
  { id: "1031491", zone: "ENT", biome: "sakura", castleId: "ENT-PALACE-MASKS", name: "The Palace of Masks" },
  { id: "1020371", zone: "EDU", biome: "TEMPERATE_FOREST", castleId: "EDU-PALACE-ACADEMY", name: "The Grand Academy" },
  { id: "1071732", zone: "HUB", biome: "TEMPERATE_GRASS", castleId: "HUB-PALACE-ZHONGDU", name: "The Vermilion Palace (Zhongdu)" },
  { id: "1001178", zone: "BUS", biome: "SWAMP", castleId: "BUS-PALACE-EXCHANGE", name: "The Grand Exchange" },
  // STORY-DESIGNATED PALACE (owner 2026-07-27): EF Hunt's finale — the Vault-Palace of Luxuria, EP7's
  // Castle of Shadows. Rides a LARGE (UW3 has no EPIC) but promoted to a 3-ring PALACE so the game's
  // single most important location reads as the world's top rank. First PALACE on an L3-subdivided estate.
  { id: "3110087", zone: "UW3", biome: "VOLCANIC", castleId: "UW3-PALACE-VAULTPALACE", name: "The Vault-Palace of Luxuria" },
];
const INVEST_LEVEL = 3;   // "Prosperous" — the snap constant (see header)

const l2 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/parcels-l2.json"), "utf8"));
const rowById = new Map(l2.parcels.map((p) => [p.parcelId, p]));

// optional CF 5-invariant validation (the real gate validator)
let validateBattlefield = null;
const distPath = path.join(ROOT, "apps/server/dist/src/battlefield.js");
if (existsSync(distPath)) ({ validateBattlefield } = require(distPath));
else console.warn("WARN: apps/server dist not built — 5-invariant validation skipped (run pnpm -r build)");

function buildOne(p) {
  clearWorldFieldCache();                                   // hermetic per build (double-run compare)
  const row = rowById.get(p.id);
  if (!row) throw new Error(`estate ${p.id} not in parcels-l2.json`);
  if (row.zone !== p.zone) throw new Error(`estate ${p.id} zone mismatch: ${row.zone} ≠ ${p.zone}`);
  const parcel = worldParcel(row, { investLevel: INVEST_LEVEL, biome: p.biome });
  const art = generate(parcel);
  art.meta.sizeClass = row.sizeClass;                       // EPIC — carried into the A1 meta
  const a1 = toBattlefieldA1(art);
  return { art, a1, row };
}

let failures = 0;
for (const p of PALACES) {
  const b1 = buildOne(p);
  const sArt = JSON.stringify(b1.art) + "\n";
  const sA1 = JSON.stringify(b1.a1, null, 2) + "\n";
  const b2 = buildOne(p);                                   // build twice, byte-compare
  if (JSON.stringify(b2.art) + "\n" !== sArt || JSON.stringify(b2.a1, null, 2) + "\n" !== sA1) {
    console.error(`NON-DETERMINISTIC BUILD for estate ${p.id}`);
    process.exit(1);
  }
  const castle = b1.art.meta.castle;
  if (!castle || castle.id !== p.castleId) {
    console.error(`estate ${p.id}: expected castle ${p.castleId}, got ${castle ? castle.id : "none"}`);
    process.exit(1);
  }
  let inv = "not-validated";
  if (validateBattlefield) {
    const v = validateBattlefield(b1.a1);
    inv = v.ok ? "5/5 OK" : `INVALID: ${v.errors.join("; ")}`;
    if (!v.ok) failures++;
  }
  writeFileSync(path.join(ROOT, `data/cf-maps/artifacts/${p.id}.artifact.json`), sArt);
  writeFileSync(path.join(ROOT, `data/cf-maps/parcels/${p.id}.json`), sA1);
  const rings = b1.art.structures.filter((s) => String(s.anchorId).startsWith("castle_")).length;
  console.log(`wrote ${p.id} (${p.name}, ${p.zone} ${b1.row.sizeClass}) sha256`,
    createHash("sha256").update(sA1).digest("hex").slice(0, 16),
    `| castle ${castle.id} ring ${rings}`,
    `| repairs [${b1.art.meta.repairs.join(",") || "none"}]`,
    `| invariants ${inv}`);
}
if (failures) { console.error(`${failures} estate map(s) failed CF invariants`); process.exit(1); }
