# Phase 8 Node Load Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining flat App/DB/Async/Storage load and legacy request-flow contracts with exact per-node resource loads and canonical request traces without changing gameplay or rendering.

**Architecture:** `LoadCalculator` publishes immutable resource measurements inside exact topology nodes. Pure Core queries feed growth and Application projection; `RequestTrace` becomes the only request-path result. Application attaches exact node IDs to health, metrics, alerts, and previews while React remains a DTO-only renderer.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, React 19, Next.js 16

**Spec:** `docs/superpowers/specs/2026-08-28-phase-8-node-load-contract-design.md`

## Global Constraints

- Every shell command is prefixed with `rtk`.
- Use strict TDD: observe the named RED failure before production implementation.
- Preserve all current feature weights, capacity values, proficiency tuning, technology effects, incident effects, growth penalties, and economic balance.
- Preserve player-visible copy, alert order, observability unlocks, Service Map nodes/edges/traces, particle paths, and animation timing.
- React View depends only on Application contracts and commands; it never imports Core or a projector.
- `RequestTrace` is the only simulated request-path result after Phase 8.
- `LoadSnapshot` contains only `failureRate`, `nodeLoads`, and `requestTraces` after Phase 8.
- A Node may own several resources; `nodeKind` and `resourceKind` are distinct concepts.
- Missing optional infrastructure contributes zero pressure without creating a phantom node. Missing required V1 Server Group, Database, Object Storage, or resource measurement fails fast.
- Internal Blueprint routes remain game-owned. Do not add Module creation, workload assignment commands, route editing, binding editing, or related UI.
- Keep `RequestNodeViewKind` and the route-authoring vocabulary required by `FeatureDefinition`.
- Preserve `GameProgressionProjector` whole-snapshot serialization plus load-identity freshness guard.
- Preserve the user's existing main-checkout changes in `next-env.d.ts`, `next.config.ts`, `tsconfig.json`, and untracked `package-lock.json`.
- Commit only the files named by each task; do not revert or absorb unrelated edits.

---

### Task 1: Canonical node-resource contract and queries

**Files:**
- Create: `src/core/node-load.ts`
- Create: `src/core/__tests__/node-load-contract.spec.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- Produces: `NodeResourceKind`, `NodeResourceLoad`, `NodeLoadSnapshot`, `LoadValidationError`, `createNodeResourceLoad`, `createNodeLoadSnapshot`, `nodeLoad`, `resourceLoad`, `nodeLoadsOfKind`, `maxNodeLoad`, and `maxResourceLoad`.
- Consumes: `InfrastructureNodeId` and `InfrastructureNodeKind` from `src/core/topology.ts`.

- [ ] **Step 1: Write the failing contract tests**

Create `node-load-contract.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  maxNodeLoad,
  maxResourceLoad,
  nodeLoad,
  nodeLoadsOfKind,
  resourceLoad,
} from '../node-load';

describe('node load contract', () => {
  it('stores several normalized resources and derives the node bottleneck', () => {
    const load = createNodeLoadSnapshot('app-a', 'SERVER_GROUP', [
      createNodeResourceLoad('IO', 90, 100),
      createNodeResourceLoad('CPU', 60, 100),
    ]);

    expect(load.resources.map(({ resourceKind }) => resourceKind)).toEqual(['CPU', 'IO']);
    expect(load.resources[0]).toMatchObject({ demand: 60, capacity: 100, ratio: 0.6 });
    expect(load.loadRatio).toBe(0.9);
    expect(Object.isFrozen(load)).toBe(true);
    expect(Object.isFrozen(load.resources)).toBe(true);
  });

  it('keeps empty-resource nodes at zero and rejects duplicate resource kinds', () => {
    expect(createNodeLoadSnapshot('external', 'EXTERNAL_SERVICE', []).loadRatio).toBe(0);
    expect(() => createNodeLoadSnapshot('app-a', 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 1, 10),
      createNodeResourceLoad('CPU', 2, 10),
    ])).toThrowError(expect.objectContaining({ code: 'DUPLICATE_NODE_RESOURCE_KIND' }));
  });

  it('queries exact nodes and uses input order to break equal-pressure ties', () => {
    const first = createNodeLoadSnapshot('app-a', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 8, 10)]);
    const second = createNodeLoadSnapshot('app-b', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 4, 5)]);
    const database = createNodeLoadSnapshot('db-a', 'DATABASE', [createNodeResourceLoad('IO', 9, 10)]);
    const load = { failureRate: 0, nodeLoads: [first, second, database], requestTraces: [] };

    expect(nodeLoad(load, 'app-b')).toBe(second);
    expect(resourceLoad(first, 'CPU')?.ratio).toBe(0.8);
    expect(nodeLoadsOfKind(load, 'SERVER_GROUP')).toEqual([first, second]);
    expect(maxNodeLoad(load, { nodeKind: 'SERVER_GROUP' })).toBe(first);
    expect(maxResourceLoad(load, { nodeKind: 'DATABASE', resourceKind: 'IO' })).toEqual({
      node: database,
      resource: database.resources[0],
    });
  });
});
```

- [ ] **Step 2: Run the direct test and verify RED**

Run:

```bash
rtk npm test -- src/core/__tests__/node-load-contract.spec.ts
```

Expected: FAIL because `src/core/node-load.ts` does not exist.

- [ ] **Step 3: Implement the immutable contract and queries**

Create `node-load.ts` with these exact public shapes:

```ts
import type { InfrastructureNodeId, InfrastructureNodeKind } from './topology';

export const NODE_RESOURCE_KINDS = ['CPU', 'IO', 'THROUGHPUT', 'STORAGE'] as const;
export type NodeResourceKind = typeof NODE_RESOURCE_KINDS[number];

export interface NodeResourceLoad {
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly capacity: number;
  readonly ratio: number;
}

export interface NodeLoadSnapshot {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resources: readonly NodeResourceLoad[];
  readonly loadRatio: number;
}

export class LoadValidationError extends Error {
  constructor(readonly code: 'DUPLICATE_NODE_RESOURCE_KIND', message: string) {
    super(message);
    this.name = 'LoadValidationError';
  }
}

export interface NodeLoadCollection {
  readonly nodeLoads: readonly NodeLoadSnapshot[];
}

export function createNodeResourceLoad(
  resourceKind: NodeResourceKind,
  demand: number,
  capacity: number,
): NodeResourceLoad {
  return Object.freeze({
    resourceKind,
    demand,
    capacity,
    ratio: capacity > 0 ? demand / capacity : 0,
  });
}

export function createNodeLoadSnapshot(
  nodeId: InfrastructureNodeId,
  nodeKind: InfrastructureNodeKind,
  resources: readonly NodeResourceLoad[],
): NodeLoadSnapshot {
  const seen = new Set<NodeResourceKind>();
  for (const resource of resources) {
    if (seen.has(resource.resourceKind)) {
      throw new LoadValidationError(
        'DUPLICATE_NODE_RESOURCE_KIND',
        `Node ${nodeId} contains duplicate ${resource.resourceKind} resource load`,
      );
    }
    seen.add(resource.resourceKind);
  }
  const order = new Map(NODE_RESOURCE_KINDS.map((kind, index) => [kind, index]));
  const normalized = Object.freeze([...resources].sort((left, right) => (
    order.get(left.resourceKind)! - order.get(right.resourceKind)!
  )));
  return Object.freeze({
    nodeId,
    nodeKind,
    resources: normalized,
    loadRatio: Math.max(0, ...normalized.map(({ ratio }) => ratio)),
  });
}
```

Implement `createNodeLoadSnapshot` by rejecting duplicates, sorting a copied resource array by `NODE_RESOURCE_KINDS`, freezing it, and deriving `loadRatio` with `Math.max(0, ...resources.map(({ ratio }) => ratio))`. Do not accept a caller-provided `loadRatio`.

Implement the queries with immutable traversal only:

```ts
export function nodeLoad(load: NodeLoadCollection, nodeId: InfrastructureNodeId): NodeLoadSnapshot | undefined;
export function resourceLoad(node: NodeLoadSnapshot, resourceKind: NodeResourceKind): NodeResourceLoad | undefined;
export function nodeLoadsOfKind(load: NodeLoadCollection, nodeKind: InfrastructureNodeKind): readonly NodeLoadSnapshot[];
export function maxNodeLoad(
  load: NodeLoadCollection,
  filter?: { readonly nodeKind?: InfrastructureNodeKind },
): NodeLoadSnapshot | undefined;
export function maxResourceLoad(
  load: NodeLoadCollection,
  filter?: {
    readonly nodeKind?: InfrastructureNodeKind;
    readonly resourceKind?: NodeResourceKind;
  },
): { readonly node: NodeLoadSnapshot; readonly resource: NodeResourceLoad } | undefined;
```

Use strict `>` comparisons when selecting a maximum so the first topology/resource entry wins ties.

Export the new module from `src/core/index.ts`.

- [ ] **Step 4: Run contract regressions**

Run:

```bash
rtk npm test -- src/core/__tests__/node-load-contract.spec.ts src/core/__tests__/topology.spec.ts
rtk npm run typecheck
```

Expected: both test files PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
rtk git add src/core/node-load.ts src/core/__tests__/node-load-contract.spec.ts src/core/index.ts
rtk git commit -m "feat: define node resource load contract"
```

---

### Task 2: Publish node resources from LoadCalculator with parity coverage

**Files:**
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/index.ts`
- Modify: `src/core/__tests__/node-load.spec.ts`
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`
- Modify: `src/application/topology-view-projector.ts`
- Modify: `src/application/__tests__/topology-view-projector.spec.ts`

**Interfaces:**
- Consumes: Task 1's `NodeLoadSnapshot`, `createNodeResourceLoad`, and `createNodeLoadSnapshot`.
- Produces: `LoadSnapshot.nodeLoads` with exact `nodeKind`, normalized resources, and derived `loadRatio` while temporarily retaining legacy flat fields for migration comparison.

- [ ] **Step 1: Add failing node-resource parity assertions**

Replace the first node-load test's flat-only assertions with dual parity assertions:

```ts
const appCpu = app.resources.find(({ resourceKind }) => resourceKind === 'CPU');
const appIo = app.resources.find(({ resourceKind }) => resourceKind === 'IO');
const dbCpu = db.resources.find(({ resourceKind }) => resourceKind === 'CPU');
const dbIo = db.resources.find(({ resourceKind }) => resourceKind === 'IO');

expect(app.nodeKind).toBe('SERVER_GROUP');
expect(appCpu).toMatchObject({ demand: load.appCpuDemand, capacity: load.appCpuCapacity });
expect(appCpu?.ratio).toBeCloseTo(load.appCpuRatio);
expect(appIo).toMatchObject({ demand: load.appIoDemand, capacity: load.appIoCapacity });
expect(appIo?.ratio).toBeCloseTo(load.appIoRatio);
expect(app.loadRatio).toBeCloseTo(load.appRatio);
expect(dbCpu?.ratio).toBeCloseTo(load.dbCpuRatio);
expect(dbIo?.ratio).toBeCloseTo(load.dbIoRatio);
expect(db.loadRatio).toBeCloseTo(load.dbRatio);
expect(maxNodeLoad(load)?.loadRatio).toBeCloseTo(Math.max(
  load.appRatio,
  load.dbRatio,
  load.asyncRatio,
  load.storageRatio,
));
```

Extend the topology-node test with exact resource-kind expectations:

```ts
expect(gateway.resources.map(({ resourceKind }) => resourceKind)).toEqual(['THROUGHPUT']);
expect(queue.resources.map(({ resourceKind }) => resourceKind)).toEqual(['THROUGHPUT']);
expect(storage.resources.map(({ resourceKind }) => resourceKind)).toEqual(['STORAGE']);
expect(external.resources).toEqual([]);
```

Add a Redis assertion in `infrastructure-load.spec.ts` that its Cache node owns one `THROUGHPUT` resource whose ratio equals the legacy DB pressure used by the existing Redis calculation:

```ts
const cache = load.nodeLoads.find(({ nodeKind }) => nodeKind === 'CACHE');
expect(cache?.resources).toHaveLength(1);
expect(cache?.resources[0]).toMatchObject({ resourceKind: 'THROUGHPUT' });
expect(cache?.resources[0].ratio).toBeCloseTo(load.dbRatio);
```

- [ ] **Step 2: Run the calculator tests and verify RED**

Run:

```bash
rtk npm test -- src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts
```

Expected: FAIL because current node loads do not have `nodeKind` or `resources`.

- [ ] **Step 3: Build node loads through the Task 1 factories**

Import the contract from `./node-load` and remove the local `NodeLoadSnapshot` declaration from `infrastructure.ts`. In the same change, export the canonical `NodeLoadSnapshot` type from `src/core/index.ts`; this intentionally completes the barrel-export requirement deferred from Task 1 because the legacy declaration currently owns that name. Keep the legacy flat fields in `LoadSnapshot` until Task 6.

Migrate the existing topology view consumer in the same atomic contract change: derive its displayed capacity as the maximum capacity across `load.resources`, retaining the graph-capacity fallback when no node load exists, and rebuild its test fixtures with the canonical factories. This is a representation-only adaptation; preserve all rendered values, topology filtering, trace behavior, and copy.

Inside the existing `topology.graph.nodes.map`, construct these resources without changing any formula:

```ts
if (node.id === appNodeId) return createNodeLoadSnapshot(node.id, node.kind, [
  createNodeResourceLoad('CPU', appCpuDemand, appCpuCapacity),
  createNodeResourceLoad('IO', appIoDemand, appIoCapacity),
]);

if (node.id === databaseNodeId) return createNodeLoadSnapshot(node.id, node.kind, [
  createNodeResourceLoad('CPU', dbCpuDemand, dbCpuCapacity),
  createNodeResourceLoad('IO', dbIoDemand, dbIoCapacity),
]);

if (node.kind === 'QUEUE') return createNodeLoadSnapshot(node.id, node.kind, [
  createNodeResourceLoad('THROUGHPUT', asyncDemand, asyncCapacity),
]);

if (node.kind === 'OBJECT_STORAGE') return createNodeLoadSnapshot(node.id, node.kind, [
  createNodeResourceLoad('STORAGE', storageDemand, storageCapacity),
]);
```

Use the existing gateway demand/capacity and cache demand/effective-capacity expressions for `LOAD_BALANCER` and `CACHE` throughput. Return `createNodeLoadSnapshot(node.id, node.kind, [])` for other nodes.

- [ ] **Step 4: Run calculation and engine regressions**

Run:

```bash
rtk npm test -- src/core/__tests__/node-load-contract.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/game-engine.spec.ts src/core/__tests__/incident-topology.spec.ts
rtk npm run typecheck
```

Expected: all tests PASS with both representations numerically identical.

- [ ] **Step 5: Commit**

```bash
rtk git add src/core/infrastructure.ts src/core/index.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/application/topology-view-projector.ts src/application/__tests__/topology-view-projector.spec.ts
rtk git commit -m "refactor: publish per-node resource loads"
```

---

### Task 3: Project operational health from exact node resources

**Files:**
- Modify: `src/application/game-view.ts`
- Modify: `src/application/operational-view-projector.ts`
- Modify: `src/application/__tests__/operational-view-projector.spec.ts`
- Modify: `src/ui/ServiceDashboard.tsx`
- Modify: `src/ui/ReportPanel.tsx`

**Interfaces:**
- Consumes: Task 1's node/resource queries and Task 2's populated resources.
- Produces: `LoadMetricView.id`, nullable `LoadMetricView.nodeId`, `ServiceHealthView.bottleneckNodeId`, and node-based health/diagnosis with unchanged visible output.

- [ ] **Step 1: Add failing Application contract assertions**

In `operational-view-projector.spec.ts`, use a real `GameEngine` snapshot and assert exact metadata:

```ts
const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
const service = OperationalViewProjector.project(engine.snapshot, engine.developer);

expect(service.visibleLoads.map(({ id, nodeId, label }) => ({ id, nodeId, label }))).toEqual([
  { id: 'v1:app:SPRING_BOOT:load', nodeId: 'v1:app:SPRING_BOOT', label: 'APP' },
  { id: 'v1:database:POSTGRESQL:load', nodeId: 'v1:database:POSTGRESQL', label: 'DB' },
  { id: 'optional:QUEUE:THROUGHPUT', nodeId: null, label: 'ASYNC' },
  { id: 'v1:storage:OBJECT_STORAGE:load', nodeId: 'v1:storage:OBJECT_STORAGE', label: 'STORAGE' },
]);
expect(service.health.bottleneckNodeId).toBeNull();
```

Add an exact-node bottleneck and diagnosis test:

```ts
const base = engine.snapshot;
const appId = 'v1:app:SPRING_BOOT';
const dbId = 'v1:database:POSTGRESQL';
const overloadedApp = createNodeLoadSnapshot(appId, 'SERVER_GROUP', [
  createNodeResourceLoad('CPU', 120, 100),
  createNodeResourceLoad('IO', 40, 100),
]);
const quietDatabase = createNodeLoadSnapshot(dbId, 'DATABASE', [
  createNodeResourceLoad('CPU', 10, 100),
  createNodeResourceLoad('IO', 20, 100),
]);
const snapshot = {
  ...base,
  load: {
    ...base.load,
    nodeLoads: base.load.nodeLoads.map((node) => node.nodeId === appId
      ? overloadedApp
      : node.nodeId === dbId ? quietDatabase : node),
  },
};
const projected = OperationalViewProjector.project(snapshot, engine.developer);

expect(projected.health).toMatchObject({
  bottleneck: 'APP_CPU', bottleneckPercent: 120, bottleneckNodeId: appId,
});
expect(OperationalViewProjector.diagnosisText(appId, snapshot, engine.developer)).toContain('APP CPU 120%');
```

Existing screen tests remain unchanged and verify both metric-rendering call sites after React keys switch from label to ID.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
rtk npm test -- src/application/__tests__/operational-view-projector.spec.ts src/ui/__tests__/game-screens.spec.tsx
```

Expected: FAIL because the Application DTOs lack `id`, `nodeId`, and `bottleneckNodeId`.

- [ ] **Step 3: Replace flat-field projection with node queries**

Update the DTOs:

```ts
export interface LoadMetricView {
  readonly id: string;
  readonly nodeId: string | null;
  readonly label: string;
  readonly percent: number;
  readonly tone: LoadTone;
}

export interface ServiceHealthView {
  readonly status: ServiceHealthStatusView;
  readonly p95LatencyMs: number;
  readonly bottleneck: BottleneckView;
  readonly bottleneckLabel: string;
  readonly bottleneckPercent: number;
  readonly bottleneckNodeId: string | null;
}
```

In `OperationalViewProjector`, create bottleneck candidates from exact node resources. Map Server CPU/I/O, Database CPU/I/O, Queue throughput, and Object Storage storage to the existing `BottleneckView` values and labels. Preserve current threshold comparisons and use strict `>` so topology order wins ties.

For BASIC visible metrics, use each App/DB node's `loadRatio`, Queue throughput, and Storage storage. For METRICS/APM, expose App/DB CPU and I/O plus Queue and Storage. Preserve current V1 order. When Queue is absent, emit `{ id: 'optional:QUEUE:THROUGHPUT', nodeId: null, label: 'ASYNC', percent: 0, tone: 'stable' }`.

Make `diagnose(nodeId, snapshot)` call `nodeLoad(snapshot.load, nodeId)` and inspect that exact node's resources. Keep the existing visible signal labels and suggestions, but remove all node-ID-prefix selection of load fields. Throw `Error('Missing load for topology node: ' + nodeId)` when a diagnosis targets a topology node without a node-load entry.

Change `LoadMini` keys in `ServiceDashboard.tsx` and `ReportPanel.tsx` from `metric.label` to `metric.id`. Do not change rendered markup or copy.

- [ ] **Step 4: Run operational, boundary, and UI regressions**

Run:

```bash
rtk npm test -- src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/game-service-projector.spec.ts src/application/__tests__/view-boundary.spec.ts src/ui/__tests__/game-screens.spec.tsx
rtk npm run typecheck
```

Expected: all tests PASS and UI/Core import boundaries remain intact.

- [ ] **Step 5: Commit**

```bash
rtk git add src/application/game-view.ts src/application/operational-view-projector.ts src/application/__tests__/operational-view-projector.spec.ts src/ui/ServiceDashboard.tsx src/ui/ReportPanel.tsx
rtk git commit -m "refactor: project operations from node resources"
```

---

### Task 4: Migrate alerts and previews to exact node queries

**Files:**
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/game-progression-projector.ts`
- Modify: `src/application/__tests__/game-service-projector.spec.ts`
- Modify: `src/application/__tests__/game-progression-projector.spec.ts`
- Modify: `src/application/__tests__/game-event-projector.spec.ts`
- Modify: `src/ui/ServiceDashboard.tsx`

**Interfaces:**
- Consumes: node/resource queries, exact Application metric metadata, `LoadSnapshot.requestTraces`.
- Produces: exact-node load alerts, request-failure alerts, feature-impact previews, technology previews, and a UI that uses only supplied alert node IDs.

- [ ] **Step 1: Add failing exact-node and parity regressions**

Add these assertions to `game-service-projector.spec.ts`. Launch a real engine, copy its snapshot, replace only the database node load with a factory-built CPU ratio above `1`, and replace the bootstrap trace with a frozen copy whose `successRatio` is `0` and `failureNodeId` is the exact database node ID. Pass that internally consistent snapshot to the service projector:

```ts
const databaseNodeId = 'v1:database:POSTGRESQL';
const database = nodeLoad(snapshot.load, databaseNodeId)!;
const overloadedDatabase = createNodeLoadSnapshot(database.nodeId, database.nodeKind, [
  createNodeResourceLoad('CPU', 120, 100),
  createNodeResourceLoad('IO', 80, 100),
]);
const failedTrace = Object.freeze({
  ...snapshot.load.requestTraces[0],
  nodes: Object.freeze(snapshot.load.requestTraces[0].nodes.map((node) => node.nodeId === databaseNodeId
    ? Object.freeze({ ...node, passThroughRatio: 0, status: 'FAILED' as const })
    : node)),
  successRatio: 0,
  failureNodeId: databaseNodeId,
});
const failedSnapshot = {
  ...snapshot,
  load: {
    ...snapshot.load,
    failureRate: 1,
    nodeLoads: snapshot.load.nodeLoads.map((load) => load.nodeId === databaseNodeId ? overloadedDatabase : load),
    requestTraces: [failedTrace],
  },
};
const result = new GameServiceProjector(engine).project(failedSnapshot, {
  monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0,
});

const databaseAlert = result.alerts.find(({ id }) => id === 'load-Database');
expect(databaseAlert?.nodeId).toBe(databaseNodeId);

const requestFailure = result.alerts.find(({ id }) => id === 'request-failure');
expect(requestFailure).toMatchObject({
  title: expect.stringMatching(/^Request Failure \d+%$/),
  nodeId: result.topology.traces.find(({ successPercent }) => successPercent < 100)?.failureNodeId,
});
```

Extend the feature-impact/event test so its returned `nodeId`, when present, equals an exact `result.topology.nodes[].id` rather than `application`, `database`, `queue`, or `storage`.

```ts
const impact = serviceProjector.featureImpact('COMMENT');
const current = serviceProjector.project(engine.snapshot, {
  monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0,
});
if (impact?.nodeId) {
  expect(current.topology.nodes.some(({ id }) => id === impact.nodeId)).toBe(true);
  expect(['application', 'database', 'queue', 'storage']).not.toContain(impact.nodeId);
}
```

In `game-progression-projector.spec.ts`, preserve the literal Redis and queue preview strings and exact percentages produced by the real current engine snapshot. The final Task 6 type removal proves these paths no longer compile against flat fields; do not bypass the projector's current-snapshot guard with a fabricated snapshot.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
rtk npm test -- src/application/__tests__/game-service-projector.spec.ts src/application/__tests__/game-progression-projector.spec.ts src/application/__tests__/game-event-projector.spec.ts
```

Expected: FAIL because load and feature-impact alerts still publish generic node IDs.

- [ ] **Step 3: Replace alert and preview axis reads**

In `GameServiceProjector`:

- build the current V1 alert groups from `nodeLoadsOfKind` in Application, Database, Queue, Storage order;
- use exact node `loadRatio` for Server and Database, Queue throughput for Async, and Storage resource ratio for Storage;
- retain current V1 alert IDs (`load-Application`, `load-Database`, `load-Async`, `load-Storage`), titles, thresholds, penalty calculations, and ordering;
- target each alert with the exact node ID;
- derive failed workloads from `snapshot.load.requestTraces.filter(({ successRatio }) => successRatio < 0.999)`;
- label them with `trace.workloadId` and target the first non-null `failureNodeId`.

Replace feature-impact axes with this query rule:

```ts
function pressure(
  load: LoadSnapshot,
  nodeKind: InfrastructureNodeKind,
  resourceKind?: NodeResourceKind,
): { readonly ratio: number; readonly nodeId?: string } {
  const match = resourceKind
    ? maxResourceLoad(load, { nodeKind, resourceKind })
    : maxNodeLoad(load, { nodeKind });
  if (!match) return { ratio: 0 };
  return 'resource' in match
    ? { ratio: match.resource.ratio, nodeId: match.node.nodeId }
    : { ratio: match.loadRatio, nodeId: match.nodeId };
}
```

Use the after node ID, falling back to the before node ID, in `FeatureImpactPreview`. Queue replacement therefore compares by `nodeKind` while returning the newly deployed exact queue ID.

In `GameProgressionProjector`, replace DB/App/Async/Storage flat comparisons with the same Core query semantics. Preserve these visible formats literally:

- `DB N% → N%` for Redis;
- `App N% → N% · Async 분리` for queues when failure recovery is not the leading message;
- `실패율 N% → N% · 요청 경로 복구` when applicable.

In `ServiceDashboard.tsx`, replace `topologyNodeIdForAlert` with exact lookup only:

```ts
function topologyNodeIdForAlert(view: GameView, alertNodeId: string | undefined): string | null {
  if (!alertNodeId) return null;
  return view.topology.nodes.some(({ id }) => id === alertNodeId) ? alertNodeId : null;
}
```

- [ ] **Step 4: Run service, progression, event, controller, and UI regressions**

Run:

```bash
rtk npm test -- src/application/__tests__/game-service-projector.spec.ts src/application/__tests__/game-progression-projector.spec.ts src/application/__tests__/game-event-projector.spec.ts src/application/__tests__/game-controller.spec.ts src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/topology-map.spec.tsx
rtk npm run typecheck
```

Expected: all tests PASS with exact node IDs and unchanged visible literals.

- [ ] **Step 5: Commit**

```bash
rtk git add src/application/game-service-projector.ts src/application/game-progression-projector.ts src/application/__tests__/game-service-projector.spec.ts src/application/__tests__/game-progression-projector.spec.ts src/application/__tests__/game-event-projector.spec.ts src/ui/ServiceDashboard.tsx
rtk git commit -m "refactor: target exact nodes in load projections"
```

---

### Task 5: Remove the parallel request-flow model

**Files:**
- Create: `src/core/request-route.ts`
- Modify: `src/core/feature.ts`
- Modify: `src/core/v1-topology.ts`
- Modify: `src/core/request-trace.ts`
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/index.ts`
- Modify: `src/core/__tests__/request-trace.spec.ts`
- Modify: `src/core/__tests__/node-load.spec.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`
- Delete: `src/core/request-flow.ts`
- Delete: `src/core/__tests__/request-flow.spec.ts`

**Interfaces:**
- Produces: route-authoring types from `request-route.ts`; canonical trace types, simulator, `NodeHealth`, and `trafficHealthForSeverity` from `request-trace.ts`.
- Removes: `RequestFlowEnvironment`, `RequestFlowNodeResult`, `RequestFlowResult`, `RequestFlowSimulator`, `LegacyRequestFlowProjector`, and `LoadSnapshot.requestFlows`.

- [ ] **Step 1: Strengthen canonical trace tests before deleting legacy coverage**

Add direct cases to `request-trace.spec.ts` for the behavior currently covered only by `request-flow.spec.ts`:

```ts
it('keeps a missing optional step visible without reducing success', () => {
  const trace = RequestTraceSimulator.simulate({
    workloadId: 'premium', moduleId: 'community',
    steps: [
      { stepId: 'app', role: 'ENTRY_APP', requirement: 'REQUIRED', nodeId: 'app' },
      { stepId: 'queue', role: 'EVENT_BUS', requirement: 'OPTIONAL', nodeId: null },
      { stepId: 'db', role: 'PRIMARY_DATABASE', requirement: 'REQUIRED', nodeId: 'db' },
    ],
    edges: [{ blueprintEdgeId: 'app-queue+queue-db', topologyEdgeId: 'app-db', fromNodeId: 'app', toNodeId: 'db', mode: 'ASYNC' }],
  });

  expect(trace.successRatio).toBe(1);
  expect(trace.failureNodeId).toBeNull();
  expect(trace.nodes[1]).toMatchObject({ status: 'MISSING', nodeId: null });
  expect(trace.edges).toContainEqual({ edgeId: 'app-db', trafficRatio: 1 });
});

it('maps incident severity to canonical node health', () => {
  expect(trafficHealthForSeverity('MINOR')).toBe(0.8);
  expect(trafficHealthForSeverity('MAJOR')).toBe(0.4);
  expect(trafficHealthForSeverity('CRITICAL')).toBe(0);
});
```

Change `node-load.spec.ts` and `game-engine.spec.ts` assertions to inspect only `requestTraces`, including required missing, optional missing, failure, and recovery cases.

- [ ] **Step 2: Run canonical tests before removal**

Run:

```bash
rtk npm test -- src/core/__tests__/request-trace.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/game-engine.spec.ts
```

Expected: PASS, proving canonical coverage exists before the parallel model is deleted.

- [ ] **Step 3: Add a failing contract-absence assertion**

In `node-load.spec.ts`, add:

```ts
expect(Object.hasOwn(load, 'requestFlows')).toBe(false);
```

Run:

```bash
rtk npm test -- src/core/__tests__/node-load.spec.ts
```

Expected: FAIL because `LoadCalculator` still publishes `requestFlows`.

- [ ] **Step 4: Split route vocabulary and delete the legacy model**

Create `request-route.ts` containing only:

```ts
export type RequestNodeKind = 'ALB' | 'APP' | 'DB' | 'CACHE' | 'QUEUE' | 'STORAGE' | 'AI';
export type RequestRequirement = 'REQUIRED' | 'OPTIONAL';

export interface RequestRouteStep {
  readonly node: RequestNodeKind;
  readonly requirement?: RequestRequirement;
}
```

Update `feature.ts` and `v1-topology.ts` imports to `request-route.ts`. Move `trafficHealthForSeverity` into `request-trace.ts` and update `game-engine.ts`.

Delete `legacyNodeForRole` and `LegacyRequestFlowProjector` from `request-trace.ts`. Remove request-flow imports, calculation, type field, and returned value from `infrastructure.ts`. Replace the Core index export of `request-flow` with `request-route`.

Delete `request-flow.ts` and `request-flow.spec.ts` only after `rtk rg -n "RequestFlowResult|RequestFlowSimulator|LegacyRequestFlowProjector|requestFlows" src --glob '!**/__tests__/**'` shows no remaining production consumer other than the files being removed.

- [ ] **Step 5: Run request, topology, engine, Application, and type regressions**

Run:

```bash
rtk npm test -- src/core/__tests__/request-trace.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/v1-topology.spec.ts src/core/__tests__/game-engine.spec.ts src/application/__tests__/game-service-projector.spec.ts
rtk npm run typecheck
rtk rg -n "RequestFlowResult|RequestFlowSimulator|LegacyRequestFlowProjector|requestFlows" src --glob '!**/__tests__/**'
```

Expected: tests and typecheck PASS; the final `rg` exits 1 with no matches.

- [ ] **Step 6: Commit**

```bash
rtk git add src/core/request-route.ts src/core/feature.ts src/core/v1-topology.ts src/core/request-trace.ts src/core/infrastructure.ts src/core/game-engine.ts src/core/index.ts src/core/__tests__/request-trace.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/game-engine.spec.ts src/core/request-flow.ts src/core/__tests__/request-flow.spec.ts
rtk git commit -m "refactor: remove legacy request flow model"
```

---

### Task 6: Remove flat load fields and verify the complete migration

**Files:**
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`
- Modify: `src/core/__tests__/node-load.spec.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`
- Modify: `src/application/__tests__/operational-view-projector.spec.ts`
- Modify: `src/application/__tests__/game-service-projector.spec.ts`
- Modify: `src/application/__tests__/game-progression-projector.spec.ts`

**Interfaces:**
- Consumes: all Phase 8 node-load contracts and migrated consumers.
- Produces: final `LoadSnapshot { failureRate, nodeLoads, requestTraces }` with no flat demand/capacity/ratio compatibility fields.

- [ ] **Step 1: Add the final contract and seeded-policy assertions**

In `node-load.spec.ts`, assert the final key set:

```ts
expect(Object.keys(load).sort()).toEqual(['failureRate', 'nodeLoads', 'requestTraces']);
```

In `game-engine.spec.ts`, preserve the existing seeded launch, growth-bonus, scale, technology, and incident assertions. Task 2 already proves `maxNodeLoad(load)?.loadRatio` equals the old maximum of App/DB/Async/Storage ratios before the fields are removed; keep that parity assertion until this task deletes the flat fields.

Replace remaining test reads such as `load.appCpuRatio` with exact queries:

```ts
const app = maxNodeLoad(load, { nodeKind: 'SERVER_GROUP' });
const appCpu = app && resourceLoad(app, 'CPU');
expect(appCpu?.ratio).toBeCloseTo(expectedRatio);
```

- [ ] **Step 2: Run the final contract test and verify RED**

Run:

```bash
rtk npm test -- src/core/__tests__/node-load.spec.ts src/core/__tests__/game-engine.spec.ts
```

Expected: FAIL because `LoadSnapshot` still returns legacy flat fields.

- [ ] **Step 3: Remove flat publication and migrate the growth policy input**

Reduce `LoadSnapshot` to:

```ts
export interface LoadSnapshot {
  readonly failureRate: number;
  readonly nodeLoads: readonly NodeLoadSnapshot[];
  readonly requestTraces: readonly RequestTrace[];
}
```

Keep local `LoadCalculator` demand, capacity, and ratio variables because they implement the unchanged formulas, but return only:

```ts
return Object.freeze({
  failureRate: Math.max(0, Math.min(1, failureRate)),
  nodeLoads: Object.freeze(nodeLoads),
  requestTraces: Object.freeze(requestTraces),
});
```

Change `GameEngine.advanceGrowth()` to:

```ts
const maxLoadRatio = maxNodeLoad(this._load)?.loadRatio ?? 0;
```

Update every remaining Core and Application test fixture to construct node resources through Task 1 factories. Do not add legacy fields to fixtures to satisfy stale tests.

- [ ] **Step 4: Prove no flat production dependency remains**

Run:

```bash
rtk rg -n "appDemand|dbDemand|asyncDemand|storageDemand|rawAppCapacity|rawDbCapacity|rawAsyncCapacity|appCapacity|dbCapacity|asyncCapacity|storageCapacity|appRatio|dbRatio|asyncRatio|storageRatio|appCpuDemand|appIoDemand|dbCpuDemand|dbIoDemand|appCpuCapacity|appIoCapacity|dbCpuCapacity|dbIoCapacity|appCpuRatio|appIoRatio|dbCpuRatio|dbIoRatio" src --glob '!src/core/infrastructure.ts' --glob '!**/__tests__/**'
```

Expected: no production matches. Test matches must be migrated to node/resource query assertions. Local calculation variables inside `infrastructure.ts` are allowed because the formulas still need them; they are not public contract fields.

- [ ] **Step 5: Run focused Phase 8 regressions**

Run:

```bash
rtk npm test -- src/core/__tests__/node-load-contract.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/request-trace.spec.ts src/core/__tests__/game-engine.spec.ts src/core/__tests__/incident-topology.spec.ts src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/game-service-projector.spec.ts src/application/__tests__/game-progression-projector.spec.ts src/application/__tests__/game-event-projector.spec.ts src/application/__tests__/game-controller.spec.ts src/application/__tests__/view-boundary.spec.ts src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/topology-map.spec.tsx
rtk npm run typecheck
```

Expected: all focused tests and typecheck PASS with no visible literal changes.

- [ ] **Step 6: Run full verification**

Run:

```bash
rtk npm test
rtk npm run typecheck
rtk npm run build
rtk git diff --check
rtk git status --short
```

Expected: all tests, typecheck, and production build PASS. If Next rewrites `next-env.d.ts` or `tsconfig.json`, inspect the generated diff, restore only those generated changes with `apply_patch`, rerun `rtk npm run typecheck`, and confirm the worktree contains only intended Phase 8 files.

- [ ] **Step 7: Commit**

```bash
rtk git add src/core/infrastructure.ts src/core/game-engine.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/game-engine.spec.ts src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/game-service-projector.spec.ts src/application/__tests__/game-progression-projector.spec.ts
rtk git commit -m "refactor: remove flat load compatibility fields"
```

- [ ] **Step 8: Request independent full-range review**

Review the complete range from the Phase 8 design commit through `HEAD` against the design and this plan. Fix every Critical and Important finding in a separate commit, rerun full verification, and re-review the fix range before offering branch integration.
