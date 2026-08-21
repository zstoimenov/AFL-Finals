/// <reference lib="webworker" />
import { simulateSeason } from './domain/simulate';
import type { Game, Snapshot } from './domain/types';

/**
 * Runs the Monte Carlo off the main thread, posting the run back as it goes.
 *
 * Partial results are posted at intervals so the odds and chances fill in and
 * converge instead of the screen sitting empty until ten thousand seasons have
 * been played out — on a phone, mid-season, that is a wait long enough to look
 * like nothing is happening.
 */
self.onmessage = (
  e: MessageEvent<{ snapshot: Snapshot; iterations: number; history?: Game[] }>
) => {
  const { snapshot, iterations, history } = e.data;
  const post = (r: unknown) => (self as unknown as Worker).postMessage(r);
  const result = simulateSeason(snapshot, iterations, undefined, history ?? [], {
    onProgress: post
  });
  post(result);
};
