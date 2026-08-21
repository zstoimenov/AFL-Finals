import { useEffect, useRef, useState } from 'react';
import type { BracketMatch } from '../domain/types';
import { currentBracketWeek } from '../domain/buildBracket';
import { prefersReducedMotion } from '../domain/format';
import MatchCard from './MatchCard';

const COLUMNS: Array<{ title: string; short: string; sub: string; keys: string[] }> = [
  { title: 'Wildcard', short: 'Wildcard', sub: 'Week 1 · 7v10, 8v9', keys: ['WC1', 'WC2'] },
  {
    title: 'Qualifying & Elimination',
    short: 'Qualifying & Elim',
    sub: 'Week 2 · top 6 enter',
    keys: ['QF1', 'EF1', 'EF2', 'QF2']
  },
  { title: 'Semi Finals', short: 'Semis', sub: 'Week 3', keys: ['SF1', 'SF2'] },
  { title: 'Preliminary', short: 'Prelims', sub: 'Week 4', keys: ['PF1', 'PF2'] },
  { title: 'Grand Final', short: 'Grand Final', sub: 'Week 5 · MCG', keys: ['GF'] }
];

/**
 * The full 2026 top-ten bracket, five columns from Wildcard Round to the
 * Grand Final.
 *
 * A five-week bracket does not fit a phone, and a plain horizontal scroller
 * gives no hint that four more weeks exist off the right edge. So the columns
 * snap: one week fills a narrow screen, swiping moves a week at a time, and the
 * pager above names the week you're on and steps between them — the same
 * affordance the round stepper gives Fixtures. On a wide screen every column is
 * visible at once and the pager hides itself in CSS.
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
  const scroller = useRef<HTMLDivElement>(null);
  // 0-based column index; the bracket opens on the week still to be played
  const [week, setWeek] = useState(() => currentBracketWeek(bracket) - 1);

  const columnAt = (i: number): HTMLElement | null =>
    scroller.current?.querySelectorAll<HTMLElement>('.bracket-col')[i] ?? null;

  /** Scroll a week into view; `smooth` only for a deliberate tap, not on load. */
  const showWeek = (i: number, smooth = true) => {
    const el = scroller.current;
    const col = columnAt(i);
    if (!el || !col) return;
    const delta = col.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollTo({
      left: el.scrollLeft + delta,
      behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto'
    });
    setWeek(i);
  };

  // land on the live week without animating past the ones already played
  useEffect(() => {
    showWeek(currentBracketWeek(bracket) - 1, false);
    // only on mount / when the series moves on — not on every sim tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalsStarted]);

  // keep the pager honest when the user swipes the columns themselves
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const left = el.getBoundingClientRect().left;
    let nearest = 0;
    let best = Infinity;
    el.querySelectorAll<HTMLElement>('.bracket-col').forEach((col, i) => {
      const d = Math.abs(col.getBoundingClientRect().left - left);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setWeek((w) => (w === nearest ? w : nearest));
  };

  const col = COLUMNS[week] ?? COLUMNS[0];

  return (
    <section>
      <div className="bracket-pager">
        <button
          type="button"
          className="round-step"
          aria-label="Previous finals week"
          disabled={week <= 0}
          onClick={() => showWeek(week - 1)}
        >
          ‹
        </button>
        <span className="bracket-pager-label">
          <strong>{col.short}</strong>
          <span className="bracket-pager-sub">{col.sub}</span>
        </span>
        <button
          type="button"
          className="round-step"
          aria-label="Next finals week"
          disabled={week >= COLUMNS.length - 1}
          onClick={() => showWeek(week + 1)}
        >
          ›
        </button>
      </div>
      <ol className="bracket-dots">
        {COLUMNS.map((c, i) => (
          <li key={c.title}>
            <button
              type="button"
              className={i === week ? 'bracket-dot on' : 'bracket-dot'}
              aria-label={c.title}
              aria-current={i === week ? 'true' : undefined}
              onClick={() => showWeek(i)}
            />
          </li>
        ))}
      </ol>

      <div className="bracket-scroll" ref={scroller} onScroll={onScroll}>
        <div className="bracket">
          {COLUMNS.map((c) => (
            <div className="bracket-col" key={c.title}>
              <h2>{c.title}</h2>
              <p className="colsub">{c.sub}</p>
              <div className="bracket-col-matches">
                {c.keys.map((k) => {
                  const m = byKey.get(k);
                  return m ? <MatchCard key={k} match={m} /> : null;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="legendnote">
        A percentage beside a known club is the model&apos;s chance it wins that match. On a slot
        still to be filled, it&apos;s the simulation&apos;s most likely occupant and how often they
        land there. <span className="sidelock-key" aria-hidden="true" /> marks a club that can no
        longer move from the position.
      </p>
      {premier != null && (
        <p className="premier-callout">Premiers decided — see the Grand Final card</p>
      )}
      {!finalsStarted && !simReady && (
        <p className="simnote">Running premiership simulation…</p>
      )}
    </section>
  );
}
