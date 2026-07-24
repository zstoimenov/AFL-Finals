import { useMemo, useState } from 'react';
import type { Game } from '../domain/types';
import { TEAMS, teamName } from '../domain/teams';
import { headToHeadRecord } from '../domain/seasonStats';
import { formatGameDateTime } from '../domain/format';
import TeamChip from './TeamChip';

/** Team ids that actually appear in the supplied games, sorted by club name. */
function presentTeams(games: Game[]): number[] {
  const ids = new Set<number>();
  for (const g of games) {
    ids.add(g.hteamid);
    ids.add(g.ateamid);
  }
  return [...ids]
    .filter((id) => TEAMS[id])
    .sort((a, b) => teamName(a).localeCompare(teamName(b)));
}

/**
 * Cross-season head-to-head explorer: pick two clubs and see their all-time
 * record and recent meetings across every archived season plus the live one.
 */
export default function HeadToHead({ games }: { games: Game[] }) {
  const teams = useMemo(() => presentTeams(games), [games]);
  const [aId, setAId] = useState<number>(teams[1] ?? teams[0] ?? 0);
  const [bId, setBId] = useState<number>(teams[6] ?? teams[teams.length - 1] ?? 0);
  const { meetings, aWins, bWins, draws } = useMemo(
    () => headToHeadRecord(games, aId, bId),
    [games, aId, bId]
  );

  if (teams.length < 2) return null;

  const picker = (value: number, set: (n: number) => void, label: string) => (
    <label className="h2h-pick">
      <span className="visually-hidden">{label}</span>
      <select value={value} onChange={(e) => set(Number(e.target.value))}>
        {teams.map((id) => (
          <option key={id} value={id}>
            {teamName(id)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="h2h">
      <h3>Head to head</h3>
      <div className="h2h-controls">
        {picker(aId, setAId, 'First club')}
        <span className="h2h-v">v</span>
        {picker(bId, setBId, 'Second club')}
      </div>
      {aId === bId ? (
        <p className="simnote">Pick two different clubs.</p>
      ) : (
        <>
          <div className="h2h-record">
            <span className="h2h-side">
              <TeamChip teamId={aId} compact />
              <strong>{aWins}</strong>
            </span>
            <span className="h2h-mid">
              {meetings.length} meeting{meetings.length === 1 ? '' : 's'}
              {draws > 0 && ` · ${draws} draw${draws === 1 ? '' : 's'}`}
            </span>
            <span className="h2h-side">
              <strong>{bWins}</strong>
              <TeamChip teamId={bId} compact />
            </span>
          </div>
          {meetings.length === 0 ? (
            <p className="simnote">No meetings in the archived data.</p>
          ) : (
            <ul className="h2h-list">
              {meetings.slice(0, 12).map((m) => {
                const g = m.game;
                return (
                  <li key={g.id} className="h2h-row">
                    <span className="h2h-date">
                      {g.year}
                      {g.is_final > 0 ? ' · Final' : ` · R${g.round}`}
                    </span>
                    <span className="h2h-score">
                      <span className={m.winnerId === g.hteamid ? 'won' : ''}>
                        {TEAMS[g.hteamid]?.abbrev} {g.hscore}
                      </span>
                      {' – '}
                      <span className={m.winnerId === g.ateamid ? 'won' : ''}>
                        {g.ascore} {TEAMS[g.ateamid]?.abbrev}
                      </span>
                    </span>
                    <span className="h2h-when">{formatGameDateTime(g.date, g.unixtime)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
