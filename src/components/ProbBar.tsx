import { TEAMS, teamAbbrev } from '../domain/teams';

/**
 * Head-to-head win-probability bar: two fills separated by a 2px surface gap,
 * each labeled with the team abbreviation and percentage (never color alone).
 */
export default function ProbBar({
  homeId,
  awayId,
  homeProb,
  label
}: {
  homeId: number;
  awayId: number;
  homeProb: number;
  label?: string;
}) {
  const hp = Math.round(homeProb * 100);
  const ap = 100 - hp;
  const home = TEAMS[homeId];
  const away = TEAMS[awayId];
  return (
    <div className="probbar-wrap">
      {label && <span className="probbar-label">{label}</span>}
      <div
        className="probbar"
        role="img"
        aria-label={`${teamAbbrev(homeId)} ${hp}% — ${teamAbbrev(awayId)} ${ap}%`}
        title={`${home?.name ?? 'Home'} ${hp}% · ${away?.name ?? 'Away'} ${ap}%`}
      >
        <span className="probseg" style={{ width: `${hp}%`, background: home?.color ?? '#888' }} />
        <span className="probseg" style={{ width: `${ap}%`, background: away?.color ?? '#555' }} />
      </div>
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
