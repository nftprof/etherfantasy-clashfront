#!/usr/bin/env node
// D44 — validates every event against data/living-world/event-contract.json: one contract entry per event (both ways),
// common fields typed, `who` in the enum, the shape's required fields present and typed (range = [lo, hi] integers,
// lo ≤ hi), anyOf satisfied, no unknown fields (catches typos), and the scope rules: battle decks, the world calendar and
// allocate payloads only use events whose scope allows it. validate() → [] when everything is consistent.
import fs from "node:fs";
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
export function validate() {
  const PA = rd("data/living-world/poi-archetypes.json"), EC = rd("data/living-world/event-contract.json"), WC = rd("data/living-world/world-calendar.json"), AL = rd("data/living-world/allocate.samples.json");
  const E = [], COMMON = ["src", "teleSec", "durSec", "who"];
  const typeOk = (t, v) => (t === "number" ? typeof v === "number" && v >= 0 : t === "string" ? typeof v === "string" : t === "range" ? Array.isArray(v) && v.length === 2 && v.every(Number.isInteger) && v[0] <= v[1] : false);
  for (const k of Object.keys(PA.events)) if (!EC.events[k]) E.push(`${k}: no contract entry`);
  for (const k of Object.keys(EC.events)) if (!PA.events[k]) E.push(`${k}: contract entry for an undefined event`);
  for (const [k, ev] of Object.entries(PA.events)) {
    const c = EC.events[k]; if (!c) continue; const S = EC.shapes[c.shape];
    if (!S) { E.push(`${k}: unknown shape ${c.shape}`); continue; }
    if (!["BATTLE", "OVERWORLD", "BOTH"].includes(c.scope)) E.push(`${k}: bad scope ${c.scope}`);
    if (!(typeof ev.src === "string" && typeOk("number", ev.teleSec) && typeOk("number", ev.durSec) && EC.who.includes(ev.who))) E.push(`${k}: common fields (src, teleSec ≥ 0, durSec ≥ 0, who ∈ enum)`);
    for (const [f, t] of Object.entries(S.required)) if (!typeOk(t, ev[f])) E.push(`${k}: ${c.shape} needs ${f} (${t})`);
    if (S.anyOf && !S.anyOf.some((f) => ev[f] != null)) E.push(`${k}: ${c.shape} needs one of ${S.anyOf.join("/")}`);
    for (const [f, v] of Object.entries(ev)) { if (COMMON.includes(f) || f in S.required) continue; if (!(f in S.optional)) E.push(`${k}: unknown field ${f} for ${c.shape}`); else if (!typeOk(S.optional[f], v)) E.push(`${k}: ${f} should be ${S.optional[f]}`); }
  }
  for (const a of PA.archetypes) for (const [e] of a.deck) if (!PA.events[e]) E.push(`${a.lwKind} deck: undefined event ${e}`);
  for (const k of Object.keys(WC.kinds)) if (!EC.events[k] || EC.events[k].scope === "BATTLE") E.push(`world calendar: ${k} is not an overworld event`);
  for (const [name, s] of Object.entries(AL.samples)) for (const d of s.livingWorld.eventDeck) if (!EC.events[d.event] || EC.events[d.event].scope === "OVERWORLD") E.push(`allocate ${name}: ${d.event} can't go to a battle`);
  return E;
}
if (process.argv[1] && process.argv[1].endsWith("validate_events.mjs")) { const e = validate(); console.log(e.length ? e.join("\n") : "events: all consistent with event-contract.json"); process.exit(e.length ? 1 : 0); }
