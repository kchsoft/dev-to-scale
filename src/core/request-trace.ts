import type { ResourceRole, ResolvedRoute } from './service-topology';
import type { InfrastructureNodeId } from './topology';

export type RequestTraceNodeStatus = 'HEALTHY' | 'SLOW' | 'FAILED' | 'MISSING';

export interface RequestTraceNode {
  readonly stepId: string;
  readonly role: ResourceRole;
  readonly nodeId: InfrastructureNodeId | null;
  readonly arrivalRatio: number;
  readonly passThroughRatio: number;
  readonly status: RequestTraceNodeStatus;
}

export interface RequestTraceEdge {
  readonly edgeId: string;
  readonly trafficRatio: number;
}

export interface RequestTrace {
  readonly workloadId: string;
  readonly nodes: readonly RequestTraceNode[];
  readonly edges: readonly RequestTraceEdge[];
  readonly successRatio: number;
  readonly failureNodeId: InfrastructureNodeId | null;
}

export type NodeHealth = Readonly<Partial<Record<InfrastructureNodeId, number>>>;

function clampHealth(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class RequestTraceSimulator {
  static simulate(route: ResolvedRoute, nodeHealth: NodeHealth = {}): RequestTrace {
    const nodes: RequestTraceNode[] = [];
    const edges: RequestTraceEdge[] = [];
    let currentRatio = 1;
    let failureNodeId: InfrastructureNodeId | null = null;
    let previousNodeId: InfrastructureNodeId | null = null;

    for (const step of route.steps) {
      if (step.nodeId === null) {
        nodes.push(Object.freeze({
          stepId: step.stepId,
          role: step.role,
          nodeId: null,
          arrivalRatio: 0,
          passThroughRatio: currentRatio,
          status: 'MISSING' as const,
        }));
        if (step.requirement === 'REQUIRED') {
          currentRatio = 0;
          break;
        }
        continue;
      }

      const arrivalRatio = currentRatio;
      if (previousNodeId !== null) {
        const routeEdge = route.edges.find((edge) => (
          edge.fromNodeId === previousNodeId && edge.toNodeId === step.nodeId
        ));
        if (routeEdge) {
          edges.push(Object.freeze({
            edgeId: routeEdge.topologyEdgeId,
            trafficRatio: arrivalRatio,
          }));
        }
      }

      const health = clampHealth(nodeHealth[step.nodeId] ?? 1);
      currentRatio = arrivalRatio * health;
      const status: RequestTraceNodeStatus = health <= 0
        ? 'FAILED'
        : health < 1
          ? 'SLOW'
          : 'HEALTHY';
      nodes.push(Object.freeze({
        stepId: step.stepId,
        role: step.role,
        nodeId: step.nodeId,
        arrivalRatio,
        passThroughRatio: currentRatio,
        status,
      }));
      previousNodeId = step.nodeId;

      if (arrivalRatio > 0 && currentRatio <= 0) {
        failureNodeId = step.nodeId;
        break;
      }
    }

    return Object.freeze({
      workloadId: route.workloadId,
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      successRatio: currentRatio,
      failureNodeId,
    });
  }
}
