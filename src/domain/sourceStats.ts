import type { EvalResult } from './backtest';
import type { Game, TipsterCorpus } from './types';

/**
 * Every tipping model graded separately, and where the app's own model lands
 * among them.
 *
 * The hub already grades the app against Squiggle's consensus, but that is a
 * softer bar than it looks: a consensus is the average of thirty models,
 * including the weak ones, so beating it is not the same as being good. Scoring
 * each model on its own turns "we beat the average" into "we finished eighth of
 * thirty-one", which is the honest version of the same claim — and it names the
 * models actually worth paying attention to.
 *
 * No hindsight is involved. Squiggle publishes these tips before each game, so
 * grading them against the result afterwards uses only what was known at
 * kickoff — the same assumption the consensus scorecard already rests on.
 */

export interface SourceScore extends EvalResult {
  id: number;
  name: string;
}

/** A completed game with a winner, keyed by id, that a tip can be scored on. */
function scorableGames(games: Game[]): Map<number, Game> {
  return new Map(
    games
      .filter((g) => g.complete && g.hscore != null && g.ascore != null)
      .map((g) => [g.id, g])
  );
}

/**
 * Grade every model over the completed games, best Brier first.
 *
 * Scored exactly the way `backtest.evaluate` scores the app's own model — same
 * probability clamp, same treatment of draws (excluded from hit rate, scored
 * against 0.5 for Brier and log loss) — because the whole point is to read these
 * numbers next to the app's on one screen. Diverge here and the comparison
 * quietly becomes meaningless.
 *
 * A model is judged only on the games it actually tipped, so one that joined
 * mid-season is not punished for the rounds it missed. `n` is reported alongside
 * because a strong record over six games is not a strong record.
 */
export function scoreSources(
  corpus: TipsterCorpus | null,
  games: Game[],
  opts: { minTips?: number } = {}
): SourceScore[] {
  if (!corpus) return [];
  const played = scorableGames(games);
  const names = new Map(corpus.sources.map((s) => [s.id, s.name]));
  const tally = new Map<
    number,
    { n: number; decisive: number; hits: number; brier: number; logLoss: number }
  >();

  for (const tip of corpus.tips) {
    const game = played.get(tip.g);
    if (!game) continue;
    const homeWon = (game.hscore as number) > (game.ascore as number);
    const draw = game.hscore === game.ascore;
    const actual = draw ? 0.5 : homeWon ? 1 : 0;
    const p = Math.min(0.97, Math.max(0.03, tip.p));

    const row = tally.get(tip.s) ?? { n: 0, decisive: 0, hits: 0, brier: 0, logLoss: 0 };
    row.n += 1;
    row.brier += (p - actual) ** 2;
    row.logLoss += -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
    if (!draw) {
      row.decisive += 1;
      if (p > 0.5 === homeWon) row.hits += 1;
    }
    tally.set(tip.s, row);
  }

  const min = opts.minTips ?? 1;
  return [...tally.entries()]
    .filter(([, r]) => r.n >= min)
    .map(([id, r]) => ({
      id,
      name: names.get(id) ?? `Model ${id}`,
      n: r.n,
      hitRate: r.decisive > 0 ? r.hits / r.decisive : 0,
      brier: r.brier / r.n,
      logLoss: r.logLoss / r.n
    }))
    .sort((a, b) => a.brier - b.brier || b.n - a.n);
}

/**
 * Where a Brier score would place in a ranked field, 1-based, and how big that
 * field is. Ties place a score above the models it equals, which is the reading
 * that cannot flatter: matching the best model is second, not first.
 */
export interface Placing {
  place: number;
  of: number;
}

export function placeAmong(scores: SourceScore[], brier: number): Placing | null {
  if (scores.length === 0) return null;
  const notWorse = scores.filter((s) => s.brier <= brier).length;
  return { place: notWorse + 1, of: scores.length + 1 };
}

/**
 * The single best model of the season, when the field is big enough for that to
 * mean anything. Used to say who actually won the year, rather than only how the
 * app did against the crowd.
 */
export function bestSource(scores: SourceScore[]): SourceScore | null {
  return scores[0] ?? null;
}
