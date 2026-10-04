#!/usr/bin/env node
// D60 — the client hand-off spec (plan G), GENERATED from the live functions so it can't drift: for every surface the
// client renders, the producing function, the inferred field shape and one real sample.
//   node tools/living-world/client_spec.mjs [--out docs/living-world/reports/CLIENT-SPEC.md]
import fs from "node:fs";
import { boardAt } from "./event_board.mjs";
import { regionFeed, sampleDay } from "./region_feed.mjs";
import { journalEntry } from "./journal.mjs";
import { stationingsFor, challengeRow } from "./stationings.mjs";
import { shipsAt } from "./ambient_traffic.mjs";
import { resolveArrival } from "./arrivals.mjs";
import { beats } from "./season_beats.mjs";
import { regionInfluence } from "./influence.mjs";
import { t } from "./i18n.mjs";
const OUT = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : "docs/living-world/reports/CLIENT-SPEC.md"; })();
const E2E = JSON.parse(fs.readFileSync("docs/living-world/reports/E2E.json", "utf8"));

// shape(v): a compact type map ("string", "number", "boolean", "T[]", { key: type }); optional keys get "?" by merging samples
function shape(v) {
  if (Array.isArray(v)) return v.length ? [merge(v.map(shape))] : ["unknown"];
  if (v === null) return "null"; if (typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])]));
  return typeof v;
}
function merge(shapes) {
  if (shapes.every((s) => typeof s === "string")) return [...new Set(shapes)].sort().join(" | ");
  const objs = shapes.filter((s) => s && typeof s === "object" && !Array.isArray(s)); if (!objs.length) return shapes[0];
  const keys = [...new Set(objs.flatMap(Object.keys))].sort();
  return Object.fromEntries(keys.map((k) => { const vs = objs.filter((o) => k in o).map((o) => o[k]); return [vs.length < objs.length ? k + "?" : k, merge(vs)]; }));
}
const render = (s, ind = "") => (typeof s === "string" ? s : Array.isArray(s) ? `${render(s[0], ind)}[]` : "{\n" + Object.entries(s).map(([k, v]) => `${ind}  ${k}: ${render(v, ind + "  ")}`).join("\n") + `\n${ind}}`);

export function surfaces() {
  const b = boardAt("cf-world-1", "BUS", 720, { at: [17.1, 30.27], holdings: [[17.1, 30.27]] }), rows = [...b.live, ...b.upcoming];
  const feed = Object.values(regionFeed(sampleDay())).flatMap((d) => Object.values(d).flat());
  const st = stationingsFor("cf-world-1", "BUS", 2).ledger.filter((s) => s.start <= 720 && s.end > 720).map((s) => challengeRow(s, 720));
  const ships = shipsAt("cf-world-1", 777);
  const arr = ["NAVAL_LANDING", "AIRSHIP_DROP"].map((e) => resolveArrival("1001178", e, "s1"));
  const sb = beats("cf-world-1", 0).BUS.map((x) => ({ ...x, banner: t({ STORM_FRONT: "beat.stormFront", THREAT_PEAK: "beat.threatPeak", LULL: "beat.lull", ASCENSION_NIGHT: "beat.ascensionNight" }[x.beat], { region: "Porthaven", boss: x.boss ? t("boss." + x.boss) : "" }) }));
  return [
    { id: "board_row", title: "Event board row", fn: "event_board.mjs boardAt(seed, zone, tick, view) → { live: Row[], upcoming: Row[] }", values: rows },
    { id: "feed_item", title: "Region feed headline", fn: "region_feed.mjs regionFeed(items) → { zone: { day: Headline[] } }", values: feed },
    { id: "journal_entry", title: "Personal journal line", fn: "journal.mjs journalEntry({ kind, k, won, nth, mult, reward, planted, at, home, lang })", values: [journalEntry({ kind: "POI_CLEARED", k: "WILD_LAIR", won: true, reward: 10, planted: true, at: [10, 5], home: [0, 0] }), journalEntry({ kind: "BOUNTY_CLAIMED", k: null, won: false })] },
    { id: "guardian_banner", title: "Guardian challenge (board row + wake banner)", fn: "stationings.mjs challengeRow(stationing, tick)", values: st },
    { id: "ship", title: "Ambient ship / airship position", fn: "ambient_traffic.mjs shipsAt(seed, tick) → Ship[]", values: ships },
    { id: "arrival", title: "Arrival marker (naval landing / airship drop)", fn: "arrivals.mjs resolveArrival(mapId, event, battleSeed)", values: arr },
    { id: "season_beat", title: "Season beat (calendar strip + banner)", fn: "season_beats.mjs beats(seed, cycle)[zone] + i18n beat.* copy", values: sb },
    { id: "influence", title: "Region influence panel", fn: "influence.mjs regionInfluence(held, regionTotal)", values: [regionInfluence(4, 4629), regionInfluence(12, 4629)] },
    { id: "battle_result", title: "Battle result screen (effects)", fn: "resolve_result.mjs resolveResult(world, alloc, callback) → effects[]", values: E2E.fights.flatMap((f) => f.resolved.effects) },
  ];
}
if (process.argv[1] && process.argv[1].endsWith("client_spec.mjs")) {
  const S = surfaces();
  const md = ["# Client hand-off spec (generated)", "", "`tools/living-world/client_spec.mjs` builds this from the live functions: each surface's producing function, the field shape inferred over real samples (`?` = optional), and one sample. A test regenerates it, so it always matches the code. All copy comes from `i18n/<lang>.json`, and every function is deterministic, so the client can cache by its inputs.", "",
    ...S.flatMap((s) => [`## ${s.title}`, "", `Producer: \`${s.fn}\` (${s.values.length} sample${s.values.length === 1 ? "" : "s"} merged)`, "", "```ts", `type ${s.id} = ${render(merge(s.values.map(shape)))}`, "```", "", "Sample:", "", "```json", JSON.stringify(s.values[0], null, 1), "```", ""])].join("\n");
  fs.writeFileSync(OUT, md); console.log(`client spec: ${S.length} surfaces → ${OUT}`);
}
