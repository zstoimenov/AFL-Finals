import type { EvalResult } from './backtest';
import { evaluate, enrichedModel, type PreGameModel } from './backtest';
import { squiggleConsensusProb } from './predict';
import { completedGames, gameStart } from './features';
import { finalsGames } from './ladder';
import type { Game, Snapshot } from './types';

/**
 * A season's two tipsters graded head to head, the same hindsight-free way the
 * per-game verdicts are: the in-app model on its pre-kickoff rating, Squiggle on
 * its stored consensus. Powers the hub's per-season accuracy scorecard.
 */
export interface SeasonAccuracy {
  model: EvalResult;
  squiggle: EvalResult;
}

export function seasonAccuracy(snap: Snapshot): SeasonAccuracy {
  const model = evaluate(snap.games, enrichedModel);
  // Squiggle-only model: read the season's stored consensus for each game; an
  // untipped game falls back to 0.5 (no opinion), matching how a coin-flip scores.
  const squiggleModel: PreGameModel = (_prior, game) => {
    const snapLike = { games: [], standings: [], tips: snap.tips } as unknown as Snapshot;
    return squiggleConsensusProb(snapLike, game.hteamid, game.ateamid) ?? 0.5;
  };
  const squiggle = evaluate(snap.games, squiggleModel);
  return { model, squiggle };
}

/** A single completed meeting between two clubs, newest first. */
export interface Meeting {
  game: Game;
  homeId: number;
  awayId: number;
  winnerId: number | null;
}

/**
 * Every completed meeting between two clubs across the supplied games (pass the
 * cross-season corpus plus the live season for a full archive), newest first,
 * with the aggregate record from `aId`'s perspective.
 */
export function headToHeadRecord(
  games: Game[],
  aId: number,
  bId: number
): { meetings: Meeting[]; aWins: number; bWins: number; draws: number } {
  const meetings = completedGames(games)
    .filter(
      (g) =>
        (g.hteamid === aId && g.ateamid === bId) || (g.hteamid === bId && g.ateamid === aId)
    )
    .sort((x, y) => gameStart(y) - gameStart(x))
    .map((g) => ({
      game: g,
      homeId: g.hteamid,
      awayId: g.ateamid,
      winnerId: g.winnerteamid ?? (g.hscore === g.ascore ? null : g.hscore! > g.ascore! ? g.hteamid : g.ateamid)
    }));
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  for (const m of meetings) {
    if (m.winnerId == null) draws++;
    else if (m.winnerId === aId) aWins++;
    else bWins++;
  }
  return { meetings, aWins, bWins, draws };
}

/** The finals games of a season, oldest→newest, for a results view. */
export function seasonFinals(games: Game[]): Game[] {
  return finalsGames(games)
    .filter((g) => g.complete)
    .sort((a, b) => a.is_final - b.is_final || gameStart(a) - gameStart(b));
}
