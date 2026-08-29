import { describe, expect, it } from 'vitest';
import { FeatureDefinition } from '../feature';
import { InfrastructureState, LoadCalculator, ServerSize } from '../infrastructure';
import { resourceLoad } from '../node-load';
import { V1_NODE_IDS } from '../v1-topology';

function appOnlyFeature(
  id: string,
  app: { cpu: number; io: number },
): FeatureDefinition {
  return new FeatureDefinition({
    id,
    name: id,
    baseWork: 1,
    complexity: 'SIMPLE',
    load: { app: 1, db: 0, async: 0, storage: 0 },
    resourceLoad: { app, db: { cpu: 0, io: 0 } },
    requestRoute: [{ node: 'APP' }],
  });
}

function appDbFeature(
  id: string,
  app: { cpu: number; io: number },
  db: { cpu: number; io: number } = { cpu: 1, io: 1 },
): FeatureDefinition {
  return new FeatureDefinition({
    id,
    name: id,
    baseWork: 1,
    complexity: 'SIMPLE',
    load: { app: 1, db: 1, async: 0, storage: 0 },
    resourceLoad: { app, db },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
  });
}

function queueFeature(id: string, requirement: 'REQUIRED' | 'OPTIONAL'): FeatureDefinition {
  return new FeatureDefinition({
    id,
    name: id,
    baseWork: 1,
    complexity: 'SIMPLE',
    load: { app: 1, db: 1, async: 80, storage: 0 },
    resourceLoad: {
      app: { cpu: 0.5, io: 0.5 },
      db: { cpu: 0.5, io: 0.5 },
    },
    requestRoute: [
      { node: 'APP' },
      { node: 'QUEUE', requirement },
      { node: 'DB' },
    ],
  });
}

function loadResource(
  framework: 'SPRING_BOOT' | 'NESTJS',
  feature: FeatureDefinition,
  kind: 'CPU' | 'IO',
) {
  const infrastructure = InfrastructureState.initial(framework, 'POSTGRESQL');
  const load = LoadCalculator.calculate(100_000, [feature], infrastructure);
  const app = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.app(framework));
  if (!app) throw new Error('missing app load');
  const resource = resourceLoad(app, kind);
  if (!resource) throw new Error(`missing ${kind} load`);
  return { load, app, resource };
}

describe('overload request flow', () => {
  it('separates nominal display thresholds from framework-specific effective hard limits', () => {
    const springCpu = loadResource('SPRING_BOOT', appOnlyFeature('spring-cpu', { cpu: 11, io: 0 }), 'CPU').resource;
    expect(springCpu.nominalRatio).toBeGreaterThan(1);
    expect(springCpu.effectiveRatio).toBeLessThanOrEqual(1);

    const springIo = loadResource('SPRING_BOOT', appOnlyFeature('spring-io', { cpu: 0, io: 9.8 }), 'IO').resource;
    expect(springIo.nominalRatio).toBeLessThan(1);
    expect(springIo.effectiveRatio).toBeGreaterThan(1);

    const nestCpu = loadResource('NESTJS', appOnlyFeature('nest-cpu', { cpu: 9.5, io: 0 }), 'CPU').resource;
    expect(nestCpu.nominalRatio).toBeLessThan(1);
    expect(nestCpu.effectiveRatio).toBeGreaterThan(1);

    const nestIo = loadResource('NESTJS', appOnlyFeature('nest-io', { cpu: 0, io: 10.5 }), 'IO').resource;
    expect(nestIo.nominalRatio).toBeGreaterThan(1);
    expect(nestIo.effectiveRatio).toBeLessThanOrEqual(1);
  });

  it('starts partial request failure immediately above effective capacity', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const overloaded = LoadCalculator.calculate(
      100_000,
      [appOnlyFeature('overloaded', { cpu: 13, io: 0 })],
      infrastructure,
    );
    const app = overloaded.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.app('SPRING_BOOT'))!;
    const cpu = resourceLoad(app, 'CPU')!;

    expect(cpu.effectiveRatio).toBeGreaterThan(1);
    expect(overloaded.failureRate).toBeCloseTo(1 - cpu.effectiveCapacity / cpu.demand, 5);

    const belowLimit = LoadCalculator.calculate(
      100_000,
      [appOnlyFeature('below-limit', { cpu: 11.5, io: 0 })],
      infrastructure,
    );
    expect(belowLimit.failureRate).toBe(0);
  });

  it('lets an upstream ALB bottleneck mask APP demand until ingress is resized', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.resizeNode(V1_NODE_IDS.app('SPRING_BOOT'), ServerSize.MEDIUM);
    const feature = appDbFeature('ingress-mask', { cpu: 22, io: 0 });

    const smallAlb = LoadCalculator.calculate(100_000, [feature], infrastructure);
    const smallGateway = smallAlb.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.gateway)!;
    const smallApp = smallAlb.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.app('SPRING_BOOT'))!;
    const smallAlbThroughput = resourceLoad(smallGateway, 'THROUGHPUT')!;
    const smallAppCpu = resourceLoad(smallApp, 'CPU')!;

    expect(smallAlbThroughput.effectiveRatio).toBeGreaterThan(1);

    infrastructure.resizeNode(V1_NODE_IDS.gateway, ServerSize.MEDIUM);
    const largerAlb = LoadCalculator.calculate(100_000, [feature], infrastructure);
    const largeGateway = largerAlb.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.gateway)!;
    const largeApp = largerAlb.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.app('SPRING_BOOT'))!;
    const largeAlbThroughput = resourceLoad(largeGateway, 'THROUGHPUT')!;
    const largeAppCpu = resourceLoad(largeApp, 'CPU')!;

    expect(largeAlbThroughput.effectiveRatio).toBeLessThan(smallAlbThroughput.effectiveRatio);
    expect(largeAppCpu.demand).toBeGreaterThan(smallAppCpu.demand);
    expect(largeAppCpu.effectiveRatio).toBeGreaterThan(smallAppCpu.effectiveRatio);
    expect(largeAppCpu.effectiveRatio).toBeGreaterThan(1);
  });

  it('composes incident health with capacity health and passes only surviving traffic to DB', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const feature = appDbFeature('composed-health', { cpu: 13, io: 0 });
    const appId = V1_NODE_IDS.app('SPRING_BOOT');
    const dbId = V1_NODE_IDS.database('POSTGRESQL');

    const load = LoadCalculator.calculate(100_000, [feature], infrastructure, {
      nodeHealth: { [appId]: 0.8 },
    });
    const app = load.nodeLoads.find(({ nodeId }) => nodeId === appId)!;
    const cpu = resourceLoad(app, 'CPU')!;
    const expectedSuccess = 0.8 * Math.min(1, cpu.effectiveCapacity / cpu.demand);
    const trace = load.requestTraces[0];
    const dbTrace = trace.nodes.find(({ nodeId }) => nodeId === dbId)!;

    expect(trace.successRatio).toBeCloseTo(expectedSuccess, 5);
    expect(dbTrace.arrivalRatio).toBeCloseTo(expectedSuccess, 5);
    expect(load.failureRate).toBeCloseTo(1 - expectedSuccess, 5);
  });

  it('keeps an overloaded optional queue from gating primary success but gates a required queue', () => {
    const optionalInfrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    optionalInfrastructure.deployTechnology('SQS');
    const optionalLoad = LoadCalculator.calculate(
      100_000,
      [queueFeature('optional-queue', 'OPTIONAL')],
      optionalInfrastructure,
    );
    const optionalQueue = optionalLoad.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.queue('SQS'))!;
    const optionalThroughput = resourceLoad(optionalQueue, 'THROUGHPUT')!;

    expect(optionalThroughput.effectiveRatio).toBeGreaterThan(1);
    expect(optionalLoad.requestTraces[0].successRatio).toBe(1);
    expect(optionalLoad.failureRate).toBe(0);

    const requiredInfrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    requiredInfrastructure.deployTechnology('SQS');
    const requiredLoad = LoadCalculator.calculate(
      100_000,
      [queueFeature('required-queue', 'REQUIRED')],
      requiredInfrastructure,
    );

    expect(requiredLoad.requestTraces[0].successRatio).toBeLessThan(1);
    expect(requiredLoad.failureRate).toBeGreaterThan(0);
  });
});
