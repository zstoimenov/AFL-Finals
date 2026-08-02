import type { BracketMatch, FinalsRound, Game, Snapshot, Standing } from './types';
import { computeLocks } from './locks';
import { remainingHomeAwayGames, sortedStandings } from './ladder';
import { completedGames, gameStart } from './features';

/**
 * One club's view of the data — the numbers behind the My Club dashboard.
 *
 * Everything here is derived from games and ladders the app already has. Nothing
 * is hand-written: the "record book" is whatever the results archive actually
 * holds, so it can never claim a piece of club history the app can't show you.
 */

/** One completed game from a club's perspective. */
export interface ClubResult {
  game: Game;
  opponentId: number;
  home: boolean;
  /** margin from this club's perspective (negative = loss) */
  margin: number;
  /** null on a draw */
  won: boolean | null;
}

function toResult(game: Game, teamId: number): ClubResult {
  const home = game.hteamid === teamId;
  const margin = home ? game.hscore! - game.ascore! : game.ascore! - game.hscore!;
  return {
    game,
    opponentId: home ? game.ateamid : game.hteamid,
    home,
    margin,
    won: margin === 0 ? null : margin > 0
  };
}

/** A club's completed games from the supplied set, oldest→newest. */
export function clubResults(games: Game[], teamId: number): ClubResult[] {
  return completedGames(games)
    .filter((g) => g.hteamid === teamId || g.ateamid === teamId)
    .map((g) => toResult(g, teamId));
}

/** The club's last `n` results, newest first — the form line. */
export function recentResults(games: Game[], teamId: number, n = 6): ClubResult[] {
  return clubResults(games, teamId).slice(-n).reverse();
}

/**
 * Current run: positive = consecutive wins, negative = consecutive losses,
 * 0 = last game drawn or none played.
 */
export function currentStreak(games: Game[], teamId: number): number {
  const results = clubResults(games, teamId);
  let run = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    const { won } = results[i];
    if (won == null) break; // a draw ends the run
    if (run === 0) run = won ? 1 : -1;
    else if (won && run > 0) run++;
    else if (!won && run < 0) run--;
    else break;
  }
  return run;
}

/* ---------- what it would take ---------- */

export type Tier = 'top4' | 'top6' | 'top10';

/**
 * Beyond this many games left there is nothing useful to say — no number of
 * wins guarantees anything with most of a season to play — and the enumeration
 * below would stop being cheap. 8 games is ~2 months out.
 */
const MAX_ENUMERATED_GAMES = 8;

/**
 * The fewest wins from the club's remaining games that **guarantee** a tier,
 * whatever else happens. Null when no number of wins can (or when it's too
 * early to enumerate).
 *
 * A club doesn't get to choose which games it wins, so a claim of "N wins is
 * enough" only holds if *every* way of winning N of them locks the tier. That's
 * what this checks: each of the 2^M ways the club's own remaining games could
 * fall is run through the conservative locks engine, with every other club still
 * free to win everything left. The answer is therefore a certainty of the same
 * kind as the ladder's 🔒 badges, not a projection.
 *
 * Draws only help: winning N and drawing the rest leaves the club better off
 * than winning N and losing the rest, so the guarantee survives them.
 */
export function winsToGuarantee(snapshot: Snapshot, teamId: number, tier: Tier): number | null {
  const mine = remainingHomeAwayGames(snapshot.games).filter(
    (g) => g.hteamid === teamId || g.ateamid === teamId
  );
  const total = mine.length;
  if (total === 0 || total > MAX_ENUMERATED_GAMES) return null;

  // works[n] stays true only while every way of winning exactly n locks the tier
  const works = new Array<boolean>(total + 1).fill(true);
  for (let mask = 0; mask < 1 << total; mask++) {
    const wins = popcount(mask);
    if (!works[wins]) continue; // this count already has a counterexample
    const locks = locksAfterOwnGames(snapshot, teamId, mine, mask);
    const safe =
      locks != null &&
      (tier === 'top4' ? locks.inTop4 : tier === 'top6' ? locks.inTop6 : locks.inTop10);
    if (!safe) works[wins] = false;
  }
  const n = works.indexOf(true);
  return n === -1 ? null : n;
}

function popcount(x: number): number {
  let n = 0;
  for (let v = x; v > 0; v >>= 1) n += v & 1;
  return n;
}

/**
 * The locks a club would hold once its own remaining games have fallen the way
 * `mask` says (bit i set = it wins `mine[i]`). Only points and remaining-game
 * counts feed the locks engine, so the hypothetical standings need nothing more.
 */
function locksAfterOwnGames(snapshot: Snapshot, teamId: number, mine: Game[], mask: number) {
  const winnerByGame = new Map<number, number>();
  const extraPts = new Map<number, number>();
  mine.forEach((g, i) => {
    const opponentId = g.hteamid === teamId ? g.ateamid : g.hteamid;
    const winner = (mask >> i) & 1 ? teamId : opponentId;
    winnerByGame.set(g.id, winner);
    extraPts.set(winner, (extraPts.get(winner) ?? 0) + 4);
  });
  const games = snapshot.games.map((g) =>
    winnerByGame.has(g.id) ? { ...g, complete: 1, winnerteamid: winnerByGame.get(g.id)! } : g
  );
  const standings: Standing[] = snapshot.standings.map((s) =>
    extraPts.has(s.id) ? { ...s, pts: s.pts + extraPts.get(s.id)! } : s
  );
  return computeLocks(standings, games).find((l) => l.teamId === teamId);
}

/* ---------- the record book ---------- */

export interface OpponentRecord {
  opponentId: number;
  wins: number;
  losses: number;
  draws: number;
}

/** A club's record against every opponent it has met in the supplied games. */
export function recordByOpponent(games: Game[], teamId: number): OpponentRecord[] {
  const table = new Map<number, OpponentRecord>();
  for (const r of clubResults(games, teamId)) {
    const row = table.get(r.opponentId) ?? {
      opponentId: r.opponentId,
      wins: 0,
      losses: 0,
      draws: 0
    };
    if (r.won == null) row.draws++;
    else if (r.won) row.wins++;
    else row.losses++;
    table.set(r.opponentId, row);
  }
  return [...table.values()].sort(
    (a, b) => winRate(b) - winRate(a) || b.wins + b.losses - (a.wins + a.losses)
  );
}

function winRate(r: OpponentRecord): number {
  const played = r.wins + r.losses + r.draws;
  return played === 0 ? 0 : (r.wins + r.draws * 0.5) / played;
}

export interface ClubBests {
  biggestWin: ClubResult | null;
  longestWinStreak: { length: number; from: Game; to: Game } | null;
}

/** The club's high-water marks across the supplied games. */
export function clubBests(games: Game[], teamId: number): ClubBests {
  const results = clubResults(games, teamId);
  let biggestWin: ClubResult | null = null;
  let longest: { length: number; from: Game; to: Game } | null = null;
  let runStart: Game | null = null;
  let run = 0;

  for (const r of results) {
    if (r.won && (biggestWin == null || r.margin > biggestWin.margin)) biggestWin = r;
    if (r.won) {
      run++;
      runStart = run === 1 ? r.game : runStart;
      if (longest == null || run > longest.length) {
        longest = { length: run, from: runStart!, to: r.game };
      }
    } else {
      run = 0;
      runStart = null;
    }
  }
  return { biggestWin, longestWinStreak: longest };
}

export interface ClubSeason {
  year: number;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  percentage: number;
  premier: boolean;
}

/** How the club finished in each season the app holds, newest first. */
export function clubSeasons(seasons: Map<number, Snapshot>, teamId: number): ClubSeason[] {
  const out: ClubSeason[] = [];
  for (const [year, snap] of seasons) {
    const ladder = sortedStandings(snap.standings);
    const idx = ladder.findIndex((s) => s.id === teamId);
    if (idx === -1) continue;
    const s = ladder[idx];
    out.push({
      year,
      rank: idx + 1,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      percentage: s.percentage,
      premier: snap.meta.premier === teamId
    });
  }
  return out.sort((a, b) => b.year - a.year);
}

/* ---------- the road to the flag ---------- */

export interface PathStep {
  match: BracketMatch;
  /** probability the club is in this match at all */
  prob: number;
}

/** Rounds in the order they're played, for laying out a club's route. */
const ROUND_ORDER: FinalsRound[] = ['WC', 'QF', 'EF', 'SF', 'PF', 'GF'];

/** A club's likeliest route through the bracket: the best candidate per round. */
export function projectedPath(
  bracket: BracketMatch[],
  teamId: number,
  minProb = 0.05
): PathStep[] {
  const steps: PathStep[] = [];
  for (const round of ROUND_ORDER) {
    const inRound = bracket
      .filter((m) => m.round === round)
      .map((m) => ({ match: m, prob: participation(m, teamId) }))
      .sort((a, b) => b.prob - a.prob);
    const best = inRound[0];
    if (best && best.prob >= minProb) steps.push(best);
  }
  return steps;
}

/** Probability the club occupies either side of a bracket match. */
function participation(match: BracketMatch, teamId: number): number {
  let p = 0;
  for (const side of [match.home, match.away]) {
    if (side.teamId === teamId) return 1;
    const candidate = side.candidates.find((c) => c.teamId === teamId);
    if (candidate) p += candidate.prob;
  }
  return Math.min(1, p);
}

/** The club's next scheduled game, if the season still has one. */
export function nextGame(games: Game[], teamId: number): Game | null {
  const upcoming = games
    .filter((g) => !g.complete && (g.hteamid === teamId || g.ateamid === teamId))
    .sort((a, b) => gameStart(a) - gameStart(b));
  return upcoming[0] ?? null;
}
