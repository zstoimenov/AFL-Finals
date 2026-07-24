import { describe, it, expect } from 'vitest';
import type { Game } from './types';
import { opponentAdjustedMargins, recencyForm, headToHead, restDays } from './features';

/** Minimal completed game helper. */
function g(
  id: number,
  hteamid: number,
  ateamid: number,
  hscore: number,
  ascore: number,
  daysFromStart: number
): Game {
  const unixtime = 1_700_000_000 + daysFromStart * 86400;
  return {
    id,
    round: 1,
    year: 2026,
    complete: 100,
    hteamid,
    ateamid,
    hscore,
    ascore,
    date: new Date(unixtime * 1000).toISOString(),
    unixtime,
    venue: 'Test Oval',
    is_final: 0,
    winnerteamid: hscore > ascore ? hteamid : ascore > hscore ? ateamid : null
  };
}

describe('opponentAdjustedMargins', () => {
  it('ranks a team that wins big above one that loses big', () => {
    const games = [
      g(1, 1, 2, 120, 60, 0),
      g(2, 1, 3, 110, 70, 7),
      g(3, 2, 3, 80, 78, 14)
    ];
    const s = opponentAdjustedMargins(games);
    expect(s.get(1)!).toBeGreaterThan(s.get(2)!);
    expect(s.get(1)!).toBeGreaterThan(s.get(3)!);
  });

  it('credits beating a strong opponent (strength of schedule)', () => {
    // Team 1 and 4 each win by 30, but team 1 beats a team that itself wins big.
    const games = [
      g(1, 2, 3, 130, 40, 0), // team 2 is very strong
      g(2, 1, 2, 100, 70, 7), // team 1 beats strong team 2 by 30
      g(3, 4, 5, 100, 70, 7) // team 4 beats weak team 5 by 30
    ];
    const s = opponentAdjustedMargins(games);
    expect(s.get(1)!).toBeGreaterThan(s.get(4)!);
  });
});

describe('recencyForm', () => {
  it('weights recent results above old ones', () => {
    const winnerRecent = [g(1, 1, 2, 40, 100, 0), g(2, 1, 2, 100, 40, 30)];
    const loserRecent = [g(1, 1, 2, 100, 40, 0), g(2, 1, 2, 40, 100, 30)];
    expect(recencyForm(winnerRecent, 1)).toBeGreaterThan(0.5);
    expect(recencyForm(loserRecent, 1)).toBeLessThan(0.5);
  });

  it('returns 0.5 with no games', () => {
    expect(recencyForm([], 1)).toBe(0.5);
  });
});

describe('headToHead', () => {
  it('is positive when the home team has beaten this opponent', () => {
    const games = [g(1, 1, 2, 100, 60, 0), g(2, 2, 1, 60, 100, 7)];
    expect(headToHead(games, 1, 2)).toBeGreaterThan(0);
    expect(headToHead(games, 2, 1)).toBeLessThan(0);
  });

  it('is 0 when the teams have not met', () => {
    expect(headToHead([g(1, 1, 3, 100, 60, 0)], 1, 2)).toBe(0);
  });
});

describe('restDays', () => {
  it('measures days since the team last played', () => {
    const games = [g(1, 1, 2, 90, 80, 0)];
    const start = 1_700_000_000 + 6 * 86400;
    expect(restDays(games, 1, start)).toBeCloseTo(6, 5);
  });

  it('is null when the team has no prior game', () => {
    expect(restDays([], 1, 1_700_000_000)).toBeNull();
  });
});
