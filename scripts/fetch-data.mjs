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
 *
 * One empty answer is not an error: a season Squiggle has not published yet. The
 * year comes from the calendar, so from 1 January it asks for a season whose
 * fixture or ladder may not exist for weeks. If the season asked for is newer than
 * the one already committed, an empty snapshot means "not out yet": the finished
 * season stays live and the run succeeds. An empty answer for the season already
 * being tracked is still a failure, because that one should never go blank.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  squiggle,
  normaliseGames,
  normaliseStandings,
  normaliseTips,
  normaliseTipsters,
  normaliseProjectedLadder,
  describeLadderPayload
} from './squiggle.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
// || rather than ??: a manual run with the year input left blank passes an empty string
const YEAR = Number(process.env.AFL_YEAR || new Date().getFullYear());

/** The season the committed snapshot tracks, or null when there is none to read. */
function committedYear() {
  try {
    const year = JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8')).year;
    return Number.isFinite(year) ? year : null;
  } catch {
    return null;
  }
}

try {
  // the projected ladder is a benchmark, not something the app needs to render
  // a screen, so a failure here must not cost us the snapshot — but it is
  // reported rather than swallowed, so an empty projection can be explained
  let ladderErr = null;
  const [gamesRaw, standingsRaw, tipsRaw, ladderRaw] = await Promise.all([
    squiggle('games', YEAR),
    squiggle('standings', YEAR),
    squiggle('tips', YEAR),
    squiggle('ladder', YEAR).catch((e) => {
      ladderErr = e;
      return {};
    })
  ]);

  const { games, totalRounds } = normaliseGames(gamesRaw);
  const standings = normaliseStandings(standingsRaw);
  const tips = normaliseTips(tipsRaw);
  const tipsters = normaliseTipsters(tipsRaw);
  const projected = normaliseProjectedLadder(ladderRaw);
  // say what the ladder query returned whether or not it produced rows: an
  // empty projection is expected once the home & away season is over, and a
  // silent empty file is indistinguishable from a broken parser
  console.log(`Projected ladder: ${describeLadderPayload(ladderErr ? null : ladderRaw, ladderErr)}`);

  if (games.length === 0 || standings.length === 0) {
    const tracked = committedYear();
    if (tracked != null && YEAR > tracked) {
      const missing = games.length === 0 ? 'fixture' : 'ladder';
      // a GitHub notice annotation: visible on the run, but no failure email
      console.log(
        `::notice::Squiggle has no ${YEAR} ${missing} yet — keeping ${tracked} live`
      );
      process.exit(0);
    }
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
  // one row per model per game — big enough that the app fetches it only when
  // someone opens the hub, so it is written compact rather than indented
  writeFileSync(join(OUT, 'tipsters.json'), JSON.stringify(tipsters));
  writeFileSync(join(OUT, 'projected.json'), JSON.stringify(projected, null, 1));
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log(
    `Fetched ${YEAR}: ${games.length} games, ${standings.length} teams, ` +
      `${tips.length} tipped games from ${tipsters.sources.length} tipsters ` +
      `(round ${currentRound}/${totalRounds}); ` +
      `${projected.length} teams in Squiggle's projected ladder`
  );
} catch (err) {
  console.error(`fetch-data failed: ${err.message ?? err}`);
  process.exit(1);
}
