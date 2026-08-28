import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game-engine';
import { ServerSize } from '../infrastructure';
import { V1_NODE_IDS } from '../v1-topology';

interface GenericScalingEngine {
  resizeInfrastructureNode(nodeId: string, size: ServerSize): void;
  scaleOutInfrastructureNode(nodeId: string): void;
}

function generic(engine: GameEngine): GenericScalingEngine {
  return engine as unknown as GenericScalingEngine;
}

describe('generic infrastructure commands', () => {
  it('resizes any owned node through its topology node id and refreshes load immediately', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 1 });
    const commands = generic(engine);
    const storageNodeId = V1_NODE_IDS.storage;
    const beforeCapacity = engine.infrastructure.storageCapacity;

    commands.resizeInfrastructureNode(storageNodeId, ServerSize.LARGE);

    expect(engine.infrastructure.nodeSize(storageNodeId)).toBe(ServerSize.LARGE);
    expect(engine.infrastructure.storageCapacity).toBeGreaterThan(beforeCapacity);
    const storageLoad = engine.snapshot.load.nodeLoads.find((node) => node.nodeId === storageNodeId);
    expect(storageLoad?.resources[0]?.capacity).toBe(engine.infrastructure.storageCapacity);
  });

  it('routes horizontal scale-out by node capability and rejects unsupported nodes', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 2 });
    const commands = generic(engine);
    const appNodeId = V1_NODE_IDS.app('SPRING_BOOT');
    const dbNodeId = V1_NODE_IDS.database('POSTGRESQL');

    expect(() => commands.scaleOutInfrastructureNode(appNodeId)).toThrow(/ALB/i);

    engine.infrastructure.deployTechnology('ALB');
    commands.scaleOutInfrastructureNode(appNodeId);
    commands.scaleOutInfrastructureNode(dbNodeId);

    expect(engine.infrastructure.app.count).toBe(2);
    expect(engine.infrastructure.database.replicaCount).toBe(1);
    expect(() => commands.scaleOutInfrastructureNode(V1_NODE_IDS.storage)).toThrow(/scale|support|horizontal/i);
  });
});
