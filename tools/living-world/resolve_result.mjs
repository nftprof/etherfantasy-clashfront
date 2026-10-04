#!/usr/bin/env node
// D36 — the other half of the wire (doc 08): a v1 result callback (cf-overworld ALLOCATE-CALLBACK-SCHEMA §2) for a
// living-world battle → world updates, as one pure function resolveResult(world, alloc, cb) → { world, effects }.
//   · idempotent on battleId (a re-delivery returns { duplicate: true } and changes nothing); a second callback for the
//     same battle with a different matchId is a CONFLICT (brief §2 / doc 09: results are never silently overwritten)
//   · ATTACKER win: a holdable POI changes holder; the defence spoils escrow pays the attacker (doc 03); the Guardian
//     escrow settles by outcome — KO / UNBOUND → all to the attacker, OUTLASTED → half, HELD → untouched (doc 04 §3);
//     a related attacker's share is BURNED (doc 05 §3); a barbarian camp clear starts the 48 h lull (doc 06)
//   · DEFENDER win: holder and escrows unchanged (they settle on expiry)
//   · officers' raw impact is clamped to HERO_IMPACT_MAX = 0.20 (canon invariant 4) before it scales the clear reward
//   · the attacker's unit losses are priced at canon re-training CT (informational: that CT was spent when trained)
//   · emits a region-feed item (D10, if newsworthy) and a journal line (D26) per side
// The Guardian outcome rides in an additive callback block `livingWorld: { guardianOutcome }` (proposal, as doc 08 §2).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveClear } from "./rewards.mjs";
import { newsworthy } from "./region_feed.mjs";
import { journalEntry } from "./journal.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const HERO_IMPACT_MAX = 0.2;
const EX = JSON.parse(fs.readFileSync(path.join(ROOT, "data/living-world/experience.json"), "utf8")), HOLD = new Set(EX.holdable);
// canon re-training cost: cf-overworld packages/shared/balance.json v2 (RE-SCALED ÷100) units.trainCtUnitsPerSoldier, in
// ct_units (1 CT = 10,000, docs/08 CT_UNITS_PER_CT). NB the docs/03 §3 table (2 / 10 CT) predates that re-scale.
const BAL = JSON.parse(fs.readFileSync("/home/user/cf-overworld/packages/shared/balance.json", "utf8"));
export const TRAIN = Object.fromEntries(Object.entries(BAL.units.trainCtUnitsPerSoldier).map(([c, u]) => [c, u / 10000]));
const clone = (w) => JSON.parse(JSON.stringify(w));
const move = (w, from, to, amt, reason) => { if (amt <= 0) return; w.bal[from] = (w.bal[from] || 0) - amt; w.bal[to] = (w.bal[to] || 0) + amt; w.ledger.push({ from, to, amt, reason }); };

export function resolveResult(world0, alloc, cb) {
  const prior = world0.processed[cb.battleId];
  if (prior) return prior === cb.matchId ? { world: world0, duplicate: true, effects: [] } : { world: world0, conflict: true, status: 409, effects: [] };
  const w = clone(world0), lw = alloc.livingWorld, poiId = lw.poiId, atkGov = alloc.sides.ATTACKER.governorId, defGov = alloc.sides.DEFENDER.governorId;
  const related = defGov != null && (w.alliance[atkGov] != null && w.alliance[atkGov] === w.alliance[defGov]);
  const effects = [], won = cb.outcome.winner === "ATTACKER";
  w.processed[cb.battleId] = cb.matchId;
  // hero impact: raw → clamped (canon invariant 4); it scales the attacker's clear reward (+0..20 %)
  const raw = Math.max(0, ...((cb.sides.ATTACKER.officers || []).map((o) => (o.contribution && o.contribution.rawImpact) || 0)), 0), heroImpact = Math.min(HERO_IMPACT_MAX, raw);
  const lossCT = Object.entries(cb.sides.ATTACKER.casualties || {}).reduce((n, [c, k]) => n + k * (TRAIN[c] || 0), 0);
  effects.push({ kind: "ATTACKER_LOSSES", casualties: cb.sides.ATTACKER.casualties, retrainCT: Math.round(lossCT * 100) / 100 });
  const pay = (acct, reason) => { const amt = w.bal[acct] || 0; if (amt > 0) { move(w, acct, related ? "BURN" : atkGov, amt, related ? "RELATED_SHARE_BURNED" : reason); effects.push({ kind: reason, ct: amt / 100, burned: related }); } };
  let feedKind = null;
  if (won) {
    if (HOLD.has(lw.lwKind)) { w.holders[poiId] = atkGov; effects.push({ kind: "HOLDER_CHANGED", poiId, from: defGov, to: atkGov }); }
    // a castle battle (its Guardian perch): the castle itself changes hands only through the canon post-victory flow —
    // the WINNER chooses PILLAGE or OCCUPY, once (canon invariant 10). The resolver raises the choice; it never takes it.
    if (lw.lwKind === "GUARDIAN_PERCH") effects.push({ kind: "POST_VICTORY_CHOICE", castleId: alloc.parcel.parcelId, chooser: atkGov, options: ["PILLAGE", "OCCUPY"] });
    if (lw.lwKind === "BARBARIAN_CAMP") { w.lulls.push({ zone: alloc.parcel.zone, tick: w.tick }); effects.push({ kind: "LULL_STARTED", zone: alloc.parcel.zone, hours: EX.lullHours.BARBARIAN_CAMP }); }
    pay(`ESCROW:DEFENCE:${poiId}`, "DEFENCE_SPOILS_PAID");
    const go = cb.livingWorld && cb.livingWorld.guardianOutcome, gAcct = `ESCROW:GUARDIAN:${poiId}`;
    if (go === "KO" || go === "UNBOUND") pay(gAcct, "GUARDIAN_BOUNTY_PAID");
    if (go === "OUTLASTED") { const half = Math.floor((w.bal[gAcct] || 0) / 2); move(w, gAcct, w.guardianOwner[poiId], half, "GUARDIAN_HALF_REFUND"); pay(gAcct, "GUARDIAN_OUTLASTED_PAID"); }
    feedKind = go === "KO" ? "GUARDIAN_KO" : go === "UNBOUND" ? "GUARDIAN_UNBOUND" : go === "OUTLASTED" ? "GUARDIAN_OUTLASTED" : lw.lwKind === "BARBARIAN_CAMP" ? "BARBARIAN_CAMP_CLEARED" : "POI_CLEARED";
    const clr = resolveClear(w.clears, { account: atkGov, poiId, tick: w.tick, base: 10 }); w.clears.push({ account: atkGov, poiId, tick: w.tick });
    const reward = Math.floor(clr.reward * (1 + heroImpact));
    effects.push({ kind: "CLEAR_REWARD", nth: clr.nth, mult: clr.mult, heroImpact, rewardPoints: reward });
    w.journal.push({ who: atkGov, ...journalEntry({ kind: feedKind.startsWith("GUARDIAN") ? "POI_CLEARED" : feedKind, k: lw.lwKind, won: true, nth: clr.nth, mult: clr.mult, reward }) });
    if (defGov) w.journal.push({ who: defGov, ...journalEntry({ kind: "POI_CLEARED", k: lw.lwKind, won: false }) });
    const item = { kind: feedKind, ring: "CASTLE", threat: lw.threat, repeatClear: clr.nth > 1, facts: {} };
    if (newsworthy(item)) w.feed.push({ battleId: cb.battleId, kind: feedKind, poiId });
  } else {
    feedKind = cb.livingWorld && cb.livingWorld.guardianOutcome === "HELD" ? "GUARDIAN_HELD" : "POI_HELD";
    w.feed.push({ battleId: cb.battleId, kind: feedKind, poiId });
    w.journal.push({ who: atkGov, ...journalEntry({ kind: "POI_CLEARED", k: lw.lwKind, won: false }) });
    effects.push({ kind: "HELD", poiId, holder: defGov });
  }
  return { world: w, effects };
}
export const newWorld = (bal = {}, extra = {}) => ({ tick: 0, processed: {}, holders: {}, alliance: {}, guardianOwner: {}, bal: { ...bal }, ledger: [], clears: [], lulls: [], feed: [], journal: [], ...extra });
