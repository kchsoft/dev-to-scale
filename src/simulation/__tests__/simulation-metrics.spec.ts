import { describe, expect, it } from 'vitest';
import { SimulationMetricsCollector } from '../simulation-metrics';

describe('simulation metrics', () => {
  it('uses exact failure and overload thresholds', () => {
    const metrics = new SimulationMetricsCollector(1_000_000);

    metrics.recordOperationalDay({ failureRate: 0.01, effectiveRatios: [0.8, 1] });
    metrics.recordOperationalDay({ failureRate: 0.10, effectiveRatios: [1.01, 0.4] });
    metrics.recordOperationalDay({ failureRate: 0, effectiveRatios: [2] });

    expect(metrics.failureDays).toBe(2);
    expect(metrics.severeFailureDays).toBe(1);
    expect(metrics.cumulativeFailureBurden).toBeCloseTo(0.11);
    expect(metrics.overloadDays).toBe(2);
  });

  it('counts premature raw capacity actions only below 70 percent without an active viral spike', () => {
    const metrics = new SimulationMetricsCollector(1_000_000);

    metrics.recordCapacityAction({ targetEffectiveRatio: 0.69, viralActive: false });
    metrics.recordCapacityAction({ targetEffectiveRatio: 0.70, viralActive: false });
    metrics.recordCapacityAction({ targetEffectiveRatio: 0.20, viralActive: true });

    expect(metrics.prematureCapacityActions).toBe(1);
  });

  it('counts expanded node-days only below 50 percent', () => {
    const metrics = new SimulationMetricsCollector(1_000_000);

    metrics.recordExpandedNodeDay(0.49);
    metrics.recordExpandedNodeDay(0.50);
    metrics.recordExpandedNodeDay(0.10);

    expect(metrics.lowUtilizationExpandedNodeDays).toBe(2);
  });

  it('records daily infrastructure cost exposure from monthly cost', () => {
    const metrics = new SimulationMetricsCollector(1_000_000);

    metrics.recordInfrastructureExposure(300_000);

    expect(metrics.infrastructureCostExposure).toBe(10_000);
  });

  it('tracks peak progression, missing required dependency days, and peak monthly revenue', () => {
    const metrics = new SimulationMetricsCollector(1_000_000);

    metrics.recordProgressionDay({ dau: 100, completedFeatureCount: 1, missingRequiredDependency: false });
    metrics.recordProgressionDay({ dau: 350, completedFeatureCount: 3, missingRequiredDependency: true });
    metrics.recordProgressionDay({ dau: 300, completedFeatureCount: 2, missingRequiredDependency: true });
    metrics.recordMonthlyRevenue(1_000_000);
    metrics.recordMonthlyRevenue(900_000);
    metrics.recordMonthlyRevenue(1_800_000);

    expect(metrics.peakDau).toBe(350);
    expect(metrics.completedFeatureCount).toBe(3);
    expect(metrics.missingRequiredDependencyDays).toBe(2);
    expect(metrics.peakMonthlyRevenue).toBe(1_800_000);
  });

  it('deduplicates incident ids and monthly settlements while tracking minimum cash', () => {
    const metrics = new SimulationMetricsCollector(1_000_000);

    metrics.recordIncidentIds(['a', 'b', 'a']);
    metrics.recordIncidentIds(['b', 'c']);
    metrics.recordSettlement(1, 300_000);
    metrics.recordSettlement(1, 300_000);
    metrics.recordSettlement(2, 400_000);
    metrics.recordCash(800_000);
    metrics.recordCash(900_000);
    metrics.recordCash(650_000);

    expect(metrics.incidentCount).toBe(3);
    expect(metrics.settledInfrastructureSpend).toBe(700_000);
    expect(metrics.minimumCash).toBe(650_000);
  });
});
