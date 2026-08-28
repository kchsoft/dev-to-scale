import type { InfrastructureNodeId, InfrastructureNodeKind } from './topology';

export const NODE_RESOURCE_KINDS = ['CPU', 'IO', 'THROUGHPUT', 'STORAGE'] as const;
export type NodeResourceKind = typeof NODE_RESOURCE_KINDS[number];

export interface NodeResourceLoad {
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly capacity: number;
  readonly ratio: number;
}

export interface NodeLoadSnapshot {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resources: readonly NodeResourceLoad[];
  readonly loadRatio: number;
}

export class LoadValidationError extends Error {
  constructor(readonly code: 'DUPLICATE_NODE_RESOURCE_KIND', message: string) {
    super(message);
    this.name = 'LoadValidationError';
  }
}

export interface NodeLoadCollection {
  readonly nodeLoads: readonly NodeLoadSnapshot[];
}

export function createNodeResourceLoad(
  resourceKind: NodeResourceKind,
  demand: number,
  capacity: number,
): NodeResourceLoad {
  return Object.freeze({
    resourceKind,
    demand,
    capacity,
    ratio: capacity > 0 ? demand / capacity : 0,
  });
}

export function createNodeLoadSnapshot(
  nodeId: InfrastructureNodeId,
  nodeKind: InfrastructureNodeKind,
  resources: readonly NodeResourceLoad[],
): NodeLoadSnapshot {
  const seen = new Set<NodeResourceKind>();
  for (const resource of resources) {
    if (seen.has(resource.resourceKind)) {
      throw new LoadValidationError(
        'DUPLICATE_NODE_RESOURCE_KIND',
        `Node ${nodeId} contains duplicate ${resource.resourceKind} resource load`,
      );
    }
    seen.add(resource.resourceKind);
  }
  const order = new Map(NODE_RESOURCE_KINDS.map((kind, index) => [kind, index]));
  const normalized = Object.freeze([...resources].sort((left, right) => (
    order.get(left.resourceKind)! - order.get(right.resourceKind)!
  )));
  return Object.freeze({
    nodeId,
    nodeKind,
    resources: normalized,
    loadRatio: Math.max(0, ...normalized.map(({ ratio }) => ratio)),
  });
}

export function nodeLoad(load: NodeLoadCollection, nodeId: InfrastructureNodeId): NodeLoadSnapshot | undefined {
  return load.nodeLoads.find((node) => node.nodeId === nodeId);
}

export function resourceLoad(node: NodeLoadSnapshot, resourceKind: NodeResourceKind): NodeResourceLoad | undefined {
  return node.resources.find((resource) => resource.resourceKind === resourceKind);
}

export function nodeLoadsOfKind(
  load: NodeLoadCollection,
  nodeKind: InfrastructureNodeKind,
): readonly NodeLoadSnapshot[] {
  return load.nodeLoads.filter((node) => node.nodeKind === nodeKind);
}

export function maxNodeLoad(
  load: NodeLoadCollection,
  filter?: { readonly nodeKind?: InfrastructureNodeKind },
): NodeLoadSnapshot | undefined {
  let max: NodeLoadSnapshot | undefined;
  for (const node of load.nodeLoads) {
    if (filter?.nodeKind !== undefined && node.nodeKind !== filter.nodeKind) continue;
    if (max === undefined || node.loadRatio > max.loadRatio) max = node;
  }
  return max;
}

export function maxResourceLoad(
  load: NodeLoadCollection,
  filter?: {
    readonly nodeKind?: InfrastructureNodeKind;
    readonly resourceKind?: NodeResourceKind;
  },
): { readonly node: NodeLoadSnapshot; readonly resource: NodeResourceLoad } | undefined {
  let max: { readonly node: NodeLoadSnapshot; readonly resource: NodeResourceLoad } | undefined;
  for (const node of load.nodeLoads) {
    if (filter?.nodeKind !== undefined && node.nodeKind !== filter.nodeKind) continue;
    for (const resource of node.resources) {
      if (filter?.resourceKind !== undefined && resource.resourceKind !== filter.resourceKind) continue;
      if (max === undefined || resource.ratio > max.resource.ratio) max = { node, resource };
    }
  }
  return max;
}
