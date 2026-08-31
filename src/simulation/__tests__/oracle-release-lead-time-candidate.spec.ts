import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../../core/node-load';
import type {
  BalanceNodeObservation,
  BalanceTechnologyOption,
  OracleBalanceObservation,
  OraclePreviewPort,
} from '../balance-observation';
import { BALANCE_STRATEGIES } from '../strategy-registry';

const app: BalanceNodeObservation = Object.freeze({
  nodeId: 'app',
  kind: 'SERVER_GROUP',
  productId: 'SPRING_BOOT',
  size: ServerSize.XLARGE,
  monthlyCost: 500_000,
  aggregatePercent: 40,
  effectivePercent: 40,
  hardLimitPercent: 100,
  status: 'NORMAL',
  scaleOut: Object.freeze({
    kind: 'INSTANCE',
    count: 1,
    maxCount: 10,
    available: false,
    reason: 'ALB required',
  }),
});

const technologies: readonly BalanceTechnologyOption[] = Object.freeze([
  { id: 'REDIS', buildCost: 300_000, monthlyCost: 100_000, deployed: false, available: false },
  { id: 'SQS', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: false },
  { id: 'RABBITMQ', buildCost: 500_000, monthlyCost: 150_000, deployed: false, available: false },
  { id: 'KAFKA', buildCost: 1_500_000, monthlyCost: 350_000, deployed: false, available: false },
  { id: 'ALB', buildCost: 150_000, monthlyCost: 100_000, deployed: false, available: true },
  { id: 'OBJECT_STORAGE', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: false },
]);

function load(ratio: number) {
  return Object.freeze({
    failureRate: 0,
    nodeLoads: Object.freeze([
      createNodeLoadSnapshot('app', 'SERVER_GROUP', [createNodeResourceLoad('CPU', ratio, 1, 1)]),
    ]),
    requestTraces: Object.freeze([]),
  });
}

describe('ORACLE release technology lead-time candidates', () => {
  it('does not start a late ALB merely to unlock future scale-out when it cannot help the pending release', () => {
    const previewPort = Object.freeze({
      previewTechnology: () => load(0.4),
      previewResize: () => load(0.4),
      previewScaleOut: () => load(0.4),
      previewReleaseAction: () => load(1.1),
      projectedMonthlyCost: () => 600_000,
      technologyReadyForRelease: () => false,
    }) as OraclePreviewPort & { technologyReadyForRelease(id: 'ALB'): boolean };

    const observation: OracleBalanceObservation = Object.freeze({
      level: 'ORACLE',
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      day: 456,
      dau: 500_000,
      cash: 10_000_000,
      monthlyInfrastructureCost: 500_000,
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
      technologyOptions: technologies,
      nodes: Object.freeze([app]),
      resourceLoads: Object.freeze([]),
      diagnosis: Object.freeze({ topBottleneck: null, text: null }),
      exactPressures: Object.freeze([Object.freeze({
        nodeId: 'app', nodeKind: 'SERVER_GROUP', resourceKind: 'CPU',
        demand: 0.4, nominalCapacity: 1, effectiveCapacity: 1,
        nominalRatio: 0.4, effectiveRatio: 0.4,
      })]),
      workloadTags: Object.freeze(['CORE'] as const),
      releasePreview: Object.freeze({
        resourceLoads: Object.freeze([]),
        maxEffectivePercent: 110,
        diagnosis: Object.freeze({ topBottleneck: null, text: null }),
        exactPressures: Object.freeze([Object.freeze({
          nodeId: 'app', nodeKind: 'SERVER_GROUP', resourceKind: 'CPU',
          demand: 1.1, nominalCapacity: 1, effectiveCapacity: 1,
          nominalRatio: 1.1, effectiveRatio: 1.1,
        })]),
      }),
      previewPort,
    });

    expect(BALANCE_STRATEGIES.ORACLE.decide(observation, { protectedLearningReserve: 0 })).toMatchObject({
      type: 'NO_OP',
    });
  });
});
