import { describe, it, expect } from 'vitest';
import {
  finalsFormatFor,
  supportsProjectedBracket,
  ladderCutLines,
  formatLabel
} from './season';

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
