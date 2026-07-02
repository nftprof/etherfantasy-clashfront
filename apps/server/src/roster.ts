/**
 * Demo roster content for the MVP server (docs/briefs/MVP-JULY7.md item 5:
 * "Pull names from data/ rosters for authenticity").
 *
 * Masters come from data/CHARACTER_ROSTER.csv (Category = Master); the three
 * MOBA Heroes (Irene/Kai/Leah) are the roster's Hero rows. Each joining player
 * gets 3 Hero variants + 5 demo Masters as their officer pool.
 */

/** The 3 MOBA Heroes of data/CHARACTER_ROSTER.csv (base display names). */
export const HERO_NAMES = ['Irene', 'Kai', 'Leah'] as const;

/**
 * Fallback Master names (first rows of data/CHARACTER_ROSTER.csv) used when the
 * CSV is not on disk (e.g. a deploy without the data/ folder).
 */
export const FALLBACK_MASTER_NAMES: readonly string[] = [
  'Death_Jinook', 'Maenak', 'Maple', 'Purin', 'Blis', 'MrBen', 'Bellbird',
  'Amy', 'Camila', 'Dochi', 'Gato', 'Iskall', 'Jake', 'Jiyeon', 'Lu',
];

/**
 * Parse unique Master display names out of data/CHARACTER_ROSTER.csv.
 * The Category and Name columns never contain commas, so a plain split on the
 * first two fields is safe even for rows with quoted Notes columns.
 */
export function parseMasterNames(csv: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of csv.split(/\r?\n/)) {
    const [category, rawName] = line.split(',');
    if (category !== 'Master') continue;
    const name = rawName?.replace(/^"|"$/g, '').trim();
    if (name === undefined || name === '' || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Officer display names for the n-th joining player (0-based): 3 Hero variants
 * (base names for player 0, "Irene 2"… for later joins so every officer in the
 * world reads distinctly) + 5 Masters rotated through the roster.
 */
export function officerNamesForJoin(joinIndex: number, masterNames: readonly string[]): string[] {
  const heroes = HERO_NAMES.map((h) => (joinIndex === 0 ? h : `${h} ${joinIndex + 1}`));
  const pool = masterNames.length > 0 ? masterNames : FALLBACK_MASTER_NAMES;
  const masters = Array.from({ length: 5 }, (_, i) => {
    const base = pool[(joinIndex * 5 + i) % pool.length]!;
    const lap = Math.floor((joinIndex * 5 + i) / pool.length);
    return lap === 0 ? base : `${base} ${lap + 1}`;
  });
  return [...heroes, ...masters];
}

/** Governor map colors — assigned round-robin at registration (client paints by these). */
export const GOVERNOR_PALETTE: readonly string[] = [
  '#2f6fed', // blue
  '#d93b3b', // red
  '#2e9e5b', // green
  '#c78a1f', // amber
  '#8a4fd3', // violet
  '#0f9ba8', // teal
  '#d1518f', // rose
  '#6b8e23', // olive
  '#b5651d', // rust
  '#4657ce', // indigo
  '#9c27b0', // magenta
  '#00838f', // deep cyan
];

/** Fixed colors for the two boot-time governors. */
export const WILD_COLOR = '#6b7280'; // the SYSTEM wild-monster governor
export const NPC_COLOR = '#7a2e2e'; // the NPC kingdom
