import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Game, Tip } from './types';
import { evaluate, baselineModel, ratingsOnlyModel, enrichedModel, blendedModel } from './backtest';

// Defaults to the committed snapshot; point BACKTEST_GAMES at a multi-season
// export (see scripts/backtest-years.mjs) for a larger, more trustworthy corpus.
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data');
const gamesPath = process.env.BACKTEST_GAMES || join(dataDir, 'games.json');
const games: Game[] = JSON.parse(readFileSync(gamesPath, 'utf8'));
const tips: Tip[] = JSON.parse(readFileSync(join(dataDir, 'tips.json'), 'utf8'));

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

  it('blending the Squiggle consensus beats the in-app model alone (Brier)', () => {
    expect(blended.brier).toBeLessThanOrEqual(enriched.brier);
    expect(blended.logLoss).toBeLessThanOrEqual(enriched.logLoss);
  });

  it('the enriched model is at least as accurate as the baseline (Brier)', () => {
    expect(enriched.brier).toBeLessThanOrEqual(baseline.brier);
  });

  it('the enriched model does not lose log-loss to the baseline', () => {
    expect(enriched.logLoss).toBeLessThanOrEqual(baseline.logLoss);
  });

  it('the enriched model does not tip fewer games correctly than the baseline', () => {
    expect(enriched.hitRate).toBeGreaterThanOrEqual(baseline.hitRate);
  });
});
