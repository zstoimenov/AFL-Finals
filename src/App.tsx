import { useEffect, useMemo, useRef, useState } from 'react';
import { loadSnapshot } from './api/loadData';
import type { Snapshot } from './domain/types';
import type { SimOutput } from './domain/simulate';
import { computeLocks } from './domain/locks';
import { buildBracket } from './domain/buildBracket';
import { finalsGames } from './domain/ladder';
import BracketView from './components/BracketView';
import FixturesView from './components/FixturesView';
import LadderView from './components/LadderView';
import PremiershipView from './components/PremiershipView';
import TeamDetail from './components/TeamDetail';
import InfoButton from './components/InfoButton';
import { TeamSelectContext } from './teamSelect';

type Tab = 'bracket' | 'fixtures' | 'ladder' | 'odds';

const SIM_ITERATIONS = 10000;

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [sim, setSim] = useState<SimOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('bracket');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [tabsStuck, setTabsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    loadSnapshot().then(setSnapshot).catch((e) => setError(String(e)));
  }, []);

  // shadow under the nav pills only once they've stuck to the top
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setTabsStuck(!e.isIntersecting), {
      threshold: 0
    });
    io.observe(el);
    return () => io.disconnect();
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SimOutput>) => setSim(e.data);
    worker.postMessage({ snapshot, iterations: SIM_ITERATIONS });
    return () => worker.terminate();
  }, [snapshot]);

  const locks = useMemo(
    () => (snapshot ? computeLocks(snapshot.standings, snapshot.games) : []),
    [snapshot]
  );
  const bracket = useMemo(
    () => (snapshot ? buildBracket(snapshot, sim, locks) : []),
    [snapshot, sim, locks]
  );

  if (error) {
    return (
      <div className="shell">
        <p className="error">Could not load data: {error}</p>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="shell loading" aria-busy="true">
        <div className="spinner" />
        <p>Loading season data…</p>
      </div>
    );
  }

  const finalsStarted = finalsGames(snapshot.games).length > 0;
  const asOf = new Date(snapshot.meta.fetchedAt);

  return (
    <TeamSelectContext.Provider value={setSelectedTeam}>
    <div className="shell">
      <header className="topbar">
        <h1>
          <span className="logo" aria-hidden="true">🏉</span> AFL Finals Tracker
        </h1>
        <div className="topbar-right">
          <p className="datastamp">
            {snapshot.meta.source === 'seed' ? 'Sample data · ' : ''}
            {finalsStarted ? 'Finals series' : `After round ${snapshot.meta.currentRound}`} ·
            updated {asOf.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </p>
          <InfoButton title="About this app" label="About">
            <p>
              A tracker for the 2026 AFL finals (the new top-ten Wildcard format). It projects
              the bracket from the live ladder and estimates each match and the premiership.
            </p>
            <p>
              Projections come from an in-app model (ladder, percentage, form, home advantage)
              plus a {SIM_ITERATIONS.toLocaleString()}-run Monte Carlo of the finals series.
              Ladder, fixtures, results and consensus tips are from{' '}
              <a href="https://squiggle.com.au">Squiggle</a>. All times are AWST.
            </p>
          </InfoButton>
        </div>
      </header>

      {snapshot.meta.source === 'seed' && !dismissed.has('seed') && (
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
      {!finalsStarted && !dismissed.has('prefinals') && (
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
            ['bracket', 'Bracket'],
            ['fixtures', 'Fixtures'],
            ['ladder', 'Ladder'],
            ['odds', 'Odds']
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
        {tab === 'bracket' && (
          <BracketView bracket={bracket} finalsStarted={finalsStarted} simReady={sim != null} />
        )}
        {tab === 'fixtures' && (
          <FixturesView snapshot={snapshot} bracket={bracket} finalsStarted={finalsStarted} />
        )}
        {tab === 'ladder' && <LadderView snapshot={snapshot} locks={locks} sim={sim} />}
        {tab === 'odds' && <PremiershipView snapshot={snapshot} sim={sim} />}
      </main>

      {selectedTeam != null && (
        <TeamDetail
          teamId={selectedTeam}
          snapshot={snapshot}
          sim={sim}
          locks={locks}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
    </TeamSelectContext.Provider>
  );
}
