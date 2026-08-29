import { describe, expect, it } from 'vitest';
import { COMMUNITY_FEATURES } from '../community';
import { DeveloperProfile } from '../learning';
import { IncidentTopology } from '../incident-topology';
import { InfrastructureState, LoadCalculator } from '../infrastructure';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../node-load';
import { V1ServiceTopologyFactory, V1_NODE_IDS } from '../v1-topology';

describe('IncidentTopology', () => {
  it('uses actual topology node IDs and each node effective load ratio for candidates', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.deployTechnology('SQS');
    const features = [COMMUNITY_FEATURES.NOTIFICATION];
    const calculated = LoadCalculator.calculate(100_000, features, infrastructure);
    const appId = V1_NODE_IDS.app('SPRING_BOOT');
    const load = {
      ...calculated,
      nodeLoads: calculated.nodeLoads.map((node) => node.nodeId === appId
        ? createNodeLoadSnapshot(appId, 'SERVER_GROUP', [
          createNodeResourceLoad('CPU', 105, 100, 118),
          createNodeResourceLoad('IO', 40, 100, 96),
        ])
        : node),
    };
    const topology = V1ServiceTopologyFactory.create(infrastructure, features);

    expect(topology.graph.node(appId)?.kind).toBe('SERVER_GROUP');

    const candidates = IncidentTopology.candidates({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      developer: new DeveloperProfile(),
      infrastructure,
      topology: topology.graph,
      load,
    });

    expect(candidates.map(({ nodeId }) => nodeId)).toEqual([
      appId,
      V1_NODE_IDS.database('POSTGRESQL'),
      V1_NODE_IDS.gateway,
      V1_NODE_IDS.queue('SQS'),
    ]);
    for (const candidate of candidates) {
      expect(candidate.loadRatio).toBe(
        load.nodeLoads.find(({ nodeId }) => nodeId === candidate.nodeId)?.effectiveLoadRatio,
      );
      expect(topology.graph.node(candidate.nodeId)).toBeDefined();
    }
    expect(candidates.find(({ nodeId }) => nodeId === appId)?.loadRatio).toBeCloseTo(105 / 118);
  });
});
