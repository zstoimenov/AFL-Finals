import { describe, expect, it } from 'vitest';
import { buildBracket } from './buildBracket';
import { computeLocks } from './locks';
import type { Game, Snapshot, Standing } from './types';

function standing(id: number, pts: number, percentage: number): Standing {
  return { id, rank: 0, played: 20, wins: pts / 4, losses: 20 - pts / 4, draws: 0, pts, percentage, for: 1000, against: 1000 };
}

function game(partial: Partial<Game> & { hteamid: number; ateamid: number }): Game {
  return {
    id: Math.floor(Math.random() * 1e6),
    round: 23,
    year: 2026,
    complete: 0,
    hscore: null,
    ascore: null,
    date: '2026-08-20 19:40:00',
    venue: 'MCG',
    is_final: 0,
    winnerteamid: null,
    ...partial
  };
}

// 12 teams, ids 1..12, pts strictly descending: ladder order = id order
const standings = Array.from({ length: 12 }, (_, i) => standing(i + 1, 60 - i * 4, 130 - i));

function snap(games: Game[]): Snapshot {
  return {
    games,
    standings,
    tips: [],
    meta: { fetchedAt: '', year: 2026, source: 'seed', currentRound: 22, totalRounds: 24 }
  };
}

describe('buildBracket lock semantics', () => {
  it('marks nothing locked pre-finals while positions can still change', () => {
    // every team still plays its ladder neighbour → nobody is pinned
    const games = Array.from({ length: 11 }, (_, i) => game({ hteamid: i + 1, ateamid: i + 2 }));
    const s = snap(games);
    const bracket = buildBracket(s, null, computeLocks(s.standings, s.games));
    for (const m of bracket) {
      expect(m.locked).toBe(false);
      expect(m.home.locked).toBe(false);
      expect(m.away.locked).toBe(false);
    }
    // wiring sanity: projected wildcards pair 7v10 and 8v9
    const wc1 = bracket.find((m) => m.key === 'WC1')!;
    expect([wc1.home.teamId, wc1.away.teamId]).toEqual([7, 10]);
  });

  it('locks individual sides (not matches) when teams are mathematically pinned pre-finals', () => {
    // season over, distinct points, no finals played yet → every position pinned
    const s = snap([]);
    const bracket = buildBracket(s, null, computeLocks(s.standings, s.games));
    const qf1 = bracket.find((m) => m.key === 'QF1')!;
    expect(qf1.home.locked).toBe(true);
    expect(qf1.away.locked).toBe(true);
    expect(qf1.locked).toBe(false); // "Matchup set" is reserved for actual finals
    // slots fed by undecided wildcards stay open
    const ef1 = bracket.find((m) => m.key === 'EF1')!;
    expect(ef1.away.teamId).toBeNull();
    expect(ef1.away.locked).toBe(false);
  });

  it('fixes matchups once finals results exist', () => {
    // WC1 played: 10th upset 7th
    const wc1Game = game({
      hteamid: 7,
      ateamid: 10,
      is_final: 1,
      complete: 100,
      hscore: 70,
      ascore: 90,
      winnerteamid: 10
    });
    const s = snap([wc1Game]);
    const bracket = buildBracket(s, null, computeLocks(s.standings, s.games));
    const wc1 = bracket.find((m) => m.key === 'WC1')!;
    expect(wc1.winnerTeamId).toBe(10);
    expect(wc1.locked).toBe(true);
    const qf1 = bracket.find((m) => m.key === 'QF1')!;
    expect(qf1.locked).toBe(true); // final ladder fixed once finals begin
    expect(qf1.home.locked).toBe(true);
    // EF pairings still open: WC2 not yet played
    const ef2 = bracket.find((m) => m.key === 'EF2')!;
    expect(ef2.away.teamId).toBeNull();
  });
});
