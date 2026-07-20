import type { Snapshot, TeamLocks } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { sortedStandings } from '../domain/ladder';
import { lockLabel } from '../domain/locks';
import { isFavourite } from '../domain/favourite';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';
import InfoButton from './InfoButton';

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
      <div className="section-head">
        <h2>Ladder</h2>
        <InfoButton title="About the ladder">
          <p>
            Top 6 skip the Wildcard Round; 7th–10th play sudden-death wildcards to reach the
            finals. The dashed gold line marks the wildcard-bye cut (6th); the solid line marks
            the finals cut (10th).
          </p>
          <p>
            Badges mark mathematically settled fates. “Finals %” is each team&apos;s simulated
            chance of playing finals. Tap any team for its run home and odds.
          </p>
        </InfoButton>
      </div>
      <div className="tablewrap">
        <table className="ladder">
          <thead>
            <tr>
              <th className="num rank">#</th>
              <th className="teamcell">Team</th>
              <th className="num sec">P</th>
              <th className="num sec">W</th>
              <th className="num sec">L</th>
              <th className="num sec">D</th>
              <th className="num">Pts</th>
              <th className="num">%</th>
              <th className="num finalspct">Finals %</th>
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
                  className={[
                    i === 5 ? 'cut bye-cut' : i === 9 ? 'cut finals-cut' : '',
                    isFavourite(s.id) ? 'fav-row' : ''
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
                >
                  <td className="num rank">{i + 1}</td>
                  <td className="teamcell">
                    <TeamChip teamId={s.id} />
                  </td>
                  <td className="num sec">{s.played}</td>
                  <td className="num sec">{s.wins}</td>
                  <td className="num sec">{s.losses}</td>
                  <td className="num sec">{s.draws}</td>
                  <td className="num pts">{s.pts}</td>
                  <td className="num">{s.percentage.toFixed(1)}</td>
                  <td className="num finalspct">
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
        <span className="cutkey bye" /> bye line (6th) · <span className="cutkey fin" /> finals
        line (10th) · <span className="fav-star" aria-hidden="true">★</span> your club
      </p>
    </section>
  );
}
