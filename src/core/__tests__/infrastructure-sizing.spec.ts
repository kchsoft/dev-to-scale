import { describe, expect, it } from 'vitest';
import { InfrastructureState, ServerSize } from '../infrastructure';
import { V1_NODE_IDS } from '../v1-topology';
import type { ResourceCapacity } from '../topology';

interface GenericSizingState {
  nodeSize(nodeId: string): ServerSize;
  resizeNode(nodeId: string, size: ServerSize): void;
  nodeCapacity(nodeId: string): ResourceCapacity;
  nodeMonthlyCost(nodeId: string): number;
}

function sizing(infrastructure: InfrastructureState): GenericSizingState {
  return infrastructure as unknown as GenericSizingState;
}

function maxCapacity(capacity: ResourceCapacity): number {
  return Math.max(
    capacity.cpu ?? 0,
    capacity.io ?? 0,
    capacity.throughput ?? 0,
    capacity.storage ?? 0,
  );
}

describe('generic infrastructure node sizing', () => {
  it('gives every player-owned initial/deployed node an independent SMALL tier that can resize', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.deployTechnology('REDIS');
    infrastructure.deployTechnology('SQS');
    infrastructure.deployTechnology('OBJECT_STORAGE');
    const state = sizing(infrastructure);
    const nodeIds = [
      V1_NODE_IDS.app('SPRING_BOOT'),
      V1_NODE_IDS.database('POSTGRESQL'),
      V1_NODE_IDS.gateway,
      V1_NODE_IDS.cache,
      V1_NODE_IDS.queue('SQS'),
      V1_NODE_IDS.storage,
    ];

    for (const nodeId of nodeIds) {
      expect(state.nodeSize(nodeId)).toBe(ServerSize.SMALL);
      const smallCapacity = maxCapacity(state.nodeCapacity(nodeId));
      const smallCost = state.nodeMonthlyCost(nodeId);

      state.resizeNode(nodeId, ServerSize.MEDIUM);

      expect(state.nodeSize(nodeId)).toBe(ServerSize.MEDIUM);
      expect(maxCapacity(state.nodeCapacity(nodeId))).toBeGreaterThan(smallCapacity);
      expect(state.nodeMonthlyCost(nodeId)).toBeGreaterThan(smallCost);
    }
  });

  it('keeps size state independent between owned nodes', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.deployTechnology('REDIS');
    const state = sizing(infrastructure);

    state.resizeNode(V1_NODE_IDS.gateway, ServerSize.LARGE);

    expect(state.nodeSize(V1_NODE_IDS.gateway)).toBe(ServerSize.LARGE);
    expect(state.nodeSize(V1_NODE_IDS.app('SPRING_BOOT'))).toBe(ServerSize.SMALL);
    expect(state.nodeSize(V1_NODE_IDS.cache)).toBe(ServerSize.SMALL);
    expect(state.nodeSize(V1_NODE_IDS.database('POSTGRESQL'))).toBe(ServerSize.SMALL);
  });

  it('starts replacement queue and object storage at SMALL instead of inheriting replaced capacity', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const state = sizing(infrastructure);

    infrastructure.deployTechnology('SQS');
    state.resizeNode(V1_NODE_IDS.queue('SQS'), ServerSize.XLARGE);
    infrastructure.deployTechnology('KAFKA');

    expect(state.nodeSize(V1_NODE_IDS.queue('KAFKA'))).toBe(ServerSize.SMALL);
    expect(() => state.nodeSize(V1_NODE_IDS.queue('SQS'))).toThrow(/node|infrastructure|unknown/i);

    state.resizeNode(V1_NODE_IDS.storage, ServerSize.XLARGE);
    infrastructure.deployTechnology('OBJECT_STORAGE');
    expect(state.nodeSize(V1_NODE_IDS.storage)).toBe(ServerSize.SMALL);
  });

  it('rejects unknown and external service sizing', () => {
    const state = sizing(InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL'));

    expect(() => state.resizeNode('missing:node', ServerSize.MEDIUM)).toThrow(/node|infrastructure|unknown/i);
    expect(() => state.resizeNode(V1_NODE_IDS.externalAi, ServerSize.MEDIUM)).toThrow(/node|infrastructure|external|unknown/i);
  });
});
