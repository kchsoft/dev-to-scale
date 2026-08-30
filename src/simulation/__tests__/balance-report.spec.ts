import { describe, expect, it } from 'vitest';
import type { BalanceRunResult } from '../simulation-metrics';
import {
  PRIMARY_STRATEGY_PAIRS,
  buildPairedComparisons,
  serializeRunsCsv,
  summarizeBalanceRuns,
  summarizeNumbers,
} from '../balance-report';

function run(overrides: Partial<BalanceRunResult> = {}): BalanceRunResult {
  return {
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 1,
    strategyId: 'APM_AWARE',
    terminalStatus: 'WON',
    daysPlayed: 300,
    finalDau: 10_000_000,
    peakDau: 12_000_000,
    completedFeatureCount: 10,
    missingRequiredDependencyDays: 4,
    peakMonthlyRevenue: 950_000_000,
    endingCash: 10_000_000,
    minimumCash: 500_000,
    failureDays: 4,
    severeFailureDays: 1,
    cumulativeFailureBurden: 0.2,
    overloadDays: 10,
    incidentCount: 3,
    technologyBuildSpend: 500_000,
    learningSpend: 200_000,
    burstSpend: 0,
    settledInfrastructureSpend: 2_000_000,
    infrastructureCostExposure: 2_100_000,
    resizeCount: 3,
    appScaleOutCount: 1,
    dbReplicaActionCount: 1,
    prematureCapacityActions: 0,
    lowUtilizationExpandedNodeDays: 12,
    viralRideCount: 2,
    viralThrottleCount: 1,
    viralBurstCount: 0,
    ...overrides,
  };
}

describe('balance report', () => {
  it('uses conventional median and nearest-rank quartiles', () => {
    expect(summarizeNumbers([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({
      mean: 4.5,
      median: 4.5,
      p25: 2,
      p75: 6,
    });
  });

  it('builds all approved grouping levels with terminal counts and rates', () => {
    const results = [
      run(),
      run({ seed: 2, strategyId: 'YOLO_SCALE', terminalStatus: 'BANKRUPT' }),
      run({ frameworkId: 'NESTJS', databaseId: 'MYSQL', seed: 1, terminalStatus: 'TIMEOUT' }),
    ];

    const summary = summarizeBalanceRuns(results);

    expect(summary.runCount).toBe(3);
    expect(summary.groups.all).toHaveLength(1);
    expect(summary.groups.strategy).toHaveLength(2);
    expect(summary.groups.framework).toHaveLength(2);
    expect(summary.groups.database).toHaveLength(2);
    expect(summary.groups.frameworkDatabase).toHaveLength(2);
    expect(summary.groups.strategyFrameworkDatabase).toHaveLength(3);
    expect(summary.groups.all[0]).toMatchObject({
      runs: 3,
      won: 1,
      bankrupt: 1,
      timeout: 1,
      winRate: 1 / 3,
      bankruptcyRate: 1 / 3,
      timeoutRate: 1 / 3,
    });
  });

  it('locks the exact five primary strategy pairs', () => {
    expect(PRIMARY_STRATEGY_PAIRS).toEqual([
      ['APM_AWARE', 'YOLO_SCALE'],
      ['APM_AWARE', 'METRICS_AWARE'],
      ['METRICS_AWARE', 'REACTIVE_BASIC'],
      ['ORACLE', 'APM_AWARE'],
      ['CHEAPSKATE', 'APM_AWARE'],
    ]);
  });

  it('pairs only identical framework, database, and seed scenarios', () => {
    const results = [
      run({ strategyId: 'APM_AWARE', daysPlayed: 200, infrastructureCostExposure: 100, cumulativeFailureBurden: 0.1 }),
      run({ strategyId: 'YOLO_SCALE', daysPlayed: 250, infrastructureCostExposure: 160, cumulativeFailureBurden: 0.3, prematureCapacityActions: 4 }),
      run({ seed: 2, strategyId: 'YOLO_SCALE', infrastructureCostExposure: 999 }),
    ];

    const pairs = buildPairedComparisons(results);
    const pair = pairs.find(({ leftStrategyId, rightStrategyId }) => (
      leftStrategyId === 'APM_AWARE' && rightStrategyId === 'YOLO_SCALE'
    ));

    expect(pair).toMatchObject({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 1,
      terminalOutcome: 'TIE',
      winDaysDelta: -50,
      infrastructureCostExposureDelta: -60,
      prematureCapacityActionsDelta: -4,
      lowUtilizationExpandedNodeDaysDelta: 0,
    });
    expect(pair?.failureBurdenDelta).toBeCloseTo(-0.2);
    expect(pairs.some(({ seed }) => seed === 2)).toBe(false);
  });

  it('uses terminal outcome precedence before win-day comparison', () => {
    const pairs = buildPairedComparisons([
      run({ strategyId: 'APM_AWARE', terminalStatus: 'WON', daysPlayed: 400 }),
      run({ strategyId: 'YOLO_SCALE', terminalStatus: 'TIMEOUT', daysPlayed: 100 }),
    ]);

    expect(pairs[0]).toMatchObject({ terminalOutcome: 'LEFT_BETTER', winDaysDelta: null });
  });

  it('serializes runs with a stable explicit CSV column order', () => {
    const csv = serializeRunsCsv([run()]);
    const lines = csv.trimEnd().split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('frameworkId,databaseId,seed,strategyId,terminalStatus,daysPlayed,finalDau,peakDau,completedFeatureCount,missingRequiredDependencyDays,peakMonthlyRevenue,endingCash,minimumCash,failureDays,severeFailureDays,cumulativeFailureBurden,overloadDays,incidentCount,technologyBuildSpend,learningSpend,burstSpend,settledInfrastructureSpend,infrastructureCostExposure,resizeCount,appScaleOutCount,dbReplicaActionCount,prematureCapacityActions,lowUtilizationExpandedNodeDays,viralRideCount,viralThrottleCount,viralBurstCount');
    expect(lines[1].startsWith('SPRING_BOOT,POSTGRESQL,1,APM_AWARE,WON,300,10000000,12000000,10,4,950000000')).toBe(true);
  });

  it('returns JSON-serializable plain report objects', () => {
    const summary = summarizeBalanceRuns([run()]);
    expect(() => JSON.stringify(summary)).not.toThrow();
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });
});
