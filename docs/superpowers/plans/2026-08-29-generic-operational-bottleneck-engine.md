# Generic Operational Bottleneck Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every player-owned infrastructure resource participate in one generic bottleneck model shared by Growth, Service Health/P95, observability, diagnosis, load alerts, and feature-impact previews.

**Architecture:** Add a small Core `operational-pressure` module that converts generic `NodeLoadSnapshot.resources` into topology-scopable `OperationalPressure` records and selects global/node-local primary pressure deterministically. Core Growth consumes the same primary ratio; Application receives the active `ServiceTopology`, scopes pressure to player-owned topology nodes, projects generic bottleneck/metric views, and keeps product-specific labels/recommendations outside Core.

**Tech Stack:** TypeScript, Vitest, Next.js 16, existing Core/Application/UI architecture, GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-08-29-generic-operational-bottleneck-engine-design.md`

## Global Constraints

- Keep CPU, I/O, THROUGHPUT, and STORAGE as distinct Core resource axes; do not collapse them into one universal capacity number.
- `NodeLoadSnapshot.loadRatio` remains the maximum ratio among that node's resources and powers BASIC aggregate load.
- Exclude `EXTERNAL_SERVICE` from operational capacity pressure.
- Application service-facing pressure must be scoped to node IDs present in the supplied `ServiceTopology`; unrelated/decoy loads must never become service bottlenecks.
- Exact ratio ties are deterministic: preserve `nodeLoads` order, then resource order, and keep the first equal-ratio candidate.
- Overload affects bottleneck selection, P95, Service Health, Growth, alerts, and diagnosis; it must not directly create additional request `failureRate` in this change.
- Preserve existing P95 curve constants, Service Health thresholds, Growth penalty formula/caps, observability unlock requirements, incident/failure semantics, traffic-spike logic, progression, revenue, settlement, tech debt, and technology build behavior.
- Remove operational hard-coded APP/DB/Queue/Storage candidate lists touched by this feature; future owned Worker/CDN resource loads must work without new bottleneck enums.
- Use strict TDD: add failing behavior test, observe RED, add minimal production code, observe GREEN, then commit.

---

## File Structure

### Create

- `src/core/operational-pressure.ts` — generic pressure extraction, topology-node scoping, global primary selection, node-local primary selection.
- `src/core/__tests__/operational-pressure.spec.ts` — Core contract and deterministic selection tests.
- `src/application/operational-pressure-presenter.ts` — topology-aware labels and Core-pressure-to-view projection helpers; no Core policy.

### Modify

- `src/core/index.ts` — export the new Core pressure API.
- `src/core/game-engine.ts` — replace node-kind whitelist in Growth capacity input with generic primary operational pressure.
- `src/core/__tests__/game-engine.spec.ts` — integration proof that ALB/Redis pressure can reduce next-day growth and external pressure cannot.
- `src/application/game-view.ts` — replace closed `BottleneckView` union and duplicated health bottleneck fields with generic object shape.
- `src/application/operational-view-projector.ts` — remove `OperationalNodeSelection`; consume `ServiceTopology`, generic BASIC/METRICS metrics, generic Health/P95, node-local generic diagnosis.
- `src/application/game-service-projector.ts` — pass the actual topology into operational projection; generic load alerts; generic feature-impact comparison; expose topology-aware diagnosis delegation.
- `src/application/game-event-projector.ts` — obtain incident diagnosis from `GameServiceProjector` rather than bypassing topology ownership.
- `src/application/__tests__/operational-view-projector.spec.ts` — generic health/metrics/diagnosis tests including ALB, Redis, decoys, observability progression.
- `src/application/__tests__/game-service-projector.spec.ts` — generic alert/feature-impact/topology-scope tests.
- `src/application/__tests__/game-event-projector.spec.ts` — incident diagnosis delegation regression coverage if existing test expectations need migration.
- Any UI test fixture that references the old `ServiceHealthView` bottleneck shape — migrate only as required by typecheck; UI must not reconstruct pressure logic.

---

### Task 1: Core Generic Operational Pressure Analyzer

**Files:**
- Create: `src/core/operational-pressure.ts`
- Create: `src/core/__tests__/operational-pressure.spec.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- Consumes: `NodeLoadCollection`, `NodeLoadSnapshot`, `NodeResourceKind`, `InfrastructureNodeId`, `InfrastructureNodeKind`.
- Produces:

```ts
export interface OperationalPressure {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly capacity: number;
  readonly ratio: number;
}

export interface OperationalPressureScope {
  readonly nodeIds?: ReadonlySet<InfrastructureNodeId>;
}

export function operationalPressures(
  load: NodeLoadCollection,
  scope?: OperationalPressureScope,
): readonly OperationalPressure[];

export function primaryOperationalPressure(
  load: NodeLoadCollection,
  scope?: OperationalPressureScope,
): OperationalPressure | null;

export function operationalPressuresForNode(
  load: NodeLoadCollection,
  nodeId: InfrastructureNodeId,
): readonly OperationalPressure[];

export function primaryOperationalPressureForNode(
  load: NodeLoadCollection,
  nodeId: InfrastructureNodeId,
): OperationalPressure | null;
```

- Unknown node local queries return `[]` and `null` respectively.
- `EXTERNAL_SERVICE` is always excluded even if explicitly present in `scope.nodeIds`.

- [ ] **Step 1: Write failing Core analyzer tests**

Create `src/core/__tests__/operational-pressure.spec.ts` with synthetic node loads proving every current resource axis participates, external is excluded, scope works, ties are stable, and node-local lookup is exact:

```ts
import { describe, expect, it } from 'vitest';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  operationalPressures,
  operationalPressuresForNode,
  primaryOperationalPressure,
  primaryOperationalPressureForNode,
} from '..';

const load = {
  nodeLoads: [
    createNodeLoadSnapshot('alb', 'LOAD_BALANCER', [createNodeResourceLoad('THROUGHPUT', 72, 100)]),
    createNodeLoadSnapshot('app', 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 84, 100),
      createNodeResourceLoad('IO', 61, 100),
    ]),
    createNodeLoadSnapshot('redis', 'CACHE', [createNodeResourceLoad('THROUGHPUT', 113, 100)]),
    createNodeLoadSnapshot('db', 'DATABASE', [
      createNodeResourceLoad('CPU', 66, 100),
      createNodeResourceLoad('IO', 92, 100),
    ]),
    createNodeLoadSnapshot('queue', 'QUEUE', [createNodeResourceLoad('THROUGHPUT', 54, 100)]),
    createNodeLoadSnapshot('storage', 'OBJECT_STORAGE', [createNodeResourceLoad('STORAGE', 31, 100)]),
    createNodeLoadSnapshot('external', 'EXTERNAL_SERVICE', [createNodeResourceLoad('THROUGHPUT', 999, 100)]),
  ],
};

it('selects the hottest resource across every player-owned node', () => {
  expect(primaryOperationalPressure(load)).toMatchObject({
    nodeId: 'redis', resourceKind: 'THROUGHPUT', ratio: 1.13,
  });
  expect(operationalPressures(load).map(({ nodeId, resourceKind }) => `${nodeId}:${resourceKind}`)).toEqual([
    'alb:THROUGHPUT', 'app:CPU', 'app:IO', 'redis:THROUGHPUT',
    'db:CPU', 'db:IO', 'queue:THROUGHPUT', 'storage:STORAGE',
  ]);
});

it('scopes pressure to supplied topology node ids', () => {
  const scope = { nodeIds: new Set(['app', 'db']) };
  expect(primaryOperationalPressure(load, scope)).toMatchObject({ nodeId: 'db', resourceKind: 'IO', ratio: 0.92 });
});

it('keeps the first resource when ratios tie exactly', () => {
  const tied = { nodeLoads: [
    createNodeLoadSnapshot('first', 'SERVER_GROUP', [createNodeResourceLoad('CPU', 100, 100)]),
    createNodeLoadSnapshot('second', 'DATABASE', [createNodeResourceLoad('IO', 100, 100)]),
  ] };
  expect(primaryOperationalPressure(tied)?.nodeId).toBe('first');
});

it('returns exact node-local pressure and safe empty values for unknown nodes', () => {
  expect(primaryOperationalPressureForNode(load, 'app')).toMatchObject({ resourceKind: 'CPU', ratio: 0.84 });
  expect(operationalPressuresForNode(load, 'missing')).toEqual([]);
  expect(primaryOperationalPressureForNode(load, 'missing')).toBeNull();
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
npm test -- src/core/__tests__/operational-pressure.spec.ts
```

Expected: FAIL because `operationalPressures`, `primaryOperationalPressure`, and node-local APIs do not exist/export yet.

- [ ] **Step 3: Implement minimal Core analyzer**

Create `src/core/operational-pressure.ts` with ordered flattening and first-max semantics:

```ts
import type { NodeLoadCollection, NodeResourceKind } from './node-load';
import type { InfrastructureNodeId, InfrastructureNodeKind } from './topology';

export interface OperationalPressure {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly capacity: number;
  readonly ratio: number;
}

export interface OperationalPressureScope {
  readonly nodeIds?: ReadonlySet<InfrastructureNodeId>;
}

export function operationalPressures(
  load: NodeLoadCollection,
  scope?: OperationalPressureScope,
): readonly OperationalPressure[] {
  const result: OperationalPressure[] = [];
  for (const node of load.nodeLoads) {
    if (node.nodeKind === 'EXTERNAL_SERVICE') continue;
    if (scope?.nodeIds && !scope.nodeIds.has(node.nodeId)) continue;
    for (const resource of node.resources) {
      result.push(Object.freeze({
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        resourceKind: resource.resourceKind,
        demand: resource.demand,
        capacity: resource.capacity,
        ratio: resource.ratio,
      }));
    }
  }
  return Object.freeze(result);
}

function firstMax(pressures: readonly OperationalPressure[]): OperationalPressure | null {
  let max: OperationalPressure | null = null;
  for (const pressure of pressures) {
    if (max === null || pressure.ratio > max.ratio) max = pressure;
  }
  return max;
}

export function primaryOperationalPressure(load: NodeLoadCollection, scope?: OperationalPressureScope) {
  return firstMax(operationalPressures(load, scope));
}

export function operationalPressuresForNode(load: NodeLoadCollection, nodeId: InfrastructureNodeId) {
  return operationalPressures(load, { nodeIds: new Set([nodeId]) });
}

export function primaryOperationalPressureForNode(load: NodeLoadCollection, nodeId: InfrastructureNodeId) {
  return firstMax(operationalPressuresForNode(load, nodeId));
}
```

Export the values/types from `src/core/index.ts`.

- [ ] **Step 4: Run Core analyzer tests and verify GREEN**

Run:

```bash
npm test -- src/core/__tests__/operational-pressure.spec.ts
npm run typecheck
```

Expected: new analyzer tests pass and exports typecheck.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/core/operational-pressure.ts src/core/__tests__/operational-pressure.spec.ts src/core/index.ts
git commit -m "feat: add generic operational pressure analyzer"
```

---

### Task 2: Make Growth Consume the Generic Primary Pressure

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`

**Interfaces:**
- Consumes: `primaryOperationalPressure(this._load)` from Task 1.
- Produces: `GrowthPolicy.calculate({ maxLoadRatio })` now receives the hottest player-owned resource ratio without a node-kind whitelist.

- [ ] **Step 1: Add failing GameEngine integration tests**

In `src/core/__tests__/game-engine.spec.ts`, add a helper that sets only private test state through a typed test cast while preserving public `advanceDay()` behavior:

```ts
function setGrowthTestState(engine: GameEngine, load: LoadSnapshot, dau = 1_000): void {
  const state = engine as unknown as { _launched: boolean; _dau: number; _load: LoadSnapshot };
  state._launched = true;
  state._dau = dau;
  state._load = load;
}
```

Add paired same-seed tests where only the current load differs. Use synthetic node loads containing required APP/DB/storage plus ALB/Redis as needed so `advanceGrowth()` is the only intended difference before normal refresh:

```ts
it('applies next-day capacity growth pressure from overloaded ALB throughput', () => {
  const baseline = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 700 });
  const overloaded = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 700 });
  setGrowthTestState(baseline, withSyntheticOperationalLoads(baseline.snapshot.load, { alb: 0.8 }));
  setGrowthTestState(overloaded, withSyntheticOperationalLoads(overloaded.snapshot.load, { alb: 1.2 }));

  const baselineDau = baseline.advanceDay().dau;
  const overloadedDau = overloaded.advanceDay().dau;

  expect(baselineDau - overloadedDau).toBe(200);
});

it('applies Redis pressure but ignores external-service pressure for growth capacity penalty', () => {
  // same seed and DAU; Redis 1.25 must reduce DAU, external 9.99 must not.
});
```

The helper `withSyntheticOperationalLoads` must replace/add exact node load snapshots rather than mutating production objects. Keep APP/DB/storage ratios below 1 so the target ALB/Redis pressure is unambiguous.

- [ ] **Step 2: Run focused GameEngine tests and verify RED**

Run:

```bash
npm test -- src/core/__tests__/game-engine.spec.ts
```

Expected: ALB/Redis growth assertions fail because `advanceGrowth()` still whitelists `SERVER_GROUP`, `DATABASE`, `QUEUE`, and `OBJECT_STORAGE`.

- [ ] **Step 3: Replace the whitelist with the Core analyzer**

In `src/core/game-engine.ts`, import `primaryOperationalPressure` and replace:

```ts
const maxLoadRatio = (['SERVER_GROUP', 'DATABASE', 'QUEUE', 'OBJECT_STORAGE'] as const)
  .map((nodeKind) => maxNodeLoad(this._load, { nodeKind })?.loadRatio ?? 0)
  .reduce((maximum, ratio) => Math.max(maximum, ratio), 0);
```

with:

```ts
const maxLoadRatio = primaryOperationalPressure(this._load)?.ratio ?? 0;
```

Remove `maxNodeLoad` import if it has no other production use in this file.

Do not change `GrowthPolicy` constants or formulas.

- [ ] **Step 4: Run Growth/GameEngine regression tests and verify GREEN**

Run:

```bash
npm test -- src/core/__tests__/game-engine.spec.ts src/core/__tests__/growth.spec.ts src/core/__tests__/operational-pressure.spec.ts
npm run typecheck
```

Expected: ALB/Redis integration tests pass; existing Growth tests remain unchanged and green.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts
git commit -m "feat: use generic pressure for growth"
```

---

### Task 3: Generic Service Health, P95, Observability, and Diagnosis

**Files:**
- Create: `src/application/operational-pressure-presenter.ts`
- Modify: `src/application/game-view.ts`
- Modify: `src/application/operational-view-projector.ts`
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/__tests__/operational-view-projector.spec.ts`

**Interfaces:**
- Consumes: `ServiceTopology`, Task 1 pressure API, `presentationCatalog`.
- Produces:

```ts
export interface BottleneckView {
  readonly nodeId: string;
  readonly nodeKind: TopologyNodeView['kind'];
  readonly resourceKind: 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE';
  readonly ratio: number;
  readonly percent: number;
  readonly label: string;
}

export interface ServiceHealthView {
  readonly status: ServiceHealthStatusView;
  readonly p95LatencyMs: number;
  readonly bottleneck: BottleneckView | null;
}
```

- `OperationalViewProjector.project(snapshot, developer, topology)` replaces `OperationalNodeSelection`.
- `OperationalViewProjector.diagnosisText(nodeId, snapshot, developer, topology)` uses node-local generic pressure.

- [ ] **Step 1: Rewrite projector tests first for the generic contract**

In `src/application/__tests__/operational-view-projector.spec.ts`:

1. Replace the fixed `selection` fixture with a real `V1ServiceTopologyFactory.create(...)` topology helper.
2. Keep the existing same-kind decoy test but make the decoy hotter than every real node; assert it does not appear in BASIC/METRICS and cannot become `service.health.bottleneck`.
3. Add ALB and Redis load snapshots to a topology where those technologies are deployed.
4. Add assertions such as:

```ts
expect(service.health.bottleneck).toMatchObject({
  nodeId: V1_NODE_IDS.cache,
  resourceKind: 'THROUGHPUT',
  percent: 113,
  label: expect.stringContaining('Redis'),
});
expect(service.health.status).toBe('CRITICAL');
```

5. BASIC must list one aggregate metric for every owned topology node in topology order and must not list external AI.
6. METRICS must flatten every resource from every owned topology node; expected labels include `ALB THROUGHPUT` and `Redis THROUGHPUT`, plus APP/DB CPU/I/O and storage/queue axes that are present.
7. Selected-node diagnosis for Redis must contain actual Redis throughput wording, never `DB I/O`; ALB diagnosis must contain ALB throughput wording, never `APP` as the signal.
8. Keep current observability unlock thresholds and P95 curve assertions.

- [ ] **Step 2: Run operational projector tests and verify RED**

Run:

```bash
npm test -- src/application/__tests__/operational-view-projector.spec.ts
```

Expected: failures from the closed bottleneck union, fixed selection API, fixed BASIC/METRICS arrays, and ALB/Redis omission.

- [ ] **Step 3: Add topology-aware presentation helpers**

Create `src/application/operational-pressure-presenter.ts` with focused helpers:

```ts
import type { OperationalPressure, ServiceTopology } from '../core';
import type { BottleneckView, LoadMetricView, TopologyNodeView } from './game-view';
import { presentationCatalog } from './presentation-catalog';

const RESOURCE_LABEL = {
  CPU: 'CPU',
  IO: 'I/O',
  THROUGHPUT: 'THROUGHPUT',
  STORAGE: 'STORAGE',
} as const;

const KIND_VIEW: Record<string, TopologyNodeView['kind']> = {
  LOAD_BALANCER: 'load-balancer',
  SERVER_GROUP: 'server-group',
  DATABASE: 'database',
  CACHE: 'cache',
  QUEUE: 'queue',
  OBJECT_STORAGE: 'object-storage',
  WORKER: 'worker',
  EXTERNAL_SERVICE: 'external-service',
};

export function ownedTopologyNodeIds(topology: ServiceTopology): ReadonlySet<string> {
  return new Set(topology.graph.nodes.filter((node) => node.kind !== 'EXTERNAL_SERVICE').map((node) => node.id));
}

export function pressureLabel(topology: ServiceTopology, pressure: OperationalPressure): string {
  const node = topology.graph.node(pressure.nodeId);
  if (!node) return `${pressure.nodeKind} ${RESOURCE_LABEL[pressure.resourceKind]}`;
  return `${presentationCatalog.label(node.productId)} ${RESOURCE_LABEL[pressure.resourceKind]}`;
}

export function bottleneckView(topology: ServiceTopology, pressure: OperationalPressure): BottleneckView {
  return {
    nodeId: pressure.nodeId,
    nodeKind: KIND_VIEW[pressure.nodeKind],
    resourceKind: pressure.resourceKind,
    ratio: pressure.ratio,
    percent: Math.max(0, Math.round(pressure.ratio * 100)),
    label: pressureLabel(topology, pressure),
  };
}
```

Use the actual `TopologyGraph.node()` API name present in `src/core/topology.ts`; if it is named differently, use that exact existing accessor rather than adding another graph lookup abstraction.

- [ ] **Step 4: Replace closed bottleneck DTOs and fixed operational selection**

In `src/application/game-view.ts`:

- Remove the string `BottleneckView` union.
- Add the object `BottleneckView` above.
- Change `ServiceHealthView` to `{ status, p95LatencyMs, bottleneck }` and remove duplicated `bottleneckLabel`, `bottleneckPercent`, `bottleneckNodeId` once usages are migrated.

In `src/application/operational-view-projector.ts`:

- Delete `OperationalNodeSelection`, `BOTTLENECK_LABELS`, and fixed `bottleneckCandidates()`.
- Scope pressures with:

```ts
const scope = { nodeIds: ownedTopologyNodeIds(topology) };
const pressures = operationalPressures(snapshot.load, scope);
const primary = primaryOperationalPressure(snapshot.load, scope);
```

- Keep `latencyFromPressure()` constants exactly unchanged and feed it `primary?.ratio ?? 0`.
- BASIC: iterate owned topology nodes in topology order, require their exact node load, and emit `node.loadRatio` metrics only.
- METRICS/APM: iterate the scoped `OperationalPressure[]` in stable order and emit one metric per resource.
- If a player-owned topology node is missing its load snapshot, continue to throw `Missing load for topology node: <id>` rather than silently dropping it.
- `diagnosisText()` obtains `primaryOperationalPressureForNode(snapshot.load, nodeId)`, resolves the topology node for product wording, and uses semantic recommendation policy only after generic signal selection.
- For current known node/resource combinations, preserve the intent of existing APP/DB/Queue/Storage recommendations and add Redis/ALB recommendations from the spec. For unknown future combinations return a safe fallback such as `['Capacity 조정', '트래픽/워크로드 확인', '관련 downstream 상태 확인']`.
- If METRICS/APM diagnosis receives a topology node with no measurable resources, return a non-throwing no-pressure sentence; BASIC remains diagnosis-locked.

- [ ] **Step 5: Pass real topology from GameServiceProjector**

In `src/application/game-service-projector.ts`, replace the old selection call:

```ts
OperationalViewProjector.project(snapshot, this.#engine.developer, operationalNodeSelection(topology))
```

with:

```ts
OperationalViewProjector.project(snapshot, this.#engine.developer, topology)
```

Delete `requiredV1Deployment`, `requiredTopologyBinding`, and `operationalNodeSelection` only if they have no remaining use in this file.

- [ ] **Step 6: Run Application health/observability tests and verify GREEN**

Run:

```bash
npm test -- src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/game-service-projector.spec.ts
npm run typecheck
```

Expected: generic health/P95/BASIC/METRICS/diagnosis behavior passes; any type failures now identify downstream old `ServiceHealthView` consumers to migrate in Task 5 rather than reintroducing compatibility fields.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/application/operational-pressure-presenter.ts src/application/game-view.ts src/application/operational-view-projector.ts src/application/game-service-projector.ts src/application/__tests__/operational-view-projector.spec.ts
git commit -m "feat: project generic operational bottlenecks"
```

---

### Task 4: Generic Load Alerts and Feature-Impact Preview

**Files:**
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/__tests__/game-service-projector.spec.ts`

**Interfaces:**
- Consumes: topology-scoped `operationalPressures`, `primaryOperationalPressureForNode`, `pressureLabel`.
- Produces: one load alert per owned node at >= 90% pressure and feature preview deltas keyed by `(nodeId, resourceKind)`.

- [ ] **Step 1: Add failing generic alert tests**

Update `src/application/__tests__/game-service-projector.spec.ts`:

- Deploy ALB and Redis in the fixture and create a snapshot where Redis throughput is 118% and ALB is 94%, while APP/DB are lower.
- Assert alerts target exact topology node IDs and use actual resource wording:

```ts
expect(result.alerts).toEqual(expect.arrayContaining([
  expect.objectContaining({
    id: `load-${V1_NODE_IDS.cache}`,
    nodeId: V1_NODE_IDS.cache,
    title: expect.stringMatching(/Redis.*THROUGHPUT.*118%/),
  }),
]));
```

- Add a decoy non-topology CACHE load at 999% and assert there is no alert for it.
- Preserve request-failure alert assertions independently.

- [ ] **Step 2: Add failing generic feature-impact test**

Create a test around `featureImpact()` where the projected feature increases an owned generic resource. The assertion should not hard-code APP/DB categories; it should verify:

```ts
expect(impact?.summary).toMatch(/\d+→\d+%/);
if (impact?.nodeId) {
  expect(current.topology.nodes.some(({ id }) => id === impact.nodeId)).toBe(true);
}
```

Also add a targeted test using a synthetic current/projected pressure comparison helper if necessary so an ALB or Redis delta can be proven to rank in the top two without relying on fragile game-balance values. Keep that helper private to `GameServiceProjector` or extract a pure Application helper only if the test demonstrates the comparison logic is otherwise untestable.

- [ ] **Step 3: Run projector tests and verify RED**

Run:

```bash
npm test -- src/application/__tests__/game-service-projector.spec.ts
```

Expected: current fixed `Application/Database/Async/Storage` alert loop and fixed feature axes fail the new assertions.

- [ ] **Step 4: Replace fixed load-alert loop with per-node hottest pressure**

In `GameServiceProjector.alerts()`:

```ts
const scope = { nodeIds: ownedTopologyNodeIds(topology) };
for (const node of topology.graph.nodes) {
  if (node.kind === 'EXTERNAL_SERVICE') continue;
  const pressure = primaryOperationalPressureForNode(snapshot.load, node.id);
  if (!pressure || pressure.ratio < 0.9) continue;
  const overloadPenalty = pressure.ratio > 1
    ? Math.min(30, Math.round((pressure.ratio - 1) * 100))
    : 0;
  alerts.push({
    id: `load-${node.id}`,
    tone: pressure.ratio > 1 ? 'danger' : 'warning',
    title: `${pressureLabel(topology, pressure)} ${percent(pressure.ratio)}%`,
    detail: pressure.ratio > 1
      ? `Capacity ${Math.round((pressure.ratio - 1) * 100)}% 초과 · 다음 날 DAU 최대 -${overloadPenalty}% 압력`
      : 'Critical 구간 · Scale 검토 필요',
    nodeId: node.id,
  });
}
```

Pass `topology` into `alerts()` from `project()` so no topology is reconstructed.

- [ ] **Step 5: Replace fixed feature-impact axes with generic pressure delta matching**

In `featureImpactFor()`:

```ts
const topology = this.serviceTopology(snapshot);
const nodeIds = ownedTopologyNodeIds(topology);
const before = operationalPressures(snapshot.load, { nodeIds });
const after = operationalPressures(projected, { nodeIds });
const beforeByKey = new Map(before.map((p) => [`${p.nodeId}:${p.resourceKind}`, p]));
const changes = after.map((next) => {
  const previous = beforeByKey.get(`${next.nodeId}:${next.resourceKind}`);
  return {
    before: previous?.ratio ?? 0,
    after: next.ratio,
    delta: next.ratio - (previous?.ratio ?? 0),
    pressure: next,
  };
});
```

Sort a copied array by `delta` descending for the two displayed changes, and use `primaryOperationalPressure(projected, { nodeIds })` for projected top bottleneck/severity. Preserve existing failure-rate comparison and danger/warning thresholds.

Labels must come from `pressureLabel(topology, pressure)`, never a fixed axis array.

- [ ] **Step 6: Run alert/preview tests and verify GREEN**

Run:

```bash
npm test -- src/application/__tests__/game-service-projector.spec.ts
npm run typecheck
```

Expected: Redis/ALB and existing APP/DB/Queue/Storage alerts/preview all use the same generic resource pipeline.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/application/game-service-projector.ts src/application/__tests__/game-service-projector.spec.ts
git commit -m "feat: generalize operational alerts and previews"
```

---

### Task 5: Route Incident Diagnosis Through the Topology Owner and Remove Legacy Bottleneck Surface

**Files:**
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/game-event-projector.ts`
- Modify: `src/application/__tests__/game-event-projector.spec.ts`
- Modify: downstream tests/fixtures referencing removed `bottleneckLabel`, `bottleneckPercent`, or `bottleneckNodeId` only where typecheck identifies them.

**Interfaces:**
- Produces on `GameServiceProjector`:

```ts
diagnosisText(nodeId: string, snapshot: GameSnapshot = this.#engine.snapshot): string
```

which internally creates the same service topology and delegates to:

```ts
OperationalViewProjector.diagnosisText(nodeId, snapshot, this.#engine.developer, topology)
```

- `GameEventProjector` no longer imports `OperationalViewProjector` directly.

- [ ] **Step 1: Add/adjust failing event diagnosis test**

In `src/application/__tests__/game-event-projector.spec.ts`, assert a newly surfaced incident receives diagnosis via the service projection path and that the diagnosis contains the exact affected node/product resource signal at METRICS/APM where unlocked.

At minimum add a spy-able or behavior assertion proving `GameEventProjector` output still contains `diagnosis` after the `OperationalViewProjector` signature changes.

- [ ] **Step 2: Run event/application tests and verify RED**

Run:

```bash
npm test -- src/application/__tests__/game-event-projector.spec.ts src/application/__tests__/operational-view-projector.spec.ts
npm run typecheck
```

Expected: event code still calls the old topology-less diagnosis API and old health fields may remain in downstream consumers.

- [ ] **Step 3: Add GameServiceProjector diagnosis delegation and migrate event code**

In `GameServiceProjector`:

```ts
diagnosisText(nodeId: string, snapshot: GameSnapshot = this.#engine.snapshot): string {
  const topology = this.serviceTopology(snapshot);
  return OperationalViewProjector.diagnosisText(
    nodeId,
    snapshot,
    this.#engine.developer,
    topology,
  );
}
```

In `GameEventProjector`, replace:

```ts
diagnosis: OperationalViewProjector.diagnosisText(incident.nodeId, after, this.#engine.developer)
```

with:

```ts
diagnosis: this.#serviceProjector.diagnosisText(incident.nodeId, after)
```

Remove the now-unused `OperationalViewProjector` import.

- [ ] **Step 4: Remove remaining closed/duplicated bottleneck compatibility references**

Use repository search and typecheck to find these exact identifiers:

```text
bottleneckLabel
bottleneckPercent
bottleneckNodeId
APP_CPU
APP_IO
DB_CPU
DB_IO
ASYNC
STORAGE
OperationalNodeSelection
```

Do not remove unrelated display strings such as a visible metric label `STORAGE`; remove only old bottleneck-contract or fixed-candidate code. Update UI/test access from:

```ts
service.health.bottleneckPercent
```

to:

```ts
service.health.bottleneck?.percent ?? 0
```

and equivalent nested object access.

- [ ] **Step 5: Run migrated application/UI tests and verify GREEN**

Run:

```bash
npm test -- src/application/__tests__ src/ui/__tests__
npm run typecheck
```

Expected: no downstream consumer requires the legacy bottleneck enum/duplicated fields.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/application/game-service-projector.ts src/application/game-event-projector.ts src/application/__tests__ src/ui/__tests__
git commit -m "refactor: remove legacy bottleneck surface"
```

---

### Task 6: Full Regression Verification, Review, and Integration Prep

**Files:**
- Modify plan checkboxes only after each task is actually completed.
- No production behavior change unless verification exposes a defect tied to this feature.

**Interfaces:**
- Consumes the complete branch behavior from Tasks 1–5.
- Produces a merge-ready branch with fresh evidence.

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all test files pass, including new Core analyzer, Growth integration, generic operational projector, alert/preview, and event diagnosis tests.

- [ ] **Step 2: Run full typecheck**

```bash
npm run typecheck
```

Expected: zero TypeScript errors; no legacy bottleneck DTO access remains.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: Next.js production build succeeds.

- [ ] **Step 4: Review diff against the spec**

Verify all of the following directly in the diff/tests:

```text
[ ] Core pressure analyzer is generic and external-safe
[ ] Application scopes service pressure to topology node IDs
[ ] Growth sees ALB/Redis/future owned resources
[ ] P95/Health use the same scoped primary pressure
[ ] BASIC is one aggregate metric per owned node
[ ] METRICS is every owned resource axis
[ ] APM/node diagnosis uses generic signal selection plus semantic recommendations
[ ] Load alerts are one per pressured owned node
[ ] Feature preview matches pressure by nodeId + resourceKind
[ ] failureRate generation logic is unchanged
[ ] fixed bottleneck enum and OperationalNodeSelection are gone
```

- [ ] **Step 5: Request code review using Superpowers**

Invoke `superpowers:requesting-code-review`, inspect the complete PR diff, and fix only findings that are in scope or correctness-critical. Any fix requires rerunning the relevant focused tests before the final verification below.

- [ ] **Step 6: Run fresh final verification after review changes**

```bash
npm test
npm run typecheck
npm run build
```

Expected: all three succeed on the exact branch head that will be proposed for merge.

- [ ] **Step 7: Update this plan to completed state and commit documentation**

```bash
git add docs/superpowers/plans/2026-08-29-generic-operational-bottleneck-engine.md
git commit -m "docs: complete operational bottleneck plan"
```

- [ ] **Step 8: Use the finishing-development-branch workflow**

Target base branch: `feature/playable-mvp`.

Follow `superpowers:finishing-a-development-branch`. If the user chooses/has already authorized PR integration, create/update the PR from `feature/generic-operational-bottleneck-engine` to `feature/playable-mvp`, verify the PR merge tree CI, and merge only the exact verified head.
