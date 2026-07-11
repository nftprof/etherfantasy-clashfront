// chronicle.js — the RUIN name table (depth-layer 1: the seeded Chronicle layer).
//
// Names + one-line inscriptions for the seeded RUIN entities (generate.js placeRuin), drawn
// deterministically from the World Chronicle (docs/lore/WORLD-CHRONICLE.md — Second/Third Age,
// hub mirror): the old kingdoms that crumbled after the Sundering — their keeps are the fallen
// keeps, their wars the cairns on old battlefields; the First Descent (Jiro, Ayume, and Yui the
// carnival keeper); the five Masks (Harlequin / Plague Doctor / Lunar Moth / Siren / Phoenix);
// the Sigil of Binding; Kage no Mamoru the Shadow Warden bound below; and the Age of Ashes'
// Long Peace. ~16 table entries, reused with seeded variation; zone flavor comes from the
// zone's culture (Arcadia scholarly / Tianxia imperial / Porthaven mercantile / Mythoria
// festival; unknown zones read as frontier wilds).
//
// Pure + deterministic: the caller supplies the seeded rng; same rng state ⇒ same lore.

export const RUIN_TYPES = ["FALLEN_KEEP", "CAIRN", "OLD_WALL", "SUNKEN_SHRINE"];

// zone → culture flavor. {EP} in a name template takes a seeded epithet; {KD} in an
// inscription takes the zone's fallen-kingdom label.
const ZONE_FLAVOR = {
  EDU: { epithets: ["the Scholars'", "the Archivists'", "the First Faculty's", "the Glasswrights'"], kingdom: "the scholar-kingdom of old Arcadia" },
  HUB: { epithets: ["the Emperor's", "the Ten Banners'", "the Jade Court's", "the First Dynasty's"], kingdom: "the old empire of Tianxia" },
  BUS: { epithets: ["the Salt Princes'", "the Ledger Lords'", "the Tide Factors'", "the First Fleet's"], kingdom: "the drowned charter of old Porthaven" },
  ENT: { epithets: ["the Carnival Kings'", "the Masked Court's", "the Lantern Wardens'", "the First Troupe's"], kingdom: "the festival crowns of Mythoria" },
  DEFAULT: { epithets: ["the Old Kings'", "the Nameless", "the Forgotten", "the First Age's"], kingdom: "the old kingdoms" },
};

// The Chronicle table. One melancholy line each; names may carry {EP}, inscriptions {KD}.
const TABLE = [
  // FALLEN_KEEP — the old kingdoms' keeps, broken in the Sundering
  { t: "FALLEN_KEEP", name: "{EP} Keep", insc: "Here the banners of the old kingdom fell, and were not raised again." },
  { t: "FALLEN_KEEP", name: "Keep of the Long Peace", insc: "Its watch ended in the Age of Ashes; no one now remembers what it watched for." },
  { t: "FALLEN_KEEP", name: "{EP} Hold", insc: "The Sundering took its towers in one night; the gate still stands open for a garrison that never came home." },
  { t: "FALLEN_KEEP", name: "Hall of {KD}", insc: "A throne room open to the rain. The crows keep court where {KD} once did." },
  // CAIRN — the wars of the old kingdoms, and the roads of the First Descent
  { t: "CAIRN", name: "Cairn of {EP} Fallen", insc: "A war whose name is lost; the cairn keeps its count regardless." },
  { t: "CAIRN", name: "The Sundering Cairn", insc: "Raised for those the breaking took. The deep kept the rest." },
  { t: "CAIRN", name: "Cairn of the Last Muster", insc: "They marched out to hold the line for {KD}; the stones marched home without them." },
  { t: "CAIRN", name: "Ayume's Waymark", insc: "Ayume of the First Descent rested here on the long road down; travellers still add a stone." },
  { t: "CAIRN", name: "Jiro's Rest", insc: "Jiro slept here the night before the First Descent, the Chronicle says, and dreamed of the door." },
  // OLD_WALL — borders of the crumbled kingdoms; the Sigil's hem against what walks below
  { t: "OLD_WALL", name: "{EP} Wall", insc: "A border no living map remembers; the wall holds it anyway." },
  { t: "OLD_WALL", name: "Wall of the Sigil", insc: "Fragments of the Sigil of Binding are cut along its length, to hem in what was bound below." },
  { t: "OLD_WALL", name: "The Long Peace Rampart", insc: "Finished in the Age of Ashes and never once defended; the peace outlasted its masons." },
  { t: "OLD_WALL", name: "March-Stones of {KD}", insc: "Every tenth stone bears a mask worn smooth — Harlequin, they say, walked this line laughing." },
  // SUNKEN_SHRINE — the Masks, the Warden, and the keepers of the way down
  { t: "SUNKEN_SHRINE", name: "Shrine of the Five Masks", insc: "Harlequin, Plague Doctor, Lunar Moth, Siren, Phoenix — five alcoves, all of them empty." },
  { t: "SUNKEN_SHRINE", name: "Yui's Lantern Shrine", insc: "Yui the carnival keeper lit a lantern here for the ones who went down. It has been dark a long age." },
  { t: "SUNKEN_SHRINE", name: "Shrine of the Warden", insc: "They prayed here that Kage no Mamoru's bindings hold. Quietly, some still do." },
  { t: "SUNKEN_SHRINE", name: "{EP} Well-Shrine", insc: "The water remembers the Sundering; on still nights it trembles without wind." },
  { t: "SUNKEN_SHRINE", name: "Shrine of the First Descent", insc: "Jiro, Ayume and Yui the carnival keeper are carved on the lintel, facing down into the dark." },
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Seeded lore pick for one ruin. Deterministic: consumes exactly 2 rng() draws.
 * @param {() => number} rng   seeded rng (the caller's dedicated ruin stream)
 * @param {string} zone        zone code (EDU/HUB/BUS/ENT/…); unknown ⇒ frontier flavor
 * @param {string} ruinType    one of RUIN_TYPES
 * @returns {{ name: string, inscription: string }}
 */
export function ruinLore(rng, zone, ruinType) {
  const fl = ZONE_FLAVOR[String(zone || "").toUpperCase()] || ZONE_FLAVOR.DEFAULT;
  const rows = TABLE.filter((e) => e.t === ruinType);
  const row = rows[Math.floor(rng() * rows.length)] || rows[0];
  const ep = fl.epithets[Math.floor(rng() * fl.epithets.length)];
  const name = cap(row.name.replaceAll("{EP}", ep).replaceAll("{KD}", fl.kingdom));
  const inscription = row.insc.replaceAll("{KD}", fl.kingdom);
  return { name, inscription };
}
