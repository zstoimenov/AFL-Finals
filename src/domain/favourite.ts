/**
 * The user's club — highlighted throughout the app so their team and their
 * matches are easy to spot. This is the single source of truth: change the one
 * id here to follow a different club and every highlight moves with it.
 */
export const FAVOURITE_TEAM_ID = 6; // Fremantle

/** True when this team is the user's club. */
export function isFavourite(teamId: number | null | undefined): boolean {
  return teamId != null && teamId === FAVOURITE_TEAM_ID;
}

/** True when the user's club is playing in this game. */
export function gameHasFavourite(
  game: { hteamid: number; ateamid: number } | null | undefined
): boolean {
  return game != null && (isFavourite(game.hteamid) || isFavourite(game.ateamid));
}
