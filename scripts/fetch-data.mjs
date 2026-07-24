#!/usr/bin/env node
/**
 * Fetches the current season snapshot from the Squiggle API and writes the
 * static JSON files the app serves as the live season. Run by the scheduled
 * update-data workflow.
 *
 * Per Squiggle's usage policy the app never hits the API from visitors'
 * browsers — only this script (and its siblings) talk to Squiggle, identified
 * by User-Agent.
 *
 * Fails soft: any error leaves the previously committed snapshots in place.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  squiggle,
  normaliseGames,
  normaliseStandings,
  normaliseTips
} from './squiggle.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const YEAR = Number(process.env.AFL_YEAR ?? new Date().getFullYear());

try {
  const [gamesRaw, standingsRaw, tipsRaw] = await Promise.all([
    squiggle('games', YEAR),
    squiggle('standings', YEAR),
    squiggle('tips', YEAR)
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
