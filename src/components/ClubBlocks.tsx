import { useMemo } from 'react';
import type { Game, Snapshot } from '../domain/types';
import type { ClubResult } from '../domain/club';
import type { SimOutput } from '../domain/simulate';
import { computeRatings, squiggleProb, blendedHomeProb } from '../domain/predict';
import { formatGameDateTime, formatProbability } from '../domain/format';
import { teamAbbrev, teamShortName } from '../domain/teams';
import TeamChip from './TeamChip';

/**
 * The blocks that describe one club's season — its simulated chances and its run
 * home. Shared by the My Club dashboard and the team sheet that opens from any
 * club chip, so the same numbers are presented the same way wherever you meet
 * them.
 */

/**
 * The simulated-chances strip before any numbers exist. Same shape and size as
 * the real thing, so the page doesn't jump when the first partial run lands.
 */
export function SimStripSkeleton() {
  return (
    <div className="simstrip" aria-hidden="true">
      {['Finals', 'Top 6', 'Top 4', 'Grand Final', 'Premiers'].map((label) => (
        <div className="stat" key={label}>
          <span className="stat-num skeleton-num" />
          <span className="stat-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A club's results as one line each, most recent at the top.
 *
 * Green for a win, red for a loss, with the opponent and the margin on every
 * line. Colour never carries it alone — the W/L letter and the signed margin
 * say the same thing in text, so it survives a monochrome screen and a
 * colour-blind reader.
 *
 * Shared by the game sheet (where the two clubs' recent form sits side by side
 * in narrow columns) and the team sheet (where the whole season runs down the
 * page). `showRound` is the only difference: the narrow columns have no room
 * for a round number, and side by side the rows are read against each other
 * rather than looked up by round.
 */
export function ResultRows({
  results,
  showRound = false
}: {
  results: ClubResult[];
  /** prefix each line with its round — for the full-width season list */
  showRound?: boolean;
}) {
  return (
    <ol className={showRound ? 'formrows with-round' : 'formrows'}>
      {results.map((r) => (
        <li key={r.game.id} className={`formrow ${r.won == null ? 'd' : r.won ? 'w' : 'l'}`}>
          {showRound && (
            <span className="formrow-round">
              {r.game.is_final > 0 ? `F${r.game.is_final}` : `R${r.game.round}`}
            </span>
          )}
          <span className="formrow-res" aria-hidden="true">
            {r.won == null ? 'D' : r.won ? 'W' : 'L'}
          </span>
          <span className="formrow-opp">
            {r.home ? 'v ' : '@ '}
            {teamAbbrev(r.opponentId)}
          </span>
          <span className="formrow-margin">
            {r.margin > 0 ? '+' : ''}
            {r.margin}
          </span>
          <span className="visually-hidden">
            {` ${r.game.is_final > 0 ? `Final week ${r.game.is_final}` : `Round ${r.game.round}`}, ${
              r.won == null ? 'drew with' : r.won ? 'beat' : 'lost to'
            } ${teamShortName(r.opponentId)} ${r.home ? 'at home' : 'away'} by ${Math.abs(
              r.margin
            )}. `}
          </span>
        </li>
      ))}
    </ol>
  );
}

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
  return (
    <div className="stat">
      <span className="stat-num">{formatProbability(value)}</span>
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
