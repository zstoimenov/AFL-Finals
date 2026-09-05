import type { ProjectedLadderRow } from './types';
import type { SimResult } from './types';

/**
 * The app's simulation measured against Squiggle's.
 *
 * Every other number in the app is the app marking its own homework: the
 * simulation is self-consistent by construction, and self-consistency is not
 * accuracy. Squiggle's models publish their own projected ladder, which is the
 * same question answered independently — the only external check the app has on
 * a forecast that cannot be scored until the season ends.
 *
 * The disagreements are the point. Two projections that agree tell you nothing
 * you didn't already believe; a club the app has ninth and the field has fifth
 * is either the app seeing something or the app being wrong, and either way it
 * is the row worth looking at.
 */

export interface ProjectionGap {
  teamId: number;
  /** where this app's simulation puts the club, 1-based */
  ourRank: number;
  /** where Squiggle's models put it, averaged and rounded to a whole place */
  theirRank: number;
  /** positive when this app is more optimistic about the club than the field */
  gap: number;
}

/**
 * The app's projected finishing order: most likely to play finals first, with
 * deeper runs breaking the ties.
 *
 * The simulation reports each club's chance of reaching a tier rather than a
 * mean ladder position, so the order is reconstructed from those chances. It is
 * an ordering, not a prediction of exact position — which is all a rank
 * comparison needs.
 */
export function projectedOrder(sim: SimResult | null): number[] {
  if (!sim) return [];
  return Object.entries(sim.teams)
    .map(([id, t]) => ({ id: Number(id), t }))
    .sort(
      (a, b) =>
        b.t.makeFinals - a.t.makeFinals ||
        b.t.top6 - a.t.top6 ||
        b.t.top4 - a.t.top4 ||
        b.t.top2 - a.t.top2 ||
        b.t.premier - a.t.premier ||
        a.id - b.id
    )
    .map((r) => r.id);
}

/**
 * Every club where the two projections disagree, widest gap first.
 *
 * Empty when no projection is deployed or the simulation hasn't produced one —
 * the screen shows nothing rather than a table of zeroes, because "we agree
 * about everything" and "we have nothing to compare" look identical in a table
 * and mean opposite things.
 */
export function projectionGaps(
  sim: SimResult | null,
  projected: ProjectedLadderRow[] | null,
  opts: { minGap?: number } = {}
): ProjectionGap[] {
  if (!sim || !projected || projected.length === 0) return [];
  const ourOrder = projectedOrder(sim);
  if (ourOrder.length === 0) return [];

  const ourRank = new Map(ourOrder.map((id, i) => [id, i + 1]));
  const theirRank = new Map(
    [...projected]
      .sort((a, b) => a.projectedRank - b.projectedRank)
      .map((row, i) => [row.id, i + 1])
  );

  const minGap = opts.minGap ?? 1;
  return [...ourRank.entries()]
    .filter(([id]) => theirRank.has(id))
    .map(([teamId, ours]) => ({
      teamId,
      ourRank: ours,
      theirRank: theirRank.get(teamId) as number,
      // positive = this app rates the club higher (a lower rank number)
      gap: (theirRank.get(teamId) as number) - ours
    }))
    .filter((r) => Math.abs(r.gap) >= minGap)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.ourRank - b.ourRank);
}

/**
 * How far apart the two projections are overall: the mean absolute difference in
 * places across the clubs both rank. One number for "do we broadly agree", to
 * sit above the list of individual disagreements.
 */
export function meanRankGap(gaps: ProjectionGap[], compared: number): number | null {
  if (compared <= 0) return null;
  const total = gaps.reduce((sum, g) => sum + Math.abs(g.gap), 0);
  return Math.round((total / compared) * 100) / 100;
}
