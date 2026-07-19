import { createContext } from 'react';

/** Provides "open the detail sheet for team X" to any component rendering teams. */
export const TeamSelectContext = createContext<((teamId: number) => void) | null>(null);
