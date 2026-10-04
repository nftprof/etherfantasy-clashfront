#!/usr/bin/env node
// D10 — the region feed (doc 05 §4 "every outcome is news", doc 06 §1 "something happened"). Pure functions:
//   headline(item)        → { icon, text } using feed-templates.json; the variant is fnv1a(item.id) % variants
//   newsworthy(item)      → false for repeat clears (anti-farm) and routine low-threat clears
//   score(item)           → kind weight + 2 × log10(pot CT); the feed shows the top perRegionPerDay per region per day
//   regionFeed(items)     → { [zone]: { [day]: [headline…] } }
// CLI: builds a deterministic synthetic day for every zone from the seeded castle POIs (outcomes drawn with the
// seeded PRNG, NOT the battle sim; the sides are placeholder warbands) → data/living-world/region-feed.sample.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
export const FT = rd("data/living-world/feed-templates.json");
const PA = rd("data/living-world/poi-archetypes.json");

export function headline(item) {
  const K = FT.kinds[item.kind]; if (!K) throw new Error("unknown feed kind " + item.kind);
  const v = K.variants[fnv1a(item.id) % K.variants.length];
  return { icon: K.icon, text: v.replace(/\{(\w+)\}/g, (_, k) => (item.facts[k] != null ? String(item.facts[k]) : "?")) };
}
export function newsworthy(item) {
  if (item.repeatClear && !FT.rules.repeatClearIsNews) return false;   // doc 06 §4: farming the same POI is never a story
  if (item.kind === "POI_CLEARED") { const b = PA.threatBands[item.ring] || PA.threatBands.WILD; return item.threat >= b.lo + (b.hi - b.lo) * FT.rules.clearIsNewsAtBandFrac; }
  return true;
}
export const score = (item) => FT.kinds[item.kind].weight + FT.rules.potWeightPerLog10CT * Math.log10(1 + (item.facts.pot || 0));
export function regionFeed(items) {
  const out = {};
  for (const it of items.filter(newsworthy)) { const d = Math.floor(it.tick / 1440); ((out[it.zone] ||= {})[d] ||= []).push(it); }
  for (const z of Object.keys(out)) for (const d of Object.keys(out[z]))
    out[z][d] = out[z][d].sort((a, b) => score(b) - score(a) || a.tick - b.tick || (a.id < b.id ? -1 : 1)).slice(0, FT.rules.perRegionPerDay)
      .map((it) => ({ id: it.id, tick: it.tick, kind: it.kind, score: +score(it).toFixed(2), ...headline(it) }));
  return out;
}

// ---- synthetic sample day (placeholder warband names; real feeds carry player/alliance names) ----
const BANDS = ["Raiders of the Gullshoal", "The Ember Oath", "Ninefold Company", "Saltwind Free Lances", "Order of the Last Lantern", "The Quiet Knives"];
const LABEL = { WILD_LAIR: "wild lair", WAR_CAMP: "war camp", HARBOUR: "harbour", MERCENARY_POST: "mercenary post", AIRSHIP_DOCK: "airship dock", VENT: "vent", SALVAGE_SITE: "salvage site" };
export function sampleDay(seed = "cf-world-1", day = 0) {
  const CP = rd("data/living-world/castle-pois.json"), CC = rd("data/living-world/castle-context.json");
  const name = Object.fromEntries(CC.castles.map((c) => [c.id, c.name])), items = [];
  for (const c of CP.byCastle) {
    const rng = mulberry32(fnv1a(`${seed}|feed|${day}|${c.castleId}`)), pickB = () => BANDS[Math.floor(rng() * BANDS.length)];
    const place = name[c.castleId] || c.castleId, mk = (kind, extra, facts) => items.push({ id: `${seed}|${day}|${c.castleId}|${items.length}`, zone: c.zone, tick: day * 1440 + Math.floor(rng() * 1440), kind, ...extra, facts: { place, ...facts } });
    for (const p of c.pois) {
      const r = rng(), attacker = pickB(), defender = pickB();
      if (p.lwKind === "GUARDIAN_PERCH") { if (r < 0.15) { const f3 = rng() < 0.3, pot = Math.round((f3 ? 120 : 20) * { KEEP: 1, CASTLE: 1.5, PALACE: 2 }[c.kind] * 0.5);
        // a held Guardian returns its escrow, so its story carries no pot
        const out = f3 ? (rng() < 0.5 ? "GUARDIAN_UNBOUND" : rng() < 0.6 ? "GUARDIAN_OUTLASTED" : "GUARDIAN_HELD") : rng() < 0.55 ? "GUARDIAN_KO" : "GUARDIAN_HELD";
        mk(out, {}, { attacker, defender, form: f3 ? "Ascendant" : "Warden", pot: out === "GUARDIAN_HELD" ? undefined : out === "GUARDIAN_OUTLASTED" ? Math.round(pot / 2) : pot }); } continue; }
      if (p.lwKind === "BARBARIAN_CAMP" && r < 0.25) { mk("BARBARIAN_CAMP_CLEARED", {}, { attacker }); continue; }
      if (p.lwKind === "AIRDROP_ZONE" && r < 0.2) { mk("AIRDROP_TAKEN", {}, { attacker, sponsor: rng() < 0.5 ? "Pentagon Games" : "guild", rivals: 1 + Math.floor(rng() * 4) }); continue; }
      if (p.lwKind === "CARAVAN_WAYPOINT" && r < 0.3) { mk(rng() < 0.45 ? "CARAVAN_RAIDED" : "CARAVAN_ESCORTED", {}, { attacker }); continue; }
      if (LABEL[p.lwKind] && r < 0.3) { const held = rng() < 0.3, repeatClear = !held && rng() < 0.35;
        mk(held ? "POI_HELD" : "POI_CLEARED", { ring: "CASTLE", threat: p.threat, repeatClear }, { attacker, defender, poi: LABEL[p.lwKind] }); }
    }
    if (c.kind !== "KEEP" && rng() < 0.12) { const broke = rng() < 0.5, pot = 20 + Math.floor(rng() * 200);
      mk(broke ? "SIEGE_ME_BROKEN" : "SIEGE_ME_HELD", {}, { attacker: pickB(), defender: pickB(), pot: broke ? pot : undefined, losses: 20 + Math.floor(rng() * 60) }); }
  }
  return items;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "data/living-world/region-feed.sample.json");
  const items = sampleDay(), feed = regionFeed(items), shown = Object.values(feed).reduce((n, d) => n + Object.values(d).reduce((m, a) => m + a.length, 0), 0);
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/region-feed-sample@1", note: "synthetic day 0, seed cf-world-1; placeholder warbands; outcomes drawn by PRNG (not the sim)", candidates: items.length, newsworthy: items.filter(newsworthy).length, shown, feed }, null, 1) + "\n");
  console.log(`region-feed: ${items.length} outcomes → ${items.filter(newsworthy).length} newsworthy → ${shown} headlines across ${Object.keys(feed).length} regions`);
}
