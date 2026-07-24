#!/usr/bin/env node
/**
 * Builds a multi-season backtest corpus by pulling past seasons' games from the
 * Squiggle API (the same single source the app already uses) and concatenating
 * them into one JSON file. Evaluation-only — this file is never shipped as app
 * data; it just gives the backtest harness far more games than the current
 * season alone, so weak signals (head-to-head, rest days) can be judged on a
 * trustworthy sample rather than ~130 games.
 *
 * Usage:
 *   node scripts/backtest-years.mjs 2022 2023 2024 2025 2026
 *   BACKTEST_GAMES=scratch/backtest-games.json npx vitest run src/domain/backtest.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scratch', 'backtest-games.json');
const UA = 'AFL-Finals-Tracker/1.0 (github.com/zstoimenov/AFL-Finals; zdravko.stoimenov@gmail.com)';

const years = process.argv.slice(2).map(Number).filter((y) => y >= 2000 && y <= 2100);
if (years.length === 0) {
  console.error('Pass one or more seasons, e.g. node scripts/backtest-years.mjs 2023 2024 2025');
  process.exit(1);
}

async function games(year) {
  const url = `https://api.squiggle.com.au/?q=games;year=${year};format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Squiggle games ${year} -> HTTP ${res.status}`);
  const raw = await res.json();
  return (raw.games ?? [])
    .filter((g) => Number(g.hteamid) > 0 && Number(g.ateamid) > 0)
    .map((g) => {
      const lastHA = Math.max(0, ...(raw.games ?? []).filter((x) => !x.is_final).map((x) => Number(x.round)));
      return {
        id: Number(g.id),
        round: Number(g.round),
        year: Number(g.year),
        complete: Number(g.complete) === 100 ? 100 : 0,
        hteamid: Number(g.hteamid),
        ateamid: Number(g.ateamid),
        hscore: g.hscore != null ? Number(g.hscore) : null,
        ascore: g.ascore != null ? Number(g.ascore) : null,
        date: String(g.date ?? ''),
        unixtime: g.unixtime != null ? Number(g.unixtime) : null,
        venue: g.venue ?? null,
        is_final: g.is_final ? Math.max(1, Number(g.round) - lastHA) : 0,
        winnerteamid: g.winnerteamid != null ? Number(g.winnerteamid) : null
      };
    });
}

try {
  const all = [];
  for (const y of years) {
    const gs = await games(y);
    all.push(...gs);
    console.log(`  ${y}: ${gs.length} games`);
  }
  all.sort((a, b) => (a.unixtime ?? 0) - (b.unixtime ?? 0));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(all));
  console.log(`\nWrote ${all.length} games across ${years.length} seasons to ${OUT}`);
  console.log(`Run: BACKTEST_GAMES=${OUT} npx vitest run src/domain/backtest.test.ts`);
} catch (err) {
  console.error(`backtest-years failed: ${err.message ?? err}`);
  process.exit(1);
}
