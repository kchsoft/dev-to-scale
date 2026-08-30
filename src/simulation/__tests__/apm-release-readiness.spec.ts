import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import type {
  ApmBalanceObservation,
  BalanceNodeObservation,
  BalanceTechnologyOption,
  RequiredDependencyGapObservation,
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

const EVENT_BUS_GAP: RequiredDependencyGapObservation = Object.freeze({
  role: 'EVENT_BUS',
  workloadIds: Object.freeze(['AI_RECOMMENDATION']),
  candidateTechnologyIds: Object.freeze(['SQS', 'RABBITMQ', 'KAFKA'] as const),
});

function node(overrides: Partial<BalanceNodeObservation> & Pick<BalanceNodeObservation, 'nodeId' | 'kind' | 'productId'>): BalanceNodeObservation {
  return Object.freeze({
    size: ServerSize.SMALL,
    monthlyCost: 100_000,
    aggregatePercent: 40,
    effectivePercent: 40,
    hardLimitPercent: 100,
    status: 'NORMAL',
    scaleOut: null,
    ...overrides,
  });
}

function baseApm(nodes: readonly BalanceNodeObservation[]): ApmBalanceObservation {
  return Object.freeze({
    level: 'APM',
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    day: 300,
    dau: 500_000,
    cash: 10_000_000,
    monthlyInfrastructureCost: nodes.reduce((sum, candidate) => sum + candidate.monthlyCost, 0),
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
    nodes: Object.freeze(nodes),
    resourceLoads: Object.freeze([]),
    diagnosis: Object.freeze({ topBottleneck: null, text: null }),
    releasePreview: null,
  });
}

const context = Object.freeze({ protectedLearningReserve: 0 });

describe('APM release readiness', () => {
  it('uses projected diagnosis instead of the hottest projected percentage', () => {
    const app = node({ nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT' });
    const db = node({
      nodeId: 'db',
      kind: 'DATABASE',
      productId: 'POSTGRESQL',
      scaleOut: { kind: 'READ_REPLICA', count: 0, maxCount: 3, available: true, reason: null },
    });
    const observation: ApmBalanceObservation = Object.freeze({
      ...baseApm([app, db]),
      releasePreview: Object.freeze({
        resourceLoads: Object.freeze([
          Object.freeze({
            nodeId: 'app', nodeKind: 'SERVER_GROUP' as const, resourceKind: 'CPU' as const,
            percent: 95, effectivePercent: 95, hardLimitPercent: 100, status: 'WARNING' as const,
          }),
          Object.freeze({
            nodeId: 'db', nodeKind: 'DATABASE' as const, resourceKind: 'IO' as const,
            percent: 90, effectivePercent: 90, hardLimitPercent: 100, status: 'WARNING' as const,
          }),
        ]),
        maxEffectivePercent: 95,
        diagnosis: Object.freeze({
          topBottleneck: Object.freeze({
            nodeId: 'db', nodeKind: 'database', resourceKind: 'IO', nominalRatio: 0.9,
            effectiveRatio: 0.9, percent: 90, effectivePercent: 90, hardLimitPercent: 100,
            capacityFailurePercent: 0, status: 'WARNING', label: 'PostgreSQL I/O',
          }),
          text: 'Projected PostgreSQL I/O bottleneck',
        }),
      }),
    });

    expect(BALANCE_STRATEGIES.APM_AWARE.decide(observation, context)).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'REDIS',
      intent: 'RELEASE_READINESS_CAPACITY',
    });
  });

  it('prepares an upcoming dependency while live APM load is healthy', () => {
    const app = node({ nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT' });
    const observation: ApmBalanceObservation = Object.freeze({
      ...baseApm([app]),
      pendingFeature: Object.freeze({
        id: 'AI_RECOMMENDATION',
        estimatedRemainingDays: 4,
        requiredResourceRoles: Object.freeze(['EVENT_BUS'] as const),
      }),
      upcomingRequiredDependencyGaps: Object.freeze([EVENT_BUS_GAP]),
    });

    expect(BALANCE_STRATEGIES.APM_AWARE.decide(observation, context)).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'SQS',
      intent: 'RELEASE_READINESS_DEPENDENCY',
    });
  });
});
