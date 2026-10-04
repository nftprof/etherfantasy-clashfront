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
const TB = PA.threatBands, inBand = (ring, t, ground) => t >= TB[ring].lo + ((ground && TB.groundShift[ground]) || 0) && t <= TB[ring].hi;
ok(EST.every((p) => p.nodes.every((n) => inBand(p.ring, n.threat, p.ground))), "every estate Node's threat sits inside its ring's band (floor lowered by groundShift on defensible ground)");
ok(JSON.parse(fs.readFileSync("data/living-world/castle-pois.json", "utf8")).byCastle.every((c) => c.pois.every((p) => inBand("CASTLE", p.threat))), "every in-castle POI's threat sits inside the RAID band");
ok(MX.populationOutOfBand / MX.population <= 0.05, `≥ 95 % of seeded garrisoned POIs land their sim band (now ${100 - Math.round(100 * MX.populationOutOfBand / MX.population)} %)`);

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
ok((OD.match(/\*\*A \(recommended\)\*\*/g) || []).length === 5, "each of the 5 calls carries one recommended option");

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

// D15 defend/attack balance sheet
execFileSync("node", ["tools/living-world/balance_sheet.mjs", "--out", "/tmp/lw_bs_a.md"], { stdio: "ignore" });
ok(fs.readFileSync("/tmp/lw_bs_a.json").equals(fs.readFileSync("docs/living-world/reports/BALANCE-SHEET.json")), "balance sheet is reproducible and committed");
const BS = JSON.parse(fs.readFileSync("docs/living-world/reports/BALANCE-SHEET.json", "utf8"));
ok(BS.ctPerSoldier > 0 && BS.rows.length === 4 && BS.rows.every((r) => r.lossCT[1] > 0 && Math.abs(r.lossCT[20] - r.attackerUnitsLost * 20 * BS.ctPerSoldier) <= r.attackerUnitsLost * 20 * 0.05), "loss CT = units × ratio × canon re-training cost, at every ratio");
ok(BS.rows.find((r) => r.scen === "DEFENDED").burnedCT >= 0.1 * BS.rows.find((r) => r.scen === "DEFENDED").defenderPaidCT && BS.rows.filter((r) => r.scen[0] === "F").every((r) => r.burnedCT >= 0.1 * r.defenderPaidCT), "every defender spend burns ≥ 10 % (Decision 17)");
ok(OD.includes("BALANCE-SHEET") && BS.findings.defencesVsWarden > 10, "the Warden price outlier is on the owner-decision sheet");

// D19 CT flow simulation (circular economy invariants)
execFileSync("node", ["tools/living-world/ct_flow_sim.mjs", "--out", "/tmp/lw_ctf_a.md"], { stdio: "ignore" });
ok(fs.readFileSync("/tmp/lw_ctf_a.json").equals(fs.readFileSync("docs/living-world/reports/CT-FLOW.json")), "CT flow report is reproducible and committed");
const ctfBad = [];
for (const sd of ["s1", "s2", "s3", "s4", "s5"]) {
  execFileSync("node", ["tools/living-world/ct_flow_sim.mjs", "--seed", sd, "--agents", "200", "--days", "14", "--out", `/tmp/lw_ctf_${sd}.md`], { stdio: "ignore" });
  const inv = JSON.parse(fs.readFileSync(`/tmp/lw_ctf_${sd}.json`, "utf8")).invariants;
  if (!(inv.noMint && inv.noNegativeBalance && inv.escrowsSettled && inv.burnAtLeast10pct)) ctfBad.push(sd + ":" + JSON.stringify(inv));
}
ok(ctfBad.length === 0, "5 seeds × 200 agents × 14 days: no mint, no overdraft, every escrow settles, burn ≥ 10 %" + (ctfBad.length ? " — " + ctfBad.join(" ") : ""));
ok(!/Math\.random|Date\.now|new Date/.test(fs.readFileSync("tools/living-world/ct_flow_sim.mjs", "utf8")), "the CT flow sim reads no clock and no unseeded randomness");

// D14 canon terrain in the harness
const TMd = JSON.parse(fs.readFileSync("data/living-world/terrain-mods.json", "utf8")), bs04 = fs.readFileSync("/home/user/cf-overworld/docs/04-battle-system.md", "utf8");
ok(Object.entries(TMd.canon).every(([t, [a, d]]) => new RegExp("^\\| " + t + "[^|]*\\| " + a.toFixed(2) + " \\| " + d.toFixed(2) + " \\|", "m").test(bs04)), "terrain-mods mirror the canon doc-04 table (attacker / defender per HexTerrain)");
ok(MX.terrain === true && ["FOREST", "RIDGE", "WATER"].every((g) => MX.rows.some((r) => r.ground === g)), "the committed matrix runs with canon terrain on");
const lair = (g) => MX.rows.find((r) => r.k === "WILD_LAIR" && r.ring === "WILD" && r.ground === g).medBreachSec;
ok(lair("PLAIN") < lair("FOREST") && lair("FOREST") < lair("RIDGE"), "defensible ground still holds longer after the groundShift: plain < forest < ridge (wild lairs)");
ok(Object.keys(TB.groundShift).every((g) => TB.groundShift[g] < 0 && TMd.canon[TMd.groundToHexTerrain[g]][1] > 1), "groundShift only lowers threat where canon gives the defender a terrain bonus");

// D16 event board
const eb1 = run("tools/living-world/event_board.mjs", "/tmp/lw_eb_a.json"), eb2 = run("tools/living-world/event_board.mjs", "/tmp/lw_eb_b.json");
ok(eb1.equals(eb2) && eb1.equals(fs.readFileSync("data/living-world/event-board.sample.json")), "event-board sample is byte-identical and committed");
const EB = await import("./event_board.mjs"), ebT = 720, ebView = { at: [17.1, 30.27], holdings: [[17.1, 30.27]] };
const ebB = EB.boardAt("cf-world-1", "BUS", ebT, ebView), ebRows = [...ebB.live, ...ebB.upcoming];
ok(ebRows.every((e) => e.postedAt <= ebT && e.closes > ebT && e.opens <= ebT + EB.BOARD.horizonMin), "the board shows only posted, unfinished events opening within the horizon");
ok([0, 1, 2].flatMap((d) => EB.postsFor("cf-world-1", "BUS", d)).every((e) => e.opens - e.postedAt >= (e.kind === "SPONSORED_AIRDROP" ? 1 : PE.rules.minNoticeSec / 60)), "every player post opens after the doc-05 notice (15 min; airdrops 60 s)");
const ebD = EB.boardAt("cf-world-1", "BUS", ebT, { ...ebView, sort: "DISTANCE" }).upcoming.filter((e) => !e.ping && e.distU != null).map((e) => e.distU);
ok(ebD.every((d, i) => i === 0 || d >= ebD[i - 1]), "sort by distance is nearest-first");
ok(EB.boardAt("cf-world-1", "BUS", ebT, { ...ebView, minPot: 10 }).live.concat(EB.boardAt("cf-world-1", "BUS", ebT, { ...ebView, minPot: 10 }).upcoming).every((e) => e.potCT >= 10), "the pot filter holds");
const ebPick = ebRows.find((e) => EB.NODES[e.at]), ebP = ebPick && EB.boardAt("cf-world-1", "BUS", ebT, { at: [0, 0], holdings: [EB.NODES[ebPick.at].at] });
ok(ebP && [...ebP.live, ...ebP.upcoming].filter((e) => e.ping).some((e) => e.id === ebPick.id) && (ebP.live[0] || ebP.upcoming[0]).ping, "events near your holdings ping and sort first");
const ebEmpty = WCm && poiRegions.flatMap((z) => [180, 600, 1020, 1380].map((t) => [z, t, (() => { const b = EB.boardAt("cf-world-1", z, t, {}); return b.live.length + b.upcoming.length; })()])).filter(([, , n]) => n < EB.BOARD.horizonMin / WCm.WC.windowMin);
ok(ebEmpty.length === 0, "every POI region's board shows ≥ horizon / 3 h events (the calendar's one-per-window guarantee) at any hour sampled" + (ebEmpty.length ? " — " + ebEmpty.slice(0, 4).join(" ") : ""));

// D21 allocate payload (cf-overworld ALLOCATE-CALLBACK-SCHEMA v1 + additive livingWorld@1)
const al1 = run("tools/living-world/allocate_payload.mjs", "/tmp/lw_al_a.json"), al2 = run("tools/living-world/allocate_payload.mjs", "/tmp/lw_al_b.json");
ok(al1.equals(al2) && al1.equals(fs.readFileSync("data/living-world/allocate.samples.json")), "allocate samples are byte-identical and committed");
const AL = await import("./allocate_payload.mjs"), ALS = Object.values(JSON.parse(al1).samples), alBrief = fs.readFileSync("/home/user/cf-overworld/docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md", "utf8");
ok(ALS.every((s) => s.v === 1 && /^battle_/.test(s.battleId) && /^[0-9a-f]{16}$/.test(s.seed) && ["live", "accelerated"].includes(s.mode) && ["WILD", "PLAYER", "ESTATE"].includes(s.parcel.kind) && s.callback.url), "every payload carries the v1 envelope (battleId, 16-hex seed, mode, parcel kind, callback)");
ok(ALS.every((s) => s.battlefield.arena.sizeM === 322 && s.battlefield.structures.every((t) => Math.abs(t.x) <= 161 && Math.abs(t.z) <= 161 && Number.isInteger(t.hp) && t.hp === t.hpMax && ["CORE", "TOWER", "GATE", "WALL"].includes(t.kind)) && s.battlefield.structures.filter((t) => t.kind === "CORE").every((t) => t.z === 114.8) && s.battlefield.spawnZones.every((z) => Math.abs(z.z) === 131.6)), "battlefield in the canon ±161 frame: integer HP, cores at 114.8, spawns at ±131.6");
ok(alBrief.includes('"sizeM": 322') && alBrief.includes("±131.6") && alBrief.includes("±114.8"), "the frame constants still match the canon brief");
ok(ALS.every((s) => [s.sides.ATTACKER, s.sides.DEFENDER].every((d) => d.armies.every((a) => a.units.every((u) => AL.UNIT_CLASS.includes(u.cls) && Number.isInteger(u.count) && u.count > 0)))), "every army unit is a canon UnitClass with an integer count");
ok(ALS.every((s) => (s.parcel.kind === "WILD") === (s.sides.DEFENDER.governorId === null && !!s.battlefield.mobs)), "WILD ⇔ no defending governor and the garrison as mobs; held POIs field the garrison as DEFENDER units");
ok(ALS.every((s) => s.livingWorld.eventDeck.every((e) => PA.events[e.event] && (e.trigger || (e.atSec >= 60 && e.atSec < 720))) && new Set(s.livingWorld.eventDeck.map((e) => e.event)).size === s.livingWorld.eventDeck.length), "event decks: defined events, no repeats, timed inside the 12-min floor (Guardian wake on first contact)");
ok(ALS.every((s) => JSON.stringify([s.livingWorld.terrainMods.attacker, s.livingWorld.terrainMods.defender]) === JSON.stringify(TMd.canon[s.livingWorld.hexTerrain])) && ALS.some((s) => s.livingWorld.guardian && s.livingWorld.guardian.ascended), "livingWorld carries the canon terrain mods and, when stationed, the Guardian (with its Ascension)");

// D22 first-week walkthrough (doc 06 claims, through the real functions)
execFileSync("node", ["tools/living-world/first_week.mjs", "--out", "/tmp/lw_fw_a.md"], { stdio: "ignore" });
ok(fs.readFileSync("/tmp/lw_fw_a.json").equals(fs.readFileSync("docs/living-world/reports/FIRST-WEEK.json")), "first-week walkthrough is reproducible and committed");
const FW = JSON.parse(fs.readFileSync("docs/living-world/reports/FIRST-WEEK.json", "utf8")).runs, FWE = FW.find((x) => x.policy === "EXPLORER"), FWG = FW.find((x) => x.policy === "GRINDER");
ok(FWE.rewardPerWin >= 3 * FWG.rewardPerWin, `exploring pays ≥ 3× grinding per win (${FWE.rewardPerWin} vs ${FWG.rewardPerWin}) — the incentive points outward (doc 06 §4)`);
ok(FWG.stories === 0 && FWE.stories >= 7, "grinding the same POI makes no stories; exploring makes about one a day");
ok(FWE.idleSessions === 0 && FWG.idleSessions === 0, "no session in the first week had nothing to do");
ok(FWE.unlockDay.POST_EVENTS != null && FWE.unlockDay.POST_EVENTS <= 1, "a new player can post events by day 2 (doc 06 §5 ladder step 1)");

// D24 the last out-of-band cell
ok(MX.rows.every((r) => r.verdict === "ok"), `every archetype × ring × ground cell lands its band with canon terrain on (${MX.rows.length} cells)`);
ok(Object.keys(PA.threatBands.kindShift).every((k) => { const [ring, kind] = k.split(":"); return PA.threatBands[ring] && kinds.includes(kind); }), "kindShift keys name a real ring and archetype");

// D25 arrival events land at the derived approaches
const ARV = await import("./arrivals.mjs"), apIds = Object.keys(ARV.AP.maps);
const inFrame = (p) => Math.abs(p.x) <= 161 && Math.abs(p.z) <= 161;
ok(apIds.every((m) => ["NAVAL_LANDING", "AIRSHIP_DROP"].every((ev) => { const r = ARV.resolveArrival(m, ev, "s1"); return !r.eligible || (inFrame(r.spawn) && inFrame(r.target) && (r.target.anchorId === "BEACH" || ARV.AP.maps[m].anchors[r.target.anchorId])); })), "every resolved arrival spawns at an approach and targets a real PIER / LANDING_PAD (or the beach) inside the ±161 frame");
const padOnly = apIds.find((m) => !ARV.AP.maps[m].naval.length && ARV.AP.maps[m].air.length);
ok(padOnly && !ARV.resolveArrival(padOnly, "NAVAL_LANDING", "s1").eligible && ARV.resolveArrival(padOnly, "AIRSHIP_DROP", "s1").eligible, `a baked map with a pad but no deep water (${padOnly}) can host an airship drop but not a naval landing`);
ok(ARV.resolveArrival("not-baked-yet", "NAVAL_LANDING", "s1").via === "EDGE" && ARV.resolveArrival(apIds[0], "STORM", "s1").eligible && !ARV.resolveArrival(apIds[0], "STORM", "s1").via, "unbaked maps fall back to an edge arrival; non-arrival events are untouched");
const deckBad = [];
for (const m of apIds) for (const k of ["HARBOUR", "AIRSHIP_DOCK"]) for (const sd of ["a", "b", "c"]) for (const e of AL.drawDeck({ id: `${m}:${k}`, lwKind: k }, sd, 3, m)) if (!ARV.resolveArrival(m, e.event, sd).eligible || (ARV.ARRIVAL_EVENTS[e.event] && !e.arrival)) deckBad.push(`${m}/${k}/${e.event}`);
ok(deckBad.length === 0, "decks on baked maps never draw an event the map can't host, and arrival events carry their spawn" + (deckBad.length ? " — " + deckBad.slice(0, 3).join(" ") : ""));

// D23 Guardian stationings (doc 04 rules) + GUARDIAN_CHALLENGE on the board
const ST = await import("./stationings.mjs"), palace = Object.entries(ST.PERCHES).reduce((m, [id, p]) => ((m[p.castleId] ||= []).push(id), m), {});
const twoPerch = Object.values(palace).find((ids) => ids.length >= 2), L0 = [];
ok(ST.station(L0, { perchId: twoPerch[0], nftId: "n1", form: 2, owner: "a", start: 0, hours: 24 }).ok && ST.canStation(L0, { perchId: twoPerch[0], nftId: "n2", form: 2, owner: "b", start: 60, hours: 2 }).reason === "PERCH_TAKEN", "one Guardian per perch at a time");
ok(ST.canStation(L0, { perchId: twoPerch[1], nftId: "n1", form: 2, owner: "a", start: 24 * 60 + 23 * 60, hours: 1 }).reason === "NFT_COOLDOWN" && ST.canStation(L0, { perchId: twoPerch[1], nftId: "n1", form: 2, owner: "a", start: 48 * 60, hours: 1 }).ok, "a Warden NFT waits its 24 h cooldown after the stationing ends");
const L1 = []; ST.station(L1, { perchId: twoPerch[0], nftId: "a1", form: 3, owner: "a", start: 0, hours: 6 });
ok(ST.canStation(L1, { perchId: twoPerch[1], nftId: "a2", form: 3, owner: "b", start: 3 * 1440, hours: 6 }).reason === "ASCENDANT_WEEKLY_LIMIT" && ST.canStation(L1, { perchId: twoPerch[1], nftId: "a2", form: 3, owner: "b", start: 7 * 1440 + 1, hours: 6 }).ok, "one Ascendant per castle per 7 days, across all its perches");
ok(ST.canStation([], { perchId: twoPerch[0], nftId: "x", form: 3, owner: "a", start: 0, hours: 7 }).reason === "TOO_LONG" && ST.canStation([], { perchId: "nope", nftId: "x", form: 2, owner: "a", start: 0, hours: 1 }).reason === "NOT_A_PERCH", "stationings are capped at stationHours (F3 6 h) and only on real perches");
const st1 = run("tools/living-world/stationings.mjs", "/tmp/lw_st_a.json"), st2 = run("tools/living-world/stationings.mjs", "/tmp/lw_st_b.json");
ok(st1.equals(st2) && st1.equals(fs.readFileSync("data/living-world/stationings.sample.json")), "stationings sample is byte-identical and committed");
const STS = JSON.parse(st1), stBad = [];
for (const [z, r] of Object.entries(STS.zones)) for (const [i, s] of r.ledger.entries()) { const before = r.ledger.slice(0, i); const c = ST.canStation(before, s); if (!c.ok) stBad.push(`${z}:${s.perchId}:${c.reason}`); }
ok(stBad.length === 0 && STS.accepted > 0 && STS.refused > 0, `the synthetic week only ever accepts lawful stationings (${STS.accepted} accepted, ${STS.refused} refused)`);
const gcB = EB.boardAt("cf-world-1", "BUS", STS.busBusiestNoon.tick, {}), gcRows = [...gcB.live, ...gcB.upcoming].filter((e) => e.kind === "GUARDIAN_CHALLENGE");
ok(gcRows.length === STS.busBusiestNoon.rows.length && gcRows.every((e) => e.state === "LIVE" && e.banner && e.potCT > 0), "every standing Guardian is a LIVE GUARDIAN_CHALLENGE on the board, with its banner and bounty");

// D26 personal journal
const JN = await import("./journal.mjs");
ok(FWE.journalMinPerSession >= 1 && FWE.journalFresh >= 3 * FWG.journalFresh, `the explorer's journal has a fresh story every session (min ${FWE.journalMinPerSession}); ${FWE.journalFresh} vs the grinder's ${FWG.journalFresh}`);
const jw = JN.journalEntry({ kind: "POI_CLEARED", k: "WILD_LAIR", won: true, nth: 1, reward: 10, at: [10, 0], home: [0, 0] }), jr = JN.journalEntry({ kind: "POI_CLEARED", k: "WILD_LAIR", won: true, nth: 3, mult: 0.3, reward: 3, at: [0, 10], home: [0, 0] });
ok(jw.fresh && /wild lair 10 u east of home/.test(jw.text) && !jr.fresh && /3rd time today, ×0.3/.test(jr.text), "journal lines name the place and direction; repeat clears are logged honestly with their multiplier, not as fresh");
ok(Object.keys({ BARBARIAN_CAMP_CLEARED: 1, AIRDROP_TAKEN: 1, CARAVAN_RAIDED: 1, BOUNTY_CLAIMED: 1, POI_HELD: 1, POI_CLEARED: 1 }).every((k) => { const l = JN.journalEntry({ kind: k, k: "WILD_LAIR", won: false }); return l.fresh && !/undefined|_/.test(l.text); }), "every loss reads as a story line (losing is a story, doc 06 §5)");

// D27 PR #1 refresh patch (threat text only; its "+" side is this branch's current overlay)
const P1 = fs.readFileSync("docs/living-world/handoff/PR1-overlay-refresh.patch", "utf8"), p1Files = [...P1.matchAll(/^\+\+\+ b\/data\/world-elements\/(\S+)$/gm)].map((m) => m[1]);
const p1Minus = P1.split("\n").filter((l) => /^-\s/.test(l)), p1Plus = P1.split("\n").filter((l) => /^\+\s/.test(l));
ok(p1Files.length > 0 && p1Minus.length === p1Plus.length && p1Minus.every((l, i) => l.slice(1).replace(/threat \d+/, "threat N") === p1Plus[i].slice(1).replace(/threat \d+/, "threat N")), `the PR #1 refresh only changes threat numbers (${p1Plus.length} lines in ${p1Files.length} files)`);
ok(P1.split(/^diff --git /m).slice(1).every((sec) => { const f = sec.match(/^\+\+\+ b\/data\/world-elements\/(\S+)$/m)[1], cur = fs.readFileSync("data/living-world/world-elements/" + f, "utf8"); return sec.split("\n").filter((l) => /^\+\s/.test(l)).every((l) => cur.includes(l.slice(1).trim())); }), "every line the patch adds is in this branch's current overlay");

// D28 mercenary market
const MM = await import("./merc_market.mjs"), mmPost = "TEST-POST", mmCo = `${mmPost}|co0`, mmSum = (st) => Object.values(st.bal).reduce((x, y) => x + y, 0);
const m1 = MM.newState({ h: 10000, r: 10000 }), h1 = MM.hire(m1, { postId: mmPost, companyId: mmCo, side: "DEFEND", hirer: "h", level: 1, tick: 0 });
ok(h1.ok && h1.contract.type === "MERCENARY_DEFEND" && h1.contract.state === "TAKEN" && h1.contract.mercs === 2 && h1.contract.expiresAt === 24 * 60 && m1.bal.BURN === Math.floor(MM.priceC(1) * 0.3), "a DEFEND hire is a canon Contract (TAKEN, +2 mercs for 24 h) split like a defence stake (30 % burned)");
ok(MM.hire(m1, { postId: mmPost, companyId: mmCo, side: "ATTACK", hirer: "r", level: 1, tick: 5 }).reason === "COMPANY_TAKEN", "a hired company can't serve the other side");
MM.expire(m1, 24 * 60);
ok(m1.contracts[0].state === "FULFILLED" && m1.companies[mmCo].state === "FREE" && m1.bal.h === 10000 - MM.priceC(1) + Math.floor(MM.priceC(1) * 0.4) && mmSum(m1) === 20000, "on expiry the contract is FULFILLED, the company is free again, the unbroken defence's escrow comes home; CT conserved");
const m2 = MM.newState({ h: 10000, r: 10000 }), p2 = MM.priceC(2);
MM.bid(m2, { postId: mmPost, companyId: mmCo, side: "DEFEND", hirer: "h", level: 2, amount: p2, tick: 0 });
ok(MM.bid(m2, { postId: mmPost, companyId: mmCo, side: "ATTACK", hirer: "r", level: 2, amount: p2 + 1, tick: 2 }).reason === "RAISE_TOO_SMALL", "MERC_BIDDING: a raise under +10 % is refused");
MM.bid(m2, { postId: mmPost, companyId: mmCo, side: "ATTACK", hirer: "r", level: 2, amount: Math.ceil(p2 * 1.1), tick: 3 });
ok(MM.hire(m2, { postId: mmPost, companyId: mmCo, side: "DEFEND", hirer: "h", level: 2, tick: 4 }).reason === "IN_BIDDING", "a company in bidding can't be hired around the auction");
const won2 = MM.closeBidding(m2, mmCo, 10);
ok(won2.ok && won2.contract.type === "MERCENARY_ATTACK" && m2.bal.h === 10000 && m2.bal.r === 10000 - Math.ceil(p2 * 1.1) && mmSum(m2) === 20000 && m2.bal.BURN >= 0.1 * Math.ceil(p2 * 1.1), "the top bid wins and pays its bid (raider → MERCENARY_ATTACK); the loser is refunded in full; CT conserved; burn ≥ 10 %");
ok(MM.hire(MM.newState({ r: 10000 }), { postId: mmPost, companyId: mmCo, side: "ATTACK", hirer: "r", hirerAlliance: 3, targetHolderAlliance: 3, level: 1, tick: 0 }).reason === "RELATED_TARGET", "you can't hire mercenaries against your own alliance (doc 05 relation check)");
const mm1 = run("tools/living-world/merc_market.mjs", "/tmp/lw_mm_a.json");
ok(mm1.equals(fs.readFileSync("data/living-world/merc-market.sample.json")) && JSON.parse(mm1).biddingExample.conserved, "merc-market sample is reproducible, committed, and conserves CT");

// D29 season beats (doc 06 §3 weekly beats on one 28-day cycle)
const sb1 = run("tools/living-world/season_beats.mjs", "/tmp/lw_sb_a.json");
ok(sb1.equals(fs.readFileSync("data/living-world/season-beats.json")), "season-beats calendar is reproducible and committed");
const SB = await import("./season_beats.mjs"), sbBad = [];
for (let cy = 0; cy < 6; cy++) {
  const C = SB.beats("cf-world-1", cy), peaks = {};
  for (const [z, Bz] of Object.entries(C)) {
    const bigD = Bz.filter((b) => SB.CYCLE.big.includes(b.beat)).map((b) => b.day).sort((x, y) => x - y), lull = new Set(Bz.filter((b) => b.beat === "LULL").map((b) => b.day));
    if (bigD.some((d, i) => i && d - bigD[i - 1] < 2)) sbBad.push(`${cy}/${z}: big beats adjacent`);
    if (bigD.some((d) => lull.has(d))) sbBad.push(`${cy}/${z}: big beat in a lull`);
    if (Bz.filter((b) => b.beat === "THREAT_PEAK").length !== 1) sbBad.push(`${cy}/${z}: peaks ≠ 1`);
    if ((WCm.REGIONS[z].lanes || []).length && !Bz.some((b) => b.beat === "STORM_FRONT")) sbBad.push(`${cy}/${z}: no storm front`);
    const asc = Bz.filter((b) => b.beat === "ASCENSION_NIGHT").map((b) => Math.floor(b.day / 7));
    if (asc.length && asc.join() !== "0,1,2,3") sbBad.push(`${cy}/${z}: ascension nights not one per week`);
    for (const b of Bz) if (b.beat === "THREAT_PEAK") peaks[b.day] = (peaks[b.day] || 0) + 1;
  }
  if (Object.values(peaks).some((n) => n > SB.CYCLE.maxPeaksPerDay)) sbBad.push(`${cy}: > 2 peaks on a day`);
}
ok(sbBad.length === 0, "6 cycles × all regions: one threat peak each (≤ 2 regions per day), big beats never on the same or adjacent days, never in a lull; storm fronts on sea regions; one Ascension night per week where there are perches" + (sbBad.length ? " — " + sbBad.slice(0, 3).join("; ") : ""));

// D30 proposed SKY / UNDER terrain rows (existing canon HexTerrain values only)
const MXP = JSON.parse(fs.readFileSync("docs/living-world/reports/SIM-MATRIX-PROPOSED.json", "utf8")), canonHT = fs.readFileSync("/home/user/cf-overworld/docs/08-data-models.md", "utf8").match(/export type HexTerrain = ([^;]+);/)[1];
ok(Object.values(TMd.proposed.groundToHexTerrain).every((t) => canonHT.includes(`'${t}'`) && TMd.canon[t]), "the SKY / UNDER proposal maps onto EXISTING canon HexTerrain rows (no new enum values)");
ok(MXP.terrain === "proposed" && MXP.rows.every((r) => r.verdict === "ok"), `with the proposal + its seed groundShift, every cell still lands its band (${MXP.rows.length} cells)`);
ok(MX.terrain === true && !MX.rows.some((r) => r.medThreat !== MXP.rows.find((x) => x.k === r.k && x.ring === r.ring && x.ground === r.ground).medThreat && !["SKY", "UNDER"].includes(r.ground)), "the proposal only touches SKY / UNDER cells; the committed canon matrix is unchanged");

// D31 Guardian damage-share cap (doc 04 §4)
const g31 = JSON.parse(fs.readFileSync("docs/living-world/reports/SIM-SAMPLE.json", "utf8")).scenarios.filter((x) => x.scen === "F2" || x.scen === "F3"), G31 = JSON.parse(fs.readFileSync("data/living-world/guardians.json", "utf8"));
ok(g31.length > 0 && g31.every((x) => x.guardianDmgShare != null && x.guardianDmgShare <= G31.caps.guardianDamageShareMax), `every Guardian run keeps its damage share ≤ ${G31.caps.guardianDamageShareMax * 100} % of the defenders' (max ${Math.max(...g31.map((x) => x.guardianDmgShare))})`);
ok(g31.every((x) => x.breached && x.guardianKoSec != null), "capped Guardians are still always beaten eventually (nothing bought forever)");
ok(Object.values(JSON.parse(fs.readFileSync("data/living-world/allocate.samples.json", "utf8")).samples).filter((s) => s.livingWorld.guardian).every((s) => s.livingWorld.guardian.damageShareMax === G31.caps.guardianDamageShareMax), "the allocate payload tells the engine the Guardian's damage-share cap");
const kern = fs.readFileSync("server/sim/systems/combat.js", "utf8") + fs.readFileSync("server/sim/abilities.js", "utf8");
ok((kern.match(/dmgDealt != null\) \w+\.dmgDealt \+= dealt/g) || []).length === 2, "the kernel's damage ledger is opt-in (only units with dmgDealt record), so stock battles are untouched");

// D32 a month at scale (North Star)
execFileSync("node", ["tools/living-world/month_sim.mjs", "--out", "/tmp/lw_mo_a.md"], { stdio: "ignore" });
ok(fs.readFileSync("/tmp/lw_mo_a.json").equals(fs.readFileSync("docs/living-world/reports/MONTH.json")), "month-at-scale report is reproducible and committed");
const moBad = [];
for (const sd of ["cf-world-1", "m2", "m3", "m4"]) {
  execFileSync("node", ["tools/living-world/month_sim.mjs", "--seed", sd, "--out", `/tmp/lw_mo_${sd}.md`], { stdio: "ignore" });
  const M = JSON.parse(fs.readFileSync(`/tmp/lw_mo_${sd}.json`, "utf8")), Z = M.bannersByDay[0] ? Object.keys(M.bannersByDay[0]).length : 0;
  if (!(M.maxRegionsOnePlayer < Z)) moBad.push(`${sd}: one player bannered ${M.maxRegionsOnePlayer}/${Z}`);
  if (!(M.maxRegionsOneAlliance <= Math.ceil(Z / 2))) moBad.push(`${sd}: one alliance bannered ${M.maxRegionsOneAlliance}/${Z}`);
  if (!(M.whaleSharePct < 5)) moBad.push(`${sd}: whale holds ${M.whaleSharePct} %`);
  if (!(M.bannerChanges > Z)) moBad.push(`${sd}: only ${M.bannerChanges} banner changes`);
  if (!(M.takesFromPlayers > 0 && M.wildAtEnd > 0)) moBad.push(`${sd}: no contest or no wild left`);
}
ok(moBad.length === 0, "4 seeds × 400 agents × 28 days: nobody holds every region (one player ≤ 1–2, one alliance ≤ half), the whale stays < 5 % of all holdings, banners keep changing hands, wild land remains" + (moBad.length ? " — " + moBad.join("; ") : ""));

// D34 the README covers every tool, data file and doc
const RM = fs.readFileSync("docs/living-world/README.md", "utf8");
const rmMiss = [...fs.readdirSync("tools/living-world").filter((f) => f !== "test_living_world.mjs"), ...fs.readdirSync("data/living-world").filter((f) => !f.endsWith(".sample.json") && f !== "allocate.samples.json").map((f) => f.replace(/\.json$/, ".json")), ...fs.readdirSync("docs/living-world").filter((f) => f.endsWith(".md") && f !== "README.md")]
  .filter((f) => !RM.includes(f.replace(/\.(mjs|sh)$/, "")) && !RM.includes(f));
ok(rmMiss.length === 0, "the living-world README mentions every tool, data file and doc" + (rmMiss.length ? " — missing: " + rmMiss.join(", ") : ""));

// D35 performance budgets (per-call probes, best of 3; budget = 2× the recorded baseline)
const PB = JSON.parse(fs.readFileSync("data/living-world/perf-budget.json", "utf8")), PERF = await import("./perf_budget.mjs"), pm = PERF.measure();
const pOver = Object.entries(pm).filter(([k, v]) => v > PB.budget[k]);
ok(pOver.length === 0, `hot paths inside budget: ${Object.entries(pm).map(([k, v]) => `${k} ${v}/${PB.budget[k]}`).join(", ")}`);
ok(PB.baseline.boardAt_ms < 1 && PB.baseline.seedSingle_us < 100, "a board view costs < 1 ms and a lazy parcel seed < 100 µs (UI- and first-visit-safe)");

// D36 result resolver (callback → world updates)
const RR = await import("./resolve_result.mjs"), rrS = JSON.parse(fs.readFileSync("data/living-world/allocate.samples.json", "utf8")).samples.CASTLE_POI_WITH_ASCENDANT, rrP = rrS.livingWorld.poiId;
const rrW = () => RR.newWorld({ [`ESCROW:DEFENCE:${rrP}`]: 4000, [`ESCROW:GUARDIAN:${rrP}`]: 9000, gov_SAMPLE_HOLDER: 1000 }, { alliance: { gov_SAMPLE_ATTACKER: 1, gov_SAMPLE_HOLDER: 2 }, guardianOwner: { [rrP]: "gov_SAMPLE_HOLDER" }, holders: { [rrP]: "gov_SAMPLE_HOLDER" } });
const rrCb = (winner, go, raw = 0.5, matchId = "efm_1") => ({ v: 1, battleId: rrS.battleId, matchId, outcome: { winner, reason: "CORE_DESTROYED" }, sides: { ATTACKER: { casualties: { INFANTRY: 140, SIEGE: 20 }, survivors: {}, officers: [{ masterId: "m", state: "ALIVE", contribution: { rawImpact: raw } }] }, DEFENDER: { casualties: {}, survivors: {}, officers: [] } }, livingWorld: { guardianOutcome: go } });
const rrSum = (w) => Object.values(w.bal).reduce((x, y) => x + y, 0);
const r1 = RR.resolveResult(rrW(), rrS, rrCb("ATTACKER", "KO"));
ok(r1.world.bal[`ESCROW:DEFENCE:${rrP}`] === 0 && r1.world.bal[`ESCROW:GUARDIAN:${rrP}`] === 0 && r1.world.bal.gov_SAMPLE_ATTACKER === 13000 && rrSum(r1.world) === rrSum(rrW()), "attacker win + Guardian KO: defence spoils and the whole bounty go to the attacker; CT conserved");
const r2 = RR.resolveResult(rrW(), rrS, rrCb("ATTACKER", "OUTLASTED"));
ok(r2.world.bal.gov_SAMPLE_HOLDER === 1000 + 4500 && r2.world.bal.gov_SAMPLE_ATTACKER === 4000 + 4500, "an outlasted Ascendant pays half its bounty; the other half goes home (doc 04 §3)");
const r3 = RR.resolveResult(rrW(), rrS, rrCb("DEFENDER", "HELD"));
ok(r3.world.bal[`ESCROW:GUARDIAN:${rrP}`] === 9000 && r3.world.holders[rrP] === "gov_SAMPLE_HOLDER" && r3.world.feed.some((f) => f.kind === "GUARDIAN_HELD"), "a held castle keeps its holder and escrows, and makes a GUARDIAN_HELD story");
ok(r1.effects.find((e) => e.kind === "CLEAR_REWARD").heroImpact === RR.HERO_IMPACT_MAX && RR.resolveResult(rrW(), rrS, rrCb("ATTACKER", "KO", 0.07)).effects.find((e) => e.kind === "CLEAR_REWARD").heroImpact === 0.07, "officer raw impact is clamped to HERO_IMPACT_MAX = 0.20 (canon invariant 4)");
ok(RR.resolveResult(r1.world, rrS, rrCb("ATTACKER", "KO")).duplicate === true && RR.resolveResult(r1.world, rrS, rrCb("ATTACKER", "KO", 0.5, "efm_OTHER")).status === 409, "idempotent on battleId; a second result with a different matchId is a 409 conflict");
const rrRel = rrW(); rrRel.alliance.gov_SAMPLE_ATTACKER = 2;
ok(RR.resolveResult(rrRel, rrS, rrCb("ATTACKER", "KO")).world.bal.BURN === 13000, "an attacker allied with the defender gets nothing: the escrows burn (doc 05 relation check)");
ok(r1.effects.find((e) => e.kind === "ATTACKER_LOSSES").retrainCT === 4.8, "attacker losses are priced at canon balance.json v2 re-training cost (INFANTRY 0.02 CT, SIEGE 0.1 CT)");

console.log(fails ? `❌ living-world: ${fails} failed` : "✅ living-world: all passed"); process.exit(fails ? 1 : 0);
