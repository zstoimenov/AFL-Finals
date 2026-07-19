import type { BracketMatch, BracketSide } from '../domain/types';
import { TEAMS, teamAbbrev } from '../domain/teams';
import { formatGameDateTime } from '../domain/format';
import TeamChip from './TeamChip';

/** One bracket slot: matchup name, both sides, result or probabilities. */
export default function MatchCard({ match }: { match: BracketMatch }) {
  const { game } = match;
  const decided = match.winnerTeamId != null;

  return (
    <article className={`matchcard${decided ? ' decided' : ''}`}>
      <header>
        <span className="matchname">{match.name}</span>
        {match.locked && !decided && <span className="matchupset">Matchup set</span>}
      </header>
      {game && (
        <p className="gamewhen">
          {game.venue && <span>{game.venue} · </span>}
          {formatGameDateTime(game.date)}
        </p>
      )}
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
