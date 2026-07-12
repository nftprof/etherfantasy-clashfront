/**
 * HERO-vs-HERO DUEL — deterministic HP-based resolution core (docs/briefs/HERO-DUEL-SPEC.md,
 * decision 14; element-free, docs/maps/MASTERS-ELEMENT-FREE-RULING.md).
 *
 * v2 (owner 2026-07-12): NOT best-of-3 pips — an actual FIGHT. Each Master has
 * STATS derived from rating + equipped Named artifacts (ATK, DEF, HP); they trade
 * blows across exchanges, HP bars deplete, crits land, artifacts flare as SPELLS,
 * and it ends on a KO (or, if the clock runs out, higher HP%). A card choice is
 * the tactical STANCE each exchange (aggressive/defensive/trick, RPS-flavored)
 * that swings the damage — the player's agency layer on top of the stat fight.
 *
 * Still AUTO-RESOLVES (offline handled) and an online player may pick a stance
 * each exchange (else NPC). PURE + DETERMINISTIC: same (inputs, seed, picks) ⇒
 * same fight forever (no Math.random/Date.now; all randomness from createRng).
 */
import { createRng, type Balance } from '@clashfront/shared';

export type DuelCard = 'AGGRESSIVE' | 'TRICK' | 'DEFENSIVE';
export const DUEL_CARDS: readonly DuelCard[] = ['AGGRESSIVE', 'TRICK', 'DEFENSIVE'];

/** One duelist's inputs. `rating` = f(level, fame) computed by the caller (element-free). */
export interface DuelSide {
  /** Reference id (masterId/hero_… ) — carried through, never affects odds. */
  ref: string;
  name: string;
  /** Base power input. Higher rating ⇒ higher ATK + HP. */
  rating: number;
  /** Equipped Named artifact (data/singulars.json artifacts[].id), if any — the wildcard. */
  artifactId?: string;
  /** Display name for the artifact, surfaced as a SPELL flare in the fight. */
  artifactName?: string;
}

/** Derived combat stats for a duelist (shown in the UI; used in resolution). */
export interface DuelStats {
  atk: number;
  maxHp: number;
}

/** Human stance picks per exchange, 1-indexed. A missing exchange ⇒ NPC auto-picks. */
export type DuelPicks = Partial<Record<number, DuelCard>>;

/** One blow within an exchange (drives an attack animation + damage number). */
export interface DuelBlow {
  by: 'A' | 'D';
  card: DuelCard;
  dmg: number;
  crit: boolean;
  /** Set when a Named artifact flared as a spell on this blow. */
  spell?: { side: 'A' | 'D'; label: string };
  /** Whether the stance clash favored this attacker (pressed advantage). */
  pressed: boolean;
}

/** One exchange = both sides' stances + their blows + the HP after (the replay beat). */
export interface DuelExchange {
  round: number;
  cA: DuelCard;
  cD: DuelCard;
  blows: DuelBlow[];   // ordered (faster Master strikes first)
  hpA: number;         // A's HP after this exchange
  hpD: number;         // D's HP after this exchange
  koA?: boolean;       // A was knocked out this exchange
  koD?: boolean;
}

export interface DuelResult {
  winner: 'A' | 'D';
  exchanges: DuelExchange[]; // the fight script — drives the animated overlay
  statsA: DuelStats;
  statsD: DuelStats;
  effA: number;
  effD: number;
  shareA: number;
  /** How the fight ended — a KO, or the clock (both survived to maxExchanges). */
  ending: 'KO' | 'CLOCK';
}

/** RPS: AGGRESSIVE beats TRICK beats DEFENSIVE beats AGGRESSIVE. */
function rps(cA: DuelCard, cD: DuelCard): 'A' | 'D' | 'TIE' {
  if (cA === cD) return 'TIE';
  const beats: Record<DuelCard, DuelCard> = { AGGRESSIVE: 'TRICK', TRICK: 'DEFENSIVE', DEFENSIVE: 'AGGRESSIVE' };
  return beats[cA] === cD ? 'A' : 'D';
}

/** Artifact effective-rating multiplier: 1 + artifactRatingBonus per equipped Named artifact. */
function artifactMult(side: DuelSide, cfg: Balance['duel']): number {
  return side.artifactId ? 1 + cfg.artifactRatingBonus : 1;
}

/** Effective (artifact-adjusted) ratings + A's power share — the odds base for a matchup. */
export function duelEffective(A: DuelSide, D: DuelSide, cfg: Balance['duel']): { effA: number; effD: number; shareA: number } {
  const effA = Math.max(1, A.rating) * artifactMult(A, cfg);
  const effD = Math.max(1, D.rating) * artifactMult(D, cfg);
  return { effA, effD, shareA: effA / (effA + effD) };
}

/** Combat stats derived from a side's effective rating (ATK + HP both scale with rating). */
export function duelStats(eff: number, cfg: Balance['duel']): DuelStats {
  return {
    atk: Math.round(cfg.atkBase + eff * cfg.atkPerRating),
    maxHp: Math.round(cfg.hpBase + eff * cfg.hpPerRating),
  };
}

/** Deterministic NPC stance for a side in a given exchange (used on timeout/offline). */
export function duelNpcCard(seed: string, round: number, side: 'A' | 'D'): DuelCard {
  const r = createRng(`${seed}/duel/round${round}`);
  const roll = r.fork(side === 'A' ? 'cardA' : 'cardD').next();
  return DUEL_CARDS[Math.min(DUEL_CARDS.length - 1, Math.floor(roll * DUEL_CARDS.length))];
}

/** Stance modifiers: how a card shapes outgoing/incoming damage this exchange. */
function cardMods(card: DuelCard, cfg: Balance['duel']): { atk: number; def: number } {
  if (card === 'AGGRESSIVE') return { atk: cfg.stance.aggressiveAtk, def: cfg.stance.aggressiveDef };
  if (card === 'DEFENSIVE') return { atk: cfg.stance.defensiveAtk, def: cfg.stance.defensiveDef };
  return { atk: 1, def: 1 }; // TRICK — neutral base; its edge comes from winning the RPS clash
}

/** One attacker's blow this exchange (pure; all rolls from the seeded stream `r`). */
function blow(
  by: 'A' | 'D',
  atkStats: DuelStats,
  atkCard: DuelCard,
  defCard: DuelCard,
  atkSide: DuelSide,
  clash: 'A' | 'D' | 'TIE',
  cfg: Balance['duel'],
  r: ReturnType<typeof createRng>,
): DuelBlow {
  const mine = cardMods(atkCard, cfg);
  const theirs = cardMods(defCard, cfg);
  const pressed = clash === by;
  const clashMult = pressed ? cfg.stance.clashWinAtk : clash === 'TIE' ? 1 : cfg.stance.clashLoseAtk;
  const crit = r.fork('crit').next() < cfg.critChance;
  const spellHit = !!atkSide.artifactId && r.fork('spell').next() < cfg.signatureProcChance;
  const variance = 1 - cfg.damageVariance + r.fork('var').next() * (2 * cfg.damageVariance);
  let dmg = atkStats.atk * mine.atk * theirs.def * clashMult * variance;
  if (crit) dmg *= cfg.critMult;
  if (spellHit) dmg *= cfg.spellMult;
  return {
    by,
    card: atkCard,
    dmg: Math.max(1, Math.round(dmg)),
    crit,
    pressed,
    ...(spellHit ? { spell: { side: by, label: atkSide.artifactName ?? (atkSide.artifactId as string) } } : {}),
  };
}

/**
 * Resolve ONE exchange given the FINAL stances both sides played. Both trade a
 * blow (the side with higher ATK — the "faster" Master — strikes first, so a KO
 * can pre-empt the counter). Applies damage to the passed-in HP and returns the
 * exchange beat + the new HP. Pure + deterministic on (seed, round, cards, stats).
 */
export function resolveDuelExchange(
  A: DuelSide,
  D: DuelSide,
  statsA: DuelStats,
  statsD: DuelStats,
  hpA: number,
  hpD: number,
  round: number,
  cA: DuelCard,
  cD: DuelCard,
  seed: string,
  cfg: Balance['duel'],
): DuelExchange {
  const r = createRng(`${seed}/duel/round${round}`);
  const clash = rps(cA, cD);
  // Initiative: the faster (higher-ATK) Master is likelier to strike first, but
  // it's a seeded roll (never a fixed A-wins-ties bias) so even matches are fair.
  const atkShareA = statsA.atk / (statsA.atk + statsD.atk);
  const aFirst = r.fork('init').next() < atkShareA;
  const order: ('A' | 'D')[] = aFirst ? ['A', 'D'] : ['D', 'A'];
  const blows: DuelBlow[] = [];
  let curHpA = hpA;
  let curHpD = hpD;
  for (const side of order) {
    if (curHpA <= 0 || curHpD <= 0) break; // a KO ends the exchange (no counter from the fallen)
    const b = side === 'A'
      ? blow('A', statsA, cA, cD, A, clash, cfg, r.fork('blowA'))
      : blow('D', statsD, cD, cA, D, clash, cfg, r.fork('blowD'));
    blows.push(b);
    if (side === 'A') curHpD = Math.max(0, curHpD - b.dmg);
    else curHpA = Math.max(0, curHpA - b.dmg);
  }
  const koA = curHpA <= 0;
  const koD = curHpD <= 0;
  return { round, cA, cD, blows, hpA: curHpA, hpD: curHpD, ...(koA ? { koA } : {}), ...(koD ? { koD } : {}) };
}

/**
 * Resolve a full duel to a KO (or the clock). `humanPicksA/D` supply any live
 * stance picks (missing ⇒ `duelNpcCard`). Returns the `exchanges[]` fight script
 * the animated overlay plays. Built from the same blocks the live round-driven
 * loop uses, so offline (auto) and online never disagree.
 */
export function resolveDuel(
  A: DuelSide,
  D: DuelSide,
  seed: string,
  humanPicksA: DuelPicks = {},
  humanPicksD: DuelPicks = {},
  cfg: Balance['duel'],
): DuelResult {
  const { effA, effD, shareA } = duelEffective(A, D, cfg);
  const statsA = duelStats(effA, cfg);
  const statsD = duelStats(effD, cfg);
  let hpA = statsA.maxHp;
  let hpD = statsD.maxHp;
  const exchanges: DuelExchange[] = [];
  let ending: 'KO' | 'CLOCK' = 'CLOCK';
  for (let round = 1; round <= cfg.maxExchanges; round++) {
    const cA = humanPicksA[round] ?? duelNpcCard(seed, round, 'A');
    const cD = humanPicksD[round] ?? duelNpcCard(seed, round, 'D');
    const ex = resolveDuelExchange(A, D, statsA, statsD, hpA, hpD, round, cA, cD, seed, cfg);
    exchanges.push(ex);
    hpA = ex.hpA;
    hpD = ex.hpD;
    if (ex.koA || ex.koD) { ending = 'KO'; break; }
  }
  // Winner: whoever is standing; on a double-KO or the clock, higher HP% (rating tiebreak).
  let winner: 'A' | 'D';
  if (hpA <= 0 && hpD <= 0) winner = shareA >= 0.5 ? 'A' : 'D';
  else if (hpD <= 0) winner = 'A';
  else if (hpA <= 0) winner = 'D';
  else {
    const shareHpA = hpA / statsA.maxHp;
    const shareHpD = hpD / statsD.maxHp;
    winner = shareHpA === shareHpD ? (shareA >= 0.5 ? 'A' : 'D') : shareHpA > shareHpD ? 'A' : 'D';
  }
  return { winner, exchanges, statsA, statsD, effA, effD, shareA, ending };
}

/**
 * The FLEE standing-order escape roll (docs/04 §7d). Returns whether the lone
 * Master escaped; a failed flee is caught into a forced duel at a penalty (the
 * caller applies `caughtPenalty` to the fleeing side's effective rating).
 */
export function resolveFlee(fleerRating: number, pursuerRating: number, seed: string, cfg: Balance['duel']): boolean {
  const r = createRng(`${seed}/flee`);
  const share = Math.max(1, fleerRating) / (Math.max(1, fleerRating) + Math.max(1, pursuerRating));
  const odds = Math.min(0.97, Math.max(0.15, cfg.flee.baseOdds * (0.6 + share * 0.8)));
  return r.next() < odds;
}
