import type { Snapshot } from '../domain/types';
import { sortedStandings } from '../domain/ladder';
import { seasonFinals } from '../domain/seasonStats';
import { formatLabel } from '../domain/season';
import { teamName } from '../domain/teams';
import TeamChip from './TeamChip';

/**
 * The decided-season stand-in for the Odds tab: no projection to run, so it
 * records the outcome — premier, runner-up (from the Grand Final) and the top of
 * the final ladder.
 */
export default function SeasonSummary({ snapshot }: { snapshot: Snapshot }) {
  const ladder = sortedStandings(snapshot.standings);
  const finals = seasonFinals(snapshot.games);
  const gf = finals[finals.length - 1] ?? null;
  const premier = snapshot.meta.premier ?? gf?.winnerteamid ?? null;
  const runnerUp =
    gf && premier != null ? (gf.hteamid === premier ? gf.ateamid : gf.hteamid) : null;
  const minorPremier = ladder[0]?.id ?? null;

  return (
    <section className="oddsview">
      <div className="section-head">
        <h2>Season summary — {snapshot.meta.year}</h2>
        <span className="format-chip">{formatLabel(snapshot.meta)}</span>
      </div>
      {premier != null && (
        <div className="hero-tile">
          <p className="hero-label">Premier</p>
          <div className="hero-team">
            <TeamChip teamId={premier} />
          </div>
          {runnerUp != null && (
            <p className="hero-sub">
              def. {teamName(runnerUp)} in the Grand Final
              {gf && gf.hscore != null && gf.ascore != null && (
                <> · {Math.max(gf.hscore, gf.ascore)}–{Math.min(gf.hscore, gf.ascore)}</>
              )}
            </p>
          )}
        </div>
      )}
      <div className="summary-grid">
        {minorPremier != null && (
          <div className="summary-cell">
            <span className="summary-cap">Minor premier</span>
            <TeamChip teamId={minorPremier} compact />
          </div>
        )}
        <div className="summary-cell">
          <span className="summary-cap">Top 4</span>
          <div className="summary-top4">
            {ladder.slice(0, 4).map((s, i) => (
              <span className="summary-rank" key={s.id}>
                <span className="summary-rank-n">{i + 1}</span>
                <TeamChip teamId={s.id} compact />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
