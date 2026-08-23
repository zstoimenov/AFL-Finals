import type { HistoryIndexEntry } from '../domain/types';

/** Sentinel option value for the seasons hub, which isn't a year. */
const HUB = 'hub';

/**
 * Header control that switches which season the Ladder / Fixtures / Finals /
 * Odds tabs render, and opens the multi-season hub. The live season is always
 * first; archived seasons follow, newest first, with the hub last.
 *
 * The hub lives here rather than in the main nav because it is a *season*
 * control, like the years above it — which keeps the nav row for the screens you
 * move between during a round. Purely presentational: the parent owns the active
 * year and the lazy loading behind a change.
 */
export default function SeasonSwitcher({
  liveYear,
  activeYear,
  history,
  loading,
  liveLabel = 'Live',
  hubOpen = false,
  onChange,
  onOpenHub
}: {
  liveYear: number;
  activeYear: number;
  history: HistoryIndexEntry[];
  loading: boolean;
  /** what the live year is called — "Live", or "Finals" once the series is on */
  liveLabel?: string;
  /** the hub is the screen currently showing, so the control reflects it */
  hubOpen?: boolean;
  onChange: (year: number) => void;
  onOpenHub: () => void;
}) {
  const years = [liveYear, ...history.map((h) => h.year).filter((y) => y !== liveYear)];
  return (
    <label className="season-switch">
      <span className="visually-hidden">Season</span>
      <select
        value={hubOpen ? HUB : activeYear}
        onChange={(e) => {
          if (e.target.value === HUB) onOpenHub();
          else onChange(Number(e.target.value));
        }}
        aria-label="Choose season"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y === liveYear ? `${y} · ${liveLabel}` : y}
          </option>
        ))}
        <option value={HUB}>All seasons…</option>
      </select>
      {loading && <span className="season-switch-spin" aria-hidden="true">⟳</span>}
    </label>
  );
}
