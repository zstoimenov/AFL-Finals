#!/usr/bin/env node
/**
 * Fetches the season snapshot from the Squiggle API and writes the static
 * JSON files the app serves. Run by the scheduled update-data workflow.
 *
 * Per Squiggle's usage policy the app never hits the API from visitors'
 * browsers — only this script talks to Squiggle, identified by User-Agent.
 *
 * Fails soft: any error leaves the previously committed snapshots in place.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const YEAR = Number(process.env.AFL_YEAR ?? new Date().getFullYear());
const UA = 'AFL-Finals-Tracker/1.0 (github.com/zstoimenov/AFL-Finals; zdravko.stoimenov@gmail.com)';

async function squiggle(query) {
  const url = `https://api.squiggle.com.au/?q=${query};year=${YEAR};format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Squiggle ${query} -> HTTP ${res.status}`);
  return res.json();
}

function normaliseGames(raw) {
  // Squiggle publishes placeholder finals fixtures before the matchups are
  // known (team ids 0, "TBD v TBD" at the MCG). Drop them — the app derives
  // future finals matchups itself, and a placeholder would make it think the
  // finals series has already started.
  const games = (raw.games ?? []).filter((g) => Number(g.hteamid) > 0 && Number(g.ateamid) > 0);
  // finals week = rounds past the last home & away round
  const lastHomeAwayRound = Math.max(
    0,
    ...games.filter((g) => !g.is_final).map((g) => Number(g.round))
  );
  return {
    totalRounds: lastHomeAwayRound,
    games: games.map((g) => ({
      id: Number(g.id),
      round: Number(g.round),
      year: Number(g.year),
      complete: Number(g.complete) === 100 ? 100 : 0,
      hteamid: Number(g.hteamid),
      ateamid: Number(g.ateamid),
      hscore: g.hscore != null ? Number(g.hscore) : null,
      ascore: g.ascore != null ? Number(g.ascore) : null,
      hgoals: g.hgoals != null ? Number(g.hgoals) : null,
      hbehinds: g.hbehinds != null ? Number(g.hbehinds) : null,
      agoals: g.agoals != null ? Number(g.agoals) : null,
      abehinds: g.abehinds != null ? Number(g.abehinds) : null,
      date: String(g.date ?? ''),
      unixtime: g.unixtime != null ? Number(g.unixtime) : null,
      venue: g.venue ?? null,
      is_final: g.is_final ? Math.max(1, Number(g.round) - lastHomeAwayRound) : 0,
      winnerteamid: g.winnerteamid != null ? Number(g.winnerteamid) : null
    }))
  };
}

function normaliseStandings(raw) {
  return (raw.standings ?? []).map((s) => ({
    id: Number(s.id),
    rank: Number(s.rank),
    played: Number(s.played),
    wins: Number(s.wins),
    losses: Number(s.losses),
    draws: Number(s.draws ?? 0),
    pts: Number(s.pts),
    percentage: Number(s.percentage),
    for: Number(s.for),
    against: Number(s.against)
  }));
}

/** Average every model's home-win confidence per game. */
function normaliseTips(raw) {
  const byGame = new Map();
  for (const t of raw.tips ?? []) {
    const gid = Number(t.gameid);
    const entry = byGame.get(gid) ?? {
      gameid: gid,
      hteamid: Number(t.hteamid),
      ateamid: Number(t.ateamid),
      sum: 0,
      marginSum: 0,
      marginCount: 0,
      models: 0
    };
    // Squiggle confidence is 0-100 for the TIPPED team; convert to home-win prob
    const conf = Number(t.confidence ?? 50) / 100;
    const homeSide = Number(t.tipteamid) === entry.hteamid;
    entry.sum += homeSide ? conf : 1 - conf;
    // Squiggle margin is the predicted winning margin for the tipped team;
    // fold to the home team's perspective (positive = home favoured).
    if (t.margin != null) {
      const m = Math.abs(Number(t.margin));
      entry.marginSum += homeSide ? m : -m;
      entry.marginCount += 1;
    }
    entry.models += 1;
    byGame.set(gid, entry);
  }
  return [...byGame.values()].map(({ sum, marginSum, marginCount, models, ...rest }) => ({
    ...rest,
    hconfidence: Math.round((sum / Math.max(models, 1)) * 1000) / 1000,
    hmargin: marginCount > 0 ? Math.round((marginSum / marginCount) * 10) / 10 : null,
    models
  }));
}

try {
  const [gamesRaw, standingsRaw, tipsRaw] = await Promise.all([
    squiggle('games'),
    squiggle('standings'),
    squiggle('tips')
  ]);

  const { games, totalRounds } = normaliseGames(gamesRaw);
  const standings = normaliseStandings(standingsRaw);
  const tips = normaliseTips(tipsRaw);

  if (games.length === 0 || standings.length === 0) {
    throw new Error('Squiggle returned an empty snapshot — keeping existing data');
  }

  const currentRound = Math.max(
    0,
    ...games.filter((g) => g.complete && g.is_final === 0).map((g) => g.round)
  );

  const meta = {
    fetchedAt: new Date().toISOString(),
    year: YEAR,
    source: 'squiggle',
    currentRound,
    totalRounds
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'games.json'), JSON.stringify(games, null, 1));
  writeFileSync(join(OUT, 'standings.json'), JSON.stringify(standings, null, 1));
  writeFileSync(join(OUT, 'tips.json'), JSON.stringify(tips, null, 1));
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log(
    `Fetched ${YEAR}: ${games.length} games, ${standings.length} teams, ${tips.length} tipped games (round ${currentRound}/${totalRounds})`
  );
} catch (err) {
  console.error(`fetch-data failed: ${err.message ?? err}`);
  process.exit(1);
}
