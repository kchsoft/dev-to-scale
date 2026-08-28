import {
  ModuleDeployment,
  RouteBlueprint,
  ServiceModule,
  ServiceTopology,
  WorkloadAssignment,
} from '../../service-topology';
import type { InfrastructureNode } from '../../topology';
import { TopologyGraph } from '../../topology';

function node(id: string, kind: InfrastructureNode['kind']): InfrastructureNode {
  return { id, kind, productId: id, capacity: {}, monthlyCost: 0 };
}

function moduleBlueprint(workloadId: string, moduleId: string): RouteBlueprint {
  return new RouteBlueprint(workloadId, moduleId, [
    { id: `${moduleId}:app`, role: 'ENTRY_APP', requirement: 'REQUIRED' },
    { id: `${moduleId}:db`, role: 'PRIMARY_DATABASE', requirement: 'REQUIRED' },
    { id: `${moduleId}:queue`, role: 'EVENT_BUS', requirement: 'OPTIONAL' },
  ], [
    { id: `${moduleId}:app-db`, fromStepId: `${moduleId}:app`, toStepId: `${moduleId}:db`, mode: 'SYNC' },
    { id: `${moduleId}:db-queue`, fromStepId: `${moduleId}:db`, toStepId: `${moduleId}:queue`, mode: 'ASYNC' },
  ]);
}

export function multiModuleTopology(entryModuleId: 'community' | 'search'): ServiceTopology {
  const graph = new TopologyGraph([
    node('gateway-community', 'LOAD_BALANCER'),
    node('gateway-search', 'LOAD_BALANCER'),
    node('app-community', 'SERVER_GROUP'),
    node('db-community', 'DATABASE'),
    node('app-search', 'SERVER_GROUP'),
    node('db-search', 'DATABASE'),
    node('shared-queue', 'QUEUE'),
  ], [
    { id: 'ingress-community', from: 'gateway-community', to: 'app-community', mode: 'SYNC' },
    { id: 'ingress-search', from: 'gateway-search', to: 'app-search', mode: 'SYNC' },
    { id: 'community-app-db', from: 'app-community', to: 'db-community', mode: 'SYNC' },
    { id: 'community-db-queue', from: 'db-community', to: 'shared-queue', mode: 'ASYNC' },
    { id: 'search-app-db', from: 'app-search', to: 'db-search', mode: 'SYNC' },
    { id: 'search-db-queue', from: 'db-search', to: 'shared-queue', mode: 'ASYNC' },
  ]);
  return new ServiceTopology({
    graph,
    modules: [
      new ServiceModule('community', [moduleBlueprint('search', 'community')]),
      new ServiceModule('search', [moduleBlueprint('search', 'search')]),
    ],
    deployments: [
      new ModuleDeployment('community', [
        ['ENTRY_GATEWAY', 'gateway-community'],
        ['ENTRY_APP', 'app-community'],
        ['PRIMARY_DATABASE', 'db-community'],
        ['EVENT_BUS', 'shared-queue'],
      ]),
      new ModuleDeployment('search', [
        ['ENTRY_GATEWAY', 'gateway-search'],
        ['ENTRY_APP', 'app-search'],
        ['PRIMARY_DATABASE', 'db-search'],
        ['EVENT_BUS', 'shared-queue'],
      ]),
    ],
    assignments: [new WorkloadAssignment('search', entryModuleId)],
  });
}
