import { describe, expect, it } from 'vitest';
import { GameEngine, maxNodeLoad, ServerSize, skillRef, V1_NODE_IDS } from '../../core';
import { GameProgressionProjector } from '../game-progression-projector';

describe('GameProgressionProjector', () => {
  it('projects the complete initial technology, skill, and feature catalogs', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const result = new GameProgressionProjector(engine).project(engine.snapshot);

    expect(result.technologies.map(({ id }) => id)).toEqual([
      'REDIS', 'SQS', 'RABBITMQ', 'KAFKA', 'ALB', 'OBJECT_STORAGE',
    ]);
    expect(result.technologies.find(({ id }) => id === 'REDIS')?.preview).toBe('DB 0% → 0%');
    expect(result.technologies.find(({ id }) => id === 'SQS')?.preview).toBe('App 0% → 0% · Async 분리');
    expect(result.skills.some(({ key }) => key === 'fundamental:NETWORK')).toBe(true);
    expect(result.features).toHaveLength(10);
  });

  it('rejects a stale snapshot before reading live progression state', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    for (let day = 0; day < 30 && !engine.launched; day += 1) engine.advanceDay();
    const captured = engine.snapshot;

    engine.resizeInfrastructureNode(V1_NODE_IDS.database('POSTGRESQL'), ServerSize.XLARGE);

    expect(maxNodeLoad(engine.snapshot.load, { nodeKind: 'DATABASE' })!.loadRatio).not.toBe(maxNodeLoad(captured.load, { nodeKind: 'DATABASE' })!.loadRatio);
    expect(() => new GameProgressionProjector(engine).project(captured))
      .toThrow('GameProgressionProjector requires the current engine snapshot');
  });

  it('rejects a stale snapshot after same-day learning starts without refreshing load', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    for (let day = 0; day < 10; day += 1) engine.advanceDay();
    const captured = engine.snapshot;

    engine.startLearning(skillRef.fundamental('NETWORK'));

    expect(engine.snapshot.load).toBe(captured.load);
    expect(() => new GameProgressionProjector(engine).project(captured))
      .toThrow('GameProgressionProjector requires the current engine snapshot');
  });

  it('rejects a stale snapshot after same-day technology construction starts without refreshing load', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    engine.developer.get(skillRef.fundamental('NETWORK')).setLevel(2);
    engine.developer.get(skillRef.fundamental('DATABASE')).setLevel(2);
    const captured = engine.snapshot;

    engine.startTechnologyBuild('REDIS');

    expect(engine.snapshot.load).toBe(captured.load);
    expect(() => new GameProgressionProjector(engine).project(captured))
      .toThrow('GameProgressionProjector requires the current engine snapshot');
  });
});
