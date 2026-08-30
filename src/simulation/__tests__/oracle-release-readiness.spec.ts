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

function oracleObservation(
  previewReleaseAction: (action: SimulationAction) => ReturnType<typeof load>,
  projectedMonthlyCost: (action: SimulationAction) => number,
  releaseRatio = 1.1,
): OracleBalanceObservation {
  const db = dbNode();
  const releasePercent = Math.round(releaseRatio * 100);
  return Object.freeze({
    level: 'ORACLE',
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    day: 300,
    dau: 500_000,
    cash: 10_000_000,
    monthlyInfrastructureCost: 100_000,
    failureRate: 0,
    requiredDependencyGaps: Object.freeze([]),
    pendingFeature: Object.freeze({
      id: 'SEARCH',
      estimatedRemainingDays: 3,
      requiredResourceRoles: Object.freeze([]),
    }),
    upcomingRequiredDependencyGaps: Object.freeze([]),
    serviceHealth: 'HEALTHY',
    growthEvent: null,
    currentTechnologyBuildId: null,
    deployedTechnologies: Object.freeze([]),
    technologyOptions: TECHNOLOGIES,
    nodes: Object.freeze([db]),
    resourceLoads: Object.freeze([]),
    diagnosis: Object.freeze({ topBottleneck: null, text: null }),
    exactPressures: Object.freeze([exactDbIo(0.4)]),
    workloadTags: Object.freeze(['READ_HEAVY']),
    releasePreview: Object.freeze({
      resourceLoads: Object.freeze([Object.freeze({
        nodeId: 'db',
        nodeKind: 'DATABASE',
        resourceKind: 'IO',
        percent: releasePercent,
        effectivePercent: releasePercent,
        hardLimitPercent: 100,
        status: releaseRatio > 1 ? 'OVERLOAD' : 'WARNING',
      })]),
      maxEffectivePercent: releasePercent,
      diagnosis: Object.freeze({ topBottleneck: null, text: null }),
      exactPressures: Object.freeze([exactDbIo(releaseRatio)]),
    }),
    previewPort: Object.freeze({
      previewTechnology: () => load(0.4),
      previewResize: () => load(0.4),
      previewScaleOut: () => load(0.4),
      previewReleaseAction,
      projectedMonthlyCost,
    }),
  });
}

describe('ORACLE release readiness', () => {
  it('prefers the later affordable candidate when it is the only one that clears the 0.85 release target', () => {
    const observation = oracleObservation(
      (action) => {
        if (action.type === 'START_TECHNOLOGY_BUILD' && action.technologyId === 'REDIS') return load(0.9);
        if (action.type === 'SCALE_OUT_NODE') return load(0.8);
        if (action.type === 'RESIZE_NODE') return load(0.95);
        return load(1.1);
      },
      (action) => action.type === 'RESIZE_NODE' ? 180_000 : 200_000,
    );

    expect(BALANCE_STRATEGIES.ORACLE.decide(observation, context)).toMatchObject({
      type: 'SCALE_OUT_NODE',
      nodeId: 'db',
      intent: 'RELEASE_READINESS_CAPACITY',
    });
  });

  it('uses relief per one-month cost and deterministic candidate order when no action clears 0.85', () => {
    const observation = oracleObservation(
      (action) => {
        if (action.type === 'START_TECHNOLOGY_BUILD' && action.technologyId === 'REDIS') return load(0.875);
        if (action.type === 'SCALE_OUT_NODE') return load(0.96875);
        if (action.type === 'RESIZE_NODE') return load(0.984375);
        return load(1);
      },
      (action) => {
        if (action.type === 'START_TECHNOLOGY_BUILD') return 200_000;
        if (action.type === 'SCALE_OUT_NODE') return 200_000;
        return 180_000;
      },
      1,
    );

    expect(BALANCE_STRATEGIES.ORACLE.decide(observation, context)).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'REDIS',
      intent: 'RELEASE_READINESS_CAPACITY',
    });
  });
});
