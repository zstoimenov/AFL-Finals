const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// AWST (Australia/Perth) has no daylight saving, so this is a stable UTC+8.
const AWST = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Perth',
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

const AWST_STAMP = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Perth',
  day: 'numeric',
  month: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

const AWST_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Perth',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** The Australia/Perth calendar day of an instant, as a sortable 'YYYY-MM-DD'. */
function awstDayKey(ms: number): string {
  const p = Object.fromEntries(AWST_DAY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Whether a game's kickoff falls on the same AWST day as `now` — the app is
 * AWST-based, so "today" is the Perth calendar day regardless of where it's
 * viewed. Uses the absolute `unixtime` when present, else the date string's day.
 */
export function isGameToday(
  unixtime: number | null | undefined,
  date: string,
  now: Date = new Date()
): boolean {
  const today = awstDayKey(now.getTime());
  if (unixtime && unixtime > 0) return awstDayKey(unixtime * 1000) === today;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(date ?? '');
  return m ? m[1] === today : false;
}

/**
 * Formats an ISO instant (e.g. the snapshot's fetchedAt) as an AWST date + time,
 * like "19 Jul, 4:39 PM AWST", for the "last updated" stamp.
 */
export function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(AWST_STAMP.formatToParts(d).map((x) => [x.type, x.value]));
  const month = MONTHS[Number(p.month) - 1] ?? p.month;
  const period = (p.dayPeriod ?? '').toUpperCase();
  return `${p.day} ${month}, ${p.hour}:${p.minute} ${period} AWST`;
}

/**
 * Formats a game's kickoff in AWST, e.g. "Sat 25 Jul · 7:40 PM AWST".
 *
 * Squiggle's `unixtime` (epoch seconds) is the source of truth — an absolute
 * instant we render in Perth time regardless of the venue's own timezone. When
 * a snapshot predates unixtime capture we fall back to the published venue-local
 * `date` string, shown as-is (no AWST label, since the offset is unknown).
 */
export function formatGameDateTime(date: string, unixtime?: number | null): string {
  if (unixtime && unixtime > 0) {
    const parts = Object.fromEntries(
      AWST.formatToParts(new Date(unixtime * 1000)).map((p) => [p.type, p.value])
    );
    const period = (parts.dayPeriod ?? '').toUpperCase();
    const month = MONTHS[Number(parts.month) - 1] ?? parts.month;
    return `${parts.weekday} ${parts.day} ${month} · ${parts.hour}:${parts.minute} ${period} AWST`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(date ?? '');
  if (!m) return date ?? '';
  const [, y, mo, d, hh, mm] = m;
  const day = new Date(Number(y), Number(mo) - 1, Number(d));
  const datePart = `${DAYS[day.getDay()]} ${Number(d)} ${MONTHS[Number(mo) - 1]}`;
  if (hh == null) return datePart;
  const h24 = Number(hh);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${datePart} · ${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`;
}
