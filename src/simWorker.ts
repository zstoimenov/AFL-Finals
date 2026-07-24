/// <reference lib="webworker" />
import { simulateSeason } from './domain/simulate';
import type { Game, Snapshot } from './domain/types';

self.onmessage = (
  e: MessageEvent<{ snapshot: Snapshot; iterations: number; history?: Game[] }>
) => {
  const { snapshot, iterations, history } = e.data;
  const result = simulateSeason(snapshot, iterations, undefined, history ?? []);
  (self as unknown as Worker).postMessage(result);
};
