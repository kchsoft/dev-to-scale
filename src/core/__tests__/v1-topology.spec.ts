import { describe, expect, it } from 'vitest';
import { COMMUNITY_FEATURES } from '../community';
import { InfrastructureState } from '../infrastructure';
import {
  SingleServiceTopology,
  V1_NODE_IDS,
  V1RouteBlueprintAdapter,
} from '../v1-topology';

describe('V1RouteBlueprintAdapter', () => {
  it('preserves legacy route order and required/optional semantics', () => {
    const required = V1RouteBlueprintAdapter.fromFeature(COMMUNITY_FEATURES.AI_RECOMMENDATION);
    const optional = V1RouteBlueprintAdapter.fromFeature(COMMUNITY_FEATURES.PREMIUM);

    expect(required.steps.map(({ role, requirement }) => ({ role, requirement }))).toEqual([
      { role: 'ENTRY_APP', requirement: 'REQUIRED' },
      { role: 'PRIMARY_DATABASE', requirement: 'REQUIRED' },
      { role: 'EXTERNAL_SERVICE', requirement: 'REQUIRED' },
      { role: 'EVENT_BUS', requirement: 'REQUIRED' },
    ]);
    expect(required.edges.map(({ mode }) => mode)).toEqual(['SYNC', 'SYNC', 'ASYNC']);
    expect(optional.steps.at(-1)).toEqual(expect.objectContaining({
      role: 'EVENT_BUS',
      requirement: 'OPTIONAL',
    }));
  });
});

describe('SingleServiceTopology', () => {
  it('projects initial infrastructure into independent nodes and bindings', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const topology = SingleServiceTopology.from(infrastructure, [COMMUNITY_FEATURES.COMMENT]);

    expect(topology.graph.nodes.map(({ id }) => id)).toEqual([
      V1_NODE_IDS.app('SPRING_BOOT'),
      V1_NODE_IDS.database('POSTGRESQL'),
      V1_NODE_IDS.storage,
      V1_NODE_IDS.externalAi,
    ]);
    expect(topology.deployment.bindingFor('ENTRY_APP')).toBe(V1_NODE_IDS.app('SPRING_BOOT'));
    expect(topology.deployment.bindingFor('PRIMARY_DATABASE')).toBe(V1_NODE_IDS.database('POSTGRESQL'));
    expect(topology.deployment.bindingFor('OBJECT_STORAGE')).toBe(V1_NODE_IDS.storage);
    expect(topology.graph.node(V1_NODE_IDS.storage)).toEqual(expect.objectContaining({
      productId: 'LOCAL_STORAGE',
      capacity: { storage: 100 },
      monthlyCost: 0,
    }));
  });

  it('projects deployed technologies as independent nodes with current costs and capacity', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.deployTechnology('REDIS');
    infrastructure.deployTechnology('SQS');
    infrastructure.deployTechnology('OBJECT_STORAGE');

    const topology = SingleServiceTopology.from(infrastructure, [
      COMMUNITY_FEATURES.COMMENT,
      COMMUNITY_FEATURES.IMAGE_UPLOAD,
      COMMUNITY_FEATURES.NOTIFICATION,
    ]);

    expect(topology.graph.node(V1_NODE_IDS.gateway)).toEqual(expect.objectContaining({ monthlyCost: 100_000 }));
    expect(topology.graph.node(V1_NODE_IDS.cache)).toEqual(expect.objectContaining({ monthlyCost: 100_000 }));
    expect(topology.graph.node(V1_NODE_IDS.queue('SQS'))).toEqual(expect.objectContaining({
      capacity: { throughput: 300 },
      monthlyCost: 80_000,
    }));
    expect(topology.graph.node(V1_NODE_IDS.storage)).toEqual(expect.objectContaining({
      productId: 'OBJECT_STORAGE',
      capacity: { storage: 1_000 },
      monthlyCost: 80_000,
    }));
    expect(topology.graph.nodes.reduce((sum, node) => sum + node.monthlyCost, 0)).toBe(
      infrastructure.monthlyCost,
    );
    expect(topology.deployment.bindingFor('ENTRY_GATEWAY')).toBe(V1_NODE_IDS.gateway);
    expect(topology.deployment.bindingFor('CACHE')).toBe(V1_NODE_IDS.cache);
    expect(topology.deployment.bindingFor('EVENT_BUS')).toBe(V1_NODE_IDS.queue('SQS'));
    expect(topology.graph.hasEdge(V1_NODE_IDS.gateway, V1_NODE_IDS.app('SPRING_BOOT'))).toBe(true);
  });

  it('resolves adapted feature routes on the projected topology graph', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('SQS');
    const feature = COMMUNITY_FEATURES.AI_RECOMMENDATION;
    const topology = SingleServiceTopology.from(infrastructure, [feature]);

    const route = topology.resolve(feature.id);

    expect(route.steps.map(({ nodeId }) => nodeId)).toEqual([
      V1_NODE_IDS.app('SPRING_BOOT'),
      V1_NODE_IDS.database('POSTGRESQL'),
      V1_NODE_IDS.externalAi,
      V1_NODE_IDS.queue('SQS'),
    ]);
    expect(route.edges).toHaveLength(3);
  });

  it('changes only the event-bus binding and retired node when a queue is replaced', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('SQS');
    const feature = COMMUNITY_FEATURES.NOTIFICATION;
    const before = SingleServiceTopology.from(infrastructure, [feature]);

    const retired = infrastructure.deployTechnology('KAFKA');
    const after = SingleServiceTopology.from(infrastructure, [feature]);

    expect(retired).toEqual(['SQS']);
    expect(before.module.blueprints).toEqual(after.module.blueprints);
    expect(before.deployment.bindingFor('EVENT_BUS')).toBe(V1_NODE_IDS.queue('SQS'));
    expect(after.deployment.bindingFor('EVENT_BUS')).toBe(V1_NODE_IDS.queue('KAFKA'));
    expect(after.graph.node(V1_NODE_IDS.queue('SQS'))).toBeUndefined();
    expect(after.graph.node(V1_NODE_IDS.queue('KAFKA'))).toEqual(expect.objectContaining({
      productId: 'KAFKA',
      capacity: { throughput: 1_000 },
      monthlyCost: 350_000,
    }));
  });
});
