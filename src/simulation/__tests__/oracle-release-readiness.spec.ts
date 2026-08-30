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
import * as releaseReadiness from '../release-readiness';
import { BALANCE_STRATEGIES } from '../strategy-registry';

interface OracleReleaseReadinessModule {
  decideOraclePostReleaseStability?: (
    observation: OracleBalanceObservation,
    context: {
      readonly protectedLearningReserve: number;
      readonly postReleaseStabilityWindowActive?: boolean;
    },
  ) => SimulationAction | null;
}

const TECHNOLOGIES: readonly BalanceTechnologyOption[] = Object.freeze([
  { id: 'REDIS', buildCost: 300_000, monthlyCost: 100_000, deployed: false, available: true },
  { id: 'SQS', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
  { id: 'RABBITMQ', buildCost: 500_000, monthlyCost: 150_000, deployed: false, available: false },
  { id: 'KAFKA', buildCost: 1_500_000, monthlyCost: 350_000, deployed: false, available: false },
  { id: 'ALB', buildCost: 150_000, monthlyCost: 100_000, deployed: false, available: true },
  { id: 'OBJECT_STORAGE', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
]);

const context = Object.freeze({ protectedLearningReserve: 0 });
const activeContext = Object.freeze({
  protectedLearningReserve: 0,
  postReleaseStabilityWindowActive: true,
});

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
  liveRatio = 0.4,
  currentPreview: Readonly<{
    technology?: number;
    scaleOut?: number;
    resize?: number;
  }> = {},
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
    exactPressures: Object.freeze([exactDbIo(liveRatio)]),
    workloadTags: Object.freeze(['READ_HEAVY'] as const),
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
      previewTechnology: () => load(currentPreview.technology ?? 0.4),
      previewResize: () => load(currentPreview.resize ?? 0.4),
      previewScaleOut: () => load(currentPreview.scaleOut ?? 0.4),
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

  it('does not run the live 70 percent ORACLE watch outside an active release window', () => {
    const decideOraclePostReleaseStability = (releaseReadiness as OracleReleaseReadinessModule)
      .decideOraclePostReleaseStability;
    expect(typeof decideOraclePostReleaseStability).toBe('function');
    if (!decideOraclePostReleaseStability) return;

    const observation = oracleObservation(
      () => load(1.1),
      () => 200_000,
      1.1,
      0.9,
    );

    expect(decideOraclePostReleaseStability(observation, context)).toBeNull();
  });

  it('does not run the live ORACLE watch below 0.70 exact pressure', () => {
    const decideOraclePostReleaseStability = (releaseReadiness as OracleReleaseReadinessModule)
      .decideOraclePostReleaseStability;
    expect(typeof decideOraclePostReleaseStability).toBe('function');
    if (!decideOraclePostReleaseStability) return;

    const observation = oracleObservation(
      () => load(1.1),
      () => 200_000,
      1.1,
      0.69,
    );

    expect(decideOraclePostReleaseStability(observation, activeContext)).toBeNull();
  });

  it('uses current-live previews at exactly 0.70 and never calls previewReleaseAction', () => {
    const decideOraclePostReleaseStability = (releaseReadiness as OracleReleaseReadinessModule)
      .decideOraclePostReleaseStability;
    expect(typeof decideOraclePostReleaseStability).toBe('function');
    if (!decideOraclePostReleaseStability) return;

    const observation = oracleObservation(
      () => {
        throw new Error('post-release stability must not use previewReleaseAction');
      },
      (action) => action.type === 'SCALE_OUT_NODE' ? 150_000 : 250_000,
      0.4,
      0.70,
      { technology: 0.66, scaleOut: 0.60, resize: 0.68 },
    );

    expect(decideOraclePostReleaseStability(observation, activeContext)).toMatchObject({
      type: 'SCALE_OUT_NODE',
      nodeId: 'db',
      intent: 'POST_RELEASE_STABILITY_CAPACITY',
    });
  });
});
