import type { SimResult, Snapshot } from './types';
import { remainingHomeAwayGames, sortedStandings, finalsGames } from './ladder';
import { computeRatings, winProb, fixtureAdjustment } from './predict';
import { MATCH_ORDER, matchParticipants, type MatchKey } from './bracket';

/** Deterministic RNG (mulberry32) so simulations are reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimOutput extends SimResult {
  /** P(team occupies the given slot), keyed "QF1:home" etc. */
  slotOccupancy: Record<string, Record<number, number>>;
  /** P(home side wins) per bracket match, over iterations where the matchup occurred */
  matchHomeWin: Record<string, number>;
}

/**
 * Monte Carlo projection: simulate the remaining home & away games, build the
 * final ladder, then play out the 2026 ten-team finals (wildcards, re-seeding,
 * double-chance weeks) — thousands of times. Completed real games (H&A and
 * finals) always use their actual result.
 */
export function simulateSeason(snapshot: Snapshot, iterations = 10000, seed = 20260919): SimOutput {
  const rng = makeRng(seed);
  const ratings = computeRatings(snapshot.standings, snapshot.games);
  const remaining = remainingHomeAwayGames(snapshot.games);
  const base = sortedStandings(snapshot.standings);

  // Per-fixture context (travel, head-to-head, rest) depends only on the fixture
  // and prior results, so compute each once here rather than 10k times in-loop.
  const context = new Map<number, number>();
  for (const g of remaining) context.set(g.id, fixtureAdjustment(snapshot.games, g));

  // actual finals results, keyed by unordered pair "loId-hiId"
  const realFinals = new Map<string, number>();
  for (const g of finalsGames(snapshot.games)) {
    if (g.complete && g.winnerteamid != null) {
      realFinals.set(pairKey(g.hteamid, g.ateamid), g.winnerteamid);
    }
  }

  const teamIds = base.map((s) => s.id);
  const tally: SimResult['teams'] = {};
  for (const id of teamIds) {
    tally[id] = { makeFinals: 0, top6: 0, top4: 0, top2: 0, reachGF: 0, premier: 0 };
  }
  const slotCount: Record<string, Record<number, number>> = {};
  const matchHomeWins: Record<string, number> = {};
  const matchOccurrences: Record<string, number> = {};

  for (let it = 0; it < iterations; it++) {
    // 1. simulate remaining H&A games
    const pts = new Map(base.map((s) => [s.id, s.pts]));
    const pct = new Map(base.map((s) => [s.id, s.percentage]));
    for (const g of remaining) {
      const p = winProb(ratings, g.hteamid, g.ateamid, false, context.get(g.id) ?? 0);
      const homeWins = rng() < p;
      const winner = homeWins ? g.hteamid : g.ateamid;
      pts.set(winner, (pts.get(winner) ?? 0) + 4);
      // small random percentage drift so points ties don't always break the same way
      const drift = (rng() - 0.5) * 6;
      pct.set(g.hteamid, (pct.get(g.hteamid) ?? 100) + (homeWins ? drift : -drift));
      pct.set(g.ateamid, (pct.get(g.ateamid) ?? 100) + (homeWins ? -drift : drift));
    }

    // 2. final ladder
    const ladder = [...teamIds].sort(
      (a, b) => pts.get(b)! - pts.get(a)! || pct.get(b)! - pct.get(a)! || a - b
    );
    const seeds = ladder.slice(0, 10);
    for (let i = 0; i < ladder.length; i++) {
      const t = tally[ladder[i]];
      if (i < 10) t.makeFinals++;
      if (i < 6) t.top6++;
      if (i < 4) t.top4++;
      if (i < 2) t.top2++;
    }

    // 3. play finals
    const results: Partial<Record<MatchKey, number>> = {};
    for (const key of MATCH_ORDER) {
      const { home, away } = matchParticipants(key, seeds, results);
      if (home == null || away == null) continue; // shouldn't happen with full seeds
      bump(slotCount, `${key}:home`, home);
      bump(slotCount, `${key}:away`, away);
      const real = realFinals.get(pairKey(home, away));
      let winner: number;
      if (real != null) {
        winner = real;
      } else {
        const p = winProb(ratings, home, away, key === 'GF');
        winner = rng() < p ? home : away;
      }
      results[key] = winner;
      matchOccurrences[key] = (matchOccurrences[key] ?? 0) + 1;
      if (winner === home) matchHomeWins[key] = (matchHomeWins[key] ?? 0) + 1;
    }
    const premier = results.GF;
    if (premier != null) {
      tally[premier].premier++;
      const gf = matchParticipants('GF', seeds, results);
      if (gf.home != null) tally[gf.home].reachGF++;
      if (gf.away != null && gf.away !== gf.home) tally[gf.away].reachGF++;
    }
  }

  // normalise
  const teams: SimResult['teams'] = {};
  for (const id of teamIds) {
    const t = tally[id];
    teams[id] = {
      makeFinals: t.makeFinals / iterations,
      top6: t.top6 / iterations,
      top4: t.top4 / iterations,
      top2: t.top2 / iterations,
      reachGF: t.reachGF / iterations,
      premier: t.premier / iterations
    };
  }
  const slotOccupancy: Record<string, Record<number, number>> = {};
  for (const [slot, counts] of Object.entries(slotCount)) {
    slotOccupancy[slot] = {};
    for (const [id, n] of Object.entries(counts)) {
      slotOccupancy[slot][Number(id)] = n / iterations;
    }
  }
  const matchHomeWin: Record<string, number> = {};
  for (const [key, n] of Object.entries(matchHomeWins)) {
    matchHomeWin[key] = n / (matchOccurrences[key] ?? 1);
  }
  return { iterations, teams, slotOccupancy, matchHomeWin };
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function bump(store: Record<string, Record<number, number>>, slot: string, teamId: number) {
  (store[slot] ??= {})[teamId] = (store[slot][teamId] ?? 0) + 1;
}
