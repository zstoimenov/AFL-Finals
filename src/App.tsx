import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadSnapshot,
  loadHistoryIndex,
  loadHistoryCorpus,
  loadSeason,
  loadTipsters
} from './api/loadData';
import type { Game, HistoryIndexEntry, Snapshot, TipsterCorpus } from './domain/types';
import type { SimOutput } from './domain/simulate';
import { computeLocks } from './domain/locks';
import { buildBracket } from './domain/buildBracket';
import { finalsGames } from './domain/ladder';
import { completedGames } from './domain/features';
import { supportsProjectedBracket } from './domain/season';
import { formatUpdatedAt, formatUpdatedShort } from './domain/format';
import FinalsView from './components/FinalsView';
import FixturesView from './components/FixturesView';
import LadderView from './components/LadderView';
import PremiershipView from './components/PremiershipView';
import FinalsResults from './components/FinalsResults';
import SeasonSummary from './components/SeasonSummary';
import SeasonsHub from './components/SeasonsHub';
import SeasonSwitcher from './components/SeasonSwitcher';
import TeamDetail from './components/TeamDetail';
import ThisWeekView from './components/ThisWeekView';
import MyClubView from './components/MyClubView';
import PrimaryNav, { type NavItem } from './components/PrimaryNav';
import InfoButton from './components/InfoButton';
import { hasChosenFavourite, setFavourite, useFavourite } from './domain/favourite';
import { DEFAULT_TAB, hashFor, isLiveOnly, navTabs, routeFromHash, type Tab } from './nav';
import { TeamSelectContext } from './teamSelect';
import { useOnline } from './useOnline';
import { usePullToRefresh } from './usePullToRefresh';
import { GameSelectContext } from './gameSelect';
import { findGame } from './domain/gameDetail';
import GameDetail from './components/GameDetail';
import ClubPicker from './components/ClubPicker';

const SIM_ITERATIONS = 10000;

export default function App() {
  const [live, setLive] = useState<Snapshot | null>(null);
  const [historyIndex, setHistoryIndex] = useState<HistoryIndexEntry[]>([]);
  const [historyCorpus, setHistoryCorpus] = useState<Game[]>([]);
  const [tipsters, setTipsters] = useState<TipsterCorpus | null>(null);
  const [seasons, setSeasons] = useState<Map<number, Snapshot>>(new Map());
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [sim, setSim] = useState<SimOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(
    () => routeFromHash(window.location.hash)?.tab ?? DEFAULT_TAB
  );
  const [openGameId, setOpenGameId] = useState<number | null>(
    () => routeFromHash(window.location.hash)?.gameId ?? null
  );
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const favouriteId = useFavourite();
  const online = useOnline();
  // asked once, on the first launch only: nobody starts out following a club,
  // and choosing for them means a stranger's first screen highlights a club
  // they may have no time for
  const [askClub, setAskClub] = useState(() => !hasChosenFavourite());
  const [tabsStuck, setTabsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem('afl-dismissed') ?? '[]'));
    } catch {
      return new Set<string>();
    }
  });
  const dismiss = (key: string) =>
    setDismissed((prev) => {
      const next = new Set(prev).add(key);
      try {
        localStorage.setItem('afl-dismissed', JSON.stringify([...next]));
      } catch {
        /* storage unavailable — dismissal lasts the session only */
      }
      return next;
    });

  // initial load: the live season, plus the multi-season archive (fail-soft)
  useEffect(() => {
    loadSnapshot()
      .then((snap) => {
        setLive(snap);
        setActiveYear(snap.meta.year);
        setSeasons((prev) => new Map(prev).set(snap.meta.year, snap));
      })
      .catch((e) => setError(String(e)));
    loadHistoryIndex().then(setHistoryIndex).catch(() => setHistoryIndex([]));
    loadHistoryCorpus().then(setHistoryCorpus).catch(() => setHistoryCorpus([]));
  }, []);

  // Two screens read the archived seasons in full: the hub scores every one of
  // them, and My Club's record book reads each season's final table. Neither is
  // the screen the app opens on, and pulling ~400KB of snapshots at startup made
  // every visitor pay for a page they might never see. They load on arrival
  // instead, one at a time, so each season's scorecard is computed on its own
  // tick rather than as one long block.
  useEffect(() => {
    if (tab !== 'seasons' && tab !== 'club') return;
    let cancelled = false;
    // the per-tipster corpus is ~150KB and only the hub's leaderboard reads it,
    // so it arrives with the archive rather than at startup
    if (tab === 'seasons' && tipsters == null) {
      loadTipsters().then((t) => {
        if (!cancelled && t) setTipsters(t);
      });
    }
    for (const { year } of historyIndex) {
      if (seasons.has(year)) continue;
      loadSeason(year).then((snap) => {
        if (!cancelled && snap) setSeasons((prev) => new Map(prev).set(year, snap));
      });
    }
    return () => {
      cancelled = true;
    };
    // seasons is deliberately not a dependency: it is what this effect fills in
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // tipsters is deliberately not a dependency either, for the same reason
  }, [historyIndex, tab]);

  // Screens are hash routes, so back/forward step between them instead of
  // leaving the app, and any screen can be linked or opened directly.
  useEffect(() => {
    const fromUrl = () => {
      const route = routeFromHash(window.location.hash);
      setTab(route?.tab ?? DEFAULT_TAB);
      setOpenGameId(route?.gameId ?? null);
    };
    // pushState alone doesn't notify, but history navigation fires both of these
    window.addEventListener('hashchange', fromUrl);
    window.addEventListener('popstate', fromUrl);
    if (!routeFromHash(window.location.hash)) {
      // land on a real route without leaving an empty entry behind us
      window.history.replaceState(null, '', hashFor(DEFAULT_TAB));
    }
    return () => {
      window.removeEventListener('hashchange', fromUrl);
      window.removeEventListener('popstate', fromUrl);
    };
  }, []);

  // The open game lives in the route, so back closes the sheet rather than
  // leaving the app — what a phone user expects from anything sliding up over
  // the page. Changing screen always drops the sheet with it.
  useEffect(() => {
    const want = hashFor(tab, openGameId);
    if (window.location.hash !== want) window.history.pushState(null, '', want);
  }, [tab, openGameId]);

  const selectGame = (id: number | null) => setOpenGameId(id);
  const selectTab = (next: Tab) => {
    setOpenGameId(null);
    setTab(next);
  };

  // shadow under the nav pills only once they've stuck to the top
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setTabsStuck(!e.isIntersecting), {
      threshold: 0
    });
    io.observe(el);
    return () => io.disconnect();
  }, [live]);

  // the Monte-Carlo runs on the live season only, informed by the history prior
  useEffect(() => {
    if (!live) return;
    const worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SimOutput>) => setSim(e.data);
    worker.postMessage({ snapshot: live, iterations: SIM_ITERATIONS, history: historyCorpus });
    return () => worker.terminate();
  }, [live, historyCorpus]);

  const ensureSeason = (year: number) => {
    if (seasons.has(year)) return;
    setSeasonLoading(true);
    loadSeason(year)
      .then((snap) => {
        if (snap) setSeasons((prev) => new Map(prev).set(year, snap));
      })
      .finally(() => setSeasonLoading(false));
  };

  const openSeason = (year: number) => {
    ensureSeason(year);
    setActiveYear(year);
    selectTab('ladder');
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg(null);
    const prev = live?.meta.fetchedAt;
    try {
      const fresh = await loadSnapshot(true);
      setLive(fresh);
      setSeasons((p) => new Map(p).set(fresh.meta.year, fresh));
      setRefreshMsg(
        fresh.meta.fetchedAt !== prev ? 'Updated to the latest data' : 'Already up to date'
      );
    } catch {
      setRefreshMsg(
        online ? 'Could not refresh — check your connection' : 'You are offline — showing saved data'
      );
    } finally {
      setRefreshing(false);
      window.setTimeout(() => setRefreshMsg(null), 4000);
    }
  };

  // the same refresh the header pill runs, under the thumb where a phone user
  // expects to find it
  const { pull, armed } = usePullToRefresh(refresh, !refreshing);

  const liveYear = live?.meta.year ?? null;
  const isLive = activeYear != null && activeYear === liveYear;
  const active = activeYear != null ? seasons.get(activeYear) ?? null : null;

  // live-season derived state (locks/bracket/sim only apply to the live season)
  const locks = useMemo(
    () => (live ? computeLocks(live.standings, live.games) : []),
    [live]
  );
  const bracket = useMemo(
    () => (live ? buildBracket(live, sim, locks, historyCorpus) : []),
    [live, sim, locks, historyCorpus]
  );

  // every completed game across seasons — for the hub's head-to-head explorer
  const allGames = useMemo(
    () => (live ? [...historyCorpus, ...completedGames(live.games)] : historyCorpus),
    [historyCorpus, live]
  );

  if (error) {
    return (
      <div className="shell">
        <p className="error">Could not load data: {error}</p>
      </div>
    );
  }
  if (!live || activeYear == null) {
    return (
      <div className="shell loading" aria-busy="true">
        <div className="spinner" />
        <p>Loading season data…</p>
      </div>
    );
  }

  // the sheet reads from the season currently on screen, so a link into an
  // archived season's game still resolves
  const openGame = findGame(active?.games ?? live.games, openGameId);

  const liveFinalsStarted = finalsGames(live.games).length > 0;
  const viewingArchive = !isLive;
  const sampleData = live.meta.source === 'seed';
  const updatedLong = formatUpdatedAt(live.meta.fetchedAt);

  // "This week" and "My club" are live-season screens; an archived year falls
  // back to its results rather than rendering a week that has already happened.
  const shownTab: Tab = !isLive && isLiveOnly(tab) ? 'fixtures' : tab;
  // nav.ts decides which screens appear and in what order — once the finals
  // are on, the bracket takes the ladder's slot on the phone's bottom bar. Here
  // we only put a name to each of them; two read differently once a season is
  // in the archive, where there is nothing left to fixture or price.
  const navLabels: Record<Tab, string> = {
    week: 'This week',
    club: 'My club',
    fixtures: isLive ? 'Fixtures' : 'Results',
    ladder: 'Ladder',
    finals: 'Finals',
    odds: isLive ? 'Odds' : 'Summary',
    seasons: 'All seasons'
  };
  const navItems: NavItem[] = navTabs({
    live: isLive,
    finalsStarted: liveFinalsStarted
  }).map((key) => ({ key, label: navLabels[key] }));

  return (
    <TeamSelectContext.Provider value={setSelectedTeam}>
    <GameSelectContext.Provider value={selectGame}>
    <div className="shell">
      <header className="topbar">
        <h1>
          <svg className="logo" viewBox="0 0 48 48" width="26" height="26" aria-hidden="true">
            {/* AFL goal, front on: behind, goal, goal, behind (short, tall, tall, short) */}
            <g stroke="#4da3ff" strokeWidth="3" strokeLinecap="round">
              <line x1="13" y1="25" x2="13" y2="38" />
              <line x1="20.5" y1="11" x2="20.5" y2="38" />
              <line x1="27.5" y1="11" x2="27.5" y2="38" />
              <line x1="35" y1="25" x2="35" y2="38" />
            </g>
            <ellipse cx="24" cy="16.5" rx="3.7" ry="2.4" fill="#f5c542" transform="rotate(-20 24 16.5)" />
          </svg>{' '}
          AFL Finals Tracker
        </h1>
        <div className="topbar-right">
          <SeasonSwitcher
            liveYear={liveYear!}
            activeYear={activeYear}
            history={historyIndex}
            loading={seasonLoading}
            // the old header carried a separate "Finals series ·" flag; the
            // switcher already names the live year, so it says it there instead
            liveLabel={liveFinalsStarted ? 'Finals' : 'Live'}
            hubOpen={tab === 'seasons'}
            onChange={(y) => {
              ensureSeason(y);
              setActiveYear(y);
              // an archived year has no week ahead and no live club dashboard
              if (y !== liveYear && isLiveOnly(tab)) selectTab('fixtures');
              if (tab === 'seasons') selectTab('ladder');
            }}
            onOpenHub={() => selectTab('seasons')}
          />
          {/* The stamp and the refresh action are the same control: the header
              spends one short pill on "when this data is from", and tapping it
              re-checks. The long form lives in the tooltip / a11y label. */}
          {isLive && (
            <button
              type="button"
              className={
                [
                  'updatedbtn',
                  sampleData ? 'sample' : '',
                  online ? '' : 'offline'
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing}
              title={`${sampleData ? 'Sample data · ' : ''}${
                online ? 'Updated' : 'Offline — saved data from'
              } ${updatedLong}${online ? ' — check for the latest' : ''}`}
              aria-label={
                online
                  ? `Data updated ${updatedLong}. Check for the latest published data.`
                  : `Offline. Showing saved data from ${updatedLong}.`
              }
            >
              {/* the stamp stays put while checking — only the icon spins, so the
                  header doesn't reflow mid-refresh */}
              <span className={refreshing ? 'refreshicon spinning' : 'refreshicon'} aria-hidden="true">
                {online ? '⟳' : '⚠'}
              </span>
              <span>{formatUpdatedShort(live.meta.fetchedAt)}</span>
            </button>
          )}
          <InfoButton title="About this app">
            <p>
              A tracker for the AFL finals (the 2026 top-ten Wildcard format). It projects the
              live bracket from the ladder, estimates each match and the premiership
              {historyIndex.length > 0
                ? `, and across ${historyIndex.length} archived season${
                    historyIndex.length === 1 ? '' : 's'
                  } grades how the model actually tips`
                : ''}
              .
            </p>
            <p>
              Projections come from an in-app model (ladder, percentage, form, home advantage,
              and a cross-season carry-over prior) plus a {SIM_ITERATIONS.toLocaleString()}-run
              Monte Carlo of the finals series. Ladder, fixtures, results and consensus tips are
              from <a href="https://squiggle.com.au">Squiggle</a>. All times are AWST, on a 24-hour
              clock.
            </p>
            <p>
              <strong>This week</strong> ranks the games still to be played in the current round by
              how much there is to watch — how close the model has them, what each result would
              settle mathematically, and what history the clubs bring — and shows its reasoning on
              every card.
            </p>
            <p>
              <strong>My club</strong> is your club&apos;s whole season on one screen — position,
              next game, chances, the run home, what it would take to lock a spot, and what the
              results archive knows about them. Change which club that is from the button on that
              page.
            </p>
            <p>
              The season switcher above browses past seasons; <strong>All seasons…</strong> opens
              the hub, with the model&apos;s per-season accuracy and a cross-season head-to-head.
              New results are fetched from Squiggle automatically every day and published here; the{' '}
              <strong>⟳ time</strong> beside the switcher is when the data you&apos;re looking at was
              published — tap it to re-check.
            </p>
            <p className="disclaimer">
              Unofficial fan project — not affiliated with, authorised or endorsed by the
              Australian Football League (AFL) or any of its clubs. AFL, club names and marks
              belong to their respective owners and are used here only to refer to the teams and
              competition.
            </p>
          </InfoButton>
        </div>
      </header>
      {(pull > 0 || refreshing) && (
        <div
          className={armed || refreshing ? 'pull-hint armed' : 'pull-hint'}
          style={{ height: refreshing ? 44 : pull }}
          aria-hidden="true"
        >
          <span className={refreshing ? 'refreshicon spinning' : 'refreshicon'}>⟳</span>
          {!refreshing && <span>{armed ? 'Release to refresh' : 'Pull to refresh'}</span>}
        </div>
      )}
      {refreshMsg && (
        <div className="refresh-toast" role="status">
          {refreshMsg}
        </div>
      )}

      {viewingArchive && (
        <div className="banner archive-banner" role="note">
          <span>
            Viewing the <strong>{activeYear}</strong> season
            {active?.meta.source === 'seed' ? ' (sample data)' : ''}.
          </span>
          <button type="button" className="banner-back" onClick={() => setActiveYear(liveYear)}>
            Back to {liveYear}
          </button>
        </div>
      )}

      {isLive && sampleData && !dismissed.has('seed') && (
        <div className="banner" role="note">
          <span>
            Showing generated sample data — live Squiggle data replaces this after the first
            scheduled update run.
          </span>
          <button
            type="button"
            className="banner-close"
            aria-label="Dismiss"
            onClick={() => dismiss('seed')}
          >
            ✕
          </button>
        </div>
      )}
      {isLive && !liveFinalsStarted && !dismissed.has('prefinals') && (
        <div className="banner subtle" role="note">
          <span>
            Finals haven&apos;t started yet — the bracket is projected from the current ladder and
            updates automatically as results come in.
          </span>
          <button
            type="button"
            className="banner-close"
            aria-label="Dismiss"
            onClick={() => dismiss('prefinals')}
          >
            ✕
          </button>
        </div>
      )}

      <div ref={sentinelRef} className="tabs-sentinel" aria-hidden="true" />
      <PrimaryNav
        items={navItems}
        active={shownTab}
        onSelect={selectTab}
        stuck={tabsStuck}
        extra={[{ label: 'All seasons', onSelect: () => selectTab('seasons') }]}
      />

      <main>
        {shownTab === 'seasons' ? (
          <SeasonsHub
            index={historyIndex}
            seasons={seasons}
            liveYear={liveYear!}
            allGames={allGames}
            live={live}
            tipsters={tipsters}
            onOpenSeason={openSeason}
          />
        ) : active == null ? (
          <div className="shell loading" aria-busy="true">
            <div className="spinner" />
            <p>Loading {activeYear} season…</p>
          </div>
        ) : (
          <>
            {shownTab === 'week' && <ThisWeekView snapshot={active} history={historyCorpus} />}
            {shownTab === 'club' && (
              <MyClubView
                teamId={favouriteId}
                snapshot={active}
                sim={sim}
                locks={locks}
                bracket={bracket}
                history={historyCorpus}
                seasons={seasons}
                liveYear={liveYear!}
              />
            )}
            {shownTab === 'finals' &&
              (supportsProjectedBracket(active.meta) && isLive ? (
                <FinalsView
                  bracket={bracket}
                  snapshot={active}
                  history={historyCorpus}
                  finalsStarted={liveFinalsStarted}
                  simReady={sim != null}
                />
              ) : (
                <FinalsResults snapshot={active} />
              ))}
            {shownTab === 'fixtures' && (
              <FixturesView
                snapshot={active}
                bracket={isLive ? bracket : []}
                finalsStarted={isLive && liveFinalsStarted}
                history={historyCorpus}
              />
            )}
            {shownTab === 'ladder' && (
              <LadderView
                snapshot={active}
                locks={isLive ? locks : []}
                historical={!isLive}
              />
            )}
            {shownTab === 'odds' &&
              (isLive ? (
                <PremiershipView snapshot={active} sim={sim} />
              ) : (
                <SeasonSummary snapshot={active} />
              ))}
          </>
        )}
      </main>

      {askClub && (
        <ClubPicker
          intro
          current={null}
          onPick={(id) => {
            setFavourite(id);
            setAskClub(false);
          }}
          // dismissing is an answer too — "no club", which the picker offers in
          // as many words, so the question isn't asked again next launch
          onClose={() => {
            setFavourite(null);
            setAskClub(false);
          }}
        />
      )}

      {openGame != null && active != null && (
        <GameDetail
          game={openGame}
          snapshot={active}
          history={historyCorpus}
          onClose={() => setOpenGameId(null)}
        />
      )}

      {selectedTeam != null && active != null && (
        <TeamDetail
          teamId={selectedTeam}
          snapshot={active}
          sim={isLive ? sim : null}
          locks={isLive ? locks : []}
          history={historyCorpus}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
    </GameSelectContext.Provider>
    </TeamSelectContext.Provider>
  );
}
