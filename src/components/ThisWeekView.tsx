import { useMemo } from 'react';
import type { Game, Snapshot } from '../domain/types';
import type { InterestReason, RatedGame } from '../domain/interest';
import { rateGames, upcomingGames } from '../domain/interest';
import { squiggleProb } from '../domain/predict';
import { isGameToday } from '../domain/format';
import { teamAbbrev } from '../domain/teams';
import { gameHasFavourite } from '../domain/favourite';
import ProbBar from './ProbBar';
import InfoButton from './InfoButton';
import { CardFoot, CardMeta, TeamLine } from './FixtureCardParts';

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
  history = []
}: {
  snapshot: Snapshot;
  history?: Game[];
}) {
  const week = useMemo(() => upcomingGames(snapshot), [snapshot]);
  const rated = useMemo(
    () => rateGames(snapshot, week.games, { history, stakes: !week.finals }),
    [snapshot, week, history]
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
        <p className="sectionnote">
          No games left to play — the season is complete. The <strong>Seasons</strong> switcher in
          the header browses past years.
        </p>
      ) : (
        <>
          <p className="week-sub">
            {title} · {rated.length} game{rated.length === 1 ? '' : 's'} to come
            {played > 0 && (
              <span className="muted">
                {' '}
                · {played} already played — see {week.finals ? 'Bracket' : 'Fixtures'} for results
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
  const hp = Math.round(homeProb * 100);
  const today = isGameToday(game.unixtime, game.date);
  const fav = gameHasFavourite(game);
  const sq = squiggleProb(snapshot, game.hteamid, game.ateamid);
  const chips = reasons.slice(1); // reasons[0] is the headline

  const cls = `fixturerow weekcard${fav ? ' fav-game' : ''}${today ? ' today' : ''}${
    compact ? ' compact' : ''
  }`;

  return (
    <article className={cls}>
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
      {!compact && (
        <div className="fx-bar">
          <ProbBar homeId={game.hteamid} awayId={game.ateamid} homeProb={homeProb} bare />
        </div>
      )}
      {!compact && chips.length > 0 && (
        <ul className="reasons">
          {chips.map((r) => (
            <li key={r.kind + r.text} className={`reason r-${r.kind}`}>
              {r.text}
            </li>
          ))}
        </ul>
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
