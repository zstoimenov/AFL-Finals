import type { Game, Standing, Tip, Snapshot } from './types';
import {
  computeRatings,
  winProb,
  fixtureAdjustment,
  squiggleConsensusProb,
  SQUIGGLE_BLEND,
  HOME_ADVANTAGE
} from './predict';
import { gameStart, completedGames } from './features';

/**
 * Hindsight-free backtest harness. Replays completed home & away games, asks a
 * model for the probability it *would* have given before kickoff (built only from
 * earlier games), and scores it. Lets every new feature be proven to help before
 * it ships, rather than tuned by vibes.
 *
 * Metrics: hit-rate (share of correct favourites), Brier score and log-loss
 * (calibration + sharpness — lower is better for both).
 */
export interface EvalResult {
  n: number;
  hitRate: number;
  brier: number;
  logLoss: number;
}

/** A model: given games strictly before kickoff, return P(home team wins). */
export type PreGameModel = (priorGames: Game[], game: Game) => number;

/** Ladder rebuilt from completed H&A games (used by the model reconstructions). */
function buildStandings(games: Game[]): Standing[] {
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

/** The original three-term model (win ratio + log percentage + flat last-5 form). */
export const baselineModel: PreGameModel = (prior, game) => {
  const standings = buildStandings(prior);
  const ratings = new Map<number, number>();
  for (const s of standings) {
    const winRatio = s.pts / (s.played > 0 ? s.played * 4 : 1);
    const pctTerm = Math.log(Math.max(s.percentage, 40) / 100);
    const form = flatLast5Form(prior, s.id);
    ratings.set(s.id, 2.0 * (winRatio - 0.5) + 2.2 * pctTerm + 0.8 * (form - 0.5));
  }
  return clampProb(logistic(gap(ratings, game.hteamid, game.ateamid) + HOME_ADVANTAGE));
};

/** Enriched ratings only — margin/SOS + recency form — but no fixture context. */
export const ratingsOnlyModel: PreGameModel = (prior, game) => {
  const ratings = computeRatings(buildStandings(prior), prior);
  return winProb(ratings, game.hteamid, game.ateamid);
};

/** Full enriched model: enriched ratings + per-fixture context (matches the app). */
export const enrichedModel: PreGameModel = (prior, game) => {
  const ratings = computeRatings(buildStandings(prior), prior);
  return winProb(ratings, game.hteamid, game.ateamid, false, fixtureAdjustment(prior, game));
};

/**
 * The enriched model scoped to the target game's own season. On a single-season
 * corpus this is identical to `enrichedModel`; on a multi-season corpus it's the
 * fair baseline for the carry-over prior — both see the same within-season games,
 * so any difference is the prior's doing, not leakage from summing prior seasons
 * into this season's ladder.
 */
export const enrichedSeasonModel: PreGameModel = (prior, game) => {
  const season = prior.filter((g) => g.year === game.year);
  const ratings = computeRatings(buildStandings(season), season);
  return winProb(ratings, game.hteamid, game.ateamid, false, fixtureAdjustment(season, game));
};

/**
 * The shipped in-app model: season-scoped enriched ratings shrunk toward the
 * cross-season carry-over prior built from earlier seasons. This is what
 * `computeRatings({ history })` does in the app; evaluating it here on a
 * multi-season corpus is how the prior earns (or loses) its place.
 */
export const priorAwareModel: PreGameModel = (prior, game) => {
  const season = prior.filter((g) => g.year === game.year);
  const history = prior.filter((g) => g.year < game.year);
  const ratings = computeRatings(buildStandings(season), season, { history });
  return winProb(ratings, game.hteamid, game.ateamid, false, fixtureAdjustment(season, game));
};

/**
 * The shipped model: enriched model blended with the Squiggle consensus (from the
 * pre-game tips) at `blend`. The tip for a past game is its frozen pre-game
 * prediction, so looking it up here stays hindsight-free.
 */
export function blendedModel(tips: Tip[], blend = SQUIGGLE_BLEND): PreGameModel {
  return (prior, game) => {
    const model = enrichedModel(prior, game);
    const snap = { games: prior, standings: [], tips } as unknown as Snapshot;
    const consensus = squiggleConsensusProb(snap, game.hteamid, game.ateamid);
    if (consensus == null) return model;
    return Math.min(0.97, Math.max(0.03, (1 - blend) * model + blend * consensus));
  };
}

/** Score a model over every completed H&A game with enough prior history. */
export function evaluate(
  games: Game[],
  model: PreGameModel,
  opts: { warmupGames?: number } = {}
): EvalResult {
  const warmup = opts.warmupGames ?? 30; // skip the noisy opening rounds
  const played = completedGames(games).filter((g) => g.is_final === 0);
  let n = 0;
  let hits = 0;
  let decisive = 0;
  let brier = 0;
  let logLoss = 0;
  for (let i = 0; i < played.length; i++) {
    const game = played[i];
    const cutoff = gameStart(game);
    const prior = games.filter((g) => gameStart(g) < cutoff);
    if (completedGames(prior).filter((g) => g.is_final === 0).length < warmup) continue;
    const p = clampProb(model(prior, game));
    const homeWon = game.hscore! > game.ascore!;
    const draw = game.hscore! === game.ascore!;
    const actual = draw ? 0.5 : homeWon ? 1 : 0;
    brier += (p - actual) ** 2;
    logLoss += -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
    if (!draw) {
      decisive++;
      if ((p > 0.5) === homeWon) hits++;
    }
    n++;
  }
  return {
    n,
    hitRate: decisive > 0 ? hits / decisive : 0,
    brier: n > 0 ? brier / n : 0,
    logLoss: n > 0 ? logLoss / n : 0
  };
}

function flatLast5Form(games: Game[], teamId: number, nGames = 5): number {
  const played = completedGames(games)
    .filter((g) => g.hteamid === teamId || g.ateamid === teamId)
    .slice(-nGames);
  if (played.length === 0) return 0.5;
  let score = 0;
  for (const g of played) {
    if (g.hscore === g.ascore) score += 0.5;
    else if ((g.hscore! > g.ascore! ? g.hteamid : g.ateamid) === teamId) score += 1;
  }
  return score / played.length;
}

function gap(ratings: Map<number, number>, homeId: number, awayId: number): number {
  return (ratings.get(homeId) ?? 0) - (ratings.get(awayId) ?? 0);
}
function logistic(x: number): number {
  return 1 / (1 + Math.exp(-1.1 * x));
}
function clampProb(p: number): number {
  return Math.min(0.97, Math.max(0.03, p));
}
