import type { TopologyEdgeView, TopologyNodeView } from '../application/game-view';

export interface TopologyNodePosition {
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

export interface TopologyEdgePath {
  readonly edgeId: string;
  readonly path: string;
}

export interface TopologyLayout {
  readonly viewBox: { readonly width: number; readonly height: number };
  readonly nodes: readonly TopologyNodePosition[];
  readonly edges: readonly TopologyEdgePath[];
}

const VIEWBOX = Object.freeze({ width: 1000, height: 620 });
const NODE_HALF_WIDTH = 80;

const COLUMN_BY_KIND: Readonly<Record<TopologyNodeView['kind'], number>> = Object.freeze({
  'load-balancer': 0,
  'server-group': 1,
  database: 2,
  cache: 2,
  queue: 2,
  'object-storage': 2,
  worker: 3,
  'external-service': 3,
});

const COLUMN_X = [180, 400, 650, 880] as const;

function positionNodes(nodes: readonly TopologyNodeView[]): readonly TopologyNodePosition[] {
  const columns = new Map<number, TopologyNodeView[]>();
  for (const node of nodes) {
    const column = COLUMN_BY_KIND[node.kind];
    const siblings = columns.get(column) ?? [];
    siblings.push(node);
    columns.set(column, siblings);
  }

  return Object.freeze([...columns.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([column, siblings]) => siblings
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node, index) => Object.freeze({
        nodeId: node.id,
        x: COLUMN_X[column],
        y: Math.round(VIEWBOX.height * (index + 1) / (siblings.length + 1)),
      }))));
}

function edgePath(
  edge: TopologyEdgeView,
  from: TopologyNodePosition,
  to: TopologyNodePosition,
): TopologyEdgePath {
  const direction = to.x >= from.x ? 1 : -1;
  const startX = from.x + NODE_HALF_WIDTH * direction;
  const endX = to.x - NODE_HALF_WIDTH * direction;
  const middleX = Math.round((startX + endX) / 2);
  return Object.freeze({
    edgeId: edge.id,
    path: `M ${startX} ${from.y} C ${middleX} ${from.y}, ${middleX} ${to.y}, ${endX} ${to.y}`,
  });
}

export function layoutTopology(
  nodes: readonly TopologyNodeView[],
  edges: readonly TopologyEdgeView[],
): TopologyLayout {
  const positions = positionNodes(nodes);
  const positionByNode = new Map(positions.map((position) => [position.nodeId, position]));
  const paths = [...edges]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((edge) => {
      const from = positionByNode.get(edge.fromNodeId);
      const to = positionByNode.get(edge.toNodeId);
      return from && to ? [edgePath(edge, from, to)] : [];
    });

  return Object.freeze({
    viewBox: VIEWBOX,
    nodes: positions,
    edges: Object.freeze(paths),
  });
}
