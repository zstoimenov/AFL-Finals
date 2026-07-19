import { describe, expect, it } from 'vitest';
import { formatGameDateTime } from './format';

describe('formatGameDateTime', () => {
  it('formats an evening kickoff', () => {
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
