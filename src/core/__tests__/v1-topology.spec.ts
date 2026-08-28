import { describe, expect, it } from 'vitest';
import { COMMUNITY_FEATURES } from '../community';
import { InfrastructureState } from '../infrastructure';
import { RequestTraceSimulator } from '../request-trace';
import {
  SingleServiceTopology,
  V1_MODULE_ID,
  V1_NODE_IDS,
  V1RouteBlueprintAdapter,
  V1ServiceTopologyFactory,
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
    const before = V1ServiceTopologyFactory.create(infrastructure, [feature]);

    const retired = infrastructure.deployTechnology('KAFKA');
    const after = V1ServiceTopologyFactory.create(infrastructure, [feature]);

    expect(retired).toEqual(['SQS']);
    expect(before.module(V1_MODULE_ID)?.blueprints).toEqual(after.module(V1_MODULE_ID)?.blueprints);
    expect(before.deployment(V1_MODULE_ID)?.bindingFor('EVENT_BUS')).toBe(V1_NODE_IDS.queue('SQS'));
    expect(after.deployment(V1_MODULE_ID)?.bindingFor('EVENT_BUS')).toBe(V1_NODE_IDS.queue('KAFKA'));
    expect(after.graph.node(V1_NODE_IDS.queue('SQS'))).toBeUndefined();
    expect(after.graph.node(V1_NODE_IDS.queue('KAFKA'))).toEqual(expect.objectContaining({
      productId: 'KAFKA',
      capacity: { throughput: 1_000 },
      monthlyCost: 350_000,
    }));
  });

  it('composes ALB ingress into runtime traces without changing the module blueprint', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const feature = COMMUNITY_FEATURES.COMMENT;
    const before = V1ServiceTopologyFactory.create(infrastructure, [feature]);
    infrastructure.deployTechnology('ALB');
    const after = V1ServiceTopologyFactory.create(infrastructure, [feature]);

    const trace = RequestTraceSimulator.simulate(after.resolveForTrace(feature.id));

    expect(before.module(V1_MODULE_ID)?.blueprints).toEqual(after.module(V1_MODULE_ID)?.blueprints);
    expect(trace.nodes.map(({ nodeId }) => nodeId)).toEqual([
      V1_NODE_IDS.gateway,
      V1_NODE_IDS.app('SPRING_BOOT'),
      V1_NODE_IDS.database('POSTGRESQL'),
    ]);
    expect(trace.edges[0]?.edgeId).toContain(`${V1_NODE_IDS.gateway}:${V1_NODE_IDS.app('SPRING_BOOT')}`);
  });

  it('preserves a missing required queue as a failed runtime trace step', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const feature = COMMUNITY_FEATURES.NOTIFICATION;
    const topology = SingleServiceTopology.from(infrastructure, [feature]);

    const trace = RequestTraceSimulator.simulate(topology.resolveForTrace(feature.id));

    expect(trace.nodes.at(-1)).toEqual(expect.objectContaining({
      role: 'EVENT_BUS',
      nodeId: null,
      status: 'MISSING',
    }));
    expect(trace.successRatio).toBe(0);
  });
});

describe('V1ServiceTopologyFactory', () => {
  it('creates the community catalog through the generic aggregate', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const topology = V1ServiceTopologyFactory.create(infrastructure, [COMMUNITY_FEATURES.COMMENT]);

    expect(V1_MODULE_ID).toBe('community');
    expect(topology.modules.map(({ id }) => id)).toEqual(['community']);
    expect(topology.deployments.map(({ moduleId }) => moduleId)).toEqual(['community']);
    expect(topology.assignments).toEqual([
      expect.objectContaining({ workloadId: 'COMMENT', entryModuleId: 'community' }),
    ]);
    expect(topology.module(V1_MODULE_ID)?.blueprints).toHaveLength(1);
    expect(topology.deployment(V1_MODULE_ID)?.bindingFor('ENTRY_APP')).toBe(
      V1_NODE_IDS.app('SPRING_BOOT'),
    );
    expect(topology.resolve('COMMENT').steps.map(({ nodeId }) => nodeId)).toEqual([
      V1_NODE_IDS.app('SPRING_BOOT'),
      V1_NODE_IDS.database('POSTGRESQL'),
    ]);
  });
});
