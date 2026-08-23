/**
 * The app's screens, and the URL they live at.
 *
 * Navigation is a hash route rather than component state alone, so every screen
 * is linkable, the browser's back button steps between screens instead of
 * leaving the app, and an installed PWA can be opened straight onto one. The
 * hash is the whole route — the season is a header control, not part of it.
 *
 * A route is a screen plus an optional open game: `#/week/g1234` is "the week
 * screen, with game 1234's sheet open". Keeping the sheet in the route means a
 * particular game can be linked and shared, and that closing it is what the back
 * button does — the behaviour a phone user expects from anything that slides up
 * over the page.
 */

export type Tab = 'week' | 'club' | 'fixtures' | 'ladder' | 'finals' | 'odds' | 'seasons';

const TABS: Tab[] = ['week', 'club', 'fixtures', 'ladder', 'finals', 'odds', 'seasons'];

/**
 * Screens that have been renamed, old name → current one.
 *
 * The finals screen was called "bracket" — the shape it happened to be drawn
 * in rather than the thing it is about — and the hash said so. Renaming it
 * would break every link anyone has saved, an installed PWA's start URL among
 * them, so the old name keeps resolving; it is simply never written again.
 */
const RENAMED: Record<string, Tab> = { bracket: 'finals' };

/** The screen shown when there's no route, or an unrecognised one. */
export const DEFAULT_TAB: Tab = 'week';

/** Screens that only make sense for the live season. */
const LIVE_ONLY: Tab[] = ['week', 'club'];

export function isLiveOnly(tab: Tab): boolean {
  return LIVE_ONLY.includes(tab);
}

/** A screen, plus the game whose sheet is open over it. */
export interface Route {
  tab: Tab;
  gameId: number | null;
}

export function hashFor(tab: Tab, gameId: number | null = null): string {
  return gameId == null ? `#/${tab}` : `#/${tab}/g${gameId}`;
}

/** The screen a location hash names, or null when it names nothing we have. */
export function tabFromHash(hash: string): Tab | null {
  return routeFromHash(hash)?.tab ?? null;
}

/**
 * Parse a location hash into a route. Null when the hash names no screen we
 * have — an unknown game segment is ignored rather than rejected, so a stale
 * link still lands on a real screen instead of bouncing to the default.
 */
export function routeFromHash(hash: string): Route | null {
  const [name, game] = hash.replace(/^#\/?/, '').split('/');
  const tab = (TABS as string[]).includes(name) ? (name as Tab) : RENAMED[name];
  if (!tab) return null;
  const id = /^g\d+$/.test(game ?? '') ? Number(game.slice(1)) : null;
  return { tab, gameId: id };
}
