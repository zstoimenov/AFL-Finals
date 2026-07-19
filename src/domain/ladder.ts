import type { Game, Standing } from './types';

/** Games from the home & away season that don't yet have a result. */
export function remainingHomeAwayGames(games: Game[]): Game[] {
  return games.filter((g) => g.is_final === 0 && !g.complete);
}

export function finalsGames(games: Game[]): Game[] {
  // a real finals game needs actual participants — guards against upstream
  // placeholder fixtures (TBD v TBD) sneaking into a snapshot
  return games.filter((g) => g.is_final > 0 && g.hteamid > 0 && g.ateamid > 0);
}

export function remainingGamesByTeam(games: Game[]): Map<number, Game[]> {
  const map = new Map<number, Game[]>();
  for (const g of remainingHomeAwayGames(games)) {
    for (const id of [g.hteamid, g.ateamid]) {
      const list = map.get(id) ?? [];
      list.push(g);
      map.set(id, list);
    }
  }
  return map;
}

/** Standings sorted by ladder rank (pts desc, percentage desc). */
export function sortedStandings(standings: Standing[]): Standing[] {
  return [...standings].sort(
    (a, b) => b.pts - a.pts || b.percentage - a.percentage || a.id - b.id
  );
}

/**
 * Win/loss form over a team's last `n` completed games, most recent first.
 * Returns values in [0,1]: 1 = won all recent games. Draws count half.
 */
export function recentForm(games: Game[], teamId: number, n = 5): number {
  const played = games
    .filter(
      (g) => g.complete && (g.hteamid === teamId || g.ateamid === teamId) && g.hscore != null
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, n);
  if (played.length === 0) return 0.5;
  let score = 0;
  for (const g of played) {
    if (g.hscore === g.ascore) score += 0.5;
    else if ((g.winnerteamid ?? (g.hscore! > g.ascore! ? g.hteamid : g.ateamid)) === teamId)
      score += 1;
  }
  return score / played.length;
}
