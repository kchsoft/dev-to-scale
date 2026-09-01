import { describe, expect, it } from 'vitest';
import { GAME_NAV_ITEMS } from '../game-navigation';

describe('game navigation', () => {
  it('keeps only service, build, and report as the primary player vocabulary', () => {
    expect(GAME_NAV_ITEMS.map(([id]) => id)).toEqual(['service', 'development', 'report']);
    expect(GAME_NAV_ITEMS.map(([, , label]) => label)).toEqual(['SERVICE', 'BUILD', 'REPORT']);
  });
});
