import type {
  InfrastructureNodeKind,
  NodeLoadSnapshot,
  RequestTrace,
  TopologyGraph,
} from '../core';
import { maxResourceLoad } from '../core';
import type {
  LoadTone,
  NodeScalingView,
  RequestTraceView,
  TopologyNodeView,
  TopologyView,
} from './game-view';
import { presentationCatalog } from './presentation-catalog';

interface IncidentProjectionSource {
  readonly id: string;
  readonly nodeId: string;
  readonly severity: string;
}

interface TopologyProjectionSource {
  readonly graph: TopologyGraph;
  readonly nodeLoads: readonly NodeLoadSnapshot[];
  readonly traces: readonly RequestTrace[];
  readonly incidents: readonly IncidentProjectionSource[];
  readonly dau: number;
  readonly scalingByNode?: ReadonlyMap<string, NodeScalingView>;
}

const KIND_VIEW: Readonly<Record<InfrastructureNodeKind, TopologyNodeView['kind']>> = Object.freeze({
  LOAD_BALANCER: 'load-balancer',
  SERVER_GROUP: 'server-group',
  DATABASE: 'database',
  CACHE: 'cache',
  QUEUE: 'queue',
  OBJECT_STORAGE: 'object-storage',
  WORKER: 'worker',
  EXTERNAL_SERVICE: 'external-service',
});

function percent(value: number): number {
  return Math.max(0, Math.round(value * 100));
}

function loadTone(loadRatio: number, incident: boolean): LoadTone {
  if (incident) return 'incident';
  if (loadRatio > 1) return 'overload';
  if (loadRatio >= 0.9) return 'critical';
  if (loadRatio >= 0.7) return 'busy';
  return 'stable';
}

function trafficUnitForDau(dau: number): number {
  if (dau <= 100_000) return 10_000;
  if (dau <= 1_000_000) return 100_000;
  if (dau <= 10_000_000) return 1_000_000;
  return 5_000_000;
}

function particleCountForDau(dau: number, trafficUnit: number): number {
  return dau <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(dau / trafficUnit)));
}

export class TopologyViewProjector {
  static project(source: TopologyProjectionSource): TopologyView {
    const incidentByNode = new Map(source.incidents.map((incident) => [incident.nodeId, incident]));
    const loadByNode = new Map(source.nodeLoads.map((load) => [load.nodeId, load]));
    const tracedNodeIds = new Set(source.traces.flatMap((trace) => (
      trace.nodes.flatMap((node) => node.nodeId === null ? [] : [node.nodeId])
    )));
    const visibleNodes = source.graph.nodes.filter((node) => (
      node.kind !== 'EXTERNAL_SERVICE' || tracedNodeIds.has(node.id)
    ));
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

    const nodes = visibleNodes.map((node): TopologyNodeView => {
      const load = loadByNode.get(node.id);
      const incident = incidentByNode.get(node.id);
      const capacity = Math.round(load
        ? maxResourceLoad({ nodeLoads: [load] })?.resource.capacity ?? 0
        : Math.max(
          node.capacity.cpu ?? 0,
          node.capacity.io ?? 0,
          node.capacity.throughput ?? 0,
          node.capacity.storage ?? 0,
        ));
      return Object.freeze({
        id: node.id,
        kind: KIND_VIEW[node.kind],
        name: presentationCatalog.label(node.productId),
        icon: presentationCatalog.topologyIcon(node.kind),
        loadPercent: percent(load?.loadRatio ?? 0),
        tone: loadTone(load?.loadRatio ?? 0, Boolean(incident)),
        detail: capacity > 0 ? `CAP ${capacity}` : 'CONNECTED',
        monthlyCost: node.monthlyCost,
        scaling: source.scalingByNode?.get(node.id) ?? null,
        ...(incident ? { incidentId: incident.id, incidentSeverity: incident.severity } : {}),
      });
    });
    const edges = source.graph.edges
      .filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))
      .map((edge) => Object.freeze({
        id: edge.id,
        fromNodeId: edge.from,
        toNodeId: edge.to,
        mode: edge.mode.toLowerCase() as 'sync' | 'async',
      }));
    const trafficUnit = trafficUnitForDau(source.dau);
    const traces = source.traces.map((trace): RequestTraceView => Object.freeze({
      id: trace.workloadId,
      name: presentationCatalog.label(trace.workloadId),
      nodes: Object.freeze(trace.nodes.map((node) => Object.freeze({
        nodeId: node.nodeId,
        requirement: node.requirement.toLowerCase() as RequestTraceView['nodes'][number]['requirement'],
        arrivalPercent: percent(node.arrivalRatio),
        status: node.status.toLowerCase() as RequestTraceView['nodes'][number]['status'],
      }))),
      edges: Object.freeze(trace.edges.map((edge) => Object.freeze({
        edgeId: edge.edgeId,
        trafficPercent: percent(edge.trafficRatio),
      }))),
      successPercent: percent(trace.successRatio),
      failureNodeId: trace.failureNodeId,
      particleCount: particleCountForDau(source.dau, trafficUnit),
      trafficUnit,
    }));

    return Object.freeze({
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      traces: Object.freeze(traces),
    });
  }
}
