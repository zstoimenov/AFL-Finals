import type { BracketMatch, BracketSide, Snapshot, TeamLocks } from './types';
import type { SimOutput } from './simulate';
import {
  MATCH_NAMES,
  MATCH_ORDER,
  classifyFinalsGame,
  matchParticipants,
  type MatchKey
} from './bracket';
import { finalsGames, sortedStandings } from './ladder';
import { computeRatings, squiggleProb, winProb } from './predict';

const PLACEHOLDERS: Partial<Record<MatchKey, { home?: string; away?: string }>> = {
  EF1: { away: 'Wildcard winner (lower seed)' },
  EF2: { away: 'Wildcard winner (higher seed)' },
  SF1: { home: 'Loser QF1', away: 'Winner EF1' },
  SF2: { home: 'Loser QF2', away: 'Winner EF2' },
  PF1: { home: 'Winner QF1', away: 'Winner SF2' },
  PF2: { home: 'Winner QF2', away: 'Winner SF1' },
  GF: { home: 'Winner PF1', away: 'Winner PF2' }
};

/**
 * Assemble the full 2026 bracket for display: projected from the current
 * ladder during the home & away season, filled with real fixtures/results
 * once finals begin. Undecided slots carry the simulation's most likely
 * occupants; decided/immovable slots are flagged locked.
 */
export function buildBracket(
  snapshot: Snapshot,
  sim: SimOutput | null,
  locks: TeamLocks[]
): BracketMatch[] {
  const ladder = sortedStandings(snapshot.standings);
  const seeds = ladder.slice(0, 10).map((s) => s.id);
  const ratings = computeRatings(snapshot.standings, snapshot.games);
  const lockByTeam = new Map(locks.map((l) => [l.teamId, l]));
  const finalsStarted = finalsGames(snapshot.games).length > 0;

  // fold real finals results into bracket slots, week by week
  const results: Partial<Record<MatchKey, number>> = {};
  const gameFor = new Map<MatchKey, (typeof snapshot.games)[number]>();
  const realFinals = [...finalsGames(snapshot.games)].sort((a, b) => a.is_final - b.is_final);
  for (const g of realFinals) {
    const key = classifyFinalsGame(g, seeds, results);
    if (key == null || gameFor.has(key)) continue;
    gameFor.set(key, g);
    if (g.complete && g.winnerteamid != null) results[key] = g.winnerteamid;
  }

  const seedOf = new Map(seeds.map((id, i) => [id, i + 1]));

  return MATCH_ORDER.map((key) => {
    const { home, away } = matchParticipants(key, seeds, results);
    const game = gameFor.get(key) ?? null;

    const side = (teamId: number | null, which: 'home' | 'away'): BracketSide => {
      const candidates = sim
        ? Object.entries(sim.slotOccupancy[`${key}:${which}`] ?? {})
            .map(([id, prob]) => ({ teamId: Number(id), prob }))
            .sort((a, b) => b.prob - a.prob)
            .slice(0, 3)
        : [];
      return {
        teamId,
        seed: teamId != null ? (seedOf.get(teamId) ?? null) : null,
        placeholder: teamId == null ? (PLACEHOLDERS[key]?.[which] ?? 'TBD') : null,
        candidates
      };
    };

    const bothKnown = home != null && away != null;
    const decided = results[key] != null;
    // a slot is locked when its participants can no longer change: once finals
    // have begun the ladder is final so any known matchup is fixed; before
    // that, both teams must be mathematically locked to their ladder spots
    const locked =
      bothKnown &&
      (finalsStarted
        ? true
        : (lockByTeam.get(home)?.lockedExact ?? false) &&
          (lockByTeam.get(away)?.lockedExact ?? false));

    return {
      key,
      round: key.startsWith('WC')
        ? 'WC'
        : key.startsWith('QF')
          ? 'QF'
          : key.startsWith('EF')
            ? 'EF'
            : key.startsWith('SF')
              ? 'SF'
              : key.startsWith('PF')
                ? 'PF'
                : 'GF',
      name: MATCH_NAMES[key],
      home: side(home, 'home'),
      away: side(away, 'away'),
      game,
      homeWinProb: bothKnown && !decided ? winProb(ratings, home, away, key === 'GF') : null,
      squiggleHomeProb: bothKnown && !decided ? squiggleProb(snapshot, home, away) : null,
      winnerTeamId: results[key] ?? null,
      locked
    } satisfies BracketMatch;
  });
}
