# Phase 8 Node Load Contract Design

## 1. Purpose

Phase 8 removes the remaining single-service load and request-flow compatibility contracts before multi-module routing is added. The current Core already calculates canonical topology nodes, node-specific loads, and request traces, but `LoadSnapshot` still publishes flat App/DB/Async/Storage fields and a second legacy request-flow representation. Application projections therefore mix canonical node data with V1 aggregate fields.

This phase makes independent infrastructure nodes the only owner of resource pressure and makes `RequestTrace` the only request-path result. It preserves current gameplay, balance, visible copy, alert ordering, topology rendering, and animation.

## 2. Goals

- Represent CPU, I/O, throughput, and storage pressure inside the exact infrastructure node that owns the resource.
- Remove every flat demand, capacity, and ratio field from `LoadSnapshot`.
- Remove `LoadSnapshot.requestFlows`, `RequestFlowResult`, `RequestFlowSimulator`, and `LegacyRequestFlowProjector`.
- Move growth, health, diagnosis, alerts, and previews to pure node-load queries.
- Return exact topology node IDs from Application instead of generic `application`, `database`, `queue`, or `storage` identifiers.
- Keep route authoring vocabulary separate from request simulation.
- Preserve the strict dependency direction `React View → Application → Core`.
- Leave Core ready for multiple server groups, databases, queues, and modules in the next phase.

## 3. Non-goals

- Creating a second `ServiceModule` or multiple `ModuleDeployment` instances in live gameplay.
- Adding the player command or UI for selecting a workload entry module.
- Letting the player edit a module's internal route, resource bindings, topology nodes, or edges.
- Changing feature load weights, infrastructure capacity, technology effects, incident effects, growth penalties, or economic balance.
- Adding speculative resource kinds such as memory or connection pools before they have real demand and capacity policies.
- Changing visible Service Map layout, request particles, workload selection, alert copy, or observability unlock behavior.

## 4. Architectural invariants

### 4.1 Independent resource ownership

- Every resource pressure belongs to one `InfrastructureNodeId`.
- A node may expose zero or more resource measurements.
- A node may expose several resource kinds at once. App and database nodes expose CPU and I/O; queue, load balancer, and cache nodes expose throughput; object storage exposes storage.
- A `ServiceModule` never owns node resource state.
- Load consumers do not infer a physical node from legacy roles such as APP or DB.

### 4.2 One canonical request-path result

- `RequestTrace` is the only simulated request-path output.
- Trace node and edge order comes from the resolved route and is never reconstructed in Application or React.
- Missing optional steps remain visible in the trace but do not become request failures.
- Missing required or failed nodes are identified by exact `InfrastructureNodeId`.

### 4.3 Strict layer boundary

- Core owns load calculation, trace simulation, and node-load queries.
- Application owns visible labels, tones, ordering, observability masking, alert text, and UI DTOs.
- React renders Application DTOs and does not inspect Core load or route types.

### 4.4 Behavior parity

- For the current single-service topology, every calculated demand, tuned capacity, ratio, bottleneck, latency, failure rate, growth penalty, preview value, alert, and trace remains numerically and visibly equivalent.
- Migration may temporarily publish old and new fields inside an implementation task, but the final Phase 8 contract contains no flat legacy load fields or request-flow projection.

## 5. Core contracts

### 5.1 Resource kinds

```ts
export type NodeResourceKind = 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE';

export interface NodeResourceLoad {
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly capacity: number;
  readonly ratio: number;
}
```

`resourceKind` describes the capacity dimension measured inside a node. It is distinct from `InfrastructureNodeKind`, which describes whether the node is a server group, database, queue, cache, load balancer, object storage, worker, or external service.

Only resource kinds with real calculation policies are included. Future kinds can be added to the union when both demand and capacity semantics exist.

### 5.2 Node load

```ts
export interface NodeLoadSnapshot {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resources: readonly NodeResourceLoad[];
  readonly loadRatio: number;
}
```

- `resources` contains at most one measurement for each `resourceKind` and is normalized to CPU, IO, THROUGHPUT, STORAGE order.
- `loadRatio` equals the maximum resource ratio in the node, or `0` when `resources` is empty.
- A Core factory creates and freezes node-load values and throws `LoadValidationError` with code `DUPLICATE_NODE_RESOURCE_KIND` for duplicate resource kinds.
- `loadRatio` is derived by the factory rather than accepted as an independent caller-provided value.
- `nodeKind` is copied from the canonical topology node during load calculation so consumers never infer kind from an ID prefix.

Current V1 node measurements are:

| Node kind | Resource measurements |
|---|---|
| `SERVER_GROUP` | CPU, IO |
| `DATABASE` | CPU, IO |
| `LOAD_BALANCER` | THROUGHPUT |
| `CACHE` | THROUGHPUT |
| `QUEUE` | THROUGHPUT |
| `OBJECT_STORAGE` | STORAGE |
| `WORKER` | Empty until a worker demand policy exists |
| `EXTERNAL_SERVICE` | Empty |

The cache throughput calculation preserves the current Redis pressure and capacity behavior. This phase does not invent a new cache model.

### 5.3 Load snapshot

```ts
export interface LoadSnapshot {
  readonly failureRate: number;
  readonly nodeLoads: readonly NodeLoadSnapshot[];
  readonly requestTraces: readonly RequestTrace[];
}
```

`failureRate` remains a canonical weighted service outcome. It is not a physical-resource aggregate and is still required by growth and availability policies. Its current feature-load weighting and clamping remain unchanged.

The following fields are removed:

- flat demand: `appDemand`, `dbDemand`, `asyncDemand`, `storageDemand`, and CPU/I/O variants;
- flat capacity: raw and tuned App, DB, Async, and Storage capacity fields;
- flat ratio: App, DB, Async, Storage, and CPU/I/O ratio fields;
- `requestFlows`.

### 5.4 Node-load queries

Core provides pure read-only queries so policies and Application projectors do not duplicate traversal rules:

```ts
nodeLoad(load, nodeId): NodeLoadSnapshot | undefined;
resourceLoad(nodeLoad, resourceKind): NodeResourceLoad | undefined;
nodeLoadsOfKind(load, nodeKind): readonly NodeLoadSnapshot[];
maxNodeLoad(load): NodeLoadSnapshot | undefined;
maxResourceLoad(load, { nodeKind?, resourceKind? }):
  { node: NodeLoadSnapshot; resource: NodeResourceLoad } | undefined;
```

Returned collections preserve the `LoadSnapshot.nodeLoads` order. Max queries use node order and then normalized resource order as tie-breakers. An empty selection returns `undefined`; each caller follows the explicit absence rules in sections 8 and 9.

Growth uses `maxNodeLoad(load)?.loadRatio ?? 0`.

## 6. Request-route vocabulary cleanup

The current `request-flow.ts` combines catalog vocabulary, obsolete simulation, and incident health mapping. Phase 8 separates these responsibilities.

### 6.1 Retained route vocabulary

`request-route.ts` owns:

- `RequestNodeKind`;
- `RequestRequirement`;
- `RequestRouteStep`.

`FeatureDefinition.requestRoute` and `V1RouteBlueprintAdapter` continue using this vocabulary. This is static V1 route authoring input, not a simulated request result. `RequestNodeViewKind` remains an independent Application type for the feature roadmap.

### 6.2 Canonical trace policy

`request-trace.ts` owns:

- `RequestTrace` and its node/edge types;
- `RequestTraceSimulator`;
- `NodeHealth`;
- the incident-severity-to-health conversion currently named `trafficHealthForSeverity`.

The following are deleted:

- `RequestFlowEnvironment`;
- `RequestFlowNodeResult`;
- `RequestFlowResult`;
- `RequestFlowSimulator`;
- `LegacyRequestFlowProjector`;
- request-flow simulator tests that only verify the deleted parallel model.

Equivalent required/optional, health propagation, and failure behavior remains covered by canonical `RequestTrace` and topology tests.

## 7. Load calculation migration

`LoadCalculator` keeps the existing demand formulas, capacity tuning, feature weights, Redis modifiers, queue fallback, traffic multiplier, trace-arrival scaling, and weighted failure calculation.

The change is where the results are published:

- App CPU and I/O demand/capacity become two resources on the exact server-group node.
- DB CPU and I/O become two resources on the exact database node.
- Async demand/capacity becomes throughput on the exact active queue node.
- Storage demand/capacity becomes storage on the exact object-storage node.
- Gateway demand/capacity becomes throughput on the exact load-balancer node.
- Current cache pressure becomes throughput on the exact cache node.
- Nodes with no modeled resource pressure receive an empty resource list.

`nodeLoads` remains in `TopologyGraph.nodes` order. Queue replacement therefore replaces the queue node and its load entry without leaving a retired node behind.

## 8. Application projection

### 8.1 Operational health and diagnosis

`OperationalViewProjector` no longer indexes `LoadSnapshot` fields. It finds bottlenecks by comparing node resources.

- Server CPU maps to `APP_CPU` and visible label `APP CPU`.
- Server I/O maps to `APP_IO` and visible label `APP I/O`.
- Database CPU maps to `DB_CPU` and visible label `DB CPU`.
- Database I/O maps to `DB_IO` and visible label `DB I/O`.
- Queue throughput maps to `ASYNC` and visible label `ASYNC QUEUE`.
- Object-storage storage maps to `STORAGE` and visible label `STORAGE`.

Load-balancer and cache pressure participate in node alerts and exact-node diagnosis, but the current V1 summary and visible load strip remain unchanged to avoid a UI or balance change. A future MSA phase can define new player-facing metrics for additional node kinds.

P95 latency thresholds, service-health thresholds, observability masking, diagnosis text, and suggestion text remain unchanged. Diagnosis reads the selected exact node's resources. Generic ID-prefix inference is removed.

### 8.2 Application DTO metadata

```ts
export interface LoadMetricView {
  readonly id: string;
  readonly nodeId: string | null;
  readonly label: string;
  readonly percent: number;
  readonly tone: LoadTone;
}

export interface ServiceHealthView {
  // existing fields remain
  readonly bottleneckNodeId: string | null;
}
```

`LoadMetricView.id` is stable and unique for the exact node/resource pair. React keys metrics by `id`, not visible label. A currently unbound optional infrastructure role, such as Queue before deployment, retains its existing visible zero metric with `nodeId: null` and a stable role/resource ID. No phantom topology node is created. The new metadata does not change rendered copy.

### 8.3 Alerts

Node-load alerts are produced from node resources and target exact node IDs. Current V1 alert IDs, visible names, thresholds, penalty text, ordering, and six-alert cap remain unchanged.

Request-failure alerts use failed `requestTraces` directly:

- failed workloads are traces whose `successRatio < 0.999`;
- visible names come from each trace's `workloadId` through `presentationCatalog`;
- the alert target is the first exact `failureNodeId`;
- an absent exact failure node leaves `nodeId` undefined rather than inventing a legacy role.

React's `topologyNodeIdForAlert` generic App/DB/technology inference is removed for these projections. Application supplies exact IDs for node-targeted alerts and feature-impact previews.

### 8.4 Technology and feature previews

Preview comparison uses Core node-load queries.

- App and DB previews compare the maximum matching resource on the relevant node kind.
- Queue technology replacement compares queue throughput by node kind because the physical queue node ID changes.
- Storage compares object-storage storage pressure.
- Feature-impact output selects the largest before/after resource change and returns the exact affected node ID.
- A missing optional infrastructure kind before deployment contributes ratio `0`; if the preview deploys that kind, the after value and exact after-node ID come from the new node.
- A preview where an optional kind is absent both before and after retains the existing zero/no-change output.
- Missing server-group or database resources in a live V1 snapshot are internal invariant failures because those nodes and their CPU/I/O measurements are required.
- No synthetic zero-capacity node is created.

For the current single-service topology, all preview percentages, summaries, tones, and visible labels remain identical.

## 9. Determinism and error handling

- Node-load order follows topology node order.
- Resource order for current nodes follows CPU, IO, THROUGHPUT, STORAGE.
- Duplicate resource kinds inside one node fail fast during Core construction.
- Missing topology nodes remain topology validation errors before load calculation.
- Empty-resource nodes are valid and have `loadRatio = 0`.
- Missing optional route steps remain `MISSING` trace nodes with unchanged success.
- Missing required route steps reduce trace success and surface through the request-failure alert.
- Growth treats an entirely empty node-load collection as maximum ratio `0`.
- Optional Queue, Cache, and Load Balancer absence is a valid undeployed state and contributes ratio `0` with no node ID.
- Required Server Group, Database, and Object Storage node/resource absence in the V1 live topology fails fast in the Core/Application boundary rather than silently selecting another node.
- Projection query absence is handled explicitly; no `!` assertion or ID-prefix fallback silently selects another node.
- `GameProgressionProjector`'s current-snapshot freshness guard continues to compare the complete JSON-safe snapshot and load identity. The new load DTO remains deterministic and JSON-safe.

## 10. Data flow

```text
GameEngine mutation
  → current topology + resolved workload routes
  → RequestTraceSimulator
  → LoadCalculator
      → NodeLoadSnapshot[] with per-node resources
      → weighted failureRate
  → LoadSnapshot { failureRate, nodeLoads, requestTraces }
  → Core node-load queries
  → Application projectors
      → exact-node health / alerts / previews / topology DTOs
  → React View
```

React receives no Core load objects and never decides which physical node a generic role refers to.

## 11. Implementation sequence

1. Add the resource-load contracts, validated node-load factory, and pure queries with direct tests.
2. Make `LoadCalculator` publish node resources while temporarily preserving legacy fields; prove numerical parity for every current V1 field.
3. Move growth policy inputs and Core incident/load consumers to node queries.
4. Move Operational, alert, and preview projections to exact node/resource queries and add exact node IDs to Application DTOs.
5. Move request-route vocabulary and health conversion to their canonical modules; switch failure alerts to `requestTraces`.
6. Delete request-flow result/simulator/projector and their parallel tests.
7. Delete all flat `LoadSnapshot` fields and update remaining tests to assert node resources.
8. Remove React's generic alert-node inference where exact IDs are now guaranteed.
9. Run focused contract, calculation, policy, Application, and UI regressions, then full verification.

Each committed implementation task must leave tests and type checking green. Transitional dual publication is an implementation aid only and is absent from the final contract.

## 12. Testing strategy

### 12.1 Core contract tests

- One node can contain CPU and I/O resources simultaneously.
- Node `loadRatio` equals its maximum resource ratio.
- Empty-resource nodes have ratio zero.
- Duplicate resource kinds fail with the expected validation code.
- Query filters return the exact node/resource and preserve deterministic ties.

### 12.2 Numerical parity tests

- V1 App/DB CPU and I/O demand, tuned capacity, and ratios match the pre-migration values.
- Queue, storage, gateway, and cache values match the pre-migration values.
- Proficiency tuning, Redis reduction, queue fallback, Kafka modifier, traffic spikes, and incidents retain their existing effects.
- Weighted `failureRate` is unchanged.
- Growth receives the same maximum load ratio and produces the same seeded DAU sequence.

### 12.3 Trace migration tests

- Required missing nodes fail the canonical trace with the exact missing node semantics.
- Optional missing nodes stay visible and do not fail the trace.
- Node-specific incidents affect only workloads traversing the exact node.
- Request-failure alerts list the same workload names and target the exact `failureNodeId`.
- No production source references `RequestFlowResult`, `RequestFlowSimulator`, `LegacyRequestFlowProjector`, or `LoadSnapshot.requestFlows`.

### 12.4 Application and UI tests

- Health, P95, bottleneck, visible metrics, diagnosis, alert copy/order, and preview literals remain unchanged for existing scenarios.
- `bottleneckNodeId`, load metric IDs, and alert node IDs match canonical topology node IDs.
- UI imports only Application contracts and does not infer Core node roles.
- Service Map node, edge, trace order and request-particle paths remain unchanged.

### 12.5 End-to-end verification

- `npm test`
- `npm run typecheck`
- `npm run build`
- representative start → launch → scale → technology build → incident response loop
- worktree diff and status checks that preserve the user's existing main-checkout changes

## 13. Success criteria

- `LoadSnapshot` contains only `failureRate`, `nodeLoads`, and `requestTraces`.
- Every modeled capacity pressure is attached to an exact independent node and resource kind.
- Growth, health, diagnosis, alerts, and previews consume node-load queries rather than flat role fields.
- `RequestTrace` is the only simulated request-path result.
- No production source contains the legacy request-flow result or projector.
- Application supplies exact node IDs for node-targeted UI behavior.
- Current V1 numerical results, player-visible behavior, topology, and balance remain unchanged.
- React remains separated from Core.
- The final model can represent multiple nodes of the same infrastructure kind without changing the Core load contract.
