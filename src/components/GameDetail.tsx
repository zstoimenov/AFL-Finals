import { useMemo } from 'react';
import type { Game, Snapshot } from '../domain/types';
import type { GameSideDetail } from '../domain/gameDetail';
import { buildGameDetail } from '../domain/gameDetail';
import { formatGameDateTime } from '../domain/format';
import { teamAbbrev, teamShortName } from '../domain/teams';
import { isFavourite } from '../domain/favourite';
import { useDialog } from '../useDialog';
import TeamChip from './TeamChip';
import ProbBar from './ProbBar';

/**
 * One game, in full.
 *
 * The cards around the app have room for a percentage and a venue; everything
 * else the app knows about a fixture — the case for watching it, how these clubs
 * have gone against each other, the form each brings, who is travelling — had
 * nowhere to go, and a fair amount of it was hidden in `title` tooltips that a
 * phone can never show. This is where it goes. It is a route, not local state,
 * so a game can be linked and the back button closes it.
 */
export default function GameDetail({
  game,
  snapshot,
  history = [],
  onClose
}: {
  game: Game;
  snapshot: Snapshot;
  history?: Game[];
  onClose: () => void;
}) {
  const sheet = useDialog<HTMLElement>(onClose);
  const detail = useMemo(
    () => buildGameDetail(snapshot, game, history),
    [snapshot, game, history]
  );

  const hp = Math.round(detail.modelHomeProb * 100);
  const sq = detail.squiggleHomeProb;
  const fav = isFavourite(game.hteamid) || isFavourite(game.ateamid);
  const when = formatGameDateTime(game.date, game.unixtime);
  const round =
    game.is_final > 0 ? `Finals week ${game.is_final}` : game.round === 0 ? 'Opening Round' : `Round ${game.round}`;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet gamesheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${teamShortName(game.hteamid)} v ${teamShortName(game.ateamid)}`}
        ref={sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={fav ? 'sheet-head fav' : 'sheet-head'}>
          <div className="sheet-title">
            <span className="gamesheet-round">{round}</span>
            {fav && <span className="fav-tag">Your club</span>}
            <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>
          <p className="sheet-sub">
            {when}
            {game.venue && ` · ${game.venue}`}
          </p>
        </header>

        <div className="gamesheet-teams">
          <SideBlock
            side={detail.home}
            score={detail.complete ? game.hscore : null}
            prob={hp}
            won={detail.complete && game.winnerteamid === game.hteamid}
          />
          <SideBlock
            side={detail.away}
            score={detail.complete ? game.ascore : null}
            prob={100 - hp}
            won={detail.complete && game.winnerteamid === game.ateamid}
          />
        </div>

        <p className="legendnote formrows-key">Last five — most recent at the top</p>

        <ProbBar homeId={game.hteamid} awayId={game.ateamid} homeProb={detail.modelHomeProb} />
        <p className="legendnote">
          {detail.complete
            ? 'The model’s pre-game call — built only from games that had started by kickoff.'
            : 'In-app model, blended with the Squiggle consensus where the game is tipped.'}
        </p>

        {(sq != null || detail.neutralHost || detail.away.travelling) && (
          <ul className="gamesheet-notes">
            {sq != null && (
              <li>
                <strong>Squiggle consensus</strong> has{' '}
                {teamAbbrev(sq >= 0.5 ? game.hteamid : game.ateamid)} at{' '}
                {Math.round(Math.max(sq, 1 - sq) * 100)}%
                {detail.squiggleMargin != null &&
                  ` — by about ${Math.round(Math.abs(detail.squiggleMargin))} points`}
                .
              </li>
            )}
            {detail.away.travelling && (
              <li>
                <strong>{teamShortName(game.ateamid)}</strong> is away from its own grounds — the
                model gives the host a little extra for it.
              </li>
            )}
            {detail.neutralHost && (
              <li>
                <strong>{teamShortName(game.hteamid)}</strong> is nominally at home but not at one
                of its own venues.
              </li>
            )}
          </ul>
        )}

        {detail.reasons.length > 0 && (
          <>
            <h3 className="club-heading">Why watch</h3>
            <ul className="reasons open">
              {detail.reasons.map((r) => (
                <li key={r.kind + r.text} className={`reason r-${r.kind}`}>
                  {r.text}
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="club-heading">Head to head</h3>
        {detail.meetings.length === 0 ? (
          <p className="sectionnote">No previous meeting in the results the app holds.</p>
        ) : (
          <>
            <p className="gamesheet-record">
              <strong>{teamAbbrev(game.hteamid)}</strong> {detail.record.homeWins} —{' '}
              {detail.record.awayWins} <strong>{teamAbbrev(game.ateamid)}</strong>
              {detail.record.draws > 0 && ` · ${detail.record.draws} drawn`}
            </p>
            <ul className="h2h-list">
              {detail.meetings.map((m) => (
                <li key={m.game.id} className="h2h-row">
                  <span className="h2h-date">
                    {m.game.year}
                    {m.game.is_final > 0 ? ' · Final' : ` · R${m.game.round}`}
                  </span>
                  <span className="h2h-score">
                    <span className={m.winnerId === m.homeId ? 'won' : ''}>
                      {teamAbbrev(m.homeId)} {m.game.hscore}
                    </span>
                    {' – '}
                    <span className={m.winnerId === m.awayId ? 'won' : ''}>
                      {m.game.ascore} {teamAbbrev(m.awayId)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/** One club's block: identity, ladder line, the number, and the form going in. */
function SideBlock({
  side,
  score,
  prob,
  won
}: {
  side: GameSideDetail;
  score: number | null;
  prob: number;
  won: boolean;
}) {
  return (
    <div className={won ? 'gameside won' : 'gameside'}>
      <div className="gameside-id">
        <TeamChip teamId={side.teamId} short interactive={false} />
        <span className="gameside-val">{score != null ? score : `${prob}%`}</span>
      </div>
      <p className="gameside-line">
        {side.home ? 'Home' : 'Away'}
        {side.rank != null && ` · ${side.rank}${ordinalSuffix(side.rank)}`}
        {side.pts != null && ` · ${side.pts} pts`}
        {side.travelling && ' · travelling'}
      </p>
      {side.form.length > 0 && (
        // One result per line, newest at the top. As a wrapped row of chips
        // there was no way to tell last week's game from a month ago — reading
        // order was left-to-right then down, which nobody should have to infer.
        <ol className="formrows">
          {side.form.map((r) => (
            <li
              key={r.game.id}
              className={`formrow ${r.won == null ? 'd' : r.won ? 'w' : 'l'}`}
            >
              <span className="formrow-res" aria-hidden="true">
                {r.won == null ? 'D' : r.won ? 'W' : 'L'}
              </span>
              <span className="formrow-opp">
                {r.home ? 'v ' : '@ '}
                {teamAbbrev(r.opponentId)}
              </span>
              <span className="formrow-margin">
                {r.margin > 0 ? '+' : ''}
                {r.margin}
              </span>
              <span className="visually-hidden">
                {` Round ${r.game.round}, ${
                  r.won == null ? 'drew' : r.won ? 'beat' : 'lost to'
                } ${teamShortName(r.opponentId)} by ${Math.abs(r.margin)}. `}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
