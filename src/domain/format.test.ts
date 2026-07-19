import { describe, expect, it } from 'vitest';
import { formatGameDateTime } from './format';

describe('formatGameDateTime', () => {
  it('renders unixtime in AWST (Australia/Perth, UTC+8)', () => {
    // 2026-07-25 12:00 UTC → 20:00 in Perth
    const unix = Date.UTC(2026, 6, 25, 12, 0, 0) / 1000;
    expect(formatGameDateTime('ignored', unix)).toBe('Sat 25 Jul · 8:00 PM AWST');
  });
  it('rolls the AWST date forward across the UTC boundary', () => {
    // 2026-07-25 20:00 UTC → 04:00 next day in Perth
    const unix = Date.UTC(2026, 6, 25, 20, 0, 0) / 1000;
    expect(formatGameDateTime('ignored', unix)).toBe('Sun 26 Jul · 4:00 AM AWST');
  });
  it('falls back to the venue-local string when unixtime is absent', () => {
    expect(formatGameDateTime('2026-07-25 19:40:00')).toBe('Sat 25 Jul · 7:40 PM');
  });
  it('formats a midday kickoff', () => {
    expect(formatGameDateTime('2026-09-26 12:00:00')).toBe('Sat 26 Sep · 12:00 PM');
  });
  it('formats a morning kickoff and strips leading zero from the day', () => {
    expect(formatGameDateTime('2026-08-02 11:10:00')).toBe('Sun 2 Aug · 11:10 AM');
  });
  it('handles a date without time', () => {
    expect(formatGameDateTime('2026-08-02')).toBe('Sun 2 Aug');
  });
  it('passes through malformed input unchanged', () => {
    expect(formatGameDateTime('TBC')).toBe('TBC');
  });
});
