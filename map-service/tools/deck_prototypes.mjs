#!/usr/bin/env node
// deck_prototypes.mjs — TRUE STACKED-DECK battle-map PROTOTYPES (V2 concept, owner 2026-09-03
// "i need to see some true 3 deck city battle maps").
//
// Generates three hand-designed ±161 arena maps per the V2 data contract of
// docs/briefs/SKY-STACKED-CITY-BATTLEMAPS.md §3 — decks that OVERLAP IN PLAN:
//   decks:      [{ id, name, h, w, gh, walk (b64 Uint8 gh*gw), tone }]
//   connectors: [{ kind: TUNNEL|RAMP|LIFT|STAIR|BRIDGE, from:{deck,x,z}, to:{deck,x,z}, w }]
//   structures/pads/spawns — visual anchors so the maps read as BATTLE maps, not dioramas.
// One per sky city, each with its owner-locked navigation identity:
//   DECK-HS2-CROWN    Emberfall — criss-cross mid city + concentric crown, lifts, no walls
//   DECK-HS1-AEROPOLIS Aeropolis — garden terraces with true overhang, stairs + long ramps
//   DECK-HS3-EMPYREA  Empyrea — wall-tops ARE the walkways; wall-bridges jump ring to ring
// STATUS: CONCEPT PROTOTYPES for owner reaction — not playable maps, not in the generator
// pipeline, no CI claims. The engine milestone (pathing/audit/N-deck traverse) is still V2.
// Deterministic: pure functions of constants below; no Math.random/Date.now.
// Usage: node map-service/tools/deck_prototypes.mjs   (writes data/moba-maps/DECK-*.json)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../data/moba-maps");
const S = 322, HALF = S / 2;          // the fixed ±161 arena
const G = 96;                          // deck walk-grid resolution (96×96 → 3.354 u/cell)
const CW = S / G;
const cx = (i) => -HALF + (i + 0.5) * CW, cz = (j) => -HALF + (j + 0.5) * CW;

function grid() { return new Uint8Array(G * G); }
function b64(u8) { return Buffer.from(u8).toString("base64"); }
// paint helpers — all take/return grid indices
function disc(g, X, Z, R, v = 1) { for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const dx = cx(i) - X, dz = cz(j) - Z; if (dx * dx + dz * dz <= R * R) g[j * G + i] = v; } }
function ring(g, X, Z, r0, r1, v = 1) { for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const dx = cx(i) - X, dz = cz(j) - Z, d = Math.hypot(dx, dz); if (d >= r0 && d <= r1) g[j * G + i] = v; } }
function band(g, x0, z0, x1, z1, w, v = 1) {           // thick segment (a boulevard / bridge / walkway)
  const L = Math.hypot(x1 - x0, z1 - z0) || 1, ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const px = cx(i) - x0, pz = cz(j) - z0, t = Math.max(0, Math.min(L, px * ux + pz * uz));
    const qx = px - t * ux, qz = pz - t * uz;
    if (qx * qx + qz * qz <= (w / 2) * (w / 2)) g[j * G + i] = v;
  }
}
function rect(g, x0, z0, x1, z1, v = 1) { for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const X = cx(i), Z = cz(j); if (X >= x0 && X <= x1 && Z >= z0 && Z <= z1) g[j * G + i] = v; } }

const deck = (id, name, h, tone, g) => ({ id, name, h, gw: G, gh: G, cell: +CW.toFixed(3), walk: b64(g), tone });
const con = (kind, fd, fx, fz, td, tx, tz, w = 8) => ({ kind, from: { deck: fd, x: fx, z: fz }, to: { deck: td, x: tx, z: tz }, w });

// ---------------------------------------------------------------- DECK-HS2-CROWN (Emberfall)
function emberfall() {
  const d0 = grid();                                   // THE WORKS — the under-city
  disc(d0, 0, 0, 150);
  ring(d0, 0, 0, 96, 104, 0); band(d0, -161, 0, 161, 0, 14, 1); band(d0, 0, -161, 0, 161, 14, 1); // cooling seam, crossed by causeways
  const d1 = grid();                                   // THE MID CITY — criss-cross boulevards
  band(d1, -120, -120, 120, 120, 26); band(d1, -120, 120, 120, -120, 26);        // the X
  band(d1, -132, 0, 132, 0, 18); band(d1, 0, -132, 0, 132, 18);                  // the cross
  for (const [X, Z] of [[-74, -74], [74, -74], [-74, 74], [74, 74]]) disc(d1, X, Z, 26); // corner wards
  disc(d1, 0, 0, 34);                                                            // central exchange
  const d2 = grid();                                   // THE CROWN — concentric, palace core
  disc(d2, 0, 0, 30); ring(d2, 0, 0, 50, 66, 1);
  for (const a of [45, 135, 225, 315]) { const r = a * Math.PI / 180; band(d2, 30 * Math.cos(r), 30 * Math.sin(r), 52 * Math.cos(r), 52 * Math.sin(r), 9); }
  return {
    schema: "cf-deck-prototype/1", name: "DECK-HS2-CROWN", title: "The Crown of Emberfall",
    zone: "HS2", palette: "ember", sizeM: S,
    note: "V2 TRUE-STACK CONCEPT (SKY-STACKED-CITY-BATTLEMAPS.md §3) — criss-cross mid city over the reactor works, concentric crown above; lifts + rim ramps + under-deck tunnel mouths; no walls, rails with honest gaps.",
    decks: [deck(0, "The Works", 0, 0x39463c, d0), deck(1, "The Mid City", 26, 0x49584a, d1), deck(2, "The Crown", 52, 0x57665a, d2)],
    connectors: [
      con("LIFT", 0, 118, 0, 2, 60, 0, 12), con("LIFT", 0, -118, 0, 2, -60, 0, 12),     // freight lifts, works→crown
      con("RAMP", 0, -104, -104, 1, -74, -74, 10), con("RAMP", 0, 104, 104, 1, 74, 74, 10),
      con("RAMP", 0, 104, -104, 1, 74, -74, 10), con("RAMP", 0, -104, 104, 1, -74, 74, 10),
      con("RAMP", 1, 0, -70, 2, 0, -58, 9), con("RAMP", 1, 0, 70, 2, 0, 58, 9),
      con("TUNNEL", 0, -150, -34, 0, -120, -34, 11), con("TUNNEL", 0, 150, 34, 0, 120, 34, 11), // under-deck arrival mouths
    ],
    structures: [
      { kind: "CORE", side: "DEFENDER", deck: 2, x: 0, z: 0 },
      { kind: "REACTOR", deck: 0, x: -60, z: -60 }, { kind: "REACTOR", deck: 0, x: 60, z: -60 },
      { kind: "REACTOR", deck: 0, x: -60, z: 60 }, { kind: "REACTOR", deck: 0, x: 60, z: 60 },
      { kind: "TOWER", side: "DEFENDER", deck: 1, x: -34, z: 0 }, { kind: "TOWER", side: "DEFENDER", deck: 1, x: 34, z: 0 },
      { kind: "TOWER", side: "DEFENDER", deck: 2, x: 0, z: -40 }, { kind: "TOWER", side: "DEFENDER", deck: 2, x: 0, z: 40 },
    ],
    pads: [{ deck: 2, x: 58, z: -34, r: 12 }, { deck: 2, x: -58, z: 34, r: 12 }],
    spawns: [{ side: "ATTACKER", deck: 0, x: -138, z: -60 }, { side: "DEFENDER", deck: 2, x: 0, z: 22 }],
  };
}

// ---------------------------------------------------------------- DECK-HS1-AEROPOLIS
function aeropolis() {
  const d0 = grid();                                   // THE ROOTS — cisterns under the gardens
  disc(d0, 0, 0, 152); disc(d0, -48, 30, 17, 0); disc(d0, 40, -52, 13, 0);       // cistern pools (void = water below)
  const d1 = grid();                                   // THE GARDEN TERRACE — west crescent, TRUE overhang
  ring(d1, 30, 0, 58, 128, 1); rect(d1, -10, -161, 161, 161, 0);                 // crescent opens east
  const d2 = grid();                                   // THE HIGH CITY — inner west crescent above the terrace
  ring(d2, 30, 10, 44, 96, 1); rect(d2, -16, -161, 161, 161, 0);
  return {
    schema: "cf-deck-prototype/1", name: "DECK-HS1-AEROPOLIS", title: "The Hanging Gardens of Aeropolis",
    zone: "HS1", palette: "verdant", sizeM: S,
    note: "V2 TRUE-STACK CONCEPT — garden crescents genuinely OVERHANG the root level (arcades below); navigation is stairs and one long switchback ramp (owner: Aeropolis keeps stairs/ramps, no lifts); one high bridge jumps the outer top straight to the mid-deck interior.",
    decks: [deck(0, "The Roots", 0, 0x6a705c, d0), deck(1, "The Garden Terrace", 20, 0x5c7a4e, d1), deck(2, "The High City", 40, 0x6f8a5a, d2)],
    connectors: [
      con("STAIR", 0, -20, -96, 1, -44, -84, 8), con("STAIR", 0, -20, 96, 1, -44, 84, 8),
      con("STAIR", 1, -96, -30, 2, -40, -24, 7),
      con("RAMP", 0, 120, -20, 1, 60, -66, 9),                                   // the long switchback (drawn as one run)
      con("STAIR", 1, -60, 60, 2, -30, 44, 7),
      con("BRIDGE", 2, -20, -60, 1, 40, -90, 7),                                 // outer top → mid interior (owner rule)
    ],
    structures: [
      { kind: "CORE", side: "DEFENDER", deck: 2, x: -30, z: 0 },
      { kind: "SHRINE", deck: 1, x: -90, z: 0 }, { kind: "SHRINE", deck: 0, x: 40, z: 60 },
      { kind: "TOWER", side: "DEFENDER", deck: 1, x: -60, z: -60 }, { kind: "TOWER", side: "DEFENDER", deck: 1, x: -60, z: 60 },
    ],
    pads: [{ deck: 2, x: -64, z: -40, r: 12 }],
    spawns: [{ side: "ATTACKER", deck: 0, x: 130, z: 40 }, { side: "DEFENDER", deck: 2, x: -52, z: 16 }],
  };
}

// ---------------------------------------------------------------- DECK-HS3-EMPYREA
function empyrea() {
  const d0 = grid();                                   // THE ICE BASE
  disc(d0, 0, 0, 152);
  const d1 = grid();                                   // THE WALL-TOPS — the walls ARE the walkways
  ring(d1, 0, 0, 116, 128, 1); ring(d1, 0, 0, 66, 78, 1);
  for (const a of [30, 150, 270]) { const r = a * Math.PI / 180; band(d1, 122 * Math.cos(r), 122 * Math.sin(r), 72 * Math.cos(r), 72 * Math.sin(r), 8); } // wall-bridges ring→ring
  const d2 = grid();                                   // THE SANCTUM
  disc(d2, 0, 0, 34); ring(d2, 0, 0, 34, 40, 0); ring(d2, 0, 0, 40, 46, 1);      // sanctum + detached halo ring
  for (const a of [90, 210, 330]) { const r = a * Math.PI / 180; band(d2, 33 * Math.cos(r), 33 * Math.sin(r), 42 * Math.cos(r), 42 * Math.sin(r), 6); }
  return {
    schema: "cf-deck-prototype/1", name: "DECK-HS3-EMPYREA", title: "The Rings of Empyrea",
    zone: "HS3", palette: "tundra", sizeM: S,
    note: "V2 TRUE-STACK CONCEPT — the glacial walls carry their walkways as decks: walk the outer wall-top and cross a wall-bridge STRAIGHT to the inner ring (owner rule), lift platforms shared with HS2 rise to the Sanctum.",
    decks: [deck(0, "The Ice Base", 0, 0x9fb2bd, d0), deck(1, "The Wall-Tops", 22, 0xc2d3dc, d1), deck(2, "The Sanctum", 44, 0xdce9f0, d2)],
    connectors: [
      con("STAIR", 0, 132, 0, 1, 122, 0, 7), con("STAIR", 0, -132, 0, 1, -122, 0, 7),
      con("STAIR", 0, 0, 96, 1, 0, 72, 7),
      con("LIFT", 0, 0, -50, 2, 0, -42, 10), con("LIFT", 1, 72, 0, 2, 42, 8, 9), // the shared HS2/HS3 lift platforms
      con("BRIDGE", 2, 0, -44, 2, 0, -34, 6),                                    // halo → sanctum
    ],
    structures: [
      { kind: "CORE", side: "DEFENDER", deck: 2, x: 0, z: 0 },
      { kind: "TOWER", side: "DEFENDER", deck: 1, x: 122, z: 0 }, { kind: "TOWER", side: "DEFENDER", deck: 1, x: -122, z: 0 },
      { kind: "TOWER", side: "DEFENDER", deck: 1, x: 0, z: -122 },
      { kind: "SHRINE", deck: 0, x: 60, z: 60 },
    ],
    pads: [{ deck: 0, x: -100, z: -100, r: 14 }],
    spawns: [{ side: "ATTACKER", deck: 0, x: 140, z: -40 }, { side: "DEFENDER", deck: 2, x: 0, z: 20 }],
  };
}

for (const m of [emberfall(), aeropolis(), empyrea()]) {
  const f = path.join(OUT, m.name + ".json");
  writeFileSync(f, JSON.stringify(m) + "\n");
  const cells = m.decks.map((d) => Buffer.from(d.walk, "base64").reduce((a, b) => a + (b ? 1 : 0), 0));
  console.log(`wrote ${m.name}: decks h=[${m.decks.map((d) => d.h)}] walk cells=[${cells}] connectors=${m.connectors.length}`);
}
