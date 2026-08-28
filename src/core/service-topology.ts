import {
  InfrastructureNodeId,
  InfrastructureNodeKind,
  TopologyEdgeMode,
  TopologyGraph,
  TopologyValidationError,
} from './topology';

export type ResourceRole =
  | 'ENTRY_GATEWAY'
  | 'ENTRY_APP'
  | 'PRIMARY_DATABASE'
  | 'CACHE'
  | 'EVENT_BUS'
  | 'OBJECT_STORAGE'
  | 'WORKER'
  | 'EXTERNAL_SERVICE';

export type RouteRequirement = 'REQUIRED' | 'OPTIONAL';

const COMPATIBLE_NODE_KIND: Readonly<Record<ResourceRole, InfrastructureNodeKind>> = {
  ENTRY_GATEWAY: 'LOAD_BALANCER',
  ENTRY_APP: 'SERVER_GROUP',
  PRIMARY_DATABASE: 'DATABASE',
  CACHE: 'CACHE',
  EVENT_BUS: 'QUEUE',
  OBJECT_STORAGE: 'OBJECT_STORAGE',
  WORKER: 'WORKER',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE',
};

export interface RouteBlueprintStep {
  readonly id: string;
  readonly role: ResourceRole;
  readonly requirement: RouteRequirement;
}

export interface RouteBlueprintEdge {
  readonly id: string;
  readonly fromStepId: string;
  readonly toStepId: string;
  readonly mode: TopologyEdgeMode;
}

export class RouteBlueprint {
  readonly steps: readonly RouteBlueprintStep[];
  readonly edges: readonly RouteBlueprintEdge[];

  constructor(
    readonly workloadId: string,
    readonly moduleId: string,
    steps: readonly RouteBlueprintStep[],
    edges: readonly RouteBlueprintEdge[],
  ) {
    const immutableSteps = steps.map((step) => Object.freeze({ ...step }));
    const stepIds = new Set<string>();
    for (const step of immutableSteps) {
      if (stepIds.has(step.id)) {
        throw new TopologyValidationError('DUPLICATE_BLUEPRINT_STEP_ID', `Blueprint step ID must be unique: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    const immutableEdges = edges.map((edge) => Object.freeze({ ...edge }));
    const edgeIds = new Set<string>();
    for (const edge of immutableEdges) {
      if (edgeIds.has(edge.id)) {
        throw new TopologyValidationError('DUPLICATE_BLUEPRINT_EDGE_ID', `Blueprint edge ID must be unique: ${edge.id}`);
      }
      edgeIds.add(edge.id);
      if (!stepIds.has(edge.fromStepId) || !stepIds.has(edge.toStepId)) {
        throw new TopologyValidationError(
          'MISSING_BLUEPRINT_EDGE_ENDPOINT',
          `Blueprint edge ${edge.id} references a missing step: ${edge.fromStepId} -> ${edge.toStepId}`,
        );
      }
    }

    this.steps = Object.freeze(immutableSteps);
    this.edges = Object.freeze(immutableEdges);
  }
}

export class ServiceModule {
  readonly blueprints: readonly RouteBlueprint[];

  constructor(readonly id: string, blueprints: readonly RouteBlueprint[]) {
    const workloadIds = new Set<string>();
    for (const blueprint of blueprints) {
      if (blueprint.moduleId !== id) {
        throw new Error(`Blueprint ${blueprint.workloadId} belongs to module ${blueprint.moduleId}, not ${id}`);
      }
      if (workloadIds.has(blueprint.workloadId)) {
        throw new TopologyValidationError(
          'DUPLICATE_MODULE_WORKLOAD',
          `Module ${id} defines workload more than once: ${blueprint.workloadId}`,
        );
      }
      workloadIds.add(blueprint.workloadId);
    }
    this.blueprints = Object.freeze([...blueprints]);
  }
}

export class ModuleDeployment {
  private readonly bindingsByRole: ReadonlyMap<ResourceRole, InfrastructureNodeId>;

  constructor(
    readonly moduleId: string,
    bindings: Iterable<readonly [ResourceRole, InfrastructureNodeId]>,
  ) {
    this.bindingsByRole = new Map(bindings);
  }

  bindingFor(role: ResourceRole): InfrastructureNodeId | undefined {
    return this.bindingsByRole.get(role);
  }

  get bindings(): ReadonlyMap<ResourceRole, InfrastructureNodeId> {
    return new Map(this.bindingsByRole);
  }
}

export class WorkloadAssignment {
  constructor(readonly workloadId: string, readonly entryModuleId: string) {}

  validate(deployments: readonly ModuleDeployment[]): void {
    if (!deployments.some(({ moduleId }) => moduleId === this.entryModuleId)) {
      throw new TopologyValidationError(
        'MISSING_ENTRY_MODULE',
        `Workload ${this.workloadId} has no deployment for entry module ${this.entryModuleId}`,
      );
    }
  }
}

export interface ServiceTopologyInput {
  readonly graph: TopologyGraph;
  readonly modules: readonly ServiceModule[];
  readonly deployments: readonly ModuleDeployment[];
  readonly assignments: readonly WorkloadAssignment[];
}

export class ServiceTopology {
  readonly graph: TopologyGraph;
  readonly modules: readonly ServiceModule[];
  readonly deployments: readonly ModuleDeployment[];
  readonly assignments: readonly WorkloadAssignment[];

  private readonly modulesById: ReadonlyMap<string, ServiceModule>;
  private readonly deploymentsByModuleId: ReadonlyMap<string, ModuleDeployment>;
  private readonly assignmentsByWorkloadId: ReadonlyMap<string, WorkloadAssignment>;

  constructor(input: ServiceTopologyInput) {
    this.graph = input.graph;
    this.modules = Object.freeze([...input.modules]);
    this.deployments = Object.freeze([...input.deployments]);
    this.assignments = Object.freeze([...input.assignments]);

    const modulesById = new Map<string, ServiceModule>();
    for (const module of this.modules) {
      if (modulesById.has(module.id)) {
        throw new TopologyValidationError('DUPLICATE_MODULE_ID', `Module ID must be unique: ${module.id}`);
      }
      modulesById.set(module.id, module);
    }

    const deploymentsByModuleId = new Map<string, ModuleDeployment>();
    for (const deployment of this.deployments) {
      if (deploymentsByModuleId.has(deployment.moduleId)) {
        throw new TopologyValidationError(
          'DUPLICATE_MODULE_DEPLOYMENT',
          `Module deployment must be unique: ${deployment.moduleId}`,
        );
      }
      if (!modulesById.has(deployment.moduleId)) {
        throw new TopologyValidationError(
          'UNKNOWN_DEPLOYMENT_MODULE',
          `Deployment references unknown module: ${deployment.moduleId}`,
        );
      }
      for (const [role, nodeId] of deployment.bindings) {
        const node = this.graph.node(nodeId);
        if (!node) {
          throw new TopologyValidationError(
            'MISSING_BOUND_NODE',
            `Module ${deployment.moduleId} binds ${role} to missing node ${nodeId}`,
          );
        }
        if (node.kind !== COMPATIBLE_NODE_KIND[role]) {
          throw new TopologyValidationError(
            'INCOMPATIBLE_BINDING',
            `Role ${role} requires ${COMPATIBLE_NODE_KIND[role]}, but ${nodeId} is ${node.kind}`,
          );
        }
      }
      deploymentsByModuleId.set(deployment.moduleId, deployment);
    }

    const assignmentsByWorkloadId = new Map<string, WorkloadAssignment>();
    for (const assignment of this.assignments) {
      if (assignmentsByWorkloadId.has(assignment.workloadId)) {
        throw new TopologyValidationError(
          'DUPLICATE_WORKLOAD_ASSIGNMENT',
          `Workload assignment must be unique: ${assignment.workloadId}`,
        );
      }
      const module = modulesById.get(assignment.entryModuleId);
      const deployment = deploymentsByModuleId.get(assignment.entryModuleId);
      if (!module || !deployment) {
        throw new TopologyValidationError(
          'MISSING_ENTRY_MODULE',
          `Workload ${assignment.workloadId} has no deployed entry module ${assignment.entryModuleId}`,
        );
      }
      if (!module.blueprints.some(({ workloadId }) => workloadId === assignment.workloadId)) {
        throw new TopologyValidationError(
          'MISSING_WORKLOAD_BLUEPRINT',
          `Module ${module.id} does not define workload ${assignment.workloadId}`,
        );
      }
      assignmentsByWorkloadId.set(assignment.workloadId, assignment);
    }

    this.modulesById = modulesById;
    this.deploymentsByModuleId = deploymentsByModuleId;
    this.assignmentsByWorkloadId = assignmentsByWorkloadId;
  }

  module(moduleId: string): ServiceModule | undefined {
    return this.modulesById.get(moduleId);
  }

  deployment(moduleId: string): ModuleDeployment | undefined {
    return this.deploymentsByModuleId.get(moduleId);
  }

  assignment(workloadId: string): WorkloadAssignment | undefined {
    return this.assignmentsByWorkloadId.get(workloadId);
  }
}

export interface ResolvedRouteStep {
  readonly stepId: string;
  readonly role: ResourceRole;
  readonly requirement: RouteRequirement;
  readonly nodeId: InfrastructureNodeId | null;
}

export interface ResolvedRouteEdge {
  readonly blueprintEdgeId: string;
  readonly topologyEdgeId: string;
  readonly fromNodeId: InfrastructureNodeId;
  readonly toNodeId: InfrastructureNodeId;
  readonly mode: TopologyEdgeMode;
}

export interface ResolvedRoute {
  readonly workloadId: string;
  readonly moduleId: string;
  readonly steps: readonly ResolvedRouteStep[];
  readonly edges: readonly ResolvedRouteEdge[];
}

function validateNoSynchronousCycle(blueprint: RouteBlueprint): void {
  const adjacency = new Map<string, string[]>();
  for (const step of blueprint.steps) adjacency.set(step.id, []);
  for (const edge of blueprint.edges) {
    if (edge.mode === 'SYNC') adjacency.get(edge.fromStepId)?.push(edge.toStepId);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(stepId: string): void {
    if (visiting.has(stepId)) {
      throw new TopologyValidationError(
        'SYNCHRONOUS_ROUTE_CYCLE',
        `Blueprint ${blueprint.workloadId} contains a synchronous cycle at ${stepId}`,
      );
    }
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    for (const target of adjacency.get(stepId) ?? []) visit(target);
    visiting.delete(stepId);
    visited.add(stepId);
  }

  for (const step of blueprint.steps) visit(step.id);
}

interface ActiveBlueprintConnection {
  readonly edgeIds: readonly string[];
  readonly fromStepId: string;
  readonly toStepId: string;
  readonly mode: TopologyEdgeMode;
}

function activeBlueprintConnections(
  blueprint: RouteBlueprint,
  resolvedByStepId: ReadonlyMap<string, ResolvedRouteStep>,
): ActiveBlueprintConnection[] {
  const outgoing = new Map<string, RouteBlueprintEdge[]>();
  for (const step of blueprint.steps) outgoing.set(step.id, []);
  for (const edge of blueprint.edges) outgoing.get(edge.fromStepId)?.push(edge);

  const connections: ActiveBlueprintConnection[] = [];
  for (const source of blueprint.steps) {
    if (!resolvedByStepId.get(source.id)?.nodeId) continue;

    function walk(
      currentStepId: string,
      edgeIds: readonly string[],
      mode: TopologyEdgeMode,
      visitedEdgeIds: ReadonlySet<string>,
    ): void {
      for (const edge of outgoing.get(currentStepId) ?? []) {
        if (visitedEdgeIds.has(edge.id)) continue;
        const nextEdgeIds = [...edgeIds, edge.id];
        const nextMode = mode === 'ASYNC' || edge.mode === 'ASYNC' ? 'ASYNC' : 'SYNC';
        const target = resolvedByStepId.get(edge.toStepId);
        if (target?.nodeId) {
          connections.push({
            edgeIds: nextEdgeIds,
            fromStepId: source.id,
            toStepId: edge.toStepId,
            mode: nextMode,
          });
          continue;
        }
        if (target?.requirement !== 'OPTIONAL') continue;
        walk(
          edge.toStepId,
          nextEdgeIds,
          nextMode,
          new Set([...visitedEdgeIds, edge.id]),
        );
      }
    }

    walk(source.id, [], 'SYNC', new Set());
  }
  return connections;
}

export class RouteResolver {
  private static resolveRoute(
    blueprint: RouteBlueprint,
    deployment: ModuleDeployment,
    graph: TopologyGraph,
    preserveMissingRequired: boolean,
  ): ResolvedRoute {
    if (deployment.moduleId !== blueprint.moduleId) {
      throw new TopologyValidationError(
        'MISSING_ENTRY_MODULE',
        `Blueprint ${blueprint.workloadId} requires module ${blueprint.moduleId}, not ${deployment.moduleId}`,
      );
    }
    validateNoSynchronousCycle(blueprint);

    const resolvedSteps = blueprint.steps.map((step): ResolvedRouteStep => {
      const nodeId = deployment.bindingFor(step.role);
      if (nodeId === undefined) {
        if (step.requirement === 'REQUIRED' && !preserveMissingRequired) {
          throw new TopologyValidationError(
            'MISSING_REQUIRED_BINDING',
            `Module ${deployment.moduleId} has no ${step.role} binding required by ${blueprint.workloadId}`,
          );
        }
        return Object.freeze({ stepId: step.id, role: step.role, requirement: step.requirement, nodeId: null });
      }

      const node = graph.node(nodeId);
      if (!node) {
        throw new TopologyValidationError(
          'MISSING_BOUND_NODE',
          `Module ${deployment.moduleId} binds ${step.role} to missing node ${nodeId}`,
        );
      }
      if (node.kind !== COMPATIBLE_NODE_KIND[step.role]) {
        throw new TopologyValidationError(
          'INCOMPATIBLE_BINDING',
          `Role ${step.role} requires ${COMPATIBLE_NODE_KIND[step.role]}, but ${nodeId} is ${node.kind}`,
        );
      }
      return Object.freeze({ stepId: step.id, role: step.role, requirement: step.requirement, nodeId });
    });

    const resolvedByStepId = new Map(resolvedSteps.map((step) => [step.stepId, step]));
    const resolvedEdges: ResolvedRouteEdge[] = [];
    for (const connection of activeBlueprintConnections(blueprint, resolvedByStepId)) {
      const fromNodeId = resolvedByStepId.get(connection.fromStepId)?.nodeId;
      const toNodeId = resolvedByStepId.get(connection.toStepId)?.nodeId;
      if (!fromNodeId || !toNodeId) continue;

      const topologyEdge = graph.edge(fromNodeId, toNodeId, connection.mode);
      if (!topologyEdge) {
        throw new TopologyValidationError(
          'DISCONNECTED_ROUTE',
          `Blueprint edge ${connection.edgeIds.join('+')} is not connected in topology: ${fromNodeId} -> ${toNodeId}`,
        );
      }
      resolvedEdges.push(Object.freeze({
        blueprintEdgeId: connection.edgeIds.join('+'),
        topologyEdgeId: topologyEdge.id,
        fromNodeId,
        toNodeId,
        mode: topologyEdge.mode,
      }));
    }

    return Object.freeze({
      workloadId: blueprint.workloadId,
      moduleId: blueprint.moduleId,
      steps: Object.freeze(resolvedSteps),
      edges: Object.freeze(resolvedEdges),
    });
  }

  static resolve(blueprint: RouteBlueprint, deployment: ModuleDeployment, graph: TopologyGraph): ResolvedRoute {
    return this.resolveRoute(blueprint, deployment, graph, false);
  }

  static resolveForTrace(
    blueprint: RouteBlueprint,
    deployment: ModuleDeployment,
    graph: TopologyGraph,
  ): ResolvedRoute {
    return this.resolveRoute(blueprint, deployment, graph, true);
  }
}
