import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  maxNodeLoad,
  maxResourceLoad,
  nodeLoad,
  nodeLoadsOfKind,
  resourceLoad,
} from '../node-load';

describe('node load contract', () => {
  it('stores several normalized resources and derives the node bottleneck', () => {
    const load = createNodeLoadSnapshot('app-a', 'SERVER_GROUP', [
      createNodeResourceLoad('IO', 90, 100),
      createNodeResourceLoad('CPU', 60, 100),
    ]);

    expect(load.resources.map(({ resourceKind }) => resourceKind)).toEqual(['CPU', 'IO']);
    expect(load.resources[0]).toMatchObject({ demand: 60, capacity: 100, ratio: 0.6 });
    expect(load.loadRatio).toBe(0.9);
    expect(Object.isFrozen(load)).toBe(true);
    expect(Object.isFrozen(load.resources)).toBe(true);
  });

  it('keeps empty-resource nodes at zero and rejects duplicate resource kinds', () => {
    expect(createNodeLoadSnapshot('external', 'EXTERNAL_SERVICE', []).loadRatio).toBe(0);
    expect(() => createNodeLoadSnapshot('app-a', 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 1, 10),
      createNodeResourceLoad('CPU', 2, 10),
    ])).toThrowError(expect.objectContaining({ code: 'DUPLICATE_NODE_RESOURCE_KIND' }));
  });

  it('queries exact nodes and uses input order to break equal-pressure ties', () => {
    const first = createNodeLoadSnapshot('app-a', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 8, 10)]);
    const second = createNodeLoadSnapshot('app-b', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 4, 5)]);
    const database = createNodeLoadSnapshot('db-a', 'DATABASE', [createNodeResourceLoad('IO', 9, 10)]);
    const load = { failureRate: 0, nodeLoads: [first, second, database], requestTraces: [] };

    expect(nodeLoad(load, 'app-b')).toBe(second);
    expect(resourceLoad(first, 'CPU')?.ratio).toBe(0.8);
    expect(nodeLoadsOfKind(load, 'SERVER_GROUP')).toEqual([first, second]);
    expect(maxNodeLoad(load, { nodeKind: 'SERVER_GROUP' })).toBe(first);
    expect(maxResourceLoad(load, { nodeKind: 'DATABASE', resourceKind: 'IO' })).toEqual({
      node: database,
      resource: database.resources[0],
    });
  });
});
