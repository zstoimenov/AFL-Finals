import { useMemo } from 'react';
import type { Game, Snapshot } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { computeRatings, squiggleProb, blendedHomeProb } from '../domain/predict';
import { formatGameDateTime } from '../domain/format';
import TeamChip from './TeamChip';

/**
 * The blocks that describe one club's season — its simulated chances and its run
 * home. Shared by the My Club dashboard and the team sheet that opens from any
 * club chip, so the same numbers are presented the same way wherever you meet
 * them.
 */

/** A club's simulated chances across the season, as a row of percentages. */
export function SimStrip({ probs }: { probs: SimOutput['teams'][number] }) {
  return (
    <div className="simstrip" aria-label="Simulated season chances">
      <Stat label="Finals" value={probs.makeFinals} />
      <Stat label="Top 6" value={probs.top6} />
      <Stat label="Top 4" value={probs.top4} />
      <Stat label="Grand Final" value={probs.reachGF} />
      <Stat label="Premiers" value={probs.premier} />
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: number }) {
  const pct = value * 100;
  return (
    <div className="stat">
      <span className="stat-num">
        {pct >= 99.95 ? '100' : pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/**
 * Every remaining regular-season game with date, time, venue and the model's
 * win probability — the club's run home.
 */
export function RunHome({
  snapshot,
  teamId,
  history = []
}: {
  snapshot: Snapshot;
  teamId: number;
  history?: Game[];
}) {
  const ratings = useMemo(() => {
    const prior = history.filter((g) => g.year < snapshot.meta.year);
    return computeRatings(snapshot.standings, snapshot.games, { history: prior });
  }, [snapshot, history]);

  const runHome = snapshot.games
    .filter((g) => g.is_final === 0 && !g.complete && (g.hteamid === teamId || g.ateamid === teamId))
    .sort((a, b) => a.round - b.round);

  if (runHome.length === 0) return <p className="sectionnote">Regular season complete.</p>;

  return (
    <ol className="runhome">
      {runHome.map((g) => {
        const isHome = g.hteamid === teamId;
        const oppId = isHome ? g.ateamid : g.hteamid;
        const pHome = blendedHomeProb(snapshot, ratings, snapshot.games, g);
        const p = isHome ? pHome : 1 - pHome;
        const sq = squiggleProb(snapshot, g.hteamid, g.ateamid);
        const sqTeam = sq != null ? (isHome ? sq : 1 - sq) : null;
        return (
          <li key={g.id} className="runhome-row">
            <div className="runhome-main">
              <span className="roundtag">R{g.round}</span>
              <span className="runhome-opp">
                <span className={isHome ? 'ha home' : 'ha away'}>{isHome ? 'vs' : '@'}</span>
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
              {formatGameDateTime(g.date, g.unixtime)}
              {g.venue ? ` · ${g.venue}` : ''}
              {sqTeam != null && ` · Squiggle ${Math.round(sqTeam * 100)}%`}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** How many games a club has left to play in the home & away season. */
export function gamesLeft(snapshot: Snapshot, teamId: number): number {
  return snapshot.games.filter(
    (g) => g.is_final === 0 && !g.complete && (g.hteamid === teamId || g.ateamid === teamId)
  ).length;
}
