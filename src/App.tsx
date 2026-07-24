import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadSnapshot,
  loadHistoryIndex,
  loadHistoryCorpus,
  loadSeason
} from './api/loadData';
import type { Game, HistoryIndexEntry, Snapshot } from './domain/types';
import type { SimOutput } from './domain/simulate';
import { computeLocks } from './domain/locks';
import { buildBracket } from './domain/buildBracket';
import { finalsGames } from './domain/ladder';
import { completedGames } from './domain/features';
import { supportsProjectedBracket } from './domain/season';
import { formatUpdatedAt } from './domain/format';
import BracketView from './components/BracketView';
import FixturesView from './components/FixturesView';
import LadderView from './components/LadderView';
import PremiershipView from './components/PremiershipView';
import FinalsResults from './components/FinalsResults';
import SeasonSummary from './components/SeasonSummary';
import SeasonsHub from './components/SeasonsHub';
import SeasonSwitcher from './components/SeasonSwitcher';
import TeamDetail from './components/TeamDetail';
import InfoButton from './components/InfoButton';
import { TeamSelectContext } from './teamSelect';

type Tab = 'bracket' | 'fixtures' | 'ladder' | 'odds' | 'seasons';

const SIM_ITERATIONS = 10000;

export default function App() {
  const [live, setLive] = useState<Snapshot | null>(null);
  const [historyIndex, setHistoryIndex] = useState<HistoryIndexEntry[]>([]);
  const [historyCorpus, setHistoryCorpus] = useState<Game[]>([]);
  const [seasons, setSeasons] = useState<Map<number, Snapshot>>(new Map());
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [sim, setSim] = useState<SimOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('fixtures');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
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

  // eagerly load every archived season so the hub can score them
  useEffect(() => {
    let cancelled = false;
    for (const { year } of historyIndex) {
      if (seasons.has(year)) continue;
      loadSeason(year).then((snap) => {
        if (!cancelled && snap) setSeasons((prev) => new Map(prev).set(year, snap));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyIndex]);

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
    setTab('ladder');
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
      setRefreshMsg('Could not refresh — check your connection');
    } finally {
      setRefreshing(false);
      window.setTimeout(() => setRefreshMsg(null), 4000);
    }
  };

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

  const liveFinalsStarted = finalsGames(live.games).length > 0;
  const viewingArchive = !isLive;

  return (
    <TeamSelectContext.Provider value={setSelectedTeam}>
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
            onChange={(y) => {
              ensureSeason(y);
              setActiveYear(y);
            }}
          />
          <p className="datastamp">
            {isLive ? (
              <>
                {live.meta.source === 'seed' ? 'Sample data · ' : ''}
                {liveFinalsStarted ? 'Finals series · ' : ''}
                updated {formatUpdatedAt(live.meta.fetchedAt)}
              </>
            ) : (
              <>Archived season · final</>
            )}
          </p>
          {isLive && (
            <button
              type="button"
              className="refreshbtn"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh data"
              title="Check for the latest published data"
            >
              <span className={refreshing ? 'refreshicon spinning' : 'refreshicon'} aria-hidden="true">
                ⟳
              </span>
              <span className="refreshlabel">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          )}
          <InfoButton title="About this app" label="About">
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
              from <a href="https://squiggle.com.au">Squiggle</a>. All times are AWST.
            </p>
            <p>
              The <strong>Seasons</strong> tab browses past seasons and shows the model&apos;s
              per-season accuracy. New results are fetched from Squiggle automatically every day
              and published here; <strong>Refresh</strong> re-checks for the latest.
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

      {isLive && live.meta.source === 'seed' && !dismissed.has('seed') && (
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
            Finals haven&apos;t started yet — the bracket below is projected from the current
            ladder and updates automatically as results come in.
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
      <nav className={tabsStuck ? 'tabs stuck' : 'tabs'} role="tablist">
        {(
          [
            ['fixtures', isLive ? 'Fixtures' : 'Results'],
            ['ladder', 'Ladder'],
            ['bracket', isLive ? 'Bracket' : 'Finals'],
            ['odds', isLive ? 'Odds' : 'Summary'],
            ['seasons', 'Seasons']
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'seasons' ? (
          <SeasonsHub
            index={historyIndex}
            seasons={seasons}
            liveYear={liveYear!}
            allGames={allGames}
            onOpenSeason={openSeason}
          />
        ) : active == null ? (
          <div className="shell loading" aria-busy="true">
            <div className="spinner" />
            <p>Loading {activeYear} season…</p>
          </div>
        ) : (
          <>
            {tab === 'bracket' &&
              (supportsProjectedBracket(active.meta) && isLive ? (
                <BracketView bracket={bracket} finalsStarted={liveFinalsStarted} simReady={sim != null} />
              ) : (
                <FinalsResults snapshot={active} />
              ))}
            {tab === 'fixtures' && (
              <FixturesView
                snapshot={active}
                bracket={isLive ? bracket : []}
                finalsStarted={isLive && liveFinalsStarted}
                history={historyCorpus}
              />
            )}
            {tab === 'ladder' && (
              <LadderView
                snapshot={active}
                locks={isLive ? locks : []}
                sim={isLive ? sim : null}
                historical={!isLive}
              />
            )}
            {tab === 'odds' &&
              (isLive ? (
                <PremiershipView snapshot={active} sim={sim} />
              ) : (
                <SeasonSummary snapshot={active} />
              ))}
          </>
        )}
      </main>

      {selectedTeam != null && active != null && (
        <TeamDetail
          teamId={selectedTeam}
          snapshot={active}
          sim={isLive ? sim : null}
          locks={isLive ? locks : []}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
    </TeamSelectContext.Provider>
  );
}
