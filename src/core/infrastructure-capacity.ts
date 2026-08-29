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

  const databaseId = V1_NODE_IDS.database(infrastructure.database.databaseId);
  if (nodeId === databaseId) {
    const base = nominalNodeSizeProfile(infrastructure.database.databaseId, infrastructure.database.size).capacity;
    const replicas = infrastructure.database.replicaCount;
    return {
      cpu: (base.cpu ?? 0) * (1 + 0.55 * replicas),
      io: (base.io ?? 0) * (1 + 0.75 * replicas),
      throughput: (base.throughput ?? 0) * (1 + 0.6 * replicas),
    };
  }

  if (nodeId === V1_NODE_IDS.storage) {
    const productId = infrastructure.hasTechnology('OBJECT_STORAGE') ? 'OBJECT_STORAGE' : 'LOCAL_STORAGE';
    return { ...nominalNodeSizeProfile(productId, infrastructure.nodeSize(nodeId)).capacity };
  }

  if (nodeId === V1_NODE_IDS.gateway && infrastructure.hasTechnology('ALB')) {
    return { ...nominalNodeSizeProfile('ALB', infrastructure.nodeSize(nodeId)).capacity };
  }

  if (nodeId === V1_NODE_IDS.cache && infrastructure.hasTechnology('REDIS')) {
    return { ...nominalNodeSizeProfile('REDIS', infrastructure.nodeSize(nodeId)).capacity };
  }

  const queue = infrastructure.queueTechnology;
  if (queue && nodeId === V1_NODE_IDS.queue(queue)) {
    return { ...nominalNodeSizeProfile(queue, infrastructure.nodeSize(nodeId)).capacity };
  }

  infrastructure.nodeSize(nodeId);
  throw new Error(`Unknown or non-owned infrastructure node: ${nodeId}`);
}
