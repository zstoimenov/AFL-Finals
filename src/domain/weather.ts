import type { GameWeather, WeatherSnapshot } from './types';

/**
 * What the forecast at kickoff means for a game of football.
 *
 * Wind and rain are the two conditions that visibly change how an AFL game is
 * played: a wet ball suppresses scoring and rewards the side that wins the
 * contest, and a strong breeze makes one end worth more than the other. None of
 * that is in the Squiggle feed, so it comes from Open-Meteo keyed on the venue.
 *
 * Everything here is *descriptive*, not predictive. The thresholds below are
 * editorial — the same standing as the interest weights — and deliberately not
 * wired into the win-probability model: a term in that model has to be justified
 * by the backtest harness, and the harness cannot score weather until the
 * archive carries forecasts for games already played. Forecasts only start
 * accumulating from the first fetch, so that evidence is a season away. Until
 * then weather tells the reader what to expect and stays out of the numbers.
 */

/** Above this, the breeze is a factor in the game rather than in the comfort. */
const WINDY_KPH = 25;
const VERY_WINDY_KPH = 40;
/** Rain in the hour of the bounce; a wet ball needs very little. */
const WET_MM = 0.3;
const SOAKED_MM = 2;
/** Perth in March and Hobart in July both get a mention. */
const HOT_C = 32;
const COLD_C = 8;

/** The forecast for one game, or null when there is none. */
export function weatherFor(
  weather: WeatherSnapshot | null,
  gameId: number
): GameWeather | null {
  return weather?.games?.[String(gameId)] ?? null;
}

export type WeatherTag = 'soaked' | 'wet' | 'very-windy' | 'windy' | 'hot' | 'cold';

/**
 * Every condition worth naming, strongest first. An empty list is a fine day —
 * or an absent forecast, which is why callers check `weatherFor` first rather
 * than reading "no tags" as "good weather".
 */
export function weatherTags(w: GameWeather | null): WeatherTag[] {
  if (!w) return [];
  const tags: WeatherTag[] = [];
  const rain = w.rainMm ?? 0;
  const wind = w.windKph ?? 0;
  if (rain >= SOAKED_MM) tags.push('soaked');
  else if (rain >= WET_MM) tags.push('wet');
  if (wind >= VERY_WINDY_KPH) tags.push('very-windy');
  else if (wind >= WINDY_KPH) tags.push('windy');
  if (w.tempC != null && w.tempC >= HOT_C) tags.push('hot');
  else if (w.tempC != null && w.tempC <= COLD_C) tags.push('cold');
  return tags;
}

/**
 * Conditions that suppress scoring and reward the contested game. Used to decide
 * whether a forecast is worth putting on a card at all — most weeks it is not.
 */
export function isTough(w: GameWeather | null): boolean {
  return weatherTags(w).some(
    (t) => t === 'wet' || t === 'soaked' || t === 'windy' || t === 'very-windy'
  );
}

/** A short label for a chip, or null on a fine day or an absent forecast. */
export function weatherLabel(w: GameWeather | null): string | null {
  const tags = weatherTags(w);
  if (tags.length === 0) return null;
  const wet = tags.includes('soaked') ? 'Heavy rain' : tags.includes('wet') ? 'Wet' : null;
  const windy = tags.includes('very-windy')
    ? 'strong wind'
    : tags.includes('windy')
      ? 'windy'
      : null;
  if (wet && windy) return `${wet} and ${windy}`;
  if (wet) return wet;
  if (windy) return windy === 'strong wind' ? 'Strong wind' : 'Windy';
  return tags.includes('hot') ? 'Hot' : 'Cold';
}

/**
 * The forecast as a sentence, with the numbers behind the label. Null when
 * there's nothing to report, so a caller can render nothing rather than "no
 * data" — a missing forecast is not information.
 */
export function weatherSummary(w: GameWeather | null): string | null {
  if (!w) return null;
  const parts: string[] = [];
  if (w.tempC != null) parts.push(`${Math.round(w.tempC)}°C`);
  if (w.windKph != null) parts.push(`${Math.round(w.windKph)} km/h wind`);
  if (w.rainMm != null && w.rainMm > 0) parts.push(`${w.rainMm.toFixed(1)} mm rain`);
  else if (w.rainChance != null && w.rainChance >= 30) parts.push(`${w.rainChance}% chance of rain`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Why the conditions matter, for the game sheet. Only speaks when they actually
 * do — a mild evening gets nothing rather than a sentence saying it is mild.
 */
export function weatherNote(w: GameWeather | null): string | null {
  const tags = weatherTags(w);
  if (!isTough(w)) return null;
  const wet = tags.includes('soaked') || tags.includes('wet');
  const windy = tags.includes('very-windy') || tags.includes('windy');
  if (wet && windy) {
    return 'Wet and blowing — expect a low score, plenty of stoppages and the ' +
      'contested game to decide it.';
  }
  if (wet) return 'A wet ball favours the side that wins the contest over the side that moves it.';
  return 'A strong breeze makes one end worth more than the other — watch which way they kick.';
}
