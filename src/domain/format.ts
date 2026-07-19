const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats Squiggle's `"YYYY-MM-DD HH:MM:SS"` kickoff string (venue-local, as
 * published in the AFL fixture) like "Sat 25 Jul · 7:40 PM". No timezone
 * conversion — fixtures are shown as scheduled.
 */
export function formatGameDateTime(date: string): string {
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
