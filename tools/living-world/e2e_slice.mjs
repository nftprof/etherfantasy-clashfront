#!/usr/bin/env node
// D46 — one living-world fight end to end, through the REAL battle kernel. Every step is a function already shipped:
//   ① boardAt (D16)        the BUS board at noon of day 1 shows the GUARDIAN_CHALLENGE rows of its standing Guardians
//   ② buildAllocate (D21)  a raider takes each challenge → the v1 allocate request (+ livingWorld@1 with the Guardian)
//   ③ runOne (sim_harness) the battle runs headless in server/sim: calibrated castle + the Guardian (F2/F3 rules, the
//                          20 % damage budget, Ward Stones)
//   ④ callback             a v1 result synthesised from the sim outcome: winner, casualties (10 soldiers per sim unit,
//                          ⅓ SIEGE), guardianOutcome (KO / UNBOUND / OUTLASTED / HELD from the sim's KO + ward timeline)
//   ⑤ resolveResult (D36)  holder, Guardian escrow, feed + journal; then the raider's region influence (D11)
// Deterministic: seeds come from the ids; no clock.
import fs from "node:fs";
import { boardAt } from "./event_board.mjs";
import { buildAllocate } from "./allocate_payload.mjs";
import { runOne } from "./sim_harness.mjs";
import { resolveResult, newWorld } from "./resolve_result.mjs";
import { regionInfluence } from "./influence.mjs";
import { stationingsFor, PERCHES, GU } from "./stationings.mjs";
const OUT = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : "docs/living-world/reports/E2E.md"; })();
const SEED = "cf-world-1", ZONE = "BUS", TICK = 720, SOLDIERS_PER_UNIT = 10;
const CP = JSON.parse(fs.readFileSync("data/living-world/castle-pois.json", "utf8")), RI = JSON.parse(fs.readFileSync("data/living-world/region-influence.json", "utf8"));
const POI = Object.fromEntries(CP.byCastle.flatMap((c) => c.pois.map((p) => [p.id, { ...p, tier: c.tier, layer: c.layer, castleId: c.castleId }])));

export function slice() {
  const board = boardAt(SEED, ZONE, TICK, {}), rows = [...board.live, ...board.upcoming].filter((e) => e.kind === "GUARDIAN_CHALLENGE");
  const st = stationingsFor(SEED, ZONE, 2).ledger;
  return rows.map((row, n) => {
    const s = st.find((x) => x.perchId === row.at && x.start <= TICK && x.end > TICK), P = POI[row.at];
    const battleId = `battle_E2E${String(n).padStart(23, "0")}`;
    const attacker = { governorId: "gov_E2E_RAIDER", armies: [{ armyId: "army_E2E", units: [{ cls: "INFANTRY", count: 400 }, { cls: "SIEGE", count: 60 }], officers: [{ masterId: "master_e2e", name: "Raider", level: 10, revives: 1 }], provisions: { food: 4000, gold: 800, wood: 600 }, entryEdge: "S" }] };
    const alloc = buildAllocate({ battleId, worldSeed: SEED, poi: { id: P.id, lwKind: P.lwKind, threat: P.threat, ground: P.layer, tier: P.tier }, zone: ZONE, parcelId: P.castleId, held: { governorId: s.owner, armyId: "army_E2E_GARRISON" }, attacker, guardian: { form: s.form, nftId: s.nftId, owner: s.owner, stationEndsTick: s.end }, callbackUrl: "https://cf.example/internal/battle-result" });
    // ③ the real kernel: the perch (GUARDIAN_PERCH, no garrison of its own) in the calibrated castle at this POI's threat + tier, with this Guardian
    const sim = runOne({ id: battleId, k: P.lwKind, threat: P.threat, tier: P.tier }, s.form === 3 ? "F3" : "F2");
    // ④ the callback the engine would send
    const lost = sim.attackerDeaths * SOLDIERS_PER_UNIT, siege = Math.round(lost / 3);
    const F = GU.forms[String(s.form)], allWards = F.ascended && sim.wardsDownAt.length >= F.ascended.wardStones.count;
    const tiredAt = F.ascended && sim.guardianWakeSec != null ? sim.guardianWakeSec + F.ascended.windowSec - Math.min(sim.wardsDownAt.length, F.ascended.wardStones.count) * F.ascended.wardStones.cutSecEach : null;
    const guardianOutcome = sim.guardianKoSec == null ? "HELD" : s.form === 2 ? "KO" : allWards && sim.wardsDownAt[F.ascended.wardStones.count - 1] <= sim.guardianKoSec ? "UNBOUND" : tiredAt != null && sim.guardianKoSec >= tiredAt ? "OUTLASTED" : "KO";
    const cb = { v: 1, battleId, matchId: `efm_${battleId.slice(7)}`, outcome: { winner: sim.breached ? "ATTACKER" : "DEFENDER", reason: sim.breached ? "CORE_DESTROYED" : "TIMEOUT" },
      sides: { ATTACKER: { casualties: { INFANTRY: lost - siege, SIEGE: siege }, survivors: {}, officers: [{ masterId: "master_e2e", state: "ALIVE", contribution: { rawImpact: 0.12 } }] }, DEFENDER: { casualties: {}, survivors: {}, officers: [] } },
      clock: { durationSec: sim.sec, tickHz: 30 }, livingWorld: { guardianOutcome } };
    // ⑤ resolve against a world whose Guardian escrow holds this stationing's bounty share
    const escrowC = Math.round(F.feeCT * GU.kindMultiplier[PERCHES[row.at].kind] * GU.feeSplit.bountyEscrow * 100);
    const w0 = newWorld({ [`ESCROW:GUARDIAN:${P.id}`]: escrowC }, { alliance: { gov_E2E_RAIDER: 7, [s.owner]: 1 }, guardianOwner: { [P.id]: s.owner }, holders: { [P.id]: s.owner }, tick: TICK });
    const res = resolveResult(w0, alloc, cb), held = Object.values(res.world.holders).filter((h) => h === "gov_E2E_RAIDER").length;
    return { board: { id: row.id, banner: row.banner, potCT: row.potCT }, allocate: { battleId, structures: alloc.battlefield.structures.length, deck: alloc.livingWorld.eventDeck.map((e) => e.event), guardian: alloc.livingWorld.guardian.name },
      sim: { breached: sim.breached, sec: sim.sec, attackerDeaths: sim.attackerDeaths, guardianWakeSec: sim.guardianWakeSec, guardianKoSec: sim.guardianKoSec, wardsDownAt: sim.wardsDownAt, guardianDmgShare: sim.guardianDmgShare },
      callback: { winner: cb.outcome.winner, casualties: cb.sides.ATTACKER.casualties, guardianOutcome, durationSec: sim.sec },
      resolved: { effects: res.effects, holder: res.world.holders[P.id], escrowLeftCT: (res.world.bal[`ESCROW:GUARDIAN:${P.id}`] || 0) / 100, raiderCT: (res.world.bal.gov_E2E_RAIDER || 0) / 100, ownerCT: (res.world.bal[s.owner] || 0) / 100, feed: res.world.feed.map((f) => f.kind), journal: res.world.journal.map((j) => j.text) },
      influence: regionInfluence(held, RI.regions[ZONE].holdable) };
  });
}

if (process.argv[1] && process.argv[1].endsWith("e2e_slice.mjs")) {
  const S = slice();
  fs.writeFileSync(OUT.replace(/\.md$/, ".json"), JSON.stringify({ schema: "cf-living-world/e2e@1", zone: ZONE, tick: TICK, fights: S }, null, 1) + "\n");
  const f = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const md = ["# One fight, end to end, through the real kernel", "", "`tools/living-world/e2e_slice.mjs`: board → allocate → headless battle (`server/sim`) → result callback → resolver → influence. Deterministic.", "",
    ...S.flatMap((x) => [`## ${x.board.banner}`, "",
      `1. **Board:** a live \`GUARDIAN_CHALLENGE\` with a bounty escrow of ${x.board.potCT} CT.`,
      `2. **Allocate:** \`${x.allocate.battleId}\` with ${x.allocate.structures} structures, the ${x.allocate.guardian}, and deck ${x.allocate.deck.join(", ") || "—"}.`,
      `3. **Battle (server/sim):** ${x.sim.breached ? "breached" : "held"} at ${f(x.sim.sec)}. The Guardian woke at ${x.sim.guardianWakeSec != null ? f(x.sim.guardianWakeSec) : "—"} and was KO'd at ${x.sim.guardianKoSec != null ? f(x.sim.guardianKoSec) : "—"}${x.sim.wardsDownAt.length ? `; Ward Stones fell at ${x.sim.wardsDownAt.map(f).join(", ")}` : ""}. Its damage share was ${(x.sim.guardianDmgShare * 100).toFixed(1)} %. Attackers lost ${x.sim.attackerDeaths} units.`,
      `4. **Callback:** ${x.callback.winner} won; the Guardian outcome was **${x.callback.guardianOutcome}**; casualties INFANTRY ${x.callback.casualties.INFANTRY}, SIEGE ${x.callback.casualties.SIEGE}.`,
      `5. **Resolved:** ${(() => { const pv = x.resolved.effects.find((e) => e.kind === "POST_VICTORY_CHOICE"); return pv ? `the castle's fate goes to the winner's ${pv.options.join(" / ")} choice (canon post-victory flow); ` : `the holder is now ${x.resolved.holder}; `; })()}the raider gained ${x.resolved.raiderCT} CT and the owner got ${x.resolved.ownerCT} CT back; ${x.resolved.escrowLeftCT} CT is left in escrow. Feed: ${x.resolved.feed.join(", ")}. Journal: “${x.resolved.journal[0]}”.`,
      `6. **Influence:** the raider holds ${x.influence.held} in ${ZONE}, next unlock ${x.influence.next ? `${x.influence.next.unlock} in ${x.influence.next.need}` : "—"}.`, ""])].join("\n");
  fs.writeFileSync(OUT, md); console.log(md);
}
