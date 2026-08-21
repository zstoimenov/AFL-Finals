import { createContext } from 'react';

/**
 * Provides "open the sheet for game X" to any component rendering a fixture.
 *
 * The same shape as `TeamSelectContext`: cards are scattered across four screens
 * and threading a callback through every list and card would be a wide diff for
 * one action. The sheet itself lives in the route, so this only has to say which
 * game — `App` turns that into a URL.
 */
export const GameSelectContext = createContext<((gameId: number | null) => void) | null>(null);
