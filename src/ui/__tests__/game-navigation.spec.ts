import { describe, expect, it } from 'vitest';
import { GAME_NAV_ITEMS } from '../game-navigation';

describe('game navigation', () => {
  it('keeps only service, development, and report as primary tabs', () => {
    expect(GAME_NAV_ITEMS.map(([id]) => id)).toEqual(['service', 'development', 'report']);
    expect(GAME_NAV_ITEMS.map(([, , label]) => label)).toEqual(['서비스', '개발', '리포트']);
  });
});
