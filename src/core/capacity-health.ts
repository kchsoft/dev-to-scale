import type { NodeLoadCollection, NodeLoadSnapshot, NodeResourceLoad } from './node-load';
import type { NodeHealth } from './request-trace';

function clampHealth(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function resourceCapacityHealth(resource: NodeResourceLoad): number {
  if (resource.demand <= 0) return 1;
  if (resource.effectiveCapacity <= 0) return 0;
  return clampHealth(resource.effectiveCapacity / resource.demand);
}

export function nodeCapacityHealth(node: NodeLoadSnapshot): number {
  if (node.resources.length === 0) return 1;
  return Math.min(...node.resources.map(resourceCapacityHealth));
}

export function capacityHealthByNode(load: NodeLoadCollection): NodeHealth {
  const health: Record<string, number> = {};
  for (const node of load.nodeLoads) {
    if (node.nodeKind === 'EXTERNAL_SERVICE') continue;
    health[node.nodeId] = nodeCapacityHealth(node);
  }
  return Object.freeze(health);
}

export function composeNodeHealth(
  incidentHealth: NodeHealth = {},
  capacityHealth: NodeHealth = {},
): NodeHealth {
  const nodeIds = new Set([
    ...Object.keys(incidentHealth),
    ...Object.keys(capacityHealth),
  ]);
  const health: Record<string, number> = {};

  for (const nodeId of nodeIds) {
    const incident = clampHealth(incidentHealth[nodeId] ?? 1);
    const capacity = clampHealth(capacityHealth[nodeId] ?? 1);
    health[nodeId] = incident * capacity;
  }

  return Object.freeze(health);
}
