import { useMemo } from 'react';
import type { Game, HistoryIndexEntry, Snapshot } from '../domain/types';
import { seasonAccuracy } from '../domain/seasonStats';
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
  onOpenSeason
}: {
  index: HistoryIndexEntry[];
  seasons: Map<number, Snapshot>;
  liveYear: number;
  allGames: Game[];
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
