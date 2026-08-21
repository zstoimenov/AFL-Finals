import { describe, it, expect } from 'vitest';
import {
  finalsFormatFor,
  supportsProjectedBracket,
  ladderCutLines,
  formatLabel,
  premierOf,
  seasonComplete
} from './season';
import type { Game } from './types';

describe('finals format routing', () => {
  it('reads an explicit meta.format when present', () => {
    expect(finalsFormatFor({ year: 2024, format: 'top10-wildcard' })).toBe('top10-wildcard');
    expect(finalsFormatFor({ year: 2030, format: 'top8' })).toBe('top8');
  });

  it('falls back to the year boundary (2026 = wildcard)', () => {
    expect(finalsFormatFor({ year: 2025 })).toBe('top8');
    expect(finalsFormatFor({ year: 2026 })).toBe('top10-wildcard');
    expect(finalsFormatFor({ year: 2028 })).toBe('top10-wildcard');
  });

  it('only projects a bracket for the format the app models', () => {
    expect(supportsProjectedBracket({ year: 2026 })).toBe(true);
    expect(supportsProjectedBracket({ year: 2025 })).toBe(false);
    // an unmodelled future format renders as results, not a bogus bracket
    expect(supportsProjectedBracket({ year: 2028, format: 'top12-whatever' })).toBe(false);
  });

  it('draws cut lines per format', () => {
    expect(ladderCutLines({ year: 2026 })).toEqual({ byeCutIndex: 5, finalsCutIndex: 9 });
    expect(ladderCutLines({ year: 2024 })).toEqual({ byeCutIndex: null, finalsCutIndex: 7 });
  });

  it('labels formats for headings', () => {
    expect(formatLabel({ year: 2026 })).toMatch(/wildcard/i);
    expect(formatLabel({ year: 2024 })).toMatch(/eight/i);
  });
});

describe('premierOf', () => {
  const final = (week: number, winner: number, unixtime = 1_790_000_000): Game => ({
    id: week * 10 + winner,
    round: 24 + week,
    year: 2026,
    complete: 100,
    hteamid: winner,
    ateamid: winner === 1 ? 2 : 1,
    hscore: 100,
    ascore: 80,
    date: '2026-09-26 14:30:00',
    unixtime,
    venue: 'MCG',
    is_final: week,
    winnerteamid: winner
  });

  it('is the winner of the highest final played', () => {
    expect(premierOf([final(1, 3), final(5, 7), final(4, 9)])).toBe(7);
  });

  it('breaks a tie on the later kickoff', () => {
    const early = { ...final(2, 4), unixtime: 1_790_000_000 };
    const late = { ...final(2, 6), unixtime: 1_790_600_000 };
    expect(premierOf([early, late])).toBe(6);
  });

  it('is null while the finals are still being played', () => {
    expect(premierOf([{ ...final(5, 7), complete: 0, winnerteamid: null }])).toBeNull();
    expect(premierOf([])).toBeNull();
  });
});

describe('seasonComplete', () => {
  const g = (complete: number): Game => ({
    id: complete + Math.random(),
    round: 1,
    year: 2026,
    complete,
    hteamid: 1,
    ateamid: 2,
    hscore: null,
    ascore: null,
    date: '2026-03-01 19:40:00',
    venue: null,
    is_final: 0,
    winnerteamid: null
  });

  it('is true only when every game has been played', () => {
    expect(seasonComplete([g(100), g(100)])).toBe(true);
    expect(seasonComplete([g(100), g(0)])).toBe(false);
  });

  it('is false for a fixture we do not have', () => {
    expect(seasonComplete([])).toBe(false);
  });
});
