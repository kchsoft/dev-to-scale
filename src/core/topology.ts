export type InfrastructureNodeId = string;

export type InfrastructureNodeKind =
  | 'LOAD_BALANCER'
  | 'SERVER_GROUP'
  | 'DATABASE'
  | 'CACHE'
  | 'QUEUE'
  | 'OBJECT_STORAGE'
  | 'WORKER'
  | 'EXTERNAL_SERVICE';

export interface ResourceCapacity {
  readonly cpu?: number;
  readonly io?: number;
  readonly throughput?: number;
  readonly storage?: number;
}

export interface InfrastructureNode {
  readonly id: InfrastructureNodeId;
  readonly kind: InfrastructureNodeKind;
  readonly productId: string;
  readonly capacity: ResourceCapacity;
  readonly monthlyCost: number;
}

export type TopologyEdgeMode = 'SYNC' | 'ASYNC';

export interface TopologyEdge {
  readonly id: string;
  readonly from: InfrastructureNodeId;
  readonly to: InfrastructureNodeId;
  readonly mode: TopologyEdgeMode;
}

export type TopologyValidationErrorCode =
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_EDGE_ID'
  | 'MISSING_EDGE_ENDPOINT'
  | 'DUPLICATE_BLUEPRINT_STEP_ID'
  | 'DUPLICATE_BLUEPRINT_EDGE_ID'
  | 'MISSING_BLUEPRINT_EDGE_ENDPOINT'
  | 'MISSING_REQUIRED_BINDING'
  | 'MISSING_BOUND_NODE'
  | 'INCOMPATIBLE_BINDING'
  | 'DISCONNECTED_ROUTE'
  | 'SYNCHRONOUS_ROUTE_CYCLE'
  | 'MISSING_ENTRY_MODULE'
  | 'DUPLICATE_MODULE_ID'
  | 'DUPLICATE_MODULE_DEPLOYMENT'
  | 'DUPLICATE_WORKLOAD_ASSIGNMENT'
  | 'DUPLICATE_MODULE_WORKLOAD'
  | 'UNKNOWN_DEPLOYMENT_MODULE'
  | 'MISSING_WORKLOAD_BLUEPRINT'
  | 'UNKNOWN_WORKLOAD_ASSIGNMENT';

export class TopologyValidationError extends Error {
  constructor(
    readonly code: TopologyValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TopologyValidationError';
  }
}

function immutableNode(node: InfrastructureNode): InfrastructureNode {
  return Object.freeze({
    ...node,
    capacity: Object.freeze({ ...node.capacity }),
  });
}

function immutableEdge(edge: TopologyEdge): TopologyEdge {
  return Object.freeze({ ...edge });
}

export class TopologyGraph {
  readonly nodes: readonly InfrastructureNode[];
  readonly edges: readonly TopologyEdge[];

  private readonly nodesById: ReadonlyMap<InfrastructureNodeId, InfrastructureNode>;

  constructor(nodes: readonly InfrastructureNode[], edges: readonly TopologyEdge[]) {
    const nodesById = new Map<InfrastructureNodeId, InfrastructureNode>();
    const immutableNodes = nodes.map(immutableNode);

    for (const node of immutableNodes) {
      if (nodesById.has(node.id)) {
        throw new TopologyValidationError(
          'DUPLICATE_NODE_ID',
          `Topology node ID must be unique: ${node.id}`,
        );
      }
      nodesById.set(node.id, node);
    }

    const edgeIds = new Set<string>();
    const immutableEdges = edges.map(immutableEdge);
    for (const edge of immutableEdges) {
      if (edgeIds.has(edge.id)) {
        throw new TopologyValidationError(
          'DUPLICATE_EDGE_ID',
          `Topology edge ID must be unique: ${edge.id}`,
        );
      }
      edgeIds.add(edge.id);

      if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) {
        throw new TopologyValidationError(
          'MISSING_EDGE_ENDPOINT',
          `Topology edge ${edge.id} references a missing endpoint: ${edge.from} -> ${edge.to}`,
        );
      }
    }

    this.nodes = Object.freeze(immutableNodes);
    this.edges = Object.freeze(immutableEdges);
    this.nodesById = nodesById;
  }

  node(id: InfrastructureNodeId): InfrastructureNode | undefined {
    return this.nodesById.get(id);
  }

  edge(
    from: InfrastructureNodeId,
    to: InfrastructureNodeId,
    mode?: TopologyEdgeMode,
  ): TopologyEdge | undefined {
    return this.edges.find((edge) => (
      edge.from === from
      && edge.to === to
      && (mode === undefined || edge.mode === mode)
    ));
  }

  hasEdge(from: InfrastructureNodeId, to: InfrastructureNodeId): boolean {
    return this.edge(from, to) !== undefined;
  }
}
