import type { BracketMatch, BracketSide } from '../domain/types';
import { TEAMS, teamAbbrev } from '../domain/teams';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';

/** One bracket slot: matchup name, both sides, result or probabilities. */
export default function MatchCard({ match }: { match: BracketMatch }) {
  const { game } = match;
  const decided = match.winnerTeamId != null;

  return (
    <article className={`matchcard${decided ? ' decided' : ''}${match.locked ? ' locked' : ''}`}>
      <header>
        <span className="matchname">{match.name}</span>
        {match.locked && !decided && <LockBadge label="Locked in" />}
        {game?.venue && <span className="venue">{game.venue}</span>}
      </header>
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
      <TeamChip teamId={side.teamId} seed={side.seed} compact />
      {score != null ? (
        <span className="score">{score}</span>
      ) : (
        prob != null && <span className="sideprob">{Math.round(prob * 100)}%</span>
      )}
    </div>
  );
}
