# Phase 9: Multi-module ServiceTopology Design

## 1. Purpose

Phase 9 replaces the single-module topology aggregate with a generic multi-module topology in Core.

The codebase already has the correct independent concepts—`InfrastructureNode`, `ServiceModule`, `ModuleDeployment`, `WorkloadAssignment`, and `RouteResolver`—but runtime composition is still owned by `SingleServiceTopology`. That class creates exactly one `community` module and deployment, assigns every workload to it, and exposes singular `module` and `deployment` properties. Those assumptions block workload entry-module selection even though the lower-level vocabulary can already describe it.

This phase removes that singleton aggregate instead of preserving it behind a compatibility facade. Current V1 construction becomes a factory that produces the same generic `ServiceTopology` used by future multi-module catalogs.

## 2. Goals

- Replace `SingleServiceTopology` with a generic `ServiceTopology` aggregate.
- Let one topology own multiple modules, deployments, and workload assignments.
- Resolve a workload through its assigned entry module rather than through a hard-coded module.
- Allow the same workload ID to have a Blueprint in multiple modules while one assignment selects the active entry module.
- Preserve infrastructure independence: modules and deployments refer to nodes only by stable ID.
- Keep Blueprint routes and deployment bindings game-owned and non-editable by the player.
- Validate the complete aggregate at construction time and fail fast on invalid catalog state.
- Make the V1 community configuration a factory-built instance of the generic aggregate.
- Migrate Core and Application consumers directly to the new type without a `SingleServiceTopology` alias or facade.

## 3. Non-goals

Phase 9 does not add:

- player commands for changing `WorkloadAssignment`;
- UI for selecting a module;
- player editing of Blueprints, Bindings, Nodes, or Edges;
- new production modules such as Feed, Search, Notification, or Payment;
- a new workload-demand or load-calculation model;
- changes to node resource axes, request health, incidents, growth, economy, or observability;
- multiple active queue gameplay, topics, partitions, or consumer groups;
- a compatibility guarantee for the removed `SingleServiceTopology` API.

The current game must continue to compile and run, but Phase 9 does not retain singleton abstractions merely to preserve old call shapes.

## 4. Architectural invariants

### 4.1 Infrastructure remains independent

`InfrastructureNode` does not know which module uses it. `ServiceModule` does not own server, database, queue, cache, or storage objects. A `ModuleDeployment` connects a logical `ResourceRole` to an independent node ID.

Different deployments may bind to the same node. Shared infrastructure therefore remains composition, not object ownership.

### 4.2 Assignment selects only the entry module

`WorkloadAssignment` answers one question:

> Which module handles this workload?

It does not select a physical server, database, queue, Blueprint step, or topology edge. After assignment selection, the chosen module's Blueprint and deployment determine the internal route.

### 4.3 One canonical topology aggregate

Core exposes one generic aggregate for both current V1 and future multi-module games. There is no parallel V1 topology contract and no compatibility wrapper that reintroduces singular module/deployment assumptions.

### 4.4 Layer direction remains unchanged

```text
React View → Application DTOs/Commands → Core ServiceTopology
```

React never resolves modules, bindings, or routes. Application may select and project exact IDs supplied by Core but does not infer internal routes.

## 5. Domain model

### 5.1 ServiceTopology

```ts
export class ServiceTopology {
  readonly graph: TopologyGraph;
  readonly modules: readonly ServiceModule[];
  readonly deployments: readonly ModuleDeployment[];
  readonly assignments: readonly WorkloadAssignment[];

  constructor(input: {
    graph: TopologyGraph;
    modules: readonly ServiceModule[];
    deployments: readonly ModuleDeployment[];
    assignments: readonly WorkloadAssignment[];
  });

  module(moduleId: string): ServiceModule | undefined;
  deployment(moduleId: string): ModuleDeployment | undefined;
  assignment(workloadId: string): WorkloadAssignment | undefined;
  resolve(workloadId: string): ResolvedRoute;
  resolveForTrace(workloadId: string): ResolvedRoute;
}
```

The constructor copies and freezes the three input collections. Private lookup maps provide deterministic ID lookup without exposing mutable maps. Input order remains canonical for projection and tie-sensitive traversal.

### 5.2 ServiceModule

A `ServiceModule` continues to own only immutable Route Blueprints. It must reject two Blueprints with the same workload ID inside one module.

Different modules may intentionally define the same workload ID:

```text
community / SEARCH → community-app → community-db
search    / SEARCH → search-app    → search-db
```

The unique `WorkloadAssignment('SEARCH', entryModuleId)` determines which definition is active.

### 5.3 ModuleDeployment

There is at most one active deployment per module ID in this phase. A deployment continues to expose read-only role bindings and may share node IDs with other deployments.

Multiple deployments or deployment versions for one module are deferred until the game needs regional, staged, or replica-aware deployment selection.

### 5.4 WorkloadAssignment

There is exactly one assignment per active workload ID. Assignment objects remain immutable. Phase 9 constructs assignments from catalog/factory data; a later phase may replace an assignment through an engine command.

## 6. Aggregate validation

`ServiceTopology` validates aggregate collections, cross-references, and every binding that is present during construction. Workload-specific required-binding and edge-connectivity rules remain resolution concerns because `resolveForTrace` must be able to represent an unbound required runtime step as a failed trace. Invalid catalog references are never converted into a failed player request.

Required validations:

- module IDs are unique;
- deployment module IDs are unique;
- workload assignment IDs are unique;
- every deployment refers to an existing module;
- every assignment refers to an existing module and its deployment;
- the assigned module contains a Blueprint for the assigned workload;
- one module cannot contain duplicate Blueprint workload IDs;
- every bound node ID exists in `TopologyGraph`;
- every bound node kind is compatible with its `ResourceRole`;
- existing Blueprint validation still rejects duplicate steps, broken edges, and synchronous cycles;
- route resolution still rejects topology-disconnected Blueprint connections.

New validation failures use `TopologyValidationError` with stable codes. Expected codes are:

```text
DUPLICATE_MODULE_ID
DUPLICATE_MODULE_DEPLOYMENT
DUPLICATE_WORKLOAD_ASSIGNMENT
DUPLICATE_MODULE_WORKLOAD
UNKNOWN_DEPLOYMENT_MODULE
MISSING_ENTRY_MODULE
MISSING_WORKLOAD_BLUEPRINT
UNKNOWN_WORKLOAD_ASSIGNMENT
MISSING_BOUND_NODE
INCOMPATIBLE_BINDING
```

Existing route-level error codes remain unchanged. `MISSING_REQUIRED_BINDING`, `DISCONNECTED_ROUTE`, and synchronous-cycle validation occur when the selected workload is resolved. `resolveForTrace` alone preserves a missing required binding as a null step for runtime failure simulation; it does not suppress invalid node IDs, incompatible kinds, or disconnected concrete edges.

## 7. Route resolution

Both resolution methods use the same selection sequence:

```text
workloadId
  → WorkloadAssignment
  → assigned ServiceModule
  → matching RouteBlueprint
  → assigned ModuleDeployment
  → RouteResolver
  → ResolvedRoute with exact node and edge IDs
```

An unassigned workload fails with `UNKNOWN_WORKLOAD_ASSIGNMENT`. The returned `ResolvedRoute.moduleId` is always the assignment's selected `entryModuleId`; no first-module fallback exists.

`resolve(workloadId)` performs strict configuration resolution and rejects a missing required binding.

`resolveForTrace(workloadId)` preserves a missing required step as `nodeId: null` so `RequestTraceSimulator` can produce a failed runtime trace. Optional missing steps retain their current semantics.

### 7.1 Gateway ingress

Gateway composition is based on the selected module's deployment, never on a global or first deployment.

- If the selected deployment binds `ENTRY_GATEWAY` and the internal Blueprint does not already begin at that gateway, `resolveForTrace` prepends the gateway step and exact topology edge.
- If the selected deployment has no gateway binding, no gateway is invented.
- If the gateway is disconnected from the selected module entry node, resolution fails fast.
- A gateway bound only to another module is irrelevant to the selected workload.

This preserves the current ingress behavior while making it assignment-aware.

The composed identifiers are deterministic and module-qualified:

```text
stepId:          ingress:<moduleId>:<workloadId>:gateway
blueprintEdgeId: ingress:<moduleId>:<workloadId>
topologyEdgeId:  the exact existing edge ID from TopologyGraph
```

If the selected Blueprint's first resolved step already has role `ENTRY_GATEWAY`, no synthetic step or edge is added.

## 8. V1 construction and direct migration

`v1-topology.ts` retains V1 node IDs, infrastructure projection, and feature-to-Blueprint adaptation, but no longer exports `SingleServiceTopology`.

It instead exposes a factory such as:

```ts
export class V1ServiceTopologyFactory {
  static create(
    infrastructure: InfrastructureState,
    features: readonly FeatureDefinition[],
  ): ServiceTopology;
}
```

The factory creates:

- one `community` module;
- one `community` deployment;
- one assignment per active feature workload;
- the same independent V1 topology nodes and edges.

Core and Application consumers migrate directly:

- `LoadCalculator` receives the factory-produced `ServiceTopology`;
- incident topology reconstruction uses the same factory;
- `GameEngine` no longer imports `SingleServiceTopology`;
- `GameServiceProjector` queries the `community` deployment explicitly instead of reading a singular `.deployment` property;
- tests construct generic multi-module topologies directly when testing multi-module behavior.

No alias, subclass, or facade named `SingleServiceTopology` remains after migration.

## 9. Data flow

Phase 9 changes topology selection, not simulation mathematics.

```text
Current infrastructure + active feature catalog
  → V1ServiceTopologyFactory
  → generic ServiceTopology
  → assignment-aware route resolution
  → existing RequestTraceSimulator and LoadCalculator
  → existing immutable LoadSnapshot
  → existing Application projectors
```

Current load formulas, resource capacities, failure weighting, growth policy, economy, visible copy, and animation remain out of scope. Tests may be updated for the new topology API but must not hide unrelated behavioral regressions.

## 10. Testing strategy

### 10.1 Generic aggregate tests

- Two modules define the same workload with different App/DB bindings; changing only the assignment selects a different exact route.
- Two module deployments share one Queue node without either module owning it.
- A gateway binding is taken from the assigned module, not another deployment.
- Module, deployment, and assignment collection order is preserved.

### 10.2 Validation tests

- Duplicate module, deployment, assignment, and module-workload IDs fail with exact codes.
- A deployment for an unknown module fails.
- An assignment without a module, deployment, or matching Blueprint fails.
- Missing bound nodes and incompatible node kinds fail at aggregate construction.
- Existing optional, required, disconnected route, and synchronous-cycle behavior remains covered.

### 10.3 V1 migration tests

- The V1 factory creates the expected `community` module, deployment, assignments, nodes, and bindings.
- Queue replacement changes only the event-bus binding and retired node.
- Existing traces and node loads still use exact topology IDs.
- Production source contains no `SingleServiceTopology` reference.

### 10.4 Boundary verification

- React continues to have no Core imports.
- Application consumes `ServiceTopology` through exact IDs and deployment lookup.
- Full tests, typecheck, and production build pass.

## 11. Implementation sequence

1. Strengthen `ServiceModule` and aggregate validation tests.
2. Add `ServiceTopology` with immutable collections and deterministic lookup.
3. Add assignment-aware strict and trace route resolution.
4. Add selected-deployment gateway composition.
5. Replace `SingleServiceTopology` construction with `V1ServiceTopologyFactory`.
6. Migrate LoadCalculator, GameEngine, incident topology, Application projection, and tests.
7. Delete `SingleServiceTopology` and prove the production symbol is absent.
8. Run focused topology/load/trace/Application regressions and full verification.

## 12. Success criteria

Phase 9 is complete when:

- `ServiceTopology` resolves a workload through its assigned module and deployment;
- the same workload can resolve to different exact Server/DB paths under different assignments;
- modules can share an independent Queue binding;
- invalid aggregate references and duplicate IDs fail at construction with stable codes;
- selected-module gateway ingress is resolved without global or first-deployment inference;
- current V1 data is created through the generic topology factory;
- `SingleServiceTopology` and singular `.module`/`.deployment` assumptions are absent from production;
- no player command or UI can edit assignments, bindings, routes, nodes, or edges;
- existing load, trace, growth, economy, and View/Application boundaries remain outside the redesign;
- full tests, typecheck, and production build pass.
