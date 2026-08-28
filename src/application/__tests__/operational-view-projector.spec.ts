import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  DeveloperProfile,
  GameEngine,
  GameSnapshot,
  LoadSnapshot,
  V1_NODE_IDS,
} from '../../core';
import { OperationalViewProjector } from '../operational-view-projector';

const selection = {
  appNodeId: V1_NODE_IDS.app('SPRING_BOOT'),
  databaseNodeId: V1_NODE_IDS.database('POSTGRESQL'),
  queueNodeId: null,
  storageNodeId: V1_NODE_IDS.storage,
};

type LoadOverrides = Partial<LoadSnapshot> & Record<string, number>;
function snapshot(loadOverrides: LoadOverrides): GameSnapshot {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 22 });
  const ratioFor = (nodeId: string, resourceKind: 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE', current: number) => {
    if (nodeId === V1_NODE_IDS.app('SPRING_BOOT')) {
      return resourceKind === 'CPU'
        ? loadOverrides.appCpuRatio ?? loadOverrides.appRatio ?? current
        : loadOverrides.appIoRatio ?? loadOverrides.appRatio ?? current;
    }
    if (nodeId === V1_NODE_IDS.database('POSTGRESQL')) {
      return resourceKind === 'CPU'
        ? loadOverrides.dbCpuRatio ?? loadOverrides.dbRatio ?? current
        : loadOverrides.dbIoRatio ?? loadOverrides.dbRatio ?? current;
    }
    if (resourceKind === 'THROUGHPUT') return loadOverrides.asyncRatio ?? current;
    if (resourceKind === 'STORAGE') return loadOverrides.storageRatio ?? current;
    return current;
  };
  return {
    ...engine.snapshot,
    load: {
      ...engine.snapshot.load,
      failureRate: loadOverrides.failureRate ?? engine.snapshot.load.failureRate,
      nodeLoads: engine.snapshot.load.nodeLoads.map((node) => createNodeLoadSnapshot(
        node.nodeId,
        node.nodeKind,
        node.resources.map((resource) => createNodeResourceLoad(
          resource.resourceKind,
          ratioFor(node.nodeId, resource.resourceKind, resource.ratio) * resource.capacity,
          resource.capacity,
        )),
      )),
    },
  };
}

describe('operational view projector', () => {
  it('keeps selected V1 nodes when same-kind decoys precede them and flat fields disagree', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);
    const app = createNodeLoadSnapshot(selection.appNodeId, 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 40, 100), createNodeResourceLoad('IO', 20, 100),
    ]);
    const database = createNodeLoadSnapshot(selection.databaseNodeId, 'DATABASE', [
      createNodeResourceLoad('CPU', 60, 100), createNodeResourceLoad('IO', 20, 100),
    ]);
    const storage = createNodeLoadSnapshot(selection.storageNodeId, 'OBJECT_STORAGE', [
      createNodeResourceLoad('STORAGE', 10, 100),
    ]);
    const state = {
      ...engine.snapshot,
      load: {
        ...engine.snapshot.load,
        nodeLoads: [
          createNodeLoadSnapshot('decoy:app', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 999, 100)]),
          createNodeLoadSnapshot('decoy:db', 'DATABASE', [createNodeResourceLoad('CPU', 999, 100)]),
          createNodeLoadSnapshot('decoy:storage', 'OBJECT_STORAGE', [createNodeResourceLoad('STORAGE', 999, 100)]),
          app,
          database,
          storage,
          ...engine.snapshot.load.nodeLoads.filter((node) => (
            node.nodeId !== selection.appNodeId
            && node.nodeId !== selection.databaseNodeId
            && node.nodeId !== selection.storageNodeId
          )),
        ],
      },
    };

    const service = OperationalViewProjector.project(state, engine.developer, selection);

    expect(service.visibleLoads.map(({ nodeId, percent }) => ({ nodeId, percent }))).toEqual([
      { nodeId: selection.appNodeId, percent: 40 },
      { nodeId: selection.appNodeId, percent: 20 },
      { nodeId: selection.databaseNodeId, percent: 60 },
      { nodeId: selection.databaseNodeId, percent: 20 },
      { nodeId: null, percent: 0 },
      { nodeId: selection.storageNodeId, percent: 10 },
    ]);
    expect(service.summary.headline).toBe('P95 175ms');
    expect(service.health).toMatchObject({ bottleneck: 'DB_CPU', bottleneckPercent: 60, bottleneckNodeId: selection.databaseNodeId });
    expect(OperationalViewProjector.diagnosisText(selection.appNodeId, state, engine.developer)).toContain('APP CPU 40%');
  });

  it('fails when an exact required node load is absent despite a same-kind decoy', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const state = {
      ...engine.snapshot,
      load: {
        ...engine.snapshot.load,
        nodeLoads: [
          createNodeLoadSnapshot('decoy:app', 'SERVER_GROUP', [
            createNodeResourceLoad('CPU', 1, 100), createNodeResourceLoad('IO', 1, 100),
          ]),
          ...engine.snapshot.load.nodeLoads.filter((node) => node.nodeId !== selection.appNodeId),
        ],
      },
    };

    expect(() => OperationalViewProjector.project(state, engine.developer, selection))
      .toThrowError(`Missing load for topology node: ${selection.appNodeId}`);
  });

  it('attaches exact node metadata to visible load metrics', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const service = OperationalViewProjector.project(engine.snapshot, engine.developer, selection);

    expect(service.visibleLoads.map(({ id, nodeId, label }) => ({ id, nodeId, label }))).toEqual([
      { id: 'v1:app:SPRING_BOOT:load', nodeId: 'v1:app:SPRING_BOOT', label: 'APP' },
      { id: 'v1:database:POSTGRESQL:load', nodeId: 'v1:database:POSTGRESQL', label: 'DB' },
      { id: 'optional:QUEUE:THROUGHPUT', nodeId: null, label: 'ASYNC' },
      { id: 'v1:storage:OBJECT_STORAGE:load', nodeId: 'v1:storage:OBJECT_STORAGE', label: 'STORAGE' },
    ]);
    expect(service.health.bottleneckNodeId).toBeNull();
  });

  it('uses the exact node resources for bottleneck health and diagnosis', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);
    const base = engine.snapshot;
    const appId = 'v1:app:SPRING_BOOT';
    const dbId = 'v1:database:POSTGRESQL';
    const overloadedApp = createNodeLoadSnapshot(appId, 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 120, 100),
      createNodeResourceLoad('IO', 40, 100),
    ]);
    const quietDatabase = createNodeLoadSnapshot(dbId, 'DATABASE', [
      createNodeResourceLoad('CPU', 10, 100),
      createNodeResourceLoad('IO', 20, 100),
    ]);
    const state = {
      ...base,
      load: {
        ...base.load,
        nodeLoads: base.load.nodeLoads.map((node) => node.nodeId === appId
          ? overloadedApp
          : node.nodeId === dbId ? quietDatabase : node),
      },
    };
    const projected = OperationalViewProjector.project(state, engine.developer, selection);

    expect(projected.health).toMatchObject({
      bottleneck: 'APP_CPU', bottleneckPercent: 120, bottleneckNodeId: appId,
    });
    expect(OperationalViewProjector.diagnosisText(appId, state, engine.developer)).toContain('APP CPU 120%');
  });

  it('projects BASIC observability without leaking detailed resource metrics', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 22 });
    const service = OperationalViewProjector.project(engine.snapshot, engine.developer, selection);

    expect(service.observability).toEqual({
      level: 'BASIC',
      label: 'BASIC HEALTH',
      nextUnlock: 'Metrics: OS & Runtime Lv.2',
      showsResourceSignature: false,
      tracesRequests: false,
    });
    expect(service.visibleLoads.map((metric) => metric.label)).toEqual(['APP', 'DB', 'ASYNC', 'STORAGE']);
  });

  it('owns the BASIC service summary and preserves the app/database headline', () => {
    const service = OperationalViewProjector.project(snapshot({
      appRatio: 0.4,
      dbRatio: 0.8,
      asyncRatio: 1.2,
    }), new DeveloperProfile(), selection);

    expect(service.summary.headline).toBe('LOAD 80%');
    expect(service.summary.detail).toContain('전체 Load');
  });

  it('projects the hottest resource into service health', () => {
    const service = OperationalViewProjector.project(snapshot({
      appCpuRatio: 0.42,
      appIoRatio: 1.12,
      failureRate: 0,
    }), new DeveloperProfile(), selection);

    expect(service.health.bottleneck).toBe('APP_IO');
    expect(service.health.bottleneckPercent).toBe(112);
    expect(service.health.status).toBe('CRITICAL');
  });

  it('raises projected p95 latency as capacity pressure increases', () => {
    const developer = new DeveloperProfile();
    const low = OperationalViewProjector.project(snapshot({ appCpuRatio: 0.4 }), developer, selection);
    const high = OperationalViewProjector.project(snapshot({ appCpuRatio: 1.2 }), developer, selection);

    expect(high.health.p95LatencyMs).toBeGreaterThan(low.health.p95LatencyMs);
    expect(high.health.bottleneck).toBe('APP_CPU');
  });

  it('marks a failed required request path as critical', () => {
    const service = OperationalViewProjector.project(snapshot({ failureRate: 1 }), new DeveloperProfile(), selection);

    expect(service.health.status).toBe('CRITICAL');
    expect(service.health.p95LatencyMs).toBeGreaterThanOrEqual(1_500);
  });

  it('unlocks detailed resource views only at the configured skill levels', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 25 });
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);

    const metrics = OperationalViewProjector.project(engine.snapshot, engine.developer, selection);

    expect(metrics.observability.level).toBe('METRICS');
    expect(metrics.visibleLoads.map((metric) => metric.label)).toEqual([
      'APP CPU', 'APP I/O', 'DB CPU', 'DB I/O', 'ASYNC', 'STORAGE',
    ]);

    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(3);
    engine.developer.get({ category: 'fundamental', id: 'NETWORK' }).setLevel(2);
    engine.developer.get({ category: 'fundamental', id: 'SOFTWARE_DESIGN' }).setLevel(2);

    expect(OperationalViewProjector.project(engine.snapshot, engine.developer, selection).observability.level).toBe('APM');
  });

  it('keeps incident diagnosis hidden at BASIC observability', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 23 });
    const text = OperationalViewProjector.diagnosisText(
      V1_NODE_IDS.app('SPRING_BOOT'),
      snapshot({ appCpuRatio: 1.1, appIoRatio: 0.5 }),
      engine.developer,
    );

    expect(text).toBe('DIAGNOSIS LOCKED · METRICS에서 CPU/I/O 자원 신호를 확인할 수 있습니다.');
  });

  it('reveals only the primary resource signal at METRICS observability', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 26 });
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);

    const text = OperationalViewProjector.diagnosisText(
      V1_NODE_IDS.database('POSTGRESQL'),
      snapshot({ dbCpuRatio: 0.55, dbIoRatio: 0.96 }),
      engine.developer,
    );

    expect(text).toBe('SIGNAL · DB I/O 96% · APM에서 Traffic / Tech Debt / Request Failure 상관관계 분석이 해금됩니다.');
  });

  it('correlates tech debt and suggestions only at APM observability', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 27 });
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(3);
    engine.developer.get({ category: 'fundamental', id: 'NETWORK' }).setLevel(2);
    engine.developer.get({ category: 'fundamental', id: 'SOFTWARE_DESIGN' }).setLevel(2);
    const base = snapshot({ appCpuRatio: 0.72, appIoRatio: 0.51 });
    const state = { ...base, techDebt: { ...base.techDebt, value: 72 } };

    const text = OperationalViewProjector.diagnosisText(
      V1_NODE_IDS.app('SPRING_BOOT'),
      state,
      engine.developer,
    );

    expect(text).toContain('높은 Tech Debt');
    expect(text).toContain('Tech Debt 72/100');
    expect(text).toContain('APP Scale-up');
  });
});
