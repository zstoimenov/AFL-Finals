import { useEffect, useMemo } from 'react';
import type { Snapshot, TeamLocks } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { TEAMS } from '../domain/teams';
import { sortedStandings } from '../domain/ladder';
import { computeRatings, squiggleProb, winProb } from '../domain/predict';
import { lockLabel } from '../domain/locks';
import { formatGameDateTime } from '../domain/format';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';

/**
 * Bottom-sheet with a club's season position, simulated chances and its
 * run home: every remaining regular-season game with date, time, venue and
 * the model's win probability.
 */
export default function TeamDetail({
  teamId,
  snapshot,
  sim,
  locks,
  onClose
}: {
  teamId: number;
  snapshot: Snapshot;
  sim: SimOutput | null;
  locks: TeamLocks[];
  onClose: () => void;
}) {
  const team = TEAMS[teamId];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ratings = useMemo(
    () => computeRatings(snapshot.standings, snapshot.games),
    [snapshot]
  );
  const ladder = sortedStandings(snapshot.standings);
  const rank = ladder.findIndex((s) => s.id === teamId) + 1;
  const standing = ladder.find((s) => s.id === teamId);
  const lock = locks.find((l) => l.teamId === teamId);
  const label = lock ? lockLabel(lock) : null;
  const probs = sim?.teams[teamId];

  const runHome = snapshot.games
    .filter(
      (g) => g.is_final === 0 && !g.complete && (g.hteamid === teamId || g.ateamid === teamId)
    )
    .sort((a, b) => a.round - b.round);

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
        <header className="sheet-head" style={{ borderTopColor: team.color }}>
          <div className="sheet-title">
            <TeamChip teamId={teamId} interactive={false} />
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

        {probs && (
          <div className="simstrip" aria-label="Simulated season chances">
            <Stat label="Finals" value={probs.makeFinals} />
            <Stat label="Top 6" value={probs.top6} />
            <Stat label="Top 4" value={probs.top4} />
            <Stat label="Grand Final" value={probs.reachGF} />
            <Stat label="Premiers" value={probs.premier} />
          </div>
        )}

        <h3 className="runhome-title">
          Run home {runHome.length > 0 && <span className="muted">· {runHome.length} games left</span>}
        </h3>
        {runHome.length === 0 ? (
          <p className="sectionnote">Regular season complete.</p>
        ) : (
          <ol className="runhome">
            {runHome.map((g) => {
              const isHome = g.hteamid === teamId;
              const oppId = isHome ? g.ateamid : g.hteamid;
              const pHome = winProb(ratings, g.hteamid, g.ateamid);
              const p = isHome ? pHome : 1 - pHome;
              const sq = squiggleProb(snapshot, g.hteamid, g.ateamid);
              const sqTeam = sq != null ? (isHome ? sq : 1 - sq) : null;
              return (
                <li key={g.id} className="runhome-row">
                  <div className="runhome-main">
                    <span className="roundtag">R{g.round}</span>
                    <span className="runhome-opp">
                      <span className={isHome ? 'ha home' : 'ha away'}>
                        {isHome ? 'vs' : '@'}
                      </span>
                      <TeamChip teamId={oppId} />
                    </span>
                    <span className="runhome-prob" title="Model win probability">
                      <span
                        className="runhome-prob-fill"
                        style={{ width: `${Math.round(p * 100)}%` }}
                      />
                      <strong>{Math.round(p * 100)}%</strong>
                    </span>
                  </div>
                  <div className="runhome-meta">
                    {formatGameDateTime(g.date)}
                    {g.venue ? ` · ${g.venue}` : ''}
                    {sqTeam != null && ` · Squiggle ${Math.round(sqTeam * 100)}%`}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <p className="legendnote">
          Win % from the in-app model; times as published in the AFL fixture (venue local).
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const pct = value * 100;
  return (
    <div className="stat">
      <span className="stat-num">{pct >= 99.95 ? '100' : pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
