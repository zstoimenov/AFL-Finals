import { useMemo, useState } from 'react';
import type { Game, Snapshot, WeatherSnapshot } from '../domain/types';
import type { InterestReason, RatedGame } from '../domain/interest';
import { rateGames, upcomingGames } from '../domain/interest';
import { squiggleProb } from '../domain/predict';
import { isGameToday } from '../domain/format';
import { premierOf } from '../domain/season';
import { sortedStandings } from '../domain/ladder';
import { teamAbbrev, teamName } from '../domain/teams';
import { favouriteTeamId, gameHasFavourite } from '../domain/favourite';
import TeamChip from './TeamChip';
import ProbBar from './ProbBar';
import InfoButton from './InfoButton';
import { CardFoot, CardMeta, CardOpen, TeamLine } from './FixtureCardParts';

/** How many games get the full treatment before the list turns compact. */
const MUST_WATCH = 3;

/**
 * The week ahead, ranked by how much there is to watch. Every game still to be
 * played in the current round is scored by the interest engine — how close the
 * model has it, what the result would settle mathematically, and what history
 * the two clubs bring — and each card shows the reasons behind its ranking, so
 * the order is always arguable rather than mysterious.
 */
export default function ThisWeekView({
  snapshot,
  history = [],
  weather = null
}: {
  snapshot: Snapshot;
  history?: Game[];
  /** kickoff forecasts, so rain or wind can argue for a game */
  weather?: WeatherSnapshot | null;
}) {
  const week = useMemo(() => upcomingGames(snapshot), [snapshot]);
  const rated = useMemo(
    () => rateGames(snapshot, week.games, { history, weather, stakes: !week.finals }),
    [snapshot, week, history, weather]
  );

  // how much of this round is already in the books
  const played = useMemo(
    () =>
      snapshot.games.filter(
        (g) =>
          g.complete &&
          (week.finals ? g.is_final === week.round : g.is_final === 0 && g.round === week.round)
      ).length,
    [snapshot, week]
  );

  const stakes = useMemo(() => collectStakes(rated), [rated]);
  const favIndex = rated.findIndex((r) => gameHasFavourite(r.game));
  const fav = favIndex >= 0 ? rated[favIndex] : null;
  const rest = rated.filter((_, i) => i !== favIndex);

  const title = week.finals ? `Finals week ${week.round}` : roundLabel(week.round);

  return (
    <section className="week">
      <div className="section-head">
        <h2>This week</h2>
        <InfoButton title="How this week is ranked">
          <p>
            Every game still to be played this round, ordered by how much there is to watch. The
            score is simply the sum of the reasons shown on each card — nothing is hidden, so you
            can disagree with the ranking on the evidence.
          </p>
          <p>
            The signals: how evenly the model splits the game, what the result would settle on the
            ladder, where the two clubs sit relative to the finals cut lines, standing rivalries,
            recent head-to-head history and current streaks.
          </p>
          <p>
            <strong>Clinch and elimination lines are mathematical, not likely.</strong> They come
            from the same conservative locks engine as the ladder badges, run over the season as it
            would stand after each result — so &ldquo;win and they&apos;re in&rdquo; means that one
            result guarantees it, whichever way every other game falls.
          </p>
          <p>
            Rivalries that hold every year are curated; the ones a season earns — clubs whose recent
            meetings have all been tight, or a rematch of last year&apos;s finals — are read
            straight out of the results archive.
          </p>
        </InfoButton>
      </div>

      {rated.length === 0 ? (
        <SeasonOver snapshot={snapshot} />
      ) : (
        <>
          <p className="week-sub">
            {title} · {rated.length} game{rated.length === 1 ? '' : 's'} to come
            {played > 0 && (
              <span className="muted">
                {' '}
                · {played} already played — see {week.finals ? 'Finals' : 'Fixtures'} for results
              </span>
            )}
          </p>

          {fav && (
            <>
              <h3 className="week-heading">Your club</h3>
              <WeekCard rated={fav} snapshot={snapshot} badge="Your club" />
            </>
          )}

          <h3 className="week-heading">Must watch</h3>
          {rest.slice(0, MUST_WATCH).map((r, i) => (
            <WeekCard
              key={r.game.id}
              rated={r}
              snapshot={snapshot}
              badge={i === 0 ? 'Pick of the round' : undefined}
            />
          ))}

          {rest.length > MUST_WATCH && (
            <>
              <h3 className="week-heading">Also on</h3>
              {rest.slice(MUST_WATCH).map((r) => (
                <WeekCard key={r.game.id} rated={r} snapshot={snapshot} compact />
              ))}
            </>
          )}

          {stakes.length > 0 && (
            <>
              <h3 className="week-heading">What&apos;s at stake</h3>
              <ul className="stakes">
                {stakes.map((s) => (
                  <li key={s.text} className={`stake ${s.kind}`}>
                    <span className="stake-mark" aria-hidden="true">
                      {s.kind === 'clinch' ? '✓' : '✕'}
                    </span>
                    {s.text}
                  </li>
                ))}
              </ul>
              <p className="legendnote">
                Guaranteed by that result alone — no other game has to fall a particular way.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The off-season.
 *
 * This screen is built around what is on this week, and for four months of every
 * year there is nothing — it used to say so in one line and leave. The season
 * just finished is the thing worth showing then: who won it, and where your club
 * ended up.
 */
function SeasonOver({ snapshot }: { snapshot: Snapshot }) {
  const premier = premierOf(snapshot.games);
  const ladder = sortedStandings(snapshot.standings);
  const mine = favouriteTeamId();
  const myRank = mine != null ? ladder.findIndex((s) => s.id === mine) + 1 : 0;
  const myRow = myRank > 0 ? ladder[myRank - 1] : null;

  return (
    <div className="seasonover">
      <p className="week-sub">The {snapshot.meta.year} season is complete.</p>
      {premier != null && (
        <div className="seasonover-premier">
          <span className="premier-cup" aria-hidden="true">
            🏆
          </span>
          <div>
            <p className="seasonover-label">Premiers</p>
            <TeamChip teamId={premier} />
          </div>
        </div>
      )}
      {myRow && mine != null && (
        <p className="sectionnote">
          {teamName(mine)} finished <strong>{ordinal(myRank)}</strong> — {myRow.wins}–
          {myRow.losses}
          {myRow.draws > 0 ? `–${myRow.draws}` : ''}
          {premier === mine ? ', and won the flag.' : '.'}
        </p>
      )}
      <p className="sectionnote">
        The <strong>Finals</strong> screen has the series as it played out, and{' '}
        <strong>All seasons</strong> in the header opens the archive.
      </p>
    </div>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** One ranked game: why it matters, then the usual match-card furniture. */
function WeekCard({
  rated,
  snapshot,
  badge,
  compact = false
}: {
  rated: RatedGame;
  snapshot: Snapshot;
  badge?: string;
  compact?: boolean;
}) {
  const { game, homeProb, headline, reasons } = rated;
  // A compact card still has a case to make; hiding it entirely contradicts the
  // premise that the ranking is arguable on the evidence. It's one tap away.
  const [open, setOpen] = useState(false);
  const showDetail = !compact || open;
  const hp = Math.round(homeProb * 100);
  const today = isGameToday(game.unixtime, game.date);
  const fav = gameHasFavourite(game);
  const sq = squiggleProb(snapshot, game.hteamid, game.ateamid, game.id);
  const chips = reasons.slice(1); // reasons[0] is the headline

  const cls = `fixturerow weekcard${fav ? ' fav-game' : ''}${today ? ' today' : ''}${
    compact ? ' compact' : ''
  }`;

  return (
    <article className={cls}>
      <CardOpen game={game} />
      <CardMeta
        game={game}
        tag={
          <span className="week-tags">
            {today && <span className="today-tag">Today</span>}
            {badge && <span className="week-badge">{badge}</span>}
          </span>
        }
      />
      <p className="week-headline">{headline}</p>
      <div className="fx-teams">
        <TeamLine teamId={game.hteamid} value={`${hp}%`} tone={homeProb >= 0.5 ? 'lead' : 'trail'} />
        <TeamLine
          teamId={game.ateamid}
          value={`${100 - hp}%`}
          tone={homeProb < 0.5 ? 'lead' : 'trail'}
        />
      </div>
      {showDetail && (
        <div className="fx-bar">
          <ProbBar homeId={game.hteamid} awayId={game.ateamid} homeProb={homeProb} bare />
        </div>
      )}
      {showDetail && chips.length > 0 && (
        <ul className="reasons">
          {chips.map((r) => (
            <li key={r.kind + r.text} className={`reason r-${r.kind}`}>
              {r.text}
            </li>
          ))}
        </ul>
      )}
      {compact && chips.length > 0 && (
        <button
          type="button"
          className="week-more"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Fewer reasons' : `${chips.length} more reason${chips.length === 1 ? '' : 's'}`}
        </button>
      )}
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

/** Every clinch / elimination line across the round, strongest first, deduped. */
function collectStakes(rated: RatedGame[]): InterestReason[] {
  const seen = new Set<string>();
  return rated
    .flatMap((r) => r.reasons)
    .filter((r) => r.kind === 'clinch' || r.kind === 'elimination')
    .filter((r) => (seen.has(r.text) ? false : (seen.add(r.text), true)))
    .sort((a, b) => b.weight - a.weight);
}

const roundLabel = (r: number) => (r === 0 ? 'Opening Round' : `Round ${r}`);
