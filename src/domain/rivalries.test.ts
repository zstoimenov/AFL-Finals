import { describe, expect, it } from 'vitest';
import { allRivalries, rivalryFor, rivalryLabel } from './rivalries';
import { TEAMS } from './teams';
import type { Game } from './types';

function gameOn(date: string): Game {
  return {
    id: 1,
    round: 6,
    year: 2026,
    complete: 0,
    hteamid: 4,
    ateamid: 5,
    hscore: null,
    ascore: null,
    date,
    venue: 'M.C.G.',
    is_final: 0,
    winnerteamid: null
  };
}

describe('rivalries', () => {
  it('only references real clubs, and never pairs a club with itself', () => {
    for (const r of allRivalries()) {
      const [a, b] = r.teams;
      expect(TEAMS[a]).toBeDefined();
      expect(TEAMS[b]).toBeDefined();
      expect(a).toBeLessThan(b); // stored ascending, so the pair key is stable
    }
  });

  it('has no duplicate pairs', () => {
    const keys = allRivalries().map((r) => r.teams.join('-'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches a pair in either order', () => {
    expect(rivalryFor(6, 17)?.name).toBe('Western Derby');
    expect(rivalryFor(17, 6)?.name).toBe('Western Derby');
  });

  it('returns null for clubs with no standing rivalry', () => {
    expect(rivalryFor(6, 12)).toBeNull();
  });

  it('uses the occasion name only on the occasion’s date', () => {
    const rivalry = rivalryFor(4, 5)!;
    expect(rivalryLabel(rivalry, gameOn('2026-04-25 15:20:00'))).toBe('ANZAC Day clash');
    expect(rivalryLabel(rivalry, gameOn('2026-07-11 19:40:00'))).toBe('Collingwood v Essendon');
  });
});
