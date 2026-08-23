import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB, hashFor, isLiveOnly, routeFromHash, tabFromHash } from './nav';

describe('routeFromHash', () => {
  it('reads a plain screen route', () => {
    expect(routeFromHash('#/ladder')).toEqual({ tab: 'ladder', gameId: null });
  });

  it('reads an open game off the route', () => {
    expect(routeFromHash('#/week/g4321')).toEqual({ tab: 'week', gameId: 4321 });
  });

  it('ignores a game segment it cannot read, keeping the screen', () => {
    // a stale or hand-edited link should still land somewhere real
    expect(routeFromHash('#/fixtures/nonsense')).toEqual({ tab: 'fixtures', gameId: null });
  });

  it('rejects a hash that names no screen we have', () => {
    expect(routeFromHash('#/nope')).toBeNull();
    expect(routeFromHash('')).toBeNull();
  });
});

describe('hashFor', () => {
  it('round-trips a screen', () => {
    expect(routeFromHash(hashFor('odds'))).toEqual({ tab: 'odds', gameId: null });
  });

  it('round-trips a screen with an open game', () => {
    expect(routeFromHash(hashFor('finals', 77))).toEqual({ tab: 'finals', gameId: 77 });
  });

  it('only ever writes the current name for a renamed screen', () => {
    expect(hashFor('finals')).toBe('#/finals');
  });
});

describe('renamed screens', () => {
  it('still resolves a link saved under the old name', () => {
    // the finals screen used to be "bracket"; saved links and an installed
    // PWA's start URL must not break because the app renamed a tab
    expect(routeFromHash('#/bracket')).toEqual({ tab: 'finals', gameId: null });
    expect(routeFromHash('#/bracket/g12')).toEqual({ tab: 'finals', gameId: 12 });
  });
});

describe('screens', () => {
  it('keeps tabFromHash working for callers that only want the screen', () => {
    expect(tabFromHash('#/club/g9')).toBe('club');
    expect(tabFromHash('#/junk')).toBeNull();
  });

  it('marks the live-only screens', () => {
    expect(isLiveOnly('week')).toBe(true);
    expect(isLiveOnly('club')).toBe(true);
    expect(isLiveOnly('ladder')).toBe(false);
    expect(isLiveOnly(DEFAULT_TAB)).toBe(true);
  });
});
