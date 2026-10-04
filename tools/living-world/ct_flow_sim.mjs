#!/usr/bin/env node
// D19 — CT flow simulation (doc 02 circular economy, Decision 17 burn, doc 03/04/05 escrow rules). A seeded 7-day run
// of N agents over a double-entry ledger (every move is one LedgerEntry {from, to, amt, reason}; integer centi-CT, so no
// float drift). Flows: defence stakes (40 % spoils escrow / 30 % burn / 30 % pool), Guardian fees (50 / 30 / 20),
// BOUNTY pots, SPONSORED_AIRDROP crates and SIEGE_ME dares (10 % rake burned at settlement), payouts by contribution with
// the 5 % minimum share, and the relation check (a related claimant's share is BURNED). Invariants checked at the end:
//   no mint (Σ balances constant) · no negative balance · every escrow settled to 0 · burn ≥ 10 % of all spend
//   node tools/living-world/ct_flow_sim.mjs [--seed cf-world-1] [--days 7] [--agents 60] [--out docs/living-world/reports/CT-FLOW.md]
import fs from "node:fs";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = arg("--seed", "cf-world-1"), DAYS = +arg("--days", 7), N = +arg("--agents", 60), OUT = arg("--out", "docs/living-world/reports/CT-FLOW.md"), JOUT = OUT.replace(/\.md$/, ".json");
const DF = JSON.parse(fs.readFileSync("data/living-world/defences.json", "utf8")), GU = JSON.parse(fs.readFileSync("data/living-world/guardians.json", "utf8")), PE = JSON.parse(fs.readFileSync("data/living-world/player-events.json", "utf8"));
const C = (ct) => Math.round(ct * 100);   // centi-CT
const rng = mulberry32(fnv1a(`${SEED}|ctflow`)), ri = (a, b) => a + Math.floor(rng() * (b - a + 1)), pick = (arr) => arr[Math.floor(rng() * arr.length)];

// ---- ledger ----
const bal = new Map(), entries = [], byReason = {};
const get = (a) => bal.get(a) || 0;
function move(from, to, amt, reason) {
  if (amt <= 0) return; if (from.startsWith("P:") && get(from) < amt) throw new Error(`overdraft ${from} ${amt} ${reason}`);
  bal.set(from, get(from) - amt); bal.set(to, get(to) + amt); entries.push({ from, to, amt, reason }); byReason[reason] = (byReason[reason] || 0) + amt;
}
const agents = Array.from({ length: N }, (_, i) => `P:${i}`), alliance = (p) => +p.slice(2) % 8;   // 8 alliances
for (const p of agents) bal.set(p, C(ri(300, 3000)));   // genesis balances (pre-existing CT, not minted by the sim)
const GENESIS = [...bal.values()].reduce((a, b) => a + b, 0);
let spend = 0, burned = () => get("BURN");
// the relation check (doc 05 §3): same alliance as the poster → the share is burned
const related = (a, b) => a === b || alliance(a) === alliance(b);
// payout by contribution: weights → shares, drop shares < minShare (their part is re-spread), related → BURN
function payout(escrow, poster, claimants, reasonPaid) {
  let pot = get(escrow); if (pot <= 0) return;
  const w = claimants.map(() => 1 + rng() * 4), tot = w.reduce((a, b) => a + b, 0);
  let keep = claimants.map((c, i) => ({ c, s: w[i] / tot })).filter((x) => x.s >= PE.rules.minShare);
  const kt = keep.reduce((a, x) => a + x.s, 0); keep = keep.map((x) => ({ c: x.c, s: x.s / kt }));
  keep.forEach((x, i) => { const amt = i === keep.length - 1 ? get(escrow) : Math.floor(pot * x.s); move(escrow, related(x.c, poster) ? "BURN" : x.c, amt, related(x.c, poster) ? "RELATED_SHARE_BURNED" : reasonPaid); });
}
const pay = (p, amt, reason, split) => {   // a defender/poster spend split three ways; returns the escrow account
  spend += amt; const esc = `ESCROW:${entries.length}`;
  const e = Math.floor(amt * split[0]), b = Math.floor(amt * split[1]);
  move(p, esc, e, reason + "_ESCROW"); move(p, "BURN", b, reason + "_BURN"); move(p, "POOL", amt - e - b, reason + "_POOL"); return esc;
};
const rakeAndPay = (esc, poster, claimants, reason) => { const r = Math.ceil(get(esc) * PE.rules.burnRakeMin); move(esc, "BURN", r, reason + "_RAKE"); payout(esc, poster, claimants, reason + "_PAID"); };
const open = [];   // { esc, kind, poster, endDay, outcome }
const fullStack = DF.upgrades.filter((u) => !u.estateOnly).reduce((n, u) => n + Array.from({ length: u.levels }, (_, l) => u.baseCT * DF.rating.levelCostGrowth ** l).reduce((a, b) => a + b, 0), 0);
const stats = { DEFENCE: 0, GUARDIAN: 0, BOUNTY: 0, AIRDROP: 0, SIEGE_ME: 0 };

for (let day = 0; day < DAYS; day++) {
  for (const p of agents) {
    const r = rng(), others = () => Array.from({ length: ri(1, 4) }, () => pick(agents)).filter((x, i, a) => x !== p && a.indexOf(x) === i);
    if (r < 0.06 && get(p) >= C(fullStack)) { const esc = pay(p, C(fullStack), "DEFENCE_STAKE", [DF.stakeSplit.spoilsEscrow, DF.stakeSplit.burn]); open.push({ esc, kind: "DEFENCE", poster: p, endDay: day + 7, claimants: others() }); stats.DEFENCE++; }
    else if (r < 0.10) { const f3 = rng() < 0.25, fee = C((f3 ? GU.forms["3"].feeCT : GU.forms["2"].feeCT) * pick([1, 1.5, 2])); if (get(p) >= fee) { const esc = pay(p, fee, "GUARDIAN_FEE", [GU.feeSplit.bountyEscrow, GU.feeSplit.burn]); open.push({ esc, kind: f3 ? "F3" : "F2", poster: p, endDay: day + 1, claimants: others() }); stats.GUARDIAN++; } }
    else if (r < 0.16) { const pot = C(ri(PE.kinds.find((k) => k.pevKind === "BOUNTY").minCT, 80)); if (get(p) >= pot) { spend += pot; const esc = `ESCROW:${entries.length}`; move(p, esc, pot, "BOUNTY_POT"); open.push({ esc, kind: "BOUNTY", poster: p, endDay: day + ri(1, 3), claimants: others() }); stats.BOUNTY++; } }
    else if (r < 0.19) { const crate = C(ri(20, 150)); if (get(p) >= crate) { spend += crate; const esc = `ESCROW:${entries.length}`; move(p, esc, crate, "AIRDROP_CRATE"); open.push({ esc, kind: "AIRDROP", poster: p, endDay: day, claimants: others().slice(0, 1) }); stats.AIRDROP++; } }
    else if (r < 0.22) { const dare = C(ri(PE.kinds.find((k) => k.pevKind === "SIEGE_ME").dareMinCT, 60)); if (get(p) >= dare) { spend += dare; const esc = `ESCROW:${entries.length}`; move(p, esc, dare, "SIEGE_ME_DARE"); open.push({ esc, kind: "SIEGE_ME", poster: p, endDay: day + 1, claimants: others() }); stats.SIEGE_ME++; } }
  }
  // settle everything whose window ended today (and drain everything on the last day: escrows must always settle)
  for (const e of open.filter((x) => !x.done && (x.endDay <= day || day === DAYS - 1))) {
    e.done = true; const won = rng(), cl = e.claimants.length ? e.claimants : [];
    if (e.kind === "DEFENCE") { if (won < 0.35 && cl.length) payout(e.esc, e.poster, cl, "DEFENCE_SPOILS_PAID"); else move(e.esc, e.poster, get(e.esc), "DEFENCE_REFUND"); }
    else if (e.kind === "F2" || e.kind === "F3") {
      if (won < 0.45 && cl.length) payout(e.esc, e.poster, cl, "GUARDIAN_BOUNTY_PAID");
      else if (e.kind === "F3" && won < 0.65 && cl.length) { const half = Math.floor(get(e.esc) / 2); move(e.esc, e.poster, half, "GUARDIAN_HALF_REFUND"); payout(e.esc, e.poster, cl, "GUARDIAN_OUTLASTED_PAID"); }
      else move(e.esc, e.poster, get(e.esc), "GUARDIAN_REFUND");
    } else if (e.kind === "BOUNTY") { if (won < 0.6 && cl.length) rakeAndPay(e.esc, e.poster, cl, "BOUNTY"); else { move(e.esc, "BURN", Math.ceil(get(e.esc) * PE.rules.burnRakeMin), "BOUNTY_EXPIRY_RAKE"); move(e.esc, e.poster, get(e.esc), "BOUNTY_REFUND"); } }
    else if (e.kind === "AIRDROP") { if (cl.length) rakeAndPay(e.esc, e.poster, cl, "AIRDROP"); else { move(e.esc, "BURN", Math.ceil(get(e.esc) * PE.rules.burnRakeMin), "AIRDROP_RAKE"); move(e.esc, "POOL", get(e.esc), "AIRDROP_UNCLAIMED_TO_POOL"); } }
    else if (e.kind === "SIEGE_ME") { if (won < 0.5 && cl.length) rakeAndPay(e.esc, e.poster, cl, "SIEGE_ME"); else { move(e.esc, "BURN", Math.ceil(get(e.esc) * PE.rules.burnRakeMin), "SIEGE_ME_RAKE"); move(e.esc, e.poster, get(e.esc), "SIEGE_ME_DARE_REFUND"); } }
  }
}

const total = [...bal.values()].reduce((a, b) => a + b, 0);
const openEscrow = [...bal.entries()].filter(([k, v]) => k.startsWith("ESCROW:") && v !== 0);
const inv = {
  noMint: total === GENESIS,
  noNegativeBalance: [...bal.entries()].filter(([k]) => k.startsWith("P:")).every(([, v]) => v >= 0),
  escrowsSettled: openEscrow.length === 0,
  burnRatio: +(burned() / spend).toFixed(4),
  burnAtLeast10pct: burned() >= 0.1 * spend,
};
const ct = (c) => +(c / 100).toFixed(2);
const report = { schema: "cf-living-world/ct-flow@1", seed: SEED, days: DAYS, agents: N, events: stats, ledgerEntries: entries.length, genesisCT: ct(GENESIS), spendCT: ct(spend), burnedCT: ct(burned()), poolCT: ct(get("POOL")), invariants: inv, byReasonCT: Object.fromEntries(Object.entries(byReason).sort().map(([k, v]) => [k, ct(v)])) };
fs.writeFileSync(JOUT, JSON.stringify(report, null, 1) + "\n");
const md = ["# CT flow simulation: 7 days of stakes, fees, bounties and escrows", "",
  `Generated by \`tools/living-world/ct_flow_sim.mjs\` (seed \`${SEED}\`, ${N} agents in 8 alliances, ${DAYS} days, ${entries.length.toLocaleString("en")} ledger entries in integer centi-CT). Deterministic. Outcomes are drawn by PRNG; the battles aren't simulated.`, "",
  `Events: ${Object.entries(stats).map(([k, v]) => `${v} ${k}`).join(", ")}. Spend ${ct(spend).toLocaleString("en")} CT; burned **${ct(burned()).toLocaleString("en")} CT (${(100 * inv.burnRatio).toFixed(1)} %)**; land-yield pool ${ct(get("POOL")).toLocaleString("en")} CT.`, "",
  "| Invariant | Holds |", "|---|---|",
  `| No mint: Σ all accounts (players + escrows + pool + burn) equals genesis | ${inv.noMint ? "✅" : "❌"} |`,
  `| No player balance goes negative | ${inv.noNegativeBalance ? "✅" : "❌"} |`,
  `| Every escrow settles to 0 (paid, refunded, raked or pooled) | ${inv.escrowsSettled ? "✅" : "❌ " + openEscrow.length + " open"} |`,
  `| Burn ≥ 10 % of all spend (Decision 17) | ${inv.burnAtLeast10pct ? "✅" : "❌"} (${(100 * inv.burnRatio).toFixed(1)} %) |`, "",
  "| Flow | CT |", "|---|---|", ...Object.entries(report.byReasonCT).map(([k, v]) => `| ${k} | ${v.toLocaleString("en")} |`), "",
  "`RELATED_SHARE_BURNED` is the doc-05 relation check at work: claimants in the poster's alliance get nothing, and their share is burned.", ""].join("\n");
fs.writeFileSync(OUT, md);
console.log(md.split("\n").slice(4, 12).join("\n"));
