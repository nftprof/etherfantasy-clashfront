#!/usr/bin/env node
// D22 — a new player's first week, scripted through the REAL living-world functions (board D16, rewards D12, influence
// D11, feed D10, calendar D17), to test doc 06's claims. Two policies play the same 7 days from Capemeet Citadel (BUS):
//   EXPLORER — each session takes what the board offers near home (events first, then a POI not cleared in 24 h)
//   GRINDER  — each session clears the nearest holdable POI, over and over
// Two 15-min sessions a day (12:00, 20:00), up to 3 skirmishes each (3–6 min). Fight outcomes are seeded PRNG (win 75 %),
// not the battle sim. A held POI is lost to other players at 10 %/day. Rewards are abstract "reward points" (base 10
// per clear) through the doc-06 anti-farm curve. Deterministic.
import fs from "node:fs";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
import { boardAt } from "./event_board.mjs";
import { resolveClear } from "./rewards.mjs";
import { regionInfluence, EX } from "./influence.mjs";
import { newsworthy } from "./region_feed.mjs";
import { journalEntry } from "./journal.mjs";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", "docs/living-world/reports/FIRST-WEEK.md"), JOUT = OUT.replace(/\.md$/, ".json"), SEED = "cf-world-1", ZONE = "BUS";
const RI = JSON.parse(fs.readFileSync("data/living-world/region-influence.json", "utf8"));
const CC = JSON.parse(fs.readFileSync("data/living-world/castle-context.json", "utf8")), HOME = CC.castles.find((c) => c.id === "BUS-CASTLE-CAPEMEET").at;
const HOLD = new Set(EX.holdable);
// BUS POIs with position, ring, threat (castle POIs + estate Nodes), nearest-first from home
const POIS = [];
for (const c of JSON.parse(fs.readFileSync("data/living-world/castle-pois.json", "utf8")).byCastle) if (c.zone === ZONE) for (const p of c.pois) POIS.push({ id: p.id, k: p.lwKind, at: p.at, ring: "CASTLE", threat: p.threat });
for (const p of JSON.parse(fs.readFileSync(`data/living-world/estate-pois/${ZONE}.json`, "utf8")).parcels) p.nodes.forEach((n, i) => POIS.push({ id: `${p.id}#${i}`, k: n.k, at: n.at, ring: p.ring, threat: n.threat }));
const d = (a) => Math.hypot(a[0] - HOME[0], a[1] - HOME[1]);
const NEAR = POIS.filter((p) => HOLD.has(p.k) && p.ring !== "CASTLE").sort((a, b) => d(a.at) - d(b.at) || (a.id < b.id ? -1 : 1));
const FIGHT_EVENTS = { BARBARIAN_RAID: "BARBARIAN_CAMP_CLEARED", SUPPLY_AIRDROP: "AIRDROP_TAKEN", CARAVAN_RUN: "CARAVAN_RAIDED", BOUNTY: "BOUNTY_CLAIMED", SPONSORED_AIRDROP: "AIRDROP_TAKEN", SKY_RAIDERS: "POI_HELD" };

function play(policy) {
  const r = mulberry32(fnv1a(`${SEED}|firstweek|${policy}`)), hist = [], held = new Set(), log = [], days = [], journal = [];
  let reward = 0, fights = 0, wins = 0, repeats = 0, stories = 0, idleSessions = 0;
  const unlockDay = {};
  for (let day = 0; day < 7; day++) {
    for (const id of [...held]) if (r() < 0.1) held.delete(id);   // other players take some back
    let dayStories = 0;
    for (const hour of [12, 20]) {
      const t0 = day * 1440 + hour * 60, board = boardAt(SEED, ZONE, t0, { at: HOME, holdings: [HOME, ...[...held].map((id) => POIS.find((p) => p.id === id).at)], sort: "DISTANCE" });
      const events = [...board.live, ...board.upcoming].filter((e) => FIGHT_EVENTS[e.kind] && e.inMin <= 30 && (e.distU == null || e.distU <= 120));
      let t = t0, took = 0, used = new Set();
      for (let f = 0; f < 3; f++) {
        let target = null, kind = null;
        if (policy === "EXPLORER") {
          const ev = events.find((e) => !used.has(e.id));
          if (ev) { target = { id: ev.at, k: ev.kind, threat: 30, ring: "WILD" }; kind = FIGHT_EVENTS[ev.kind]; used.add(ev.id); }
          else { const p = NEAR.find((p) => !held.has(p.id) && !hist.some((h) => h.poiId === p.id && h.tick > t - 1440)); if (p) { target = p; kind = "POI_CLEARED"; } }
        } else { target = NEAR[0]; kind = "POI_CLEARED"; }
        if (!target) break;
        took++; fights++; t += 4 + Math.floor(r() * 3);
        const tAt = target.at || (POIS.find((p) => p.id === target.id) || {}).at || null;
        if (r() < 0.75) {
          wins++;
          const res = resolveClear(hist, { account: "me", poiId: target.id, tick: t, base: 10 }); hist.push({ account: "me", poiId: target.id, tick: t });
          reward += res.reward; if (res.nth > 1) repeats++;
          const planted = kind === "POI_CLEARED" && HOLD.has(target.k) && r() < 0.6; if (planted) held.add(target.id);
          const item = { kind, ring: target.ring, threat: target.threat, repeatClear: res.nth > 1, facts: {} };
          if (newsworthy(item)) { stories++; dayStories++; }
          log.push({ day, hour, kind, poi: target.id, nth: res.nth, reward: res.reward });
          journal.push({ day, hour, ...journalEntry({ kind, k: target.k, won: true, nth: res.nth, mult: res.mult, reward: res.reward, planted, at: tAt, home: HOME }) });
        } else journal.push({ day, hour, ...journalEntry({ kind, k: target.k, won: false, at: tAt, home: HOME }) });
      }
      if (!took) idleSessions++;
    }
    const inf = regionInfluence(held.size, RI.regions[ZONE].holdable);
    for (const u of inf.unlocks) if (unlockDay[u] == null) unlockDay[u] = day;
    days.push({ day, held: held.size, unlocks: inf.unlocks, next: inf.next, stories: dayStories, reward });
  }
  const sessions = Array.from({ length: 14 }, (_, i) => journal.filter((j) => j.day === Math.floor(i / 2) && j.hour === (i % 2 ? 20 : 12) && j.fresh).length);
  return { policy, journalFresh: journal.filter((j) => j.fresh).length, journalMinPerSession: Math.min(...sessions), journal: journal.slice(0, 12), fights, wins, reward, rewardPerWin: +(reward / Math.max(1, wins)).toFixed(2), repeatClears: repeats, stories, idleSessions, unlockDay, days, log };
}

const runs = [play("EXPLORER"), play("GRINDER")], [E, G] = runs;
fs.writeFileSync(JOUT, JSON.stringify({ schema: "cf-living-world/first-week@1", seed: SEED, zone: ZONE, home: "BUS-CASTLE-CAPEMEET", runs: runs.map(({ log, ...x }) => x) }, null, 1) + "\n");
const md = ["# A new player's first week (scripted through the real functions)", "",
  "`tools/living-world/first_week.mjs`. Two 15-min sessions a day from Capemeet Citadel (BUS). Fights are seeded PRNG at 75 % win, not the battle sim. Rewards are abstract points (10 per clear) through the doc-06 anti-farm curve. Held POIs are lost to others at 10 % a day.", "",
  "| | EXPLORER (follows the board) | GRINDER (nearest POI, again and again) |", "|---|---|---|",
  `| Fights / wins | ${E.fights} / ${E.wins} | ${G.fights} / ${G.wins} |`,
  `| Reward points | ${E.reward} | ${G.reward} |`,
  `| **Reward per win** | **${E.rewardPerWin}** | **${G.rewardPerWin}** |`,
  `| Repeat clears (same POI within 24 h) | ${E.repeatClears} | ${G.repeatClears} |`,
  `| Stories (newsworthy feed items) | ${E.stories} | ${G.stories} |`,
  `| Personal journal: fresh stories (min per session) | ${E.journalFresh} (${E.journalMinPerSession}) | ${G.journalFresh} (${G.journalMinPerSession}) |`,
  `| Sessions with nothing to do | ${E.idleSessions} | ${G.idleSessions} |`,
  `| POIs held at day 7 | ${E.days[6].held} | ${G.days[6].held} |`,
  `| First unlock (day) | ${Object.entries(E.unlockDay).map(([u, d]) => `${u} d${d + 1}`).join(", ") || "—"} | ${Object.entries(G.unlockDay).map(([u, d]) => `${u} d${d + 1}`).join(", ") || "—"} |`, "",
  "Explorer, day by day:", "", "| Day | Held | Unlocks | Next | Stories |", "|---|---|---|---|---|",
  ...E.days.map((x) => `| ${x.day + 1} | ${x.held} | ${x.unlocks.join(", ") || "—"} | ${x.next ? `${x.next.unlock} in ${x.next.need}` : "—"} | ${x.stories} |`), "",
  "Explorer's journal, first sessions:", "", ...E.journal.slice(0, 8).map((j) => `- d${j.day + 1} ${j.hour}:00 ${j.fresh ? "" : "(repeat) "}${j.text}`), "",
  "Grinder's journal, first sessions:", "", ...G.journal.slice(0, 5).map((j) => `- d${j.day + 1} ${j.hour}:00 ${j.fresh ? "" : "(repeat) "}${j.text}`), ""].join("\n");
fs.writeFileSync(OUT, md);
console.log(md.split("\n").slice(4, 15).join("\n"));
