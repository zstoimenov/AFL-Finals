import { describe, expect, it } from 'vitest';
import { rateGames, upcomingGames, WEIGHTS } from './interest';
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
    unixtime: 1786000000,
    venue: 'Optus Stadium',
    is_final: 0,
    winnerteamid: null,
    ...opts
  };
}

/** A completed game with a final margin, `daysAgo` before the fixture above. */
function played(h: number, a: number, hscore: number, ascore: number, opts: Partial<Game> = {}): Game {
  return game(h, a, {
    complete: 1,
    hscore,
    ascore,
    winnerteamid: hscore === ascore ? null : hscore > ascore ? h : a,
    unixtime: 1700000000,
    ...opts
  });
}

/** 18 clubs on descending points, so ladder position is predictable. */
function ladderOf18(): Standing[] {
  return Array.from({ length: 18 }, (_, i) => standing(i + 1, 72 - i * 4, 130 - i * 2));
}

function snap(games: Game[], standings: Standing[] = ladderOf18()): Snapshot {
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

describe('upcomingGames', () => {
  it('picks the earliest home & away round that still has an unplayed game', () => {
    const s = snap([
      played(1, 2, 100, 80, { round: 21 }),
      game(3, 4, { round: 22 }),
      game(5, 6, { round: 22 }),
      game(7, 8, { round: 23 })
    ]);
    const week = upcomingGames(s);
    expect(week.round).toBe(22);
    expect(week.finals).toBe(false);
    expect(week.games).toHaveLength(2);
  });

  it('moves to the finals only once every home & away game is played', () => {
    const s = snap([
      played(1, 2, 100, 80, { round: 24 }),
      game(3, 4, { is_final: 1, round: 25 })
    ]);
    const week = upcomingGames(s);
    expect(week.finals).toBe(true);
    expect(week.round).toBe(1);
  });

  it('ignores placeholder finals fixtures with no real participants', () => {
    const s = snap([
      played(1, 2, 100, 80, { round: 24 }),
      game(0, 0, { is_final: 1, round: 25 })
    ]);
    expect(upcomingGames(s).games).toHaveLength(0);
  });

  it('is empty when the season is over', () => {
    expect(upcomingGames(snap([played(1, 2, 100, 80)])).games).toHaveLength(0);
  });
});

describe('rateGames', () => {
  it('scores exactly the sum of the reasons it shows', () => {
    const fixtures = [game(1, 2), game(5, 12), game(6, 17)];
    const rated = rateGames(snap([...fixtures]), fixtures);
    for (const r of rated) {
      const sum = r.reasons.reduce((s, x) => s + x.weight, 0);
      expect(r.score).toBeCloseTo(sum, 10);
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(r.headline).toBe(r.reasons[0].text);
    }
  });

  it('ranks an even contest above a mismatch, all else equal', () => {
    // 9 v 10 are neighbours on the ladder; 1 v 18 are the extremes
    const even = game(9, 10);
    const mismatch = game(1, 18);
    const rated = rateGames(snap([even, mismatch]), [even, mismatch]);
    expect(rated[0].game.id).toBe(even.id);
  });

  it('reports a clinch only when the win alone guarantees it', () => {
    // team 1 sits 5th on 60 with one game left. Four rivals are parked on 62 and
    // can't move, so today team 1 is *not* safe — but winning takes them to 64,
    // past all four, and locks the top four no matter what else happens.
    const standings = [
      standing(2, 62, 125),
      standing(3, 62, 124),
      standing(4, 62, 123),
      standing(5, 62, 122),
      standing(1, 60, 121),
      ...Array.from({ length: 13 }, (_, i) => standing(i + 6, 40 - i * 2, 100 - i))
    ];
    const fixture = game(1, 2);
    const rated = rateGames(snap([fixture], standings), [fixture]);
    const clinch = rated[0].reasons.find((r) => r.kind === 'clinch');
    expect(clinch?.text).toBe('Adelaide clinch a top-four spot with a win');
    expect(clinch?.teamId).toBe(1);
  });

  it('does not claim a clinch that other results could still undo', () => {
    // everyone bunched within a win of each other: nothing is settled by one game
    const standings = Array.from({ length: 18 }, (_, i) => standing(i + 1, 40, 110 - i));
    const fixtures = [game(1, 2), game(3, 4)];
    const s = snap([...fixtures, ...Array.from({ length: 14 }, (_, i) => game(i + 5, ((i + 5) % 18) + 1, { round: 23 }))], standings);
    const rated = rateGames(s, fixtures);
    for (const r of rated) expect(r.reasons.some((x) => x.kind === 'clinch')).toBe(false);
  });

  it('flags elimination when a loss ends a club’s finals hopes', () => {
    // team 18 on 40 with one game left can still reach 44 and pull level with the
    // eleven clubs on 44 — alive today. Lose, and all seventeen are out of reach.
    const standings = [
      standing(1, 60, 130),
      standing(2, 56, 128),
      standing(3, 52, 126),
      standing(4, 48, 124),
      standing(5, 48, 123),
      standing(6, 48, 122),
      ...Array.from({ length: 11 }, (_, i) => standing(i + 7, 44, 120 - i)),
      standing(18, 40, 60)
    ];
    const fixture = game(17, 18);
    const rated = rateGames(snap([fixture], standings), [fixture]);
    const out = rated[0].reasons.find((r) => r.kind === 'elimination');
    expect(out?.teamId).toBe(18);
  });

  it('names a standing rivalry', () => {
    const derby = game(6, 17); // Fremantle v West Coast
    const rated = rateGames(snap([derby]), [derby]);
    const rivalry = rated[0].reasons.find((r) => r.kind === 'rivalry');
    expect(rivalry?.text).toContain('Western Derby');
    expect(rivalry?.weight).toBe(WEIGHTS.derby);
  });

  it('uses the occasion name when the fixture falls on the date', () => {
    const anzac = game(4, 5, { date: '2026-04-25 15:20:00' });
    const rated = rateGames(snap([anzac]), [anzac]);
    const rivalry = rated[0].reasons.find((r) => r.kind === 'rivalry');
    expect(rivalry?.text).toBe('ANZAC Day clash');
    expect(rivalry?.weight).toBe(WEIGHTS.traditional + WEIGHTS.occasion);
  });

  it('calls a six-pointer when both clubs are scrapping over the same cut line', () => {
    // ranks 5 and 8 straddle the top-six bye line
    const fixture = game(5, 8);
    const rated = rateGames(snap([fixture]), [fixture]);
    const six = rated[0].reasons.find((r) => r.kind === 'sixpointer');
    expect(six?.text).toContain('top 6');
    expect(six?.text).toContain('5th v 8th');
  });

  it('reads tight head-to-head history out of past seasons', () => {
    const fixture = game(11, 12);
    const history = [
      played(11, 12, 100, 96, { year: 2025, unixtime: 1690000000 }),
      played(12, 11, 88, 82, { year: 2024, unixtime: 1660000000 }),
      played(11, 12, 90, 91, { year: 2023, unixtime: 1630000000 })
    ];
    const rated = rateGames(snap([fixture]), [fixture], { history });
    const h2h = rated[0].reasons.find((r) => r.kind === 'h2h-close');
    expect(h2h?.text).toMatch(/last 3 meetings were decided by \d+ points/);
  });

  it('flags a rematch of last season’s finals', () => {
    const fixture = game(11, 12);
    const history = [played(11, 12, 100, 60, { year: 2025, is_final: 3, unixtime: 1690000000 })];
    const rated = rateGames(snap([fixture]), [fixture], { history });
    expect(rated[0].reasons.some((r) => r.kind === 'rematch')).toBe(true);
  });

  it('counts a current winning streak and stops at a loss', () => {
    const fixture = game(1, 2);
    const past = [
      played(1, 5, 60, 100, { round: 17, unixtime: 1690000000 }), // loss, ends the run
      played(1, 6, 100, 60, { round: 18, unixtime: 1691000000 }),
      played(7, 1, 60, 100, { round: 19, unixtime: 1692000000 }),
      played(1, 8, 100, 60, { round: 20, unixtime: 1693000000 }),
      played(9, 1, 60, 100, { round: 21, unixtime: 1694000000 })
    ];
    const rated = rateGames(snap([fixture, ...past]), [fixture]);
    const streak = rated[0].reasons.find((r) => r.kind === 'streak' && r.teamId === 1);
    expect(streak?.text).toBe('Adelaide have won 4 straight');
  });

  it('skips the stakes signals for finals week', () => {
    const fixture = game(1, 2, { is_final: 1 });
    const rated = rateGames(snap([fixture]), [fixture], { stakes: false });
    expect(rated[0].reasons.some((r) => r.kind === 'clinch' || r.kind === 'elimination')).toBe(
      false
    );
  });

  it('orders deterministically, breaking ties on kickoff', () => {
    const a = game(1, 2, { unixtime: 1786000000 });
    const b = game(3, 4, { unixtime: 1786100000 });
    const first = rateGames(snap([a, b]), [a, b]).map((r) => r.game.id);
    const second = rateGames(snap([b, a]), [b, a]).map((r) => r.game.id);
    expect(first).toEqual(second);
  });

  it('works with an empty history archive', () => {
    const fixture = game(1, 2);
    const rated = rateGames(snap([fixture]), [fixture], { history: [] });
    expect(rated).toHaveLength(1);
    expect(rated[0].score).toBeGreaterThan(0);
  });
});

describe('tipster disagreement', () => {
  /** A fixture plus the aggregated tip describing how the field split on it. */
  function withTips(htips: number | null, atips: number | null, over = {}) {
    const g = game(1, 2, { round: 22 });
    const s = snap([g]);
    s.tips = [
      {
        gameid: g.id,
        hteamid: 1,
        ateamid: 2,
        hconfidence: 0.55,
        models: 30,
        htips,
        atips,
        spread: 0.12,
        low: 0.35,
        high: 0.78,
        ...over
      }
    ];
    return { game: g, snapshot: s };
  }

  const reasonOn = (htips: number | null, atips: number | null, over = {}) => {
    const { game: g, snapshot } = withTips(htips, atips, over);
    const rated = rateGames(snapshot, [g], { stakes: false })[0];
    return rated.reasons.find((r) => r.kind === 'consensus') ?? null;
  };

  it('scores a dead split at the full weight', () => {
    const r = reasonOn(15, 15);
    expect(r?.weight).toBeCloseTo(WEIGHTS.consensusSplit);
    expect(r?.text).toContain('15–15');
  });

  it('scores a lean below a split', () => {
    const even = reasonOn(15, 15)!;
    const lean = reasonOn(22, 8)!;
    expect(lean.weight).toBeGreaterThan(0);
    expect(lean.weight).toBeLessThan(even.weight);
  });

  it('says nothing when the field broadly agrees', () => {
    expect(reasonOn(28, 2)).toBeNull();
  });

  it('says nothing when the snapshot predates the per-model detail', () => {
    // an absent signal must never be reported as a unanimous one
    expect(reasonOn(null, null, { spread: null, low: null, high: null })).toBeNull();
  });

  it('says nothing for a game no model tipped', () => {
    const g = game(1, 2, { round: 22 });
    const rated = rateGames(snap([g]), [g], { stakes: false })[0];
    expect(rated.reasons.some((r) => r.kind === 'consensus')).toBe(false);
  });

  it('keeps the score equal to the sum of the reasons shown', () => {
    // the card's score is inspectable only if nothing is added invisibly
    const { game: g, snapshot } = withTips(16, 14);
    const rated = rateGames(snapshot, [g], { stakes: false })[0];
    expect(rated.score).toBeCloseTo(rated.reasons.reduce((sum, r) => sum + r.weight, 0));
  });
});

describe('conditions', () => {
  const forecast = (over: Record<string, unknown>) => ({
    fetchedAt: '2026-08-01T00:00:00.000Z',
    games: { '1': { tempC: 15, rainMm: 0, rainChance: 5, windKph: 8, ...over } }
  });

  const reasonFor = (weather: Parameters<typeof rateGames>[2]['weather']) => {
    const g = { ...game(1, 2, { round: 22 }), id: 1 };
    const rated = rateGames(snap([g]), [g], { stakes: false, weather })[0];
    return rated.reasons.find((r) => r.kind === 'weather') ?? null;
  };

  it('argues for a game played in the rain', () => {
    expect(reasonFor(forecast({ rainMm: 3 }))?.text).toContain('Heavy rain');
  });

  it('argues for a game played in a gale', () => {
    expect(reasonFor(forecast({ windKph: 45 }))?.text).toContain('Strong wind');
  });

  it('says nothing about a mild evening', () => {
    expect(reasonFor(forecast({}))).toBeNull();
  });

  it('says nothing when no forecast is deployed', () => {
    // an absent forecast is not a fine day
    expect(reasonFor(null)).toBeNull();
    expect(reasonFor(undefined)).toBeNull();
  });

  it('says nothing about a game the forecast does not cover', () => {
    expect(reasonFor({ fetchedAt: '', games: {} })).toBeNull();
  });
});
