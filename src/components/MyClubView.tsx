import { useMemo, useState } from 'react';
import type { BracketMatch, Game, Snapshot, TeamLocks } from '../domain/types';
import type { SimOutput } from '../domain/simulate';
import type { Tier } from '../domain/club';
import {
  clubBests,
  clubSeasons,
  currentStreak,
  nextGame,
  projectedPath,
  recentResults,
  recordByOpponent,
  winsToGuarantee
} from '../domain/club';
import { TEAMS, inkOn, teamAbbrev, teamShortName } from '../domain/teams';
import { setFavourite } from '../domain/favourite';
import { sortedStandings } from '../domain/ladder';
import { lockLabel } from '../domain/locks';
import { computeRatings, blendedHomeProb, squiggleProb } from '../domain/predict';
import { formatGameDateTime } from '../domain/format';
import TeamChip from './TeamChip';
import LockBadge from './LockBadge';
import ProbBar from './ProbBar';
import InfoButton from './InfoButton';
import ClubPicker from './ClubPicker';
import { RunHome, SimStrip, gamesLeft } from './ClubBlocks';

/** The tiers worth reporting a target for, strongest last. */
const TIERS: Array<{ tier: Tier; label: string }> = [
  { tier: 'top10', label: 'a finals berth' },
  { tier: 'top6', label: 'a top-six bye' },
  { tier: 'top4', label: 'a top-four spot' }
];

/** How many clubs either side of yours the ladder context shows. */
const NEIGHBOURS = 3;

/**
 * One club's whole season on a single screen: where they sit, what's next, what
 * the model makes of their chances, what it would take to lock a spot, the run
 * home, the likely route through the finals — and, underneath, what the results
 * archive knows about them.
 */
export default function MyClubView({
  teamId,
  snapshot,
  sim,
  locks,
  bracket,
  history = [],
  seasons,
  liveYear
}: {
  teamId: number | null;
  snapshot: Snapshot;
  sim: SimOutput | null;
  locks: TeamLocks[];
  bracket: BracketMatch[];
  history?: Game[];
  seasons: Map<number, Snapshot>;
  liveYear: number;
}) {
  const [picking, setPicking] = useState(false);

  if (teamId == null || !TEAMS[teamId]) {
    return (
      <section className="club">
        <div className="section-head">
          <h2>My club</h2>
        </div>
        <p className="sectionnote">
          You&apos;re not following a club. Pick one and it will be highlighted everywhere in the
          app — fixtures, ladder, bracket — and this page becomes its dashboard.
        </p>
        <button type="button" className="clubchange" onClick={() => setPicking(true)}>
          Choose a club
        </button>
        {picking && (
          <ClubPicker
            current={null}
            onPick={(id) => {
              setFavourite(id);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </section>
    );
  }

  return (
    <Dashboard
      key={teamId}
      teamId={teamId}
      snapshot={snapshot}
      sim={sim}
      locks={locks}
      bracket={bracket}
      history={history}
      seasons={seasons}
      liveYear={liveYear}
      onChangeClub={() => setPicking(true)}
      picking={picking}
      onClosePicker={() => setPicking(false)}
    />
  );
}

function Dashboard({
  teamId,
  snapshot,
  sim,
  locks,
  bracket,
  history,
  seasons,
  liveYear,
  onChangeClub,
  picking,
  onClosePicker
}: {
  teamId: number;
  snapshot: Snapshot;
  sim: SimOutput | null;
  locks: TeamLocks[];
  bracket: BracketMatch[];
  history: Game[];
  seasons: Map<number, Snapshot>;
  liveYear: number;
  onChangeClub: () => void;
  picking: boolean;
  onClosePicker: () => void;
}) {
  const club = TEAMS[teamId];
  const ladder = sortedStandings(snapshot.standings);
  const rank = ladder.findIndex((s) => s.id === teamId) + 1;
  const standing = ladder[rank - 1];
  const lock = locks.find((l) => l.teamId === teamId);
  const label = lock ? lockLabel(lock) : null;
  const probs = sim?.teams[teamId];
  const left = gamesLeft(snapshot, teamId);

  const form = useMemo(() => recentResults(snapshot.games, teamId), [snapshot, teamId]);
  const streak = useMemo(() => currentStreak(snapshot.games, teamId), [snapshot, teamId]);
  const next = useMemo(() => nextGame(snapshot.games, teamId), [snapshot, teamId]);
  const targets = useMemo(
    () =>
      TIERS.map(({ tier, label: what }) => ({
        what,
        wins: winsToGuarantee(snapshot, teamId, tier)
      })).filter((t) => t.wins != null),
    [snapshot, teamId]
  );
  const path = useMemo(() => projectedPath(bracket, teamId), [bracket, teamId]);

  // the record book: every completed game the app holds, this season included
  const allGames = useMemo(
    () => [...history, ...snapshot.games.filter((g) => g.complete)],
    [history, snapshot]
  );
  const record = useMemo(() => recordByOpponent(allGames, teamId), [allGames, teamId]);
  const bests = useMemo(() => clubBests(allGames, teamId), [allGames, teamId]);
  const pastSeasons = useMemo(
    () => clubSeasons(seasons, teamId).filter((s) => s.year < liveYear),
    [seasons, teamId, liveYear]
  );
  const archiveFrom = allGames.length > 0 ? Math.min(...allGames.map((g) => g.year)) : liveYear;

  if (!standing) return null;

  const neighbours = ladder.slice(
    Math.max(0, rank - 1 - NEIGHBOURS),
    Math.min(ladder.length, rank + NEIGHBOURS)
  );

  return (
    <section className="club">
      <div className="section-head">
        <h2>My club</h2>
        <InfoButton title="About this dashboard">
          <p>
            Your club&apos;s season in one place. Everything here is derived from the results and
            ladder the app already has — nothing is hand-entered, so the record book only ever
            claims what the archive can actually show.
          </p>
          <p>
            <strong>What it would take</strong> is a mathematical guarantee, not a projection: it
            checks every way your remaining games could fall and reports the fewest wins that lock
            the spot however every other game goes. Draws only help, so the guarantee survives them.
          </p>
          <p>
            The <strong>road to the flag</strong> comes from the Monte-Carlo simulation — the most
            likely match for your club in each finals week, with the chance you&apos;re in it at
            all.
          </p>
        </InfoButton>
      </div>

      <header className="clubhero" style={{ borderTopColor: club.color }}>
        <div className="clubhero-top">
          <span
            className="clubcrest"
            style={{
              background: club.color,
              color: inkOn(club.color),
              boxShadow: `inset 0 0 0 3px ${club.color2}`
            }}
            aria-hidden="true"
          >
            {club.abbrev}
          </span>
          <div className="clubhero-id">
            <h3>{club.name}</h3>
            <p className="clubhero-line">
              {ordinal(rank)} on the ladder · {standing.wins}–{standing.losses}
              {standing.draws > 0 ? `–${standing.draws}` : ''} · {standing.pts} pts ·{' '}
              {standing.percentage.toFixed(1)}%
            </p>
          </div>
          <button type="button" className="clubchange" onClick={onChangeClub}>
            Change
          </button>
        </div>
        <div className="clubhero-tags">
          {label && <LockBadge label={label} />}
          {streak !== 0 && (
            <span className={streak > 0 ? 'streaktag hot' : 'streaktag cold'}>
              {streak > 0 ? `${streak} straight wins` : `${-streak} straight losses`}
            </span>
          )}
          {left > 0 && <span className="muted">{left} games left</span>}
        </div>
      </header>

      <h3 className="club-heading">Next up</h3>
      {next ? (
        <NextGame game={next} snapshot={snapshot} teamId={teamId} history={history} />
      ) : (
        <p className="sectionnote">No games scheduled — the season is complete.</p>
      )}

      {probs && (
        <>
          <h3 className="club-heading">Season chances</h3>
          <SimStrip probs={probs} />
        </>
      )}

      {form.length > 0 && (
        <>
          <h3 className="club-heading">Form</h3>
          <ol className="formline">
            {form.map((r) => (
              <li
                key={r.game.id}
                className={`formchip ${r.won == null ? 'd' : r.won ? 'w' : 'l'}`}
                title={`R${r.game.round} ${r.home ? 'vs' : '@'} ${teamShortName(r.opponentId)} — ${
                  r.margin > 0 ? '+' : ''
                }${r.margin}`}
              >
                <span className="formchip-res">{r.won == null ? 'D' : r.won ? 'W' : 'L'}</span>
                <span className="formchip-opp">
                  {r.home ? '' : '@'}
                  {teamAbbrev(r.opponentId)}
                </span>
                <span className="formchip-margin">
                  {r.margin > 0 ? '+' : ''}
                  {r.margin}
                </span>
              </li>
            ))}
          </ol>
          <p className="legendnote">Most recent first · margin in points</p>
        </>
      )}

      {targets.length > 0 && (
        <>
          <h3 className="club-heading">What it would take</h3>
          <ul className="targets">
            {targets.map((t) => (
              <li key={t.what} className={t.wins === 0 ? 'target done' : 'target'}>
                <span className="target-mark" aria-hidden="true">
                  {t.wins === 0 ? '✓' : t.wins}
                </span>
                {t.wins === 0
                  ? `${capitalise(t.what)} is already guaranteed.`
                  : `Win ${t.wins} of the last ${left} and ${t.what} is guaranteed.`}
              </li>
            ))}
          </ul>
          <p className="legendnote">
            Guaranteed however every other game falls — not a projection.
          </p>
        </>
      )}

      <h3 className="club-heading">Run home</h3>
      <RunHome snapshot={snapshot} teamId={teamId} history={history} />

      {path.length > 0 && (
        <>
          <h3 className="club-heading">Road to the flag</h3>
          <ol className="path">
            {path.map(({ match, prob }) => (
              <li key={match.key} className="pathstep">
                <span className="path-round">{match.name}</span>
                <span className="path-opp">{opponentLabel(match, teamId)}</span>
                <span className="path-prob">{formatProb(prob)}</span>
              </li>
            ))}
          </ol>
          <p className="legendnote">
            Most likely match each week, with the chance your club is in it.
          </p>
        </>
      )}

      <h3 className="club-heading">Around you on the ladder</h3>
      <ol className="neighbours">
        {neighbours.map((s) => {
          const at = ladder.indexOf(s) + 1;
          return (
            <li key={s.id} className={s.id === teamId ? 'neighbour you' : 'neighbour'}>
              <span className="neighbour-rank">{at}</span>
              <TeamChip teamId={s.id} short />
              <span className="neighbour-pts">{s.pts} pts</span>
              <span className="neighbour-pct">{s.percentage.toFixed(1)}%</span>
            </li>
          );
        })}
      </ol>

      <h3 className="club-heading">The book, since {archiveFrom}</h3>
      {pastSeasons.length > 0 && (
        <ol className="seasonline">
          {pastSeasons.map((s) => (
            <li key={s.year} className={s.premier ? 'seasonrow premier' : 'seasonrow'}>
              <span className="seasonrow-year">{s.year}</span>
              <span className="seasonrow-rank">{ordinal(s.rank)}</span>
              <span className="seasonrow-rec">
                {s.wins}–{s.losses}
                {s.draws > 0 ? `–${s.draws}` : ''}
              </span>
              {s.premier && <span className="seasonrow-flag">🏆 Premiers</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="bests">
        {bests.biggestWin && (
          <p>
            <strong>Biggest win:</strong> {bests.biggestWin.margin} pts{' '}
            {bests.biggestWin.home ? 'vs' : 'away to'}{' '}
            {teamShortName(bests.biggestWin.opponentId)} ({bests.biggestWin.game.year})
          </p>
        )}
        {bests.longestWinStreak && (
          <p>
            <strong>Longest winning run:</strong> {bests.longestWinStreak.length} games (
            {bests.longestWinStreak.from.year}
            {bests.longestWinStreak.to.year !== bests.longestWinStreak.from.year
              ? `–${bests.longestWinStreak.to.year}`
              : ''}
            )
          </p>
        )}
      </div>

      {record.length > 0 && (
        <>
          <h4 className="club-subheading">Record against</h4>
          <ol className="opprecord">
            {record.map((r) => (
              <li key={r.opponentId} className="opprow">
                <TeamChip teamId={r.opponentId} short />
                <span className="opprow-rec">
                  {r.wins}–{r.losses}
                  {r.draws > 0 ? `–${r.draws}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="legendnote">
        From the results archive the app holds ({archiveFrom} onwards) — not all-time club history.
      </p>

      {picking && (
        <ClubPicker
          current={teamId}
          onPick={(id) => {
            setFavourite(id);
            onClosePicker();
          }}
          onClose={onClosePicker}
        />
      )}
    </section>
  );
}

/** The club's next fixture, with the model's split and the consensus. */
function NextGame({
  game,
  snapshot,
  teamId,
  history
}: {
  game: Game;
  snapshot: Snapshot;
  teamId: number;
  history: Game[];
}) {
  const ratings = useMemo(() => {
    const prior = history.filter((g) => g.year < snapshot.meta.year);
    return computeRatings(snapshot.standings, snapshot.games, { history: prior });
  }, [snapshot, history]);

  const isHome = game.hteamid === teamId;
  const opponentId = isHome ? game.ateamid : game.hteamid;
  const pHome = blendedHomeProb(snapshot, ratings, snapshot.games, game);
  const mine = Math.round((isHome ? pHome : 1 - pHome) * 100);
  const sq = squiggleProb(snapshot, game.hteamid, game.ateamid);
  const sqMine = sq != null ? Math.round((isHome ? sq : 1 - sq) * 100) : null;

  return (
    <article className="nextgame">
      <div className="nextgame-when">{formatGameDateTime(game.date, game.unixtime)}</div>
      <div className="nextgame-who">
        <span className={isHome ? 'ha home' : 'ha away'}>{isHome ? 'vs' : '@'}</span>
        <TeamChip teamId={opponentId} />
      </div>
      <div className="nextgame-prob">
        <strong>{mine}%</strong> <span className="muted">to win</span>
      </div>
      <ProbBar
        homeId={game.hteamid}
        awayId={game.ateamid}
        homeProb={pHome}
        bare
      />
      <div className="nextgame-foot">
        {game.venue}
        {sqMine != null && ` · Squiggle ${sqMine}%`}
      </div>
    </article>
  );
}

/** Who the club would meet in a bracket match — known side, or likeliest. */
function opponentLabel(match: BracketMatch, teamId: number): string {
  const other = match.home.teamId === teamId ? match.away : match.home;
  if (other.teamId != null) return `v ${teamShortName(other.teamId)}`;
  const likely = other.candidates.filter((c) => c.teamId !== teamId)[0];
  if (likely) return `v ${teamShortName(likely.teamId)} most likely`;
  return other.placeholder ? `v ${other.placeholder}` : 'opponent to be decided';
}

function formatProb(p: number): string {
  const pct = p * 100;
  return pct >= 99.5 ? 'in' : `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
