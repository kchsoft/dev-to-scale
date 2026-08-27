import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
import { GameServiceProjector } from '../game-service-projector';

describe('GameServiceProjector', () => {
  it('projects canonical topology, operations, alerts, and costs', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const result = new GameServiceProjector(engine).project(engine.snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 225_000,
      monthlyProfit: -225_000,
    });

    expect(result.topology.nodes).toContainEqual(expect.objectContaining({
      id: 'v1:storage:OBJECT_STORAGE', name: 'Local Storage', kind: 'object-storage',
    }));
    expect(result.service.observability.level).toBe('BASIC');
    expect(result.alerts.some(({ id }) => id === 'bootstrap')).toBe(true);
    expect(result.infrastructureCosts.addDbReplicaMonthlyCostDelta).toBe(120_000);
  });

  it('preserves the launched canonical request trace', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 10 });
    for (let day = 0; day < 30 && !engine.launched; day += 1) engine.advanceDay();
    const result = new GameServiceProjector(engine).project(engine.snapshot, {
      monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0,
    });

    expect(result.topology.traces[0]).toMatchObject({
      id: 'COMMUNITY_MVP', successPercent: 100, failureNodeId: null,
    });
  });
});
