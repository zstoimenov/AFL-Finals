import type { Snapshot } from '../domain/types';

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
