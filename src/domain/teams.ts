/**
 * The 18 AFL clubs, keyed by Squiggle team id (stable across the Squiggle API).
 * Colors are each club's primary/secondary for chips, bars and cards.
 */
export interface TeamInfo {
  id: number;
  name: string;
  abbrev: string;
  color: string;
  color2: string;
}

export const TEAMS: Record<number, TeamInfo> = {
  1: { id: 1, name: 'Adelaide', abbrev: 'ADE', color: '#002b5c', color2: '#e21937' },
  2: { id: 2, name: 'Brisbane Lions', abbrev: 'BRI', color: '#a30046', color2: '#fdbe57' },
  3: { id: 3, name: 'Carlton', abbrev: 'CAR', color: '#0e1e2d', color2: '#8ba6bf' },
  4: { id: 4, name: 'Collingwood', abbrev: 'COL', color: '#1c1c1c', color2: '#ffffff' },
  5: { id: 5, name: 'Essendon', abbrev: 'ESS', color: '#cc2031', color2: '#1c1c1c' },
  6: { id: 6, name: 'Fremantle', abbrev: 'FRE', color: '#2a0d54', color2: '#ffffff' },
  7: { id: 7, name: 'Geelong', abbrev: 'GEE', color: '#1c3c63', color2: '#ffffff' },
  8: { id: 8, name: 'Gold Coast', abbrev: 'GCS', color: '#d93e39', color2: '#ffe600' },
  9: { id: 9, name: 'Greater Western Sydney', abbrev: 'GWS', color: '#f47920', color2: '#3a3a3a' },
  10: { id: 10, name: 'Hawthorn', abbrev: 'HAW', color: '#4d2004', color2: '#fbbf15' },
  11: { id: 11, name: 'Melbourne', abbrev: 'MEL', color: '#0f1131', color2: '#cc2031' },
  12: { id: 12, name: 'North Melbourne', abbrev: 'NTH', color: '#013b9f', color2: '#ffffff' },
  13: { id: 13, name: 'Port Adelaide', abbrev: 'PTA', color: '#008aab', color2: '#1c1c1c' },
  14: { id: 14, name: 'Richmond', abbrev: 'RIC', color: '#fed102', color2: '#1c1c1c' },
  15: { id: 15, name: 'St Kilda', abbrev: 'STK', color: '#ed1b2f', color2: '#1c1c1c' },
  16: { id: 16, name: 'Sydney', abbrev: 'SYD', color: '#ed171f', color2: '#ffffff' },
  17: { id: 17, name: 'West Coast', abbrev: 'WCE', color: '#003087', color2: '#f2a900' },
  18: { id: 18, name: 'Western Bulldogs', abbrev: 'WBD', color: '#014896', color2: '#dc2830' }
};

export function teamName(id: number | null | undefined): string {
  return id != null && TEAMS[id] ? TEAMS[id].name : 'TBD';
}

export function teamAbbrev(id: number | null | undefined): string {
  return id != null && TEAMS[id] ? TEAMS[id].abbrev : 'TBD';
}
