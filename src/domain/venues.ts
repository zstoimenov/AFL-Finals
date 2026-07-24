import type { Game } from './types';

/**
 * Venue signals derived entirely from the game history we already fetch — no
 * hardcoded ground list, so it stays correct as the fixture and any new venues
 * change season to season.
 *
 * A team's "home venues" are simply the grounds it has hosted games at (appeared
 * as `hteamid`). An away side playing at a ground outside its own home set is
 * treated as travelling — the AFL's away-from-fortress / interstate effect, which
 * a single flat home-ground bump misses entirely.
 */

/** Map of teamId -> set of venue names the team has hosted at. */
export function homeVenuesByTeam(games: Game[]): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const g of games) {
    if (!g.venue) continue;
    const set = map.get(g.hteamid) ?? new Set<string>();
    set.add(g.venue);
    map.set(g.hteamid, set);
  }
  return map;
}

/**
 * Is `game` a trip away from home for the away side? True when the venue is not
 * one of the away team's own home grounds. Unknown venues fall back to false
 * (treat as non-travel) so a missing venue never invents a penalty.
 */
export function isAwayTravelling(
  homeVenues: Map<number, Set<string>>,
  game: Game
): boolean {
  if (!game.venue) return false;
  const awayHomes = homeVenues.get(game.ateamid);
  if (!awayHomes || awayHomes.size === 0) return false;
  return !awayHomes.has(game.venue);
}

/**
 * Is the host actually at one of its own home grounds? A "home" team sometimes
 * sells a game to a neutral/interstate venue; when it isn't really at home the
 * home-ground edge shouldn't apply in full.
 */
export function isHostAtHome(
  homeVenues: Map<number, Set<string>>,
  game: Game
): boolean {
  if (!game.venue) return true; // no venue info — assume the nominal host is home
  const homes = homeVenues.get(game.hteamid);
  if (!homes || homes.size === 0) return true;
  return homes.has(game.venue);
}
