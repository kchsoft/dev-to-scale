import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import * as balanceAction from '../balance-action';
import type { BalanceTechnologyOption, BasicBalanceObservation } from '../balance-observation';
import * as strategyHelpers from '../strategy-helpers';

interface ReleaseReadinessActionModule {
  withReleaseReadinessIntent?: (
    action: balanceAction.SimulationAction,
    intent: 'RELEASE_READINESS_DEPENDENCY' | 'RELEASE_READINESS_CAPACITY',
  ) => balanceAction.SimulationAction;
}

interface ReleaseReadinessStrategyHelpers {
  preventativeDependencyAction?: (
    observation: BasicBalanceObservation,
    context: { readonly protectedLearningReserve: number },
    strategyId: 'METRICS_AWARE',
  ) => balanceAction.SimulationAction | null;
}

const TECHNOLOGY_OPTIONS: readonly BalanceTechnologyOption[] = Object.freeze([
  { id: 'REDIS', buildCost: 300_000, monthlyCost: 100_000, deployed: false, available: false },
  { id: 'SQS', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: true },
  { id: 'RABBITMQ', buildCost: 500_000, monthlyCost: 150_000, deployed: false, available: true },
  { id: 'KAFKA', buildCost: 1_500_000, monthlyCost: 350_000, deployed: false, available: true },
  { id: 'ALB', buildCost: 150_000, monthlyCost: 100_000, deployed: false, available: false },
  { id: 'OBJECT_STORAGE', buildCost: 200_000, monthlyCost: 80_000, deployed: false, available: false },
]);

function observation(overrides: Partial<BasicBalanceObservation> = {}): BasicBalanceObservation {
  return Object.freeze({
    level: 'BASIC',
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    day: 400,
    dau: 500_000,
    cash: 10_000_000,
    monthlyInfrastructureCost: 220_000,
    failureRate: 0,
    requiredDependencyGaps: Object.freeze([]),
    pendingFeature: Object.freeze({
      id: 'AI_RECOMMENDATION',
      estimatedRemainingDays: 5,
      requiredResourceRoles: Object.freeze(['EVENT_BUS'] as const),
    }),
    upcomingRequiredDependencyGaps: Object.freeze([
      Object.freeze({
        role: 'EVENT_BUS' as const,
        workloadIds: Object.freeze(['AI_RECOMMENDATION']),
        candidateTechnologyIds: Object.freeze(['SQS', 'RABBITMQ', 'KAFKA'] as const),
      }),
    ]),
    serviceHealth: 'HEALTHY',
    growthEvent: null,
    currentTechnologyBuildId: null,
    deployedTechnologies: Object.freeze([]),
    technologyOptions: TECHNOLOGY_OPTIONS,
    nodes: Object.freeze([]),
    ...overrides,
  });
}

describe('release readiness actions', () => {
  it('tags a preventative action without changing executable identity', () => {
    const withIntent = (balanceAction as ReleaseReadinessActionModule).withReleaseReadinessIntent;
    expect(typeof withIntent).toBe('function');
    if (!withIntent) return;

    const action: balanceAction.SimulationAction = {
      type: 'RESIZE_NODE',
      nodeId: 'v1:app:SPRING_BOOT',
      size: ServerSize.MEDIUM,
      reason: 'prepare release capacity',
    };
    const tagged = withIntent(action, 'RELEASE_READINESS_CAPACITY');

    expect(tagged).toMatchObject({
      ...action,
      intent: 'RELEASE_READINESS_CAPACITY',
    });
    expect(balanceAction.simulationActionId(tagged)).toBe(balanceAction.simulationActionId(action));
    expect(Object.isFrozen(tagged)).toBe(true);
  });

  it('builds the cheapest affordable upcoming EVENT_BUS dependency before release', () => {
    const preventativeDependencyAction = (strategyHelpers as ReleaseReadinessStrategyHelpers)
      .preventativeDependencyAction;
    expect(typeof preventativeDependencyAction).toBe('function');
    if (!preventativeDependencyAction) return;

    expect(preventativeDependencyAction(
      observation(),
      { protectedLearningReserve: 0 },
      'METRICS_AWARE',
    )).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'SQS',
      intent: 'RELEASE_READINESS_DEPENDENCY',
    });
  });

  it('does not create dependency readiness without a gap or affordable candidate', () => {
    const preventativeDependencyAction = (strategyHelpers as ReleaseReadinessStrategyHelpers)
      .preventativeDependencyAction;
    expect(typeof preventativeDependencyAction).toBe('function');
    if (!preventativeDependencyAction) return;

    expect(preventativeDependencyAction(
      observation({ upcomingRequiredDependencyGaps: Object.freeze([]) }),
      { protectedLearningReserve: 0 },
      'METRICS_AWARE',
    )).toBeNull();
    expect(preventativeDependencyAction(
      observation({ cash: 0 }),
      { protectedLearningReserve: 0 },
      'METRICS_AWARE',
    )).toBeNull();
  });
});
