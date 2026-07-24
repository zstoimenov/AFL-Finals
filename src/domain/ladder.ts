import type { Game, Standing } from './types';

/** Games from the home & away season that don't yet have a result. */
export function remainingHomeAwayGames(games: Game[]): Game[] {
  return games.filter((g) => g.is_final === 0 && !g.complete);
}

/** Home & away rounds present in the fixture, ascending. */
export function homeAwayRounds(games: Game[]): number[] {
  return [...new Set(games.filter((g) => g.is_final === 0).map((g) => g.round))].sort(
    (a, b) => a - b
  );
}

/**
 * The round the Fixtures view should open on: the earliest H&A round that still
 * has an unplayed game, or the last round once the season is complete. As the
 * daily update fills in results, this advances on its own to the next round.
 */
export function currentHomeAwayRound(games: Game[]): number {
  const rounds = homeAwayRounds(games);
  if (rounds.length === 0) return 0;
  const incomplete = games.filter((g) => g.is_final === 0 && !g.complete).map((g) => g.round);
  return incomplete.length > 0 ? Math.min(...incomplete) : rounds[rounds.length - 1];
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
