# Generic Operational Bottleneck Engine Design

## Status

Ready for user review on `feature/generic-operational-bottleneck-engine`, based on the approved in-chat architecture discussion and completed spec self-review.

## Goal

Make every player-owned infrastructure node and every resource it exposes participate in one shared operational bottleneck model so Growth, Service Health, P95 latency, alerts, release-impact previews, observability, and diagnosis cannot silently disagree about which infrastructure pressure matters.

This is not an ALB/Redis special case. ALB and Redis exposed the gap because the generic node-scaling engine made them independent resources while the operational layer still hard-coded APP/DB/Queue/Storage. The target is a generic resource-pressure engine that automatically includes future player-owned nodes such as Worker or CDN when they expose `NodeResourceLoad` data.

## Design principles

1. Keep multi-resource capacity in Core. Do not collapse CPU, I/O, throughput, and storage into one universal capacity number.
2. Keep node-level aggregate load as a convenience: `NodeLoadSnapshot.loadRatio` remains the maximum ratio among the node's resources.
3. Determine the global bottleneck from the hottest resource across every player-owned node.
4. Keep the bottleneck model structural and generic. Product-specific wording and recommendations belong to Application presentation/diagnosis.
5. Preserve observability progression: BASIC shows aggregate node load, METRICS shows resource detail, APM adds causal context and recommendations.
6. Overload affects P95, Service Health, and Growth in this change. It does not create additional request `failureRate` directly.
7. Remove hard-coded operational candidate lists wherever this change touches them so new node types do not disappear from another operational surface later.
8. Core pressure analysis may be topology-scoped by node ID; Application must scope service-facing health/metrics to the supplied service topology so unrelated or decoy loads cannot become visible service bottlenecks.

## Current problem

The Core load model already exposes generic `NodeLoadSnapshot` objects:

```ts
interface NodeLoadSnapshot {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resources: readonly NodeResourceLoad[];
  readonly loadRatio: number;
}
```

and each resource has:

```ts
interface NodeResourceLoad {
  readonly resourceKind: 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE';
  readonly demand: number;
  readonly capacity: number;
  readonly ratio: number;
}
```

However the operational layer still uses fixed categories and fixed node selections:

- Service Health only compares APP CPU/I/O, DB CPU/I/O, Queue throughput, and Storage.
- `BottleneckView` is a closed union such as `APP_CPU`, `DB_IO`, `ASYNC`, `STORAGE`.
- `GameEngine.advanceGrowth()` computes `maxLoadRatio` from selected node kinds rather than all owned node resources.
- Service load alerts hard-code Application, Database, Async, and Storage.
- Feature release impact preview hard-codes APP CPU/I/O, DB CPU/I/O, Async, and Storage.
- `OperationalNodeSelection` explicitly names APP/DB/Queue/Storage and therefore cannot naturally include ALB, Redis, or future node types.

As a result, ALB or Redis can be independently overloaded in the node model and still be invisible to global health/growth/alert decisions.

## Target operational model

The V1 player-owned topology currently contributes these resource axes automatically:

| Node | Resource axes |
| --- | --- |
| ALB | THROUGHPUT |
| Application server group | CPU, IO |
| Redis | THROUGHPUT |
| Primary database | CPU, IO |
| Active queue | THROUGHPUT |
| Local/Object storage | STORAGE |

The engine must not encode this table as a switch for candidate discovery. It discovers candidates from `NodeLoadSnapshot.resources` and excludes only non-player-operated nodes.

Future nodes such as a Worker with CPU/I/O or a CDN with throughput should participate without adding a new bottleneck enum or a new candidate list.

## 1. Core: generic operational pressure model

Add a Core model dedicated to operational pressure, separate from the raw load creation code.

Target shape:

```ts
interface OperationalPressure {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly capacity: number;
  readonly ratio: number;
}

interface OperationalPressureScope {
  readonly nodeIds?: ReadonlySet<InfrastructureNodeId>;
}
```

Add behavior equivalent to:

```ts
class OperationalPressureAnalyzer {
  static all(
    load: NodeLoadCollection,
    scope?: OperationalPressureScope,
  ): readonly OperationalPressure[];

  static primary(
    load: NodeLoadCollection,
    scope?: OperationalPressureScope,
  ): OperationalPressure | null;

  static forNode(
    load: NodeLoadCollection,
    nodeId: InfrastructureNodeId,
  ): readonly OperationalPressure[];

  static primaryForNode(
    load: NodeLoadCollection,
    nodeId: InfrastructureNodeId,
  ): OperationalPressure | null;
}
```

Exact class/function naming may be adjusted if a smaller functional API fits the existing Core style better, but the contracts and responsibilities above must remain available.

### Candidate rules

- Every resource from every eligible `NodeLoadSnapshot` is a candidate.
- `EXTERNAL_SERVICE` nodes are excluded from operational capacity pressure because they are not player-operated infrastructure.
- When `scope.nodeIds` is supplied, only those exact node IDs may contribute pressure.
- No candidate is excluded because its ratio is below 1; the primary pressure is still useful below overload thresholds for P95 and diagnosis.
- Nodes with no resource entries contribute no pressure.
- The analyzer must not parse node IDs or know product IDs.
- `forNode(load, unknownNodeId)` returns an empty array.
- `primaryForNode(load, unknownNodeId)` returns `null`.

### Ordering and ties

The result must be deterministic.

- Preserve `nodeLoads` order.
- Preserve each node's resource order.
- Select the first candidate when ratios tie exactly.

This gives stable UI/test behavior without inventing hidden priority rules between CPU, I/O, throughput, and storage.

## 2. Multi-resource Core remains unchanged

Do not replace resource-specific capacities with one universal capacity value.

The game should continue to distinguish workload/resource behavior such as:

- APP CPU pressure vs APP I/O pressure
- DB CPU pressure vs DB I/O pressure
- Redis/ALB/Queue throughput pressure
- Storage capacity pressure

`NodeLoadSnapshot.loadRatio` remains the aggregate node load and is still defined as the maximum resource ratio within that node.

This gives two levels of operational information:

```text
Node aggregate load = max(resource ratios within that node)
Global bottleneck   = max(resource ratios across all player-owned nodes)
```

The aggregate value supports BASIC observability while detailed resources support METRICS/APM gameplay.

## 3. Growth consumes the generic primary pressure

`GrowthPolicy` already accepts `maxLoadRatio` and applies the existing overload penalty:

```text
overload = max(0, maxLoadRatio - 1)
capacity penalty = -min(30 percentage points, overload)
```

Keep that policy and its balance constants unchanged in this refactor.

`GameEngine` owns the current load generated from its real service topology, so it can use the unscoped Core primary pressure:

```ts
const bottleneck = OperationalPressureAnalyzer.primary(this._load);
const maxLoadRatio = bottleneck?.ratio ?? 0;
```

Consequences:

- ALB 130%, APP 80%, DB 90% -> growth capacity penalty uses 130%.
- Redis 125%, DB I/O 105% -> growth capacity penalty uses 125%.
- Future owned Worker CPU 140% -> it participates automatically.
- External AI load must not become an infrastructure capacity penalty.

`failureRate`, incident penalties, traffic event modifiers, and other Growth policy semantics remain unchanged.

## 4. Application no longer uses a closed bottleneck enum

Replace the closed string union:

```ts
type BottleneckView =
  | 'APP_CPU'
  | 'APP_IO'
  | 'DB_CPU'
  | 'DB_IO'
  | 'ASYNC'
  | 'STORAGE'
  | 'NONE';
```

with a generic projected bottleneck object.

Target shape:

```ts
interface BottleneckView {
  readonly nodeId: string;
  readonly nodeKind: TopologyNodeView['kind'];
  readonly resourceKind: 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE';
  readonly ratio: number;
  readonly percent: number;
  readonly label: string;
}
```

`ServiceHealthView` becomes conceptually:

```ts
interface ServiceHealthView {
  readonly status: ServiceHealthStatusView;
  readonly p95LatencyMs: number;
  readonly bottleneck: BottleneckView | null;
}
```

Do not keep duplicated `bottleneckLabel`, `bottleneckPercent`, and `bottleneckNodeId` fields once consumers are migrated unless a concrete compatibility test proves they are still needed.

Presentation labels are Application concerns. They should use topology metadata (`productId`, kind) and the presentation catalog/fallbacks, never node-ID string parsing as the primary label source.

Examples:

- `ALB · THROUGHPUT`
- `Spring Boot · CPU`
- `PostgreSQL · I/O`
- `Redis · THROUGHPUT`
- `Kafka · THROUGHPUT`
- `Object Storage · STORAGE`

## 5. Remove `OperationalNodeSelection`

The current operational projection explicitly selects:

```text
appNodeId
databaseNodeId
queueNodeId
storageNodeId
```

That boundary is obsolete after the topology and load model became generic.

Change `OperationalViewProjector` to consume the actual service topology (or an equivalent topology-node collection) plus the snapshot/developer profile.

Conceptually:

```ts
OperationalViewProjector.project(snapshot, developer, topology)
```

The projector should derive a topology scope:

```ts
const ownedNodeIds = new Set(
  topology.graph.nodes
    .filter((node) => node.kind !== 'EXTERNAL_SERVICE')
    .map((node) => node.id),
);

const pressureScope = { nodeIds: ownedNodeIds };
```

It then uses that exact scope for service-facing primary pressure and metrics.

The projector should:

1. Obtain Core pressure data from `snapshot.load` scoped to actual player-owned topology node IDs.
2. Use the topology graph to resolve player-owned node metadata/product labels.
3. Exclude external services from operational metrics.
4. Avoid requiring a role-specific APP/DB/Queue/Storage selection object.
5. Ignore load snapshots that do not belong to the supplied topology, even if they have a valid player-owned node kind.

This preserves the existing same-kind decoy safety while making the selection generic. Core pressure analysis stays structural; Application topology membership determines what belongs to the current service view.

## 6. Service Health and P95 use the same topology-scoped primary pressure

Keep the current latency curve and health thresholds unless tests reveal a regression requiring an intentional balance change.

Replace the fixed bottleneck candidate array with the generic primary operational pressure **scoped to the supplied service topology**.

Conceptually:

```ts
const bottleneck = OperationalPressureAnalyzer.primary(load, pressureScope);
const maxRatio = bottleneck?.ratio ?? 0;
const p95LatencyMs = latencyFromPressure(maxRatio, load.failureRate);
```

Health status continues to consider both capacity pressure and request failure rate.

This means any player-owned resource can now drive the same health behavior:

- ALB throughput can degrade/critical the service.
- Redis throughput can degrade/critical the service.
- Queue/storage continue to work.
- APP/DB CPU/I/O behavior is preserved.
- a decoy/out-of-topology load cannot become the visible service bottleneck.

### Failure-rate boundary

This change does **not** create request failures from resource overload.

Overload affects:

- bottleneck selection
- P95 latency
- Service Health
- Growth capacity penalty
- alerts and diagnosis

Existing request-flow/incident logic remains responsible for `failureRate`.

A future design may add overload-induced timeout/drop behavior, but that is explicitly out of scope here.

## 7. Observability progression becomes topology/resource generic

### BASIC

Show one aggregate load metric per player-owned topology node using `NodeLoadSnapshot.loadRatio`.

Example:

```text
ALB      72%
APP      84%
Redis   113%
DB       92%
Kafka    54%
Storage  31%
```

Do not expose CPU/I/O/resource signatures at BASIC.

The BASIC summary headline should use the topology-scoped global primary pressure ratio rather than `max(APP, DB)`.

### METRICS

Flatten the resources of all player-owned topology nodes into metrics.

Example:

```text
Spring Boot CPU         84%
Spring Boot I/O         61%
Redis THROUGHPUT       113%
PostgreSQL CPU          66%
PostgreSQL I/O          92%
Kafka THROUGHPUT        54%
Object Storage STORAGE  31%
```

No APP/DB-specific metric array should remain.

### APM

APM keeps the same resource metrics but enriches diagnosis with context:

- traffic event multiplier
- tech debt when relevant
- request failure
- node-specific recommendations

APM is therefore a causal/relationship unlock, not just another numeric-detail level.

## 8. Node diagnosis uses the hottest resource within the selected node

Selected-node diagnosis should use:

```ts
OperationalPressureAnalyzer.primaryForNode(load, nodeId)
```

rather than branching first on node kind to decide which resource is primary.

The selected `nodeId` must also exist in the supplied service topology before Application projects diagnosis. An unknown/out-of-topology selection fails with the existing missing-node style error rather than borrowing another node of the same kind.

Examples:

- APP -> CPU or I/O, whichever is hottest.
- DB -> CPU or I/O, whichever is hottest.
- ALB -> throughput.
- Redis -> throughput.
- Queue -> throughput.
- Storage -> storage.
- Future multi-resource Worker -> whichever resource is hottest.

### Recommendations remain semantic

The signal-selection engine is generic, but recommendations may remain Application policy keyed by node kind/product/resource because real operational actions differ.

Examples:

- APP CPU: vertical size, instance scale-out, proficiency.
- APP I/O: scale-out, async split, workload inspection.
- DB I/O: Redis, read replica, DB resize.
- Redis throughput: Redis resize, cache workload inspection, DB fallback pressure.
- ALB throughput: ALB resize, entry traffic inspection, APP downstream check.
- Queue throughput: queue resize or architecture technology change.
- Storage: storage resize/technology choice.

Unknown future node/resource combinations must receive a safe generic fallback recommendation instead of failing projection.

Do not label Redis pressure as `DB I/O` or ALB pressure as `APP`; the primary signal label must describe the actual node/resource.

## 9. Load alerts become generic

The existing service alert projection currently creates fixed Application/Database/Async/Storage pressure alerts.

Replace this with topology-aware generic node pressure alerts.

For each player-owned topology node:

1. Get the node's hottest operational pressure.
2. If the node aggregate/hottest ratio is at least 90%, create one load alert for that node.
3. Use the actual node/product label and hottest resource in the alert.
4. Preserve existing warning/danger thresholds and the existing overload growth-pressure explanation.

Example:

```text
Redis THROUGHPUT 118%
Capacity 18% 초과 · 다음 날 DAU 최대 -18% 압력
```

One alert per node avoids duplicate APP CPU + APP I/O alerts while still identifying the hottest resource.

Existing alert count limits and non-load alerts remain unchanged.

## 10. Feature release impact preview becomes generic

Feature impact preview must not continue using a hard-coded APP/DB/ASYNC/STORAGE axis list.

For a previewed feature:

1. Calculate current and projected `LoadSnapshot` as today.
2. Convert both snapshots to topology-scoped operational pressure collections.
3. Match pressures by stable key `(nodeId, resourceKind)`.
4. Compute before/after ratio and delta for each player-owned resource.
5. Show the two largest pressure increases.
6. Determine the projected top bottleneck from the generic projected pressures.
7. Preserve existing request-failure preview behavior.

This allows feature releases to correctly warn about effects such as:

```text
ALB THROUGHPUT 82→101%
Redis THROUGHPUT 76→109%
```

without adding new axes to Application code.

## 11. Separation of responsibilities

### Core

Owns:

- raw node/resource loads
- generic operational pressure extraction
- optional exact-node-ID scoping
- global primary pressure
- selected-node primary pressure
- Growth's use of the global primary ratio

Core does not own:

- service topology membership decisions beyond an optional supplied ID scope
- Korean/English display labels
- recommendation text
- observability unlock copy
- topology product presentation

### Application

Owns:

- deriving the current service's player-owned topology node-ID scope
- topology membership/product metadata
- pressure labels
- Service Health/P95 projection
- BASIC/METRICS/APM presentation
- selected-node diagnosis copy
- generic pressure alerts
- feature-impact preview text

### UI

Consumes projected generic views. UI must not reconstruct bottleneck logic from node kinds.

## 12. Compatibility and intentional behavior changes

Preserve:

- existing capacity/load formulas from the generic node-scaling engine
- APP/DB multi-resource semantics
- ALB/Redis/Queue/Storage independent sizing
- P95 curve constants
- Service Health thresholds
- Growth capacity-penalty formula/cap
- incident/failure semantics
- observability unlock skill requirements
- traffic spike logic
- feature progression, revenue, settlement, tech debt, and technology build behavior
- exact topology-node selection safety in Application projections

Intentional changes:

- ALB and Redis can become the global bottleneck.
- Any future player-owned resource can become the global bottleneck automatically.
- Growth capacity penalty sees every player-owned resource generated by the actual engine topology.
- BASIC metrics list all current player-owned nodes rather than only APP/DB/Queue/Storage.
- METRICS lists all resource axes rather than a fixed six-item array.
- Load alerts and feature impact preview include all player-owned resources.
- `BottleneckView` changes from a fixed enum-like union to a generic object.

## 13. Testing strategy

Use strict TDD for every behavior change.

### Core pressure analyzer

Verify:

- APP CPU/I/O both become candidates.
- DB CPU/I/O both become candidates.
- ALB/Redis/Queue throughput become candidates.
- Storage becomes a candidate.
- external service resources are excluded.
- optional node-ID scope excludes otherwise valid owned-node decoys.
- hottest resource is selected regardless of node kind.
- exact ties use stable node/resource order.
- node-local primary pressure selects only within the requested node.
- `forNode` on an unknown node returns `[]`.
- `primaryForNode` on an unknown node returns `null`.

### Growth integration

Verify at the GameEngine integration boundary:

- ALB can be the max load and drive the existing capacity penalty.
- Redis can be the max load and drive the existing capacity penalty.
- APP/DB/Queue/Storage existing overload penalties still behave the same.
- external AI cannot become a growth capacity bottleneck.
- `GrowthPolicy` balance constants/formula remain unchanged.

### Service Health and P95

Verify:

- ALB throughput can be `health.bottleneck`.
- Redis throughput can be `health.bottleneck`.
- APP/DB resource bottlenecks continue to work.
- an out-of-topology same-kind decoy cannot become `health.bottleneck`.
- P95 rises from the topology-scoped generic primary ratio.
- failureRate still independently affects health/P95.

### Observability

Verify:

- BASIC exposes aggregate metrics for every player-owned topology node and hides resource detail.
- external service is omitted from operational capacity metrics.
- out-of-topology load snapshots are omitted.
- BASIC headline uses the true topology-scoped global pressure.
- METRICS exposes every current player-owned resource.
- APM keeps the same resource visibility but adds contextual diagnosis.

### Diagnosis

Verify:

- selected APP chooses CPU or I/O by hottest ratio.
- selected DB chooses CPU or I/O by hottest ratio.
- Redis signal is Redis throughput, not DB I/O.
- ALB signal is ALB throughput, not APP.
- unknown/out-of-topology selection does not borrow a same-kind node.
- generic fallback exists for an otherwise unknown owned node/resource combination.

### Alerts

Verify:

- overloaded ALB creates a load alert.
- overloaded Redis creates a load alert.
- one load alert is emitted per overloaded node using its hottest resource.
- APP/DB/Queue/Storage alerts remain available.
- out-of-topology decoys cannot create service alerts.

### Feature impact

Verify:

- generic before/after resource matching includes ALB and Redis when their pressure changes.
- top projected bottleneck is selected generically within the service topology.
- request failure preview remains intact.

### Regression gate

Before merge run:

```bash
npm test
npm run typecheck
npm run build
```

## Definition of done

The feature is complete when all of the following are true:

1. There is one Core operational pressure model for all player-owned resource loads.
2. No global bottleneck enum needs one member per product/resource combination.
3. ALB and Redis participate in the same bottleneck selection as APP/DB/Queue/Storage.
4. Future owned node resources can participate without adding another hard-coded candidate list.
5. Growth uses the same generic global pressure model.
6. Service Health and P95 use the same generic pressure model scoped to the supplied service topology.
7. BASIC observability uses node aggregate loads for every owned topology node.
8. METRICS uses actual resource lists for every owned topology node.
9. Selected-node diagnosis uses the hottest resource inside that node.
10. Load alerts and feature release impact previews no longer omit ALB/Redis or future owned resources because of fixed axis lists.
11. Service-facing projections ignore out-of-topology decoy loads.
12. Resource overload does not directly mutate/generate request `failureRate` in this feature.
13. Existing unrelated gameplay behavior remains regression-green.
14. Full tests, typecheck, and production build pass before merge.
