import type {
  InfrastructureNodeKind,
  NodeLoadSnapshot,
  RequestTrace,
  TopologyGraph,
} from '../core';
import type {
  LoadTone,
  RequestTraceView,
  TopologyNodeView,
  TopologyView,
} from './game-view';

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
}

const PRODUCT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  SPRING_BOOT: 'Spring Boot',
  NESTJS: 'NestJS',
  GIN: 'Gin',
  FASTAPI: 'FastAPI',
  ASPNET_CORE: 'ASP.NET Core',
  POSTGRESQL: 'PostgreSQL',
  MYSQL: 'MySQL',
  MONGODB: 'MongoDB',
  REDIS: 'Redis',
  SQS: 'SQS',
  RABBITMQ: 'RabbitMQ',
  KAFKA: 'Kafka',
  ALB: 'ALB',
  OBJECT_STORAGE: 'Object Storage',
  LOCAL_STORAGE: 'Local Storage',
  EXTERNAL_AI: 'AI Provider',
});

const WORKLOAD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  COMMUNITY_MVP: '게시글', COMMENT: '댓글', LIKE: '좋아요', IMAGE_UPLOAD: '이미지 업로드',
  SEARCH: '검색', NOTIFICATION: '알림', AI_RECOMMENDATION: 'AI 개인화 추천',
  POPULAR_POSTS: '인기글', FOLLOW_FEED: '팔로우 피드', ADS: '광고', PREMIUM: 'Premium',
});

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

const KIND_ICON: Readonly<Record<InfrastructureNodeKind, string>> = Object.freeze({
  LOAD_BALANCER: '⎇',
  SERVER_GROUP: '◈',
  DATABASE: '◉',
  CACHE: '◆',
  QUEUE: '⇢',
  OBJECT_STORAGE: '▣',
  WORKER: '◇',
  EXTERNAL_SERVICE: '◎',
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
      const capacity = Math.round(load?.capacity ?? Math.max(
        node.capacity.cpu ?? 0,
        node.capacity.io ?? 0,
        node.capacity.throughput ?? 0,
        node.capacity.storage ?? 0,
      ));
      return Object.freeze({
        id: node.id,
        kind: KIND_VIEW[node.kind],
        name: PRODUCT_LABELS[node.productId] ?? node.productId,
        icon: KIND_ICON[node.kind],
        loadPercent: percent(load?.loadRatio ?? 0),
        tone: loadTone(load?.loadRatio ?? 0, Boolean(incident)),
        detail: capacity > 0 ? `CAP ${capacity}` : 'CONNECTED',
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
      name: WORKLOAD_LABELS[trace.workloadId] ?? trace.workloadId,
      nodes: Object.freeze(trace.nodes.map((node) => Object.freeze({
        nodeId: node.nodeId,
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
