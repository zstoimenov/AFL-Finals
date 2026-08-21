import type { Game, Snapshot, Standing } from './types';
import type { ClubResult } from './club';
import type { InterestReason } from './interest';
import type { Meeting } from './seasonStats';
import { recentResults } from './club';
import { completedGames, gameStart } from './features';
import { rateGames } from './interest';
import { sortedStandings } from './ladder';
import {
  blendedHomeProb,
  computeRatings,
  preGameHomeProb,
  squiggleConsensusProb,
  squiggleMargin
} from './predict';
import { headToHeadRecord } from './seasonStats';
import { homeVenuesByTeam, isAwayTravelling, isHostAtHome } from './venues';

/**
 * Everything the app knows about one game, gathered in one place.
 *
 * The cards can only ever show a slice — a percentage and a venue — while the
 * app has already computed the rest: why the game is worth watching, how these
 * two clubs have gone against each other, what form each brings, whether the
 * visitor is travelling. Rather than have the sheet reach into six modules and
 * re-derive it (and risk doing it with hindsight), it is assembled here once,
 * as plain data.
 */

/** One club's side of a game. */
export interface GameSideDetail {
  teamId: number;
  /** true for the nominal host */
  home: boolean;
  /** ladder position at the time of the snapshot, when the club is on it */
  rank: number | null;
  pts: number | null;
  /** the club's last few results, newest first */
  form: ClubResult[];
  /** playing at a ground it has never hosted at — the interstate/away effect */
  travelling: boolean;
}

export interface GameDetail {
  game: Game;
  home: GameSideDetail;
  away: GameSideDetail;
  /** the app's P(home wins): pre-kickoff for a played game, live for one to come */
  modelHomeProb: number;
  /** Squiggle's consensus P(home wins), and its predicted margin, when tipped */
  squiggleHomeProb: number | null;
  squiggleMargin: number | null;
  /** the interest engine's case for watching — upcoming games only */
  reasons: InterestReason[];
  /** previous meetings between these clubs, newest first (this game excluded) */
  meetings: Meeting[];
  record: { homeWins: number; awayWins: number; draws: number };
  /** the nominal host is not at one of its own grounds */
  neutralHost: boolean;
  complete: boolean;
}

/** How many recent results each side brings to the sheet. */
const FORM_GAMES = 4;
/** How many past meetings are worth listing before it stops being context. */
const MEETINGS_SHOWN = 6;

/**
 * Assemble a game's detail. `history` is the cross-season corpus; only earlier
 * seasons feed the model, and a completed game is scored on `preGameHomeProb` so
 * a result never leaks into its own forecast.
 */
export function buildGameDetail(
  snapshot: Snapshot,
  game: Game,
  history: Game[] = []
): GameDetail {
  const priorHistory = history.filter((g) => g.year < snapshot.meta.year);
  const complete = Boolean(game.complete);

  const modelHomeProb = complete
    ? preGameHomeProb(snapshot, game, history)
    : blendedHomeProb(
        snapshot,
        computeRatings(snapshot.standings, snapshot.games, { history: priorHistory }),
        snapshot.games,
        game
      );

  // the interest engine only reasons about games still to be played; a finished
  // game's "what this would settle" has already been settled
  const reasons = complete
    ? []
    : (rateGames(snapshot, [game], { history, stakes: game.is_final === 0 })[0]?.reasons ?? []);

  // every meeting the archive holds, minus this fixture itself
  const corpus = [...history, ...completedGames(snapshot.games)];
  const h2h = headToHeadRecord(corpus, game.hteamid, game.ateamid);
  const meetings = h2h.meetings.filter((m) => m.game.id !== game.id).slice(0, MEETINGS_SHOWN);

  const ladder = sortedStandings(snapshot.standings);
  const homeVenues = homeVenuesByTeam([...priorHistory, ...snapshot.games]);
  // form is the club's shape going in, so a played game must not count itself
  const before = complete
    ? snapshot.games.filter((g) => gameStart(g) < gameStart(game))
    : snapshot.games;

  const side = (teamId: number, isHome: boolean): GameSideDetail => {
    const row = ladder.find((s: Standing) => s.id === teamId);
    return {
      teamId,
      home: isHome,
      rank: row ? ladder.indexOf(row) + 1 : null,
      pts: row?.pts ?? null,
      form: recentResults(before, teamId, FORM_GAMES),
      travelling: !isHome && isAwayTravelling(homeVenues, game)
    };
  };

  return {
    game,
    home: side(game.hteamid, true),
    away: side(game.ateamid, false),
    modelHomeProb,
    squiggleHomeProb: squiggleConsensusProb(snapshot, game.hteamid, game.ateamid),
    squiggleMargin: squiggleMargin(snapshot, game.hteamid, game.ateamid),
    reasons,
    meetings,
    record: {
      homeWins: h2h.aWins,
      awayWins: h2h.bWins,
      draws: h2h.draws
    },
    neutralHost: !isHostAtHome(homeVenues, game),
    complete
  };
}

/** Find a game by id across the live snapshot — the game a route names. */
export function findGame(games: Game[], id: number | null): Game | null {
  if (id == null) return null;
  return games.find((g) => g.id === id) ?? null;
}
