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
  short = false,
  interactive = true,
  part = 'full'
}: {
  teamId: number | null;
  seed?: number | null;
  compact?: boolean;
  /**
   * Use the club's short place name (e.g. "West Coast") instead of the full
   * "Place + Nickname". Keeps fixture matchups on one line; ignored when
   * `compact` is set, which shows the 3-letter code.
   */
  short?: boolean;
  /** set false to render a plain chip even inside the select context */
  interactive?: boolean;
  /**
   * Which piece of the chip to render. 'full' is the monogram + name; 'icon'
   * and 'name' split them so the ladder can pin just the crest while the name
   * scrolls. Splitting keeps each half independently clickable.
   */
  part?: 'full' | 'icon' | 'name';
}) {
  const selectTeam = useContext(TeamSelectContext);
  const team = teamId != null ? TEAMS[teamId] : null;
  const fav = isFavourite(teamId);

  if (!team) {
    return (
      <span className="teamchip tbd">
        {part !== 'name' && (
          <span className="monogram" aria-hidden="true">
            ?
          </span>
        )}
        {part !== 'icon' && <span className="teamname">TBD</span>}
      </span>
    );
  }

  const monogram = (
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
  );
  const label = (
    <>
      <span className="teamname">{compact ? team.abbrev : short ? team.short : team.name}</span>
      {fav && (
        <span className="fav-star" title="Your club" aria-label="Your club">
          ★
        </span>
      )}
      {seed != null && <span className="seed">#{seed}</span>}
    </>
  );
  const body =
    part === 'icon' ? monogram : part === 'name' ? label : (
      <>
        {monogram}
        {label}
      </>
    );

  if (selectTeam && interactive) {
    return (
      <button
        type="button"
        className={fav ? 'teamchip clickable fav' : 'teamchip clickable'}
        aria-label={fav ? `${team.name} (your club)` : team.name}
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
