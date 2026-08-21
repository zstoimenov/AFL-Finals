import { useEffect, useState } from 'react';

/**
 * Whether the browser thinks it has a connection.
 *
 * The service worker serves the data snapshots network-first and falls back to
 * cache, so offline the app keeps working — silently. The timestamp in the
 * header then reads as "this is when the data was published" when what it
 * actually means is "this is all we have until you're back". Saying so is the
 * difference between stale data and wrong data.
 *
 * `navigator.onLine` only knows about the network interface, not whether
 * anything is reachable through it — false is reliable, true is a hope. It is
 * used only to soften the claim, never to block a fetch.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
