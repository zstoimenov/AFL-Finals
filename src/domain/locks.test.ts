import { describe, expect, it } from 'vitest';
import { computeLocks, lockLabel } from './locks';
import type { Game, Standing } from './types';

function standing(id: number, pts: number, percentage = 100): Standing {
  return { id, rank: 0, played: 20, wins: pts / 4, losses: 20 - pts / 4, draws: 0, pts, percentage, for: 1000, against: 1000 };
}

/** one remaining (incomplete) H&A game per entry [home, away] */
function fixture(pairs: Array<[number, number]>): Game[] {
  return pairs.map(([h, a], i) => ({
    id: 1000 + i,
    round: 23,
    year: 2026,
    complete: 0,
    hteamid: h,
    ateamid: a,
    hscore: null,
    ascore: null,
    date: '2026-08-20 19:40:00',
    venue: null,
    is_final: 0,
    winnerteamid: null
  }));
}

describe('computeLocks', () => {
  it('locks the minor premier when nobody can catch them', () => {
    // team 1 on 80, next best 60 with 2 games left (max 68)
    const standings = [
      standing(1, 80, 130),
      standing(2, 60, 120),
      standing(3, 56, 110),
      standing(4, 40, 100)
    ];
    const games = fixture([[2, 3], [3, 4], [2, 4], [1, 4]]);
    const locks = computeLocks(standings, games);
    const t1 = locks.find((l) => l.teamId === 1)!;
    expect(t1.inTop2).toBe(true);
    expect(t1.rank).toBe(1);
    // team 1 locked #1 exactly: everyone's max (68) < team1 min (80)
    expect(t1.lockedExact).toBe(true);
    expect(lockLabel(t1)).toBe('Locked #1');
  });

  it('does not lock when a points tie is still possible (conservative on percentage)', () => {
    // team 2 (60) can reach 64 and tie team 1 (64, no games left)
    const standings = [standing(1, 64, 110), standing(2, 60, 120)];
    const games = fixture([[2, 3]]);
    const locks = computeLocks(standings, [...games]);
    const t1 = locks.find((l) => l.teamId === 1)!;
    expect(t1.inTop2).toBe(true); // only one challenger, top2 trivially safe
    expect(t1.lockedExact).toBe(false); // could be passed on percentage after tie
  });

  it('marks a team eliminated from finals when 10 teams are unreachable', () => {
    // bottom team 40 pts behind with one game left
    const standings = [
      ...Array.from({ length: 10 }, (_, i) => standing(i + 1, 60 - i, 120 - i)),
      standing(11, 30, 90),
      standing(12, 4, 60)
    ];
    const games = fixture([[12, 11]]);
    const locks = computeLocks(standings, games);
    const bottom = locks.find((l) => l.teamId === 12)!;
    expect(bottom.outOfTop10).toBe(true);
    expect(lockLabel(bottom)).toBe('Eliminated');
    const eleventh = locks.find((l) => l.teamId === 11)!;
    expect(eleventh.outOfTop10).toBe(true); // max 34 < 10th's 51
  });

  it('locks tiers progressively (top4 but not top2)', () => {
    const standings = [
      standing(1, 80, 130),
      standing(2, 76, 125),
      standing(3, 74, 120), // can catch 2 (max 78) but not 1
      standing(4, 60, 110),
      standing(5, 40, 100)
    ];
    const games = fixture([[3, 5]]);
    const locks = computeLocks(standings, games);
    const t3 = locks.find((l) => l.teamId === 3)!;
    expect(t3.inTop4).toBe(true);
    expect(t3.inTop2).toBe(false); // both 1 and 2 may still finish above team 3
  });

  it('with no games remaining every team is locked exactly (distinct points)', () => {
    const standings = [standing(1, 80), standing(2, 76), standing(3, 60)];
    const locks = computeLocks(standings, []);
    for (const l of locks) expect(l.lockedExact).toBe(true);
  });
});
