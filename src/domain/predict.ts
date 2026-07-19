import type { Game, Snapshot, Standing } from './types';
import { recentForm } from './ladder';

/**
 * Transparent team rating: blend of season win ratio, percentage (log-scaled)
 * and last-5 form. Scale roughly [-2.5, +2.5]; the logistic below turns a
 * rating gap into a win probability.
 */
export function computeRatings(standings: Standing[], games: Game[]): Map<number, number> {
  const ratings = new Map<number, number>();
  for (const s of standings) {
    const maxPts = s.played > 0 ? s.played * 4 : 1;
    const winRatio = s.pts / maxPts;
    const pctTerm = Math.log(Math.max(s.percentage, 40) / 100);
    const form = recentForm(games, s.id, 5);
    const rating = 2.0 * (winRatio - 0.5) + 2.2 * pctTerm + 0.8 * (form - 0.5);
    ratings.set(s.id, rating);
  }
  return ratings;
}

/** Home-ground advantage as a rating bump (≈ +6% win prob at even ratings). */
export const HOME_ADVANTAGE = 0.25;

/**
 * P(home wins) from the rating gap via a logistic curve.
 * `neutral` disables home advantage (Grand Final at the MCG).
 */
export function winProb(
  ratings: Map<number, number>,
  homeId: number,
  awayId: number,
  neutral = false
): number {
  const rh = ratings.get(homeId) ?? 0;
  const ra = ratings.get(awayId) ?? 0;
  const gap = rh - ra + (neutral ? 0 : HOME_ADVANTAGE);
  const p = 1 / (1 + Math.exp(-1.1 * gap));
  return Math.min(0.97, Math.max(0.03, p));
}

/** Squiggle consensus P(home wins) for a fixture, if models have tipped it. */
export function squiggleProb(
  snapshot: Snapshot,
  homeId: number,
  awayId: number
): number | null {
  const tip = snapshot.tips.find(
    (t) =>
      (t.hteamid === homeId && t.ateamid === awayId) ||
      (t.hteamid === awayId && t.ateamid === homeId)
  );
  if (!tip) return null;
  return tip.hteamid === homeId ? tip.hconfidence : 1 - tip.hconfidence;
}
