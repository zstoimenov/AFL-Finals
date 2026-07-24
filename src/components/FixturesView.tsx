import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { BracketMatch, Game, Snapshot } from '../domain/types';
import { squiggleProb, computeRatings, fixtureHomeProb, preGameHomeProb } from '../domain/predict';
import { formatGameDateTime, isGameToday } from '../domain/format';
import { currentHomeAwayRound, homeAwayRounds } from '../domain/ladder';
import { teamAbbrev } from '../domain/teams';
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
            Upcoming games show each team&apos;s win probability from the in-app model, with a
            bar for the split and the Squiggle model consensus where it&apos;s been tipped.
          </p>
          <p>
            Completed games show the final score with the winner highlighted, plus a check on
            each tip: whether the in-app model and Squiggle picked the actual winner. The model
            tip is graded on its pre-game rating, so a result never flatters its own forecast.
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
            <ResultRow key={g.id} game={g} snapshot={snapshot} />
          ) : (
            <FixtureRow key={g.id} game={g} snapshot={snapshot} ratings={ratings} />
          )
        )}
      </div>
    </section>
  );
}

/** Top line of every card: kickoff date/time, plus an optional status chip. */
function CardMeta({ game, tag }: { game: Game; tag?: ReactNode }) {
  return (
    <div className="fx-meta">
      <span className="fx-when">{formatGameDateTime(game.date, game.unixtime)}</span>
      {tag}
    </div>
  );
}

/** Bottom line of every card: venue on the left, extra info on the right. */
function CardFoot({ venue, children }: { venue: string | null; children?: ReactNode }) {
  if (!venue && !children) return null;
  return (
    <div className="fx-foot">
      {venue && <span className="fx-venue">{venue}</span>}
      {children && <span className="fx-foot-end">{children}</span>}
    </div>
  );
}

/**
 * One club on a card: crest + short name on the left, a value (win % or final
 * score) pinned to a fixed right-hand column so the numbers line up across every
 * card in the grid. `tone` drives the emphasis — leading side, winner, or the
 * dimmed loser.
 */
function TeamLine({
  teamId,
  value,
  tone,
  won = false
}: {
  teamId: number;
  value: ReactNode;
  tone: 'lead' | 'trail' | 'win' | 'loss' | 'flat';
  won?: boolean;
}) {
  return (
    <div className={`teamline tone-${tone}`}>
      <TeamChip teamId={teamId} short />
      <span className="teamline-end">
        {won && (
          <span className="teamline-tick" title="Winner" aria-label="Winner">
            ✓
          </span>
        )}
        <span className="teamline-val">{value}</span>
      </span>
    </div>
  );
}

/** Whether a predictor that made `homeProb` picked the team that actually won. */
function tipVerdict(homeProb: number | null, game: Game) {
  if (homeProb == null) return null;
  const pickId = homeProb >= 0.5 ? game.hteamid : game.ateamid;
  const drawn = game.winnerteamid == null;
  return { pickId, drawn, hit: !drawn && game.winnerteamid === pickId };
}

/** A single "who did this model tip, and were they right?" chip. */
function Verdict({
  source,
  v
}: {
  source: string;
  v: { pickId: number; drawn: boolean; hit: boolean };
}) {
  const state = v.drawn ? 'drawn' : v.hit ? 'hit' : 'miss';
  const outcome = v.drawn ? 'draw — no result to grade' : v.hit ? 'correct' : 'incorrect';
  return (
    <span className={`verdict ${state}`} title={`${source} tipped ${teamAbbrev(v.pickId)} — ${outcome}`}>
      <span className="verdict-src">{source}</span>
      <span className="verdict-pick">{teamAbbrev(v.pickId)}</span>
      <span className="verdict-mark" aria-hidden="true">
        {v.drawn ? '–' : v.hit ? '✓' : '✗'}
      </span>
      <span className="visually-hidden">{outcome}</span>
    </span>
  );
}

/** A finished game: final score, winner highlighted, and how the tips fared. */
function ResultRow({ game, snapshot }: { game: Game; snapshot: Snapshot }) {
  const fav = gameHasFavourite(game);
  const homeWon = game.winnerteamid === game.hteamid;
  const awayWon = game.winnerteamid === game.ateamid;
  // grade each tip against the actual winner: the model on its pre-game rating
  // (no hindsight), Squiggle on its stored consensus
  const model = tipVerdict(preGameHomeProb(snapshot, game), game);
  const squiggle = tipVerdict(squiggleProb(snapshot, game.hteamid, game.ateamid), game);
  return (
    <article className={fav ? 'fixturerow done fav-game' : 'fixturerow done'}>
      <CardMeta game={game} tag={<span className="final-tag">Final</span>} />
      <div className="fx-teams">
        <TeamLine
          teamId={game.hteamid}
          value={game.hscore}
          tone={homeWon ? 'win' : awayWon ? 'loss' : 'flat'}
          won={homeWon}
        />
        <TeamLine
          teamId={game.ateamid}
          value={game.ascore}
          tone={awayWon ? 'win' : homeWon ? 'loss' : 'flat'}
          won={awayWon}
        />
      </div>
      <CardFoot venue={game.venue}>
        {model && <Verdict source="Model" v={model} />}
        {squiggle && <Verdict source="Squiggle" v={squiggle} />}
      </CardFoot>
    </article>
  );
}

/** An upcoming game: each side's win probability, a split bar, and consensus. */
function FixtureRow({
  game,
  snapshot,
  ratings
}: {
  game: Game;
  snapshot: Snapshot;
  ratings: Map<number, number>;
}) {
  const p = fixtureHomeProb(ratings, snapshot.games, game);
  const hp = Math.round(p * 100);
  const sq = squiggleProb(snapshot, game.hteamid, game.ateamid);
  const fav = gameHasFavourite(game);
  const today = isGameToday(game.unixtime, game.date);
  const cls = `fixturerow${fav ? ' fav-game' : ''}${today ? ' today' : ''}`;
  return (
    <article className={cls}>
      <CardMeta
        game={game}
        tag={today ? <span className="today-tag">Today</span> : undefined}
      />
      <div className="fx-teams">
        <TeamLine
          teamId={game.hteamid}
          value={`${hp}%`}
          tone={p >= 0.5 ? 'lead' : 'trail'}
        />
        <TeamLine
          teamId={game.ateamid}
          value={`${100 - hp}%`}
          tone={p < 0.5 ? 'lead' : 'trail'}
        />
      </div>
      <div className="fx-bar">
        <ProbBar homeId={game.hteamid} awayId={game.ateamid} homeProb={p} bare />
      </div>
      <CardFoot venue={game.venue}>
        {sq != null && (
          <span className="fx-consensus">
            Squiggle <strong>{teamAbbrev(sq >= 0.5 ? game.hteamid : game.ateamid)}</strong>{' '}
            {Math.round(Math.max(sq, 1 - sq) * 100)}%
          </span>
        )}
      </CardFoot>
    </article>
  );
}
