import { useSyncExternalStore } from 'react';
import { TEAMS } from './teams';

/**
 * The user's club — highlighted throughout the app so their team and their
 * matches are easy to spot, and the subject of the My Club dashboard.
 *
 * The choice is stored in the browser, so it follows the person rather than the
 * build. `DEFAULT_FAVOURITE_TEAM_ID` is only the starting point for someone who
 * has never picked.
 *
 * `isFavourite` / `gameHasFavourite` are deliberately plain functions, not
 * hooks: they're called from deep inside chips, rows and cards all over the app,
 * and threading a hook through every one of them would be a large diff for a
 * value that changes about once a lifetime. Instead the store is a module-level
 * value, and `useFavourite()` — subscribed once, high in the tree — re-renders
 * everything below it when the club changes.
 */

export const DEFAULT_FAVOURITE_TEAM_ID = 6; // Fremantle

const STORAGE_KEY = 'afl-favourite';
/** Stored value meaning "I chose to follow no club" — distinct from unset. */
const NONE = 'none';

function load(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_FAVOURITE_TEAM_ID;
    if (raw === NONE) return null;
    const id = Number(raw);
    return TEAMS[id] ? id : DEFAULT_FAVOURITE_TEAM_ID;
  } catch {
    // storage unavailable (private mode, embedded webview) — use the default
    return DEFAULT_FAVOURITE_TEAM_ID;
  }
}

let current: number | null = load();
const listeners = new Set<() => void>();

/** The user's club id, or null when they've chosen not to follow one. */
export function favouriteTeamId(): number | null {
  return current;
}

/** Choose a club (or null to follow none). Persists and re-renders the app. */
export function setFavourite(teamId: number | null): void {
  if (teamId != null && !TEAMS[teamId]) return;
  current = teamId;
  try {
    localStorage.setItem(STORAGE_KEY, teamId == null ? NONE : String(teamId));
  } catch {
    /* storage unavailable — the choice lasts the session only */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Subscribe to the club choice. Call this once near the root: everything below
 * re-renders when it changes, so the plain `isFavourite` checks scattered
 * through the tree stay correct without each one subscribing.
 */
export function useFavourite(): number | null {
  return useSyncExternalStore(subscribe, favouriteTeamId, favouriteTeamId);
}

/** True when this team is the user's club. */
export function isFavourite(teamId: number | null | undefined): boolean {
  return teamId != null && current != null && teamId === current;
}

/** True when the user's club is playing in this game. */
export function gameHasFavourite(
  game: { hteamid: number; ateamid: number } | null | undefined
): boolean {
  return game != null && (isFavourite(game.hteamid) || isFavourite(game.ateamid));
}
