import { describe, expect, it } from 'vitest';
import { bestSource, placeAmong, scoreSources } from './sourceStats';
import { evaluate } from './backtest';
import type { Game, SourceTip, TipsterCorpus } from './types';

let nextId = 1;
function played(h: number, a: number, hscore: number, ascore: number): Game {
  return {
    id: nextId++,
    round: 5,
    year: 2026,
    complete: 100,
    hteamid: h,
    ateamid: a,
    hscore,
    ascore,
    date: '2026-05-01 19:40:00',
    unixtime: 1777000000 + nextId * 86400,
    venue: 'M.C.G.',
    is_final: 0,
    winnerteamid: hscore > ascore ? h : ascore > hscore ? a : null
  };
}

function corpus(tips: SourceTip[]): TipsterCorpus {
  return {
    sources: [
      { id: 1, name: 'Sharp' },
      { id: 2, name: 'Blunt' }
    ],
    tips
  };
}

describe('scoreSources', () => {
  const games = [played(10, 20, 100, 60), played(30, 40, 50, 90)];
  const [homeWin, awayWin] = games;

  it('ranks the model that was more confidently right first', () => {
    const scores = scoreSources(
      corpus([
        { g: homeWin.id, s: 1, p: 0.9 },
        { g: awayWin.id, s: 1, p: 0.1 },
        { g: homeWin.id, s: 2, p: 0.55 },
        { g: awayWin.id, s: 2, p: 0.45 }
      ]),
      games
    );
    expect(scores.map((s) => s.name)).toEqual(['Sharp', 'Blunt']);
    expect(scores[0].hitRate).toBe(1);
    expect(scores[1].hitRate).toBe(1);
    // both tipped every game correctly; only conviction separates them
    expect(scores[0].brier).toBeLessThan(scores[1].brier);
  });

  it('judges a model only on the games it tipped', () => {
    const scores = scoreSources(
      corpus([
        { g: homeWin.id, s: 1, p: 0.8 },
        { g: awayWin.id, s: 1, p: 0.2 },
        { g: homeWin.id, s: 2, p: 0.8 }
      ]),
      games
    );
    expect(scores.find((s) => s.name === 'Sharp')?.n).toBe(2);
    expect(scores.find((s) => s.name === 'Blunt')?.n).toBe(1);
  });

  it('can require a minimum sample before a model is ranked at all', () => {
    const scores = scoreSources(
      corpus([
        { g: homeWin.id, s: 1, p: 0.8 },
        { g: awayWin.id, s: 1, p: 0.2 },
        { g: homeWin.id, s: 2, p: 0.99 }
      ]),
      games,
      { minTips: 2 }
    );
    // a single lucky tip must not top the table
    expect(scores.map((s) => s.name)).toEqual(['Sharp']);
  });

  it('ignores tips on games that have not been played', () => {
    const scores = scoreSources(corpus([{ g: 9999, s: 1, p: 0.9 }]), games);
    expect(scores).toEqual([]);
  });

  it('is empty when no tipster corpus is deployed', () => {
    // a build older than tipsters.json shows no leaderboard, not a broken one
    expect(scoreSources(null, games)).toEqual([]);
  });

  it('scores a game the same way the backtest harness does', () => {
    // the leaderboard sits next to the app's own numbers, so an identical tip
    // must produce identical metrics — otherwise the comparison is meaningless
    const flat = 0.75;
    const harness = evaluate(games, () => flat, { warmupGames: 0 });
    const scores = scoreSources(
      corpus(games.map((g) => ({ g: g.id, s: 1, p: flat }))),
      games
    );
    expect(scores[0].n).toBe(harness.n);
    expect(scores[0].brier).toBeCloseTo(harness.brier, 10);
    expect(scores[0].logLoss).toBeCloseTo(harness.logLoss, 10);
    expect(scores[0].hitRate).toBeCloseTo(harness.hitRate, 10);
  });

  it('excludes a draw from hit rate but still scores it', () => {
    const drawn = [played(1, 2, 80, 80)];
    const scores = scoreSources(corpus([{ g: drawn[0].id, s: 1, p: 0.5 }]), drawn);
    expect(scores[0].n).toBe(1);
    expect(scores[0].hitRate).toBe(0);
    expect(scores[0].brier).toBeCloseTo(0, 10);
  });
});

describe('placeAmong', () => {
  const scores = scoreSources(
    corpus([
      { g: 1, s: 1, p: 0.9 },
      { g: 1, s: 2, p: 0.6 }
    ]),
    [{ ...played(10, 20, 100, 60), id: 1 }]
  );

  it('places a score against the field, counting itself in the total', () => {
    expect(placeAmong(scores, 0.001)).toEqual({ place: 1, of: 3 });
    expect(placeAmong(scores, 0.99)).toEqual({ place: 3, of: 3 });
  });

  it('places a tie below the model it matches, never above', () => {
    // matching the best model is second — a tie must not flatter
    expect(placeAmong(scores, scores[0].brier)).toEqual({ place: 2, of: 3 });
  });

  it('is null when there is no field to place against', () => {
    expect(placeAmong([], 0.2)).toBeNull();
  });
});

describe('bestSource', () => {
  it('is the top of the ranked field, or null when there is none', () => {
    const games = [played(10, 20, 100, 60)];
    const scores = scoreSources(
      corpus([
        { g: games[0].id, s: 2, p: 0.55 },
        { g: games[0].id, s: 1, p: 0.95 }
      ]),
      games
    );
    expect(bestSource(scores)?.name).toBe('Sharp');
    expect(bestSource([])).toBeNull();
  });
});
