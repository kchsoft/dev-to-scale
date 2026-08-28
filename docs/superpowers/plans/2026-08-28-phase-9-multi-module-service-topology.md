# Phase 9 Multi-module ServiceTopology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the singleton topology aggregate with a validated, assignment-aware `ServiceTopology` that supports multiple modules and deployments while keeping player commands and UI out of scope.

**Architecture:** `ServiceTopology` owns immutable ordered collections of modules, deployments, and assignments beside the independent `TopologyGraph`. It validates aggregate references at construction and resolves each workload through its assigned module and deployment. `V1ServiceTopologyFactory` creates the current community-only catalog as one instance of the generic aggregate; Core and Application migrate directly and `SingleServiceTopology` is deleted.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Next.js 16, React 19

**Spec:** `docs/superpowers/specs/2026-08-28-phase-9-multi-module-service-topology-design.md`

## Global Constraints

- Prefix every shell command with `rtk` as required by `/Users/changhyeonkim/.codex/RTK.md`.
- Use strict TDD for new behavior: observe the specified RED before implementation, then run the specified GREEN verification. For behavior-preserving consumer migrations, run the named characterization suite before and after the mechanical change.
- Delete `SingleServiceTopology`; do not add an alias, subclass, adapter facade, or deprecated compatibility export.
- `ServiceTopology` may own many modules, deployments, and assignments; at most one active deployment per module and one assignment per active workload are Phase 9 invariants. Every assignment must reference a module that has a deployment.
- Modules never own infrastructure objects. Deployments bind logical roles to independent topology node IDs.
- Assignment selects only an entry module. Blueprint routes, deployment bindings, nodes, and edges remain game-owned and non-editable by the player.
- Do not add a module-selection command, module-selection UI, a second production module catalog, or route/binding editing.
- Do not change load formulas, node resource axes, request-health semantics, incidents, growth, economy, observability, visible copy, topology animation, or React/Core boundaries.
- `resolveForTrace` may preserve an unbound required step as `nodeId: null`; present bindings, incompatible kinds, and disconnected concrete edges still fail fast.
- Gateway ingress must come from the selected module deployment. Never select the first deployment or a global gateway.
- Preserve caller input order and freeze exposed aggregate collections.
- Keep the user's existing main-checkout changes to `next-env.d.ts`, `next.config.ts`, `tsconfig.json`, and `package-lock.json` untouched. Execute implementation in an isolated worktree.
- Every task ends with an independent review gate. Critical and Important findings must be fixed before the next task.

---

### Task 1: Validated immutable ServiceTopology aggregate

**Files:**
- Modify: `src/core/topology.ts`
- Modify: `src/core/service-topology.ts`
- Modify: `src/core/__tests__/service-topology.spec.ts`

**Interfaces:**
- Consumes: `TopologyGraph`, `TopologyValidationError`, `ServiceModule`, `ModuleDeployment`, `WorkloadAssignment`, and `COMPATIBLE_NODE_KIND` semantics already present in Core.
- Produces: `ServiceTopology`, its immutable collections, `module(moduleId)`, `deployment(moduleId)`, `assignment(workloadId)`, and seven new stable validation codes. Task 2 adds resolution methods to this aggregate.

- [ ] **Step 1: Add failing aggregate immutability and validation tests**

Append helpers and a new `describe('ServiceTopology aggregate', ...)` block to `service-topology.spec.ts`:

```ts
import {
  ModuleDeployment,
  RouteBlueprint,
  RouteResolver,
  ServiceModule,
  ServiceTopology,
  WorkloadAssignment,
} from '../service-topology';

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
```

- [ ] **Step 2: Run the aggregate tests and verify RED**

Run:

```bash
rtk npm test -- src/core/__tests__/service-topology.spec.ts
```

Expected: FAIL because `ServiceTopology` and the new validation error codes do not exist and `ServiceModule` accepts duplicate workload Blueprints.

- [ ] **Step 3: Extend topology validation codes**

Add these members to `TopologyValidationErrorCode` in `topology.ts`:

```ts
  | 'DUPLICATE_MODULE_ID'
  | 'DUPLICATE_MODULE_DEPLOYMENT'
  | 'DUPLICATE_WORKLOAD_ASSIGNMENT'
  | 'DUPLICATE_MODULE_WORKLOAD'
  | 'UNKNOWN_DEPLOYMENT_MODULE'
  | 'MISSING_WORKLOAD_BLUEPRINT'
  | 'UNKNOWN_WORKLOAD_ASSIGNMENT'
```

Keep the existing `MISSING_ENTRY_MODULE`, `MISSING_BOUND_NODE`, and `INCOMPATIBLE_BINDING` members.

- [ ] **Step 4: Reject duplicate workloads inside ServiceModule**

In the `ServiceModule` constructor, validate before freezing the copied Blueprint array:

```ts
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
```

- [ ] **Step 5: Implement ServiceTopology collections, lookups, and construction validation**

Add the aggregate after `WorkloadAssignment`. Reuse `COMPATIBLE_NODE_KIND` by moving that constant above the aggregate without changing its values.

```ts
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
```

Do not add `resolve` stubs that return placeholders. Task 2 owns resolution.

- [ ] **Step 6: Run focused aggregate and topology tests**

Run:

```bash
rtk npm test -- src/core/__tests__/service-topology.spec.ts src/core/__tests__/topology.spec.ts
rtk npm run typecheck
```

Expected: all tests and typecheck PASS.

- [ ] **Step 7: Commit the aggregate contract**

```bash
rtk git add src/core/topology.ts src/core/service-topology.ts src/core/__tests__/service-topology.spec.ts
rtk git commit -m "feat: add validated service topology aggregate"
```

- [ ] **Step 8: Review the aggregate task before proceeding**

Request an independent review of the Task 1 commit against Sections 5 and 6 of the design. The reviewer must check collection immutability, exact lookup semantics, duplicate detection, assignment cross-references, and construction-time binding validation. Fix every Critical or Important finding, rerun Step 6, and re-review the fix before Task 2.

---

### Task 2: Assignment-aware route and gateway resolution

**Files:**
- Modify: `src/core/service-topology.ts`
- Modify: `src/core/__tests__/service-topology.spec.ts`
- Modify: `src/core/__tests__/request-trace.spec.ts`
- Create: `src/core/__tests__/fixtures/multi-module-topology.ts`

**Interfaces:**
- Consumes: Task 1's `ServiceTopology`, immutable lookup methods, existing `RouteResolver`, and `TopologyGraph.edge`.
- Produces: `ServiceTopology.resolve(workloadId): ResolvedRoute` and `ServiceTopology.resolveForTrace(workloadId): ResolvedRoute`, selected-module route resolution, and deterministic module-qualified ingress identifiers.

- [ ] **Step 1: Add a shared multi-module fixture and failing assignment tests**

Create `src/core/__tests__/fixtures/multi-module-topology.ts`:

```ts
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
```

Import the shared fixture into `service-topology.spec.ts`, then add:

```ts
import { multiModuleTopology } from './fixtures/multi-module-topology';

it('resolves the same workload through its assigned module and shared queue', () => {
  const community = multiModuleTopology('community').resolve('search');
  const search = multiModuleTopology('search').resolve('search');

  expect(community.moduleId).toBe('community');
  expect(community.steps.map(({ nodeId }) => nodeId)).toEqual([
    'app-community', 'db-community', 'shared-queue',
  ]);
  expect(search.moduleId).toBe('search');
  expect(search.steps.map(({ nodeId }) => nodeId)).toEqual([
    'app-search', 'db-search', 'shared-queue',
  ]);
});

it('composes ingress from only the selected deployment', () => {
  const route = multiModuleTopology('search').resolveForTrace('search');

  expect(route.steps[0]).toEqual({
    stepId: 'ingress:search:search:gateway',
    role: 'ENTRY_GATEWAY',
    requirement: 'REQUIRED',
    nodeId: 'gateway-search',
  });
  expect(route.edges[0]).toEqual({
    blueprintEdgeId: 'ingress:search:search',
    topologyEdgeId: 'ingress-search',
    fromNodeId: 'gateway-search',
    toNodeId: 'app-search',
    mode: 'SYNC',
  });
  expect(route.steps.some(({ nodeId }) => nodeId === 'gateway-community')).toBe(false);
});

it('rejects an unassigned workload without falling back to the first module', () => {
  expect(() => multiModuleTopology('community').resolve('comment')).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_WORKLOAD_ASSIGNMENT' }),
  );
});
```

Import the same fixture into `request-trace.spec.ts` and add a case that simulates both resolved routes with a failed community App:

```ts
import { multiModuleTopology } from './fixtures/multi-module-topology';

it('isolates exact-node health across module-selected routes', () => {
  const communityRoute = multiModuleTopology('community').resolveForTrace('search');
  const searchRoute = multiModuleTopology('search').resolveForTrace('search');

  expect(RequestTraceSimulator.simulate(communityRoute, { 'app-community': 0 }).successRatio).toBe(0);
  expect(RequestTraceSimulator.simulate(searchRoute, { 'app-community': 0 }).successRatio).toBe(1);
});
```

- [ ] **Step 2: Run assignment and trace tests and verify RED**

Run:

```bash
rtk npm test -- src/core/__tests__/service-topology.spec.ts src/core/__tests__/request-trace.spec.ts
```

Expected: FAIL because `ServiceTopology.resolve` and `resolveForTrace` do not exist.

- [ ] **Step 3: Implement exact assignment selection**

Add this private selection method and public strict resolver to `ServiceTopology`:

```ts
private resolutionTarget(workloadId: string): {
  readonly assignment: WorkloadAssignment;
  readonly module: ServiceModule;
  readonly deployment: ModuleDeployment;
  readonly blueprint: RouteBlueprint;
} {
  const assignment = this.assignment(workloadId);
  if (!assignment) {
    throw new TopologyValidationError(
      'UNKNOWN_WORKLOAD_ASSIGNMENT',
      `Workload has no entry-module assignment: ${workloadId}`,
    );
  }
  const module = this.module(assignment.entryModuleId)!;
  const deployment = this.deployment(assignment.entryModuleId)!;
  const blueprint = module.blueprints.find((candidate) => candidate.workloadId === workloadId)!;
  return { assignment, module, deployment, blueprint };
}

resolve(workloadId: string): ResolvedRoute {
  const { blueprint, deployment } = this.resolutionTarget(workloadId);
  return RouteResolver.resolve(blueprint, deployment, this.graph);
}
```

The non-null assertions are justified only by Task 1 constructor validation. Do not add a first-module or first-deployment fallback.

- [ ] **Step 4: Implement trace resolution and selected-deployment ingress**

Add:

```ts
resolveForTrace(workloadId: string): ResolvedRoute {
  const { module, blueprint, deployment } = this.resolutionTarget(workloadId);
  const internalRoute = RouteResolver.resolveForTrace(blueprint, deployment, this.graph);
  const gatewayNodeId = deployment.bindingFor('ENTRY_GATEWAY');
  if (!gatewayNodeId || internalRoute.steps[0]?.role === 'ENTRY_GATEWAY') return internalRoute;

  const firstNodeId = internalRoute.steps.find((step) => step.nodeId !== null)?.nodeId;
  if (!firstNodeId) return internalRoute;
  const ingressEdge = this.graph.edge(gatewayNodeId, firstNodeId, 'SYNC');
  if (!ingressEdge) {
    throw new TopologyValidationError(
      'DISCONNECTED_ROUTE',
      `Gateway is disconnected from module entry: ${gatewayNodeId} -> ${firstNodeId}`,
    );
  }

  return Object.freeze({
    workloadId: internalRoute.workloadId,
    moduleId: internalRoute.moduleId,
    steps: Object.freeze([
      Object.freeze({
        stepId: `ingress:${module.id}:${workloadId}:gateway`,
        role: 'ENTRY_GATEWAY' as const,
        requirement: 'REQUIRED' as const,
        nodeId: gatewayNodeId,
      }),
      ...internalRoute.steps,
    ]),
    edges: Object.freeze([
      Object.freeze({
        blueprintEdgeId: `ingress:${module.id}:${workloadId}`,
        topologyEdgeId: ingressEdge.id,
        fromNodeId: gatewayNodeId,
        toNodeId: firstNodeId,
        mode: ingressEdge.mode,
      }),
      ...internalRoute.edges,
    ]),
  });
}
```

Keep `RouteResolver.resolveForTrace` required/optional behavior unchanged.

- [ ] **Step 5: Run multi-module route, trace, and validation regressions**

Run:

```bash
rtk npm test -- src/core/__tests__/service-topology.spec.ts src/core/__tests__/request-trace.spec.ts src/core/__tests__/topology.spec.ts
rtk npm run typecheck
```

Expected: all tests and typecheck PASS.

- [ ] **Step 6: Commit assignment-aware resolution**

```bash
rtk git add src/core/service-topology.ts src/core/__tests__/service-topology.spec.ts src/core/__tests__/request-trace.spec.ts src/core/__tests__/fixtures/multi-module-topology.ts
rtk git commit -m "feat: resolve workloads through assigned modules"
```

- [ ] **Step 7: Review route selection before proceeding**

Request an independent review of the Task 2 commit. The reviewer must check that assignment—not collection order—selects the module and deployment, shared Queue nodes remain independent, gateway ingress uses only the selected deployment, deterministic ingress IDs match the design, and no fallback path exists. Fix every Critical or Important finding, rerun Step 5, and re-review the fix before Task 3.

---

### Task 3: V1 factory backed by the generic aggregate

**Files:**
- Modify: `src/core/v1-topology.ts`
- Modify: `src/core/__tests__/v1-topology.spec.ts`

**Interfaces:**
- Consumes: Task 2's complete `ServiceTopology` and the existing V1 node/edge/Blueprint helpers.
- Produces: `V1_MODULE_ID = 'community'` and `V1ServiceTopologyFactory.create(infrastructure, features): ServiceTopology`. `SingleServiceTopology` remains temporarily only so Task 4 and Task 5 can migrate consumers without a broken intermediate commit.

- [ ] **Step 1: Add failing V1 generic-factory tests**

Change imports in `v1-topology.spec.ts` to include the new names, while leaving legacy tests intact during this task:

```ts
import {
  SingleServiceTopology,
  V1_MODULE_ID,
  V1_NODE_IDS,
  V1RouteBlueprintAdapter,
  V1ServiceTopologyFactory,
} from '../v1-topology';
```

Add:

```ts
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
```

In the existing Queue replacement case, replace the legacy constructors with the factory and retain these exact assertions:

```ts
const before = V1ServiceTopologyFactory.create(infrastructure, [feature]);
const retired = infrastructure.deployTechnology('KAFKA');
const after = V1ServiceTopologyFactory.create(infrastructure, [feature]);

expect(retired).toEqual(['SQS']);
expect(before.module(V1_MODULE_ID)?.blueprints).toEqual(
  after.module(V1_MODULE_ID)?.blueprints,
);
expect(before.deployment(V1_MODULE_ID)?.bindingFor('EVENT_BUS')).toBe(V1_NODE_IDS.queue('SQS'));
expect(after.deployment(V1_MODULE_ID)?.bindingFor('EVENT_BUS')).toBe(V1_NODE_IDS.queue('KAFKA'));
expect(after.graph.node(V1_NODE_IDS.queue('SQS'))).toBeUndefined();
expect(after.graph.node(V1_NODE_IDS.queue('KAFKA'))).toEqual(expect.objectContaining({
  productId: 'KAFKA',
  capacity: { throughput: 1_000 },
  monthlyCost: 350_000,
}));
```

In the ALB trace case, replace the legacy constructors with the factory and retain Blueprint parity plus exact ingress order:

```ts
const before = V1ServiceTopologyFactory.create(infrastructure, [feature]);
infrastructure.deployTechnology('ALB');
const after = V1ServiceTopologyFactory.create(infrastructure, [feature]);
const trace = RequestTraceSimulator.simulate(after.resolveForTrace(feature.id));

expect(before.module(V1_MODULE_ID)?.blueprints).toEqual(
  after.module(V1_MODULE_ID)?.blueprints,
);
expect(trace.nodes.map(({ nodeId }) => nodeId)).toEqual([
  V1_NODE_IDS.gateway,
  V1_NODE_IDS.app('SPRING_BOOT'),
  V1_NODE_IDS.database('POSTGRESQL'),
]);
expect(trace.edges[0]?.edgeId).toContain(
  `${V1_NODE_IDS.gateway}:${V1_NODE_IDS.app('SPRING_BOOT')}`,
);
```

- [ ] **Step 2: Run V1 tests and verify RED**

Run:

```bash
rtk npm test -- src/core/__tests__/v1-topology.spec.ts
```

Expected: FAIL because `V1_MODULE_ID` and `V1ServiceTopologyFactory` do not exist.

- [ ] **Step 3: Add the V1 module constant and factory**

Import `ServiceTopology` from `service-topology.ts`, then add:

```ts
export const V1_MODULE_ID = 'community';

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
```

Do not make the new factory delegate to `SingleServiceTopology` and do not make the legacy class wrap `ServiceTopology`. The temporary class remains unchanged until all consumers move.

- [ ] **Step 4: Run V1, generic topology, and trace regressions**

Run:

```bash
rtk npm test -- src/core/__tests__/v1-topology.spec.ts src/core/__tests__/service-topology.spec.ts src/core/__tests__/request-trace.spec.ts
rtk npm run typecheck
```

Expected: all tests and typecheck PASS with both construction paths temporarily present.

- [ ] **Step 5: Commit the V1 factory**

```bash
rtk git add src/core/v1-topology.ts src/core/__tests__/v1-topology.spec.ts
rtk git commit -m "refactor: build v1 through generic service topology"
```

- [ ] **Step 6: Review V1 construction before proceeding**

Request an independent review of the Task 3 commit. The reviewer must check that the factory constructs `ServiceTopology` directly, reproduces the V1 node/binding/edge catalog, preserves Queue replacement and ALB ingress behavior, and does not create a second topology contract. Fix every Critical or Important finding, rerun Step 4, and re-review the fix before Task 4.

---

### Task 4: Migrate Core simulation and incident consumers

**Files:**
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/node-load.spec.ts`
- Modify: `src/core/__tests__/incident-topology.spec.ts`
- Verify: `src/core/__tests__/infrastructure-load.spec.ts`
- Verify: `src/core/__tests__/game-engine.spec.ts`

**Interfaces:**
- Consumes: Task 3's `V1ServiceTopologyFactory.create` returning a generic `ServiceTopology`.
- Produces: all Core production topology construction through the generic aggregate, with existing node-load, request-trace, incident, growth, technology-preview, and queue-replacement results unchanged.

- [ ] **Step 1: Add Core factory-use and parity assertions**

In `node-load.spec.ts`, add a concrete calculation scenario that constructs the same topology through `V1ServiceTopologyFactory`, then asserts calculator traces use the exact routes resolved by that topology:

Add `COMMUNITY_FEATURES` and `V1ServiceTopologyFactory` to that test's imports.

```ts
const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
const features = [COMMUNITY_FEATURES.COMMENT];
const topology = V1ServiceTopologyFactory.create(infrastructure, features);
const load = LoadCalculator.calculate(100_000, features, infrastructure);

expect(load.requestTraces.map(({ workloadId }) => workloadId)).toEqual(
  features.map(({ id }) => id),
);
expect(load.requestTraces[0].nodes.map(({ nodeId }) => nodeId)).toEqual(
  topology.resolveForTrace(features[0].id).steps.map(({ nodeId }) => nodeId),
);
```

In `incident-topology.spec.ts`, switch the fixture import and add an exact graph assertion:

```ts
const topology = V1ServiceTopologyFactory.create(infrastructure, features);
expect(topology.graph.node(V1_NODE_IDS.app('SPRING_BOOT'))?.kind).toBe('SERVER_GROUP');
```

Keep all existing seeded growth, scale, technology preview, queue replacement, and incident assertions unchanged.

- [ ] **Step 2: Run focused Core tests before migration**

Run:

```bash
rtk npm test -- src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/game-engine.spec.ts src/core/__tests__/incident-topology.spec.ts
```

Expected: PASS before production migration; this is an intentional characterization gate for a behavior-preserving consumer refactor, and the assertions establish the parity baseline against the generic factory.

- [ ] **Step 3: Replace LoadCalculator topology construction**

In `infrastructure.ts`, replace the import and construction only:

```ts
import { V1ServiceTopologyFactory, V1_NODE_IDS } from './v1-topology';

const topology = V1ServiceTopologyFactory.create(infrastructure, features);
```

Keep every demand, capacity, proficiency, technology, cache, Queue fallback, failure weighting, and node-load formula unchanged.

- [ ] **Step 4: Replace GameEngine incident topology construction**

In `game-engine.ts`, replace `SingleServiceTopology` with `V1ServiceTopologyFactory` and construct:

```ts
topology: V1ServiceTopologyFactory.create(
  this.infrastructure,
  this.activeFeaturesForLoad(),
).graph,
```

Do not change the incident candidate policy or load refresh timing.

- [ ] **Step 5: Migrate Core test fixtures to the generic factory**

Replace every `SingleServiceTopology.from(...)` in the modified Task 4 Core tests with:

```ts
V1ServiceTopologyFactory.create(infrastructure, features)
```

Replace singular property reads with exact lookups:

```ts
topology.module(V1_MODULE_ID)
topology.deployment(V1_MODULE_ID)
```

Do not weaken literal node, edge, trace, ratio, seeded-growth, incident, or queue-retirement expectations.

- [ ] **Step 6: Run Core calculation, engine, and incident regressions**

Run:

```bash
rtk npm test -- src/core/__tests__/service-topology.spec.ts src/core/__tests__/v1-topology.spec.ts src/core/__tests__/request-trace.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/game-engine.spec.ts src/core/__tests__/incident-topology.spec.ts
rtk npm run typecheck
```

Expected: all tests and typecheck PASS. Application may still use the temporary legacy class until Task 5.

- [ ] **Step 7: Commit Core consumer migration**

```bash
rtk git add src/core/infrastructure.ts src/core/game-engine.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/incident-topology.spec.ts
rtk git commit -m "refactor: consume generic topology in core simulation"
```

- [ ] **Step 8: Review Core migration before proceeding**

Request an independent review of the Task 4 commit. The reviewer must compare the before/after consumer calls and verify that only topology construction changed: load formulas, trace inputs, incident candidate policy, active-feature selection, and refresh timing must remain identical. Fix every Critical or Important finding, rerun Step 6, and re-review the fix before Task 5.

---

### Task 5: Migrate Application and delete the singleton topology

**Files:**
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/__tests__/game-service-projector.spec.ts`
- Modify: `src/core/v1-topology.ts`
- Modify: `src/core/__tests__/v1-topology.spec.ts`

**Interfaces:**
- Consumes: `ServiceTopology`, `V1_MODULE_ID`, and `V1ServiceTopologyFactory` from Tasks 1–3.
- Produces: Application projection through explicit V1 deployment lookup, no production `SingleServiceTopology` symbol, and the final Phase 9 direct-replacement contract.

- [ ] **Step 1: Add an Application deployment-selection regression**

In `game-service-projector.spec.ts`, keep the existing exact-node decoy test and add this real-engine behavior assertion for explicit V1 deployment projection:

```ts
it('projects operational bindings from the explicit v1 module deployment', () => {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
  const result = new GameServiceProjector(engine).project(engine.snapshot, {
    monthlyRevenue: 0,
    monthlyCost: 0,
    monthlyProfit: 0,
  });

  expect(result.service.visibleLoads.map(({ nodeId }) => nodeId)).toEqual([
    V1_NODE_IDS.app('SPRING_BOOT'),
    V1_NODE_IDS.database('POSTGRESQL'),
    null,
    V1_NODE_IDS.storage,
  ]);
});
```

In `v1-topology.spec.ts`, migrate all remaining legacy construction and singular reads to `V1ServiceTopologyFactory`, `module(V1_MODULE_ID)`, and `deployment(V1_MODULE_ID)`. Add the final absence assertion in a production-symbol search step rather than embedding the deleted symbol in production.

- [ ] **Step 2: Run Application and V1 tests before deletion**

Run:

```bash
rtk npm test -- src/application/__tests__/game-service-projector.spec.ts src/core/__tests__/v1-topology.spec.ts src/application/__tests__/view-boundary.spec.ts
```

Expected: PASS before migration; this is the Application characterization gate, establishing visible output and boundary parity before the type/API replacement.

- [ ] **Step 3: Migrate GameServiceProjector to generic topology lookup**

In the existing `../core` import, remove `SingleServiceTopology` and add these three symbols while preserving all other imports:

```ts
ServiceTopology,
V1_MODULE_ID,
V1ServiceTopologyFactory,
```

Replace the helper signatures and singular deployment property with explicit lookup:

```ts
function requiredV1Deployment(topology: ServiceTopology) {
  const deployment = topology.deployment(V1_MODULE_ID);
  if (!deployment) throw new Error(`Missing required module deployment: ${V1_MODULE_ID}`);
  return deployment;
}

function requiredTopologyBinding(
  topology: ServiceTopology,
  role: 'ENTRY_APP' | 'PRIMARY_DATABASE' | 'OBJECT_STORAGE',
): string {
  const nodeId = requiredV1Deployment(topology).bindingFor(role);
  if (!nodeId) throw new Error(`Missing required topology binding: ${role}`);
  return nodeId;
}

function operationalNodeSelection(topology: ServiceTopology): OperationalNodeSelection {
  const deployment = requiredV1Deployment(topology);
  return {
    appNodeId: requiredTopologyBinding(topology, 'ENTRY_APP'),
    databaseNodeId: requiredTopologyBinding(topology, 'PRIMARY_DATABASE'),
    queueNodeId: deployment.bindingFor('EVENT_BUS') ?? null,
    storageNodeId: requiredTopologyBinding(topology, 'OBJECT_STORAGE'),
  };
}
```

Change `serviceTopology` and `topology` method types to `ServiceTopology`, and construct with:

```ts
return V1ServiceTopologyFactory.create(this.#engine.infrastructure, activeFeatureDefinitions);
```

Do not change projected DTOs, visible metric order, alert ordering, or exact node IDs.

- [ ] **Step 4: Delete SingleServiceTopology and finish V1 tests**

Delete the entire `SingleServiceTopology` class from `v1-topology.ts`. Remove the now-unused `RouteResolver` and `ResolvedRoute` imports. Ensure `V1ServiceTopologyFactory` is the only V1 topology constructor.

Update `v1-topology.spec.ts`:

```ts
const topology = V1ServiceTopologyFactory.create(infrastructure, features);
const module = topology.module(V1_MODULE_ID)!;
const deployment = topology.deployment(V1_MODULE_ID)!;
```

Retain literal node order, bindings, costs, Queue replacement, resolved route, ALB ingress, and required-missing trace assertions.

- [ ] **Step 5: Prove the singleton production contract is absent**

Run:

```bash
rtk rg -n "SingleServiceTopology|\.module\b|\.deployment\b" src --glob '!**/__tests__/**'
```

Expected:

- no `SingleServiceTopology` matches;
- no singular topology `.module` or `.deployment` property reads;
- method calls such as `topology.module(V1_MODULE_ID)` and `topology.deployment(V1_MODULE_ID)` may match the broad property pattern and are valid. Inspect every result rather than requiring exit 1 for the broad method search.

Also run the exact legacy-symbol search:

```bash
rtk rg -n "SingleServiceTopology" src --glob '!**/__tests__/**'
```

Expected: exit 1 with no output.

- [ ] **Step 6: Run focused Phase 9 and boundary regressions**

Run:

```bash
rtk npm test -- src/core/__tests__/service-topology.spec.ts src/core/__tests__/v1-topology.spec.ts src/core/__tests__/request-trace.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/game-engine.spec.ts src/core/__tests__/incident-topology.spec.ts src/application/__tests__/game-service-projector.spec.ts src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/view-boundary.spec.ts src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/topology-map.spec.tsx
rtk npm run typecheck
```

Expected: all focused tests and typecheck PASS with no React/Core boundary violation.

- [ ] **Step 7: Run full verification**

Run:

```bash
rtk npm test
rtk npm run typecheck
rtk npm run build
rtk git diff --check
rtk git status --short
```

Expected: full tests, typecheck, and production build PASS. If Next rewrites `next-env.d.ts` or `tsconfig.json` inside the isolated worktree, inspect the diff and restore only generated changes using `apply_patch`; rerun `rtk npm run typecheck` and confirm only intended Phase 9 files remain.

- [ ] **Step 8: Commit direct replacement**

```bash
rtk git add src/application/game-service-projector.ts src/application/__tests__/game-service-projector.spec.ts src/core/v1-topology.ts src/core/__tests__/v1-topology.spec.ts
rtk git commit -m "refactor: replace singleton service topology"
```

- [ ] **Step 9: Request independent full-range review**

Review the complete Phase 9 implementation range against the design and this plan. The reviewer must explicitly verify assignment-selected module/deployment resolution, aggregate validation timing, selected-deployment gateway ingress, independent shared Queue bindings, absence of the singleton contract, Application exact-ID projection, and unchanged load/growth/economy/UI behavior. Fix every Critical and Important finding in a separate commit, rerun full verification, and re-review the fix range before branch integration.
