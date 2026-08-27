import { describe, expect, it } from 'vitest';
import { GameEngine, ServerSize } from '../../core';
import { GameProgressionProjector } from '../game-progression-projector';

describe('GameProgressionProjector', () => {
  it('projects the complete initial technology, skill, and feature catalogs', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const result = new GameProgressionProjector(engine).project(engine.snapshot);

    expect(result.technologies.map(({ id }) => id)).toEqual([
      'REDIS', 'SQS', 'RABBITMQ', 'KAFKA', 'ALB', 'OBJECT_STORAGE',
    ]);
    expect(result.technologies.find(({ id }) => id === 'REDIS')?.preview).toMatch(/^DB \d+% → \d+%$/);
    expect(result.skills.some(({ key }) => key === 'fundamental:NETWORK')).toBe(true);
    expect(result.features).toHaveLength(10);
  });

  it('uses the captured snapshot as the technology preview baseline after engine state changes', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    for (let day = 0; day < 30 && !engine.launched; day += 1) engine.advanceDay();
    const captured = engine.snapshot;

    engine.scaleDatabase(ServerSize.XLARGE);

    expect(engine.snapshot.load.dbRatio).not.toBe(captured.load.dbRatio);
    expect(new GameProgressionProjector(engine).project(captured).technologies.find(({ id }) => id === 'REDIS')?.preview)
      .toMatch(new RegExp(`^DB ${Math.round(captured.load.dbRatio * 100)}% → \\d+%$`));
  });
});
