import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateSeason } from './simulate';
import { computeRatings, winProb } from './predict';
import type { Snapshot } from './types';

function loadSeed(): Snapshot {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data');
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  return { games: read('games.json'), standings: read('standings.json'), tips: read('tips.json'), meta: read('meta.json') };
}

describe('prediction model', () => {
  const snap = loadSeed();
  const ratings = computeRatings(snap.standings, snap.games);

  it('is symmetric home/away up to home advantage', () => {
    const pHome = winProb(ratings, 2, 12); // strong hosts weak
    const pAwayView = winProb(ratings, 12, 2);
    expect(pHome).toBeGreaterThan(0.7);
    expect(pAwayView).toBeLessThan(0.5); // weak team even at home is underdog
  });

  it('applies a home bump except on neutral ground', () => {
    const p = winProb(ratings, 2, 10);
    const pNeutral = winProb(ratings, 2, 10, true);
    expect(p).toBeGreaterThan(pNeutral);
  });
});

describe('simulateSeason', () => {
  const snap = loadSeed();
  const sim = simulateSeason(snap, 3000, 42);

  it('probabilities are coherent', () => {
    let premierSum = 0;
    let finalsSum = 0;
    for (const t of Object.values(sim.teams)) {
      expect(t.premier).toBeLessThanOrEqual(t.reachGF + 1e-9);
      expect(t.reachGF).toBeLessThanOrEqual(t.makeFinals + 1e-9);
      expect(t.top2).toBeLessThanOrEqual(t.top4 + 1e-9);
      expect(t.top4).toBeLessThanOrEqual(t.top6 + 1e-9);
      expect(t.top6).toBeLessThanOrEqual(t.makeFinals + 1e-9);
      premierSum += t.premier;
      finalsSum += t.makeFinals;
    }
    expect(premierSum).toBeCloseTo(1, 5);
    expect(finalsSum).toBeCloseTo(10, 5);
  });

  it('the ladder leader is a stronger premiership chance than the last-placed team', () => {
    // data-agnostic: works for any committed snapshot, seed or live
    const ladder = [...snap.standings].sort((a, b) => b.pts - a.pts || b.percentage - a.percentage);
    const top = ladder[0].id;
    const bottom = ladder[ladder.length - 1].id;
    expect(sim.teams[top].premier).toBeGreaterThan(sim.teams[bottom].premier);
    expect(sim.teams[bottom].premier).toBeLessThan(0.05);
    expect(sim.teams[top].makeFinals).toBeGreaterThan(0.9);
  });

  it('is deterministic for a fixed seed', () => {
    const again = simulateSeason(snap, 500, 7);
    const once = simulateSeason(snap, 500, 7);
    expect(again.teams[2].premier).toBe(once.teams[2].premier);
  });

  it('slot occupancy for QF1 home sums to ~1', () => {
    const occ = sim.slotOccupancy['QF1:home'];
    const total = Object.values(occ).reduce((s, p) => s + p, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});
