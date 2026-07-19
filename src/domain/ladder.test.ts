import { describe, expect, it } from 'vitest';
import { currentHomeAwayRound, homeAwayRounds } from './ladder';
import type { Game } from './types';

function g(round: number, complete: boolean, isFinal = 0): Game {
  return {
    id: Math.random(),
    round,
    year: 2026,
    complete: complete ? 100 : 0,
    hteamid: 1,
    ateamid: 2,
    hscore: complete ? 90 : null,
    ascore: complete ? 80 : null,
    date: '2026-07-01 19:40:00',
    unixtime: 1,
    venue: 'MCG',
    is_final: isFinal,
    winnerteamid: complete ? 1 : null
  };
}

describe('currentHomeAwayRound', () => {
  it('is the earliest round with an unplayed game', () => {
    const games = [g(18, true), g(18, true), g(19, true), g(19, false), g(20, false)];
    expect(currentHomeAwayRound(games)).toBe(19);
  });

  it('advances to the next round once a round completes', () => {
    // round 19 now fully played → current becomes 20
    const games = [g(19, true), g(19, true), g(20, false), g(20, false)];
    expect(currentHomeAwayRound(games)).toBe(20);
  });

  it('clamps to the final round when the whole season is done', () => {
    const games = [g(23, true), g(24, true)];
    expect(currentHomeAwayRound(games)).toBe(24);
  });

  it('ignores finals games when choosing the round', () => {
    const games = [g(24, true), g(25, false, 1)];
    expect(currentHomeAwayRound(games)).toBe(24);
    expect(homeAwayRounds(games)).toEqual([24]);
  });
});
