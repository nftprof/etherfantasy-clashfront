/**
 * HERO-vs-HERO CARD DUEL — deterministic resolution core (docs/briefs/HERO-DUEL-SPEC.md,
 * decision 14; element-free, docs/maps/MASTERS-ELEMENT-FREE-RULING.md).
 *
 * v1 is a CARD game, NOT a skill fight. A best-of-3 rock-paper-scissors where a
 * Master's RATING dominates (via per-round INITIATIVE — the stronger general
 * dictates the exchange) and equipped Named artifacts are the wildcard. It
 * AUTO-RESOLVES (offline Masters handled, instant settlement); an ONLINE player
 * may override a round with their own card pick, else an NPC auto-picks.
 *
 * PURE + DETERMINISTIC: same (inputs, seed, humanPicks) ⇒ same result forever
 * (AGENTS.md directive 6 — no Math.random/Date.now; all randomness from the
 * injected seed via the shared createRng/mulberry32 stream). CF owns resolution
 * so online and auto never disagree; a genuinely skill-decided LIVE 1v1 on the
 * battle engine is a deferred, separate version.
 */
import { createRng, type Balance } from '@clashfront/shared';

export type DuelCard = 'AGGRESSIVE' | 'TRICK' | 'DEFENSIVE';
export const DUEL_CARDS: readonly DuelCard[] = ['AGGRESSIVE', 'TRICK', 'DEFENSIVE'];

/** One duelist's inputs. `rating` = f(level, fame) computed by the caller (element-free). */
export interface DuelSide {
  /** Reference id (masterId/hero_… ) — carried through, never affects odds. */
  ref: string;
  name: string;
  /** Base power input. Higher rating ⇒ more per-round initiative + tie edge. */
  rating: number;
  /** Equipped Named artifact (data/singulars.json artifacts[].id), if any — the wildcard. */
  artifactId?: string;
  /** Display name for the artifact, surfaced in the war report on a proc. */
  artifactName?: string;
}

/** Human card picks per round, 1-indexed. A missing round ⇒ NPC auto-picks that round. */
export type DuelPicks = Partial<Record<number, DuelCard>>;

/** Why a round was decided (for the war-report reveal + tuning). */
export type DuelReason = 'CLASH' | 'INITIATIVE' | 'RATING' | 'PROC';

export interface DuelRound {
  round: number;             // 1..3
  cA: DuelCard;              // card side A played (human pick or NPC)
  cD: DuelCard;              // card side D played
  by: 'A' | 'D';            // who took the round
  reason: DuelReason;        // how it was decided (drives the reveal text)
  /** Set when a Named artifact flared this round. */
  proc?: { side: 'A' | 'D'; artifactId: string; label: string };
}

export interface DuelResult {
  winner: 'A' | 'D';
  rounds: DuelRound[];       // the replay script — drives the card-reveal UI
  effA: number;              // A's artifact-adjusted effective rating
  effD: number;
  shareA: number;            // effA / (effA + effD) — A's win-share input
}

/** RPS: AGGRESSIVE beats TRICK beats DEFENSIVE beats AGGRESSIVE. */
function rps(cA: DuelCard, cD: DuelCard): 'A' | 'D' | 'TIE' {
  if (cA === cD) return 'TIE';
  const beats: Record<DuelCard, DuelCard> = {
    AGGRESSIVE: 'TRICK',
    TRICK: 'DEFENSIVE',
    DEFENSIVE: 'AGGRESSIVE',
  };
  return beats[cA] === cD ? 'A' : 'D';
}

/** Artifact effective-rating multiplier: 1 + artifactRatingBonus per equipped Named artifact. */
function artifactMult(side: DuelSide, cfg: Balance['duel']): number {
  return side.artifactId ? 1 + cfg.artifactRatingBonus : 1;
}

/** A weak Master reads randomly; a strong one seizes the exchange more often. */
function initiativeProb(share: number, cfg: Balance['duel']): number {
  return Math.min(0.95, cfg.readBase + share * cfg.readRatingSpan);
}

/** Deterministic NPC card pick (uniform among the three — rating is expressed via initiative, not card bias). */
function npcPick(roll: number): DuelCard {
  return DUEL_CARDS[Math.min(DUEL_CARDS.length - 1, Math.floor(roll * DUEL_CARDS.length))];
}

/** Effective (artifact-adjusted) ratings + A's win-share — the odds base for a matchup. */
export function duelEffective(A: DuelSide, D: DuelSide, cfg: Balance['duel']): { effA: number; effD: number; shareA: number } {
  const effA = Math.max(1, A.rating) * artifactMult(A, cfg);
  const effD = Math.max(1, D.rating) * artifactMult(D, cfg);
  return { effA, effD, shareA: effA / (effA + effD) };
}

/**
 * The deterministic NPC card for a side in a given round — the auto-pick used
 * when no online human picks in time. The live server MUST use this so an
 * offline (auto) duel and an online (round-driven) duel with the same non-picks
 * produce byte-identical outcomes.
 */
export function duelNpcCard(seed: string, round: number, side: 'A' | 'D'): DuelCard {
  const r = createRng(`${seed}/duel/round${round}`);
  return npcPick(r.fork(side === 'A' ? 'cardA' : 'cardD').next());
}

/**
 * Resolve ONE round given the FINAL cards both sides played (already decided:
 * human pick or `duelNpcCard`). Order — each stage draws an independent,
 * order-stable child stream so branches never desync:
 *   1. artifact signature proc (each side, low prob) — a lone proc takes the round
 *   2. initiative (rating) — a lone seize dictates the exchange, taking the round
 *   3. cards decide (RPS); a tie → higher effective rating ± ratingSwing
 * Pure + deterministic on (seed, round, cards, ratings, cfg).
 */
export function resolveDuelRound(
  A: DuelSide,
  D: DuelSide,
  shareA: number,
  round: number,
  cA: DuelCard,
  cD: DuelCard,
  seed: string,
  cfg: Balance['duel'],
): DuelRound {
  const r = createRng(`${seed}/duel/round${round}`);

  // 1. artifact signature proc
  const procA = !!A.artifactId && r.fork('procA').next() < cfg.signatureProcChance;
  const procD = !!D.artifactId && r.fork('procD').next() < cfg.signatureProcChance;
  if (procA !== procD) {
    const side = procA ? 'A' : 'D';
    const who = procA ? A : D;
    return {
      round, cA, cD, by: side, reason: 'PROC',
      proc: { side, artifactId: who.artifactId as string, label: who.artifactName ?? (who.artifactId as string) },
    };
  }

  // 2. initiative (rating dominates here)
  const seizeA = r.fork('initA').next() < initiativeProb(shareA, cfg);
  const seizeD = r.fork('initD').next() < initiativeProb(1 - shareA, cfg);
  if (seizeA !== seizeD) {
    return { round, cA, cD, by: seizeA ? 'A' : 'D', reason: 'INITIATIVE' };
  }

  // 3. cards decide
  const clash = rps(cA, cD);
  if (clash !== 'TIE') return { round, cA, cD, by: clash, reason: 'CLASH' };

  // tie → effective rating with a bounded swing so the underdog can steal it
  const swing = (r.fork('swing').next() * 2 - 1) * cfg.ratingSwing; // ±ratingSwing
  return { round, cA, cD, by: shareA + swing >= 0.5 ? 'A' : 'D', reason: 'RATING' };
}

/**
 * Resolve a full best-of-3 card duel. `humanPicksA/D` supply any live card picks
 * (missing rounds ⇒ `duelNpcCard`). The returned `rounds[]` is the deterministic
 * replay script the card UI reveals beat-by-beat. Stops at the first side to
 * reach 2. Built from the same blocks the live round-driven loop uses, so the
 * offline (auto) and online (round-driven) paths can never disagree.
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
  const rounds: DuelRound[] = [];
  let winsA = 0;
  let winsD = 0;
  for (let round = 1; round <= 3; round++) {
    const cA = humanPicksA[round] ?? duelNpcCard(seed, round, 'A');
    const cD = humanPicksD[round] ?? duelNpcCard(seed, round, 'D');
    const res = resolveDuelRound(A, D, shareA, round, cA, cD, seed, cfg);
    rounds.push(res);
    if (res.by === 'A') winsA++;
    else winsD++;
    if (winsA === 2 || winsD === 2) break;
  }
  return { winner: winsA > winsD ? 'A' : 'D', rounds, effA, effD, shareA };
}

/**
 * The FLEE standing-order escape roll (docs/04 §7d). Returns whether the lone
 * Master escaped; a failed flee is caught into a forced duel at a penalty (the
 * caller applies `caughtPenalty` to the fleeing side's effective rating).
 */
export function resolveFlee(fleerRating: number, pursuerRating: number, seed: string, cfg: Balance['duel']): boolean {
  const r = createRng(`${seed}/flee`);
  // Base odds, tilted by the rating gap (a faster/stronger Master escapes more often).
  const share = Math.max(1, fleerRating) / (Math.max(1, fleerRating) + Math.max(1, pursuerRating));
  const odds = Math.min(0.97, Math.max(0.15, cfg.flee.baseOdds * (0.6 + share * 0.8)));
  return r.next() < odds;
}
