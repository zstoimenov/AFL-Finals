import type { HistoryIndexEntry } from '../domain/types';

/**
 * Header control that switches which season the Ladder / Fixtures / Bracket /
 * Odds tabs render. The live season is always first; archived seasons follow,
 * newest first. Purely presentational — the parent owns the active year and the
 * lazy loading behind a change.
 */
export default function SeasonSwitcher({
  liveYear,
  activeYear,
  history,
  loading,
  onChange
}: {
  liveYear: number;
  activeYear: number;
  history: HistoryIndexEntry[];
  loading: boolean;
  onChange: (year: number) => void;
}) {
  if (history.length === 0) return null;
  const years = [liveYear, ...history.map((h) => h.year).filter((y) => y !== liveYear)];
  return (
    <label className="season-switch">
      <span className="visually-hidden">Season</span>
      <select
        value={activeYear}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Choose season"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y === liveYear ? `${y} · Live` : y}
          </option>
        ))}
      </select>
      {loading && <span className="season-switch-spin" aria-hidden="true">⟳</span>}
    </label>
  );
}
