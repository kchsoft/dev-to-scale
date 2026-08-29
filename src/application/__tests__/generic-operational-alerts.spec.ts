import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  GameEngine,
  GameSnapshot,
  LoadSnapshot,
  operationalPressures,
  V1_NODE_IDS,
} from '../../core';
import { FeatureImpactPreview, GameServiceProjector } from '../game-service-projector';
import { operationalPressureChanges } from '../operational-pressure-presenter';

function ownedLoad(ratios: {
  readonly alb: number;
  readonly appCpu?: number;
  readonly appIo?: number;
  readonly redis: number;
  readonly dbCpu?: number;
  readonly dbIo?: number;
  readonly storage?: number;
  readonly external?: number;
}): LoadSnapshot {
  return {
    failureRate: 0,
    nodeLoads: Object.freeze([
      createNodeLoadSnapshot(V1_NODE_IDS.gateway, 'LOAD_BALANCER', [
        createNodeResourceLoad('THROUGHPUT', ratios.alb, 1),
      ]),
      createNodeLoadSnapshot(V1_NODE_IDS.app('SPRING_BOOT'), 'SERVER_GROUP', [
        createNodeResourceLoad('CPU', ratios.appCpu ?? 0.3, 1),
        createNodeResourceLoad('IO', ratios.appIo ?? 0.2, 1),
      ]),
      createNodeLoadSnapshot(V1_NODE_IDS.cache, 'CACHE', [
        createNodeResourceLoad('THROUGHPUT', ratios.redis, 1),
      ]),
      createNodeLoadSnapshot(V1_NODE_IDS.database('POSTGRESQL'), 'DATABASE', [
        createNodeResourceLoad('CPU', ratios.dbCpu ?? 0.3, 1),
        createNodeResourceLoad('IO', ratios.dbIo ?? 0.4, 1),
      ]),
      createNodeLoadSnapshot(V1_NODE_IDS.storage, 'OBJECT_STORAGE', [
        createNodeResourceLoad('STORAGE', ratios.storage ?? 0.2, 1),
      ]),
      createNodeLoadSnapshot(V1_NODE_IDS.externalAi, 'EXTERNAL_SERVICE', [
        createNodeResourceLoad('THROUGHPUT', ratios.external ?? 9.99, 1),
      ]),
    ]),
    requestTraces: Object.freeze([]),
  };
}

function withAppCpu(
  load: LoadSnapshot,
  demand: number,
  nominalCapacity: number,
  effectiveCapacity: number,
): LoadSnapshot {
  const appId = V1_NODE_IDS.app('SPRING_BOOT');
  return {
    ...load,
    nodeLoads: Object.freeze(load.nodeLoads.map((node) => node.nodeId === appId
      ? createNodeLoadSnapshot(appId, 'SERVER_GROUP', [
          createNodeResourceLoad('CPU', demand, nominalCapacity, effectiveCapacity),
          createNodeResourceLoad('IO', 20, 100, 100),
        ])
      : node)),
  };
}

function engineWithOperationalTechnologies(): GameEngine {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 91 });
  engine.infrastructure.deployTechnology('ALB');
  engine.infrastructure.deployTechnology('REDIS');
  return engine;
}

describe('generic operational alerts and feature impact', () => {
  it('matches pressure changes by node id and resource kind using the requested basis', () => {
    const selected = new Set<string>([V1_NODE_IDS.gateway, V1_NODE_IDS.cache]);
    const before = operationalPressures(ownedLoad({ alb: 0.82, redis: 0.76 }))
      .filter(({ nodeId }) => selected.has(nodeId));
    const after = operationalPressures(ownedLoad({ alb: 1.01, redis: 1.09 }))
      .filter(({ nodeId }) => selected.has(nodeId));

    const changes = operationalPressureChanges(before, after, 'NOMINAL');

    expect(changes.map(({ pressure }) => `${pressure.nodeId}:${pressure.resourceKind}`)).toEqual([
      `${V1_NODE_IDS.gateway}:THROUGHPUT`,
      `${V1_NODE_IDS.cache}:THROUGHPUT`,
    ]);
    expect(changes[0]).toMatchObject({ beforeRatio: 0.82, afterRatio: 1.01 });
    expect(changes[0].delta).toBeCloseTo(0.19);
    expect(changes[1]).toMatchObject({ beforeRatio: 0.76, afterRatio: 1.09 });
    expect(changes[1].delta).toBeCloseTo(0.33);
    expect([...changes].sort((left, right) => right.delta - left.delta)[0].pressure.nodeId).toBe(V1_NODE_IDS.cache);

    const dualBefore = operationalPressures(withAppCpu(ownedLoad({ alb: 0.2, redis: 0.2 }), 95, 100, 120))
      .filter(({ nodeId, resourceKind }) => nodeId === V1_NODE_IDS.app('SPRING_BOOT') && resourceKind === 'CPU');
    const dualAfter = operationalPressures(withAppCpu(ownedLoad({ alb: 0.2, redis: 0.2 }), 105, 100, 120))
      .filter(({ nodeId, resourceKind }) => nodeId === V1_NODE_IDS.app('SPRING_BOOT') && resourceKind === 'CPU');

    expect(operationalPressureChanges(dualBefore, dualAfter, 'NOMINAL')[0]).toMatchObject({
      beforeRatio: 0.95,
      afterRatio: 1.05,
    });
    expect(operationalPressureChanges(dualBefore, dualAfter, 'EFFECTIVE')[0]).toMatchObject({
      beforeRatio: 95 / 120,
      afterRatio: 105 / 120,
    });
  });

  it('creates one pressure alert per overloaded owned node including ALB and Redis', () => {
    const engine = engineWithOperationalTechnologies();
    const snapshot: GameSnapshot = {
      ...engine.snapshot,
      load: ownedLoad({ alb: 1.18, redis: 1.05 }),
    };

    const result = new GameServiceProjector(engine).project(snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 0,
      monthlyProfit: 0,
    });

    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `load-${V1_NODE_IDS.gateway}`,
        nodeId: V1_NODE_IDS.gateway,
        title: 'ALB THROUGHPUT 118%',
      }),
      expect.objectContaining({
        id: `load-${V1_NODE_IDS.cache}`,
        nodeId: V1_NODE_IDS.cache,
        title: 'Redis THROUGHPUT 105%',
      }),
    ]));
    expect(result.alerts.some(({ nodeId }) => nodeId === V1_NODE_IDS.externalAi)).toBe(false);
  });

  it('warns on nominal baseline breach without false danger before the effective hard limit', () => {
    const engine = engineWithOperationalTechnologies();
    const appId = V1_NODE_IDS.app('SPRING_BOOT');
    const snapshot: GameSnapshot = {
      ...engine.snapshot,
      load: withAppCpu(ownedLoad({ alb: 0.2, redis: 0.2 }), 105, 100, 118),
    };

    const result = new GameServiceProjector(engine).project(snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 0,
      monthlyProfit: 0,
    });
    const alert = result.alerts.find(({ id }) => id === `load-${appId}`);

    expect(alert).toMatchObject({
      tone: 'warning',
      title: 'Spring Boot CPU 105%',
      nodeId: appId,
    });
    expect(alert?.detail).toContain('HARD 118%');
    expect(alert?.detail).not.toContain('Capacity Failure');
  });

  it('uses danger and capacity-failure detail as soon as the effective hard limit is exceeded', () => {
    const engine = engineWithOperationalTechnologies();
    const appId = V1_NODE_IDS.app('SPRING_BOOT');
    const snapshot: GameSnapshot = {
      ...engine.snapshot,
      load: withAppCpu(ownedLoad({ alb: 0.2, redis: 0.2 }), 95, 100, 92),
    };

    const result = new GameServiceProjector(engine).project(snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 0,
      monthlyProfit: 0,
    });
    const alert = result.alerts.find(({ id }) => id === `load-${appId}`);

    expect(alert).toMatchObject({
      tone: 'danger',
      title: 'Spring Boot CPU 95%',
      nodeId: appId,
    });
    expect(alert?.detail).toContain('HARD 92%');
    expect(alert?.detail).toContain('Capacity Failure 3%');
  });

  it('uses generic pressure deltas for feature impact instead of a fixed APP/DB axis list', () => {
    const engine = engineWithOperationalTechnologies();
    const currentLoad = ownedLoad({ alb: 0.82, redis: 0.76 });
    const projectedLoad = ownedLoad({ alb: 1.01, redis: 1.09 });
    const current: GameSnapshot = {
      ...engine.snapshot,
      launched: true,
      load: currentLoad,
    };
    (engine as unknown as { previewLoadWithFeature: () => LoadSnapshot }).previewLoadWithFeature = () => projectedLoad;
    const projector = new GameServiceProjector(engine);
    const internal = projector as unknown as {
      featureImpactFor(snapshot: GameSnapshot, featureId: string): FeatureImpactPreview | null;
    };

    const impact = internal.featureImpactFor(current, 'COMMENT');

    expect(impact?.summary).toContain('Redis THROUGHPUT 76→109%');
    expect(impact?.summary).toContain('ALB THROUGHPUT 82→101%');
    expect(impact?.summary).toContain('Redis THROUGHPUT OVERLOAD 예상');
    expect(impact?.nodeId).toBe(V1_NODE_IDS.cache);
    expect(impact?.tone).toBe('danger');
  });

  it('shows nominal feature-impact deltas without a false overload suffix when hard limit remains safe', () => {
    const engine = engineWithOperationalTechnologies();
    const currentLoad = withAppCpu(ownedLoad({ alb: 0.2, redis: 0.2 }), 95, 100, 120);
    const projectedLoad = withAppCpu(ownedLoad({ alb: 0.2, redis: 0.2 }), 105, 100, 120);
    const current: GameSnapshot = {
      ...engine.snapshot,
      launched: true,
      load: currentLoad,
    };
    (engine as unknown as { previewLoadWithFeature: () => LoadSnapshot }).previewLoadWithFeature = () => projectedLoad;
    const projector = new GameServiceProjector(engine);
    const internal = projector as unknown as {
      featureImpactFor(snapshot: GameSnapshot, featureId: string): FeatureImpactPreview | null;
    };

    const impact = internal.featureImpactFor(current, 'COMMENT');

    expect(impact?.summary).toContain('Spring Boot CPU 95→105%');
    expect(impact?.summary).not.toContain('OVERLOAD 예상');
    expect(impact?.tone).not.toBe('danger');
  });
});
