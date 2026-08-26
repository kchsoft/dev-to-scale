import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game-engine';
import { RandomSource } from '../growth';

class SafePositiveRandom implements RandomSource {
  private index = 0;
  private readonly cycle = [0.99, 0, 0, 0.99, 0.99];

  next(): number {
    const value = this.cycle[this.index % this.cycle.length];
    this.index += 1;
    return value;
  }
}

describe('game engine orchestration', () => {
  it('launches the community after bootstrap work completes', () => {
    const game = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 10,
      random: new SafePositiveRandom(),
    });

    for (let day = 0; day < 17; day += 1) game.advanceDay();
    expect(game.launched).toBe(false);

    game.advanceDay();
    expect(game.launched).toBe(true);
    expect(game.dau).toBe(80);
    expect(game.snapshot.currentFeature).toBeNull();
  });

  it('automatically starts the next seeded feature when its DAU threshold is reached', () => {
    const game = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 42,
      random: new SafePositiveRandom(),
    });

    for (let day = 0; day < 18; day += 1) game.advanceDay();
    for (let day = 0; day < 30 && game.snapshot.currentFeature === null; day += 1) game.advanceDay();

    expect(game.dau).toBeGreaterThanOrEqual(100);
    expect(game.snapshot.currentFeature?.id).toBe(game.progression.featureOrder[0]);
  });

  it('keeps clock speed concerns outside the domain by exposing only advanceDay', () => {
    const game = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 1,
      random: new SafePositiveRandom(),
    });

    const before = game.day;
    game.advanceDay();
    expect(game.day).toBe(before + 1);
  });
});
