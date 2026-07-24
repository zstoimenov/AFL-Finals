#!/usr/bin/env node
/**
 * Builds a multi-season backtest corpus by pulling past seasons' games from the
 * Squiggle API (via the shared fetcher in squiggle.mjs, so records are normalised
 * exactly as the app and the history archive normalise them) and concatenating
 * them into one JSON file. Evaluation-only — never shipped as app data; it just
 * gives the backtest harness far more games than the current season alone, so
 * weak signals (carry-over prior, head-to-head, rest days) can be judged on a
 * trustworthy sample rather than ~130 games.
 *
 * Usage:
 *   node scripts/backtest-years.mjs 2022 2023 2024 2025 2026
 *   BACKTEST_GAMES=scratch/backtest-games.json npx vitest run src/domain/backtest.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { squiggle, normaliseGames, gameStart } from './squiggle.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scratch', 'backtest-games.json');

const years = process.argv.slice(2).map(Number).filter((y) => y >= 2000 && y <= 2100);
if (years.length === 0) {
  console.error('Pass one or more seasons, e.g. node scripts/backtest-years.mjs 2023 2024 2025');
  process.exit(1);
}

try {
  const all = [];
  for (const y of years) {
    const { games } = normaliseGames(await squiggle('games', y));
    all.push(...games);
    console.log(`  ${y}: ${games.length} games`);
  }
  all.sort((a, b) => gameStart(a) - gameStart(b));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(all));
  console.log(`\nWrote ${all.length} games across ${years.length} seasons to ${OUT}`);
  console.log(`Run: BACKTEST_GAMES=${OUT} npx vitest run src/domain/backtest.test.ts`);
} catch (err) {
  console.error(`backtest-years failed: ${err.message ?? err}`);
  process.exit(1);
}
