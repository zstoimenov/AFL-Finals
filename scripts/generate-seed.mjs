#!/usr/bin/env node
/**
 * Generates a placeholder LIVE season (2026) into public/data/. Used only until
 * the update-data workflow pulls real Squiggle data — output is marked
 * meta.source = "seed" and the UI shows a banner for it. Deterministic: seeded
 * RNG, same output every run.
 *
 * It deliberately does NOT seed any past seasons. Fake history would give the
 * multi-season model and hub inaccurate games; the archive stays empty until the
 * Update AFL history workflow (scripts/fetch-history.mjs) fetches real seasons.
 * We only write empty archive placeholders so the hub renders its empty state.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const YEAR = 2026;
const TOTAL_ROUNDS = 24;
const CURRENT_ROUND = 18; // completed rounds

// Squiggle team ids 1..18 (alphabetical) with a hidden "true strength" used
// to make seed results plausible.
const STRENGTH = {
  1: 0.6, 2: 1.4, 3: 0.2, 4: 1.1, 5: -0.3, 6: 0.7, 7: 1.2, 8: 0.9, 9: 0.8,
  10: 1.3, 11: -0.2, 12: -1.2, 13: 0.1, 14: -0.9, 15: -0.5, 16: 0.5,
  17: -1.4, 18: 0.4
};

let rngState = 20260719;
function rng() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Break a total score into a plausible goals/behinds pair (6*goals + behinds). */
function splitScore(score) {
  const behinds = Math.min(score, 6 + Math.floor(rng() * 9)); // ~6..14 behinds
  const goals = Math.max(0, Math.round((score - behinds) / 6));
  return [goals, score - goals * 6];
}

// circle-method round robin for 18 teams: 17 rounds, then repeat with venues flipped
const ids = Object.keys(STRENGTH).map(Number);
function roundRobin(teams) {
  const n = teams.length;
  const rounds = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      games.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}
const rr = roundRobin(ids);
const schedule = [];
for (let round = 1; round <= TOTAL_ROUNDS; round++) {
  const src = rr[(round - 1) % rr.length];
  const flip = round > rr.length;
  schedule.push(src.map(([h, a]) => (flip ? [a, h] : [h, a])));
}

const VENUES = ['MCG', 'Marvel Stadium', 'Adelaide Oval', 'Optus Stadium', 'Gabba', 'SCG', 'GMHBA Stadium', 'People First Stadium'];

const games = [];
let gid = 1;
for (let round = 1; round <= TOTAL_ROUNDS; round++) {
  const complete = round <= CURRENT_ROUND;
  for (const [h, a] of schedule[round - 1]) {
    let hscore = null;
    let ascore = null;
    let hgoals = null;
    let hbehinds = null;
    let agoals = null;
    let abehinds = null;
    let winner = null;
    if (complete) {
      const edge = STRENGTH[h] - STRENGTH[a] + 0.25; // home advantage
      const pHome = 1 / (1 + Math.exp(-1.1 * edge));
      const homeWins = rng() < pHome;
      const margin = Math.round(3 + rng() * 45);
      const loserScore = Math.round(55 + rng() * 40);
      hscore = homeWins ? loserScore + margin : loserScore;
      ascore = homeWins ? loserScore : loserScore + margin;
      // Split each score into a plausible goal/behind breakdown (6*g + b).
      [hgoals, hbehinds] = splitScore(hscore);
      [agoals, abehinds] = splitScore(ascore);
      winner = homeWins ? h : a;
    }
    // season runs Mar..Aug; spread rounds weekly from 2026-03-12
    const start = new Date(Date.UTC(2026, 2, 12));
    start.setUTCDate(start.getUTCDate() + (round - 1) * 7 + (gid % 3));
    const [yy, mo2, dd] = start.toISOString().slice(0, 10).split('-').map(Number);
    // unixtime for a 19:40 AWST (UTC+8) kickoff on that day
    const unixtime = Math.floor(Date.UTC(yy, mo2 - 1, dd, 11, 40) / 1000);
    games.push({
      id: gid,
      round,
      year: YEAR,
      complete: complete ? 100 : 0,
      hteamid: h,
      ateamid: a,
      hscore,
      ascore,
      hgoals,
      hbehinds,
      agoals,
      abehinds,
      date: start.toISOString().slice(0, 10) + ' 19:40:00',
      unixtime,
      venue: VENUES[gid % VENUES.length],
      is_final: 0,
      winnerteamid: winner
    });
    gid++;
  }
}

// standings derived from the generated games so everything is consistent
const table = new Map(ids.map((id) => [id, { id, played: 0, wins: 0, losses: 0, draws: 0, pts: 0, for: 0, against: 0 }]));
for (const g of games) {
  if (!g.complete) continue;
  const h = table.get(g.hteamid);
  const a = table.get(g.ateamid);
  h.played++; a.played++;
  h.for += g.hscore; h.against += g.ascore;
  a.for += g.ascore; a.against += g.hscore;
  if (g.hscore > g.ascore) { h.wins++; h.pts += 4; a.losses++; }
  else if (g.ascore > g.hscore) { a.wins++; a.pts += 4; h.losses++; }
  else { h.draws++; a.draws++; h.pts += 2; a.pts += 2; }
}
const standings = [...table.values()]
  .map((t) => ({ ...t, percentage: Math.round((t.for / Math.max(t.against, 1)) * 10000) / 100 }))
  .sort((x, y) => y.pts - x.pts || y.percentage - x.percentage)
  .map((t, i) => ({ ...t, rank: i + 1 }));

// consensus tips for the next round's games, from the same hidden strengths
const tips = games
  .filter((g) => g.round === CURRENT_ROUND + 1)
  .map((g) => {
    const edge = STRENGTH[g.hteamid] - STRENGTH[g.ateamid] + 0.25;
    const p = 1 / (1 + Math.exp(-1.0 * edge));
    return {
      gameid: g.id,
      hteamid: g.hteamid,
      ateamid: g.ateamid,
      hconfidence: Math.round(p * 1000) / 1000,
      hmargin: Math.round(edge * 18 * 10) / 10,
      models: 9
    };
  });

const meta = {
  fetchedAt: new Date('2026-07-19T04:00:00Z').toISOString(),
  year: YEAR,
  source: 'seed',
  currentRound: CURRENT_ROUND,
  totalRounds: TOTAL_ROUNDS
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'games.json'), JSON.stringify(games, null, 1));
writeFileSync(join(OUT, 'standings.json'), JSON.stringify(standings, null, 1));
writeFileSync(join(OUT, 'tips.json'), JSON.stringify(tips, null, 1));
writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));

// ---------------------------------------------------------------------------
// History archive: intentionally EMPTY. We do not seed fake past seasons —
// inaccurate games would poison the multi-season model and hub. The archive is
// populated only with real Squiggle data by the Update AFL history workflow
// (scripts/fetch-history.mjs). We write empty placeholders so the hub renders
// its "no archived seasons yet" state and the loaders never 404.
// ---------------------------------------------------------------------------
const HISTORY_OUT = join(OUT, 'history');
mkdirSync(HISTORY_OUT, { recursive: true });
writeFileSync(join(HISTORY_OUT, 'index.json'), JSON.stringify([], null, 1));
writeFileSync(join(HISTORY_OUT, 'games.json'), JSON.stringify([]));

console.log(
  `Seed data written to ${OUT}: ${games.length} games, ${standings.length} teams, ${tips.length} tips.` +
    ' History archive is empty — populate real seasons with: npm run fetch-history'
);
