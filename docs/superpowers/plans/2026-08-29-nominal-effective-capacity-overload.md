# Nominal / Effective Capacity & Overload Request Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate player-facing nominal load from actual effective hard limits, make effective-capacity overload cause immediate partial request failure, and propagate only surviving upstream traffic into downstream node demand.

**Architecture:** Keep the existing four generic resource axes and extend the Core load contract so every resource carries nominal/effective capacities and ratios. Add explicit capacity-health helpers, feed capacity health and incident health through the existing request trace, and solve shared-node load with a deterministic fixed-pass flow loop. Operational pressure selects by effective ratio for technical behavior while Application renders nominal percentages and hard limits. Existing Growth, incident probability, Service Health, P95, alerts, diagnosis, and preview paths consume the appropriate explicit ratio without reintroducing node-kind whitelists.

**Tech Stack:** TypeScript, Vitest, Next.js 16.3.2, existing Core/Application/UI architecture, GitHub Actions CI on Node 22.

**Spec:** `docs/superpowers/specs/2026-08-29-nominal-effective-capacity-overload-design.md`

## Global Constraints

- Resource axes remain exactly `CPU`, `IO`, `THROUGHPUT`, and `STORAGE`.
- Player-facing `100%` is based on nominal capacity; actual overload/failure is based on effective capacity.
- Nominal capacity includes structural scale (size, APP count, current DB replica factors) but excludes framework/database/proficiency performance modifiers.
- Effective capacity applies the existing product/runtime modifier and existing proficiency/tuning multiplier to nominal capacity. Do not add a duplicate hard-limit table.
- A node's displayed load is the maximum nominal ratio across its resources; technical pressure is the maximum effective ratio. Never average resource ratios.
- Effective overload causes immediate partial capacity failure: `health = min(1, effectiveCapacity / demand)`; the hottest effective resource controls node capacity health.
- Incident health remains separate and composes multiplicatively with capacity health.
- Required route steps gate primary success and downstream arrival. Optional steps receive demand and expose degradation but do not reduce primary success by default.
- Upstream pass-through limits downstream demand. Downstream failure must not retroactively erase upstream work.
- External services remain outside player-owned operational pressure; exact current topology node IDs remain the scope boundary.
- Existing GrowthPolicy coefficients/caps, incident probability bands/severity distribution, Service Health thresholds, P95 curve constants, finance, progression, tech debt, and technology build rules remain unchanged unless a failing regression proves a direct semantic conflict.
- Live load and all load previews must use the same calculator semantics.
- Use strict TDD for every behavior slice: write a failing test, observe RED, implement the minimum behavior, observe GREEN, then commit.

---

## File Structure

### Create
- `src/core/capacity-health.ts` — pure resource/node capacity-health and health-composition helpers.
- `src/core/__tests__/capacity-health.spec.ts` — immediate-overload and composition tests.
- `src/core/__tests__/overload-request-flow.spec.ts` — flow-aware integration tests proving upstream masking/reveal behavior.

### Modify
- `src/core/infrastructure-sizing.ts`
- `src/core/infrastructure.ts`
- `src/core/node-load.ts`
- `src/core/operational-pressure.ts`
- `src/core/request-trace.ts`
- `src/core/incident-topology.ts`
- `src/core/game-engine.ts`
- `src/core/index.ts`
- `src/core/__tests__/infrastructure-sizing.spec.ts`
- `src/core/__tests__/infrastructure-load.spec.ts`
- `src/core/__tests__/node-load.spec.ts`
- `src/core/__tests__/operational-pressure.spec.ts`
- `src/core/__tests__/request-trace.spec.ts`
- `src/core/__tests__/game-engine-operational-growth.spec.ts`
- incident-topology tests that assert load-ratio input semantics.
- `src/application/game-view.ts`
- `src/application/operational-pressure-presenter.ts`
- `src/application/operational-view-projector.ts`
- `src/application/game-service-projector.ts`
- `src/application/topology-view-projector.ts`
- `src/application/__tests__/generic-operational-view.spec.ts`
- `src/application/__tests__/generic-operational-alerts.spec.ts`
- `src/application/__tests__/operational-view-projector.spec.ts`
- `src/application/__tests__/topology-view-projector.spec.ts`
- downstream fixtures reported by typecheck for the changed Core/View contracts.

---

### Task 1: Dual Capacity and Dual Ratio Core Contract

**Files:**
- Modify: `src/core/infrastructure-sizing.ts`
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/node-load.ts`
- Modify: `src/core/index.ts`
- Modify: `src/core/__tests__/infrastructure-sizing.spec.ts`
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`
- Modify: `src/core/__tests__/node-load.spec.ts`

**Target interfaces:**

```ts
export interface NodeResourceLoad {
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly nominalCapacity: number;
  readonly effectiveCapacity: number;
  readonly nominalRatio: number;
  readonly effectiveRatio: number;
}

export interface NodeLoadSnapshot {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resources: readonly NodeResourceLoad[];
  readonly nominalLoadRatio: number;
  readonly effectiveLoadRatio: number;
}

export function createNodeResourceLoad(
  resourceKind: NodeResourceKind,
  demand: number,
  nominalCapacity: number,
  effectiveCapacity?: number,
): NodeResourceLoad;
```

The optional fourth argument defaults to `nominalCapacity`, making synthetic fixtures concise without reintroducing an ambiguous returned `capacity` field.

Add sizing/state APIs:

```ts
export function nominalNodeSizeProfile(productId: string, size: ServerSize): NodeSizeProfile;

class InfrastructureState {
  nodeNominalCapacity(nodeId: InfrastructureNodeId): ResourceCapacity;
  nodeCapacity(nodeId: InfrastructureNodeId): ResourceCapacity; // existing effective-before-proficiency capacity
}
```

Nominal APP capacity uses the raw APP size baseline on CPU/IO/throughput multiplied by instance count. Nominal DB capacity uses the raw DB size baseline and the existing structural replica factors (`1 + 0.55 * replicas` for CPU, `1 + 0.75 * replicas` for IO, `1 + 0.6 * replicas` for legacy throughput). Fixed ALB/Redis/Queue/Storage nominal profiles equal their existing size profile because no separate product performance modifier exists today.

- [ ] **Step 1: Write RED tests for the resource-load contract**

In `node-load.spec.ts`, add assertions equivalent to:

```ts
const cpu = createNodeResourceLoad('CPU', 105, 100, 118);
expect(cpu).toEqual({
  resourceKind: 'CPU',
  demand: 105,
  nominalCapacity: 100,
  effectiveCapacity: 118,
  nominalRatio: 1.05,
  effectiveRatio: 105 / 118,
});

const node = createNodeLoadSnapshot('app', 'SERVER_GROUP', [
  createNodeResourceLoad('CPU', 100, 100, 118),
  createNodeResourceLoad('IO', 30, 100, 96),
]);
expect(node.nominalLoadRatio).toBe(1);
expect(node.effectiveLoadRatio).toBeCloseTo(100 / 118);
```

Add a second case proving the hottest nominal and hottest effective resource may differ.

- [ ] **Step 2: Write RED tests for nominal/effective sizing**

In `infrastructure-sizing.spec.ts` and `infrastructure-load.spec.ts`, assert:

```ts
const spring = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
expect(spring.nodeNominalCapacity(V1_NODE_IDS.app('SPRING_BOOT')).cpu).toBe(100);
expect(spring.nodeCapacity(V1_NODE_IDS.app('SPRING_BOOT')).cpu).toBeCloseTo(118);
expect(spring.nodeNominalCapacity(V1_NODE_IDS.app('SPRING_BOOT')).io).toBe(100);
expect(spring.nodeCapacity(V1_NODE_IDS.app('SPRING_BOOT')).io).toBeCloseTo(96);
```

Deploy ALB, add one APP instance, then assert nominal CPU becomes `200` and effective CPU becomes `236`. For one PostgreSQL replica on SMALL, assert nominal CPU is `80 * 1.55`, nominal IO is `80 * 1.75`, and effective values retain the database modifier relationship. For fixed ALB/Redis/Queue/Storage, assert nominal capacity equals `nodeCapacity()` before proficiency.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-sizing.spec.ts src/core/__tests__/infrastructure-load.spec.ts
```

Expected: failures because nominal APIs/fields do not exist and `createNodeResourceLoad` still exposes one capacity/ratio.

- [ ] **Step 4: Implement nominal profiles and infrastructure capacity split**

Refactor `infrastructure-sizing.ts` so raw APP/DB size baselines can be reused by both profile functions. `nominalNodeSizeProfile()` returns raw capacities for frameworks/databases while retaining the same monthly cost calculation; fixed-product profiles are reused unchanged. Keep `nodeSizeProfile()` as the product-characteristic/effective-before-proficiency profile.

In `InfrastructureState.nodeNominalCapacity()`, apply APP count and DB replica structural multipliers exactly where `nodeCapacity()` currently applies them. Do not put proficiency tuning here.

- [ ] **Step 5: Implement the dual load contract**

Replace `capacity/ratio/loadRatio` with explicit nominal/effective fields. Safe zero-capacity semantics remain deterministic: if capacity is non-positive, its ratio is `0`, matching current behavior. `createNodeLoadSnapshot()` sorts resources in the existing `NODE_RESOURCE_KINDS` order and computes both maxima independently.

Update `maxNodeLoad` and `maxResourceLoad` to accept an explicit basis:

```ts
export type LoadRatioBasis = 'NOMINAL' | 'EFFECTIVE';

export function maxNodeLoad(
  load: NodeLoadCollection,
  filter?: { readonly nodeKind?: InfrastructureNodeKind; readonly basis?: LoadRatioBasis },
): NodeLoadSnapshot | undefined;

export function maxResourceLoad(
  load: NodeLoadCollection,
  filter?: {
    readonly nodeKind?: InfrastructureNodeKind;
    readonly resourceKind?: NodeResourceKind;
    readonly basis?: LoadRatioBasis;
  },
): { readonly node: NodeLoadSnapshot; readonly resource: NodeResourceLoad } | undefined;
```

Default these low-level helpers to `NOMINAL` because they are primarily used for display/inspection; technical consumers will use explicit operational pressure in Task 2.

- [ ] **Step 6: Migrate affected Core tests away from `.capacity/.ratio/.loadRatio`**

Use `.nominalCapacity/.effectiveCapacity`, `.nominalRatio/.effectiveRatio`, and `.nominalLoadRatio/.effectiveLoadRatio` explicitly. Keep tests meaningful; do not mechanically swap every old assertion to the same basis.

- [ ] **Step 7: Verify GREEN**

```bash
npm test -- src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-sizing.spec.ts src/core/__tests__/infrastructure-load.spec.ts
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/core/infrastructure-sizing.ts src/core/infrastructure.ts src/core/node-load.ts src/core/index.ts src/core/__tests__/infrastructure-sizing.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/node-load.spec.ts
git commit -m "feat: split nominal and effective capacity"
```

---

### Task 2: Explicit Nominal vs Effective Operational Pressure

**Files:**
- Modify: `src/core/operational-pressure.ts`
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/incident-topology.ts`
- Modify: `src/core/__tests__/operational-pressure.spec.ts`
- Modify: `src/core/__tests__/game-engine-operational-growth.spec.ts`
- Modify: incident-topology tests covering candidate load ratio.

**Target interfaces:**

```ts
export type OperationalPressureBasis = 'NOMINAL' | 'EFFECTIVE';

export interface OperationalPressure {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly nominalCapacity: number;
  readonly effectiveCapacity: number;
  readonly nominalRatio: number;
  readonly effectiveRatio: number;
}

export interface OperationalPressureScope {
  readonly nodeIds?: ReadonlySet<InfrastructureNodeId>;
  readonly basis?: OperationalPressureBasis;
}

export function operationalPressureRatio(
  pressure: OperationalPressure,
  basis: OperationalPressureBasis,
): number;
```

`primaryOperationalPressure()` and node-local primary selection default to `EFFECTIVE`, because “operational pressure” means actual technical stress. `operationalPressures()` carries both ratios regardless of selection basis.

- [ ] **Step 1: Write RED pressure-basis tests**

Build a fixture where Spring-like CPU has nominal ratio `1.05` but effective ratio `0.89`, while DB IO has nominal ratio `0.95` and effective ratio `1.02`. Assert effective primary selects DB IO and `{ basis: 'NOMINAL' }` selects APP CPU. Preserve exact-node scope, external exclusion, and first-equal tie behavior for both bases.

- [ ] **Step 2: Write RED Growth/incident-source tests**

For Growth, build synthetic loads where nominal pressure is above 1 but effective pressure is below 1 and prove capacity penalty follows effective pressure. For incident topology, assert each candidate's `loadRatio` comes from the exact node's `effectiveLoadRatio`, not nominal display load.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/core/__tests__/operational-pressure.spec.ts src/core/__tests__/game-engine-operational-growth.spec.ts src/core/__tests__/incident-topology.spec.ts
```

Use the actual incident-topology test filename if it differs; do not create a duplicate suite solely because of naming.

- [ ] **Step 4: Implement basis-aware pressure**

Flatten resources as before, freeze records, preserve order, and let `firstMax()` compare `operationalPressureRatio(pressure, basis)`. No APP/DB/ALB whitelist is allowed.

- [ ] **Step 5: Switch technical consumers to effective pressure**

`GameEngine.advanceGrowth()` passes `primaryOperationalPressure(this._load)?.effectiveRatio ?? 0` into existing `GrowthPolicy`.

`IncidentTopology.nodeLoadRatio()` returns exact node `.effectiveLoadRatio ?? 0`.

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- src/core/__tests__/operational-pressure.spec.ts src/core/__tests__/game-engine-operational-growth.spec.ts src/core/__tests__/incident-topology.spec.ts
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/core/operational-pressure.ts src/core/game-engine.ts src/core/incident-topology.ts src/core/__tests__/operational-pressure.spec.ts src/core/__tests__/game-engine-operational-growth.spec.ts src/core/__tests__/incident-topology.spec.ts
git commit -m "feat: make operational pressure basis explicit"
```

---

### Task 3: Capacity Health and Optional Route Semantics

**Files:**
- Create: `src/core/capacity-health.ts`
- Create: `src/core/__tests__/capacity-health.spec.ts`
- Modify: `src/core/request-trace.ts`
- Modify: `src/core/__tests__/request-trace.spec.ts`
- Modify: `src/core/index.ts`

**Target helpers:**

```ts
export function resourceCapacityHealth(resource: NodeResourceLoad): number {
  if (resource.demand <= 0) return 1;
  return Math.max(0, Math.min(1, resource.effectiveCapacity / resource.demand));
}

export function nodeCapacityHealth(node: NodeLoadSnapshot): number {
  return Math.min(1, ...node.resources.map(resourceCapacityHealth));
}

export function capacityHealthByNode(load: NodeLoadCollection): NodeHealth;

export function composeNodeHealth(
  incidentHealth: NodeHealth,
  capacityHealth: NodeHealth,
): NodeHealth;
```

`composeNodeHealth` clamps values and multiplies exact matching node IDs; a missing side means health `1`.

- [ ] **Step 1: Write RED capacity-health tests**

Assert:

```ts
expect(resourceCapacityHealth(createNodeResourceLoad('CPU', 118, 100, 118))).toBe(1);
expect(resourceCapacityHealth(createNodeResourceLoad('CPU', 130, 100, 118))).toBeCloseTo(118 / 130);

const node = createNodeLoadSnapshot('app', 'SERVER_GROUP', [
  createNodeResourceLoad('CPU', 130, 100, 118),
  createNodeResourceLoad('IO', 70, 100, 96),
]);
expect(nodeCapacityHealth(node)).toBeCloseTo(118 / 130);
expect(composeNodeHealth({ app: 0.8 }, { app: 118 / 130 }).app).toBeCloseTo(0.8 * 118 / 130);
```

Also prove no-resource nodes return health `1` and exact node IDs do not leak across entries.

- [ ] **Step 2: Write RED optional-route tests**

Extend `request-trace.spec.ts` with an existing optional node whose health is `0` between two required steps. Assert:

```ts
expect(trace.nodes[1]).toMatchObject({
  requirement: 'OPTIONAL',
  arrivalRatio: 1,
  passThroughRatio: 1,
  status: 'FAILED',
});
expect(trace.nodes[2].arrivalRatio).toBe(1);
expect(trace.successRatio).toBe(1);
expect(trace.failureNodeId).toBeNull();
```

Keep the existing missing-optional behavior green.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/core/__tests__/capacity-health.spec.ts src/core/__tests__/request-trace.spec.ts
```

- [ ] **Step 4: Implement health helpers**

Keep them pure and Core-only. `capacityHealthByNode()` should include player-owned loads with resources; no special node-kind whitelist is necessary. An external node with no resources naturally contributes no degradation.

- [ ] **Step 5: Fix `RequestTraceSimulator` optional semantics**

For a resolved existing node:

```ts
const observedHealth = clampHealth(nodeHealth[step.nodeId] ?? 1);
const observedPassThrough = arrivalRatio * observedHealth;
const primaryPassThrough = step.requirement === 'OPTIONAL'
  ? arrivalRatio
  : observedPassThrough;
currentRatio = primaryPassThrough;
```

Status still reflects the optional component's own observed health. `failureNodeId` is only set when a required step actually drives primary pass-through to zero.

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- src/core/__tests__/capacity-health.spec.ts src/core/__tests__/request-trace.spec.ts
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/core/capacity-health.ts src/core/request-trace.ts src/core/index.ts src/core/__tests__/capacity-health.spec.ts src/core/__tests__/request-trace.spec.ts
git commit -m "feat: add capacity health to request semantics"
```

---

### Task 4: Deterministic Flow-Aware Load Calculation

**Files:**
- Modify: `src/core/infrastructure.ts`
- Create: `src/core/__tests__/overload-request-flow.spec.ts`
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`
- Modify affected load fixtures/tests found by typecheck.

**Algorithm:**

`LoadCalculator.calculate()` must solve shared-node capacity and route arrival together. Use deterministic fixed passes rather than an unbounded convergence loop.

1. Resolve all workload routes once.
2. Start with the incident health supplied in `context.nodeHealth`; capacity health is initially `1`.
3. Simulate all traces with `composeNodeHealth(incidentHealth, capacityHealth)`.
4. Aggregate node demand from those traces' `arrivalRatio` values.
5. Build dual-capacity `NodeLoadSnapshot`s.
6. Derive the next `capacityHealthByNode()`.
7. Repeat for `maxRouteSteps + 2` passes, then run one final projection with the last composed health so returned traces and loads correspond to the same health state.

`maxRouteSteps` is the maximum resolved trace step count across active features; with no features use one pass. The bounded pass count is deterministic and sufficient for one-hop-per-pass downstream propagation plus the Redis offload dependency.

Extract private helpers inside `infrastructure.ts` rather than duplicating formulas:

```ts
private static resolvedRoutes(...): readonly ResolvedRoute[];
private static projectFlowPass(...): {
  readonly requestTraces: readonly RequestTrace[];
  readonly nodeLoads: readonly NodeLoadSnapshot[];
};
```

If the class becomes harder to read during implementation, extract only the deterministic pass orchestration into `src/core/capacity-flow-solver.ts`; do not move unrelated infrastructure state code.

**Capacity construction:**

```ts
createNodeResourceLoad(
  'CPU',
  appCpuDemand,
  appNominal.cpu ?? 0,
  (appEffective.cpu ?? 0) * capacityTuningMultiplier(appLevel),
)
```

Apply the same pattern to APP IO, DB CPU/IO, ALB/Redis/Queue throughput, and Storage. Storage effective equals nominal today.

For Redis read-heavy offload, use the composed cache health (incident × capacity) for the pass, so an overloaded/unhealthy Redis cannot continue to claim full DB offload.

- [ ] **Step 1: Write RED Spring/Nest hard-limit integration tests**

Choose deterministic DAU/feature weights that produce these relationships rather than asserting a magic DAU threshold:
- Spring APP CPU nominal ratio can exceed `1` while effective ratio stays `<= 1`, with `failureRate === 0` when all required downstream nodes are healthy.
- Spring APP IO can have effective ratio `> 1` before nominal ratio reaches `1` because its modifier is `0.96`.
- Nest APP CPU can overload before nominal `1` because its modifier is `0.92`.
- Nest APP IO can remain within effective capacity above nominal `1` because its modifier is `1.18`.

Use resource-specific feature weights so only the intended APP axis is decisive.

- [ ] **Step 2: Write RED immediate partial-failure test**

Construct one required APP-only or APP→DB workload where APP effective ratio is above one and downstream is generously sized. Assert final failure is non-zero and approximately:

```ts
expect(load.failureRate).toBeCloseTo(1 - appCpu.effectiveCapacity / appCpu.demand);
```

At exactly/below effective capacity, assert zero capacity-induced failure.

- [ ] **Step 3: Write RED upstream masking/reveal test**

Deploy ALB and use a feature whose APP/DB demands can become bottlenecks after ingress is relieved.

First state, ALB SMALL:
- ALB effective ratio > 1,
- APP demand reflects ALB pass-through and is lower than the same scenario with a larger ALB.

Then resize ALB to MEDIUM/LARGE and recalculate:
- ALB effective pressure decreases,
- APP demand increases because more requests arrive,
- APP or DB nominal/effective pressure rises and can become the new primary bottleneck.

Assert downstream demand changes, not only percentages. This test is the core gameplay proof.

- [ ] **Step 4: Write RED incident + capacity composition test**

For the same overloaded APP, compare no incident vs `nodeHealth[app] = 0.8`. Assert required-path success is approximately capacity health × `0.8`, and DB arrival uses that composed pass-through.

- [ ] **Step 5: Write RED optional queue overload test**

Deploy a very small/overloaded queue on an optional route. Assert queue demand/effective ratio show overload but primary `successRatio` is not reduced by queue health. A required queue with the same overload must reduce primary success.

- [ ] **Step 6: Run RED**

```bash
npm test -- src/core/__tests__/overload-request-flow.spec.ts src/core/__tests__/infrastructure-load.spec.ts
```

- [ ] **Step 7: Implement dual capacities in every load axis**

Use `InfrastructureState.nodeNominalCapacity()` for nominal values and existing `nodeCapacity()` plus tuning for effective values. Do not derive nominal capacity by dividing effective capacity by a modifier; use the explicit source.

- [ ] **Step 8: Implement deterministic capacity-flow passes**

Re-simulate traces with composed health each pass, aggregate arrival-based demand, build loads, derive capacity health, and repeat the bounded number of passes. Returned `requestTraces`, `nodeLoads`, and weighted `failureRate` must all come from the final coherent pass.

- [ ] **Step 9: Preserve existing special demand behavior**

Regression-check:
- Redis read-heavy DB CPU/IO offload remains 12%/40% at full cache health.
- no-queue optional async fallback still adds APP CPU `0.25×` and IO `1×` fallback work.
- Kafka event-heavy modifier remains `0.85`.
- traffic spike multiplier remains applied exactly once.
- missing required resource still yields failed request semantics.

- [ ] **Step 10: Verify GREEN**

```bash
npm test -- src/core/__tests__/overload-request-flow.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/request-trace.spec.ts src/core/__tests__/capacity-health.spec.ts
npm run typecheck
```

- [ ] **Step 11: Commit**

```bash
git add src/core/infrastructure.ts src/core/__tests__/overload-request-flow.spec.ts src/core/__tests__/infrastructure-load.spec.ts
git add src/core/__tests__
git commit -m "feat: propagate overload through request flow"
```

---

### Task 5: Application Shows Nominal Load but Uses Effective Technical Pressure

**Files:**
- Modify: `src/application/game-view.ts`
- Modify: `src/application/operational-pressure-presenter.ts`
- Modify: `src/application/operational-view-projector.ts`
- Modify: `src/application/topology-view-projector.ts`
- Modify: `src/application/__tests__/generic-operational-view.spec.ts`
- Modify: `src/application/__tests__/operational-view-projector.spec.ts`
- Modify: `src/application/__tests__/topology-view-projector.spec.ts`

**Target view semantics:**

```ts
export type ResourceLoadStatusView = 'NORMAL' | 'WARNING' | 'OVERLOAD';

export interface LoadMetricView {
  readonly id: string;
  readonly nodeId: string;
  readonly label: string;
  readonly percent: number;              // nominal displayed load
  readonly effectivePercent: number;     // actual hard-limit usage
  readonly hardLimitPercent: number;     // effectiveCapacity / nominalCapacity
  readonly capacityFailurePercent: number;
  readonly status: ResourceLoadStatusView;
  readonly tone: LoadTone;
}

export interface BottleneckView {
  readonly nodeId: string;
  readonly nodeKind: TopologyNodeView['kind'];
  readonly resourceKind: 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE';
  readonly nominalRatio: number;
  readonly effectiveRatio: number;
  readonly percent: number;              // nominal display
  readonly hardLimitPercent: number;
  readonly status: ResourceLoadStatusView;
  readonly label: string;
}
```

If `LoadMetricView` is consumed in UI code that does not need all fields, add the fields without changing unrelated layout structure. BASIC aggregate rows may use node-level maxima and derive the same fields from the selected nominal/effective hottest resources.

Status helper:

```ts
function resourceStatus(nominalRatio: number, effectiveRatio: number): ResourceLoadStatusView {
  if (effectiveRatio > 1) return 'OVERLOAD';
  if (nominalRatio >= 1) return 'WARNING';
  return 'NORMAL';
}
```

Tone priority:
- incident => `incident`
- effective ratio > 1 => `overload`
- nominal ratio >= 0.9 => `critical`
- nominal ratio >= 0.7 => `busy`
- otherwise `stable`.

This preserves existing early-warning coloring while guaranteeing red is based on actual hard-limit breach.

- [ ] **Step 1: Write RED presenter/projector tests**

Synthetic Spring CPU:

```ts
createNodeResourceLoad('CPU', 105, 100, 118)
```

Assert displayed percent `105`, hard limit `118`, status `WARNING`, and no overload tone. Synthetic Nest-like CPU:

```ts
createNodeResourceLoad('CPU', 95, 100, 92)
```

Assert displayed percent `95`, hard limit `92`, status/tone `OVERLOAD`.

Also assert technical bottleneck selection follows effective ratio even if another resource has a larger nominal ratio.

- [ ] **Step 2: Write RED topology view tests**

Update `topology-view-projector.spec.ts` so node `loadPercent` is nominal, red tone is effective-overload, and detail exposes both nominal/effective capacity for the relevant hottest displayed resource, e.g. `CAP 100 · HARD 118`. Preserve exact topology IDs, incident priority, edge order, and trace projection.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/application/__tests__/generic-operational-view.spec.ts src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/topology-view-projector.spec.ts
```

- [ ] **Step 4: Make pressure presentation basis-aware**

`toBottleneckView()` projects nominal/effective fields. Add pure helpers for `hardLimitPercent`, capacity-failure percent, and status so alert/projector code does not duplicate arithmetic.

Change `operationalPressureChanges()` to require a basis:

```ts
export function operationalPressureChanges(
  before: readonly OperationalPressure[],
  after: readonly OperationalPressure[],
  basis: OperationalPressureBasis,
): readonly OperationalPressureChange[];
```

`beforeRatio/afterRatio/delta` use `operationalPressureRatio(pressure, basis)`.

- [ ] **Step 5: Update Service Health/P95 and visible metrics**

`OperationalViewProjector` scopes to exact player-owned topology nodes. Technical primary selection uses effective pressure. Existing P95 curve and status thresholds receive effective ratio. `failureRate` remains the existing additional user-impact input.

BASIC displayed aggregate uses `node.nominalLoadRatio`. METRICS/APM resource rows use nominal percent plus effective/hard-limit fields. Diagnosis chooses the hottest effective resource and, at METRICS/APM, can include nominal load and hard-limit text without changing existing semantic recommendations.

- [ ] **Step 6: Update topology projection**

Use `nominalLoadRatio` for displayed `loadPercent`; use `effectiveLoadRatio` for overload-red decision. Use the hottest nominal resource for the concise capacity detail so displayed percentage and detail refer to the same axis.

- [ ] **Step 7: Verify GREEN**

```bash
npm test -- src/application/__tests__/generic-operational-view.spec.ts src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/topology-view-projector.spec.ts
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/application/game-view.ts src/application/operational-pressure-presenter.ts src/application/operational-view-projector.ts src/application/topology-view-projector.ts src/application/__tests__/generic-operational-view.spec.ts src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/topology-view-projector.spec.ts
git commit -m "feat: expose nominal load and effective hard limits"
```

---

### Task 6: Alerts, Feature Impact, and End-to-End Regression

**Files:**
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/__tests__/generic-operational-alerts.spec.ts`
- Modify: `src/application/__tests__/game-service-projector.spec.ts`
- Modify any remaining Core/Application/UI tests required by the intentional contract migration.

**Alert rules:**

For each owned topology node, choose the hottest effective resource for technical diagnosis, but render its nominal percentage and hard limit.

```text
effectiveRatio > 1
-> danger, OVERLOAD, capacity failure detail

nominalRatio >= 1 && effectiveRatio <= 1
-> warning, nominal baseline exceeded but still within hard limit

0.9 <= nominalRatio < 1
-> existing early warning / critical-near-capacity behavior
```

If a node has one resource with the highest nominal ratio and a different resource with the highest effective ratio, danger must win when any resource is effectively overloaded. Do not hide a real red overload just because another resource has a larger nominal display ratio.

**Feature impact:**
- displayed before/after deltas use `NOMINAL` pressure;
- projected danger/`OVERLOAD 예상` uses `EFFECTIVE` pressure;
- failure increase uses the final request-flow `failureRate`;
- topology scope and same-kind decoy exclusion remain unchanged.

- [ ] **Step 1: Write RED warning-vs-overload alert tests**

Add a Spring-like CPU fixture at nominal `105%`, effective `<100%`: expect warning/orange semantics, not danger. Add a Nest-like CPU fixture at nominal `95%`, effective `>100%`: expect danger/red and capacity-failure detail. Preserve ALB/Redis generic alert coverage and external/decoy exclusion.

- [ ] **Step 2: Write RED feature-impact basis test**

Before/after pressures should prove summary percentages follow nominal ratio while `OVERLOAD 예상` follows effective ratio. Include a case where nominal crosses `100%` but effective remains below hard limit and assert no false overload suffix.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/application/__tests__/generic-operational-alerts.spec.ts src/application/__tests__/game-service-projector.spec.ts
```

- [ ] **Step 4: Implement alert semantics**

Use explicit nominal/effective fields from pressure; do not derive hard limit from framework IDs inside Application. Capacity-failure detail uses `1 - min(1, 1 / effectiveRatio)`.

- [ ] **Step 5: Implement preview basis split**

Call `operationalPressureChanges(before, after, 'NOMINAL')` for display changes. Select projected primary with effective basis for danger. Keep exact topology scope.

- [ ] **Step 6: Run focused regression**

```bash
npm test -- \
  src/core/__tests__/node-load.spec.ts \
  src/core/__tests__/capacity-health.spec.ts \
  src/core/__tests__/request-trace.spec.ts \
  src/core/__tests__/overload-request-flow.spec.ts \
  src/core/__tests__/operational-pressure.spec.ts \
  src/core/__tests__/game-engine-operational-growth.spec.ts \
  src/application/__tests__/generic-operational-view.spec.ts \
  src/application/__tests__/generic-operational-alerts.spec.ts \
  src/application/__tests__/operational-view-projector.spec.ts \
  src/application/__tests__/topology-view-projector.spec.ts
```

- [ ] **Step 7: Run full verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: all test files green, TypeScript clean, Next.js production build succeeds.

- [ ] **Step 8: Legacy ambiguity scan**

Search the changed operational/load code for ambiguous legacy members:

```bash
rg '\.(capacity|ratio|loadRatio)\b' src/core src/application
```

Review every result. Legitimate topology `node.capacity` and unrelated domain fields may remain; `NodeResourceLoad.capacity`, `NodeResourceLoad.ratio`, and `NodeLoadSnapshot.loadRatio` must not remain as authoritative operational contracts.

Also scan for accidental fixed bottleneck whitelists:

```bash
rg "SERVER_GROUP.*DATABASE|APP_CPU|APP_IO|DB_CPU|DB_IO" src/core src/application
```

Any remaining match must be unrelated legacy/domain naming or removed.

- [ ] **Step 9: Commit final integration fixes**

```bash
git add src test docs
# If `test` does not exist, add only actual changed paths reported by git status.
git commit -m "feat: integrate overload capacity semantics"
```

Do not create an empty commit if Task 6 produced no additional changes after the prior commit.

---

## Final Review Gate

Before opening the PR:

- [ ] Compare `feature/nominal-effective-capacity` against `feature/playable-mvp` and ensure only the approved capacity/request-flow feature plus its docs/tests are present.
- [ ] Confirm Spring CPU can display above 100% while remaining non-red until its effective hard limit is exceeded.
- [ ] Confirm Spring IO/Nest CPU can turn red below displayed 100% when their effective modifier is below 1.
- [ ] Confirm APP CPU 100% + IO 30% displays node load 100%, never 65%.
- [ ] Confirm overload failure is partial and begins immediately above effective capacity.
- [ ] Confirm capacity and incident health compose multiplicatively.
- [ ] Confirm an upstream ALB bottleneck reduces APP/DB demand and that resizing ALB can reveal the next bottleneck.
- [ ] Confirm optional queue degradation does not gate primary request success while required queue degradation does.
- [ ] Confirm Growth, incident risk, Service Health, and P95 use effective technical pressure.
- [ ] Confirm displayed loads, alerts/previews percentages, and BASIC/METRICS load percentages use nominal pressure.
- [ ] Confirm external services and same-kind decoys cannot win player-owned operational pressure.
- [ ] Confirm no new Memory/Connection/Network axis, autoscaling, retry/backpressure subsystem, incident type, or unrelated balance rebasing slipped in.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run build` immediately before PR creation.
- [ ] Open a PR to `feature/playable-mvp`, wait for fresh PR CI, review the diff, then squash-merge only if the tested PR head is unchanged and checks pass.
