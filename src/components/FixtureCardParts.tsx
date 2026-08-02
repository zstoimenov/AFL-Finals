import type { ReactNode } from 'react';
import type { Game } from '../domain/types';
import { formatGameDateTime } from '../domain/format';
import TeamChip from './TeamChip';

/**
 * The three pieces every match card is built from — the kickoff line, the club
 * lines and the footer. Shared by the Fixtures list and the This Week page so
 * a game looks the same wherever the app shows it.
 */

/** Top line of every card: kickoff date/time, plus an optional status chip. */
export function CardMeta({ game, tag }: { game: Game; tag?: ReactNode }) {
  return (
    <div className="fx-meta">
      <span className="fx-when">{formatGameDateTime(game.date, game.unixtime)}</span>
      {tag}
    </div>
  );
}

/** Bottom line of every card: venue on the left, extra info on the right. */
export function CardFoot({ venue, children }: { venue: string | null; children?: ReactNode }) {
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
export function TeamLine({
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
