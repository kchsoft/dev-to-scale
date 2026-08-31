import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../../core/node-load';
import type { SimulationAction } from '../balance-action';
import type {
  ApmBalanceObservation,
  BalanceNodeObservation,
  BalanceTechnologyOption,
  MetricsBalanceObservation,
  OracleBalanceObservation,
  OracleExactPressure,
} from '../balance-observation';
import { BALANCE_STRATEGIES } from '../strategy-registry';

const TECHNOLOGIES: readonly BalanceTechnologyOption[] = Object.freeze([
  { id: 'REDIS', buildCost: 300_000, monthlyCost: 100_000, deployed: false, available: true },
  { id: 'SQS', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
  { id: 'RABBITMQ', buildCost: 500_000, monthlyCost: 150_000, deployed: false, available: false },
  { id: 'KAFKA', buildCost: 1_500_000, monthlyCost: 350_000, deployed: false, available: false },
  { id: 'ALB', buildCost: 150_000, monthlyCost: 100_000, deployed: false, available: true },
  { id: 'OBJECT_STORAGE', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
]);

const context = Object.freeze({ protectedLearningReserve: 0 });

function dbNode(): BalanceNodeObservation {
  return Object.freeze({
    nodeId: 'db',
    kind: 'DATABASE',
    productId: 'POSTGRESQL',
    size: ServerSize.SMALL,
    monthlyCost: 100_000,
    aggregatePercent: 40,
    effectivePercent: 40,
    hardLimitPercent: 100,
    status: 'NORMAL',
    scaleOut: Object.freeze({
      kind: 'READ_REPLICA',
      count: 0,
      maxCount: 3,
      available: true,
      reason: null,
    }),
  });
}

function projectedDbIo(percent: number) {
  return Object.freeze({
    nodeId: 'db',
    nodeKind: 'DATABASE' as const,
    resourceKind: 'IO' as const,
    percent,
    effectivePercent: percent,
    hardLimitPercent: 100,
    status: percent > 100 ? 'OVERLOAD' as const : percent >= 70 ? 'WARNING' as const : 'NORMAL' as const,
  });
}

function diagnosis(percent: number) {
  const ratio = percent / 100;
  return Object.freeze({
    topBottleneck: Object.freeze({
      nodeId: 'db',
      nodeKind: 'database' as const,
      resourceKind: 'IO' as const,
      nominalRatio: ratio,
      effectiveRatio: ratio,
      percent,
      effectivePercent: percent,
      hardLimitPercent: 100,
      capacityFailurePercent: 0,
      status: percent > 100 ? 'OVERLOAD' as const : percent >= 70 ? 'WARNING' as const : 'NORMAL' as const,
      label: 'PostgreSQL I/O',
    }),
    text: 'Projected PostgreSQL I/O bottleneck',
  });
}

function common() {
  return Object.freeze({
    frameworkId: 'SPRING_BOOT' as const,
    databaseId: 'POSTGRESQL' as const,
    day: 300,
    dau: 500_000,
    cash: 10_000_000,
    monthlyInfrastructureCost: 100_000,
    failureRate: 0,
    requiredDependencyGaps: Object.freeze([]),
    pendingFeature: Object.freeze({
      id: 'SEARCH' as const,
      estimatedRemainingDays: 3,
      requiredResourceRoles: Object.freeze([]),
    }),
    upcomingRequiredDependencyGaps: Object.freeze([]),
    serviceHealth: 'HEALTHY' as const,
    growthEvent: null,
    currentTechnologyBuildId: null,
    deployedTechnologies: Object.freeze([]),
    technologyOptions: TECHNOLOGIES,
    nodes: Object.freeze([dbNode()]),
  });
}

function metricsObservation(percent: number): MetricsBalanceObservation {
  return Object.freeze({
    ...common(),
    level: 'METRICS' as const,
    resourceLoads: Object.freeze([projectedDbIo(40)]),
    releasePreview: Object.freeze({
      resourceLoads: Object.freeze([projectedDbIo(percent)]),
      maxEffectivePercent: percent,
    }),
  });
}

function apmObservation(percent: number): ApmBalanceObservation {
  return Object.freeze({
    ...common(),
    level: 'APM' as const,
    resourceLoads: Object.freeze([projectedDbIo(40)]),
    diagnosis: diagnosis(40),
    releasePreview: Object.freeze({
      resourceLoads: Object.freeze([projectedDbIo(percent)]),
      maxEffectivePercent: percent,
      diagnosis: diagnosis(percent),
    }),
  });
}

function exactDbIo(ratio: number): OracleExactPressure {
  return Object.freeze({
    nodeId: 'db',
    nodeKind: 'DATABASE',
    resourceKind: 'IO',
    demand: ratio,
    nominalCapacity: 1,
    effectiveCapacity: 1,
    nominalRatio: ratio,
    effectiveRatio: ratio,
  });
}

function load(ratio: number) {
  return Object.freeze({
    failureRate: 0,
    nodeLoads: Object.freeze([
      createNodeLoadSnapshot('db', 'DATABASE', [createNodeResourceLoad('IO', ratio, 1, 1)]),
    ]),
    requestTraces: Object.freeze([]),
  });
}

function oracleObservation(ratio: number): OracleBalanceObservation {
  const percent = Math.round(ratio * 100);
  return Object.freeze({
    ...common(),
    level: 'ORACLE' as const,
    resourceLoads: Object.freeze([projectedDbIo(40)]),
    diagnosis: diagnosis(40),
    exactPressures: Object.freeze([exactDbIo(0.4)]),
    workloadTags: Object.freeze(['READ_HEAVY'] as const),
    releasePreview: Object.freeze({
      resourceLoads: Object.freeze([projectedDbIo(percent)]),
      maxEffectivePercent: percent,
      diagnosis: diagnosis(percent),
      exactPressures: Object.freeze([exactDbIo(ratio)]),
    }),
    previewPort: Object.freeze({
      previewTechnology: () => load(0.7),
      previewResize: () => load(0.7),
      previewScaleOut: () => load(0.7),
      previewReleaseAction: (_action: SimulationAction) => load(0.7),
      projectedMonthlyCost: () => 200_000,
      technologyReadyForRelease: () => true,
    }),
  });
}

function expectReadiness(action: SimulationAction | null): void {
  expect(action).not.toBeNull();
  expect(action).toMatchObject({ intent: 'RELEASE_READINESS_CAPACITY' });
}

describe('bounded growth-aware release readiness', () => {
  it('lets METRICS prepare when an 82 percent preview has three growth days before release', () => {
    expectReadiness(BALANCE_STRATEGIES.METRICS_AWARE.decide(metricsObservation(82), context));
  });

  it('lets APM prepare the diagnosed resource when an 82 percent preview has three growth days before release', () => {
    expectReadiness(BALANCE_STRATEGIES.APM_AWARE.decide(apmObservation(82), context));
  });

  it('lets ORACLE prepare when exact 0.82 projected pressure has three growth days before release', () => {
    expectReadiness(BALANCE_STRATEGIES.ORACLE.decide(oracleObservation(0.82), context));
  });

  it('keeps a 79 percent preview below the bounded three-day forecast boundary', () => {
    expect(BALANCE_STRATEGIES.METRICS_AWARE.decide(metricsObservation(79), context)).toMatchObject({
      type: 'NO_OP',
    });
  });
});
