import type { BracketMatch } from '../domain/types';
import MatchCard from './MatchCard';

const COLUMNS: Array<{ title: string; sub: string; keys: string[] }> = [
  { title: 'Wildcard', sub: 'Week 1 · 7v10, 8v9', keys: ['WC1', 'WC2'] },
  { title: 'Qualifying & Elimination', sub: 'Week 2 · top 6 enter', keys: ['QF1', 'EF1', 'EF2', 'QF2'] },
  { title: 'Semi Finals', sub: 'Week 3', keys: ['SF1', 'SF2'] },
  { title: 'Preliminary', sub: 'Week 4', keys: ['PF1', 'PF2'] },
  { title: 'Grand Final', sub: 'Week 5 · MCG', keys: ['GF'] }
];

/**
 * The full 2026 top-ten bracket, five columns from Wildcard Round to the
 * Grand Final. Scrolls horizontally on small screens.
 */
export default function BracketView({
  bracket,
  finalsStarted,
  simReady
}: {
  bracket: BracketMatch[];
  finalsStarted: boolean;
  simReady: boolean;
}) {
  const byKey = new Map(bracket.map((m) => [m.key, m]));
  const premier = byKey.get('GF')?.winnerTeamId;

  return (
    <section>
      <div className="bracket-scroll">
        <div className="bracket">
          {COLUMNS.map((col) => (
            <div className="bracket-col" key={col.title}>
              <h2>{col.title}</h2>
              <p className="colsub">{col.sub}</p>
              <div className="bracket-col-matches">
                {col.keys.map((k) => {
                  const m = byKey.get(k);
                  return m ? <MatchCard key={k} match={m} /> : null;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {premier != null && (
        <p className="premier-callout">Premiers decided — see the Grand Final card</p>
      )}
      {!finalsStarted && !simReady && (
        <p className="simnote">Running premiership simulation…</p>
      )}
    </section>
  );
}
