import { describe, expect, it } from 'vitest';
import {
  ModuleDeployment,
  RouteBlueprint,
  RouteResolver,
  ServiceModule,
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
