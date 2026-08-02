import type { Game } from './types';

/**
 * Standing club rivalries.
 *
 * Squiggle's feed carries no rivalry field — a derby looks exactly like any
 * other fixture in the data — so the rivalries that hold every year live here as
 * curated reference data, keyed by the same team ids as `teams.ts`. The list is
 * deliberately short: only rivalries with a real, durable identity, so a
 * "rivalry" badge in the app always means something.
 *
 * Rivalries that are *earned* rather than traditional — two clubs whose recent
 * meetings have been decided by a kick, or a rematch of last year's finals — are
 * derived from results instead (see `interest.ts`), so this table never has to be
 * edited to keep up with a season.
 */

export type RivalryKind = 'derby' | 'traditional';

export interface Rivalry {
  /** the two clubs, ascending by team id */
  teams: [number, number];
  /** the rivalry's own name, true whenever these two meet */
  name: string;
  /** same-city derby, or a traditional (usually Victorian) rivalry */
  kind: RivalryKind;
  /**
   * A fixed-date occasion this fixture becomes when it falls on that day. Only
   * genuinely fixed dates belong here — movable feasts (Easter Monday, King's
   * Birthday, Dreamtime) shift every year, so those meetings are reported as the
   * plain rivalry rather than claiming an occasion the fixture may not be.
   */
  occasion?: { month: number; day: number; name: string };
}

const RIVALRIES: Rivalry[] = [
  // same-city derbies — permanent names, played twice a season
  { teams: [6, 17], name: 'Western Derby', kind: 'derby' },
  { teams: [1, 13], name: 'Showdown', kind: 'derby' },
  { teams: [2, 8], name: 'QClash', kind: 'derby' },
  { teams: [9, 16], name: 'Sydney Derby', kind: 'derby' },
  // traditional rivalries
  {
    teams: [4, 5],
    name: 'Collingwood v Essendon',
    kind: 'traditional',
    occasion: { month: 4, day: 25, name: 'ANZAC Day clash' }
  },
  { teams: [3, 4], name: 'Carlton v Collingwood', kind: 'traditional' },
  { teams: [3, 14], name: 'Carlton v Richmond', kind: 'traditional' },
  { teams: [4, 11], name: 'Collingwood v Melbourne', kind: 'traditional' },
  { teams: [5, 14], name: 'Essendon v Richmond', kind: 'traditional' },
  { teams: [7, 10], name: 'Geelong v Hawthorn', kind: 'traditional' }
];

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

const BY_PAIR = new Map<string, Rivalry>(
  RIVALRIES.map((r) => [key(r.teams[0], r.teams[1]), r])
);

/** The standing rivalry between two clubs, or null when they don't have one. */
export function rivalryFor(a: number, b: number): Rivalry | null {
  return BY_PAIR.get(key(a, b)) ?? null;
}

/**
 * What to call this particular meeting: the occasion when the fixture actually
 * falls on that date, else the rivalry's own name. The date is read from the
 * game's venue-local `date` string, which is the right frame for a calendar
 * occasion like ANZAC Day.
 */
export function rivalryLabel(rivalry: Rivalry, game: Game): string {
  const occ = rivalry.occasion;
  if (!occ) return rivalry.name;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(game.date ?? '');
  if (m && Number(m[2]) === occ.month && Number(m[3]) === occ.day) return occ.name;
  return rivalry.name;
}

/** Every curated rivalry — for tests and for the explanatory info panel. */
export function allRivalries(): Rivalry[] {
  return RIVALRIES;
}
