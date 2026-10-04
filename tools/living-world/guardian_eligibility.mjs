#!/usr/bin/env node
// D52 — which pet NFTs can station as a Guardian (doc 04 §5 ❓): derived, never hand-picked. Sources (read-only):
//   · the MOBA repo's mon_lineage.json upgradeChains: each species' forms[] in order: Form 1 / Form 2 / Form 3;
//     a form with glb: null has no 3D art yet
//   · cf-overworld data/PETS_ROSTER.csv (canon roster): Battle-Ready + Flying, joined on the model file name
// Rules (guardians.json + doc 04): a WARDEN needs the species' Form 2; an ASCENDANT needs its Form 3. The NFT must be
// battle-ready (not a cosmetic). Flyers (Flyer type or Flying = Yes) are a FIT for sky-castle perches, not a gate: only
// 2 Warden-eligible flyers exist, so a flyers-only rule would leave the sky almost unguarded (measured here, D52).
// Ascendants without Form 3 art are "stand-in" (the MOBA shows Form 2 at 2.0×); owner call §2 decides if they may station.
import fs from "node:fs";
const LIN = "/home/user/etherfantasy-browser-moba-game/mon_lineage.json", ROSTER = "/home/user/cf-overworld/data/PETS_ROSTER.csv";
const OUT = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : "data/living-world/guardian-eligibility.json"; })();
const L = JSON.parse(fs.readFileSync(LIN, "utf8"));
const rows = fs.readFileSync(ROSTER, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const byGlb = Object.fromEntries(rows.map((c) => [c[2], { battleReady: c[5] === "Yes", flying: c[6] === "Yes" }]));
export function eligibility() {
  const species = L.upgradeChains.filter((c) => c.cls < 9000).map((c) => {
    const f1 = c.forms[0], f2 = c.forms[1], f3 = c.forms[2], r = byGlb[f1 && f1.glb] || {};
    const flyer = c.types.includes("Flyer") || !!r.flying, battleReady = r.battleReady !== false;   // unknown in the roster → assume battle-ready
    return { name: c.name, rarity: c.rarity, types: c.types, battleReady, flyer,
      warden: f2 ? { form: f2.name, art: !!f2.glb } : null, ascendant: f3 ? { form: f3.name, art: !!f3.glb } : null,
      wardenOk: !!f2 && battleReady, ascendantOk: !!f3 && battleReady, ascendantStandIn: !!f3 && !f3.glb, skyPerchOk: flyer };
  }).sort((a, b) => (a.name < b.name ? -1 : 1));
  const n = (f) => species.filter(f).length;
  return { counts: { species: species.length, wardenOk: n((s) => s.wardenOk), ascendantOk: n((s) => s.ascendantOk), ascendantWithArt: n((s) => s.ascendantOk && !s.ascendantStandIn), ascendantStandIn: n((s) => s.ascendantOk && s.ascendantStandIn), skyWarden: n((s) => s.wardenOk && s.skyPerchOk), skyAscendant: n((s) => s.ascendantOk && s.skyPerchOk), cosmeticExcluded: n((s) => !s.battleReady && (s.warden || s.ascendant)) }, species };
}
if (process.argv[1] && process.argv[1].endsWith("guardian_eligibility.mjs")) {
  const E = eligibility();
  fs.writeFileSync(OUT, JSON.stringify({ schema: "cf-living-world/guardian-eligibility@1", sources: { lineage: "etherfantasy-browser-moba-game mon_lineage.json (upgradeChains)", roster: "cf-overworld data/PETS_ROSTER.csv" }, rules: "WARDEN = has Form 2; ASCENDANT = has Form 3; battle-ready only; flyers are a sky-perch fit, not a gate (only 2 flyer Wardens exist); Form 3 without art = stand-in (owner call §2)", ...E }, null, 1) + "\n");
  console.log("guardian eligibility:", JSON.stringify(E.counts));
}
