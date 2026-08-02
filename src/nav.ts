/**
 * The app's screens, and the URL they live at.
 *
 * Navigation is a hash route rather than component state alone, so every screen
 * is linkable, the browser's back button steps between screens instead of
 * leaving the app, and an installed PWA can be opened straight onto one. The
 * hash is the whole route — the season is a header control, not part of it.
 */

export type Tab = 'week' | 'club' | 'fixtures' | 'ladder' | 'bracket' | 'odds' | 'seasons';

const TABS: Tab[] = ['week', 'club', 'fixtures', 'ladder', 'bracket', 'odds', 'seasons'];

/** The screen shown when there's no route, or an unrecognised one. */
export const DEFAULT_TAB: Tab = 'week';

/** Screens that only make sense for the live season. */
const LIVE_ONLY: Tab[] = ['week', 'club'];

export function isLiveOnly(tab: Tab): boolean {
  return LIVE_ONLY.includes(tab);
}

export function hashFor(tab: Tab): string {
  return `#/${tab}`;
}

/** The screen a location hash names, or null when it names nothing we have. */
export function tabFromHash(hash: string): Tab | null {
  const name = hash.replace(/^#\/?/, '');
  return (TABS as string[]).includes(name) ? (name as Tab) : null;
}
