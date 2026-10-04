#!/usr/bin/env node
// D28 — the mercenary market at a MERCENARY_POST (doc 03 §2, doc 01). Pure functions over a small state
// { companies, contracts, bal } with integer centi-CT balances (every move conserves CT):
//   rosterFor(postId)                  → the post's seeded companies (2 per post, ⚙), each FREE until hired
//   hire(st, req)                      → a canon Contract: MERCENARY_DEFEND (the POI holder) or MERCENARY_ATTACK (a raider),
//                                        priced from defences.json MERCENARIES (level 1: +2 mercs 24 h; level 2: +4, 72 h)
//   bid(st, req) / closeBidding(st, …) → MERC_BIDDING: when both sides want the same FREE company inside the window it goes
//                                        to an ascending auction (≥ +10 % per raise; ties → the earlier bid); losers are
//                                        refunded in full; only the winner pays
//   expire(st, tick)                   → contracts past expiresAt → FULFILLED, company FREE again
// Splits: a DEFEND hire is a defence stake (defences.json stakeSplit: 40 % spoils escrow / 30 % burn / 30 % pool); an
// ATTACK hire has no defence to lose, so 50 % burn / 50 % pool (⚙ proposal). Relation check (doc 05 §3): you can't hire
// against your own alliance.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DF = JSON.parse(fs.readFileSync(path.join(ROOT, "data/living-world/defences.json"), "utf8"));
export const MERC = DF.upgrades.find((u) => u.id === "MERCENARIES");
export const MARKET = { companiesPerPost: 2, biddingWindowMin: 10, minRaise: 0.1, attackSplit: { burn: 0.5, pool: 0.5 } };
const NAMES = ["Hired Blades", "Saltwind Lances", "Grey Hounds", "Iron Tithe", "Lantern Company", "Red Ferrymen", "Ashen Pikes", "Gull Wardens"];
export const priceC = (level) => Math.round(MERC.baseCT * DF.rating.levelCostGrowth ** (level - 1) * 100);   // centi-CT

export function rosterFor(postId) {
  const r = mulberry32(fnv1a(`${postId}|mercs`));
  return Array.from({ length: MARKET.companiesPerPost }, (_, i) => ({ id: `${postId}|co${i}`, postId, name: NAMES[Math.floor(r() * NAMES.length)], state: "FREE", until: 0 }));
}
export const newState = (balances) => ({ companies: {}, contracts: [], bids: {}, bal: { ...balances }, entries: [] });
const move = (st, from, to, amt, reason) => { if (amt <= 0) return; if (!from.startsWith("ESCROW") && from !== "POOL" && (st.bal[from] || 0) < amt) throw new Error("overdraft " + from); st.bal[from] = (st.bal[from] || 0) - amt; st.bal[to] = (st.bal[to] || 0) + amt; st.entries.push({ from, to, amt, reason }); };
const ensure = (st, postId) => { for (const c of rosterFor(postId)) st.companies[c.id] ||= c; };

function settleHire(st, { companyId, side, hirer, targetHolderAlliance, level, tick }, paid) {
  const co = st.companies[companyId], hours = MERC.hours[level - 1], id = `contract_${st.contracts.length}`;
  if (side === "DEFEND") { const e = Math.floor(paid * DF.stakeSplit.spoilsEscrow), b = Math.floor(paid * DF.stakeSplit.burn); move(st, hirer, `ESCROW:${id}`, e, "MERC_DEFEND_ESCROW"); move(st, hirer, "BURN", b, "MERC_DEFEND_BURN"); move(st, hirer, "POOL", paid - e - b, "MERC_DEFEND_POOL"); }
  else { const b = Math.floor(paid * MARKET.attackSplit.burn); move(st, hirer, "BURN", b, "MERC_ATTACK_BURN"); move(st, hirer, "POOL", paid - b, "MERC_ATTACK_POOL"); }
  co.state = "HIRED"; co.until = tick + hours * 60; co.side = side;
  const c = { id, type: side === "DEFEND" ? "MERCENARY_DEFEND" : "MERCENARY_ATTACK", posterGovernorId: hirer, targetRef: companyId, rewardCt: paid, state: "TAKEN", takerId: companyId, expiresAt: co.until, mercs: MERC.effect.mercs[level - 1] };
  st.contracts.push(c); return { ok: true, contract: c };
}
export function hire(st, req) {
  ensure(st, req.postId); const co = st.companies[req.companyId];
  if (!co) return { ok: false, reason: "NO_SUCH_COMPANY" };
  if (co.state !== "FREE" || (st.bids[req.companyId] && st.bids[req.companyId].closesAt > req.tick)) return { ok: false, reason: co.state !== "FREE" ? "COMPANY_TAKEN" : "IN_BIDDING" };
  if (req.side === "ATTACK" && req.hirerAlliance != null && req.hirerAlliance === req.targetHolderAlliance) return { ok: false, reason: "RELATED_TARGET" };
  if ((st.bal[req.hirer] || 0) < priceC(req.level)) return { ok: false, reason: "FUNDS" };
  return settleHire(st, req, priceC(req.level));
}
// MERC_BIDDING: the first bid opens a window; a bid from the OTHER side inside it must raise by ≥ minRaise.
export function bid(st, req) {
  ensure(st, req.postId); const co = st.companies[req.companyId]; if (!co || co.state !== "FREE") return { ok: false, reason: "COMPANY_TAKEN" };
  if (req.side === "ATTACK" && req.hirerAlliance != null && req.hirerAlliance === req.targetHolderAlliance) return { ok: false, reason: "RELATED_TARGET" };
  const B = (st.bids[req.companyId] ||= { closesAt: req.tick + MARKET.biddingWindowMin, top: null, held: [] });
  if (req.tick >= B.closesAt) return { ok: false, reason: "BIDDING_CLOSED" };
  const floor = B.top ? Math.ceil(B.top.amount * (1 + MARKET.minRaise)) : priceC(req.level);
  if (req.amount < floor) return { ok: false, reason: "RAISE_TOO_SMALL", floor };
  move(st, req.hirer, `BIDHOLD:${req.companyId}:${B.held.length}`, req.amount, "MERC_BID_HOLD");   // held, not spent
  B.held.push({ ...req }); B.top = { ...req }; return { ok: true, floor };
}
export function closeBidding(st, companyId, tick) {
  const B = st.bids[companyId]; if (!B || tick < B.closesAt || !B.top) return { ok: false, reason: "OPEN" };
  B.held.forEach((h, i) => move(st, `BIDHOLD:${companyId}:${i}`, h.hirer, h.amount, h === B.top ? "MERC_BID_RELEASE_WINNER" : "MERC_BID_REFUND"));   // everyone gets their hold back…
  delete st.bids[companyId];
  return settleHire(st, B.top, B.top.amount);   // …then only the winner pays, at their bid
}
export function expire(st, tick) {
  for (const c of st.contracts) if (c.state === "TAKEN" && tick >= c.expiresAt) {
    c.state = "FULFILLED"; const co = st.companies[c.takerId]; co.state = "FREE"; co.until = 0;
    if (c.type === "MERCENARY_DEFEND") move(st, `ESCROW:${c.id}`, c.posterGovernorId, st.bal[`ESCROW:${c.id}`] || 0, "MERC_DEFEND_REFUND_UNBROKEN");   // the defence held: spoils escrow comes home (doc 03)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "data/living-world/merc-market.sample.json");
  const posts = JSON.parse(fs.readFileSync(path.join(ROOT, "data/living-world/castle-pois.json"), "utf8")).byCastle.flatMap((c) => c.pois.filter((p) => p.lwKind === "MERCENARY_POST").map((p) => p.id));
  const rosters = Object.fromEntries(posts.map((p) => [p, rosterFor(p).map((c) => c.name)]));
  // a worked MERC_BIDDING: the holder and a raider both want company 0 at the first post
  const st = newState({ holder: 5000, raider: 5000 }), post = posts[0], co = `${post}|co0`, total0 = 10000;
  const steps = [bid(st, { postId: post, companyId: co, side: "DEFEND", hirer: "holder", level: 2, amount: priceC(2), tick: 0 }),
    bid(st, { postId: post, companyId: co, side: "ATTACK", hirer: "raider", hirerAlliance: 2, targetHolderAlliance: 1, level: 2, amount: Math.ceil(priceC(2) * 1.1), tick: 3 }),
    bid(st, { postId: post, companyId: co, side: "DEFEND", hirer: "holder", level: 2, amount: Math.ceil(priceC(2) * 1.25), tick: 6 })];
  const won = closeBidding(st, co, 10), sum = Object.values(st.bal).reduce((a, b) => a + b, 0);
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/merc-market-sample@1", market: MARKET, priceCT: { level1: priceC(1) / 100, level2: priceC(2) / 100 }, posts: posts.length, rosters, biddingExample: { post, company: co, steps, winner: won.contract, balancesCT: Object.fromEntries(Object.entries(st.bal).filter(([, v]) => v).map(([k, v]) => [k, v / 100])), conserved: sum === total0 } }, null, 1) + "\n");
  console.log(`merc market: ${posts.length} castle posts × ${MARKET.companiesPerPost} companies; L1 ${priceC(1) / 100} CT / 24 h, L2 ${priceC(2) / 100} CT / 72 h; bidding example → ${won.contract.type} by ${won.contract.posterGovernorId} for ${won.contract.rewardCt / 100} CT; CT conserved: ${sum === total0}`);
}
