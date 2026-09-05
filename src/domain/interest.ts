import type { Game, Snapshot, Standing, TeamLocks, WeatherSnapshot } from './types';
import { computeLocks } from './locks';
import { sortedStandings } from './ladder';
import { ladderCutLines } from './season';
import { completedGames, gameStart } from './features';
import { blendedHomeProb, computeRatings } from './predict';
import { teamShortName } from './teams';
import { rivalryFor, rivalryLabel } from './rivalries';
import { agreement, consensusMood, probRange, tipForGame } from './consensus';
import { isTough, weatherFor, weatherLabel } from './weather';

/**
 * What makes a game worth watching, scored.
 *
 * The app updates itself daily with nobody at the wheel, so "the interesting
 * games this week" has to be *computed* rather than curated. Every fixture in
 * the upcoming round is scored by a handful of independent signals — how close
 * the model thinks it is, what it settles on the ladder, whether the two clubs
 * have history — and each signal states its own case in plain English. The score
 * is exactly the sum of the reasons shown, so the ranking is always inspectable:
 * the same discipline as the prediction model, applied to editorial judgement.
 *
 * The stakes signals (clinch / elimination) are *mathematical*, not projected —
 * they reuse the conservative locks engine, so "win and they're in" is a
 * certainty, never a likelihood.
 */

export type ReasonKind =
  | 'close'
  | 'consensus'
  | 'weather'
  | 'clinch'
  | 'elimination'
  | 'sixpointer'
  | 'cutline'
  | 'rivalry'
  | 'topsides'
  | 'streak'
  | 'h2h-close'
  | 'h2h-streak'
  | 'rematch';

export interface InterestReason {
  kind: ReasonKind;
  /** points this reason contributes to the game's score */
  weight: number;
  /** the case for watching, as a sentence */
  text: string;
  /** the club this reason is about, when it is about one */
  teamId?: number;
}

export interface RatedGame {
  game: Game;
  /** the app's blended model probability that the home side wins */
  homeProb: number;
  /** sum of the reason weights below */
  score: number;
  /** the strongest reason, used as the card's headline */
  headline: string;
  reasons: InterestReason[];
}

/**
 * How much each signal is worth. These are editorial weights, not fitted
 * parameters — there is no ground truth for "interesting" to backtest against.
 * They encode one ordering: what a game decides outranks how close it is, which
 * outranks who is playing.
 */
export const WEIGHTS = {
  /** closeness is scaled by how even the game is, up to this maximum */
  close: 30,
  /**
   * Scaled by how badly the tipping models split. Deliberately well under
   * `close`: a model calling a game even is one opinion, but thirty models
   * failing to agree is thirty opinions saying the game is genuinely open —
   * related enough to the closeness signal that stacking them at equal weight
   * would double-count the same fact.
   */
  consensusSplit: 14,
  /**
   * Rain or wind at the bounce. Modest on purpose: conditions change how a game
   * is played, not how much is at stake, and a wet Tuesday-night dead rubber is
   * still a dead rubber.
   */
  weather: 8,
  clinch: 28,
  elimination: 26,
  sixPointer: 22,
  cutLine: 12,
  derby: 18,
  traditional: 12,
  /** added on top when a rivalry falls on its fixed-date occasion */
  occasion: 6,
  topFour: 16,
  topSix: 9,
  winStreak: 10,
  losingStreak: 5,
  h2hClose: 10,
  h2hStreak: 8,
  finalsRematch: 12
} as const;

/** A streak of 4+ is worth mentioning; below that it's just recent form. */
const STREAK_MIN = 4;
/** Meetings averaging under this margin count as a genuinely tight rivalry. */
const TIGHT_MARGIN = 12;
/** How many recent meetings the head-to-head signals look at. */
const H2H_WINDOW = 5;

const byStart = (games: Game[]) => [...games].sort((a, b) => gameStart(a) - gameStart(b) || a.id - b.id);

/**
 * The games "this week": the earliest home & away round that still has an
 * unplayed game, or — once the home & away season is done — the earliest finals
 * week still to be played. Empty when the season is over. Advances on its own as
 * the daily update fills in results, so the page never needs a date to be set.
 */
export function upcomingGames(snapshot: Snapshot): {
  round: number;
  finals: boolean;
  games: Game[];
} {
  const ha = snapshot.games.filter((g) => g.is_final === 0 && !g.complete);
  if (ha.length > 0) {
    const round = Math.min(...ha.map((g) => g.round));
    return { round, finals: false, games: byStart(ha.filter((g) => g.round === round)) };
  }
  // real finals only: guard against upstream placeholder fixtures (TBD v TBD)
  const fin = snapshot.games.filter(
    (g) => g.is_final > 0 && !g.complete && g.hteamid > 0 && g.ateamid > 0
  );
  if (fin.length > 0) {
    const week = Math.min(...fin.map((g) => g.is_final));
    return { round: week, finals: true, games: byStart(fin.filter((g) => g.is_final === week)) };
  }
  return { round: 0, finals: false, games: [] };
}

export interface RateOptions {
  /**
   * Completed games from earlier seasons (the cross-season corpus). Head-to-head
   * signals read this plus the live season, so an empty archive simply means
   * fewer reasons — never a wrong one.
   */
  history?: Game[];
  /**
   * The kickoff forecast, when one is deployed. Absent simply means no weather
   * reason — never a claim that the day is fine.
   */
  weather?: WeatherSnapshot | null;
  /**
   * Whether to work out what each result would settle. Home & away only: the
   * locks engine bounds a team's *ladder* finish, which finals week doesn't have.
   * Defaults to true.
   */
  stakes?: boolean;
}

/**
 * Score every supplied game, best first. Ties break on kickoff time so the order
 * is stable between renders and across identical data.
 */
export function rateGames(
  snapshot: Snapshot,
  games: Game[],
  opts: RateOptions = {}
): RatedGame[] {
  const history = opts.history ?? [];
  const priorHistory = history.filter((g) => g.year < snapshot.meta.year);
  const ratings = computeRatings(snapshot.standings, snapshot.games, { history: priorHistory });

  const ladder = sortedStandings(snapshot.standings);
  const rankOf = new Map(ladder.map((s, i) => [s.id, i + 1]));
  const ptsOf = new Map(ladder.map((s) => [s.id, s.pts]));
  const cuts = ladderCutLines(snapshot.meta);

  const withStakes = opts.stakes !== false;
  const baseLocks = withStakes ? computeLocks(snapshot.standings, snapshot.games) : [];
  const lockOf = new Map(baseLocks.map((l) => [l.teamId, l]));

  // every completed meeting, newest first, indexed by club pair — built once
  const meetings = meetingIndex([...history, ...snapshot.games]);
  const streaks = streakIndex(snapshot.games);

  const rated = games.map((game) => {
    const homeProb = blendedHomeProb(snapshot, ratings, snapshot.games, game);
    const reasons: InterestReason[] = [
      closeness(game, homeProb),
      divided(snapshot, game),
      conditions(game, opts.weather ?? null),
      ...stakes(snapshot, game, lockOf, withStakes),
      ...ladderPosition(game, rankOf, ptsOf, ladder, cuts),
      ...clubHistory(game, meetings, snapshot.meta.year),
      ...form(game, streaks)
    ].filter((r): r is InterestReason => r != null);

    reasons.sort((a, b) => b.weight - a.weight);
    const score = reasons.reduce((sum, r) => sum + r.weight, 0);
    return { game, homeProb, score, headline: reasons[0]?.text ?? '', reasons };
  });

  return rated.sort((a, b) => b.score - a.score || gameStart(a.game) - gameStart(b.game));
}

/* ---------- signals ---------- */

/** How evenly the model splits the game — a coin-flip is the most watchable. */
function closeness(game: Game, homeProb: number): InterestReason {
  const even = 1 - Math.abs(2 * homeProb - 1); // 1 = 50/50, 0 = certainty
  const hp = Math.round(homeProb * 100);
  const leaderId = homeProb >= 0.5 ? game.hteamid : game.ateamid;
  const top = Math.max(hp, 100 - hp);
  const text =
    even >= 0.85
      ? `Line-ball — the model splits it ${hp}–${100 - hp}`
      : even >= 0.65
        ? `Close on paper — ${teamShortName(leaderId)} ${top}–${100 - top}`
        : `${teamShortName(leaderId)} favoured ${top}–${100 - top}`;
  return { kind: 'close', weight: WEIGHTS.close * even, text };
}

/**
 * Rain or wind at the bounce.
 *
 * Weather is the one signal here that comes from outside the football data, and
 * the only one that changes how the game will be *played* rather than what it is
 * worth. A wet night turns a shootout into an arm-wrestle, which is worth
 * knowing before you choose what to watch — and worth knowing afterwards, when
 * the score makes no sense against the form.
 *
 * Silent on a fine day and silent when no forecast is deployed, because an
 * absent forecast is not a fine day.
 */
function conditions(game: Game, weather: WeatherSnapshot | null): InterestReason | null {
  const w = weatherFor(weather, game.id);
  if (!isTough(w)) return null;
  const label = weatherLabel(w);
  if (!label) return null;
  return {
    kind: 'weather',
    weight: WEIGHTS.weather,
    text: `${label} forecast — a different game in those conditions`
  };
}

/**
 * How badly the tipping models disagree.
 *
 * Distinct from closeness, which is one model's opinion that a game is even.
 * This is thirty independent models failing to reach the same conclusion, which
 * is a stronger claim: not "the numbers are close" but "nobody knows". A game
 * the field splits down the middle is the one to watch even when each
 * individual model is quietly confident.
 *
 * Silent when the field broadly agrees, and silent again on a snapshot taken
 * before the per-model detail was recorded — an absent signal must never read as
 * a unanimous one.
 */
function divided(snapshot: Snapshot, game: Game): InterestReason | null {
  const tip = tipForGame(snapshot, game);
  const mood = consensusMood(tip);
  const share = agreement(tip);
  if (tip == null || mood == null || share == null || mood === 'agreed') return null;

  // a dead split (half the field each way) is the maximum; agreement past the
  // 'agreed' cut has already returned above
  const split = Math.max(0, Math.min(1, (1 - share) * 2));
  const lead = Math.max(tip.htips ?? 0, tip.atips ?? 0);
  const trail = Math.min(tip.htips ?? 0, tip.atips ?? 0);
  const leaderId = (tip.htips ?? 0) >= (tip.atips ?? 0) ? game.hteamid : game.ateamid;
  const range = probRange(tip);

  const text =
    mood === 'split'
      ? `The tipsters can't split it — ${lead}–${trail} across ${tip.models} models`
      : range != null && range >= 0.4
        ? `Tipsters divided — they lean ${teamShortName(leaderId)}, but by anywhere from ` +
          `${Math.round((tip.low ?? 0) * 100)} to ${Math.round((tip.high ?? 0) * 100)}%`
        : `Tipsters divided — ${lead} of ${tip.models} lean ${teamShortName(leaderId)}`;

  return { kind: 'consensus', weight: WEIGHTS.consensusSplit * split, text };
}

/**
 * What this result would settle, mathematically. Runs the locks engine on the
 * season as it *would* stand after a win and after a loss, and reports any tier
 * that flips from open to certain. Because the engine is conservative, a clinch
 * reported here is guaranteed by this result alone — no other game has to fall a
 * particular way.
 */
function stakes(
  snapshot: Snapshot,
  game: Game,
  lockOf: Map<number, TeamLocks>,
  enabled: boolean
): InterestReason[] {
  if (!enabled) return [];
  const out: InterestReason[] = [];
  for (const teamId of [game.hteamid, game.ateamid]) {
    const before = lockOf.get(teamId);
    if (!before) continue;
    const opponentId = teamId === game.hteamid ? game.ateamid : game.hteamid;
    const name = teamShortName(teamId);

    const afterWin = locksAfter(snapshot, game, teamId, teamId);
    const tier = newlyLockedTier(before, afterWin);
    if (tier) {
      out.push({
        kind: 'clinch',
        weight: WEIGHTS.clinch,
        text: `${name} clinch ${tier} with a win`,
        teamId
      });
    }

    const afterLoss = locksAfter(snapshot, game, opponentId, teamId);
    if (!before.outOfTop10 && afterLoss?.outOfTop10) {
      out.push({
        kind: 'elimination',
        weight: WEIGHTS.elimination,
        text: `${name} are out of finals contention if they lose`,
        teamId
      });
    }
  }
  return out;
}

/** Where the two clubs sit relative to the ladder's cut lines. */
function ladderPosition(
  game: Game,
  rankOf: Map<number, number>,
  ptsOf: Map<number, number>,
  ladder: Standing[],
  cuts: { byeCutIndex: number | null; finalsCutIndex: number }
): InterestReason[] {
  const hr = rankOf.get(game.hteamid);
  const ar = rankOf.get(game.ateamid);
  if (hr == null || ar == null) return [];
  const out: InterestReason[] = [];

  // cut lines as 1-based ranks: the last position still inside the tier
  const lines: Array<{ rank: number; label: string }> = [];
  if (cuts.byeCutIndex != null) {
    lines.push({ rank: cuts.byeCutIndex + 1, label: `top ${cuts.byeCutIndex + 1}` });
  }
  lines.push({ rank: cuts.finalsCutIndex + 1, label: `top ${cuts.finalsCutIndex + 1}` });

  let sixPointer: { rank: number; label: string } | null = null;
  for (const line of lines) {
    // a genuine six-pointer: both clubs are in the scrap for the same cut line
    if (near(hr, line.rank) && near(ar, line.rank)) sixPointer = line;
  }
  if (sixPointer) {
    out.push({
      kind: 'sixpointer',
      weight: WEIGHTS.sixPointer,
      text: `Six-pointer for the ${sixPointer.label} — ${ordinal(hr)} v ${ordinal(ar)}`
    });
  } else {
    // otherwise, note a single club with something immediate to play for
    const best = [game.hteamid, game.ateamid]
      .map((id) => cutProximity(id, rankOf.get(id)!, ptsOf, ladder, lines))
      .filter((r): r is InterestReason => r != null)
      .sort((a, b) => b.weight - a.weight)[0];
    if (best) out.push(best);
  }

  if (hr <= 4 && ar <= 4) {
    out.push({
      kind: 'topsides',
      weight: WEIGHTS.topFour,
      text: `Top-four clash — ${ordinal(hr)} v ${ordinal(ar)}`
    });
  } else if (hr <= 6 && ar <= 6) {
    out.push({
      kind: 'topsides',
      weight: WEIGHTS.topSix,
      text: `Two of the top six — ${ordinal(hr)} v ${ordinal(ar)}`
    });
  }
  return out;
}

/** Within a couple of places either side of a cut line. */
function near(rank: number, line: number): boolean {
  return rank >= line - 2 && rank <= line + 3;
}

/** A club sitting on, or within two wins of, a cut line. */
function cutProximity(
  teamId: number,
  rank: number,
  ptsOf: Map<number, number>,
  ladder: Standing[],
  lines: Array<{ rank: number; label: string }>
): InterestReason | null {
  const name = teamShortName(teamId);
  for (const line of lines) {
    if (rank === line.rank) {
      return {
        kind: 'cutline',
        weight: WEIGHTS.cutLine,
        text: `${name} hold the last ${line.label} spot`,
        teamId
      };
    }
    const holder = ladder[line.rank - 1];
    if (rank > line.rank && holder) {
      const gap = (ptsOf.get(holder.id) ?? 0) - (ptsOf.get(teamId) ?? 0);
      const wins = Math.ceil(gap / 4);
      if (wins >= 1 && wins <= 2) {
        return {
          kind: 'cutline',
          weight: WEIGHTS.cutLine,
          text: `${name} are ${wins} win${wins === 1 ? '' : 's'} off the ${line.label}`,
          teamId
        };
      }
    }
  }
  return null;
}

/** Rivalry, recent head-to-head, and last season's finals rematches. */
function clubHistory(
  game: Game,
  meetings: Map<string, Game[]>,
  year: number
): InterestReason[] {
  const out: InterestReason[] = [];
  const rivalry = rivalryFor(game.hteamid, game.ateamid);
  if (rivalry) {
    const occasion = rivalryLabel(rivalry, game);
    const isOccasion = occasion !== rivalry.name;
    out.push({
      kind: 'rivalry',
      weight:
        (rivalry.kind === 'derby' ? WEIGHTS.derby : WEIGHTS.traditional) +
        (isOccasion ? WEIGHTS.occasion : 0),
      text: isOccasion ? occasion : `${rivalry.name} — a standing rivalry`
    });
  }

  const past = (meetings.get(pairKey(game.hteamid, game.ateamid)) ?? []).slice(0, H2H_WINDOW);
  if (past.length >= 3) {
    const avg = past.reduce((s, g) => s + Math.abs(g.hscore! - g.ascore!), 0) / past.length;
    if (avg <= TIGHT_MARGIN) {
      out.push({
        kind: 'h2h-close',
        weight: WEIGHTS.h2hClose,
        text: `Their last ${past.length} meetings were decided by ${Math.round(avg)} points on average`
      });
    }
  }
  if (past.length >= STREAK_MIN) {
    const winners = past.map((g) => winnerOf(g));
    const first = winners[0];
    if (first != null && winners.every((w) => w === first)) {
      const loserId = first === game.hteamid ? game.ateamid : game.hteamid;
      out.push({
        kind: 'h2h-streak',
        weight: WEIGHTS.h2hStreak,
        text: `${teamShortName(loserId)} have lost their last ${winners.length} against ${teamShortName(first)}`,
        teamId: loserId
      });
    }
  }
  if (past.some((g) => g.is_final > 0 && g.year === year - 1)) {
    out.push({
      kind: 'rematch',
      weight: WEIGHTS.finalsRematch,
      text: `Rematch of a ${year - 1} finals meeting`
    });
  }
  return out;
}

/** Clubs riding, or stuck in, a run of results. */
function form(game: Game, streaks: Map<number, number>): InterestReason[] {
  const out: InterestReason[] = [];
  for (const teamId of [game.hteamid, game.ateamid]) {
    const streak = streaks.get(teamId) ?? 0;
    const name = teamShortName(teamId);
    if (streak >= STREAK_MIN) {
      out.push({
        kind: 'streak',
        weight: WEIGHTS.winStreak,
        text: `${name} have won ${streak} straight`,
        teamId
      });
    } else if (streak <= -STREAK_MIN) {
      out.push({
        kind: 'streak',
        weight: WEIGHTS.losingStreak,
        text: `${name} have lost ${-streak} straight`,
        teamId
      });
    }
  }
  return out;
}

/* ---------- helpers ---------- */

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function winnerOf(g: Game): number | null {
  if (g.winnerteamid != null) return g.winnerteamid;
  if (g.hscore == null || g.ascore == null || g.hscore === g.ascore) return null;
  return g.hscore > g.ascore ? g.hteamid : g.ateamid;
}

/** Every completed meeting per club pair, newest first. */
function meetingIndex(games: Game[]): Map<string, Game[]> {
  const map = new Map<string, Game[]>();
  for (const g of completedGames(games)) {
    const k = pairKey(g.hteamid, g.ateamid);
    const list = map.get(k) ?? [];
    list.unshift(g); // completedGames is oldest→newest, so unshift lands newest first
    map.set(k, list);
  }
  return map;
}

/**
 * Current run per club: positive = consecutive wins, negative = consecutive
 * losses, 0 = last game drawn or none played. Streaks are season-scoped, the way
 * they are talked about.
 */
function streakIndex(games: Game[]): Map<number, number> {
  const done = completedGames(games);
  const byTeam = new Map<number, Game[]>();
  for (const g of done) {
    for (const id of [g.hteamid, g.ateamid]) {
      const list = byTeam.get(id) ?? [];
      list.push(g);
      byTeam.set(id, list);
    }
  }
  const out = new Map<number, number>();
  for (const [teamId, list] of byTeam) {
    let run = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const w = winnerOf(list[i]);
      if (w == null) break; // a draw ends the run
      const won = w === teamId;
      if (run === 0) run = won ? 1 : -1;
      else if (won && run > 0) run++;
      else if (!won && run < 0) run--;
      else break;
    }
    out.set(teamId, run);
  }
  return out;
}

/**
 * The season as it would stand with `game` won by `winnerId`, run through the
 * locks engine. Only points and remaining-game counts feed that engine, so the
 * hypothetical standings need nothing else to be exact.
 */
function locksAfter(
  snapshot: Snapshot,
  game: Game,
  winnerId: number,
  forTeamId: number
): TeamLocks | undefined {
  const loserId = winnerId === game.hteamid ? game.ateamid : game.hteamid;
  const games = snapshot.games.map((g) =>
    g.id === game.id ? { ...g, complete: 1, winnerteamid: winnerId } : g
  );
  const standings: Standing[] = snapshot.standings.map((s) => {
    if (s.id === winnerId) return { ...s, played: s.played + 1, wins: s.wins + 1, pts: s.pts + 4 };
    if (s.id === loserId) return { ...s, played: s.played + 1, losses: s.losses + 1 };
    return s;
  });
  return computeLocks(standings, games).find((l) => l.teamId === forTeamId);
}

/**
 * The strongest tier that goes from open to mathematically certain. Phrased for
 * the current top-ten wildcard format, which is the only format this page runs
 * on (archived seasons show results, not a live week).
 */
function newlyLockedTier(before: TeamLocks, after: TeamLocks | undefined): string | null {
  if (!after) return null;
  if (!before.inTop4 && after.inTop4) return 'a top-four spot';
  if (!before.inTop6 && after.inTop6) return 'a top-six bye';
  if (!before.inTop10 && after.inTop10) return 'a finals berth';
  return null;
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}
