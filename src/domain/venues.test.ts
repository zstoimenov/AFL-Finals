import { describe, it, expect } from 'vitest';
import type { Game } from './types';
import { homeVenuesByTeam, isAwayTravelling, isHostAtHome } from './venues';

function g(id: number, hteamid: number, ateamid: number, venue: string): Game {
  return {
    id,
    round: 1,
    year: 2026,
    complete: 100,
    hteamid,
    ateamid,
    hscore: 90,
    ascore: 80,
    date: '2026-05-01 19:00:00',
    unixtime: 1_700_000_000 + id * 86400,
    venue,
    is_final: 0,
    winnerteamid: hteamid
  };
}

describe('venue/travel signals', () => {
  // team 1 hosts at "Home A"; team 2 hosts at "Home B".
  const history = [g(1, 1, 2, 'Home A'), g(2, 2, 1, 'Home B')];
  const homeVenues = homeVenuesByTeam(history);

  it('derives each team home grounds from its hosted games', () => {
    expect(homeVenues.get(1)!.has('Home A')).toBe(true);
    expect(homeVenues.get(2)!.has('Home B')).toBe(true);
  });

  it('flags the away side as travelling at a venue outside its home set', () => {
    const away = g(3, 1, 2, 'Home A'); // team 2 away at team 1 ground
    expect(isAwayTravelling(homeVenues, away)).toBe(true);
  });

  it('does not flag travel when the away side is at one of its own grounds', () => {
    const notTravel = g(4, 1, 2, 'Home B'); // team 2 "away" but at its own ground
    expect(isAwayTravelling(homeVenues, notTravel)).toBe(false);
  });

  it('detects a host playing away from its own grounds', () => {
    const neutral = g(5, 1, 2, 'Neutral Park');
    expect(isHostAtHome(homeVenues, neutral)).toBe(false);
    expect(isHostAtHome(homeVenues, g(6, 1, 2, 'Home A'))).toBe(true);
  });
});
