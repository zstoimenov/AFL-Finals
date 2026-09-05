#!/usr/bin/env node
/**
 * Fetches the forecast at kickoff for every upcoming fixture and writes
 * `public/data/weather.json`.
 *
 * Wind and rain move an AFL scoreline more than almost anything else the app can
 * observe — a wet ball suppresses scoring, a strong breeze turns one end into a
 * different game — and none of it is in the Squiggle feed. Open-Meteo serves it
 * without a key or an account, so it costs nothing but a request.
 *
 * Only *upcoming* games are forecast. A game already played has a result, which
 * says everything the weather was going to say about it, and the free forecast
 * horizon is about two weeks anyway.
 *
 * Fails soft in two directions: a failed fetch exits non-zero and leaves the
 * committed file alone, and a venue with no known coordinates is simply skipped.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { venueCoords } from './venues.mjs';
import { UA, gameStart } from './squiggle.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
/** Open-Meteo's free forecast reaches about 16 days out. */
const HORIZON_DAYS = 16;

/** Kickoff rounded to the nearest hour, in Open-Meteo's "2026-09-11T19:00" form. */
const hourKey = (epochSeconds) =>
  `${new Date(Math.round(epochSeconds / 3600) * 3600 * 1000).toISOString().slice(0, 13)}:00`;

try {
  const games = JSON.parse(readFileSync(join(OUT, 'games.json'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const horizon = now + HORIZON_DAYS * 86400;

  // one entry per fixture still to be played, at a ground we can place
  const wanted = games
    .filter((g) => !g.complete)
    .map((g) => ({ game: g, at: gameStart(g), coords: venueCoords(g.venue) }))
    .filter((w) => w.coords && w.at > now && w.at < horizon);

  if (wanted.length === 0) {
    console.log('No upcoming fixtures within the forecast horizon — nothing to fetch');
    process.exit(0);
  }

  // Open-Meteo takes parallel coordinate lists and answers with one result per
  // pair, so the whole round is a single request rather than nine.
  const params = new URLSearchParams({
    latitude: wanted.map((w) => w.coords[0]).join(','),
    longitude: wanted.map((w) => w.coords[1]).join(','),
    hourly: 'temperature_2m,precipitation,precipitation_probability,wind_speed_10m',
    windspeed_unit: 'kmh',
    timezone: 'UTC',
    forecast_days: String(HORIZON_DAYS)
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`Open-Meteo -> HTTP ${res.status}`);

  const body = await res.json();
  // a single coordinate pair comes back as an object, several as an array
  const series = Array.isArray(body) ? body : [body];
  if (series.length !== wanted.length) {
    throw new Error(`Open-Meteo returned ${series.length} series for ${wanted.length} fixtures`);
  }

  const byGame = {};
  wanted.forEach((want, i) => {
    const hourly = series[i]?.hourly;
    if (!hourly?.time) return;
    // the forecast is hourly; take the hour the ball is bounced in
    const key = hourKey(want.at);
    const idx = hourly.time.findIndex((t) => String(t).startsWith(key));
    if (idx < 0) return;
    const num = (arr) => (arr?.[idx] == null ? null : Math.round(Number(arr[idx]) * 10) / 10);
    byGame[want.game.id] = {
      tempC: num(hourly.temperature_2m),
      rainMm: num(hourly.precipitation),
      rainChance: hourly.precipitation_probability?.[idx] ?? null,
      windKph: num(hourly.wind_speed_10m)
    };
  });

  const out = { fetchedAt: new Date().toISOString(), games: byGame };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'weather.json'), JSON.stringify(out, null, 1));
  console.log(
    `Forecast ${Object.keys(byGame).length} of ${wanted.length} upcoming fixtures`
  );
} catch (err) {
  console.error(`fetch-weather failed: ${err.message ?? err}`);
  process.exit(1);
}
