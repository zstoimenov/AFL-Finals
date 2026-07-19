import type { Game } from './types';

/**
 * The 2026 AFL finals: five weeks, ten teams.
 *
 *  Week 1  Wildcard Round   WC1: 7 v 10        WC2: 8 v 9      (sudden death, top 6 bye)
 *          Re-seeding: the higher-ranked wildcard winner takes the 7th seed,
 *          the other takes 8th.
 *  Week 2  Qualifying/Elim  QF1: 1 v 4   QF2: 2 v 3   (double chance)
 *                           EF1: 5 v re-seeded 8   EF2: 6 v re-seeded 7
 *  Week 3  Semi Finals      SF1: loser QF1 v winner EF1
 *                           SF2: loser QF2 v winner EF2
 *  Week 4  Preliminary      PF1: winner QF1 v winner SF2
 *                           PF2: winner QF2 v winner SF1
 *  Week 5  Grand Final      winners of PFs, MCG (neutral)
 */

export const FINALS_WEEKS: Record<string, number> = {
  WC1: 1, WC2: 1, QF1: 2, QF2: 2, EF1: 2, EF2: 2, SF1: 3, SF2: 3, PF1: 4, PF2: 4, GF: 5
};

export const MATCH_NAMES: Record<string, string> = {
  WC1: 'Wildcard 1',
  WC2: 'Wildcard 2',
  QF1: 'Qualifying Final 1',
  QF2: 'Qualifying Final 2',
  EF1: 'Elimination Final 1',
  EF2: 'Elimination Final 2',
  SF1: 'Semi Final 1',
  SF2: 'Semi Final 2',
  PF1: 'Preliminary Final 1',
  PF2: 'Preliminary Final 2',
  GF: 'Grand Final'
};

export const MATCH_ORDER = [
  'WC1', 'WC2', 'QF1', 'QF2', 'EF1', 'EF2', 'SF1', 'SF2', 'PF1', 'PF2', 'GF'
] as const;
export type MatchKey = (typeof MATCH_ORDER)[number];

/**
 * Re-seed the two wildcard winners: better original seed → 7, other → 8.
 * `seedOf` maps teamId → original ladder seed (1-based).
 */
export function reseedWildcardWinners(
  winnerWc1: number,
  winnerWc2: number,
  seedOf: Map<number, number>
): { seed7: number; seed8: number } {
  const s1 = seedOf.get(winnerWc1) ?? 99;
  const s2 = seedOf.get(winnerWc2) ?? 99;
  return s1 < s2
    ? { seed7: winnerWc1, seed8: winnerWc2 }
    : { seed7: winnerWc2, seed8: winnerWc1 };
}

/**
 * Resolve the home/away team ids of a finals match given the ten seeds and
 * winners/losers known so far. Returns nulls where a participant is undecided.
 * `seeds` is the final ladder order, seeds[0] = 1st. `results` maps match key
 * to winning team id for decided matches.
 */
export function matchParticipants(
  key: MatchKey,
  seeds: number[],
  results: Partial<Record<MatchKey, number>>
): { home: number | null; away: number | null } {
  const seedOf = new Map(seeds.map((id, i) => [id, i + 1]));
  const loserOf = (k: MatchKey): number | null => {
    const w = results[k];
    if (w == null) return null;
    const p = matchParticipants(k, seeds, results);
    if (p.home == null || p.away == null) return null;
    return w === p.home ? p.away : p.home;
  };

  const reseeded = (): { seed7: number | null; seed8: number | null } => {
    const w1 = results.WC1;
    const w2 = results.WC2;
    if (w1 == null || w2 == null) return { seed7: null, seed8: null };
    return reseedWildcardWinners(w1, w2, seedOf);
  };

  switch (key) {
    case 'WC1':
      return { home: seeds[6] ?? null, away: seeds[9] ?? null };
    case 'WC2':
      return { home: seeds[7] ?? null, away: seeds[8] ?? null };
    case 'QF1':
      return { home: seeds[0] ?? null, away: seeds[3] ?? null };
    case 'QF2':
      return { home: seeds[1] ?? null, away: seeds[2] ?? null };
    case 'EF1':
      return { home: seeds[4] ?? null, away: reseeded().seed8 };
    case 'EF2':
      return { home: seeds[5] ?? null, away: reseeded().seed7 };
    case 'SF1':
      return { home: loserOf('QF1'), away: results.EF1 ?? null };
    case 'SF2':
      return { home: loserOf('QF2'), away: results.EF2 ?? null };
    case 'PF1':
      return { home: results.QF1 ?? null, away: results.SF2 ?? null };
    case 'PF2':
      return { home: results.QF2 ?? null, away: results.SF1 ?? null };
    case 'GF':
      return { home: results.PF1 ?? null, away: results.PF2 ?? null };
  }
}

/**
 * Identify which bracket slot a real finals game belongs to, by finals week
 * and participants. `week` is 1..5 as in FINALS_WEEKS.
 */
export function classifyFinalsGame(
  game: Game,
  seeds: number[],
  results: Partial<Record<MatchKey, number>>
): MatchKey | null {
  const week = game.is_final;
  const keys = MATCH_ORDER.filter((k) => FINALS_WEEKS[k] === week);
  for (const key of keys) {
    const p = matchParticipants(key, seeds, results);
    const ids = [game.hteamid, game.ateamid];
    if (p.home != null && p.away != null) {
      if (ids.includes(p.home) && ids.includes(p.away)) return key;
    } else if (p.home != null || p.away != null) {
      const known = p.home ?? p.away!;
      if (ids.includes(known)) return key;
    }
  }
  // fall back: first slot of that week without a matched game
  return keys[0] ?? null;
}
