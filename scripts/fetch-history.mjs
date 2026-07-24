#!/usr/bin/env node
/**
 * Builds the multi-season history archive the app browses and the model learns
 * from. For each past season it pulls games / standings / tips from Squiggle (the
 * same single source the live season uses) and writes:
 *
 *   public/data/history/<year>.json  — a frozen season snapshot (lazy-loaded when
 *                                      the user opens that season in the hub)
 *   public/data/history/games.json   — every completed game across all archived
 *                                      seasons, sorted oldest→newest; the compact
 *                                      corpus the model's carry-over prior reads
 *   public/data/history/index.json   — a light manifest (year, premier, format,
 *                                      counts) for the season switcher / hub
 *
 * Idempotent: pass the full set of years each run; existing files are overwritten
 * with fresh data. Fails soft — an error leaves the committed archive in place.
 *
 * Usage:
 *   node scripts/fetch-history.mjs 2022 2023 2024 2025
 *   npm run fetch-history            # defaults to 2022 2023 2024 2025
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  squiggle,
  normaliseGames,
  normaliseStandings,
  normaliseTips,
  gameStart,
  finalsFormatForYear,
  seasonPremier
} from './squiggle.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'history');

// Default window: 2022 through last completed season. Rolls forward on its own,
// so the yearly archive cron folds each finished season in with no code change
// (e.g. 2026 becomes history in 2027).
const FIRST_YEAR = 2022;
const years = (() => {
  const passed = process.argv.slice(2).map(Number).filter((y) => y >= 2000 && y <= 2100);
  if (passed.length > 0) return passed;
  const lastCompleted = new Date().getFullYear() - 1;
  const out = [];
  for (let y = FIRST_YEAR; y <= Math.max(FIRST_YEAR, lastCompleted); y++) out.push(y);
  return out;
})();

async function season(year) {
  const [gamesRaw, standingsRaw, tipsRaw] = await Promise.all([
    squiggle('games', year),
    squiggle('standings', year),
    squiggle('tips', year)
  ]);
  const { games, totalRounds } = normaliseGames(gamesRaw);
  const standings = normaliseStandings(standingsRaw);
  const tips = normaliseTips(tipsRaw);
  if (games.length === 0) throw new Error(`Squiggle returned no games for ${year}`);
  const currentRound = Math.max(
    0,
    ...games.filter((g) => g.complete && g.is_final === 0).map((g) => g.round)
  );
  const meta = {
    fetchedAt: new Date().toISOString(),
    year,
    source: 'squiggle',
    currentRound,
    totalRounds,
    premier: seasonPremier(games),
    format: finalsFormatForYear(year)
  };
  return { games, standings, tips, meta };
}

try {
  const snapshots = [];
  for (const y of years.sort((a, b) => a - b)) {
    const snap = await season(y);
    snapshots.push(snap);
    console.log(`  ${y}: ${snap.games.length} games, premier ${snap.meta.premier ?? '—'}`);
  }

  // corpus: every completed game across all seasons, oldest→newest
  const corpus = snapshots
    .flatMap((s) => s.games)
    .filter((g) => g.complete && g.hscore != null && g.ascore != null)
    .sort((a, b) => gameStart(a) - gameStart(b));

  const index = snapshots.map((s) => ({
    year: s.meta.year,
    premier: s.meta.premier,
    format: s.meta.format,
    teams: s.standings.length,
    games: s.games.filter((g) => g.complete).length
  }));

  mkdirSync(OUT, { recursive: true });
  for (const s of snapshots) {
    writeFileSync(join(OUT, `${s.meta.year}.json`), JSON.stringify(s, null, 1));
  }
  writeFileSync(join(OUT, 'games.json'), JSON.stringify(corpus));
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));

  console.log(
    `\nArchived ${snapshots.length} seasons (${years.join(', ')}): ` +
      `${corpus.length} completed games in the model corpus.`
  );
} catch (err) {
  console.error(`fetch-history failed: ${err.message ?? err}`);
  process.exit(1);
}
