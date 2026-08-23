import { describe, expect, it } from 'vitest';
import type { BracketMatch, BracketSide, Game, Snapshot, Standing } from './types';
import {
  buildFinalsContext,
  buildFinalsContexts,
  finalsProgress,
  nextFinal
} from './finalsContext';

function standing(id: number, pts: number, percentage = 100): Standing {
  return {
    id,
    rank: 0,
    played: 22,
    wins: pts / 4,
    losses: 22 - pts / 4,
    draws: 0,
    pts,
    percentage,
    for: 2000,
    against: 2000
  };
}

let nextId = 1;
function game(partial: Partial<Game> & { hteamid: number; ateamid: number }): Game {
  const complete = partial.complete ?? 100;
  const hscore = partial.hscore ?? (complete ? 90 : null);
  const ascore = partial.ascore ?? (complete ? 80 : null);
  return {
    id: nextId++,
    round: 10,
    year: 2026,
    date: '2026-06-01 19:40:00',
    unixtime: 1_780_000_000,
    venue: 'MCG',
    is_final: 0,
    ...partial,
    complete,
    hscore,
    ascore,
    winnerteamid: complete ? (hscore! >= ascore! ? partial.hteamid : partial.ateamid) : null
  };
}

function side(teamId: number | null, seed: number | null = null): BracketSide {
  return { teamId, seed, placeholder: teamId == null ? 'TBD' : null, candidates: [], locked: false };
}

function match(partial: Partial<BracketMatch> & { key: string }): BracketMatch {
  return {
    round: 'QF',
    name: partial.key,
    home: side(1, 1),
    away: side(2, 2),
    game: null,
    homeWinProb: null,
    squiggleHomeProb: null,
    winnerTeamId: null,
    locked: false,
    ...partial
  };
}

function snap(games: Game[]): Snapshot {
  return {
    games,
    standings: [standing(1, 64, 130), standing(2, 56, 118), standing(3, 48, 104)],
    tips: [],
    meta: { fetchedAt: '', year: 2026, source: 'seed', currentRound: 24, totalRounds: 24 }
  };
}

describe('buildFinalsContext', () => {
  it('reads a head-to-head record across the archive and the live season', () => {
    const history: Game[] = [
      game({ hteamid: 1, ateamid: 2, year: 2025, hscore: 100, ascore: 70 }),
      game({ hteamid: 2, ateamid: 1, year: 2025, hscore: 60, ascore: 90, is_final: 3 })
    ];
    const live = [game({ hteamid: 1, ateamid: 2, unixtime: 1_781_000_000, hscore: 70, ascore: 95 })];
    const ctx = buildFinalsContext(snap(live), match({ key: 'QF1' }), history);

    // two to team 1 (both in 2025), one to team 2 (this season)
    expect(ctx.record).toEqual({ homeWins: 2, awayWins: 1, draws: 0 });
    expect(ctx.meetings).toHaveLength(3);
    expect(ctx.finalsMeetings).toBe(1);
  });

  it('reports each side ladder position, form and streak', () => {
    const live = [
      game({ hteamid: 1, ateamid: 3, unixtime: 1_781_000_000, hscore: 100, ascore: 60 }),
      game({ hteamid: 3, ateamid: 1, unixtime: 1_782_000_000, hscore: 50, ascore: 80 }),
      game({ hteamid: 2, ateamid: 3, unixtime: 1_782_500_000, hscore: 40, ascore: 90 })
    ];
    const ctx = buildFinalsContext(snap(live), match({ key: 'QF1' }));

    expect(ctx.home!.rank).toBe(1);
    expect(ctx.away!.rank).toBe(2);
    expect(ctx.home!.streak).toBe(2); // two wins over team 3
    expect(ctx.away!.streak).toBe(-1);
    expect(ctx.home!.form.map((r) => r.won)).toEqual([true, true]);
  });

  it('never lets a played final inform the form and record that preceded it', () => {
    const earlier = game({ hteamid: 1, ateamid: 2, unixtime: 1_781_000_000, hscore: 95, ascore: 80 });
    const theFinal = game({
      hteamid: 1,
      ateamid: 2,
      unixtime: 1_790_000_000,
      is_final: 2,
      hscore: 60,
      ascore: 110
    });
    const ctx = buildFinalsContext(
      snap([earlier, theFinal]),
      match({ key: 'QF1', game: theFinal, winnerTeamId: 2 })
    );

    // the final itself is excluded from both the record and the form line
    expect(ctx.record).toEqual({ homeWins: 1, awayWins: 0, draws: 0 });
    expect(ctx.meetings.map((m) => m.game.id)).toEqual([earlier.id]);
    expect(ctx.home!.form.map((r) => r.game.id)).toEqual([earlier.id]);
  });

  it('has no record to give for a slot whose participants are unknown', () => {
    const ctx = buildFinalsContext(
      snap([]),
      match({ key: 'SF1', home: side(null), away: side(2, 2) })
    );
    expect(ctx.home).toBeNull();
    expect(ctx.record).toBeNull();
    expect(ctx.meetings).toEqual([]);
  });

  it('does not call the Grand Final a trip for either side', () => {
    const homeGround = game({ hteamid: 1, ateamid: 3, venue: 'MCG' });
    const gf = game({
      hteamid: 1,
      ateamid: 2,
      venue: 'MCG',
      is_final: 5,
      complete: 0,
      unixtime: 1_790_000_000
    });
    const ctx = buildFinalsContext(snap([homeGround, gf]), match({ key: 'GF', game: gf }));
    expect(ctx.away!.travelling).toBe(false);
  });

  it('flags the visitor as travelling at a ground it has never hosted at', () => {
    const homeGround = game({ hteamid: 1, ateamid: 3, venue: 'MCG' });
    const awayGround = game({ hteamid: 2, ateamid: 3, venue: 'Optus Stadium' });
    const qf = game({
      hteamid: 1,
      ateamid: 2,
      venue: 'MCG',
      is_final: 2,
      complete: 0,
      unixtime: 1_790_000_000
    });
    const ctx = buildFinalsContext(snap([homeGround, awayGround, qf]), match({ key: 'QF1', game: qf }));
    expect(ctx.away!.travelling).toBe(true);
  });

  it('builds one context per bracket slot, keyed by match', () => {
    const contexts = buildFinalsContexts(snap([]), [
      match({ key: 'QF1' }),
      match({ key: 'QF2', home: side(2, 2), away: side(3, 3) })
    ]);
    expect([...contexts.keys()]).toEqual(['QF1', 'QF2']);
  });
});

describe('nextFinal', () => {
  it('picks the earliest scheduled match still to be played', () => {
    const later = game({ hteamid: 1, ateamid: 2, complete: 0, is_final: 3, unixtime: 200 });
    const sooner = game({ hteamid: 2, ateamid: 3, complete: 0, is_final: 3, unixtime: 100 });
    const done = game({ hteamid: 1, ateamid: 3, is_final: 2, unixtime: 50 });
    const next = nextFinal([
      match({ key: 'SF1', game: later }),
      match({ key: 'SF2', game: sooner }),
      match({ key: 'QF1', game: done, winnerTeamId: 1 })
    ]);
    expect(next?.key).toBe('SF2');
  });

  it('is null while the bracket is still a projection', () => {
    expect(nextFinal([match({ key: 'QF1' }), match({ key: 'QF2' })])).toBeNull();
  });

  it('is null once every final has been played', () => {
    const done = game({ hteamid: 1, ateamid: 2, is_final: 5 });
    expect(nextFinal([match({ key: 'GF', game: done, winnerTeamId: 1 })])).toBeNull();
  });
});

describe('finalsProgress', () => {
  it('counts what has been played and what is left', () => {
    const done = game({ hteamid: 1, ateamid: 2, is_final: 1 });
    const toCome = game({ hteamid: 2, ateamid: 3, is_final: 2, complete: 0 });
    const p = finalsProgress([
      match({ key: 'WC1', game: done, winnerTeamId: 1 }),
      match({ key: 'QF1', game: toCome }),
      match({ key: 'GF' })
    ]);
    expect(p).toEqual({ started: true, played: 1, remaining: 2, premier: null });
  });

  it('reports the premier from the Grand Final slot, and not before', () => {
    const projected = finalsProgress([match({ key: 'GF' })]);
    expect(projected.started).toBe(false);
    expect(projected.premier).toBeNull();

    const gf = game({ hteamid: 1, ateamid: 2, is_final: 5 });
    expect(finalsProgress([match({ key: 'GF', game: gf, winnerTeamId: 1 })]).premier).toBe(1);
  });
});
