import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  GameEngine,
  ServiceTopology,
  TopologyGraph,
} from '../../core';
import { OperationalViewProjector } from '../operational-view-projector';

describe('generic operational diagnosis fallback', () => {
  it('gives future owned node/resource combinations safe generic actions', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 44 });
    engine.developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).setLevel(3);
    engine.developer.get({ category: 'fundamental', id: 'NETWORK' }).setLevel(2);
    engine.developer.get({ category: 'fundamental', id: 'SOFTWARE_DESIGN' }).setLevel(2);

    const workerId = 'future:worker';
    const topology = new ServiceTopology({
      graph: new TopologyGraph([
        {
          id: workerId,
          kind: 'WORKER',
          productId: 'FUTURE_WORKER',
          capacity: { cpu: 100, io: 100 },
          monthlyCost: 100_000,
        },
      ], []),
      modules: [],
      deployments: [],
      assignments: [],
    });
    const snapshot = {
      ...engine.snapshot,
      load: {
        ...engine.snapshot.load,
        failureRate: 0,
        requestTraces: [],
        nodeLoads: [
          createNodeLoadSnapshot(workerId, 'WORKER', [
            createNodeResourceLoad('CPU', 95, 100),
            createNodeResourceLoad('IO', 70, 100),
          ]),
        ],
      },
    };

    const diagnosis = OperationalViewProjector.diagnosisText(workerId, snapshot, engine.developer, topology);

    expect(diagnosis).toContain('OPTIONS Capacity 조정 / 트래픽·워크로드 확인 / downstream 상태 확인');
  });
});
