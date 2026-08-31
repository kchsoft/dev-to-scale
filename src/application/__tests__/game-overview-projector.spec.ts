import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
import { GameOverviewProjector } from '../game-overview-projector';

describe('GameOverviewProjector', () => {
  it('projects initial HUD, work queue, operations, and exit readiness from one snapshot', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const snapshot = engine.snapshot;
    const result = new GameOverviewProjector(engine).project(snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 225_000,
      monthlyProfit: -225_000,
    });

    expect(result.hud).toMatchObject({ day: 1, month: 1, dayOfMonth: 1, cash: 3_000_000 });
    expect(result.hud.exitReadiness.monthlyRevenueTarget).toBe(143_000_000);
    expect(result.hud.exitReadiness.slo.sampleCount).toBe(snapshot.exitReadiness.slo.sampleCount);
    expect(result.hud.exitReadiness.qualified).toBe(snapshot.exitReadiness.qualified);
    expect(result.workSlots.find(({ id }) => id === 'feature')).toMatchObject({ title: '게시글', active: true });
    expect(result.operations.currentFeature?.id).toBe('COMMUNITY_MVP');
    expect(result.operations.currentTechnologyBuild).toBeNull();
  });
});
