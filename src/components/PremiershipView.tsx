import type { Snapshot } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { TEAMS } from '../domain/teams';
import { isFavourite } from '../domain/favourite';
import { sortedStandings } from '../domain/ladder';
import TeamChip from './TeamChip';
import InfoButton from './InfoButton';
import { formatProbability } from '../domain/format';

/**
 * Premiership projection: simulated P(premier) per team as labeled horizontal
 * bars in club colors (identity always carried by the adjacent name label),
 * with P(finals) and P(reach GF) alongside.
 */
export default function PremiershipView({
  snapshot,
  sim
}: {
  snapshot: Snapshot;
  sim: SimOutput | null;
}) {
  // The simulation reports as it runs, so this only shows before the first
  // partial arrives. It holds the real layout rather than a line of text, so
  // nothing jumps when the numbers land.
  if (!sim) {
    return (
      <section className="oddsview">
        <h2>Premiership odds</h2>
        <p className="simnote">Simulating the rest of the season…</p>
        <div className="hero-tile skeleton-tile" aria-hidden="true" />
        <div className="oddslist" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <div className="oddsrow skeleton-row" key={i}>
              <span className="skeleton-chip" />
              <span className="skeleton-bar" style={{ width: `${92 - i * 8}%` }} />
            </div>
          ))}
        </div>
        <span className="visually-hidden" role="status">
          Running the premiership simulation.
        </span>
      </section>
    );
  }

  const ladder = sortedStandings(snapshot.standings);
  const rows = ladder
    .map((s) => ({ teamId: s.id, ...sim.teams[s.id] }))
    .filter((r) => r.premier != null)
    .sort((a, b) => b.premier - a.premier);
  // Bars were scaled to the leader, which drew the favourite at full width
  // whether they were on 60% or 14% — flattering the top of the list. They are
  // scaled to an absolute axis instead, stretched only when nobody is close to
  // it, so the length means the same thing from week to week.
  const leader = Math.max(...rows.map((r) => r.premier), 0);
  const axis = Math.max(0.35, Math.min(1, Math.ceil(leader * 10) / 10));
  const favourite = rows[0];

  return (
    <section className="oddsview">
      <div className="section-head">
        <h2>Premiership odds</h2>
        <InfoButton title="About premiership odds">
          <p>
            Each team&apos;s chance of winning the flag, from a {sim.iterations.toLocaleString()}
            -run Monte Carlo simulation of the rest of the season and the entire finals series —
            including the Wildcard Round and winner re-seeding.
          </p>
          <p>
            Bars show P(premier) on a fixed scale — a full-width bar means a genuinely dominant
            favourite, not simply the best of a close field. The smaller figures are the chances
            of reaching the Grand Final and of playing finals at all.
          </p>
        </InfoButton>
      </div>
      {sim.progress < 1 && (
        <p className="simnote converging" role="status">
          Simulating… {Math.round(sim.progress * 100)}% — the numbers are still settling.
        </p>
      )}
      {favourite && TEAMS[favourite.teamId] && (
        <div className="hero-tile">
          {/* "projected premier" overstated a club the model has at one chance
              in seven; it is the shortest price, and says so */}
          <p className="hero-label">Shortest price</p>
          <div className="hero-team">
            <TeamChip teamId={favourite.teamId} />
            <span className="hero-num">{formatProbability(favourite.premier)}</span>
          </div>
          <p className="hero-sub">
            {formatProbability(favourite.reachGF)} to reach the Grand Final ·{' '}
            {formatProbability(favourite.makeFinals)} to play finals
          </p>
        </div>
      )}
      <div className="oddslist" role="table" aria-label="Premiership probability by team">
        {rows.map((r) => {
          const team = TEAMS[r.teamId];
          if (!team) return null;
          const pct = r.premier * 100;
          // teams with a negligible flag chance are dimmed so the genuine
          // contenders at the top read clearly
          const longshot = r.premier < 0.01 && !isFavourite(r.teamId);
          const cls = [
            'oddsrow',
            isFavourite(r.teamId) ? 'fav-row' : '',
            longshot ? 'longshot' : ''
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div className={cls} role="row" key={r.teamId} title={`${team.name}: premier ${pct.toFixed(1)}%, reach GF ${Math.round(r.reachGF * 100)}%, finals ${Math.round(r.makeFinals * 100)}%`}>
              <span className="oddsteam" role="cell">
                <TeamChip teamId={r.teamId} compact />
              </span>
              <span className="oddsbar" role="cell">
                <span
                  className="oddsfill"
                  style={{ width: `${(r.premier / axis) * 100}%`, background: team.color }}
                />
                <span className="oddsval">{formatProbability(r.premier)}</span>
              </span>
              <span className="oddsminor" role="cell">
                GF {formatProbability(r.reachGF)} · Finals {formatProbability(r.makeFinals)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
