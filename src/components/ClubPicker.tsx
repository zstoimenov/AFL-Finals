import { useEffect } from 'react';
import { TEAMS, inkOn } from '../domain/teams';

/**
 * Choose the club the app follows. The choice is highlighted everywhere — chips,
 * ladder rows, fixtures, the bracket — and is what the My Club dashboard is
 * about, so it's worth being able to change without editing the source.
 */
export default function ClubPicker({
  current,
  onPick,
  onClose
}: {
  current: number | null;
  onPick: (teamId: number | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const clubs = Object.values(TEAMS).sort((a, b) => a.short.localeCompare(b.short));

  return (
    <div className="info-backdrop" onClick={onClose}>
      <div
        className="info-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose your club"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="info-modal-head">
          <h3>Choose your club</h3>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="info-modal-body">
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
            Follow no club
          </button>
          <p className="legendnote">
            Stored in this browser only — nothing about your choice leaves the device.
          </p>
        </div>
      </div>
    </div>
  );
}
