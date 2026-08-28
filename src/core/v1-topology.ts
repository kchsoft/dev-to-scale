import type { FeatureDefinition, FrameworkId } from './feature';
import type { DatabaseId } from './database';
import type { InfrastructureState, QueueTechnologyId, TechnologyId } from './infrastructure';
import type { RequestNodeKind } from './request-route';
import {
  ModuleDeployment,
  ResourceRole,
  RouteBlueprint,
  RouteBlueprintEdge,
  ServiceModule,
  ServiceTopology,
  WorkloadAssignment,
} from './service-topology';
import {
  InfrastructureNode,
  InfrastructureNodeId,
  TopologyEdge,
  TopologyEdgeMode,
  TopologyGraph,
} from './topology';

export const V1_MODULE_ID = 'community';

export const V1_NODE_IDS = Object.freeze({
  gateway: 'v1:gateway:ALB',
  app: (frameworkId: FrameworkId): InfrastructureNodeId => `v1:app:${frameworkId}`,
  database: (databaseId: DatabaseId): InfrastructureNodeId => `v1:database:${databaseId}`,
  cache: 'v1:cache:REDIS',
  queue: (queueId: QueueTechnologyId): InfrastructureNodeId => `v1:queue:${queueId}`,
  storage: 'v1:storage:OBJECT_STORAGE',
  externalAi: 'external:ai',
});

export function v1NodeIdForTechnology(technologyId: TechnologyId): InfrastructureNodeId {
  switch (technologyId) {
    case 'ALB': return V1_NODE_IDS.gateway;
    case 'REDIS': return V1_NODE_IDS.cache;
    case 'SQS': return V1_NODE_IDS.queue('SQS');
    case 'RABBITMQ': return V1_NODE_IDS.queue('RABBITMQ');
    case 'KAFKA': return V1_NODE_IDS.queue('KAFKA');
    case 'OBJECT_STORAGE': return V1_NODE_IDS.storage;
  }
}

const ROLE_BY_LEGACY_NODE: Readonly<Record<RequestNodeKind, ResourceRole>> = {
  ALB: 'ENTRY_GATEWAY',
  APP: 'ENTRY_APP',
  DB: 'PRIMARY_DATABASE',
  CACHE: 'CACHE',
  QUEUE: 'EVENT_BUS',
  STORAGE: 'OBJECT_STORAGE',
  AI: 'EXTERNAL_SERVICE',
};

export class V1RouteBlueprintAdapter {
  static fromFeature(feature: FeatureDefinition, moduleId = 'community'): RouteBlueprint {
    const steps = feature.requestRoute.map((legacyStep, index) => ({
      id: `${feature.id}:step:${index}:${legacyStep.node.toLowerCase()}`,
      role: ROLE_BY_LEGACY_NODE[legacyStep.node],
      requirement: legacyStep.requirement ?? 'REQUIRED' as const,
    }));
    const edges: RouteBlueprintEdge[] = steps.slice(1).map((step, index) => ({
      id: `${feature.id}:edge:${index}`,
      fromStepId: steps[index].id,
      toStepId: step.id,
      mode: step.role === 'EVENT_BUS' ? 'ASYNC' : 'SYNC',
    }));
    return new RouteBlueprint(feature.id, moduleId, steps, edges);
  }
}

function infrastructureNodes(infrastructure: InfrastructureState): InfrastructureNode[] {
  const appId = V1_NODE_IDS.app(infrastructure.app.frameworkId);
  const databaseId = V1_NODE_IDS.database(infrastructure.database.databaseId);
  const nodes: InfrastructureNode[] = [
    {
      id: appId,
      kind: 'SERVER_GROUP',
      productId: infrastructure.app.frameworkId,
      capacity: infrastructure.nodeCapacity(appId),
      monthlyCost: infrastructure.nodeMonthlyCost(appId),
    },
    {
      id: databaseId,
      kind: 'DATABASE',
      productId: infrastructure.database.databaseId,
      capacity: infrastructure.nodeCapacity(databaseId),
      monthlyCost: infrastructure.nodeMonthlyCost(databaseId),
    },
    {
      id: V1_NODE_IDS.storage,
      kind: 'OBJECT_STORAGE',
      productId: infrastructure.hasTechnology('OBJECT_STORAGE') ? 'OBJECT_STORAGE' : 'LOCAL_STORAGE',
      capacity: infrastructure.nodeCapacity(V1_NODE_IDS.storage),
      monthlyCost: infrastructure.nodeMonthlyCost(V1_NODE_IDS.storage),
    },
    {
      id: V1_NODE_IDS.externalAi,
      kind: 'EXTERNAL_SERVICE',
      productId: 'EXTERNAL_AI',
      capacity: {},
      monthlyCost: 0,
    },
  ];

  if (infrastructure.hasTechnology('ALB')) {
    nodes.push({
      id: V1_NODE_IDS.gateway,
      kind: 'LOAD_BALANCER',
      productId: 'ALB',
      capacity: infrastructure.nodeCapacity(V1_NODE_IDS.gateway),
      monthlyCost: infrastructure.nodeMonthlyCost(V1_NODE_IDS.gateway),
    });
  }
  if (infrastructure.hasTechnology('REDIS')) {
    nodes.push({
      id: V1_NODE_IDS.cache,
      kind: 'CACHE',
      productId: 'REDIS',
      capacity: infrastructure.nodeCapacity(V1_NODE_IDS.cache),
      monthlyCost: infrastructure.nodeMonthlyCost(V1_NODE_IDS.cache),
    });
  }
  if (infrastructure.queueTechnology) {
    const queueId = V1_NODE_IDS.queue(infrastructure.queueTechnology);
    nodes.push({
      id: queueId,
      kind: 'QUEUE',
      productId: infrastructure.queueTechnology,
      capacity: infrastructure.nodeCapacity(queueId),
      monthlyCost: infrastructure.nodeMonthlyCost(queueId),
    });
  }
  return nodes;
}

function deploymentBindings(infrastructure: InfrastructureState): [ResourceRole, InfrastructureNodeId][] {
  const bindings: [ResourceRole, InfrastructureNodeId][] = [
    ['ENTRY_APP', V1_NODE_IDS.app(infrastructure.app.frameworkId)],
    ['PRIMARY_DATABASE', V1_NODE_IDS.database(infrastructure.database.databaseId)],
    ['OBJECT_STORAGE', V1_NODE_IDS.storage],
    ['EXTERNAL_SERVICE', V1_NODE_IDS.externalAi],
  ];
  if (infrastructure.hasTechnology('ALB')) bindings.push(['ENTRY_GATEWAY', V1_NODE_IDS.gateway]);
  if (infrastructure.hasTechnology('REDIS')) bindings.push(['CACHE', V1_NODE_IDS.cache]);
  if (infrastructure.queueTechnology) {
    bindings.push(['EVENT_BUS', V1_NODE_IDS.queue(infrastructure.queueTechnology)]);
  }
  return bindings;
}

function topologyEdges(
  blueprints: readonly RouteBlueprint[],
  deployment: ModuleDeployment,
  infrastructure: InfrastructureState,
): TopologyEdge[] {
  const edges: TopologyEdge[] = [];
  const connections = new Set<string>();

  function addEdge(from: InfrastructureNodeId, to: InfrastructureNodeId, mode: TopologyEdgeMode): void {
    const connection = `${from}|${to}|${mode}`;
    if (connections.has(connection)) return;
    connections.add(connection);
    edges.push({ id: `v1:edge:${from}:${to}:${mode}`, from, to, mode });
  }

  for (const blueprint of blueprints) {
    const stepById = new Map(blueprint.steps.map((step) => [step.id, step]));
    for (const blueprintEdge of blueprint.edges) {
      const fromRole = stepById.get(blueprintEdge.fromStepId)?.role;
      const toRole = stepById.get(blueprintEdge.toStepId)?.role;
      if (!fromRole || !toRole) continue;
      const from = deployment.bindingFor(fromRole);
      const to = deployment.bindingFor(toRole);
      if (from && to) addEdge(from, to, blueprintEdge.mode);
    }
  }

  const appId = V1_NODE_IDS.app(infrastructure.app.frameworkId);
  const databaseId = V1_NODE_IDS.database(infrastructure.database.databaseId);
  if (infrastructure.hasTechnology('ALB')) addEdge(V1_NODE_IDS.gateway, appId, 'SYNC');
  if (infrastructure.hasTechnology('REDIS')) {
    addEdge(appId, V1_NODE_IDS.cache, 'SYNC');
    addEdge(V1_NODE_IDS.cache, databaseId, 'SYNC');
  }
  return edges;
}

export class V1ServiceTopologyFactory {
  static create(
    infrastructure: InfrastructureState,
    features: readonly FeatureDefinition[],
  ): ServiceTopology {
    const blueprints = features.map((feature) => (
      V1RouteBlueprintAdapter.fromFeature(feature, V1_MODULE_ID)
    ));
    const module = new ServiceModule(V1_MODULE_ID, blueprints);
    const deployment = new ModuleDeployment(V1_MODULE_ID, deploymentBindings(infrastructure));
    const graph = new TopologyGraph(
      infrastructureNodes(infrastructure),
      topologyEdges(blueprints, deployment, infrastructure),
    );
    const assignments = features.map((feature) => (
      new WorkloadAssignment(feature.id, V1_MODULE_ID)
    ));
    return new ServiceTopology({
      graph,
      modules: [module],
      deployments: [deployment],
      assignments,
    });
  }
}
