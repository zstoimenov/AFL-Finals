import { useState } from 'react';
import type { Snapshot, TeamLocks } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import { sortedStandings } from '../domain/ladder';
import { lockLabel } from '../domain/locks';
import { ladderCutLines, finalsFormatFor } from '../domain/season';
import { isFavourite } from '../domain/favourite';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';
import InfoButton from './InfoButton';

/**
 * The ladder with format-aware finals cut lines and, for the live season,
 * mathematical lock badges and simulated finals chances. For an archived season
 * it shows the final table: the cut lines match that era's format and the
 * simulated column is dropped (the season is decided).
 */
export default function LadderView({
  snapshot,
  locks,
  sim,
  historical = false
}: {
  snapshot: Snapshot;
  locks: TeamLocks[];
  sim: SimOutput | null;
  historical?: boolean;
}) {
  const ladder = sortedStandings(snapshot.standings);
  const lockByTeam = new Map(locks.map((l) => [l.teamId, l]));
  const { byeCutIndex, finalsCutIndex } = ladderCutLines(snapshot.meta);
  const wildcard = finalsFormatFor(snapshot.meta) === 'top10-wildcard';
  const showChance = !historical;
  // a soft edge on the pinned crest column, shown only once scrolled sideways
  const [scrolled, setScrolled] = useState(false);

  return (
    <section className="ladderview">
      <div className="section-head">
        <h2>Ladder</h2>
        <InfoButton title="About the ladder">
          {wildcard ? (
            <p>
              Top 6 skip the Wildcard Round; 7th–10th play sudden-death wildcards to reach the
              finals. The dashed gold line marks the wildcard-bye cut (6th); the solid line marks
              the finals cut (10th).
            </p>
          ) : (
            <p>
              This season used the top-eight final eight. The solid line marks the finals cut
              (8th).
            </p>
          )}
          <p>
            {historical
              ? 'The final table for this season. Tap any team for its season and record.'
              : 'Badges mark mathematically settled fates. “Finals %” is each team’s simulated chance of playing finals. Tap any team for its run home and odds.'}
          </p>
        </InfoButton>
      </div>
      <div
        className={scrolled ? 'tablewrap scrolled' : 'tablewrap'}
        onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 0)}
      >
        <table className="ladder">
          <thead>
            <tr>
              <th className="idcell">
                <span className="rank">#</span>
              </th>
              <th className="namecell">Team</th>
              <th className="num sec">P</th>
              <th className="num sec">W</th>
              <th className="num sec">L</th>
              <th className="num sec">D</th>
              <th className="num">Pts</th>
              <th className="num">%</th>
              {showChance && <th className="num finalspct">Finals %</th>}
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
                    i === byeCutIndex ? 'cut bye-cut' : i === finalsCutIndex ? 'cut finals-cut' : '',
                    isFavourite(s.id) ? 'fav-row' : ''
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
                >
                  <td className="idcell">
                    <span className="rank">{i + 1}</span>
                    <TeamChip teamId={s.id} part="icon" />
                  </td>
                  <td className="namecell">
                    <TeamChip teamId={s.id} part="name" />
                  </td>
                  <td className="num sec">{s.played}</td>
                  <td className="num sec">{s.wins}</td>
                  <td className="num sec">{s.losses}</td>
                  <td className="num sec">{s.draws}</td>
                  <td className="num pts">{s.pts}</td>
                  <td className="num">{s.percentage.toFixed(1)}</td>
                  {showChance && (
                    <td className="num finalspct">
                      {finalsPct != null ? `${Math.round(finalsPct * 100)}%` : '…'}
                    </td>
                  )}
                  <td>{label && <LockBadge label={label} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="legendnote">
        {wildcard && (
          <>
            <span className="cutkey bye" /> bye line (6th) ·{' '}
          </>
        )}
        <span className="cutkey fin" /> finals line ({finalsCutIndex + 1}
        {finalsCutIndex + 1 === 8 ? 'th' : 'th'}) ·{' '}
        <span className="fav-star" aria-hidden="true">★</span> your club
      </p>
    </section>
  );
}
