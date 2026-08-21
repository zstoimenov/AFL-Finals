import { describe, expect, it } from 'vitest';
import { buildGameDetail, findGame } from './gameDetail';
import type { Game, Snapshot, Standing } from './types';

function standing(id: number, pts: number, percentage = 100): Standing {
  return {
    id,
    rank: 0,
    played: 20,
    wins: pts / 4,
    losses: 20 - pts / 4,
    draws: 0,
    pts,
    percentage,
    for: 1000,
    against: 1000
  };
}

let nextId = 1;
function game(partial: Partial<Game> & { hteamid: number; ateamid: number }): Game {
  const complete = partial.complete ?? 0;
  return {
    id: nextId++,
    round: 20,
    year: 2026,
    complete,
    hscore: complete ? 90 : null,
    ascore: complete ? 80 : null,
    date: '2026-07-01 19:40:00',
    unixtime: 1_780_000_000,
    venue: 'MCG',
    is_final: 0,
    winnerteamid: complete ? partial.hteamid : null,
    ...partial
  };
}

const standings = [standing(1, 60, 130), standing(2, 52, 115), standing(3, 40, 95)];

function snap(games: Game[]): Snapshot {
  return {
    games,
    standings,
    tips: [],
    meta: { fetchedAt: '', year: 2026, source: 'seed', currentRound: 20, totalRounds: 24 }
  };
}

describe('buildGameDetail', () => {
  it('describes both sides with ladder position and form', () => {
    const played = game({ hteamid: 1, ateamid: 2, complete: 100, unixtime: 1_770_000_000 });
    const upcoming = game({ hteamid: 1, ateamid: 3 });
    const detail = buildGameDetail(snap([played, upcoming]), upcoming);

    expect(detail.home.teamId).toBe(1);
    expect(detail.home.rank).toBe(1);
    expect(detail.away.teamId).toBe(3);
    expect(detail.away.home).toBe(false);
    // team 1 has one completed game in the snapshot
    expect(detail.home.form).toHaveLength(1);
    expect(detail.complete).toBe(false);
  });

  it('never counts a completed game in its own build-up', () => {
    // both games are between the same clubs; the later one must not see itself
    const earlier = game({ hteamid: 1, ateamid: 2, complete: 100, unixtime: 1_770_000_000 });
    const later = game({ hteamid: 1, ateamid: 2, complete: 100, unixtime: 1_780_000_000 });
    const detail = buildGameDetail(snap([earlier, later]), later);

    expect(detail.complete).toBe(true);
    expect(detail.home.form.map((r) => r.game.id)).toEqual([earlier.id]);
    expect(detail.meetings.map((m) => m.game.id)).toEqual([earlier.id]);
  });

  it('counts the head-to-head record from the home team’s perspective', () => {
    const homeWin = game({ hteamid: 1, ateamid: 2, complete: 100, winnerteamid: 1 });
    const awayWin = game({
      hteamid: 1,
      ateamid: 2,
      complete: 100,
      hscore: 70,
      ascore: 100,
      winnerteamid: 2
    });
    const next = game({ hteamid: 1, ateamid: 2 });
    const detail = buildGameDetail(snap([homeWin, awayWin, next]), next);

    expect(detail.record).toEqual({ homeWins: 1, awayWins: 1, draws: 0 });
  });

  it('flags a visitor playing away from its own grounds', () => {
    // team 2 has only ever hosted at Optus; this game is at the MCG
    const hosted = game({
      hteamid: 2,
      ateamid: 3,
      venue: 'Optus Stadium',
      complete: 100
    });
    const away = game({ hteamid: 1, ateamid: 2, venue: 'MCG' });
    const detail = buildGameDetail(snap([hosted, away]), away);

    expect(detail.away.travelling).toBe(true);
    expect(detail.home.travelling).toBe(false);
  });

  it('gives an upcoming game reasons and a played game none', () => {
    const upcoming = game({ hteamid: 1, ateamid: 2 });
    const played = game({ hteamid: 1, ateamid: 3, complete: 100 });
    const s = snap([upcoming, played]);

    expect(buildGameDetail(s, upcoming).reasons.length).toBeGreaterThan(0);
    expect(buildGameDetail(s, played).reasons).toEqual([]);
  });
});

describe('findGame', () => {
  it('finds a game by id, and copes with a route that names none', () => {
    const g = game({ hteamid: 1, ateamid: 2 });
    expect(findGame([g], g.id)).toBe(g);
    expect(findGame([g], 999_999)).toBeNull();
    expect(findGame([g], null)).toBeNull();
  });
});
