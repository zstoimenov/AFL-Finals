#!/usr/bin/env node
/**
 * One-off migration: fills `unixtime` on committed games that predate unixtime
 * capture, computed from each game's venue-local date + venue timezone. Games
 * that already carry a unixtime (from the live Squiggle feed) are left as-is.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENUE_TZ, zonedToEpoch } from './venue-tz.mjs';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'games.json');
const games = JSON.parse(readFileSync(file, 'utf8'));

let filled = 0;
const unmapped = new Set();
for (const g of games) {
  if (g.unixtime != null && g.unixtime > 0) continue;
  const tz = VENUE_TZ[g.venue];
  if (!tz) {
    if (g.venue) unmapped.add(g.venue);
    continue;
  }
  const u = zonedToEpoch(g.date, tz);
  if (u != null) {
    g.unixtime = u;
    filled++;
  }
}

writeFileSync(file, JSON.stringify(games, null, 1));
console.log(`Backfilled unixtime on ${filled} games`);
if (unmapped.size) console.warn('Unmapped venues:', [...unmapped].join(', '));
