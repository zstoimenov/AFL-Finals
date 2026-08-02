const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// AWST (Australia/Perth) has no daylight saving, so this is a stable UTC+8.
// Times are 24-hour throughout ('h23' keeps midnight at 00, not 24).
const AWST = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Perth',
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const AWST_STAMP = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Perth',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const AWST_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Perth',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** The pieces of a formatted date, keyed by part type ('hour', 'month', …). */
function partsOf(fmt: Intl.DateTimeFormat, d: Date): Record<string, string> {
  return Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
}

/** The Australia/Perth calendar day of an instant, as a sortable 'YYYY-MM-DD'. */
function awstDayKey(ms: number): string {
  const p = partsOf(AWST_DAY, new Date(ms));
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
 * like "19 Jul, 16:39 AWST" — the long form, used where there is room to spell
 * the stamp out (tooltips, screen-reader labels).
 */
export function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = partsOf(AWST_STAMP, d);
  const month = MONTHS[Number(p.month) - 1] ?? p.month;
  return `${p.day} ${month}, ${p.hour}:${p.minute} AWST`;
}

/**
 * The header's compact form of the same stamp: just "16:39" when the data was
 * fetched today in Perth, else "19 Jul 16:39". Drops the date on the common
 * case (a snapshot published earlier the same day) so the header stays one
 * short line; `formatUpdatedAt` still spells it out in the tooltip.
 */
export function formatUpdatedShort(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = partsOf(AWST_STAMP, d);
  const time = `${p.hour}:${p.minute}`;
  if (awstDayKey(d.getTime()) === awstDayKey(now.getTime())) return time;
  const month = MONTHS[Number(p.month) - 1] ?? p.month;
  return `${p.day} ${month} ${time}`;
}

/**
 * Formats a game's kickoff in AWST, e.g. "Sat 25 Jul · 19:40 AWST".
 *
 * Squiggle's `unixtime` (epoch seconds) is the source of truth — an absolute
 * instant we render in Perth time regardless of the venue's own timezone. When
 * a snapshot predates unixtime capture we fall back to the published venue-local
 * `date` string, shown as-is (no AWST label, since the offset is unknown).
 */
export function formatGameDateTime(date: string, unixtime?: number | null): string {
  if (unixtime && unixtime > 0) {
    const parts = partsOf(AWST, new Date(unixtime * 1000));
    const month = MONTHS[Number(parts.month) - 1] ?? parts.month;
    return `${parts.weekday} ${parts.day} ${month} · ${parts.hour}:${parts.minute} AWST`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(date ?? '');
  if (!m) return date ?? '';
  const [, y, mo, d, hh, mm] = m;
  const day = new Date(Number(y), Number(mo) - 1, Number(d));
  const datePart = `${DAYS[day.getDay()]} ${Number(d)} ${MONTHS[Number(mo) - 1]}`;
  if (hh == null) return datePart;
  // the published string is already 24-hour, so it carries straight through
  return `${datePart} · ${hh}:${mm}`;
}
