import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  GameEngine,
  GameSnapshot,
  V1_NODE_IDS,
  V1ServiceTopologyFactory,
} from '../../core';
import { OperationalViewProjector } from '../operational-view-projector';

interface Ratios {
  readonly appCpu?: number;
  readonly appIo?: number;
  readonly dbCpu?: number;
  readonly dbIo?: number;
  readonly storage?: number;
  readonly failureRate?: number;
}

function fixture(ratios: Ratios = {}) {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 22 });
  const topology = V1ServiceTopologyFactory.create(engine.infrastructure, []);
  const appId = V1_NODE_IDS.app('SPRING_BOOT');
  const dbId = V1_NODE_IDS.database('POSTGRESQL');
  const snapshot: GameSnapshot = {
    ...engine.snapshot,
    load: {
      ...engine.snapshot.load,
      failureRate: ratios.failureRate ?? 0,
      requestTraces: [],
      nodeLoads: [
        createNodeLoadSnapshot(appId, 'SERVER_GROUP', [
          createNodeResourceLoad('CPU', ratios.appCpu ?? 0.4, 1),
          createNodeResourceLoad('IO', ratios.appIo ?? 0.2, 1),
        ]),
        createNodeLoadSnapshot(dbId, 'DATABASE', [
          createNodeResourceLoad('CPU', ratios.dbCpu ?? 0.6, 1),
          createNodeResourceLoad('IO', ratios.dbIo ?? 0.2, 1),
        ]),
        createNodeLoadSnapshot(V1_NODE_IDS.storage, 'OBJECT_STORAGE', [
          createNodeResourceLoad('STORAGE', ratios.storage ?? 0.1, 1),
        ]),
        createNodeLoadSnapshot(V1_NODE_IDS.externalAi, 'EXTERNAL_SERVICE', []),
      ],
    },
  };
  return { engine, topology, snapshot, appId, dbId };
}

describe('operational view projector', () => {
  it('scopes service health and metrics to exact topology nodes instead of same-kind decoys', () => {
    const { engine, topology, snapshot, appId, dbId } = fixture();
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);
    const state = {
      ...snapshot,
      load: {
        ...snapshot.load,
        nodeLoads: [
          createNodeLoadSnapshot('decoy:app', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 999, 1)]),
          createNodeLoadSnapshot('decoy:db', 'DATABASE', [createNodeResourceLoad('IO', 999, 1)]),
          ...snapshot.load.nodeLoads,
        ],
      },
    };

    const service = OperationalViewProjector.project(state, engine.developer, topology);

    expect(service.health.bottleneck).toMatchObject({ nodeId: dbId, resourceKind: 'CPU', percent: 60 });
    expect(service.visibleLoads.map(({ nodeId }) => nodeId)).toEqual([appId, appId, dbId, dbId, V1_NODE_IDS.storage]);
    expect(service.summary.headline).toBe('P95 175ms');
  });

  it('fails when an owned topology node has no load even if a same-kind decoy exists', () => {
    const { engine, topology, snapshot, appId } = fixture();
    const state = {
      ...snapshot,
      load: {
        ...snapshot.load,
        nodeLoads: [
          createNodeLoadSnapshot('decoy:app', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 0.1, 1)]),
          ...snapshot.load.nodeLoads.filter((node) => node.nodeId !== appId),
        ],
      },
    };

    expect(() => OperationalViewProjector.project(state, engine.developer, topology))
      .toThrowError(`Missing load for topology node: ${appId}`);
  });

  it('projects the hottest resource into service health', () => {
    const { engine, topology, snapshot, appId } = fixture({ appCpu: 0.42, appIo: 1.12, dbCpu: 0.1, dbIo: 0.2 });

    const service = OperationalViewProjector.project(snapshot, engine.developer, topology);

    expect(service.health.bottleneck).toMatchObject({ nodeId: appId, resourceKind: 'IO', percent: 112 });
    expect(service.health.status).toBe('CRITICAL');
  });

  it('raises projected p95 latency as generic capacity pressure increases', () => {
    const low = fixture({ appCpu: 0.4, dbCpu: 0.2 });
    const high = fixture({ appCpu: 1.2, dbCpu: 0.2 });

    const lowService = OperationalViewProjector.project(low.snapshot, low.engine.developer, low.topology);
    const highService = OperationalViewProjector.project(high.snapshot, high.engine.developer, high.topology);

    expect(highService.health.p95LatencyMs).toBeGreaterThan(lowService.health.p95LatencyMs);
    expect(highService.health.bottleneck).toMatchObject({ nodeId: high.appId, resourceKind: 'CPU' });
  });

  it('marks a failed required request path as critical without changing bottleneck selection', () => {
    const { engine, topology, snapshot, dbId } = fixture({ failureRate: 1 });

    const service = OperationalViewProjector.project(snapshot, engine.developer, topology);

    expect(service.health.status).toBe('CRITICAL');
    expect(service.health.p95LatencyMs).toBeGreaterThanOrEqual(1_500);
    expect(service.health.bottleneck?.nodeId).toBe(dbId);
  });

  it('keeps BASIC aggregate-only and unlocks generic resource metrics at METRICS', () => {
    const { engine, topology, snapshot } = fixture();
    const basic = OperationalViewProjector.project(snapshot, engine.developer, topology);

    expect(basic.observability.level).toBe('BASIC');
    expect(basic.visibleLoads.map(({ label }) => label)).toEqual(['Spring Boot', 'PostgreSQL', 'Local Storage']);
    expect(basic.summary.headline).toBe('LOAD 60%');

    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);
    const metrics = OperationalViewProjector.project(snapshot, engine.developer, topology);
    expect(metrics.observability.level).toBe('METRICS');
    expect(metrics.visibleLoads.map(({ label }) => label)).toEqual([
      'Spring Boot CPU', 'Spring Boot I/O', 'PostgreSQL CPU', 'PostgreSQL I/O', 'Local Storage STORAGE',
    ]);
  });

  it('keeps diagnosis hidden at BASIC observability', () => {
    const { engine, topology, snapshot, appId } = fixture({ appCpu: 1.1 });

    const text = OperationalViewProjector.diagnosisText(appId, snapshot, engine.developer, topology);

    expect(text).toBe('DIAGNOSIS LOCKED · METRICS에서 노드별 자원 신호를 확인할 수 있습니다.');
  });

  it('reveals only the selected node hottest signal at METRICS observability', () => {
    const { engine, topology, snapshot, dbId } = fixture({ dbCpu: 0.55, dbIo: 0.96 });
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);

    const text = OperationalViewProjector.diagnosisText(dbId, snapshot, engine.developer, topology);

    expect(text).toBe('SIGNAL · PostgreSQL I/O 96% · HARD 100% · APM에서 Traffic / Tech Debt / Request Failure 상관관계 분석이 해금됩니다.');
  });

  it('correlates tech debt and semantic recommendations only at APM observability', () => {
    const { engine, topology, snapshot, appId } = fixture({ appCpu: 0.72, appIo: 0.51 });
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(3);
    engine.developer.get({ category: 'fundamental', id: 'NETWORK' }).setLevel(2);
    engine.developer.get({ category: 'fundamental', id: 'SOFTWARE_DESIGN' }).setLevel(2);
    const state = { ...snapshot, techDebt: { ...snapshot.techDebt, value: 72 } };

    const text = OperationalViewProjector.diagnosisText(appId, state, engine.developer, topology);

    expect(text).toContain('높은 Tech Debt');
    expect(text).toContain('Tech Debt 72/100');
    expect(text).toContain('APP Scale-up');
  });
});
