import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../../core/node-load';
import type {
  ApmBalanceObservation,
  BalanceNodeObservation,
  BalanceTechnologyOption,
  BasicBalanceObservation,
  MetricsBalanceObservation,
  OracleBalanceObservation,
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

function common(level: 'BASIC' | 'METRICS' | 'APM' | 'ORACLE', nodes: readonly BalanceNodeObservation[]) {
  return {
    level,
    frameworkId: 'SPRING_BOOT' as const,
    databaseId: 'POSTGRESQL' as const,
    day: 100,
    dau: 10_000,
    cash: 10_000_000,
    monthlyInfrastructureCost: nodes.reduce((sum, candidate) => sum + candidate.monthlyCost, 0),
    failureRate: 0,
    serviceHealth: 'HEALTHY' as const,
    growthEvent: null,
    currentTechnologyBuildId: null,
    deployedTechnologies: Object.freeze([]),
    technologyOptions: TECHNOLOGIES,
    nodes: Object.freeze(nodes),
  };
}

function basic(nodes: readonly BalanceNodeObservation[]): BasicBalanceObservation {
  return Object.freeze({ ...common('BASIC', nodes), level: 'BASIC' as const });
}

function metrics(
  nodes: readonly BalanceNodeObservation[],
  resourceLoads: MetricsBalanceObservation['resourceLoads'],
): MetricsBalanceObservation {
  return Object.freeze({ ...common('METRICS', nodes), level: 'METRICS' as const, resourceLoads: Object.freeze(resourceLoads) });
}

function apm(
  nodes: readonly BalanceNodeObservation[],
  bottleneck: NonNullable<ApmBalanceObservation['diagnosis']['topBottleneck']>,
): ApmBalanceObservation {
  return Object.freeze({
    ...common('APM', nodes),
    level: 'APM' as const,
    resourceLoads: Object.freeze([]),
    diagnosis: Object.freeze({ topBottleneck: Object.freeze(bottleneck), text: 'fixture diagnosis' }),
  });
}

function load(nodeId: string, nodeKind: 'DATABASE' | 'SERVER_GROUP', resourceKind: 'CPU' | 'IO', ratio: number) {
  return {
    failureRate: 0,
    nodeLoads: Object.freeze([
      createNodeLoadSnapshot(nodeId, nodeKind, [createNodeResourceLoad(resourceKind, ratio, 1, 1)]),
    ]),
    requestTraces: Object.freeze([]),
  };
}

const context = Object.freeze({ protectedLearningReserve: 0 });

describe('deterministic balance strategies', () => {
  it('ORACLE chooses Redis for affordable read-heavy DB IO when local preview clears the target', () => {
    const db = node({
      nodeId: 'db', kind: 'DATABASE', productId: 'POSTGRESQL', aggregatePercent: 120, effectivePercent: 120,
      scaleOut: { kind: 'READ_REPLICA', count: 0, maxCount: 3, available: true, reason: null },
    });
    const observation: OracleBalanceObservation = Object.freeze({
      ...common('ORACLE', [db]),
      level: 'ORACLE' as const,
      resourceLoads: Object.freeze([]),
      diagnosis: Object.freeze({ topBottleneck: null, text: null }),
      exactPressures: Object.freeze([{
        nodeId: 'db', nodeKind: 'DATABASE', resourceKind: 'IO', demand: 1.2,
        nominalCapacity: 1, effectiveCapacity: 1, nominalRatio: 1.2, effectiveRatio: 1.2,
      }]),
      workloadTags: Object.freeze(['READ_HEAVY' as const]),
      previewPort: Object.freeze({
        previewTechnology: () => load('db', 'DATABASE', 'IO', 0.8),
        previewResize: () => load('db', 'DATABASE', 'IO', 0.95),
        previewScaleOut: () => load('db', 'DATABASE', 'IO', 0.9),
        projectedMonthlyCost: (action) => action.type === 'START_TECHNOLOGY_BUILD' ? 200_000 : 250_000,
      }),
    });

    expect(BALANCE_STRATEGIES.ORACLE.decide(observation, context)).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD', technologyId: 'REDIS',
    });
  });

  it('APM fixes the diagnosed upstream ALB bottleneck before speculative downstream scaling', () => {
    const alb = node({ nodeId: 'alb', kind: 'LOAD_BALANCER', productId: 'ALB', effectivePercent: 115, aggregatePercent: 110 });
    const app = node({
      nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', effectivePercent: 70, aggregatePercent: 70,
      scaleOut: { kind: 'INSTANCE', count: 2, maxCount: 10, available: true, reason: null },
    });
    const observation = apm([alb, app], {
      nodeId: 'alb', nodeKind: 'load-balancer', resourceKind: 'THROUGHPUT', nominalRatio: 1.1,
      effectiveRatio: 1.15, percent: 110, effectivePercent: 115, hardLimitPercent: 96,
      capacityFailurePercent: 13, status: 'OVERLOAD', label: 'ALB Throughput',
    });

    expect(BALANCE_STRATEGIES.APM_AWARE.decide(observation, context)).toMatchObject({
      type: 'RESIZE_NODE', nodeId: 'alb', size: ServerSize.MEDIUM,
    });
  });

  it('METRICS applies the ordered DB IO remedy without diagnosis', () => {
    const db = node({
      nodeId: 'db', kind: 'DATABASE', productId: 'POSTGRESQL', effectivePercent: 92,
      scaleOut: { kind: 'READ_REPLICA', count: 0, maxCount: 3, available: true, reason: null },
    });
    const observation = metrics([db], [{
      nodeId: 'db', nodeKind: 'DATABASE', resourceKind: 'IO', percent: 90,
      effectivePercent: 92, hardLimitPercent: 98, status: 'WARNING',
    }]);

    expect(BALANCE_STRATEGIES.METRICS_AWARE.decide(observation, context)).toMatchObject({
      type: 'START_TECHNOLOGY_BUILD', technologyId: 'REDIS',
    });
  });

  it('REACTIVE_BASIC resizes the hottest aggregate node at 100 percent', () => {
    const app = node({ nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', aggregatePercent: 100 });

    expect(BALANCE_STRATEGIES.REACTIVE_BASIC.decide(basic([app]), context)).toMatchObject({
      type: 'RESIZE_NODE', nodeId: 'app', size: ServerSize.MEDIUM,
    });
  });

  it('YOLO_SCALE expands at the 70 percent threshold', () => {
    const app = node({ nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', aggregatePercent: 70 });

    expect(BALANCE_STRATEGIES.YOLO_SCALE.decide(basic([app]), context)).toMatchObject({
      type: 'RESIZE_NODE', nodeId: 'app', size: ServerSize.MEDIUM,
    });
  });

  it('CHEAPSKATE waits at or below the hard limit', () => {
    const app = node({ nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', effectivePercent: 100, aggregatePercent: 120 });

    expect(BALANCE_STRATEGIES.CHEAPSKATE.decide(basic([app]), context)).toMatchObject({ type: 'NO_OP' });
  });

  it('uses stable node id as the final tie-break for BASIC reactions', () => {
    const z = node({ nodeId: 'z-app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', aggregatePercent: 110 });
    const a = node({ nodeId: 'a-db', kind: 'DATABASE', productId: 'POSTGRESQL', aggregatePercent: 110 });

    expect(BALANCE_STRATEGIES.REACTIVE_BASIC.decide(basic([z, a]), context)).toMatchObject({ nodeId: 'a-db' });
  });

  it('returns NO_OP when the visible correction candidates are unavailable', () => {
    const app = node({
      nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', size: ServerSize.XLARGE,
      aggregatePercent: 150, effectivePercent: 150,
      scaleOut: { kind: 'INSTANCE', count: 1, maxCount: 10, available: false, reason: 'ALB required' },
    });
    const lockedTech = TECHNOLOGIES.map((technology) => ({ ...technology, available: false }));
    const observation = Object.freeze({ ...common('BASIC', [app]), level: 'BASIC' as const, technologyOptions: Object.freeze(lockedTech) });

    expect(BALANCE_STRATEGIES.REACTIVE_BASIC.decide(observation, context)).toMatchObject({ type: 'NO_OP' });
  });

  it('YOLO bursts a viral spike when its zero-runway affordability rule allows it', () => {
    const app = node({ nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', aggregatePercent: 90 });
    const observation = Object.freeze({
      ...common('BASIC', [app]), level: 'BASIC' as const,
      cash: 1_000_000,
      growthEvent: Object.freeze({
        type: 'VIRAL' as const, response: 'PENDING' as const, trafficMultiplier: 1.8, loadMultiplier: 1.8, burstCost: 150_000,
      }),
    });

    expect(BALANCE_STRATEGIES.YOLO_SCALE.decideViral(observation, context)).toBe('BURST');
  });

  it('CHEAPSKATE never bursts and throttles only after visible hard-limit risk', () => {
    const overloaded = node({ nodeId: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', effectivePercent: 105 });
    const observation = Object.freeze({
      ...common('BASIC', [overloaded]), level: 'BASIC' as const,
      growthEvent: Object.freeze({
        type: 'VIRAL' as const, response: 'PENDING' as const, trafficMultiplier: 1.8, loadMultiplier: 1.8, burstCost: 150_000,
      }),
    });

    expect(BALANCE_STRATEGIES.CHEAPSKATE.decideViral(observation, context)).toBe('THROTTLE');
  });
});
