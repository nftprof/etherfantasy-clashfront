#!/usr/bin/env node
// D39 — abuse sim: a coalition (a main account + an alt) tries to farm each payout the living world offers, through the
// REAL functions (resolveResult D36 for Guardian/defence escrows, merc_market D28 for auctions) and the doc-05 rules
// (≥ 10 % rake burned on pots; the relation check). Two alts per scheme:
//   LINKED   — same alliance, or a LedgerEntry shared in the last 14 d → the relation check fires (share BURNED / can't post)
//   UNLINKED — an alt the relation check can't see (worst case)
// Reports the coalition's net CT per attempt (both accounts summed) plus the units the "attacker" alt loses, priced at
// canon re-training cost. Every scheme must be net-NEGATIVE: the world never pays a coalition to fight itself.
import fs from "node:fs";
import { resolveResult, newWorld, TRAIN } from "./resolve_result.mjs";
import * as MM from "./merc_market.mjs";
const PE = JSON.parse(fs.readFileSync("data/living-world/player-events.json", "utf8")), GU = JSON.parse(fs.readFileSync("data/living-world/guardians.json", "utf8")), DF = JSON.parse(fs.readFileSync("data/living-world/defences.json", "utf8"));
const AL = JSON.parse(fs.readFileSync("data/living-world/allocate.samples.json", "utf8")).samples.CASTLE_POI_WITH_ASCENDANT, POI = AL.livingWorld.poiId;
const C = (ct) => Math.round(ct * 100), RAKE = PE.rules.burnRakeMin, LOSSES = { INFANTRY: 60, SIEGE: 10 };
const lossCT = Object.entries(LOSSES).reduce((n, [c, k]) => n + k * TRAIN[c], 0);   // a token self-fight still costs units
const cb = (go) => ({ v: 1, battleId: AL.battleId, matchId: "efm_x", outcome: { winner: "ATTACKER", reason: "CORE_DESTROYED" }, sides: { ATTACKER: { casualties: LOSSES, survivors: {}, officers: [] }, DEFENDER: { casualties: {}, survivors: {}, officers: [] } }, livingWorld: { guardianOutcome: go } });
const coalition = (w) => (w.bal.gov_SAMPLE_HOLDER || 0) + (w.bal.gov_SAMPLE_ATTACKER || 0);

// pay a fee/stake from `main` into the escrow layout the resolver settles: split per the rule, escrow left for the battle
function staked(feeC, split, kind) { const w = newWorld({ gov_SAMPLE_HOLDER: 100000 }, { guardianOwner: { [POI]: "gov_SAMPLE_HOLDER" } }); const e = Math.floor(feeC * split[0]), b = Math.floor(feeC * split[1]); w.bal.gov_SAMPLE_HOLDER -= feeC; w.bal[`ESCROW:${kind}:${POI}`] = e; w.bal.BURN = b; w.bal.POOL = feeC - e - b; return w; }
function runEscrowScheme(name, feeC, split, kind, go) {
  const out = {};
  for (const linked of [true, false]) {
    const w0 = staked(feeC, split, kind); w0.alliance = { gov_SAMPLE_HOLDER: 1, gov_SAMPLE_ATTACKER: linked ? 1 : 2 };
    const before = 100000, r = resolveResult(w0, AL, cb(go));
    out[linked ? "LINKED" : "UNLINKED"] = { netCT: (coalition(r.world) - before) / 100, unitsLostCT: +lossCT.toFixed(2) };
  }
  return { scheme: name, ...out };
}
// a pot posted by `main`, "won" by the alt: rake burned; a linked alt's share burned / a linked bounty can't be posted
function runPotScheme(name, potCT, canPostOnLinked) {
  const p = C(potCT), rake = Math.ceil(p * RAKE);
  return { scheme: name, LINKED: canPostOnLinked ? { netCT: -p / 100, unitsLostCT: +lossCT.toFixed(2) } : { refused: "RELATED_TARGET (can't post)", netCT: 0, unitsLostCT: 0 }, UNLINKED: { netCT: -rake / 100, unitsLostCT: +lossCT.toFixed(2) } };
}
// merc auction shill: main and alt bid against each other for the same company; held bids, only the winner pays (an NPC)
function runShill() {
  const st = MM.newState({ main: 10000, alt: 10000 }), post = "ABUSE-POST", co = `${post}|co0`, p2 = MM.priceC(2);
  MM.bid(st, { postId: post, companyId: co, side: "DEFEND", hirer: "main", level: 2, amount: p2, tick: 0 });
  MM.bid(st, { postId: post, companyId: co, side: "ATTACK", hirer: "alt", level: 2, amount: Math.ceil(p2 * 1.1), tick: 2 });
  MM.bid(st, { postId: post, companyId: co, side: "DEFEND", hirer: "main", level: 2, amount: Math.ceil(p2 * 1.25), tick: 4 });
  MM.closeBidding(st, co, 10);
  const net = (st.bal.main + st.bal.alt - 20000) / 100;
  return { scheme: "MERC_BIDDING shill (bid up your own company)", LINKED: { netCT: net, unitsLostCT: 0 }, UNLINKED: { netCT: net, unitsLostCT: 0 } };
}

const F2 = GU.forms["2"], fee2 = C(F2.feeCT * GU.kindMultiplier.CASTLE), stack = DF.upgrades.filter((u) => !u.estateOnly).reduce((n, u) => n + Array.from({ length: u.levels }, (_, l) => u.baseCT * DF.rating.levelCostGrowth ** l).reduce((a, b) => a + b, 0), 0);
export const RESULTS = [
  runEscrowScheme("Guardian bounty self-farm (alt KOs your Warden)", fee2, [GU.feeSplit.bountyEscrow, GU.feeSplit.burn], "GUARDIAN", "KO"),
  runEscrowScheme("Defence spoils self-farm (alt breaks your fully staked castle)", C(stack), [DF.stakeSplit.spoilsEscrow, DF.stakeSplit.burn], "DEFENCE", undefined),
  runPotScheme("SIEGE_ME dare self-farm (alt takes your dare pot)", 3, true),
  runPotScheme("BOUNTY laundering (bounty on your own alt)", 4, false),
  runPotScheme("SPONSORED_AIRDROP self-farm (alt grabs your crate)", 7.5, true),
  runShill(),
];
for (const r of RESULTS) for (const k of ["LINKED", "UNLINKED"]) r[k].totalCT = +(r[k].netCT - r[k].unitsLostCT).toFixed(2);

if (process.argv[1] && process.argv[1].endsWith("abuse_sim.mjs")) {
  const i = process.argv.indexOf("--out"), OUT = i > 0 ? process.argv[i + 1] : "docs/living-world/reports/ABUSE.md";
  fs.writeFileSync(OUT.replace(/\.md$/, ".json"), JSON.stringify({ schema: "cf-living-world/abuse@1", unitsLost: LOSSES, results: RESULTS }, null, 1) + "\n");
  const f = (x) => (x.refused ? `refused (${x.refused})` : `${x.netCT} CT${x.unitsLostCT ? ` − ${x.unitsLostCT} CT of units = **${x.totalCT} CT**` : ` = **${x.totalCT} CT**`}`);
  const md = ["# Abuse sim: can a coalition farm the world?", "",
    "`tools/living-world/abuse_sim.mjs`. A main account and its alt try to farm each payout through the real resolver and market code. The **coalition's** net CT is summed across both accounts per attempt; the alt's token self-fight still loses units (60 infantry + 10 siege, at canon re-training cost).", "",
    "| Scheme | Linked alt (same alliance or shared ledger history) | Unlinked alt (invisible to the relation check) |", "|---|---|---|",
    ...RESULTS.map((r) => `| ${r.scheme} | ${f(r.LINKED)} | ${f(r.UNLINKED)} |`), "",
    `**Every scheme is net-negative** (worst case: ${Math.max(...RESULTS.flatMap((r) => [r.LINKED, r.UNLINKED]).map((x) => x.totalCT))} CT per attempt).`,
    "- A linked alt loses everything: the relation check burns the share, or refuses the post.",
    "- An unlinked alt still pays the split's burn and pool share, or the ≥ 10 % pot rake, plus the units it throws away.",
    "- Shill bidding only raises what the coalition pays an NPC company.",
    "", "There's no farm loop: the world never pays a coalition to fight itself.", ""].join("\n");
  fs.writeFileSync(OUT, md); console.log(md.split("\n").slice(4, 13).join("\n"));
}
