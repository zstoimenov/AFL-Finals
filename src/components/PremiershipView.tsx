import type { Snapshot } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { TEAMS } from '../domain/teams';
import { isFavourite } from '../domain/favourite';
import { sortedStandings } from '../domain/ladder';
import TeamChip from './TeamChip';
import InfoButton from './InfoButton';

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
  if (!sim) {
    return (
      <section>
        <h2>Premiership odds</h2>
        <p className="simnote">Running {`10,000`}-season simulation…</p>
      </section>
    );
  }

  const ladder = sortedStandings(snapshot.standings);
  const rows = ladder
    .map((s) => ({ teamId: s.id, ...sim.teams[s.id] }))
    .filter((r) => r.premier != null)
    .sort((a, b) => b.premier - a.premier);
  const max = Math.max(...rows.map((r) => r.premier), 0.01);
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
            Bars show P(premier); the smaller figures are the chances of reaching the Grand
            Final and of playing finals at all.
          </p>
        </InfoButton>
      </div>
      {favourite && TEAMS[favourite.teamId] && (
        <div className="hero-tile">
          <p className="hero-label">Projected premier</p>
          <div className="hero-team">
            <TeamChip teamId={favourite.teamId} />
            <span className="hero-num">{(favourite.premier * 100).toFixed(1)}%</span>
          </div>
          <p className="hero-sub">
            {Math.round(favourite.reachGF * 100)}% to reach the Grand Final ·{' '}
            {Math.round(favourite.makeFinals * 100)}% to play finals
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
                  style={{ width: `${(r.premier / max) * 100}%`, background: team.color }}
                />
                <span className="oddsval">{pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%</span>
              </span>
              <span className="oddsminor" role="cell">
                GF {Math.round(r.reachGF * 100)}% · Finals {Math.round(r.makeFinals * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
