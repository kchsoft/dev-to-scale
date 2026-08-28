import { describe, expect, it } from 'vitest';
import { InfrastructureState, nodeSizeProfile, ServerSize, SERVER_SIZE_VALUES } from '../infrastructure';
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
  it('gives every fixed owned product four monotonic capacity and cost tiers', () => {
    for (const productId of ['ALB', 'REDIS', 'SQS', 'RABBITMQ', 'KAFKA', 'LOCAL_STORAGE', 'OBJECT_STORAGE']) {
      const profiles = SERVER_SIZE_VALUES.map((size) => nodeSizeProfile(productId, size));

      expect(profiles).toHaveLength(4);
      for (let index = 1; index < profiles.length; index += 1) {
        expect(maxCapacity(profiles[index].capacity)).toBeGreaterThan(maxCapacity(profiles[index - 1].capacity));
        expect(profiles[index].monthlyCost).toBeGreaterThan(profiles[index - 1].monthlyCost);
      }
    }
  });

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

  it('changes total monthly cost by exactly the resized node tier delta', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('REDIS');
    infrastructure.deployTechnology('SQS');
    const state = sizing(infrastructure);
    const redisNodeId = V1_NODE_IDS.cache;

    const totalBefore = infrastructure.monthlyCost;
    const nodeBefore = state.nodeMonthlyCost(redisNodeId);
    state.resizeNode(redisNodeId, ServerSize.LARGE);
    const nodeAfter = state.nodeMonthlyCost(redisNodeId);

    expect(infrastructure.monthlyCost - totalBefore).toBeCloseTo(nodeAfter - nodeBefore);
    expect(state.nodeSize(V1_NODE_IDS.queue('SQS'))).toBe(ServerSize.SMALL);
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
