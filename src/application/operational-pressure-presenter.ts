import type {
  InfrastructureNode,
  InfrastructureNodeKind,
  NodeResourceKind,
  OperationalPressure,
  OperationalPressureBasis,
  ServiceTopology,
} from '../core';
import { operationalPressureRatio } from '../core';
import type { BottleneckView, CapacityStatusView, LoadTone, TopologyNodeView } from './game-view';
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

export interface OperationalPressureChange {
  readonly pressure: OperationalPressure;
  readonly beforeRatio: number;
  readonly afterRatio: number;
  readonly delta: number;
}

function pressureKey(pressure: Pick<OperationalPressure, 'nodeId' | 'resourceKind'>): string {
  return `${pressure.nodeId}::${pressure.resourceKind}`;
}

export function operationalPressureChanges(
  before: readonly OperationalPressure[],
  after: readonly OperationalPressure[],
  basis: OperationalPressureBasis,
): readonly OperationalPressureChange[] {
  const beforeByKey = new Map(before.map((pressure) => [pressureKey(pressure), pressure] as const));
  const changes = after.map((pressure) => {
    const previous = beforeByKey.get(pressureKey(pressure));
    const beforeRatio = previous ? operationalPressureRatio(previous, basis) : 0;
    const afterRatio = operationalPressureRatio(pressure, basis);
    return Object.freeze({
      pressure,
      beforeRatio,
      afterRatio,
      delta: afterRatio - beforeRatio,
    });
  });
  return Object.freeze(changes);
}

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

export function capacityStatus(nominalRatio: number, effectiveRatio: number): CapacityStatusView {
  if (effectiveRatio > 1) return 'OVERLOAD';
  if (nominalRatio >= 1) return 'WARNING';
  return 'NORMAL';
}

export function operationalLoadTone(nominalRatio: number, effectiveRatio: number): LoadTone {
  if (effectiveRatio > 1) return 'overload';
  if (nominalRatio >= 0.9) return 'critical';
  if (nominalRatio >= 0.7) return 'busy';
  return 'stable';
}

export function hardLimitPercent(pressure: Pick<OperationalPressure, 'nominalCapacity' | 'effectiveCapacity'>): number {
  if (pressure.nominalCapacity <= 0) return 0;
  return Math.max(0, Math.round(pressure.effectiveCapacity / pressure.nominalCapacity * 100));
}

export function capacityFailurePercent(effectiveRatio: number): number {
  if (effectiveRatio <= 1) return 0;
  if (!Number.isFinite(effectiveRatio)) return 100;
  return Math.max(0, Math.round((1 - 1 / effectiveRatio) * 100));
}

export function toBottleneckView(topology: ServiceTopology, pressure: OperationalPressure): BottleneckView {
  return Object.freeze({
    nodeId: pressure.nodeId,
    nodeKind: VIEW_KIND[pressure.nodeKind],
    resourceKind: pressure.resourceKind,
    nominalRatio: pressure.nominalRatio,
    effectiveRatio: pressure.effectiveRatio,
    percent: Math.max(0, Math.round(pressure.nominalRatio * 100)),
    effectivePercent: Math.max(0, Math.round(pressure.effectiveRatio * 100)),
    hardLimitPercent: hardLimitPercent(pressure),
    capacityFailurePercent: capacityFailurePercent(pressure.effectiveRatio),
    status: capacityStatus(pressure.nominalRatio, pressure.effectiveRatio),
    label: operationalPressureLabel(topology, pressure),
  });
}
