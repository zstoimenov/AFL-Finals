import { describe, it, expect } from 'vitest';
import type { Game, Snapshot, Tip } from './types';
import type { Standing } from './types';
import {
  computeRatings,
  carryoverPrior,
  squiggleMargin,
  squiggleConsensusProb,
  blendedHomeProb,
  fixtureHomeProb,
  SQUIGGLE_BLEND,
  MARGIN_PROB_SCALE
} from './predict';

function snap(games: Game[], tips: Tip[]): Snapshot {
  return { games, standings: [], tips, meta: { fetchedAt: '', year: 2026, source: 'seed', currentRound: 1, totalRounds: 24 } };
}

const game: Game = {
  id: 100,
  round: 5,
  year: 2026,
  complete: 0,
  hteamid: 1,
  ateamid: 2,
  hscore: null,
  ascore: null,
  date: '2026-05-01 19:00:00',
  unixtime: 1_800_000_000,
  venue: 'Home A',
  is_final: 0,
  winnerteamid: null
};

describe('squiggleMargin', () => {
  it('flips a tipped margin to the queried home perspective', () => {
    const tip: Tip = { gameid: 100, hteamid: 1, ateamid: 2, hconfidence: 0.6, hmargin: 15, models: 30 };
    const s = snap([game], [tip]);
    expect(squiggleMargin(s, 1, 2)).toBe(15);
    expect(squiggleMargin(s, 2, 1)).toBe(-15);
  });

  it('is null when the tip carries no margin', () => {
    const tip: Tip = { gameid: 100, hteamid: 1, ateamid: 2, hconfidence: 0.6, models: 30 };
    expect(squiggleMargin(snap([game], [tip]), 1, 2)).toBeNull();
  });
});

describe('squiggleConsensusProb', () => {
  it('prefers the predicted margin, converting it to a probability', () => {
    const tip: Tip = { gameid: 100, hteamid: 1, ateamid: 2, hconfidence: 0.55, hmargin: 21, models: 30 };
    const p = squiggleConsensusProb(snap([game], [tip]), 1, 2)!;
    expect(p).toBeCloseTo(1 / (1 + Math.exp(-21 / MARGIN_PROB_SCALE)), 6);
    expect(p).toBeGreaterThan(0.5);
  });

  it('falls back to confidence when no margin is present', () => {
    const tip: Tip = { gameid: 100, hteamid: 1, ateamid: 2, hconfidence: 0.62, models: 30 };
    expect(squiggleConsensusProb(snap([game], [tip]), 1, 2)).toBeCloseTo(0.62, 6);
  });

  it('returns null for an untipped game', () => {
    expect(squiggleConsensusProb(snap([game], []), 1, 2)).toBeNull();
  });
});

describe('carry-over prior', () => {
  // A prior season (2025) where team 1 beats a spread of opponents and team 2
  // loses to them — enough variety that opponent adjustment leaves team 1 strong
  // and team 2 weak.
  const priorGame = (id: number, h: number, a: number, hs: number, as: number): Game => ({
    id,
    round: id,
    year: 2025,
    complete: 100,
    hteamid: h,
    ateamid: a,
    hscore: hs,
    ascore: as,
    date: '2025-06-01 19:00:00',
    unixtime: 1_770_000_000 + id * 86_400,
    venue: 'V',
    is_final: 0,
    winnerteamid: hs > as ? h : a
  });
  const history: Game[] = [
    priorGame(1, 1, 3, 110, 60),
    priorGame(2, 4, 1, 70, 100),
    priorGame(3, 1, 5, 95, 80),
    priorGame(4, 3, 2, 90, 70),
    priorGame(5, 2, 4, 60, 85),
    priorGame(6, 5, 2, 88, 72)
  ];
  const standing = (id: number, played: number, pts: number): Standing => ({
    id,
    rank: 0,
    played,
    wins: pts / 4,
    losses: played - pts / 4,
    draws: 0,
    pts,
    percentage: 100,
    for: 0,
    against: 0
  });

  it('leaves ratings byte-for-byte unchanged when no history is supplied', () => {
    const standings = [standing(1, 6, 12), standing(2, 6, 8)];
    const withoutOpts = computeRatings(standings, []);
    const withEmpty = computeRatings(standings, [], { history: [] });
    expect([...withEmpty]).toEqual([...withoutOpts]);
  });

  it('rates a team with no games this season at exactly its carry-over prior', () => {
    const prior = carryoverPrior(history);
    const standings = [standing(1, 0, 0), standing(2, 0, 0)];
    const ratings = computeRatings(standings, [], { history });
    expect(ratings.get(1)).toBeCloseTo(prior.get(1)!, 10);
    expect(ratings.get(2)).toBeCloseTo(prior.get(2)!, 10);
    // team 1 dominated the prior season, team 2 struggled
    expect(prior.get(1)!).toBeGreaterThan(prior.get(2)!);
  });

  it('gives a team absent from history no prior (neutral 0)', () => {
    const prior = carryoverPrior(history);
    expect(prior.has(99)).toBe(false);
    const ratings = computeRatings([standing(99, 0, 0)], [], { history });
    expect(ratings.get(99)).toBe(0);
  });

  it('fades the prior as the season accumulates games', () => {
    const seasonRating = computeRatings([standing(1, 6, 12)], [])!.get(1)!;
    const early = computeRatings([standing(1, 2, 4)], [], { history }).get(1)!;
    const late = computeRatings([standing(1, 20, 40)], [], { history }).get(1)!;
    const seasonRatingEarly = computeRatings([standing(1, 2, 4)], []).get(1)!;
    const seasonRatingLate = computeRatings([standing(1, 20, 40)], []).get(1)!;
    // winRatio is 0.5 in every case, so the season rating is identical; the only
    // mover is how far the prior pulls it — and that pull must shrink with games.
    expect(seasonRatingEarly).toBeCloseTo(seasonRating, 10);
    expect(seasonRatingLate).toBeCloseTo(seasonRating, 10);
    expect(Math.abs(late - seasonRating)).toBeLessThan(Math.abs(early - seasonRating));
  });
});

describe('blendedHomeProb', () => {
  const ratings = computeRatings([], []); // empty → both teams rate 0

  it('is the model probability when the game is untipped', () => {
    const s = snap([game], []);
    expect(blendedHomeProb(s, ratings, [game], game)).toBeCloseTo(
      fixtureHomeProb(ratings, [game], game),
      6
    );
  });

  it('moves toward the Squiggle consensus when tipped', () => {
    const tip: Tip = { gameid: 100, hteamid: 1, ateamid: 2, hconfidence: 0.9, models: 30 };
    const s = snap([game], [tip]);
    const model = fixtureHomeProb(ratings, [game], game);
    const blended = blendedHomeProb(s, ratings, [game], game);
    const expected = (1 - SQUIGGLE_BLEND) * model + SQUIGGLE_BLEND * 0.9;
    expect(blended).toBeCloseTo(expected, 6);
    expect(blended).toBeGreaterThan(model);
  });
});
