import { describe, expect, it } from 'vitest';
import type { TopologyEdgeView, TopologyNodeView } from '../../application/game-view';
import { layoutTopology } from '../topology-layout';

function node(id: string, kind: TopologyNodeView['kind']): TopologyNodeView {
  return { id, kind, name: id, icon: '•', loadPercent: 0, tone: 'stable', detail: 'CONNECTED' };
}

describe('layoutTopology', () => {
  it('places infrastructure in deterministic role columns with distinct sibling rows', () => {
    const nodes = [
      node('storage', 'object-storage'),
      node('queue', 'queue'),
      node('db', 'database'),
      node('app', 'server-group'),
      node('gateway', 'load-balancer'),
      node('worker', 'worker'),
    ];
    const edges: TopologyEdgeView[] = [
      { id: 'gateway-app', fromNodeId: 'gateway', toNodeId: 'app', mode: 'sync' },
      { id: 'app-db', fromNodeId: 'app', toNodeId: 'db', mode: 'sync' },
      { id: 'app-queue', fromNodeId: 'app', toNodeId: 'queue', mode: 'async' },
      { id: 'queue-worker', fromNodeId: 'queue', toNodeId: 'worker', mode: 'async' },
    ];

    const layout = layoutTopology(nodes, edges);
    const positions = new Map(layout.nodes.map((position) => [position.nodeId, position]));

    expect(layout.viewBox).toEqual({ width: 1000, height: 620 });
    expect(positions.get('gateway')).toEqual({ nodeId: 'gateway', x: 180, y: 310 });
    expect(positions.get('app')).toEqual({ nodeId: 'app', x: 400, y: 310 });
    expect(positions.get('db')?.x).toBe(650);
    expect(positions.get('queue')?.x).toBe(650);
    expect(positions.get('storage')?.x).toBe(650);
    expect(new Set(['db', 'queue', 'storage'].map((id) => positions.get(id)?.y)).size).toBe(3);
    expect(positions.get('worker')).toEqual({ nodeId: 'worker', x: 880, y: 310 });
    expect(layout.edges.find((edge) => edge.edgeId === 'gateway-app')).toEqual({
      edgeId: 'gateway-app',
      path: 'M 260 310 C 290 310, 290 310, 320 310',
    });
  });

  it('is independent of input order and ignores an edge with a missing endpoint', () => {
    const nodes = [node('app', 'server-group'), node('db', 'database')];
    const edges: TopologyEdgeView[] = [
      { id: 'missing', fromNodeId: 'app', toNodeId: 'retired-queue', mode: 'async' },
      { id: 'app-db', fromNodeId: 'app', toNodeId: 'db', mode: 'sync' },
    ];

    const forward = layoutTopology(nodes, edges);
    const reversed = layoutTopology([...nodes].reverse(), [...edges].reverse());

    expect(forward).toEqual(reversed);
    expect(forward.edges).toEqual([
      { edgeId: 'app-db', path: 'M 480 310 C 525 310, 525 310, 570 310' },
    ]);
  });
});
