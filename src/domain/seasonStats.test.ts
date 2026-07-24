import { describe, it, expect } from 'vitest';
import type { Game } from './types';
import { headToHeadRecord, seasonFinals } from './seasonStats';

function g(over: Partial<Game>): Game {
  return {
    id: 0,
    round: 1,
    year: 2025,
    complete: 100,
    hteamid: 1,
    ateamid: 2,
    hscore: 90,
    ascore: 80,
    date: '2025-05-01 19:00:00',
    unixtime: 1_740_000_000,
    venue: 'V',
    is_final: 0,
    winnerteamid: 1,
    ...over
  };
}

describe('headToHeadRecord', () => {
  const games: Game[] = [
    g({ id: 1, year: 2024, unixtime: 1_700_000_000, hteamid: 1, ateamid: 2, hscore: 100, ascore: 60, winnerteamid: 1 }),
    g({ id: 2, year: 2025, unixtime: 1_720_000_000, hteamid: 2, ateamid: 1, hscore: 70, ascore: 90, winnerteamid: 1 }),
    g({ id: 3, year: 2025, unixtime: 1_730_000_000, hteamid: 1, ateamid: 2, hscore: 55, ascore: 88, winnerteamid: 2 }),
    // a game not between these two, ignored
    g({ id: 4, year: 2025, unixtime: 1_735_000_000, hteamid: 1, ateamid: 3, hscore: 80, ascore: 70, winnerteamid: 1 })
  ];

  it('counts wins from the first club perspective and sorts newest first', () => {
    const r = headToHeadRecord(games, 1, 2);
    expect(r.meetings.map((m) => m.game.id)).toEqual([3, 2, 1]);
    expect(r.aWins).toBe(2);
    expect(r.bWins).toBe(1);
    expect(r.draws).toBe(0);
  });

  it('is symmetric under swapping the two clubs', () => {
    const r = headToHeadRecord(games, 2, 1);
    expect(r.aWins).toBe(1);
    expect(r.bWins).toBe(2);
  });

  it('counts draws', () => {
    const drawn = [g({ id: 9, hteamid: 1, ateamid: 2, hscore: 75, ascore: 75, winnerteamid: null })];
    const r = headToHeadRecord(drawn, 1, 2);
    expect(r.draws).toBe(1);
    expect(r.aWins).toBe(0);
    expect(r.bWins).toBe(0);
  });
});

describe('seasonFinals', () => {
  it('returns completed finals oldest→newest by week', () => {
    const games: Game[] = [
      g({ id: 1, is_final: 0, round: 23 }),
      g({ id: 2, is_final: 2, round: 25, unixtime: 1_760_000_000 }),
      g({ id: 3, is_final: 1, round: 24, unixtime: 1_759_000_000 }),
      g({ id: 4, is_final: 4, round: 27, unixtime: 1_762_000_000 }),
      g({ id: 5, is_final: 3, round: 26, unixtime: 1_761_000_000, complete: 0 }) // not complete
    ];
    const finals = seasonFinals(games);
    expect(finals.map((x) => x.id)).toEqual([3, 2, 4]);
  });
});
