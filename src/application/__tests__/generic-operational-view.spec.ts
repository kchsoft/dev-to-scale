import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  GameEngine,
  V1_NODE_IDS,
  V1ServiceTopologyFactory,
} from '../../core';
import { OperationalViewProjector } from '../operational-view-projector';

function fixture() {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 77 });
  engine.infrastructure.deployTechnology('ALB');
  engine.infrastructure.deployTechnology('REDIS');
  const topology = V1ServiceTopologyFactory.create(engine.infrastructure, []);
  const resourceLoads = new Map<string, ReturnType<typeof createNodeLoadSnapshot>>([
    [V1_NODE_IDS.gateway, createNodeLoadSnapshot(V1_NODE_IDS.gateway, 'LOAD_BALANCER', [
      createNodeResourceLoad('THROUGHPUT', 72, 100),
    ])],
    [V1_NODE_IDS.app('SPRING_BOOT'), createNodeLoadSnapshot(V1_NODE_IDS.app('SPRING_BOOT'), 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 84, 100),
      createNodeResourceLoad('IO', 61, 100),
    ])],
    [V1_NODE_IDS.cache, createNodeLoadSnapshot(V1_NODE_IDS.cache, 'CACHE', [
      createNodeResourceLoad('THROUGHPUT', 113, 100),
    ])],
    [V1_NODE_IDS.database('POSTGRESQL'), createNodeLoadSnapshot(V1_NODE_IDS.database('POSTGRESQL'), 'DATABASE', [
      createNodeResourceLoad('CPU', 66, 100),
      createNodeResourceLoad('IO', 92, 100),
    ])],
    [V1_NODE_IDS.storage, createNodeLoadSnapshot(V1_NODE_IDS.storage, 'OBJECT_STORAGE', [
      createNodeResourceLoad('STORAGE', 31, 100),
    ])],
    [V1_NODE_IDS.externalAi, createNodeLoadSnapshot(V1_NODE_IDS.externalAi, 'EXTERNAL_SERVICE', [
      createNodeResourceLoad('THROUGHPUT', 999, 100),
    ])],
  ]);
  const snapshot = {
    ...engine.snapshot,
    load: {
      ...engine.snapshot.load,
      failureRate: 0,
      nodeLoads: [
        createNodeLoadSnapshot('decoy:cache', 'CACHE', [createNodeResourceLoad('THROUGHPUT', 999, 100)]),
        ...topology.graph.nodes.map((node) => resourceLoads.get(node.id) ?? createNodeLoadSnapshot(node.id, node.kind, [])),
      ],
      requestTraces: [],
    },
  };
  return { engine, topology, snapshot };
}

describe('generic operational view', () => {
  it('uses the hottest resource in the actual player-owned topology for health and BASIC load', () => {
    const { engine, topology, snapshot } = fixture();

    const service = OperationalViewProjector.project(snapshot, engine.developer, topology);

    expect(service.health.bottleneck).toMatchObject({
      nodeId: V1_NODE_IDS.cache,
      resourceKind: 'THROUGHPUT',
      percent: 113,
    });
    expect(service.health.status).toBe('CRITICAL');
    expect(service.visibleLoads.map(({ nodeId }) => nodeId)).toEqual(
      topology.graph.nodes.filter(({ kind }) => kind !== 'EXTERNAL_SERVICE').map(({ id }) => id),
    );
    expect(service.visibleLoads.every(({ label }) => !label.includes('CPU') && !label.includes('I/O'))).toBe(true);
    expect(service.summary.headline).toBe('LOAD 113%');
  });

  it('shows every owned resource at METRICS including ALB and Redis throughput', () => {
    const { engine, topology, snapshot } = fixture();
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);

    const service = OperationalViewProjector.project(snapshot, engine.developer, topology);
    const labels = service.visibleLoads.map(({ label }) => label);

    expect(labels).toEqual(expect.arrayContaining([
      'Spring Boot CPU',
      'Spring Boot I/O',
      'PostgreSQL CPU',
      'PostgreSQL I/O',
      'ALB THROUGHPUT',
      'Redis THROUGHPUT',
    ]));
    expect(labels.some((label) => label.includes('EXTERNAL'))).toBe(false);
  });

  it('diagnoses the selected node by its actual hottest resource', () => {
    const { engine, topology, snapshot } = fixture();
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(2);

    const redis = OperationalViewProjector.diagnosisText(V1_NODE_IDS.cache, snapshot, engine.developer, topology);
    const alb = OperationalViewProjector.diagnosisText(V1_NODE_IDS.gateway, snapshot, engine.developer, topology);

    expect(redis).toContain('Redis THROUGHPUT 113%');
    expect(redis).not.toContain('DB I/O');
    expect(alb).toContain('ALB THROUGHPUT 72%');
    expect(alb).not.toContain('APP 72%');
  });
});
