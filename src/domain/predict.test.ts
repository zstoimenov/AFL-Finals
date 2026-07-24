import { describe, it, expect } from 'vitest';
import type { Game, Snapshot, Tip } from './types';
import {
  computeRatings,
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
