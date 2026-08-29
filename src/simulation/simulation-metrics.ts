import type { DatabaseId } from '../core/database';
import type { FrameworkId } from '../core/feature';
import type { BalanceStrategyId } from './balance-scenario';

export type BalanceTerminalStatus = 'WON' | 'BANKRUPT' | 'TIMEOUT';

export interface BalanceRunResult {
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  seed: number;
  strategyId: BalanceStrategyId;
  terminalStatus: BalanceTerminalStatus;
  daysPlayed: number;
  finalDau: number;
  endingCash: number;
  minimumCash: number;
  failureDays: number;
  severeFailureDays: number;
  cumulativeFailureBurden: number;
  overloadDays: number;
  incidentCount: number;
  technologyBuildSpend: number;
  learningSpend: number;
  burstSpend: number;
  settledInfrastructureSpend: number;
  infrastructureCostExposure: number;
  resizeCount: number;
  appScaleOutCount: number;
  dbReplicaActionCount: number;
  prematureCapacityActions: number;
  lowUtilizationExpandedNodeDays: number;
  viralRideCount: number;
  viralThrottleCount: number;
  viralBurstCount: number;
}

export class SimulationMetricsCollector {
  minimumCash: number;
  failureDays = 0;
  severeFailureDays = 0;
  cumulativeFailureBurden = 0;
  overloadDays = 0;
  incidentCount = 0;
  technologyBuildSpend = 0;
  learningSpend = 0;
  burstSpend = 0;
  settledInfrastructureSpend = 0;
  infrastructureCostExposure = 0;
  resizeCount = 0;
  appScaleOutCount = 0;
  dbReplicaActionCount = 0;
  prematureCapacityActions = 0;
  lowUtilizationExpandedNodeDays = 0;
  viralRideCount = 0;
  viralThrottleCount = 0;
  viralBurstCount = 0;

  private readonly seenIncidentIds = new Set<string>();
  private readonly seenSettlementMonths = new Set<number>();

  constructor(initialCash: number) {
    this.minimumCash = initialCash;
  }

  recordCash(cash: number): void {
    this.minimumCash = Math.min(this.minimumCash, cash);
  }

  recordOperationalDay(input: {
    failureRate: number;
    effectiveRatios: readonly number[];
  }): void {
    if (input.failureRate > 0) this.failureDays += 1;
    if (input.failureRate >= 0.10) this.severeFailureDays += 1;
    this.cumulativeFailureBurden += input.failureRate;
    if (input.effectiveRatios.some((ratio) => ratio > 1)) this.overloadDays += 1;
  }

  recordCapacityAction(input: {
    targetEffectiveRatio: number;
    viralActive: boolean;
  }): void {
    if (input.targetEffectiveRatio < 0.70 && !input.viralActive) {
      this.prematureCapacityActions += 1;
    }
  }

  recordExpandedNodeDay(effectiveRatio: number): void {
    if (effectiveRatio < 0.50) this.lowUtilizationExpandedNodeDays += 1;
  }

  recordInfrastructureExposure(monthlyCost: number): void {
    this.infrastructureCostExposure += monthlyCost / 30;
  }

  recordIncidentIds(ids: readonly string[]): void {
    for (const id of ids) this.seenIncidentIds.add(id);
    this.incidentCount = this.seenIncidentIds.size;
  }

  recordSettlement(month: number, infrastructureCost: number): void {
    if (this.seenSettlementMonths.has(month)) return;
    this.seenSettlementMonths.add(month);
    this.settledInfrastructureSpend += infrastructureCost;
  }

  recordTechnologyBuildSpend(amount: number): void {
    this.technologyBuildSpend += Math.max(0, amount);
  }

  recordLearningSpend(amount: number): void {
    this.learningSpend += Math.max(0, amount);
  }

  recordBurstSpend(amount: number): void {
    this.burstSpend += Math.max(0, amount);
  }

  recordResize(): void {
    this.resizeCount += 1;
  }

  recordAppScaleOut(): void {
    this.appScaleOutCount += 1;
  }

  recordDbReplicaAction(): void {
    this.dbReplicaActionCount += 1;
  }

  recordViralResponse(response: 'RIDE' | 'THROTTLE' | 'BURST'): void {
    if (response === 'RIDE') this.viralRideCount += 1;
    if (response === 'THROTTLE') this.viralThrottleCount += 1;
    if (response === 'BURST') this.viralBurstCount += 1;
  }

  result(input: {
    frameworkId: FrameworkId;
    databaseId: DatabaseId;
    seed: number;
    strategyId: BalanceStrategyId;
    terminalStatus: BalanceTerminalStatus;
    daysPlayed: number;
    finalDau: number;
    endingCash: number;
  }): BalanceRunResult {
    return {
      ...input,
      minimumCash: this.minimumCash,
      failureDays: this.failureDays,
      severeFailureDays: this.severeFailureDays,
      cumulativeFailureBurden: this.cumulativeFailureBurden,
      overloadDays: this.overloadDays,
      incidentCount: this.incidentCount,
      technologyBuildSpend: this.technologyBuildSpend,
      learningSpend: this.learningSpend,
      burstSpend: this.burstSpend,
      settledInfrastructureSpend: this.settledInfrastructureSpend,
      infrastructureCostExposure: this.infrastructureCostExposure,
      resizeCount: this.resizeCount,
      appScaleOutCount: this.appScaleOutCount,
      dbReplicaActionCount: this.dbReplicaActionCount,
      prematureCapacityActions: this.prematureCapacityActions,
      lowUtilizationExpandedNodeDays: this.lowUtilizationExpandedNodeDays,
      viralRideCount: this.viralRideCount,
      viralThrottleCount: this.viralThrottleCount,
      viralBurstCount: this.viralBurstCount,
    };
  }
}
