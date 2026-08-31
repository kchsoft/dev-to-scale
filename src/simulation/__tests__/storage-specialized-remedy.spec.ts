import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../../core/node-load';
import type { SimulationAction } from '../balance-action';
import type {
  ApmBalanceObservation,
  BalanceNodeObservation,
  BalanceTechnologyOption,
  OracleBalanceObservation,
  OracleExactPressure,
} from '../balance-observation';
import { BALANCE_STRATEGIES } from '../strategy-registry';

const STORAGE_NODE: BalanceNodeObservation = Object.freeze({
  nodeId: 'v1:storage',
  kind: 'OBJECT_STORAGE',
  productId: 'LOCAL_STORAGE',
  size: ServerSize.SMALL,
  monthlyCost: 0,
  aggregatePercent: 85,
  effectivePercent: 85,
  hardLimitPercent: 100,
  status: 'WARNING',
  scaleOut: null,
});

const TECHNOLOGIES: readonly BalanceTechnologyOption[] = Object.freeze([
  { id: 'REDIS', buildCost: 300_000, monthlyCost: 100_000, deployed: false, available: false },
  { id: 'SQS', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: false },
  { id: 'RABBITMQ', buildCost: 500_000, monthlyCost: 150_000, deployed: false, available: false },
  { id: 'KAFKA', buildCost: 1_500_000, monthlyCost: 350_000, deployed: false, available: false },
  { id: 'ALB', buildCost: 150_000, monthlyCost: 100_000, deployed: false, available: false },
  { id: 'OBJECT_STORAGE', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
]);

function common() {
  return {
    frameworkId: 'SPRING_BOOT' as const,
    databaseId: 'POSTGRESQL' as const,
    day: 450,
    dau: 1_000_000,
    cash: 10_000_000,
    monthlyInfrastructureCost: 0,
    failureRate: 0,
    requiredDependencyGaps: Object.freeze([]),
    pendingFeature: null,
    upcomingRequiredDependencyGaps: Object.freeze([]),
    serviceHealth: 'HEALTHY' as const,
    growthEvent: null,
    currentTechnologyBuildId: null,
    deployedTechnologies: Object.freeze([]),
    technologyOptions: TECHNOLOGIES,
    nodes: Object.freeze([STORAGE_NODE]),
  };
}

function storageLoad(ratio: number) {
  return Object.freeze({
    failureRate: 0,
    nodeLoads: Object.freeze([
      createNodeLoadSnapshot(
        STORAGE_NODE.nodeId,
        'OBJECT_STORAGE',
        [createNodeResourceLoad('STORAGE', ratio, 1, 1)],
      ),
    ]),
    requestTraces: Object.freeze([]),
  });
}

const context = Object.freeze({ protectedLearningReserve: 0 });

describe('specialized storage remedy', () => {
  it('APM chooses Object Storage instead of repeatedly resizing Local Storage', () => {
    const observation: ApmBalanceObservation = Object.freeze({
      ...common(),
      level: 'APM' as const,
      resourceLoads: Object.freeze([]),
      diagnosis: Object.freeze({
        topBottleneck: Object.freeze({
          nodeId: STORAGE_NODE.nodeId,
          nodeKind: 'object-storage' as const,
          resourceKind: 'STORAGE' as const,
          nominalRatio: 0.85,
          effectiveRatio: 0.85,
          percent: 85,
          effectivePercent: 85,
          hardLimitPercent: 100,
          capacityFailurePercent: 0,
          status: 'WARNING' as const,
          label: 'Local Storage',
        }),
        text: 'Local Storage capacity is approaching its limit',
      }),
      releasePreview: null,
    });

    expect(BALANCE_STRATEGIES.APM_AWARE.decide(observation, context)).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'OBJECT_STORAGE',
    });
  });

  it('ORACLE prefers the purpose-built Object Storage upgrade over a cheaper one-step Local Storage resize', () => {
    const pressure: OracleExactPressure = Object.freeze({
      nodeId: STORAGE_NODE.nodeId,
      nodeKind: 'OBJECT_STORAGE',
      resourceKind: 'STORAGE',
      demand: 0.85,
      nominalCapacity: 1,
      effectiveCapacity: 1,
      nominalRatio: 0.85,
      effectiveRatio: 0.85,
    });
    const observation: OracleBalanceObservation = Object.freeze({
      ...common(),
      level: 'ORACLE' as const,
      resourceLoads: Object.freeze([]),
      diagnosis: Object.freeze({ topBottleneck: null, text: null }),
      exactPressures: Object.freeze([pressure]),
      workloadTags: Object.freeze(['STORAGE' as const]),
      releasePreview: null,
      previewPort: Object.freeze({
        previewTechnology: () => storageLoad(0.085),
        previewResize: () => storageLoad(0.47),
        previewScaleOut: () => storageLoad(0.85),
        previewReleaseAction: () => storageLoad(0.85),
        projectedMonthlyCost: (action: SimulationAction) => (
          action.type === 'START_TECHNOLOGY_BUILD' ? 80_000 : 20_000
        ),
      }),
    });

    expect(BALANCE_STRATEGIES.ORACLE.decide(observation, context)).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'OBJECT_STORAGE',
    });
  });
});
