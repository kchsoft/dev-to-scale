import type {
  InfrastructureNode,
  InfrastructureNodeKind,
  NodeResourceKind,
  OperationalPressure,
  ServiceTopology,
} from '../core';
import type { BottleneckView, TopologyNodeView } from './game-view';
import { presentationCatalog } from './presentation-catalog';

const VIEW_KIND: Readonly<Record<InfrastructureNodeKind, TopologyNodeView['kind']>> = {
  LOAD_BALANCER: 'load-balancer',
  SERVER_GROUP: 'server-group',
  DATABASE: 'database',
  CACHE: 'cache',
  QUEUE: 'queue',
  OBJECT_STORAGE: 'object-storage',
  WORKER: 'worker',
  EXTERNAL_SERVICE: 'external-service',
};

export function resourceLabel(kind: NodeResourceKind): string {
  return kind === 'IO' ? 'I/O' : kind;
}

export function playerOwnedTopologyNodes(topology: ServiceTopology): readonly InfrastructureNode[] {
  return topology.graph.nodes.filter(({ kind }) => kind !== 'EXTERNAL_SERVICE');
}

export function playerOwnedTopologyNodeIds(topology: ServiceTopology): ReadonlySet<string> {
  return new Set(playerOwnedTopologyNodes(topology).map(({ id }) => id));
}

export function operationalNodeLabel(topology: ServiceTopology, nodeId: string): string {
  const node = topology.graph.node(nodeId);
  return node ? presentationCatalog.label(node.productId) : nodeId;
}

export function operationalPressureLabel(topology: ServiceTopology, pressure: OperationalPressure): string {
  return `${operationalNodeLabel(topology, pressure.nodeId)} ${resourceLabel(pressure.resourceKind)}`;
}

export function toBottleneckView(topology: ServiceTopology, pressure: OperationalPressure): BottleneckView {
  return Object.freeze({
    nodeId: pressure.nodeId,
    nodeKind: VIEW_KIND[pressure.nodeKind],
    resourceKind: pressure.resourceKind,
    ratio: pressure.ratio,
    percent: Math.max(0, Math.round(pressure.ratio * 100)),
    label: operationalPressureLabel(topology, pressure),
  });
}
