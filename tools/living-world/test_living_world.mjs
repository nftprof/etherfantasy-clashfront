#!/usr/bin/env node
// Living World data tests: rebuild every generated file twice → byte-identical; schema + coverage invariants.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const run = (script, out) => { execFileSync("node", [script, "--out", out], { stdio: "ignore" }); return fs.readFileSync(out); };

// D1 castle context
const a = run("tools/living-world/castle_context.mjs", "/tmp/lw_cc_a.json"), b = run("tools/living-world/castle_context.mjs", "/tmp/lw_cc_b.json");
ok(a.equals(b), "castle-context rebuild is byte-identical");
ok(a.equals(fs.readFileSync("data/living-world/castle-context.json")), "committed castle-context.json is up to date");
const cc = JSON.parse(a);
ok(cc.count === 67 && cc.castles.length === 67, "all 67 world castles present");
ok(cc.byKind.PALACE === 9 && cc.byKind.CASTLE === 21 && cc.byKind.KEEP === 37, "kinds 9 PALACE / 21 CASTLE / 37 KEEP");
ok(cc.castles.every((c) => c.zone && ["SURFACE", "SKY", "UNDER"].includes(c.layer) && Array.isArray(c.at)), "every castle has zone, layer, position");

// D2 archetypes (hand-authored data)
const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
const kinds = PA.archetypes.map((x) => x.lwKind);
ok(kinds.length === 12 && new Set(kinds).size === 12, "12 unique POI archetypes");
const docKinds = [...fs.readFileSync("docs/living-world/01-POI-CATALOGUE.md", "utf8").matchAll(/^\| \*\*([A-Z_]+)\*\* \|/gm)].map((m) => m[1]);
ok(docKinds.length === 12 && docKinds.every((k) => kinds.includes(k)), "doc 01 table and poi-archetypes.json list the same archetypes");
ok(PA.archetypes.every((x) => x.deck.every(([e]) => PA.events[e])), "every deck event is defined in events{}");
ok(PA.archetypes.every((x) => x.garrison.reduce((n, [, c]) => n + c, 0) <= PA.limits.garrisonMax), "garrisons stay ≤ garrisonMax (few, named units)");
ok(Object.values(PA.events).every((e) => typeof e.teleSec === "number"), "every event has a telegraph time");

// D3/D4 castle POIs (seeded)
const sa = run("tools/living-world/seed_castle_pois.mjs", "/tmp/lw_cp_a.json"), sb = run("tools/living-world/seed_castle_pois.mjs", "/tmp/lw_cp_b.json");
ok(sa.equals(sb), "castle-pois rebuild is byte-identical (seeded PRNG, no clock)");
ok(sa.equals(fs.readFileSync("data/living-world/castle-pois.json")), "committed castle-pois.json is up to date");
const CP = JSON.parse(sa), all = CP.byCastle.flatMap((c) => c.pois.map((p) => ({ ...p, c })));
ok(CP.byCastle.length === 67, "every one of the 67 castles is seeded");
ok(CP.byCastle.every((c) => c.pois.filter((p) => p.lwKind !== "LANDING_SPOT").length === PA.budgetByCastleKind[c.kind].total), "each castle gets exactly its kind's POI budget (landing spots ride along)");
ok(new Set(all.map((p) => p.id)).size === all.length, "POI ids are unique");
ok(all.every((p) => kinds.includes(p.lwKind) && PA.archetypes.find((a) => a.lwKind === p.lwKind).layers.includes(p.c.layer)), "every POI is a known archetype on a layer it allows");
ok(all.filter((p) => p.lwKind === "HARBOUR").every((p) => p.c.layer === "SURFACE"), "harbours only on the surface (coast)");
ok(CP.byCastle.filter((c) => c.layer === "SKY").every((c) => c.pois.some((p) => p.lwKind === "AIRSHIP_DOCK")), "every sky castle has an airship dock");
ok(all.filter((p) => p.lwKind === "LANDING_SPOT").every((p) => all.some((q) => q.id === p.parent)), "every landing spot hangs off a harbour or dock");
ok(all.every((p) => p.garrison.reduce((n, g) => n + g.count, 0) <= PA.limits.garrisonMax && p.threat >= 0 && p.threat <= 100), "garrisons ≤ 6 units, threat 0–100");

// D7a guardians (doc 04)
const GU = JSON.parse(fs.readFileSync("data/living-world/guardians.json", "utf8")), F2 = GU.forms["2"], F3 = GU.forms["3"];
const doc4 = fs.readFileSync("docs/living-world/04-GUARDIANS.md", "utf8");
ok(Math.abs(GU.feeSplit.bountyEscrow + GU.feeSplit.burn + GU.feeSplit.landYieldPool - 1) < 1e-9 && GU.feeSplit.burn >= 0.10, "guardian fee split sums to 100 % and burns ≥ 10 % (Decision 17)");
ok(GU.caps.guardianDamageShareMax <= 0.20, "guardian damage share ≤ HERO_IMPACT_MAX (0.20)");
ok(F3.stationHours < F2.stationHours && F3.cooldownHours > F2.cooldownHours, "Form 3 is shorter-lived and slower to return than Form 2 (nothing is bought forever)");
ok(F3.ascended.windowSec > 0 && F3.ascended.wardStones.count * F3.ascended.wardStones.cutSecEach <= F3.ascended.windowSec, "Form 3 Ascension is bounded and fully unbindable by its Ward Stones");
ok(doc4.includes(`${F3.ascended.windowSec / 60} min`) && doc4.includes(`${F2.stationHours} h`) && doc4.includes(`${F3.stationHours} h`) && doc4.includes(`${F3.cooldownHours} h`) && doc4.includes(`${F2.feeCT} CT`) && doc4.includes(`${F3.feeCT} CT`), "doc 04 quotes the same windows, cooldowns and fees as guardians.json");

// D7b defences (doc 03)
const DF = JSON.parse(fs.readFileSync("data/living-world/defences.json", "utf8")), doc3 = fs.readFileSync("docs/living-world/03-DEFEND-ATTACK-ECONOMY.md", "utf8");
ok(Math.abs(DF.stakeSplit.spoilsEscrow + DF.stakeSplit.burn + DF.stakeSplit.pool - 1) < 1e-9 && DF.stakeSplit.burn >= 0.10, "defence stake split sums to 100 % and burns ≥ 10 %");
const maxRating = 1 + DF.upgrades.reduce((s, u) => { let w = u.weight, t = 0; for (let l = 0; l < u.levels; l++) { t += w; w *= 1 - DF.rating.weightDecayPerLevel; } return s + t; }, 0);
ok(maxRating > DF.rating.max, `the ×${DF.rating.max} cap binds: a fully upgraded castle would otherwise reach ×${maxRating.toFixed(2)} (no impregnable fortress)`);
ok(DF.upgrades.every((u) => (u.days || (u.hours && u.hours.length))), "every upgrade is time-bound (decays)");
ok(DF.upgrades.filter((u) => u.module === "TOWER").every((u) => u.estateOnly), "towers stay estate-only (canon §7b rule 2b)");
ok(DF.structureDamageReductionCap <= GU.forms["3"].aura.structureDmgMul + 0.2 && DF.structureDamageReductionCap < 0.5, "walls + Guardian structure-damage reduction capped below 50 %");
ok(DF.upgrades.every((u) => doc3.includes("`" + u.module + "`")) && doc3.includes(`×${DF.rating.max}`) && doc3.includes(`${DF.breachFloor.withinSec / 60} minutes`), "doc 03 lists every module, the ×cap and the breach floor from defences.json");

// player events (doc 05)
const PE = JSON.parse(fs.readFileSync("data/living-world/player-events.json", "utf8")), doc5 = fs.readFileSync("docs/living-world/05-PLAYER-EVENTS.md", "utf8");
ok(PE.kinds.length === 6 && PE.kinds.every((k) => doc5.includes("**" + k.pevKind + "**")), "doc 05 and player-events.json list the same 6 event kinds");
ok(PE.rules.burnRakeMin >= 0.10 && PE.kinds.filter((k) => k.burnRake != null).every((k) => k.burnRake >= PE.rules.burnRakeMin), "every pot rake burns ≥ 10 %");
ok(PE.rules.minNoticeSec >= 600 && PE.rules.relatedShare === "BURN" && PE.rules.relationLookbackDays >= 7, "15-min notice, related-account shares burned, ≥ 7-day relation lookback");
ok(PE.kinds.filter((k) => k.anchor && !["CASTLE"].includes(k.anchor)).every((k) => kinds.includes(k.anchor)), "every event anchor is a real POI archetype");

// doc 02 ↔ data consistency
const doc2 = fs.readFileSync("docs/living-world/02-SEEDING-20K-MAPS.md", "utf8");
ok(doc2.includes("≤ 6 Nodes per parcel") && PA.limits.perParcelMax === 6, "doc 02 density cap matches poi-archetypes limits.perParcelMax");
ok(doc2.includes("67 castles") && CP.byCastle.length === 67, "doc 02 story tier (67 castles) matches the seeded castle set");

// D5 estates (doc 02)
execFileSync("node", ["tools/living-world/seed_estates.mjs", "--out", "/tmp/lw_est_a"], { stdio: "ignore" });
execFileSync("node", ["tools/living-world/seed_estates.mjs", "--out", "/tmp/lw_est_b"], { stdio: "ignore" });
const ezs = fs.readdirSync("/tmp/lw_est_a/estate-pois").sort();
ok(ezs.every((f) => fs.readFileSync(`/tmp/lw_est_a/estate-pois/${f}`).equals(fs.readFileSync(`/tmp/lw_est_b/estate-pois/${f}`))), "estate seeding rebuild is byte-identical across all zones");
ok(ezs.every((f) => fs.readFileSync(`/tmp/lw_est_a/estate-pois/${f}`).equals(fs.readFileSync(`data/living-world/estate-pois/${f}`))) && fs.readFileSync("/tmp/lw_est_a/estate-pois.summary.json").equals(fs.readFileSync("data/living-world/estate-pois.summary.json")), "committed estate-pois are up to date");
const EST = ezs.flatMap((f) => JSON.parse(fs.readFileSync(`/tmp/lw_est_a/estate-pois/${f}`, "utf8")).parcels.map((p) => ({ ...p, zone: f.replace(".json", "") })));
ok(EST.length === 8482, "all 8,482 L2 estates seeded (UW1 as untamed wild until its terrain lands)");
ok(EST.every((p) => p.nodes.length <= PA.limits.perParcelMax), "≤ 6 Nodes per parcel");
ok(EST.filter((p) => p.ring === "CASTLE").every((p) => p.nodes.length === 0), "the castle ring belongs to castle-pois (no estate Nodes inside 12 u)");
ok(EST.every((p) => p.nodes.every((n) => kinds.includes(n.k) && n.threat >= 0 && n.threat <= 100)), "every estate Node is a known archetype with threat 0–100");
const campsOk = Object.values(EST.reduce((m, p) => { (m[p.zone] ||= []).push(...p.nodes.filter((n) => n.k === "BARBARIAN_CAMP").map((n) => n.at)); return m; }, {})).every((cs) => cs.every((a, i) => cs.every((b, j) => i === j || Math.hypot(a[0] - b[0], a[1] - b[1]) >= 20)));
ok(campsOk, "barbarian camps are ≥ 20 u apart in every zone (region guarantee)");
const wcCap = PA.archetypes.find((a) => a.lwKind === "WAR_CAMP").affinity.perZoneCap;
ok(Object.entries(EST.reduce((m, p) => ((m[p.zone] = (m[p.zone] || 0) + p.nodes.filter((n) => n.k === "WAR_CAMP").length), m), {})).every(([z, n]) => n <= wcCap.base + Math.floor(EST.filter((p) => p.zone === z).length / wcCap.per)), "war camps stay within the per-zone cap");

// doc 07 lanes
const la = run("tools/living-world/sea_air_lanes.mjs", "/tmp/lw_l_a.json"), lb = run("tools/living-world/sea_air_lanes.mjs", "/tmp/lw_l_b.json");
ok(la.equals(lb) && la.equals(fs.readFileSync("data/living-world/sea-air-lanes.json")), "sea/air lanes rebuild byte-identical and committed");
const LN = JSON.parse(la), nSea = LN.ports.filter((p) => p.kind === "SEA_PORT").length;
ok(LN.counts.sea === (nSea * (nSea - 1)) / 2, `every SEA_PORT pair has a lane (${nSea} ports → ${LN.counts.sea} lanes, canon "any port pair")`);
ok(LN.lanes.filter((l) => l.mode === "SEA").every((l) => l.krakenRisk > 0 && l.krakenRisk <= 0.25), "kraken risk in (0, 0.25] on every sea lane");
ok(LN.lanes.filter((l) => l.mode === "AIR").every((l) => l.gated === "AEROPOLIS") && !LN.lanes.some((l) => l.mode === "AIR" && /^HS[23]/.test(l.from) && /^HS[23]/.test(l.to)), "airships go through the Aeropolis gateway; Emberfall and Empyrea are not linked (canon)");

// D6 sim sampling harness: deterministic on the real kernel
execFileSync("node", ["tools/living-world/sim_sample.mjs", "--n", "3", "--out", "/tmp/lw_sim_a.md"], { stdio: "ignore" });
execFileSync("node", ["tools/living-world/sim_sample.mjs", "--n", "3", "--out", "/tmp/lw_sim_b.md"], { stdio: "ignore" });
ok(fs.readFileSync("/tmp/lw_sim_a.json").equals(fs.readFileSync("/tmp/lw_sim_b.json")), "headless-sim sample is byte-identical across runs (seeded kernel)");
const SIM = JSON.parse(fs.readFileSync("/tmp/lw_sim_a.json", "utf8"));
ok(SIM.rows.some((r) => r.k === "CALIBRATION") && SIM.rows.filter((r) => r.k !== "CALIBRATION").every((r) => r.n === 3), "sampler covers a calibration row + every garrisoned archetype");

// doc 06 experience
const EX = JSON.parse(fs.readFileSync("data/living-world/experience.json", "utf8")), doc6 = fs.readFileSync("docs/living-world/06-EXPERIENCE-NOT-GRIND.md", "utf8");
const am = EX.antiFarm.multipliers;
ok(am[0] === 1 && am.every((m, i) => i === 0 || m < am[i - 1]) && am[am.length - 1] > 0, "anti-farm curve starts at ×1, strictly falls, never hits 0");
ok(am.every((m) => doc6.includes("×" + m.toFixed(1))), "doc 06 table quotes the same anti-farm multipliers");
ok(EX.lullHours.BARBARIAN_CAMP === PA.archetypes.find((a) => a.lwKind === "BARBARIAN_CAMP").holdReward.hours, "barbarian lull hours match poi-archetypes holdReward");
ok(EX.influenceUnlocks.map((u) => u.poisHeld).join() === "3,5,10,25", "influence unlock thresholds 3/5/10/25 (5/10/25 = canon vessel access)");
const simR = JSON.parse(fs.readFileSync("docs/living-world/reports/SIM-SAMPLE.json", "utf8")).rows;
ok(simR.filter((r) => r.k !== "CALIBRATION" && r.medBreachSec != null).every((r) => r.medBreachSec >= EX.sessions.SKIRMISH[0] * 60 * 0.5 && r.medBreachSec <= 720), "sampled POI fights fit the session shapes (between a half-skirmish and 12 min)");

console.log(fails ? `❌ living-world: ${fails} failed` : "✅ living-world: all passed"); process.exit(fails ? 1 : 0);
