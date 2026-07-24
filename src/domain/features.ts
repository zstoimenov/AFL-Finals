import type { Game } from './types';

/**
 * Predictive features mined from the game history we already fetch (scores,
 * dates, venues) — the signal the original three-term rating throws away. Every
 * function takes an explicit `games` array so callers can pass only games before
 * a kickoff and keep predictions hindsight-free (see `predict.ts`).
 */

/** Kickoff instant (epoch seconds) — unixtime when present, else parsed date. */
export function gameStart(g: Game): number {
  if (g.unixtime && g.unixtime > 0) return g.unixtime;
  const t = Date.parse((g.date ?? '').replace(' ', 'T'));
  return Number.isNaN(t) ? 0 : Math.round(t / 1000);
}

/** Completed games with both scores, sorted oldest→newest by kickoff. */
export function completedGames(games: Game[]): Game[] {
  return games
    .filter((g) => g.complete && g.hscore != null && g.ascore != null)
    .sort((a, b) => gameStart(a) - gameStart(b));
}

/** Average points a single scoring shot (goal or behind) is worth. */
export const POINTS_PER_SHOT = 3.5;
/**
 * How much the strength rating leans on scoring-shot margin versus final-score
 * margin, when the goal/behind breakdown is available. Goal-kicking accuracy is
 * noisy and regresses, so scoring shots track underlying strength more steadily
 * than the final score. 0 = pure score margin (the behaviour on snapshots that
 * predate the goals/behinds fields). A multi-season backtest should confirm/tune
 * this once fetched data carries the breakdown.
 */
export const SHOT_WEIGHT = 0.4;

function hasShots(g: Game): boolean {
  return g.hgoals != null && g.hbehinds != null && g.agoals != null && g.abehinds != null;
}

/**
 * Home-perspective margin used by the rating: blends the final-score margin with
 * a scoring-shot expected margin when the breakdown is present, else falls back
 * to the plain score margin so older snapshots behave exactly as before.
 */
export function effectiveMargin(g: Game): number {
  const scoreMargin = g.hscore! - g.ascore!;
  if (!hasShots(g)) return scoreMargin;
  const homeShots = g.hgoals! + g.hbehinds!;
  const awayShots = g.agoals! + g.abehinds!;
  const shotMargin = (homeShots - awayShots) * POINTS_PER_SHOT;
  return (1 - SHOT_WEIGHT) * scoreMargin + SHOT_WEIGHT * shotMargin;
}

const DAY = 86400;
/** Recency weight: a game `ageDays` old counts 2^(-ageDays/halfLife). */
function recencyWeight(refStart: number, gameStartSec: number, halfLifeDays: number): number {
  const ageDays = Math.max(0, (refStart - gameStartSec) / DAY);
  return Math.pow(2, -ageDays / halfLifeDays);
}

/** Average home-margin baseline (points) across the supplied completed games. */
export function homeMarginBaseline(games: Game[]): number {
  const done = completedGames(games);
  if (done.length === 0) return 0;
  let sum = 0;
  for (const g of done) sum += effectiveMargin(g);
  return sum / done.length;
}

/**
 * Opponent-adjusted, recency-weighted expected margin per team (points vs an
 * average side on a neutral ground). A couple of averaging passes fold in
 * strength of schedule: beating strong teams counts for more than beating weak
 * ones. Home-ground margin is removed so the rating reflects true team quality.
 */
export function opponentAdjustedMargins(
  games: Game[],
  opts: { halfLifeDays?: number; passes?: number } = {}
): Map<number, number> {
  const halfLife = opts.halfLifeDays ?? 45;
  const passes = opts.passes ?? 2;
  const done = completedGames(games);
  const strength = new Map<number, number>();
  if (done.length === 0) return strength;

  const ref = gameStart(done[done.length - 1]);
  const homeAdv = homeMarginBaseline(done);
  const weighted = done.map((g) => ({ g, w: recencyWeight(ref, gameStart(g), halfLife) }));

  for (let pass = 0; pass < passes; pass++) {
    const acc = new Map<number, { sum: number; w: number }>();
    const add = (team: number, val: number, w: number) => {
      const e = acc.get(team) ?? { sum: 0, w: 0 };
      e.sum += w * val;
      e.w += w;
      acc.set(team, e);
    };
    for (const { g, w } of weighted) {
      const hm = effectiveMargin(g); // home margin (scoring-shot aware)
      const sh = strength.get(g.hteamid) ?? 0;
      const sa = strength.get(g.ateamid) ?? 0;
      // Home team's neutral-ground performance vs this opponent's strength.
      add(g.hteamid, hm - homeAdv + sa, w);
      add(g.ateamid, -hm + homeAdv + sh, w);
    }
    for (const [team, e] of acc) strength.set(team, e.w > 0 ? e.sum / e.w : 0);
  }
  return strength;
}

/**
 * Recency- and margin-weighted form in [0,1]: recent games and clear wins move it
 * most. 0.5 = no completed games / perfectly even. Replaces the flat last-5 win
 * rate with something that fades early-season results and rewards big wins.
 */
export function recencyForm(
  games: Game[],
  teamId: number,
  opts: { halfLifeDays?: number } = {}
): number {
  const halfLife = opts.halfLifeDays ?? 30;
  const done = completedGames(games).filter(
    (g) => g.hteamid === teamId || g.ateamid === teamId
  );
  if (done.length === 0) return 0.5;
  const ref = gameStart(done[done.length - 1]);
  let num = 0;
  let den = 0;
  for (const g of done) {
    const w = recencyWeight(ref, gameStart(g), halfLife);
    const margin = g.hteamid === teamId ? g.hscore! - g.ascore! : g.ascore! - g.hscore!;
    // squash margin to (0,1): a ~4-goal (24pt) win ≈ 0.75, a blowout → ~1.
    const outcome = 1 / (1 + Math.exp(-margin / 30));
    num += w * outcome;
    den += w;
  }
  return den > 0 ? num / den : 0.5;
}

/**
 * Head-to-head signal between two teams, from the perspective of `homeId`, in
 * roughly [-1, 1]: positive means `homeId` has recently had the wood on `awayId`
 * beyond what the ladder implies. Recency-weighted average of past-meeting
 * margins, squashed. 0 when they haven't met in the supplied history.
 */
export function headToHead(
  games: Game[],
  homeId: number,
  awayId: number,
  opts: { halfLifeDays?: number } = {}
): number {
  const halfLife = opts.halfLifeDays ?? 400; // H2H persists across seasons
  const meetings = completedGames(games).filter(
    (g) =>
      (g.hteamid === homeId && g.ateamid === awayId) ||
      (g.hteamid === awayId && g.ateamid === homeId)
  );
  if (meetings.length === 0) return 0;
  const ref = gameStart(meetings[meetings.length - 1]);
  let num = 0;
  let den = 0;
  for (const g of meetings) {
    const w = recencyWeight(ref, gameStart(g), halfLife);
    const marginForHome = g.hteamid === homeId ? g.hscore! - g.ascore! : g.ascore! - g.hscore!;
    num += w * Math.tanh(marginForHome / 40);
    den += w;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Days of rest a team has had before `beforeStart` (epoch secs), from its most
 * recent completed game. Returns null when no prior game is known. Capped at 21
 * so a bye/long layoff doesn't dominate.
 */
export function restDays(games: Game[], teamId: number, beforeStart: number): number | null {
  const prior = completedGames(games).filter(
    (g) => (g.hteamid === teamId || g.ateamid === teamId) && gameStart(g) < beforeStart
  );
  if (prior.length === 0) return null;
  const last = gameStart(prior[prior.length - 1]);
  return Math.min(21, (beforeStart - last) / DAY);
}
