import { TEAMS, inkOn } from '../domain/teams';
import { useDialog } from '../useDialog';

/**
 * Choose the club the app follows. The choice is highlighted everywhere — chips,
 * ladder rows, fixtures, the bracket — and is what the My Club dashboard is
 * about, so it's worth being able to change without editing the source.
 *
 * `intro` is the first-launch form of the same picker: nobody starts out
 * following a club, so the app asks once, up front, rather than picking one for
 * them. Declining is a real answer and is remembered — the question is asked
 * once, not every launch.
 */
export default function ClubPicker({
  current,
  onPick,
  onClose,
  intro = false
}: {
  current: number | null;
  onPick: (teamId: number | null) => void;
  onClose: () => void;
  /** shown on first launch, before the person has answered either way */
  intro?: boolean;
}) {
  const modal = useDialog<HTMLDivElement>(onClose);
  const clubs = Object.values(TEAMS).sort((a, b) => a.short.localeCompare(b.short));

  return (
    <div className="info-backdrop" onClick={onClose}>
      <div
        className="info-modal"
        role="dialog"
        aria-modal="true"
        aria-label={intro ? 'Do you follow a club?' : 'Choose your club'}
        ref={modal}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="info-modal-head">
          <h3>{intro ? 'Do you follow a club?' : 'Choose your club'}</h3>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="info-modal-body">
          {intro && (
            <p className="sectionnote">
              Pick your club and it&apos;s highlighted everywhere — fixtures, ladder, bracket —
              and <strong>My club</strong> becomes its dashboard. You can change or clear it any
              time from that page.
            </p>
          )}
          <ul className="clubgrid">
            {clubs.map((club) => (
              <li key={club.id}>
                <button
                  type="button"
                  className={current === club.id ? 'clubopt active' : 'clubopt'}
                  aria-current={current === club.id ? 'true' : undefined}
                  onClick={() => onPick(club.id)}
                >
                  <span
                    className="monogram"
                    style={{
                      background: club.color,
                      color: inkOn(club.color),
                      boxShadow: `inset 0 0 0 2px ${club.color2}`
                    }}
                    aria-hidden="true"
                  >
                    {club.abbrev.slice(0, 2)}
                  </span>
                  {club.short}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="clubnone" onClick={() => onPick(null)}>
            {intro ? 'Not right now' : 'Follow no club'}
          </button>
          <p className="legendnote">
            Stored in this browser only — nothing about your choice leaves the device.
          </p>
        </div>
      </div>
    </div>
  );
}
