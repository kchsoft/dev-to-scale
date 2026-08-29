# Generic Operational Bottleneck Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every player-owned infrastructure resource participate in one generic bottleneck model shared by Growth, Service Health/P95, observability, diagnosis, load alerts, and feature-impact previews.

**Architecture:** Add a focused Core `operational-pressure` module that converts generic `NodeLoadSnapshot.resources` into topology-scopable `OperationalPressure` records and selects global/node-local primary pressure deterministically. Core Growth consumes the same primary ratio; Application receives the active `ServiceTopology`, scopes service-facing pressure to player-owned topology nodes, projects generic bottleneck/metric views, and keeps product-specific labels/recommendations outside Core.

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
- Use strict TDD: add a failing behavior test, observe RED, add minimal production code, observe GREEN, then commit.

---

## File Structure

### Create
- `src/core/operational-pressure.ts` — generic pressure extraction, node-ID scoping, global primary selection, node-local primary selection.
- `src/core/__tests__/operational-pressure.spec.ts` — Core contract and deterministic selection tests.
- `src/application/operational-pressure-presenter.ts` — topology-aware labels, Core-pressure-to-view projection, and pure before/after pressure comparison.

### Modify
- `src/core/index.ts`
- `src/core/game-engine.ts`
- `src/core/__tests__/game-engine.spec.ts`
- `src/application/game-view.ts`
- `src/application/operational-view-projector.ts`
- `src/application/game-service-projector.ts`
- `src/application/game-event-projector.ts`
- `src/application/__tests__/operational-view-projector.spec.ts`
- `src/application/__tests__/game-service-projector.spec.ts`
- `src/application/__tests__/game-event-projector.spec.ts`
- Downstream Application/UI fixtures reported by typecheck for removed health fields only.

---

### Task 1: Core Generic Operational Pressure Analyzer

**Files:**
- Create: `src/core/operational-pressure.ts`
- Create: `src/core/__tests__/operational-pressure.spec.ts`
- Modify: `src/core/index.ts`

**Interfaces:**

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

export function operationalPressures(load: NodeLoadCollection, scope?: OperationalPressureScope): readonly OperationalPressure[];
export function primaryOperationalPressure(load: NodeLoadCollection, scope?: OperationalPressureScope): OperationalPressure | null;
export function operationalPressuresForNode(load: NodeLoadCollection, nodeId: InfrastructureNodeId): readonly OperationalPressure[];
export function primaryOperationalPressureForNode(load: NodeLoadCollection, nodeId: InfrastructureNodeId): OperationalPressure | null;
```

Unknown node-local queries return `[]` and `null`. `EXTERNAL_SERVICE` is always excluded.

- [ ] **Step 1: Write failing analyzer tests**

Create synthetic node loads for ALB throughput, APP CPU/I/O, Redis throughput, DB CPU/I/O, Queue throughput, Storage, and an external service. Assert:

```ts
expect(primaryOperationalPressure(load)).toMatchObject({
  nodeId: 'redis', resourceKind: 'THROUGHPUT', ratio: 1.13,
});
expect(operationalPressures(load).map(({ nodeId, resourceKind }) => `${nodeId}:${resourceKind}`)).toEqual([
  'alb:THROUGHPUT', 'app:CPU', 'app:IO', 'redis:THROUGHPUT',
  'db:CPU', 'db:IO', 'queue:THROUGHPUT', 'storage:STORAGE',
]);
expect(primaryOperationalPressure(load, { nodeIds: new Set(['app', 'db']) })).toMatchObject({
  nodeId: 'db', resourceKind: 'IO', ratio: 0.92,
});
expect(primaryOperationalPressure(load, { nodeIds: new Set(['app', 'external']) })?.nodeId).toBe('app');
expect(primaryOperationalPressureForNode(load, 'app')).toMatchObject({ resourceKind: 'CPU', ratio: 0.84 });
expect(operationalPressuresForNode(load, 'missing')).toEqual([]);
expect(primaryOperationalPressureForNode(load, 'missing')).toBeNull();
```

Add a separate exact-tie fixture and assert the first node/resource remains primary.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/core/__tests__/operational-pressure.spec.ts
```

Expected: FAIL because the new API does not exist/export yet.

- [ ] **Step 3: Implement minimal analyzer**

Flatten `nodeLoads` in order, skip external nodes, apply optional node-ID scope, preserve resource order, and select first maximum using only `>` comparison. Freeze returned pressure records/arrays. Export the module from `src/core/index.ts`.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- src/core/__tests__/operational-pressure.spec.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/core/operational-pressure.ts src/core/__tests__/operational-pressure.spec.ts src/core/index.ts
git commit -m "feat: add generic operational pressure analyzer"
```

---

### Task 2: Growth Uses the Generic Primary Pressure

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`

**Interfaces:**
- Consumes: `primaryOperationalPressure(this._load)`.
- Produces: `GrowthPolicy.calculate({ maxLoadRatio })` based on the hottest player-owned resource.

- [ ] **Step 1: Write failing integration coverage**

Use same-seed `GameEngine` fixtures and synthetic `LoadSnapshot` state in the test file so the only growth difference is the current pressure ratio. Add three assertions:

```text
baseline ALB 80% vs overloaded ALB 120% -> overloaded next-day DAU is 20 percentage points lower
baseline Redis 80% vs overloaded Redis 125% -> overloaded next-day DAU is 25 percentage points lower
baseline external 80% vs external 999% -> next-day DAU is identical
```

Keep APP/DB/Storage synthetic resource ratios below 100% so ALB/Redis is unambiguously primary. Reuse the same random seed and starting DAU for paired cases.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/core/__tests__/game-engine.spec.ts
```

Expected: ALB/Redis assertions fail because `advanceGrowth()` still whitelists `SERVER_GROUP`, `DATABASE`, `QUEUE`, and `OBJECT_STORAGE`; external equality already holds.

- [ ] **Step 3: Replace the whitelist**

In `GameEngine.advanceGrowth()` replace the four-kind `maxNodeLoad` reduction with:

```ts
const maxLoadRatio = primaryOperationalPressure(this._load)?.ratio ?? 0;
```

Remove the unused `maxNodeLoad` import. Do not change `GrowthPolicy` constants/formulas.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- src/core/__tests__/game-engine.spec.ts src/core/__tests__/growth.spec.ts src/core/__tests__/operational-pressure.spec.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

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

`OperationalViewProjector.project(snapshot, developer, topology)` replaces `OperationalNodeSelection`.

- [ ] **Step 1: Write failing projector tests**

Migrate the test fixture to a real `ServiceTopology`. Add deployed ALB/Redis and create real-node ratios where Redis throughput is 113%, ALB 72%, DB I/O 92%, others lower. Assert Redis becomes the health bottleneck and P95/status react. Add a 999% decoy node not present in topology and assert it is invisible.

BASIC assertions:
- one aggregate metric per player-owned topology node in topology order;
- external AI excluded;
- no resource signature exposed.

METRICS assertions:
- every resource of every player-owned topology node appears;
- ALB/Redis throughput labels appear;
- APP/DB CPU/I/O remain distinct.

Diagnosis assertions:
- Redis says Redis throughput, not DB I/O;
- ALB says ALB throughput, not APP;
- APP/DB still pick the hotter local CPU/I/O resource.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/application/__tests__/operational-view-projector.spec.ts
```

Expected: fixed selection, closed bottleneck union, and fixed metric arrays fail.

- [ ] **Step 3: Create `operational-pressure-presenter.ts`**

Implement:

```ts
export function ownedTopologyNodeIds(topology: ServiceTopology): ReadonlySet<string>;
export function pressureLabel(topology: ServiceTopology, pressure: OperationalPressure): string;
export function bottleneckView(topology: ServiceTopology, pressure: OperationalPressure): BottleneckView;
```

Use `topology.graph.node(pressure.nodeId)` and `presentationCatalog.label(node.productId)`. Map Core node kinds to existing `TopologyNodeView['kind']`. Resource display labels are exactly `CPU`, `I/O`, `THROUGHPUT`, `STORAGE`.

- [ ] **Step 4: Replace the old Application bottleneck contract**

In `game-view.ts`, replace the fixed string union with the generic object and change `ServiceHealthView` to nested `bottleneck` only.

In `operational-view-projector.ts`:
- delete `OperationalNodeSelection`, `BOTTLENECK_LABELS`, and fixed candidate arrays;
- global Health/P95 uses `primaryOperationalPressure(snapshot.load, { nodeIds: ownedTopologyNodeIds(topology) })`;
- keep latency curve and health thresholds unchanged;
- BASIC iterates owned topology nodes and uses exact `NodeLoadSnapshot.loadRatio`;
- METRICS/APM iterates topology nodes then each node's `operationalPressuresForNode` resource order;
- missing player-owned node load still throws `Missing load for topology node: <id>`;
- node diagnosis selects `primaryOperationalPressureForNode()` before recommendation logic;
- known semantic recommendations remain; add Redis throughput and ALB throughput recommendations; unknown future node/resource uses `Capacity 조정 / 트래픽·워크로드 확인 / downstream 상태 확인` fallback.

- [ ] **Step 5: Pass topology from `GameServiceProjector`**

Call:

```ts
OperationalViewProjector.project(snapshot, this.#engine.developer, topology)
```

Delete role-specific `requiredV1Deployment`, `requiredTopologyBinding`, `operationalNodeSelection`, and associated import when unused.

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/game-service-projector.spec.ts
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/application/operational-pressure-presenter.ts src/application/game-view.ts src/application/operational-view-projector.ts src/application/game-service-projector.ts src/application/__tests__/operational-view-projector.spec.ts
git commit -m "feat: project generic operational bottlenecks"
```

---

### Task 4: Generic Load Alerts and Feature-Impact Preview

**Files:**
- Modify: `src/application/operational-pressure-presenter.ts`
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/__tests__/game-service-projector.spec.ts`

**Interfaces:**

```ts
export interface OperationalPressureChange {
  readonly pressure: OperationalPressure;
  readonly beforeRatio: number;
  readonly afterRatio: number;
  readonly delta: number;
}

export function operationalPressureChanges(
  before: readonly OperationalPressure[],
  after: readonly OperationalPressure[],
): readonly OperationalPressureChange[];
```

Match pressures by exact string key `${nodeId}::${resourceKind}`. Result order follows `after`; callers sort copies for ranking.

- [ ] **Step 1: Write failing pure delta test**

Use before/after pressures:

```text
ALB throughput 82% -> 101% (delta +19)
Redis throughput 76% -> 109% (delta +33)
```

Assert both changes are matched by node ID + resource kind and Redis ranks above ALB after sorting by delta.

- [ ] **Step 2: Write failing generic alert tests**

Deploy ALB/Redis. Build a snapshot with Redis 118%, ALB 94%, APP/DB lower, plus a 999% non-topology CACHE decoy. Assert one alert each for real Redis and ALB with exact node IDs and resource wording; assert no decoy alert. Preserve request-failure alert coverage separately.

- [ ] **Step 3: Write failing feature-impact regression**

Keep a real `featureImpact('COMMENT')` scenario. Assert `impact.nodeId`, when present, belongs to current topology and summary contains `before→after%` pressure deltas. The pure delta test is the deterministic ALB/Redis comparison proof; do not couple this regression to exact game-balance values.

- [ ] **Step 4: Run RED**

```bash
npm test -- src/application/__tests__/game-service-projector.spec.ts
```

- [ ] **Step 5: Implement pressure comparison**

In `operational-pressure-presenter.ts`, build `beforeByKey` with `${nodeId}::${resourceKind}` and return frozen `OperationalPressureChange` records for every `after` pressure, defaulting missing previous ratio to `0`.

- [ ] **Step 6: Generalize load alerts**

Change `alerts()` to receive current topology. Iterate player-owned topology nodes, obtain `primaryOperationalPressureForNode(snapshot.load, node.id)`, and create one load alert when ratio >= 0.9. ID is `load-${node.id}`; title is `${pressureLabel(topology, pressure)} ${percent(ratio)}%`; preserve existing warning/danger and overload-growth-pressure copy.

- [ ] **Step 7: Generalize feature impact**

In `featureImpactFor()`:

```ts
const topology = this.serviceTopology(snapshot);
const nodeIds = ownedTopologyNodeIds(topology);
const beforePressures = operationalPressures(snapshot.load, { nodeIds });
const afterPressures = operationalPressures(projected, { nodeIds });
const rankedChanges = [...operationalPressureChanges(beforePressures, afterPressures)]
  .sort((left, right) => right.delta - left.delta);
const top = primaryOperationalPressure(projected, { nodeIds });
```

Display the first two ranked changes using `pressureLabel`; preserve request-failure delta behavior; derive overload/critical suffix and tone from `top?.ratio ?? 0` plus existing failure thresholds; set `nodeId` from `top?.nodeId`.

- [ ] **Step 8: Verify GREEN**

```bash
npm test -- src/application/__tests__/game-service-projector.spec.ts
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add src/application/operational-pressure-presenter.ts src/application/game-service-projector.ts src/application/__tests__/game-service-projector.spec.ts
git commit -m "feat: generalize operational alerts and previews"
```

---

### Task 5: Route Incident Diagnosis Through Topology Ownership and Remove Legacy Surface

**Files:**
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/game-event-projector.ts`
- Modify: `src/application/__tests__/game-event-projector.spec.ts`
- Modify: exact downstream fixtures reported by typecheck for removed health fields.

**Interfaces:**

```ts
diagnosisText(nodeId: string, snapshot: GameSnapshot = this.#engine.snapshot): string
```

on `GameServiceProjector`, delegating to topology-aware `OperationalViewProjector.diagnosisText(...)`.

- [ ] **Step 1: Write/adjust failing event diagnosis coverage**

Keep the existing new-incident event fixture and assert event output still has a non-empty `diagnosis`. At METRICS/APM, assert the diagnosis references the incident node's actual product/resource signal.

- [ ] **Step 2: Run RED/typecheck**

```bash
npm test -- src/application/__tests__/game-event-projector.spec.ts src/application/__tests__/operational-view-projector.spec.ts
npm run typecheck
```

Expected: direct old diagnosis signature and old health fields fail.

- [ ] **Step 3: Delegate diagnosis through `GameServiceProjector`**

Add:

```ts
diagnosisText(nodeId: string, snapshot: GameSnapshot = this.#engine.snapshot): string {
  const topology = this.serviceTopology(snapshot);
  return OperationalViewProjector.diagnosisText(nodeId, snapshot, this.#engine.developer, topology);
}
```

Change `GameEventProjector` incident projection to:

```ts
diagnosis: this.#serviceProjector.diagnosisText(incident.nodeId, after)
```

and remove its direct `OperationalViewProjector` import.

- [ ] **Step 4: Remove legacy bottleneck-contract references**

Search/typecheck exact identifiers:

```text
bottleneckLabel
bottleneckPercent
bottleneckNodeId
APP_CPU
APP_IO
DB_CPU
DB_IO
OperationalNodeSelection
```

Migrate consumers to nested access such as `service.health.bottleneck?.percent ?? 0`, `.nodeId ?? null`, `.label ?? 'NONE'`. Do not remove ordinary resource display text merely because it says `STORAGE` or `ASYNC`.

- [ ] **Step 5: Verify GREEN across Application/UI**

```bash
npm test -- src/application/__tests__ src/ui/__tests__
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/application/game-service-projector.ts src/application/game-event-projector.ts src/application/__tests__ src/ui/__tests__
git commit -m "refactor: remove legacy bottleneck surface"
```

---

### Task 6: Full Regression Verification, Review, and Integration Prep

- [ ] **Step 1: Full tests**

```bash
npm test
```

- [ ] **Step 2: Full typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Production build**

```bash
npm run build
```

- [ ] **Step 4: Diff/spec review**

Confirm:

```text
[ ] Core pressure analyzer generic + external-safe
[ ] Application scopes pressure to topology node IDs
[ ] Growth sees ALB/Redis/future owned resources
[ ] P95/Health share the same scoped primary pressure
[ ] BASIC is one aggregate metric per owned node
[ ] METRICS contains every owned resource axis
[ ] APM/node diagnosis uses generic signal selection + semantic recommendations
[ ] Load alerts are one per pressured owned node
[ ] Feature preview matches nodeId + resourceKind
[ ] failureRate generation unchanged
[ ] closed bottleneck enum and OperationalNodeSelection removed
```

- [ ] **Step 5: Request code review using Superpowers**

Invoke `superpowers:requesting-code-review`, review the complete diff, and fix correctness findings within scope. Rerun focused tests after every review fix.

- [ ] **Step 6: Fresh final verification**

```bash
npm test
npm run typecheck
npm run build
```

- [ ] **Step 7: Mark this plan completed and commit it**

```bash
git add docs/superpowers/plans/2026-08-29-generic-operational-bottleneck-engine.md
git commit -m "docs: complete operational bottleneck plan"
```

- [ ] **Step 8: Finish the development branch**

Base branch: `feature/playable-mvp`.

Follow `superpowers:finishing-a-development-branch`. For PR integration, create/update a PR from `feature/generic-operational-bottleneck-engine` to `feature/playable-mvp`, verify the PR merge-tree CI, and merge only the exact verified head.
