import { describe, expect, it } from 'vitest';
import { formatGameDateTime, formatUpdatedAt, formatUpdatedShort, isGameToday } from './format';

describe('formatUpdatedAt', () => {
  it('renders an ISO instant as an AWST date + 24-hour time', () => {
    // 08:39 UTC → 16:39 in Perth
    expect(formatUpdatedAt('2026-07-19T08:39:57.424Z')).toBe('19 Jul, 16:39 AWST');
  });
  it('keeps midnight at 00, not 24', () => {
    // 16:05 UTC on 18 Jul → 00:05 on 19 Jul in Perth
    expect(formatUpdatedAt('2026-07-18T16:05:00Z')).toBe('19 Jul, 00:05 AWST');
  });
  it('passes through unparseable input', () => {
    expect(formatUpdatedAt('nope')).toBe('nope');
  });
});

describe('formatUpdatedShort', () => {
  // "now" = 2026-07-19 09:00 UTC → 17:00 AWST on 19 Jul
  const now = new Date('2026-07-19T09:00:00Z');

  it('shows time only when the stamp is on the current AWST day', () => {
    expect(formatUpdatedShort('2026-07-19T08:39:57.424Z', now)).toBe('16:39');
  });
  it('adds the date once the stamp is from an earlier AWST day', () => {
    expect(formatUpdatedShort('2026-07-18T08:39:00Z', now)).toBe('18 Jul 16:39');
  });
  it('uses the AWST day, not UTC, near the date boundary', () => {
    // 18 Jul 23:00 UTC is already 19 Jul 07:00 in Perth → today
    expect(formatUpdatedShort('2026-07-18T23:00:00Z', now)).toBe('07:00');
  });
  it('passes through unparseable input', () => {
    expect(formatUpdatedShort('nope', now)).toBe('nope');
  });
});

describe('formatGameDateTime', () => {
  it('renders unixtime in AWST (Australia/Perth, UTC+8) on a 24-hour clock', () => {
    // 2026-07-25 12:00 UTC → 20:00 in Perth
    const unix = Date.UTC(2026, 6, 25, 12, 0, 0) / 1000;
    expect(formatGameDateTime('ignored', unix)).toBe('Sat 25 Jul · 20:00 AWST');
  });
  it('rolls the AWST date forward across the UTC boundary', () => {
    // 2026-07-25 20:00 UTC → 04:00 next day in Perth
    const unix = Date.UTC(2026, 6, 25, 20, 0, 0) / 1000;
    expect(formatGameDateTime('ignored', unix)).toBe('Sun 26 Jul · 04:00 AWST');
  });
  it('falls back to the venue-local string when unixtime is absent', () => {
    expect(formatGameDateTime('2026-07-25 19:40:00')).toBe('Sat 25 Jul · 19:40');
  });
  it('formats a midday kickoff', () => {
    expect(formatGameDateTime('2026-09-26 12:00:00')).toBe('Sat 26 Sep · 12:00');
  });
  it('formats a morning kickoff and strips leading zero from the day', () => {
    expect(formatGameDateTime('2026-08-02 11:10:00')).toBe('Sun 2 Aug · 11:10');
  });
  it('handles a date without time', () => {
    expect(formatGameDateTime('2026-08-02')).toBe('Sun 2 Aug');
  });
  it('passes through malformed input unchanged', () => {
    expect(formatGameDateTime('TBC')).toBe('TBC');
  });
});

describe('isGameToday', () => {
  // "now" = 2026-07-24 02:00 UTC → 10:00 AWST on 24 Jul
  const now = new Date('2026-07-24T02:00:00Z');

  it('is true for a kickoff on the same AWST day', () => {
    const unix = Date.UTC(2026, 6, 24, 9, 40, 0) / 1000; // 24 Jul 17:40 AWST
    expect(isGameToday(unix, 'ignored', now)).toBe(true);
  });
  it('is false for a kickoff on the next AWST day', () => {
    const unix = Date.UTC(2026, 6, 25, 3, 0, 0) / 1000; // 25 Jul 11:00 AWST
    expect(isGameToday(unix, 'ignored', now)).toBe(false);
  });
  it('uses the AWST day, not UTC, near the date boundary', () => {
    // 23 Jul 23:00 UTC is already 24 Jul 07:00 in Perth → today
    const unix = Date.UTC(2026, 6, 23, 23, 0, 0) / 1000;
    expect(isGameToday(unix, 'ignored', now)).toBe(true);
  });
  it('falls back to the date string when unixtime is absent', () => {
    expect(isGameToday(null, '2026-07-24 19:40:00', now)).toBe(true);
    expect(isGameToday(null, '2026-07-25 19:40:00', now)).toBe(false);
  });
});
