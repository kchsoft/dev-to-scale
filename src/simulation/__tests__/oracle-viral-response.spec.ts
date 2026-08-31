import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../../core/node-load';
import type { SimulationAction } from '../balance-action';
import type {
  BalanceNodeObservation,
  BalanceTechnologyOption,
  OracleBalanceObservation,
  OracleExactPressure,
} from '../balance-observation';
import { BALANCE_STRATEGIES } from '../strategy-registry';

const context = Object.freeze({ protectedLearningReserve: 0 });

const TECHNOLOGIES: readonly BalanceTechnologyOption[] = Object.freeze([
  { id: 'REDIS', buildCost: 300_000, monthlyCost: 100_000, deployed: false, available: true },
  { id: 'SQS', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
  { id: 'RABBITMQ', buildCost: 500_000, monthlyCost: 150_000, deployed: false, available: false },
  { id: 'KAFKA', buildCost: 1_500_000, monthlyCost: 350_000, deployed: false, available: false },
  { id: 'ALB', buildCost: 150_000, monthlyCost: 100_000, deployed: false, available: true },
  { id: 'OBJECT_STORAGE', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
]);

function load(ratio: number) {
  return Object.freeze({
    failureRate: 0,
    nodeLoads: Object.freeze([
      createNodeLoadSnapshot('app', 'SERVER_GROUP', [createNodeResourceLoad('IO', ratio, 1, 1)]),
    ]),
    requestTraces: Object.freeze([]),
  });
}

function oracleViralObservation(effectivePercent: number): OracleBalanceObservation {
  const ratio = effectivePercent / 100;
  const app: BalanceNodeObservation = Object.freeze({
    nodeId: 'app',
    kind: 'SERVER_GROUP',
    productId: 'SPRING_BOOT',
    size: ServerSize.MEDIUM,
    monthlyCost: 200_000,
    aggregatePercent: effectivePercent,
    effectivePercent,
    hardLimitPercent: 100,
    status: effectivePercent > 100 ? 'OVERLOAD' : 'WARNING',
    scaleOut: Object.freeze({
      kind: 'INSTANCE',
      count: 1,
      maxCount: 10,
      available: true,
      reason: null,
    }),
  });
  const pressure: OracleExactPressure = Object.freeze({
    nodeId: 'app',
    nodeKind: 'SERVER_GROUP',
    resourceKind: 'IO',
    demand: ratio,
    nominalCapacity: 1,
    effectiveCapacity: 1,
    nominalRatio: ratio,
    effectiveRatio: ratio,
  });
  return Object.freeze({
    level: 'ORACLE',
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    day: 368,
    dau: 70_000,
    cash: 10_000_000,
    monthlyInfrastructureCost: 200_000,
    failureRate: 0,
    requiredDependencyGaps: Object.freeze([]),
    pendingFeature: null,
    upcomingRequiredDependencyGaps: Object.freeze([]),
    serviceHealth: effectivePercent > 100 ? 'DEGRADED' : 'HEALTHY',
    growthEvent: Object.freeze({
      type: 'VIRAL',
      response: 'PENDING',
      trafficMultiplier: 1.8,
      loadMultiplier: 1.8,
      burstCost: 150_000,
    }),
    currentTechnologyBuildId: null,
    deployedTechnologies: Object.freeze([]),
    technologyOptions: TECHNOLOGIES,
    nodes: Object.freeze([app]),
    resourceLoads: Object.freeze([]),
    diagnosis: Object.freeze({ topBottleneck: null, text: null }),
    exactPressures: Object.freeze([pressure]),
    workloadTags: Object.freeze([]),
    releasePreview: null,
    previewPort: Object.freeze({
      previewTechnology: () => load(ratio),
      previewResize: () => load(ratio),
      previewScaleOut: () => load(ratio),
      previewReleaseAction: () => load(ratio),
      projectedMonthlyCost: (_action: SimulationAction) => 200_000,
    }),
  });
}

describe('ORACLE viral response', () => {
  it('throttles once exact live pressure is already beyond the hard limit even when burst is affordable', () => {
    expect(BALANCE_STRATEGIES.ORACLE.decideViral(oracleViralObservation(105), context)).toBe('THROTTLE');
  });

  it('uses burst inside the warning band to preserve growth without riding the full spike', () => {
    expect(BALANCE_STRATEGIES.ORACLE.decideViral(oracleViralObservation(90), context)).toBe('BURST');
  });
});
