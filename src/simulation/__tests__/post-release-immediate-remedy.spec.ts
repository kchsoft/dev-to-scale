import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../../core/node-load';
import type { SimulationAction } from '../balance-action';
import type {
  BalanceNodeObservation,
  BalanceTechnologyOption,
  MetricsBalanceObservation,
  OracleBalanceObservation,
  OracleExactPressure,
} from '../balance-observation';
import { decideMetricsPostReleaseStability, decideOraclePostReleaseStability } from '../release-readiness';

const TECHNOLOGIES: readonly BalanceTechnologyOption[] = Object.freeze([
  { id: 'REDIS', buildCost: 300_000, monthlyCost: 100_000, deployed: false, available: true },
  { id: 'SQS', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: false },
  { id: 'RABBITMQ', buildCost: 500_000, monthlyCost: 150_000, deployed: false, available: false },
  { id: 'KAFKA', buildCost: 1_500_000, monthlyCost: 350_000, deployed: false, available: false },
  { id: 'ALB', buildCost: 150_000, monthlyCost: 100_000, deployed: false, available: false },
  { id: 'OBJECT_STORAGE', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: false },
]);

const DB: BalanceNodeObservation = Object.freeze({
  nodeId: 'db',
  kind: 'DATABASE',
  productId: 'POSTGRESQL',
  size: ServerSize.SMALL,
  monthlyCost: 120_000,
  aggregatePercent: 90,
  effectivePercent: 90,
  hardLimitPercent: 100,
  status: 'WARNING',
  scaleOut: Object.freeze({
    kind: 'READ_REPLICA', count: 0, maxCount: 3, available: true, reason: null,
  }),
});

const context = Object.freeze({
  protectedLearningReserve: 0,
  postReleaseStabilityWindowActive: true,
});

function common() {
  return {
    frameworkId: 'SPRING_BOOT' as const,
    databaseId: 'POSTGRESQL' as const,
    day: 500,
    dau: 1_000_000,
    cash: 10_000_000,
    monthlyInfrastructureCost: 120_000,
    failureRate: 0.01,
    requiredDependencyGaps: Object.freeze([]),
    pendingFeature: null,
    upcomingRequiredDependencyGaps: Object.freeze([]),
    serviceHealth: 'DEGRADED' as const,
    growthEvent: null,
    currentTechnologyBuildId: null,
    deployedTechnologies: Object.freeze([]),
    technologyOptions: TECHNOLOGIES,
    nodes: Object.freeze([DB]),
  };
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

describe('post-release stability remedies', () => {
  it('METRICS uses immediate DB capacity before starting a long-lead Redis build', () => {
    const observation: MetricsBalanceObservation = Object.freeze({
      ...common(),
      level: 'METRICS' as const,
      resourceLoads: Object.freeze([Object.freeze({
        nodeId: 'db', nodeKind: 'DATABASE' as const, resourceKind: 'IO' as const,
        percent: 90, effectivePercent: 90, hardLimitPercent: 100, status: 'WARNING' as const,
      })]),
      releasePreview: null,
    });

    expect(decideMetricsPostReleaseStability(observation, context, 'METRICS_AWARE')).toMatchObject({
      type: 'SCALE_OUT_NODE',
      nodeId: 'db',
      intent: 'POST_RELEASE_STABILITY_CAPACITY',
    });
  });

  it('ORACLE uses immediate DB capacity even when a long-lead technology looks cheaper in a deployed-state preview', () => {
    const exactPressure: OracleExactPressure = Object.freeze({
      nodeId: 'db', nodeKind: 'DATABASE', resourceKind: 'IO',
      demand: 0.9, nominalCapacity: 1, effectiveCapacity: 1, nominalRatio: 0.9, effectiveRatio: 0.9,
    });
    const observation: OracleBalanceObservation = Object.freeze({
      ...common(),
      level: 'ORACLE' as const,
      resourceLoads: Object.freeze([]),
      diagnosis: Object.freeze({ topBottleneck: null, text: null }),
      exactPressures: Object.freeze([exactPressure]),
      workloadTags: Object.freeze(['READ_HEAVY'] as const),
      releasePreview: null,
      previewPort: Object.freeze({
        previewTechnology: () => load(0.5),
        previewResize: () => load(0.7),
        previewScaleOut: () => load(0.6),
        previewReleaseAction: () => load(0.9),
        projectedMonthlyCost: (action: SimulationAction) => (
          action.type === 'START_TECHNOLOGY_BUILD' ? 80_000 : 220_000
        ),
      }),
    });

    expect(decideOraclePostReleaseStability(observation, context)).toMatchObject({
      type: 'SCALE_OUT_NODE',
      nodeId: 'db',
      intent: 'POST_RELEASE_STABILITY_CAPACITY',
    });
  });
});
