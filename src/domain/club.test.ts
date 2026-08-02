import { describe, expect, it } from 'vitest';
import {
  clubBests,
  clubSeasons,
  currentStreak,
  nextGame,
  recentResults,
  recordByOpponent,
  winsToGuarantee
} from './club';
import type { Game, Snapshot, Standing } from './types';

function standing(id: number, pts: number, percentage = 100): Standing {
  return {
    id,
    rank: 0,
    played: 20,
    wins: Math.round(pts / 4),
    losses: 20 - Math.round(pts / 4),
    draws: 0,
    pts,
    percentage,
    for: 1000,
    against: 1000
  };
}

let nextId = 1;
function game(h: number, a: number, opts: Partial<Game> = {}): Game {
  return {
    id: nextId++,
    round: 22,
    year: 2026,
    complete: 0,
    hteamid: h,
    ateamid: a,
    hscore: null,
    ascore: null,
    date: '2026-08-15 19:40:00',
    unixtime: 1786000000 + nextId * 1000,
    venue: 'Optus Stadium',
    is_final: 0,
    winnerteamid: null,
    ...opts
  };
}

function played(h: number, a: number, hscore: number, ascore: number, opts: Partial<Game> = {}): Game {
  return game(h, a, {
    complete: 1,
    hscore,
    ascore,
    winnerteamid: hscore === ascore ? null : hscore > ascore ? h : a,
    ...opts
  });
}

function snap(games: Game[], standings: Standing[]): Snapshot {
  return {
    games,
    standings,
    tips: [],
    meta: {
      fetchedAt: '2026-08-01T00:00:00.000Z',
      year: 2026,
      source: 'squiggle',
      currentRound: 22,
      totalRounds: 24
    }
  };
}

describe('form', () => {
  it('reads results from the club’s perspective, newest first', () => {
    const games = [
      played(6, 7, 100, 80, { unixtime: 100 }), // home win by 20
      played(8, 6, 90, 70, { unixtime: 200 }) // away loss by 20
    ];
    const form = recentResults(games, 6);
    expect(form.map((r) => r.margin)).toEqual([-20, 20]);
    expect(form[0].opponentId).toBe(8);
    expect(form[0].home).toBe(false);
    expect(form[1].won).toBe(true);
  });

  it('counts a streak and stops it at a draw', () => {
    const games = [
      played(6, 7, 100, 100, { unixtime: 100 }), // draw
      played(6, 8, 100, 80, { unixtime: 200 }),
      played(9, 6, 60, 90, { unixtime: 300 })
    ];
    expect(currentStreak(games, 6)).toBe(2);
    expect(currentStreak([...games, played(6, 10, 50, 90, { unixtime: 400 })], 6)).toBe(-1);
  });
});

describe('winsToGuarantee', () => {
  it('is the fewest wins that hold however the games fall', () => {
    // club 6 on 60 with two games left; four rivals parked on 62 can't move.
    // One win (64) clears all four whichever game it is → top four guaranteed.
    const standings = [
      standing(2, 62, 125),
      standing(3, 62, 124),
      standing(4, 62, 123),
      standing(5, 62, 122),
      standing(6, 60, 121),
      ...Array.from({ length: 13 }, (_, i) => standing(i + 7, 40 - i * 2, 100 - i))
    ];
    const games = [game(6, 15), game(16, 6)];
    expect(winsToGuarantee(snap(games, standings), 6, 'top4')).toBe(1);
  });

  it('needs both wins when one is not enough in every case', () => {
    // rivals on 62 each have a game in hand, so they can reach 66: club 6 must
    // win both (68) to be certain of clearing them.
    const standings = [
      standing(2, 62, 125),
      standing(3, 62, 124),
      standing(4, 62, 123),
      standing(5, 62, 122),
      standing(6, 60, 121),
      ...Array.from({ length: 13 }, (_, i) => standing(i + 7, 40 - i * 2, 100 - i))
    ];
    const games = [
      game(6, 15),
      game(16, 6),
      game(2, 17),
      game(3, 17),
      game(4, 18),
      game(5, 18)
    ];
    expect(winsToGuarantee(snap(games, standings), 6, 'top4')).toBe(2);
  });

  it('returns 0 when the tier is already mathematically safe', () => {
    const standings = [
      standing(6, 80, 130),
      ...Array.from({ length: 17 }, (_, i) => standing(i + 1 === 6 ? 18 : i + 1, 40 - i, 100 - i))
    ];
    expect(winsToGuarantee(snap([game(6, 1)], standings), 6, 'top4')).toBe(0);
  });

  it('returns null when even winning out cannot guarantee it', () => {
    // club 6 can reach 48; five clubs are already past that and can't be caught
    const standings = [
      ...Array.from({ length: 5 }, (_, i) => standing(i + 1, 70 - i, 130 - i)),
      standing(6, 40, 100),
      ...Array.from({ length: 12 }, (_, i) => standing(i + 7, 36 - i, 95 - i))
    ];
    expect(winsToGuarantee(snap([game(6, 1), game(6, 2)], standings), 6, 'top4')).toBeNull();
  });

  it('declines to answer when too much of the season is left', () => {
    const standings = Array.from({ length: 18 }, (_, i) => standing(i + 1, 40, 110 - i));
    const games = Array.from({ length: 9 }, (_, i) => game(6, ((i + 7) % 18) + 1, { round: 15 + i }));
    expect(winsToGuarantee(snap(games, standings), 6, 'top6')).toBeNull();
  });

  it('has nothing to say once the season is done', () => {
    const standings = Array.from({ length: 18 }, (_, i) => standing(i + 1, 40, 110 - i));
    expect(winsToGuarantee(snap([], standings), 6, 'top6')).toBeNull();
  });
});

describe('record book', () => {
  it('tallies the record against each opponent, best first', () => {
    const games = [
      played(6, 7, 100, 80, { unixtime: 100 }),
      played(7, 6, 60, 90, { unixtime: 200 }),
      played(6, 8, 70, 90, { unixtime: 300 }),
      played(6, 9, 80, 80, { unixtime: 400 })
    ];
    const record = recordByOpponent(games, 6);
    expect(record[0]).toEqual({ opponentId: 7, wins: 2, losses: 0, draws: 0 });
    expect(record.find((r) => r.opponentId === 8)).toEqual({
      opponentId: 8,
      wins: 0,
      losses: 1,
      draws: 0
    });
    expect(record.find((r) => r.opponentId === 9)?.draws).toBe(1);
  });

  it('finds the biggest win and the longest winning run', () => {
    const games = [
      played(6, 7, 120, 40, { unixtime: 100 }), // +80
      played(6, 8, 100, 90, { unixtime: 200 }),
      played(9, 6, 50, 100, { unixtime: 300 }),
      played(6, 10, 60, 100, { unixtime: 400 }), // loss breaks the run at 3
      played(6, 11, 100, 60, { unixtime: 500 })
    ];
    const bests = clubBests(games, 6);
    expect(bests.biggestWin?.margin).toBe(80);
    expect(bests.longestWinStreak?.length).toBe(3);
  });

  it('has no bests for a club that has never won', () => {
    const bests = clubBests([played(6, 7, 40, 120, { unixtime: 100 })], 6);
    expect(bests.biggestWin).toBeNull();
    expect(bests.longestWinStreak).toBeNull();
  });

  it('lists season finishes newest first, flagging a premiership', () => {
    const seasons = new Map<number, Snapshot>([
      [
        2024,
        {
          ...snap([], [standing(6, 60, 120), standing(7, 70, 130)]),
          meta: { ...snap([], []).meta, year: 2024, premier: 6 }
        }
      ],
      [
        2025,
        {
          ...snap([], [standing(6, 40, 90), standing(7, 70, 130)]),
          meta: { ...snap([], []).meta, year: 2025, premier: 7 }
        }
      ]
    ]);
    const history = clubSeasons(seasons, 6);
    expect(history.map((s) => s.year)).toEqual([2025, 2024]);
    expect(history[1]).toMatchObject({ year: 2024, rank: 2, premier: true });
    expect(history[0].premier).toBe(false);
  });
});

describe('nextGame', () => {
  it('is the earliest unplayed game the club is in', () => {
    const games = [
      played(6, 7, 100, 80, { unixtime: 100 }),
      game(9, 10, { unixtime: 200 }), // not our game
      game(6, 8, { unixtime: 300 }),
      game(6, 11, { unixtime: 400 })
    ];
    expect(nextGame(games, 6)?.unixtime).toBe(300);
  });

  it('is null once the club has no games left', () => {
    expect(nextGame([played(6, 7, 100, 80, { unixtime: 100 })], 6)).toBeNull();
  });
});
