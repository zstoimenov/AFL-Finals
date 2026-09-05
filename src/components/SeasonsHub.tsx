import { useMemo } from 'react';
import type { Game, HistoryIndexEntry, Snapshot, TipsterCorpus } from '../domain/types';
import { seasonAccuracy } from '../domain/seasonStats';
import { bestSource, placeAmong, scoreSources } from '../domain/sourceStats';
import { formatLabel } from '../domain/season';
import { teamName } from '../domain/teams';
import TeamChip from './TeamChip';
import InfoButton from './InfoButton';
import HeadToHead from './HeadToHead';

/**
 * The multi-season hub: a scorecard per archived season (premier + how the
 * in-app model and Squiggle actually tipped it), and a cross-season head-to-head
 * explorer. Opening a season jumps the other tabs to it via the switcher.
 */
export default function SeasonsHub({
  index,
  seasons,
  liveYear,
  allGames,
  live,
  tipsters,
  onOpenSeason
}: {
  index: HistoryIndexEntry[];
  seasons: Map<number, Snapshot>;
  liveYear: number;
  allGames: Game[];
  /** the live season, whose games the tipster leaderboard is scored over */
  live: Snapshot | null;
  /** every model's individual tips, or null on a deployment without them */
  tipsters: TipsterCorpus | null;
  onOpenSeason: (year: number) => void;
}) {
  const ordered = [...index].sort((a, b) => b.year - a.year);

  if (index.length === 0) {
    return (
      <section className="hub">
        <div className="section-head">
          <h2>Seasons</h2>
        </div>
        <p className="simnote">
          No archived seasons yet — the history archive is published by the
          <strong> Update AFL history</strong> workflow. Once it runs, past seasons and the model&apos;s
          cross-season accuracy appear here.
        </p>
        <TipsterBoard live={live} tipsters={tipsters} />
      </section>
    );
  }

  return (
    <section className="hub">
      <div className="section-head">
        <h2>Seasons</h2>
        <InfoButton title="About the seasons hub">
          <p>
            Every archived season, with the premier and how each tipster actually did that year —
            the in-app model graded on its hindsight-free pre-game rating, Squiggle on its stored
            consensus. Lower Brier is better.
          </p>
          <p>
            These same seasons feed the model a cross-season prior, so it no longer starts each
            year cold. Open a season to browse its ladder, results and finals.
          </p>
        </InfoButton>
      </div>

      <div className="hub-cards">
        {ordered.map((row) => (
          <SeasonCard
            key={row.year}
            row={row}
            snapshot={seasons.get(row.year) ?? null}
            onOpen={() => onOpenSeason(row.year)}
          />
        ))}
      </div>

      <TipsterBoard live={live} tipsters={tipsters} />

      <HeadToHead games={allGames} />

      <p className="hub-livenote">
        Live <strong>{liveYear}</strong> is on the other tabs — the model there is informed by these{' '}
        {index.length} season{index.length === 1 ? '' : 's'}.
      </p>
    </section>
  );
}

function SeasonCard({
  row,
  snapshot,
  onOpen
}: {
  row: HistoryIndexEntry;
  snapshot: Snapshot | null;
  onOpen: () => void;
}) {
  const acc = useMemo(() => (snapshot ? seasonAccuracy(snapshot) : null), [snapshot]);
  return (
    <article className="hub-card">
      <div className="hub-card-top">
        <span className="hub-year">{row.year}</span>
        <span className="format-chip">{formatLabel({ year: row.year, format: row.format })}</span>
      </div>
      {row.premier != null && (
        <div className="hub-premier">
          <span className="premier-cup" aria-hidden="true">🏆</span>
          <TeamChip teamId={row.premier} compact />
        </div>
      )}
      {acc ? (
        <table className="hub-acc">
          <thead>
            <tr>
              <th>Tipster</th>
              <th className="num">Hit</th>
              <th className="num">Brier</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Model</td>
              <td className="num">{(acc.model.hitRate * 100).toFixed(0)}%</td>
              <td className="num">{acc.model.brier.toFixed(3)}</td>
            </tr>
            <tr>
              <td>Squiggle</td>
              <td className="num">{(acc.squiggle.hitRate * 100).toFixed(0)}%</td>
              <td className="num">{acc.squiggle.brier.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="simnote">Loading {row.year}…</p>
      )}
      <button type="button" className="hub-open" onClick={onOpen}>
        View {row.premier != null ? teamName(row.premier).split(' ')[0] + "'s season" : 'season'} →
      </button>
    </article>
  );
}

/**
 * Every Squiggle model graded separately for the live season, with the app's own
 * model placed among them.
 *
 * The season cards above answer "did we beat the consensus", which flatters:
 * the consensus is an average that includes the weakest models in the field.
 * This answers the harder question — where the app actually finished — and names
 * the models worth watching. Silent on a deployment whose snapshot predates the
 * per-model corpus, rather than showing an empty table.
 */
function TipsterBoard({
  live,
  tipsters
}: {
  live: Snapshot | null;
  tipsters: TipsterCorpus | null;
}) {
  const scores = useMemo(
    () => (live ? scoreSources(tipsters, live.games, { minTips: MIN_TIPS }) : []),
    [live, tipsters]
  );
  const ours = useMemo(() => (live ? seasonAccuracy(live) : null), [live]);
  if (!live || scores.length === 0) return null;

  const placing = ours ? placeAmong(scores, ours.model.brier) : null;
  const leader = bestSource(scores);
  // the app's own row is slotted into the ranked field rather than pinned on
  // top, so its position is the honest one
  const rows: Array<{ key: string; name: string; n: number; hitRate: number; brier: number; us: boolean }> =
    scores.map((s) => ({ key: `s${s.id}`, name: s.name, n: s.n, hitRate: s.hitRate, brier: s.brier, us: false }));
  if (ours) {
    const at = rows.filter((r) => r.brier <= ours.model.brier).length;
    rows.splice(at, 0, {
      key: 'ours',
      name: 'This app',
      n: ours.model.n,
      hitRate: ours.model.hitRate,
      brier: ours.model.brier,
      us: true
    });
  }

  return (
    <section className="tipsters">
      <div className="section-head">
        <h3>
          {live.meta.year} tipsters <span className="tipster-count">{scores.length} models</span>
        </h3>
        <InfoButton title="About the tipster board">
          <p>
            Squiggle publishes every model&apos;s tip before each game, so grading them against the
            result afterwards uses only what was known at kickoff. Each model is scored the same way
            the app scores itself — lower Brier is better, and hit rate ignores draws.
          </p>
          <p>
            A model is judged only on the games it tipped, and needs at least {MIN_TIPS} of them to
            be ranked at all, so one lucky week cannot top the table. Beating the consensus is an
            easier test than this one: the consensus is an average that carries the weakest models
            in the field along with the best.
          </p>
        </InfoButton>
      </div>

      {placing && leader && (
        <p className="tipster-lede">
          This app&apos;s model sits <strong>{ordinal(placing.place)}</strong> of {placing.of} this
          season. {leader.name} leads on {leader.brier.toFixed(3)}.
        </p>
      )}

      <div className="tablewrap">
        <table className="tipster-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Tipster</th>
              <th className="num">Tips</th>
              <th className="num">Hit</th>
              <th className="num">Brier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={r.us ? 'us' : undefined}>
                <td className="num">{i + 1}</td>
                <td>{r.name}</td>
                <td className="num">{r.n}</td>
                <td className="num">{(r.hitRate * 100).toFixed(0)}%</td>
                <td className="num">{r.brier.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A model needs a real sample before a place on the board means anything. */
const MIN_TIPS = 20;

/** 1st, 2nd, 3rd — 11th to 13th are the exceptions the naive rule gets wrong. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
