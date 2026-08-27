import { describe, expect, it } from 'vitest';
import { COMMUNITY_FEATURES } from '../community';
import { DeveloperProfile } from '../learning';
import { IncidentTopology } from '../incident-topology';
import { InfrastructureState, LoadCalculator } from '../infrastructure';
import { SingleServiceTopology, V1_NODE_IDS } from '../v1-topology';

describe('IncidentTopology', () => {
  it('uses actual topology node IDs and each node load ratio for candidates', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.deployTechnology('SQS');
    const features = [COMMUNITY_FEATURES.NOTIFICATION];
    const load = LoadCalculator.calculate(100_000, features, infrastructure);
    const topology = SingleServiceTopology.from(infrastructure, features);

    const candidates = IncidentTopology.candidates({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      developer: new DeveloperProfile(),
      infrastructure,
      topology: topology.graph,
      load,
    });

    expect(candidates.map(({ nodeId }) => nodeId)).toEqual([
      V1_NODE_IDS.app('SPRING_BOOT'),
      V1_NODE_IDS.database('POSTGRESQL'),
      V1_NODE_IDS.gateway,
      V1_NODE_IDS.queue('SQS'),
    ]);
    for (const candidate of candidates) {
      expect(candidate.loadRatio).toBe(
        load.nodeLoads.find(({ nodeId }) => nodeId === candidate.nodeId)?.loadRatio,
      );
      expect(topology.graph.node(candidate.nodeId)).toBeDefined();
    }
  });
});
