import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import * as balanceAction from '../balance-action';
import type {
  BalanceTechnologyOption,
  BasicBalanceObservation,
  MetricsBalanceObservation,
} from '../balance-observation';
import * as releaseReadiness from '../release-readiness';

interface ReleaseReadinessActionModule {
  withReleaseReadinessIntent?: (
    action: balanceAction.SimulationAction,
    intent: 'RELEASE_READINESS_DEPENDENCY' | 'RELEASE_READINESS_CAPACITY',
  ) => balanceAction.SimulationAction;
}

interface ReleaseReadinessPolicyModule {
  preventativeDependencyAction?: (
    observation: BasicBalanceObservation,
    context: { readonly protectedLearningReserve: number },
    strategyId: 'METRICS_AWARE' | 'APM_AWARE' | 'ORACLE',
  ) => balanceAction.SimulationAction | null;
  decideMetricsReleaseReadiness?: (
    observation: BasicBalanceObservation | MetricsBalanceObservation,
    context: { readonly protectedLearningReserve: number },
    strategyId: 'METRICS_AWARE',
  ) => balanceAction.SimulationAction | null;
  decideMetricsPostReleaseStability?: (
    observation: BasicBalanceObservation | MetricsBalanceObservation,
    context: {
      readonly protectedLearningReserve: number;
      readonly postReleaseStabilityWindowActive?: boolean;
    },
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

function metricsObservation(
  projectedEffectivePercent: number,
  liveEffectivePercent = 40,
): MetricsBalanceObservation {
  const dbNode = Object.freeze({
    nodeId: 'v1:database:POSTGRESQL',
    kind: 'DATABASE' as const,
    productId: 'POSTGRESQL',
    size: ServerSize.SMALL,
    monthlyCost: 120_000,
    aggregatePercent: liveEffectivePercent,
    effectivePercent: liveEffectivePercent,
    hardLimitPercent: 100,
    status: liveEffectivePercent >= 100 ? 'OVERLOAD' as const : liveEffectivePercent >= 70 ? 'WARNING' as const : 'NORMAL' as const,
    scaleOut: Object.freeze({
      kind: 'READ_REPLICA' as const,
      count: 0,
      maxCount: 3,
      available: true,
      reason: null,
    }),
  });
  const projectedDbIo = Object.freeze({
    nodeId: dbNode.nodeId,
    nodeKind: 'DATABASE' as const,
    resourceKind: 'IO' as const,
    percent: projectedEffectivePercent,
    effectivePercent: projectedEffectivePercent,
    hardLimitPercent: 100,
    status: projectedEffectivePercent >= 100 ? 'OVERLOAD' as const : 'WARNING' as const,
  });
  const liveDbIo = Object.freeze({
    nodeId: dbNode.nodeId,
    nodeKind: 'DATABASE' as const,
    resourceKind: 'IO' as const,
    percent: liveEffectivePercent,
    effectivePercent: liveEffectivePercent,
    hardLimitPercent: 100,
    status: liveEffectivePercent >= 100 ? 'OVERLOAD' as const : liveEffectivePercent >= 70 ? 'WARNING' as const : 'NORMAL' as const,
  });
  return Object.freeze({
    ...observation({
      level: 'BASIC',
      upcomingRequiredDependencyGaps: Object.freeze([]),
      nodes: Object.freeze([dbNode]),
      technologyOptions: Object.freeze(TECHNOLOGY_OPTIONS.map((option) => (
        option.id === 'REDIS' ? { ...option, available: true } : option
      ))),
    }),
    level: 'METRICS' as const,
    resourceLoads: Object.freeze([liveDbIo]),
    releasePreview: Object.freeze({
      resourceLoads: Object.freeze([projectedDbIo]),
      maxEffectivePercent: projectedEffectivePercent,
    }),
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
    const preventativeDependencyAction = (releaseReadiness as ReleaseReadinessPolicyModule)
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

  it('does not let conservative runway policy block a required release dependency', () => {
    const preventativeDependencyAction = (releaseReadiness as ReleaseReadinessPolicyModule)
      .preventativeDependencyAction;
    expect(typeof preventativeDependencyAction).toBe('function');
    if (!preventativeDependencyAction) return;

    for (const strategyId of ['APM_AWARE', 'ORACLE'] as const) {
      expect(preventativeDependencyAction(
        observation({ cash: 500_000 }),
        { protectedLearningReserve: 100_000 },
        strategyId,
      )).toMatchObject({
        type: 'START_TECHNOLOGY_BUILD',
        technologyId: 'SQS',
        intent: 'RELEASE_READINESS_DEPENDENCY',
      });
    }
  });

  it('does not create dependency readiness without a gap or affordable candidate', () => {
    const preventativeDependencyAction = (releaseReadiness as ReleaseReadinessPolicyModule)
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

  it('prioritizes an upcoming dependency before projected capacity readiness', () => {
    const decideMetricsReleaseReadiness = (releaseReadiness as ReleaseReadinessPolicyModule)
      .decideMetricsReleaseReadiness;
    expect(typeof decideMetricsReleaseReadiness).toBe('function');
    if (!decideMetricsReleaseReadiness) return;

    expect(decideMetricsReleaseReadiness(
      observation(),
      { protectedLearningReserve: 0 },
      'METRICS_AWARE',
    )).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'SQS',
      intent: 'RELEASE_READINESS_DEPENDENCY',
    });
  });

  it('prepares the hottest projected DB IO resource at 85 percent or above', () => {
    const decideMetricsReleaseReadiness = (releaseReadiness as ReleaseReadinessPolicyModule)
      .decideMetricsReleaseReadiness;
    expect(typeof decideMetricsReleaseReadiness).toBe('function');
    if (!decideMetricsReleaseReadiness) return;

    expect(decideMetricsReleaseReadiness(
      metricsObservation(90),
      { protectedLearningReserve: 0 },
      'METRICS_AWARE',
    )).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'REDIS',
      intent: 'RELEASE_READINESS_CAPACITY',
    });
  });

  it('does not prepare projected capacity below the 85 percent threshold', () => {
    const decideMetricsReleaseReadiness = (releaseReadiness as ReleaseReadinessPolicyModule)
      .decideMetricsReleaseReadiness;
    expect(typeof decideMetricsReleaseReadiness).toBe('function');
    if (!decideMetricsReleaseReadiness) return;

    expect(decideMetricsReleaseReadiness(
      metricsObservation(84),
      { protectedLearningReserve: 0 },
      'METRICS_AWARE',
    )).toBeNull();
  });

  it('stabilizes live DB IO with immediate capacity once the rounded METRICS signal reaches 71 percent during an active post-release window', () => {
    const decideMetricsPostReleaseStability = (releaseReadiness as ReleaseReadinessPolicyModule)
      .decideMetricsPostReleaseStability;
    expect(typeof decideMetricsPostReleaseStability).toBe('function');
    if (!decideMetricsPostReleaseStability) return;

    expect(decideMetricsPostReleaseStability(
      metricsObservation(40, 71),
      { protectedLearningReserve: 0, postReleaseStabilityWindowActive: true },
      'METRICS_AWARE',
    )).toMatchObject({
      type: 'SCALE_OUT_NODE',
      nodeId: 'v1:database:POSTGRESQL',
      intent: 'POST_RELEASE_STABILITY_CAPACITY',
    });
  });

  it('does not act on a rounded METRICS signal of 70 because it may still represent raw pressure below the boundary', () => {
    const decideMetricsPostReleaseStability = (releaseReadiness as ReleaseReadinessPolicyModule)
      .decideMetricsPostReleaseStability;
    expect(typeof decideMetricsPostReleaseStability).toBe('function');
    if (!decideMetricsPostReleaseStability) return;

    expect(decideMetricsPostReleaseStability(
      metricsObservation(40, 70),
      { protectedLearningReserve: 0, postReleaseStabilityWindowActive: true },
      'METRICS_AWARE',
    )).toBeNull();
  });

  it('does not use the live 70 percent watch outside the release window or below its boundary', () => {
    const decideMetricsPostReleaseStability = (releaseReadiness as ReleaseReadinessPolicyModule)
      .decideMetricsPostReleaseStability;
    expect(typeof decideMetricsPostReleaseStability).toBe('function');
    if (!decideMetricsPostReleaseStability) return;

    expect(decideMetricsPostReleaseStability(
      metricsObservation(95, 90),
      { protectedLearningReserve: 0, postReleaseStabilityWindowActive: false },
      'METRICS_AWARE',
    )).toBeNull();

    expect(decideMetricsPostReleaseStability(
      metricsObservation(95, 69),
      { protectedLearningReserve: 0, postReleaseStabilityWindowActive: true },
      'METRICS_AWARE',
    )).toBeNull();
  });
});
