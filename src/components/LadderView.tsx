import { useMemo, useState } from 'react';
import type { Snapshot, TeamLocks } from '../domain/types';
import type { ClubResult } from '../domain/club';
import { recentResults } from '../domain/club';
import { sortedStandings } from '../domain/ladder';
import { lockLabel } from '../domain/locks';
import { ladderCutLines, finalsFormatFor } from '../domain/season';
import { isFavourite } from '../domain/favourite';
import { teamShortName } from '../domain/teams';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';
import InfoButton from './InfoButton';

/** 1st, 2nd, 3rd, 4th — a cut line can land anywhere a future format puts it. */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** How many recent results the form column carries. */
const FORM_GAMES = 5;

/**
 * The ladder with format-aware finals cut lines and, for the live season,
 * mathematical lock badges. For an archived season it shows the final table:
 * the cut lines match that era's format and the badges are dropped (the season
 * is decided).
 *
 * The columns are the ones a ladder is read for. Played, the record and points
 * answer "where is my club up to"; percentage breaks the ties the points can't;
 * the form guide says which way a club is trending, which is the question the
 * table itself can never answer; and the status column is the app's own
 * contribution — what is mathematically settled. A simulated finals percentage
 * used to sit between them, and it was the one number here that was a guess
 * rather than a fact: it now lives where guesses belong, on the team sheet and
 * the Odds screen, and the table stays a table of what has happened.
 */
export default function LadderView({
  snapshot,
  locks,
  historical = false
}: {
  snapshot: Snapshot;
  locks: TeamLocks[];
  historical?: boolean;
}) {
  const ladder = sortedStandings(snapshot.standings);
  const lockByTeam = new Map(locks.map((l) => [l.teamId, l]));
  const { byeCutIndex, finalsCutIndex } = ladderCutLines(snapshot.meta);
  const wildcard = finalsFormatFor(snapshot.meta) === 'top10-wildcard';
  // a soft edge on the pinned crest column, shown only once scrolled sideways
  const [scrolled, setScrolled] = useState(false);

  // the ladder is a home-and-away table, so the form line beside it has to be
  // too — a September run doesn't belong in the column that explains a ladder
  // position it had no part in setting
  const formByTeam = useMemo(() => {
    const homeAway = snapshot.games.filter((g) => g.is_final === 0);
    return new Map(
      snapshot.standings.map((s) => [s.id, recentResults(homeAway, s.id, FORM_GAMES)])
    );
  }, [snapshot]);

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
            <strong>P</strong> is games played, <strong>W–L</strong> the record (a third number
            is draws), <strong>Pts</strong> premiership points — four a win, two a draw — and{' '}
            <strong>%</strong> is points scored against points conceded, which is what separates
            clubs level on points.
          </p>
          <p>
            <strong>Form</strong> is the last {FORM_GAMES} home-and-away results, most recent
            first, with the winning or losing margin.
          </p>
          <p>
            {historical
              ? 'The final table for this season. Tap any team for its season and record.'
              : 'Badges mark mathematically settled fates — a guarantee, never a likelihood. Tap any team for its run home, its simulated chances and its record.'}
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
              <th className="num played">P</th>
              {/* the record is one column at every width now: four columns of
                  P/W/L/D never fitted a phone, and W–L is how a result is said
                  out loud anyway */}
              <th className="num wl">W–L</th>
              <th className="num pts">Pts</th>
              <th className="num">%</th>
              {/* the form guide is the widest thing here and the first to go
                  when the screen can't hold it — it is on the team sheet too */}
              <th className="formcell">Form</th>
              <th className="statuscell">Status</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((s, i) => {
              const lock = lockByTeam.get(s.id);
              const label = lock ? lockLabel(lock) : null;
              const badge = label ? <LockBadge label={label} /> : null;
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
                    {/* A phone cannot hold eight columns, and the status pill is
                        the one people scan for — so rather than push it off the
                        edge behind a sideways scroll, it moves under the club
                        name and its column goes. Same badge, same row, one width
                        down; CSS picks which of the two is drawn. */}
                    {badge && <span className="status-inline">{badge}</span>}
                  </td>
                  <td className="num played">{s.played}</td>
                  <td className="num wl">
                    {s.wins}–{s.losses}
                    {s.draws > 0 ? `–${s.draws}` : ''}
                  </td>
                  <td className="num pts">{s.pts}</td>
                  <td className="num">{s.percentage.toFixed(1)}</td>
                  <td className="formcell">
                    <FormRun results={formByTeam.get(s.id) ?? []} teamId={s.id} />
                  </td>
                  <td className="statuscell">
                    {badge}
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
        {/* the form column is dropped on a phone, and so is the key to it */}
        <span className="formrun-note">
          Form runs most recent first, with the margin{' '}
          <span className="formrun-key" aria-hidden="true">
            <span className="formpip w">W</span>
            <span className="formpip l">L</span>
            <span className="formpip d">D</span>
          </span>{' '}
          ·{' '}
        </span>
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

/**
 * A club's last few results as pips.
 *
 * Colour alone never carries a result: each pip has its letter in it, and the
 * screen-reader text spells out the opponent and the margin — a colour-blind or
 * non-visual reader gets the same run the sighted one does. The margin under
 * each pip is what turns a run of five Ws into information: five by ten points
 * is a different club from five by sixty.
 */
function FormRun({ results, teamId }: { results: ClubResult[]; teamId: number }) {
  if (results.length === 0) return <span className="formrun-empty">—</span>;
  return (
    <ol className="formrun" aria-label={`${teamShortName(teamId)} recent form, most recent first`}>
      {results.map((r) => (
        <li key={r.game.id} className={`formpip ${r.won == null ? 'd' : r.won ? 'w' : 'l'}`}>
          <span aria-hidden="true">{r.won == null ? 'D' : r.won ? 'W' : 'L'}</span>
          <span className="formpip-margin" aria-hidden="true">
            {r.margin > 0 ? '+' : ''}
            {r.margin}
          </span>
          <span className="visually-hidden">
            {`Round ${r.game.round} ${r.home ? 'versus' : 'away to'} ${teamShortName(
              r.opponentId
            )}: ${r.won == null ? 'drew' : r.won ? 'won' : 'lost'}${
              r.won == null ? '' : ` by ${Math.abs(r.margin)}`
            }.`}
          </span>
        </li>
      ))}
    </ol>
  );
}
