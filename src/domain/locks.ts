import type { Game, Standing, TeamLocks } from './types';
import { remainingGamesByTeam, sortedStandings } from './ladder';

const PTS_PER_WIN = 4;

/**
 * Mathematical clinch / elimination engine.
 *
 * For every team we bound its final points tally: minPts (loses every remaining
 * H&A game) and maxPts (wins every remaining game). A team is locked INTO a
 * tier of size N when even in the worst case it cannot be pushed out — i.e.
 * fewer than N other teams can finish strictly above it. It is locked OUT when
 * even in the best case it cannot break in. The rule is conservative on
 * purpose: teams that could tie on points are counted as able to pass (ladder
 * ties are split by percentage, which we don't try to bound), so a reported
 * lock is always a true mathematical certainty.
 */
export function computeLocks(standings: Standing[], games: Game[]): TeamLocks[] {
  const remaining = remainingGamesByTeam(games);
  const ladder = sortedStandings(standings);

  const bounds = ladder.map((s) => {
    const left = remaining.get(s.id)?.length ?? 0;
    return {
      teamId: s.id,
      pts: s.pts,
      pct: s.percentage,
      minPts: s.pts,
      maxPts: s.pts + left * PTS_PER_WIN
    };
  });

  return bounds.map((me, idx) => {
    const others = bounds.filter((b) => b.teamId !== me.teamId);
    // teams that can still finish strictly above us on points, or tie us
    // (a tie may resolve against us via percentage — treat as able to pass)
    const canPassMe = others.filter((o) => o.maxPts >= me.minPts).length;
    // teams we can never catch even winning out (they stay above us regardless)
    const alwaysAboveMe = others.filter((o) => o.minPts > me.maxPts).length;

    const inTop = (n: number) => canPassMe < n; // fewer than n can end above us
    const outOfTop = (n: number) => alwaysAboveMe >= n; // at least n are unreachably above

    // exact lock: nobody below can catch us AND we can't catch anyone above.
    // Above/below defined by current ladder order; conservative tie handling.
    const above = bounds.slice(0, idx);
    const below = bounds.slice(idx + 1);
    const lockedExact =
      above.every((o) => o.minPts > me.maxPts) && below.every((o) => o.maxPts < me.minPts);

    return {
      teamId: me.teamId,
      rank: idx + 1,
      minPts: me.minPts,
      maxPts: me.maxPts,
      inTop2: inTop(2),
      inTop4: inTop(4),
      inTop6: inTop(6),
      inTop10: inTop(10),
      outOfTop2: outOfTop(2),
      outOfTop4: outOfTop(4),
      outOfTop6: outOfTop(6),
      outOfTop10: outOfTop(10),
      lockedExact
    };
  });
}

/** Human label for the strongest lock a team holds, or null. */
export function lockLabel(l: TeamLocks): string | null {
  if (l.outOfTop10) return 'Eliminated';
  if (l.lockedExact) return `Locked #${l.rank}`;
  if (l.inTop2) return 'Top 2 locked';
  if (l.inTop4) return 'Top 4 locked';
  if (l.inTop6) return 'Finals bye locked';
  if (l.inTop10) return 'Finals locked';
  return null;
}
