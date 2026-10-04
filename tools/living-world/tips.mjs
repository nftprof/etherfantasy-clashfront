// D58 — player-facing explainer tips (i18n tip.*), with every number bound to the LIVE data so a tip can never
// contradict the game. tipVars() derives the values; tips(lang) renders every tip.* key.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { t, table } from "./i18n.mjs";
import { BOARD } from "./event_board.mjs";
import { TRAFFIC } from "./ambient_traffic.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
export function tipVars() {
  const GU = rd("data/living-world/guardians.json"), DF = rd("data/living-world/defences.json"), EX = rd("data/living-world/experience.json"), FT = rd("data/living-world/feed-templates.json");
  const M = DF.upgrades.find((u) => u.id === "MERCENARIES"), price = (l) => Math.round(M.baseCT * DF.rating.levelCostGrowth ** (l - 1) * 100) / 100, U = EX.influenceUnlocks.map((u) => u.poisHeld), V = EX.vesselAccess.tiers.map((x) => x.parcels), A = GU.forms["3"].ascended, am = EX.antiFarm.multipliers;
  return { leadH: BOARD.boardLeadMin / 60, pingU: BOARD.pingU, perDay: FT.rules.perRegionPerDay, window: EX.antiFarm.windowHours, m2: am[1], m3: am[2], m4: am[3], lullH: EX.lullHours.BARBARIAN_CAMP,
    wardenH: GU.forms["2"].stationHours, wardenFee: GU.forms["2"].feeCT, ascH: GU.forms["3"].stationHours, ascFee: GU.forms["3"].feeCT, ascMin: A.windowSec / 60, ascPct: Math.round(A.damageTakenMul * 100), wards: A.wardStones.count,
    m1: M.effect.mercs[0], h1: M.hours[0], p1: price(1), m2g: M.effect.mercs[1], h2: M.hours[1], p2: price(2), r1: U[0], r2: U[1], r3: U[2], r4: U[3], v1: V[0], v2: V[1], v3: V[2], v4: V[3],
    stormDays: TRAFFIC.stormSeasonDays, cycleDays: TRAFFIC.stormCycleDays, ratingMax: DF.rating.max };
}
export function tips(lang = "en") { const v = tipVars(); return Object.fromEntries(Object.keys(table(lang)).filter((k) => k.startsWith("tip.")).sort().map((k) => [k, t(k, v, lang)])); }
