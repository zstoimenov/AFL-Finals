import type { Snapshot, TeamLocks } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { sortedStandings } from '../domain/ladder';
import { lockLabel } from '../domain/locks';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';

/**
 * The live ladder with the 2026 finals cut lines (top 6 bye, top 10 finals)
 * and mathematical lock badges from the locks engine.
 */
export default function LadderView({
  snapshot,
  locks,
  sim
}: {
  snapshot: Snapshot;
  locks: TeamLocks[];
  sim: SimOutput | null;
}) {
  const ladder = sortedStandings(snapshot.standings);
  const lockByTeam = new Map(locks.map((l) => [l.teamId, l]));

  return (
    <section className="ladderview">
      <h2>Ladder</h2>
      <p className="sectionnote">
        Top 6 skip the Wildcard Round; 7th–10th play sudden-death wildcards. Badges mark
        mathematically settled fates; “Finals %” is the simulated chance of playing finals.
      </p>
      <div className="tablewrap">
        <table className="ladder">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Team</th>
              <th className="num">P</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">D</th>
              <th className="num">Pts</th>
              <th className="num">%</th>
              <th className="num">Finals %</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((s, i) => {
              const lock = lockByTeam.get(s.id);
              const label = lock ? lockLabel(lock) : null;
              const finalsPct = sim ? sim.teams[s.id]?.makeFinals : null;
              return (
                <tr
                  key={s.id}
                  className={
                    i === 5 ? 'cut bye-cut' : i === 9 ? 'cut finals-cut' : undefined
                  }
                >
                  <td className="num rank">{i + 1}</td>
                  <td>
                    <TeamChip teamId={s.id} />
                  </td>
                  <td className="num">{s.played}</td>
                  <td className="num">{s.wins}</td>
                  <td className="num">{s.losses}</td>
                  <td className="num">{s.draws}</td>
                  <td className="num pts">{s.pts}</td>
                  <td className="num">{s.percentage.toFixed(1)}</td>
                  <td className="num">
                    {finalsPct != null ? `${Math.round(finalsPct * 100)}%` : '…'}
                  </td>
                  <td>{label && <LockBadge label={label} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="legendnote">
        <span className="cutkey bye" /> wildcard-bye line (6th) · <span className="cutkey fin" />{' '}
        finals line (10th)
      </p>
    </section>
  );
}
