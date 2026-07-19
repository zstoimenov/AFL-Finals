import { useEffect, useMemo, useState } from 'react';
import type { BracketMatch, Game, Snapshot } from '../domain/types';
import { squiggleProb, computeRatings, winProb } from '../domain/predict';
import { formatGameDateTime } from '../domain/format';
import { currentHomeAwayRound, homeAwayRounds } from '../domain/ladder';
import { TEAMS, teamName } from '../domain/teams';
import { gameHasFavourite } from '../domain/favourite';
import TeamChip from './TeamChip';
import ProbBar from './ProbBar';
import MatchCard from './MatchCard';
import InfoButton from './InfoButton';

const roundLabel = (r: number) => (r === 0 ? 'Opening Round' : `Round ${r}`);

/**
 * Fixtures by round: completed games show their result (highlighted), upcoming
 * games show win-probability bars. Opens on the current round and advances
 * automatically as results come in; the arrows step between rounds. Once finals
 * begin it shows the finals fixtures instead.
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
  const ratings = useMemo(
    () => computeRatings(snapshot.standings, snapshot.games),
    [snapshot]
  );
  const rounds = useMemo(() => homeAwayRounds(snapshot.games), [snapshot]);
  const current = useMemo(() => currentHomeAwayRound(snapshot.games), [snapshot]);
  const [round, setRound] = useState(current);
  // follow the current round whenever fresh data shifts it (auto-advance)
  useEffect(() => setRound(current), [current]);

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

  const min = rounds[0] ?? 0;
  const max = rounds[rounds.length - 1] ?? 0;
  const games = snapshot.games
    .filter((g) => g.round === round && g.is_final === 0)
    .sort((a, b) => (a.unixtime ?? 0) - (b.unixtime ?? 0) || a.id - b.id);
  const allDone = games.length > 0 && games.every((g) => g.complete);

  return (
    <section className="fixtures">
      <div className="section-head">
        <h2>Fixtures</h2>
        <InfoButton title="About fixtures">
          <p>
            Completed games show the final score with the winner highlighted; upcoming games
            show each team&apos;s win probability from the in-app model, with the Squiggle
            model consensus where it&apos;s been tipped.
          </p>
          <p>
            The view opens on the current round and moves to the next one automatically once
            every result is in. Use the arrows to look back or ahead. All times are AWST.
          </p>
        </InfoButton>
      </div>

      <div className="round-nav">
        <button
          type="button"
          className="round-step"
          aria-label="Previous round"
          disabled={round <= min}
          onClick={() => setRound((r) => Math.max(min, r - 1))}
        >
          ‹
        </button>
        <span className="round-label">
          {roundLabel(round)}
          {round === current && <span className="round-current">Current</span>}
          {allDone && round !== current && <span className="round-done">Complete</span>}
        </span>
        <button
          type="button"
          className="round-step"
          aria-label="Next round"
          disabled={round >= max}
          onClick={() => setRound((r) => Math.min(max, r + 1))}
        >
          ›
        </button>
      </div>

      <div className="fixturelist">
        {games.map((g) =>
          g.complete ? (
            <ResultRow key={g.id} game={g} />
          ) : (
            <FixtureRow key={g.id} game={g} snapshot={snapshot} ratings={ratings} />
          )
        )}
      </div>
    </section>
  );
}

function GameMeta({ game }: { game: Game }) {
  return (
    <span className="venue">
      {formatGameDateTime(game.date, game.unixtime)}
      {game.venue ? ` · ${game.venue}` : ''}
    </span>
  );
}

/** A finished game: final score, winner highlighted. */
function ResultRow({ game }: { game: Game }) {
  const homeWon = (game.hscore ?? 0) > (game.ascore ?? 0);
  const awayWon = (game.ascore ?? 0) > (game.hscore ?? 0);
  const fav = gameHasFavourite(game);
  return (
    <article className={fav ? 'fixturerow done fav-game' : 'fixturerow done'}>
      <div className="fixturehead">
        <span className="final-tag">Final</span>
        {fav && <span className="fav-tag">Your club</span>}
        <GameMeta game={game} />
      </div>
      <div className="scoreline">
        <ScoreSide teamId={game.hteamid} score={game.hscore} won={homeWon} />
        <ScoreSide teamId={game.ateamid} score={game.ascore} won={awayWon} />
      </div>
    </article>
  );
}

function ScoreSide({
  teamId,
  score,
  won
}: {
  teamId: number;
  score: number | null;
  won: boolean;
}) {
  return (
    <div className={won ? 'scoreside won' : 'scoreside'}>
      <span className="scoreside-team">
        <TeamChip teamId={teamId} />
        {won && (
          <span className="wintick" title="Winner" style={{ color: TEAMS[teamId]?.color2 }}>
            ✓
          </span>
        )}
      </span>
      <span className="scoreside-score">{score}</span>
    </div>
  );
}

/** An upcoming game: win-probability bar + consensus. */
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
  const fav = gameHasFavourite(game);
  return (
    <article className={fav ? 'fixturerow fav-game' : 'fixturerow'}>
      <div className="fixturehead">
        {fav && <span className="fav-tag">Your club</span>}
        <span className="fixture-teams">
          <TeamChip teamId={game.hteamid} /> <span className="vs">v</span>{' '}
          <TeamChip teamId={game.ateamid} />
        </span>
        <GameMeta game={game} />
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
