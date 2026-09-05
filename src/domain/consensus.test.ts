import { describe, expect, it } from 'vitest';
import {
  agreement,
  consensusMood,
  consensusSummary,
  probRange,
  spread,
  tipFor
} from './consensus';
import type { Snapshot, Tip } from './types';

const tip = (over: Partial<Tip> = {}): Tip => ({
  gameid: 1,
  hteamid: 10,
  ateamid: 20,
  hconfidence: 0.6,
  models: 30,
  htips: 20,
  atips: 10,
  spread: 0.11,
  low: 0.4,
  high: 0.8,
  ...over
});

describe('agreement', () => {
  it('reads the majority share of the field', () => {
    expect(agreement(tip({ htips: 24, atips: 6, models: 30 }))).toBeCloseTo(0.8);
  });

  it('is symmetric — an away-leaning field is just as agreed', () => {
    expect(agreement(tip({ htips: 6, atips: 24, models: 30 }))).toBeCloseTo(0.8);
  });

  it('counts fence-sitters in the field but on neither side', () => {
    // 15 home, 5 away, 10 sitting exactly on 50% — the majority is 15 of 30,
    // not 15 of 20, so a game nobody will call reads as divided
    expect(agreement(tip({ htips: 15, atips: 5, models: 30 }))).toBeCloseTo(0.5);
  });
});

describe('missing per-model detail', () => {
  // the archive was written before Squiggle's per-model spread was recorded;
  // absent must read as "unknown", never as "the models agreed"
  const bare = tip({ htips: null, atips: null, spread: null, low: null, high: null });

  it('returns null rather than a default for every reader', () => {
    expect(agreement(bare)).toBeNull();
    expect(spread(bare)).toBeNull();
    expect(consensusMood(bare)).toBeNull();
    expect(consensusSummary(bare)).toBeNull();
    expect(probRange(bare)).toBeNull();
  });

  it('treats an untipped game the same way', () => {
    expect(agreement(null)).toBeNull();
    expect(consensusMood(null)).toBeNull();
  });
});

describe('consensusMood', () => {
  it('calls a near-even field split', () => {
    expect(consensusMood(tip({ htips: 17, atips: 13, models: 30 }))).toBe('split');
  });

  it('calls a clear lean divided', () => {
    expect(consensusMood(tip({ htips: 22, atips: 8, models: 30 }))).toBe('divided');
  });

  it('calls a near-unanimous field agreed', () => {
    expect(consensusMood(tip({ htips: 28, atips: 2, models: 30 }))).toBe('agreed');
  });
});

describe('consensusSummary', () => {
  it('names the split without picking a side', () => {
    expect(consensusSummary(tip({ htips: 16, atips: 14, models: 30 }))).toBe(
      'The tipsters are split 16-14 on this one'
    );
  });

  it('names the side the field leans to', () => {
    expect(consensusSummary(tip({ htips: 8, atips: 22, models: 30 }))).toBe(
      '22 of 30 tipsters lean the away side'
    );
  });
});

describe('probRange', () => {
  it('measures how far apart the boldest and shyest models are', () => {
    expect(probRange(tip({ low: 0.31, high: 0.79 }))).toBeCloseTo(0.48);
  });
});

describe('tipFor', () => {
  const snapshot = { tips: [tip(), tip({ hteamid: 1, ateamid: 2 })] } as Snapshot;

  it('finds the tip for a fixture by its two sides', () => {
    expect(tipFor(snapshot, 1, 2)?.ateamid).toBe(2);
  });

  it('is null for a fixture nobody tipped, and does not match a reversed pair', () => {
    expect(tipFor(snapshot, 2, 1)).toBeNull();
    expect(tipFor(snapshot, 99, 98)).toBeNull();
  });
});
