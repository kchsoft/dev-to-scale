import { describe, expect, it } from 'vitest';
import {
  ModuleDeployment,
  RouteBlueprint,
  RouteResolver,
  ServiceModule,
  ServiceTopology,
  WorkloadAssignment,
} from '../service-topology';
import { InfrastructureNode, TopologyGraph } from '../topology';

function node(id: string, kind: InfrastructureNode['kind']): InfrastructureNode {
  return { id, kind, productId: id, capacity: {}, monthlyCost: 0 };
}

function requestBlueprint(moduleId = 'community'): RouteBlueprint {
  return new RouteBlueprint('comment', moduleId, [
    { id: 'app', role: 'ENTRY_APP', requirement: 'REQUIRED' },
    { id: 'db', role: 'PRIMARY_DATABASE', requirement: 'REQUIRED' },
  ], [
    { id: 'app-db', fromStepId: 'app', toStepId: 'db', mode: 'SYNC' },
  ]);
}

describe('module deployments', () => {
  it('allows multiple module deployments to share one independent queue', () => {
    const community = new ModuleDeployment('community', [
      ['ENTRY_APP', 'app-community'],
      ['EVENT_BUS', 'shared-queue'],
    ]);
    const notification = new ModuleDeployment('notification', [
      ['ENTRY_APP', 'app-notification'],
      ['EVENT_BUS', 'shared-queue'],
    ]);

    expect(community.bindingFor('EVENT_BUS')).toBe('shared-queue');
    expect(notification.bindingFor('EVENT_BUS')).toBe('shared-queue');
  });

  it('resolves the same role blueprint to different server and database paths', () => {
    const graph = new TopologyGraph([
      node('app-a', 'SERVER_GROUP'),
      node('db-a', 'DATABASE'),
      node('app-b', 'SERVER_GROUP'),
      node('db-b', 'DATABASE'),
    ], [
      { id: 'route-a', from: 'app-a', to: 'db-a', mode: 'SYNC' },
      { id: 'route-b', from: 'app-b', to: 'db-b', mode: 'SYNC' },
    ]);
    const blueprint = requestBlueprint();

    const routeA = RouteResolver.resolve(blueprint, new ModuleDeployment('community', [
      ['ENTRY_APP', 'app-a'],
      ['PRIMARY_DATABASE', 'db-a'],
    ]), graph);
    const routeB = RouteResolver.resolve(blueprint, new ModuleDeployment('community', [
      ['ENTRY_APP', 'app-b'],
      ['PRIMARY_DATABASE', 'db-b'],
    ]), graph);

    expect(routeA.steps.map(({ nodeId }) => nodeId)).toEqual(['app-a', 'db-a']);
    expect(routeB.steps.map(({ nodeId }) => nodeId)).toEqual(['app-b', 'db-b']);
  });
});

describe('RouteResolver validation', () => {
  const graph = new TopologyGraph([
    node('app', 'SERVER_GROUP'),
    node('db', 'DATABASE'),
    node('queue', 'QUEUE'),
  ], [
    { id: 'app-db', from: 'app', to: 'db', mode: 'SYNC' },
  ]);

  it('rejects a missing required role binding', () => {
    const deployment = new ModuleDeployment('community', [['ENTRY_APP', 'app']]);

    expect(() => RouteResolver.resolve(requestBlueprint(), deployment, graph)).toThrowError(
      expect.objectContaining({ code: 'MISSING_REQUIRED_BINDING' }),
    );
    expect(RouteResolver.resolveForTrace(requestBlueprint(), deployment, graph).steps.at(-1)).toEqual(
      expect.objectContaining({
        role: 'PRIMARY_DATABASE',
        requirement: 'REQUIRED',
        nodeId: null,
      }),
    );
  });

  it('keeps an unbound optional step without treating it as an error', () => {
    const blueprint = new RouteBlueprint('comment', 'community', [
      { id: 'app', role: 'ENTRY_APP', requirement: 'REQUIRED' },
      { id: 'queue', role: 'EVENT_BUS', requirement: 'OPTIONAL' },
    ], [
      { id: 'app-queue', fromStepId: 'app', toStepId: 'queue', mode: 'ASYNC' },
    ]);
    const deployment = new ModuleDeployment('community', [['ENTRY_APP', 'app']]);

    const route = RouteResolver.resolve(blueprint, deployment, graph);

    expect(route.steps).toEqual([
      expect.objectContaining({ stepId: 'app', nodeId: 'app' }),
      expect.objectContaining({ stepId: 'queue', nodeId: null, requirement: 'OPTIONAL' }),
    ]);
    expect(route.edges).toEqual([]);
  });

  it('bypasses an unbound optional middle step through a valid topology edge', () => {
    const blueprint = new RouteBlueprint('search', 'community', [
      { id: 'app', role: 'ENTRY_APP', requirement: 'REQUIRED' },
      { id: 'cache', role: 'CACHE', requirement: 'OPTIONAL' },
      { id: 'db', role: 'PRIMARY_DATABASE', requirement: 'REQUIRED' },
    ], [
      { id: 'app-cache', fromStepId: 'app', toStepId: 'cache', mode: 'SYNC' },
      { id: 'cache-db', fromStepId: 'cache', toStepId: 'db', mode: 'SYNC' },
    ]);
    const deployment = new ModuleDeployment('community', [
      ['ENTRY_APP', 'app'],
      ['PRIMARY_DATABASE', 'db'],
    ]);

    const route = RouteResolver.resolve(blueprint, deployment, graph);

    expect(route.steps[1]).toEqual(expect.objectContaining({ nodeId: null }));
    expect(route.edges).toEqual([
      expect.objectContaining({
        blueprintEdgeId: 'app-cache+cache-db',
        topologyEdgeId: 'app-db',
        fromNodeId: 'app',
        toNodeId: 'db',
      }),
    ]);
  });

  it.each([
    {
      name: 'a binding to a missing node',
      deployment: new ModuleDeployment('community', [
        ['ENTRY_APP', 'app'],
        ['PRIMARY_DATABASE', 'missing'],
      ]),
      targetGraph: graph,
      code: 'MISSING_BOUND_NODE',
    },
    {
      name: 'an incompatible role and node kind',
      deployment: new ModuleDeployment('community', [
        ['ENTRY_APP', 'app'],
        ['PRIMARY_DATABASE', 'queue'],
      ]),
      targetGraph: graph,
      code: 'INCOMPATIBLE_BINDING',
    },
    {
      name: 'a route disconnected in the topology graph',
      deployment: new ModuleDeployment('community', [
        ['ENTRY_APP', 'app'],
        ['PRIMARY_DATABASE', 'db'],
      ]),
      targetGraph: new TopologyGraph([
        node('app', 'SERVER_GROUP'),
        node('db', 'DATABASE'),
      ], []),
      code: 'DISCONNECTED_ROUTE',
    },
  ])('rejects $name', ({ deployment, targetGraph, code }) => {
    expect(() => RouteResolver.resolve(requestBlueprint(), deployment, targetGraph)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('rejects a synchronous cycle in a blueprint', () => {
    const cyclic = new RouteBlueprint('comment', 'community', [
      { id: 'app', role: 'ENTRY_APP', requirement: 'REQUIRED' },
      { id: 'db', role: 'PRIMARY_DATABASE', requirement: 'REQUIRED' },
    ], [
      { id: 'app-db', fromStepId: 'app', toStepId: 'db', mode: 'SYNC' },
      { id: 'db-app', fromStepId: 'db', toStepId: 'app', mode: 'SYNC' },
    ]);
    const deployment = new ModuleDeployment('community', [
      ['ENTRY_APP', 'app'],
      ['PRIMARY_DATABASE', 'db'],
    ]);

    expect(() => RouteResolver.resolve(cyclic, deployment, graph)).toThrowError(
      expect.objectContaining({ code: 'SYNCHRONOUS_ROUTE_CYCLE' }),
    );
  });
});

describe('service module assignments', () => {
  it('stores blueprints without owning deployed infrastructure', () => {
    const module = new ServiceModule('community', [requestBlueprint()]);

    expect(module.blueprints).toHaveLength(1);
    expect(Object.hasOwn(module, 'nodes')).toBe(false);
    expect(Object.hasOwn(module, 'infrastructure')).toBe(false);
  });

  it('rejects an assignment to a module without a deployment', () => {
    const assignment = new WorkloadAssignment('comment', 'search');

    expect(() => assignment.validate([
      new ModuleDeployment('community', []),
    ])).toThrowError(expect.objectContaining({ code: 'MISSING_ENTRY_MODULE' }));
  });
});

function topologyInput(overrides: Partial<ConstructorParameters<typeof ServiceTopology>[0]> = {}) {
  const graph = new TopologyGraph([
    node('app-community', 'SERVER_GROUP'),
    node('db-community', 'DATABASE'),
    node('shared-queue', 'QUEUE'),
  ], [
    { id: 'community-app-db', from: 'app-community', to: 'db-community', mode: 'SYNC' },
  ]);
  const modules = [new ServiceModule('community', [requestBlueprint('community')])];
  const deployments = [new ModuleDeployment('community', [
    ['ENTRY_APP', 'app-community'],
    ['PRIMARY_DATABASE', 'db-community'],
    ['EVENT_BUS', 'shared-queue'],
  ])];
  const assignments = [new WorkloadAssignment('comment', 'community')];
  return { graph, modules, deployments, assignments, ...overrides };
}

describe('ServiceTopology aggregate', () => {
  it('preserves immutable input order and provides exact lookups', () => {
    const input = topologyInput();
    const topology = new ServiceTopology(input);

    expect(topology.modules.map(({ id }) => id)).toEqual(['community']);
    expect(topology.deployments.map(({ moduleId }) => moduleId)).toEqual(['community']);
    expect(topology.assignments.map(({ workloadId }) => workloadId)).toEqual(['comment']);
    expect(topology.module('community')).toBe(input.modules[0]);
    expect(topology.deployment('community')).toBe(input.deployments[0]);
    expect(topology.assignment('comment')).toBe(input.assignments[0]);
    expect(Object.isFrozen(topology.modules)).toBe(true);
    expect(Object.isFrozen(topology.deployments)).toBe(true);
    expect(Object.isFrozen(topology.assignments)).toBe(true);
  });

  it.each([
    {
      name: 'duplicate module IDs',
      code: 'DUPLICATE_MODULE_ID',
      change: (base: ReturnType<typeof topologyInput>) => ({
        ...base,
        modules: [...base.modules, new ServiceModule('community', [])],
      }),
    },
    {
      name: 'duplicate deployments',
      code: 'DUPLICATE_MODULE_DEPLOYMENT',
      change: (base: ReturnType<typeof topologyInput>) => ({
        ...base,
        deployments: [...base.deployments, new ModuleDeployment('community', [])],
      }),
    },
    {
      name: 'duplicate assignments',
      code: 'DUPLICATE_WORKLOAD_ASSIGNMENT',
      change: (base: ReturnType<typeof topologyInput>) => ({
        ...base,
        assignments: [...base.assignments, new WorkloadAssignment('comment', 'community')],
      }),
    },
  ])('rejects $name', ({ code, change }) => {
    expect(() => new ServiceTopology(change(topologyInput()))).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('rejects duplicate workload blueprints inside one module', () => {
    expect(() => new ServiceModule('community', [
      requestBlueprint('community'),
      requestBlueprint('community'),
    ])).toThrowError(expect.objectContaining({ code: 'DUPLICATE_MODULE_WORKLOAD' }));
  });

  it.each([
    {
      name: 'a deployment for an unknown module',
      code: 'UNKNOWN_DEPLOYMENT_MODULE',
      change: { deployments: [new ModuleDeployment('search', [])] },
    },
    {
      name: 'an assignment without its module',
      code: 'MISSING_ENTRY_MODULE',
      change: { assignments: [new WorkloadAssignment('comment', 'search')] },
    },
    {
      name: 'an assignment without its module deployment',
      code: 'MISSING_ENTRY_MODULE',
      change: { deployments: [] },
    },
    {
      name: 'an assignment without a matching blueprint',
      code: 'MISSING_WORKLOAD_BLUEPRINT',
      change: { assignments: [new WorkloadAssignment('search', 'community')] },
    },
  ])('rejects $name', ({ code, change }) => {
    expect(() => new ServiceTopology(topologyInput(change))).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    {
      name: 'a binding to a missing node',
      code: 'MISSING_BOUND_NODE',
      deployment: new ModuleDeployment('community', [['ENTRY_APP', 'missing']]),
    },
    {
      name: 'an incompatible binding kind',
      code: 'INCOMPATIBLE_BINDING',
      deployment: new ModuleDeployment('community', [['ENTRY_APP', 'db-community']]),
    },
  ])('rejects $name during aggregate construction', ({ code, deployment }) => {
    expect(() => new ServiceTopology(topologyInput({ deployments: [deployment] }))).toThrowError(
      expect.objectContaining({ code }),
    );
  });
});
