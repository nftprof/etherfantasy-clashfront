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
ok(CP.byCastle.every((c) => c.pois.filter((p) => !p.rideAlong).length === PA.budgetByCastleKind[c.kind].total), "each castle gets exactly its kind's POI budget (landing spots + caravan routes ride along)");
ok(CP.byCastle.filter((c) => c.pois.some((p) => p.lwKind === "HARBOUR" || p.lwKind === "AIRSHIP_DOCK")).every((c) => c.pois.some((p) => p.lwKind === "CARAVAN_WAYPOINT")), "every castle with a harbour or airship dock has a caravan route");
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

// D5b singles (lazy, 284 K)
execFileSync("node", ["tools/living-world/seed_singles.mjs", "--out", "/tmp"], { stdio: "ignore" });
ok(fs.readFileSync("/tmp/singles.summary.json").equals(fs.readFileSync("data/living-world/singles.summary.json")) && fs.readFileSync("/tmp/singles.sample.json").equals(fs.readFileSync("data/living-world/singles.sample.json")), "singles rebuild matches the committed summary + 1 % sample byte-for-byte");
const SS = JSON.parse(fs.readFileSync("data/living-world/singles.summary.json", "utf8"));
ok(SS.parcels === 284314, "all 284,314 L3 singles pass through the lazy seed function");
ok(SS.nodes / SS.parcels < 0.15, `singles stay sparse frontier (${(100 * SS.nodes / SS.parcels).toFixed(1)} % carry a Node)`);
const { seedSingle, zoneContext } = await import("./seed_singles.mjs");
const zc = zoneContext("/home/user/cf-overworld/data", "EDU", PA), smp = JSON.parse(fs.readFileSync("data/living-world/singles.sample.json", "utf8")).parcels.filter((p) => p.zone === "EDU");
const l3 = Object.fromEntries(JSON.parse(fs.readFileSync("/home/user/cf-overworld/data/hexagon-city-source/l3/EDU.json", "utf8")).singles.map((p) => [p.parcelId, p]));
ok(smp.length > 0 && smp.every((r) => JSON.stringify(seedSingle(l3[r.id], zc)) === JSON.stringify({ id: r.id, ring: r.ring, node: r.node })), "seedSingle() on demand reproduces every sampled EDU parcel exactly (lazy = bulk)");
ok(smp.filter((r) => r.ring === "CASTLE").every((r) => r.node === null), "no single carries a Node inside a castle ring");

// D8b approaches (derived from the battle-map artifacts)
const ap1 = run("tools/living-world/derive_approaches.mjs", "/tmp/lw_ap_a.json"), ap2 = run("tools/living-world/derive_approaches.mjs", "/tmp/lw_ap_b.json");
ok(ap1.equals(ap2) && ap1.equals(fs.readFileSync("data/living-world/approaches.json")), "approach derivation is byte-identical and committed");
const AP = JSON.parse(ap1), apMaps = Object.values(AP.maps);
ok(apMaps.flatMap((m) => m.naval).every((n) => n.deepCells >= 3 && Math.abs(n.x) <= 161 && Math.abs(n.z) <= 161), "every NAVAL_APPROACH sits on ≥ 3 frame-touching deep cells inside the ±161 frame");
ok(apMaps.every((m) => m.air.length === m.pads.length && m.air.every((a) => m.pads.includes(a.landAt))), "one AIR_APPROACH per LANDING_PAD, each landing on a real pad");
ok(apMaps.flatMap((m) => m.naval).every((n) => n.unloadAt === "BEACH" || apMaps.some((m) => m.piers.includes(n.unloadAt))), "naval approaches unload at a real PIER (or beach)");

// D9 ambient traffic (pure function of world.seed + tick)
const at1 = run("tools/living-world/ambient_traffic.mjs", "/tmp/lw_at_a.json"), at2 = run("tools/living-world/ambient_traffic.mjs", "/tmp/lw_at_b.json");
ok(at1.equals(at2) && at1.equals(fs.readFileSync("data/living-world/ambient-traffic.sample.json")), "ambient-traffic sample is byte-identical and committed");
ok(!/Math\.random|Date\.now|new Date/.test(fs.readFileSync("tools/living-world/ambient_traffic.mjs", "utf8")), "ambient traffic uses no clock and no Math.random");
const AT = await import("./ambient_traffic.mjs"), atTicks = [0, 777, 1440 * 3 + 5, 1440 * 22 + 720, 1440 * 27 + 1];
const atShips = atTicks.flatMap((t) => AT.shipsAt("cf-world-1", t));
ok(JSON.stringify(AT.shipsAt("cf-world-1", 777)) === JSON.stringify(AT.shipsAt("cf-world-1", 777)) && JSON.stringify(AT.shipsAt("cf-world-1", 777)) !== JSON.stringify(AT.shipsAt("cf-world-2", 777)), "same (seed, tick) → same fleet; a different world seed → different traffic");
ok(atShips.every((s) => s.t >= 0 && s.t <= 1 && (s.status !== "STORM_BOUND" || s.t === 0 || s.t === 1)), "hulls stay on their lane; storm-bound hulls wait at a port");
ok(AT.LANES.lanes.every((l) => [0, 1440 * 10].every((t) => !AT.laneClosed("cf-world-1", t, l))), "no storm closures outside storm season");
ok(AT.LANES.lanes.filter((l) => l.mode === "AIR").every((l) => Array.from({ length: 7 }, (_, k) => 1440 * (21 + k) + 720).every((t) => !AT.laneClosed("cf-world-1", t, l))), "sky lanes never storm-close (sea weather only)");
const atS = JSON.parse(at1);
ok(atS.snapshots.slice(1).every((s) => s.closedLanes > 0 && s.closedLanes < AT.LANES.counts.sea), "every storm-season day closes some sea lanes, never all");

// D6e archetype × ring × ground matrix (shared harness)
execFileSync("node", ["tools/living-world/sim_matrix.mjs", "--n", "1", "--out", "/tmp/lw_mx_a.md"], { stdio: "ignore" });
execFileSync("node", ["tools/living-world/sim_matrix.mjs", "--n", "1", "--out", "/tmp/lw_mx_b.md"], { stdio: "ignore" });
ok(fs.readFileSync("/tmp/lw_mx_a.json").equals(fs.readFileSync("/tmp/lw_mx_b.json")), "sim matrix is deterministic (same seeds → same cells)");
const MX = JSON.parse(fs.readFileSync("docs/living-world/reports/SIM-MATRIX.json", "utf8"));
ok(PA.archetypes.filter((x) => x.garrison.length).every((x) => MX.rows.some((r) => r.k === x.lwKind)), "every garrisoned archetype appears in the committed matrix");
ok(MX.rows.every((r) => r.n >= 1 && ["ok", "SOFT", "SLOW", "HARD"].includes(r.verdict) && ["RAID", "SKIRMISH"].includes(r.band)), "every matrix cell has samples, a band and a verdict");
ok(MX.population === MX.rows.reduce((n, r) => n + r.population, 0), "matrix population adds up");

// D6f banded threat curve
const TB = PA.threatBands, inBand = (ring, t) => t >= TB[ring].lo && t <= TB[ring].hi;
ok(EST.every((p) => p.nodes.every((n) => inBand(p.ring, n.threat))), "every estate Node's threat sits inside its ring's band");
ok(JSON.parse(fs.readFileSync("data/living-world/castle-pois.json", "utf8")).byCastle.every((c) => c.pois.every((p) => inBand("CASTLE", p.threat))), "every in-castle POI's threat sits inside the RAID band");
ok(MX.populationOutOfBand / MX.population <= 0.15, `≥ 85 % of seeded garrisoned POIs land their sim band (now ${100 - Math.round(100 * MX.populationOutOfBand / MX.population)} %)`);

// D10 region feed
const rf1 = run("tools/living-world/region_feed.mjs", "/tmp/lw_rf_a.json"), rf2 = run("tools/living-world/region_feed.mjs", "/tmp/lw_rf_b.json");
ok(rf1.equals(rf2) && rf1.equals(fs.readFileSync("data/living-world/region-feed.sample.json")), "region-feed sample is byte-identical and committed");
const RF = await import("./region_feed.mjs"), RFS = JSON.parse(rf1), RFH = Object.values(RFS.feed).flatMap((d) => Object.values(d).flat());
ok(RFH.length > 0 && RFH.every((h) => !h.text.includes("?") && !/\{\w+\}/.test(h.text)), "every sample headline fills all its placeholders");
ok(Object.values(RFS.feed).every((d) => Object.values(d).every((a) => a.length <= RF.FT.rules.perRegionPerDay)), "at most perRegionPerDay headlines per region per day");
ok(!RF.newsworthy({ kind: "POI_CLEARED", ring: "WILD", threat: 34, repeatClear: true, facts: {} }) && !RF.newsworthy({ kind: "POI_CLEARED", ring: "WILD", threat: 24, facts: {} }) && RF.newsworthy({ kind: "POI_CLEARED", ring: "WILD", threat: 33, facts: {} }), "repeat clears and routine low-threat clears are not news (doc 06 §4)");
ok(Object.values(RF.FT.kinds).every((k) => k.weight > 0 && k.variants.length >= 1 && k.icon), "every feed kind has a weight, an icon and a headline");
const rfi = { id: "x|1", kind: "GUARDIAN_KO", facts: { attacker: "A", place: "P", pot: 15 } };
ok(JSON.stringify(RF.headline(rfi)) === JSON.stringify(RF.headline({ ...rfi })), "the headline variant is a pure function of the item id");

// D11 two progression ladders
const ri1 = run("tools/living-world/influence.mjs", "/tmp/lw_ri_a.json"), ri2 = run("tools/living-world/influence.mjs", "/tmp/lw_ri_b.json");
ok(ri1.equals(ri2) && ri1.equals(fs.readFileSync("data/living-world/region-influence.json")), "region-influence totals are byte-identical and committed");
const IN = await import("./influence.mjs"), brief = fs.readFileSync("/home/user/cf-overworld/docs/briefs/NAVAL-AIRSHIP-THREE-LAYER-MAPS.md", "utf8");
const briefTiers = [...brief.matchAll(/^\| (\d+) \| (NORMAL ship|NORMAL airship|LARGE ship|IMPERIAL carrier)/gm)].map((m) => +m[1]);
ok(briefTiers.join() === "5,10,25,100" && EX.vesselAccess.tiers.map((t) => t.parcels).join() === briefTiers.join(), "vessel access mirrors the canon brief §7 (5 / 10 / 25 / 100 parcels controlled)");
ok(IN.vessels(4).length === 0 && IN.vessels(5).join() === "SHIP_NORMAL" && IN.vessels(100).includes("IMPERIAL_CARRIER"), "vessels() gates by parcels controlled");
ok([0, 2, 3, 9, 10, 24, 25, 99].every((h, i, a) => i === 0 || IN.regionInfluence(h).unlocks.length >= IN.regionInfluence(a[i - 1]).unlocks.length) && IN.regionInfluence(4).next.need === 1 && IN.regionInfluence(25).next === null, "region unlocks are monotonic and report the next step");
const RI = JSON.parse(ri1);
ok(Object.values(RI.regions).every((r) => IN.regionInfluence(Math.floor(r.holdable / 2) + 1, r.holdable).unlocks.includes("FORM3_STATION")), "every region (even KOL with 3) can be fully dominated by holding a majority");
ok(IN.regionBanner({ a: 30, b: 30 }) === null && IN.regionBanner({ a: 24 }) === null && IN.regionBanner({ a: 40, b: 30 }) === "a" && IN.regionBanner({ a: 2, b: 1 }, 3) === "a", "region banner: plurality ≥ 25 (a majority in small regions), ties go to nobody");

// D12 anti-farm + lull reward functions
const RW = await import("./rewards.mjs"), H1 = [];
const clr = (account, poiId, tick, base = 100) => { const r = RW.resolveClear(H1, { account, poiId, tick, base }); H1.push({ account, poiId, tick }); return r; };
const rw = [clr("a", "p1", 0), clr("a", "p1", 60), clr("a", "p1", 120), clr("a", "p1", 180), clr("a", "p1", 240)];
ok(rw.map((r) => r.mult).join() === EX.antiFarm.multipliers.concat([EX.antiFarm.multipliers.at(-1)]).join() && rw.map((r) => r.reward).join() === "100,60,30,10,10", "same account, same POI within 24 h: ×1 → 0.6 → 0.3 → 0.1 (and stays at 0.1)");
ok(clr("a", "p2", 300).mult === 1 && clr("b", "p1", 300).mult === 1, "a different POI, or a different account, is always full value");
ok(clr("a", "p1", 24 * 60 + 241).mult === 1, "the curve resets once the earlier clears leave the 24 h window");
ok(RW.resolveClear([], { account: "a", poiId: "x", tick: 0, base: 3 }).reward === 3 && RW.resolveClear([{ account: "a", poiId: "x", tick: 0 }, { account: "a", poiId: "x", tick: 1 }, { account: "a", poiId: "x", tick: 2 }], { account: "a", poiId: "x", tick: 3, base: 3 }).reward === 1, "a positive base never rounds to 0");
const CC2 = [{ zone: "BUS", tick: 100 }, { zone: "BUS", tick: 1000 }, { zone: "UW1", tick: 50 }];
ok(RW.lullUntil(CC2, "BUS") === 1000 + 48 * 60 && RW.lullUntil(CC2, "EDU") === null, "lull = 48 h after the LATEST camp clear; lulls don't stack");
ok(!RW.raidsAllowed(CC2, "BUS", 1000 + 48 * 60 - 1) && RW.raidsAllowed(CC2, "BUS", 1000 + 48 * 60) && RW.raidsAllowed(CC2, "BUS", 99) && !RW.raidsAllowed(CC2, "BUS", 500), "raids pause inside the lull, resume at its end; a future clear doesn't silence the past");
ok(!/Math\.random|Date\.now|new Date/.test(fs.readFileSync("tools/living-world/rewards.mjs", "utf8")), "reward functions read no clock (callers pass world ticks)");

// D13 owner-decision sheet covers every open question
const OD = fs.readFileSync("docs/living-world/OWNER-DECISIONS.md", "utf8");
const openQs = fs.readdirSync("docs/living-world").filter((f) => /^0\d-.*\.md$/.test(f)).flatMap((f) => (fs.readFileSync("docs/living-world/" + f, "utf8").match(/❓ OPEN/g) || []).map(() => f));
ok(openQs.length > 0 && [...new Set(openQs)].every((f) => OD.includes("doc " + f.slice(0, 2).replace(/^0/, "0"))), `every doc with a ❓ OPEN (${[...new Set(openQs)].join(", ")}) is on the owner-decision sheet`);
ok((OD.match(/\*\*A \(recommended\)\*\*/g) || []).length === 4, "each of the 4 calls carries one recommended option");

// D17 world events calendar
const wc1 = run("tools/living-world/world_calendar.mjs", "/tmp/lw_wc_a.json"), wc2 = run("tools/living-world/world_calendar.mjs", "/tmp/lw_wc_b.json");
ok(wc1.equals(wc2) && wc1.equals(fs.readFileSync("data/living-world/world-calendar.sample.json")), "world-calendar sample is byte-identical and committed");
const WCm = await import("./world_calendar.mjs"), poiRegions = Object.keys(WCm.REGIONS).filter((z) => Object.keys(WCm.REGIONS[z].nodes).length).sort();
const wcBad = [];
for (let d = 0; d < 28; d++) for (const z of poiRegions) { const c = WCm.coverage(WCm.calendar("cf-world-1", z, d), d); if (c.events < WCm.WC.coverage.minEventsPerDay || c.emptyWindows > WCm.WC.coverage.maxEmptyWindows) wcBad.push(`${z}@${d}:${c.events}/${c.emptyWindows}`); }
ok(wcBad.length === 0, `every POI region, every day of a 28-day cycle: ≥ ${WCm.WC.coverage.minEventsPerDay} world events and no empty 3-hour window (${poiRegions.length} regions)${wcBad.length ? " — " + wcBad.slice(0, 5).join(" ") : ""}`);
const wcAll = poiRegions.flatMap((z) => WCm.calendar("cf-world-1", z, 3));
ok(wcAll.filter((e) => e.kind === "SUPPLY_AIRDROP" && !e.at.endsWith(":single")).every((e) => Object.values(WCm.REGIONS).some((R) => (R.nodes.AIRDROP_ZONE || []).includes(e.at))), "airdrops land on real AIRDROP_ZONE Nodes");
ok(Object.keys(WCm.WC.kinds).filter((k) => k !== "STORM").every((k) => PA.events[k]), "every calendar kind is a defined event (poi-archetypes events{})");

console.log(fails ? `❌ living-world: ${fails} failed` : "✅ living-world: all passed"); process.exit(fails ? 1 : 0);
