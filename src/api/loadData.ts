import type {
  Game,
  HistoryIndexEntry,
  ProjectedLadderRow,
  Snapshot,
  TipsterCorpus,
  WeatherSnapshot
} from '../domain/types';

/**
 * Loads the deployed data snapshots. These are static JSON files committed by
 * the scheduled update workflow; the service worker caches them network-first
 * so the app works offline with the last-synced data.
 */
export async function loadSnapshot(bustCache = false): Promise<Snapshot> {
  const base = import.meta.env.BASE_URL;
  // when the user hits Refresh, force the network and skip the service-worker
  // cache so a freshly-published snapshot is picked up immediately
  const suffix = bustCache ? `?t=${Date.now()}` : '';
  const get = async <T>(name: string): Promise<T> => {
    const res = await fetch(`${base}data/${name}.json${suffix}`, {
      cache: bustCache ? 'reload' : 'default'
    });
    if (!res.ok) throw new Error(`Failed to load ${name}.json (${res.status})`);
    return (await res.json()) as T;
  };
  const [games, standings, tips, meta] = await Promise.all([
    get<Snapshot['games']>('games'),
    get<Snapshot['standings']>('standings'),
    get<Snapshot['tips']>('tips'),
    get<Snapshot['meta']>('meta')
  ]);
  return { games, standings, tips, meta };
}

async function getData<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = import.meta.env.BASE_URL;
    const res = await fetch(`${base}data/${path}`);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * The multi-season history manifest (`history/index.json`). Fail-soft: an app
 * deployed before the history archive exists just sees an empty list and behaves
 * exactly as the single-season app did.
 */
export function loadHistoryIndex(): Promise<HistoryIndexEntry[]> {
  return getData<HistoryIndexEntry[]>('history/index.json', []);
}

/**
 * The compact cross-season corpus (`history/games.json`) — every completed game
 * from archived seasons, feeding the model's carry-over prior. Loaded once at
 * startup; empty when no archive is deployed.
 */
export function loadHistoryCorpus(): Promise<Game[]> {
  return getData<Game[]>('history/games.json', []);
}

/**
 * A single archived season's full snapshot (`history/<year>.json`), loaded lazily
 * when the user opens that season in the hub. Null when unavailable.
 */
export function loadSeason(year: number): Promise<Snapshot | null> {
  return getData<Snapshot | null>(`history/${year}.json`, null);
}

/**
 * Every model's individual tip for the live season (`tipsters.json`), behind the
 * consensus the app blends. Around 150KB and read by one screen, so it is
 * fetched when the hub opens rather than at startup. Fail-soft: null on a
 * deployment whose snapshot predates the file, and the hub simply shows no
 * tipster leaderboard.
 */
export function loadTipsters(): Promise<TipsterCorpus | null> {
  return getData<TipsterCorpus | null>('tipsters.json', null);
}

/**
 * The kickoff forecast for upcoming fixtures (`weather.json`). Small, and read
 * by the week screen and every game sheet, so it loads at startup. Fail-soft:
 * null when the file isn't deployed, and the app shows no conditions anywhere —
 * exactly as it did before weather existed.
 */
export function loadWeather(): Promise<WeatherSnapshot | null> {
  return getData<WeatherSnapshot | null>('weather.json', null);
}

/**
 * Squiggle's own projected end-of-season ladder (`projected.json`), the one
 * external check on the app's simulation. Tiny, and read only by the odds
 * screen. Fail-soft: an empty list means the comparison block is not rendered at
 * all, which is the honest reading — no projection is not the same as agreement.
 */
export function loadProjectedLadder(): Promise<ProjectedLadderRow[]> {
  return getData<ProjectedLadderRow[]>('projected.json', []);
}
