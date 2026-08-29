import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import type { MetricsBalanceObservation } from '../balance-observation';
import { BALANCE_STRATEGIES } from '../strategy-registry';

const observation: MetricsBalanceObservation = Object.freeze({
  level: 'METRICS',
  frameworkId: 'SPRING_BOOT',
  databaseId: 'POSTGRESQL',
  day: 500,
  dau: 1_000_000,
  cash: 100_000_000,
  monthlyInfrastructureCost: 2_000_000,
  failureRate: 0.05,
  requiredDependencyGaps: Object.freeze([]),
  serviceHealth: 'DEGRADED',
  growthEvent: null,
  currentTechnologyBuildId: null,
  deployedTechnologies: Object.freeze(['SQS']),
  technologyOptions: Object.freeze([
    { id: 'REDIS', buildCost: 300_000, monthlyCost: 100_000, deployed: false, available: true },
    { id: 'SQS', buildCost: 200_000, monthlyCost: 80_000, deployed: true, available: false },
    { id: 'RABBITMQ', buildCost: 500_000, monthlyCost: 150_000, deployed: false, available: false },
    { id: 'KAFKA', buildCost: 1_500_000, monthlyCost: 350_000, deployed: false, available: false },
    { id: 'ALB', buildCost: 150_000, monthlyCost: 100_000, deployed: false, available: true },
    { id: 'OBJECT_STORAGE', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
  ]),
  nodes: Object.freeze([
    Object.freeze({
      nodeId: 'v1:app:SPRING_BOOT',
      kind: 'SERVER_GROUP',
      productId: 'SPRING_BOOT',
      size: ServerSize.XLARGE,
      monthlyCost: 1_000_000,
      aggregatePercent: 130,
      effectivePercent: 130,
      hardLimitPercent: 77,
      status: 'OVERLOAD',
      scaleOut: Object.freeze({
        kind: 'INSTANCE',
        count: 1,
        maxCount: 10,
        available: false,
        reason: 'ALB is required before application scale-out',
      }),
    }),
  ]),
  resourceLoads: Object.freeze([
    Object.freeze({
      nodeId: 'v1:app:SPRING_BOOT',
      nodeKind: 'SERVER_GROUP',
      resourceKind: 'IO',
      percent: 130,
      effectivePercent: 130,
      hardLimitPercent: 77,
      status: 'OVERLOAD',
    }),
  ]),
});

describe('resource-aware scale-out enablement', () => {
  it('builds ALB when APP IO is overloaded, SQS already exists, and XLARGE cannot scale out yet', () => {
    expect(BALANCE_STRATEGIES.METRICS_AWARE.decide(observation, { protectedLearningReserve: 0 })).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'ALB',
    });
  });
});
