import { useEffect, useMemo, useRef, useState } from 'react';
import type { BracketMatch, Game, Snapshot } from '../domain/types';
import { currentBracketWeek } from '../domain/buildBracket';
import { buildFinalsContexts, finalsProgress, nextFinal } from '../domain/finalsContext';
import { formatGameDateTime, prefersReducedMotion } from '../domain/format';
import { teamName } from '../domain/teams';
import MatchCard from './MatchCard';
import TeamChip from './TeamChip';
import InfoButton from './InfoButton';
import { CardOpen } from './FixtureCardParts';

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
 * The finals — the five weeks from the Wildcard Round to the Grand Final.
 *
 * The screen used to be called "Bracket" and drew exactly that: eleven slots
 * and a percentage each. But the finals are the point of the season, and a
 * fortnight of them deserves more than the shape of the draw. So the screen
 * leads with where the series is up to — the next game and when it starts, or
 * the premier once there is one — and every card carries what the app already
 * knows about the matchup: kickoff in AWST, the ground, both clubs' form, and
 * the head-to-head history the results archive holds.
 *
 * A five-week bracket does not fit a phone, and a plain horizontal scroller
 * gives no hint that four more weeks exist off the right edge. So the columns
 * snap: one week fills a narrow screen, swiping moves a week at a time, and the
 * pager above names the week you're on and steps between them — the same
 * affordance the round stepper gives Fixtures. On a wide screen every column is
 * visible at once and the pager hides itself in CSS.
 */
export default function FinalsView({
  bracket,
  snapshot,
  history = [],
  finalsStarted,
  simReady
}: {
  bracket: BracketMatch[];
  snapshot: Snapshot;
  history?: Game[];
  finalsStarted: boolean;
  simReady: boolean;
}) {
  const byKey = new Map(bracket.map((m) => [m.key, m]));
  const scroller = useRef<HTMLDivElement>(null);
  // 0-based column index; the bracket opens on the week still to be played
  const [week, setWeek] = useState(() => currentBracketWeek(bracket) - 1);

  const contexts = useMemo(
    () => buildFinalsContexts(snapshot, bracket, history),
    [snapshot, bracket, history]
  );
  const progress = useMemo(() => finalsProgress(bracket), [bracket]);
  const next = useMemo(() => nextFinal(bracket), [bracket]);

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
    <section className="finalsview">
      <div className="section-head">
        <h2>Finals</h2>
        <InfoButton title="How the finals work">
          <p>
            Ten clubs, five weeks. <strong>Week 1</strong> is the Wildcard Round — 7th plays 10th
            and 8th plays 9th, sudden death, while the top six rest. The two winners are re-seeded:
            the better-placed one takes 7th, the other 8th.
          </p>
          <p>
            <strong>Week 2</strong> brings the top six in — qualifying finals 1v4 and 2v3, with a
            second chance for the losers, and elimination finals 5v8 and 6v7. Then semi finals,
            preliminary finals, and the Grand Final at the MCG.
          </p>
          <p>
            Until a matchup is set, a slot shows the simulation&apos;s most likely occupant and how
            often they land there. Once both clubs are known, the percentage beside each is the
            model&apos;s chance it wins that game, and the card fills in with kickoff, ground, both
            clubs&apos; form and every previous meeting the archive holds.
          </p>
          <p>All times are AWST, on a 24-hour clock. Tap a scheduled game for its full sheet.</p>
        </InfoButton>
      </div>

      <FinalsLead
        premier={progress.premier}
        next={next}
        started={finalsStarted}
        remaining={progress.remaining}
        totalRounds={snapshot.meta.totalRounds}
      />

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
              <h3>{c.title}</h3>
              <p className="colsub">{c.sub}</p>
              <div className="bracket-col-matches">
                {c.keys.map((k) => {
                  const m = byKey.get(k);
                  return m ? <MatchCard key={k} match={m} context={contexts.get(k)} /> : null;
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
        longer move from the position. Head-to-head records span every season in the archive.
      </p>
      {!finalsStarted && !simReady && (
        <p className="simnote">Running premiership simulation…</p>
      )}
    </section>
  );
}

/**
 * Where the series is up to, before any bracket is read.
 *
 * Arriving on this screen the question is always the same one — what's next,
 * and when? — and a grid of eleven slots answers it only if you already know
 * which week is live. There are three states worth a headline: a premier, a
 * next game with a kickoff, and the months before either exists, when the
 * honest answer is that the whole bracket below is still a projection.
 */
function FinalsLead({
  premier,
  next,
  started,
  remaining,
  totalRounds
}: {
  premier: number | null;
  next: BracketMatch | null;
  started: boolean;
  remaining: number;
  totalRounds: number;
}) {
  if (premier != null) {
    return (
      <div className="finals-lead premier">
        <span className="premier-cup" aria-hidden="true">
          🏆
        </span>
        <div className="finals-lead-body">
          <p className="finals-lead-label">Premiers</p>
          <p className="finals-lead-head">{teamName(premier)}</p>
          <p className="finals-lead-sub">The season is complete — the Grand Final card has it.</p>
        </div>
      </div>
    );
  }

  if (next?.game) {
    const { game } = next;
    return (
      <div className="finals-lead next">
        <CardOpen game={game} />
        <div className="finals-lead-body">
          <p className="finals-lead-label">Next up · {next.name}</p>
          <p className="finals-lead-teams">
            <TeamChip teamId={game.hteamid} short />
            <span className="finals-lead-v">v</span>
            <TeamChip teamId={game.ateamid} short />
          </p>
          <p className="finals-lead-sub">
            {formatGameDateTime(game.date, game.unixtime)}
            {game.venue ? ` · ${game.venue}` : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="finals-lead projected">
      <div className="finals-lead-body">
        <p className="finals-lead-label">{started ? 'Finals under way' : 'Finals to come'}</p>
        <p className="finals-lead-sub">
          {started
            ? `${remaining} match${remaining === 1 ? '' : 'es'} still to be played — fixtures appear here as the AFL schedules them.`
            : `The bracket below is projected from the current ladder and re-draws itself after every result. Finals begin after Round ${totalRounds}.`}
        </p>
      </div>
    </div>
  );
}
