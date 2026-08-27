import { describe, expect, it } from 'vitest';
import {
  InfrastructureNode,
  TopologyGraph,
} from '../topology';

function node(
  id: string,
  kind: InfrastructureNode['kind'],
  productId = id,
): InfrastructureNode {
  return {
    id,
    kind,
    productId,
    capacity: { throughput: 100 },
    monthlyCost: 10,
  };
}

describe('TopologyGraph', () => {
  it('creates server, database, and queue nodes independently of modules', () => {
    const graph = new TopologyGraph([
      node('app-a', 'SERVER_GROUP'),
      node('db-a', 'DATABASE'),
      node('queue-a', 'QUEUE'),
    ], [
      { id: 'app-db', from: 'app-a', to: 'db-a', mode: 'SYNC' },
      { id: 'app-queue', from: 'app-a', to: 'queue-a', mode: 'ASYNC' },
    ]);

    expect(graph.nodes.map(({ id }) => id)).toEqual(['app-a', 'db-a', 'queue-a']);
    expect(graph.node('queue-a')?.kind).toBe('QUEUE');
    expect(graph.hasEdge('app-a', 'queue-a')).toBe(true);
  });

  it.each([
    {
      name: 'duplicate node IDs',
      nodes: [node('app', 'SERVER_GROUP'), node('app', 'DATABASE')],
      edges: [],
      code: 'DUPLICATE_NODE_ID' as const,
    },
    {
      name: 'duplicate edge IDs',
      nodes: [node('app', 'SERVER_GROUP'), node('db', 'DATABASE')],
      edges: [
        { id: 'route', from: 'app', to: 'db', mode: 'SYNC' as const },
        { id: 'route', from: 'db', to: 'app', mode: 'SYNC' as const },
      ],
      code: 'DUPLICATE_EDGE_ID' as const,
    },
    {
      name: 'missing edge endpoints',
      nodes: [node('app', 'SERVER_GROUP')],
      edges: [{ id: 'route', from: 'app', to: 'missing', mode: 'SYNC' as const }],
      code: 'MISSING_EDGE_ENDPOINT' as const,
    },
  ])('rejects $name', ({ nodes, edges, code }) => {
    expect(() => new TopologyGraph(nodes, edges)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('defensively copies and freezes graph values', () => {
    const sourceCapacity = { throughput: 100 };
    const source: InfrastructureNode = {
      id: 'app',
      kind: 'SERVER_GROUP',
      productId: 'app',
      capacity: sourceCapacity,
      monthlyCost: 10,
    };
    const nodes = [source];
    const graph = new TopologyGraph(nodes, []);

    nodes.push(node('db', 'DATABASE'));
    sourceCapacity.throughput = 999;

    expect(graph.nodes).toHaveLength(1);
    expect(graph.node('app')?.capacity.throughput).toBe(100);
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(Object.isFrozen(graph.node('app'))).toBe(true);
    expect(Object.isFrozen(graph.node('app')?.capacity)).toBe(true);
  });
});
