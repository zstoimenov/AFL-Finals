import type { Game, Snapshot } from '../domain/types';
import { seasonFinals } from '../domain/seasonStats';
import { formatLabel } from '../domain/season';
import { teamName } from '../domain/teams';
import TeamChip from './TeamChip';

const WEEK_LABELS: Record<number, string> = {
  1: 'Finals Week 1',
  2: 'Semi Finals',
  3: 'Preliminary Finals',
  4: 'Grand Final'
};

/**
 * An archived season's finals as real results, grouped by week. The app doesn't
 * project a bracket for past formats (they differ from the current one), so this
 * simply records what happened, ending on the Grand Final and the premier.
 */
export default function FinalsResults({ snapshot }: { snapshot: Snapshot }) {
  const finals = seasonFinals(snapshot.games);
  const premier = snapshot.meta.premier ?? null;
  if (finals.length === 0) {
    return (
      <section>
        <h2>Finals</h2>
        <p className="simnote">No finals results recorded for this season.</p>
      </section>
    );
  }
  const maxWeek = Math.max(...finals.map((g) => g.is_final));
  const weeks = [...new Set(finals.map((g) => g.is_final))].sort((a, b) => a - b);
  const label = (week: number) =>
    week === maxWeek ? 'Grand Final' : WEEK_LABELS[week] ?? `Finals Week ${week}`;

  return (
    <section className="finals-results">
      <div className="section-head">
        <h2>Finals — {snapshot.meta.year}</h2>
        <span className="format-chip">{formatLabel(snapshot.meta)}</span>
      </div>
      {premier != null && (
        <div className="premier-banner">
          <span className="premier-cup" aria-hidden="true">🏆</span>
          <span>
            <strong>{teamName(premier)}</strong> — {snapshot.meta.year} premiers
          </span>
        </div>
      )}
      {weeks.map((week) => (
        <div className="finals-week" key={week}>
          <h3>{label(week)}</h3>
          <div className="cardgrid">
            {finals.filter((g) => g.is_final === week).map((g) => (
              <FinalCard key={g.id} game={g} premier={premier} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function FinalCard({ game, premier }: { game: Game; premier: number | null }) {
  const homeWon = game.winnerteamid === game.hteamid;
  const awayWon = game.winnerteamid === game.ateamid;
  return (
    <article className="fixturerow done">
      <div className="fx-teams">
        <div className={`teamline tone-${homeWon ? 'win' : awayWon ? 'loss' : 'flat'}`}>
          <TeamChip teamId={game.hteamid} short />
          <span className="teamline-end">
            {game.winnerteamid === premier && homeWon && (
              <span className="teamline-tick" title="Premier" aria-label="Premier">🏆</span>
            )}
            <span className="teamline-val">{game.hscore}</span>
          </span>
        </div>
        <div className={`teamline tone-${awayWon ? 'win' : homeWon ? 'loss' : 'flat'}`}>
          <TeamChip teamId={game.ateamid} short />
          <span className="teamline-end">
            {game.winnerteamid === premier && awayWon && (
              <span className="teamline-tick" title="Premier" aria-label="Premier">🏆</span>
            )}
            <span className="teamline-val">{game.ascore}</span>
          </span>
        </div>
      </div>
      {game.venue && (
        <div className="fx-foot">
          <span className="fx-venue">{game.venue}</span>
        </div>
      )}
    </article>
  );
}
