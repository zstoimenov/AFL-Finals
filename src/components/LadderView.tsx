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

/** 1st, 2nd, 3rd, 4th — a cut line can land anywhere a future format puts it. */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

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
              {/* the full record is desktop-only; a phone gets the W–L that
                  matters and keeps the decisive columns on screen */}
              <th className="num sec">P</th>
              <th className="num sec">W</th>
              <th className="num sec">L</th>
              <th className="num sec">D</th>
              <th className="num wl">W–L</th>
              <th className="num">Pts</th>
              <th className="num">%</th>
              {showChance && (
                <th className="num finalspct">
                  {/* the column has to fit a phone; the full name stays for
                      wider screens and for anything reading the markup */}
                  <span className="lbl-long">Finals %</span>
                  <span className="lbl-short" aria-hidden="true">
                    Fin %
                  </span>
                </th>
              )}
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
                    {/* the place name, as ladders are printed — the nickname
                        costs the width the decisive columns need */}
                    <TeamChip teamId={s.id} part="name" short />
                  </td>
                  <td className="num sec">{s.played}</td>
                  <td className="num sec">{s.wins}</td>
                  <td className="num sec">{s.losses}</td>
                  <td className="num sec">{s.draws}</td>
                  <td className="num wl">
                    {s.wins}–{s.losses}
                    {s.draws > 0 ? `–${s.draws}` : ''}
                  </td>
                  <td className="num pts">{s.pts}</td>
                  <td className="num">{s.percentage.toFixed(1)}</td>
                  {showChance && (
                    <td className="num finalspct">
                      {finalsPct != null ? `${Math.round(finalsPct * 100)}%` : '…'}
                    </td>
                  )}
                  <td className="statuscell">
                    {label && <LockBadge label={label} />}
                    {lock && (
                      // the working behind the badge: where this club can still
                      // finish. A lock is "nobody can reach my floor" — showing
                      // the floor and ceiling makes that checkable rather than
                      // something the app just asserts.
                      <span className="ptsrange">
                        {lock.minPts === lock.maxPts
                          ? `${lock.minPts} pts`
                          : `${lock.minPts}–${lock.maxPts} pts`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {locks.length > 0 && (
        <p className="legendnote">
          The points range is what a club can still finish on — lose out, then win out. A badge
          appears once that range settles the question on its own.
        </p>
      )}
      <p className="legendnote">
        {wildcard && (
          <>
            <span className="cutkey bye" /> bye line (6th) ·{' '}
          </>
        )}
        <span className="cutkey fin" /> finals line ({ordinal(finalsCutIndex + 1)}) ·{' '}
        <span className="fav-star" aria-hidden="true">★</span> your club
      </p>
    </section>
  );
}
