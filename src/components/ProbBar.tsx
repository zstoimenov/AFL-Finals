import { TEAMS, teamAbbrev } from '../domain/teams';

/**
 * Head-to-head win-probability bar: two fills separated by a 2px surface gap.
 * By default it carries its own team/percentage labels (identity is never
 * conveyed by color alone). Pass `bare` to render just the bar when the caller
 * already shows each side's percentage elsewhere — the accessible label still
 * names both teams and their odds.
 */
export default function ProbBar({
  homeId,
  awayId,
  homeProb,
  label,
  bare = false
}: {
  homeId: number;
  awayId: number;
  homeProb: number;
  label?: string;
  bare?: boolean;
}) {
  const hp = Math.round(homeProb * 100);
  const ap = 100 - hp;
  const home = TEAMS[homeId];
  const away = TEAMS[awayId];
  const bar = (
    <div
      className="probbar"
      role="img"
      aria-label={`${teamAbbrev(homeId)} ${hp}% — ${teamAbbrev(awayId)} ${ap}%`}
      title={`${home?.name ?? 'Home'} ${hp}% · ${away?.name ?? 'Away'} ${ap}%`}
    >
      <span className="probseg" style={{ width: `${hp}%`, background: home?.color ?? '#888' }} />
      <span className="probseg" style={{ width: `${ap}%`, background: away?.color ?? '#555' }} />
    </div>
  );
  if (bare) return bar;
  return (
    <div className="probbar-wrap">
      {label && <span className="probbar-label">{label}</span>}
      {bar}
      <div className="probnums">
        <span>
          {teamAbbrev(homeId)} <strong>{hp}%</strong>
        </span>
        <span>
          {teamAbbrev(awayId)} <strong>{ap}%</strong>
        </span>
      </div>
    </div>
  );
}
