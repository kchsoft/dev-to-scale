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
    for (const blueprint of blueprints) {
      if (blueprint.moduleId !== id) {
        throw new Error(`Blueprint ${blueprint.workloadId} belongs to module ${blueprint.moduleId}, not ${id}`);
      }
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

export class RouteResolver {
  static resolve(blueprint: RouteBlueprint, deployment: ModuleDeployment, graph: TopologyGraph): ResolvedRoute {
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
        if (step.requirement === 'REQUIRED') {
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
    for (const blueprintEdge of blueprint.edges) {
      const fromNodeId = resolvedByStepId.get(blueprintEdge.fromStepId)?.nodeId;
      const toNodeId = resolvedByStepId.get(blueprintEdge.toStepId)?.nodeId;
      if (!fromNodeId || !toNodeId) continue;

      const topologyEdge = graph.edge(fromNodeId, toNodeId, blueprintEdge.mode);
      if (!topologyEdge) {
        throw new TopologyValidationError(
          'DISCONNECTED_ROUTE',
          `Blueprint edge ${blueprintEdge.id} is not connected in topology: ${fromNodeId} -> ${toNodeId}`,
        );
      }
      resolvedEdges.push(Object.freeze({
        blueprintEdgeId: blueprintEdge.id,
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
}
