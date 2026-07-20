/**
 * The 18 AFL clubs, keyed by Squiggle team id (stable across the Squiggle API).
 * `name` is the display name — the full "Place + Nickname" form for every club
 * so the labels read consistently; `abbrev` is the 3-letter code used in
 * compact chips. Colors are each club's primary/secondary for chips, bars and
 * cards.
 */
export interface TeamInfo {
  id: number;
  name: string;
  abbrev: string;
  color: string;
  color2: string;
}

export const TEAMS: Record<number, TeamInfo> = {
  1: { id: 1, name: 'Adelaide Crows', abbrev: 'ADE', color: '#002b5c', color2: '#e21937' },
  2: { id: 2, name: 'Brisbane Lions', abbrev: 'BRI', color: '#a30046', color2: '#fdbe57' },
  3: { id: 3, name: 'Carlton Blues', abbrev: 'CAR', color: '#0e1e2d', color2: '#8ba6bf' },
  4: { id: 4, name: 'Collingwood Magpies', abbrev: 'COL', color: '#1c1c1c', color2: '#ffffff' },
  5: { id: 5, name: 'Essendon Bombers', abbrev: 'ESS', color: '#cc2031', color2: '#1c1c1c' },
  6: { id: 6, name: 'Fremantle Dockers', abbrev: 'FRE', color: '#2a0d54', color2: '#ffffff' },
  7: { id: 7, name: 'Geelong Cats', abbrev: 'GEE', color: '#1c3c63', color2: '#ffffff' },
  8: { id: 8, name: 'Gold Coast Suns', abbrev: 'GCS', color: '#d93e39', color2: '#ffe600' },
  9: { id: 9, name: 'GWS Giants', abbrev: 'GWS', color: '#f47920', color2: '#3a3a3a' },
  10: { id: 10, name: 'Hawthorn Hawks', abbrev: 'HAW', color: '#4d2004', color2: '#fbbf15' },
  11: { id: 11, name: 'Melbourne Demons', abbrev: 'MEL', color: '#0f1131', color2: '#cc2031' },
  12: { id: 12, name: 'North Melbourne Kangaroos', abbrev: 'NTH', color: '#013b9f', color2: '#ffffff' },
  13: { id: 13, name: 'Port Adelaide Power', abbrev: 'PTA', color: '#008aab', color2: '#1c1c1c' },
  14: { id: 14, name: 'Richmond Tigers', abbrev: 'RIC', color: '#fed102', color2: '#1c1c1c' },
  15: { id: 15, name: 'St Kilda Saints', abbrev: 'STK', color: '#ed1b2f', color2: '#1c1c1c' },
  16: { id: 16, name: 'Sydney Swans', abbrev: 'SYD', color: '#ed171f', color2: '#ffffff' },
  17: { id: 17, name: 'West Coast Eagles', abbrev: 'WCE', color: '#003087', color2: '#f2a900' },
  18: { id: 18, name: 'Western Bulldogs', abbrev: 'WBD', color: '#014896', color2: '#dc2830' }
};

export function teamName(id: number | null | undefined): string {
  return id != null && TEAMS[id] ? TEAMS[id].name : 'TBD';
}

export function teamAbbrev(id: number | null | undefined): string {
  return id != null && TEAMS[id] ? TEAMS[id].abbrev : 'TBD';
}

/** Relative luminance of a #rrggbb colour (0–255 scale). */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A display-friendly highlight colour for a club: its most vivid identity colour
 * that still reads against the app surface (skips near-white and near-black so
 * black-and-white clubs fall back to a neutral). Used for the predicted-winner
 * edge on match cards.
 */
export function teamAccent(id: number | null | undefined): string {
  const t = id != null ? TEAMS[id] : null;
  if (!t) return '#8b98a5';
  const usable = [t.color, t.color2].filter((c) => {
    const l = luminance(c);
    return l > 30 && l < 220;
  });
  if (usable.length === 0) return '#aeb8c4';
  return usable.sort((a, b) => luminance(b) - luminance(a))[0];
}
