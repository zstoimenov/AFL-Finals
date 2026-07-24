import type { Game, Snapshot, Standing } from './types';
import {
  gameStart,
  opponentAdjustedMargins,
  recencyForm,
  headToHead,
  restDays
} from './features';
import { homeVenuesByTeam, isAwayTravelling, isHostAtHome } from './venues';

/**
 * Transparent team rating: a readable blend of season win ratio, percentage
 * (log-scaled), recency-weighted form and an opponent-adjusted margin term that
 * folds in strength of schedule. Scale roughly [-2.5, +2.5]; the logistic in
 * `winProb` turns a rating gap into a win probability. Every weight is a named
 * constant so the model stays inspectable and the backtest can justify each one.
 */
export const RATING_WEIGHTS = {
  winRatio: 1.2,
  percentage: 1.3,
  form: 0.7,
  margin: 1.0
} as const;
/** Points of opponent-adjusted margin per 1.0 of rating. */
export const MARGIN_SCALE = 26;

export function computeRatings(standings: Standing[], games: Game[]): Map<number, number> {
  const strength = opponentAdjustedMargins(games);
  const ratings = new Map<number, number>();
  for (const s of standings) {
    const maxPts = s.played > 0 ? s.played * 4 : 1;
    const winRatio = s.pts / maxPts;
    const pctTerm = Math.log(Math.max(s.percentage, 40) / 100);
    const form = recencyForm(games, s.id);
    const margin = clamp((strength.get(s.id) ?? 0) / MARGIN_SCALE, -1.5, 1.5);
    const rating =
      RATING_WEIGHTS.winRatio * (winRatio - 0.5) +
      RATING_WEIGHTS.percentage * pctTerm +
      RATING_WEIGHTS.form * (form - 0.5) +
      RATING_WEIGHTS.margin * margin;
    ratings.set(s.id, rating);
  }
  return ratings;
}

/** Home-ground advantage as a rating bump (≈ +6% win prob at even ratings). */
export const HOME_ADVANTAGE = 0.25;

/**
 * Per-fixture context weights, layered on top of the flat home bump.
 *
 * Weights are set from the backtest harness (`backtest.ts`), not by feel. On the
 * 2026-to-date corpus, the interstate-travel term clearly improved calibration
 * (Brier and log-loss) while holding tip accuracy; the head-to-head, rest-day and
 * neutral-host terms did **not** improve single-season accuracy, so they ship at
 * weight 0 — fully implemented and unit-tested, ready to enable once a
 * multi-season backtest (`scripts/backtest-years.mjs`) justifies them. Setting a
 * weight non-zero activates the term; nothing else needs to change.
 */
export const CONTEXT: { travel: number; hostNeutral: number; h2h: number; rest: number } = {
  /** extra edge to the host when the away side is playing away from its grounds */
  travel: 0.2,
  /** claw back part of the home bump when the "home" side isn't at its own venue */
  hostNeutral: 0,
  /** weight on the head-to-head signal (roughly [-1, 1]) */
  h2h: 0,
  /** weight on the rest-day differential (normalised to ~[-1, 1]) */
  rest: 0
};

/**
 * Match-specific rating-gap adjustment beyond the flat home bump: interstate
 * travel, a genuinely neutral "home" venue, recent head-to-head, and the rest
 * differential. All derived from `games` (pass only pre-kickoff games to keep a
 * prediction hindsight-free). Positive favours the home side. Each term is gated
 * by its `CONTEXT` weight, so disabled terms cost nothing.
 */
export function fixtureAdjustment(games: Game[], game: Game): number {
  const homeVenues = homeVenuesByTeam(games);
  let d = 0;
  if (CONTEXT.travel && isAwayTravelling(homeVenues, game)) d += CONTEXT.travel;
  if (CONTEXT.hostNeutral && !isHostAtHome(homeVenues, game)) d -= CONTEXT.hostNeutral;
  if (CONTEXT.h2h) d += CONTEXT.h2h * headToHead(games, game.hteamid, game.ateamid);
  if (CONTEXT.rest) {
    const start = gameStart(game);
    const restH = restDays(games, game.hteamid, start);
    const restA = restDays(games, game.ateamid, start);
    if (restH != null && restA != null) {
      d += CONTEXT.rest * clamp((restH - restA) / 7, -1, 1);
    }
  }
  return d;
}

/**
 * P(home wins) from the rating gap via a logistic curve.
 * `neutral` disables the flat home advantage (Grand Final at the MCG).
 * `contextDelta` adds per-fixture effects (travel, head-to-head, rest).
 */
export function winProb(
  ratings: Map<number, number>,
  homeId: number,
  awayId: number,
  neutral = false,
  contextDelta = 0
): number {
  const rh = ratings.get(homeId) ?? 0;
  const ra = ratings.get(awayId) ?? 0;
  const gap = rh - ra + (neutral ? 0 : HOME_ADVANTAGE) + contextDelta;
  const p = 1 / (1 + Math.exp(-1.1 * gap));
  return Math.min(0.97, Math.max(0.03, p));
}

/**
 * P(home wins) for a real fixture with full context folded in. `games` supplies
 * the history the context is drawn from — pass pre-kickoff games only for a
 * hindsight-free number.
 */
export function fixtureHomeProb(
  ratings: Map<number, number>,
  games: Game[],
  game: Game
): number {
  return winProb(ratings, game.hteamid, game.ateamid, false, fixtureAdjustment(games, game));
}

/** Squiggle consensus P(home wins) for a fixture, if models have tipped it. */
export function squiggleProb(
  snapshot: Snapshot,
  homeId: number,
  awayId: number
): number | null {
  const tip = snapshot.tips.find(
    (t) =>
      (t.hteamid === homeId && t.ateamid === awayId) ||
      (t.hteamid === awayId && t.ateamid === homeId)
  );
  if (!tip) return null;
  return tip.hteamid === homeId ? tip.hconfidence : 1 - tip.hconfidence;
}

/** Squiggle consensus predicted margin from `homeId`'s perspective, if tipped. */
export function squiggleMargin(
  snapshot: Snapshot,
  homeId: number,
  awayId: number
): number | null {
  const tip = snapshot.tips.find(
    (t) =>
      (t.hteamid === homeId && t.ateamid === awayId) ||
      (t.hteamid === awayId && t.ateamid === homeId)
  );
  if (!tip || tip.hmargin == null) return null;
  return tip.hteamid === homeId ? tip.hmargin : -tip.hmargin;
}

/** Points of predicted margin ≈ one logistic unit when converting to a probability. */
export const MARGIN_PROB_SCALE = 21;
/**
 * How much the shipped win probability leans on the Squiggle consensus versus the
 * in-app model. The backtest harness shows the 31-model consensus is sharper than
 * the in-app model alone, and a ~50/50 blend captures most of that accuracy while
 * keeping the app's own model a genuine, equal contributor.
 */
export const SQUIGGLE_BLEND = 0.5;

/**
 * Squiggle consensus P(home wins), preferring the predicted margin (richer) and
 * falling back to the consensus confidence. Null when the game isn't tipped.
 */
export function squiggleConsensusProb(
  snapshot: Snapshot,
  homeId: number,
  awayId: number
): number | null {
  const margin = squiggleMargin(snapshot, homeId, awayId);
  if (margin != null) return 1 / (1 + Math.exp(-margin / MARGIN_PROB_SCALE));
  return squiggleProb(snapshot, homeId, awayId);
}

/**
 * The app's shipped fixture probability: the in-app model blended with the
 * Squiggle consensus when the game is tipped, else the model alone. `games`
 * supplies the history the model context is drawn from — pass pre-kickoff games
 * only for a hindsight-free number.
 */
export function blendedHomeProb(
  snapshot: Snapshot,
  ratings: Map<number, number>,
  games: Game[],
  game: Game
): number {
  const model = fixtureHomeProb(ratings, games, game);
  const consensus = squiggleConsensusProb(snapshot, game.hteamid, game.ateamid);
  if (consensus == null) return model;
  const p = (1 - SQUIGGLE_BLEND) * model + SQUIGGLE_BLEND * consensus;
  return Math.min(0.97, Math.max(0.03, p));
}

/**
 * Rebuild the ladder from every completed home & away game that started before
 * `cutoff`, so a finished game can be scored on the rating the model *would*
 * have had going in — not one that already knows the result.
 */
function standingsBefore(games: Game[], cutoff: number): Standing[] {
  const table = new Map<number, Standing>();
  const row = (id: number): Standing => {
    let s = table.get(id);
    if (!s) {
      s = { id, rank: 0, played: 0, wins: 0, losses: 0, draws: 0, pts: 0, percentage: 100, for: 0, against: 0 };
      table.set(id, s);
    }
    return s;
  };
  for (const g of games) {
    if (g.is_final !== 0 || !g.complete || g.hscore == null || g.ascore == null) continue;
    if (gameStart(g) >= cutoff) continue;
    const h = row(g.hteamid);
    const a = row(g.ateamid);
    h.played++; a.played++;
    h.for += g.hscore; h.against += g.ascore;
    a.for += g.ascore; a.against += g.hscore;
    if (g.hscore > g.ascore) { h.wins++; a.losses++; h.pts += 4; }
    else if (g.ascore > g.hscore) { a.wins++; h.losses++; a.pts += 4; }
    else { h.draws++; a.draws++; h.pts += 2; a.pts += 2; }
  }
  for (const s of table.values()) {
    s.percentage = s.against > 0 ? (s.for / s.against) * 100 : 100;
  }
  return [...table.values()];
}

/**
 * The in-app model's P(home wins) as it would have stood before a given game —
 * built from results, ratings and fixture context up to kickoff only. Lets a
 * completed fixture show whether the model's pre-game tip actually came off,
 * without hindsight leaking this game's result into its own prediction.
 */
export function preGameHomeProb(snapshot: Snapshot, game: Game): number {
  const cutoff = gameStart(game);
  const prior = snapshot.games.filter((g) => gameStart(g) < cutoff);
  const ratings = computeRatings(standingsBefore(prior, cutoff), prior);
  // Pure in-app model (no Squiggle blend): the completed-game verdict compares
  // the two independent tipsters, so this stays the model's own call.
  return winProb(ratings, game.hteamid, game.ateamid, false, fixtureAdjustment(prior, game));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
