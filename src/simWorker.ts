/// <reference lib="webworker" />
import { simulateSeason } from './domain/simulate';
import type { Snapshot } from './domain/types';

self.onmessage = (e: MessageEvent<{ snapshot: Snapshot; iterations: number }>) => {
  const { snapshot, iterations } = e.data;
  const result = simulateSeason(snapshot, iterations);
  (self as unknown as Worker).postMessage(result);
};
