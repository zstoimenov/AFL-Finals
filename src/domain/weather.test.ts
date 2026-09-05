import { describe, expect, it } from 'vitest';
import {
  isTough,
  weatherFor,
  weatherLabel,
  weatherNote,
  weatherSummary,
  weatherTags
} from './weather';
import type { GameWeather, WeatherSnapshot } from './types';

const w = (over: Partial<GameWeather> = {}): GameWeather => ({
  tempC: 16,
  rainMm: 0,
  rainChance: 5,
  windKph: 10,
  ...over
});

describe('weatherFor', () => {
  const snap: WeatherSnapshot = {
    fetchedAt: '2026-09-05T00:00:00.000Z',
    games: { '1234': w({ tempC: 21 }) }
  };

  it('reads a forecast by game id', () => {
    expect(weatherFor(snap, 1234)?.tempC).toBe(21);
  });

  it('is null for a game with no forecast, and with no file deployed', () => {
    // outside the forecast horizon, or a ground with no known coordinates
    expect(weatherFor(snap, 9999)).toBeNull();
    expect(weatherFor(null, 1234)).toBeNull();
  });
});

describe('weatherTags', () => {
  it('names a fine day with nothing at all', () => {
    expect(weatherTags(w())).toEqual([]);
  });

  it('separates a shower from a soaking', () => {
    expect(weatherTags(w({ rainMm: 0.5 }))).toContain('wet');
    expect(weatherTags(w({ rainMm: 4 }))).toContain('soaked');
    expect(weatherTags(w({ rainMm: 4 }))).not.toContain('wet');
  });

  it('separates a breeze from a gale', () => {
    expect(weatherTags(w({ windKph: 30 }))).toContain('windy');
    expect(weatherTags(w({ windKph: 55 }))).toContain('very-windy');
  });

  it('reports rain and wind together', () => {
    expect(weatherTags(w({ rainMm: 3, windKph: 45 }))).toEqual(['soaked', 'very-windy']);
  });

  it('mentions the temperature only at the extremes', () => {
    expect(weatherTags(w({ tempC: 35 }))).toEqual(['hot']);
    expect(weatherTags(w({ tempC: 5 }))).toEqual(['cold']);
    expect(weatherTags(w({ tempC: 20 }))).toEqual([]);
  });

  it('says nothing when there is no forecast', () => {
    // absent must not be read as fine — that is why callers check weatherFor
    expect(weatherTags(null)).toEqual([]);
  });

  it('treats a missing field as unremarkable rather than extreme', () => {
    expect(weatherTags(w({ tempC: null, rainMm: null, windKph: null }))).toEqual([]);
  });
});

describe('isTough', () => {
  it('is true for rain or wind, which change how the game is played', () => {
    expect(isTough(w({ rainMm: 1 }))).toBe(true);
    expect(isTough(w({ windKph: 30 }))).toBe(true);
  });

  it('is false for heat and cold, which are uncomfortable but not tactical', () => {
    expect(isTough(w({ tempC: 36 }))).toBe(false);
    expect(isTough(w())).toBe(false);
    expect(isTough(null)).toBe(false);
  });
});

describe('weatherLabel', () => {
  it('combines rain and wind into one phrase', () => {
    expect(weatherLabel(w({ rainMm: 3, windKph: 45 }))).toBe('Heavy rain and strong wind');
    expect(weatherLabel(w({ rainMm: 0.5, windKph: 30 }))).toBe('Wet and windy');
  });

  it('reads each condition alone', () => {
    expect(weatherLabel(w({ rainMm: 0.5 }))).toBe('Wet');
    expect(weatherLabel(w({ windKph: 30 }))).toBe('Windy');
    expect(weatherLabel(w({ windKph: 55 }))).toBe('Strong wind');
    expect(weatherLabel(w({ tempC: 36 }))).toBe('Hot');
  });

  it('is null on a fine day, so nothing is rendered', () => {
    expect(weatherLabel(w())).toBeNull();
    expect(weatherLabel(null)).toBeNull();
  });
});

describe('weatherSummary', () => {
  it('puts the numbers behind the label', () => {
    expect(weatherSummary(w({ tempC: 14.4, windKph: 28.2, rainMm: 1.25 }))).toBe(
      '14°C · 28 km/h wind · 1.3 mm rain'
    );
  });

  it('falls back to the chance of rain when none is forecast in the hour', () => {
    expect(weatherSummary(w({ rainMm: 0, rainChance: 60 }))).toContain('60% chance of rain');
  });

  it('leaves out a low chance of rain rather than reassuring anyone', () => {
    expect(weatherSummary(w({ rainMm: 0, rainChance: 10 }))).toBe('16°C · 10 km/h wind');
  });

  it('is null when there is nothing to report', () => {
    expect(weatherSummary(null)).toBeNull();
    expect(weatherSummary(w({ tempC: null, windKph: null, rainMm: null, rainChance: null }))).toBeNull();
  });
});

describe('weatherNote', () => {
  it('explains what the conditions do to the game', () => {
    expect(weatherNote(w({ rainMm: 1 }))).toContain('contest');
    expect(weatherNote(w({ windKph: 30 }))).toContain('end');
    expect(weatherNote(w({ rainMm: 3, windKph: 45 }))).toContain('low score');
  });

  it('stays quiet about a mild evening', () => {
    expect(weatherNote(w())).toBeNull();
    expect(weatherNote(w({ tempC: 34 }))).toBeNull();
    expect(weatherNote(null)).toBeNull();
  });
});
