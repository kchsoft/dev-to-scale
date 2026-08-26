import { describe, expect, it } from 'vitest';
import { COMMUNITY_FEATURES } from '../community';
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

  it('previews the same-day load impact of a feature before it is released', () => {
    const game = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 42,
      random: new SafePositiveRandom(),
    });

    for (let day = 0; day < 19; day += 1) game.advanceDay();
    const before = game.snapshot.load;
    const feature = COMMUNITY_FEATURES[game.progression.featureOrder[0]];
    const projected = game.previewLoadWithFeature(feature);

    expect(projected.appCpuDemand + projected.appIoDemand).toBeGreaterThan(before.appCpuDemand + before.appIoDemand);
    expect(projected.dbCpuDemand + projected.dbIoDemand).toBeGreaterThan(before.dbCpuDemand + before.dbIoDemand);
  });

  it('trades feature speed for tech debt and lets refactoring pay that debt down', () => {
    const game = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 42,
      random: new SafePositiveRandom(),
    });

    for (let day = 0; day < 18; day += 1) game.advanceDay();
    for (let day = 0; day < 30 && game.snapshot.currentFeature === null; day += 1) game.advanceDay();

    const beforeProgress = game.snapshot.currentFeature!.progress;
    const result = game.fastTrackCurrentFeature();
    const fastTracked = game.snapshot;

    expect(result.addedWork).toBeGreaterThan(0);
    expect(result.addedDebt).toBeGreaterThan(0);
    expect(fastTracked.currentFeature!.progress).toBeGreaterThan(beforeProgress);
    expect(fastTracked.techDebt.value).toBe(result.addedDebt);
    expect(fastTracked.techDebt.canFastTrack).toBe(false);

    game.startRefactor();
    const pausedProgress = game.snapshot.currentFeature!.progress;
    expect(game.snapshot.techDebt.remainingRefactorDays).toBe(5);

    for (let day = 0; day < 5; day += 1) {
      game.advanceDay();
      expect(game.snapshot.currentFeature?.progress).toBe(pausedProgress);
    }

    expect(game.snapshot.techDebt.refactoring).toBe(false);
    expect(game.snapshot.techDebt.value).toBe(0);
  });

  it('settles cash as day 30 completes and enters the next month at day 31', () => {
    const game = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 5,
      random: new SafePositiveRandom(),
    });

    for (let day = 0; day < 29; day += 1) game.advanceDay();
    expect(game.day).toBe(30);
    expect(game.snapshot.lastSettlement).toBeNull();

    game.advanceDay();
    expect(game.day).toBe(31);
    expect(game.snapshot.lastSettlement?.month).toBe(1);
    expect(game.snapshot.lastSettlement?.cashAfter).toBe(game.snapshot.cash);
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
