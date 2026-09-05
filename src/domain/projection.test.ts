import { describe, expect, it } from 'vitest';
import { meanRankGap, projectedOrder, projectionGaps } from './projection';
import type { ProjectedLadderRow, SimResult } from './types';

/** A simulation where makeFinals descends with the team id. */
function sim(order: number[]): SimResult {
  const teams: SimResult['teams'] = {};
  order.forEach((id, i) => {
    const p = 1 - i * 0.05;
    teams[id] = { makeFinals: p, top6: p, top4: p, top2: p, reachGF: p, premier: p };
  });
  return { iterations: 10000, teams };
}

const projected = (order: number[]): ProjectedLadderRow[] =>
  order.map((id, i) => ({ id, projectedRank: i + 1, sources: 3 }));

describe('projectedOrder', () => {
  it('orders clubs by their chance of playing finals', () => {
    expect(projectedOrder(sim([7, 3, 9]))).toEqual([7, 3, 9]);
  });

  it('is empty before the simulation has produced anything', () => {
    expect(projectedOrder(null)).toEqual([]);
  });
});

describe('projectionGaps', () => {
  it('finds the clubs the two projections disagree about, widest first', () => {
    // this app: 1,2,3,4 — Squiggle: 4,2,3,1
    const gaps = projectionGaps(sim([1, 2, 3, 4]), projected([4, 2, 3, 1]));
    expect(gaps[0].teamId).toBe(1);
    expect(gaps[0].ourRank).toBe(1);
    expect(gaps[0].theirRank).toBe(4);
    expect(gaps[0].gap).toBe(3);
  });

  it('signs the gap so optimism and pessimism read differently', () => {
    const gaps = projectionGaps(sim([1, 2]), projected([2, 1]));
    const one = gaps.find((g) => g.teamId === 1)!;
    const two = gaps.find((g) => g.teamId === 2)!;
    // positive means this app rates the club above the field
    expect(one.gap).toBeGreaterThan(0);
    expect(two.gap).toBeLessThan(0);
  });

  it('says nothing when the two projections agree', () => {
    expect(projectionGaps(sim([1, 2, 3]), projected([1, 2, 3]))).toEqual([]);
  });

  it('can ignore disagreements too small to be worth a row', () => {
    // a one-place difference is noise between two simulations
    const gaps = projectionGaps(sim([1, 2, 3]), projected([2, 1, 3]), { minGap: 2 });
    expect(gaps).toEqual([]);
  });

  it('ranks by order, not by the raw averaged rank', () => {
    // Squiggle's ranks are averaged across models and need not be 1..18
    const gaps = projectionGaps(sim([1, 2]), [
      { id: 2, projectedRank: 1.2, sources: 4 },
      { id: 1, projectedRank: 6.8, sources: 4 }
    ]);
    expect(gaps.find((g) => g.teamId === 1)?.theirRank).toBe(2);
  });

  it('ignores a club only one of the two projections knows about', () => {
    const gaps = projectionGaps(sim([1, 2, 3]), projected([3, 1]));
    expect(gaps.every((g) => g.teamId !== 2)).toBe(true);
  });

  it('is empty with no projection deployed, or no simulation yet', () => {
    // "we agree about everything" and "we have nothing to compare" look the
    // same in a table and mean the opposite, so the caller renders nothing
    expect(projectionGaps(sim([1, 2]), null)).toEqual([]);
    expect(projectionGaps(sim([1, 2]), [])).toEqual([]);
    expect(projectionGaps(null, projected([1, 2]))).toEqual([]);
  });
});

describe('meanRankGap', () => {
  it('averages the disagreement over every club compared', () => {
    const gaps = projectionGaps(sim([1, 2, 3, 4]), projected([4, 2, 3, 1]));
    // two clubs out by three places each, across four clubs compared
    expect(meanRankGap(gaps, 4)).toBeCloseTo(1.5);
  });

  it('is null when nothing was compared', () => {
    expect(meanRankGap([], 0)).toBeNull();
  });
});
