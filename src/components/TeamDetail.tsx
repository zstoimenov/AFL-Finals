import { useMemo } from 'react';
import type { Game, Snapshot, TeamLocks } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { TEAMS } from '../domain/teams';
import { isFavourite } from '../domain/favourite';
import { sortedStandings } from '../domain/ladder';
import { lockLabel } from '../domain/locks';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';
import { ResultRows, RunHome, SimStrip, SimStripSkeleton, gamesLeft } from './ClubBlocks';
import { clubResults } from '../domain/club';
import { useDialog } from '../useDialog';

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
  const sheet = useDialog<HTMLElement>(onClose);
  // the season so far, newest first — the same reading order as the game sheet's
  // form rows, so a result means the same thing wherever you meet it
  const played = useMemo(
    () => [...clubResults(snapshot.games, teamId)].reverse(),
    [snapshot, teamId]
  );

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
        ref={sheet}
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
          {lock && lock.minPts !== lock.maxPts && (
            // the bounds the lock engine actually reasons about: lose every
            // remaining game, or win them all
            <p className="sheet-sub">
              Can finish on <strong>{lock.minPts}</strong>–<strong>{lock.maxPts}</strong> points
            </p>
          )}
        </header>

        {probs ? <SimStrip probs={probs} /> : <SimStripSkeleton />}

        {left > 0 && (
          <>
            <h3 className="runhome-title">
              Run home{' '}
              <span className="muted">
                · {left} game{left === 1 ? '' : 's'} left
              </span>
            </h3>
            <RunHome snapshot={snapshot} teamId={teamId} history={history} />
            <p className="legendnote">Win % = in-app model estimate · times AWST</p>
          </>
        )}

        {played.length > 0 && (
          <>
            <h3 className="runhome-title">
              This season{' '}
              <span className="muted">
                · {played.filter((r) => r.won).length}–{played.filter((r) => r.won === false).length}
                {played.some((r) => r.won == null)
                  ? `–${played.filter((r) => r.won == null).length}`
                  : ''}
              </span>
            </h3>
            <ResultRows results={played} showRound />
            <p className="legendnote">Every game played, most recent at the top · margin in points</p>
          </>
        )}
      </section>
    </div>
  );
}
