import { useEffect, useMemo, useRef, useState } from 'react';
import type { BracketMatch, Game, Snapshot } from '../domain/types';
import {
  squiggleProb,
  squiggleMargin,
  computeRatings,
  blendedHomeProb,
  preGameHomeProb
} from '../domain/predict';
import { isGameToday, prefersReducedMotion } from '../domain/format';
import { buildFinalsContexts } from '../domain/finalsContext';
import { currentHomeAwayRound, homeAwayRounds, roundProgress } from '../domain/ladder';
import type { RoundProgress } from '../domain/ladder';
import { teamAbbrev } from '../domain/teams';
import { gameHasFavourite } from '../domain/favourite';
import ProbBar from './ProbBar';
import MatchCard from './MatchCard';
import InfoButton from './InfoButton';
import { CardFoot, CardMeta, CardOpen, TeamLine } from './FixtureCardParts';

const roundLabel = (r: number) => (r === 0 ? 'Opening Round' : `Round ${r}`);

/**
 * Fixtures by round: completed games show their result (highlighted), upcoming
 * games show win-probability bars. Opens on the current round and advances
 * automatically as results come in; the arrows step between rounds. Once finals
 * begin it shows the finals fixtures instead.
 */
export default function FixturesView({
  snapshot,
  bracket,
  finalsStarted,
  history = []
}: {
  snapshot: Snapshot;
  bracket: BracketMatch[];
  finalsStarted: boolean;
  history?: Game[];
}) {
  const priorHistory = useMemo(
    () => history.filter((g) => g.year < snapshot.meta.year),
    [history, snapshot]
  );
  const ratings = useMemo(
    () => computeRatings(snapshot.standings, snapshot.games, { history: priorHistory }),
    [snapshot, priorHistory]
  );
  // the same match context the Finals screen draws, so a finals fixture reads
  // the same wherever the app shows it
  const finalsContexts = useMemo(
    () => buildFinalsContexts(snapshot, bracket, history),
    [snapshot, bracket, history]
  );
  const rounds = useMemo(() => homeAwayRounds(snapshot.games), [snapshot]);
  const progress = useMemo(() => roundProgress(snapshot.games), [snapshot]);
  const current = useMemo(() => currentHomeAwayRound(snapshot.games), [snapshot]);
  const [round, setRound] = useState(current);
  // follow the current round whenever fresh data shifts it (auto-advance)
  useEffect(() => setRound(current), [current]);

  if (finalsStarted) {
    const upcoming = bracket.filter((m) => m.winnerTeamId == null);
    const played = bracket.filter((m) => m.winnerTeamId != null);
    return (
      <section className="fixtures">
        <h2>Finals fixtures</h2>
        <div className="cardgrid">
          {upcoming.map((m) => (
            <MatchCard key={m.key} match={m} context={finalsContexts.get(m.key)} />
          ))}
        </div>
        {played.length > 0 && (
          <>
            <h2>Completed finals</h2>
            <div className="cardgrid">
              {played.map((m) => (
                <MatchCard key={m.key} match={m} context={finalsContexts.get(m.key)} />
              ))}
            </div>
          </>
        )}
      </section>
    );
  }

  const min = rounds[0] ?? 0;
  const max = rounds[rounds.length - 1] ?? 0;
  const games = snapshot.games
    .filter((g) => g.round === round && g.is_final === 0)
    .sort((a, b) => (a.unixtime ?? 0) - (b.unixtime ?? 0) || a.id - b.id);
  const allDone = games.length > 0 && games.every((g) => g.complete);

  return (
    <section className="fixtures">
      <div className="section-head">
        <h2>Fixtures</h2>
        <InfoButton title="About fixtures">
          <p>
            Upcoming games show each team&apos;s win probability from the in-app model, with a
            bar for the split and the Squiggle model consensus where it&apos;s been tipped.
          </p>
          <p>
            Completed games show the final score with the winner highlighted, plus a check on
            each tip: whether the in-app model and Squiggle picked the actual winner. The model
            tip is graded on its pre-game rating, so a result never flatters its own forecast.
          </p>
          <p>
            The view opens on the current round and moves to the next one automatically once
            every result is in. Use the arrows to look back or ahead. All times are AWST.
          </p>
        </InfoButton>
      </div>

      <div className="round-nav">
        <button
          type="button"
          className="round-step"
          aria-label="Previous round"
          disabled={round <= min}
          onClick={() => setRound((r) => Math.max(min, r - 1))}
        >
          ‹
        </button>
        <span className="round-label">
          {roundLabel(round)}
          {round === current && <span className="round-current">Current</span>}
          {allDone && round !== current && <span className="round-done">Complete</span>}
        </span>
        <button
          type="button"
          className="round-step"
          aria-label="Next round"
          disabled={round >= max}
          onClick={() => setRound((r) => Math.min(max, r + 1))}
        >
          ›
        </button>
      </div>

      <RoundStrip progress={progress} round={round} current={current} onPick={setRound} />

      {round !== current && (
        <button type="button" className="round-back" onClick={() => setRound(current)}>
          ← Back to {roundLabel(current).toLowerCase()}
        </button>
      )}

      <div className="fixturelist">
        {games.map((g) =>
          g.complete ? (
            <ResultRow key={g.id} game={g} snapshot={snapshot} history={priorHistory} />
          ) : (
            <FixtureRow key={g.id} game={g} snapshot={snapshot} ratings={ratings} />
          )
        )}
      </div>
    </section>
  );
}

/**
 * Every round in the season as a scrollable strip. Two arrows are a poor way to
 * cross a 24-round season — going back to round 3 in September took twenty-one
 * taps — so the whole season is here, each round showing whether it is done,
 * live or still to come. The active round is scrolled into view as it changes.
 */
function RoundStrip({
  progress,
  round,
  current,
  onPick
}: {
  progress: RoundProgress[];
  round: number;
  current: number;
  onPick: (round: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  // centre the active round in the strip. Deliberately not scrollIntoView: that
  // walks up and scrolls every ancestor, and the strip is deliberately wider
  // than the viewport, so it drags the whole page sideways with it.
  useEffect(() => {
    const el = strip.current;
    const active = el?.querySelector<HTMLElement>('.round-pill.on');
    if (!el || !active) return;
    const left = active.offsetLeft - el.clientWidth / 2 + active.clientWidth / 2;
    el.scrollTo({
      left: Math.max(0, left),
      behavior: settled.current && !prefersReducedMotion() ? 'smooth' : 'auto'
    });
    settled.current = true;
  }, [round]);

  if (progress.length < 2) return null;

  return (
    <div className="round-strip" ref={strip} role="tablist" aria-label="Round">
      {progress.map((p) => {
        const state = p.round === current ? 'live' : p.complete ? 'done' : 'soon';
        return (
          <button
            key={p.round}
            type="button"
            role="tab"
            aria-selected={p.round === round}
            className={`round-pill ${state}${p.round === round ? ' on' : ''}`}
            onClick={() => onPick(p.round)}
          >
            {p.round === 0 ? 'OR' : p.round}
            <span className="visually-hidden">
              {` — ${roundLabel(p.round)}, ${
                p.round === current ? 'current round' : p.complete ? 'complete' : 'not yet played'
              }`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Whether a predictor that made `homeProb` picked the team that actually won. */
function tipVerdict(homeProb: number | null, game: Game) {
  if (homeProb == null) return null;
  const pickId = homeProb >= 0.5 ? game.hteamid : game.ateamid;
  const drawn = game.winnerteamid == null;
  return { pickId, drawn, hit: !drawn && game.winnerteamid === pickId };
}

/** A single "who did this model tip, and were they right?" chip. */
function Verdict({
  source,
  v
}: {
  source: string;
  v: { pickId: number; drawn: boolean; hit: boolean };
}) {
  const state = v.drawn ? 'drawn' : v.hit ? 'hit' : 'miss';
  const outcome = v.drawn ? 'draw — no result to grade' : v.hit ? 'correct' : 'incorrect';
  return (
    <span className={`verdict ${state}`} title={`${source} tipped ${teamAbbrev(v.pickId)} — ${outcome}`}>
      <span className="verdict-src">{source}</span>
      <span className="verdict-pick">{teamAbbrev(v.pickId)}</span>
      <span className="verdict-mark" aria-hidden="true">
        {v.drawn ? '–' : v.hit ? '✓' : '✗'}
      </span>
      <span className="visually-hidden">{outcome}</span>
    </span>
  );
}

/** A finished game: final score, winner highlighted, and how the tips fared. */
function ResultRow({
  game,
  snapshot,
  history
}: {
  game: Game;
  snapshot: Snapshot;
  history: Game[];
}) {
  const fav = gameHasFavourite(game);
  const homeWon = game.winnerteamid === game.hteamid;
  const awayWon = game.winnerteamid === game.ateamid;
  // grade each tip against the actual winner: the model on its pre-game rating
  // (no hindsight, carry-over prior included), Squiggle on its stored consensus
  const model = tipVerdict(preGameHomeProb(snapshot, game, history), game);
  const squiggle = tipVerdict(squiggleProb(snapshot, game.hteamid, game.ateamid, game.id), game);
  return (
    <article className={fav ? 'fixturerow done fav-game' : 'fixturerow done'}>
      <CardOpen game={game} />
      <CardMeta game={game} tag={<span className="final-tag">Final</span>} />
      <div className="fx-teams">
        <TeamLine
          teamId={game.hteamid}
          value={game.hscore}
          tone={homeWon ? 'win' : awayWon ? 'loss' : 'flat'}
          won={homeWon}
        />
        <TeamLine
          teamId={game.ateamid}
          value={game.ascore}
          tone={awayWon ? 'win' : homeWon ? 'loss' : 'flat'}
          won={awayWon}
        />
      </div>
      <CardFoot venue={game.venue}>
        {model && <Verdict source="Model" v={model} />}
        {squiggle && <Verdict source="Squiggle" v={squiggle} />}
      </CardFoot>
    </article>
  );
}

/** An upcoming game: each side's win probability, a split bar, and consensus. */
function FixtureRow({
  game,
  snapshot,
  ratings
}: {
  game: Game;
  snapshot: Snapshot;
  ratings: Map<number, number>;
}) {
  const p = blendedHomeProb(snapshot, ratings, snapshot.games, game);
  const hp = Math.round(p * 100);
  const sq = squiggleProb(snapshot, game.hteamid, game.ateamid, game.id);
  const sqMargin = squiggleMargin(snapshot, game.hteamid, game.ateamid, game.id);
  const fav = gameHasFavourite(game);
  const today = isGameToday(game.unixtime, game.date);
  const cls = `fixturerow${fav ? ' fav-game' : ''}${today ? ' today' : ''}`;
  return (
    <article className={cls}>
      <CardOpen game={game} />
      <CardMeta
        game={game}
        tag={today ? <span className="today-tag">Today</span> : undefined}
      />
      <div className="fx-teams">
        <TeamLine
          teamId={game.hteamid}
          value={`${hp}%`}
          tone={p >= 0.5 ? 'lead' : 'trail'}
        />
        <TeamLine
          teamId={game.ateamid}
          value={`${100 - hp}%`}
          tone={p < 0.5 ? 'lead' : 'trail'}
        />
      </div>
      <div className="fx-bar">
        <ProbBar homeId={game.hteamid} awayId={game.ateamid} homeProb={p} bare />
      </div>
      <CardFoot venue={game.venue}>
        {sq != null && (
          <span className="fx-consensus">
            Squiggle <strong>{teamAbbrev(sq >= 0.5 ? game.hteamid : game.ateamid)}</strong>{' '}
            {Math.round(Math.max(sq, 1 - sq) * 100)}%
            {sqMargin != null && ` · by ${Math.round(Math.abs(sqMargin))}`}
          </span>
        )}
      </CardFoot>
    </article>
  );
}
