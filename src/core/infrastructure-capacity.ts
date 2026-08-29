import type { InfrastructureState } from './infrastructure';
import { nominalNodeSizeProfile } from './infrastructure-sizing';
import type { InfrastructureNodeId, ResourceCapacity } from './topology';
import { V1_NODE_IDS } from './v1-topology';

function scaleCapacity(capacity: ResourceCapacity, multiplier: number): ResourceCapacity {
  return {
    ...(capacity.cpu === undefined ? {} : { cpu: capacity.cpu * multiplier }),
    ...(capacity.io === undefined ? {} : { io: capacity.io * multiplier }),
    ...(capacity.throughput === undefined ? {} : { throughput: capacity.throughput * multiplier }),
    ...(capacity.storage === undefined ? {} : { storage: capacity.storage * multiplier }),
  };
}

export function nominalNodeCapacity(
  infrastructure: InfrastructureState,
  nodeId: InfrastructureNodeId,
): ResourceCapacity {
  const appId = V1_NODE_IDS.app(infrastructure.app.frameworkId);
  if (nodeId === appId) {
    const capacity = nominalNodeSizeProfile(infrastructure.app.frameworkId, infrastructure.app.size).capacity;
    return scaleCapacity(capacity, infrastructure.app.count);
  }

  throw new Error(`Nominal capacity is not implemented for node: ${nodeId}`);
}
