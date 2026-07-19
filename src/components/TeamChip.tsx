import { useContext } from 'react';
import { TEAMS } from '../domain/teams';
import { isFavourite } from '../domain/favourite';
import { TeamSelectContext } from '../teamSelect';

/**
 * A club identity chip: colored monogram + name. Identity is always carried by
 * the text label, never color alone. When a TeamSelect context is available
 * the chip is a button that opens the team's detail sheet. The user's own club
 * (see domain/favourite) is marked with a star and a `fav` class so it can be
 * spotted anywhere a team appears.
 */
export default function TeamChip({
  teamId,
  seed,
  compact = false,
  interactive = true
}: {
  teamId: number | null;
  seed?: number | null;
  compact?: boolean;
  /** set false to render a plain chip even inside the select context */
  interactive?: boolean;
}) {
  const selectTeam = useContext(TeamSelectContext);
  const team = teamId != null ? TEAMS[teamId] : null;
  const fav = isFavourite(teamId);

  if (!team) {
    return (
      <span className="teamchip tbd">
        <span className="monogram" aria-hidden="true">
          ?
        </span>
        <span className="teamname">TBD</span>
      </span>
    );
  }

  const body = (
    <>
      <span
        className="monogram"
        style={{
          background: team.color,
          color: pickInk(team.color),
          // secondary club colour as a trim ring so two-tone identities read
          // (e.g. West Coast's gold on navy, Hawthorn's gold on brown)
          boxShadow: `inset 0 0 0 2px ${team.color2}`
        }}
        aria-hidden="true"
      >
        {team.abbrev.slice(0, 2)}
      </span>
      <span className="teamname">{compact ? team.abbrev : team.name}</span>
      {fav && (
        <span className="fav-star" title="Your club" aria-label="Your club">
          ★
        </span>
      )}
      {seed != null && <span className="seed">#{seed}</span>}
    </>
  );

  if (selectTeam && interactive) {
    return (
      <button
        type="button"
        className={fav ? 'teamchip clickable fav' : 'teamchip clickable'}
        title={fav ? `${team.name} (your club) — remaining games & odds` : `${team.name} — remaining games & odds`}
        onClick={(e) => {
          e.stopPropagation();
          selectTeam(team.id);
        }}
      >
        {body}
      </button>
    );
  }
  return <span className={fav ? 'teamchip fav' : 'teamchip'}>{body}</span>;
}

/** White or near-black ink depending on the chip color's luminance. */
function pickInk(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 150 ? '#101418' : '#ffffff';
}
