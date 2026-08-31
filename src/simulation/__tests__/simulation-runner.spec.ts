import { describe, expect, it, vi } from 'vitest';
import type { BalanceScenario } from '../balance-scenario';
import { SimulationMetricsCollector } from '../simulation-metrics';
import { BALANCE_DAY_LIMIT, runBalanceScenario } from '../simulation-runner';

const scenario: BalanceScenario = {
  frameworkId: 'SPRING_BOOT',
  databaseId: 'POSTGRESQL',
  seed: 17,
  strategyId: 'APM_AWARE',
};

describe('balance simulation runner', () => {
  it('repeats the same scenario identically', () => {
    expect(runBalanceScenario(scenario)).toEqual(runBalanceScenario(scenario));
  }, 10_000);

  it('never performs more than the fixed 1080 day limit', () => {
    expect(BALANCE_DAY_LIMIT).toBe(1_080);
    expect(runBalanceScenario(scenario).daysPlayed).toBeLessThanOrEqual(BALANCE_DAY_LIMIT);
  });

  it('keeps optional trace collection observational only', () => {
    const withoutTrace = runBalanceScenario(scenario);
    const withTrace = runBalanceScenario(scenario, { trace: true });

    expect(withTrace.result).toEqual(withoutTrace);
    expect(withTrace.trace.length).toBeGreaterThan(0);
    expect(withTrace.trace[0]).toEqual(expect.objectContaining({
      completedFeatureCount: expect.any(Number),
      lastSettlementMonth: null,
      lastSettlementRevenue: null,
    }));
  });

  it('opens one seven-day metrics window for every completed community feature', () => {
    const beginReleaseWindow = vi.spyOn(
      SimulationMetricsCollector.prototype,
      'beginFeatureReleaseWindow',
    );

    try {
      const result = runBalanceScenario(scenario);
      expect(result.completedFeatureCount).toBeGreaterThan(0);
      expect(beginReleaseWindow).toHaveBeenCalledTimes(result.completedFeatureCount);
    } finally {
      beginReleaseWindow.mockRestore();
    }
  });

  it('returns final SLO qualification diagnostics from the core exit-readiness state', () => {
    const result = runBalanceScenario(scenario);

    expect(result.finalSloSampleCount).toBe(30);
    expect(result.finalSloHealthyDays).toBeGreaterThanOrEqual(0);
    expect(result.finalSloHealthyDays).toBeLessThanOrEqual(result.finalSloSampleCount);
    expect(result.finalSloAverageFailureRate).toBeGreaterThanOrEqual(0);
    expect(result.finalSloAverageFailureRate).toBeLessThanOrEqual(1);
    expect(result.finalSloMissingRequiredDependencyDays).toBeGreaterThanOrEqual(0);
    expect(result.revenueTargetMetButSloFailedSettlements).toBeGreaterThanOrEqual(0);
  });
});
