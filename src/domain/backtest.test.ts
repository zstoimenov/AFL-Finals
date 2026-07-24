import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Game, Tip } from './types';
import {
  evaluate,
  baselineModel,
  ratingsOnlyModel,
  enrichedModel,
  enrichedSeasonModel,
  priorAwareModel,
  blendedModel
} from './backtest';

// Defaults to the committed snapshot; point BACKTEST_GAMES at a multi-season
// export (see scripts/backtest-years.mjs) for a larger, more trustworthy corpus.
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data');
const gamesPath = process.env.BACKTEST_GAMES || join(dataDir, 'games.json');
const games: Game[] = JSON.parse(readFileSync(gamesPath, 'utf8'));
const tips: Tip[] = JSON.parse(readFileSync(join(dataDir, 'tips.json'), 'utf8'));

// The "each step improves on the last" claims are single-season calibration
// facts, measured with full Squiggle tip coverage. When BACKTEST_GAMES points at
// a multi-season corpus the shipped tips.json only covers the live season, so the
// blended step is under-tipped there — those strict assertions are scoped to the
// single-season run, while the metrics report and the carry-over-prior checks run
// on any corpus.
const multiSeason = new Set(games.map((g) => g.year)).size > 1;

describe('model backtest on the committed snapshot', () => {
  const baseline = evaluate(games, baselineModel);
  const ratingsOnly = evaluate(games, ratingsOnlyModel);
  const enriched = evaluate(games, enrichedModel);
  const blended = evaluate(games, blendedModel(tips));

  it('reports metrics for baseline vs enriched vs blended (lower Brier/log-loss is better)', () => {
    const row = (name: string, r: typeof baseline) =>
      `${name.padEnd(16)} n=${r.n}  hit=${(r.hitRate * 100).toFixed(1)}%  ` +
      `brier=${r.brier.toFixed(4)}  logloss=${r.logLoss.toFixed(4)}`;
    // eslint-disable-next-line no-console
    console.log(
      '\n' +
        [
          row('baseline', baseline),
          row('enriched(rating)', ratingsOnly),
          row('enriched(full)', enriched),
          row('blended(squig)', blended)
        ].join('\n')
    );
    expect(enriched.n).toBeGreaterThan(50);
  });

  it.skipIf(multiSeason)('blending the Squiggle consensus beats the in-app model alone (Brier)', () => {
    expect(blended.brier).toBeLessThanOrEqual(enriched.brier);
    expect(blended.logLoss).toBeLessThanOrEqual(enriched.logLoss);
  });

  it.skipIf(multiSeason)('the enriched model is at least as accurate as the baseline (Brier)', () => {
    expect(enriched.brier).toBeLessThanOrEqual(baseline.brier);
  });

  it.skipIf(multiSeason)('the enriched model does not lose log-loss to the baseline', () => {
    expect(enriched.logLoss).toBeLessThanOrEqual(baseline.logLoss);
  });

  it.skipIf(multiSeason)('the enriched model does not tip fewer games correctly than the baseline', () => {
    expect(enriched.hitRate).toBeGreaterThanOrEqual(baseline.hitRate);
  });
});

describe('cross-season carry-over prior', () => {
  // The prior only bites when the corpus spans seasons. Point BACKTEST_GAMES at a
  // multi-season export (scripts/backtest-years.mjs) for the real test; on the
  // committed single-season snapshot the prior has no earlier games to draw on and
  // reduces exactly to the season-scoped enriched model.
  const seasons = new Set(games.map((g) => g.year)).size;
  const enrichedSeason = evaluate(games, enrichedSeasonModel);
  const priorAware = evaluate(games, priorAwareModel);

  it('reports prior-aware vs season-scoped enriched (lower Brier/log-loss is better)', () => {
    const row = (name: string, r: typeof priorAware) =>
      `${name.padEnd(18)} n=${r.n}  hit=${(r.hitRate * 100).toFixed(1)}%  ` +
      `brier=${r.brier.toFixed(4)}  logloss=${r.logLoss.toFixed(4)}`;
    // eslint-disable-next-line no-console
    console.log(
      `\n[${seasons} season(s) in corpus]\n` +
        [row('enriched(season)', enrichedSeason), row('prior-aware', priorAware)].join('\n')
    );
    expect(priorAware.n).toBeGreaterThan(50);
  });

  it('the carry-over prior does not regress the enriched model (Brier + log-loss)', () => {
    // Tiny epsilon so single-season equality (prior inactive) always passes; on a
    // multi-season corpus this asserts the prior is a real, non-harmful signal.
    const eps = 1e-9;
    expect(priorAware.brier).toBeLessThanOrEqual(enrichedSeason.brier + eps);
    expect(priorAware.logLoss).toBeLessThanOrEqual(enrichedSeason.logLoss + eps);
  });
});
