// D26 — the personal journal (doc 06 §7 watch item): EVERY fight a player takes becomes a private line, wins and
// losses alike ("losing is a story", doc 06 §5). The region feed (D10) stays curated; the journal is where a routine
// clear still reads like something happened. `fresh` = a first clear today, any event, or any loss; a repeat clear
// is logged honestly with its anti-farm multiplier but isn't fresh. Pure; no randomness.
const LABEL = { WILD_LAIR: "wild lair", WAR_CAMP: "war camp", HARBOUR: "harbour", MERCENARY_POST: "mercenary post", AIRSHIP_DOCK: "airship dock", VENT: "vent", LANDING_SPOT: "landing spot", SALVAGE_SITE: "salvage site", BARBARIAN_CAMP: "barbarian camp" };
const WIN = {
  POI_CLEARED: "Cleared the {poi} {where}",
  BARBARIAN_CAMP_CLEARED: "Broke a barbarian raid {where}: 48 h of quiet for the region",
  AIRDROP_TAKEN: "Held the airdrop crate {where} for 20 s and took it",
  CARAVAN_RAIDED: "Took a caravan on the road {where}",
  BOUNTY_CLAIMED: "Claimed the bounty {where}",
  POI_HELD: "Drove the sky raiders off {where}",
};
const LOSS = { BARBARIAN_CAMP_CLEARED: "the barbarian raid", AIRDROP_TAKEN: "the airdrop", CARAVAN_RAIDED: "the caravan escort", BOUNTY_CLAIMED: "the bounty target", POI_HELD: "the sky raiders" };
const DIRS = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];
export function where(at, home) {
  if (!at || !home) return "out in the region";
  const dx = at[0] - home[0], dz = at[1] - home[1], d = Math.round(Math.hypot(dx, dz));
  return d < 5 ? "at your gates" : `${d} u ${DIRS[((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8]} of home`;
}
const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
export function journalEntry({ kind, k, won, nth = 1, mult = 1, reward = 0, planted = false, at = null, home = null }) {
  const w = where(at, home), poi = LABEL[k] || "position";
  if (!won) return { fresh: true, text: kind === "POI_CLEARED" ? `Beaten back at the ${poi} ${w}. They'll remember you.` : `Lost to ${LOSS[kind]} ${w}. Next time.` };
  let text = WIN[kind].replace("{poi}", poi).replace("{where}", w);
  if (nth > 1) return { fresh: false, text: `${text} again: the ${ord(nth)} time today, ×${mult} reward (+${reward})` };
  if (planted) text += ", and planted your banner";
  return { fresh: true, text: `${text} (+${reward})` };
}
