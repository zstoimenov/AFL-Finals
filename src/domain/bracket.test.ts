import { describe, expect, it } from 'vitest';
import { matchParticipants, reseedWildcardWinners, type MatchKey } from './bracket';

// seeds[0] = 1st … seeds[9] = 10th; use team ids 101..110 for clarity
const seeds = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
const seedOf = new Map(seeds.map((id, i) => [id, i + 1]));

describe('2026 wildcard round wiring', () => {
  it('pairs 7v10 and 8v9', () => {
    expect(matchParticipants('WC1', seeds, {})).toEqual({ home: 107, away: 110 });
    expect(matchParticipants('WC2', seeds, {})).toEqual({ home: 108, away: 109 });
  });

  it('re-seeds the higher-ranked winner as 7th', () => {
    // 7th and 8th win: 7 stays 7th seed, 8 stays 8th
    expect(reseedWildcardWinners(107, 108, seedOf)).toEqual({ seed7: 107, seed8: 108 });
    // 10th and 9th win: 9th outranks 10th → 9th becomes the 7 seed
    expect(reseedWildcardWinners(110, 109, seedOf)).toEqual({ seed7: 109, seed8: 110 });
    // 7th and 9th win: 7th is best
    expect(reseedWildcardWinners(107, 109, seedOf)).toEqual({ seed7: 107, seed8: 109 });
  });

  it('sends re-seeded 8 to EF1 (v 5th) and re-seeded 7 to EF2 (v 6th)', () => {
    // upsets: 10th beats 7th, 8th beats 9th → 8th re-seeds as 7, 10th as 8
    const results = { WC1: 110, WC2: 108 };
    expect(matchParticipants('EF1', seeds, results)).toEqual({ home: 105, away: 110 });
    expect(matchParticipants('EF2', seeds, results)).toEqual({ home: 106, away: 108 });
  });

  it('leaves EF away slots open until both wildcards are decided', () => {
    expect(matchParticipants('EF1', seeds, { WC1: 107 })).toEqual({ home: 105, away: null });
  });
});

describe('weeks 2–5 wiring', () => {
  it('QFs are 1v4 and 2v3', () => {
    expect(matchParticipants('QF1', seeds, {})).toEqual({ home: 101, away: 104 });
    expect(matchParticipants('QF2', seeds, {})).toEqual({ home: 102, away: 103 });
  });

  it('semis host the QF losers against EF winners', () => {
    const results: Partial<Record<MatchKey, number>> = {
      WC1: 107, WC2: 108,
      QF1: 104, // 1st loses QF1
      QF2: 102,
      EF1: 108, EF2: 106
    };
    expect(matchParticipants('SF1', seeds, results)).toEqual({ home: 101, away: 108 });
    expect(matchParticipants('SF2', seeds, results)).toEqual({ home: 103, away: 106 });
  });

  it('prelims host QF winners against cross semi winners; GF pairs PF winners', () => {
    const results: Partial<Record<MatchKey, number>> = {
      WC1: 107, WC2: 108,
      QF1: 104, QF2: 102,
      EF1: 108, EF2: 106,
      SF1: 101, SF2: 106,
      PF1: 104, PF2: 102
    };
    expect(matchParticipants('PF1', seeds, results)).toEqual({ home: 104, away: 106 });
    expect(matchParticipants('PF2', seeds, results)).toEqual({ home: 102, away: 101 });
    expect(matchParticipants('GF', seeds, results)).toEqual({ home: 104, away: 102 });
  });
});
