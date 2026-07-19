import type { Snapshot } from '../domain/types';

/**
 * Loads the deployed data snapshots. These are static JSON files committed by
 * the scheduled update workflow; the service worker caches them network-first
 * so the app works offline with the last-synced data.
 */
export async function loadSnapshot(): Promise<Snapshot> {
  const base = import.meta.env.BASE_URL;
  const get = async <T>(name: string): Promise<T> => {
    const res = await fetch(`${base}data/${name}.json`);
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
