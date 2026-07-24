#!/usr/bin/env node
/**
 * Generates self-consistent placeholder data into public/data/. Used only until
 * the fetch workflows pull real Squiggle data — output is marked
 * meta.source = "seed" and the UI shows a banner for it.
 *
 * Emits two things:
 *   - the live current season (2026), partially played, at public/data/*.json
 *   - a small history archive (2024, 2025), fully played incl. a top-eight finals
 *     series, at public/data/history/ — so the multi-season hub and the model's
 *     carry-over prior have data before the first real fetch.
 *
 * Deterministic: seeded RNG, same output every run. The live-2026 block is kept
 * byte-for-byte stable (its own module-global RNG stream, untouched by the
 * history generator) so the committed snapshot and its documented backtest
 * numbers don't drift.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalsFormatForYear, seasonPremier, gameStart } from './squiggle.mjs';

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
// History archive: fully played prior seasons (top-eight finals). Fully
// self-contained — its own RNG per season, so it never perturbs the live-2026
// stream above.
// ---------------------------------------------------------------------------
function buildHistorySeason(year) {
  const localRng = (() => {
    let s = (year * 100003 + 17) | 0;
    return () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const strength = {};
  for (const id of ids) strength[id] = STRENGTH[id] + (localRng() - 0.5) * 0.9;

  const split = (score) => {
    const behinds = Math.min(score, 6 + Math.floor(localRng() * 9));
    const goals = Math.max(0, Math.round((score - behinds) / 6));
    return [goals, score - goals * 6];
  };
  const play = (h, a, neutral = false) => {
    const edge = strength[h] - strength[a] + (neutral ? 0 : 0.25);
    const pHome = 1 / (1 + Math.exp(-1.1 * edge));
    const homeWins = localRng() < pHome;
    const margin = Math.round(3 + localRng() * 45);
    const loserScore = Math.round(55 + localRng() * 40);
    const hscore = homeWins ? loserScore + margin : loserScore;
    const ascore = homeWins ? loserScore : loserScore + margin;
    const [hgoals, hbehinds] = split(hscore);
    const [agoals, abehinds] = split(ascore);
    return { hscore, ascore, hgoals, hbehinds, agoals, abehinds, winner: homeWins ? h : a };
  };

  const seasonRounds = 23;
  const hg = [];
  let hid = year * 1000 + 1;
  for (let round = 1; round <= seasonRounds; round++) {
    const src = rr[(round - 1) % rr.length];
    const flip = round > rr.length;
    for (const pair of src) {
      const [h, a] = flip ? [pair[1], pair[0]] : pair;
      const day = new Date(Date.UTC(year, 2, 12));
      day.setUTCDate(day.getUTCDate() + (round - 1) * 7 + (hid % 3));
      const [yy, mo, dd] = day.toISOString().slice(0, 10).split('-').map(Number);
      const r = play(h, a);
      hg.push({
        id: hid, round, year, complete: 100, hteamid: h, ateamid: a,
        hscore: r.hscore, ascore: r.ascore, hgoals: r.hgoals, hbehinds: r.hbehinds,
        agoals: r.agoals, abehinds: r.abehinds,
        date: `${day.toISOString().slice(0, 10)} 19:40:00`,
        unixtime: Math.floor(Date.UTC(yy, mo - 1, dd, 11, 40) / 1000),
        venue: VENUES[hid % VENUES.length], is_final: 0, winnerteamid: r.winner
      });
      hid++;
    }
  }

  // standings (H&A only)
  const tbl = new Map(ids.map((id) => [id, { id, played: 0, wins: 0, losses: 0, draws: 0, pts: 0, for: 0, against: 0 }]));
  for (const g of hg) {
    const h = tbl.get(g.hteamid);
    const a = tbl.get(g.ateamid);
    h.played++; a.played++;
    h.for += g.hscore; h.against += g.ascore;
    a.for += g.ascore; a.against += g.hscore;
    if (g.hscore > g.ascore) { h.wins++; h.pts += 4; a.losses++; }
    else if (g.ascore > g.hscore) { a.wins++; a.pts += 4; h.losses++; }
    else { h.draws++; a.draws++; h.pts += 2; a.pts += 2; }
  }
  const st = [...tbl.values()]
    .map((t) => ({ ...t, percentage: Math.round((t.for / Math.max(t.against, 1)) * 10000) / 100 }))
    .sort((x, y) => y.pts - x.pts || y.percentage - x.percentage)
    .map((t, i) => ({ ...t, rank: i + 1 }));

  // top-eight finals
  const seeds = st.slice(0, 8).map((s) => s.id);
  let sep = 5;
  const playFinal = (h, a, week, neutral = false) => {
    const r = play(h, a, neutral);
    hg.push({
      id: hid++, round: seasonRounds + week, year, complete: 100,
      hteamid: h, ateamid: a, hscore: r.hscore, ascore: r.ascore,
      hgoals: r.hgoals, hbehinds: r.hbehinds, agoals: r.agoals, abehinds: r.abehinds,
      date: `${new Date(Date.UTC(year, 8, sep)).toISOString().slice(0, 10)} 19:40:00`,
      unixtime: Math.floor(Date.UTC(year, 8, sep, 11, 40) / 1000),
      venue: 'MCG', is_final: week, winnerteamid: r.winner
    });
    sep += 7;
    return { winner: r.winner, loser: r.winner === h ? a : h };
  };
  const qf1 = playFinal(seeds[0], seeds[3], 1);
  const qf2 = playFinal(seeds[1], seeds[2], 1);
  const ef1 = playFinal(seeds[4], seeds[7], 1);
  const ef2 = playFinal(seeds[5], seeds[6], 1);
  const sf1 = playFinal(qf1.loser, ef2.winner, 2);
  const sf2 = playFinal(qf2.loser, ef1.winner, 2);
  const pf1 = playFinal(qf1.winner, sf1.winner, 3);
  const pf2 = playFinal(qf2.winner, sf2.winner, 3);
  playFinal(pf1.winner, pf2.winner, 4, true);

  // full-season consensus tips so the hub can compare in-app model vs Squiggle
  const htips = hg
    .filter((g) => g.is_final === 0)
    .map((g) => {
      const edge = strength[g.hteamid] - strength[g.ateamid] + 0.25;
      const p = 1 / (1 + Math.exp(-1.0 * edge));
      return {
        gameid: g.id, hteamid: g.hteamid, ateamid: g.ateamid,
        hconfidence: Math.round(p * 1000) / 1000,
        hmargin: Math.round(edge * 18 * 10) / 10, models: 9
      };
    });

  const hmeta = {
    fetchedAt: new Date(`${year}-09-30T04:00:00Z`).toISOString(),
    year, source: 'seed', currentRound: seasonRounds, totalRounds: seasonRounds,
    premier: seasonPremier(hg), format: finalsFormatForYear(year)
  };
  return { games: hg, standings: st, tips: htips, meta: hmeta };
}

const HISTORY_OUT = join(OUT, 'history');
const HISTORY_YEARS = [2024, 2025];
const seasons = HISTORY_YEARS.map(buildHistorySeason);
const corpus = seasons
  .flatMap((s) => s.games)
  .filter((g) => g.complete && g.hscore != null && g.ascore != null)
  .sort((a, b) => gameStart(a) - gameStart(b));
const index = seasons.map((s) => ({
  year: s.meta.year,
  premier: s.meta.premier,
  format: s.meta.format,
  teams: s.standings.length,
  games: s.games.filter((g) => g.complete).length
}));

mkdirSync(HISTORY_OUT, { recursive: true });
for (const s of seasons) {
  writeFileSync(join(HISTORY_OUT, `${s.meta.year}.json`), JSON.stringify(s, null, 1));
}
writeFileSync(join(HISTORY_OUT, 'games.json'), JSON.stringify(corpus));
writeFileSync(join(HISTORY_OUT, 'index.json'), JSON.stringify(index, null, 1));

console.log(
  `Seed data written to ${OUT}: ${games.length} games, ${standings.length} teams, ${tips.length} tips` +
    ` + history ${HISTORY_YEARS.join(', ')} (${corpus.length} corpus games).`
);
