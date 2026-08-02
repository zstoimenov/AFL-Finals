import { useEffect } from 'react';
import type { Game, Snapshot, TeamLocks } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { TEAMS } from '../domain/teams';
import { isFavourite } from '../domain/favourite';
import { sortedStandings } from '../domain/ladder';
import { lockLabel } from '../domain/locks';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';
import { RunHome, SimStrip, gamesLeft } from './ClubBlocks';

/**
 * Bottom-sheet with a club's season position, simulated chances and its run
 * home. The same blocks the My Club dashboard is built from, in a sheet — so any
 * club chip in the app opens a compact version of the dashboard for that club.
 */
export default function TeamDetail({
  teamId,
  snapshot,
  sim,
  locks,
  history = [],
  onClose
}: {
  teamId: number;
  snapshot: Snapshot;
  sim: SimOutput | null;
  locks: TeamLocks[];
  history?: Game[];
  onClose: () => void;
}) {
  const team = TEAMS[teamId];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // lock background scroll while the sheet is open so only it moves
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const ladder = sortedStandings(snapshot.standings);
  const rank = ladder.findIndex((s) => s.id === teamId) + 1;
  const standing = ladder.find((s) => s.id === teamId);
  const lock = locks.find((l) => l.teamId === teamId);
  const label = lock ? lockLabel(lock) : null;
  const probs = sim?.teams[teamId];
  const left = gamesLeft(snapshot, teamId);

  if (!team || !standing) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${team.name} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className={isFavourite(teamId) ? 'sheet-head fav' : 'sheet-head'}
          style={{ borderTopColor: team.color }}
        >
          <div className="sheet-title">
            <TeamChip teamId={teamId} interactive={false} />
            {isFavourite(teamId) && <span className="fav-tag">Your club</span>}
            <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>
          <p className="sheet-sub">
            #{rank} on the ladder · {standing.wins}–{standing.losses}
            {standing.draws > 0 ? `–${standing.draws}` : ''} · {standing.pts} pts ·{' '}
            {standing.percentage.toFixed(1)}%{' '}
            {label && <LockBadge label={label} />}
          </p>
        </header>

        {probs && <SimStrip probs={probs} />}

        <h3 className="runhome-title">
          Run home {left > 0 && <span className="muted">· {left} games left</span>}
        </h3>
        <RunHome snapshot={snapshot} teamId={teamId} history={history} />
        <p className="legendnote">Win % = in-app model estimate · times AWST</p>
      </section>
    </div>
  );
}
