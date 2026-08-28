import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  operationalPressures,
  operationalPressuresForNode,
  primaryOperationalPressure,
  primaryOperationalPressureForNode,
} from '..';

const load = {
  nodeLoads: [
    createNodeLoadSnapshot('alb', 'LOAD_BALANCER', [
      createNodeResourceLoad('THROUGHPUT', 72, 100),
    ]),
    createNodeLoadSnapshot('app', 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 84, 100),
      createNodeResourceLoad('IO', 61, 100),
    ]),
    createNodeLoadSnapshot('redis', 'CACHE', [
      createNodeResourceLoad('THROUGHPUT', 113, 100),
    ]),
    createNodeLoadSnapshot('db', 'DATABASE', [
      createNodeResourceLoad('CPU', 66, 100),
      createNodeResourceLoad('IO', 92, 100),
    ]),
    createNodeLoadSnapshot('queue', 'QUEUE', [
      createNodeResourceLoad('THROUGHPUT', 54, 100),
    ]),
    createNodeLoadSnapshot('storage', 'OBJECT_STORAGE', [
      createNodeResourceLoad('STORAGE', 31, 100),
    ]),
    createNodeLoadSnapshot('external', 'EXTERNAL_SERVICE', [
      createNodeResourceLoad('THROUGHPUT', 999, 100),
    ]),
  ],
};

describe('operational pressure', () => {
  it('selects the hottest resource across every player-owned node', () => {
    expect(primaryOperationalPressure(load)).toMatchObject({
      nodeId: 'redis', resourceKind: 'THROUGHPUT', ratio: 1.13,
    });
    expect(operationalPressures(load).map(({ nodeId, resourceKind }) => `${nodeId}:${resourceKind}`)).toEqual([
      'alb:THROUGHPUT',
      'app:CPU',
      'app:IO',
      'redis:THROUGHPUT',
      'db:CPU',
      'db:IO',
      'queue:THROUGHPUT',
      'storage:STORAGE',
    ]);
  });

  it('scopes pressure to supplied topology node ids', () => {
    const scope = { nodeIds: new Set(['app', 'db']) };

    expect(primaryOperationalPressure(load, scope)).toMatchObject({
      nodeId: 'db', resourceKind: 'IO', ratio: 0.92,
    });
  });

  it('keeps the first resource when ratios tie exactly', () => {
    const tied = {
      nodeLoads: [
        createNodeLoadSnapshot('first', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 100, 100)]),
        createNodeLoadSnapshot('second', 'DATABASE', [createNodeResourceLoad('IO', 100, 100)]),
      ],
    };

    expect(primaryOperationalPressure(tied)?.nodeId).toBe('first');
  });

  it('returns exact node-local pressure and safe empty values for unknown nodes', () => {
    expect(primaryOperationalPressureForNode(load, 'app')).toMatchObject({
      resourceKind: 'CPU', ratio: 0.84,
    });
    expect(operationalPressuresForNode(load, 'missing')).toEqual([]);
    expect(primaryOperationalPressureForNode(load, 'missing')).toBeNull();
  });

  it('excludes external services even when the scope explicitly includes them', () => {
    const scope = { nodeIds: new Set(['external']) };

    expect(operationalPressures(load, scope)).toEqual([]);
    expect(primaryOperationalPressure(load, scope)).toBeNull();
  });
});
