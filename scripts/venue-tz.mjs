/**
 * Maps AFL venues to their IANA timezone, and converts a venue-local wall-clock
 * kickoff to an absolute epoch (seconds).
 *
 * Squiggle's live feed already carries `unixtime`; this exists only to backfill
 * snapshots captured before we started storing it. Using IANA zones (not fixed
 * offsets) keeps it correct across daylight-saving for the whole season.
 */
export const VENUE_TZ = {
  'Adelaide Oval': 'Australia/Adelaide',
  'Barossa Park': 'Australia/Adelaide',
  'Norwood Oval': 'Australia/Adelaide',
  'Bellerive Oval': 'Australia/Hobart',
  'York Park': 'Australia/Hobart',
  Carrara: 'Australia/Brisbane',
  Gabba: 'Australia/Brisbane',
  Docklands: 'Australia/Melbourne',
  'Kardinia Park': 'Australia/Melbourne',
  'M.C.G.': 'Australia/Melbourne',
  'Manuka Oval': 'Australia/Sydney',
  'S.C.G.': 'Australia/Sydney',
  'Sydney Showground': 'Australia/Sydney',
  'Marrara Oval': 'Australia/Darwin',
  'Traeger Park': 'Australia/Darwin',
  'Hands Oval': 'Australia/Perth',
  'Perth Stadium': 'Australia/Perth'
};

/** Epoch seconds for a "YYYY-MM-DD HH:MM[:SS]" wall-clock in IANA zone `tz`. */
export function zonedToEpoch(dateStr, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(dateStr ?? '');
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m.map(Number);
  const asUTC = Date.UTC(y, mo - 1, d, hh, mm);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(asUTC)).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  const zoneAsUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  const offset = zoneAsUTC - asUTC;
  return Math.floor((asUTC - offset) / 1000);
}
