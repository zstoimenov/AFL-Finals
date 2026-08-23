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

/** How many recent results the form view carries. */
const FORM_GAMES = 5;

/**
 * The three ways to read the same table.
 *
 * Everything a ladder can say does not fit on a phone at once, and the usual
 * answers — a sideways scroll, or dropping the columns that don't fit — either
 * hide data behind a gesture nobody discovers or lose it outright. Splitting the
 * table into views keeps every number reachable at any width, and each view is
 * narrow enough to fit without scrolling: *Summary* is the ladder as it is
 * quoted (played, points, percentage, and what is mathematically settled),
 * *Extended* is the full accounting including points for and against, and *Form*
 * is the one thing a table can never show — which way each club is trending.
 */
const VIEWS = [
  { key: 'summary', label: 'Summary' },
  { key: 'extended', label: 'Extended' },
  { key: 'form', label: 'Form' }
] as const;

type LadderMode = (typeof VIEWS)[number]['key'];

/** Remembering the choice costs one key and saves re-picking it every visit. */
const VIEW_KEY = 'afl-ladder-view';

function storedMode(): LadderMode {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (VIEWS.some((v) => v.key === saved)) return saved as LadderMode;
  } catch {
    /* private mode / embedded webview — the default view is a fine fallback */
  }
  return 'summary';
}

function rememberMode(mode: LadderMode): void {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* storage unavailable — the choice lasts the session only */
  }
}

/**
 * The ladder with format-aware finals cut lines and, for the live season,
 * mathematical lock badges. For an archived season it shows the final table:
 * the cut lines match that era's format and the badges are dropped (the season
 * is decided).
 *
 * The table has three column sets behind a switch in its heading (see `VIEWS`),
 * so a phone gets all of the data without a sideways scroll and without the app
 * deciding on the reader's behalf which half of a ladder matters. The switch is
 * deliberately small and sits on the title's own line: it is a control for the
 * table, not a second navigation bar, and the screen has no vertical space to
 * spend on saying so twice.
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
  const [mode, setMode] = useState<LadderMode>(storedMode);
  // a soft edge on the pinned crest column, shown only once scrolled sideways
  const [scrolled, setScrolled] = useState(false);

  const showMode = (next: LadderMode) => {
    setMode(next);
    rememberMode(next);
  };

  // the ladder is a home-and-away table, so the form beside it has to be too —
  // a September run doesn't belong in the column that explains a ladder
  // position it had no part in setting
  const formByTeam = useMemo(() => {
    if (mode !== 'form') return new Map<number, ClubResult[]>();
    const homeAway = snapshot.games.filter((g) => g.is_final === 0);
    return new Map(
      snapshot.standings.map((s) => [s.id, recentResults(homeAway, s.id, FORM_GAMES)])
    );
  }, [snapshot, mode]);

  const extended = mode === 'extended';
  const form = mode === 'form';
  // the status column is the app's own contribution rather than a ladder
  // column, so it rides with the view the ladder is normally read in
  const status = mode === 'summary';

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
            The switch beside the title changes what the table shows.{' '}
            <strong>Summary</strong> is the ladder as it is quoted;{' '}
            <strong>Extended</strong> adds the full record and points for and against;{' '}
            <strong>Form</strong> is the last {FORM_GAMES} home-and-away results, most recent
            first, with the winning or losing margin.
          </p>
          <p>
            <strong>P</strong> is games played, <strong>W</strong>/<strong>L</strong>/
            <strong>D</strong> the record, <strong>PF</strong> and <strong>PA</strong> points
            scored and conceded, <strong>Pts</strong> premiership points — four a win, two a draw
            — and <strong>%</strong> is PF against PA, which is what separates clubs level on
            points.
          </p>
          <p>
            {historical
              ? 'The final table for this season. Tap any team for its season and record.'
              : 'Badges mark mathematically settled fates — a guarantee, never a likelihood. Tap any team for its run home, its simulated chances and its record.'}
          </p>
        </InfoButton>
        <div className="segmented" role="group" aria-label="Ladder columns">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={v.key === mode ? 'segment on' : 'segment'}
              aria-pressed={v.key === mode}
              onClick={() => showMode(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className={scrolled ? 'tablewrap scrolled' : 'tablewrap'}
        onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 0)}
      >
        <table className={`ladder view-${mode}`}>
          <thead>
            <tr>
              <th className="idcell">
                <span className="rank">#</span>
              </th>
              <th className="namecell">Team</th>
              {!form && <th className="num played">P</th>}
              {extended && (
                <>
                  <th className="num rec">W</th>
                  <th className="num rec">L</th>
                  <th className="num rec">D</th>
                  <th className="num pf">PF</th>
                  <th className="num pf">PA</th>
                </>
              )}
              {form && <th className="formcell">Form</th>}
              <th className="num pts">Pts</th>
              <th className="num pct">%</th>
              {status && <th className="statuscell">Status</th>}
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
                    {/* A phone cannot hold the status column as well, and the
                        pill is the one thing here people scan for — so rather
                        than push it off the edge behind a sideways scroll, it
                        moves under the club name. Same badge, same row, one
                        width down; CSS picks which of the two is drawn. */}
                    {status && badge && <span className="status-inline">{badge}</span>}
                  </td>
                  {!form && <td className="num played">{s.played}</td>}
                  {extended && (
                    <>
                      <td className="num rec">{s.wins}</td>
                      <td className="num rec">{s.losses}</td>
                      <td className="num rec">{s.draws}</td>
                      <td className="num pf">{s.for}</td>
                      <td className="num pf">{s.against}</td>
                    </>
                  )}
                  {form && (
                    <td className="formcell">
                      <FormRun results={formByTeam.get(s.id) ?? []} teamId={s.id} />
                    </td>
                  )}
                  <td className="num pts">{s.pts}</td>
                  <td className="num pct">{s.percentage.toFixed(1)}</td>
                  {status && (
                    <td className="statuscell">
                      {badge}
                      {lock && (
                        // the working behind the badge: where this club can
                        // still finish. A lock is "nobody can reach my floor" —
                        // showing the floor and ceiling makes that checkable
                        // rather than something the app just asserts.
                        <span className="ptsrange">
                          {lock.minPts === lock.maxPts
                            ? `${lock.minPts} pts`
                            : `${lock.minPts}–${lock.maxPts} pts`}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {status && locks.length > 0 && (
        <p className="legendnote">
          The points range is what a club can still finish on — lose out, then win out. A badge
          appears once that range settles the question on its own.
        </p>
      )}
      <p className="legendnote">
        {form && (
          <>
            Most recent first, with the margin{' '}
            <span className="formrun-key" aria-hidden="true">
              <span className="formpip w">W</span>
              <span className="formpip l">L</span>
              <span className="formpip d">D</span>
            </span>{' '}
            ·{' '}
          </>
        )}
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
