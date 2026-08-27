import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
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
});
