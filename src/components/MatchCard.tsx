import type { CSSProperties, ReactNode } from 'react';
import type { BracketMatch, BracketSide, Game } from '../domain/types';
import type { FinalsContext, FinalsSide } from '../domain/finalsContext';
import { TEAMS, teamAbbrev, teamAccent, teamShortName } from '../domain/teams';
import { isFavourite } from '../domain/favourite';
import { formatGameDateTime } from '../domain/format';
import TeamChip from './TeamChip';
import { CardOpen } from './FixtureCardParts';

/**
 * One bracket slot: matchup name, both sides, result or probabilities — and,
 * when the participants are known, the case the app can make for the game.
 *
 * A final is the most consequential game of the year and the card used to say
 * less about it than a Round 7 card on the Fixtures screen did. The context is
 * optional because the same card draws a slot that is still two placeholders,
 * where there is nothing yet to say.
 */
export default function MatchCard({
  match,
  context
}: {
  match: BracketMatch;
  context?: FinalsContext;
}) {
  const { game } = match;
  const decided = match.winnerTeamId != null;
  // highlight a bracket card once the user's club is confirmed in it (either
  // seeded side, or the projected favourite for a still-TBD slot)
  const fav =
    isFavourite(match.home.teamId) ||
    isFavourite(match.away.teamId) ||
    isFavourite(match.home.candidates[0]?.teamId) ||
    isFavourite(match.away.candidates[0]?.teamId);

  // for an undecided matchup with both teams known, tint the card with the
  // projected winner's colour — a quieter echo of the club highlight above
  const favouredId =
    !fav && !decided && match.homeWinProb != null && match.home.teamId != null && match.away.teamId != null
      ? match.homeWinProb >= 0.5
        ? match.home.teamId
        : match.away.teamId
      : null;
  const winStyle =
    favouredId != null
      ? ({ '--win': teamAccent(favouredId) } as CSSProperties)
      : undefined;

  return (
    <article
      className={`matchcard${decided ? ' decided' : ''}${fav ? ' fav-game' : ''}${
        favouredId != null ? ' win-edge' : ''
      }`}
      style={winStyle}
    >
      {game && <CardOpen game={game} />}
      <header>
        <span className="matchname">{match.name}</span>
        {fav && <span className="fav-tag">Your club</span>}
        {match.locked && !decided && <span className="matchupset">Matchup set</span>}
      </header>
      <WhenLine game={game} />
      <SideRow
        side={match.home}
        score={game?.complete ? game.hscore : null}
        winner={decided && match.winnerTeamId === match.home.teamId}
        prob={match.homeWinProb}
      />
      <SideRow
        side={match.away}
        score={game?.complete ? game.ascore : null}
        winner={decided && match.winnerTeamId === match.away.teamId}
        prob={match.homeWinProb != null ? 1 - match.homeWinProb : null}
      />
      {context && !decided && <MatchContext match={match} context={context} />}
      {match.squiggleHomeProb != null && match.home.teamId != null && (
        <footer className="consensus">
          Squiggle consensus: {teamAbbrev(
            match.squiggleHomeProb >= 0.5 ? match.home.teamId : match.away.teamId
          )}{' '}
          {Math.round(Math.max(match.squiggleHomeProb, 1 - match.squiggleHomeProb) * 100)}%
        </footer>
      )}
    </article>
  );
}

/**
 * When and where.
 *
 * A final without a date is the one thing a finals screen must not be, so the
 * line is always drawn: once the AFL schedules the game it carries the kickoff
 * in AWST and the ground, and until then it says so in as many words rather
 * than leaving a gap the reader has to interpret.
 */
function WhenLine({ game }: { game: Game | null }) {
  if (!game) {
    return <p className="gamewhen tbc">Scheduled once the matchup is set</p>;
  }
  return (
    <p className="gamewhen">
      {formatGameDateTime(game.date, game.unixtime)}
      {game.venue && <span className="whenvenue">{game.venue}</span>}
    </p>
  );
}

/**
 * What the two clubs bring with them: the head-to-head record across every
 * season the archive holds, how many of those meetings were finals, and the
 * last few results between them. This is the "past meetings" a finals card is
 * expected to carry, and it is read straight out of the results corpus rather
 * than curated, so it can never claim history the app can't show.
 */
function MatchContext({ match, context }: { match: BracketMatch; context: FinalsContext }) {
  const { record, meetings, finalsMeetings } = context;
  const homeId = match.home.teamId;
  const awayId = match.away.teamId;
  // a slot with one club seeded and one still to be decided has no record to
  // give, but the club that is there still has a season behind it
  const sides = [context.home, context.away].filter(
    (s): s is FinalsSide => s != null && s.form.length > 0
  );
  if (!record || homeId == null || awayId == null) {
    return sides.length > 0 ? (
      <div className="matchhistory">
        <FormRuns sides={sides} />
      </div>
    ) : null;
  }

  const total = record.homeWins + record.awayWins + record.draws;
  const notes: ReactNode[] = [];
  if (context.away?.travelling) {
    notes.push(<span key="travel">{teamShortName(awayId)} travelling</span>);
  }
  if (finalsMeetings > 0) {
    notes.push(
      <span key="finals">
        {finalsMeetings} of them in finals
      </span>
    );
  }

  return (
    <div className="matchhistory">
      {sides.length > 0 && <FormRuns sides={sides} />}
      {total === 0 ? (
        <p className="h2hline">No meeting on record between these clubs.</p>
      ) : (
        <>
          <p className="h2hline">
            <span className="h2hlabel">Head to head</span>
            <strong>
              {teamAbbrev(homeId)} {record.homeWins}–{record.awayWins} {teamAbbrev(awayId)}
            </strong>
            {record.draws > 0 && <span className="h2hdraws"> · {record.draws} drawn</span>}
          </p>
          <ol className="meetings">
            {meetings.map((m) => {
              const margin = Math.abs((m.game.hscore ?? 0) - (m.game.ascore ?? 0));
              return (
                <li key={m.game.id}>
                  <span className="meeting-when">
                    {m.game.year} {m.game.is_final > 0 ? 'finals' : `R${m.game.round}`}
                  </span>
                  <span className="meeting-what">
                    {m.winnerId == null
                      ? 'drawn'
                      : `${teamAbbrev(m.winnerId)} by ${margin}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {notes.length > 0 && <p className="matchnotes">{notes}</p>}
    </div>
  );
}

/** Tiny padlock shown only when a side is a true mathematical certainty. */
export function SideLockIcon() {
  return (
    <span className="sidelock" title="Mathematically locked to this position">
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="currentColor">
        <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
      </svg>
      <span className="visually-hidden">Mathematically locked to this position</span>
    </span>
  );
}

function SideRow({
  side,
  score,
  winner,
  prob
}: {
  side: BracketSide;
  score: number | null | undefined;
  winner: boolean;
  prob: number | null;
}) {
  if (side.teamId == null) {
    const top = side.candidates[0];
    return (
      <div className="siderow tbd">
        <span className="placeholder">{side.placeholder}</span>
        {top && TEAMS[top.teamId] && (
          <span className="candidate" title="Most likely by simulation">
            {teamAbbrev(top.teamId)} {Math.round(top.prob * 100)}%
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={winner ? 'siderow winner' : 'siderow'}>
      <span className="sidechip">
        <TeamChip teamId={side.teamId} seed={side.seed} compact />
        {side.locked && <SideLockIcon />}
      </span>
      {score != null ? (
        <span className="score">{score}</span>
      ) : (
        prob != null && <span className="sideprob">{Math.round(prob * 100)}%</span>
      )}
    </div>
  );
}

/**
 * Both clubs' recent results, one line each.
 *
 * The run sits under the sides rather than inside them: a bracket column is
 * barely wider than a club name, and five results crammed onto the same line
 * squeezed the name down to an initial. Colour never carries a result on its
 * own — every tick has its letter — and the whole run has a spoken label for
 * anyone not reading the colours.
 */
function FormRuns({ sides }: { sides: FinalsSide[] }) {
  return (
    <div className="matchform">
      {sides.map((s) => (
        <div className="matchform-row" key={s.teamId}>
          <span className="matchform-team">{teamAbbrev(s.teamId)}</span>
          <span
            className="sideform"
            aria-label={`${teamShortName(s.teamId)} last ${s.form.length}, most recent first: ${s.form
              .map((r) => (r.won == null ? 'drew' : r.won ? 'won' : 'lost'))
              .join(', ')}`}
          >
            {s.form.map((r) => (
              <span
                key={r.game.id}
                className={`formtick ${r.won == null ? 'd' : r.won ? 'w' : 'l'}`}
                aria-hidden="true"
              >
                {r.won == null ? 'D' : r.won ? 'W' : 'L'}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
