import type { BracketMatch, Game, Snapshot } from './types';
import type { ClubResult } from './club';
import type { Meeting } from './seasonStats';
import { currentStreak, recentResults } from './club';
import { completedGames, gameStart } from './features';
import { sortedStandings } from './ladder';
import { headToHeadRecord } from './seasonStats';
import { homeVenuesByTeam, isAwayTravelling } from './venues';

/**
 * The context behind a finals match.
 *
 * A bracket slot on its own is two crests and a percentage, which is the least
 * the app knows about the biggest games of the year: it already holds every
 * meeting these two clubs have played, the shape each brings in, where they
 * finished and whether the visitor is flying. The Finals screen showed none of
 * it because a bracket match is not always a fixture — half of them are still
 * projections with no `Game` to hang a sheet off — so the game sheet's
 * assembler (`gameDetail`) can't be used. This is the same idea addressed at a
 * slot rather than a fixture: give it the two clubs and it answers, whether or
 * not the fixture exists yet.
 *
 * Everything here is context, not prediction, but the no-hindsight rule still
 * applies to a final already played: its own result is never part of the form
 * or the record that precedes it, so a completed final reads the way it read on
 * the morning of the game.
 */

/** How many recent results a finals card carries per club. */
export const FORM_GAMES = 5;
/** How many previous meetings are worth listing before it stops being context. */
export const MEETINGS_SHOWN = 3;

/** One club's shape going into a final. */
export interface FinalsSide {
  teamId: number;
  /** ladder position at the end of the home & away season, when on the ladder */
  rank: number | null;
  /** the club's last results, newest first, from before this match */
  form: ClubResult[];
  /** positive = consecutive wins, negative = losses, 0 = drew or none played */
  streak: number;
  /** playing at a ground the club has never hosted at — the travel effect */
  travelling: boolean;
}

/** Everything the Finals screen can say about one bracket slot. */
export interface FinalsContext {
  /** bracket match key, e.g. "QF1" */
  key: string;
  home: FinalsSide | null;
  away: FinalsSide | null;
  /** head-to-head from the home side's perspective, across every season held */
  record: { homeWins: number; awayWins: number; draws: number } | null;
  /** previous meetings, newest first, this match excluded */
  meetings: Meeting[];
  /** how many of those meetings were finals — the history that carries weight */
  finalsMeetings: number;
}

/**
 * Build the context for one bracket match. `history` is the cross-season
 * corpus; it is combined with the live season so a head-to-head record spans
 * every season the archive holds rather than restarting each March.
 */
export function buildFinalsContext(
  snapshot: Snapshot,
  match: BracketMatch,
  history: Game[] = []
): FinalsContext {
  const homeId = match.home.teamId;
  const awayId = match.away.teamId;
  // A played final must not inform the form line that led into it. An unplayed
  // one has no cutoff to apply: everything completed is "before".
  const cutoff = match.game?.complete ? gameStart(match.game) : Infinity;
  const before = snapshot.games.filter((g) => gameStart(g) < cutoff);
  const corpus = [...history, ...completedGames(before)];

  const ladder = sortedStandings(snapshot.standings);
  const homeVenues = homeVenuesByTeam([
    ...history.filter((g) => g.year < snapshot.meta.year),
    ...snapshot.games
  ]);

  const side = (teamId: number | null, isHome: boolean): FinalsSide | null => {
    if (teamId == null) return null;
    const rank = ladder.findIndex((s) => s.id === teamId);
    return {
      teamId,
      rank: rank >= 0 ? rank + 1 : null,
      form: recentResults(before, teamId, FORM_GAMES),
      streak: currentStreak(before, teamId),
      // the Grand Final is neutral ground for both, so nobody is "travelling"
      travelling:
        !isHome &&
        match.game != null &&
        match.key !== 'GF' &&
        isAwayTravelling(homeVenues, match.game)
    };
  };

  if (homeId == null || awayId == null) {
    return {
      key: match.key,
      home: side(homeId, true),
      away: side(awayId, false),
      record: null,
      meetings: [],
      finalsMeetings: 0
    };
  }

  const h2h = headToHeadRecord(corpus, homeId, awayId);
  const meetings = h2h.meetings.filter((m) => m.game.id !== match.game?.id);

  return {
    key: match.key,
    home: side(homeId, true),
    away: side(awayId, false),
    record: { homeWins: h2h.aWins, awayWins: h2h.bWins, draws: h2h.draws },
    meetings: meetings.slice(0, MEETINGS_SHOWN),
    finalsMeetings: meetings.filter((m) => m.game.is_final > 0).length
  };
}

/** Context for every slot in the bracket, keyed by match key. */
export function buildFinalsContexts(
  snapshot: Snapshot,
  bracket: BracketMatch[],
  history: Game[] = []
): Map<string, FinalsContext> {
  return new Map(
    bracket.map((m) => [m.key, buildFinalsContext(snapshot, m, history)])
  );
}

/**
 * The next final actually scheduled: the earliest kickoff among matches with a
 * fixture that hasn't been played. Null before the fixtures exist (the bracket
 * is still a projection) and once the Grand Final is done — the two states the
 * screen has other things to say about.
 */
export function nextFinal(bracket: BracketMatch[]): BracketMatch | null {
  const scheduled = bracket.filter((m) => m.game != null && !m.game.complete);
  if (scheduled.length === 0) return null;
  return scheduled.reduce((soonest, m) =>
    gameStart(m.game!) < gameStart(soonest.game!) ? m : soonest
  );
}

/**
 * How the finals series stands: which week is live, how many matches are still
 * to be played, and the premier once there is one. The Finals screen leads with
 * this so arriving mid-series tells you where the series is up to before you
 * read a single bracket card.
 */
export interface FinalsProgress {
  started: boolean;
  played: number;
  remaining: number;
  premier: number | null;
}

export function finalsProgress(bracket: BracketMatch[]): FinalsProgress {
  const played = bracket.filter((m) => m.winnerTeamId != null).length;
  const premier = bracket.find((m) => m.key === 'GF')?.winnerTeamId ?? null;
  return {
    started: bracket.some((m) => m.game != null),
    played,
    remaining: bracket.length - played,
    premier
  };
}
