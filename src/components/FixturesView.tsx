import type { BracketMatch, Game, Snapshot } from '../domain/types';
import { squiggleProb, computeRatings, winProb } from '../domain/predict';
import { teamName } from '../domain/teams';
import TeamChip from './TeamChip';
import ProbBar from './ProbBar';
import MatchCard from './MatchCard';

/**
 * Upcoming games with win-probability bars. During the home & away run-in it
 * shows the next round; once finals begin it shows the finals fixtures.
 */
export default function FixturesView({
  snapshot,
  bracket,
  finalsStarted
}: {
  snapshot: Snapshot;
  bracket: BracketMatch[];
  finalsStarted: boolean;
}) {
  const ratings = computeRatings(snapshot.standings, snapshot.games);

  if (finalsStarted) {
    const upcoming = bracket.filter((m) => m.winnerTeamId == null);
    const played = bracket.filter((m) => m.winnerTeamId != null);
    return (
      <section className="fixtures">
        <h2>Finals fixtures</h2>
        <div className="cardgrid">
          {upcoming.map((m) => (
            <MatchCard key={m.key} match={m} />
          ))}
        </div>
        {played.length > 0 && (
          <>
            <h2>Completed finals</h2>
            <div className="cardgrid">
              {played.map((m) => (
                <MatchCard key={m.key} match={m} />
              ))}
            </div>
          </>
        )}
      </section>
    );
  }

  const nextRound = Math.min(
    ...snapshot.games.filter((g) => !g.complete && g.is_final === 0).map((g) => g.round)
  );
  const games = snapshot.games.filter((g) => g.round === nextRound && g.is_final === 0);

  return (
    <section className="fixtures">
      <h2>Round {nextRound} fixtures</h2>
      <p className="sectionnote">
        Win probabilities from the in-app model; Squiggle consensus shown where models have
        tipped the game.
      </p>
      <div className="fixturelist">
        {games.map((g) => (
          <FixtureRow key={g.id} game={g} snapshot={snapshot} ratings={ratings} />
        ))}
      </div>
    </section>
  );
}

function FixtureRow({
  game,
  snapshot,
  ratings
}: {
  game: Game;
  snapshot: Snapshot;
  ratings: Map<number, number>;
}) {
  const p = winProb(ratings, game.hteamid, game.ateamid);
  const sq = squiggleProb(snapshot, game.hteamid, game.ateamid);
  const when = new Date(game.date.replace(' ', 'T'));
  return (
    <article className="fixturerow">
      <div className="fixturehead">
        <span className="fixture-teams">
          <TeamChip teamId={game.hteamid} /> <span className="vs">v</span>{' '}
          <TeamChip teamId={game.ateamid} />
        </span>
        <span className="venue">
          {game.venue} ·{' '}
          {when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>
      <ProbBar homeId={game.hteamid} awayId={game.ateamid} homeProb={p} />
      {sq != null && (
        <p className="consensus">
          Squiggle consensus: {teamName(sq >= 0.5 ? game.hteamid : game.ateamid)}{' '}
          {Math.round(Math.max(sq, 1 - sq) * 100)}%
        </p>
      )}
    </article>
  );
}
