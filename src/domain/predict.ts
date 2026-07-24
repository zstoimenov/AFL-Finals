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

/** Kickoff instant (epoch seconds) — unixtime when present, else the parsed date. */
function gameStart(g: Game): number {
  if (g.unixtime && g.unixtime > 0) return g.unixtime;
  const t = Date.parse((g.date ?? '').replace(' ', 'T'));
  return Number.isNaN(t) ? 0 : Math.round(t / 1000);
}

/**
 * Rebuild the ladder from every completed home & away game that started before
 * `cutoff`, so a finished game can be scored on the rating the model *would*
 * have had going in — not one that already knows the result.
 */
function standingsBefore(games: Game[], cutoff: number): Standing[] {
  const table = new Map<number, Standing>();
  const row = (id: number): Standing => {
    let s = table.get(id);
    if (!s) {
      s = { id, rank: 0, played: 0, wins: 0, losses: 0, draws: 0, pts: 0, percentage: 100, for: 0, against: 0 };
      table.set(id, s);
    }
    return s;
  };
  for (const g of games) {
    if (g.is_final !== 0 || !g.complete || g.hscore == null || g.ascore == null) continue;
    if (gameStart(g) >= cutoff) continue;
    const h = row(g.hteamid);
    const a = row(g.ateamid);
    h.played++; a.played++;
    h.for += g.hscore; h.against += g.ascore;
    a.for += g.ascore; a.against += g.hscore;
    if (g.hscore > g.ascore) { h.wins++; a.losses++; h.pts += 4; }
    else if (g.ascore > g.hscore) { a.wins++; h.losses++; a.pts += 4; }
    else { h.draws++; a.draws++; h.pts += 2; a.pts += 2; }
  }
  for (const s of table.values()) {
    s.percentage = s.against > 0 ? (s.for / s.against) * 100 : 100;
  }
  return [...table.values()];
}

/**
 * The in-app model's P(home wins) as it would have stood before a given game —
 * built from results and form up to kickoff only. Lets a completed fixture show
 * whether the model's pre-game tip actually came off, without hindsight leaking
 * this game's result into its own rating.
 */
export function preGameHomeProb(snapshot: Snapshot, game: Game): number {
  const cutoff = gameStart(game);
  const prior = snapshot.games.filter((g) => gameStart(g) < cutoff);
  const ratings = computeRatings(standingsBefore(prior, cutoff), prior);
  return winProb(ratings, game.hteamid, game.ateamid);
}
